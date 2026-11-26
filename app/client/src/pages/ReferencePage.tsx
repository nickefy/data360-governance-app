import { useState } from 'react';
import {
  Button, Card, CardContent, CardHeader, CardTitle, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '../lib/app-context';
import { PageHeader, QueryState, TenantBadge, UcNote } from '../components/common';
import { TextField } from '../components/forms';

export function ReferencePage() {
  const { v, api, persona, setFlash, refresh, canEdit, schema } = useApp();
  const sets = useAnalyticsQuery('ref_sets', { v: sql.int(v) });
  const [set, setSet] = useState('NATIONALITY');
  const data = useAnalyticsQuery('ref_data', { v: sql.int(v), ref_set: sql.string(set) });
  const [n, setN] = useState({ code: '', label: '' });
  const myTenant = persona.role === 'GROUP_DG' ? 'GROUP' : persona.tenant ?? 'GROUP';
  const canWrite = persona.role !== 'VIEWER';

  const save = async (row: { ref_set: string; code: string; label: string; tenant_code: string; active: boolean }) => {
    try {
      await api('/api/d360/reference', 'POST', row);
      setFlash({ kind: 'success', text: `${row.ref_set}/${row.code} saved for ${row.tenant_code}.` });
      refresh();
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    }
  };
  const del = async (row: { ref_set: string; code: string; tenant_code: string }) => {
    try {
      await api('/api/d360/reference', 'DELETE', row);
      refresh();
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    }
  };
  const editableRow = (t: string) => (t === 'GROUP' ? persona.role === 'GROUP_DG' : canEdit(t));

  return (
    <div className="max-w-6xl space-y-5">
      <PageHeader title="Reference data" subtitle="Group code sets used by validity rules (e.g. GO_DQ_00038 nationality). BUs extend a Group set with local codes. The DQ engine checks against GROUP codes plus the BU's own." />
      <UcNote>stored in <code>{schema}.reference_data</code>. Production could source these from the Group MDM through a governed pipeline.</UcNote>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="text-base">Code sets</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <QueryState loading={sets.loading} error={sets.error} empty={!sets.data?.length}>
              {(sets.data ?? []).map((s) => (
                <button key={s.ref_set} onClick={() => setSet(s.ref_set)} className={`w-full text-left px-2 py-1.5 rounded text-sm ${set === s.ref_set ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                  {s.ref_set} <span className="opacity-70 text-xs">({s.codes}{Number(s.bu_extensions) ? `, ${s.bu_extensions} BU` : ''})</span>
                </button>
              ))}
            </QueryState>
          </CardContent>
        </Card>
        <Card className="md:col-span-3">
          <CardHeader><CardTitle className="text-base">{set}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <QueryState loading={data.loading} error={data.error} empty={!data.data?.length}>
              <Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Label</TableHead><TableHead>Scope</TableHead><TableHead>Active</TableHead><TableHead>Updated</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {(data.data ?? []).map((r) => (
                    <TableRow key={`${r.tenant_code}-${r.code}`}>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell>{r.label}</TableCell>
                      <TableCell>{r.tenant_code === 'GROUP' ? <span className="text-xs">Group-wide</span> : <TenantBadge code={r.tenant_code} />}</TableCell>
                      <TableCell>
                        <Switch checked={String(r.active) === 'true'} disabled={!editableRow(r.tenant_code)} onCheckedChange={(c) => save({ ref_set: r.ref_set, code: r.code, label: r.label, tenant_code: r.tenant_code, active: c })} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.updated_by} {r.updated_at?.slice(0, 10)}</TableCell>
                      <TableCell>{editableRow(r.tenant_code) && <Button size="sm" variant="ghost" onClick={() => del(r)}><Trash2 className="h-3.5 w-3.5" /></Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </QueryState>
            {canWrite && (
              <div className="flex flex-wrap items-end gap-2 pt-2">
                <div className="w-40"><TextField label="Code" value={n.code} onChange={(x) => setN({ ...n, code: x.toUpperCase() })} /></div>
                <div className="flex-1 min-w-[200px]"><TextField label="Label" value={n.label} onChange={(x) => setN({ ...n, label: x })} /></div>
                <Button onClick={() => save({ ref_set: set, code: n.code, label: n.label, tenant_code: myTenant, active: true })} disabled={!n.code || !n.label}>
                  <Plus className="h-4 w-4" /> Add {myTenant === 'GROUP' ? 'Group' : myTenant} code
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
