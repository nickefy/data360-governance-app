-- @param v INT
-- @param ref_set STRING
SELECT ref_set, code, label, tenant_code, active, updated_by, CAST(updated_at AS STRING) AS updated_at
FROM nicholas_aws_ws_catalog.d360_governance.reference_data WHERE :v >= 0 AND (:ref_set = '' OR ref_set = :ref_set) ORDER BY ref_set, tenant_code <> 'GROUP', code
