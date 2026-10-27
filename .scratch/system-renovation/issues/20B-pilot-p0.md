---
id: DEV-RENOVATION-20B
title: P0试点与回退演练
status: open
labels: ["ready-for-agent"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-03","DEV-RENOVATION-04","WF-RENOVATION-12"]
conditional_blocked_by: ["DEV-RENOVATION-17","DEV-RENOVATION-18B"]
conditional_state: unresolved
user_stories: [76,77,78]
---

# 20B — P0试点与回退演练

**What to build:** 验证P0阶段完整闭环（任教授权、预分类制卡、扫码即时入账、教师纠错与直评），完成旧卡盘点、并发兑换与回退演练。

**Blocked by:** [扫码即时入账](03-instant-card-redemption.md)；[教师纠错与直评](04-teacher-score-corrections.md)；[旧卡旧分如何切换并在哪些班级试点](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-12.md)。

**Status:** ready-for-agent

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 76、77、78。

**条件阻塞：** 若试点缺基础账号则依赖[学籍表导入](17-student-roster-import.md)；若公共扫码设备为一期必需则依赖[公共设备兑换展示与切人清屏](18B-device-redemption-screen.md)。

## Acceptance criteria

- [ ] 在隔离库验证任教授权、发卡、学生扫码、教师纠错的全流程，无教师待审环节。
- [ ] 盘点并按策略验证未用、待审、已用旧卡，确保历史账目不丢失、已用卡不重复入账。
- [ ] 执行高并发扫码竞争与重复请求回放演练，账本保持守恒。
- [ ] 演练回退配置，确认已入账记录不被物理抹除，保留完整冲销链。
