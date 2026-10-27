---
id: DEV-RENOVATION-04
title: 教师纠错与直评
status: open
labels: ["ready-for-agent"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-01","WF-RENOVATION-03"]
conditional_blocked_by: []
conditional_state: none
user_stories: [15,16,17,18,19,20,21,22]
---

# 04 — 教师纠错与直评

**What to build:** 教师从授权班级账本撤销、改允许分值/分类并查看历史，也可批量无卡直评；管理员退出新流程逐笔处理。

**Blocked by:** [任教授权与受限成绩](01-teaching-scope.md)；[教师纠错与无卡直评允许哪些变化](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-03.md)。

**Status:** ready-for-agent

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 15、16、17、18、19、20、21、22；编号对应父规格。

## Acceptance criteria

- [ ] 教师从获授权班级账本查看有效奖励与更正历史，可按已批准范围撤销、修改分类或分值并填写原因。
- [ ] 原始奖励不可物理覆盖；撤销追加冲销，修改追加冲销和替代项，保留原奖励、更正链、操作人和时间。
- [ ] 对同一有效项的重复/并发纠错不会多扣；替代项不会重复占用原卡的唯一入账身份。
- [ ] 分值和来源约束按允许改分及后续荣誉奖励兼容扩展，但不因此开放任意负分、维度或学生归属修改。
- [ ] 更正卡片积分后卡仍为已使用，不能通过再次扫码重新领奖。
- [ ] 无卡直评对允许学生及分类批量入账，稳定批次/学生请求重试不重复奖励。
- [ ] 新流程管理员逐笔审核及取消能力被服务端和界面同时收回；关闭学期按已批准规则处理。
- [ ] 从现有有效积分及直评即可通过真实界面独立验收，不等待新扫码票；并发更正与越权另用真实API验证。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

