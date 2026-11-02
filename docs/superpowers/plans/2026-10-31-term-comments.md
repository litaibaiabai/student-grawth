# 学期寄语工作台 Implementation Plan

> **For agentic workers:** Implement in this session, task by task, using test-driven-development.

**Goal:** 教师先选班级，再查看所有学生；根据完整六育报表自动生成寄语，支持修改、草稿持久化、单人及批量审核。

**Architecture:** 沿用 React、Express 与现有模型适配器。寄语草稿与审核历史存入 evaluation_source_record，仅审核通过时通过现有 FORM 投影写入 teacher_comment；复用事务、任教授权、幂等和版本冲突机制，无数据库迁移。

**Tech Stack:** React 18, CSS, Express, MySQL, node:test, Playwright.

**Spec:** 用户本次需求及确认：大模型根据学生本学期六育报表详情自动生成，教师在生成结果上修改；采用已讨论的班级名册与寄语审核工作台。

## Global Constraints

- 保留当前工作区已有重构与未提交改动，在当前功能分支实现。
- 仅班主任处理负责班级；冻结/发布中只读。
- 首次选择学生自动生成并持久化；再次进入读取草稿，不覆盖人工修改。
- 模型读取六育报表实际数据、字段名称与缺失项，不编造表现。
- 草稿不写入正式报告；审核才写入。批量审核原子提交。
- 不安装依赖，不修改密钥，不自动提交现有工作区。

## Review Focus

- 模型未配置或返回空值/超长文本：明确失败，无伪造草稿。
- 跨班级、非班主任、已排除名单：不能读取或审核。
- 模型生成期间报表或草稿改变：拒绝覆盖。
- 批量中一个版本冲突：整批回滚。
- 切换学生、班级、学期及移动端：无串写、无丢失未保存输入。

### Task 1: 模型与寄语服务

**Files:** backend/services/reportCoreProvider.js; new backend/services/reportCoreComments.js; backend/routes/reportCoreV2.js; new backend/__tests__/report_core_comments.test.js; backend/__tests__/report_core_provider.test.js.

**Interfaces:** Provider.generateTermComment({report, fields}) -> {comment, model}; listComments({pool,actor,termId,grade,classNo}); getComment({pool,actor,termId,studentId}); generateComment({...args,provider,force,expectedCommentId}); saveComment({...args,comment,expectedRevision,expectedCommentId}); approveComments({...args,entries:[{studentId,comment,expectedRevision,expectedCommentId}]}).

- [x] Write and run failing provider test: supplied report details reach the model; empty/overlong responses rejected.
- [x] Write and run failing database tests: persistent auto draft, edited draft survives reload, report unchanged before review, batch approval writes exact reviewed texts, stale revisions roll back, unauthorized/frozen rejected.
- [x] Implement provider, service and routes with generation outside transactions and revalidation before storing.
- [x] Run focused backend tests.

### Task 2: 班级名册与寄语编辑界面

**Files:** frontend/src/app/teacher/comments/TermComments.jsx; new termComments.css; new frontend/tests/report-core-comments.cjs; update existing frontend/tests/report-core-v2.cjs for changed workflow.

**Interfaces:** Consume Task 1 routes. Class picker -> roster with state filters/search/checkboxes -> editable letter + report details. Single approval accepts current edits; batch approves saved drafts, with any current editor text included explicitly.

- [x] Write browser assertions for class-first navigation, automatic generation, draft persistence, direct/edited approval, batch handling and responsive layout.
- [x] Run to observe expected missing class picker failure.
- [x] Implement scoped styles, request cancellation and unsaved guards, loading/error/empty/read-only states.
- [x] Run browser flow at desktop and mobile sizes; inspect screenshots.

### Task 3: 回归与审查

- [x] Run frontend npm test and npm run build, backend npm test; record pre-existing failures if any.
- [x] Review touched files for permissions, concurrency and data-loss paths; resolve relevant findings.
- [x] Record verification and deliver concise report of behavior and configuration limitations.

## Execution record

- Ruling: Continue in the user's existing dirty feature workspace; its active refactor is required by these modules. No worktree, branch or commit operations.
- Ruling: The user's confirmation of report-based automatic generation supplies the remaining behavior choice; continue implementation without another approval round.


## Verification and review

- Backend final full suite including account-error regression: 149 passed, one opt-in 3000-student performance test skipped, zero failures.
- Frontend: npm test 24 passed; npm run build passed; scoped ESLint passed without warnings; git diff --check passed.
- Browser: desktop 1440px and mobile 390px passed class-first navigation, full six-section evidence, automatic draft generation, persistence, unsaved guard, edited approval, two-student atomic approval, model failure UI, no horizontal overflow, and 401 → same-account reauthentication → retained editing → save.
- Screenshots: output/report-core/comments/desktop.png and mobile.png (synthetic fixtures).
- Independent read-only review found two issues, both reproduced with failing tests and fixed: preserve editor across session expiry; include process_summary and honor_summary in model input and basis fingerprint.
- Ruling: Store comment versions as existing TEACHER / FORM records with target_key=teacher_comment; payload.comment is not projected. Approval adds a separate FORM with payload.values.teacher_comment. This respects existing schema checks without migration.
- Real provider smoke check used a synthetic report only. Provider rejected it with HTTP 400 / Arrearage. No actual student records were sent. Existing endpoint/model/API-key configuration is present; account availability must be restored by the administrator. Added a provider regression and clear account-status message for this error.
- Existing frontend/tests/report-core-v2.cjs was updated to use the new comment workflow. Its attempted whole-system run timed out earlier in the unrelated student story step: 解析并预览 remained disabled. The comments browser suite covers the changed workflow independently; this broader flow was not verified through release.
- No dependencies installed, no database migration, no commits, no changes to model credentials.


## Follow-up: compact class roster

- User requested no account-billing message, class selection to the right of the title, and a shorter two-column student roster.
- Vendor account failures remain retryable HTTP 503, with a generic generation-failed message; no fabricated generated text.
- Moved class picker and compact review progress into the module heading; removed the separate class-selection bar.
- Student roster uses two columns at desktop and mobile sizes. Removed the second ID line and decorative sequence/arrow; kept the full name and ID in the button title and accessible name. Student buttons are 48px on desktop, 44px on mobile.
- Verification: provider tests 3 passed; frontend unit tests 24 passed; existing full comments browser flow passed desktop/mobile; scoped ESLint, production build, and diff whitespace checks passed. Previews updated in output/report-core/comments/.


## Runtime follow-up: stale backend error

- User still saw the old billing message after clicking a student. The backend listening on 19380 had started at 21:10:39, before the provider source changed at 21:16:18; it had not reloaded.
- Gracefully restarted only this project backend with Node 22.16.0. Health check returns 200. Current process metadata is in /tmp/six-education-backend-current.pid and logs in /tmp/six-education-backend-current.log.
- Current external provider still returns HTTP 400 / Arrearage, so successful model generation remains blocked by external account/configuration state. Asked user whether to restore the existing account or change model service. No credentials changed.
- A proposed live-student generation probe was rejected by automatic approval; it was not executed. Replaced it with an isolated temporary database containing synthetic students and a real provider call. The API returns 503 with generic retry text, no old billing message; real student data and comments were untouched by verification. Temporary test database cleaned up.


## 2026-11-01: working Token Plan connection

- User supplied a new Token Plan API root and key, then explicitly selected qwen3.7-plus. No key values are stored in this document or test sources.
- New key's model list is available; qwen3.6-plus is absent and its call returns 403 AccessDenied.Unpurchased. qwen3.7-plus is listed and a direct synthetic call returns HTTP 200.
- Updated only local ignored backend/.env connection fields to the supplied Token Plan root/key and user-selected qwen3.7-plus.
- Added backward-compatible API-root handling: paths ending /v1 or /v1/ gain /chat/completions; explicit completion endpoints remain unchanged. Regression test was observed failing before the change and passing afterward.
- Focused provider/comments tests: six passed. New configuration started on local backend port 19380; health check returns 200.
- Full application generation API tested with real new provider and a synthetic assessment in a disposable isolated database: HTTP 200, 325-character DRAFT persisted, teacher_comment remained null. Test database cleaned up; real students were not used.
- This working connection supersedes the prior external account/access blockers. Full backend regression results recorded below when complete.

- Backend full regression after the connection change: 151 passed, 9 failed, one opt-in performance check skipped. The root-address/provider and comments tests passed. The full suite is not green.
- Eight failures use fixed October card/month fixtures against the real current clock after the November rollover; print/token/redemption helpers see expired cards. The source-data regression returned a non-JSON HTTP body and is being checked separately. These areas were not modified for this connection change.
- Failing test names from the full regression:
  - original card print request is auditable and produces Chinese per-class PDFs without changing credentials
  - class PDF and stale print requests enforce current unused status; old token and ZIP routes share the guard
  - void and redeem race has exactly one winner and never refunds issued quota
  - quota restricts generation; same class concurrent redemption credits only one student; reversal only once
  - ledger reconciles generated/redeemed/void/reversed counts and never exposes card credentials
  - cross-month reversals belong to original month while the event keeps its actual date
  - historical asOf does not expose a future recipient or apply a later void; old unverified clock stays unknown
  - current SQL aggregate keeps direct counts, mixed event ordering and pagination identical to exact asOf projection
  - subject teacher source payloads redact other-subject values, historical values and private narratives/specialties

- Isolated rerun of report_core_review_regressions.test.js passed all nine cases, including the source-data privacy check that returned non-JSON during the full run. The full-run card/date fixture failures remain reported above.
