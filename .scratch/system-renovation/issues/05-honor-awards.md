---
id: DEV-RENOVATION-05
title: 荣誉认定与奖励
status: open
labels: ["ready-for-agent"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-04","WF-RENOVATION-06"]
conditional_blocked_by: []
conditional_state: none
user_stories: [23,24,25,26,27,28,29]
---

# 05 — 荣誉认定与奖励

**What to build:** 学生申报/补材料，教师选择T/M/L并通过或带理由驳回；有效规则计算奖励且可同步撤销/更正。

**Blocked by:** [教师纠错与直评](04-teacher-score-corrections.md)；[荣誉归属与正式奖励规则怎样确定](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-06.md)。

**Status:** ready-for-agent

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 23、24、25、26、27、28、29；编号对应父规格。

## Acceptance criteria

- [ ] 学生能提交奖状和赛事、届次、级别、等次、日期，教师能查看所需材料并按授权审核。
- [ ] 管理员可维护已批准的版本化荣誉计分规则；教师通过时确认T/M/L归属、采用规则版本和正式分。
- [ ] 审核通过与正式奖励保持同一事务结果，按本票声明的账本契约记账且汇总只计一次。
- [ ] 重复审核/请求重放不多记奖励；赛事届次和奖项去重依据稳定，不用时间尾缀逃过重复认定。
- [ ] 驳回必须填写原因；学生可按规则修改重提，各次材料及审核依据保留版本。
- [ ] 认定撤销或修改归属/分值时同步更正关联奖励，不留下状态与账本不一致。
- [ ] 不强制开发OCR，不将旧固定1—9分当成新规则；未配置奖项口径时给出明确待配置状态。
- [ ] 通过学生申报→驳回重提→教师归类通过→查看奖励的真实界面验收，并验证审核重试及事务失败。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

