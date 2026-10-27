---
id: DEV-RENOVATION-11
title: 报告草稿与教师确认
status: open
labels: ["ready-for-agent"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-10","WF-RENOVATION-08"]
conditional_blocked_by: []
conditional_state: none
user_stories: [46,47,50,54]
---

# 11 — 报告草稿与教师确认

**What to build:** 班主任打开按学期自动汇总的个人报告草稿，查看证据、手写或编辑唯一学期寄语并确认可发布内容。

**Blocked by:** [自动六育评价](10-six-dimension-evaluation.md)；[报告采用哪些指标等级和A4版式](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-08.md)。

**Status:** ready-for-agent

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 46、47、50、54；编号对应父规格。

## Acceptance criteria

- [ ] 班主任能打开所负责学生、学期的报告草稿，自动汇总适用六维、学科、行为、荣誉、故事等有效证据。
- [ ] 按已确认报告配置呈现必填、免测、不适用和缺项，不要求再次复制录入已有来源。
- [ ] 班主任可手写或编辑唯一的学期寄语，保存修订并确认；此人工路径可独立验收，不等AI或家长模块。
- [ ] 教师确认绑定来源数据、规则、模板和寄语版本；确认后数据变化使草稿重新进入待确认。
- [ ] 普通任课教师不默认获得完整报告，管理员不能读草稿正文，跨校/跨班请求按职责拒绝。
- [ ] 草稿、待确认和可发布状态在界面清楚表达，可发布门槛遵循已解决的报告决策。
- [ ] 以班主任查看证据→编辑寄语→确认→修改来源后重新待确认的真实界面验收，API验证越权和版本竞态。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

