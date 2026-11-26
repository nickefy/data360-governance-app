-- @param v INT
-- @param de_id STRING
-- @param scope STRING
SELECT r.effective_rule_id, r.rule_id, r.tenant_code, r.dq_dimension, r.column_name, r.total_rows, r.passed_rows, r.failed_rows, r.pass_pct, r.threshold_pct, r.result_status
FROM nicholas_aws_ws_catalog.d360_governance.dq_results r
WHERE :v >= 0 AND (run_id, tenant_code) IN (SELECT max_by(run_id, run_ts), tenant_code FROM nicholas_aws_ws_catalog.d360_governance.dq_results GROUP BY period, tenant_code) AND r.de_id = :de_id AND r.period = (SELECT max(period) FROM nicholas_aws_ws_catalog.d360_governance.dq_results) AND (:scope = '' OR r.tenant_code = :scope)
ORDER BY r.tenant_code, r.rule_id
