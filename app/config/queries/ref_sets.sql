-- @param v INT
SELECT ref_set, count(*) AS codes, count_if(tenant_code <> 'GROUP') AS bu_extensions, count_if(NOT active) AS inactive
FROM nicholas_aws_ws_catalog.d360_governance.reference_data WHERE :v >= 0 GROUP BY ref_set ORDER BY ref_set
