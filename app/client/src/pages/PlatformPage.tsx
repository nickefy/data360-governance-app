import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@databricks/appkit-ui/react';
import { ArrowRight } from 'lucide-react';
import { useApp } from '../lib/app-context';
import { PageHeader } from '../components/common';

const MAP = [
  ['Business data dictionary / CDE register', 'Delta table data_elements in the governance registry schema (Unity Catalog), edited through this Databricks App', 'Data Elements'],
  ['CDE → physical attribute mapping', 'cde_mapping table + UC column comments and tags (d360_de_id, d360_cde, d360_domain…) written by "Sync to Unity Catalog"', 'Element › Physical mapping'],
  ['Lineage: which table a CDE originates from', 'UC column-level lineage, captured automatically from the pipelines that build each BU DQ mart', 'Element › Lineage'],
  ['DQ rule library across dimensions', 'dq_rules: structured definition (type + JSON params), thresholds, BU overrides via parent_rule_id', 'DQ Rules'],
  ['DQ execution, monthly + on demand', 'Serverless Lakeflow Job data360-dq-engine compiles approved rules to SQL per mapped column (monthly schedule + "Run now")', 'Overview / Results'],
  ['Rule results: total, pass, fail, %', 'dq_results + dq_failed_samples (Delta); export to CSV / Tableau / Power BI via SQL warehouse', 'Rule Results'],
  ['Group defines → BU adopts / customises → Group approves', 'Status workflow + approval queue; BU customisation runs only once Approved', 'Approvals'],
  ['BU standard-format submissions', 'BU intake tables in each BU workspace → Delta Share → Group workspace → review and MERGE', 'Bulk Upload / BU Intake'],
  ['Group DG edits all; BUs edit their own', 'App RBAC from user_roles (persona switcher in demo). Production: on-behalf-of-user auth + UC groups + row filters on the registry', 'Persona switcher'],
  ['Reference data', 'reference_data: Group code sets + BU extensions, used by in_reference rules', 'Reference Data'],
  ['Audit', 'audit_log Delta table (before/after) + UC system.access.audit', 'Audit Trail'],
];

function Box({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border p-3 min-w-[190px] bg-card">
      <div className="text-sm font-semibold mb-1">{title}</div>
      {lines.map((l) => <div key={l} className="text-xs text-muted-foreground">{l}</div>)}
    </div>
  );
}

export function PlatformPage() {
  const { catalog, schema } = useApp();
  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="How it runs on Databricks" subtitle="The Data360 Govern + Analyze capabilities in this demo, and the Unity Catalog / Databricks feature behind each one." />
      <Card>
        <CardHeader><CardTitle className="text-base">Federated flow (BU → Group)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Box title="1 · BU workspace" lines={['Fills the standard template', 'intake_data_elements / intake_dq_rules', 'BU DQ mart (src → curated → mart)']} />
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <Box title="2 · Delta Sharing" lines={['Share per BU → Group', 'read-only, no copies', 'intake + DQ marts']} />
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <Box title="3 · Group governance workspace" lines={['Review + approve in this app', 'MERGE into the registry', 'UC tags, comments, lineage']} />
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <Box title="4 · DQ engine (serverless job)" lines={['Monthly + on demand', 'Group rules + approved BU overrides', 'writes dq_results']} />
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <Box title="5 · Consume" lines={['This app · AI/BI · Genie', 'Tableau / Power BI over SQL', 'CSV export']} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Registry: <code>{catalog || '…'}.{schema || '…'}</code>. Each BU's intake tables are either Group-hosted (filled through Bulk upload) or arrive read-only from the BU workspace over Delta Sharing; the app reads them in place through <code>v_intake</code>. In the demo the simulated BU schemas stand in for BU workspaces.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Capability mapping</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Requirement</TableHead><TableHead>Databricks / Unity Catalog</TableHead><TableHead>Where in the demo</TableHead></TableRow></TableHeader>
            <TableBody>
              {MAP.map(([a, b, c]) => (
                <TableRow key={a}><TableCell className="font-medium text-sm">{a}</TableCell><TableCell className="text-sm">{b}</TableCell><TableCell className="text-xs text-muted-foreground">{c}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Not in this MVP (roadmap for an implementation)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div>• Multi-step approval chains with SLAs and escalation (e.g. Investment Director defines → CIO approves)</div>
          <div>• DQ issue management (assign, remediate, close) on top of failed samples</div>
          <div>• Metadata and lineage harvesting for non-Databricks sources (AS400, Sybase, ETL tools)</div>
          <div>• AI-assisted rule drafting from the business description (Foundation Model API via AI Gateway, human approval)</div>
          <div>• Real cross-workspace Delta Sharing, and OBO auth with UC row filters instead of the persona switcher</div>
        </CardContent>
      </Card>
    </div>
  );
}
