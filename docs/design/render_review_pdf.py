"""Offline ReportLab rendering of the authored overview; no browser or network."""
from pathlib import Path
from html.parser import HTMLParser
from html import escape
import io
import re
import subprocess

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                               TableStyle, Image, KeepTogether, HRFlowable)

import build_current_overview as content

OUT=Path(__file__).resolve().parent
TMP=OUT/'tmp'/'pdfs'
TMP.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('ReviewCJK','/System/Library/Fonts/Supplemental/Arial Unicode.ttf'))
pdfmetrics.registerFontFamily('ReviewCJK',normal='ReviewCJK',bold='ReviewCJK',italic='ReviewCJK',boldItalic='ReviewCJK')
INK=colors.HexColor('#2C2C2A');BLUE=colors.HexColor('#185FA5');MUTED=colors.HexColor('#5F5E5A');LINE=colors.HexColor('#D3D1C7')
PAGE_W,PAGE_H=A4
WIDTH=PAGE_W-84
base=dict(fontName='ReviewCJK',textColor=INK,wordWrap='CJK',splitLongWords=True,allowWidows=0,allowOrphans=0)
ST={
 'body':ParagraphStyle('body',fontSize=9.5,leading=16,spaceAfter=7,**base),
 'h1':ParagraphStyle('h1',fontSize=19,leading=28,spaceAfter=9,**base),
 'h2':ParagraphStyle('h2',fontSize=14,leading=21,spaceBefore=19,spaceAfter=9,keepWithNext=True,**{**base,'textColor':BLUE}),
 'h3':ParagraphStyle('h3',fontSize=11,leading=17,spaceBefore=12,spaceAfter=6,keepWithNext=True,**base),
 'h4':ParagraphStyle('h4',fontSize=9.5,leading=16,spaceBefore=9,spaceAfter=5,keepWithNext=True,**base),
 'small':ParagraphStyle('small',fontSize=8,leading=12,spaceAfter=6,**{**base,'textColor':MUTED}),
 'cell':ParagraphStyle('cell',fontSize=8,leading=12,spaceAfter=0,**base),
 'thead':ParagraphStyle('thead',fontSize=8,leading=12,spaceAfter=0,**{**base,'textColor':colors.HexColor('#3F4D59')}),
 'caption':ParagraphStyle('caption',fontSize=7.5,leading=11,spaceBefore=4,spaceAfter=10,alignment=1,**{**base,'textColor':MUTED}),
 'pre':ParagraphStyle('pre',fontSize=7.5,leading=11.5,spaceAfter=8,**base),
 'bullet':ParagraphStyle('bullet',fontSize=9.2,leading=15.5,leftIndent=12,firstLineIndent=-10,spaceAfter=5,**base)
}


class Node:
 def __init__(self,tag='root',attrs=None):self.tag=tag;self.attrs=dict(attrs or []);self.children=[]


class Parser(HTMLParser):
 def __init__(self):super().__init__();self.root=Node();self.stack=[self.root]
 def handle_starttag(self,t,a):
  n=Node(t,a);self.stack[-1].children.append(n)
  if t not in ['br','hr','img','input','meta']:self.stack.append(n)
 def handle_startendtag(self,t,a):self.stack[-1].children.append(Node(t,a))
 def handle_endtag(self,t):
  if self.stack[-1].tag==t:self.stack.pop()
 def handle_data(self,d):self.stack[-1].children.append(d)


def parse(s):p=Parser();p.feed(s);return p.root
def plain(n):return n if isinstance(n,str) else ''.join(plain(c) for c in n.children)
def inline(n):
 if isinstance(n,str):return escape(n)
 children=''.join(inline(c) for c in n.children)
 if n.tag=='br':return '<br/>'
 if n.tag in ['b','strong']:return '<b>'+children+'</b>'
 if n.tag in ['i','em']:return '<i>'+children+'</i>'
 if n.tag=='a' and n.attrs.get('href','').startswith(('https://','http://')):return '<link href="'+escape(n.attrs['href'],quote=True)+'" color="#185FA5">'+children+'</link>'
 if n.tag=='code':return '<font color="#344A5A">'+children+'</font>'
 return children


def descendants(n,tag):
 found=[]
 for c in n.children:
  if isinstance(c,Node):
   if c.tag==tag:found.append(c)
   else:found.extend(descendants(c,tag))
 return found


def para(s,style='body'):return Paragraph(s,ST[style])
def framed(s,kind):
 fill={'note':'#E6F1FB','warn':'#FAEEDA','ok':'#E1F5EE','sum':'#F7F6F2','formula':'#F6FAFD'}[kind]
 t=Table([[para(s,'small' if kind!='sum' else 'body')]],colWidths=[WIDTH])
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor(fill)),('BOX',(0,0),(-1,-1),.5,LINE),('LEFTPADDING',(0,0),(-1,-1),11),('RIGHTPADDING',(0,0),(-1,-1),11),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
 return [t,Spacer(1,8)]


def render_node(n):
 if isinstance(n,str):return [para(escape(n))] if n.strip() else []
 if n.tag=='p':return [para(inline(n))]
 if n.tag in ['h3','h4']:return [para(inline(n),n.tag)]
 if n.tag=='pre':return framed('<br/>'.join(escape(plain(n)).splitlines()),'sum')
 if n.tag in ['ul','ol']:
  return [para(('□ ' if n.attrs.get('class')=='chk' else f'{i}. ' if n.tag=='ol' else '• ')+inline(x),'bullet') for i,x in enumerate([c for c in n.children if isinstance(c,Node) and c.tag=='li'],1)]
 if n.tag=='table':
  rows=descendants(n,'tr');cells=[]
  for r in rows:cells.append([para(inline(c),'thead' if c.tag=='th' else 'cell') for c in r.children if isinstance(c,Node) and c.tag in ['td','th']])
  count=max(len(r) for r in cells)
  weights={2:[.24,.76],3:[.24,.19,.57],4:[.17,.34,.29,.20],5:[.075,.135,.28,.21,.30],6:[.065,.065,.12,.30,.21,.24]}.get(count,[1/count]*count)
  if count==3 and '术语' in plain(rows[0]):weights=[.22,.39,.39]
  # Keep interface paths readable while reserving enough width for request descriptions.
  if count==3 and '方法与路径' in plain(rows[0]):weights=[.37,.16,.47]
  if count==3 and '核心内容' in plain(rows[0]):weights=[.13,.26,.61]
  weights=[w/sum(weights) for w in weights]
  t=Table(cells,colWidths=[WIDTH*w for w in weights],repeatRows=1,hAlign='LEFT')
  commands=[('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.4,LINE),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#F7F6F2')),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]
  for i in range(2,len(cells),2):commands.append(('BACKGROUND',(0,i),(-1,i),colors.HexColor('#FBFBF9')))
  t.setStyle(TableStyle(commands));return [t,Spacer(1,9)]
 if n.tag=='div':
  cls=n.attrs.get('class','')
  if cls in ['note','warn','ok']:return framed(inline(n),cls)
  if cls=='formula':return framed('<br/>'.join(inline(c) for c in n.children if isinstance(c,Node)),'formula')
  if cls=='sum':
   terms=descendants(n,'dt');defs=descendants(n,'dd')
   return framed('<br/>'.join('<b>'+inline(a)+'</b>　'+inline(b) for a,b in zip(terms,defs)),'sum')
  if cls=='sign':
   cells=[[para(inline(c),'small') for c in n.children if isinstance(c,Node)]]
   t=Table(cells,colWidths=[WIDTH/3]*3,rowHeights=[75]);t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),10)]));return [t,Spacer(1,10)]
 if n.tag=='figure':
  image=next(c for c in n.children if isinstance(c,Node) and c.tag=='img')
  cap=next(c for c in n.children if isinstance(c,Node) and c.tag=='figcaption')
  im=Image(image.attrs['src']);ratio=im.imageHeight/im.imageWidth;im.drawWidth=WIDTH;im.drawHeight=WIDTH*ratio
  return [im,para(inline(cap),'caption')]
 result=[]
 for child in n.children:result.extend(render_node(child))
 return result


fig_count=0
def replace_svg(match):
 global fig_count
 fig_count+=1
 svg=TMP/f'doc-figure-{fig_count}.svg';png=TMP/f'doc-figure-{fig_count}.png'
 svg.write_text(match.group(0),encoding='utf-8')
 subprocess.run(['rsvg-convert','-w','1680',str(svg),'-o',str(png)],check=True)
 return '<img src="'+str(png)+'">'


def page(canvas,doc):
 canvas.saveState();canvas.setFont('ReviewCJK',7);canvas.setFillColor(MUTED)
 if doc.page>1:
  canvas.drawString(42,PAGE_H-25,'学生学期综合素质评价系统 · 概要设计 V1.0（当前实现评审稿）')
  canvas.setStrokeColor(LINE);canvas.setLineWidth(.4);canvas.line(42,PAGE_H-31,PAGE_W-42,PAGE_H-31)
 canvas.setStrokeColor(LINE);canvas.line(42,31,PAGE_W-42,31)
 canvas.drawString(42,20,'2026-10-23 · 依据当前代码，非生产验收结论')
 canvas.drawRightString(PAGE_W-42,20,str(doc.page));canvas.restoreState()


if __name__=='__main__':
 story=[para('基于当前实现 · 待评审','small'),para('学生学期综合素质评价系统<br/>概要设计','h1'),para('V1.0（当前实现评审稿）　|　2026-10-23','small'),para('用途：现状核对 / 技术评审 / 整改确认','small'),HRFlowable(width='100%',thickness=1.1,color=INK),Spacer(1,10)]
 story.extend(framed('3 个账号角色　/　19 个非错误视图　/　35 条主 API 路由　/　17 张仓库表定义<br/>正文仅描述已有代码；模拟、契约差异和未实现能力明确区分。','sum'))
 story.append(para('目录','h3'))
 for i,(title,_) in enumerate(content.SECTIONS,1):story.append(para(f'<link href="#chapter-{i}" color="#185FA5">{escape(title)}</link>','small'))
 for i,(title,subs) in enumerate(content.SECTIONS,1):
  for j,(subtitle,body) in enumerate(subs):
   headings=([para(f'<a name="chapter-{i}"/>'+escape(title),'h2')] if j==0 else [])+[para(escape(subtitle),'h3')]
   body=re.sub(r'<svg\b.*?</svg>',replace_svg,body,flags=re.S)
   parsed=parse(body)
   nodes=[n for n in parsed.children if not isinstance(n,str) or n.strip()]
   if nodes and isinstance(nodes[0],Node) and nodes[0].tag=='figure':
    story.append(KeepTogether(headings+render_node(nodes[0])))
    for n in nodes[1:]:story.extend(render_node(n))
   else:
    story.extend(headings)
    story.extend(render_node(parsed))
 destination=content.ROOT/'output'/'pdf'
 destination.mkdir(parents=True,exist_ok=True)
 filename=destination/(content.NAME+'.pdf')
 doc=SimpleDocTemplate(str(filename),pagesize=A4,leftMargin=42,rightMargin=42,topMargin=44,bottomMargin=44,title='学生学期综合素质评价系统 概要设计 V1.0 当前实现评审稿',author='项目设计文档',pageCompression=1)
 doc.build(story,onFirstPage=page,onLaterPages=page)
 print(filename)
