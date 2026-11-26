-- @param v INT
-- @param de_id STRING
SELECT q.rule_id, q.name, q.status, q.dq_dimension, q.description, q.rule_type, q.rule_params, q.defined_by, q.parent_rule_id, q.threshold_pct
FROM nicholas_aws_ws_catalog.d360_governance.dq_rules q
WHERE :v >= 0 AND array_contains(transform(split(q.applicable_to, ','), x -> trim(x)), :de_id)
ORDER BY coalesce(q.parent_rule_id, q.rule_id), q.parent_rule_id NULLS FIRST
