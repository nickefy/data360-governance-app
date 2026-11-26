-- Restore the clean demo state (INSERT OVERWRITE keeps table identity, grants, tags and lineage).
INSERT OVERWRITE ${catalog}.${prefix}_governance.data_elements SELECT * FROM ${catalog}.${prefix}_snapshot.data_elements;
INSERT OVERWRITE ${catalog}.${prefix}_governance.dq_rules SELECT * FROM ${catalog}.${prefix}_snapshot.dq_rules;
INSERT OVERWRITE ${catalog}.${prefix}_governance.cde_mapping SELECT * FROM ${catalog}.${prefix}_snapshot.cde_mapping;
INSERT OVERWRITE ${catalog}.${prefix}_governance.reference_data SELECT * FROM ${catalog}.${prefix}_snapshot.reference_data;
INSERT OVERWRITE ${catalog}.${prefix}_governance.submission_reviews SELECT * FROM ${catalog}.${prefix}_snapshot.submission_reviews;
INSERT OVERWRITE ${catalog}.${prefix}_governance.audit_log SELECT * FROM ${catalog}.${prefix}_snapshot.audit_log;
INSERT OVERWRITE ${catalog}.${prefix}_governance.dq_runs SELECT * FROM ${catalog}.${prefix}_snapshot.dq_runs;
INSERT OVERWRITE ${catalog}.${prefix}_governance.dq_results SELECT * FROM ${catalog}.${prefix}_snapshot.dq_results;
INSERT OVERWRITE ${catalog}.${prefix}_governance.dq_failed_samples SELECT * FROM ${catalog}.${prefix}_snapshot.dq_failed_samples;
INSERT OVERWRITE ${catalog}.${prefix}_bu_vn.intake_data_elements SELECT * FROM ${catalog}.${prefix}_snapshot.vn_intake_de;
INSERT OVERWRITE ${catalog}.${prefix}_bu_vn.intake_dq_rules SELECT * FROM ${catalog}.${prefix}_snapshot.vn_intake_rules;
INSERT OVERWRITE ${catalog}.${prefix}_bu_ph.intake_data_elements SELECT * FROM ${catalog}.${prefix}_snapshot.ph_intake_de;
INSERT OVERWRITE ${catalog}.${prefix}_bu_ph.intake_dq_rules SELECT * FROM ${catalog}.${prefix}_snapshot.ph_intake_rules;
INSERT OVERWRITE ${catalog}.${prefix}_bu_my.intake_data_elements SELECT * FROM ${catalog}.${prefix}_snapshot.my_intake_de;
INSERT OVERWRITE ${catalog}.${prefix}_bu_my.intake_dq_rules SELECT * FROM ${catalog}.${prefix}_snapshot.my_intake_rules;
INSERT OVERWRITE ${catalog}.${prefix}_governance.tenants SELECT * FROM ${catalog}.${prefix}_snapshot.tenants;
INSERT OVERWRITE ${catalog}.${prefix}_governance.user_roles SELECT * FROM ${catalog}.${prefix}_snapshot.user_roles;
