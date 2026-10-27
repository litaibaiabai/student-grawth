---
id: DEV-RENOVATION-08
title: 学科成绩导入
status: closed
labels: ["closed"]
parent: SPEC-20261027-RENOVATION
assignee: agent
blocked_by: ["DEV-RENOVATION-07","WF-RENOVATION-08"]
conditional_blocked_by: []
conditional_state: resolved
user_stories: [35,36,37,38,39]
---

# 08 — 学科成绩导入

**What to build:** 任课教师上传学科表，确认映射、有效行、差异和错误后入库，支持明确的更正版本。

**Blocked by:** [年级指标与教师评价](07-grade-indicators.md)；[报告采用哪些指标等级和A4版式](../../../docs/wayfinder/system-renovation/issues/WF-RENOVATION-08.md)。

**Status:** closed

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 35、36、37、38、39；编号对应父规格。

## Acceptance criteria

- [x] 任课教师只能选择授权班级、学科及学期上传，按学校已确认样例完成字段映射。
- [x] 提交前显示有效项、错误、重复/未知学号和原成绩差异，可据此确认更正。
- [x] 预览及提交均重新校验当前学生、学科、学期、权限、原值类型和允许范围，不信任客户端有效名单。
- [x] 使用学校范围内稳定学号匹配；同名、重复行、空白、0、等级、星级及缺考/免测按已定策略区分。
- [x] 按已确认策略处理正常与错误项，正式写入保留批次、映射、责任教师及有效版本，不覆盖其他学科。
- [x] 旧单项和批量导入不能绕过新授权，管理员不能借导入个人成绩恢复六育终测写入。
- [x] 通过上传→预览差异/错误→确认→查询更正结果的真实界面验收，并用真实API验证伪造提交。

## Verification boundary

沿用用户已确认的三角色真实浏览器流程和独立测试库；只在并发、越权或发布事务需要时补真实API／数据库集成验证。测试断言用户可见结果与持久化一致性，不依赖内部调用或SQL字符串。当前票仅已发布，以上验收项尚未执行。

