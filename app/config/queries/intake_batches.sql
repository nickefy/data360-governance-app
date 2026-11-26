-- @param v INT
-- @param scope STRING
-- BU submissions: v_intake unions every onboarded BU's intake tables (Group-hosted schemas or Delta Sharing catalogs)
WITH i AS (SELECT tenant_code, batch_id, submitted_by, submitted_at, object_type, object_id, name FROM nicholas_aws_ws_catalog.d360_governance.v_intake),
rv AS (SELECT batch_id, object_id, max_by(decision, reviewed_at) AS decision FROM nicholas_aws_ws_catalog.d360_governance.submission_reviews GROUP BY ALL)
SELECT i.tenant_code, i.batch_id, i.submitted_by, CAST(max(i.submitted_at) AS STRING) AS submitted_at,
       count_if(i.object_type = 'DATA_ELEMENT') AS elements, count_if(i.object_type = 'DQ_RULE') AS rules,
       count_if(rv.decision IS NULL) AS pending, count_if(rv.decision = 'APPROVED') AS approved, count_if(rv.decision = 'REJECTED') AS rejected
FROM i LEFT JOIN rv ON rv.batch_id = i.batch_id AND rv.object_id = i.object_id
WHERE :v >= 0 AND (:scope = '' OR i.tenant_code = :scope)
GROUP BY i.tenant_code, i.batch_id, i.submitted_by ORDER BY submitted_at DESC
