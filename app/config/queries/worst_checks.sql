-- @param v INT
-- @param scope STRING
SELECT r.effective_rule_id, q.name AS rule_name, r.de_id, d.name AS element_name, r.tenant_code, r.dq_dimension,
       r.pass_pct, r.threshold_pct, round(r.pass_pct - r.threshold_pct, 2) AS gap, r.failed_rows, r.total_rows
FROM nicholas_aws_ws_catalog.d360_governance.dq_results r
LEFT JOIN nicholas_aws_ws_catalog.d360_governance.dq_rules q ON q.rule_id = r.effective_rule_id
LEFT JOIN nicholas_aws_ws_catalog.d360_governance.data_elements d ON d.de_id = r.de_id
WHERE :v >= 0 AND (run_id, tenant_code) IN (SELECT max_by(run_id, run_ts), tenant_code FROM nicholas_aws_ws_catalog.d360_governance.dq_results GROUP BY period, tenant_code) AND r.period = (SELECT max(period) FROM nicholas_aws_ws_catalog.d360_governance.dq_results)
  AND (:scope = '' OR r.tenant_code = :scope) AND r.result_status = 'FAIL'
ORDER BY gap LIMIT 10
