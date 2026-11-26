"""Generate sql/demo/11_demo_marts.sql: synthetic BU source -> curated -> DQ mart tables (CTAS chains give real UC lineage),
standard-format intake tables, Delta Shares, and UC column tags/comments for mapped CDEs.

python3 scripts/gen_demo_marts.py > sql/demo/11_demo_marts.sql
"""

BUS = {
    # bu: prefix, digits, rows, home nationality, id-type mix, defect rates (% of rows)
    "VN": dict(prefix="VN", digits=9, n=60000, home="VN", src="LifeAsia (VN)",
               ids=[("CCCD", 58), ("NATIONAL_ID", 14), ("PASSPORT", 22), ("BIRTH_CERT", 3)],
               d=dict(cid_null=0.05, cid_blank=0.05, cid_bad=0.30, cid_dup=0.04, stat_null=0.2, stat_bad=0.4,
                      natl_null=0.6, natl_other=0.8, natl_unknown=0.7, natl_bad=0.3, ns_null=0.5,
                      idt_null=0.3, idt_other=1.2, cccd_bad=1.5, dob_null=0.3, dob_bad=0.2, sex_bad=0.4,
                      consist=1.1, pol_bad=0.2)),
    "PH": dict(prefix="PH-", digits=8, n=50000, home="PH", src="Ingenium (PH)",
               ids=[("UMID", 30), ("NATIONAL_ID", 28), ("PASSPORT", 26), ("DRIVING_LICENCE", 12)],
               d=dict(cid_null=0.2, cid_blank=0.3, cid_bad=1.6, cid_dup=0.15, stat_null=0.9, stat_bad=1.5,
                      natl_null=1.8, natl_other=1.2, natl_unknown=2.1, natl_bad=0.9, ns_null=2.4,
                      idt_null=1.1, idt_other=2.6, cccd_bad=0, dob_null=0.8, dob_bad=0.6, sex_bad=1.0,
                      consist=3.4, pol_bad=0.6)),
    "MY": dict(prefix="MY", digits=10, n=45000, home="MY", src="LifeAsia (MY)",
               ids=[("MYKAD", 68), ("PASSPORT", 24), ("BIRTH_CERT", 4)],
               d=dict(cid_null=0.1, cid_blank=0.1, cid_bad=0.6, cid_dup=0.08, stat_null=0.4, stat_bad=0.7,
                      natl_null=1.1, natl_other=2.4, natl_unknown=4.9, natl_bad=0.5, ns_null=1.2,
                      idt_null=0.6, idt_other=1.8, cccd_bad=0, dob_null=0.4, dob_bad=0.3, sex_bad=0.5,
                      consist=2.2, pol_bad=0.3)),
}
FOREIGN = ["SG", "CN", "HK", "TH", "ID", "IN", "US", "GB", "AU", "JP", "KR", "TW"]


def u(key, col="id"):
    """Deterministic uniform 0-100 per row."""
    return f"(pmod(xxhash64({col}, '{key}'), 100000) / 1000.0)"


def cascade(var, branches, default):
    """branches: list of (pct, sql). Cumulative CASE WHEN on uniform var."""
    out, acc = ["CASE"], 0.0
    for pct, expr in branches:
        if pct <= 0:
            continue
        acc += pct
        out.append(f"WHEN {var} < {acc:.3f} THEN {expr}")
    out.append(f"ELSE {default} END")
    return " ".join(out)


def bu_sql(bu, c):
    s = f"${{catalog}}.${{prefix}}_bu_{bu.lower()}"
    d = c["d"]
    p, dg = c["prefix"], c["digits"]
    good_id = f"concat('{p}', lpad(cast(id + 100001 AS STRING), {dg}, '0'))"
    dup_id = f"concat('{p}', lpad(cast(id + 100000 AS STRING), {dg}, '0'))"
    bad_id = f"concat(lower('{p}'), lpad(cast(id + 100001 AS STRING), {dg - 2}, '0'))"
    cid = cascade(u("cid"), [(d["cid_null"], "NULL"), (d["cid_blank"], "'   '"), (d["cid_bad"], bad_id),
                             (d["cid_dup"], dup_id)], good_id)
    stat = cascade(u("stat"), [(d["stat_null"], "NULL"), (d["stat_bad"], "'ACT'"), (62, "'ACTIVE'"), (15, "'INACTIVE'"),
                               (13, "'LAPSED'"), (3, "'DECEASED'")], "'PROSPECT'")
    foreign_pick = f"element_at(array({','.join(repr(x) for x in FOREIGN)}), cast(pmod(xxhash64(id,'fn'), {len(FOREIGN)}) AS INT) + 1)"
    natl = cascade(u("natl"), [(d["natl_null"], "NULL"), (d["natl_other"], "'OTHER'"), (d["natl_unknown"], "'UNKNOWN'"),
                               (d["natl_bad"], "'Viet Nam'" if bu == "VN" else "'N/A'"), (9, foreign_pick)], f"'{c['home']}'")
    idt_mix = [(pct, f"'{code}'") for code, pct in c["ids"]]
    idt = cascade(u("idt"), [(d["idt_null"], "NULL"), (d["idt_other"] * 0.6, "'OTHER'"), (d["idt_other"] * 0.4, "'UNKNOWN'")] + idt_mix,
                  "'PASSPORT'")
    dob_good = f"date_format(date_add(DATE'1950-01-01', cast(pmod(xxhash64(id,'dob'), 20000) AS INT)), 'yyyyMMdd')"
    dob = cascade(u("dob"), [(d["dob_null"], "NULL"), (d["dob_bad"] / 2, "'18990101'"), (d["dob_bad"] / 2, "'20991231'")], dob_good)
    sex = cascade(u("sex"), [(d["sex_bad"] / 2, "NULL"), (d["sex_bad"] / 2, "'X'"), (49, "'M'"), (49, "'F'")], "'U'")
    tin_good = "concat(lpad(cast(pmod(xxhash64(id,'t1'),1000) AS STRING),3,'0'),'-',lpad(cast(pmod(xxhash64(id,'t2'),1000) AS STRING),3,'0'),'-',lpad(cast(pmod(xxhash64(id,'t3'),1000) AS STRING),3,'0'))"
    tin = (cascade(u("tin"), [(2.5, "NULL"), (1.8, "cast(pmod(xxhash64(id,'t4'),100000) AS STRING)")], tin_good)
           if bu == "PH" else "CAST(NULL AS STRING)")
    return f"""
-- ======================= BU {bu} =======================
CREATE OR REPLACE TABLE {s}.src_customer
COMMENT 'Raw customer extract landed from {c['src']} (simulated Lakeflow Connect ingestion)' AS
WITH b AS (SELECT id FROM range({c['n']})),
x AS (SELECT id, {cid} AS CUST_NO, {stat} AS CUST_STAT, {natl} AS NATL, {idt} AS ID_TYPE, {dob} AS BIRTH_DT, {sex} AS SEX, {tin} AS TIN FROM b)
SELECT id AS SRC_ROW_ID, CUST_NO, CUST_STAT, NATL,
  CASE WHEN {u('ns')} < {d['ns_null']} THEN NULL WHEN NATL = '{c['home']}' THEN 'CITIZEN' WHEN {u('ns2')} < 30 THEN 'PERMANENT_RESIDENT' ELSE 'FOREIGNER' END AS NATL_STAT,
  ID_TYPE,
  CASE WHEN ID_TYPE = 'CCCD' AND {u('cccd')} < {d['cccd_bad']} THEN lpad(cast(pmod(xxhash64(id,'cn'),1000000000) AS STRING), 9, '0')
       WHEN ID_TYPE = 'CCCD' THEN concat('0', lpad(cast(pmod(xxhash64(id,'cn'),100000000000) AS STRING), 11, '0'))
       WHEN ID_TYPE IS NULL THEN NULL
       ELSE upper(substr(sha2(cast(id AS STRING), 256), 1, 9)) END AS ID_NO,
  BIRTH_DT, SEX, TIN, '{c['src']}' AS SRC_SYS, TIMESTAMP'2026-11-01 02:00:00' AS LOAD_TS
FROM x;

CREATE OR REPLACE TABLE {s}.src_policy
COMMENT 'Raw policy extract landed from {c['src']} (simulated Lakeflow Connect ingestion)' AS
SELECT
  CASE WHEN {u('pn', 'SRC_ROW_ID * 10 + pno')} < 0.05 THEN NULL
       ELSE concat('P{bu}', lpad(cast((SRC_ROW_ID * 10 + pno + CASE WHEN {u('pd', 'SRC_ROW_ID * 10 + pno')} < 0.08 THEN -1 ELSE 0 END) AS STRING), 10, '0')) END AS POL_NO,
  CUST_NO,
  CASE WHEN {u('pb', 'SRC_ROW_ID * 10 + pno')} < {d['pol_bad']} THEN 'XX'
       WHEN pno = 1 AND CUST_STAT = 'ACTIVE' AND {u('cs', 'SRC_ROW_ID')} >= {d['consist']} THEN 'IF'
       WHEN pno = 1 AND CUST_STAT = 'ACTIVE' THEN 'LA'
       WHEN CUST_STAT = 'ACTIVE' THEN element_at(array('IF','IF','LA','MA'), cast(pmod(xxhash64(SRC_ROW_ID, pno), 4) AS INT) + 1)
       ELSE element_at(array('LA','SU','MA','CL'), cast(pmod(xxhash64(SRC_ROW_ID, pno), 4) AS INT) + 1) END AS POL_STAT,
  element_at(array('WL01','TL10','ILP3','HS02','CI05'), cast(pmod(xxhash64(SRC_ROW_ID, pno, 'prd'), 5) AS INT) + 1) AS PRD_CD,
  date_add(DATE'2008-01-01', cast(pmod(xxhash64(SRC_ROW_ID, pno, 'iss'), 6500) AS INT)) AS ISS_DT,
  '{c['src']}' AS SRC_SYS
FROM (SELECT SRC_ROW_ID, CUST_NO, CUST_STAT, explode(sequence(1, 1 + cast(pmod(xxhash64(SRC_ROW_ID,'np'), 3) AS INT))) AS pno FROM {s}.src_customer);

CREATE OR REPLACE TABLE {s}.customer
COMMENT 'Curated customer (standardised codes, typed dates)' AS
SELECT SRC_ROW_ID AS src_row_id, CUST_NO AS customer_id, upper(trim(CUST_STAT)) AS current_status, NATL AS nationality,
       NATL_STAT AS nationality_status, ID_TYPE AS id_doc_type, ID_NO AS id_doc_no,
       try_to_date(BIRTH_DT, 'yyyyMMdd') AS date_of_birth, SEX AS gender, TIN AS tin, SRC_SYS AS source_system, LOAD_TS AS load_ts
FROM {s}.src_customer;

CREATE OR REPLACE TABLE {s}.policy
COMMENT 'Curated policy' AS
SELECT POL_NO AS policy_no, CUST_NO AS customer_id, POL_STAT AS policy_status, PRD_CD AS product_code, ISS_DT AS issue_date, SRC_SYS AS source_system
FROM {s}.src_policy;

CREATE OR REPLACE TABLE {s}.dq_customer_mart
COMMENT 'BU {bu} DQ data mart - customer grain. Prepared by the BU for monthly DQ assessment.' AS
SELECT c.src_row_id, c.customer_id, c.current_status, c.nationality, c.nationality_status, c.id_doc_type, c.id_doc_no,
       c.date_of_birth, c.gender, c.tin, coalesce(p.policy_count, 0) AS policy_count, coalesce(p.active_policy_count, 0) AS active_policy_count,
       c.source_system, '{bu}' AS bu_code, DATE'2026-10-31' AS as_of_date
FROM {s}.customer c
LEFT JOIN (SELECT customer_id, count(*) AS policy_count, count_if(policy_status = 'IF') AS active_policy_count FROM {s}.policy GROUP BY customer_id) p
  ON c.customer_id = p.customer_id;

CREATE OR REPLACE TABLE {s}.dq_policy_mart
COMMENT 'BU {bu} DQ data mart - policy grain' AS
SELECT row_number() OVER (ORDER BY customer_id, issue_date) AS src_row_id, policy_no, customer_id, policy_status, product_code, issue_date, source_system,
       '{bu}' AS bu_code, DATE'2026-10-31' AS as_of_date
FROM {s}.policy;

-- standard-format intake tables (filled by the BU; shared to the Group workspace)
CREATE TABLE IF NOT EXISTS {s}.intake_data_elements (
  batch_id STRING, submitted_by STRING, submitted_at TIMESTAMP,
  de_id STRING, name STRING, description STRING, status STRING, cde_flag BOOLEAN, subject_area STRING, data_domain STRING,
  data_subdomain STRING, defined_by STRING, de_type STRING, parent_de_id STRING, physical_table STRING, physical_column STRING
) COMMENT 'BU {bu} standard-format data element submissions (Group template v1)';
CREATE TABLE IF NOT EXISTS {s}.intake_dq_rules (
  batch_id STRING, submitted_by STRING, submitted_at TIMESTAMP,
  rule_id STRING, name STRING, status STRING, dq_dimension STRING, description STRING, defined_by STRING, applicable_to STRING,
  parent_rule_id STRING, rule_type STRING, rule_params STRING, threshold_pct DOUBLE
) COMMENT 'BU {bu} standard-format DQ rule submissions (Group template v1)';
"""


INV = """
-- ======================= Group Investments =======================
CREATE OR REPLACE TABLE ${catalog}.${prefix}_group_inv.src_holdings
COMMENT 'Raw holdings extract from SimCorp Dimension (simulated)' AS
SELECT id AS SRC_ROW_ID,
  CASE WHEN %(u1)s < 0.3 THEN NULL
       WHEN %(u1)s < 1.4 THEN concat(element_at(array('US','HK','GB','JP','SG','CN'), cast(pmod(xxhash64(id,'cc'),6) AS INT)+1), upper(substr(sha2(cast(id AS STRING),256),1,8)), cast(pmod(id,10) AS STRING))
       ELSE concat(element_at(array('US','HK','GB','JP','SG','CN'), cast(pmod(xxhash64(id,'cc'),6) AS INT)+1), upper(substr(sha2(cast(id AS STRING),256),1,9)), cast(pmod(id,10) AS STRING)) END AS ISIN,
  CASE WHEN %(u2)s < 0.4 THEN NULL ELSE round(1000 + pmod(xxhash64(id,'mv'), 50000000) / 3.0, 2) END AS MKT_VAL_USD,
  CASE WHEN %(u3)s < 0.5 THEN NULL WHEN %(u3)s < 1.6 THEN 'EQ'
       ELSE element_at(array('EQUITY','FIXED_INCOME','FIXED_INCOME','CASH','PROPERTY','ALTERNATIVES'), cast(pmod(xxhash64(id,'ac'),6) AS INT)+1) END AS ASSET_CLS,
  element_at(array('AIA Co','AIA HK','AIA SG','AIA MY','AIA TH'), cast(pmod(xxhash64(id,'ent'),5) AS INT)+1) AS ENTITY,
  DATE'2026-10-31' AS VAL_DT
FROM range(8000);

CREATE OR REPLACE TABLE ${catalog}.${prefix}_group_inv.holdings
COMMENT 'Curated holdings' AS
SELECT SRC_ROW_ID AS src_row_id, ISIN AS isin, MKT_VAL_USD AS market_value_usd, ASSET_CLS AS asset_class, ENTITY AS legal_entity, VAL_DT AS valuation_date
FROM ${catalog}.${prefix}_group_inv.src_holdings;

CREATE OR REPLACE TABLE ${catalog}.${prefix}_group_inv.dq_holdings_mart
COMMENT 'Group Investments DQ data mart - holding grain' AS
SELECT *, 'GI' AS bu_code, valuation_date AS as_of_date FROM ${catalog}.${prefix}_group_inv.holdings;
""" % dict(u1=u("i1"), u2=u("i2"), u3=u("i3"))

SEED_INTAKE = """
DELETE FROM ${catalog}.${prefix}_bu_ph.intake_data_elements;
DELETE FROM ${catalog}.${prefix}_bu_ph.intake_dq_rules;
-- a pending BU Philippines bulk submission (arrives in the Group app via the share)
INSERT INTO ${catalog}.${prefix}_bu_ph.intake_data_elements VALUES
 ('PH-2026-11-20-01','ph.steward@aia.example',TIMESTAMP'2026-11-20 03:15:00','PH_00002','Unified Multi-Purpose ID (UMID) Number','The 12-digit UMID card number issued by SSS/GSIS.','Pending Approval',true,'Customer and Operations','Customer','Individual','PH','Atomic','GO_00004','${catalog}.${prefix}_bu_ph.dq_customer_mart','id_doc_no'),
 ('PH-2026-11-20-01','ph.steward@aia.example',TIMESTAMP'2026-11-20 03:15:00','PH_00003','Policy Owner Mobile Number','The mobile number of the policy owner used for e-policy delivery.','Pending Approval',false,'Customer and Operations','Customer','Contact','PH','Atomic',NULL,NULL,NULL);
INSERT INTO ${catalog}.${prefix}_bu_ph.intake_dq_rules VALUES
 ('PH-2026-11-20-01','ph.steward@aia.example',TIMESTAMP'2026-11-20 03:15:00','PH_DQ_00002','Customer-Individual-UMID Number-Validity','Pending Approval','Validity','Where ID document type is UMID the number must be 12 digits','PH','PH_00002',NULL,'sql_expr','{"expr":"id_doc_type <> \\'UMID\\' OR {col} RLIKE \\'^[0-9]{12}$\\'"}',98),
 ('PH-2026-11-20-01','ph.steward@aia.example',TIMESTAMP'2026-11-20 03:15:00','PH_DQ_00037','Customer-Individual-Current Status-Validity (PH)','Pending Approval','Validity','PH additionally accepts SUSPENDED as a valid customer status','PH','GO_00002','GO_DQ_00037','in_reference','{"ref_set":"CUSTOMER_STATUS"}',97.5);
"""


def shares():
    out = []
    for bu in BUS:
        s = f"${{catalog}}.${{prefix}}_bu_{bu.lower()}"
        out.append(f"DROP SHARE IF EXISTS d360_bu_{bu.lower()}_to_group;")
        out.append(f"CREATE SHARE d360_bu_{bu.lower()}_to_group COMMENT 'BU {bu} -> Group governance workspace: standard-format intake + DQ marts';")
        for t in ["intake_data_elements", "intake_dq_rules", "dq_customer_mart", "dq_policy_mart"]:
            out.append(f"ALTER SHARE d360_bu_{bu.lower()}_to_group ADD TABLE {s}.{t};")
    return "\n".join(out)


if __name__ == "__main__":
    print("-- GENERATED by scripts/gen_demo_marts.py - do not edit by hand")
    for bu in BUS:
        print(f"CREATE SCHEMA IF NOT EXISTS ${{catalog}}.${{prefix}}_bu_{bu.lower()} COMMENT 'DEMO: simulated BU {bu} workspace - DQ data mart + standard-format intake tables';")
    print("CREATE SCHEMA IF NOT EXISTS ${catalog}.${prefix}_group_inv COMMENT 'DEMO: simulated Group Investments DQ data mart';")
    for bu, c in BUS.items():
        print(bu_sql(bu, c))
    print(INV)
    print(SEED_INTAKE)
    import sys
    if "--with-shares" in sys.argv:  # needs CREATE SHARE on the metastore (not granted on FEVM)
        print("-- ======================= Delta Sharing (BU -> Group) =======================")
        print(shares())
