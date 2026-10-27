# 六育系统逐任务技术执行附录 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将20个管理工作包落实为边界明确、可独立验证的实施节点。
**Architecture:** 使用[主计划](2026-10-27-system-renovation-project-plan.md)的C0—C10合同及同一学生学期事务/版本，不新增各自不一致的数据通路。
**Tech Stack:** 现有React/Express/MySQL及真实浏览器运行器。
**Spec:** [系统规格](../../wayfinder/system-renovation/spec.md)；[审核报告](../../../.scratch/system-renovation/audit-2026-10-27.md)。

## Global Constraints

- 日常卡只D/Z，每卡成功+1；六维体系仍完整。权限、来源证据、报告快照及测试边界均继承主计划，不因任务独立执行而省略。
- 主计划C0—C10是精确接口合同；本附录Consumes/Produces不得自行换名或改变字段语义。
- 下列Create是**拟新增文件**，不是已存在代码；Modify是当前存在文件。各票迁移加入统一注册表，不直接在业务环境运行全量建表当升级。
- 研发先以批准的TEST_ONLY_V2隔离夹具验证工程行为；正式权重、配额、身份、必填和纸样只能来自G0—G3。示例不是学校默认。
- `--scenario Rxx`是20A要新增的运行器能力，当前命令尚不可用于宣称新功能通过。每个Rxx在本票单独场景文件中导出步骤/断言并由C0加载。
- API集成测试由本次场景运行器以新建隔离库环境启动，禁止直接裸跑会回落到当前配置库的旧测试。只有并发、越权、发布事务使用此补充入口。
- 所有源码修改及提交均属于后续实施，本轮仅写计划；业务前置未满足的任务保持等待。

## Review Focus

R01覆盖撤权旧Token；R03/R04覆盖竞争与回放；R08/R17覆盖预览后变更；R11/R12/R14覆盖确认/迟到结果；R02/R03/R20A/R20B覆盖期限/旧卡/中断迁移。每项断言从用户界面、公开API或只读持久化对账获得，不检查内部SQL文本。

## 共同提交与集成规则

每任务只提交本任务文件及其迁移登记/场景注册差异。共享入口的合并由TL顺序审查；完整回归也必须在隔离库。前端任务通过后补跑`npm run build --prefix frontend`，新迁移同时在空库及旧结构隔离副本演练。失败不得通过跳过场景或改预期掩盖。

### Task 20A: 兼容迁移与隔离验收入口

**管理工作包：** [试点切换与历史对账](../../../.scratch/system-renovation/issues/20-pilot-transition.md)；这是审核建议的阶段节点，不是已发布的新票。
**Files — Create:** `backend/services/migrationRunner.js`、`backend/migrations/renovation/index.js`、`scripts/full-system-demo/scenarios/R20A.cjs`。
**Files — Modify:** `scripts/full-system-demo/environment.test.cjs`、`backend/scripts/runMigrations.js`、`scripts/full-system-demo/run.cjs`、`scripts/full-system-demo/initialize.cjs`。
**Test:** `scripts/full-system-demo/scenarios/R20A.cjs`；`scripts/full-system-demo/environment.test.cjs`。
**Interfaces — Consumes:** 旧库基线、现有自动演示manifest；不读取或写入业务结果作为演示操作。
**Interfaces — Produces:** C0 runRenovationScenario及applyRegisteredMigrations；带校验和/可重入步骤的登记；只在本次受控前缀库运行场景。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R20A，先走真实界面，再对外部结果断言：`assert.equal(checks.businessDatabaseRejected,true); assert.equal(checks.migrationReplayPreservesLedger,true); assert.equal(checks.baselineReportUnchanged,true)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 先运行`node --test scripts/full-system-demo/environment.test.cjs`验证新增环境防护负例为FAIL；不允许靠不存在的命令当业务失败。
- [ ] **Step 3 — 最小实现。** 先建立迁移登记和隔离场景筛选，用最小兼容演练验证检查点，不提前创建各票业务表；流程版本字段由制卡迁移拥有。 此节点只做兼容扩展及既有验收入口防护，不提前实现全部功能。为所有后续写入准备同一登记方式；G0未定时只在隔离环境演练。 场景夹具只准备身份、学期、测试策略及明确声明的历史样本，不预造本次新奖励或新审批结果。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R20A --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。同时重跑既有工具防护测试。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/migrationRunner.js backend/migrations/renovation/index.js scripts/full-system-demo/scenarios/R20A.cjs scripts/full-system-demo/environment.test.cjs backend/scripts/runMigrations.js scripts/full-system-demo/run.cjs scripts/full-system-demo/initialize.cjs`及`git commit -m "feat(renovation): r20a 兼容迁移与隔离验收入口"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 01: 任教授权与受限成绩

**管理工作包：** [任教授权与受限成绩](../../../.scratch/system-renovation/issues/01-teaching-scope.md)；沿用原票编号。
**Files — Create:** `backend/services/authorizationService.js`、`backend/services/studentTermStateService.js`、`backend/controllers/teachingAssignmentController.js`、`backend/migrations/renovation/01_authorization.js`、`frontend/src/app/admin/teachingAssignments.jsx`、`scripts/full-system-demo/scenarios/R01.cjs`、`backend/__tests__/renovation_auth.integration.test.js`。
**Files — Modify:** `backend/middleware/auth.js`、`backend/middleware/studentScope.js`、`backend/routes/api.js`、`backend/controllers/importController.js`、`frontend/src/App.jsx`、`frontend/src/constant/urls.js`、`frontend/src/constant/menu.jsx`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R01.cjs`；`backend/__tests__/renovation_auth.integration.test.js`。
**Interfaces — Consumes:** 20A迁移/验收入口；G0职责与成绩访问政策。
**Interfaces — Produces:** C1 resolveActorContext/assertScope；C2 withStudentTermMutation/withStudentTermsMutation；新增职责界面与受限成绩适配。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R01，先走真实界面，再对外部结果断言：`assert.equal(checks.crossSubjectStatus,403); assert.equal(checks.sameTokenAfterRevocationStatus,403); assert.equal(checks.permissionDependencyFailureStatus,503)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R01 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 以当前数据库账号和学期职责构造上下文，JWT仅证明登录身份；敏感依赖失败拒绝访问。为来源变更实现唯一学期状态事务入口，并先让现有成绩提交接入。 授权前后变更与同Token测试是本票完成条件，不靠要求所有老师重登录掩盖旧权限问题。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R01 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/authorizationService.js backend/services/studentTermStateService.js backend/controllers/teachingAssignmentController.js backend/migrations/renovation/01_authorization.js frontend/src/app/admin/teachingAssignments.jsx scripts/full-system-demo/scenarios/R01.cjs backend/__tests__/renovation_auth.integration.test.js backend/middleware/auth.js backend/middleware/studentScope.js backend/routes/api.js backend/controllers/importController.js frontend/src/App.jsx frontend/src/constant/urls.js frontend/src/constant/menu.jsx backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r01 任教授权与受限成绩"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 02: 预分类制卡与打印

**管理工作包：** [预分类制卡与打印](../../../.scratch/system-renovation/issues/02-classified-card-printing.md)；沿用原票编号。
**Files — Create:** `backend/services/rewardCategoryService.js`、`backend/migrations/renovation/02_classified_cards.js`、`scripts/full-system-demo/scenarios/R02.cjs`。
**Files — Modify:** `backend/controllers/categoryController.js`、`backend/controllers/cardPolicyController.js`、`backend/services/cardAllocationService.js`、`backend/services/cardPrintService.js`、`frontend/src/app/admin/cards.jsx`、`frontend/src/app/admin/categories.jsx`、`backend/routes/api.js`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R02.cjs`（真实UI及只读对账）。
**Interfaces — Consumes:** 20A；G0学校奖励树/子类份额及未用旧卡政策。
**Interfaces — Produces:** 分类冻结的AUTO_V2卡及受控打印；rewardCategoryService.resolvePath({schoolId,categoryId,version},connection) -> CategoryPath。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R02，先走真实界面，再对外部结果断言：`assert.equal(checks.generatedCards,10); assert.equal(checks.dCards,6); assert.equal(checks.zCards,4); assert.equal(checks.reprintAddsCards,0)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R02 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 学校奖励树与全局只读模板分开，版本化叶子份额；复用整数分配/生成锁，生成时冻结完整路径及流程版本，打印同卡不重发。 10张、D6/Z4仅是隔离夹具TEST_ONLY_V2，不是学校默认配额。报告指标字典由年级指标票拥有。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R02 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/rewardCategoryService.js backend/migrations/renovation/02_classified_cards.js scripts/full-system-demo/scenarios/R02.cjs backend/controllers/categoryController.js backend/controllers/cardPolicyController.js backend/services/cardAllocationService.js backend/services/cardPrintService.js frontend/src/app/admin/cards.jsx frontend/src/app/admin/categories.jsx backend/routes/api.js frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r02 预分类制卡与打印"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 04: 教师纠错与直评

**管理工作包：** [教师纠错与直评](../../../.scratch/system-renovation/issues/04-teacher-score-corrections.md)；沿用原票编号。
**Files — Create:** `backend/services/scoreLedgerService.js`、`backend/migrations/renovation/04_reward_ledger.js`、`frontend/src/app/teacher/scoreLedger.jsx`、`scripts/full-system-demo/scenarios/R04.cjs`、`backend/__tests__/renovation_rewards.integration.test.js`。
**Files — Modify:** `backend/controllers/scoreController.js`、`backend/routes/api.js`、`frontend/src/app/teacher/directScore.jsx`、`frontend/src/app/admin/audits.jsx`、`frontend/src/App.jsx`、`frontend/src/constant/menu.jsx`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R04.cjs`；`backend/__tests__/renovation_rewards.integration.test.js`。
**Interfaces — Consumes:** C1/C2；已确认纠错/直评范围；旧正向流水映射。
**Interfaces — Produces:** C3 appendReward/correctReward，同连接接入C2；score_event根、追加流水和请求载荷幂等。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R04，先走真实界面，再对外部结果断言：`assert.equal(checks.correctedNetPoints,'2.00'); assert.equal(checks.repeatCorrectionAddsEntries,0); assert.equal(checks.cardReusableAfterCorrection,false)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R04 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 先扩精确分值/来源/分类可空条件及奖励根，再迁移历史根映射；锁当前有效根后冲销/替代。直评复用稳定批次键，不再拼接时间随机数。 测试允许+1改+2由TEST_ONLY_V2授权，不授予生产任意改分。该合同完成后扫码/荣誉才消费，避免各自实现一套账本。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R04 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/scoreLedgerService.js backend/migrations/renovation/04_reward_ledger.js frontend/src/app/teacher/scoreLedger.jsx scripts/full-system-demo/scenarios/R04.cjs backend/__tests__/renovation_rewards.integration.test.js backend/controllers/scoreController.js backend/routes/api.js frontend/src/app/teacher/directScore.jsx frontend/src/app/admin/audits.jsx frontend/src/App.jsx frontend/src/constant/menu.jsx frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r04 教师纠错与直评"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 03: 扫码即时入账

**管理工作包：** [扫码即时入账](../../../.scratch/system-renovation/issues/03-instant-card-redemption.md)；沿用原票编号。
**Files — Create:** `backend/services/cardRedemptionService.js`、`backend/migrations/renovation/03_instant_redemption.js`、`scripts/full-system-demo/scenarios/R03.cjs`。
**Files — Modify:** `backend/__tests__/renovation_rewards.integration.test.js`、`backend/controllers/cardController.js`、`backend/services/scheduler.js`、`backend/routes/api.js`、`frontend/src/app/student/claim.jsx`、`frontend/src/util/cardClaimSession.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R03.cjs`；`backend/__tests__/renovation_rewards.integration.test.js`。
**Interfaces — Consumes:** 预分类卡、C1/C2/C3；个人身份方案，公共设备必需时另消费18A会话。
**Interfaces — Produces:** redeemCard({actor,token,requestKey,payloadHash}) -> RewardReceipt+CardRedemption；旧领取地址的兼容分流。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R03，先走真实界面，再对外部结果断言：`assert.equal(checks.originalRewardsForCard,1); assert.equal(checks.netOriginalPoints,'1.00'); assert.equal(checks.teacherPendingAdded,0); assert.equal(checks.replayShowsNewRewardAnimation,false)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R03 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 按student_term_state→卡→奖励根顺序完成一次兑换，学生为发起者、卡教师为奖励责任人，审计体现实际身份且不伪造reviewer；期限/旧PENDING由流程版本分支处理。 增加同卡100请求竞争、提交后响应丢失重试、更正后重复扫及月底边界；新扫码不需要旧人工审核分支。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R03 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/cardRedemptionService.js backend/migrations/renovation/03_instant_redemption.js scripts/full-system-demo/scenarios/R03.cjs backend/__tests__/renovation_rewards.integration.test.js backend/controllers/cardController.js backend/services/scheduler.js backend/routes/api.js frontend/src/app/student/claim.jsx frontend/src/util/cardClaimSession.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r03 扫码即时入账"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 05: 荣誉认定与奖励

**管理工作包：** [荣誉认定与奖励](../../../.scratch/system-renovation/issues/05-honor-awards.md)；沿用原票编号。
**Files — Create:** `backend/services/honorAwardService.js`、`backend/migrations/renovation/05_honor_awards.js`、`scripts/full-system-demo/scenarios/R05.cjs`。
**Files — Modify:** `backend/__tests__/renovation_rewards.integration.test.js`、`backend/controllers/honorController.js`、`frontend/src/app/student/honors.jsx`、`frontend/src/app/teacher/honors.jsx`、`frontend/src/app/admin/rules.jsx`、`backend/routes/api.js`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R05.cjs`；`backend/__tests__/renovation_rewards.integration.test.js`。
**Interfaces — Consumes:** C1/C2/C3；G1荣誉归属/赛事届次/计分/封顶规则。
**Interfaces — Produces:** approveHonor({actor,honorId,expectedRevision,dimension,ruleVersion,requestKey}) -> HonorRevision+RewardReceipt。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R05，先走真实界面，再对外部结果断言：`assert.equal(checks.approvedHonorPoints,'4.00'); assert.equal(checks.replayedHonorRewards,1); assert.equal(checks.revokedHonorNetPoints,'0.00')`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R05 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 保留旧生成列，新增认定分/规则版/来源；T/M/L荣誉允许无日常奖励叶子。认定与记账同C2事务，材料重提和认定更正留历史。 测试规则4.00只属于TEST_ONLY_V2，用于证明未硬编码旧市一等奖6分。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R05 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/honorAwardService.js backend/migrations/renovation/05_honor_awards.js scripts/full-system-demo/scenarios/R05.cjs backend/__tests__/renovation_rewards.integration.test.js backend/controllers/honorController.js frontend/src/app/student/honors.jsx frontend/src/app/teacher/honors.jsx frontend/src/app/admin/rules.jsx backend/routes/api.js frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r05 荣誉认定与奖励"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 06: 故事建议与终审

**管理工作包：** [故事建议与终审](../../../.scratch/system-renovation/issues/06-story-review.md)；沿用原票编号。
**Files — Create:** `backend/services/storyReviewService.js`、`backend/migrations/renovation/06_story_versions.js`、`scripts/full-system-demo/scenarios/R06.cjs`。
**Files — Modify:** `backend/controllers/storyController.js`、`frontend/src/app/student/stories.jsx`、`frontend/src/app/teacher/stories.jsx`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R06.cjs`（真实UI及只读对账）。
**Interfaces — Consumes:** C1/C2；G1月份/建议规则/退回与终审政策。
**Interfaces — Produces:** reviewStory({actor,storyId,expectedRevision,finalScore,comment}) -> StoryRevision；列出有效月作品的数据合同。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R06，先走真实界面，再对外部结果断言：`assert.equal(checks.suggestionKind,'RULE'); assert.equal(checks.finalScore,'88.00'); assert.equal(checks.reviewedTextOverwritten,false)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R06 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 建议与正式评价分开；正式提交/终审写入有效版本并推进学期sourceRevision，保留草稿及批准的退回路径。G聚合留给自动六育。 88.00是教师测试输入；篇幅只能作为规则特征，不证明真实性。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R06 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/storyReviewService.js backend/migrations/renovation/06_story_versions.js scripts/full-system-demo/scenarios/R06.cjs backend/controllers/storyController.js frontend/src/app/student/stories.jsx frontend/src/app/teacher/stories.jsx backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r06 故事建议与终审"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 07: 年级指标与教师评价

**管理工作包：** [年级指标与教师评价](../../../.scratch/system-renovation/issues/07-grade-indicators.md)；沿用原票编号。
**Files — Create:** `backend/services/reportIndicatorService.js`、`backend/controllers/reportIndicatorController.js`、`backend/migrations/renovation/07_report_indicators.js`、`frontend/src/app/admin/reportIndicators.jsx`、`frontend/src/app/teacher/indicatorEvaluation.jsx`、`scripts/full-system-demo/scenarios/R07.cjs`。
**Files — Modify:** `backend/routes/api.js`、`frontend/src/App.jsx`、`frontend/src/constant/menu.jsx`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R07.cjs`（真实UI及只读对账）。
**Interfaces — Consumes:** C1/C2；G1年级课程、值类型、必评和数据状态；不等待最终纸样。
**Interfaces — Produces:** C4 IndicatorValue；saveIndicatorValues({actor,studentKey,expectedRevision,values}) -> ValueRevisions。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R07，先走真实界面，再对外部结果断言：`assert.equal(checks.rawStars,'★★★'); assert.equal(checks.gradeRawNumericValue,null); assert.equal(checks.recordedZeroIsMissing,false); assert.equal(checks.nonApplicableBlocks,false)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R07 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 字典和结果按学校/版本/年级范围持久化，记录原值/单位/来源与有效版本；写入走C2，配置权限不开放个人结果读取。 明确RECORDED/MISSING/EXEMPT/NOT_APPLICABLE等批准状态，不把全部74项设为全员必填。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R07 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/reportIndicatorService.js backend/controllers/reportIndicatorController.js backend/migrations/renovation/07_report_indicators.js frontend/src/app/admin/reportIndicators.jsx frontend/src/app/teacher/indicatorEvaluation.jsx scripts/full-system-demo/scenarios/R07.cjs backend/routes/api.js frontend/src/App.jsx frontend/src/constant/menu.jsx frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r07 年级指标与教师评价"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 08: 学科成绩导入

**管理工作包：** [学科成绩导入](../../../.scratch/system-renovation/issues/08-subject-score-import.md)；沿用原票编号。
**Files — Create:** `backend/services/subjectImportService.js`、`backend/migrations/renovation/08_subject_imports.js`、`scripts/full-system-demo/scenarios/R08.cjs`、`backend/__tests__/renovation_import_auth.integration.test.js`。
**Files — Modify:** `backend/controllers/importController.js`、`backend/services/batchImportService.js`、`frontend/src/app/admin/import.jsx`、`frontend/src/util/excelScoreParser.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R08.cjs`；`backend/__tests__/renovation_import_auth.integration.test.js`。
**Interfaces — Consumes:** C1/C2/C4，G1样例/导入原子策略；服务器预览批次。
**Interfaces — Produces:** previewSubjectImport({actor,termId,subjectCode,mapping,rows}) -> PreviewBatch；commitSubjectImport({actor,batchId,expectedRevision,requestKey}) -> ImportResult。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R08，先走真实界面，再对外部结果断言：`assert.equal(checks.forgedSubjectStatus,403); assert.equal(checks.stalePreviewStatus,409); assert.equal(checks.effectiveVersionCount,1); assert.equal(checks.zeroLost,false)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R08 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 服务器保留标准输入/摘要，提交不接受客户端有效成绩作为权威；再次校验权限及当前版本，按批准的整批或有效行策略原子提交并推进来源版本。 不要通过“每行COMMIT”隐式选择部分成功；旧单项/批量入口统一适配。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R08 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/subjectImportService.js backend/migrations/renovation/08_subject_imports.js scripts/full-system-demo/scenarios/R08.cjs backend/__tests__/renovation_import_auth.integration.test.js backend/controllers/importController.js backend/services/batchImportService.js frontend/src/app/admin/import.jsx frontend/src/util/excelScoreParser.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r08 学科成绩导入"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 09: 体测与健康导入

**管理工作包：** [体测与健康导入](../../../.scratch/system-renovation/issues/09-health-import.md)；沿用原票编号。
**Files — Create:** `backend/services/healthImportService.js`、`backend/controllers/healthController.js`、`backend/migrations/renovation/09_health_values.js`、`frontend/src/app/teacher/healthImport.jsx`、`scripts/full-system-demo/scenarios/R09.cjs`、`backend/__tests__/renovation_health_auth.integration.test.js`。
**Files — Modify:** `backend/routes/api.js`、`frontend/src/App.jsx`、`frontend/src/constant/menu.jsx`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R09.cjs`；`backend/__tests__/renovation_health_auth.integration.test.js`。
**Interfaces — Consumes:** C1/C2/C4；G1健康专用授权/单位/样例，按范围启用。
**Interfaces — Produces:** previewHealthImport/commitHealthImport使用服务器批次；只读授权HealthValues。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R09，先走真实界面，再对外部结果断言：`assert.equal(checks.heightUnit,'cm'); assert.equal(checks.managerCanReadHealth,false); assert.equal(checks.healthConvertedToReward,false)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R09 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 适配受控样例，保留测量时间、原值、单位、缺测/免测与有效版本；数据仅进入获准报告区域。 体测若是必评来源则先于自动六育；仅展示来源时可后置到相应报告验收。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R09 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/healthImportService.js backend/controllers/healthController.js backend/migrations/renovation/09_health_values.js frontend/src/app/teacher/healthImport.jsx scripts/full-system-demo/scenarios/R09.cjs backend/__tests__/renovation_health_auth.integration.test.js backend/routes/api.js frontend/src/App.jsx frontend/src/constant/menu.jsx frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r09 体测与健康导入"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 10: 自动六育评价

**管理工作包：** [自动六育评价](../../../.scratch/system-renovation/issues/10-six-dimension-evaluation.md)；沿用原票编号。
**Files — Create:** `backend/services/evaluationSnapshotService.js`、`backend/migrations/renovation/10_evaluation_versions.js`、`scripts/full-system-demo/scenarios/R10.cjs`。
**Files — Modify:** `backend/services/evaluationEngine.js`、`backend/controllers/evaluationController.js`、`frontend/src/app/admin/rules.jsx`、`frontend/src/app/student/evaluation.jsx`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R10.cjs`（真实UI及只读对账）。
**Interfaces — Consumes:** C2/C3/C4，G1批准规则；荣誉、正式故事和适用指标，按规则补导入/体测。
**Interfaces — Produces:** C5 buildEvaluationSnapshot，指定连接及版本，不在内部另开pool。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R10，先走真实界面，再对外部结果断言：`assert.equal(checks.testPolicyStoryAggregate,'85.00'); assert.equal(checks.honorCountedTimes,1); assert.equal(checks.noHonorAutomaticallyMissing,false); assert.equal(checks.unconfiguredGrade,null)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R10 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 按有效来源/版本生成六维、状态与证据；新规则无隐式80/15/5回退，旧结果按LEGACY策略读取，计算只输出派生结果。 测试G按TEST_ONLY_V2的80/90均值为85，仅用于验证版本与聚合，不代表学校口径。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R10 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/evaluationSnapshotService.js backend/migrations/renovation/10_evaluation_versions.js scripts/full-system-demo/scenarios/R10.cjs backend/services/evaluationEngine.js backend/controllers/evaluationController.js frontend/src/app/admin/rules.jsx frontend/src/app/student/evaluation.jsx backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r10 自动六育评价"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 11: 报告草稿与教师确认

**管理工作包：** [报告草稿与教师确认](../../../.scratch/system-renovation/issues/11-report-draft-confirmation.md)；沿用原票编号。
**Files — Create:** `backend/services/reportDraftService.js`、`backend/controllers/reportDraftController.js`、`backend/migrations/renovation/11_report_drafts.js`、`frontend/src/app/teacher/reportDrafts.jsx`、`scripts/full-system-demo/scenarios/R11.cjs`、`backend/__tests__/renovation_reports.integration.test.js`。
**Files — Modify:** `backend/routes/api.js`、`frontend/src/App.jsx`、`frontend/src/constant/menu.jsx`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R11.cjs`；`backend/__tests__/renovation_reports.integration.test.js`。
**Interfaces — Consumes:** C1/C2/C5；G2最小内容与门槛。
**Interfaces — Produces:** C6 buildDraft/confirmDraft；包含空可选AI/家长扩展位的稳定草稿及approvalFingerprint。

- [x] **Step 1 — 写失败场景。** 在本票场景文件写R11，先走真实界面，再对外部结果断言：`assert.equal(checks.manualCommentConfirmed,true); assert.equal(checks.sourceChangeInvalidatesApproval,true); assert.equal(checks.confirmStaleFingerprintStatus,409)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [x] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R11 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [x] **Step 3 — 最小实现。** 以同版本来源构建并保存草稿快照，唯一寄语保存修订；确认指纹覆盖来源/资料、规则、指标、模板、寄语及纳入的反馈版本。 不依赖AI/家长实现来证明人工确认路径；后续模块不得改变指纹字段含义。
- [x] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R11 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [x] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/reportDraftService.js backend/controllers/reportDraftController.js backend/migrations/renovation/11_report_drafts.js frontend/src/app/teacher/reportDrafts.jsx scripts/full-system-demo/scenarios/R11.cjs backend/__tests__/renovation_reports.integration.test.js backend/routes/api.js frontend/src/App.jsx frontend/src/constant/menu.jsx frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r11 报告草稿与教师确认"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 12: AI寄语

**管理工作包：** [AI寄语](../../../.scratch/system-renovation/issues/12-ai-comments.md)；沿用原票编号。
**Files — Create:** `backend/services/commentGenerationService.js`、`backend/services/commentProvider.js`、`backend/migrations/renovation/12_comment_jobs.js`、`scripts/full-system-demo/scenarios/R12.cjs`。
**Files — Modify:** `backend/__tests__/renovation_reports.integration.test.js`、`backend/controllers/reportDraftController.js`、`frontend/src/app/teacher/reportDrafts.jsx`、`backend/routes/api.js`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R12.cjs`；`backend/__tests__/renovation_reports.integration.test.js`。
**Interfaces — Consumes:** C1/C6/C7；学校批准模型/数据授权、供应条件和预算配置。
**Interfaces — Produces:** requestComment({actor,draftId,expectedFingerprint}) -> Job；applyCommentResult({jobId,expectedFingerprint,result}) -> SuggestionRevision。

- [x] **Step 1 — 写失败场景。** 在本票场景文件写R12，先走真实界面，再对外部结果断言：`assert.equal(checks.acceptedGenerationSource,'MODEL'); assert.equal(checks.lateResponseOverwritesTeacher,false); assert.equal(checks.failureLosesDraft,false)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [x] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R12 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [x] **Step 3 — 最小实现。** 持久异步任务、证据筛选和脱敏；网络调用在锁外，重试有界，结果CAS匹配旧指纹后仅写建议。人工稿及审批不被覆盖。 真实模型尚不可用时R12必须记录未完成/失败，不能靠Mock通过AI验收；模拟失败只证明兜底行为。
- [x] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R12 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [x] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/commentGenerationService.js backend/services/commentProvider.js backend/migrations/renovation/12_comment_jobs.js scripts/full-system-demo/scenarios/R12.cjs backend/__tests__/renovation_reports.integration.test.js backend/controllers/reportDraftController.js frontend/src/app/teacher/reportDrafts.jsx backend/routes/api.js frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r12 AI寄语"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 13: 家长寄语

**管理工作包：** [家长寄语](../../../.scratch/system-renovation/issues/13-family-comments.md)；沿用原票编号。
**Files — Create:** `backend/services/familyFeedbackService.js`、`backend/controllers/familyFeedbackController.js`、`backend/migrations/renovation/13_family_feedback.js`、`frontend/src/app/family/feedback.jsx`、`scripts/full-system-demo/scenarios/R13.cjs`。
**Files — Modify:** `backend/__tests__/renovation_reports.integration.test.js`、`backend/routes/api.js`、`frontend/src/App.jsx`、`frontend/src/app/teacher/reportDrafts.jsx`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R13.cjs`；`backend/__tests__/renovation_reports.integration.test.js`。
**Interfaces — Consumes:** C1/C2/C6；G2家长身份、是否必填、来源与可见范围。
**Interfaces — Produces:** C7 submitFamilyFeedback；草稿征集及发布后独立FeedbackRevision。

- [x] **Step 1 — 写失败场景。** 在本票场景文件写R13，先走真实界面，再对外部结果断言：`assert.equal(checks.wrongStudentFeedbackStatus,403); assert.equal(checks.revokedCredentialRejected,true); assert.equal(checks.postPublishChangesOldBody,false)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [x] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R13 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [x] **Step 3 — 最小实现。** 凭证只存哈希、限定学生/学期/动作；记录真实来源及修订，不默认赋予整份报告读取权，纳入新草稿时推进C2。 发布前征集必须可从草稿操作，不反过来依赖报告先发布，避免必填模式的功能互等。
- [x] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R13 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [x] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/familyFeedbackService.js backend/controllers/familyFeedbackController.js backend/migrations/renovation/13_family_feedback.js frontend/src/app/family/feedback.jsx scripts/full-system-demo/scenarios/R13.cjs backend/__tests__/renovation_reports.integration.test.js backend/routes/api.js frontend/src/App.jsx frontend/src/app/teacher/reportDrafts.jsx frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r13 家长寄语"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 14: 状态发布与版本冻结

**管理工作包：** [状态发布与版本冻结](../../../.scratch/system-renovation/issues/14-report-publishing.md)；沿用原票编号。
**Files — Create:** `backend/services/reportPublishService.js`、`backend/migrations/renovation/14_report_publish_jobs.js`、`scripts/full-system-demo/scenarios/R14.cjs`。
**Files — Modify:** `backend/__tests__/renovation_reports.integration.test.js`、`backend/controllers/reportController.js`、`backend/routes/api.js`、`frontend/src/app/admin/reports.jsx`、`frontend/src/app/admin/audits.jsx`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R14.cjs`；`backend/__tests__/renovation_reports.integration.test.js`。
**Interfaces — Consumes:** C1/C2/C6；家长必填时消费C7已完成反馈。
**Interfaces — Produces:** C8 publishOne及持久批量作业；readiness白名单；当前发布版指针。

- [x] **Step 1 — 写失败场景。** 在本票场景文件写R14，先走真实界面，再对外部结果断言：`assert.equal(checks.currentPublishedVersionCount,1); assert.equal(checks.failedRepublishKeepsOldReadable,true); assert.equal(checks.managerResponseContainsPersonalContent,false)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [x] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R14 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [x] **Step 3 — 最小实现。** 逐份锁定学期状态、核对指纹、冻结批准草稿；新版和指针/替代状态同事务。服务内部可为发布读取内容，但管理员响应/审计仅返回获准状态。 加入并发发布、确认后源写竞争、单份失败与批次部分成功屏障测试；不能调用另一个pool临时重算。
- [x] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R14 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [x] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/reportPublishService.js backend/migrations/renovation/14_report_publish_jobs.js scripts/full-system-demo/scenarios/R14.cjs backend/__tests__/renovation_reports.integration.test.js backend/controllers/reportController.js backend/routes/api.js frontend/src/app/admin/reports.jsx frontend/src/app/admin/audits.jsx frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r14 状态发布与版本冻结"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 15: 报告阅读与A4打印

**管理工作包：** [报告阅读与A4打印](../../../.scratch/system-renovation/issues/15-report-reading-printing.md)；沿用原票编号。
**Files — Create:** `backend/services/reportRenderService.js`、`frontend/src/app/student/reportPrint.less`、`scripts/full-system-demo/scenarios/R15.cjs`。
**Files — Modify:** `backend/controllers/reportController.js`、`frontend/src/app/student/report.jsx`、`frontend/src/constant/urls.js`。
**Test:** `scripts/full-system-demo/scenarios/R15.cjs`（真实UI及只读对账）。
**Interfaces — Consumes:** C1/C8及G3批准纸样、模板/字体版本。
**Interfaces — Produces:** C9 readPublishedReport/renderReport；旧打印地址的受限兼容别名。

- [x] **Step 1 — 写失败场景。** 在本票场景文件写R15，先走真实界面，再对外部结果断言：`assert.equal(checks.printedNameEqualsSnapshot,true); assert.equal(checks.liveProfileChangesOldPrint,false); assert.equal(checks.printOverflow,false)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [x] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R15 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [x] **Step 3 — 最小实现。** 完全从发布快照渲染电子与A4；固化模板/字体版本并另标打印时间；按允许范围展示当前/替代版。 不得预设双面/两页；按批准样张和最长真实结构夹具核验，截图与PDF正文对账。
- [x] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R15 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [x] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/reportRenderService.js frontend/src/app/student/reportPrint.less scripts/full-system-demo/scenarios/R15.cjs backend/controllers/reportController.js frontend/src/app/student/report.jsx frontend/src/constant/urls.js`及`git commit -m "feat(renovation): r15 报告阅读与A4打印"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 16: 学生成长首页与主题

**管理工作包：** [学生成长首页与主题](../../../.scratch/system-renovation/issues/16-student-growth-theme.md)；沿用原票编号。
**Files — Create:** `backend/controllers/growthController.js`、`frontend/src/component/StudentLayout/index.jsx`、`frontend/src/component/StudentLayout/index.less`、`frontend/src/app/student/growth.jsx`、`scripts/full-system-demo/scenarios/R16.cjs`。
**Files — Modify:** `backend/routes/api.js`、`frontend/src/App.jsx`、`frontend/src/app/dashboard/index.jsx`、`frontend/src/constant/menu.jsx`、`frontend/src/constant/urls.js`。
**Test:** `scripts/full-system-demo/scenarios/R16.cjs`（真实UI及只读对账）。
**Interfaces — Consumes:** C1/C5及扫码结果，G2学生主题、成长等级与主题操作者规则。
**Interfaces — Produces:** getMyGrowth({actor,termId}) -> {evaluation,timeline,theme}; StudentLayout只消费这些DTO。

- [x] **Step 1 — 写失败场景。** 在本票场景文件写R16，先走真实界面，再对外部结果断言：`assert.equal(checks.timelineUsesMyRecords,true); assert.equal(checks.themeChangesLedger,false); assert.equal(checks.gameLevelEqualsOfficialGrade,false)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [x] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R16 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [x] **Step 3 — 最小实现。** 单独学生布局和统一足迹，使用真实核算状态，不重做计分；主题按允许操作者范围配置，不默认给学生全校主题管理权。 无已发布报告时能正确显示未发布，不以尚未完成的最终纸样阻塞成长首页自身验收。
- [x] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R16 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [x] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/controllers/growthController.js frontend/src/component/StudentLayout/index.jsx frontend/src/component/StudentLayout/index.less frontend/src/app/student/growth.jsx scripts/full-system-demo/scenarios/R16.cjs backend/routes/api.js frontend/src/App.jsx frontend/src/app/dashboard/index.jsx frontend/src/constant/menu.jsx frontend/src/constant/urls.js`及`git commit -m "feat(renovation): r16 学生成长首页与主题"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 17: 学籍表导入

**管理工作包：** [学籍表导入](../../../.scratch/system-renovation/issues/17-student-roster-import.md)；沿用原票编号。
**Files — Create:** `backend/services/rosterImportService.js`、`backend/controllers/rosterImportController.js`、`backend/migrations/renovation/17_roster_imports.js`、`frontend/src/app/admin/rosterImport.jsx`、`scripts/full-system-demo/scenarios/R17.cjs`、`backend/__tests__/renovation_roster_auth.integration.test.js`。
**Files — Modify:** `backend/routes/api.js`、`backend/services/studentTermStateService.js`、`frontend/src/App.jsx`、`frontend/src/constant/menu.jsx`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R17.cjs`；`backend/__tests__/renovation_roster_auth.integration.test.js`。
**Interfaces — Consumes:** C1/C2，由任教授权票提供；G0试点账号来源、样例与获准基础字段，不等P1最终切换。
**Interfaces — Produces:** previewRosterImport/commitRosterImport -> 服务器批次/逐项结果，scope=ROSTER_WRITE。

- [x] **Step 1 — 写失败场景。** 在本票场景文件写R17，先走真实界面，再对外部结果断言：`assert.equal(checks.roleOverwritten,false); assert.equal(checks.sameNameWrongIdOverwritten,false); assert.equal(checks.profileRevisionAdvanced,true)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [x] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R17 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [x] **Step 3 — 最小实现。** 稳定学校/学号匹配，显示新增/更新/冲突；禁止导入角色/密码/成绩；资料变更推进相关学期版本，历史事件与旧报告不改。 可在尚无报告模块时以基础字段更新及版本记录独立验收；报告模块具备后补跑相同场景的旧版不变断言，不因此增加循环依赖。
- [x] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R17 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [x] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/rosterImportService.js backend/controllers/rosterImportController.js backend/migrations/renovation/17_roster_imports.js frontend/src/app/admin/rosterImport.jsx scripts/full-system-demo/scenarios/R17.cjs backend/__tests__/renovation_roster_auth.integration.test.js backend/routes/api.js backend/services/studentTermStateService.js frontend/src/App.jsx frontend/src/constant/menu.jsx frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r17 学籍表导入"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 18A: 公共设备身份与短会话

**管理工作包：** [公共扫码设备](../../../.scratch/system-renovation/issues/18-shared-scanner.md)；这是审核建议的阶段节点，不是已发布的新票。
**Files — Create:** `backend/services/deviceSessionService.js`、`backend/controllers/deviceController.js`、`backend/migrations/renovation/18_device_sessions.js`、`frontend/src/app/admin/devices.jsx`、`frontend/src/app/kiosk/identify.jsx`、`scripts/full-system-demo/scenarios/R18A.cjs`。
**Files — Modify:** `backend/__tests__/renovation_auth.integration.test.js`、`backend/services/authorizationService.js`、`backend/routes/api.js`、`frontend/src/App.jsx`、`frontend/src/constant/menu.jsx`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R18A.cjs`；`backend/__tests__/renovation_auth.integration.test.js`。
**Interfaces — Consumes:** C1；G0实际设备、学校绑定与学生身份凭证。
**Interfaces — Produces:** C10 issueDeviceSession，带CARD_REDEEM限定能力；撤销/过期检查。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R18A，先走真实界面，再对外部结果断言：`assert.equal(checks.identifiedStudentMatchesCredential,true); assert.equal(checks.kioskReportAccessStatus,403); assert.equal(checks.expiredSessionRejected,true)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R18A --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 管理员注册受控设备，验证学生凭证后颁发最小能力会话；正常学生角色不自动扩展设备会话权限。 这是公共设备必需场景的前置，不等待真正兑换；测试使用已确认的本机设备/身份方式。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R18A --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/deviceSessionService.js backend/controllers/deviceController.js backend/migrations/renovation/18_device_sessions.js frontend/src/app/admin/devices.jsx frontend/src/app/kiosk/identify.jsx scripts/full-system-demo/scenarios/R18A.cjs backend/__tests__/renovation_auth.integration.test.js backend/services/authorizationService.js backend/routes/api.js frontend/src/App.jsx frontend/src/constant/menu.jsx frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r18a 公共设备身份与短会话"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 18B: 公共设备兑换与清屏

**管理工作包：** [公共扫码设备](../../../.scratch/system-renovation/issues/18-shared-scanner.md)；这是审核建议的阶段节点，不是已发布的新票。
**Files — Create:** `frontend/src/app/kiosk/redeem.jsx`、`scripts/full-system-demo/scenarios/R18B.cjs`。
**Files — Modify:** `backend/__tests__/renovation_auth.integration.test.js`、`backend/services/deviceSessionService.js`、`backend/controllers/deviceController.js`、`frontend/src/App.jsx`、`backend/routes/api.js`、`frontend/src/constant/urls.js`。
**Test:** `scripts/full-system-demo/scenarios/R18B.cjs`；`backend/__tests__/renovation_auth.integration.test.js`。
**Interfaces — Consumes:** C10受限会话、扫码即时入账结果。
**Interfaces — Produces:** 设备身份→兑换→清屏→下一位的完整场景与会话结束状态。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R18B，先走真实界面，再对外部结果断言：`assert.equal(checks.nextStudentUsesPreviousIdentity,false); assert.equal(checks.timeoutClearsSession,true); assert.equal(checks.sharedDeviceDuplicateRewardCount,0)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R18B --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 只通过既有兑换合同入账，完成/退出/超时同时清界面与服务端会话；断网重试仍复用原请求，不变成多领。 真实目标设备需演示学生甲/乙切换；桌面浏览器模拟不足以宣称硬件验收完成。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R18B --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- frontend/src/app/kiosk/redeem.jsx scripts/full-system-demo/scenarios/R18B.cjs backend/__tests__/renovation_auth.integration.test.js backend/services/deviceSessionService.js backend/controllers/deviceController.js frontend/src/App.jsx backend/routes/api.js frontend/src/constant/urls.js`及`git commit -m "feat(renovation): r18b 公共设备兑换与清屏"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 19: 钉钉身份预留

**管理工作包：** [钉钉身份预留](../../../.scratch/system-renovation/issues/19-dingtalk-identity-reservation.md)；沿用原票编号。
**Files — Create:** `backend/services/externalIdentityService.js`、`backend/controllers/externalIdentityController.js`、`backend/migrations/renovation/19_identity_links.js`、`frontend/src/app/admin/identityLinks.jsx`、`scripts/full-system-demo/scenarios/R19.cjs`。
**Files — Modify:** `backend/__tests__/renovation_auth.integration.test.js`、`backend/routes/api.js`、`frontend/src/App.jsx`、`frontend/src/constant/menu.jsx`、`frontend/src/constant/urls.js`、`backend/migrations/renovation/index.js`。
**Test:** `scripts/full-system-demo/scenarios/R19.cjs`；`backend/__tests__/renovation_auth.integration.test.js`。
**Interfaces — Consumes:** C1当前授权，由任教授权票提供；G0预留范围及账号映射政策，不等P1最终切换。
**Interfaces — Produces:** bindExternalIdentity/unbindExternalIdentity/listLinks；学校+provider+tenant+externalSubject唯一映射。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R19，先走真实界面，再对外部结果断言：`assert.equal(checks.mappingCrossSchoolStatus,403); assert.equal(checks.debugCallbackCanIssueLoginToken,false); assert.equal(checks.unlinkAudited,true)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R19 --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 只做受控关联管理与审计，不开放未经真实提供方验证的登录回调，不由客户端选择权限。 真实SSO若被定为一期硬要求，新增明确集成工作及外部验收，不能塞进本预留票的2天名义估算。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R19 --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/externalIdentityService.js backend/controllers/externalIdentityController.js backend/migrations/renovation/19_identity_links.js frontend/src/app/admin/identityLinks.jsx scripts/full-system-demo/scenarios/R19.cjs backend/__tests__/renovation_auth.integration.test.js backend/routes/api.js frontend/src/App.jsx frontend/src/constant/menu.jsx frontend/src/constant/urls.js backend/migrations/renovation/index.js`及`git commit -m "feat(renovation): r19 钉钉身份预留"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 20B: P0试点与回退演练

**管理工作包：** [试点切换与历史对账](../../../.scratch/system-renovation/issues/20-pilot-transition.md)；这是审核建议的阶段节点，不是已发布的新票。
**Files — Create:** `backend/services/rolloutService.js`、`backend/controllers/rolloutController.js`、`frontend/src/app/admin/rollout.jsx`、`scripts/full-system-demo/scenarios/R20B.cjs`。
**Files — Modify:** `backend/routes/api.js`、`backend/services/scheduler.js`、`scripts/full-system-demo/README.md`、`frontend/src/App.jsx`、`frontend/src/constant/menu.jsx`、`frontend/src/constant/urls.js`。
**Test:** `scripts/full-system-demo/scenarios/R20B.cjs`（真实UI及只读对账）。
**Interfaces — Consumes:** 20A、任教/制卡/纠错/扫码；G0/G3旧卡与首批范围，必需设备/账号来源。
**Interfaces — Produces:** 按学校/学期P0启用状态、盘点/对账、回退演练证据。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R20B，先走真实界面，再对外部结果断言：`assert.equal(checks.usedCardsCreditedAgain,0); assert.equal(checks.rollbackDropsNewRewards,false); assert.equal(checks.newFlowPendingClaimsAdded,0)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R20B --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 启用前盘点并按批准策略处理旧未用/PENDING，分别保留LEGACY与AUTO_V2行为；回退关闭新入口而不覆盖新账，旧期限任务识别版本。 P0不等待AI、家长和最终A4；只为已确认设备/账号前置加实际阻塞。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R20B --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- backend/services/rolloutService.js backend/controllers/rolloutController.js frontend/src/app/admin/rollout.jsx scripts/full-system-demo/scenarios/R20B.cjs backend/routes/api.js backend/services/scheduler.js scripts/full-system-demo/README.md frontend/src/App.jsx frontend/src/constant/menu.jsx frontend/src/constant/urls.js`及`git commit -m "feat(renovation): r20b P0试点与回退演练"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。



### Task 20C: P1全链路试点与历史对账

**管理工作包：** [试点切换与历史对账](../../../.scratch/system-renovation/issues/20-pilot-transition.md)；这是审核建议的阶段节点，不是已发布的新票。
**Files — Create:** `scripts/full-system-demo/scenarios/R20C.cjs`。
**Files — Modify:** `backend/services/rolloutService.js`、`frontend/src/app/admin/rollout.jsx`、`scripts/full-system-demo/steps.cjs`、`scripts/full-system-demo/materials.py`、`scripts/full-system-demo/README.md`、`backend/controllers/rolloutController.js`。
**Test:** `scripts/full-system-demo/scenarios/R20C.cjs`（真实UI及只读对账）。
**Interfaces — Consumes:** 20B、学科导入、AI、家长、阅读打印、成长首页；按范围补健康/学籍/设备/身份。
**Interfaces — Produces:** 完整一期放行记录、真实三角色证据、新旧账和报告版本核对及更新手册。

- [ ] **Step 1 — 写失败场景。** 在本票场景文件写R20C，先走真实界面，再对外部结果断言：`assert.equal(checks.legacyReportsChanged,false); assert.equal(checks.missingRequiredFeatureReportedComplete,false); assert.equal(checks.readOnlyReconciliationMatches,true)`；同时覆盖原票验收清单，不能只做这三个摘要断言。
- [ ] **Step 2 — 运行并确认失败。** 运行`node scripts/full-system-demo/run.cjs --scenario R20C --speed 6 --exit`；现有行为应在上述新要求处FAIL，并保存非成功证据。
- [ ] **Step 3 — 最小实现。** 在隔离环境从真实UI完成全部已选功能，只读对账；对实际目标环境/设备/纸样执行对应放行；逐项保留失败或延期，不用固定旧90.50样例替代新规则核算。 容量包、备份恢复和隐私负例通过后再扩范围；本票不替代各开发票自测。
- [ ] **Step 4 — 验证通过。** 运行`node scripts/full-system-demo/run.cjs --scenario R20C --speed 6 --exit`，期望UI步骤、指定API补充、只读对账全部PASS且退出0；记录实际库名、用例、工件与未完成外部项。
- [ ] **Step 5 — 评审并提交。** 复核职责、来源版本和兼容性，执行本票文件范围的`git add -- scripts/full-system-demo/scenarios/R20C.cjs backend/services/rolloutService.js frontend/src/app/admin/rollout.jsx scripts/full-system-demo/steps.cjs scripts/full-system-demo/materials.py scripts/full-system-demo/README.md backend/controllers/rolloutController.js`及`git commit -m "feat(renovation): r20c P1全链路试点与历史对账"`；如尚有未经批准业务选择或失败验收，不进入关闭状态。

## 自审与执行证据要求

- 23个阶段节点均映射回原20票；每个管理工作包只有全部所属节点完成才可关闭。18A/B、20A/B/C应在计划被采纳后再同步为正式子票或显式检查点，不能让追踪器仍按旧DAG误派。
- 20A按兼容扩展例外先行；其余每个节点交付完整的用户行为或已批准的阶段性放行，不单独派发“建表/写API/做UI”横向任务。
- 规则、源数据、反馈或身份方案选择可能激活条件依赖；执行前按主计划和模型重新计算，不删除真实前置来追赶日期。
- 每个任务拥有自己场景的checks字段和数据夹具。场景字段名是验收结果协议，不能在实现时换成内部函数测试而让端到端路径失去验证。
- 真实模型、家长渠道、硬件和原校纸样未就绪时，对应任务记录未验收，不能输出绿色全量通过。



