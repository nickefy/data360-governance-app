-- @param v INT
SELECT run_id, period, CAST(run_ts AS STRING) AS run_ts, triggered_by, status, checks_executed, duration_s, notes
FROM nicholas_aws_ws_catalog.d360_governance.dq_runs WHERE :v >= 0 ORDER BY run_ts DESC LIMIT 20
