---
id: DEV-RENOVATION-09
title: 体测与健康导入
status: open
labels: ["ready-for-agent"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: ["DEV-RENOVATION-07","WF-RENOVATION-08"]
conditional_blocked_by: []
conditional_state: none
user_stories: [39,42,75]
---

# 09 — 体测与健康导入

**What to build:** 指定人员按学校样例导入体测/健康数据，预览单位、测量日期、异常及免测/缺测状态，授权人员可核对。

**Blocked by:** [年级指标与教师评价](07-grade-indicators.md)；[报告采用哪些指标等级和A4版式](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-08.md)。

**Status:** ready-for-agent

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 39、42、75；编号对应父规格。

**范围：** 按样例和报告范围决定是否纳入首批。

## Acceptance criteria

- [ ] 学校指定且获授权的人员能根据批准样例上传体测/健康表，预览映射、异常及将写入内容。
- [ ] 测量日期、单位、视力记法、原值、缺测和免测按已确认字典保存；不对异常值进行未授权推断。
- [ ] 稳定身份匹配和异常处理保持可核实，正式入库有批次、责任人、来源及有效版本。
- [ ] 读取与导入执行健康专用权限；管理员只得到准备状态，不能借预览、详情、附件或审计获取个人健康值。
- [ ] 不把身高、体重、视力自动转换为奖惩积分，不默认把健康值发送到寄语生成服务。
- [ ] 样例或范围未确认时保持明确前置，不宣称兼容任意体检表或完成健康验收。
- [ ] 以受权人员上传→核对→确认→授权查询的真实界面验收，并验证其他角色请求被拒绝。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

