import { useState } from 'react';
import { Card, CardContent, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { asText, useApp, useDebounced } from '../lib/app-context';
import { PageHeader, QueryState, UcNote } from '../components/common';
import { TextField } from '../components/forms';

export function AuditPage() {
  const { v, schema } = useApp();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const a = useAnalyticsQuery('audit', { v: sql.int(v), q: sql.string(dq) });
  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader title="Audit trail" subtitle="Every create, edit, delete, approval, upload, UC sync and DQ run made through the app, with before/after images." />
      <UcNote>the app writes <code>{schema}.audit_log</code> as a Delta table (time travel gives full history). Platform-level access is also captured in <code>system.access.audit</code> for SIEM export.</UcNote>
      <div className="max-w-sm"><TextField label="Search" value={q} onChange={setQ} placeholder="ID, user, action" /></div>
      <Card>
        <CardContent className="pt-4">
          <QueryState loading={a.loading} error={a.error} empty={!a.data?.length} rows={10}>
            <Table>
              <TableHeader><TableRow><TableHead>When (UTC)</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Object</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
              <TableBody>
                {(a.data ?? []).map((r, i) => (
                  <TableRow key={`${r.ts}-${i}`}>
                    <TableCell className="text-xs whitespace-nowrap">{r.ts?.slice(0, 19)}</TableCell>
                    <TableCell className="text-xs">{r.actor}<div className="text-muted-foreground">{r.persona}</div></TableCell>
                    <TableCell className="text-xs font-semibold">{r.action}</TableCell>
                    <TableCell className="text-xs font-mono">{r.object_type}<div>{r.object_id}</div></TableCell>
                    <TableCell className="text-[11px] font-mono max-w-xl break-all text-muted-foreground">{asText(r.details).slice(0, 400)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}
