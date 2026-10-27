---
id: DEV-RENOVATION-15
title: 报告阅读与A4打印
status: closed
labels: ["completed"]
parent: SPEC-20261027-RENOVATION
assignee: agent
blocked_by: ["DEV-RENOVATION-14","WF-RENOVATION-08"]
conditional_blocked_by: []
conditional_state: none
user_stories: [55,56,57,58,59,60]
---

# 15 — 报告阅读与A4打印

**What to build:** 学生和授权教师阅读发布版分区报告、六维雷达及成长证据，直接打印同版本A4。

**Blocked by:** [状态发布与版本冻结](14-report-publishing.md)；[报告采用哪些指标等级和A4版式](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-08.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 55、56、57、58、59、60；编号对应父规格。

## Acceptance criteria

- [x] 学生和获授权人员能读取对应发布版本的分区报告，展示六维等级/雷达、成长证据、学科、故事和寄语等适用内容。
- [x] 报告身份、班级、学期、正文及规则依据全部来自发布快照，实时资料改变不悄悄改动旧版。
- [x] 电子版和A4打印版读取相同发布数据，打印去掉互动效果，另行标识打印时间。
- [x] 按学校样例验证长中文、星级、长寄语、表格跨页及署名/签章区域，页数与单双面遵循确认结果。
- [x] 当前版与历史替代版按授权可核查；学生不能读取其他学生，管理员不能借打印访问详情。
- [x] 打印失败或数据不完整明确反馈，未取得原样例时不宣称正式纸质版式验收完成。
- [x] 通过本人打开报告→切换允许版本→真实打印预览/PDF核查的浏览器流程验收。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

