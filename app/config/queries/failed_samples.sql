-- @param v INT
-- @param run_id STRING
-- @param rule_id STRING
-- @param tenant STRING
SELECT row_key, failed_value, table_fqn, column_name FROM nicholas_aws_ws_catalog.d360_governance.dq_failed_samples
WHERE :v >= 0 AND run_id = :run_id AND effective_rule_id = :rule_id AND tenant_code = :tenant LIMIT 20
