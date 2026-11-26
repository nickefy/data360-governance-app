import { useEffect, useState } from 'react';
import { Badge, Skeleton } from '@databricks/appkit-ui/react';
import { ArrowRight } from 'lucide-react';
import { useApp } from '../lib/app-context';

interface LNode { id: string; table: string; column: string | null; depth: number }
interface LResp { nodes: LNode[]; edges: { from: string; to: string }[]; consumers: string[] }

const short = (t: string) => t.split('.').slice(1).join('.');
const layer = (t: string) => {
  const name = t.split('.').pop() ?? '';
  if (name.startsWith('src_')) return 'source (landed)';
  if (name.startsWith('dq_')) return 'DQ mart';
  return 'curated';
};

/** Column-level lineage for one mapped CDE column, read live from Unity Catalog lineage. */
export function LineageView({ table, column }: { table: string; column: string }) {
  const { api } = useApp();
  const [data, setData] = useState<LResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    setErr(null);
    api<LResp>(`/api/d360/lineage?table=${encodeURIComponent(table)}&column=${encodeURIComponent(column)}`)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [api, table, column]);

  if (err) return <p className="text-xs text-destructive">Lineage unavailable: {err}</p>;
  if (!data) return <Skeleton className="h-10 w-full" />;
  const byDepth = new Map<number, LNode[]>();
  for (const n of data.nodes) byDepth.set(n.depth, [...(byDepth.get(n.depth) ?? []), n]);
  const depths = [...byDepth.keys()].sort((a, b) => b - a); // upstream first
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-stretch gap-2">
        {depths.map((d, i) => (
          <div key={d} className="flex items-center gap-2">
            <div className="flex flex-col gap-1">
              {byDepth.get(d)!.map((n) => (
                <div key={n.id} className={`rounded-md border px-2 py-1 text-xs ${d === 0 ? 'border-primary' : ''}`}>
                  <div className="text-[10px] uppercase text-muted-foreground">{layer(n.table)}</div>
                  <div className="font-mono">{short(n.table)}</div>
                  <div className="font-mono font-semibold">{n.column}</div>
                </div>
              ))}
            </div>
            {i < depths.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>
      {depths.length === 1 && <p className="text-xs text-muted-foreground">No upstream lineage captured yet for this column.</p>}
      {data.consumers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          Read by: {data.consumers.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
        </div>
      )}
    </div>
  );
}
