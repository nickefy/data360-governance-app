# Demo runbook: Data360 Governance Platform on Databricks

**Audience:** AIA Group Data Governance (Nitin, Cindy) + Group Operations. **Length:** ~20 min plus Q&A. **Presenter:** screen-share from your laptop.
**Message:** *Everything Data360 Govern + Analyze does for CDEs and DQ rules runs natively on Unity Catalog. The app is a thin governance UI on top: the data, lineage, tags, permissions and DQ execution are the platform.*

---

## 0 · Before the call (T-30 min)

| Check | How |
|---|---|
| Workspace alive (FEVM workspaces expire) | `databricks current-user me --profile fevm-nick`. If it fails, extend via the FEVM skill. |
| Reset to clean state | `cd ~/Desktop/nick-databricks/repositories/data360-governance-app && databricks bundle run d360_reset_demo -t demo_fevm --profile fevm-nick` (about 1 min; restores the snapshot in `d360_snapshot`) |
| App running | `databricks apps get data360-governance --profile fevm-nick -o json \| jq .app_status.state` should be `RUNNING`. If not: `databricks apps start data360-governance --profile fevm-nick` |
| Warm the warehouse | Open the app ~5 min before. The Serverless Starter Warehouse auto-stops, and the first query after a cold start takes ~10 s. |
| Browser tabs | **Tab 1:** app https://data360-governance-7474644918602366.aws.databricksapps.com <br>**Tab 2:** Catalog Explorer → `nicholas_aws_ws_catalog.d360_bu_vn.dq_customer_mart` → Columns (for tags) <br>**Tab 3:** same table → Lineage tab <br>**Tab 4:** Jobs → `data360-dq-engine` |
| Persona | Sidebar bottom → **Group Data Governance** (the reset doesn't change the persona; it's stored in the browser) |
| Zoom | Browser at 90% so tables fit on a shared screen |

**What the clean state contains:** 15 data elements (AIA's GO_00001–4 verbatim + extras), 29 rules (AIA's 14 GO_DQ_* verbatim + extras + BU overrides), 3 BUs (VN, PH, MY) + Group Investments, Oct 2026 real DQ run + Aug/Sep simulated history, **4 pending approvals** (MY_00001 draft, MY_DQ_00036, PH_00001, PH_DQ_00001) and **1 pending PH bulk batch** (PH-2026-11-20-01: 2 elements, 2 rules).

---

## 1 · Opening (1 min) · *How it runs on Databricks* page

> "This replaces the Govern + Analyze workflow you walked us through on the 19th: elements and rules per BU, bulk upload in a standard format, BU → Group via Delta Sharing, rule results and lineage. It uses the sample CDEs and rules Nitin sent from your Dev environment."

- Show the 5-box federated flow (BU workspace → Delta Share → Group workspace → DQ engine → consume).
- Don't read the table out; say you'll come back to it at the end.

## 2 · Group view of quality (2 min) · *Overview*

- KPIs: 15 elements (13 CDEs), 29 rules, **99.06% row pass rate for 2026-10**, **16 checks below threshold**.
- Heat-map: point at **MY and PH Validity**.
- Breach table: top line **GO_DQ_00697 Nationality-Validity, MY 92.16% vs 99%** (3,530 of 45,000 rows). Same element, same rule, three BUs: you can see which BU is the problem.
- Trend: improving month on month. *(Be honest if asked: Aug/Sep are simulated history for the demo.)*

> "This is the Group view you get automatically, because every BU's results land in the same governed table. No one has to send a spreadsheet."

## 3 · A CDE end to end (4 min) · *Data Elements → GO_00001 Customer Identifier*

1. **Rules tab:** GO_DQ_00001 / 00036 / 00071 are your rules, word for word. Then the **↳ VN_DQ_00036, PH_DQ_00036, MY_DQ_00036** rows:
   > "GO_DQ_00036 says 'format defined by the BU'. Each BU customises it with its own pattern: VN is 'VN' + 9 digits, PH is 'PH-' + 8. MY's is still **Pending Approval**, so the engine keeps running the Group generic rule on MY data until Group approves. That's the 'inherit and resolve overrides' requirement."
2. **Physical mapping & lineage tab:** the element maps to `dq_customer_mart.customer_id` in all 3 BU marts → click **Lineage graph** on a row. A full-screen graph opens, drawn like Catalog Explorer's: `src_customer.CUST_NO → customer.customer_id → dq_customer_mart.customer_id` is highlighted as column lineage, the policy tables show as table lineage, and the **data360-dq-engine** job appears as a consumer.
   - Point out the **DE badges + pass %** on the mart's columns (e.g. GO_00003 nationality in red on MY). That's the governance overlay UC alone doesn't show.
   - Click `customer.nationality` to re-trace, then **Back to CDE column**. The ↗ icon on each card opens that table in Catalog Explorer.
   > "Nobody drew this. Unity Catalog captured it from the pipeline that builds the BU's DQ mart. This is 'show which table it originated from', with your CDEs and DQ status layered on top."
   - Alternative entry point: the **Physical Lineage** page (sidebar). Pick any element · BU · column from the dropdown; it defaults to GO_00003 Nationality · MY, the worst breach on the Overview.
3. Click **Sync to Unity Catalog** → switch to **Tab 2** (Catalog Explorer, refresh): `customer_id` now has the comment `[GO_00001] Customer Identifier: …` and tags `d360_de_id`, `d360_cde=true`, `d360_domain=Customer`.
   > "The business definition now travels with the data. Anyone querying it in SQL, notebooks, Genie or Power BI sees it, and you can drive access policies off the CDE tag."
4. **Latest results tab:** per rule × BU: rows, failed, pass % vs threshold.

## 4 · BU steward experience (4 min) · switch persona → **BU Vietnam steward**

- Banner: "BU view: you see Group content + VN's own."
- **DQ Rules → GO_DQ_00036:** Edit and Delete are disabled ("owned by Group Operations"). **Customise for VN** is offered instead.
- Open **GO_DQ_00038 (Nationality-Validity)** → show the **SQL generated by the DQ engine** and **Results history** (VN only now) → **Failing rows** on the 2026-10 row: the actual bad values (`OTHER`, `UNKNOWN`, `Viet Nam`).
  > "The rule is stored as a structured definition, not code. The engine compiles it to SQL, so a steward can author it in the UI and an engineer can still read exactly what ran."
- Optional: **New rule** as VN → status is forced to *Pending Approval* whatever you pick.

## 5 · Bulk upload in the standard format (3 min) · switch persona → **BU Philippines steward**

1. **Bulk Upload → Data elements → Download CSV template**: the standard per-object format ("defined a standard format for each data element type").
2. **Use the example rows → Validate**: both rows pass. *(Optional: edit a cell in the CSV, e.g. a wrong ID prefix, and re-upload to show the row-level error.)*
3. **Submit to Group for approval** → the message says it was written to `d360_bu_ph.intake_data_elements`.
   > "That table lives in the PH workspace. It's Delta-shared to the Group governance workspace: read-only, nothing copied, nothing emailed."
   *(Demo caveat if asked: one workspace here, so the app reads the BU schema directly; in production it's the share.)*

## 6 · Group approves (3 min) · switch persona → **Group Data Governance**

1. **Approvals & BU Intake:**
   - Top table: **Approve MY_DQ_00036** (the MY format override) and **PH_00001 / PH_DQ_00001** (TIN).
   - BU submissions: **PH-2026-11-20-01 → Review → Approve all pending & merge**. This one adds **PH_00002 UMID number** (mapped to `id_doc_no`) and **PH_DQ_00002**: "where the ID type is UMID, the number must be 12 digits".
   - Also the batch you just uploaded in step 5.
2. **Overview → Run DQ assessment now** → button shows "DQ run pending/running…" (**~1–2 min**). Fill the time with **Tab 4** (Jobs → the run on serverless compute) and **Tab 3** (lineage graph, which also shows the DQ job reading the mart).
3. When it finishes, the results refresh automatically:
   - **Rule Results**, filter Tenant = PH: **PH_DQ_00002 now runs and fails hard** (~70%, because the synthetic UMID numbers aren't 12 digits).
     > "The BU rule was approved two minutes ago and it's already finding issues in the PH mart."
   - Filter Tenant = MY: GO_00001 validity now runs as **MY_DQ_00036** (the MY format) instead of the Group generic.
4. **Audit Trail:** every action you just took, by persona, with before/after images.

## 7 · Close (1 min) · back to *How it runs on Databricks*

- Walk the capability-mapping table top to bottom (30 s).
- **"Not in this MVP"** box: multi-step approvals (Investment Director → CIO), DQ issue management, non-Databricks scanners (AS400, Sybase), AI rule drafting, OBO + UC row filters instead of the persona switcher. These match the implementation items in our RFI response.

---

## Likely questions

| Q | A |
|---|---|
| Is the permission model real? | In the demo a persona switcher drives app-level RBAC (`user_roles` table). Production: the app runs on-behalf-of the signed-in user, roles come from UC/Entra groups, and UC row filters on the registry enforce "BU edits own" even outside the app. |
| Where does the data live? | All Delta tables in Unity Catalog (`d360_governance` schema). No separate app database, so it's queryable, shareable, time-travelled and audited like any other data. |
| How do rules actually run? | Serverless Lakeflow Job: reads approved rules + CDE→column mappings, resolves BU overrides, compiles each to SQL, writes `dq_results`. Monthly schedule (matches today's cadence) or on demand. The Oct run was 65 checks in ~35 s on ~165k customer rows. |
| How long will it take on our data volumes? | Today's Analyze runs take 3–8 h per BU on a 16-core server. Serverless scales per run, so we'd calibrate with one BU's DQ mart in a PoC (see `../data360-sizing`). |
| Can BUs keep their own workspaces / data residency? | Yes: that's the BU → Group Delta Share model. Data stays in the BU workspace, and Group sees the intake + results. |
| Tableau / Power BI? | Results are a Delta table. Connect over the SQL warehouse, or export CSV from Rule Results. |
| Lineage for non-Databricks sources? | Automatic inside Databricks. For AS400/Sybase/ETL tools it comes from the UC external lineage API, fed by scanners or partners (an implementation item). |
| AI? | Not in this demo. Natural next step: draft the rule definition from the business description with a Foundation Model behind AI Gateway, with human approval. |

## If something goes wrong

| Symptom | Fix |
|---|---|
| Spinners for >15 s | The warehouse is cold-starting. Wait; a toast shows warehouse status. |
| "Run DQ" fails | Check Tab 4 for the run error. Fall back to showing the existing Oct results; the approvals still demonstrate the flow. |
| A change doesn't show | Switch page and come back (each write bumps the query version). |
| App 502 / not loading | `databricks apps start data360-governance --profile fevm-nick` (~2 min). |
| Want to re-run the demo | Re-run the reset command in section 0. It also discards the new DQ run results. |

**After the demo:** run the reset so the next run starts clean. To change the clean baseline, edit the data in the app, then re-take the snapshot: `D360_PREFIX=d360 uv run --no-project --with databricks-sdk python scripts/run_sql.py fevm-nick 2107e3e12ef8f9df nicholas_aws_ws_catalog sql/demo/13_demo_snapshot.sql`. To rebuild the whole demo from seed: `databricks bundle run d360_setup -t demo_fevm --profile fevm-nick`.
