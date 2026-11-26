-- =============================================================================
-- Run in the Group governance workspace (by a Group metastore admin). Replace <bu>, <bu_provider>, <bu_schema>.
-- Mounts the BU share as a read-only catalog, then onboard the BU with intake_mode=DELTA_SHARE (see ONBOARDING.md).
-- =============================================================================

-- The provider appears automatically once the BU grants the share to this metastore:
SHOW PROVIDERS;
SHOW SHARES IN PROVIDER `<bu_provider>`;

CREATE CATALOG IF NOT EXISTS aia_<bu>_shared USING SHARE `<bu_provider>`.d360_<bu>_to_group
  COMMENT 'BU <bu> intake tables + DQ marts (Delta Sharing, read-only)';

-- Verify before onboarding (all must return rows / no error):
SELECT count(*) FROM aia_<bu>_shared.<bu_schema>.intake_data_elements;
SELECT count(*) FROM aia_<bu>_shared.<bu_schema>.intake_dq_rules;
SELECT count(*) FROM aia_<bu>_shared.<bu_schema>.dq_customer_mart;

-- Then: databricks bundle run d360_onboard_bu -t prod --params bu_code=<BU>,bu_name="AIA <name>",intake_mode=DELTA_SHARE,intake_schema=aia_<bu>_shared.<bu_schema>,data_catalog=aia_<bu>_shared
