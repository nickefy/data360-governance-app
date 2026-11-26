-- @param v INT
-- @param scope STRING
SELECT period, tenant_code, round(100.0 * sum(passed_rows) / sum(total_rows), 2) AS pass_pct, count_if(result_status = 'FAIL') AS failing
FROM nicholas_aws_ws_catalog.d360_governance.dq_results
WHERE :v >= 0 AND (run_id, tenant_code) IN (SELECT max_by(run_id, run_ts), tenant_code FROM nicholas_aws_ws_catalog.d360_governance.dq_results GROUP BY period, tenant_code) AND (:scope = '' OR tenant_code = :scope)
GROUP BY ALL ORDER BY period, tenant_code
