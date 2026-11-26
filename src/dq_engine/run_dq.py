"""Data360 demo DQ engine (runs as a serverless Lakeflow Job).

Reads the rule library + CDE mapping from Unity Catalog, resolves Group rules vs approved BU overrides,
compiles each rule definition (rule_type + rule_params JSON) to SQL, executes it on each mapped physical column,
and writes dq_runs / dq_results / dq_failed_samples.

Params: --catalog <cat> [--prefix d360] [--period YYYY-MM] [--triggered-by <who>] [--tenant <code>|ALL]
The registry lives in <catalog>.<prefix>_governance. Mapped tables (cde_mapping.table_fqn) can be in any catalog,
including Delta Sharing catalogs mounted from BU workspaces.
"""
import argparse
import datetime as dt
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from pyspark.sql import Row, SparkSession

spark = SparkSession.builder.getOrCreate()


def lit(s: str) -> str:
    return "'" + str(s).replace("\\", "\\\\").replace("'", "\\'") + "'"


_KEYS = {}


def row_key(fqn):
    """Column used to identify failing rows in samples: src_row_id if the mart has one, else its first column."""
    if fqn not in _KEYS:
        cols = spark.table(fqn).columns
        _KEYS[fqn] = "`src_row_id`" if "src_row_id" in cols else f"`{cols[0]}`"
    return _KEYS[fqn]


def compile_check(rule, m, gov):
    """Return (from_sql, pass_expr) for a rule applied to mapping m."""
    c = f"`{m.column_name}`"
    p = json.loads(rule.rule_params or "{}")
    t = rule.rule_type
    src = f"(SELECT * FROM {m.table_fqn}) s"
    if t == "not_null_or_blank":
        return src, f"{c} IS NOT NULL AND trim(CAST({c} AS STRING)) <> ''"
    if t == "regex":
        return src, f"{c} IS NULL OR CAST({c} AS STRING) RLIKE {lit(p['pattern'])}"
    if t == "in_reference":
        excl = p.get("exclude") or []
        excl_sql = f" AND code NOT IN ({', '.join(lit(x) for x in excl)})" if excl else ""
        ref = (f"(SELECT DISTINCT code AS __ref_code FROM {gov}.reference_data WHERE ref_set = {lit(p['ref_set'])} "
               f"AND active AND tenant_code IN ('GROUP', {lit(m.tenant_code)}){excl_sql}) r")
        return f"{src} LEFT JOIN {ref} ON CAST(s.{c} AS STRING) = r.__ref_code", f"{c} IS NULL OR __ref_code IS NOT NULL"
    if t == "unique":
        return (f"(SELECT *, count(*) OVER (PARTITION BY {c}) AS __dup_cnt FROM {m.table_fqn}) s",
                f"{c} IS NULL OR __dup_cnt = 1")
    if t == "range":
        lo = lit(p["min"]) if "min" in p else None
        hi = p.get("max_expr") or (lit(p["max"]) if "max" in p else None)
        conds = [f"{c} >= {lo}" if lo else None, f"{c} <= {hi}" if hi else None]
        return src, f"{c} IS NULL OR (" + " AND ".join(x for x in conds if x) + ")"
    if t == "sql_expr":
        return src, f"coalesce(({p['expr'].replace('{col}', c)}), false)"
    raise ValueError(f"unknown rule_type {t}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--prefix", default="d360")
    ap.add_argument("--period", default="")
    ap.add_argument("--triggered-by", default="schedule")
    ap.add_argument("--tenant", default="ALL")
    a = ap.parse_args()
    gov = f"`{a.catalog}`.`{a.prefix}_governance`"
    today = dt.date.today()
    period = a.period or (today.replace(day=1) - dt.timedelta(days=1)).strftime("%Y-%m")
    run_id = f"RUN-{period}-{uuid.uuid4().hex[:6]}"
    run_ts = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    t0 = time.time()

    rules = spark.sql(f"SELECT * FROM {gov}.dq_rules WHERE status = 'Approved'").collect()
    maps = spark.sql(f"SELECT * FROM {gov}.cde_mapping").collect()
    bus = {r.tenant_code for r in spark.sql(f"SELECT tenant_code FROM {gov}.tenants WHERE tenant_type = 'BU'").collect()}

    overrides = {(r.parent_rule_id, r.defined_by): r for r in rules if r.parent_rule_id}
    checks = []
    for r in (x for x in rules if not x.parent_rule_id):
        for de in [d.strip() for d in (r.applicable_to or "").split(",") if d.strip()]:
            for m in (mm for mm in maps if mm.de_id == de):
                if a.tenant != "ALL" and m.tenant_code != a.tenant:
                    continue
                if r.defined_by in bus and m.tenant_code != r.defined_by:
                    continue  # BU-local rules only run on that BU's data
                eff = overrides.get((r.rule_id, m.tenant_code), r)
                checks.append((r, eff, m))

    def run(check):
        r, eff, m = check
        frm, ok = compile_check(eff, m, gov)
        q = f"SELECT count(*) AS total, count_if({ok}) AS passed FROM {frm}"
        try:
            res = spark.sql(q).collect()[0]
            total, passed = int(res.total), int(res.passed)
            samples = spark.sql(
                f"SELECT CAST({row_key(m.table_fqn)} AS STRING) AS k, CAST(`{m.column_name}` AS STRING) AS v FROM {frm} WHERE NOT ({ok}) LIMIT 20"
            ).collect()
        except Exception as e:  # keep going; record as error
            print(f"ERROR {eff.rule_id} on {m.table_fqn}.{m.column_name}: {e}")
            return None
        pct = round(100.0 * passed / total, 3) if total else 100.0
        thr = float(eff.threshold_pct or 100)
        result = Row(run_id=run_id, period=period, run_ts=run_ts, rule_id=r.rule_id, effective_rule_id=eff.rule_id,
                     de_id=m.de_id, tenant_code=m.tenant_code, table_fqn=m.table_fqn, column_name=m.column_name,
                     dq_dimension=eff.dq_dimension, total_rows=total, passed_rows=passed, failed_rows=total - passed,
                     pass_pct=pct, threshold_pct=thr, result_status="PASS" if pct >= thr else "FAIL", check_sql=q)
        fs = [Row(run_id=run_id, effective_rule_id=eff.rule_id, tenant_code=m.tenant_code, table_fqn=m.table_fqn,
                  column_name=m.column_name, row_key=s.k, failed_value=s.v) for s in samples]
        print(f"{eff.rule_id:14s} {m.tenant_code} {m.column_name:20s} {pct:7.2f}% (thr {thr})")
        return result, fs

    with ThreadPoolExecutor(max_workers=8) as ex:
        out = [o for o in ex.map(run, checks) if o]

    results = [o[0] for o in out]
    samples = [s for o in out for s in o[1]]
    if results:
        spark.createDataFrame(results).write.mode("append").saveAsTable(f"{gov}.dq_results")
    if samples:
        spark.createDataFrame(samples, "run_id string, effective_rule_id string, tenant_code string, table_fqn string, "
                              "column_name string, row_key string, failed_value string").write.mode("append").saveAsTable(f"{gov}.dq_failed_samples")
    status = "SUCCEEDED" if len(results) == len(checks) else "PARTIAL"
    spark.createDataFrame([(run_id, period, run_ts, a.triggered_by, status, len(results), round(time.time() - t0, 1), f"tenant={a.tenant}")],
                          "run_id string, period string, run_ts timestamp, triggered_by string, status string, checks_executed int, "
                          "duration_s double, notes string").write.mode("append").saveAsTable(f"{gov}.dq_runs")
    print(f"{run_id}: {len(results)}/{len(checks)} checks in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
