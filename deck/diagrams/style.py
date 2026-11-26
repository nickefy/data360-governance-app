"""Shared drawio style helpers matching the GIO architecture reference (design only)."""
import html
F="whiteSpace=wrap;html=1;fontFamily=Helvetica;"
LANE=F+"swimlane;startSize=34;rounded=1;arcSize=2;fillColor=#FAFAFA;swimlaneFillColor=#FFFFFF;strokeColor=#B0BEC5;strokeWidth=2;fontColor=#37474F;fontSize=14;fontStyle=1;"
OUTER=F+"swimlane;startSize=34;rounded=1;arcSize=2;fillColor=#F5F5F5;swimlaneFillColor=#FFFFFF;strokeColor=#90A4AE;strokeWidth=2;fontColor=#37474F;fontSize=14;fontStyle=1;"
PLAT=F+"swimlane;startSize=34;rounded=1;arcSize=2;fillColor=#F9F7F4;swimlaneFillColor=#FFFFFF;strokeColor=#1B3139;strokeWidth=2;fontColor=#1B3139;fontSize=14;fontStyle=1;"
SRC=F+"rounded=1;arcSize=12;fillColor=#FFFFFF;strokeColor=#90A4AE;fontColor=#1B3139;fontSize=11;"
CARD=F+"rounded=1;arcSize=12;fillColor=#E8F5E9;strokeColor=#2E7D32;strokeWidth=1.5;fontColor=#1B3139;fontSize=12;align=left;spacingLeft=10;verticalAlign=middle;"
RET=F+"rounded=1;arcSize=12;fillColor=#FFFFFF;strokeColor=#90A4AE;strokeWidth=1.5;dashed=1;dashPattern=6 4;fontColor=#1B3139;fontSize=12;align=left;spacingLeft=10;verticalAlign=middle;"
PROP=F+"rounded=1;arcSize=6;fillColor=#FFFFFF;strokeColor=#FF3621;strokeWidth=2;dashed=1;dashPattern=6 4;fontColor=#1B3139;fontSize=11;align=left;verticalAlign=top;spacingLeft=10;spacingRight=6;spacingTop=6;"
PILL=F+"rounded=1;arcSize=40;fillColor=#2E7D32;strokeColor=#2E7D32;fontColor=#FFFFFF;fontSize=10;"
PILLR=F+"rounded=1;arcSize=40;fillColor=#FF3621;strokeColor=#FF3621;fontColor=#FFFFFF;fontSize=10;"
PILLD=F+"rounded=1;arcSize=40;fillColor=#1B3139;strokeColor=#1B3139;fontColor=#FFFFFF;fontSize=10;"
# Release-status markers: green card = GA now, amber dashed = GA expected within a month, grey dashed (RET) = Beta / Preview.
# LATER takes the full badge text, e.g. LATER%"BETA · GA EST. JAN 27"; estimates are internal roadmap targets.
NEAR=F+"rounded=1;arcSize=12;fillColor=#FFF3E0;strokeColor=#F57C00;strokeWidth=1.5;dashed=1;dashPattern=6 4;fontColor=#1B3139;fontSize=12;align=left;spacingLeft=10;verticalAlign=middle;"
NO=F+"rounded=1;arcSize=12;fillColor=#FFEBEE;strokeColor=#FF3621;strokeWidth=1.5;dashed=1;dashPattern=6 4;fontColor=#1B3139;fontSize=12;align=left;spacingLeft=10;verticalAlign=middle;"
DIAMOND=F+"rhombus;fillColor=#1B3139;strokeColor=#1B3139;fontColor=#FFFFFF;fontSize=12;fontStyle=1;"
GA='<span style="background-color:#2E7D32;color:#FFFFFF;font-size:8px;"><b>&nbsp;GA&nbsp;</b></span>'
SOON='<span style="background-color:#F57C00;color:#FFFFFF;font-size:8px;"><b>&nbsp;GA EXPECTED EARLY NOV&nbsp;</b></span>'
import os
# GIO_EXTERNAL=1: customer-safe build. No internal GA estimates; Pages shows as Beta.
EXTERNAL=os.environ.get("GIO_EXTERNAL")=="1"
LATER='<span style="background-color:#78909C;color:#FFFFFF;font-size:8px;"><b>&nbsp;%s&nbsp;</b></span>'
TEXT=F+"text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;"
EDGE="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=classic;endFill=1;strokeColor=#37474F;strokeWidth=2;fontFamily=Helvetica;fontSize=10;fontColor=#37474F;labelBackgroundColor=#FFFFFF;"
SUB='<span style="font-size:10px;color:#4E5D63;">%s</span>'
RED='<span style="color:#FF3621;font-size:10px;">%s</span>'
BADGE='<span style="background-color:#FF3621;color:#FFFFFF;font-size:9px;"><b>&nbsp;%s&nbsp;</b></span>'
STATUS='<span style="background-color:#1B3139;color:#FFFFFF;font-size:8px;"><b>&nbsp;%s&nbsp;</b></span>'
LIVE='<span style="color:#00A972;font-size:10px;"><b>● %s</b></span>'
MVP='<span style="color:#F57C00;font-size:10px;"><b>● %s</b></span>'

class D:
    def __init__(s): s.cells=[]; s.n=0
    def _id(s): s.n+=1; return f"n{s.n}"
    def v(s,style,val,x,y,w,h):
        i=s._id(); s.cells.append(f'<mxCell id="{i}" parent="1" style="{style}" value="{html.escape(val)}" vertex="1"><mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>'); return i
    def e(s,a,b,label="",extra=""):
        i=s._id(); s.cells.append(f'<mxCell id="{i}" edge="1" parent="1" source="{a}" target="{b}" style="{EDGE}{extra}" value="{html.escape(label)}"><mxGeometry relative="1" as="geometry"/></mxCell>')
    def card(s,icon,title,sub,x,y,w,h=66,style=CARD,tail=""):
        return s.v(style,f'<span style="font-size:18px;">{icon}</span>&nbsp; <b>{title}</b>{tail}<br>'+SUB%sub,x,y,w,h)
    def prop(s,icon,title,lines,x,y,w,h,badge="",status="",aims=None):
        t=f'<span style="font-size:18px;">{icon}</span>&nbsp; <b style="font-size:12px;">{title}</b>'+(" "+BADGE%badge if badge else "")
        if status: t+=" "+STATUS%status
        t+="".join("<br>"+SUB%l for l in lines)
        if aims: t+="<br>"+RED%("<b>Aim to improve:</b>"+"".join("<br>▲ "+a for a in aims))
        return s.v(PROP,t,x,y,w,h)
    def title(s,a,b,w):
        return s.v(TEXT,f'<b style="font-size:22px;color:#1B3139;">{a}</b><b style="font-size:22px;color:#FF3621;"> · {b}</b>',20,40,w,34)
    def save(s,path,name,pw,ph):
        xml=f'''<mxfile host="app.diagrams.net">
  <diagram name="{html.escape(name)}" id="d1">
    <mxGraphModel dx="1906" dy="1131" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{pw}" pageHeight="{ph}" math="0" shadow="0">
      <root><mxCell id="0"/><mxCell id="1" parent="0"/>
{chr(10).join(s.cells)}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>'''
        open(path,"w").write(xml)
