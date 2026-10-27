---
id: DEV-RENOVATION-20C
title: P1全链路试点与历史对账
status: closed
labels: ["completed"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-08","DEV-RENOVATION-12","DEV-RENOVATION-13","DEV-RENOVATION-15","DEV-RENOVATION-16","DEV-RENOVATION-20B","WF-RENOVATION-12"]
conditional_blocked_by: ["DEV-RENOVATION-09"]
conditional_state: resolved
user_stories: [76,77,78]
---

# 20C — P1全链路试点与历史对账

**What to build:** 管理员按确认范围组织P1全链路三角色走通，涵盖自动评价、草稿确认、AI/家长寄语、状态发布、A4打印、成长首页及历史学期数据对账。

**Blocked by:** [学科成绩导入](08-subject-score-import.md)；[AI寄语](12-ai-comments.md)；[家长寄语](13-family-comments.md)；[报告阅读与A4打印](15-report-reading-printing.md)；[学生成长首页与主题](16-student-growth-theme.md)；[P0试点与回退演练](20B-pilot-p0.md)；[旧卡旧分如何切换并在哪些班级试点](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-12.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 76、77、78。

**条件阻塞：** 若体测为必评来源，增加[体测与健康导入](09-health-import.md)为阻塞。

## Acceptance criteria

- [x] 三角色真实浏览器走通P1全业务链（指标导入、六维评价、草稿确认、AI起草、家长反馈、批量发布、阅读打印、学生成长首页）。
- [x] 验证旧数据对账：旧历史报告版本只读可重现，新发布报告不篡改旧版快照。
- [x] 验证发布事务原子性与失败回滚，批次发布持续显示进度。
- [x] 形成正式上线演练记录与运维操作手册。
