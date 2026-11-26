import { useState } from 'react';
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsList, TabsTrigger,
} from '@databricks/appkit-ui/react';
import { Download, Send, ShieldCheck, Upload } from 'lucide-react';
import { useApp, GROUP_FUNCTIONS } from '../lib/app-context';
import { PageHeader, UcNote } from '../components/common';

type ObjType = 'DATA_ELEMENT' | 'DQ_RULE';
const TEMPLATES: Record<ObjType, { cols: string[]; example: (t: string) => string[][] }> = {
  DATA_ELEMENT: {
    cols: ['DE ID', 'Name', 'Description', 'Status', 'CDE Flag', 'Subject Area', 'Data Domain', 'Data Sub-domain (L2)', 'Defined by', 'DE Type', 'Parent DE ID', 'physical_table', 'physical_column'],
    example: (t) => [
      [`${t}_00010`, 'Customer Email Address', 'The primary e-mail address of the customer used for e-policy delivery.', 'Pending Approval', 'FALSE', 'Customer and Operations', 'Customer', 'Contact', t, 'Atomic', '', '', ''],
      [`${t}_00011`, 'Customer Mobile Number', 'The primary mobile number of the customer in E.164 format.', 'Pending Approval', 'TRUE', 'Customer and Operations', 'Customer', 'Contact', t, 'Atomic', '', '', ''],
    ],
  },
  DQ_RULE: {
    cols: ['Rule ID', 'Name', 'Status', 'DQ Dimension', 'Description', 'Defined By', 'Applicable To', 'Parent Rule ID', 'Rule Type', 'Rule Params', 'Threshold'],
    example: (t) => [
      [`${t}_DQ_00010`, 'Customer-Individual-Nationality-Completeness (local)', 'Pending Approval', 'Completeness', 'Cannot be empty or null, or contain only spaces', t, 'GO_00003', '', 'not_null_or_blank', '{}', '99'],
      [`${t}_DQ_00011`, 'Customer-Individual-Gender-Validity (local)', 'Pending Approval', 'Validity', 'Can only be M or F for individual customers', t, 'GO_00006', '', 'regex', '{"pattern":"^[MF]$"}', '97'],
    ],
  },
};

function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((c) => c.trim() !== '')) out.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== '')) out.push(row);
  return out;
}
const toCsv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');

interface Report { row: number; id: string; ok: boolean; errors: string[] }

export function BulkUploadPage() {
  const { api, persona, setFlash, refresh, tenants } = useApp();
  const [type, setType] = useState<ObjType>('DATA_ELEMENT');
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<{ valid: boolean; report: Report[]; would_create?: number; would_update?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const tenant = persona.role === 'STEWARD' ? persona.tenant ?? '' : 'GO';
  const buInfo = tenants.find((t) => t.code === persona.tenant);
  const toBU = persona.role === 'STEWARD' && !GROUP_FUNCTIONS.includes(persona.tenant ?? '');

  const reset = (t: ObjType) => {
    setType(t);
    setGrid(null);
    setReport(null);
    setFileName('');
  };
  const download = () => {
    const t = TEMPLATES[type];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv([t.cols, ...t.example(tenant)])], { type: 'text/csv' }));
    a.download = `data360_${type === 'DATA_ELEMENT' ? 'data_elements' : 'dq_rules'}_template_v1.csv`;
    a.click();
  };
  const loadExample = () => {
    const t = TEMPLATES[type];
    setGrid([t.cols, ...t.example(tenant)]);
    setFileName('example (template v1)');
    setReport(null);
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setGrid(parseCsv(await file.text()));
    setFileName(file.name);
    setReport(null);
  };
  const objects = () => {
    if (!grid || grid.length < 2) return [];
    const [h, ...rest] = grid;
    return rest.map((r) => Object.fromEntries(h.map((col, i) => [col, r[i] ?? ''])));
  };
  const send = async (dry_run: boolean) => {
    setBusy(true);
    try {
      const r = await api<{ valid?: boolean; report?: Report[]; would_create?: number; would_update?: number; dry_run: boolean; batch_id?: string; submitted_to?: string; rows?: number; routed?: string }>(
        '/api/d360/bulk', 'POST', { object_type: type, rows: objects(), dry_run });
      if (r.dry_run) setReport({ valid: !!r.valid, report: r.report ?? [], would_create: r.would_create, would_update: r.would_update });
      else {
        setFlash({
          kind: 'success',
          text: r.routed === 'intake'
            ? `Batch ${r.batch_id}: ${r.rows} row(s) written to ${r.submitted_to}. Group Data Governance will see it under Approvals & BU Intake.`
            : `Batch ${r.batch_id}: ${r.rows} row(s) loaded straight into the Group registry.`,
        });
        setGrid(null);
        setReport(null);
        refresh();
      }
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl space-y-5">
      <PageHeader
        title="Bulk upload"
        subtitle="BUs and Group operations teams fill the standard template (one per object type) and upload it here. Each row is validated (schema, mandatory fields, ID prefix, known elements, executable rule definition, ownership) before anything is written."
      />
      <UcNote>
        {toBU
          ? buInfo?.intake_mode === 'DELTA_SHARE'
            ? `${persona.tenant} submits from its own workspace: load the template into ${buInfo.intake_schema}.intake_* there. The share brings it to Group for approval; uploads here are disabled.`
            : `as ${persona.label}, a submission lands in your BU intake table (${buInfo?.intake_schema ?? 'not onboarded yet'}.intake_*) and goes to Group Data Governance for approval.`
          : 'Group uploads write straight into the registry tables (MERGE on ID). Every row is audited.'}
      </UcNote>
      {persona.role === 'VIEWER' ? (
        <p className="text-sm text-muted-foreground">Read-only viewers cannot upload. Switch persona to try it.</p>
      ) : (
        <>
          <Tabs value={type} onValueChange={(x) => reset(x === 'DQ_RULE' ? 'DQ_RULE' : 'DATA_ELEMENT')}>
            <TabsList>
              <TabsTrigger value="DATA_ELEMENT">Data elements</TabsTrigger>
              <TabsTrigger value="DQ_RULE">DQ rules</TabsTrigger>
            </TabsList>
          </Tabs>
          <Card>
            <CardHeader>
              <CardTitle>1 · Get the standard template</CardTitle>
              <CardDescription>Columns: {TEMPLATES[type].cols.join(' · ')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={download}><Download className="h-4 w-4" /> Download CSV template</Button>
              <Button variant="ghost" onClick={loadExample}>Use the example rows</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>2 · Upload the filled template</CardTitle>
              <CardDescription>CSV or tab-separated (paste from Excel and save as CSV). Max 500 rows per file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <Input type="file" accept=".csv,.tsv,.txt" onChange={(e) => onFile(e.target.files?.[0])} className="max-w-sm" />
                {fileName && <Badge variant="secondary">{fileName}</Badge>}
              </div>
              {grid && grid.length > 1 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>#</TableHead>{grid[0].map((h) => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}<TableHead>Validation</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {grid.slice(1).map((r, i) => {
                        const rep = report?.report.find((x) => x.row === i + 1);
                        return (
                          <TableRow key={i}>
                            <TableCell>{i + 1}</TableCell>
                            {r.map((c, j) => <TableCell key={j} className="text-xs max-w-[200px] truncate" title={c}>{c}</TableCell>)}
                            <TableCell className="text-xs min-w-[220px]">
                              {!rep ? <span className="text-muted-foreground">not validated</span> : rep.ok ? <span className="text-success">✓ ok</span> : <span className="text-destructive">{rep.errors.join('; ')}</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>3 · Validate, then submit</CardTitle>
              <CardDescription>
                {report ? (report.valid ? `All rows valid: ${report.would_create ?? 0} new, ${report.would_update ?? 0} updates.` : 'Fix the rows marked in red and re-upload.') : 'Validation is a dry run; nothing is written.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button variant="outline" disabled={!grid || busy} onClick={() => send(true)}><ShieldCheck className="h-4 w-4" /> Validate</Button>
              <Button disabled={!report?.valid || busy} onClick={() => send(false)}><Send className="h-4 w-4" /> {toBU ? 'Submit to Group for approval' : 'Load into registry'}</Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
