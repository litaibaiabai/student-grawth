# Teacher Assessment Report Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Preserve unrelated uncommitted changes; the user explicitly requested committing this implementation directly to `codex/six-education-v2`.

**Goal:** Replace the teacher comprehensive-score upload page with one Excel upload action and a complete, sequential, read-only student report review.

**Architecture:** The server parses the workbook and returns every source student row, including blank and invalid rows, with authorized existing values, uploaded values and row-specific errors. A reusable React `StudentAssessmentReport` renders catalog fields and optional story/narrative sections. The upload page owns batch state, navigation and explicit commit.

**Tech Stack:** Existing React 18, Vite, SheetJS, Express and MySQL; Node 22.16.0; no new dependencies.

**Spec:** User-approved chat design and `.superpowers/brainstorm/41370-1793373284/content/teacher-assessment-layout-v4.html`. The final user amendment hides story and narratives in the upload module only.

## Global Constraints

- Desktop section order: conduct / wisdom, health / art, labor / story. Mobile uses one column.
- Teacher upload displays conduct, wisdom, health, art and labor only. Reusable report can also display story and narratives.
- Initial content shows only an Excel upload button. Selection immediately starts review.
- Every nonempty student record is retained in workbook sheet/row order, including all-blank grades and invalid records. Reject unsupported sheets rather than silently ignoring data.
- Use original worksheet names and row numbers in error messages. Invalid batches cannot commit. No inline editing.
- Gray means system, student or prefilled data; new teacher-uploaded values are dark green; invalid/required missing cells are red with a textual reason.
- Blank import cells retain saved values. Missing applicable fields included in the uploaded template are errors when no saved value exists. Omitted columns are not required by this upload.
- The user-facing entry must not branch by schema version. Both the current term and V2 terms use the same page and report component. Delete `AcademicImport.jsx` and its orphaned parsing helper/tests.
- Keep existing explicit commit, authorization, revision and idempotency controls. Do not change published reports or import unrelated data.

## Review Focus

- More than one worksheet and blank physical rows must preserve all students and accurate row numbers.
- Blank-only rows, duplicate/unknown accounts and invalid grades remain visible with errors.
- Real zero, existing values and derived BMI retain their meaning and source styling.
- Replacing a file or changing session/term must not show a stale batch or apply a late response.
- Teacher-only section filtering must not remove those sections from the reusable report template.

### Task 1: Complete workbook review data

**Files:** Modify `backend/services/reportCoreV2Imports.js`, `backend/routes/reportCoreV2.js`; create `backend/services/reportCoreV2ImportReview.js` and `backend/__tests__/report_core_v2_import_review.test.js`.

**Interfaces:** `parseV2Workbook(buffer,{termId,review:false})` keeps the strict parser default; review adds row errors and submitted-column metadata. `reviewV2Workbook({pool,actor,termId,buffer,command})` returns `{result:{batchId,revision,students,errors,totalCount,validCount}}`. Each student contains `student`, `values`, `uploadedFields`, `errors`, `rowNo`, `sheetName` and specialties.

- [x] Add and run failing tests for all worksheets, blank-only student records, invalid grades, duplicate/unknown accounts, physical row numbers, prefilled values and scope enforcement.
- [x] Implement row-preserving parsing and authorized review; pass normalized values to existing `previewImport` only after validation succeeds.
- [x] Run backend review/import regression tests; verify atomic commit remains unchanged.

### Task 2: Report template and teacher upload workflow

**Files:** Create `frontend/src/component/StudentAssessmentReport/index.jsx`, `style.css`, `model.js`, `model.test.js`; create `frontend/src/app/reportCore/ComprehensiveImport.jsx`, `comprehensiveImport.css`; replace the old `V2Import` implementation in `V2Workflows.jsx` with a re-export.

**Interfaces:** `StudentAssessmentReport({catalog,record,term,sections,showNarratives,sequence})` is independent of API/upload state. Default includes all sections and narratives; upload passes five sections and `showNarratives={false}`.

- [x] Add failing model tests for catalog coverage, source classification, zero/JSON values and report section filtering.
- [x] Implement the complete catalog-driven report with compact subject tables, health values, specialties and optional narratives.
- [x] Implement automatic upload review, total and current count, previous/next bounds, per-student and batch error summaries, retry/reupload, and commit. Guard asynchronous responses and clear private batch state on session changes.
- [x] Run frontend unit tests, lint changed files and production build.

### Task 3: Browser acceptance and final review

**Files:** Add a focused browser acceptance script and update the existing V2 browser import assertions for immediate review.

- [x] Verify only one initial upload button, valid and invalid multi-student workbooks, complete traversal, source colors, section visibility, reupload and explicit commit using synthetic data in an isolated test database.
- [x] Inspect desktop and mobile screenshots and fix any clipped fields or controls.
- [x] Run frontend and backend suites; report any unrelated baseline failures accurately.
- [x] Review only this task's changes and retain screenshots under `output/report-core/assessment-upload/`.

## Execution ledger

- Plan accepted for execution through the user's approval of the template with teacher-only section exclusions.
- Working in the current `codex/six-education-v2` checkout. The user's later instruction authorizes a scoped commit to this branch; unrelated work remains unstaged.
- All three implementation tasks completed. Full template retains story and narratives; teacher uploads hide both. Current-term and V2 workbook formats share one upload endpoint; current-term `studentId` templates remain supported.
- Independent review found formula/error-cell retention and physical row-number issues; both were reproduced with failing tests and fixed. Formula headers remain rejected.
- Native Chrome verification initially exposed an unintended schema-version fallback. Removed it and deleted the old page, orphaned parser and parser-only tests. Native Chrome now shows the single upload button at the user's real `localhost:5173/#/teacher/imports?termId=1` page.
- Reloaded the existing local backend at port 19380 after the compatibility correction. No database migration or school data edit was performed.
- Verification: 22 frontend tests, 130 backend tests passed (one additional test skipped), lint/build, 94-field V2 full-template and 85-field upload coverage, 100-field current-term upload coverage, native browser entry, invalid-row traversal, real HTTP preview/commit/prefill checks and 375px/desktop report layout with zero clipped cells.
