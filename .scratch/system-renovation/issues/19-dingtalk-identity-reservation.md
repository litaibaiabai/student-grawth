---
id: DEV-RENOVATION-19
title: 钉钉身份预留
status: closed
labels: ["completed"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-01","WF-RENOVATION-12"]
conditional_blocked_by: []
conditional_state: none
user_stories: [70]
---

# 19 — 钉钉身份预留

**What to build:** 管理员维护受控的外部身份到校内账号关联并核验角色分流，为后续钉钉登录保留完整绑定边界。

**Blocked by:** [任教授权与受限成绩](01-teaching-scope.md)；[旧卡旧分如何切换并在哪些班级试点](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-12.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 70；编号对应父规格。

本票无开发票前置，但仍须解决上列业务决策；ready-for-agent为分流标签，不表示前置已完成。

**范围：** P2预留；本票不把尚未具备条件的真实SSO当成已交付。

## Acceptance criteria

- [x] 管理员可受控维护外部身份到校内账号的关联，范围绑定学校，界面能查询、核验及按规则解绑。
- [x] 关联校内用户后按校内角色与职责分流，不允许客户端自选管理员或跨校身份。
- [x] 关联、变更与解绑有审计和唯一性/冲突反馈，不意外覆盖已有用户权限。
- [x] 预留身份提供方与校内会话的清晰边界；用关联查询和真实界面证明预留可用，不把模拟回调当成真实钉钉登录。
- [x] 若一期决定实接钉钉，必须先具备学校平台权限、测试账号和明确回调/绑定规则，再固定其可验收范围。
- [x] 本票按预留/关联能力验收；尚未具备条件的真实统一登录如实标记未交付，不伪造已接通结论。
- [x] 通过授权管理员关联/解绑→验证校内角色与会话范围的界面流程，并用API验证提权和跨校请求拒绝。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

