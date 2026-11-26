"""Data360 governance platform: BU -> Group federated architecture (drawio). Same design language as
../../data360-sizing/diagrams (style.py copied). Usage: python3 build_demo_arch.py data360-governance-architecture.drawio"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from style import *  # noqa: F401,F403

d = D()
d.title("Data360 Governance Platform", "BU → Group federated architecture on Databricks", 1900)

OWN = F + "rounded=1;arcSize=12;fillColor=#FFFFFF;strokeColor=#1B3139;strokeWidth=1.5;fontColor=#1B3139;fontSize=11;align=left;spacingLeft=10;spacingRight=8;verticalAlign=middle;"
DEMO = '<span style="background-color:#00A972;color:#FFFFFF;font-size:8px;"><b>&nbsp;IN DEMO&nbsp;</b></span>'
PROD = '<span style="background-color:#1B3139;color:#FFFFFF;font-size:8px;"><b>&nbsp;IMPLEMENTATION&nbsp;</b></span>'
SIM = '<span style="background-color:#78909C;color:#FFFFFF;font-size:8px;"><b>&nbsp;SIMULATED IN DEMO&nbsp;</b></span>'
C11 = CARD + "fontSize=11;spacingRight=8;"
R11 = RET + "fontSize=11;spacingRight=8;"
S11 = SRC + "align=left;spacingLeft=10;spacingRight=8;fontSize=11;"


def card(icon, title, sub, x, y, w, h, style=C11, tail=""):
    return d.card(icon, title, sub, x, y, w, h, style, tail)


# ---------------- BU workspaces (left)
d.v(OUTER, "BU workspaces (10 BUs + 4 Group Functions)", 20, 90, 470, 760)
bus = []
for i, (bu, src) in enumerate([("BU Vietnam", "LifeAsia (VN)"), ("BU Philippines", "Ingenium (PH)"), ("BU Malaysia · + other BUs", "LifeAsia (MY) …")]):
    y = 140 + i * 232
    lane = d.v(LANE + "fontSize=12;startSize=28;", bu, 36, y, 438, 218)
    card("🏦", "Core systems", src + " · Oracle · AS400", 48, y + 40, 196, 54, S11)
    card("🔌", "Lakeflow Connect / Jobs", "land + curate (src → curated)", 48, y + 100, 196, 54, C11, "")
    card("🗄️", "DQ data mart (Delta)", "customer / policy grain · UC lineage", 48, y + 160, 196, 50, C11, "<br>" + DEMO)
    intake = card("📥", "Intake tables", "standard template v1 · elements + rules · filled by BU stewards", 256, y + 40, 206, 84, C11, "<br>" + DEMO)
    share = card("🔗", "Delta Share → Group", "read-only · no copies · intake + DQ marts", 256, y + 132, 206, 78, R11, "<br>" + SIM)
    bus.append((lane, intake, share))

# ---------------- Group governance workspace (centre)
d.v(PLAT, "Group governance workspace · Azure Databricks · Unity Catalog · serverless", 520, 90, 1030, 760)
il = d.v(LANE + "fontSize=12;", "Shared BU catalogs (recipient)", 536, 140, 188, 520)
inbound = []
for i, bu in enumerate(["VN", "PH", "MY + others"]):
    inbound.append(card("📦", f"{bu} shared catalog", "intake tables + DQ marts · read-only · read in place by the app &amp; DQ engine", 548, 182 + i * 160, 164, 130, R11, "<br>" + SIM))

gl = d.v(LANE, "Governance registry (Delta in UC)", 736, 140, 255, 520)
reg = [
    ("📚", "Data elements / CDEs", "ID · name · definition · status · CDE flag · domain · sub-domain · owner"),
    ("📐", "DQ rule library", "dimension · structured definition · threshold · Group rule → BU override"),
    ("🧭", "CDE → physical mapping", "element ↔ BU table.column"),
    ("📖", "Reference data", "Group code sets + BU extensions"),
    ("🗃️", "DQ runs · results · failed samples", "total / passed / failed / pass % per rule × BU × column"),
    ("🧾", "Audit log · approvals", "who changed what, before / after"),
]
for k, (ic, t, s) in enumerate(reg):
    card(ic, t, s, 748, 182 + k * 78, 231, 70, C11, "")

al = d.v(LANE, "Governance app (Databricks App)", 1003, 140, 270, 520)
app_items = [
    ("📝", "Dictionary & rule CRUD", "create · edit · delete · rule builder"),
    ("✅", "Approval workflow", "BU changes → Pending → Group approves"),
    ("📤", "Bulk upload + BU intake inbox", "validate rows · review batches · merge"),
    ("🔀", "Physical lineage graph", "UC column lineage + DE badges + pass %"),
    ("👥", "Role-based access", "Group DG all · stewards own tenant · viewers"),
    ("▶️", "Run DQ now", "triggers the DQ engine job"),
]
for k, (ic, t, s) in enumerate(app_items):
    card(ic, t, s, 1015, 182 + k * 78, 246, 70, C11, " " + DEMO if k == 0 else "")

ql = d.v(LANE, "DQ engine & consumption", 1285, 140, 250, 520)
eng = card("⚙️", "DQ engine · Lakeflow Job", "serverless · monthly + on demand · compiles approved rules → SQL · resolves BU overrides", 1297, 182, 226, 98, C11, "<br>" + DEMO)
card("📊", "AI/BI dashboards", "Group · BU · domain · CDE views · viewer credentials + row filters", 1297, 292, 226, 82, R11, "<br>" + PROD)
card("💬", "Genie", "ask DQ results &amp; the dictionary in natural language", 1297, 386, 226, 70, R11, "<br>" + PROD)
card("🧮", "SQL warehouse", "Tableau · Power BI · CSV export", 1297, 468, 226, 62, C11, "")
card("🤖", "AI-assisted rule drafting", "Foundation Models via AI Gateway · human approval", 1297, 542, 226, 74, R11, "<br>" + PROD)

uc = d.v(CARD + "fontSize=11;", '<span style="font-size:18px;">🔐</span>&nbsp; <b>Unity Catalog underneath everything</b><br>'
         + SUB % "automatic table + column lineage · column comments &amp; tags written from the dictionary (d360_de_id, d360_cde, d360_domain) · grants · row filters · audit system tables → SIEM · Entra ID SCIM groups",
         536, 676, 999, 60)
d.v(OWN, '<span style="font-size:18px;">🚀</span>&nbsp; <b>Deployed as code</b> ' + DEMO + '<br>'
    + SUB % "one Asset Bundle: app + DQ job + grants · Git CI/CD · DEV → TEST → PROD · BU onboarding = config, not code",
    536, 748, 999, 54)

# ---------------- users (right)
usr = d.v(OUTER, "People &amp; tools", 1570, 90, 330, 760)
people = [
    ("🏛️", "Group Data Governance", "edits all · approves BU content · reviews intake"),
    ("🧑‍💼", "Group Function stewards", "Operations · Compliance · Investments · own their CDEs &amp; rules"),
    ("🧑‍💻", "BU data stewards", "edit own BU only · customise Group rules · bulk upload"),
    ("👥", "Read-only users", "unlimited · app · dashboards · Genie"),
    ("📈", "Tableau · Power BI", "same governed DQ results"),
    ("🛰️", "SIEM · Entra ID", "audit export · SSO · groups"),
]
for k, (ic, t, s) in enumerate(people):
    card(ic, t, s, 1586, 140 + k * 104, 298, 90, S11, "")

# ---------------- edges
for (_, intake, share), inb in zip(bus, inbound):
    d.e(intake, share, "", "exitX=0.5;exitY=1;entryX=0.5;entryY=0;strokeWidth=1.5;")
    d.e(share, inb, "", "exitX=1;exitY=0.5;entryX=0;entryY=0.5;strokeColor=#FF3621;dashed=1;")
d.e(il, gl, "", "exitX=1;exitY=0.5;entryX=0;entryY=0.5;")
d.e(al, gl, "read / write", "exitX=0;exitY=0.25;entryX=1;entryY=0.25;startArrow=classic;startFill=1;")
d.e(al, ql, "run", "exitX=1;exitY=0.85;entryX=0;entryY=0.85;")
d.e(ql, usr, "", "exitX=1;exitY=0.5;entryX=0;entryY=0.5;")

# ---------------- legend
lg = TEXT + "fontSize=11;fontColor=#37474F;"
d.v(CARD, "", 40, 872, 28, 18); d.v(lg, "Databricks platform capability", 74, 868, 210, 26)
d.v(OWN, "", 300, 872, 28, 18); d.v(lg, "Built on the platform (the demo app, DQ engine, deployment)", 334, 868, 380, 26)
d.v(RET, "", 730, 872, 28, 18); d.v(lg, "Production pattern not yet in the demo (Delta Sharing simulated in a single workspace; dashboards, Genie, AI next)", 764, 868, 760, 26)
d.save(sys.argv[1], "Data360 governance architecture", 1920, 910)
print("wrote", sys.argv[1])
