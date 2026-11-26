-- @param v INT
SELECT 'domain' AS facet, data_domain AS value FROM nicholas_aws_ws_catalog.d360_governance.data_elements WHERE :v >= 0 AND data_domain IS NOT NULL GROUP BY 2
UNION ALL SELECT 'subject_area', subject_area FROM nicholas_aws_ws_catalog.d360_governance.data_elements WHERE subject_area IS NOT NULL GROUP BY 2
UNION ALL SELECT 'subdomain', data_subdomain FROM nicholas_aws_ws_catalog.d360_governance.data_elements WHERE data_subdomain IS NOT NULL GROUP BY 2
UNION ALL SELECT 'period', period FROM nicholas_aws_ws_catalog.d360_governance.dq_results GROUP BY 2
UNION ALL SELECT 'ref_set', ref_set FROM nicholas_aws_ws_catalog.d360_governance.reference_data GROUP BY 2
UNION ALL SELECT 'table', table_fqn FROM nicholas_aws_ws_catalog.d360_governance.cde_mapping GROUP BY 2
ORDER BY 1, 2
