---
id: DEV-RENOVATION-02
title: 预分类制卡与打印
status: open
labels: ["ready-for-agent"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-20A","WF-RENOVATION-02"]
conditional_blocked_by: []
conditional_state: none
user_stories: [2,3,4,5,6,7,41]
---

# 02 — 预分类制卡与打印

**What to build:** 管理员配置D/Z及叶子份额，生成并打印带明确奖励事由、完整分类和版本的卡片；重复生成/重印不增量。

**Blocked by:** [兼容迁移与隔离验收入口](20A-migration-isolation.md)；[日常卡如何预设分类并分配子类份额](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-02.md)。

**Status:** ready-for-agent

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 2、3、4、5、6、7、41；编号对应父规格。

本票无开发票前置，但仍须解决上列业务决策；ready-for-agent为分流标签，不表示前置已完成。

## Acceptance criteria

- [ ] 管理员能配置已批准的D/Z方向及叶子份额，保存后系统生成的方向和子类整数数量合计符合策略。
- [ ] 每张新卡保存学校、学期、责任教师、方向、有效叶子分类、完整路径及版本、固定+1、批次和有效期。
- [ ] 卡面及打印预览能辨认奖励事由，二维码凭证沿用受控打印规则，不把可兑换明文凭证写入普通日志。
- [ ] 不能按T/M/L/G生成日常卡，不能在缺分类时随机选子类，已有非D/Z份额不静默重分配。
- [ ] 并发或失败重试不重复制卡；重复打印使用原卡片和同一凭证，不新增可兑换奖励。
- [ ] 指标更名/停用不覆盖已生成卡的快照；未用旧版卡的处理严格采用已确认的规则。
- [ ] 从管理员配置、生成、打印到再次查询走通真实界面流程，并核对可打印数量与记录一致。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

