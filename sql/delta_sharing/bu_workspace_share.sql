-- =============================================================================
-- Run in the BU workspace (by the BU data team). Replace <bu>, <bu_catalog>, <bu_schema>, <group_sharing_id>.
-- Creates the standard intake tables (if the BU fills them locally) and shares them + the BU DQ marts to Group.
-- Requires: CREATE SHARE / CREATE RECIPIENT on the BU metastore (metastore admin or delegated privilege).
-- =============================================================================

-- 1. Standard-format intake tables (Group template v1). Skip if the BU only submits through the Group app.
CREATE SCHEMA IF NOT EXISTS <bu_catalog>.<bu_schema>;
CREATE TABLE IF NOT EXISTS <bu_catalog>.<bu_schema>.intake_data_elements (
  batch_id STRING, submitted_by STRING, submitted_at TIMESTAMP,
  de_id STRING, name STRING, description STRING, status STRING, cde_flag BOOLEAN, subject_area STRING, data_domain STRING,
  data_subdomain STRING, defined_by STRING, de_type STRING, parent_de_id STRING, physical_table STRING, physical_column STRING
) COMMENT '<bu> standard-format data element submissions (Group template v1)';
CREATE TABLE IF NOT EXISTS <bu_catalog>.<bu_schema>.intake_dq_rules (
  batch_id STRING, submitted_by STRING, submitted_at TIMESTAMP,
  rule_id STRING, name STRING, status STRING, dq_dimension STRING, description STRING, defined_by STRING, applicable_to STRING,
  parent_rule_id STRING, rule_type STRING, rule_params STRING, threshold_pct DOUBLE
) COMMENT '<bu> standard-format DQ rule submissions (Group template v1)';

-- 2. Share intake tables and DQ marts (read-only for Group; no data is copied).
CREATE SHARE IF NOT EXISTS d360_<bu>_to_group COMMENT 'BU <bu> -> Group governance workspace: intake tables + DQ data marts';
ALTER SHARE d360_<bu>_to_group ADD TABLE <bu_catalog>.<bu_schema>.intake_data_elements;
ALTER SHARE d360_<bu>_to_group ADD TABLE <bu_catalog>.<bu_schema>.intake_dq_rules;
ALTER SHARE d360_<bu>_to_group ADD TABLE <bu_catalog>.<bu_schema>.dq_customer_mart;   -- one line per DQ mart table
ALTER SHARE d360_<bu>_to_group ADD TABLE <bu_catalog>.<bu_schema>.dq_policy_mart;

-- 3. Recipient = the Group governance metastore (Databricks-to-Databricks sharing).
--    <group_sharing_id> comes from the Group workspace: SELECT CURRENT_METASTORE();
CREATE RECIPIENT IF NOT EXISTS aia_group_governance USING ID '<group_sharing_id>' COMMENT 'AIA Group governance workspace';
GRANT SELECT ON SHARE d360_<bu>_to_group TO RECIPIENT aia_group_governance;

-- 4. Submitting a batch = inserting rows with a new batch_id, e.g.
-- INSERT INTO <bu_catalog>.<bu_schema>.intake_dq_rules VALUES ('<BU>-2026-12-01-01', 'steward@aia.com', current_timestamp(), ...);
