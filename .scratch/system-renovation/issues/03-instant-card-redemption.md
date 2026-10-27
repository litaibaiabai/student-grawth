---
id: DEV-RENOVATION-03
title: 扫码即时入账
status: closed
labels: ["ready-for-agent"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-02","DEV-RENOVATION-04","WF-RENOVATION-01"]
conditional_blocked_by: ["DEV-RENOVATION-18A"]
conditional_state: none
user_stories: [1,8,9,10,11,12,13,14]
---

# 03 — 扫码即时入账

**What to build:** 已识别身份的学生扫码即+1，页面显示真实分类和成功动画；未登录恢复意图，重复、失效、超时重试有明确反馈。

**Blocked by:** [预分类制卡与打印](02-classified-card-printing.md)；[教师纠错与直评](04-teacher-score-corrections.md)；[一期扫码设备与学生身份怎样确定](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-01.md)。

**Status:** ready-for-agent

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 1、8、9、10、11、12、13、14；编号对应父规格。

## Acceptance criteria

- [ ] 已识别学生身份扫有效预分类卡后立即只获得+1，方向/具体分类来自卡片快照，教师待审数量不增长。
- [ ] 兑换事实、唯一原始奖励、卡片已用及审计同一事务提交；事务失败不留下半成功卡片或积分。
- [ ] 同一请求重放返回同一次兑换结果；换请求重复扫、并发抢扫和提交后响应超时重试仍只产生一次奖励。
- [ ] 首次成功后显示准确分类和加分动画；重复或失败不得播放新的奖励成功反馈，动画可跳过并尊重减少动态偏好。
- [ ] 未登录扫码按已确认身份方案完成登录并恢复意图，不由奖励卡推断学生身份或让客户端选择他人。
- [ ] 过期、未生效、作废、旧测试卡和跨校凭证不加分；其他学生扫码已用卡不获知领取人。
- [ ] 保留已印刷兑换链接的兼容策略，以真实界面展示正常/重复/异常，并用真实API和数据库验证竞争及失败边界。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

