import { useMemo, useState } from 'react';
import { useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useApp } from '../lib/app-context';
import { PageHeader, QueryState, UcNote } from '../components/common';
import { SelectField } from '../components/forms';
import { LineageGraph } from '../components/LineageGraph';

export function LineagePage() {
  const { v, scope } = useApp();
  const gov = useAnalyticsQuery('column_governance', { v: sql.int(v) });
  const rows = useMemo(
    () => (gov.data ?? []).filter((r) => !scope || r.tenant_code === scope).sort((a, b) => a.de_id.localeCompare(b.de_id) || a.tenant_code.localeCompare(b.tenant_code)),
    [gov.data, scope],
  );
  const [sel, setSel] = useState<string>('');
  const current = rows.find((r) => `${r.table_fqn}.${r.column_name}` === sel) ?? rows.find((r) => r.de_id === 'GO_00003' && r.tenant_code === (scope || 'MY')) ?? rows[0];

  return (
    <div className="space-y-4">
      <PageHeader title="Physical lineage" subtitle="Pick a data element and BU to see where its physical column comes from and who consumes it: Unity Catalog lineage with the governance mapping and latest DQ results on top." />
      <UcNote>no lineage is drawn by hand. UC captures it from every query, pipeline and job on the platform; external systems (AS400, Sybase, ETL tools) can be added via the UC external lineage API.</UcNote>
      <QueryState loading={gov.loading} error={gov.error} empty={!rows.length} rows={2}>
        <div className="max-w-xl">
          <SelectField
            label="Data element · BU · physical column"
            value={current ? `${current.table_fqn}.${current.column_name}` : ''}
            onChange={setSel}
            options={rows.map((r) => ({ value: `${r.table_fqn}.${r.column_name}`, label: `${r.de_id} ${r.de_name} · ${r.tenant_code} · ${r.table_fqn.split('.').pop()}.${r.column_name}` }))}
          />
        </div>
        {current && <LineageGraph key={`${current.table_fqn}.${current.column_name}`} table={current.table_fqn} column={current.column_name} height={680} />}
      </QueryState>
    </div>
  );
}
