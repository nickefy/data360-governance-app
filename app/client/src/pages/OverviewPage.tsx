import { useMemo } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, HeatmapChart, LineChart,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { int, pct, useApp, num } from '../lib/app-context';
import { PageHeader, PassPct, QueryState, TenantBadge } from '../components/common';
import { RunDqButton } from '../components/RunDq';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{sub}</CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const { v, scope, schema } = useApp();
  const p = { v: sql.int(v), scope: sql.string(scope) };
  const kpis = useAnalyticsQuery('kpis', p);
  const heat = useAnalyticsQuery('heatmap', { ...p, period: sql.string('') });
  const trend = useAnalyticsQuery('trend', p);
  const worst = useAnalyticsQuery('worst_checks', p);
  const k = kpis.data?.[0];

  const trendWide = useMemo(() => {
    const rows = trend.data ?? [];
    const tenants = [...new Set(rows.map((r) => r.tenant_code))].sort();
    const byP = new Map<string, Record<string, string | number>>();
    for (const r of rows) {
      const label = `${MONTHS[Number(r.period.slice(5, 7)) - 1] ?? r.period} run`;
      const o = byP.get(r.period) ?? { assessment: label };
      o[r.tenant_code] = Number(r.pass_pct);
      byP.set(r.period, o);
    }
    return { tenants, data: [...byP.values()] };
  }, [trend.data]);

  const heatData = useMemo(() => (heat.data ?? []).map((r) => ({ ...r, pass_pct: Number(r.pass_pct) })), [heat.data]);

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="Group data quality overview"
        subtitle={
          <>Latest monthly assessment {k?.latest_period ? <b>{k.latest_period}</b> : ''} across Group functions and BUs. Source: <code>{schema}.dq_results</code>, written by the serverless DQ job from the approved rule library.</>
        }
        actions={<RunDqButton />}
      />
      <QueryState loading={kpis.loading} error={kpis.error} rows={2}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Data elements (CDEs)" value={`${int(k?.elements)} (${int(k?.cdes)})`} sub="In the central business data dictionary visible to you" />
          <Kpi label="DQ rules (approved)" value={`${int(k?.rules)} (${int(k?.approved_rules)})`} sub={`${int(k?.pending)} element/rule changes awaiting approval`} />
          <Kpi label={`Row pass rate · ${k?.latest_period ?? ''}`} value={pct(k?.pass_pct)} sub={`${int(k?.failed_rows)} failing rows across ${int(k?.checks)} checks`} />
          <Kpi label="Checks below threshold" value={int(k?.failing_checks)} sub="Rule × BU × column checks under their pass-% threshold" />
        </div>
      </QueryState>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Where quality breaks down: tenant × dimension</CardTitle>
            <CardDescription>Row pass % by tenant × DQ dimension, latest period (scale 90–100%)</CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState loading={heat.loading} error={heat.error} empty={!heatData.length}>
              <HeatmapChart data={heatData} xKey="dq_dimension" yAxisKey="tenant_code" yKey="pass_pct" min={90} max={100} showLabels height={300} options={{ grid: { left: 40, right: 70, bottom: 40 } }} colorPalette="sequential" />
            </QueryState>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pass rate is improving month on month</CardTitle>
            <CardDescription>Row pass % by tenant per monthly run (Aug–Sep simulated history)</CardDescription>
          </CardHeader>
          <CardContent>
            <QueryState loading={trend.loading} error={trend.error} empty={!trendWide.data.length}>
              <LineChart data={trendWide.data} xKey="assessment" yKey={trendWide.tenants} height={280} colorPalette="categorical" showSymbol options={{ yAxis: { min: 96, max: 100 } }} />
            </QueryState>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Largest threshold breaches</CardTitle>
          <CardDescription>Failing checks in the latest run, worst gap to threshold first</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState loading={worst.loading} error={worst.error} empty={!worst.data?.length} emptyText="All checks are at or above threshold.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Element</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Dimension</TableHead>
                  <TableHead className="text-right">Pass / threshold</TableHead>
                  <TableHead className="text-right">Failed rows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(worst.data ?? []).map((r) => (
                  <TableRow key={`${r.effective_rule_id}-${r.tenant_code}`}>
                    <TableCell>
                      <div className="font-mono text-xs">{r.effective_rule_id}</div>
                      <div className="text-xs text-muted-foreground">{r.rule_name}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.element_name} <span className="text-muted-foreground font-mono text-xs">{r.de_id}</span></TableCell>
                    <TableCell><TenantBadge code={r.tenant_code} /></TableCell>
                    <TableCell>{r.dq_dimension}</TableCell>
                    <TableCell className="text-right"><PassPct value={r.pass_pct} threshold={r.threshold_pct} /></TableCell>
                    <TableCell className="text-right tabular-nums">{int(r.failed_rows)} <span className="text-muted-foreground">/ {int(r.total_rows)}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>
      {num(k?.checks) === 0 && <p className="text-sm text-muted-foreground">No DQ results yet. Run the assessment.</p>}
    </div>
  );
}
