-- @param v INT
SELECT tenant_code, tenant_name, tenant_type FROM nicholas_aws_ws_catalog.d360_governance.tenants WHERE :v >= 0 ORDER BY tenant_type DESC, tenant_code
