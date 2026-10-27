---
id: DEV-RENOVATION-01
title: 任教授权与受限成绩
status: open
labels: ["ready-for-agent"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-20A","WF-RENOVATION-04"]
conditional_blocked_by: []
conditional_state: none
user_stories: [35,37,38,46]
---

# 01 — 任教授权与受限成绩

**What to build:** 管理员维护按学期的任教班级、学科和班主任职责；教师在现有成绩入口中只可读取和提交授权学科。

**Blocked by:** [兼容迁移与隔离验收入口](20A-migration-isolation.md)；[任课教师与班主任的数据权限如何区分](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-04.md)。

**Status:** ready-for-agent

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 35、37、38、46；编号对应父规格。

本票无开发票前置，但仍须解决上列业务决策；ready-for-agent为分流标签，不表示前置已完成。

## Acceptance criteria

- [ ] 管理员可按学校和学期维护教师—班级—学科关系及明确的班主任职责，界面保存后重新读取一致。
- [ ] 教师教甲班语文、乙班数学时，可读写对应成绩，不能读写甲班数学或未授权班级；班主任职责不被当成任意学科写权限。
- [ ] 预览、提交、查询及历史入口执行相同的当前授权校验；修改请求体、换学生标识或跨校均不能绕过。
- [ ] 授权缺失、失效或撤销后有清晰反馈，不以教师班级列表和学科列表的笛卡尔积扩大访问。
- [ ] 管理员配置职责不因此获得个人成绩修改权限；其他具体读取范围遵循已解决的权限决策。
- [ ] 必要的授权入口预整理在本票先完成，以实际受限成绩行为证明；既有发卡主教学科关系保持可解释。
- [ ] 在隔离环境通过管理员配置→教师读取/提交的真实界面流程；对伪造请求和跨范围访问补充真实API验证。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

