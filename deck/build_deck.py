"""Customer deck: Data360 Governance Platform demo (same visual system as ../../data360-sizing/scripts/build_deck.py).

Usage: uv run --no-project --with python-pptx --with pillow python build_deck.py <out.pptx>
Inputs: assets/ (logo, cube), diagrams/data360-governance-architecture.png, shots/*.png
"""
import os
import sys

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Pt

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
NAVY, NAVY2, LAVA, CORAL, OAT, WHITE = "1B3139", "0B2026", "FF3621", "FF5F46", "F9F7F4", "FFFFFF"
GREY, LINE, TXT, MUTED, GREEN, AMBER = "F3F3F3", "EEEDE9", "3A3838", "8A8580", "00A972", "F57C00"
FOOT = "AIA Group · Data360 replacement · governance platform demo"

prs = Presentation()
prs.slide_width, prs.slide_height = Pt(720), Pt(405)
BLANK = prs.slide_layouts[6]
N = [0]


def rect(s, x, y, w, h, fill, shape=MSO_SHAPE.RECTANGLE, line=None):
    sh = s.shapes.add_shape(shape, Pt(x), Pt(y), Pt(w), Pt(h))
    sh.fill.solid()
    sh.fill.fore_color.rgb = RGBColor.from_string(fill)
    if line:
        sh.line.color.rgb = RGBColor.from_string(line)
        sh.line.width = Pt(0.75)
    else:
        sh.line.fill.background()
    sh.shadow.inherit = False
    return sh


def text(s, x, y, w, h, t, size=9, color=TXT, bold=False, font="DM Sans", align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, spacing=None):
    tb = s.shapes.add_textbox(Pt(x), Pt(y), Pt(w), Pt(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    for i, line in enumerate(t.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        if spacing:
            p.space_after = Pt(spacing)
        r = p.add_run()
        r.text = line
        r.font.size, r.font.bold, r.font.name = Pt(size), bold, font
        r.font.color.rgb = RGBColor.from_string(color)
    return tb


def rich(s, x, y, w, h, paras, size=8.5, spacing=5):
    """paras: list of [(text, bold, color)] runs per paragraph."""
    tb = s.shapes.add_textbox(Pt(x), Pt(y), Pt(w), Pt(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, runs in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(spacing)
        for t, b, c in runs:
            r = p.add_run()
            r.text = t
            r.font.size, r.font.bold, r.font.name = Pt(size), b, "DM Sans"
            r.font.color.rgb = RGBColor.from_string(c or TXT)
    return tb


def bullets(s, x, y, w, h, items, size=8.5, spacing=6):
    """items: 'Bold lead: rest' strings; text before the first ':' is bold."""
    paras = []
    for it in items:
        if ": " in it:
            a, b = it.split(": ", 1)
            paras.append([("▪ ", False, LAVA), (a + ": ", True, NAVY), (b, False, TXT)])
        else:
            paras.append([("▪ ", False, LAVA), (it, False, TXT)])
    return rich(s, x, y, w, h, paras, size, spacing)


def page(eyebrow, headline, bg=WHITE):
    N[0] += 1
    s = prs.slides.add_slide(BLANK)
    rect(s, 0, 0, 720, 405, bg)
    dark = bg == NAVY
    text(s, 49, 36, 620, 11, eyebrow, 8, CORAL if dark else LAVA, True, "DM Mono")
    text(s, 49, 50, 620, 24, headline, 17, WHITE if dark else NAVY, True)
    if not dark:
        rect(s, 49, 80, 621, 1, LINE)
    text(s, 49, 381, 300, 11, FOOT, 7, MUTED)
    text(s, 640, 381, 30, 11, f"{N[0]:02d}", 7, MUTED, align=PP_ALIGN.RIGHT)
    return s


def table(s, x, y, cols, rows, row_h=20, head_h=20, size=8, marks=None):
    """cols: [(header, width, align)]. A cell starting with ✓ / ◐ / ○ is coloured."""
    cx = x
    for hdr, w, al in cols:
        rect(s, cx, y, w, head_h, NAVY)
        text(s, cx + 7, y, w - 14, head_h, hdr, size, WHITE, True, align=al, anchor=MSO_ANCHOR.MIDDLE)
        cx += w
    yy = y + head_h
    for i, row in enumerate(rows):
        cx = x
        rect(s, x, yy, sum(c[1] for c in cols), row_h, WHITE if i % 2 == 0 else GREY)
        for (hdr, w, al), v in zip(cols, row):
            col, bold = TXT, False
            if v[:1] in "✓◐○":
                col, bold = {"✓": GREEN, "◐": AMBER, "○": MUTED}[v[:1]], True
            text(s, cx + 7, yy, w - 14, row_h, v, size, col, bold, align=al, anchor=MSO_ANCHOR.MIDDLE)
            cx += w
        yy += row_h
    return yy


def picture(s, path, x, y, w=None, h=None, border=True):
    im = Image.open(path)
    ar = im.height / im.width
    if w and not h:
        h = w * ar
    elif h and not w:
        w = h / ar
    if border:
        rect(s, x - 1, y - 1, w + 2, h + 2, LINE)
    s.shapes.add_picture(path, Pt(x), Pt(y), Pt(w), Pt(h))
    return w, h


def shot(name):
    return os.path.join(HERE, "shots", f"{name}.png")


def feature(eyebrow, headline, items, img, note=None, img_w=372):
    s = page(eyebrow, headline)
    bullets(s, 49, 94, 236, 270, items, 8.5, 7)
    im = Image.open(shot(img))
    ar = im.height / im.width
    w = min(img_w, 262 / ar)
    x = 670 - w
    w, h = picture(s, shot(img), x, 94, w=w)
    if note:
        text(s, x, 94 + h + 6, w, 12, note, 7, MUTED)
    return s


# ================================================================ 1 · Title
N[0] += 1
s = prs.slides.add_slide(BLANK)
rect(s, 0, 0, 720, 405, NAVY)
s.shapes.add_picture(os.path.join(HERE, "assets/databricks-logo.png"), Pt(49), Pt(36), Pt(80), Pt(13))
rect(s, 49, 73, 19, 3, "E2231A")
text(s, 75, 70, 260, 11, "AIA GROUP × DATABRICKS", 8, WHITE, True, "DM Mono")
text(s, 49, 190, 310, 90, "Data360 Governance Platform on Databricks", 24, WHITE, True)
text(s, 49, 285, 314, 40, "Demo walkthrough: data elements, CDEs, DQ rules, results and lineage, governed in Unity Catalog", 10, "C7D2D6")
text(s, 49, 353, 314, 25, "Prepared for AIA Group Data Governance by Nicholas Leong, Solutions Architect, Databricks · November 2026", 8, "9FB0B6")
rect(s, 378, 0, 342, 405, NAVY2)
s.shapes.add_picture(os.path.join(HERE, "assets/nodal-cube.png"), Pt(416), Pt(28), Pt(267), Pt(350))

# ================================================================ 2 · What we heard
s = page("WHAT WE HEARD · WALKTHROUGH 19 NOV 2026", "What Group Data Governance asked us to show")
bullets(s, 49, 94, 360, 280, [
    "Elements and rules per BU: a UI for data elements and rules, by BU / Group Function",
    "Element fields: ID, name, description, status, CDE flag, subject area, domain, sub-domain, defined by, type",
    "Create, edit, delete: elements, rules and CDEs, via the UI or a bulk upload",
    "Standard BU format: one template per object type, filled by the BUs and operations teams",
    "BU → Group flow: BU fills it → persisted in a table → Delta Share → Group governance app visualises it",
    "Rules attached to elements: rule ID, definition, status, description, defined by, applicable to, DQ dimension, last modified",
    "Rule results: total rows, passed, failed, pass %",
    "Lineage: show which table each element originates from",
    "Permissions: Group Data Governance edits everything; BUs edit their own",
    "Reference data, and a monthly DQ run",
], 8.5, 5)
for i, (big, lab) in enumerate([("4 + 14", "sample data elements and DQ rules from AIA's Dev environment, loaded word for word"),
                                ("10 + 4", "BUs and Group Functions running DQ on Data360 today"),
                                ("Monthly", "DQ assessment cadence, about 20 hours per run today")]):
    y = 94 + i * 92
    rect(s, 430, y, 240, 82, OAT)
    rect(s, 430, y, 2, 82, CORAL)
    text(s, 444, y + 10, 220, 26, big, 20, NAVY, True)
    text(s, 444, y + 42, 220, 34, lab, 8, TXT)

# ================================================================ 3 · Requirements coverage
s = page("BUSINESS REQUIREMENTS", "Coverage of the walkthrough scope in the demo")
table(s, 49, 90, [("Requirement", 220, PP_ALIGN.LEFT), ("Demo", 62, PP_ALIGN.LEFT), ("How it's delivered", 339, PP_ALIGN.LEFT)], [
    ["Data elements and rules per BU, with AIA's fields", "✓ Built", "Data Elements and DQ Rules pages; AIA sample content loaded as-is"],
    ["Create, edit, delete elements, rules, CDEs", "✓ Built", "Forms with validation, auto-numbered IDs, versioning, delete protection"],
    ["Bulk upload in a standard BU format", "✓ Built", "Template download, row-by-row validation, preview, submit"],
    ["BU → table → Delta Share → Group app", "◐ Partial", "BU intake tables + Group inbox built; sharing simulated in one workspace"],
    ["Rules attached to elements; BU customisation", "✓ Built", "'Applicable to' DEs; BU override of a Group rule, active once approved"],
    ["Lineage: which table an element comes from", "✓ Built", "Unity Catalog column lineage graph for every mapped CDE column"],
    ["Rule results: total, passed, failed, %", "✓ Built", "Per rule × BU × column vs threshold; failing-row samples; CSV export"],
    ["Group DG edits all; BUs edit their own", "✓ Built", "Role-based access (demo persona switcher; production: SSO + UC groups)"],
    ["Group approves BU-defined CDEs and rules", "✓ Built", "Pending → Approved / Rejected queue; full audit trail"],
    ["Reference data", "✓ Built", "Group code sets plus BU extensions, used by validity rules"],
    ["Monthly DQ execution", "✓ Built", "Serverless Lakeflow Job: monthly schedule + 'Run DQ now'"],
    ["Dashboards, Genie, AI rule drafting, issue management", "○ Next", "Platform features / implementation items (see 'Not in the demo')"],
], row_h=20, head_h=20, size=7.8)

# ================================================================ 4 · Architecture
s = page("ARCHITECTURE", "One Group governance workspace, fed by every BU over Delta Sharing")
picture(s, os.path.join(HERE, "diagrams/data360-governance-architecture.png"), 49, 88, w=621, border=False)
text(s, 49, 368, 621, 11, "Each BU keeps its data in its own workspace. Only the intake tables and DQ marts are shared, read-only and without copies. Unity Catalog governs both sides.", 7.5, MUTED)

# ================================================================ 5 · How UC plays in
s = page("UNITY CATALOG", "The platform does the heavy lifting; the app is a thin governance layer")
table(s, 49, 92, [("Governance need", 170, PP_ALIGN.LEFT), ("Databricks / Unity Catalog capability", 250, PP_ALIGN.LEFT), ("What it means for AIA", 201, PP_ALIGN.LEFT)], [
    ["Business data dictionary", "Delta tables in UC, edited through the app", "Queryable, versioned (time travel), shareable"],
    ["CDE → physical column", "Column comments + tags written from the dictionary", "Definitions travel with the data into SQL, BI, Genie"],
    ["Lineage", "Automatic table + column lineage from every pipeline / job", "Nobody draws lineage; it is always current"],
    ["BU → Group federation", "Delta Sharing (Databricks-to-Databricks)", "BU data stays in the BU workspace; no copies, no e-mails"],
    ["DQ execution", "Serverless Lakeflow Jobs compile rules to SQL", "No idle servers; pay per monthly run"],
    ["Who can see / edit", "UC grants, groups, row filters; Entra ID SCIM", "Same permissions inside and outside the app"],
    ["Results & reporting", "Delta results + SQL warehouse, AI/BI, Genie", "Tableau / Power BI on the same governed numbers"],
    ["Audit", "App audit log + UC audit system tables", "Who changed what, exportable to the SIEM"],
], row_h=29, head_h=20, size=7.8)

# ================================================================ 6–10 · Features
feature("FEATURE 1 · DATA DICTIONARY & CDEs", "A central dictionary with Group and BU views", [
    "Every element: AIA's fields (ID, definition, status, CDE flag, subject area, domain, sub-domain, defined by, DE type) plus owner and version",
    "Group and BU views: BUs see Group-defined elements plus their own; Group sees all",
    "Drill into an element: attached rules (Group and BU overrides), physical mappings, lineage, latest results",
    "Sync to Unity Catalog: writes the definition as the column comment and CDE / domain tags on every mapped column",
    "Safe changes: delete is blocked while rules depend on an element; every edit is versioned and audited",
], "element_rules")

feature("FEATURE 2 · DQ RULE LIBRARY", "Group rules, BU customisation, and rules as readable SQL", [
    "Structured rule builder: not-null, format (regex), reference data, uniqueness, range, custom SQL; no code needed",
    "Group → BU inheritance: GO_DQ_00036 'format defined by the BU' becomes VN / PH / MY versions; each runs only once Group approves it",
    "Transparent execution: the exact SQL the engine ran is shown for every rule",
    "History and evidence: pass % by period and BU, plus sample failing values for remediation",
    "Ownership enforced: a BU steward can't edit a Group rule but can 'Customise for VN'",
], "rule_vn", "BU Vietnam steward view of a Group Operations rule")

feature("FEATURE 3 · DQ EXECUTION & RESULTS", "Monthly assessment on serverless, consolidated for Group automatically", [
    "DQ engine: a serverless Lakeflow Job reads approved rules and CDE mappings, applies BU overrides, compiles each rule to SQL",
    "Monthly schedule plus 'Run now' from the app; results refresh when the job finishes",
    "Results: total, passed, failed and pass % against threshold, per rule × BU × column",
    "Group view: heat-map by BU × dimension, monthly trend, largest breaches first",
    "Open data: results are a Delta table, so CSV export and Tableau / Power BI use the same numbers",
], "overview", "Demo: 65 checks on ~165k customer rows in ~35 s · Aug–Sep history simulated")

feature("FEATURE 4 · PHYSICAL LINEAGE", "Where every CDE comes from, straight from Unity Catalog", [
    "Column-level lineage: source → curated → DQ mart, captured automatically by UC from the pipelines",
    "Consumers shown: e.g. the DQ engine job that reads the mart",
    "Governance overlay: element ID and latest pass % on each mapped column, which plain lineage doesn't show",
    "Explore: click any column or table to re-trace; jump to Catalog Explorer from any card",
    "Beyond Databricks: AS400 / Sybase / ETL lineage can be added through the UC external lineage API",
], "lineage_dialog", "GO_00001 Customer Identifier, BU Malaysia: opened from the element's mapping tab")

feature("FEATURE 5 · BU INTAKE, BULK UPLOAD & APPROVALS", "BUs submit in the standard format; Group approves and merges", [
    "Standard template: one CSV per object type (elements, rules), same columns as today's Data360 content",
    "Validated before anything is written: mandatory fields, ID prefix, known elements, executable rule definition, ownership",
    "BU submissions land in the BU's own intake table, shared to Group over Delta Sharing",
    "Group inbox: review a batch, approve or reject per row or all; approved rows merge into the registry",
    "One approval queue for single edits too: BU changes go to Pending Approval and Group decides",
], "approvals")

# ================================================================ 11 · Roles
s = page("ROLES & PERMISSIONS", "Group Data Governance edits everything; BUs edit their own")
Y, OWN_, NO = "✓", "✓ own", "—"
table(s, 49, 90, [("Action", 205, PP_ALIGN.LEFT), ("Group Data Governance", 110, PP_ALIGN.LEFT), ("Group Function steward", 110, PP_ALIGN.LEFT),
                  ("BU steward", 110, PP_ALIGN.LEFT), ("Viewer", 86, PP_ALIGN.LEFT)], [
    ["See dictionary, rules, results, lineage", "✓ all", "✓ all", "✓ Group + own BU", "✓ all"],
    ["Create / edit / delete elements and rules", "✓ all", "✓ own function", "✓ own BU → pending", NO],
    ["Customise a Group rule for the BU", "✓", NO, "✓ → pending", NO],
    ["Approve / reject", "✓ all", "✓ own function", NO, NO],
    ["Bulk upload", "✓ to registry", "✓ to registry", "✓ to BU intake", NO],
    ["Review BU intake batches", "✓", NO, NO, NO],
    ["Reference data", "✓ Group sets", "✓ own extensions", "✓ own BU extensions", NO],
    ["Run DQ now · Sync to UC", "✓ all", "✓ all", "✓ own BU", NO],
], row_h=24, head_h=22, size=7.8)
text(s, 49, 320, 621, 50, "Demo: a persona switcher shows each role in one session. Production: roles come from Entra ID groups (SCIM) and the app runs as the signed-in user. "
     "UC row filters on the registry enforce 'BU edits own' even outside the app, e.g. in SQL or notebooks.", 8, TXT)

# ================================================================ 12 · Connecting the BUs
s = page("CONNECTING THE BUs", "Onboarding a BU is configuration, not a new project")
steps = [
    ("1", "Register the BU", "Add the tenant (code, name, workspace, region) to the registry; create Entra groups, e.g. bu-ph-stewards"),
    ("2", "BU workspace on UC", "BU workspace on a Unity Catalog metastore, in the Group region or in-country where residency requires it"),
    ("3", "Build the DQ data mart", "Lakeflow Connect / Jobs from core systems into dq_* tables; UC captures lineage automatically"),
    ("4", "Deploy intake tables", "Standard template tables (intake_data_elements, intake_dq_rules) from the same bundle"),
    ("5", "Share to Group", "CREATE SHARE bu_ph_to_group (intake + marts); Group mounts it as a catalog. Read-only, no copies"),
    ("6", "Map CDEs and go live", "Map Group CDEs to the BU's columns, customise rules, Group approves; included in the next monthly run"),
]
for i, (n, t, d) in enumerate(steps):
    x = 49 + (i % 3) * 210
    y = 92 + (i // 3) * 98
    rect(s, x, y, 200, 88, OAT)
    rect(s, x, y, 200, 2, CORAL)
    text(s, x + 10, y + 10, 24, 22, n, 18, LAVA, True)
    text(s, x + 36, y + 13, 158, 14, t, 9.5, NAVY, True)
    text(s, x + 10, y + 36, 182, 48, d, 7.8, TXT)
text(s, 49, 293, 621, 12, "WHERE THE DQ ENGINE RUNS", 7.5, LAVA, True, "DM Mono")
for i, (t, d) in enumerate([("A · Central (default)", "Group runs the engine on the shared BU marts. One schedule, one bill, simplest to operate."),
                            ("B · In the BU (residency-restricted markets)", "The BU runs the same job in its own workspace; only results and intake are shared back to Group.")]):
    x = 49 + i * 315
    rect(s, x, 307, 306, 58, WHITE, line=LINE)
    text(s, x + 10, 314, 290, 12, t, 9, NAVY, True)
    text(s, x + 10, 330, 290, 32, d, 8, TXT)

# ================================================================ 13 · Setting up the platform
s = page("SETTING UP THE PLATFORM", "Everything in the demo is deployed as code and can be redeployed to AIA")
table(s, 49, 90, [("Component", 150, PP_ALIGN.LEFT), ("How it is set up", 330, PP_ALIGN.LEFT), ("Typical owner", 141, PP_ALIGN.LEFT)], [
    ["Group governance workspace", "Azure Databricks (East Asia), Unity Catalog metastore, Private Link, CMK", "AIA platform team"],
    ["Governance registry", "Setup SQL in the bundle creates the schema; Data360 export loaded via bulk upload", "SI / Databricks"],
    ["App + DQ engine job", "One Asset Bundle: databricks bundle deploy -t prod, promoted from Git CI/CD", "SI"],
    ["Identity", "Entra ID SSO + SCIM groups mapped to app roles; app runs with user authorisation", "AIA IAM"],
    ["Permissions", "App service principal: USE / SELECT / MODIFY / APPLY TAG on registry and shared catalogs", "AIA platform team"],
    ["Environments & DR", "DEV → TEST → PROD via bundle targets; daily deep clone to paired region (RTO 48h / RPO 24h)", "SI"],
    ["Per BU (×14)", "Steps on the previous slide; templates and shares are parameterised by BU code", "BU data team + Group DG"],
], row_h=27, head_h=20, size=7.8)
text(s, 49, 320, 621, 40, "The demo itself (registry, app, DQ engine, synthetic BU marts) was stood up in about two days on a single Databricks workspace with the same bundle. "
     "Moving to AIA means changing the catalog and workspace targets, not the code.", 8, TXT)

# ================================================================ 14 · Not in the demo
s = page("SCOPE", "What's in the demo, what's platform, and what's still to build")
cols = [
    ("IN THE DEMO TODAY", GREEN, ["Dictionary, CDEs, rules: create / edit / delete", "Group → BU rule customisation + approval",
                                  "Bulk upload with validation; BU intake inbox", "Serverless DQ engine; results + failing rows",
                                  "UC lineage graph with DQ overlay", "Reference data; audit trail", "Sync definitions + tags into UC"]),
    ("PLATFORM, TO SWITCH ON", AMBER, ["Cross-workspace Delta Sharing (simulated today)", "AI/BI dashboards per Group / BU / domain",
                                        "Genie over results and dictionary", "Data quality monitoring between runs",
                                        "UC row filters / ABAC by BU", "SSO user authorisation (replaces persona switcher)", "DR to paired region"]),
    ("TO BUILD IN IMPLEMENTATION", LAVA, ["Multi-step approval chains, SLAs, escalation", "DQ issue management (assign, remediate, close)",
                                           "Metadata + lineage scanners for AS400, Sybase, ETL", "AI-assisted rule drafting with human review",
                                           "Data360 content migration and parallel run", "Production hardening, security review, UAT", "BU onboarding waves"]),
]
for i, (h, c, items) in enumerate(cols):
    x = 49 + i * 210
    rect(s, x, 92, 200, 24, c)
    text(s, x + 10, 92, 186, 24, h, 8, WHITE, True, "DM Mono", anchor=MSO_ANCHOR.MIDDLE)
    rect(s, x, 116, 200, 222, OAT)
    rich(s, x + 10, 126, 182, 210, [[("▪ ", False, c), (t, False, TXT)] for t in items], 8.2, 7)
text(s, 49, 345, 621, 30, "Demo data is synthetic (VN / PH / MY customer and policy marts, Group Investments holdings) seeded with realistic defects; AIA's sample elements and rules are real. "
     "Aug–Sep 2026 results are simulated history. Everything runs in one Databricks workspace.", 7.5, MUTED)

# ================================================================ 15 · Sizing check
from sizing_check import results as _sizing  # noqa: E402
R = _sizing()
k = lambda v: f"${v / 1000:,.1f}k"  # noqa: E731
s = page("1-YEAR RUNNING COST · RE-CHECKED AGAINST THE DEMO", "The initial sizing holds; the demo takes one line out")
text(s, 49, 90, 621, 12, "DATABRICKS 1-YEAR RUNNING COST (USD, AFTER 37% GROUP COMMIT DISCOUNT)", 7.5, LAVA, True, "DM Mono")
table(s, 49, 104, [("", 291, PP_ALIGN.LEFT), ("Low", 110, PP_ALIGN.RIGHT), ("Base", 110, PP_ALIGN.RIGHT), ("High", 110, PP_ALIGN.RIGHT)], [
    ["Initial sizing (Data360 1-year running cost, Nov 2026)"] + [k(R["submitted"][x]) for x in ("Low", "Base", "High")],
    ["As demonstrated: registry on Delta in Unity Catalog, no Lakebase"] + [k(R["no_lakebase"][x]) for x in ("Low", "Base", "High")],
    ["Change"] + [f"−{k(R['submitted'][x] - R['no_lakebase'][x])}" for x in ("Low", "Base", "High")],
], row_h=22, head_h=20, size=8.5)
rect(s, 340 + 110, 124, 110, 44, "FFF1EE")  # highlight Base column (both value rows)
text(s, 340 + 117, 124, 96, 22, k(R["submitted"]["Base"]), 8.5, TXT, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
text(s, 340 + 117, 146, 96, 22, k(R["no_lakebase"]["Base"]), 9.5, NAVY, True, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)

text(s, 49, 206, 300, 12, "WHAT THE DEMO CONFIRMS", 7.5, LAVA, True, "DM Mono")
bullets(s, 49, 222, 300, 140, [
    "Same services as sized: serverless Lakeflow Job for DQ, a Medium Databricks App, serverless SQL warehouse",
    "DQ engine: 65 checks over ~165k synthetic rows in about a minute per run. Real volumes are unknown, so the sizing keeps today's 3–8 h per BU (conservative; calibrate in the PoC)",
    "No Lakebase needed: approvals, audit, intake and CRUD run on Delta at ~5 governance contributors; keep it optional for issue management",
    "No new cost lines: the app uses the dashboards' SQL warehouse; Delta Sharing has no Databricks charge and the shared intake tables are small",
], 8, 6)

text(s, 370, 206, 300, 12, "INPUTS TO CONFIRM (BASE, WITHOUT LAKEBASE)", 7.5, LAVA, True, "DM Mono")
rect(s, 370, 222, 300, 118, OAT)
rich(s, 382, 230, 280, 128, [
    [("Monthly DQ run of ~20 hours. ", True, NAVY), ("The sizing assumes 14 tenants × 5.5 h × 2 runs (monthly run + one re-run).", False, TXT)],
    [("▪ ", False, LAVA), ("20 h for the whole monthly cycle: ", True, TXT), (k(R["cycle_20h"]["Base"]), True, GREEN)],
    [("▪ ", False, LAVA), ("20 h per BU per month: ", True, TXT), (k(R["per_bu_20h"]["Base"]), True, AMBER)],
    [("Production spec for the development environment. ", True, NAVY),
     ("A full-size DQ run in DEV adds ", False, TXT), (f"+{k(R['dev_one'])}", True, TXT), (" (one 20 h run a month) to ", False, TXT),
     (f"+{k(R['dev_per_bu'])}", True, TXT), (" (20 h per BU) a year.", False, TXT)],
], 8, 5)
text(s, 49, 368, 621, 11, "Steady-state 12 months · Azure East Asia list rates · Prod + non-prod · excl. migration services, Azure storage, networking · source: sizing workbook", 6.5, MUTED)

# ================================================================ 16 · Next steps
s = page("NEXT STEPS", "Proposed path from demo to production", bg=NAVY)
for i, (t, d) in enumerate([
    ("Confirm scope and priorities", "Walk through the coverage on slide 3 with Group DG and Group Operations; agree must-haves for phase 1"),
    ("PoC on one BU, end to end", "e.g. BU Philippines: real DQ mart, its rules, a real Delta Share to a Group workspace, one monthly cycle"),
    ("Agree the operating model", "Roles and approval chain per Group Function and BU; who owns reference data"),
    ("Confirm sizing inputs", "What the monthly ~20-hour run covers, non-prod spec, number of BUs per wave"),
    ("Plan the Data360 migration", "Export glossary, CDEs and rules into the standard templates; parallel run before retiring Data360"),
]):
    y = 96 + i * 54
    text(s, 49, y, 30, 30, f"{i + 1:02d}", 18, CORAL, True)
    text(s, 90, y + 2, 580, 14, t, 11, WHITE, True)
    text(s, 90, y + 20, 580, 26, d, 8.5, "C7D2D6")

prs.save(OUT)
print("wrote", OUT, "slides:", len(prs.slides))
