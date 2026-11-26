-- Data360 governance platform: Group governance registry (system of record).
-- Idempotent and non-destructive: safe to re-run on every deployment. Placeholders: ${catalog}, ${prefix}.
CREATE SCHEMA IF NOT EXISTS ${catalog}.${prefix}_governance COMMENT 'Data360 governance registry: data elements / CDEs, DQ rules, mappings, reference data, DQ results, approvals, audit';

CREATE TABLE IF NOT EXISTS ${catalog}.${prefix}_governance.tenants (
  tenant_code STRING NOT NULL, tenant_name STRING, tenant_type STRING COMMENT 'GROUP_FUNCTION | BU',
  intake_schema STRING COMMENT 'catalog.schema holding the BU intake_data_elements / intake_dq_rules tables',
  region STRING,
  intake_mode STRING COMMENT 'GROUP_HOSTED (app upload into a Group-side schema) | DELTA_SHARE (BU fills tables in its own workspace and shares them)',
  data_catalog STRING COMMENT 'Catalog holding the BU DQ data marts (a Delta Sharing catalog in production)',
  onboarded_at TIMESTAMP
) COMMENT 'Group functions and BUs that own data elements and rules';

CREATE TABLE IF NOT EXISTS ${catalog}.${prefix}_governance.data_elements (
  de_id STRING NOT NULL COMMENT 'Data element ID, e.g. GO_00001',
  name STRING, description STRING,
  status STRING COMMENT 'Draft | Pending Approval | Approved | Rejected | Retired',
  cde_flag BOOLEAN COMMENT 'Critical Data Element',
  subject_area STRING, data_domain STRING, data_subdomain STRING COMMENT 'Data sub-domain (L2)',
  defined_by STRING COMMENT 'Owning tenant code (GO, GC, GI, VN, PH, MY)',
  de_type STRING COMMENT 'Atomic | Derived',
  parent_de_id STRING COMMENT 'Group DE this BU element customises (if any)',
  data_owner STRING, version INT, created_at TIMESTAMP, updated_by STRING, updated_at TIMESTAMP,
  CONSTRAINT data_elements_pk PRIMARY KEY (de_id)
) COMMENT 'Central business data dictionary / CDE register';

CREATE TABLE IF NOT EXISTS ${catalog}.${prefix}_governance.dq_rules (
  rule_id STRING NOT NULL, name STRING,
  status STRING COMMENT 'Draft | Pending Approval | Approved | Rejected | Retired',
  dq_dimension STRING COMMENT 'Completeness | Validity | Uniqueness | Consistency | Timeliness | Accuracy',
  description STRING COMMENT 'Business description of the rule',
  rule_type STRING COMMENT 'not_null_or_blank | regex | in_reference | unique | range | sql_expr',
  rule_params STRING COMMENT 'JSON parameters for rule_type (the executable definition)',
  applicable_to STRING COMMENT 'Comma-separated DE IDs the rule applies to',
  defined_by STRING COMMENT 'Owning tenant code',
  parent_rule_id STRING COMMENT 'Group rule this BU rule overrides (BU customisation)',
  threshold_pct DOUBLE COMMENT 'Minimum pass % to be considered healthy',
  version INT, created_at TIMESTAMP, updated_by STRING, updated_at TIMESTAMP,
  CONSTRAINT dq_rules_pk PRIMARY KEY (rule_id)
) COMMENT 'DQ rule library: Group rules, BU customisations and BU-local rules';

CREATE TABLE IF NOT EXISTS ${catalog}.${prefix}_governance.cde_mapping (
  de_id STRING NOT NULL, tenant_code STRING NOT NULL, table_fqn STRING NOT NULL, column_name STRING NOT NULL, source_system STRING
) COMMENT 'Maps data elements to physical columns in each BU / function DQ mart (drives DQ execution, UC tags and lineage)';

CREATE TABLE IF NOT EXISTS ${catalog}.${prefix}_governance.reference_data (
  ref_set STRING NOT NULL, code STRING NOT NULL, label STRING, tenant_code STRING COMMENT 'GROUP = Group-wide; otherwise BU extension',
  active BOOLEAN, updated_by STRING, updated_at TIMESTAMP
) COMMENT 'Group and BU reference data (code sets) used by validity rules';

CREATE TABLE IF NOT EXISTS ${catalog}.${prefix}_governance.dq_runs (
  run_id STRING, period STRING COMMENT 'Reporting month YYYY-MM', run_ts TIMESTAMP, triggered_by STRING,
  status STRING, checks_executed INT, duration_s DOUBLE, notes STRING
) COMMENT 'One row per DQ assessment run';

CREATE TABLE IF NOT EXISTS ${catalog}.${prefix}_governance.dq_results (
  run_id STRING, period STRING, run_ts TIMESTAMP,
  rule_id STRING COMMENT 'Group/BU rule as catalogued', effective_rule_id STRING COMMENT 'Rule actually executed (BU override if approved)',
  de_id STRING, tenant_code STRING, table_fqn STRING, column_name STRING, dq_dimension STRING,
  total_rows BIGINT, passed_rows BIGINT, failed_rows BIGINT, pass_pct DOUBLE, threshold_pct DOUBLE,
  result_status STRING COMMENT 'PASS | FAIL', check_sql STRING
) COMMENT 'DQ assessment results: one row per rule x BU x physical column x run';

CREATE TABLE IF NOT EXISTS ${catalog}.${prefix}_governance.dq_failed_samples (
  run_id STRING, effective_rule_id STRING, tenant_code STRING, table_fqn STRING, column_name STRING, row_key STRING, failed_value STRING
) COMMENT 'Sample of failing rows (max 20 per check) for remediation';

CREATE TABLE IF NOT EXISTS ${catalog}.${prefix}_governance.submission_reviews (
  batch_id STRING, tenant_code STRING, object_type STRING, object_id STRING, decision STRING, reviewer STRING, reviewed_at TIMESTAMP, comment STRING
) COMMENT 'Group decisions on BU bulk submissions received via Delta Sharing';

CREATE TABLE IF NOT EXISTS ${catalog}.${prefix}_governance.user_roles (
  principal STRING, role STRING COMMENT 'GROUP_DG | STEWARD | VIEWER', tenant_code STRING
) COMMENT 'App RBAC: Group Data Governance edits everything; stewards edit their own tenant';

CREATE TABLE IF NOT EXISTS ${catalog}.${prefix}_governance.audit_log (
  ts TIMESTAMP, actor STRING, persona STRING, action STRING, object_type STRING, object_id STRING, details STRING
) COMMENT 'Audit trail of every change made through the governance app';

-- Upgrade path for registries created before the tenants table had onboarding columns (no-op on fresh installs).
-- @optional
ALTER TABLE ${catalog}.${prefix}_governance.tenants ADD COLUMNS (intake_mode STRING, data_catalog STRING, onboarded_at TIMESTAMP);

-- BU intake (all BUs, unioned). Rebuilt from the tenants table by src/setup/build_intake_view.py; this empty version lets the app start before any BU is onboarded.
-- @optional
CREATE VIEW IF NOT EXISTS ${catalog}.${prefix}_governance.v_intake AS SELECT CAST(NULL AS STRING) AS tenant_code, CAST(NULL AS STRING) AS batch_id, CAST(NULL AS STRING) AS submitted_by, CAST(NULL AS TIMESTAMP) AS submitted_at, CAST(NULL AS STRING) AS object_type, CAST(NULL AS STRING) AS object_id, CAST(NULL AS STRING) AS name WHERE false;
