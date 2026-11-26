import { useMemo, useState } from 'react';
import {
  BarChart, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { Download } from 'lucide-react';
import { DATA_TENANTS, int, useApp } from '../lib/app-context';
import { PageHeader, PassPct, QueryState, StatusBadge, TenantBadge } from '../components/common';
import { DIMENSIONS, SelectField } from '../components/forms';
import { RunDqButton } from '../components/RunDq';

export function ResultsPage() {
  const { v, scope } = useApp();
  const [f, setF] = useState({ period: '', dimension: '', status: '', tenant: '' });
  const facets = useAnalyticsQuery('facets', { v: sql.int(v) });
  const runs = useAnalyticsQuery('runs', { v: sql.int(v) });
  const res = useAnalyticsQuery('results', {
    v: sql.int(v), scope: sql.string(scope), period: sql.string(f.period), dimension: sql.string(f.dimension), status: sql.string(f.status), tenant: sql.string(f.tenant),
  });
  const periods = useMemo(() => (facets.data ?? []).filter((x) => x.facet === 'period').map((x) => x.value).sort().reverse(), [facets.data]);
  const byTenant = useMemo(() => {
    const m = new Map<string, { tenant: string; passed: number; failed: number }>();
    for (const r of res.data ?? []) {
      const o = m.get(r.tenant_code) ?? { tenant: r.tenant_code, passed: 0, failed: 0 };
      o.passed += Number(r.passed_rows);
      o.failed += Number(r.failed_rows);
      m.set(r.tenant_code, o);
    }
    return [...m.values()];
  }, [res.data]);
  const lastRun = runs.data?.[0];

  const exportCsv = () => {
    const rows = res.data ?? [];
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const esc = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `dq_results_${f.period || 'latest'}.csv`;
    a.click();
  };

  return (
    <div className="max-w-7xl space-y-5">
      <PageHeader
        title="Rule results"
        subtitle={<>One row per rule × tenant × physical column: total rows, passed, failed and pass % against the rule threshold. Last run: {lastRun ? <><b>{lastRun.run_id}</b> ({lastRun.run_ts}, {lastRun.checks_executed} checks in {Number(lastRun.duration_s).toFixed(0)}s, by {lastRun.triggered_by})</> : '…'}</>}
        actions={<><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button><RunDqButton /></>}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SelectField label="Period" value={f.period} onChange={(x) => setF({ ...f, period: x })} options={periods} allowAll="Latest" />
        <SelectField label="Tenant" value={f.tenant} onChange={(x) => setF({ ...f, tenant: x })} options={DATA_TENANTS} allowAll="All tenants" />
        <SelectField label="Dimension" value={f.dimension} onChange={(x) => setF({ ...f, dimension: x })} options={DIMENSIONS} allowAll="All dimensions" />
        <SelectField label="Result" value={f.status} onChange={(x) => setF({ ...f, status: x })} options={['PASS', 'FAIL']} allowAll="Pass and fail" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Failed rows by tenant</CardTitle>
          <CardDescription>Sum of failed rows across the filtered checks (a row can fail several rules)</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState loading={res.loading} error={res.error} empty={!byTenant.length}>
            <BarChart data={byTenant} xKey="tenant" yKey={['failed']} height={200} colorPalette="categorical" />
          </QueryState>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <QueryState loading={res.loading} error={res.error} empty={!res.data?.length} rows={10}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule executed</TableHead><TableHead>Element</TableHead><TableHead>Tenant</TableHead><TableHead>Column</TableHead><TableHead>Dimension</TableHead>
                  <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Passed</TableHead><TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Pass / thr.</TableHead><TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(res.data ?? []).map((r) => (
                  <TableRow key={`${r.run_id}-${r.effective_rule_id}-${r.tenant_code}-${r.column_name}`}>
                    <TableCell>
                      <div className="font-mono text-xs">{r.effective_rule_id}</div>
                      {r.effective_rule_id !== r.rule_id && <div className="text-[11px] text-muted-foreground">BU override of {r.rule_id}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{r.element_name}</TableCell>
                    <TableCell><TenantBadge code={r.tenant_code} /></TableCell>
                    <TableCell className="font-mono text-xs">{r.table_fqn.split('.').pop()}.{r.column_name}</TableCell>
                    <TableCell>{r.dq_dimension}</TableCell>
                    <TableCell className="text-right tabular-nums">{int(r.total_rows)}</TableCell>
                    <TableCell className="text-right tabular-nums">{int(r.passed_rows)}</TableCell>
                    <TableCell className="text-right tabular-nums">{int(r.failed_rows)}</TableCell>
                    <TableCell className="text-right"><PassPct value={r.pass_pct} threshold={r.threshold_pct} /></TableCell>
                    <TableCell><StatusBadge status={r.result_status} /></TableCell>
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
