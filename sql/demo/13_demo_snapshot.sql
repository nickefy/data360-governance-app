-- Snapshot the clean demo state so sql/demo/reset_demo.sql can restore it after each demo.
CREATE SCHEMA IF NOT EXISTS ${catalog}.${prefix}_snapshot COMMENT 'Clean demo-state snapshot used by 07_reset_demo.sql';
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.data_elements DEEP CLONE ${catalog}.${prefix}_governance.data_elements;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.dq_rules DEEP CLONE ${catalog}.${prefix}_governance.dq_rules;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.cde_mapping DEEP CLONE ${catalog}.${prefix}_governance.cde_mapping;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.reference_data DEEP CLONE ${catalog}.${prefix}_governance.reference_data;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.submission_reviews DEEP CLONE ${catalog}.${prefix}_governance.submission_reviews;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.audit_log DEEP CLONE ${catalog}.${prefix}_governance.audit_log;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.dq_runs DEEP CLONE ${catalog}.${prefix}_governance.dq_runs;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.dq_results DEEP CLONE ${catalog}.${prefix}_governance.dq_results;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.dq_failed_samples DEEP CLONE ${catalog}.${prefix}_governance.dq_failed_samples;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.vn_intake_de DEEP CLONE ${catalog}.${prefix}_bu_vn.intake_data_elements;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.vn_intake_rules DEEP CLONE ${catalog}.${prefix}_bu_vn.intake_dq_rules;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.ph_intake_de DEEP CLONE ${catalog}.${prefix}_bu_ph.intake_data_elements;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.ph_intake_rules DEEP CLONE ${catalog}.${prefix}_bu_ph.intake_dq_rules;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.my_intake_de DEEP CLONE ${catalog}.${prefix}_bu_my.intake_data_elements;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.my_intake_rules DEEP CLONE ${catalog}.${prefix}_bu_my.intake_dq_rules;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.tenants DEEP CLONE ${catalog}.${prefix}_governance.tenants;
CREATE OR REPLACE TABLE ${catalog}.${prefix}_snapshot.user_roles DEEP CLONE ${catalog}.${prefix}_governance.user_roles;
