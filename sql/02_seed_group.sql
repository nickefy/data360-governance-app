-- Group seed: Group functions, AIA's Group data elements and DQ rules (verbatim from AIA's Data360 Dev, 19 Nov 2026), Group reference data.
-- Inserts only rows whose key is missing, so re-running never overwrites edits made in the app.
INSERT INTO ${catalog}.${prefix}_governance.tenants (tenant_code, tenant_name, tenant_type, intake_schema, region, intake_mode, data_catalog, onboarded_at)
SELECT s.tenant_code, s.tenant_name, s.tenant_type, NULL, s.region, NULL, NULL, current_timestamp() FROM VALUES
 ('GDG','Group Data Governance','GROUP_FUNCTION','HK'),('GO','Group Operations','GROUP_FUNCTION','HK'),
 ('GC','Group Compliance','GROUP_FUNCTION','HK'),('GI','Group Investments','GROUP_FUNCTION','HK')
 AS s(tenant_code, tenant_name, tenant_type, region)
WHERE s.tenant_code NOT IN (SELECT tenant_code FROM ${catalog}.${prefix}_governance.tenants);

INSERT INTO ${catalog}.${prefix}_governance.data_elements (de_id, name, description, status, cde_flag, subject_area, data_domain, data_subdomain, defined_by, de_type, parent_de_id, data_owner, version, created_at, updated_by, updated_at)
SELECT * FROM VALUES
 ('GO_00001','Customer Identifier','A unique identifier of a customer in a market.','Approved',true,'Customer and Operations','Customer','Individual','GO','Atomic',NULL,'Head of Group Operations Data',3,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-09-14 10:00:00'),
 ('GO_00002','Current Status','The latest status of the customer, e.g. active.','Approved',true,'Customer and Operations','Customer','Individual','GO','Atomic',NULL,'Head of Group Operations Data',2,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_00003','Nationality','Nationality/ies is a/are legal relationship(s) between the customer and a state(s)','Approved',true,'Customer and Operations','Customer','Individual','GO','Atomic',NULL,'Head of Group Operations Data',2,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_00004','Identification Document Type','The document that can be used to prove the customer\'s identity, e.g. passport and national ID card.','Approved',true,'Customer and Operations','Customer','Individual','GO','Atomic',NULL,'Head of Group Operations Data',2,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GC_00001','Nationality Status','The customer\'s legal status in the jurisdiction, e.g. citizen, permanent resident or foreigner. Used for sanctions and FATCA/CRS screening.','Approved',true,'Customer and Operations','Customer','Individual','GC','Atomic',NULL,'Group Compliance Data Lead',1,TIMESTAMP'2025-01-20 09:00:00','seed',TIMESTAMP'2026-01-20 10:00:00')
 AS s(de_id, name, description, status, cde_flag, subject_area, data_domain, data_subdomain, defined_by, de_type, parent_de_id, data_owner, version, created_at, updated_by, updated_at)
WHERE s.de_id NOT IN (SELECT de_id FROM ${catalog}.${prefix}_governance.data_elements);

INSERT INTO ${catalog}.${prefix}_governance.dq_rules (rule_id, name, status, dq_dimension, description, rule_type, rule_params, applicable_to, defined_by, parent_rule_id, threshold_pct, version, created_at, updated_by, updated_at)
SELECT * FROM VALUES
 ('GO_DQ_00001','Customer-Individual-Customer Identifier-Completeness','Approved','Completeness','Cannot be empty or null, or contain only spaces','not_null_or_blank','{}','GO_00001','GO',NULL,99.5,1,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_DQ_00036','Customer-Individual-Customer Identifier-Validity','Approved','Validity','Can only be in the format defined by the BU','regex','{"pattern":"^[A-Z]{2}-?[0-9]{8,10}$"}','GO_00001','GO',NULL,98,2,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_DQ_00071','Customer-Individual-Customer Identifier-Uniqueness','Approved','Uniqueness','Can only contain unique values','unique','{}','GO_00001','GO',NULL,99.9,1,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_DQ_00002','Customer-Individual-Current Status-Completeness','Approved','Completeness','Cannot be empty or null, or contain only spaces','not_null_or_blank','{}','GO_00002','GO',NULL,99,1,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_DQ_00037','Customer-Individual-Current Status-Validity','Approved','Validity','Can only contain data values defined in the Group or BU\'s reference data','in_reference','{"ref_set":"CUSTOMER_STATUS"}','GO_00002','GO',NULL,98,1,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_DQ_00067','Customer-Individual-Current Status-Consistency','Approved','Consistency','A customer can only be active if the customer owns or is related in any manner to an active policy','sql_expr','{"expr":"NOT ({col} = \'ACTIVE\' AND active_policy_count = 0)"}','GO_00002','GO',NULL,97,1,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_DQ_00003','Customer-Individual-Nationality-Completeness','Approved','Completeness','Cannot be empty or null, or contain only spaces','not_null_or_blank','{}','GO_00003','GO',NULL,98,1,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_DQ_00038','Customer-Individual-Nationality-Validity','Approved','Validity','Can only contain data values defined in the Group or BU\'s reference data, i.e. all possible valid country/jurisdiction names/codes excluding \'Other\' and \'Unknown\', etc.','in_reference','{"ref_set":"NATIONALITY","exclude":["OTHER","UNKNOWN"]}','GO_00003','GO',NULL,97,1,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_DQ_00663','Customer-Individual-Nationality Status-Completeness','Approved','Completeness','Cannot be empty or null, or contain only spaces','not_null_or_blank','{}','GC_00001','GC',NULL,98,1,TIMESTAMP'2025-01-20 09:00:00','seed',TIMESTAMP'2026-01-20 10:00:00'),
 ('GO_DQ_00697','Customer-Individual-Nationality-Validity','Approved','Validity','Can only contain data values defined in the Group or BU\'s reference data, i.e. all possible valid country/jurisdiction names/codes excluding \'Other\' and \'Unknown\', etc.','in_reference','{"ref_set":"NATIONALITY","exclude":["OTHER","UNKNOWN"]}','GO_00003','GC',NULL,99,1,TIMESTAMP'2025-01-20 09:00:00','seed',TIMESTAMP'2026-01-20 10:00:00'),
 ('GO_DQ_00705','Customer-Individual-Nationality Status-Validity','Approved','Validity','Can only contain data values defined in the Group or BU\'s reference data','in_reference','{"ref_set":"NATIONALITY_STATUS"}','GC_00001','GC',NULL,98,1,TIMESTAMP'2025-01-20 09:00:00','seed',TIMESTAMP'2026-01-20 10:00:00'),
 ('GO_DQ_00004','Customer-Individual-Identification Document Type-Completeness','Approved','Completeness','Cannot be empty or null, or contain only spaces','not_null_or_blank','{}','GO_00004','GO',NULL,99,1,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_DQ_00039','Customer-Individual-Identification Document Type-Validity','Approved','Validity','Can only contain data values defined in the Group or BU\'s reference data, i.e. all possible valid identification document types/codes excluding \'Other\' and \'Unknown\', etc.','in_reference','{"ref_set":"ID_DOC_TYPE","exclude":["OTHER","UNKNOWN"]}','GO_00004','GO',NULL,97,1,TIMESTAMP'2024-03-01 09:00:00','seed',TIMESTAMP'2026-06-02 10:00:00'),
 ('GO_DQ_00698','Customer-Individual-Identification Document Type-Validity','Approved','Validity','Can only contain data values defined in the Group or BU\'s reference data, i.e. all possible valid identification document types/codes excluding \'Other\' and \'Unknown\', etc.','in_reference','{"ref_set":"ID_DOC_TYPE","exclude":["OTHER","UNKNOWN"]}','GO_00004','GC',NULL,99,1,TIMESTAMP'2025-01-20 09:00:00','seed',TIMESTAMP'2026-01-20 10:00:00')
 AS s(rule_id, name, status, dq_dimension, description, rule_type, rule_params, applicable_to, defined_by, parent_rule_id, threshold_pct, version, created_at, updated_by, updated_at)
WHERE s.rule_id NOT IN (SELECT rule_id FROM ${catalog}.${prefix}_governance.dq_rules);

INSERT INTO ${catalog}.${prefix}_governance.reference_data
SELECT s.ref_set, s.code, s.label, s.tenant, true, 'seed', current_timestamp() FROM VALUES
 ('NATIONALITY','VN','Vietnam','GROUP'),
 ('NATIONALITY','PH','Philippines','GROUP'),
 ('NATIONALITY','MY','Malaysia','GROUP'),
 ('NATIONALITY','SG','Singapore','GROUP'),
 ('NATIONALITY','HK','Hong Kong SAR','GROUP'),
 ('NATIONALITY','CN','China','GROUP'),
 ('NATIONALITY','TH','Thailand','GROUP'),
 ('NATIONALITY','ID','Indonesia','GROUP'),
 ('NATIONALITY','TW','Taiwan','GROUP'),
 ('NATIONALITY','US','United States','GROUP'),
 ('NATIONALITY','GB','United Kingdom','GROUP'),
 ('NATIONALITY','AU','Australia','GROUP'),
 ('NATIONALITY','IN','India','GROUP'),
 ('NATIONALITY','JP','Japan','GROUP'),
 ('NATIONALITY','KR','Korea','GROUP'),
 ('NATIONALITY','OTHER','Other','GROUP'),
 ('NATIONALITY','UNKNOWN','Unknown','GROUP'),
 ('CUSTOMER_STATUS','ACTIVE','Active','GROUP'),
 ('CUSTOMER_STATUS','INACTIVE','Inactive','GROUP'),
 ('CUSTOMER_STATUS','LAPSED','Lapsed','GROUP'),
 ('CUSTOMER_STATUS','DECEASED','Deceased','GROUP'),
 ('CUSTOMER_STATUS','PROSPECT','Prospect','GROUP'),
 ('ID_DOC_TYPE','PASSPORT','Passport','GROUP'),
 ('ID_DOC_TYPE','NATIONAL_ID','National ID card','GROUP'),
 ('ID_DOC_TYPE','BIRTH_CERT','Birth certificate','GROUP'),
 ('ID_DOC_TYPE','DRIVING_LICENCE','Driving licence','GROUP'),
 ('ID_DOC_TYPE','OTHER','Other','GROUP'),
 ('ID_DOC_TYPE','UNKNOWN','Unknown','GROUP'),
 ('NATIONALITY_STATUS','CITIZEN','Citizen','GROUP'),
 ('NATIONALITY_STATUS','PERMANENT_RESIDENT','Permanent resident','GROUP'),
 ('NATIONALITY_STATUS','FOREIGNER','Foreigner','GROUP'),
 ('GENDER','M','Male','GROUP'),
 ('GENDER','F','Female','GROUP'),
 ('GENDER','U','Unspecified','GROUP'),
 ('POLICY_STATUS','IF','In force','GROUP'),
 ('POLICY_STATUS','LA','Lapsed','GROUP'),
 ('POLICY_STATUS','SU','Surrendered','GROUP'),
 ('POLICY_STATUS','MA','Matured','GROUP'),
 ('POLICY_STATUS','CL','Claimed','GROUP'),
 ('ASSET_CLASS','EQUITY','Equity','GROUP'),
 ('ASSET_CLASS','FIXED_INCOME','Fixed income','GROUP'),
 ('ASSET_CLASS','CASH','Cash & equivalents','GROUP'),
 ('ASSET_CLASS','PROPERTY','Property','GROUP'),
 ('ASSET_CLASS','ALTERNATIVES','Alternatives','GROUP')
 AS s(ref_set, code, label, tenant)
WHERE NOT EXISTS (SELECT 1 FROM ${catalog}.${prefix}_governance.reference_data r WHERE r.ref_set = s.ref_set AND r.code = s.code AND r.tenant_code = s.tenant);
