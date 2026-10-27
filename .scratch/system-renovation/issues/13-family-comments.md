---
id: DEV-RENOVATION-13
title: 家长寄语
status: closed
labels: ["ready-for-agent", "verified"]
parent: SPEC-20261027-RENOVATION
assignee: agent
blocked_by: ["DEV-RENOVATION-11","WF-RENOVATION-09"]
conditional_blocked_by: []
conditional_state: none
user_stories: [61,62,63]
---

# 13 — 家长寄语

**What to build:** 家长经确认渠道填写鼓励，系统记录来源/身份依据；发布前可纳入正文，发布后作为新反馈或显式重发。

**Blocked by:** [报告草稿与教师确认](11-report-draft-confirmation.md)；[家长通过什么身份填写寄语并进入哪个版本](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-09.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 61、62、63；编号对应父规格。

## Acceptance criteria

- [x] 按已确认家长身份渠道建立只针对指定学生/学期的填写范围，并体现凭证有效、撤销及身份依据。
- [x] 家长能填写和查看其获准范围内的寄语反馈，记录来源、时间和版本；学生代录若被允许明确标注。
- [x] 发布前内容可按规则进入对应草稿；发布后保存独立新反馈或走显式重新发布，不直接更新旧正文。
- [x] 家长查看整份报告与仅填写寄语分别授权，不因持有填写入口而读取其他学生或额外资料。
- [x] 重复提交/修订按反馈版本处理；无寄语时的门槛遵循学校决定，不私自设为必填或非必填。
- [x] 通过确认渠道填写→授权核查→发布后补填的真实界面验收，并验证过期/撤销/错学生请求被拒绝。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

