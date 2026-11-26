import { useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { asText, int, useApp, useDebounced, TENANT_NAMES } from '../lib/app-context';
import { PageHeader, PassPct, QueryState, StatusBadge, TenantBadge, UcNote } from '../components/common';
import { DIMENSIONS, OWNER_OPTIONS, RULE_TYPES, SelectField, STATUSES, TextField } from '../components/forms';

export interface RuleRow {
  rule_id: string; name: string; status: string; dq_dimension: string; description: string; rule_type: string; rule_params: string;
  applicable_to: string; defined_by: string; parent_rule_id: string | null; threshold_pct: number;
}
const blankRule: RuleRow = {
  rule_id: '', name: '', status: 'Draft', dq_dimension: 'Completeness', description: '', rule_type: 'not_null_or_blank', rule_params: '{}',
  applicable_to: '', defined_by: 'GO', parent_rule_id: '', threshold_pct: 98,
};
export const toRuleRow = (r: { [k: string]: unknown }): RuleRow => ({
  rule_id: String(r.rule_id ?? ''), name: String(r.name ?? ''), status: String(r.status ?? 'Draft'), dq_dimension: String(r.dq_dimension ?? 'Completeness'),
  description: String(r.description ?? ''), rule_type: String(r.rule_type ?? 'not_null_or_blank'), rule_params: asText(r.rule_params) || '{}',
  applicable_to: String(r.applicable_to ?? ''), defined_by: String(r.defined_by ?? 'GO'), parent_rule_id: r.parent_rule_id ? String(r.parent_rule_id) : '',
  threshold_pct: Number(r.threshold_pct ?? 98),
});

function parseParams(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Structured rule builder: the UI edits typed parameters; the engine compiles them to SQL. */
function RuleParamsEditor({ type, params, onChange }: { type: string; params: string; onChange: (p: string) => void }) {
  const p = parseParams(params);
  const set = (k: string, val: unknown) => onChange(JSON.stringify({ ...p, [k]: val }));
  if (type === 'regex') return <TextField label="Pattern (regex)" value={String(p.pattern ?? '')} onChange={(x) => set('pattern', x)} placeholder="^VN[0-9]{9}$" />;
  if (type === 'in_reference')
    return (
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Reference set" value={String(p.ref_set ?? '')} onChange={(x) => set('ref_set', x.toUpperCase())} placeholder="NATIONALITY" hint="See Reference Data page" />
        <TextField label="Exclude codes (comma separated)" value={Array.isArray(p.exclude) ? p.exclude.join(',') : ''} onChange={(x) => set('exclude', x.split(',').map((y) => y.trim()).filter(Boolean))} placeholder="OTHER,UNKNOWN" />
      </div>
    );
  if (type === 'range')
    return (
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Minimum" value={String(p.min ?? '')} onChange={(x) => set('min', x)} placeholder="1906-01-01" />
        <TextField label="Maximum (SQL expression)" value={String(p.max_expr ?? '')} onChange={(x) => set('max_expr', x)} placeholder="current_date()" />
      </div>
    );
  if (type === 'sql_expr')
    return <TextField label="Boolean SQL expression (row passes when true; {col} = mapped column)" value={String(p.expr ?? '')} onChange={(x) => set('expr', x)} multiline placeholder="NOT ({col} = 'ACTIVE' AND active_policy_count = 0)" />;
  return <p className="text-xs text-muted-foreground">No parameters needed for this rule type.</p>;
}

export function RuleForm({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial: RuleRow | null }) {
  const { api, persona, setFlash, refresh } = useApp();
  const editing = !!initial?.rule_id && !initial.rule_id.startsWith('NEW:');
  const [f, setF] = useState<RuleRow>(initial ? { ...initial, rule_id: initial.rule_id.startsWith('NEW:') ? '' : initial.rule_id } : blankRule);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof RuleRow>(k: K, val: RuleRow[K]) => setF((x) => ({ ...x, [k]: val }));
  const steward = persona.role === 'STEWARD';
  const owner = steward ? persona.tenant ?? f.defined_by : f.defined_by;

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body = { ...f, defined_by: owner, parent_rule_id: f.parent_rule_id ?? '' };
      const r = editing
        ? await api<{ rule_id: string; status: string }>(`/api/d360/rules/${f.rule_id}`, 'PUT', body)
        : await api<{ rule_id: string; status: string }>('/api/d360/rules', 'POST', body);
      setFlash({ kind: 'success', text: `${r.rule_id} saved (status: ${r.status}).` });
      refresh();
      onOpenChange(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${f.rule_id}` : f.parent_rule_id ? `Customise ${f.parent_rule_id} for ${owner}` : 'New DQ rule'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Rule ID" value={f.rule_id} onChange={(x) => set('rule_id', x)} disabled={editing} placeholder="auto, e.g. VN_DQ_00002" />
          <SelectField label="Defined by" value={owner} onChange={(x) => set('defined_by', x)} options={OWNER_OPTIONS} disabled={steward || editing} />
          <div className="col-span-2"><TextField label="Name" value={f.name} onChange={(x) => set('name', x)} placeholder="Customer-Individual-Customer Identifier-Validity" hint="Convention: Domain-SubDomain-Element-Dimension" /></div>
          <div className="col-span-2"><TextField label="Description" value={f.description} onChange={(x) => set('description', x)} multiline /></div>
          <SelectField label="DQ dimension" value={f.dq_dimension} onChange={(x) => set('dq_dimension', x)} options={DIMENSIONS} />
          <SelectField label="Status" value={f.status} onChange={(x) => set('status', x)} options={STATUSES} />
          <TextField label="Applicable to (DE IDs, comma separated)" value={f.applicable_to} onChange={(x) => set('applicable_to', x)} placeholder="GO_00001" hint="The same rule can apply to multiple CDEs" />
          <TextField label="Threshold (min pass %)" value={String(f.threshold_pct)} onChange={(x) => set('threshold_pct', Number(x))} />
          <TextField label="Overrides Group rule (optional)" value={f.parent_rule_id ?? ''} onChange={(x) => set('parent_rule_id', x)} placeholder="e.g. GO_DQ_00036" hint="BU customisation: replaces the Group rule on this BU's data once approved" />
          <SelectField label="Rule type" value={f.rule_type} onChange={(x) => setF((y) => ({ ...y, rule_type: x, rule_params: '{}' }))} options={RULE_TYPES} />
          <div className="col-span-2"><RuleParamsEditor type={f.rule_type} params={f.rule_params} onChange={(x) => set('rule_params', x)} /></div>
          <div className="col-span-2 text-[11px] font-mono text-muted-foreground">definition: {f.rule_type} {f.rule_params}</div>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDetail({ rule, onEdit, onCustomise, onClose }: { rule: RuleRow & { pass_pct?: unknown }; onEdit: () => void; onCustomise: () => void; onClose: () => void }) {
  const { v, scope, api, canEdit, setFlash, refresh, persona } = useApp();
  const hist = useAnalyticsQuery('rule_history', { v: sql.int(v), rule_id: sql.string(rule.rule_id), scope: sql.string(scope) });
  const [sample, setSample] = useState<{ run_id: string; tenant: string; rule: string } | null>(null);
  const samples = useAnalyticsQuery(
    'failed_samples',
    { v: sql.int(v), run_id: sql.string(sample?.run_id ?? ''), rule_id: sql.string(sample?.rule ?? ''), tenant: sql.string(sample?.tenant ?? '') },
    { autoStart: !!sample },
  );
  const [confirmDel, setConfirmDel] = useState(false);
  const editable = canEdit(rule.defined_by);
  const isGroupRule = ['GO', 'GC', 'GI', 'GDG'].includes(rule.defined_by) && !rule.parent_rule_id;
  const canCustomise = persona.role === 'STEWARD' && isGroupRule && !['GO', 'GC', 'GI', 'GDG'].includes(persona.tenant ?? '');
  const latestSql = hist.data?.[0]?.check_sql;

  const doDelete = async () => {
    try {
      await api(`/api/d360/rules/${rule.rule_id}`, 'DELETE');
      setFlash({ kind: 'success', text: `${rule.rule_id} deleted.` });
      refresh();
      onClose();
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    }
    setConfirmDel(false);
  };

  return (
    <SheetContent side="right" className="sm:max-w-3xl w-full overflow-y-auto">
      <SheetHeader>
        <SheetTitle><span className="font-mono text-sm text-muted-foreground">{rule.rule_id}</span> {rule.name}</SheetTitle>
        <SheetDescription>{rule.description}</SheetDescription>
      </SheetHeader>
      <div className="px-4 pb-6 space-y-4">
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <StatusBadge status={rule.status} /> <TenantBadge code={rule.defined_by} /> <span>{rule.dq_dimension}</span>
          <span className="text-muted-foreground">applies to {rule.applicable_to} · threshold {rule.threshold_pct}%</span>
          {rule.parent_rule_id && <span className="text-muted-foreground">overrides {rule.parent_rule_id}</span>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onEdit} disabled={!editable}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          {canCustomise && <Button size="sm" variant="outline" onClick={onCustomise}><Copy className="h-3.5 w-3.5" /> Customise for {persona.tenant}</Button>}
          <Button size="sm" variant="destructive" onClick={() => setConfirmDel(true)} disabled={!editable}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
        </div>
        {!editable && <p className="text-xs text-muted-foreground">Read-only for {persona.label}: owned by {TENANT_NAMES[rule.defined_by] ?? rule.defined_by}.{canCustomise ? ' You can create a BU customisation instead.' : ''}</p>}
        <div className="rounded-md border p-3 font-mono text-xs">definition: {rule.rule_type} {rule.rule_params}</div>
        {latestSql && (
          <div>
            <div className="text-xs font-semibold mb-1">SQL generated by the DQ engine (latest run)</div>
            <pre className="rounded-md bg-muted p-3 text-[11px] whitespace-pre-wrap break-all">{asText(latestSql)}</pre>
          </div>
        )}
        <div>
          <div className="text-sm font-semibold mb-2">Results history</div>
          <QueryState loading={hist.loading} error={hist.error} empty={!hist.data?.length} emptyText="Not executed yet. Approved rules run in the next DQ assessment.">
            <Table>
              <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Tenant</TableHead><TableHead>Executed as</TableHead><TableHead className="text-right">Rows</TableHead><TableHead className="text-right">Failed</TableHead><TableHead className="text-right">Pass / thr.</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {(hist.data ?? []).map((h) => (
                  <TableRow key={`${h.run_id}-${h.tenant_code}-${h.effective_rule_id}`}>
                    <TableCell>{h.period}</TableCell>
                    <TableCell><TenantBadge code={h.tenant_code} /></TableCell>
                    <TableCell className="font-mono text-xs">{h.effective_rule_id}</TableCell>
                    <TableCell className="text-right tabular-nums">{int(h.total_rows)}</TableCell>
                    <TableCell className="text-right tabular-nums">{int(h.failed_rows)}</TableCell>
                    <TableCell className="text-right"><PassPct value={h.pass_pct} threshold={h.threshold_pct} /></TableCell>
                    <TableCell>{Number(h.failed_rows) > 0 && !String(h.run_id).endsWith('-hist') && <Button size="sm" variant="ghost" onClick={() => setSample({ run_id: h.run_id, tenant: h.tenant_code, rule: h.effective_rule_id })}>Failing rows</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </div>
        {sample && (
          <Card><CardContent className="pt-4">
            <div className="text-xs font-semibold mb-2">Sample failing rows · {sample.rule} · {sample.tenant}</div>
            <QueryState loading={samples.loading} error={samples.error} empty={!samples.data?.length}>
              <Table>
                <TableHeader><TableRow><TableHead>Source row</TableHead><TableHead>Failed value</TableHead><TableHead>Column</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(samples.data ?? []).map((s) => (
                    <TableRow key={s.row_key}><TableCell className="font-mono text-xs">{s.row_key}</TableCell><TableCell className="font-mono text-xs">{s.failed_value ?? <i>NULL</i>}</TableCell><TableCell className="text-xs">{s.table_fqn.split('.').pop()}.{s.column_name}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </QueryState>
          </CardContent></Card>
        )}
      </div>
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {rule.rule_id}?</AlertDialogTitle>
            <AlertDialogDescription>The rule stops running in future assessments; historical results are kept. Blocked if BU customisations depend on it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SheetContent>
  );
}

export function RulesPage() {
  const { v, scope, persona, schema } = useApp();
  const [f, setF] = useState({ q: '', dimension: '', status: '', owner: '' });
  const q = useDebounced(f.q);
  const rules = useAnalyticsQuery('rules', {
    v: sql.int(v), scope: sql.string(scope), q: sql.string(q), dimension: sql.string(f.dimension), status: sql.string(f.status), owner: sql.string(f.owner),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; initial: RuleRow | null }>({ open: false, initial: null });
  const sel = (rules.data ?? []).find((r) => r.rule_id === selected);

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="DQ rules"
        subtitle="Rule library across DQ dimensions. Group rules apply to every BU mapped to the element; BUs can customise a Group rule (e.g. the BU's ID format) or add local rules."
        actions={persona.role !== 'VIEWER' && <Button onClick={() => setForm({ open: true, initial: null })}><Plus className="h-4 w-4" /> New rule</Button>}
      />
      <UcNote>rules live in a Delta table (<code>{schema}.dq_rules</code>). The definition is structured (type + JSON parameters) so the serverless DQ job can compile it to SQL; every version change is audited.</UcNote>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
        <TextField label="Search" value={f.q} onChange={(x) => setF({ ...f, q: x })} placeholder="ID, name, element" />
        <SelectField label="Dimension" value={f.dimension} onChange={(x) => setF({ ...f, dimension: x })} options={DIMENSIONS} allowAll="All dimensions" />
        <SelectField label="Owner" value={f.owner} onChange={(x) => setF({ ...f, owner: x })} options={OWNER_OPTIONS} allowAll="All owners" />
        <SelectField label="Status" value={f.status} onChange={(x) => setF({ ...f, status: x })} options={STATUSES} allowAll="All statuses" />
      </div>
      <Card>
        <CardContent className="pt-4">
          <QueryState loading={rules.loading} error={rules.error} empty={!rules.data?.length} rows={10}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule ID</TableHead><TableHead>Name</TableHead><TableHead>Dimension</TableHead><TableHead>Applies to</TableHead>
                  <TableHead>Defined by</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Latest pass</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rules.data ?? []).map((r) => (
                  <TableRow key={r.rule_id} className="cursor-pointer" onClick={() => setSelected(r.rule_id)}>
                    <TableCell className="font-mono text-xs">{r.rule_id}{r.parent_rule_id && <div className="text-muted-foreground">↳ {r.parent_rule_id}</div>}</TableCell>
                    <TableCell className="text-sm max-w-sm">{r.name}</TableCell>
                    <TableCell>{r.dq_dimension}</TableCell>
                    <TableCell className="font-mono text-xs">{r.applicable_to}</TableCell>
                    <TableCell><TenantBadge code={r.defined_by} /></TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right">{Number(r.checks) > 0 ? <PassPct value={r.pass_pct} threshold={r.threshold_pct} /> : <span className="text-xs text-muted-foreground">{r.parent_rule_id || r.status !== 'Approved' ? 'not active' : 'not run'}</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSelected(null)}>
        {sel && (
          <RuleDetail
            rule={toRuleRow(sel)}
            onClose={() => setSelected(null)}
            onEdit={() => setForm({ open: true, initial: toRuleRow(sel) })}
            onCustomise={() => {
              const base = toRuleRow(sel);
              setForm({ open: true, initial: { ...base, rule_id: 'NEW:', parent_rule_id: base.rule_id, defined_by: persona.tenant ?? base.defined_by, name: `${base.name} (${persona.tenant})`, status: 'Pending Approval' } });
            }}
          />
        )}
      </Sheet>
      {form.open && <RuleForm key={form.initial?.rule_id ?? 'new'} open={form.open} onOpenChange={(o) => setForm({ ...form, open: o })} initial={form.initial} />}
    </div>
  );
}
