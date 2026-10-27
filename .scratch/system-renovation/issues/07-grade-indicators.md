---
id: DEV-RENOVATION-07
title: 年级指标与教师评价
status: open
labels: ["ready-for-agent"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-01","WF-RENOVATION-08"]
conditional_blocked_by: []
conditional_state: none
user_stories: [39,41,42,45]
---

# 07 — 年级指标与教师评价

**What to build:** 管理员按年级配置行为、学科、读听讲等适用指标；教师录入等级、星级、数值或文本并查看完成状态。

**Blocked by:** [任教授权与受限成绩](01-teaching-scope.md)；[报告采用哪些指标等级和A4版式](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-08.md)。

**Status:** ready-for-agent

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 39、41、42、45；编号对应父规格。

## Acceptance criteria

- [ ] 管理员能按学校、学期/版本和年级配置行为、学科、读听讲等适用指标、值类型、单位及必填/显示规则。
- [ ] 授权教师能在界面完成对应指标评价并重新读取，支持等级、星级、数值和文本，而非全部转换为百分分。
- [ ] 保存原始值、类型化结果、有效版本、责任人及来源，后续报告能引用同一事实。
- [ ] 界面及服务端区分缺失、有效0、缺考、免测和不适用；未经规则不把三星、A与百分分互换。
- [ ] 不同年级/课程使用自己的适用集合，不将建议稿全部74项强制设为所有学生必填。
- [ ] 管理员配置字典不因此能查看个人评价值，任课教师和班主任的评价范围遵循职责授权。
- [ ] 以管理员配置→教师填写→完成状态变化的真实界面流程验收，并验证越权访问拒绝。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

