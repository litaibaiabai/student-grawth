# 精确清理清单（2026-10-30）

基线 `34ab766`。本提交只登记候选、迁移有效断言；删除在任务14/15分批执行。清单仅包含已追踪的退役代码，不触碰用户未追踪资料、`.env`、`backend/private`、上传、独立测试输出或任何数据库。

## 当前引用闭包

- 前端：index.html → main.jsx → App.jsx → app/reportCore；共享ErrorBoundary、TermReport、util/storyMonths。index.less/var.less暂保留，任务15迁走后才删。
- 后端：app.js → reportCore routes/features/views → reportCore* services、authorizationService、cardCredentials、reportRenderService/reportPagination、middleware/auth/errorHandler、utils/privateFiles、db。包含动态require的核心服务全部保留。
- 命令：backend start/dev、核心test、runCoreMigrations（默认check）、initReportCore、migrateReportCore（默认audit）；frontend test/lint/build/dev/preview及五个实际core浏览器脚本。
- 核心迁移依赖：sql/05_term_report_core_schema.sql、docs/database/term-report-core-v1.schema.json；旧库迁移回归依赖backend/__tests__/fixtures/legacy_cards_schema.sql。
- 打印运行资产：backend/assets/fonts/NotoSansCJKsc-Regular.otf、OFL.txt、README.md。均明确保留。
- README当前仍有旧菜单/命令/相对链接，任务14改为核心入口；旧交付文档保留并注明历史。旧deploy.sh还指向旧迁移和backend/dist，退役而不在本次运行任何远程命令。

## 有效断言迁移

- util/reportCoreImport.test.js → app/reportCore/importRows.test.js：星级/视力文本、非法数值、空白不覆盖三项断言。
- util/storyMonths.test.js → app/reportCore/storyMonths.test.js：学期跨年、北京时间跨月两项断言。
- npm test仅发现app/reportCore/*.test.js；18项当前模型断言通过。已退役旧商城/分配比例/旧session工具断言不充当新系统测试。五个core浏览器流程均有package入口。

## 逐路径候选

| path | action / stage | reason | activeReferences | replacement | verification | protected |
| --- | --- | --- | --- | --- | --- | --- |
| `backend/__tests__/legacy/batch_import.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/card_api.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/card_claims.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/card_migration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/card_prints.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/card_rules.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/card_url.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/excel_import_e2e.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/full_demo_boundaries.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/regression_20261026.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_auth.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_cards.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_evaluation_snapshot.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_growth.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_health_auth.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_honors.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_import_auth.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_indicators.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_ledger.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_p0_pilot.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_p1_rollout.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_redemption.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_reports.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_roster_auth.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/renovation_stories.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/subject_cards.integration.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/system.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/__tests__/legacy/teaching_assignments_unit.test.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/constants/errorCodes.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/authController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/cardController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/cardPolicyController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/cardPrintController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/categoryController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/deviceController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/evaluationController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/externalIdentityController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/familyFeedbackController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/growthController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/honorController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/importController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/reportController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/reportDraftController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/reportIndicatorController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/rolloutController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/rosterImportController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/scoreController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/storyController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/teachingAssignmentController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/termController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/controllers/uploadController.js` | delete / 14 | 旧API控制器；app已统一将旧接口返回410 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/middleware/cardAccount.js` | delete / 14 | 只被退役控制器/路由引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/middleware/security.js` | delete / 14 | 只被退役控制器/路由引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/middleware/studentScope.js` | delete / 14 | 只被退役控制器/路由引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/middleware/validator.js` | delete / 14 | 只被退役控制器/路由引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/04_subject_card_issuance.sql` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/20261026_subject_cards.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/01_authorization.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/02_classified_cards.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/04_reward_ledger.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/05_honor_awards.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/06_story_review.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/07_report_indicators.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/08_subject_imports.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/09_health_values.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/10_evaluation_versions.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/11_report_drafts.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/12_comment_jobs.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/13_family_feedback.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/14_report_publish_jobs.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/16_growth_theme.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/17_roster_imports.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/18_device_sessions.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/19_identity_links.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/migrations/renovation/index.js` | delete / 14 | 旧schema执行/旧端点测试闭包；核心迁移及迁移测试不依赖 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/routes/api.js` | delete / 14 | 旧路由未挂载；登录和健康检查已在核心入口处理 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/routes/auth.js` | delete / 14 | 旧路由未挂载；登录和健康检查已在核心入口处理 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/routes/health.js` | delete / 14 | 旧路由未挂载；登录和健康检查已在核心入口处理 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/scripts/init_db_data.js` | delete / 14 | 旧库建表/seed入口；默认迁移改为核心check | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/scripts/runMigrations.js` | delete / 14 | 旧库建表/seed入口；默认迁移改为核心check | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/scripts/seed.js` | delete / 14 | 旧库建表/seed入口；默认迁移改为核心check | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/batchImportService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/cardAllocationService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/cardPrintService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/cardRedemptionService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/cardRules.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/commentGenerationService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/commentProvider.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/deviceSessionService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/evaluationEngine.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/evaluationSnapshotService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/example.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/externalIdentityService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/familyFeedbackService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/healthImportService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/honorAwardService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/migrationRunner.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/reportDraftService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/reportIndicatorService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/reportPublishService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/reportSnapshot.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/rewardCategoryService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/rolloutService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/rosterImportService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/scheduler.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/scoreLedgerService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/studentTermStateService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/services/subjectImportService.js` | delete / 14 | 旧业务service闭包；未被核心运行/初始化/迁移/测试引用 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/utils/logger.js` | delete / 14 | 仅旧业务调用；核心私有文件使用privateFiles | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/utils/monthKey.js` | delete / 14 | 仅旧业务调用；核心私有文件使用privateFiles | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/utils/redactUrl.js` | delete / 14 | 仅旧业务调用；核心私有文件使用privateFiles | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `backend/utils/response.js` | delete / 14 | 仅旧业务调用；核心私有文件使用privateFiles | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `deploy/.env.example` | delete / 14 | 旧远程自动迁移/seed与旧打包路径；替代为核心手工切换指引，不执行远程部署 | 0核心入口引用；仅退役闭包/历史文档 | deploy/report-core-cutover.md | 核心test/迁移check及audit | 否 |
| `deploy/deploy.sh` | delete / 14 | 旧远程自动迁移/seed与旧打包路径；替代为核心手工切换指引，不执行远程部署 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | deploy/report-core-cutover.md | 核心test/迁移check及audit | 否 |
| `frontend/src/app/admin/audits.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/cards.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/categories.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/devices.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/identityLinks.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/import.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/index.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/index.module.less` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/reports.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/rollout.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/rosterImport.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/rules.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/teachingAssignments.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/admin/terms.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/dashboard/index.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/dashboard/index.module.less` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/family/feedback.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/forbidden/index.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/forbidden/index.module.less` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/kiosk/identify.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/kiosk/redeem.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/login/index.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/login/index.module.less` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/not-found/index.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/not-found/index.module.less` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/reportCore/Administration.jsx` | delete / 14 | 已被ManagerWorkspace/AdminQuota/AdminTermSettings替代；移除index中的unused import | index.jsx unused import；任务14同步移除 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/server-error/index.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/server-error/index.module.less` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/store/auth.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/student/claim.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/student/evaluation.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/student/growth.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/student/growth.less` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/student/honors.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/student/ledger.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/student/report.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/student/reportPrint.css` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/student/stories.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/teacher/claims.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/teacher/directScore.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/teacher/honors.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/teacher/reportDrafts.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/app/teacher/stories.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/component/ExampleTable/index.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/component/ExampleTable/index.module.less` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/component/Nav/index.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/component/Nav/index.module.less` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/component/Sidebar/index.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/component/Sidebar/index.module.less` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/component/StudentLayout/growthContext.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/component/StudentLayout/index.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/component/StudentLayout/index.less` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/constant/apis.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/constant/errorCodes.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/constant/menu.jsx` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/constant/urls.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/hooks/useAuth.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/hooks/useRequest.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/img/logo.svg` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/types/user.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/__tests__/excelScoreParser.test.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/cardAllocation.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/cardAllocation.test.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/cardClaimSession.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/cardClaimSession.test.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/cardPrintRecovery.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/cardPrintRecovery.test.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/claimIntent.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/claimIntent.test.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/excelScoreParser.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/fn.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/reportCoreImport.test.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | app/reportCore/importRows.test.js | 前端test/build/浏览器 | 否 |
| `frontend/src/util/request.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/storyMonths.test.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/util/token.js` | delete / 14 | 未挂载的旧角色页面/组件/工具；当前入口只使用reportCore闭包 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/tests/student-theme-session.cjs` | delete / 14 | 旧学生主题/商城演示测试；新core五个浏览器脚本覆盖当前业务 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/tests/student-ui.cjs` | delete / 14 | 旧学生主题/商城演示测试；新core五个浏览器脚本覆盖当前业务 | 0核心入口引用；仅退役闭包/历史文档 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `scripts/full-system-demo/.gitignore` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/README.md` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/__pycache__/materials.cpython-314.pyc` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/bootstrap.test.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/browser-demo.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/environment.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/environment.test.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/health.test.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/initialize.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/lifecycle.test.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/materials.py` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/pacing.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/pacing.test.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/package.json` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/run.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R01.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R02.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R03.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R04.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R05.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R06.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R07.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R08.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R09.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R10.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R11.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R12.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R13.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R14.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R15.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R16.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R17.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R18A.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R18B.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R19.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R20A.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R20B.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/scenarios/R20C.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/service.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/steps.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `scripts/full-system-demo/steps.test.cjs` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `完整系统自动演示.command` | delete / 14 | 旧业务自动演示及依赖；由实际core浏览器测试替代 | 0核心入口引用；仅退役闭包/历史文档；旧README/deploy命令任务14更新 | reportCore及当前测试 | 核心test/迁移check及audit | 否 |
| `frontend/src/index.less` | replace-then-delete / 15 | main/index.html尚有引用；先以核心reset/云朵favicon替代，再删除 | main.jsx或index.html；必须先替换 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/src/var.less` | replace-then-delete / 15 | main/index.html尚有引用；先以核心reset/云朵favicon替代，再删除 | main.jsx或index.html；必须先替换 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |
| `frontend/public/ans.svg` | replace-then-delete / 15 | main/index.html尚有引用；先以核心reset/云朵favicon替代，再删除 | main.jsx或index.html；必须先替换 | reportCore及当前测试 | 前端test/build/浏览器 | 否 |

## 明确保留

| path | reason | protected |
| --- | --- | --- |
| backend/scripts/initReportCore.js | 新学校安全初始化 | 是 |
| backend/scripts/runCoreMigrations.js | 六表检查、显式apply及时间切换审计 | 是 |
| backend/scripts/migrateReportCore.js | 旧库只读audit与明确迁移 | 是 |
| backend/__tests__/report_core_*.test.js及helpers/fixtures | 当前业务和迁移回归 | 是 |
| frontend/tests/report-core-*.cjs | 当前真实输入/权限/打印/恢复/分页回归 | 是 |
| docs/**、userReq.md、userAdvice.md、.scratch/** | 需求、设计、历史证据和迁移参考，非垃圾 | 是 |
| sql/** | 旧schema/查询作为迁移映射参考；仅05由当前默认迁移执行 | 是 |
| backend/assets/fonts/** | 中文原卡PDF及许可证 | 是 |
| .env、deploy/backend.env、backend/private/**、backend/uploads/** | 密钥及用户材料，不读取内容、不删除 | 是 |
| output/**、原型目录 | 本地验收证据与待评审设计，不属于源码清理目标 | 是 |

## 执行记录

待任务14/15分批填入实际删除数量、提交和验证。未在本清单中的动态依赖或用户文件默认保留。
