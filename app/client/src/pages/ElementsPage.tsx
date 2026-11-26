import { useMemo, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Separator, Sheet, SheetContent, SheetDescription,
  SheetHeader, SheetTitle, Switch, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { asText, DATA_TENANTS, int, useApp, useDebounced, TENANT_NAMES } from '../lib/app-context';
import { CdeBadge, PageHeader, PassPct, QueryState, StatusBadge, TenantBadge, UcNote } from '../components/common';
import { OWNER_OPTIONS, SelectField, STATUSES, TextField } from '../components/forms';
import { LineageGraph } from '../components/LineageGraph';

type ElementRow = {
  de_id: string; name: string; description: string; status: string; cde_flag: boolean; subject_area: string; data_domain: string;
  data_subdomain: string; defined_by: string; de_type: string; parent_de_id: string | null; data_owner: string | null;
};
const toElementRow = (r: { [k: string]: unknown }): ElementRow => ({
  de_id: String(r.de_id ?? ''), name: String(r.name ?? ''), description: String(r.description ?? ''), status: String(r.status ?? 'Draft'),
  cde_flag: r.cde_flag === true || r.cde_flag === 'true', subject_area: String(r.subject_area ?? ''), data_domain: String(r.data_domain ?? ''),
  data_subdomain: String(r.data_subdomain ?? ''), defined_by: String(r.defined_by ?? ''), de_type: String(r.de_type ?? 'Atomic'),
  parent_de_id: r.parent_de_id ? String(r.parent_de_id) : '', data_owner: r.data_owner ? String(r.data_owner) : '',
});
const blank: ElementRow = {
  de_id: '', name: '', description: '', status: 'Draft', cde_flag: true, subject_area: 'Customer and Operations', data_domain: 'Customer',
  data_subdomain: 'Individual', defined_by: 'GO', de_type: 'Atomic', parent_de_id: '', data_owner: '',
};

export function ElementForm({ open, onOpenChange, initial, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; initial: ElementRow | null; onSaved: (id: string) => void }) {
  const { api, persona, setFlash, refresh } = useApp();
  const editing = !!initial?.de_id;
  const [f, setF] = useState<ElementRow>(initial ?? blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof ElementRow>(k: K, val: ElementRow[K]) => setF((x) => ({ ...x, [k]: val }));
  const steward = persona.role === 'STEWARD';
  const owner = steward ? persona.tenant ?? f.defined_by : f.defined_by;
  const isBU = !['GDG', 'GO', 'GC', 'GI'].includes(owner);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body = { ...f, defined_by: owner, parent_de_id: f.parent_de_id ?? '', data_owner: f.data_owner ?? '' };
      const r = editing
        ? await api<{ de_id: string; status: string }>(`/api/d360/elements/${f.de_id}`, 'PUT', body)
        : await api<{ de_id: string; status: string }>('/api/d360/elements', 'POST', body);
      setFlash({ kind: 'success', text: `${r.de_id} saved (status: ${r.status}).` });
      refresh();
      onSaved(r.de_id);
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
          <DialogTitle>{editing ? `Edit ${f.de_id}` : 'New data element'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="DE ID" value={f.de_id} onChange={(x) => set('de_id', x)} disabled={editing} placeholder="auto, e.g. GO_00009" hint="Leave blank to auto-number with the owner prefix" />
          <TextField label="Name" value={f.name} onChange={(x) => set('name', x)} />
          <div className="col-span-2">
            <TextField label="Description (business definition)" value={f.description} onChange={(x) => set('description', x)} multiline />
          </div>
          <SelectField label="Defined by (owner)" value={owner} onChange={(x) => set('defined_by', x)} options={OWNER_OPTIONS} disabled={steward || editing} hint={steward ? 'Stewards create content for their own tenant' : undefined} />
          <SelectField label="Status" value={f.status} onChange={(x) => set('status', x)} options={STATUSES}
            hint={persona.role !== 'GROUP_DG' && isBU ? 'BU changes are submitted as Pending Approval' : undefined} />
          <TextField label="Subject area" value={f.subject_area} onChange={(x) => set('subject_area', x)} />
          <TextField label="Data domain" value={f.data_domain} onChange={(x) => set('data_domain', x)} />
          <TextField label="Data sub-domain (L2)" value={f.data_subdomain} onChange={(x) => set('data_subdomain', x)} />
          <SelectField label="DE type" value={f.de_type} onChange={(x) => set('de_type', x)} options={['Atomic', 'Derived']} />
          <TextField label="Customises Group DE (optional)" value={f.parent_de_id ?? ''} onChange={(x) => set('parent_de_id', x)} placeholder="e.g. GO_00004" />
          <TextField label="Data owner" value={f.data_owner ?? ''} onChange={(x) => set('data_owner', x)} />
          <div className="flex items-center gap-2 pt-5">
            <Switch id="cde" checked={!!f.cde_flag} onCheckedChange={(c) => set('cde_flag', c)} />
            <Label htmlFor="cde">Critical Data Element</Label>
          </div>
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

function ElementDetail({ de, onClose, onEdit }: { de: ElementRow; onClose: () => void; onEdit: () => void }) {
  const { v, scope, api, canEdit, setFlash, refresh, persona } = useApp();
  const p = { v: sql.int(v), de_id: sql.string(de.de_id) };
  const rules = useAnalyticsQuery('element_rules', p);
  const maps = useAnalyticsQuery('element_mappings', { ...p, scope: sql.string(scope) });
  const results = useAnalyticsQuery('element_results', { ...p, scope: sql.string(scope) });
  const [lineageFor, setLineageFor] = useState<string>('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [newMap, setNewMap] = useState({ tenant_code: persona.tenant && !['GDG'].includes(persona.tenant) ? persona.tenant : DATA_TENANTS[0] ?? '', table_fqn: '', column_name: '' });
  const editable = canEdit(de.defined_by);

  const doDelete = async () => {
    try {
      await api(`/api/d360/elements/${de.de_id}`, 'DELETE');
      setFlash({ kind: 'success', text: `${de.de_id} deleted.` });
      refresh();
      onClose();
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    }
    setConfirmDel(false);
  };
  const sync = async () => {
    try {
      const r = await api<{ synced: string[] }>(`/api/d360/sync-uc/${de.de_id}`, 'POST');
      setFlash({ kind: 'success', text: `Pushed description + tags (d360_de_id, d360_cde, d360_domain…) to ${r.synced.length} Unity Catalog column(s): ${r.synced.join(', ')}` });
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    }
  };
  const addMap = async () => {
    try {
      await api('/api/d360/mappings', 'POST', { de_id: de.de_id, ...newMap });
      setFlash({ kind: 'success', text: `Mapped ${de.de_id} → ${newMap.table_fqn}.${newMap.column_name}` });
      refresh();
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    }
  };
  const delMap = async (m: { tenant_code: string; table_fqn: string; column_name: string }) => {
    try {
      await api('/api/d360/mappings', 'DELETE', { de_id: de.de_id, ...m });
      refresh();
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    }
  };

  return (
    <SheetContent side="right" className="sm:max-w-3xl w-full overflow-y-auto">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{de.de_id}</span> {de.name} <CdeBadge on={de.cde_flag} />
        </SheetTitle>
        <SheetDescription>{de.description}</SheetDescription>
      </SheetHeader>
      <div className="px-4 pb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={de.status} /> <TenantBadge code={de.defined_by} />
          <span className="text-muted-foreground">{de.subject_area} › {de.data_domain} › {de.data_subdomain} · {de.de_type}</span>
          {de.parent_de_id && <span className="text-muted-foreground">customises {de.parent_de_id}</span>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onEdit} disabled={!editable}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          <Button size="sm" variant="outline" onClick={sync} disabled={persona.role === 'VIEWER'}><RefreshCw className="h-3.5 w-3.5" /> Sync to Unity Catalog</Button>
          <Button size="sm" variant="destructive" onClick={() => setConfirmDel(true)} disabled={!editable}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
        </div>
        {!editable && <p className="text-xs text-muted-foreground">Read-only for {persona.label}: owned by {TENANT_NAMES[de.defined_by] ?? de.defined_by}.</p>}

        <Tabs defaultValue="rules">
          <TabsList>
            <TabsTrigger value="rules">Rules ({rules.data?.length ?? '…'})</TabsTrigger>
            <TabsTrigger value="mapping">Physical mapping & lineage ({maps.data?.length ?? '…'})</TabsTrigger>
            <TabsTrigger value="results">Latest results</TabsTrigger>
          </TabsList>
          <TabsContent value="rules">
            <QueryState loading={rules.loading} error={rules.error} empty={!rules.data?.length} emptyText="No rules attached. Add one on the DQ Rules page.">
              <Table>
                <TableHeader><TableRow><TableHead>Rule</TableHead><TableHead>Dimension</TableHead><TableHead>Owner</TableHead><TableHead>Status</TableHead><TableHead>Definition</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(rules.data ?? []).map((r) => (
                    <TableRow key={r.rule_id}>
                      <TableCell>
                        <div className={`font-mono text-xs ${r.parent_rule_id ? 'pl-4' : ''}`}>{r.parent_rule_id ? '↳ ' : ''}{r.rule_id}</div>
                        <div className="text-xs text-muted-foreground max-w-xs">{r.description}</div>
                      </TableCell>
                      <TableCell>{r.dq_dimension}</TableCell>
                      <TableCell><TenantBadge code={r.defined_by} /></TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="font-mono text-[11px] max-w-[220px] break-all">{r.rule_type} {asText(r.rule_params) !== '{}' ? asText(r.rule_params) : ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-2">↳ = BU customisation of a Group rule. The DQ engine runs the BU version on that BU's data once it is Approved.</p>
            </QueryState>
          </TabsContent>
          <TabsContent value="mapping" className="space-y-3">
            <UcNote>each mapping points at a governed table column. "Sync to Unity Catalog" writes the business definition as the column comment and CDE/domain tags; lineage below is read live from UC.</UcNote>
            <QueryState loading={maps.loading} error={maps.error} empty={!maps.data?.length} emptyText="Not mapped to any physical column yet.">
              <Table>
                <TableHeader><TableRow><TableHead>Tenant</TableHead><TableHead>Table.column</TableHead><TableHead>Source system</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {(maps.data ?? []).map((m) => {
                    const id = `${m.table_fqn}.${m.column_name}`;
                    return (
                      <TableRow key={id} className={lineageFor === id ? 'bg-muted' : ''}>
                        <TableCell><TenantBadge code={m.tenant_code} /></TableCell>
                        <TableCell className="font-mono text-xs">{m.table_fqn.split('.').slice(1).join('.')}.<b>{m.column_name}</b></TableCell>
                        <TableCell className="text-xs">{m.source_system}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="outline" onClick={() => setLineageFor(id)}>Lineage graph</Button>
                          {canEdit(m.tenant_code) && <Button size="sm" variant="ghost" onClick={() => delMap(m)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </QueryState>
            <Dialog open={!!lineageFor} onOpenChange={(o) => !o && setLineageFor('')}>
              <DialogContent className="sm:max-w-[94vw] w-[94vw]">
                <DialogHeader>
                  <DialogTitle>Lineage · {de.de_id} {de.name} → {lineageFor.split('.').slice(1).join('.')}</DialogTitle>
                </DialogHeader>
                {lineageFor && <LineageGraph table={lineageFor.split('.').slice(0, 3).join('.')} column={lineageFor.split('.')[3]} height={640} />}
              </DialogContent>
            </Dialog>
            {persona.role !== 'VIEWER' && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-24"><SelectField label="Tenant" value={newMap.tenant_code} onChange={(x) => setNewMap({ ...newMap, tenant_code: x })} options={DATA_TENANTS} disabled={persona.role === 'STEWARD'} /></div>
                <div className="flex-1 min-w-[260px]"><Label className="text-xs">Table (catalog.schema.table)</Label><Input value={newMap.table_fqn} onChange={(e) => setNewMap({ ...newMap, table_fqn: e.target.value })} placeholder="catalog.schema.dq_customer_mart" /></div>
                <div className="w-40"><Label className="text-xs">Column</Label><Input value={newMap.column_name} onChange={(e) => setNewMap({ ...newMap, column_name: e.target.value })} /></div>
                <Button size="sm" onClick={addMap}><Plus className="h-3.5 w-3.5" /> Map column</Button>
              </div>
            )}
          </TabsContent>
          <TabsContent value="results">
            <QueryState loading={results.loading} error={results.error} empty={!results.data?.length} emptyText="No results in the latest run for this element.">
              <Table>
                <TableHeader><TableRow><TableHead>Rule run</TableHead><TableHead>Tenant</TableHead><TableHead>Dimension</TableHead><TableHead className="text-right">Rows</TableHead><TableHead className="text-right">Failed</TableHead><TableHead className="text-right">Pass / thr.</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(results.data ?? []).map((r) => (
                    <TableRow key={`${r.effective_rule_id}-${r.tenant_code}`}>
                      <TableCell className="font-mono text-xs">{r.effective_rule_id}{r.effective_rule_id !== r.rule_id && <div className="text-muted-foreground">override of {r.rule_id}</div>}</TableCell>
                      <TableCell><TenantBadge code={r.tenant_code} /></TableCell>
                      <TableCell>{r.dq_dimension}</TableCell>
                      <TableCell className="text-right tabular-nums">{int(r.total_rows)}</TableCell>
                      <TableCell className="text-right tabular-nums">{int(r.failed_rows)}</TableCell>
                      <TableCell className="text-right"><PassPct value={r.pass_pct} threshold={r.threshold_pct} /></TableCell>
                      <TableCell><StatusBadge status={r.result_status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </QueryState>
          </TabsContent>
        </Tabs>
      </div>
      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {de.de_id}?</AlertDialogTitle>
            <AlertDialogDescription>Removes the element and its physical mappings. Blocked if rules are still attached. The before-image is kept in the audit trail.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SheetContent>
  );
}

export function ElementsPage() {
  const { v, scope, persona } = useApp();
  const [f, setF] = useState({ q: '', domain: '', status: '', owner: '', cde: '' });
  const q = useDebounced(f.q);
  const facets = useAnalyticsQuery('facets', { v: sql.int(v) });
  const els = useAnalyticsQuery('elements', {
    v: sql.int(v), scope: sql.string(scope), q: sql.string(q), domain: sql.string(f.domain), status: sql.string(f.status), owner: sql.string(f.owner), cde: sql.string(f.cde),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; initial: ElementRow | null }>({ open: false, initial: null });
  const domains = useMemo(() => (facets.data ?? []).filter((x) => x.facet === 'domain').map((x) => x.value), [facets.data]);
  const sel = (els.data ?? []).find((r) => r.de_id === selected);

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="Data elements"
        subtitle="Central business data dictionary: Group-defined elements, BU customisations and BU-local elements. Click a row for its rules, physical mapping, UC lineage and results."
        actions={persona.role !== 'VIEWER' && <Button onClick={() => setForm({ open: true, initial: null })}><Plus className="h-4 w-4" /> New element</Button>}
      />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="col-span-2 md:col-span-1"><TextFieldInline value={f.q} onChange={(q) => setF({ ...f, q })} /></div>
        <SelectField label="Domain" value={f.domain} onChange={(domain) => setF({ ...f, domain })} options={domains} allowAll="All domains" />
        <SelectField label="Owner" value={f.owner} onChange={(owner) => setF({ ...f, owner })} options={OWNER_OPTIONS} allowAll="All owners" />
        <SelectField label="Status" value={f.status} onChange={(status) => setF({ ...f, status })} options={STATUSES} allowAll="All statuses" />
        <SelectField label="CDE" value={f.cde} onChange={(cde) => setF({ ...f, cde })} options={[{ value: 'true', label: 'CDEs only' }, { value: 'false', label: 'Non-CDE' }]} allowAll="All" />
      </div>
      <Card>
        <CardContent className="pt-4">
          <QueryState loading={els.loading} error={els.error} empty={!els.data?.length} rows={8}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DE ID</TableHead><TableHead>Name</TableHead><TableHead>Domain › sub-domain</TableHead><TableHead>Defined by</TableHead>
                  <TableHead>Status</TableHead><TableHead className="text-right">Rules</TableHead><TableHead>Mapped in</TableHead><TableHead className="text-right">Latest pass</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(els.data ?? []).map((r) => (
                  <TableRow key={r.de_id} className="cursor-pointer" onClick={() => setSelected(r.de_id)}>
                    <TableCell className="font-mono text-xs">{r.de_id}</TableCell>
                    <TableCell><span className="font-medium">{r.name}</span> <CdeBadge on={r.cde_flag} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.data_domain} › {r.data_subdomain}</TableCell>
                    <TableCell><TenantBadge code={r.defined_by} /></TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">{int(r.rule_count)}</TableCell>
                    <TableCell className="text-xs">{r.mapped_tenants ?? <span className="text-muted-foreground">unmapped</span>}</TableCell>
                    <TableCell className="text-right"><PassPct value={r.pass_pct} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>
      <Separator className="my-4 opacity-0" />
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSelected(null)}>
        {sel && <ElementDetail de={toElementRow(sel)} onClose={() => setSelected(null)} onEdit={() => setForm({ open: true, initial: toElementRow(sel) })} />}
      </Sheet>
      {form.open && <ElementForm key={form.initial?.de_id ?? 'new'} open={form.open} onOpenChange={(o) => setForm({ ...form, open: o })} initial={form.initial} onSaved={() => undefined} />}
    </div>
  );
}

function TextFieldInline({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <TextField label="Search" value={value} onChange={onChange} placeholder="ID, name or description" />;
}
