-- @param v INT
-- @param batch_id STRING
WITH i AS (SELECT tenant_code, batch_id, submitted_by, submitted_at, object_type, object_id, name FROM nicholas_aws_ws_catalog.d360_governance.v_intake),
rv AS (SELECT batch_id, object_id, max_by(decision, reviewed_at) AS decision, max_by(reviewer, reviewed_at) AS reviewer FROM nicholas_aws_ws_catalog.d360_governance.submission_reviews GROUP BY ALL)
SELECT i.tenant_code, i.batch_id, i.object_type, i.object_id, i.name, coalesce(rv.decision, 'PENDING') AS decision, rv.reviewer,
       (d.de_id IS NOT NULL OR q.rule_id IS NOT NULL) AS exists_in_registry
FROM i LEFT JOIN rv ON rv.batch_id = i.batch_id AND rv.object_id = i.object_id
LEFT JOIN nicholas_aws_ws_catalog.d360_governance.data_elements d ON i.object_type = 'DATA_ELEMENT' AND d.de_id = i.object_id
LEFT JOIN nicholas_aws_ws_catalog.d360_governance.dq_rules q ON i.object_type = 'DQ_RULE' AND q.rule_id = i.object_id
WHERE :v >= 0 AND i.batch_id = :batch_id ORDER BY i.object_type, i.object_id
