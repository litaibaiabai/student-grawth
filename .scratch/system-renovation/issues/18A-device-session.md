---
id: DEV-RENOVATION-18A
title: 公共设备身份与受限会话
status: open
labels: ["ready-for-agent"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-01","WF-RENOVATION-01"]
conditional_blocked_by: []
conditional_state: none
user_stories: [71,72,73]
---

# 18A — 公共设备身份与受限会话

**What to build:** 受控公共扫码设备识别学生身份并签发短效、仅限兑换权限的受限会话（C10 issueDeviceSession）。

**Blocked by:** [任教授权与受限成绩](01-teaching-scope.md)；[一期扫码设备与学生身份怎样确定](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-01.md)。

**Status:** ready-for-agent

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 71、72、73。

**范围：** P2候选，若一期必需则提前阻塞扫码即时入账（03）。

## Acceptance criteria

- [ ] 提供 `issueDeviceSession({deviceCredential, studentCredential}) -> RestrictedSession`。
- [ ] 该会话限定于兑换能力，且生命周期极短，禁止用于查询成绩、健康、报告或修改个人资料。
- [ ] 设备必须绑定指定学校，非法凭证与过期凭证即时失效。
