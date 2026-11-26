# Data360 Governance Platform: Deployment Guide (Azure Databricks)

This guide installs the platform into a customer's **Azure Databricks** workspace: the Group governance registry, the
governance app, the DQ engine and the setup/onboarding jobs. Everything is one Databricks Asset Bundle
(`databricks.yml`). All compute is serverless, so nothing in the bundle depends on Azure VM types and the same bundle runs on AWS or GCP.

Onboarding each BU afterwards is a separate, repeatable step: see [ONBOARDING.md](ONBOARDING.md).

## Architecture overview

```
BU workspace (per BU)                         Group governance workspace (this deployment)
─────────────────────                         ─────────────────────────────────────────────────────────────
Core systems → DQ data marts (Delta) ──┐      aia_<bu>_shared  (Delta Sharing catalog, read-only)
Intake tables (standard template)  ────┼──►     ├─ intake_data_elements / intake_dq_rules
                       Delta Share     │        └─ dq_customer_mart, dq_policy_mart, ...
                                       │                │
 (or: BU stewards upload the template  │      <catalog>.<prefix>_intake_<bu>   (Group-hosted intake, optional)
  in the app → Group-hosted intake) ───┘                │
                                                        ▼  v_intake (all BUs)
                                         <catalog>.<prefix>_governance  ◄── Governance app (Databricks App)
                                           data_elements · dq_rules · cde_mapping · reference_data     │
                                           dq_runs · dq_results · dq_failed_samples · audit_log        │ run
                                                        ▲                                              ▼
                                                        └──────────── dq_engine job (serverless, monthly + on demand)
                                                                       reads mapped BU columns, writes dq_results
                                                        Consumption: app · AI/BI dashboards · Genie · Power BI/Tableau
```

Architecture diagram: `deck/diagrams/data360-governance-architecture.png` (editable `.drawio` alongside). More detail: [ARCHITECTURE.md](ARCHITECTURE.md).

| Bundle resource | Name in workspace | What it does |
|---|---|---|
| `jobs.d360_setup` | `d360-setup` | Creates or upgrades the registry, seeds AIA Group content, rebuilds `v_intake`, grants the app, adds first admins. Idempotent: re-run after every upgrade |
| `jobs.d360_onboard_bu` | `d360-onboard-bu` | Registers one BU: intake tables (Group-hosted or Delta Sharing), stewards, grants |
| `jobs.dq_engine` | `data360-dq-engine` | Monthly DQ assessment (02:00 HKT on the 1st) and on-demand runs from the app |
| `apps.app` | `data360-governance` | Governance UI and API (AppKit: React + Node). Reads and writes Delta through the SQL warehouse |

---

## Prerequisites

**Workspace (Azure)**
- [ ] Azure Databricks **Premium** workspace attached to a **Unity Catalog** metastore.
- [ ] **Serverless compute for jobs** and **Databricks Apps** enabled in the workspace and available in its region (e.g. East Asia / Southeast Asia). Check *Settings → Compute* and *Compute → Apps*. If serverless jobs are not allowed, see [Classic compute fallback](#classic-compute-fallback).
- [ ] A **serverless SQL warehouse** (Small is enough to start; the app and AI/BI dashboards share it). Note its ID: *SQL Warehouses → warehouse → Connection details*. `CAN_USE` on the warehouse is enough for the deployer. Use a Pro/serverless warehouse, not a Real-Time one: Real-Time warehouses don't support `SHOW GRANTS` and other statements used in step 6.
- [ ] A **catalog** for the platform, e.g. `d360` (prod) and `d360_dev` (dev). The setup job creates schemas inside it but does not create the catalog. Use a plain name: letters, digits and underscores, no hyphens.
- [ ] **Outbound access to the npm registry** from the Apps build (`registry.npmjs.org`): Databricks Apps installs the app's Node packages at deploy time. If serverless egress is restricted (network policies or a firewall), allow it, or mirror the packages to an internal registry first.
- [ ] Private Link or IP access lists, if used: make sure users can reach `*.azuredatabricksapps.com` (or your private DNS equivalent) to open the app.

**Identity (Entra ID)**
- [ ] Users and groups synced into the account with SCIM (for example `d360-platform-admins` and `d360-group-dg`).
- [ ] **Prod:** an Entra ID service principal (the *deployer*) added to the workspace. The prod target deploys with it and runs the jobs as it. It needs:
  - `USE CATALOG`, `CREATE SCHEMA` on the platform catalog. It then owns the schemas it creates, which lets it grant them to the app.
  - Workspace permission to create jobs and apps (workspace user, plus *Databricks Apps* access).
  - For each BU Delta Sharing catalog: ownership or `MANAGE`, so it can grant read access to the app and the DQ job (see ONBOARDING.md).

**Laptop / CI runner**
- [ ] A recent Databricks CLI (tested with **v1.17**; `databricks -v`), authenticated to the workspace, for example `databricks auth login --host https://adb-<id>.<n>.azuredatabricks.net --profile aia-dev`.
- [ ] Python 3.10+ (only for `scripts/configure_app.py`; no packages needed).
- [ ] Node.js is **not** needed: the app is built on the Databricks Apps platform.

---

## 1. Configure the bundle targets

Edit the `dev` and `prod` targets in [databricks.yml](databricks.yml):

```yaml
targets:
  dev:
    mode: development
    default: true
    variables:
      catalog: d360_dev                    # your dev catalog
      warehouse_id: "<dev-sql-warehouse-id>"
      app_name: d360-governance
      auth_mode: demo                      # persona switcher for testers
      load_demo_data: "true"               # simulated VN / PH / MY BUs so the app is usable on day one

  prod:
    mode: production
    workspace:
      root_path: /Workspace/Shared/.bundle/${bundle.name}/${bundle.target}
    run_as:
      service_principal_name: "<prod-deployer-sp-application-id>"
    variables:
      catalog: d360
      warehouse_id: "<prod-sql-warehouse-id>"
      auth_mode: users                     # roles from <prefix>_governance.user_roles by signed-in email
      load_demo_data: "false"
      admins: "jane.doe@aia.com,john.tan@aia.com"   # first Group Data Governance admins
      dq_schedule: UNPAUSED
      runner: "<prod-deployer-sp-application-id>"
```

| Variable | Meaning |
|---|---|
| `catalog` | Catalog holding the platform schemas (must exist) |
| `schema_prefix` | Default `d360`. Schemas created: `<prefix>_governance`, one `<prefix>_intake_<bu>` per Group-hosted BU, and `<prefix>_bu_*` / `<prefix>_snapshot` in demo mode only. Change it to install twice in one catalog or to follow a naming standard |
| `warehouse_id` | SQL warehouse the app uses |
| `app_name` | App name, 30 characters or fewer |
| `auth_mode` | `users` (production): each signed-in user gets the role recorded in `user_roles`; unknown users are read-only. `demo`: a persona switcher, for testing only |
| `load_demo_data` | `"true"` loads simulated BUs, marts and history. **Never in prod** |
| `admins` | Emails bootstrapped as Group Data Governance admins (they manage everyone else in the app's registry) |
| `dq_schedule` | `PAUSED` / `UNPAUSED` for the monthly run |
| `runner` | Principal the jobs run as. It receives the same grants as the app so the DQ engine can read BU marts |

The workspace host is taken from your CLI profile, so the same target works for any workspace: `-p aia-dev`.

**Without editing the file (CI, or a quick new environment):** pass the same `--var` overrides to every command. For example, this is the exact sequence used to test a clean install into a new environment:

```bash
V=(--var catalog=d360_dev --var schema_prefix=d360 --var warehouse_id=<id> --var admins=you@aia.com)   # zsh/bash array
python3 scripts/configure_app.py -t dev -p aia-dev "${V[@]}"
databricks bundle deploy          -t dev -p aia-dev "${V[@]}"
databricks bundle run d360_setup  -t dev -p aia-dev "${V[@]}"
```

From a clean checkout, `bundle validate` prints 7 *"Pattern ... does not match any files"* warnings for the `sync.exclude` entries (node_modules, dist, .env, deck). These are harmless.

## 2. Point the app at the target

The app's SQL files name the registry explicitly. Write the target's catalog, prefix and auth mode into `app/`:

```bash
python3 scripts/configure_app.py -t dev -p aia-dev
# app configured: registry d360_dev.d360_governance, auth_mode demo (22 query files updated, app.yaml written)
```

Run this before every deploy to a different target. In CI, run it as the step before `bundle deploy`.

## 3. Deploy the bundle

```bash
databricks bundle validate -t dev -p aia-dev
databricks bundle deploy   -t dev -p aia-dev
```

This uploads the code and creates the four resources. The app builds on the Apps platform (about 2–3 minutes) and starts. It shows errors until step 4 has created the registry, which is expected.

## 4. Run the setup job

```bash
databricks bundle run d360_setup -t dev -p aia-dev
```

| Task | What happens |
|---|---|
| `registry` | `sql/01_schema.sql`: creates `<prefix>_governance` and all tables (`CREATE ... IF NOT EXISTS`; nothing is ever dropped). `sql/02_seed_group.sql`: Group functions (GDG, GO, GC, GI), AIA's Group data elements `GO_00001–4` and `GC_00001`, AIA's 14 `GO_DQ_*` rules, Group reference data. Only missing keys are inserted, so edits made in the app survive re-runs |
| `is_demo` → `demo_*` | Only when `load_demo_data = "true"`: simulated BU schemas and marts, a first DQ run, simulated history |
| `finalize` | Rebuilds `v_intake` from the tenants table, grants the app service principal (and `runner`) `USE CATALOG` + `USE SCHEMA, SELECT, MODIFY, APPLY TAG` on the registry and intake schemas, adds the `admins` |
| `demo_snapshot` | Demo only: snapshot for the `d360_reset_demo` job |

Typical run: 1–2 minutes (prod), 3–4 minutes (with demo data). In `mode: development` targets (`dev`), the jobs appear as `[dev <your name>] d360-setup` etc. and job schedules are paused automatically; `prod` uses the plain names below.

## 5. Open the app and assign roles

```bash
databricks apps get data360-governance -p aia-dev | grep url
```

Users authenticate with their normal Entra ID SSO. **In `users` mode**, roles come from `<prefix>_governance.user_roles`:

| role | tenant_code | Can |
|---|---|---|
| `GROUP_DG` | `GDG` | Edit everything, approve BU changes, review BU intake, run DQ |
| `STEWARD` | a Group function (`GO`, `GC`, `GI`, ...) | Edit and approve their function's elements and rules |
| `STEWARD` | a BU (`TH`, `VN`, ...) | See Group content plus their BU; edit their BU only (changes go to Group for approval); bulk upload |
| `VIEWER` | | Read-only. This is also the default for anyone not listed |

BU stewards are added when the BU is onboarded (`stewards=` parameter). To add others:

```sql
INSERT INTO d360.d360_governance.user_roles VALUES ('mary.lim@aia.com', 'STEWARD', 'GO');
```

The principal must match the user's Databricks user name (normally the Entra ID UPN/email). Changes apply within a minute.

Also give users access to the app itself: *Compute → Apps → data360-governance → Permissions → `CAN_USE`* for the relevant Entra ID groups (or `All workspace users`).

## 6. Verify

Run in the SQL editor (or `databricks experimental aitools tools query --warehouse <id> "..."`) against the platform's warehouse:

```sql
-- registry seeded                                                     load_demo_data:  "false"          "true"
SELECT tenant_code, tenant_type FROM d360.d360_governance.tenants;            -- GDG, GO, GC, GI   + VN, PH, MY
SELECT count(*) FROM d360.d360_governance.data_elements;                       -- 5                 15
SELECT count(*) FROM d360.d360_governance.dq_rules WHERE status = 'Approved';  -- 14                27 (29 in total)
SELECT count(*) FROM d360.d360_governance.dq_results;                          -- 0                 195 (3 months)
-- app service principal grants
SHOW GRANTS ON SCHEMA d360.d360_governance;
```

In the app: *Data Elements* lists `GO_00001–4` and `GC_00001`, *DQ Rules* lists the 14 AIA rules, and the sidebar shows your signed-in role.

## 7. First DQ run

The engine runs every **approved** rule against every **mapped** column (`cde_mapping`). Until a BU is onboarded and its CDEs mapped there is nothing to check. After onboarding (ONBOARDING.md):

```bash
databricks bundle run dq_engine -t prod -p aia-prod --params period=2026-11,tenant=ALL
```

Or click **Run DQ assessment now** in the app. The monthly schedule (`dq_schedule: UNPAUSED`) runs at 02:00 HKT on the 1st for the previous month.

## 8. Promote dev → prod

```bash
python3 scripts/configure_app.py -t prod -p aia-prod
databricks bundle deploy -t prod -p aia-prod
databricks bundle run d360_setup -t prod -p aia-prod
```

In CI/CD (GitHub Actions or Azure DevOps), authenticate as the deployer service principal (`DATABRICKS_HOST` plus either Databricks OAuth `DATABRICKS_CLIENT_ID` / `DATABRICKS_CLIENT_SECRET`, Entra ID `ARM_CLIENT_ID` / `ARM_TENANT_ID` / `ARM_CLIENT_SECRET`, or OIDC workload identity federation) and run the same three commands on merge to `main`.

To move registry content from dev to prod, export from dev and load through *Bulk Upload* as Group Data Governance (the templates in `templates/` are the format), or `DEEP CLONE` the tables if the metastore is shared.

## 9. Upgrade

Pull the new version, then run steps 2–4 again. `01_schema.sql` only adds tables or columns (`-- @optional` upgrade statements) and the seeds only add missing keys, so registry data is preserved.

## 10. Workspace resources

| Resource | Where |
|---|---|
| Registry | *Catalog → `<catalog>` → `<prefix>_governance`* |
| BU intake (Group-hosted) | *Catalog → `<catalog>` → `<prefix>_intake_<bu>`* |
| BU intake / marts (Delta Sharing) | *Catalog → `aia_<bu>_shared`* |
| Setup / onboarding / DQ jobs | *Jobs & Pipelines → `d360-setup`, `d360-onboard-bu`, `data360-dq-engine`* |
| App | *Compute → Apps → `data360-governance`* (logs: `databricks apps logs data360-governance`) |
| Audit | `<prefix>_governance.audit_log` (app changes) and `system.access.audit` (platform) |

## 11. Destroy

```bash
databricks bundle destroy -t dev -p aia-dev     # removes the app and jobs; Unity Catalog data is NOT deleted
```

To remove the data as well: `DROP SCHEMA <catalog>.<prefix>_governance CASCADE` (and any `<prefix>_intake_*` schemas).

---

## Classic compute fallback

If the workspace doesn't allow serverless jobs, override the job compute in the target, for example:

```yaml
  prod:
    resources:
      jobs:
        dq_engine:
          job_clusters:
            - job_cluster_key: dq
              new_cluster: { spark_version: "16.4.x-scala2.12", node_type_id: "Standard_D8ds_v5", num_workers: 1, data_security_mode: USER_ISOLATION }
          tasks:
            - task_key: run_dq
              job_cluster_key: dq
```

Do the same for `d360_setup` and `d360_onboard_bu` (a single-node `Standard_D4ds_v5` is enough). The app always runs on Databricks Apps compute.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| App shows `TABLE_OR_VIEW_NOT_FOUND` | Setup job not run yet, or `configure_app.py` was run for a different target before deploying. Re-run steps 2–4 |
| App build fails at *Installing packages* | No egress to the npm registry from the Apps build (see Prerequisites) |
| `finalize` prints `WARN GRANT ...` | The job principal doesn't own the schema or catalog. Prod: deploy and run as the deployer SP so it owns what it creates; for shared catalogs give it `MANAGE` |
| Everyone is a viewer in `users` mode | No rows in `user_roles`, or the principal doesn't match the Databricks user name. Set `admins` and re-run setup |
| Bulk upload: "submits from its own workspace" | That BU is in `DELTA_SHARE` mode, so its intake arrives read-only over the share. The BU loads the template in its own workspace |
| DQ check missing from results | Rule not `Approved`, element not mapped for that BU, or the job principal can't read the mapped table (see the job run output: `ERROR <rule> on <table>`) |
| Catalog name with hyphens | Not supported. Use a plain identifier, or create a new catalog for the platform |
