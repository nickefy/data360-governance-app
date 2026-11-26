-- @param v INT
-- @param q STRING
SELECT CAST(ts AS STRING) AS ts, actor, persona, action, object_type, object_id, details FROM nicholas_aws_ws_catalog.d360_governance.audit_log
WHERE :v >= 0 AND (:q = '' OR lower(concat_ws(' ', actor, persona, action, object_type, object_id, details)) LIKE lower(concat('%', :q, '%')))
ORDER BY ts DESC LIMIT 200
