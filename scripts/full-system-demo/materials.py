"""Generate fictional, repeatable demo inputs. No database writes or claimed test results."""
from pathlib import Path
import json,csv,hashlib,sys,shutil,html
from decimal import Decimal, ROUND_HALF_UP
import xlsxwriter
from PIL import Image,ImageDraw,ImageFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
BASE=Path(__file__).resolve().parent
ROOT=BASE.parent.parent
OUT=Path(sys.argv[1]).resolve()
m=json.loads((OUT/'manifest.json').read_text())
run=m['runId']
DOC=OUT/'materials'
DOC.mkdir(exist_ok=True)
for sub in ['inputs','stories','evidence','downloads']:(OUT/sub).mkdir(exist_ok=True)
IN=OUT/'inputs'; students=[u for u in m['users'] if u['role']=='student' and u['schoolId']==1]
def table(name,headers,rows,csv_too=True):
 p=IN/(name+'.xlsx');w=xlsxwriter.Workbook(p);s=w.add_worksheet('数据');h=w.add_format({'bold':True,'bg_color':'#204D40','font_color':'white','font_name':'Arial','text_wrap':True});f=w.add_format({'font_name':'Arial','font_size':11});s.write_row(0,0,headers,h)
 for i,row in enumerate(rows,1):s.write_row(i,0,row,f)
 s.freeze_panes(1,0);s.autofilter(0,0,len(rows),len(headers)-1);s.set_column(0,len(headers)-1,18);s.set_row(0,32);w.close()
 if csv_too:
  with (IN/(name+'.csv')).open('w',encoding='utf-8-sig',newline='') as o:wr=csv.writer(o);wr.writerow(headers);wr.writerows(rows)
 return p
accounts=[[u['id'],u['username'],u['password'],u['realName'],u['role'],u['schoolId'],u.get('grade',''),u.get('classNo',''),json.dumps(u.get('classes',[]),ensure_ascii=False)]for u in m['users']]
table('01_账号与班级',['ID','账号或学号','本机演示密码','虚构姓名','角色','学校ID','年级','班级','任教班级'],accounts)
table('02_教师与策略',['教师账号','任教学科','主教学科','月总数','德%','智%','体%','美%','劳%','故事%'],[['demo_teacher_a','语文、数学','语文',100,20,70,0,0,10,0],['demo_teacher_b','美术','美术',100,20,0,0,70,10,0]])
head=['学号','姓名','年级','班级','语文','数学','英语','美术']
subrows=[[u['username'],u['realName'],4,u['classNo'],92-i,94-i,88-i,90-i]for i,u in enumerate(students)]
table('03_学科成绩_正确',head,subrows)
errors=[subrows[0],['unknown_student','未知学号',4,1,90,90,90,90],['demo_s02','许星禾',4,1,105,90,90,90],['demo_s03','沈乐知',4,1,'不合法',90,90,90],subrows[0]]
table('04_学科成绩_错误',head,errors)
updated=[list(r) for r in subrows];updated[0][4]=96
table('05_学科成绩_更正',head,updated)
dhead=['学号','姓名','年级','班级','德育(D)','智育(Z)','体育(T)','美育(M)','劳育(L)','生活故事(G)']
dimrows=[[u['username'],u['realName'],4,u['classNo'],92-i,94-i,88-i,90-i,95-i,60 if i==0 else 88-i]for i,u in enumerate(students)]
dimrows[-1]=[students[-1]['username'],students[-1]['realName'],4,2,0,0,0,0,0,0]
incomplete=[list(r)for r in dimrows];incomplete[0][6]='';incomplete[1][6]=''
table('06_六育终测_缺体育',dhead,incomplete)
table('07_六育终测_完整补齐',dhead,dimrows)
table('08_荣誉申报',['学生','项目名称','级别','等次','原始荣誉分','材料说明'],[['demo_s01','演示市青少年校园观察创作活动','CITY','FIRST',6,'第一版信息不全→退回→第二版补齐；均为模拟证书']])
# Formula workbook with cached independent values, no calls to application scoring.
w=xlsxwriter.Workbook(IN/'09_预期核算.xlsx');a=w.add_worksheet('参数');s=w.add_worksheet('终态核算');hf=w.add_format({'bold':True,'bg_color':'#204D40','font_color':'white'});num=w.add_format({'num_format':'0.00','font_name':'Arial'});inp=w.add_format({'font_color':'#2458A6','font_name':'Arial'});s.freeze_panes(1,2)
a.write_row(0,0,['参数','值'],hf)
for i,(k,v)in enumerate([('六育权重',.8),('过程权重',.15),('荣誉权重',.05),('过程满分目标',20),('荣誉满分目标',12)],1):a.write_row(i,0,[k,v]);
s.write_row(0,0,['学号','姓名','D','Z','T','M','L','正式G','过程净分','荣誉原分','六育均分','过程标准分','荣誉标准分','综合分','等级'],hf)
expected=[]
for i,u in enumerate(students):
 vals=dimrows[i][4:];vals[5]=88.5 if i==0 else vals[5];proc=20 if i==0 else 0;hon=6 if i==0 else 0;b=sum(Decimal(str(x))for x in vals)/6;p=min(100,max(0,proc/20*100));h=min(100,max(0,hon/12*100));score=float((b*Decimal('.8')+Decimal(str(p)) *Decimal('.15')+Decimal(str(h))*Decimal('.05')).quantize(Decimal('.01'),rounding=ROUND_HALF_UP));grade='优秀' if score>=90 else '良好' if score>=80 else '待提升' if score<60 else '合格';row=i+1;ex=row+1
 s.write_row(row,0,[u['username'],u['realName'],*vals,proc,hon],inp)
 for col,formula,value in [(10,f'=AVERAGE(C{ex}:H{ex})',float(b)),(11,f'=MIN(100,MAX(0,I{ex}/参数!$B$5*100))',p),(12,f'=MIN(100,MAX(0,J{ex}/参数!$B$6*100))',h),(13,f'=ROUND(K{ex}*参数!$B$2+L{ex}*参数!$B$3+M{ex}*参数!$B$4,2)',score),(14,f'=IF(N{ex}>=90,"优秀",IF(N{ex}>=80,"良好",IF(N{ex}<60,"待提升","合格")))',grade)]:s.write_formula(row,col,formula,num,value)
 expected.append([u['username'],u['realName'],*vals,proc,hon,round(float(b),2),p,h,score,grade])
s.set_column(0,1,18);s.set_column(2,14,13);a.set_column(0,0,24);a.set_column(1,1,16);w.close()
with (IN/'09_预期核算.csv').open('w',encoding='utf-8-sig',newline='')as o:wr=csv.writer(o);wr.writerow(['学号','姓名','D','Z','T','M','L','正式G','过程净分','荣誉原分','六育均分','过程标准分','荣誉标准分','综合分','等级']);wr.writerows(expected)
assert expected[0][-2]==90.5
story1='这个月，我参加了校园观察活动。开始时我只想把自己的发现说出来，没有认真听同伴的意见。后来我们分工记录，我负责观察种植角。我发现合作比独自完成更有意思。'
story2='这个月，我们小组一起制作校园自然观察笔记。第一天，我抢着决定观察路线，结果大家记录的内容重复了，种植角的变化却没有人留意。\n\n第二天，我先听每位同伴说想法，再把任务写在记录纸上。我负责每天观察叶片、测量茎的高度，星禾负责拍照，乐知负责整理天气。下雨时我们没能按时测量，我提议在表格上如实写明“缺测”，不去补造一个数字。\n\n整理笔记时，我发现一株小苗长得很慢，担心它生病。老师提醒我们比较阳光与浇水记录，我们才发现盆的位置太阴。调整位置后，小苗长出了新叶。我画下前后的样子，也记录了自己着急和等待的心情。\n\n展示那天，我邀请组员依次介绍自己的工作。我听见同伴补充了我没有注意的细节，才明白一份完整记录来自大家认真负责的行动。下个月，我想继续观察，也想在讨论时多问一句“你怎么看”，让每个人的声音都被听见。'
for name,text in [('01_故事草稿.txt',story1),('02_故事修订提交稿.txt',story2),('03_教师评语.txt','正式评分88.5。你能诚实记录缺测，主动调整分工，并从观察中学会倾听。下次可补充具体日期和数据，让成长更有依据。'),('04_荣誉退回与重提.txt','退回：演示样本第一版缺少学生姓名和奖项等次，请补齐后重新提交。\n重提原因：已根据反馈补齐姓名、级别与等次，上传第二版模拟证书。')]: (OUT/'stories'/name).write_text(text)
font=ROOT/'backend/assets/fonts/NotoSansCJKsc-Regular.otf'
for ver in [1,2]:
 im=Image.new('RGB',(1400,990),'#faf8ef');d=ImageDraw.Draw(im);d.rectangle((45,45,1355,945),outline='#254c40',width=6)
 def txt(x,y,t,size,col='#254c40'):d.text((x,y),t,font=ImageFont.truetype(str(font),size),fill=col)
 txt(110,100,'演示样本 · 非真实荣誉',65,'#b74747');txt(110,235,'校园观察创作活动 · 模拟证书',54)
 txt(110,365,'获奖学生：'+('（待补充）'if ver==1 else'周知行'),45);txt(110,450,'奖项级别：市级（仅演示）',42);txt(110,535,'获奖等次：'+('（待补充）'if ver==1 else'一等奖'),42)
 txt(110,665,'生成日期：'+m['date']+'    材料版本：'+str(ver),30);txt(110,745,'仅供本机系统演示，不证明任何真实获奖事实。',31,'#b74747');txt(110,810,'虚构活动组织方 · 无真实学校印章',30)
 im.save(IN/f'10_模拟证书_v{ver}.png')
steps=[
('00 启动、身份与讲解边界','管理员','/#/dashboard','运行一键入口 run.cjs，自动打开专用入口，以demo_admin登录。说明所有师生和奖项为虚构数据；18条历史演示分有明确标记。','账号表01；当前运行清单manifest.json','管理概览可加载，学生总数8。登录身份为演示管理员。','领导讲解：今天从一名学生的一次行为出发，看证据如何变成学期报告。','若无法登录，先检查manifest记录的端口和该运行数据库，不切到原业务库。'),
('01 学期、指标、评价规则','管理员','/#/admin/terms → /admin/categories → /admin/rules','打开现有学期，编辑并保存校历和审核截止；查看六育三级树。进入规则页，使用新版本DEMO_V1，填写80、15、5；目标20、12，保存启用。','学期信息见manifest；D/Z/T/M/L/G字典','当前学期覆盖当天；规则合计100%。第三层过程指标每条+1。','校历控制有效操作月份；评价规则明确告诉师生各来源怎样计分。','比例必须合计100%；不宣称学科成绩自动计入智育或占15%。'),
('02 主教学科与自动月配卡','管理员','/#/admin/cards','学科发卡策略中新增CHINESE语文、MATH数学、ART美术。教师学科中林老师选择语文及数学，主教语文；陈老师选择美术，主教美术。分别保存语文与美术100张策略。回到月度分配，刷新自动结果。','02_教师与策略.xlsx','林老师总100张：智70/德20/劳10；陈老师总100张：美70/德20/劳10。兼课只一份。','把常规分配交给学科策略，管理员维护主教学科与比例。','缺主学科或策略应出现待处理事项；保存后异步生成，可刷新；不要使用旧手工制卡API。'),
('03 真实打印与实体交付','管理员 → 教师 → 学生','/#/admin/cards → /student/claim','管理员准备打印PDF，等待READY并下载。按教师分组打印后领取。切换教师查看本人100张；从真实PDF的二维码进入学生领取页，先预览取消一次，再重新预览。','系统本轮实际生成PDF；下载路径记入测试记录','卡面只有六育方向，无两级子类。学生预览教师、方向、有效期；取消不产生申领。','实体交付仍然简单：老师把相应颜色/图形的卡交给学生。','不得手工编造token；本机领取链接必须指向当前运行端口；PDF若失败按页面重试。'),
('04 扫码确认、两级审核与账本','学生 → 教师 → 学生','/#/student/claim → /teacher/claims → /student/ledger','demo_s01确认一张林老师智育卡；待审时查看账本。切换林老师审核，选择勤奋好学及课堂认真专注，审核通过。再看学生账本。','真实二维码；指标Z01/Z01-01','确认前18分；待审仍18；通过变19且仅一次+1，卡片USED，分类可追溯。','老师在核验时解释学生因何受到奖励，纸卡无需事先绑定行为。','漏选两级不能通过；重复申领或审核不能再次加分。'),
('05 日常直评与受控纠错','教师 → 管理员 → 学生','/#/teacher/direct-score → /admin/audits → /student/ledger','林老师选择周知行、德育/关爱互助/主动帮助同学，备注“演示日常帮助整理观察资料”，提交+1。再单独提交一条“演示误评待冲销”。管理员以该条流水ID执行受控冲销并写原因。','主角ID11；误评ID必须从本轮实际流水读取','19→20→21→20。原误评保留，新增REVERSAL -1；净分20，过程标准分100。','纠错保留证据链，避免直接删除历史记录。','冲销原始ID不可凭记忆填写；只冲销误评，历史样本不删；重复冲销应拒绝。'),
('06 荣誉退回、补交、认定','学生 → 教师 → 学生 → 教师','/#/student/honors → /teacher/honors','学生申报演示市青少年校园观察创作活动，CITY/FIRST，上传v1证书。教师退回并说明缺项。学生从退回记录补材料上传v2，填写修订原因，教师重新核准。','08_荣誉申报.xlsx；10_模拟证书_v1/v2.png；04退回文本','初始待审/退回不计分；通过为6原始荣誉分，标准分50，综合贡献2.5。版本从1变2。','荣誉不混入日常+1账本，经过材料核验后单独折算。','图片用上传按钮，不粘贴本地路径。无真实章和真实背书；私人图片不能匿名访问。'),
('07 故事草稿、修订、正式反馈','学生 → 教师 → 学生','/#/student/stories → /teacher/stories','学生输入“在观察中学会倾听”，先保存草稿，替换为修订稿提交。教师查看正文与辅助建议，独立给88.5分并填写评语；学生查看终审反馈。','stories/01草稿、02修订稿、03教师评语','保存草稿与正式提交状态不同。辅助为规则模拟，正式G=88.5；覆盖终测导入G=60。','重视真实经历、行动和反思，教师对正式判断负责。','不要把模拟建议说成真实大模型能力；教师评分不要直接照抄模拟值。'),
('08 学科Excel预览、错误与更正','教师','/#/admin/import','上传04错误版，查看错误名单，下载错误报告，确认前自动核对成绩表未入库。有效行可入库；重置后上传03正确版并确认。再上传05更正版，导入后核对周知行语文92→96。','03/04/05_学科成绩.xlsx','8名学生各4科，错误行不入库。Excel预览校验格式与有效行；确认时新增或更新，更正结果在报告和数据中核对。学科成绩独立展示。','先预览再确认，避免整张表因个别错误而失去可用记录。','Excel首行必须为学号等列；学号用demo_s01而非数据库ID。教师限任教班级。'),
('09 六育缺项与发布阻断','管理员','/#/admin/import → /admin/reports','切六育终测模式上传06缺体育版，确认。报告门禁选择周知行与许星禾尝试发布，观察体育缺项阻断；保留页面证据后上传07完整补齐版。','06_六育终测_缺体育.xlsx；07完整补齐.xlsx','缺项不视为0；周知行、许星禾阻断，其他学生可满足维度完整。叶小满六项0分是有效值。','完整性检查提醒学校补数据，不用猜分填满报告。','发布部分成功按逐学生结果说明；不能宣称系统检查了所有未实际实现的六项业务条件。'),
('10 综合核算与独立对账','学生 → 管理员','/#/student/evaluation → /admin/rules','学生周知行查看六维、过程、荣誉与总评；与09预期表逐列核对。其他学生作为零分和无过程/荣誉对照。','09_预期核算.xlsx/CSV','D92/Z94/T88/M90/L95/G88.5；均分91.25；20/20×100=100；6/12×100=50；总分73+15+2.5=90.50，优秀。','每个分数都能沿来源追溯；过程与荣誉分别封顶100。','学科语文更正到96不改变智育94。计算使用未先舍入的均值，最终保留两位。'),
('11 发布、报告、打印与版本','管理员 → 学生','/#/admin/reports → /student/report','补齐后发布本班报告。学生打开学期报告，核对学科语文96、综合90.50、荣誉6及故事G88.5。点击导出查看受控HTML打印视图，使用浏览器打印/另存PDF。再次发布核对版本递增。','系统真实报告；本轮真实受控打印视图','本人报告正确，旧版SUPERSEDED，新版PUBLISHED，打印内容来自快照。','发布把本学期结论固定成可交付、可追溯的版本。','接口实际为HTML打印视图。若无法自动保存PDF，保留真实HTML与浏览器证据，不伪造发布报告。'),
('12 审计、权限与交付回看','管理员 → 教师 → 学生','/#/admin/audits 及三角色全部菜单','管理员回看策略、导入、冲销、发布记录；检查教师只能操作任教范围、学生只能看本人。退出登录检查受控访问。将截图、下载、测试判定与缺陷复测写报告。','report.html；screenshots、downloads目录','每一阶段有证据。尚未执行的项保留NOT RUN，失败记录FAIL，外部阻断BLOCKED。','闭环终点是学校能解释每个结果、学生能看见反馈、管理员能追查责任。','保留测试终态。下次演示新建runId，不复用已核销卡或直接清空旧库。')]
steps=[tuple(v.replace('5188',str(m['frontendPort'])).replace('3088',str(m['backendPort'])) for v in row) for row in steps]
md=['# 六育学生评价系统｜三角色完整演示手册',f'运行编号：{run}　生成日期：{m["date"]}　入口：{m["baseUrl"]}',f'独立数据库：{m["dbName"]}；后端{m["backendPort"]}，前端{m["frontendPort"]}。所有账号密码为本机演示专用 Demo123456。','面向学校领导与管理员，完整演示，无时长删减。先看“领导讲解”，再按“操作”执行。','## 开场准备','1. 在项目根目录运行 `node demo_materials/full-system-demo/start.cjs '+run+'`。','2. 资料位于 `demo_materials/full-system-demo/runs/'+run+'/inputs`；故事在stories子目录。','3. 默认账号管理员demo_admin、教师demo_teacher_a/demo_teacher_b、学生demo_s01。边界账号只用于验收。','4. 本手册预期值不代表测试已通过；本轮实际结论请看report.html。']
for title,role,entry,op,mat,expect,talk,trouble in steps:
 md += ['## '+title,'角色：'+role,'入口：'+entry,'操作：'+op,'材料：'+mat,'预期：'+expect,talk,'排查：'+trouble]
md+=['## 重复演示与文件安全','初始化脚本每次新建独立数据库，拒绝重名，不删除任何库。重新运行一键入口会自动初始化、生成素材并分配空闲端口。关闭服务只关闭本任务进程。','.private目录为本机打印密钥、上传文件与私有打印文件，不进入普通交付包；本机数据库密码继续从backend/.env读取，未复制入清单。','## 全部菜单核验清单','管理员：管理概览、学期与校历、六育指标树、学科自动发卡、扫码审核、成绩数据导入、综合评价规则、期末报告发布、审计与冲销。','教师：工作台、扫码审核、无卡直评、荣誉审核、故事评阅、学科成绩导入、我的评价卡。','学生：成长首页、扫卡领取、积分账本、荣誉申报、月度故事、综合评价、学期报告。']
md=[x.replace('node demo_materials/full-system-demo/start.cjs '+run,'node scripts/full-system-demo/run.cjs').replace('demo_materials/full-system-demo/runs/'+run,str(OUT.relative_to(ROOT))) for x in md]
(DOC/'演示手册.md').write_text('\n\n'.join(md))
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
body=ParagraphStyle('body',fontName='STSong-Light',fontSize=11,leading=19,textColor=colors.HexColor('#263b35'),wordWrap='CJK',spaceAfter=13)
heading=ParagraphStyle('heading',parent=body,fontSize=21,leading=30,textColor=colors.HexColor('#204d40'),spaceAfter=25)
small=ParagraphStyle('small',parent=body,fontSize=10,leading=17)
flow=[Paragraph('六育学生评价系统<br/>三角色完整演示手册',heading),Spacer(1,20)]
for t in md[1:9]:flow.append(Paragraph(html.escape(t.removeprefix('## ')).replace('`',''),body))
for title,role,entry,op,mat,expect,talk,trouble in steps:
 flow.append(PageBreak());flow.append(Paragraph(html.escape(title),heading))
 for label,text in [('角色',role),('入口',entry),('领导讲解',talk.replace('领导讲解：','')),('操作步骤',op),('所需材料',mat),('核验结果',expect),('异常排查',trouble)]:flow.append(Paragraph('<b>'+label+'</b><br/>'+html.escape(text),body))
def footer(c,doc):
 c.setFont('STSong-Light',9);c.setFillColor(colors.HexColor('#6c7d74'));c.drawString(42,25,'六育 · 完整闭环演示 | '+run+' | 虚构数据');c.drawRightString(A4[0]-42,25,str(doc.page))
SimpleDocTemplate(str(DOC/'演示手册.pdf'),pagesize=A4,rightMargin=42,leftMargin=42,topMargin=45,bottomMargin=48,title='六育三角色完整演示手册').build(flow,onFirstPage=footer,onLaterPages=footer)
preview=ROOT/'docs/delivery/full-system-demo/三角色流程图.html'
if preview.exists():(DOC/'三角色流程图.html').write_text(preview.read_text().replace('当前为设计讨论稿','完整演示流程').replace('这是设计预览，不是测试已通过的证明。确认完整方案后，先生成全部材料，再执行本机MCP全流程验收；现有业务库、服务与旧资料保留。','这是演示路径说明，实际测试结论见report.html。现有业务库、服务与旧资料保留。'))
# Editable SVG, explicit three-role swimlanes and return loops.
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1780" viewBox="0 0 1200 1780"><style>text{font-family:Arial,"PingFang SC",sans-serif;fill:#204d40}.h{font-size:28px;font-weight:bold}.b{font-size:18px}.s{font-size:15px}</style><rect width="1200" height="1780" fill="#f5f7f3"/><text x="45" y="60" class="h">三角色 · 从学期配置到学生报告</text>']
for j,t in enumerate(['管理员：组织与治理','教师：激励与核验','学生：参与与成长']):svg.append(f'<rect x="{170+j*330}" y="90" width="310" height="60" rx="10" fill="{["#dcece3","#e0e9f2","#f6edd8"][j]}"/><text x="{185+j*330}" y="128" class="b">{t}</text>')
lanes=[('学校准备',['学期、指标、规则','任教班级与主教学科','核对身份与班级']),('自动发卡',['学科策略 → 月配卡 → PDF','查看本人卡 → 线下发卡','扫码预览 → 取消 / 确认']),('过程激励',['误评冲销 → 审计','两级归类审核 + 无卡直评','积分账本：18 → 20']),('荣誉闭环',['核对材料与版本','退回 → 再审 → 认定6分','v1申报 → 补交v2']),('故事闭环',['确认评分来源','阅读修订 → 正式评分88.5','草稿 → 修订提交 → 反馈']),('期末成绩',['六育缺项 → 补齐','学科Excel → 预览 → 导入','查看独立成绩来源']),('核算发布',['核算90.50 → 发布快照','核对来源、材料与待办','完整评价 → 报告 → 打印']),('追溯归档',['审计、权限、版本核查','教师责任与反馈闭环','成长证据与学期结论'])]
for i,(stage,cols)in enumerate(lanes):
 y=180+i*165;svg.append(f'<text x="28" y="{y+50}" class="b">{i+1:02} {stage}</text>')
 for j,t in enumerate(cols):
  x=170+j*330;svg.append(f'<rect x="{x}" y="{y}" width="310" height="120" rx="12" fill="white" stroke="#bccfc3"/><text x="{x+15}" y="{y+60}" class="s">{html.escape(t)}</text>')
 svg.append(f'<text x="600" y="{y+148}" class="b">↓</text>')
svg+=['<text x="45" y="1570" class="b">异常回路：缺项 → 补齐；荣誉退回 → 修订；误评 → 冲销；打印失败 → 重试</text>','<text x="45" y="1620" class="s">学科成绩与六育终测独立；故事建议为规则模拟；报告以真实HTML打印视图交付。</text>','<text x="45" y="1670" class="s">先生成资料 → 浏览器自动演示 → 独立对账 → 缺陷修复复测 → 保留证据与终态</text>','<text x="45" y="1720" class="s">所有师生、活动、证书均为虚构演示样本；流程图不是测试通过证明。</text></svg>']
(DOC/'三角色流程图.svg').write_text(''.join(svg))
readme=f'''# 本次自动演示资料

运行编号：{run}；入口：{m['baseUrl']}；数据库：{m['dbName']}。

本目录由`node scripts/full-system-demo/run.cjs`自动生成并填入真实操作结果。

- inputs/：账号、策略、学科三版Excel、六育缺项/完整、独立核算、两版水印模拟证书。
- stories/：草稿、修订、教师评语与荣誉退回说明。
- downloads/：实际浏览器下载的卡片、错误名单、真实报告HTML/PDF（执行完成后产生）。
- screenshots/、video/、trace.zip：本次浏览器证据。
- report.html：以本轮实际执行状态为准，素材生成本身不等于演示成功。

每次运行新建独立库与run，不要拿已核销卡重复演示；重新运行一键入口即可获得新起点。
秘密在.private，不对外发布；trace和录像也仅供本机演示核验。
'''
for artifact in ['演示手册.md','演示手册.pdf','三角色流程图.html','三角色流程图.svg']:
 if (DOC/artifact).exists():shutil.copy2(DOC/artifact,OUT/artifact)
(OUT/'README.md').write_text(readme)
(DOC/'README.md').write_text(readme)
(DOC/'生成器说明.md').write_text('见 scripts/full-system-demo/README.md；使用一键入口自动完成初始化、生成和演示。')
hashes={str(p.relative_to(OUT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in OUT.rglob('*')if p.is_file()and 'evidence'not in p.parts and 'downloads'not in p.parts and p.name!='asset-hashes.json'}
(OUT/'asset-hashes.json').write_text(json.dumps(hashes,indent=2))
print(json.dumps({'runId':run,'inputFiles':len(list(IN.iterdir())),'mainExpectedScore':90.5,'manual':str(DOC/'演示手册.pdf')},ensure_ascii=False))
