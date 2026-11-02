# 管理员完整闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 实现已确认的管理员七模块，完成本机数据库升级、独立测试数据、完整 V2 闭环与 MCP 三角色实测演示。

**Architecture:** 保留 React 18/Vite + Express/MySQL 单体及现有来源事实、评价投影、报告冻结。增加 school_class 注册表与负责教师，复用实际 teacher_teaching_assignment；新管理服务用现有事务、请求幂等与学校范围约束。课程卡沿用自动生成，只补默认数量与后台配置。

**Tech Stack:** Node 22.16.0、React 18、Vite、Express 5、MySQL 8、node:test、现有浏览器测试基础设施及 MCP CUA。

**Spec:** `docs/superpowers/specs/2026-11-01-admin-closure-design.md`（2026-11-01 用户明确批准开始实现）。

## Global Constraints

- 班级全部通过导入建立，无手动新建、班级状态或班级进度页签；详情“学生名单／教师配置”，卡片面积约首版 1/4。
- 每班一位负责教师/班主任审核完整报告，管理员在班级配置各科教师；真实任课关系用于课程卡和既有学科范围。
- 学科额度单位“张／班／月”，语文 60、数学 70、英语 75；同师三班语文各 60、共 180。
- 统一默认初始 100；学科留空继承默认，明确 0 保留；更改默认不覆盖科目覆盖值、既有批次。
- 管理员没有体测原始值入口；教师 Excel 体测链保留；管理员核对完整性后全校发布。
- 保留当前工作区已有学生端/教师端未提交改动，不恢复旧入口、不部署、不合并、不访问付费模型。
- 本机现有开发库 `student_growth` 为七表 V2；升级前只读审计并备份；测试仅使用 `liuyu_report_test_*` 隔离库。
- 当前分支 `codex/six-education-v2` 工作区已有大量用户改动。原地增量实现，保存文件级基线供审阅；不得把已有未提交改动顺带提交。实施者不提交产品代码，控制器在完成后按需处理提交；设计文档已有独立提交。

## Review Focus

- 默认值 0 与缺失配置：只用 nullish fallback，UI/返回值/实际生成口径一致；Task 1 断言真实卡片数。
- 班主任未承担具体学科：仍可审核本班完整报告，不伪造课程卡；Task 2 断言独立负责人授权与跨班拒绝。
- 同期调班/教师变更：原班、新班排名和确认失效，旧已发布快照不改；Task 2 和 Task 5 验证。
- 班级/师生导入预览后数据变化：原子失败 409，不能部分写入、不能跳过已导入班级检查；Task 2/Task 4 验证。
- 完整报告不是空字段夹具：Task 5 使用完整 applicableFields、独立预期对账、缺项阻断和重审；Task 6 用独立新演示库真实 UI 重演。

## File structure and shared contracts

- `backend/scripts/migrateAdminClasses.js`、`sql/07_admin_class_registry.sql`、`docs/database/admin-closure.schema.json`：八表增强契约与幂等升级。
- `backend/services/reportCoreAdminClasses.js`、`routes/reportCoreAdminClasses.js`：班级导入、教师配置、调班；authoritative 负责人来自 `school_class.responsible_teacher_id`。
- `backend/services/reportCoreAdminOps.js`、`routes/reportCoreAdminOps.js`：账号维护、操作记录、下一学期；`reportCoreAdminProgress.js`：只读六育完整性统计。
- `frontend/src/app/manager/classes/`、`audit/`、`statistics/AdminClosureStatistics.jsx`：新增页面。保留当前另一份未提交统计设计及其文件，若实现出现则合并而不覆盖。
- 所有返回走 `{code:200,data:...}`；写入沿用 `withMutation` 的 `{result,replayed,revisions}`，前端用 `resultOf`。
- class row：`{id,grade,classNo,displayName,responsibleTeacherId,responsibleTeacherName,studentCount,revision}`。
- `GET /admin/report-core/classes?termId&grade&q&cursor&limit` → `{rows,total,nextCursor}`。
- `POST /admin/report-core/classes/imports/preview` `{termId,rows:[{grade,classNo,displayName,responsibleTeacherUsername?}]}` → mutation result `{previewId,revision,diffs,counts,errors}`；`POST /classes/imports/:previewId/commit` `{termId,expectedRevision}`。
- `GET /admin/report-core/classes/:id?termId` → `{class,students,assignments}`；assignments `[{subjectCode,teacherId,teacherName}]`。
- `POST /admin/report-core/classes/:id/teachers/preview` `{termId,expectedRevision,responsibleTeacherId,assignments:[{subjectCode,teacherId}]}` → `{previewId,revision,diffs,impact}`；`POST /classes/:id/teachers/previews/:previewId/commit` `{termId,expectedRevision}`。
- `POST /admin/report-core/classes/transfers/preview` `{termId,studentIds,targetClassId,reason}` → `{previewId,revision,diffs,impact}`；`POST /classes/transfers/:previewId/commit` `{termId,expectedRevision}`。
- `POST /admin/report-core/accounts/:id/status` `{termId,status,expectedTokenVersion,reason}`；`POST /accounts/:id/password` `{termId,password,expectedTokenVersion,reason}`。
- `GET /admin/report-core/audits?termId&type&q&from&to&cursor&limit` → `{rows,total,nextCursor}`，仅安全差异/元数据；`GET /admin/report-core/audits/export` CSV。
- `GET /admin/report-core/progress?termId&grade&classNo` → `{asOf,versions,counts,sections,classes,missing}`；`GET /progress/export` 同口径 CSV。
- `POST /admin/report-core/terms/create` `{sourceTermId,academicYear,semester,termName,startDate,endDate,collectionDeadline,makeCurrent}` → 新学期；`POST /terms/:id/current` 切换当前学期，发布准备期间拒绝。

### Task 1: 默认学科卡数量

**Files:** Modify `backend/services/reportCoreCourseCards.js`, `frontend/src/app/manager/quota/SubjectCardQuota.jsx`; Test `backend/__tests__/report_core_course_cards.test.js`。

**Interfaces:** getCourseCardSettings 增 `defaultMonthlyTotal`，每科保留 raw `monthlyTotal`（覆盖值或 null），增加 `effectiveMonthlyTotal`。saveCourseCardSettings 接收 `defaultMonthlyTotal` 和 `quotas`；省略默认参数时保留已有默认或 100。listCourseCards 返回 effective configuredTotal，并提供 usesDefault 信息。

- [x] 新增失败用例：缺省科目各 100、默认改 80 只影响继承项、语文覆盖 60 三班共 180、明确 0 不生成、旧批次不变、非法默认拒绝、未授权拒绝。
- [x] Node 22 运行 `node --test backend/__tests__/report_core_course_cards.test.js`，记录 RED。
- [x] 实现一次有效额度解析供配置读取/生成/展示共用，默认配置键 `courseCardDefaultQuota`；界面默认输入、学科 placeholder、有效预计量、保存版本与空白规则。
- [x] 重跑专项及后端全套；记录 GREEN 和已有失败，浏览器验证由 Task 4/5 完成。

### Task 2: 班级注册表、导入与权限贯通

**Files:** Create migration/DDL/schema、class service/routes、`backend/__tests__/helpers/reportCoreAdminDb.js`、`report_core_admin_classes.test.js`；Modify `runCoreMigrations.js`,`migrateSixEducationV2.js`,`reportCore.js`,`reportCoreImports.js`,`authorizationService.js`、必要 read-model/学生名单/寄语查询。

**Interfaces:** 按 Shared contracts 提供班级接口。升级标记 `evaluation_config.adminClassRegistryVersion=1`。`migrateAdminClasses({connection,targetDb,mode='check'})` 返回 `{ready,mode,pending,conflicts,applied,backfilled}`。新表仅 id/school_id/term_id/grade/class_no/display_name/responsible_teacher_id/revision/created_by/updated_by/timestamps，无 status。

- [x] 写真实 MySQL 失败测试：只读检查、七→八表 apply、重复 apply、部分失败恢复、类型/未知表冲突、跨校 FK；唯一旧班主任回填，无负责人留空。
- [x] 运行专项记录 RED；实现显式 migration，保留六/七表旧测试和历史报告契约，只接受已知八表增强，不放开任意结构。
- [x] 先测再实现班级原子导入与 CAS、空班、预览不建班、重复跳过、跨校/非法教师拒绝、无手动 create 路由。
- [x] 先测再实现负责人/各科教师变更。班主任可无实际学科，授权上下文可提供明确 CLASS_HEAD 上下文但不能生成假任课行；课程卡只读真实任教。排查直接 SQL 查询班主任/教师班级的调用点并贯通。
- [x] 先测再实现调班；增加名单版本，保留事实，重算原班和新班相关排名、使确认失效。增强版 ROSTER 导入也必须检查已导入班级并复用相同调班影响处理，不能绕过。
- [x] 增强版关闭管理员 HEALTH 专用导入，保留教师 ACADEMIC 体测上传；旧库测试行为不因新表缺失而报 SQL 错。
- [x] 跑专项、现有导入/权限/报告/课程卡测试和后端全套；输出准确文件清单及 RED/GREEN 证据。

### Task 3: 账号、统计、操作记录和新学期服务

**Files:** New AdminOps/AdminProgress services/routes、`report_core_admin_ops.test.js`；Modify `reportCoreAdminData.js`,`reportCore.js`,`reportCoreTermSettings.js`。

**Interfaces:** 按 Shared contracts；account rows 增 `tokenVersion`。进度统计读现有 completion、有效学籍与确认 fingerprint，CSV 由同一模型产生。

- [x] 写失败测试：启停/重置立即撤销旧 token、只能维护学生和教师、跨校拒绝、密码不进入日志/响应、状态 CAS。
- [x] 写失败测试：统计有效名单/不适用分母/0/班级与全校一致；安全审计分页/筛选/导出，不包含密码哈希、令牌、私有正文和文件路径，CSV 公式防护。
- [x] 写失败测试：下一学期校验日期与学校唯一、创建不复制任何班级/评价/报告、当前学期切换与发布锁；新学期使用 V2、默认卡数 100。
- [x] 实现服务和路由，复用现有事务与 idempotency；对 V2 学期配置只暴露真实 V2 参数，避免旧版固定目标分/数字 rule_version 假设破坏 V2。
- [x] 跑专项和后端全套；审阅本任务 diff 后继续。

### Task 4: 七模块管理员正式界面

**Files:** New `manager/classes/AdminClasses.jsx`, `adminClasses.css`, `manager/audit/AdminAudit.jsx`, `manager/statistics/AdminClosureStatistics.jsx`；Modify manager index、core navigation/RoleShell、AdminRoster、AdminTermSettings、ManagerWorkspace；Test `frontend/tests/admin-closure.cjs`。

**Interfaces:** 消费 Tasks 1–3 已定接口、ctx 中的 actor/termId/catalog/refresh/error/notify 和 existing api/resultOf/download。

- [x] 先写真实 HTTP/UI 冒烟用例：七导航无体测；导入班级、教师配置和无新建；模板解析+差异提交；账号维护；默认100和覆盖60/70/75；统计/审计/新学期；390px无整页横溢。
- [x] 运行记录 RED；沿用已确认原型与 core tokens，正式页面使用真实 API、空态/错误/草稿保护，不引入 UI 依赖或占位示例数据。
- [x] 班级紧凑卡片，详情仅学生名单/教师配置；表格横滚局限容器。学籍导入更正清楚展示影响；发布中心按班级缺项导航，仍由班主任内容确认。
- [x] 运行浏览器专项与 frontend test/lint/build，核对截图；不要覆盖现有或并行出现的其他统计模块。

### Task 5: 全字段闭环、迁移演练与逐项修复

**Files:** New `backend/scripts/seedAdminClosureDemo.js`, `frontend/tests/admin-closure-flow.cjs`, `docs/delivery/admin-closure/verification.md`；修复本轮暴露的相关源码和回归用例。

**Interfaces:** demo 初始只创建管理员/学期，生成班级/师生/课程/成绩输入文件；评审/发布/有效行为不得直接 seed。隔离环境提供可注入的确定性 provider 并明确标记，不调付费服务。

- [x] 独立真实 API/UI 闭环：教师导入→班级导入→学生导入→教师配置→60/70/75及默认100→教师自动配卡/直评→学生自评、故事/证书→教师 Excel 成绩/体测、寄语/结算→缺项阻断→班主任确认→更正使确认失效→重审→全校发布→学生/教师阅读冻结报告。
- [x] 使用完整 V2 applicableFields，真实数据驱动所有六育版块；独立夹具逐字段对账，0和不适用独立验证，不用空字段列表或直接更新宽表充数。
- [x] 本机 student_growth 只读审计和完整备份（包含原表/数据），之后执行显式追加 migration，记录前后表结构、回填数、幂等检查；迁移不混入演示学生。
- [x] 为新表生成合理独立测试数据，保留可重演 demo 及输入；修复每项问题并记录复现/根因/修复/验证证据。
- [x] 后端全套、前端 test/lint/build、相关浏览器回归一次完整通过后再进入 MCP；基线已有失败仍需明确记录并评估修复。

### Task 6: MCP 三角色演示与最终审阅交付

**Files:** `docs/delivery/admin-closure/demo-script.md`, `README.md`, `verification.md`；截图/日志/CSV/报告在 `output/report-core/admin-closure/`。

- [x] 初始化独立演示库和专用服务，MCP 从实际登录页依次完成管理员导入、教师日常、学生参与、班主任审核、管理员发布、学生本人和教师本班报告回看。
- [x] 所有 MCP 业务操作走真实 UI，API 自动化和只读 DB 对账独立标注；每步标注角色、入口、输入、操作、预期、实际与截图，遇失败修复并重演相关步骤。
- [x] 检查真实报告打印/导出与六育字段、来源、发布版本，确认没有将示例模型当生产能力或将自动化操作冒充 MCP。
- [x] 独立全量差异审阅，修复重要问题后做针对性复测；更新模块分析、migration/seed用法、测试结果与复演说明，交付实际可用入口。

## Execution authorization and recovery

用户已明确“方案可以了…开始实现”，不再请求计划确认。采用本会话逐任务子代理实现与独立审阅，Task 5–6 由控制器集成验证及操作 MCP。单次只派一个实施者，避免共享工作区冲突；控制器可同时只读检查、准备测试环境和审阅包。进度账本保存在本计划专属 `.superpowers/sdd/` 目录，恢复时先读账本，不重做已完成任务。

## 2026-11-01 追加确认：统计以已重构逻辑为准

用户明确“管理员数据统计已经重构过了，应该按照新逻辑”。因此 Task4 保留并使用现有 AdminStatistics/reportCoreAdminStatistics 的卡片、自评、荣誉、故事新统计口径，不再新增 AdminClosureStatistics 页面。完整性/缺项进度接口用于发布中心。此确认覆盖本文前面关于新增统计页面的表述。
