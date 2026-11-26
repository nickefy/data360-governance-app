"""Data360 governance platform: in-workspace admin tasks (runs as a serverless Lakeflow Job task).

Subcommands (all take --catalog and --prefix; the governance schema is <catalog>.<prefix>_governance):
  sql       --files a.sql,b.sql [--var k=v ...]   apply SQL files (${catalog}, ${prefix} and --var placeholders substituted)
  finalize  [--app-sp ID] [--runner ID] [--admins a@x,b@y]
            rebuild the BU intake view from the tenants table, grant the app / DQ-job principals, bootstrap Group DG admins
  onboard   --bu-code TH --bu-name "AIA Thailand" [--region TH] [--intake-mode GROUP_HOSTED|DELTA_SHARE]
            [--intake-schema cat.schema] [--data-catalog cat] [--stewards a@x,b@y] [--app-sp ID] [--runner ID]
            register a BU, create (or validate) its intake tables, then run finalize

A statement preceded by a line `-- @optional` may fail without failing the task (used for upgrade-only DDL).
"""
import argparse
import json
import re
import sys

from pyspark.sql import SparkSession

spark = SparkSession.builder.getOrCreate()

INTAKE_DE_DDL = """CREATE TABLE IF NOT EXISTS {s}.intake_data_elements (
  batch_id STRING, submitted_by STRING, submitted_at TIMESTAMP,
  de_id STRING, name STRING, description STRING, status STRING, cde_flag BOOLEAN, subject_area STRING, data_domain STRING,
  data_subdomain STRING, defined_by STRING, de_type STRING, parent_de_id STRING, physical_table STRING, physical_column STRING
) COMMENT '{bu} standard-format data element submissions (Group template v1)'"""
INTAKE_RU_DDL = """CREATE TABLE IF NOT EXISTS {s}.intake_dq_rules (
  batch_id STRING, submitted_by STRING, submitted_at TIMESTAMP,
  rule_id STRING, name STRING, status STRING, dq_dimension STRING, description STRING, defined_by STRING, applicable_to STRING,
  parent_rule_id STRING, rule_type STRING, rule_params STRING, threshold_pct DOUBLE
) COMMENT '{bu} standard-format DQ rule submissions (Group template v1)'"""


def q(name: str) -> str:
    """Quote a dotted identifier: cat.schema -> `cat`.`schema`."""
    return ".".join(f"`{p.strip('`')}`" for p in name.split("."))


def lit(v) -> str:
    return "NULL" if v is None or v == "" else "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'"


def statements(text: str):
    """Yield (statement, optional) pairs. Statements end with a line ending in ';'."""
    buf, optional = [], False
    for line in text.splitlines():
        s = line.strip()
        if not buf and s.startswith("--"):
            optional = optional or s == "-- @optional"
            continue
        if not buf and not s:
            continue
        buf.append(line)
        if line.rstrip().endswith(";"):
            stmt = "\n".join(buf).strip().rstrip(";").strip()
            if stmt:
                yield stmt, optional
            buf, optional = [], False
    if "\n".join(buf).strip():
        yield "\n".join(buf).strip(), optional


def run_sql_files(files, subs):
    for f in files:
        text = open(f, encoding="utf-8").read()
        for k, v in subs.items():
            text = text.replace("${" + k + "}", v)
        left = re.findall(r"\$\{(\w+)\}", text)
        if left:
            raise SystemExit(f"{f}: unresolved placeholders {sorted(set(left))}")
        n = 0
        for stmt, optional in statements(text):
            n += 1
            first = " ".join(stmt.split())[:110]
            try:
                spark.sql(stmt)
                print(f"ok   {f.split('/')[-1]}#{n}: {first}")
            except Exception as e:  # noqa: BLE001
                if not optional:
                    print(f"FAIL {f.split('/')[-1]}#{n}: {first}\n  {e}")
                    raise
                print(f"skip {f.split('/')[-1]}#{n} (optional): {str(e).splitlines()[0][:140]}")


def table_exists(fqn: str) -> bool:
    try:
        spark.table(q(fqn)).limit(0).collect()
        return True
    except Exception:  # noqa: BLE001
        return False


def grant(stmt: str):
    try:
        spark.sql(stmt)
        print(f"ok   {stmt}")
    except Exception as e:  # noqa: BLE001
        print(f"WARN {stmt}\n  {str(e).splitlines()[0][:200]}")


def finalize(a, gov):
    tenants = spark.sql(f"SELECT * FROM {gov}.tenants WHERE intake_schema IS NOT NULL AND intake_schema <> ''").collect()
    # 1. BU intake view: union of every onboarded BU's intake tables (local Group-hosted schemas or Delta Sharing catalogs)
    parts = []
    for t in tenants:
        de, ru = f"{t.intake_schema}.intake_data_elements", f"{t.intake_schema}.intake_dq_rules"
        if not (table_exists(de) and table_exists(ru)):
            print(f"WARN {t.tenant_code}: intake tables not readable in {t.intake_schema}; left out of v_intake")
            continue
        parts.append(f"SELECT {lit(t.tenant_code)} AS tenant_code, batch_id, submitted_by, submitted_at, 'DATA_ELEMENT' AS object_type, de_id AS object_id, name FROM {q(de)}")
        parts.append(f"SELECT {lit(t.tenant_code)}, batch_id, submitted_by, submitted_at, 'DQ_RULE', rule_id, name FROM {q(ru)}")
    if not parts:
        parts = ["SELECT CAST(NULL AS STRING) AS tenant_code, CAST(NULL AS STRING) AS batch_id, CAST(NULL AS STRING) AS submitted_by, "
                 "CAST(NULL AS TIMESTAMP) AS submitted_at, CAST(NULL AS STRING) AS object_type, CAST(NULL AS STRING) AS object_id, "
                 "CAST(NULL AS STRING) AS name WHERE false"]
    spark.sql(f"CREATE OR REPLACE VIEW {gov}.v_intake COMMENT 'All BU intake submissions (rebuilt by d360_admin.py finalize)' AS\n" + "\nUNION ALL\n".join(parts))
    print(f"ok   v_intake rebuilt over {len(parts) // 2} BU(s)")

    # 2. grants for the app service principal and the DQ job's run-as principal
    cat_q, gov_q = q(a.catalog), gov
    for p in [x for x in [a.app_sp, a.runner] if x]:
        grant(f"GRANT USE CATALOG ON CATALOG {cat_q} TO `{p}`")
        grant(f"GRANT USE SCHEMA, SELECT, MODIFY, APPLY TAG ON SCHEMA {gov_q} TO `{p}`")
        for t in tenants:
            sch = t.intake_schema
            if sch.split(".")[0].strip("`") != a.catalog:
                grant(f"GRANT USE CATALOG ON CATALOG {q(sch.split('.')[0])} TO `{p}`")
            privs = "USE SCHEMA, SELECT" if (t.intake_mode or "") == "DELTA_SHARE" else "USE SCHEMA, SELECT, MODIFY, APPLY TAG"
            grant(f"GRANT {privs} ON SCHEMA {q(sch)} TO `{p}`")
            dc = (t.data_catalog or "").strip()
            if dc and dc != a.catalog:  # BU DQ marts in a Delta Sharing catalog: read-only on the whole catalog
                grant(f"GRANT USE CATALOG, USE SCHEMA, SELECT ON CATALOG {q(dc)} TO `{p}`")
        for m in spark.sql(f"SELECT DISTINCT substring_index(table_fqn, '.', 2) AS sch FROM {gov}.cde_mapping").collect():
            if m.sch and m.sch.split(".")[0] == a.catalog and not m.sch.endswith("_governance"):
                grant(f"GRANT USE SCHEMA, SELECT, APPLY TAG ON SCHEMA {q(m.sch)} TO `{p}`")

    # 3. bootstrap Group Data Governance admins (only adds; never removes)
    for e in [x.strip().lower() for x in (a.admins or "").split(",") if x.strip()]:
        spark.sql(f"""MERGE INTO {gov}.user_roles t USING (SELECT {lit(e)} AS principal) s ON lower(t.principal) = s.principal
                     WHEN NOT MATCHED THEN INSERT (principal, role, tenant_code) VALUES (s.principal, 'GROUP_DG', 'GDG')""")
        print(f"ok   admin {e} -> GROUP_DG")


def onboard(a, gov):
    bu = a.bu_code.strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{2,8}", bu):
        raise SystemExit("--bu-code must be 2-8 letters/digits, e.g. TH")
    mode = a.intake_mode.strip().upper() or "GROUP_HOSTED"
    if mode == "GROUP_HOSTED":
        sch = (a.intake_schema or f"{a.catalog}.{a.prefix}_intake_{bu.lower()}").strip()
        spark.sql(f"CREATE SCHEMA IF NOT EXISTS {q(sch)} COMMENT 'BU {bu} intake tables (Group-hosted; filled through the governance app bulk upload)'")
        spark.sql(INTAKE_DE_DDL.format(s=q(sch), bu=bu))
        spark.sql(INTAKE_RU_DDL.format(s=q(sch), bu=bu))
        print(f"ok   intake tables in {sch}")
    elif mode == "DELTA_SHARE":
        sch = (a.intake_schema or "").strip()
        if sch.count(".") != 1:
            raise SystemExit("DELTA_SHARE mode needs --intake-schema <shared_catalog>.<schema> (mount the BU share first, see ONBOARDING.md)")
        for t in ("intake_data_elements", "intake_dq_rules"):
            if not table_exists(f"{sch}.{t}"):
                raise SystemExit(f"{sch}.{t} is not readable. Check the share contents and that the job principal can use the shared catalog.")
        print(f"ok   shared intake tables readable in {sch}")
    else:
        raise SystemExit("--intake-mode must be GROUP_HOSTED or DELTA_SHARE")
    spark.sql(f"""MERGE INTO {gov}.tenants t
        USING (SELECT {lit(bu)} AS tenant_code, {lit(a.bu_name or bu)} AS tenant_name, 'BU' AS tenant_type, {lit(sch)} AS intake_schema,
                      {lit(a.region or bu)} AS region, {lit(mode)} AS intake_mode, {lit(a.data_catalog)} AS data_catalog) s
        ON t.tenant_code = s.tenant_code
        WHEN MATCHED THEN UPDATE SET tenant_name = s.tenant_name, intake_schema = s.intake_schema, region = s.region,
             intake_mode = s.intake_mode, data_catalog = s.data_catalog
        WHEN NOT MATCHED THEN INSERT (tenant_code, tenant_name, tenant_type, intake_schema, region, intake_mode, data_catalog, onboarded_at)
             VALUES (s.tenant_code, s.tenant_name, s.tenant_type, s.intake_schema, s.region, s.intake_mode, s.data_catalog, current_timestamp())""")
    print(f"ok   tenant {bu} registered ({mode})")
    for e in [x.strip().lower() for x in (a.stewards or "").split(",") if x.strip()]:
        spark.sql(f"""MERGE INTO {gov}.user_roles t USING (SELECT {lit(e)} AS principal, {lit(bu)} AS tenant_code) s
                     ON lower(t.principal) = s.principal AND t.tenant_code = s.tenant_code
                     WHEN NOT MATCHED THEN INSERT (principal, role, tenant_code) VALUES (s.principal, 'STEWARD', s.tenant_code)""")
        print(f"ok   steward {e} -> {bu}")
    details = json.dumps({"mode": mode, "intake_schema": sch, "data_catalog": a.data_catalog})
    spark.sql(f"INSERT INTO {gov}.audit_log VALUES (current_timestamp(), current_user(), 'job:onboard', 'ONBOARD_BU', 'TENANT', {lit(bu)}, {lit(details)})")
    finalize(a, gov)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["sql", "finalize", "onboard"])
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--prefix", default="d360")
    ap.add_argument("--files", default="")
    ap.add_argument("--var", action="append", default=[])
    ap.add_argument("--app-sp", default="")
    ap.add_argument("--runner", default="")
    ap.add_argument("--admins", default="")
    ap.add_argument("--bu-code", default="")
    ap.add_argument("--bu-name", default="")
    ap.add_argument("--region", default="")
    ap.add_argument("--intake-mode", default="GROUP_HOSTED")
    ap.add_argument("--intake-schema", default="")
    ap.add_argument("--data-catalog", default="")
    ap.add_argument("--stewards", default="")
    a = ap.parse_args(argv)
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,30}", a.prefix):
        raise SystemExit("--prefix must be lowercase letters/digits/underscore")
    gov = f"{q(a.catalog)}.`{a.prefix}_governance`"
    if a.cmd == "sql":
        subs = {"catalog": a.catalog, "prefix": a.prefix}
        subs.update(dict(kv.split("=", 1) for kv in a.var))
        run_sql_files([f for f in a.files.split(",") if f.strip()], subs)
    elif a.cmd == "finalize":
        finalize(a, gov)
    else:
        onboard(a, gov)


if __name__ == "__main__":
    main(sys.argv[1:])
