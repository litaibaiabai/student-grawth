---
id: DEV-RENOVATION-12
title: AI寄语
status: closed
labels: ["ready-for-agent", "verified"]
parent: SPEC-20261027-RENOVATION
assignee: agent
blocked_by: ["DEV-RENOVATION-11","WF-RENOVATION-10"]
conditional_blocked_by: []
conditional_state: none
user_stories: [48,49,50,51]
---

# 12 — AI寄语

**What to build:** 班主任从报告草稿生成真实模型寄语，核对引用证据、编辑确认；失败可明确重试或转人工。

**Blocked by:** [报告草稿与教师确认](11-report-draft-confirmation.md)；[AI学期寄语一期怎样交付与确认](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-10.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 48、49、50、51；编号对应父规格。

## Acceptance criteria

- [x] 在学校确认真实模型渠道、输入范围和一期要求后，班主任可从草稿发起寄语生成并查看任务状态。
- [x] 生成输入只选本学期已确认事实和必要证据，不默认传姓名、学号、健康或家庭资料。
- [x] 初稿附引用证据与不足提示，教师能核实、编辑、确认，并保留模型/规则版本和人工修订。
- [x] 不编造奖项、名次、性格、诊断或无法比较的进步趋势；证据不足时如实提示。
- [x] 失败允许重试或转人工，保留已保存内容，不覆盖教师已确认文案。
- [x] 模板兜底明确标注来源；只有模拟/模板不得认定真实AI功能通过，批准延期须如实记录未交付部分。
- [x] 通过实际生成渠道起草→证据核查→编辑确认的真实界面验收；服务失败也须展示可验证结果。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

