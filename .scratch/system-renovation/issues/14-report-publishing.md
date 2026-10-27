---
id: DEV-RENOVATION-14
title: 状态发布与版本冻结
status: closed
labels: ["ready-for-agent", "verified"]
parent: SPEC-20261027-RENOVATION
assignee: agent
blocked_by: ["DEV-RENOVATION-11","WF-RENOVATION-08","WF-RENOVATION-04"]
conditional_blocked_by: ["DEV-RENOVATION-13"]
conditional_state: resolved
user_stories: [52,53,54,55,56]
---

# 14 — 状态发布与版本冻结

**What to build:** 管理员只看准备状态并批量发布已确认报告；成功结果冻结版本，受阻原因可见，个人正文不可见。

**Blocked by:** [报告草稿与教师确认](11-report-draft-confirmation.md)；[报告采用哪些指标等级和A4版式](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-08.md)；[任课教师与班主任的数据权限如何区分](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-04.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 52、53、54、55、56；编号对应父规格。

**条件阻塞：** 若学校确认家长寄语必填，增加[家长寄语](13-family-comments.md)为实际阻塞；若确认非必填，保留不阻塞发布的人工寄语路径。当前条件未决，不能因业务票单独关闭而直接领取。

## Acceptance criteria

- [x] 管理员能查询允许的完成数量、缺项、身份/班级状态及发布结果，不返回个人分数、寄语、故事、健康或报告快照。
- [x] 仅已满足门槛且班主任确认版本仍有效的报告可发布；源数据改变或预期版本过期必须受阻。
- [x] 每份报告事务冻结身份、学期、来源有效版本、规则、模板、指标及教师/家长内容来源，新版成功后才替代旧版。
- [x] 重复或并发发布不能产生重复有效版本，单份失败保留旧版，整批允许部分成功并清楚返回原因。
- [x] 报告详情、打印、综合评价、材料、审计摘要和旧入口不能让管理员绕回个人内容。
- [x] 人工寄语路径足以独立演示发布；若学校规定家长寄语必填，先将家长寄语票提升为实际阻塞。
- [x] 通过状态检查→批量发布→查看受阻和成功状态的真实界面验收，并以真实API/数据库验证版本竞态及事务失败。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

