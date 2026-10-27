---
id: DEV-RENOVATION-18B
title: 公共设备兑换展示与切人清屏
status: closed
labels: ["completed"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-03","DEV-RENOVATION-18A","WF-RENOVATION-01"]
conditional_blocked_by: []
conditional_state: none
user_stories: [71,72,73]
---

# 18B — 公共设备兑换展示与切人清屏

**What to build:** 公共设备兑换交互界面，短时显示兑换结果，完成、退出或超时自动清除会话并清屏，供下一位学生使用。

**Blocked by:** [扫码即时入账](03-instant-card-redemption.md)；[公共设备身份与受限会话](18A-device-session.md)；[一期扫码设备与学生身份怎样确定](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-01.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 71、72、73。

## Acceptance criteria

- [x] 兑换结果短时停留（如3-5秒）展示成功动画与获得维度，不泄露过往账本详情。
- [x] 兑换完毕或超时无操作自动退出登录并清屏，下一名学生无法读取或冒用前一会话。
- [x] 支持快速手动退出，支持断网重试友好提示。
