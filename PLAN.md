# Data360 Governance Platform: demo/MVP implementation plan

> AIA Group is replacing Precisely Data360 Govern + Analyze (see `../data360-rfi`, `../data360-sizing`).
> This demo shows the **Glossary & CDE workflow app** and **DQ rule library / execution / results**
> boxes from `../data360-sizing/diagrams/data360-architecture.png`, running as a Databricks App on Unity Catalog.

## 1. Inputs used
| Source | What it gave us |
|---|---|
| Email "Re: Data360 Governance Platform Walkthrough" (Nitin, 19 Nov 2026) | Real sample content from AIA's Dev env: 4 Group Ops DEs (GO_00001–4) and 14 rules (GO_DQ_*), with the exact column sets (below) |
| Walkthrough notes | Scope: DE + rule UI per BU, create/edit/delete, bulk upload in a standard BU format, BU → table → Delta Share → Group app, lineage, rule results, RBAC (Group DG edits all, BU edits own), reference data. Runs monthly, ~20 h |
| RFI functional reqs (`data360-rfi/source`) | Group defines → BU adopts/customises → Group approves; DQ dimensions; same rule on many CDEs; BU metrics automatically available to Group; dashboards Group/BU/domain/CDE drill-down; issue mgmt; flat-file export |
| QnA / sizing (`data360-sizing`) | 10 BUs + 4 Group Functions, ~5 Govern contributors, ~20 developers, monthly DQ, Group Ops 1,000+ rules |

**Field sets (from AIA sample):**
- **Data Element:** DE ID, Name, Description, Status, CDE Flag, Subject Area, Data Domain, Data Sub-domain (L2), Defined by, DE Type (Atomic/Derived)
- **DQ Rule:** Rule ID, Name (`Domain-SubDomain-Element-Dimension`), Status, DQ Dimension, Description, Defined By, + from notes: Applicable To (DE IDs), Definition (executable logic), Threshold, Last Modified
- **Rule Result:** total rows, passed, failed, pass %, run date, BU, table/column

## 2. How Unity Catalog plays in (the core message)
| Governance need | Databricks capability used in the demo |
|---|---|
| Business data dictionary / CDE register | Delta tables in UC (`governance.data_elements`) = system of record, edited through the app |
| CDE → physical attribute mapping | `cde_mapping` table **and** UC **governed tags** written onto the physical column (`cde=GO_00001`, `data_domain=Customer`); UC column comments synced from the DE description |
| Lineage ("which table it originated from") | UC **lineage** captured automatically from the pipeline that builds the BU DQ mart (source → curated → DQ mart); the app reads it via the lineage API |
| BU → Group federation | Each BU owns an **intake schema** in the standard format; a **Delta Share** per BU exposes it to the Group workspace; the Group app consolidates. (Demo is one workspace, so the share is created but read in place. Noted in the demo.) |
| Who can edit what | App RBAC from a `user_roles` table (Group DG = all; BU steward = own BU only). Production: app on-behalf-of-user auth + UC groups + **row filters** on the registry |
| DQ execution | Serverless **Lakeflow Job**: reads rule definitions, generates SQL per dimension, writes `dq_results`. Triggered monthly or from the app ("Run now") |
| Reference data | `reference_data` Delta table (code sets: nationality, customer status, ID doc type) that validity rules check against |
| Audit | `audit_log` table for every create/edit/delete/approve + UC audit system tables |

## 3. Data model (catalog `<demo_catalog>`)
```
governance/                     ← Group governance workspace (system of record)
  data_elements                 de_id PK, name, description, status, cde_flag, subject_area, data_domain,
                                data_subdomain, defined_by (BU/Function), de_type, owner, version, updated_by, updated_at
  dq_rules                      rule_id PK, name, status, dq_dimension, description, definition (rule type + params),
                                applicable_to (de_id), defined_by, threshold_pct, version, updated_by, updated_at
  cde_mapping                   de_id, bu, table_fqn, column_name     ← element → physical column (drives execution + lineage)
  reference_data                ref_set, code, label, bu, active
  dq_runs / dq_results          run_id, rule_id, de_id, bu, table_fqn, column, total_rows, passed_rows, failed_rows, pass_pct, threshold, status, run_ts
  submissions                   BU bulk-upload intake awaiting Group approval (from the shares)
  user_roles                    user/persona, role (GROUP_DG | BU_STEWARD | VIEWER), bu
  audit_log                     ts, user, action, object_type, object_id, before, after
bu_<x>_intake/                  ← "BU workspace": standard-format templates filled by BU; shared via Delta Sharing
bu_<x>_dq/                      ← BU DQ mart: src_customer (raw) → customer (curated) → dq_customer (mart), with seeded defects
```
Seed: AIA's 4 GO DEs + 14 rules verbatim, plus ~20 extra DEs/rules across Group Ops, Group Investment and 3 BUs (VN, PH, MY) for the multi-tenant view, and ~50k synthetic customer rows per BU with realistic defects (nulls, bad ID formats, duplicates, 'Unknown' nationality, active customers with no active policy).

## 4. DQ engine (rule definition → SQL)
Rule `definition` is structured (JSON), so a BU can author it in the UI and the engine stays generic:
| Dimension | Definition | Generated check |
|---|---|---|
| Completeness | `{"type":"not_null_or_blank"}` | `col IS NOT NULL AND trim(col) <> ''` |
| Validity (format) | `{"type":"regex","pattern":"^[A-Z]\\d{7}$"}` | `col RLIKE pattern` |
| Validity (ref data) | `{"type":"in_reference","ref_set":"NATIONALITY","exclude":["OTHER","UNKNOWN"]}` | semi-join to `reference_data` |
| Uniqueness | `{"type":"unique"}` | `count(*) over (partition by col) = 1` |
| Consistency | `{"type":"sql","expr":"status <> 'ACTIVE' OR has_active_policy"}` | custom boolean expression |
For each rule × mapped (bu, table, column): total / passed / failed / pass % vs threshold → `dq_results`. Runs as a serverless job (monthly schedule + on-demand). DQX (Databricks Labs) is the productised alternative and worth a slide mention.

## 5. App (Databricks App) pages
1. **Overview**: KPIs (DEs, CDEs, rules, latest pass %), pass % by BU × dimension heat-map, worst rules.
2. **Data Elements**: filter by BU / domain / sub-domain / CDE / status; create, edit, delete (RBAC-gated); detail drawer showing attached rules, physical mapping, **UC lineage** (upstream tables) and latest results.
3. **DQ Rules**: same CRUD; dimension, threshold, applicable DE; structured rule builder; "Run now".
4. **Rule Results**: per run, per BU: total / passed / failed / pass %, pass/fail vs threshold, trend across monthly runs, failed-row sample.
5. **Bulk Upload / BU Intake**: download the standard template (CSV) per object type; upload → validate (schema, mandatory fields, IDs, duplicates) → preview diff → submit. BU submissions arrive via the share → Group approves or rejects → merged into the registry.
6. **Reference Data**: code sets per Group/BU, editable.
7. **Lineage**: pick a CDE and see source → curated → DQ mart from UC lineage.
8. **Audit**: who changed what.
A **persona switcher** (Group Data Governance / BU Vietnam steward / Viewer) makes the "Group edits all, BU edits own" rule visible in one demo session.

## 6. Build steps
1. Workspace + catalog + SQL warehouse; the `d360_setup` bundle job (`sql/`, `src/setup/d360_admin.py`) creates schemas and tables and seeds AIA sample + synthetic data (see DEPLOYMENT.md).
2. Build the BU DQ mart with CTAS chains (gives real UC lineage). Create a Delta Share per BU intake schema.
3. DQ engine notebook + serverless job (DAB); first run populates `dq_results` (seed 3 historical monthly runs for trends).
4. App: backend (SQL statement execution for reads and writes, lineage API, jobs API, tag API) + React UI.
5. Deploy as a Databricks App (service principal granted on catalog + warehouse + job); smoke test; runbook in README.

## 7. Demo script (~15 min)
Overview → open GO_00001 Customer Identifier → its 3 rules, mapping, lineage, results → switch to BU Vietnam → try editing a Group rule (blocked) → customise a local rule → bulk-upload the VN template → switch to Group DG → approve submission → Run now → results update → show UC governed tags / lineage / share in Catalog Explorer.

## 8. Out of scope for the MVP (say so in the demo)
Multi-step approval workflow engine with SLAs and escalation, DQ issue management, metadata scanners for non-Databricks sources, AI rule drafting (an easy add-on: Foundation Model API to draft `definition` JSON from the description), real cross-workspace Delta Sharing.
