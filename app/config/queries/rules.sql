-- @param v INT
-- @param scope STRING
-- @param q STRING
-- @param dimension STRING
-- @param status STRING
-- @param owner STRING
WITH lr AS (SELECT effective_rule_id AS rule_id, round(100.0 * sum(passed_rows) / sum(total_rows), 2) AS pass_pct, count_if(result_status = 'FAIL') AS failing, count(*) AS checks
            FROM nicholas_aws_ws_catalog.d360_governance.dq_results WHERE (run_id, tenant_code) IN (SELECT max_by(run_id, run_ts), tenant_code FROM nicholas_aws_ws_catalog.d360_governance.dq_results GROUP BY period, tenant_code) AND period = (SELECT max(period) FROM nicholas_aws_ws_catalog.d360_governance.dq_results) GROUP BY 1)
SELECT q.rule_id, q.name, q.status, q.dq_dimension, q.description, q.rule_type, q.rule_params, q.applicable_to, q.defined_by, t.tenant_name AS defined_by_name,
       q.parent_rule_id, q.threshold_pct, q.version, q.updated_by, CAST(q.updated_at AS STRING) AS updated_at, lr.pass_pct, coalesce(lr.failing, 0) AS failing, coalesce(lr.checks, 0) AS checks
FROM nicholas_aws_ws_catalog.d360_governance.dq_rules q LEFT JOIN nicholas_aws_ws_catalog.d360_governance.tenants t ON t.tenant_code = q.defined_by LEFT JOIN lr USING (rule_id)
WHERE :v >= 0 AND (:scope = '' OR defined_by = :scope OR defined_by IN (SELECT tenant_code FROM nicholas_aws_ws_catalog.d360_governance.tenants WHERE tenant_type = 'GROUP_FUNCTION'))
  AND (:q = '' OR lower(concat_ws(' ', q.rule_id, q.name, q.description, q.applicable_to)) LIKE lower(concat('%', :q, '%')))
  AND (:dimension = '' OR q.dq_dimension = :dimension)
  AND (:status = '' OR q.status = :status)
  AND (:owner = '' OR q.defined_by = :owner)
ORDER BY q.rule_id
