-- @param v INT
-- Governance overlay for the lineage graph: which physical columns are mapped CDEs, and their latest DQ status
WITH lr AS (
  SELECT table_fqn, column_name, round(100.0 * sum(passed_rows) / sum(total_rows), 2) AS pass_pct,
         count_if(result_status = 'FAIL') AS failing, count(*) AS checks
  FROM nicholas_aws_ws_catalog.d360_governance.dq_results
  WHERE (run_id, tenant_code) IN (SELECT max_by(run_id, run_ts), tenant_code FROM nicholas_aws_ws_catalog.d360_governance.dq_results GROUP BY period, tenant_code)
    AND period = (SELECT max(period) FROM nicholas_aws_ws_catalog.d360_governance.dq_results)
  GROUP BY 1, 2)
SELECT m.table_fqn, m.column_name, m.de_id, d.name AS de_name, d.cde_flag, m.tenant_code, lr.pass_pct, coalesce(lr.failing, 0) AS failing, coalesce(lr.checks, 0) AS checks
FROM nicholas_aws_ws_catalog.d360_governance.cde_mapping m
LEFT JOIN nicholas_aws_ws_catalog.d360_governance.data_elements d USING (de_id)
LEFT JOIN lr ON lr.table_fqn = m.table_fqn AND lr.column_name = m.column_name
WHERE :v >= 0
