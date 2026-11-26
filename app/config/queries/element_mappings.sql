-- @param v INT
-- @param de_id STRING
-- @param scope STRING
SELECT de_id, tenant_code, table_fqn, column_name, source_system FROM nicholas_aws_ws_catalog.d360_governance.cde_mapping WHERE :v >= 0 AND de_id = :de_id AND (:scope = '' OR tenant_code = :scope) ORDER BY tenant_code
