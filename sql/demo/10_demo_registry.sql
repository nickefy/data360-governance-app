-- DEMO ONLY: simulated BUs (VN / PH / MY) and Group Investments content on top of the Group seed. Loaded when load_demo_data = true.
-- Demo loads start from a clean slate for DQ results and intake reviews (the snapshot / d360_reset_demo job restores this state before each demo).
DELETE FROM ${catalog}.${prefix}_governance.dq_failed_samples;
DELETE FROM ${catalog}.${prefix}_governance.dq_results;
DELETE FROM ${catalog}.${prefix}_governance.dq_runs;
DELETE FROM ${catalog}.${prefix}_governance.submission_reviews;
DELETE FROM ${catalog}.${prefix}_governance.tenants WHERE tenant_code IN ('VN','PH','MY');
INSERT INTO ${catalog}.${prefix}_governance.tenants VALUES
 ('VN','BU Vietnam','BU','${catalog}.${prefix}_bu_vn','VN','GROUP_HOSTED','${catalog}',current_timestamp()),
 ('PH','BU Philippines','BU','${catalog}.${prefix}_bu_ph','PH','GROUP_HOSTED','${catalog}',current_timestamp()),
 ('MY','BU Malaysia','BU','${catalog}.${prefix}_bu_my','MY','GROUP_HOSTED','${catalog}',current_timestamp());

INSERT INTO ${catalog}.${prefix}_governance.data_elements (de_id, name, description, status, cde_flag, subject_area, data_domain, data_subdomain, defined_by, de_type, parent_de_id, data_owner, version, created_at, updated_by, updated_at)
SELECT * FROM VALUES
 ('GO_00005','Date of Birth','The date on which the customer was born.','Approved',true,'Customer and Operations','Customer','Individual','GO','Atomic',NULL,'Head of Group Operations Data',1,TIMESTAMP'2024-05-10 09:00:00','seed',TIMESTAMP'2026-02-11 10:00:00'),
 ('GO_00006','Gender','The gender of the customer as recorded on the identification document.','Approved',false,'Customer and Operations','Customer','Individual','GO','Atomic',NULL,'Head of Group Operations Data',1,TIMESTAMP'2024-05-10 09:00:00','seed',TIMESTAMP'2026-02-11 10:00:00'),
 ('GO_00007','Policy Number','A unique identifier of an insurance policy in a market.','Approved',true,'Customer and Operations','Policy','Individual Life','GO','Atomic',NULL,'Head of Group Operations Data',1,TIMESTAMP'2024-05-10 09:00:00','seed',TIMESTAMP'2026-02-11 10:00:00'),
 ('GO_00008','Policy Status','The current status of the policy, e.g. in force or lapsed.','Approved',true,'Customer and Operations','Policy','Individual Life','GO','Atomic',NULL,'Head of Group Operations Data',1,TIMESTAMP'2024-05-10 09:00:00','seed',TIMESTAMP'2026-02-11 10:00:00'),
 ('GI_00001','Security Identifier (ISIN)','The International Securities Identification Number of a held security.','Approved',true,'Investments','Investment','Holdings','GI','Atomic',NULL,'Group Investment Data Director',1,TIMESTAMP'2024-08-01 09:00:00','seed',TIMESTAMP'2026-04-01 10:00:00'),
 ('GI_00002','Market Value','The market value of a holding in reporting currency at valuation date.','Approved',true,'Investments','Investment','Holdings','GI','Atomic',NULL,'Group Investment Data Director',1,TIMESTAMP'2024-08-01 09:00:00','seed',TIMESTAMP'2026-04-01 10:00:00'),
 ('GI_00003','Asset Class','The asset class of a holding as per the Group investment taxonomy.','Approved',false,'Investments','Investment','Holdings','GI','Atomic',NULL,'Group Investment Data Director',1,TIMESTAMP'2024-08-01 09:00:00','seed',TIMESTAMP'2026-04-01 10:00:00'),
 ('VN_00001','Citizen Identity Card Number (CCCD)','The 12-digit Vietnamese Citizen Identity Card number of the customer.','Approved',true,'Customer and Operations','Customer','Individual','VN','Atomic','GO_00004','VN Data Steward',1,TIMESTAMP'2025-07-01 09:00:00','seed',TIMESTAMP'2025-07-15 10:00:00'),
 ('PH_00001','Tax Identification Number (TIN)','The BIR-issued Tax Identification Number of the customer.','Pending Approval',true,'Customer and Operations','Customer','Individual','PH','Atomic',NULL,'PH Data Steward',1,TIMESTAMP'2026-11-10 09:00:00','seed',TIMESTAMP'2026-11-10 09:00:00'),
 ('MY_00001','MyKad Number','The 12-digit Malaysian identity card number of the customer.','Draft',true,'Customer and Operations','Customer','Individual','MY','Atomic','GO_00004','MY Data Steward',1,TIMESTAMP'2026-11-18 09:00:00','seed',TIMESTAMP'2026-11-18 09:00:00')
 AS s(de_id, name, description, status, cde_flag, subject_area, data_domain, data_subdomain, defined_by, de_type, parent_de_id, data_owner, version, created_at, updated_by, updated_at)
WHERE s.de_id NOT IN (SELECT de_id FROM ${catalog}.${prefix}_governance.data_elements);

INSERT INTO ${catalog}.${prefix}_governance.dq_rules (rule_id, name, status, dq_dimension, description, rule_type, rule_params, applicable_to, defined_by, parent_rule_id, threshold_pct, version, created_at, updated_by, updated_at)
SELECT * FROM VALUES
 ('GO_DQ_00005','Customer-Individual-Date of Birth-Completeness','Approved','Completeness','Cannot be empty or null','not_null_or_blank','{}','GO_00005','GO',NULL,99,1,TIMESTAMP'2024-05-10 09:00:00','seed',TIMESTAMP'2026-02-11 10:00:00'),
 ('GO_DQ_00040','Customer-Individual-Date of Birth-Validity','Approved','Validity','Must be a valid date, not in the future, and imply an age between 0 and 120','range','{"min":"1906-01-01","max_expr":"current_date()"}','GO_00005','GO',NULL,99,1,TIMESTAMP'2024-05-10 09:00:00','seed',TIMESTAMP'2026-02-11 10:00:00'),
 ('GO_DQ_00041','Customer-Individual-Gender-Validity','Approved','Validity','Can only contain data values defined in the Group or BU\'s reference data','in_reference','{"ref_set":"GENDER"}','GO_00006','GO',NULL,98,1,TIMESTAMP'2024-05-10 09:00:00','seed',TIMESTAMP'2026-02-11 10:00:00'),
 ('GO_DQ_00007','Policy-Individual Life-Policy Number-Completeness','Approved','Completeness','Cannot be empty or null, or contain only spaces','not_null_or_blank','{}','GO_00007','GO',NULL,99.9,1,TIMESTAMP'2024-05-10 09:00:00','seed',TIMESTAMP'2026-02-11 10:00:00'),
 ('GO_DQ_00072','Policy-Individual Life-Policy Number-Uniqueness','Approved','Uniqueness','Can only contain unique values','unique','{}','GO_00007','GO',NULL,99.9,1,TIMESTAMP'2024-05-10 09:00:00','seed',TIMESTAMP'2026-02-11 10:00:00'),
 ('GO_DQ_00042','Policy-Individual Life-Policy Status-Validity','Approved','Validity','Can only contain data values defined in the Group or BU\'s reference data','in_reference','{"ref_set":"POLICY_STATUS"}','GO_00008','GO',NULL,99,1,TIMESTAMP'2024-05-10 09:00:00','seed',TIMESTAMP'2026-02-11 10:00:00'),
 ('GI_DQ_00001','Investment-Holdings-Security Identifier-Completeness','Approved','Completeness','Cannot be empty or null','not_null_or_blank','{}','GI_00001','GI',NULL,99.5,1,TIMESTAMP'2024-08-01 09:00:00','seed',TIMESTAMP'2026-04-01 10:00:00'),
 ('GI_DQ_00002','Investment-Holdings-Security Identifier-Validity','Approved','Validity','Must be a 12-character ISIN: 2-letter country code, 9 alphanumerics, 1 check digit','regex','{"pattern":"^[A-Z]{2}[A-Z0-9]{9}[0-9]$"}','GI_00001','GI',NULL,99,1,TIMESTAMP'2024-08-01 09:00:00','seed',TIMESTAMP'2026-04-01 10:00:00'),
 ('GI_DQ_00003','Investment-Holdings-Market Value-Completeness','Approved','Completeness','Cannot be null','not_null_or_blank','{}','GI_00002','GI',NULL,99.5,1,TIMESTAMP'2024-08-01 09:00:00','seed',TIMESTAMP'2026-04-01 10:00:00'),
 ('GI_DQ_00004','Investment-Holdings-Asset Class-Validity','Approved','Validity','Can only contain asset classes defined in the Group investment taxonomy','in_reference','{"ref_set":"ASSET_CLASS"}','GI_00003','GI',NULL,99,1,TIMESTAMP'2024-08-01 09:00:00','seed',TIMESTAMP'2026-04-01 10:00:00'),
 ('VN_DQ_00036','Customer-Individual-Customer Identifier-Validity (VN format)','Approved','Validity','VN customer numbers are \'VN\' followed by 9 digits','regex','{"pattern":"^VN[0-9]{9}$"}','GO_00001','VN','GO_DQ_00036',98,1,TIMESTAMP'2025-07-01 09:00:00','seed',TIMESTAMP'2025-07-15 10:00:00'),
 ('PH_DQ_00036','Customer-Individual-Customer Identifier-Validity (PH format)','Approved','Validity','PH customer numbers are \'PH-\' followed by 8 digits','regex','{"pattern":"^PH-[0-9]{8}$"}','GO_00001','PH','GO_DQ_00036',98,1,TIMESTAMP'2025-07-01 09:00:00','seed',TIMESTAMP'2025-07-15 10:00:00'),
 ('MY_DQ_00036','Customer-Individual-Customer Identifier-Validity (MY format)','Pending Approval','Validity','MY customer numbers are \'MY\' followed by 10 digits','regex','{"pattern":"^MY[0-9]{10}$"}','GO_00001','MY','GO_DQ_00036',98,1,TIMESTAMP'2026-11-18 09:00:00','seed',TIMESTAMP'2026-11-18 09:00:00'),
 ('VN_DQ_00001','Customer-Individual-CCCD Number-Validity','Approved','Validity','Where ID document type is CCCD, the number must be exactly 12 digits','sql_expr','{"expr":"id_doc_type <> \'CCCD\' OR {col} RLIKE \'^[0-9]{12}$\'"}','VN_00001','VN',NULL,99,1,TIMESTAMP'2025-07-01 09:00:00','seed',TIMESTAMP'2025-07-15 10:00:00'),
 ('PH_DQ_00001','Customer-Individual-TIN-Validity','Pending Approval','Validity','TIN must be 9 or 12 digits, optionally hyphen separated (XXX-XXX-XXX[-XXX])','regex','{"pattern":"^[0-9]{3}-?[0-9]{3}-?[0-9]{3}(-?[0-9]{3})?$"}','PH_00001','PH',NULL,97,1,TIMESTAMP'2026-11-10 09:00:00','seed',TIMESTAMP'2026-11-10 09:00:00')
 AS s(rule_id, name, status, dq_dimension, description, rule_type, rule_params, applicable_to, defined_by, parent_rule_id, threshold_pct, version, created_at, updated_by, updated_at)
WHERE s.rule_id NOT IN (SELECT rule_id FROM ${catalog}.${prefix}_governance.dq_rules);

DELETE FROM ${catalog}.${prefix}_governance.cde_mapping WHERE table_fqn LIKE '${catalog}.${prefix}_bu_%' OR table_fqn LIKE '${catalog}.${prefix}_group_inv.%';
INSERT INTO ${catalog}.${prefix}_governance.cde_mapping
SELECT m.de_id, b.bu, concat('${catalog}.${prefix}_bu_', lower(b.bu), '.', m.tbl), m.col, b.src
FROM (VALUES ('GO_00001','dq_customer_mart','customer_id'),('GO_00002','dq_customer_mart','current_status'),
             ('GO_00003','dq_customer_mart','nationality'),('GO_00004','dq_customer_mart','id_doc_type'),
             ('GO_00005','dq_customer_mart','date_of_birth'),('GO_00006','dq_customer_mart','gender'),
             ('GC_00001','dq_customer_mart','nationality_status'),
             ('GO_00007','dq_policy_mart','policy_no'),('GO_00008','dq_policy_mart','policy_status')) AS m(de_id, tbl, col)
CROSS JOIN (VALUES ('VN','LifeAsia (VN)'),('PH','Ingenium (PH)'),('MY','LifeAsia (MY)')) AS b(bu, src);

INSERT INTO ${catalog}.${prefix}_governance.cde_mapping VALUES
 ('VN_00001','VN','${catalog}.${prefix}_bu_vn.dq_customer_mart','id_doc_no','LifeAsia (VN)'),
 ('PH_00001','PH','${catalog}.${prefix}_bu_ph.dq_customer_mart','tin','Ingenium (PH)'),
 ('MY_00001','MY','${catalog}.${prefix}_bu_my.dq_customer_mart','id_doc_no','LifeAsia (MY)'),
 ('GI_00001','GI','${catalog}.${prefix}_group_inv.dq_holdings_mart','isin','SimCorp Dimension'),
 ('GI_00002','GI','${catalog}.${prefix}_group_inv.dq_holdings_mart','market_value_usd','SimCorp Dimension'),
 ('GI_00003','GI','${catalog}.${prefix}_group_inv.dq_holdings_mart','asset_class','SimCorp Dimension');

INSERT INTO ${catalog}.${prefix}_governance.reference_data
SELECT s.ref_set, s.code, s.label, s.tenant, true, 'seed', current_timestamp() FROM VALUES
 ('ID_DOC_TYPE','CCCD','Citizen Identity Card (Can cuoc cong dan)','VN'),
 ('ID_DOC_TYPE','UMID','Unified Multi-Purpose ID','PH'),
 ('ID_DOC_TYPE','MYKAD','MyKad','MY')
 AS s(ref_set, code, label, tenant)
WHERE NOT EXISTS (SELECT 1 FROM ${catalog}.${prefix}_governance.reference_data r WHERE r.ref_set = s.ref_set AND r.code = s.code AND r.tenant_code = s.tenant);

DELETE FROM ${catalog}.${prefix}_governance.user_roles WHERE principal LIKE 'persona:%';
INSERT INTO ${catalog}.${prefix}_governance.user_roles VALUES
 ('persona:group-dg','GROUP_DG','GDG'),('persona:go-steward','STEWARD','GO'),('persona:vn-steward','STEWARD','VN'),
 ('persona:ph-steward','STEWARD','PH'),('persona:my-steward','STEWARD','MY'),('persona:viewer','VIEWER',NULL);

DELETE FROM ${catalog}.${prefix}_governance.audit_log WHERE actor IN ('ph.steward@aia.example','my.steward@aia.example') AND ts < TIMESTAMP'2026-11-19 00:00:00';
INSERT INTO ${catalog}.${prefix}_governance.audit_log VALUES
 (TIMESTAMP'2026-11-10 09:00:00','ph.steward@aia.example','persona:ph-steward','CREATE','DATA_ELEMENT','PH_00001','{"status":"Pending Approval"}'),
 (TIMESTAMP'2026-11-10 09:05:00','ph.steward@aia.example','persona:ph-steward','CREATE','DQ_RULE','PH_DQ_00001','{"status":"Pending Approval"}'),
 (TIMESTAMP'2026-11-18 09:00:00','my.steward@aia.example','persona:my-steward','CREATE','DATA_ELEMENT','MY_00001','{"status":"Draft"}'),
 (TIMESTAMP'2026-11-18 09:10:00','my.steward@aia.example','persona:my-steward','CREATE','DQ_RULE','MY_DQ_00036','{"status":"Pending Approval","parent":"GO_DQ_00036"}');
