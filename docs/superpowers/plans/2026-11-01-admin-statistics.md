# 管理员学生数据统计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为管理员提供四个标签页的真实学生数据统计与可筛选明细。

**Architecture:** 新增管理员只读统计服务，在数据库一致快照内读取学期快照与来源统计元数据；服务端汇总、筛选和分页。前端独立 `manager/statistics/` 模块，接入现有导航和通用 API，使用 CSS 图表。

**Tech Stack:** React 18、Vite、Express、MySQL 8、Node 22.16；无新增依赖。

**Spec:** `docs/superpowers/specs/2026-11-01-admin-statistics-design.md`

## Global Constraints

- 只允许管理员查询本人学校的数据；只支持当前六育 V2 学期，旧版学期给出明确提示。
- 不新增数据库表，不修改真实学校数据，不引入图表依赖。
- 管理员只接收统计与奖励记录元数据，不返回自述、故事正文、音频路径、证书文件路径或卡片凭证。
- 零记录学生保留，排除转出、不适用和 `roster.included=false`。
- 在当前 `codex/six-education-v2` 分支增量修改，保留用户现有未提交内容，不提交混合改动。

## Review Focus

- 无卡直评缺少 subject_code 时，通过目标确定学科，无法映射单列；不得遗漏日常行为。
- 当前讲故事使用 TELL_RECORDING，与历史评分根作品并存，不依赖评分状态判断参与。
- 自评范围遵循 V2 可填写项，零适用项不能误算完成，也不能变成一星。
- 切换范围和标签后旧请求不能覆盖新数据；错误后可重试。
- 撤销奖励、证书处理状态、作品多版本必须可对账，分页不能改变汇总分母。

### Task 1: 统计 API 与口径

**Files:** Create `backend/services/reportCoreAdminStatistics.js`, `backend/routes/reportCoreStatistics.js`, `backend/__tests__/report_core_admin_statistics.test.js`; Modify `backend/routes/reportCore.js`.

**Interfaces:** `getAdminStatistics({pool,actor,termId,tab,grade,classNo,subjectCode,keyword,state,page,pageSize})` returns `{tab,scope,filters,summary,charts,rows,pagination,asOf}`. `getStudentRewardRecords` consumes studentId and returns bounded paginated metadata. GET routes `/admin/report-core/statistics` and `/admin/report-core/statistics/rewards/:studentId`.

- [x] Write integration tests using `createV2TestDb`: actual revoked direct award excluded, valid subject fallback, zero students retained, all four statistics, self applicable values, current story version, excluded enrolment, scope and paging, forbidden roles and other school/term.
- [x] Run `node --test backend/__tests__/report_core_admin_statistics.test.js`; expected RED due missing statistics service.
- [x] Implement minimal read service, validation, projections, summaries, paginated detail and authenticated routes. No material content selected or returned.
- [x] Repeat the integration test; expected all pass.

### Task 2: 四标签页页面与导航

**Files:** Create `frontend/src/app/manager/statistics/AdminStatistics.jsx`, `StatisticsCharts.jsx`, `adminStatistics.css`; Modify `frontend/src/app/manager/index.jsx`, `frontend/src/app/core/navigation.js`, `frontend/src/app/core/RoleShell.jsx`.

**Interfaces:** `AdminStatistics({ctx})` consumes `ctx.termId`, `ctx.refreshKey`, `ctx.error` and Task 1 API shape. Uses existing `api()` and `UIIcon`.

- [x] Set up isolated V2 fixtures and actual HTTP endpoints for CUA browser verification: four tab summaries, class/grade filters, subject, self status, zero-record students, search, pagination, reward details, request failure/retry and 390px layout. Browser tool requires CUA; fixture lives in the ignored plan workspace rather than adding a second runner.
- [x] Verify browser RED because “数据统计” navigation missing.
- [x] Implement approved visual layout, shared filters, text-backed charts, student table, accessible keyboard tabs, loading/error/empty states, pagination, safe request cancellation.
- [x] Run browser verification; pass with screenshots in `output/report-core/admin-statistics/`.

### Task 3: 完整验证与审阅

**Files:** update plan completion and `docs/delivery/admin-statistics/README.md` with precise validation.

- [x] Run backend and frontend test suites using Node 22.16, frontend build, and focused lint; inspect failures without modifying unrelated behavior.
- [x] Review screenshots for all tabs and narrow viewport. Run a fresh independent code review limited to this task's source/tests; no material findings.
- [x] Record verified result and any preexisting failures; deliver working feature with screenshot and entry path. Leave all existing user work intact.
