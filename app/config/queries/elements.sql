-- @param v INT
-- @param scope STRING
-- @param q STRING
-- @param domain STRING
-- @param status STRING
-- @param owner STRING
-- @param cde STRING
WITH rc AS (SELECT trim(x) AS de_id, count(*) AS rule_count FROM nicholas_aws_ws_catalog.d360_governance.dq_rules LATERAL VIEW explode(split(applicable_to, ',')) e AS x GROUP BY 1),
mc AS (SELECT de_id, count(*) AS mapping_count, concat_ws(', ', sort_array(collect_set(tenant_code))) AS mapped_tenants FROM nicholas_aws_ws_catalog.d360_governance.cde_mapping GROUP BY 1),
lr AS (SELECT de_id, round(100.0 * sum(passed_rows) / sum(total_rows), 2) AS pass_pct, count_if(result_status = 'FAIL') AS failing
       FROM nicholas_aws_ws_catalog.d360_governance.dq_results WHERE (run_id, tenant_code) IN (SELECT max_by(run_id, run_ts), tenant_code FROM nicholas_aws_ws_catalog.d360_governance.dq_results GROUP BY period, tenant_code) AND period = (SELECT max(period) FROM nicholas_aws_ws_catalog.d360_governance.dq_results) GROUP BY 1)
SELECT d.de_id, d.name, d.description, d.status, d.cde_flag, d.subject_area, d.data_domain, d.data_subdomain, d.defined_by,
       t.tenant_name AS defined_by_name, d.de_type, d.parent_de_id, d.data_owner, d.version, d.updated_by,
       CAST(d.updated_at AS STRING) AS updated_at,
       coalesce(rc.rule_count, 0) AS rule_count, coalesce(mc.mapping_count, 0) AS mapping_count, mc.mapped_tenants, lr.pass_pct, coalesce(lr.failing, 0) AS failing
FROM nicholas_aws_ws_catalog.d360_governance.data_elements d
LEFT JOIN nicholas_aws_ws_catalog.d360_governance.tenants t ON t.tenant_code = d.defined_by
LEFT JOIN rc USING (de_id) LEFT JOIN mc USING (de_id) LEFT JOIN lr USING (de_id)
WHERE :v >= 0 AND (:scope = '' OR defined_by = :scope OR defined_by IN (SELECT tenant_code FROM nicholas_aws_ws_catalog.d360_governance.tenants WHERE tenant_type = 'GROUP_FUNCTION'))
  AND (:q = '' OR lower(concat_ws(' ', d.de_id, d.name, d.description)) LIKE lower(concat('%', :q, '%')))
  AND (:domain = '' OR d.data_domain = :domain)
  AND (:status = '' OR d.status = :status)
  AND (:owner = '' OR d.defined_by = :owner)
  AND (:cde = '' OR CAST(d.cde_flag AS STRING) = :cde)
ORDER BY d.de_id
