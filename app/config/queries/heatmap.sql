-- @param v INT
-- @param scope STRING
-- @param period STRING
SELECT r.tenant_code, t.tenant_name, r.dq_dimension,
       round(100.0 * sum(r.passed_rows) / sum(r.total_rows), 2) AS pass_pct,
       count(*) AS checks, count_if(r.result_status = 'FAIL') AS failing
FROM nicholas_aws_ws_catalog.d360_governance.dq_results r JOIN nicholas_aws_ws_catalog.d360_governance.tenants t USING (tenant_code)
WHERE :v >= 0 AND (run_id, tenant_code) IN (SELECT max_by(run_id, run_ts), tenant_code FROM nicholas_aws_ws_catalog.d360_governance.dq_results GROUP BY period, tenant_code)
  AND r.period = CASE WHEN :period = '' THEN (SELECT max(period) FROM nicholas_aws_ws_catalog.d360_governance.dq_results) ELSE :period END
  AND (:scope = '' OR r.tenant_code = :scope)
GROUP BY ALL ORDER BY r.tenant_code, r.dq_dimension
