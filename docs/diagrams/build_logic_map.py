"""Generate one editable, cross-role logic map from shared node/edge data."""
from pathlib import Path
import html
import json
import math
import xml.etree.ElementTree as ET

OUT = Path(__file__).resolve().parent
W, H = 2280, 3910
COL = [80, 520, 960, 1400, 1840]
NW = 360
COLORS = {
    "student": ("学生", "#EFF7F2", "#83AF95", "#2D7050"),
    "teacher": ("教师", "#F0F5FB", "#89A9CE", "#426E9B"),
    "manager": ("管理员", "#FCF6EB", "#C5AB78", "#916E32"),
    "system": ("系统自动", "#F6F8F9", "#B1BEC5", "#526875"),
    "shared": ("三端共用", "#F3F6F3", "#A5B6A7", "#5D7562"),
    "staff": ("教师 / 管理员", "#F3F6F3", "#A5B6A7", "#5D7562"),
    "warning": ("异常 / 限制", "#FCF1EF", "#D4A19A", "#A25D54"),
}
EDGE_COLORS = {"main": "#526F80", "read": "#80928B", "alt": "#B57A61", "async": "#8C8CAA"}
NODES, EDGES, SECTIONS, NOTES, LABELS = [], [], [], [], []


def node(nid, col, y, title, lines, role="system", refs="", h=118):
    NODES.append(dict(id=nid, x=COL[col], y=y, w=NW, h=h, title=title,
                      lines=lines, role=role, refs=refs))
    return nid


def get(nid):
    return next(n for n in NODES if n["id"] == nid)


def port(nid, side, fraction=.5):
    n = get(nid)
    return {"L": (n["x"], n["y"]+n["h"]*fraction),
            "R": (n["x"]+n["w"], n["y"]+n["h"]*fraction),
            "T": (n["x"]+n["w"]*fraction, n["y"]),
            "B": (n["x"]+n["w"]*fraction, n["y"]+n["h"])}[side]


def edge(src, dst, label="", kind="main", sides="RL", points=None, pos=None,
         fractions=(.5, .5)):
    pts = [port(src, sides[0], fractions[0]), *(points or []), port(dst, sides[1], fractions[1])]
    EDGES.append(dict(src=src, dst=dst, label=label, kind=kind, points=pts,
                      pos=pos, sides=sides, fractions=fractions))


def section(num, title, subtitle, y, height):
    SECTIONS.append(dict(num=num, title=title, subtitle=subtitle, y=y, h=height))


def note(x, y, lines, color="#7D8982", size=15):
    NOTES.append(dict(x=x, y=y, lines=lines, color=color, size=size))


# Overview: the order is a dependency map; daily collection processes run in parallel.
section("01", "基础准备与统一入口", "先配置业务边界，再按会话身份进入各自工作台", 225, 245)
node("accounts", 0, 300, "配置账号与班级授权", ["建账号 / 启停 / 重置凭据 / 学生归班", "教师任教班级授权；新操作按新权限"], "manager", "M03")
node("term", 1, 300, "配置学期与校历", ["当前学期、时区、提交与审核截止", "当前展示 ≠ 是否允许业务写入"], "manager", "M02")
node("dictionary", 2, 300, "维护六育三级指标", ["指标启停与版本留痕，直评固定 +1", "学期 / 指标配置共同约束后续业务"], "manager", "M04")
node("gate", 3, 300, "统一鉴权与时间窗检查", ["学生仅本人 / 教师仅授权班级", "管理员仅本校；归档后常规只读"], "system", "FR-01")
node("entry", 4, 300, "登录 → 首页 / 工作台", ["登录 / 退出；查看身份、待办与消息", "学生成长首页 / 教师待办 / 管理概览"], "shared", "C01 · S01 · T01 · M01")
edge("accounts", "term", "准备")
edge("term", "dictionary", "配置")
edge("dictionary", "gate", "生效")
edge("gate", "entry", "按角色")

section("02", "实体卡评价 · B 模式", "配额制卡 → 线下发放 → 学生申领 → 教师审核；审核前绝不加分", 490, 385)
node("cardgen", 0, 565, "月度配额、制卡与印刷", ["各指标配额之和 = 教师月度总额 N", "可作废未申领卡；不预先绑定学生"], "manager", "M05")
node("cardgive", 1, 565, "查看本人配卡并线下发放", ["查看配额 / 未申领 / 待审 / 已用", "教师不制卡，不创建学生发放登记"], "teacher", "T09")
node("claim", 2, 565, "扫码预览 → 确认申领", ["预览只读；有效卡提交后锁为待审", "PENDING：积分尚未增加"], "student", "S02")
node("claimreview", 3, 565, "审核本人名下卡申领", ["核对学生、三级指标与截止时间", "通过 / 驳回；防重复提交"], "teacher", "T02")
node("cardposted", 4, 565, "卡已用 + 正式流水 +1", ["一次事务完成：审核、卡状态、记账", "结果通知学生；进入 03 过程账本"], "system", "USED · B_CARD")
edge("cardgen", "cardgive", "配发")
edge("cardgive", "claim", "实体卡")
edge("claim", "claimreview", "待审")
edge("claimreview", "cardposted", "通过")
node("expired", 2, 745, "卡片过期 / 不可用", ["未用卡跨月、待审超宽限：自动过期", "已用 / 作废 / 过期不再领取，不加分"], "warning", "EXPIRED", h=100)
node("claimreject", 3, 745, "填写理由 → 驳回", ["申领 REJECTED，卡片永久 VOID", "积分不增加，通知学生审核结果"], "warning", "T02", h=100)
node("proxy", 4, 745, "满足条件才可代审", ["原教师已停用，或已登记授权转办", "同校校验；记录专用代审身份"], "manager", "M05", h=100)
edge("claim", "expired", "超期", "alt", "BT", pos=(1140, 714))
edge("claimreview", "claimreject", "驳回", "alt", "BT", pos=(1580, 714))
edge("proxy", "claimreview", "代审同一流程", "alt", "TR",
     points=[(2020, 715), (1800, 715), (1800, 565+118*.76)],
     pos=(1900, 715), fractions=(.5, .76))
note(90, 761, ["卡片终态不可逆：USED / VOID / EXPIRED。", "月末待审可在校方配置的宽限期内审核；", "宽限期内入账仍归属卡片原学期。"], size=16)

section("03", "无卡直评 · A 模式与统一积分账本", "A / B 两种评价共用同一本过程账本；查看范围随身份不同", 895, 260)
node("direct", 0, 970, "选学生、三级指标与备注", ["任教班级可批量勾选，每人固定 +1", "共用备注 + 逐生备注；逐人返回结果"], "teacher", "T03")
node("ledger", 1, 970, "只追加的过程积分账本", ["A_DIRECT / B_CARD：+1；冲销：−1", "净分用于 07 的 P；原流水不可改删"], "system", "P 数据来源")
node("studentledger", 2, 970, "查看本人积分与来源", ["按维度、时间、来源筛选", "凭证、操作人、原记录 / 冲销关联"], "student", "S03")
node("classview", 3, 970, "查看任教班级成长", ["过程表现、正式成绩缺项、学生详情", "综合分来自 07；不能越班查询"], "teacher", "T06")
node("schoolledger", 4, 970, "全校查询与受控纠错", ["查看全校流水及关联凭证", "不直接编辑；差错转入 09 冲销流程"], "manager", "M11")
edge("direct", "ledger", "+1")
for dst, label in [("studentledger", "本人"), ("classview", "任教班级"), ("schoolledger", "本校")]:
    target = port(dst, "B")
    edge("ledger", dst, label, "read", "BB", points=[(700, 1125), (target[0], 1125)],
         pos=(target[0], 1107))
note(100, 1142, ["管理员仅可应急代录并写审计；正常无卡直评由教师发起。"], size=13)

section("04", "荣誉申报、审核与撤销", "荣誉分单独认定，不产生过程积分 +1；相同赛事届次防重复", 1175, 355)
node("honordraft", 0, 1250, "填写荣誉、上传证书", ["活动 / 届次 / 日期 / 省市区 / 奖项", "保存草稿；每次材料修改保留版本"], "student", "S04")
node("honorsubmit", 1, 1250, "正式提交 / 补交材料", ["SUBMITTED：等待审核，暂不计分", "退回后沿原成果链追加新材料版本"], "student", "S04")
node("honorreview", 2, 1250, "查验证书并审核", ["通过认定 / 退回补充 / 终态拒绝", "退回和拒绝需填写原因"], "teacher", "T04")
node("honorpoints", 3, 1250, "只认定通过且未撤销荣誉", ["省 9/8/7，市 6/5/4，区 3/2/1", "独立荣誉分汇入 07 的 H"], "system", "H 数据来源")
node("honoradmin", 4, 1250, "全校复核 / 撤销认定", ["撤销必须理由与审计，状态 REVOKED", "触发 07 重算；已发布时衔接 09 新版"], "manager", "M06")
edge("honordraft", "honorsubmit", "提交")
edge("honorsubmit", "honorreview", "待审")
edge("honorreview", "honorpoints", "通过")
edge("honorpoints", "honoradmin", "复核", "read")
node("honorreturn", 1, 1430, "退回补充 → 重新提交", ["RETURNED：可补交，版本不覆盖"], "student", "S04", h=86)
node("honorreject", 2, 1430, "REJECTED：拒绝且不计分", ["终态，不等同于可补交的退回"], "warning", "T04", h=86)
edge("honorreview", "honorreturn", "退回", "alt", "BR",
     points=[(1068, 1402), (920, 1402), (920, 1473)],
     pos=(1005, 1402), fractions=(.3, .5))
edge("honorreturn", "honorsubmit", "新版本", "alt", "TB", pos=(700, 1401))
edge("honorreview", "honorreject", "拒绝", "alt", "BT", pos=(1140, 1400), fractions=(.66, .66))
note(1420, 1436, ["同一学生 / 学期 / 赛事届次只能认定一次。", "重复与更正以 SPEC 及最终校规为准。"], size=16)

section("05", "月度故事与教师终审", "AI 是建议来源；教师显式确认才产生终审分，AI 失败不阻断人工", 1550, 295)
node("storytask", 0, 1625, "配置月份任务与 AI 开关", ["任务说明、截止日期、量规待配置", "按班级监控缺交、待审与 AI 异常"], "manager", "M07")
node("storywrite", 1, 1625, "写故事、存草稿、提交", ["每生每月一条主记录，多版留痕", "提交后可查看教师终审结果"], "student", "S05")
node("storyai", 2, 1625, "保存版本 / 生成 AI 建议", ["评估中、失败、关闭均可人工评阅", "AI 建议不得直接写作正式成绩"], "system", "FR-06")
node("storyreview", 3, 1625, "人工复核与终审评分", ["输入 0—100 分及评语并确认", "修改留审计；学期归档后只读"], "teacher", "T05")
node("storyresult", 4, 1625, "月度终审结果与 G 来源", ["月度结果存档；G 须按校规确认", "外部故事分独立保存，不自动混合"], "system", "G → 07 的 B")
for a, b, label in [("storytask", "storywrite", "任务"), ("storywrite", "storyai", "提交"), ("storyai", "storyreview", "仅参考"), ("storyreview", "storyresult", "确认")]:
    edge(a, b, label)
edge("storyresult", "storywrite", "学生查看终审结果", "read", "BB", points=[(2020, 1808), (700, 1808)], pos=(1360, 1808))
note(90, 1808, ["故事缺月显示未完成，不自动按 0 分处理。"], size=15)

section("06", "成绩导入与批次对账", "先预览差异，确认无误后才写入；学科考分与六育正式分物理分开", 1865, 305)
node("importrole", 0, 1940, "选类型、班级并上传模板", ["教师：任教班级学科成绩", "管理员：学科 / 五育 / 外部故事"], "staff", "T07 · M08")
node("importparse", 1, 1940, "校验身份与文件", ["唯一学号匹配，不能只凭姓名", "≤ 2 MB / 1000 行；解析超时拒绝"], "system", "FR-07")
node("importpreview", 2, 1940, "预览新增 / 变更 / 异常", ["列出具体行、字段与新旧值", "有异常：修正原文件，重新预览"], "staff", "T07 · M08")
node("importcommit", 3, 1940, "人工确认 → 批次落库", ["确认后生成批次号，版本与来源留痕", "失败全量回滚，不部分写入"], "system", "batch_no")
node("importoutputs", 4, 1940, "分流保存与后续查阅", ["五育正式分 → 07 的 B；故事分另标来源", "学科成绩 → 08 报告独立板块"], "system", "B / 学科数据来源")
for a, b, label in [("importrole", "importparse", "上传"), ("importparse", "importpreview", "校验"), ("importpreview", "importcommit", "无异常"), ("importcommit", "importoutputs", "分流")]:
    edge(a, b, label)
edge("importpreview", "importrole", "异常：修正源文件后重新预览", "alt", "BB", points=[(1140, 2125), (260, 2125)], pos=(700, 2125))
note(1440, 2130, ["钉钉 / 外部平台先模板导入，接口授权另行确认。"], size=14)

section("07", "综合规则、完整性检查与核算", "三类评价数据在这里汇合：B 六育均分、P 过程标准分、H 荣誉标准分", 2190, 395)
node("rule", 0, 2265, "新建规则草稿并激活版本", ["权重合计 100%；阈值必须大于 0", "激活新版 → 旧版只读 → 全校重算"], "manager", "M09")
node("calcinputs", 1, 2265, "汇聚 B / P / H 三类数据", ["B：05 的已确认 G + 06 的五育正式分", "P：02/03 的净积分；H：04 的认定分"], "system", "三类数据分别存储")
node("complete", 2, 2265, "六育正式成绩完整吗？", ["D / Z / T / M / L / G 均须 CONFIRMED", "有 ACTIVE 规则才按版本核算"], "system", "完整性判断")
node("score", 3, 2265, "计算综合分 S 并留规则版本", ["B 六维均分；P / H 按各自阈值封顶", "S = round(wB·B + wP·P + wH·H, 2)"], "system", "综合得分输出")
node("scoreview", 4, 2265, "查阅综合评价与分项", ["学生本人；教师任教班级；管理全校", "正式六育 / 过程积分 / 荣誉分分别展示"], "shared", "S06 · T06 · M09")
for a, b, label in [("rule", "calcinputs", "生效"), ("calcinputs", "complete", "核对"), ("complete", "score", "齐全"), ("score", "scoreview", "可查阅")]:
    edge(a, b, label)
node("incomplete", 2, 2450, "缺项 → 待完善 INCOMPLETE", ["不把缺项当 0，不确认 / 发布报告", "定位到 05/06 补齐成绩后再核算"], "warning", "阻断输出", h=100)
edge("complete", "incomplete", "缺项", "alt", "BT", pos=(1140, 2420))
note(100, 2450, ["重算触发：", "管理员手动核算；正式六育成绩新增 / 更新；", "荣誉通过 / 撤销；激活新规则触发全校重算。"], size=16)
note(1420, 2450, ["试行示例：权重 80% / 15% / 5%，阈值 20 / 12。", "实际读取 ACTIVE 规则，不在界面写死。", "成绩更新后的异步重算仅在可操作学期进行。"], size=15)

section("08", "期末报告：内容汇集、教师确认、管理发布", "学生看不到草稿；教师只确认，管理员统一发布；学科成绩不混入六育均分", 2605, 430)
node("narratives", 0, 2680, "学生自述 / 代录家长寄语", ["个人基础信息只读，寄语非必填", "家长寄语标注由学生代录"], "student", "S08")
node("reportsnapshot", 1, 2680, "结算并生成报告草稿", ["汇入 07 综合结果 / 六育 / 过程 / 荣誉", "及 06 学科、故事、评语与自述"], "manager", "M10 · DRAFT")
node("reportconfirm", 2, 2680, "AI 评语草稿 → 人工复核", ["班主任修改评语，核对各项数据", "成绩齐全后显式确认草稿"], "teacher", "T08 · CONFIRMED")
node("publish", 3, 2680, "六项强校验 → 批量发布", ["任何一项不满足即阻断该生发布", "成功后快照封存，发送发布通知"], "manager", "M10 · PUBLISHED")
node("reportread", 4, 2680, "查看本人已发布报告", ["六育 / 流水摘要 / 学科 / 荣誉 / 评语", "查看已发布版本，申请个人水印 PDF"], "student", "S07")
for a, b, label in [("narratives", "reportsnapshot", "内容"), ("reportsnapshot", "reportconfirm", "草稿"), ("reportconfirm", "publish", "已确认"), ("publish", "reportread", "已发布")]:
    edge(a, b, label)
note(100, 2864, ["报告输入还包括：", "07 综合分和规则版本；03 积分摘要；", "04 已认定荣誉；05 故事；06 学科成绩。", "快照独立保存，后续更正不覆盖旧报告。"], size=16)
node("publishblocked", 2, 2860, "校验失败 → 返回补齐", ["成绩补齐转 05/06，重算转 07", "教师确认回本行，归档学期不可发布"], "warning", "发布受阻", h=112)
edge("publish", "publishblocked", "任一不满足", "alt", "BL", points=[(1580, 2830), (910, 2830), (910, 2916)], pos=(1260, 2830))
note(1410, 2865, ["发布六项门禁", "① 六育均确认　② 规则 ACTIVE", "③ 班主任已确认　④ 综合分已完成", "⑤ 快照有效　⑥ 学期 active = 1"], size=15)
node("pdf", 4, 2860, "PDF 异步生成与重试", ["PENDING → READY（链接有效 5 分钟）", "FAILED / 超 60 秒 → 提示重试", "姓名、学号末 4 位、学期、时间水印"], "system", "S07 导出任务", h=134)
edge("reportread", "pdf", "申请导出", "async", "BT", pos=(2020, 2830))

section("09", "差错更正、版本更新与学期归档", "修正通过新增记录完成；不删除积分流水，不覆盖已发布的旧报告", 3055, 340)
node("correction", 0, 3130, "发起受控冲销 / 荣誉撤销", ["冲销：发布前管理员，发布后需超管", "荣誉撤销按学期状态与权限执行"], "manager", "M11 · M06")
node("correctionwrite", 1, 3130, "保留原记录，追加变更", ["错评：追加 −1，原 +1 最多冲销一次", "荣誉：置 REVOKED，不再计入 H"], "system", "审计记录理由与原始内容")
node("recalculate", 2, 3130, "按规则重算并生成新版", ["受控更正重新核算，报告 version + 1", "归档更正基于原规则版本"], "system", "衔接 07 核算与 08 报告")
node("newreport", 3, 3130, "旧版保留 → 新版定向通知", ["原报告 SUPERSEDED，新版本可追溯", "学生收到 REPORT_UPDATED 后查看"], "system", "通知到学生 S07 / C02")
node("archive", 4, 3130, "归档学期并关闭常规写入", ["active = 0：故事终审等原有数据只读", "仅超管可追加冲销、生成新版报告"], "manager", "M02")
for a, b, label in [("correction", "correctionwrite", "理由必填"), ("correctionwrite", "recalculate", "重算"), ("recalculate", "newreport", "已有报告")]:
    edge(a, b, label)
note(100, 3307, ["归档是 08 发布后的独立管理动作，不是等待更正后才归档；右侧归档约束同时作用于整张图。", "归档后不能恢复正常评分、修改既有行或撤销荣誉；仅按授权走追加冲销与新版报告流程。"], size=16)

section("10", "贯穿所有流程的消息、审计与自动任务", "这些是系统保障能力，不是第四种用户角色", 3415, 330)
node("event", 0, 3490, "业务事件与重要操作", ["申领、审核结果、报告发布 / 更新", "制卡、直评、导入、冲销、撤销等"], "shared", "适用于 01—09")
node("outbox", 1, 3490, "事务内记审计并写消息", ["业务成功与消息记录同事务提交", "需审计的操作完整保留前后摘要"], "system", "operation_audit / outbox")
node("notify", 2, 3490, "投递到各自消息与待办", ["学生看本人结果；教师接审核待办", "失败按退避重试，最多 5 次"], "system", "C02 · T01 · S01")
node("audit", 3, 3490, "查审计、通知与失败任务", ["管理员定位投递异常和执行失败", "有权限才可人工重试，保留操作记录"], "manager", "M12 · M01")
node("jobs", 4, 3490, "定时过期 / 重算 / PDF", ["卡月末过期，待审超宽限期过期", "内部重算事件不发送成学生通知"], "system", "自动任务监控")
edge("event", "outbox", "事务")
edge("outbox", "notify", "异步", "async")
edge("notify", "audit", "异常", "alt")
edge("jobs", "audit", "监控", "read", "LR")
note(100, 3674, ["全局不变量：本校隔离 · 教师班级范围 · 学期时间窗 · 幂等防重 · 历史材料与报告多版本 · 最小化展示个人信息。", "边界：不设家长账号、积分转赠 / 兑换、在线申诉工单；外部故事合成及试行评分参数待校方确认。"], size=16)


def text(lines, x, y, size=16, fill="#35483F", weight="400", anchor="start", gap=None):
    if isinstance(lines, str):
        lines = [lines]
    gap = gap or round(size*1.55)
    return [f'<text x="{x:g}" y="{y+i*gap:g}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}">{html.escape(line)}</text>' for i, line in enumerate(lines)]


def label_position(e):
    if e["pos"]:
        return e["pos"]
    a, b = e["points"][0], e["points"][-1]
    return ((a[0]+b[0])/2, (a[1]+b[1])/2-12)


def svg():
    lines = ['<svg xmlns="http://www.w3.org/2000/svg" width="2280" height="3910" viewBox="0 0 2280 3910" role="img" aria-labelledby="title desc">',
             '<title id="title">六育学生评价系统：三角色全操作逻辑关系图</title>',
             '<desc id="desc">管理员配置基础数据，教师和学生完成日常评价与材料审核，系统分别汇聚六育正式分、过程积分和荣誉分，进行综合核算、报告确认发布与受控更正。图含异常分支、消息审计和自动任务。</desc>',
             '<style>text{font-family:"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif} .node{cursor:default}</style>',
             '<defs>']
    for kind, color in EDGE_COLORS.items():
        lines.append(f'<marker id="arrow-{kind}" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0 0L9 3.5L0 7Z" fill="{color}"/></marker>')
    lines.extend(['</defs>', '<rect width="2280" height="3910" fill="#FFFFFF"/>'])
    lines.extend(text("六育学生评价系统", 70, 76, 36, "#253D30", "650"))
    lines.extend(text("三个角色 · 全操作逻辑关系图", 70, 116, 22, "#78887D"))
    lines.extend(text("依据 SPEC V2.1 与全模块界面设计  |  2026-10-23", 2210, 81, 15, "#8A968E", anchor="end"))
    for i, role in enumerate(["student", "teacher", "manager", "system"]):
        name, fill, stroke, ink = COLORS[role]
        x = 1645+i*145
        lines.append(f'<rect x="{x}" y="108" width="18" height="18" rx="4" fill="{fill}" stroke="{stroke}"/>')
        lines.extend(text(name, x+27, 122, 15, ink))
    ribbon = ["基础配置", "日常评价并行开展", "综合核算", "确认与发布报告", "按需受控更正"]
    for i, title in enumerate(ribbon):
        x = COL[i]
        lines.append(f'<rect x="{x}" y="157" width="360" height="42" rx="8" fill="#EEF4EF"/>')
        lines.extend(text(title, x+180, 184, 17, "#52715B", "550", "middle"))
        if i<4:
            lines.append(f'<path d="M{x+376} 178H{x+422}" stroke="#91A49A" stroke-width="1.8" marker-end="url(#arrow-read)"/>')
    for s in SECTIONS:
        y = s["y"]
        lines.append(f'<rect x="40" y="{y}" width="2200" height="{s["h"]}" rx="15" fill="#FCFDFC" stroke="#E2E9E3"/>')
        lines.append(f'<rect x="64" y="{y+19}" width="37" height="28" rx="6" fill="#EAF1EB"/>')
        lines.extend(text(s["num"], 82.5, y+39, 15, "#55765C", "600", "middle"))
        lines.extend(text(s["title"], 114, y+39, 21, "#344D3C", "600"))
        lines.extend(text(s["subtitle"], 2205, y+37, 14, "#86938A", anchor="end"))
    # Edges behind node boxes; labelled connectors carry semantics.
    for e in EDGES:
        pts = e["points"]
        color = EDGE_COLORS[e["kind"]]
        d = "M"+" L".join(f"{x:g},{y:g}" for x,y in pts)
        dash = ' stroke-dasharray="6 5"' if e["kind"] in ("read", "async") else ''
        lines.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.8"{dash} marker-end="url(#arrow-{e["kind"]})"/>')
    for n in NODES:
        name, fill, stroke, ink = COLORS[n["role"]]
        x,y,w,h = (n[k] for k in ("x","y","w","h"))
        lines.append(f'<g class="node" id="{n["id"]}"><title>{html.escape(name+"："+n["title"]+"；"+"；".join(n["lines"]))}</title>')
        lines.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{fill}" stroke="{stroke}" stroke-width="1.3"/>')
        lines.extend(text(name, x+18, y+23, 11, ink, "500"))
        lines.extend(text(n["refs"], x+w-15, y+23, 10, "#89958D", anchor="end"))
        lines.extend(text(n["title"], x+18, y+50, 18, ink, "600"))
        lines.extend(text(n["lines"], x+18, y+75, 14, "#65776A", gap=21))
        lines.append('</g>')
    for e in EDGES:
        if not e["label"]:
            continue
        x,y = label_position(e)
        width = sum(13 if ord(c)>255 else 7 for c in e["label"])+12
        lines.append(f'<rect x="{x-width/2:g}" y="{y-12:g}" width="{width:g}" height="23" rx="4" fill="#FCFDFC" opacity=".98"/>')
        lines.extend(text(e["label"], x, y+5, 13, EDGE_COLORS[e["kind"]], anchor="middle"))
    for n in NOTES:
        lines.extend(text(n["lines"], n["x"], n["y"], n["size"], n["color"]))
    # A reading guide rather than duplicate full-width connector bundles.
    lines.extend(text("阅读图例", 75, 3793, 17, "#57705D", "600"))
    for i,(kind,label) in enumerate([("main","实线：业务提交 / 依赖"),("read","虚线：只读查询 / 监控"),("alt","暖色：异常 / 退回 / 更正"),("async","淡紫虚线：异步任务 / 通知")]):
        x=220+i*490
        color=EDGE_COLORS[kind]
        dash=' stroke-dasharray="6 5"' if kind in ("read","async") else ''
        lines.append(f'<path d="M{x} 3787h47" stroke="{color}" stroke-width="1.8"{dash} marker-end="url(#arrow-{kind})"/>')
        lines.extend(text(label,x+60,3793,14,"#7C8A80"))
    lines.extend(text("02—06 是并行日常业务，不要求逐段按编号执行；数据来源编号在 07 / 08 中明确汇合。归档能力属于管理员授权，不新增第四个登录角色。",75,3833,16,"#708276"))
    lines.extend(text("业务关系图不代表功能已经上线。未确认的校规参数保留为配置项；各业务操作最终由服务端校验权限、时间窗及并发状态。",75,3867,14,"#98A398"))
    lines.append('</svg>')
    return "\n".join(lines)


def drawio():
    root=ET.Element('mxfile',host='drawio',version='26.0.0')
    diagram=ET.SubElement(root,'diagram',name='三角色全操作逻辑图')
    model=ET.SubElement(diagram,'mxGraphModel',dx=str(W),dy=str(H),grid='1',gridSize='10',page='1',pageWidth=str(W),pageHeight=str(H),background='#FFFFFF')
    cells=ET.SubElement(model,'root')
    ET.SubElement(cells,'mxCell',id='0')
    ET.SubElement(cells,'mxCell',id='1',parent='0')
    def vertex(nid,value,x,y,w,h,style):
        cell=ET.SubElement(cells,'mxCell',id=nid,value=value,style=style,vertex='1',parent='1')
        ET.SubElement(cell,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),attrib={'as':'geometry'})
    vertex('header','六育学生评价系统 · 三角色全操作逻辑关系图',65,35,1600,60,'text;html=1;align=left;fontSize=32;fontStyle=1;fontColor=#253D30;')
    vertex('subheader','基础配置 → 日常评价并行开展 → 综合核算 → 教师确认 / 管理发布 → 按需受控更正',65,120,2100,60,'text;html=1;align=left;fontSize=20;fontColor=#708276;')
    for s in SECTIONS:
        vertex('section-'+s['num'],s['num']+'  '+s['title'],40,s['y'],2200,s['h'],'rounded=1;whiteSpace=wrap;html=1;fillColor=#FCFDFC;strokeColor=#E2E9E3;align=left;verticalAlign=top;spacingTop=16;spacingLeft=22;fontSize=21;fontStyle=1;pointerEvents=0;')
    for n in NODES:
        name,fill,stroke,ink=COLORS[n['role']]
        value='<b>'+html.escape(name+' · '+n['title'])+'</b><br>'+html.escape(' / '.join(n['lines']))+'<br><font color="#89958D">'+html.escape(n['refs'])+'</font>'
        vertex(n['id'],value,n['x'],n['y'],n['w'],n['h'],f'rounded=1;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};fontColor={ink};fontSize=14;align=left;spacing=16;')
    sides={'L':(0,.5),'R':(1,.5),'T':(.5,0),'B':(.5,1)}
    for i,e in enumerate(EDGES):
        (ex,ey),(ix,iy)=(sides[s] for s in e['sides'])
        if e['sides'][0] in 'LR':ey=e['fractions'][0]
        else:ex=e['fractions'][0]
        if e['sides'][1] in 'LR':iy=e['fractions'][1]
        else:ix=e['fractions'][1]
        style=f'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor={EDGE_COLORS[e["kind"]]};strokeWidth=1.8;fontSize=13;labelBackgroundColor=#FCFDFC;exitX={ex};exitY={ey};exitDx=0;exitDy=0;entryX={ix};entryY={iy};entryDx=0;entryDy=0;'
        if e['kind'] in ('read','async'):style+='dashed=1;'
        c=ET.SubElement(cells,'mxCell',id=f'edge-{i}',value=e['label'],style=style,edge='1',parent='1',source=e['src'],target=e['dst'])
        geom=ET.SubElement(c,'mxGeometry',relative='1',attrib={'as':'geometry'})
        if len(e['points'])>2:
            a=ET.SubElement(geom,'Array',attrib={'as':'points'})
            for x,y in e['points'][1:-1]:ET.SubElement(a,'mxPoint',x=str(x),y=str(y))
    for i,n in enumerate(NOTES):
        vertex(f'note-{i}','<br>'.join(html.escape(t) for t in n['lines']),n['x'],n['y']-18,max(len(t) for t in n['lines'])*n['size']+20,len(n['lines'])*n['size']*1.6+10,f'text;html=1;align=left;verticalAlign=top;fontSize={n["size"]};fontColor={n["color"]};')
    vertex('legend','实线：业务依赖 / 提交；灰虚线：只读查询；暖色：异常 / 退回；淡紫虚线：异步任务。<br>02—06 日常业务并行；07 汇合评价数据，08 汇集报告内容。依据 SPEC V2.1，2026-10-23。',70,3770,2120,90,'text;html=1;align=left;fontSize=17;fontColor=#708276;')
    ET.indent(root)
    return ET.tostring(root,encoding='unicode',xml_declaration=True)


def validate():
    ids=[n['id'] for n in NODES]
    assert len(ids)==len(set(ids))
    for n in NODES:
        assert n['x']>=0 and n['y']>=0 and n['x']+n['w']<=W and n['y']+n['h']<=H
        assert 52+len(n['lines'])*21<=n['h']+8, n['id']
        assert sum(18 if ord(c)>255 else 9.5 for c in n['title'])<=n['w']-28, (n['id'],n['title'])
        for line in n['lines']:
            width=sum(14 if ord(c)>255 else 7.8 for c in line)
            assert width<=n['w']-28, (n['id'],line,width)
    collisions=[]
    for e in EDGES:
        for (x1,y1),(x2,y2) in zip(e['points'],e['points'][1:]):
            assert x1==x2 or y1==y2, (e['src'],e['dst'],'nonorthogonal',e['points'])
            for n in NODES:
                l,r,t,b=n['x']+2,n['x']+n['w']-2,n['y']+2,n['y']+n['h']-2
                crosses=(y1==y2 and t<y1<b and max(min(x1,x2),l)<min(max(x1,x2),r)) or (x1==x2 and l<x1<r and max(min(y1,y2),t)<min(max(y1,y2),b))
                if crosses:collisions.append((e['src'],e['dst'],n['id']))
    assert not collisions, collisions
    refs=set()
    for n in NODES:refs.update(__import__('re').findall(r'\b[CSTM]\d\d\b',n['refs']))
    expected={'C01','C02',*[f'S{i:02}' for i in range(1,9)],*[f'T{i:02}' for i in range(1,10)],*[f'M{i:02}' for i in range(1,13)]}
    assert expected<=refs, expected-refs
    return {'nodes':len(NODES),'edges':len(EDGES),'views_covered':len(expected),'edge_node_collisions':len(collisions)}


if __name__=='__main__':
    report=validate()
    svg_text=svg()
    ET.fromstring(svg_text)
    drawio_text=drawio()
    ET.fromstring(drawio_text)
    (OUT/'三角色操作逻辑图.svg').write_text(svg_text,encoding='utf-8')
    (OUT/'三角色操作逻辑图.drawio').write_text(drawio_text,encoding='utf-8')
    (OUT/'logic-map-data.json').write_text(json.dumps({'nodes':NODES,'edges':EDGES,'validation':report},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
