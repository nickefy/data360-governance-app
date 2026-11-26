-- @param v INT
-- @param rule_id STRING
-- @param scope STRING
SELECT period, tenant_code, effective_rule_id, total_rows, failed_rows, pass_pct, threshold_pct, result_status, check_sql, run_id
FROM nicholas_aws_ws_catalog.d360_governance.dq_results WHERE :v >= 0 AND (run_id, tenant_code) IN (SELECT max_by(run_id, run_ts), tenant_code FROM nicholas_aws_ws_catalog.d360_governance.dq_results GROUP BY period, tenant_code) AND (effective_rule_id = :rule_id OR rule_id = :rule_id) AND (:scope = '' OR tenant_code = :scope)
ORDER BY period DESC, tenant_code
