-- @param v INT
-- @param scope STRING
-- @param period STRING
-- @param dimension STRING
-- @param status STRING
-- @param tenant STRING
SELECT r.run_id, r.period, CAST(r.run_ts AS STRING) AS run_ts, r.rule_id, r.effective_rule_id, q.name AS rule_name, r.de_id, d.name AS element_name,
       r.tenant_code, r.table_fqn, r.column_name, r.dq_dimension, r.total_rows, r.passed_rows, r.failed_rows, r.pass_pct, r.threshold_pct, r.result_status
FROM nicholas_aws_ws_catalog.d360_governance.dq_results r LEFT JOIN nicholas_aws_ws_catalog.d360_governance.dq_rules q ON q.rule_id = r.effective_rule_id LEFT JOIN nicholas_aws_ws_catalog.d360_governance.data_elements d ON d.de_id = r.de_id
WHERE :v >= 0 AND (run_id, tenant_code) IN (SELECT max_by(run_id, run_ts), tenant_code FROM nicholas_aws_ws_catalog.d360_governance.dq_results GROUP BY period, tenant_code)
  AND r.period = CASE WHEN :period = '' THEN (SELECT max(period) FROM nicholas_aws_ws_catalog.d360_governance.dq_results) ELSE :period END
  AND (:scope = '' OR r.tenant_code = :scope)
  AND (:tenant = '' OR r.tenant_code = :tenant)
  AND (:dimension = '' OR r.dq_dimension = :dimension)
  AND (:status = '' OR r.result_status = :status)
ORDER BY r.result_status, r.pass_pct - r.threshold_pct
