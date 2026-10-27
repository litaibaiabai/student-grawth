---
id: DEV-RENOVATION-20A
title: 兼容迁移与隔离验收入口
status: open
labels: ["ready-for-agent"]
parent: SPEC-20261027-RENOVATION
assignee:
blocked_by: []
conditional_blocked_by: []
conditional_state: none
user_stories: [76,77,78]
---

# 20A — 兼容迁移与隔离验收入口

**What to build:** 建立可重入、校验和校验的迁移注册表，以及受控前缀隔离数据库场景验收入口（`--scenario Rxx`），保护现有数据库不被演示或测试污染。

**Blocked by:** 无开发票前置，无业务决策前置。

**Status:** ready-for-agent

**Parent:** [六育学生评价系统减负与成长报告改造规格](../../../docs/wayfinder/system-renovation/spec.md)。

**用户故事：** 76、77、78（基础设施支撑与隔离保障）。

## Acceptance criteria

- [ ] 提供统一迁移登记机制 `applyRegisteredMigrations`，各阶段票仅追加独立步骤，具备校验和与重复执行幂等性。
- [ ] 扩展演示与验收入口 `runRenovationScenario`，支持 `--scenario Rxx` 单独运行，严格限定在受控前缀隔离库（如 `test_renovation_*`）。
- [ ] 运行器显式检查并拒绝在默认业务库/生产库上执行破坏性测试与重置脚本，检测到非隔离库立即终止并报错。
- [ ] 兼容既有演示环境初始化，不破坏原有全量建表和演示流程。
- [ ] 通过新增环境防护用例 `scripts/full-system-demo/environment.test.cjs` 与场景用例 `R20A.cjs`。

## Verification boundary

采用独立测试库与受控隔离环境，断言数据库隔离检查 `checks.businessDatabaseRejected === true`、迁移重入保持账本一致 `checks.migrationReplayPreservesLedger === true`、基线报告不受影响 `checks.baselineReportUnchanged === true`。
