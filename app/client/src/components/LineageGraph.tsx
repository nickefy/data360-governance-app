import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type WheelEvent as RWheelEvent } from 'react';
import { Badge, Button, Skeleton, useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { ExternalLink, Maximize, Minus, Plus, RotateCcw, Table2, Workflow } from 'lucide-react';
import { useApp } from '../lib/app-context';

/*
 * Dependency-free lineage graph (Catalog-Explorer style): HTML table cards + SVG edges, with pan/zoom.
 * Card geometry is fixed (header / row heights) so edge endpoints can be computed exactly per column row.
 */

interface GTable { id: string; kind: 'table'; depth: number; comment: string; owner: string; columns: { name: string; type: string; comment: string }[] }
interface GEntity { id: string; kind: 'job' | 'notebook'; ref: number; depth: number; name: string }
interface GResp {
  focus: { table: string; column: string };
  tables: GTable[];
  entities: GEntity[];
  tableEdges: { from: string; to: string }[];
  columnEdges: { fromTable: string; fromColumn: string; toTable: string; toColumn: string }[];
}
interface ColGov { de_id: string; de_name: string; cde_flag: boolean; pass_pct: number | null; failing: number; checks: number }

const W = 290;
const ENTITY_W = 230;
const GAP_X = 90;
const GAP_Y = 40;
const HEADER_H = 74;
const ROW_H = 22;
const FOOTER_H = 22;
const ENTITY_H = 58;
const MAX_OTHER_COLS = 5;

const layerOf = (fqn: string) => {
  const t = fqn.split('.').pop() ?? '';
  if (t.startsWith('src_')) return 'Source (landed)';
  if (t.startsWith('dq_')) return 'DQ data mart';
  return 'Curated';
};
function ucUrl(host: string, fqn: string) {
  const [c, s, t] = fqn.split('.');
  return host ? `${host}/explore/data/${c}/${s}/${t}?activeTab=lineage` : '';
}

interface LaidTable { kind: 'table'; id: string; t: GTable; x: number; y: number; h: number; shown: GTable['columns']; hidden: number; depth: number }
interface LaidEntity { kind: 'entity'; id: string; e: GEntity; x: number; y: number; h: number; depth: number }
type Laid = LaidTable | LaidEntity;

/** Unity Catalog lineage for a CDE's physical column, drawn like Catalog Explorer's lineage graph. */
export function LineageGraph({ table, column, height = 560 }: { table: string; column: string; height?: number }) {
  const { api, v, host } = useApp();
  const [focus, setFocus] = useState({ table, column });
  const [data, setData] = useState<GResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const govQ = useAnalyticsQuery('column_governance', { v: sql.int(v) });

  useEffect(() => {
    let live = true;
    api<GResp>(`/api/d360/lineage-graph?table=${encodeURIComponent(focus.table)}&column=${encodeURIComponent(focus.column)}`)
      .then((d) => { if (live) { setData(d); setErr(null); } })
      .catch((e: Error) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [api, focus]);

  const govByTable = useMemo(() => {
    const m = new Map<string, Map<string, ColGov>>();
    for (const r of govQ.data ?? []) {
      const inner = m.get(r.table_fqn) ?? new Map<string, ColGov>();
      inner.set(r.column_name, {
        de_id: r.de_id, de_name: r.de_name, cde_flag: String(r.cde_flag) === 'true',
        pass_pct: r.pass_pct === null ? null : Number(r.pass_pct), failing: Number(r.failing), checks: Number(r.checks),
      });
      m.set(r.table_fqn, inner);
    }
    return m;
  }, [govQ.data]);

  const graph = useMemo(() => {
    if (!data) return null;
    const pathCols = new Map<string, Set<string>>();
    const addPath = (t: string, c: string) => pathCols.set(t, (pathCols.get(t) ?? new Set()).add(c));
    if (data.focus.column) addPath(data.focus.table, data.focus.column);
    for (const e of data.columnEdges) { addPath(e.fromTable, e.fromColumn); addPath(e.toTable, e.toColumn); }

    const items: Laid[] = [];
    for (const t of data.tables) {
      const pc = pathCols.get(t.id) ?? new Set<string>();
      const gov = govByTable.get(t.id) ?? new Map<string, ColGov>();
      const keep = t.columns.filter((c) => pc.has(c.name) || gov.has(c.name));
      const others = t.columns.filter((c) => !pc.has(c.name) && !gov.has(c.name));
      const shown = expanded.has(t.id) ? t.columns : [...keep, ...others.slice(0, Math.max(0, MAX_OTHER_COLS - keep.length))];
      const hidden = t.columns.length - shown.length;
      const footer = t.columns.length > MAX_OTHER_COLS ? FOOTER_H : 0;
      items.push({ kind: 'table', id: t.id, t, x: 0, y: 0, h: HEADER_H + 8 + Math.max(1, shown.length) * ROW_H + footer, shown, hidden, depth: t.depth });
    }
    for (const e of data.entities) items.push({ kind: 'entity', id: e.id, e, x: 0, y: 0, h: ENTITY_H, depth: e.depth });

    // longest-path layering: every edge points left -> right; the focus table stays at layer 0
    const layer = new Map(items.map((n) => [n.id, n.depth]));
    for (let it = 0; it < 8; it++) {
      for (const e of data.tableEdges) {
        const a = layer.get(e.from);
        const b = layer.get(e.to);
        if (a === undefined || b === undefined || a < b) continue;
        if (b <= 0 && e.from !== data.focus.table) layer.set(e.from, b - 1);
        else if (e.to !== data.focus.table) layer.set(e.to, a + 1);
      }
    }
    for (const n of items) n.depth = layer.get(n.id) ?? n.depth;

    // tables on the focus column's path share the top row so the highlighted path runs straight; others stack below
    const onPath = (id: string) => (pathCols.get(id)?.size ?? 0) > 0 || id === data.focus.table;
    const minD = Math.min(...items.map((n) => n.depth));
    const pathRowH = Math.max(0, ...items.filter((n) => onPath(n.id)).map((n) => n.h));
    const byDepth = new Map<number, Laid[]>();
    for (const n of items) byDepth.set(n.depth, [...(byDepth.get(n.depth) ?? []), n]);
    for (const [d, list] of byDepth) {
      list.sort((a, b) => Number(onPath(b.id)) - Number(onPath(a.id)) || a.id.localeCompare(b.id));
      let yPath = 0;
      let yOther = data.focus.column ? pathRowH + GAP_Y + 20 : 0;
      for (const n of list) {
        n.x = (d - minD) * (W + GAP_X);
        if (data.focus.column && onPath(n.id)) { n.y = yPath; yPath += n.h + GAP_Y; yOther = Math.max(yOther, yPath + 20); }
        else { n.y = yOther; yOther += n.h + GAP_Y; }
      }
    }
    const byId = new Map(items.map((n) => [n.id, n]));
    const colY = (n: Laid, col: string | null) => {
      if (n.kind === 'entity' || !col) return n.y + 22;
      const i = n.shown.findIndex((c) => c.name === col);
      return i < 0 ? n.y + 22 : n.y + HEADER_H + 4 + i * ROW_H + ROW_H / 2;
    };
    const width = (n: Laid) => (n.kind === 'entity' ? ENTITY_W : W);
    type E = { id: string; x1: number; y1: number; x2: number; y2: number; col: boolean };
    const edges: E[] = [];
    const colPairs = new Set(data.columnEdges.map((e) => `${e.fromTable}>${e.toTable}`));
    data.columnEdges.forEach((e, i) => {
      const a = byId.get(e.fromTable); const b = byId.get(e.toTable);
      if (a && b) edges.push({ id: `c${i}`, x1: a.x + width(a), y1: colY(a, e.fromColumn), x2: b.x, y2: colY(b, e.toColumn), col: true });
    });
    data.tableEdges.forEach((e, i) => {
      if (colPairs.has(`${e.from}>${e.to}`)) return;
      const a = byId.get(e.from); const b = byId.get(e.to);
      if (a && b) edges.push({ id: `t${i}`, x1: a.x + width(a), y1: colY(a, null), x2: b.x, y2: colY(b, null), col: false });
    });
    const maxX = Math.max(...items.map((n) => n.x + width(n)));
    const maxY = Math.max(...items.map((n) => n.y + n.h));
    return { items, edges, pathCols, w: maxX + 20, h: maxY + 20 };
  }, [data, govByTable, expanded]);

  // ---- pan / zoom ----
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const fit = useCallback(() => {
    const el = box.current;
    if (!el || !graph) return;
    const k = Math.min(1, (el.clientWidth - 40) / graph.w, (el.clientHeight - 40) / graph.h);
    setView({ k, x: (el.clientWidth - graph.w * k) / 2, y: Math.max(20, (el.clientHeight - graph.h * k) / 2) });
  }, [graph]);
  useLayoutEffect(() => { fit(); }, [fit]);
  const zoomBy = (f: number, cx?: number, cy?: number) =>
    setView((vw) => {
      const k = Math.min(2, Math.max(0.25, vw.k * f));
      const el = box.current;
      const px = cx ?? (el ? el.clientWidth / 2 : 0);
      const py = cy ?? (el ? el.clientHeight / 2 : 0);
      return { k, x: px - ((px - vw.x) * k) / vw.k, y: py - ((py - vw.y) * k) / vw.k };
    });
  const onWheel = (e: RWheelEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
  };
  const onDown = (e: RMouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return;
    drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
  };
  const onMove = (e: RMouseEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setView((vw) => ({ ...vw, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
  };
  const endDrag = () => { drag.current = null; };

  const pick = (t: string, c: string) => { setExpanded(new Set()); setFocus({ table: t, column: c }); };
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const focusLabel = `${focus.table.split('.').slice(1).join('.')}${focus.column ? `.${focus.column}` : ''}`;
  const isHome = focus.table === table && focus.column === column;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Focus:</span> <span className="font-mono font-semibold">{focusLabel}</span>
          {!isHome && (
            <Button size="sm" variant="ghost" onClick={() => pick(table, column)}>
              <RotateCcw className="h-3.5 w-3.5" /> Back to CDE column
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-6 border-t-2 border-primary" /> column lineage</span>
          <span className="flex items-center gap-1"><span className="inline-block w-6 border-t border-dashed border-muted-foreground" /> table lineage</span>
          <span className="flex items-center gap-1"><Badge className="bg-primary text-primary-foreground text-[9px] px-1">GO_00001</Badge> mapped data element · pass % latest run</span>
        </div>
      </div>
      <div
        ref={box}
        className="relative overflow-hidden rounded-lg border bg-muted/30 select-none cursor-grab active:cursor-grabbing"
        style={{ height, backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '16px 16px' }}
        onWheel={onWheel}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {err ? (
          <div className="p-4 text-sm text-destructive">Lineage unavailable: {err}</div>
        ) : !graph ? (
          <div className="p-4 space-y-2"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: graph.w, height: graph.h }}>
            <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width={graph.w} height={graph.h}>
              <defs>
                <marker id="d360-arrow-col" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--primary)" />
                </marker>
                <marker id="d360-arrow-tbl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--muted-foreground)" />
                </marker>
              </defs>
              {graph.edges.map((e) => {
                const dx = Math.max(40, (e.x2 - e.x1) / 2);
                const d = `M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`;
                return e.col ? (
                  <path key={e.id} d={d} fill="none" stroke="var(--primary)" strokeWidth={2} strokeDasharray="6 4" markerEnd="url(#d360-arrow-col)">
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />
                  </path>
                ) : (
                  <path key={e.id} d={d} fill="none" stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="4 4" markerEnd="url(#d360-arrow-tbl)" />
                );
              })}
            </svg>
            {graph.items.map((n) =>
              n.kind === 'entity' ? (
                <div key={n.id} data-node className="absolute rounded-lg border border-dashed bg-card shadow-sm px-3 py-2 text-xs" style={{ left: n.x, top: n.y, width: ENTITY_W, height: ENTITY_H }}>
                  <div className="flex items-center gap-1.5">
                    <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold truncate">{n.e.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">
                    {n.e.kind === 'job' ? 'Lakeflow Job · reads table' : 'Notebook'}{' '}
                    {host && n.e.kind === 'job' && <a href={`${host}/jobs/${n.e.ref}`} target="_blank" rel="noreferrer" className="normal-case text-primary hover:underline">open</a>}
                  </div>
                </div>
              ) : (
                <TableCard
                  key={n.id}
                  n={n}
                  isFocus={n.id === data?.focus.table}
                  focusCol={data?.focus.column ?? ''}
                  pathCols={graph.pathCols.get(n.id) ?? new Set()}
                  gov={govByTable.get(n.id) ?? new Map()}
                  expanded={expanded.has(n.id)}
                  onPick={pick}
                  onToggle={toggle}
                  host={host}
                />
              ),
            )}
          </div>
        )}
        <div className="absolute left-3 bottom-3 flex flex-col rounded-md border bg-card shadow-sm">
          <button className="p-1.5 hover:bg-muted" onClick={() => zoomBy(1.2)} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
          <button className="p-1.5 hover:bg-muted border-y" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
          <button className="p-1.5 hover:bg-muted" onClick={fit} aria-label="Fit to view"><Maximize className="h-4 w-4" /></button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Read live from Unity Catalog lineage (captured automatically from the pipelines and jobs that touch these tables), overlaid with the governance mapping and latest DQ results.
        Click a column to trace its lineage, or a table header for table-level lineage. Scroll to zoom, drag to pan.
      </p>
    </div>
  );
}

function TableCard({ n, isFocus, focusCol, pathCols, gov, expanded, onPick, onToggle, host }: {
  n: LaidTable; isFocus: boolean; focusCol: string; pathCols: Set<string>; gov: Map<string, ColGov>; expanded: boolean;
  onPick: (t: string, c: string) => void; onToggle: (id: string) => void; host: string;
}) {
  const [, schema, name] = n.id.split('.');
  const url = ucUrl(host, n.id);
  return (
    <div data-node className={`absolute rounded-lg border bg-card text-card-foreground shadow-sm text-xs overflow-hidden ${isFocus ? 'ring-2 ring-primary' : ''}`} style={{ left: n.x, top: n.y, width: W, height: n.h }}>
      <div className="px-3 py-2 border-b cursor-pointer hover:bg-muted" style={{ height: HEADER_H }} onClick={() => onPick(n.id, '')} title="Focus on this table">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Table2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="font-semibold truncate">{name}</span>
          </div>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Open in Catalog Explorer" className="text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
          <span className="uppercase tracking-wide">{layerOf(n.id)}</span>·<span className="font-mono truncate">{schema}</span>
        </div>
        {n.t.comment && <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-tight">{n.t.comment}</div>}
      </div>
      <div className="py-1">
        {n.shown.map((c) => {
          const inPath = pathCols.has(c.name);
          const hl = isFocus && c.name === focusCol;
          const g = gov.get(c.name);
          const bad = g && g.failing > 0;
          return (
            <div
              key={c.name}
              className={`flex items-center justify-between gap-2 px-3 cursor-pointer ${hl ? 'bg-primary text-primary-foreground' : inPath ? 'bg-muted font-semibold hover:bg-muted' : 'hover:bg-muted'}`}
              style={{ height: ROW_H }}
              onClick={() => onPick(n.id, c.name)}
              title={c.comment || `${c.name} (${c.type})`}
            >
              <span className="font-mono truncate">{c.name}</span>
              <span className="flex items-center gap-1 shrink-0">
                {g && (
                  <span className={`rounded px-1 text-[9px] font-semibold ${hl ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'}`} title={`${g.de_name}${g.cde_flag ? ' (CDE)' : ''}`}>
                    {g.de_id}
                  </span>
                )}
                {g && g.checks > 0 && g.pass_pct !== null && (
                  <span className={`text-[9px] tabular-nums ${hl ? '' : bad ? 'text-destructive' : 'text-success'}`}>{g.pass_pct.toFixed(1)}%</span>
                )}
                {!g && <span className={`text-[9px] ${hl ? '' : 'text-muted-foreground'}`}>{c.type}</span>}
              </span>
            </div>
          );
        })}
        {n.shown.length === 0 && <div className="px-3 text-muted-foreground" style={{ height: ROW_H }}>No columns visible</div>}
        {n.t.columns.length > MAX_OTHER_COLS && (
          <button className="w-full text-left px-3 text-[10px] text-primary hover:underline" style={{ height: FOOTER_H }} onClick={() => onToggle(n.id)}>
            {expanded ? 'Show fewer columns' : `+ ${n.hidden} more columns`}
          </button>
        )}
      </div>
    </div>
  );
}
