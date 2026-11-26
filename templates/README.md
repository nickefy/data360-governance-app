# Standard BU templates (v1)

One CSV per object type. The same columns are used three ways:

| Channel | How |
|---|---|
| **Bulk upload in the app** (Group-hosted BUs and Group functions) | *Bulk Upload* page → upload the CSV → row-by-row validation → submit |
| **BU workspace intake tables** (Delta Sharing BUs) | load the rows into `intake_data_elements` / `intake_dq_rules` in the BU workspace (see `sql/delta_sharing/bu_workspace_share.sql`) |
| **Data360 migration** | export the Data360 glossary / rule library into these columns, then bulk upload as Group Data Governance |

Rules for valid rows (enforced by the app):
- IDs start with the owning tenant code: `TH_00001`, `TH_DQ_00036`.
- `Applicable To` lists existing data element IDs, comma-separated.
- `Rule Type` is one of `not_null_or_blank`, `regex`, `in_reference`, `unique`, `range`, `sql_expr`. `Rule Params` is JSON:
  `regex` needs `{"pattern": "..."}`, `in_reference` needs `{"ref_set": "...", "exclude": [...]}`, `range` takes `{"min": ..., "max": ... | "max_expr": "current_date()"}`,
  `sql_expr` needs `{"expr": "... {col} ..."}` (a boolean expression over the mart row; `{col}` is the mapped column).
- `Parent Rule ID` marks a BU customisation of a Group rule (e.g. the BU's own customer-number format for `GO_DQ_00036`). Once approved, the DQ engine runs the BU version on that BU's data.
- `physical_table` / `physical_column` (optional) map the element to the BU's DQ mart column; the mapping is created when Group approves.
