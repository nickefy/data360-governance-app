# Data360 Governance Platform: New BU Onboarding Guide

This guide adds one Business Unit (or Group function) to a deployed platform ([DEPLOYMENT.md](DEPLOYMENT.md)).
Onboarding is **configuration, not code**: one job run plus content in the app. No redeploy is needed, and the app
picks up the new BU within a minute.

Example used throughout: **AIA Thailand, `TH`**, prod target, Group catalog `d360`, prefix `d360`.

---

## Prerequisites

- [ ] Platform deployed and `d360_setup` has succeeded in the Group governance workspace.
- [ ] The BU's **DQ data marts** exist as Delta tables in Unity Catalog, in the BU's own workspace (typical) or already in the Group workspace. One row per customer / policy / holding, one column per data element.
- [ ] You know the BU's stewards (emails) and the BU code (2–8 letters/digits, used as the ID prefix: `TH_00001`, `TH_DQ_00036`).
- [ ] Delta Sharing mode only: a BU metastore admin who can `CREATE SHARE` / `CREATE RECIPIENT`, and a Group metastore admin who can `CREATE CATALOG ... USING SHARE`.

## Step 1: Choose how the BU submits content

| | **GROUP_HOSTED** (default, fastest) | **DELTA_SHARE** (BU owns its intake) |
|---|---|---|
| Where intake tables live | Group workspace: `d360.d360_intake_th` (created by the job) | BU workspace, shared read-only to Group |
| How stewards submit | *Bulk Upload* in the governance app | Insert the standard template into their own intake tables (SQL, notebook, or their tools) |
| Where the DQ marts live | Either: the Group workspace, or a share | Usually the same share as the intake tables |
| Good for | First BUs, PoC, BUs without their own Databricks workspace | BUs with their own workspace and pipelines; residency-sensitive markets |

Both modes end in the same Group review (*Approvals & BU Intake*), and you can switch modes later by re-running the job.

## Step 2: Delta Sharing setup (DELTA_SHARE mode, or when marts are in the BU workspace)

### In the BU workspace (BU data team)

Run [sql/delta_sharing/bu_workspace_share.sql](sql/delta_sharing/bu_workspace_share.sql) with the placeholders filled in. It:
1. Creates `intake_data_elements` / `intake_dq_rules` in the standard format (skip this if you use GROUP_HOSTED intake).
2. Creates share `d360_th_to_group` with the intake tables and the DQ marts.
3. Creates a recipient for the Group metastore (`SELECT CURRENT_METASTORE()` in the Group workspace gives the sharing identifier) and grants it the share.

### In the Group governance workspace (Group metastore admin)

Run [sql/delta_sharing/group_workspace_mount.sql](sql/delta_sharing/group_workspace_mount.sql):

```sql
CREATE CATALOG IF NOT EXISTS aia_th_shared USING SHARE `<bu_provider>`.d360_th_to_group;
SELECT count(*) FROM aia_th_shared.<bu_schema>.intake_data_elements;   -- must succeed
SELECT count(*) FROM aia_th_shared.<bu_schema>.dq_customer_mart;       -- must return rows
```

Then make the prod deployer service principal the owner of `aia_th_shared`, or grant it `MANAGE`, so the onboarding job can grant read access to the app and the DQ engine:

```sql
ALTER CATALOG aia_th_shared OWNER TO `<prod-deployer-sp-application-id>`;
```

## Step 3: Run the onboarding job

**GROUP_HOSTED**, with marts already in the Group workspace or in a share:

```bash
databricks bundle run d360_onboard_bu -t prod -p aia-prod \
  --params bu_code=TH,bu_name="AIA Thailand",region=TH,stewards="somchai.p@aia.com,nicha.k@aia.com",data_catalog=aia_th_shared
```

**DELTA_SHARE:**

```bash
databricks bundle run d360_onboard_bu -t prod -p aia-prod \
  --params bu_code=TH,bu_name="AIA Thailand",region=TH,intake_mode=DELTA_SHARE,intake_schema=aia_th_shared.<bu_schema>,data_catalog=aia_th_shared,stewards="somchai.p@aia.com"
```

| Parameter | Meaning |
|---|---|
| `bu_code` / `bu_name` / `region` | Tenant identity. `bu_code` becomes the ID prefix |
| `intake_mode` | `GROUP_HOSTED` (default) or `DELTA_SHARE` |
| `intake_schema` | DELTA_SHARE: `<shared_catalog>.<schema>` holding the intake tables. GROUP_HOSTED: optional override of `<catalog>.<prefix>_intake_<bu>` |
| `data_catalog` | Catalog holding the BU's DQ marts, if different from the platform catalog. The app and DQ engine get read-only access to it |
| `stewards` | Comma-separated emails, added as `STEWARD` for this BU (users auth mode) |

The job output lists every step (`ok   tenant TH registered (GROUP_HOSTED)`, `ok   v_intake rebuilt over N BU(s)`, grants). Re-running it is safe; it updates the tenant in place.

## Step 4: BU reference data

Validity rules such as `GO_DQ_00039` (ID document type) check values against **Group code sets plus the BU's own codes**.
As the TH steward (or Group DG), open *Reference Data* and add the BU's local codes, for example `ID_DOC_TYPE / THAI_ID`.
Without them, valid local values fail the Group rules.

## Step 5: Map the CDEs to the BU's mart columns

The DQ engine only checks elements that are mapped to a physical column. For each CDE that applies to the BU:

- *Data Elements → element → Physical mapping & lineage → Add mapping*: tenant `TH`, table `aia_th_shared.<schema>.dq_customer_mart`, column `customer_id`; or
- include `physical_table` / `physical_column` in the BU's data element template rows (the mapping is created on approval); or, in bulk:

```sql
INSERT INTO d360.d360_governance.cde_mapping VALUES
 ('GO_00001','TH','aia_th_shared.agency.dq_customer_mart','customer_id','Ingenium (TH)'),
 ('GO_00002','TH','aia_th_shared.agency.dq_customer_mart','current_status','Ingenium (TH)'),
 ('GO_00003','TH','aia_th_shared.agency.dq_customer_mart','nationality','Ingenium (TH)'),
 ('GO_00004','TH','aia_th_shared.agency.dq_customer_mart','id_doc_type','Ingenium (TH)');
```

Mart conventions the engine relies on:
- One column per mapped element. Column names are free; the mapping says which is which.
- A `src_row_id` column is recommended. It identifies failing rows in the samples; otherwise the first column is used.
- Columns referenced by `sql_expr` rules must exist. For example `GO_DQ_00067` uses `active_policy_count`.

Once mapped, the *Physical Lineage* page shows the column's Unity Catalog lineage. For shared tables, lineage is visible up to the share; upstream lineage stays in the BU workspace.

## Step 6: BU rule customisations and local rules

Group rules apply to every BU automatically. Where the BU's format differs, the steward creates a **customisation**
(*DQ Rules → Group rule → Customise for TH*, or `Parent Rule ID` in the template), for example `TH_DQ_00036` overriding
`GO_DQ_00036` with `^TH[0-9]{10}$`. BU-local elements and rules (`TH_00001`, `TH_DQ_00001`) go in the same way.

BU changes arrive as **Pending Approval**. Group Data Governance approves them under *Approvals & BU Intake*: individual items, or a whole bulk batch, which is merged into the registry. Once approved, the DQ engine runs the BU version on TH data and the Group version on everyone else.

## Step 7: First run

```bash
databricks bundle run dq_engine -t prod -p aia-prod --params tenant=TH,period=2026-11
```

Or *Overview → Run DQ assessment now* (a BU steward's run is scoped to their BU). The run output prints one line per check:

```
GO_DQ_00036    TH customer_id           99.12% (thr 98.0)     <- runs TH_DQ_00036 once approved
RUN-2026-11-3fa2c1: 14/14 checks in 24.0s
```

## Step 8: Verify

```sql
SELECT tenant_code, intake_mode, intake_schema, data_catalog FROM d360.d360_governance.tenants WHERE tenant_code = 'TH';
SELECT * FROM d360.d360_governance.user_roles WHERE tenant_code = 'TH';
SELECT count(*) FROM d360.d360_governance.cde_mapping WHERE tenant_code = 'TH';
SELECT rule_id, effective_rule_id, column_name, pass_pct, result_status
FROM d360.d360_governance.dq_results WHERE tenant_code = 'TH' ORDER BY run_ts DESC, pass_pct LIMIT 20;
```

In the app as the TH steward: the sidebar shows `STEWARD · TH`, *Bulk Upload* names the TH intake table (or says the BU submits from its own workspace), and *Rule Results* filters to TH.

---

## Summary

| Step | Who | Typical time |
|---|---|---|
| 1. Choose intake mode | Group DG + BU data lead | 15 min |
| 2. Delta Share + mount (if used) | BU platform team + Group metastore admin | 30–60 min |
| 3. Run `d360_onboard_bu` | Group platform team (1 command) | 5 min |
| 4. BU reference codes | BU steward (app) | 15–30 min |
| 5. Map CDEs to mart columns | BU steward or Group DG (app or SQL) | 30–60 min |
| 6. BU customisations, local rules, approval | BU steward → Group DG (app) | depends on content |
| 7–8. First run and verify | Group DG | 15 min |

## Changing or removing a BU

- **Change settings** (steward list, mode, schema): re-run `d360_onboard_bu` with the new parameters.
- **Remove a steward:** `DELETE FROM d360.d360_governance.user_roles WHERE principal = '...'`.
- **Offboard:** delete the BU's mappings (`cde_mapping WHERE tenant_code = 'TH'`) so the engine stops checking it, and clear `tenants.intake_schema`. Then re-run `d360_setup` (or the onboard job for another BU) to rebuild `v_intake`. Results history is kept.

## Appendix: DQ engine inside a residency-restricted BU (design option, not yet tested)

If a market's data may not leave its workspace, deploy the same bundle to that BU's workspace with `load_demo_data: "false"`, using a target such as `bu_id` with its own catalog. Run its DQ engine there against the local marts, and share only `<prefix>_governance.dq_results` and `dq_failed_samples` (without values, if required) back to Group. Group then reads those results alongside its own. This keeps rules centrally governed while execution stays in-country.
