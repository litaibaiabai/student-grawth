# Course Card Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 教师按班级学科领取管理员配置的独立月度二维码集合，支持预览、下载及打印。

**Architecture:** 新增独立课程卡服务与路由，复用来源记录、凭证加密与扫码积分。V2 教师与管理员入口使用新组件，V1 保持现有组件。

**Tech Stack:** React 18, Vite 5, Express 5, MySQL, qrcode, pdfkit, node:test, Playwright.

**Spec:** docs/superpowers/specs/2026-10-31-course-card-collection-design.md

## Global Constraints

- 每个班级＋学科独立月额度；二维码无学生绑定、无一级二级选择。
- 不增加依赖、不修改数据库结构；保留工作区其他未提交改动。
- 当前月自动生成；历史只读；已生成批次不因重新进入或配置修改而重发。
- 服务端校验同校、当前任教权限、有效期和领取状态；不缓存凭证。

## Review Focus

1. 同班多学科和同学科多班的数量及凭证不可混合（Task 1）。
2. 并发同步和额度修改不得重复发行或改变既有二维码（Task 1）。
3. 停用任教关系后列表、二维码、PDF 均拒绝访问（Task 1）。
4. 跨月边界、冻结学期及过去月份不生成新卡（Task 1）。
5. 领取后下载/打印只能包含当前仍可领取卡，搜索分页不缩小整份下载范围（Task 3）。

### Task 1: 课程卡服务和接口

**Files:** Create backend/services/reportCoreCourseCards.js; backend/routes/reportCoreCourseCards.js; backend/__tests__/report_core_course_cards.test.js. Modify backend/routes/reportCore.js.

**Interfaces:** getCourseCardSettings/saveCourseCardSettings({pool,actor,termId,...}); syncCourseCards({pool,actor,termId,command,now}); listCourseCards({pool,actor,termId,monthKey,now}); getCourseCardPage({pool,actor,termId,monthKey,grade,classNo,subjectCode,page,status,q,now}); buildCourseCardPdf({...scope,now}).

- [x] Write integration tests for per-course quantities, concurrency, stale revisions, subject target, cross-class redemption, revoked assignment, historical read and PDF bytes.
- [x] Run node --test __tests__/report_core_course_cards.test.js in backend; confirm missing-feature failure.
- [x] Implement scoped settings, immutable month snapshots and automatic synchronization, paginated QR preview and printable PDF; mount authenticated routes.
- [x] Re-run integration tests; expect all pass.

### Task 2: 教师界面与管理员配置

**Files:** Create frontend/src/app/teacher/cards/CourseCards.jsx and courseCards.css; frontend/src/app/manager/quota/SubjectCardQuota.jsx. Modify teacher/index.jsx and manager/index.jsx.

**Interfaces:** API /report-core/course-card-settings (GET/PUT), /report-core/course-cards/sync (POST), /report-core/course-cards (GET), /report-core/course-cards/preview (GET), /report-core/course-cards/pdf (GET), /report-core/course-cards/print (GET).

- [x] Add a browser flow that logs in as manager, configures Chinese=100 and Math=120, logs in as teacher and expects three course cards and 100/100/120 scoped previews.
- [x] Run browser flow and confirm old-interface failure.
- [x] Build course gallery, detail QR grid, status/search/page controls, whole-course download/print; add accessible states and mobile styles. Build versioned subject quota editor with dirty guard and impact totals.
- [x] Run browser flow, frontend unit suite, Vite build and targeted lint.

### Task 3: 交付验证与独立审查

**Files:** Create frontend/tests/course-cards.cjs and screenshot artifacts under output/report-core/course-cards.

- [x] Exercise real QR redemption, download PDF, print content, pagination, no duplicate generation after reload, admin changes preserving batches, keyboard navigation and 390px viewport.
- [x] Run backend npm test and frontend npm test/build; record any existing unrelated failures accurately.
- [x] Dispatch one independent reviewer against this spec and changed files; resolve material findings with regression coverage.

## Execution notes

用户已确认入口、发卡方式和每班独立额度。继续在当前 codex/six-education-v2 工作区完成；该工作区存在未提交的前端模块迁移，新 worktree 的 HEAD 不包含这些上下文，因此不创建或移动工作区，也不自动提交用户的变更。采用当前会话连续实施。

## 验收结果（2026-10-31）

- 后端完整 `npm test`：148 通过，0 失败，1 跳过（原有可选测试）。
- 前端完整 `npm test`：24 通过；Vite production build 通过；新增组件和打印助手 ESLint 通过。
- `node tests/course-cards.cjs`：真实管理员配置、3 门课程独立 100/120/100、二维码分页、PDF 下载、整份 100 张打印、390px 手机无横向溢出、重新进入保持 320 张全部通过。
- 二维码 PNG 使用 jsQR 实际解码成功；跨班领取及越权预览/打印被拒绝；过期/已领取卡不返回凭证；并发生成及北京时间跨月验证通过。
- 下载 PDF 与浏览器打印 PDF 均为 A4、每页 10 张，100 张共 10 页；已人工检查首屏、手机及 PDF 首页面排版。
- 需求文档经过独立 builder check；最终独立代码审查未发现需修复的问题。
- 界面截图与 PDF 样例：`output/report-core/course-cards/`。
- 实施记录：并发测试暴露 MySQL 一致性快照看不到等待锁时新提交批次，改为锁定读取后通过；道德与法治映射回归修正为 `MORAL_SUBJECT_PROCESS`。
- 保留现有工作区全部其他改动，未自动提交、合并或发布。
