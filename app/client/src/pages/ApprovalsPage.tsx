import { useState } from 'react';
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { Check, X } from 'lucide-react';
import { useApp, GROUP_FUNCTIONS } from '../lib/app-context';
import { PageHeader, QueryState, StatusBadge, TenantBadge, UcNote } from '../components/common';

export function ApprovalsPage() {
  const { v, scope, api, persona, setFlash, refresh } = useApp();
  const approvals = useAnalyticsQuery('approvals', { v: sql.int(v), scope: sql.string(scope) });
  const batches = useAnalyticsQuery('intake_batches', { v: sql.int(v), scope: sql.string(scope) });
  const [batch, setBatch] = useState<{ id: string; tenant: string } | null>(null);
  const rows = useAnalyticsQuery('intake_rows', { v: sql.int(v), batch_id: sql.string(batch?.id ?? '') }, { autoStart: !!batch });
  const [busy, setBusy] = useState(false);

  const canApprove = (owner: string) =>
    persona.role === 'GROUP_DG' || (persona.role === 'STEWARD' && GROUP_FUNCTIONS.includes(persona.tenant ?? '') && persona.tenant === owner);

  const decide = async (object_type: string, object_id: string, decision: 'Approved' | 'Rejected') => {
    try {
      await api('/api/d360/approve', 'POST', { object_type, object_id, decision });
      setFlash({ kind: 'success', text: `${object_id} ${decision.toLowerCase()}.` });
      refresh();
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    }
  };
  const decideBatch = async (decision: 'APPROVED' | 'REJECTED', ids?: string[]) => {
    if (!batch) return;
    setBusy(true);
    try {
      const r = await api<{ elements: number; rules: number }>(`/api/d360/intake/${encodeURIComponent(batch.id)}/decision`, 'POST', { tenant_code: batch.tenant, decision, object_ids: ids });
      setFlash({ kind: 'success', text: `${batch.id}: ${decision.toLowerCase()} ${r.elements} element(s) and ${r.rules} rule(s)${decision === 'APPROVED' ? ', merged into the Group registry' : ''}.` });
      refresh();
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="Approvals & BU intake"
        subtitle="Group approves CDEs and DQ rules that BUs define or customise. Bulk submissions arrive from each BU workspace in the standard template and are merged into the registry on approval."
      />
      <Card>
        <CardHeader>
          <CardTitle>Changes awaiting approval</CardTitle>
          <CardDescription>Registry items in Draft or Pending Approval {scope ? `for ${scope}` : 'across all tenants'}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState loading={approvals.loading} error={approvals.error} empty={!approvals.data?.length} emptyText="No pending changes.">
            <Table>
              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>Owner</TableHead><TableHead>Status</TableHead><TableHead>Last change</TableHead><TableHead className="text-right">Decision</TableHead></TableRow></TableHeader>
              <TableBody>
                {(approvals.data ?? []).map((a) => (
                  <TableRow key={`${a.object_type}-${a.object_id}`}>
                    <TableCell className="text-xs">{a.object_type === 'DATA_ELEMENT' ? 'Data element' : 'DQ rule'}</TableCell>
                    <TableCell className="font-mono text-xs">{a.object_id}{a.parent_id && <div className="text-muted-foreground">customises {a.parent_id}</div>}</TableCell>
                    <TableCell className="text-sm max-w-sm">{a.name}<div className="text-xs text-muted-foreground">{a.description}</div></TableCell>
                    <TableCell><TenantBadge code={a.defined_by} /></TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.updated_by}<div>{a.updated_at?.slice(0, 16)}</div></TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      {canApprove(a.defined_by) && a.status === 'Pending Approval' ? (
                        <>
                          <Button size="sm" onClick={() => decide(a.object_type, a.object_id, 'Approved')}><Check className="h-3.5 w-3.5" /> Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => decide(a.object_type, a.object_id, 'Rejected')}><X className="h-3.5 w-3.5" /> Reject</Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{a.status === 'Draft' ? 'owner still drafting' : 'Group DG approves'}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>BU submissions (via Delta Sharing)</CardTitle>
          <CardDescription>Batches each BU filed in the standard template, read from the BU's shared intake tables</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <UcNote>each BU writes its submissions to <code>intake_data_elements</code> / <code>intake_dq_rules</code> in its own workspace. A Delta Share exposes those tables read-only to the Group governance workspace. This app reads them in place; nothing is copied until Group approves. (The demo runs in one workspace, so it reads the BU schemas directly.)</UcNote>
          <QueryState loading={batches.loading} error={batches.error} empty={!batches.data?.length} emptyText="No BU submissions yet. Upload one as a BU steward on Bulk Upload.">
            <Table>
              <TableHeader><TableRow><TableHead>BU</TableHead><TableHead>Batch</TableHead><TableHead>Submitted</TableHead><TableHead className="text-right">Elements</TableHead><TableHead className="text-right">Rules</TableHead><TableHead>Progress</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {(batches.data ?? []).map((b) => (
                  <TableRow key={b.batch_id} className={batch?.id === b.batch_id ? 'bg-muted' : ''}>
                    <TableCell><TenantBadge code={b.tenant_code} /></TableCell>
                    <TableCell className="font-mono text-xs">{b.batch_id}</TableCell>
                    <TableCell className="text-xs">{b.submitted_by}<div className="text-muted-foreground">{b.submitted_at?.slice(0, 16)}</div></TableCell>
                    <TableCell className="text-right">{b.elements}</TableCell>
                    <TableCell className="text-right">{b.rules}</TableCell>
                    <TableCell className="text-xs">{Number(b.pending) > 0 ? <StatusBadge status="PENDING" /> : <StatusBadge status="Approved" />} <span className="text-muted-foreground">{b.approved} approved · {b.rejected} rejected · {b.pending} pending</span></TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => setBatch({ id: b.batch_id, tenant: b.tenant_code })}>Review</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
          {batch && (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Batch {batch.id}</div>
                  {persona.role === 'GROUP_DG' ? (
                    <div className="space-x-2">
                      <Button size="sm" disabled={busy} onClick={() => decideBatch('APPROVED')}><Check className="h-3.5 w-3.5" /> Approve all pending & merge</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => decideBatch('REJECTED')}><X className="h-3.5 w-3.5" /> Reject all pending</Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Only Group Data Governance can review BU submissions</span>
                  )}
                </div>
                <QueryState loading={rows.loading} error={rows.error} empty={!rows.data?.length}>
                  <Table>
                    <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>In registry?</TableHead><TableHead>Decision</TableHead><TableHead /></TableRow></TableHeader>
                    <TableBody>
                      {(rows.data ?? []).map((r) => (
                        <TableRow key={r.object_id}>
                          <TableCell className="text-xs">{r.object_type === 'DATA_ELEMENT' ? 'Data element' : 'DQ rule'}</TableCell>
                          <TableCell className="font-mono text-xs">{r.object_id}</TableCell>
                          <TableCell className="text-sm">{r.name}</TableCell>
                          <TableCell className="text-xs">{String(r.exists_in_registry) === 'true' ? 'yes (update)' : 'new'}</TableCell>
                          <TableCell><StatusBadge status={r.decision} />{r.reviewer && <span className="text-xs text-muted-foreground ml-1">{r.reviewer}</span>}</TableCell>
                          <TableCell className="text-right space-x-1">
                            {persona.role === 'GROUP_DG' && r.decision === 'PENDING' && (
                              <>
                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => decideBatch('APPROVED', [r.object_id])}>Approve</Button>
                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => decideBatch('REJECTED', [r.object_id])}>Reject</Button>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </QueryState>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
