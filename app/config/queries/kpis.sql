-- @param v INT
-- @param scope STRING
WITH de AS (SELECT * FROM nicholas_aws_ws_catalog.d360_governance.data_elements WHERE (:scope = '' OR defined_by = :scope OR defined_by IN (SELECT tenant_code FROM nicholas_aws_ws_catalog.d360_governance.tenants WHERE tenant_type = 'GROUP_FUNCTION'))),
ru AS (SELECT * FROM nicholas_aws_ws_catalog.d360_governance.dq_rules WHERE (:scope = '' OR defined_by = :scope OR defined_by IN (SELECT tenant_code FROM nicholas_aws_ws_catalog.d360_governance.tenants WHERE tenant_type = 'GROUP_FUNCTION'))),
lp AS (SELECT max(period) AS p FROM nicholas_aws_ws_catalog.d360_governance.dq_results),
res AS (SELECT * FROM nicholas_aws_ws_catalog.d360_governance.dq_results WHERE period = (SELECT p FROM lp) AND (:scope = '' OR tenant_code = :scope)
        AND (run_id, tenant_code) IN (SELECT max_by(run_id, run_ts), tenant_code FROM nicholas_aws_ws_catalog.d360_governance.dq_results GROUP BY period, tenant_code))
SELECT (SELECT count(*) FROM de) AS elements,
       (SELECT count_if(cde_flag) FROM de) AS cdes,
       (SELECT count(*) FROM ru) AS rules,
       (SELECT count_if(status = 'Approved') FROM ru) AS approved_rules,
       (SELECT count_if(status = 'Pending Approval') FROM de) + (SELECT count_if(status = 'Pending Approval') FROM ru) AS pending,
       (SELECT p FROM lp) AS latest_period,
       (SELECT round(100.0 * sum(passed_rows) / sum(total_rows), 2) FROM res) AS pass_pct,
       (SELECT count(*) FROM res) AS checks,
       (SELECT count_if(result_status = 'FAIL') FROM res) AS failing_checks,
       (SELECT sum(failed_rows) FROM res) AS failed_rows
WHERE :v >= 0
