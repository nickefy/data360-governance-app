# Data360 Governance Platform: demo/MVP on Databricks Apps + Unity Catalog

> **Resume here.** Built 24–25 Nov 2026 for the AIA Data360 (Precisely Govern + Analyze) replacement RFI, after the 19 Nov walkthrough with AIA Group Data Governance.
> Design and scope: `PLAN.md`. Customer deck: `deck/out/AIA Data360 Governance Platform - Demo Walkthrough.pptx` (rebuild: `cd deck && uv run --no-project --with python-pptx --with pillow python build_deck.py "out/AIA Data360 Governance Platform - Demo Walkthrough.pptx"`; diagram: `python3 diagrams/build_demo_arch.py diagrams/data360-governance-architecture.drawio` then `drawio -x -f png -s 2 -o diagrams/data360-governance-architecture.png diagrams/data360-governance-architecture.drawio`; screenshots in `deck/shots`; slide 15 sizing numbers come from `deck/sizing_check.py`, which imports `../data360-sizing/scripts/model.py` and applies overrides without changing it). Related: `../data360-rfi` (requirements), `../data360-sizing` (cost model + architecture diagram).

**Live app:** https://data360-governance-7474644918602366.aws.databricksapps.com (workspace `fevm-nick`, `fevm-nicholas-aws-ws`)
**DQ job:** `data360-dq-engine` (job id 666435869066953), serverless, monthly schedule PAUSED, run on demand from the app.

## What it shows
| Page | Demo point |
|---|---|
| Overview | KPIs, pass % heat-map tenant × dimension, monthly trend, worst threshold breaches, **Run DQ now** (triggers the job) |
| Physical Lineage | Catalog-Explorer-style graph per CDE column: UC table + column lineage, consuming jobs, DE badges and latest pass % per column (`/api/d360/lineage-graph`, dependency-free SVG/HTML renderer) |
| Data Elements | AIA's sample DEs (GO_00001–4, verbatim from Nitin's 19 Nov email) + extras; create/edit/delete; drawer: rules (Group + ↳ BU overrides), physical mapping, **UC column lineage** (src → curated → DQ mart), latest results, **Sync to Unity Catalog** (column comment + `d360_*` tags) |
| DQ Rules | AIA's 14 sample rules verbatim + extras; structured rule builder (not-null, regex, reference data, unique, range, SQL expr); generated SQL; history; failing-row samples; "Customise for <BU>" |
| Rule Results | total / passed / failed / pass % vs threshold per rule × BU × column; CSV export |
| Approvals & BU Intake | pending DEs/rules; BU bulk batches (the "Delta Share" inbox), approve → MERGE into registry |
| Bulk Upload | standard template download, CSV upload, row-level validation, BU → intake table / Group → registry |
| Reference Data | Group code sets + BU extensions (e.g. VN `CCCD`) used by validity rules |
| Audit Trail / How it runs | every change with before/after; capability → Databricks mapping |

**Persona switcher** (sidebar): Group Data Governance (edits all, approves), Group Operations steward, BU VN/PH/MY steward (sees Group + own BU, edits own only, changes go to Pending Approval), Viewer.

## Suggested demo script (~15 min). Full runbook with pre-checks, talk track, Q&A and reset: `DEMO_RUNBOOK.md`
1. Overview → the MY/PH nationality validity breaches.
2. Data Elements → GO_00001 Customer Identifier → rules tab (Group GO_DQ_00036 + VN/PH/MY format overrides; MY's is Pending, so MY still runs the Group generic) → mapping → Lineage → Sync to UC (then show the tags in Catalog Explorer).
3. Switch to **BU Vietnam steward** → DQ Rules → GO_DQ_00036 → Edit is disabled → "Customise for VN"; try editing a Group rule (403 message).
4. Bulk Upload as **BU Philippines steward** → Use example rows → Validate → Submit.
5. Switch to **Group Data Governance** → Approvals → approve the MY override + the PH batch → Run DQ now → results refresh (~1–2 min).
6. "How it runs on Databricks" page for the mapping slide.

## Package layout (deploy to a customer workspace: [DEPLOYMENT.md](DEPLOYMENT.md), add a BU: [ONBOARDING.md](ONBOARDING.md), design: [ARCHITECTURE.md](ARCHITECTURE.md))
```
data360-governance-app/
├── databricks.yml            # the bundle: d360_setup, d360_onboard_bu, dq_engine jobs + the app; targets dev / prod (Azure), demo_fevm, pkgtest_fevm
├── app/                      # Databricks App (AppKit: React client, Node server, config/queries/*.sql)
├── src/
│   ├── dq_engine/run_dq.py   # monthly DQ assessment (serverless job)
│   └── setup/d360_admin.py   # setup / finalize (view + grants + admins) / onboard, run as job tasks
├── sql/
│   ├── 01_schema.sql         # registry DDL (idempotent, non-destructive)
│   ├── 02_seed_group.sql     # Group functions, AIA Group elements + 14 rules, Group reference data (insert-if-missing)
│   ├── demo/                 # simulated BUs, marts, history, snapshot, reset (load_demo_data = true only)
│   └── delta_sharing/        # BU-side share + Group-side mount templates
├── templates/                # standard BU templates v1 (data elements, DQ rules)
├── scripts/
│   ├── configure_app.py      # writes a target's catalog / prefix / auth mode into app/ before deploy
│   ├── gen_demo_marts.py     # regenerates sql/demo/11_demo_marts.sql
│   └── run_sql.py            # run SQL files from a laptop (ad hoc)
├── deck/                     # customer deck, architecture diagram, screenshots, sizing check
├── DEPLOYMENT.md · ONBOARDING.md · ARCHITECTURE.md · DEMO_RUNBOOK.md · PLAN.md
```

**Customer install in four commands** (details and prerequisites in DEPLOYMENT.md):
```
python3 scripts/configure_app.py -t prod -p <profile>
databricks bundle deploy -t prod -p <profile>
databricks bundle run d360_setup -t prod -p <profile>
databricks bundle run d360_onboard_bu -t prod -p <profile> --params bu_code=TH,bu_name="AIA Thailand",stewards=a@aia.com
```

**Tested (26 Nov 2026) on fevm-nick** with target `pkgtest_fevm`: a fresh install into schema prefix `d360pkg` in `users` auth mode, no demo data.
Setup → onboard TH (Group-hosted) and VN (Delta Sharing mode, pointed at `d360_bu_vn`) → map 5 CDEs → DQ run (14/14 checks) → TH steward bulk upload lands in `d360pkg_intake_th`, the VN upload is refused (shared intake is read-only), a viewer is refused, the TH steward can't approve, Group DG approves → `TH_DQ_00036` merged as Approved.
Test app: `d360-pkgtest` (remove with `databricks bundle destroy -t pkgtest_fevm -p fevm-nick`).

**New-environment test (26 Nov 2026):** a clean copy of the repo (no node_modules, build output, state or .env) deployed with the unmodified customer `dev` target plus `--var` overrides (prefix `d360new`, demo data, demo personas). Deploy (4 resources, app built first time) → setup (65/65 checks, 15 elements, 29 rules, 4 awaiting approval, PH batch, 3 periods; same as the live demo) → onboard TH → fresh `npm install` + typecheck → TH steward uploads an element and a rule → Group DG approves both → the TH steward's *Run DQ* triggers the new job (SUCCESS) → TH results → *Sync to UC* writes the column comment and 5 `d360_*` tags.
App `d360-governance` (note: the live demo is `data360-governance`); remove with `databricks bundle destroy -t dev -p fevm-nick --var catalog=nicholas_aws_ws_catalog --var schema_prefix=d360new --var warehouse_id=2107e3e12ef8f9df`.

**Azure test (26 Nov 2026), workspace `aia-aigw` (adb-984752964297111.11), following DEPLOYMENT.md only:** clean copy → prerequisites checked read-only (Unity Catalog, serverless Pro warehouse `Shared Endpoint` with `CAN_USE`, Apps, catalog `workshop` owned by the deployer) → `configure_app.py -t dev` → validate → deploy (4 resources, app built, so npm egress works) → `d360_setup` SUCCESS (65/65 checks) → step 6 checks pass (7 tenants, 15 elements, 27/29 rules approved, 195 results, PH batch; app SP has USE SCHEMA, SELECT, MODIFY, APPLY TAG). App: https://d360-governance-984752964297111.11.azure.databricksapps.com.
Doc fixes from the run: warehouse `CAN_USE` is enough and must not be Real-Time; step 6 shows expected counts with and without demo data; dev-mode job names and schedules.
Remove: `cd <repo> && python3 scripts/configure_app.py -t dev -p aia-aigw --var catalog=workshop --var warehouse_id=148ccb90800933a1 && databricks bundle destroy -t dev -p aia-aigw --var catalog=workshop --var warehouse_id=148ccb90800933a1`, then `DROP SCHEMA workshop.d360_<x> CASCADE` for d360_governance, d360_bu_vn/ph/my, d360_group_inv, d360_snapshot.

## Demo workspace (target `demo_fevm`, catalog `nicholas_aws_ws_catalog`, prefix `d360`)
- `d360_governance`: tenants, data_elements, dq_rules, cde_mapping, reference_data, dq_runs, dq_results, dq_failed_samples, submission_reviews, user_roles, audit_log, v_intake
- `d360_bu_vn|ph|my`: src_customer/src_policy → customer/policy → dq_customer_mart/dq_policy_mart (CTAS chain = real UC lineage), + intake_data_elements / intake_dq_rules (Group-hosted intake in the demo)
- `d360_group_inv`: src_holdings → holdings → dq_holdings_mart
- Synthetic: 60k/50k/45k customers (VN/PH/MY), 8k holdings, with seeded defects. **Aug/Sep 2026 results are simulated** (derived from the real Oct run, flagged in `dq_runs.notes`).

## Rebuild / reset the demo
```
cd data360-governance-app
python3 scripts/configure_app.py -t demo_fevm -p fevm-nick
databricks bundle deploy -t demo_fevm -p fevm-nick          # app + jobs (updates the existing app and DQ job in place)
databricks bundle run d360_setup -t demo_fevm -p fevm-nick  # registry + demo data + first DQ run + history + grants + snapshot (~3 min)
databricks bundle run d360_reset_demo -t demo_fevm -p fevm-nick   # before each demo: restore the snapshot (~1 min)
# then in the app: Sync to Unity Catalog on each element (or POST /api/d360/sync-uc/<DE_ID>)
```
`python3 scripts/gen_demo_marts.py > sql/demo/11_demo_marts.sql` regenerates the synthetic marts (`--with-shares` adds the share DDL).

## Gotchas learned
- Databricks SQL: `''` inside a string literal **concatenates** (it is not an escape). Use `\'`.
- AppKit analytics returns JSON-looking STRING columns already parsed. Use `asText()` client-side and the JSON-aware `s()` server-side.
- AppKit analytics caches queries for 1 h by default, so the app sets `cache: { enabled: false }` and every query takes a `:v` param that bumps after writes.
- Jobs plugin requires the env var `DATABRICKS_JOB_ID` (job key `default`).
- MERGE `WHEN NOT MATCHED THEN INSERT` needs an explicit column list.
- The Apps build npm registry rejects some recent package versions that the laptop proxy serves (e.g. React Flow's `zustand` 4.5.7 / `d3-zoom` 3.0.1), so the lineage graph is hand-rendered with no new dependencies.
- No `CREATE SHARE` on the FEVM metastore, so the demo uses Group-hosted intake. Share templates are in `sql/delta_sharing/`; the Delta Sharing intake mode was tested by pointing it at a local schema.
- The Apps build must not call the warehouse: on a fresh install the tables and the app's grants don't exist yet. `prebuild` therefore skips typegen, and the generated query types (`app/shared/appkit-types/analytics.d.ts`, catalog-independent) are committed. After changing a query, run `npm run typegen` locally against a configured workspace.
- The app's query files must name the catalog. `scripts/configure_app.py` rewrites `<catalog>.<prefix>_governance` in every query and writes `app/app.yaml`, so always run it for the target before deploying.

## Not in the MVP
Multi-step approval chains / SLAs, DQ issue management, non-Databricks metadata scanners, AI rule drafting, real cross-workspace sharing (scripted, not run on FEVM), OBO reads with UC row filters (users mode uses app-level roles).
