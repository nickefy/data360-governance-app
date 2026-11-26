-- @param v INT
-- @param scope STRING
SELECT 'DATA_ELEMENT' AS object_type, de_id AS object_id, name, status, defined_by, updated_by, CAST(updated_at AS STRING) AS updated_at, parent_de_id AS parent_id, description
FROM nicholas_aws_ws_catalog.d360_governance.data_elements WHERE :v >= 0 AND status IN ('Pending Approval', 'Draft') AND (:scope = '' OR defined_by = :scope)
UNION ALL
SELECT 'DQ_RULE', rule_id, name, status, defined_by, updated_by, CAST(updated_at AS STRING), parent_rule_id, description
FROM nicholas_aws_ws_catalog.d360_governance.dq_rules WHERE :v >= 0 AND status IN ('Pending Approval', 'Draft') AND (:scope = '' OR defined_by = :scope)
ORDER BY 7 DESC
