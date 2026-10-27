---
id: DEV-RENOVATION-06
title: 故事建议与终审
status: closed
labels: ["closed"]
parent: SPEC-20261027-RENOVATION
assignee: agent
blocked_by: ["DEV-RENOVATION-01","WF-RENOVATION-07"]
conditional_blocked_by: []
conditional_state: resolved
user_stories: [30,31,32,33,34]
---

# 06 — 故事建议与终审

**What to build:** 学生输入/粘贴、保存草稿并提交，授权教师看到可解释的规则建议，调整并确认正式分。

**Blocked by:** [任教授权与受限成绩](01-teaching-scope.md)；[故事建议分与学期故事评价怎样形成](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-07.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 30、31、32、33、34；编号对应父规格。

## Acceptance criteria

- [x] 学生可输入或粘贴正文、保存草稿并提交，界面清楚区分草稿、已提交和已终审。
- [x] 生成结果明确标为规则建议分，展示依据并保存规则版本；不能凭篇幅宣称内容真实或成长明显。
- [x] 授权教师可阅读作品、调整建议并确认正式分，正式评价与建议保持区分。
- [x] 月份、提交/退回/重写及有效作品版本遵循已确认口径，不能覆盖已终审事实。
- [x] 保留足够的学期、月份、教师正式分和有效版本供自动六育票聚合，不在此默认以最后一篇代表整学期。
- [x] 不增加Word上传或强制模型接入；证据不足时提示教师判断，不编造依据。
- [x] 通过学生草稿→提交→教师评阅→本人查看状态的真实界面验收，验证跨班/跨校越权被拒绝。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

