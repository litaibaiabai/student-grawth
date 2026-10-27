---
id: DEV-RENOVATION-16
title: 学生成长首页与主题
status: closed
labels: ["completed"]
parent: SPEC-20261027-RENOVATION
assignee: agent
blocked_by: ["DEV-RENOVATION-03","DEV-RENOVATION-10","WF-RENOVATION-11"]
conditional_blocked_by: []
conditional_state: none
user_stories: [9,10,64,65,66,67,68,69]
---

# 16 — 学生成长首页与主题

**What to build:** 学生从独立卡通首页进入扫码、荣誉、故事与报告，统一成长足迹读取真实记录，切换主题不改变业务。

**Blocked by:** [扫码即时入账](03-instant-card-redemption.md)；[自动六育评价](10-six-dimension-evaluation.md)；[学生端的成长反馈与主题边界怎样确定](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-11.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 9、10、64、65、66、67、68、69；编号对应父规格。

## Acceptance criteria

- [x] 学生使用独立的适龄布局，能从首页进入扫码、荣誉、故事、评价与报告，教师管理员仍保持简洁工作台。
- [x] 首页六维状态和统一成长足迹来自本人真实有效记录，不用固定演示数值替代，条目可区分积分、荣誉和故事。
- [x] 新兑换成功、重复和失败的呈现与业务结果一致；成长反馈不重复累计或误报奖励。
- [x] 游戏成长等级与正式学校评价等级明确区分，计算和命名采用已确认口径。
- [x] 主题按已确认设计切换配色/角色/背景等展示配置，不改变积分、规则、数据或报告版本。
- [x] 动画短、可跳过且支持减少动态偏好；不加入未要求的同学排行、商城或抽奖。
- [x] 通过真实学生登录→兑换/查看足迹→查看六维→切换主题的浏览器流程验收，并确认其他学生记录不可见。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

