---
id: DEV-RENOVATION-10
title: 自动六育评价
status: closed
labels: ["closed"]
parent: SPEC-20261027-RENOVATION
assignee: agent
blocked_by: ["DEV-RENOVATION-05","DEV-RENOVATION-06","DEV-RENOVATION-07","WF-RENOVATION-05"]
conditional_blocked_by: ["DEV-RENOVATION-08","DEV-RENOVATION-09"]
conditional_state: resolved
user_stories: [34,40,41,42,43,44,45]
---

# 10 — 自动六育评价

**What to build:** 管理员维护并启用已批准的规则；学生和班主任看到由有效来源生成的六维结果、等级、证据和缺项。

**Blocked by:** [荣誉认定与奖励](05-honor-awards.md)；[故事建议与终审](06-story-review.md)；[年级指标与教师评价](07-grade-indicators.md)；[自动六育评价的来源权重与等级怎样形成](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-05.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 34、40、41、42、43、44、45；编号对应父规格。

## Acceptance criteria

- [x] 管理员能维护并启用经批准的各年级/学期规则，学生和班主任看到自动六维结果、等级、状态、分解与证据。
- [x] 只使用规定期间有效版本的日常净积分、认可荣誉、正式故事和适用指标，不依赖新流程管理员导入六育终测。
- [x] 同一积分或荣誉只参与一次已定计算，不无条件再叠加历史80/15/5；历史规则和结果保留原版本。
- [x] 故事按已确认月份及聚合规则生成G，不默认最后一篇覆盖学期；读听讲与原创故事不互相冒充。
- [x] 未采集、有效零次、免测及不适用分别处理；没有获奖但常规来源齐备不自动阻断。
- [x] 未配置来源权重、等级或缺项策略时明确显示未就绪，不猜测校规或伪造最终等级。
- [x] 来源变化后有效核算更新且证据可追溯；通过配置规则→产生/更正来源→查看结果的真实界面验收。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

