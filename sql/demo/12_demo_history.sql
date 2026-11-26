-- Simulated history: derive 2026-08 and 2026-09 monthly runs from the real 2026-10 run so the trend charts have shape.
-- Rows are flagged in dq_runs.notes as SIMULATED. Re-runnable.
DELETE FROM ${catalog}.${prefix}_governance.dq_results WHERE period IN ('2026-08','2026-09');
DELETE FROM ${catalog}.${prefix}_governance.dq_runs WHERE period IN ('2026-08','2026-09');

INSERT INTO ${catalog}.${prefix}_governance.dq_runs
SELECT concat('RUN-', p, '-hist'), p, ts, 'schedule', 'SUCCEEDED', (SELECT count(*) FROM ${catalog}.${prefix}_governance.dq_results WHERE period = '2026-10'), dur, 'SIMULATED history for demo'
FROM VALUES ('2026-08', TIMESTAMP'2026-09-01 02:14:00', 41.2D), ('2026-09', TIMESTAMP'2026-10-01 02:11:00', 38.7D) AS t(p, ts, dur);

INSERT INTO ${catalog}.${prefix}_governance.dq_results
SELECT concat('RUN-', h.p, '-hist'), h.p, h.ts, r.rule_id, r.effective_rule_id, r.de_id, r.tenant_code, r.table_fqn, r.column_name, r.dq_dimension,
       CAST(round(r.total_rows * h.vol) AS BIGINT) AS total_rows,
       CAST(round(r.total_rows * h.vol * least(100.0, greatest(0.0, r.pass_pct - h.k * (pmod(xxhash64(r.effective_rule_id, r.tenant_code), 100) / 100.0) * least(4.0, 100 - r.pass_pct + 0.6))) / 100.0) AS BIGINT) AS passed_rows,
       NULL, NULL, r.threshold_pct, NULL, r.check_sql
FROM ${catalog}.${prefix}_governance.dq_results r
CROSS JOIN VALUES ('2026-08', TIMESTAMP'2026-09-01 02:14:00', 1.6D, 0.97D), ('2026-09', TIMESTAMP'2026-10-01 02:11:00', 0.8D, 0.985D) AS h(p, ts, k, vol)
WHERE r.period = '2026-10' AND r.run_id = (SELECT max_by(run_id, run_ts) FROM ${catalog}.${prefix}_governance.dq_runs WHERE period = '2026-10');

UPDATE ${catalog}.${prefix}_governance.dq_results
SET failed_rows = total_rows - passed_rows,
    pass_pct = round(100.0 * passed_rows / total_rows, 3),
    result_status = CASE WHEN 100.0 * passed_rows / total_rows >= threshold_pct THEN 'PASS' ELSE 'FAIL' END
WHERE period IN ('2026-08','2026-09');
