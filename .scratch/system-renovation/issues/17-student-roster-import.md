---
id: DEV-RENOVATION-17
title: 学籍表导入
status: closed
labels: ["completed"]
parent: SPEC-20261027-RENOVATION
assignee: agent
blocked_by: ["DEV-RENOVATION-01","WF-RENOVATION-12"]
conditional_blocked_by: []
conditional_state: none
user_stories: [74]
---

# 17 — 学籍表导入

**What to build:** 管理员按学校原表确认映射和新增/更新/冲突，再导入学生基础资料；保留映射及批次记录。

**Blocked by:** [任教授权与受限成绩](01-teaching-scope.md)；[旧卡旧分如何切换并在哪些班级试点](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-12.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 74；编号对应父规格。

本票无开发票前置，但仍须解决上列业务决策；ready-for-agent为分流标签，不表示前置已完成。

**范围：** P2，若试点账号准备需要则提前。

## Acceptance criteria

- [x] 管理员按学校原学籍表选择并确认映射，预览新增、更新、重复、同名不同号及冲突。
- [x] 按学校和稳定学号匹配，缺少可靠身份或冲突时不凭姓名直接覆盖。
- [x] 确认后写入已批准的基础字段，保留映射版本、导入批次、责任人与变更记录。
- [x] 导入不覆盖密码、角色、教师成绩或已发布快照，也不借学籍权限获得成绩管理能力。
- [x] 转班影响后续授权按规则生效，历史奖励和已发布报告保留原事件班级。
- [x] 未经样例确认不承诺任意Excel格式；新试点账号准备是否依赖本票按试点范围确认。
- [x] 通过上传→查看冲突→确认新增/更新→重新查询的真实界面验收，并验证越权或伪造敏感字段不生效。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

