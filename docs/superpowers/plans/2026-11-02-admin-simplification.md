# 管理员三模块与师生闭环重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将管理员精简为学籍账号管理、卡额度管理、数据统计，同时交付教师学期卡管理和学生读取班主任确认报告的完整闭环。

**Architecture:** 统一Excel契约驱动服务端解析、原子导入和只读关系查询；学期配置保存一次性卡初始化状态，正式来源表保存课程额度、二维码卡及幂等事实。教师仅读取和打印已生成卡；班主任确认在同一事务中生成单生PUBLISHED快照，学生和教师报告读取共用最新已发布版本查询。保留正式八表和既有四类统计，删除旧模块的页面与专用写入口。

**Tech Stack:** 现有React 18/Vite、Express 5、MySQL 8、xlsx、bcrypt、qrcode、pdfkit；Node >=22.12，不新增UI框架或运行时依赖。

**Spec:** [2026-11-02-admin-simplification-design.md](../specs/2026-11-02-admin-simplification-design.md)。用户2026-11-02追加明确要求：同步修改教师卡片管理模块、学生报告读取模块；由任务5、6、8落实。

## Global Constraints

- 管理员只保留：学籍账号管理、卡额度管理、数据统计。
- 运行数据只使用student_growth原有正式表，不创建临时库、临时表或第二套学校数据。改动数据前备份。
- 每学期只能成功初始化一次卡片。初始化即该学期卡配置生效，之后无论是否已经领取，都不允许重置、删除、再次初始化或修改额度。
- 默认100、学科空白继承默认、0不生成；额度为张/班/学期。语文60、同一教师三个班=180张，不乘月份。
- 确认与该学生报告快照发布在同一事务内完成；成功后学生即可看到本人报告，不等待管理员，不检查其他学生是否完成，也不冻结整个学校学期。
- 后续数据更正使当前审核失效，但学生保留可读的上一已发布快照；班主任再次确认后产生新版本，旧快照不原地改写。
- 已有师生日常操作、教师体测Excel、班主任寄语和既有四类统计保留；教师菜单名称及顺序保持现状。
- 不运行会创建/删除测试数据库的旧全量后端测试命令。新增验证必须显式选择安全用例及正式表回滚工具，不调用旧setup测试库助手。
- 代码继续提交到feature-six-education-v4。不得覆盖其他并行改动；使用Node 22路径运行检查，按任务提交，完成分支审阅后普通push。

## Review Focus

1. Excel中00123、重复表头、公式或大小写/重音等价账号：保留文本编号，按数据库实际唯一性校验，错误定位到工作表/行/字段，不静默改号或覆盖。任务2、3测试。
2. 预览后另一管理员导入、初始化，或网络超时后重试：拒绝过期差异，重复提交返回原结果，不部分写入或重复发卡；事务死锁后测试工具不得继续自动提交。任务1、3、4测试。
3. 学期首日、截止日及跨月打印：按Asia/Shanghai日界计算，卡片不因换月增发，截止日当天可领、次日不可领；已领取卡不再输出有效二维码。任务4、5测试。
4. 旧月卡、旧冻结报告、未完成的历史PREPARED发布：旧已领卡和积分不变，旧报告可读；不把未发布快照暴露给学生，也不把旧批次重新发成学期卡。任务1、5、6测试。
5. 切换角色/学期时旧请求晚返回，或教师请求其他班的卡及报告：界面不展示前一学期数据；后端拒绝越权，任课教师DETAIL响应不包含班主任私有寄语。任务5、6、7、8测试。

---

## 文件边界与接口约定

所有路径相对仓库根目录。以下新文件的函数均为CommonJS导出（前端为ESM）。`Actor={id,schoolId,role,tokenVersion}`、`Command={requestKey,payloadHash}`沿用现有字符串ID约定；`MutationResult<T>={result:T,replayed?:boolean}`沿用withMutation返回值。

| 文件 | 职责 |
| --- | --- |
| `backend/services/semesterCardPolicy.js`（新） | 12学科常量、纯额度解析、学期卡初始化状态与兼容判定；不发卡 |
| `backend/services/termDates.js`（新） | 从旧配置服务抽取day、monthsOf，供故事等共享使用 |
| `backend/scripts/migrateAdminSimplification.js`（新） | 只读检查/显式apply的数据迁移和备份；不创建新表 |
| `backend/__tests__/helpers/formalRollback.js`（新） | 正式表单事务回滚、错误后封闭连接；禁止建库、DDL和真实服务提交 |
| `backend/services/registryWorkbook.js`（新） | 五表Excel字段契约、模板与纯解析 |
| `backend/services/registryPreview.js`（新） | 绑定学校、操作者、基线和有效期的加密预览票据 |
| `backend/services/reportCoreRegistry.js`（新） | 跨表及数据库校验、原子导入、三个视角只读查询 |
| `backend/routes/reportCoreRegistry.js`（新） | 模板下载、multipart预览、确认导入、只读查询路由 |
| `backend/services/reportCoreSemesterCards.js`（新） | 管理员保存额度、计划汇总、一次性生成全学期卡 |
| `backend/services/reportCoreCourseCards.js`（改） | 教师学期卡列表、二维码分页和打印；移除自动按月生成 |
| `backend/services/reportCorePublishedReports.js`（新） | 同事务冻结发布、单生最新发布查询、已有快照兼容 |
| `backend/services/reportCoreEvaluation.js`等（改） | 班主任确认接发布；师生报告、工作台读取统一发布查询 |
| `frontend/src/app/manager/roster/`（替换） | AdminRegistry、RegistryWorkbookImport、RegistryRelations、registryModel及局部样式 |
| `frontend/src/app/manager/quota/`（替换） | SemesterCardQuota、semesterQuotaModel及局部样式 |
| `frontend/src/app/teacher/cards/`（改） | 学期卡查询、筛选、分页、打印与未初始化空态 |
| `frontend/src/app/student/report/PublishedReport.jsx`（改） | 等待班主任确认、读取单生最新已发布快照 |
| `backend/__tests__/admin_simplification_*.test.js`（新） | 独立安全测试集合，不匹配旧report_core_*.test.js全库脚本 |
| `docs/delivery/admin-simplification/`（新） | 字段要求、职责和交互、迁移记录、验收结果、三角色MCP演示脚本 |

删除清单在任务9执行；共享工具先迁移，不能保留整块旧配置服务来满足单个日期函数引用。统计组件和统计服务复用，只有读卡模式兼容修补，不重新设计统计口径。

### Task 1: 迁移一次性学期卡状态，建立安全的正式表验证方式

**Files:** Create `backend/services/semesterCardPolicy.js`, `backend/services/termDates.js`, `backend/scripts/migrateAdminSimplification.js`, `backend/__tests__/helpers/formalRollback.js`, `backend/__tests__/admin_simplification_migration.test.js`; Modify `backend/services/reportCoreCourseCards.js`, `backend/services/reportCoreTermSettings.js`（共享日期引用）, `backend/scripts/verifyDevelopmentPasswords.js`（复用回滚助手）。

**Interfaces:** Produces `subjects:[{subjectCode,subjectName,categoryCode,targetColumn}]`，从现有CourseCards的12学科目录抽取；`resolveSemesterQuotas(config)->{defaultTotal,subjects:[{subjectCode,total,effectiveTotal,usesDefault}]}`；`day(value)->string|null`, `monthsOf(term)->string[]`。`migrateAdminSimplification({connection,targetDb,mode:'check'|'apply',backupDir})->{ready,changedTerms,blockedTerms,backupPath}`。`withFormalRollback(fn:({pool,connection})=>Promise<void>)->Promise<void>`始终回滚。

- [x] **Step 1: 写失败测试。** `legacy_batches_lock_term_without_changing_card_or_report_rows`断言存在任意旧QUOTA/CARD批次的学期成为`LEGACY_LOCKED`；无批次学期为`DRAFT`；重复迁移changedTerms为0；其他evaluation_config键保留。`rollback_pool_poisoned_after_deadlock`断言第一次查询ER_LOCK_DEADLOCK后getConnection/query均拒绝，底层调用次数=1；回滚前后八表存储行内容相等。
  ```js
  assert.equal(legacyConfig.semesterCards.status, 'LEGACY_LOCKED');
  assert.deepEqual(afterCardAndReportRows, beforeCardAndReportRows);
  ```
- [x] **Step 2: 运行红灯。** `cd backend && node --test __tests__/admin_simplification_migration.test.js`，预期新模块缺失；此测试不得导入旧建库助手。
- [x] **Step 3: 实现上述接口。** 新状态统一为`evaluation_config.semesterCards={version:1,status:'DRAFT'|'INITIALIZED'|'LEGACY_LOCKED',revision:1,defaultTotal:100,quotas:{},initializedAt:null,initializedBy:null,generatedTotal:0}`，旧配置值复制到兼容显示，不更改旧批次。apply前完整SQL备份、0600、SHA256、核实连接student_growth及八张表、事务更新配置；check无写入。遇PREPARING/READY/FAILED等未完发布列入blockedTerms并拒绝apply，不自动激活/丢弃；旧FROZEN/ARCHIVED不解冻。回滚助手拦截内部begin/commit，独占借用整个逻辑事务，任何SQL错误封闭连接；拒绝DDL、CREATE/DROP DATABASE、USE、TRUNCATE和旧setup。真实外层rollback由助手负责。
- [x] **Step 4: 验证绿灯。** 重跑任务测试；再运行`node scripts/migrateAdminSimplification.js`，预期只输出只读迁移清单，不执行--apply；确认没有新增库表。
- [x] **Step 5: 提交。** `git add`本任务Files内已修改文件；`git commit -m "refactor: define semester card state and safe formal verification"`。

### Task 2: 单一五工作表契约、模板及Excel解析

**Files:** Create `backend/services/registryWorkbook.js`, `backend/__tests__/admin_simplification_workbook.test.js`。

**Interfaces:** Produces `registryColumns`（设计文档五表字段）；`buildRegistryTemplate()->Buffer`；`parseRegistryWorkbook(buffer:Buffer)->{term,teachers,classes,students,assignments}`。每行保留`{sheet,rowNo}`，账号统一为字符串；结构/格式错误抛422，安全details为`{errors:[{sheet,rowNo,field,message}]}`。

标准对象字段固定：term为`{academicYear,semester,termName,startDate,endDate,collectionDeadline,nextRegistrationDate,makeCurrent}`；teachers行为`{sheet,rowNo,username,realName,initialPassword}`；classes行为`{sheet,rowNo,grade,classNo,headTeacherUsername,displayName}`；students行为`{sheet,rowNo,username,realName,grade,classNo,initialPassword}`；assignments行为`{sheet,rowNo,grade,classNo,subjectCode,teacherUsername}`。模板密码列表头统一为“初始密码”，“新账号必填”是说明文字，不属于表头；学生账号表头精确为“学号/账号”。可选字段默认值沿用设计表。

- [x] **Step 1: 写失败测试。** `template_roundtrips_five_sheets`断言工作表恰为学期、教师、班级、学生、任教关系；`text_ids_and_dates_are_preserved`断言`00123`不变、2028-02-29正确；`reject_ambiguous_workbooks`覆盖缺表/重名表头/公式/非法日期/两行学期/未知学科、定位字段与真实Excel行号；空白行不计数。
  ```js
  assert.deepEqual(workbook.SheetNames, ['学期', '教师', '班级', '学生', '任教关系']);
  assert.equal(parsed.students[0].username, '00123');
  ```
- [x] **Step 2: 运行红灯。** `cd backend && node --test __tests__/admin_simplification_workbook.test.js`，预期registryWorkbook不存在。
- [x] **Step 3: 实现接口。** 使用现有xlsx；只接收.xlsx，由路由检查扩展名与文件上限10MiB，解析器检查ZIP工作簿/必需表头、合计最多10000数据行、拒绝必需字段公式。账号单元格必须文本，数值账号报错并提示转文本，避免丢失前导零。日期接受ISO文本及Excel日期值，按工作簿1900/1904日期系统解析。年级/班级正整数；学年连续两年、学期1/2；开始日<结束日，采集截止在区间内。新密码约束留给任务3（至少10位），不把示例密码写入仓库。
- [x] **Step 4: 验证绿灯。** 重跑测试，PASS；模板导回解析器得到相同标准字段，输出错误不含原始密码。
- [x] **Step 5: 提交。** `git add backend/services/registryWorkbook.js backend/__tests__/admin_simplification_workbook.test.js && git commit -m "feat: define unified registry workbook contract"`。

### Task 3: 原子导入与只读关系API

**Files:** Create `backend/services/registryPreview.js`, `backend/services/reportCoreRegistry.js`, `backend/routes/reportCoreRegistry.js`, `backend/__tests__/admin_simplification_registry.test.js`; Modify `backend/routes/reportCore.js`, `backend/services/authorizationService.js`（仅需要共享班主任映射适配时）。

**Interfaces:** Consumes任务1、2。Produces `previewRegistry({pool,actor,buffer,now})->{previewToken,expiresAt,term,counts,diffs,errors:[]}`；`commitRegistry({pool,actor,previewToken,command,now})->MutationResult<{termId,counts}>`；`listRegistryRelations({pool,actor,termId,view:'students'|'teachers'|'classes',q,grade,classNo,subjectCode,cursor,limit})->{rows,total,nextCursor}`。counts包含teachers/classes/students/assignments四组，每组为`{created,updated,skipped}`。预览票据`sealRegistryPreview(payload,{actor,now})->string`与`openRegistryPreview(token,{actor,now})->payload`仅此业务使用。

- [x] **Step 1: 写失败测试。** `one_workbook_initializes_all_relations_atomically`在正式表回滚内断言同校唯一学期、2教师、3班、1学生、18实际任教关系及单生评价建立；班主任仅映射不自动加学科。`duplicate_import_preserves_password_and_evaluation`断言bcrypt原hash、已有自评和来源不变，遗漏行不删除；`equivalent_usernames_and_role_conflicts_rejected`含T001/t001与重音等价账号；`stale_preview_and_locked_relations_rejected`断言基线变化409、初始化后关系变更423、相同内容可幂等返回。`invalid_reference_rolls_back_everything`覆盖跨校、停用教师、重复班科、无班级及故意中途异常；预览前后八表行无变化。`preview_ticket_is_actor_bound_expiring_and_private`覆盖篡改、30分钟过期、异校/异操作者、返回值和来源事实不泄露密码。
  ```js
  assert.equal(result.result.counts.assignments.created, 18);
  assert.equal(afterExistingUser.password, beforeExistingUser.password);
  assert.deepEqual(afterFailedCommitRows, beforeFailedCommitRows);
  ```
- [x] **Step 2: 运行红灯。** `cd backend && node --test __tests__/admin_simplification_registry.test.js`，预期模块/路由缺失。
- [x] **Step 3: 实现服务接口。** 预览只读，AES-256-GCM票据使用JWT_SECRET派生的独立用途密钥，绑定schoolId/actorId/tokenVersion，30分钟TTL，包含文件hash、DB基线、标准行和新账号bcrypt hash（cost10），标准化载荷上限2MiB避免超过现有JSON请求限制；开发明文只以独立加密字段置于票据，提交时沿用developmentPasswords.writePassword，生产不保存。不持久化上传文件/预览明文密码。按MySQL实际collation比对账号。提交自行开事务，不用依赖已有termId的withMutation来创建目标学期：锁同校学期按ID顺序、重验actor、预览基线与卡状态，建立/更新目标学期、账号、班级、实际课程和评价，最后同事务保存IMPORT事实及CMD结果；唯一键竞争转409。只替换文件明确提供的班科教师，不删除遗漏关系；班主任存school_class.responsible_teacher_id。已有学期不能借导入修改固定评分规则；发卡后拒绝日期/归属/任教变更。整份重复文件返回前次结果，仍复核当前操作者身份；现有密码永不重置。
- [x] **Step 4: 挂载路由。** `GET /admin/report-core/registry/template`返回xlsx；`POST /admin/report-core/registry/preview`接multipart file；`POST /admin/report-core/registry/commit`接previewToken/requestKey；`GET /admin/report-core/registry/relations`接查询条件。全部requireRole(manager)、private,no-store；错误不回显票据或密码；每页25/50/100并沿用绑定过滤条件的cursor。返回关系行仅安全身份和班级/学科，不返回users整行。
- [x] **Step 5: 验证绿灯。** 重跑任务测试，全部PASS且rollback后无残留行；HTTP教师/学生访问403，跨校ID不泄露，分页切换条件拒绝旧cursor。
- [x] **Step 6: 提交。** `git add`本任务Files内实际改动；`git commit -m "feat: import term registry atomically from one workbook"`。

### Task 4: 管理员一次性生成全学期二维码卡

**Files:** Create `backend/services/reportCoreSemesterCards.js`, `backend/__tests__/admin_simplification_semester_cards.test.js`; Modify `backend/routes/reportCoreCourseCards.js`, `backend/services/reportCoreCards.js`（课程卡兼容守卫）。

**Interfaces:** Consumes任务1状态及任务3关系。Produces `getSemesterCardSettings({pool,actor,termId})->{status,revision,defaultTotal,subjects,teacherCount,courseCount,plannedTotal,generatedTotal,usedTotal,unusedTotal,canEdit}`；`saveSemesterCardSettings({pool,actor,termId,expectedRevision,defaultTotal,quotas,command})->MutationResult<{revision}>`；`initializeSemesterCards({pool,actor,termId,expectedRevision,command,now})->MutationResult<{status:'INITIALIZED',generatedTotal,teacherCount,courseCount}>`。subjects额外包含实际课程/教师数量。

- [x] **Step 1: 写失败测试。** `three_chinese_classes_generate_180_for_one_teacher`断言60×3=180，不按月份乘；`defaults_blank_zero_and_invalid_quotas`断言默认100、空白继承、0不发，负数/小数/NaN/10001/未知科目422；`initialization_is_atomic_once_and_replayable`断言成功后新请求423、原requestKey返回原结果、hash不同409、额度写423，中途失败无卡及状态残留；`empty_or_disabled_assignments_cannot_initialize`不锁死空学期。`term_dates_define_validity`断言上海首日00:00含、截止次日00:00不含。`concurrent_attempts_have_one_logical_winner`在独占借用的回滚池中并发调用，断言一次成功及一次423；另以两条真实连接在现有学期行验证FOR UPDATE阻塞，双方只回滚，明确此项验证锁行为而非真实提交竞态。
  ```js
  assert.equal(chineseCards.length, 180);
  assert.equal(replayed.result.generatedTotal, initialized.result.generatedTotal);
  assert.equal(state.semesterCards.status, 'INITIALIZED');
  ```
- [x] **Step 2: 运行红灯。** `cd backend && node --test __tests__/admin_simplification_semester_cards.test.js`，预期semester service缺失。
- [x] **Step 3: 实现服务。** withMutation使用学期exclusive锁，先校验manager、SIX_EDU_V2、DRAFT及expectedRevision；保存只改semesterCards配置并递增revision。初始化在锁内重读启用教师和实际班科，创建`QUOTA.payload.mode='COURSE_SEMESTER'`、按班科唯一业务键`['SEMESTER_COURSE_QUOTA',schoolId,termId,grade,classNo,subjectCode]`；卡沿用CARD、parent_id、record_ordinal、token_hash与现有CORE_V1加密AAD，month_key置NULL，有效期取学期日期。每卡delta=1，subject和target来自任务1目录。全量卡及INITIALIZED状态同事务提交；配置请求不自动发卡。旧卡state为LEGACY_LOCKED时只读汇总，拒绝初始化。以服务端状态阻断旧savePlan/generate/void等对已初始化学期的替代变更，合法撤回奖励事实仍保留原有审计规则。
- [x] **Step 4: 挂载API。** 管理员`GET/PUT /admin/report-core/semester-card-settings`及`POST /admin/report-core/semester-cards/initialize`；PUT接expectedRevision/defaultTotal/quotas，POST接expectedRevision。没有reset/delete路由。初始化响应只含汇总，不泄露卡token。
- [x] **Step 5: 验证绿灯。** 重跑任务测试PASS；SQL断言所有卡owner与班科一致、无重复ordinal、state与卡片完整性一致。批量发卡使用有界批量INSERT并保持单事务；不加未证实必要的新表/索引。
- [x] **Step 6: 提交。** `git add`本任务Files内实际改动；`git commit -m "feat: initialize all semester cards exactly once"`。

### Task 5: 教师卡片读取、打印与学生领卡改为学期模式

**Files:** Modify `backend/services/reportCoreCourseCards.js`, `backend/services/reportCoreCards.js`, `backend/services/reportCoreLedger.js`, `backend/services/reportCoreAdminStatistics.js`, `backend/routes/reportCoreCourseCards.js`; Create `backend/__tests__/admin_simplification_card_reading.test.js`。

**Interfaces:** Preserves `listCourseCards`, `getCourseCardPage`, `getCourseCardPrint`, `buildCourseCardPdf`现有参数，移除必填monthKey，统一按termId+grade+classNo+subjectCode读取。列表新增`{initializationStatus,courses}`；courses保留key、grade、classNo、subjectCode、subjectName、total、used、available，不再返回canSync。保留previewCard/redeemCard的token调用契约。

- [x] **Step 1: 写失败测试。** `teacher_reads_only_initialized_owned_semester_courses`断言未初始化空列表、打印422，越班越科403；`changing_month_never_creates_cards`跨月查询/打印后CARD数量不变；`used_card_has_no_claim_url_or_qr`与重复领取拒绝；`legacy_month_cards_remain_readable_without_regeneration`覆盖多个旧月批次按学期合并；`semester_mode_enforces_class_on_redemption`断言异班学生403、合法学生只加1分；`admin_four_statistics_use_facts_not_generation`断言生成180但仅领取1时奖励数=1。截止日边界覆盖前述有效期。
  ```js
  assert.equal(usedCard.claimUrl, null);
  assert.equal(usedCard.qrDataUrl, null);
  assert.equal(afterReadCardCount, beforeReadCardCount);
  ```
- [x] **Step 2: 运行红灯。** `cd backend && node --test __tests__/admin_simplification_card_reading.test.js`，预期缺monthKey或新mode未校验失败。
- [x] **Step 3: 改造读取和领取。** 新mode及COURSE_SUBJECT旧mode都执行同样班级/学科/owner权限，教师页按学期聚合历史月批次并保留唯一卡ID；二维码有效性和PDF/打印服务复用原实现，按批次与ordinal稳定排序。NULL month_key的学期卡统计不被月过滤无意排除，日期筛选继续使用实际领取effective_at；绝不把生成数作为奖励数。删除syncCourseCards实现与导出、教师sync写路由；旧设置写接口由任务9清除。
- [x] **Step 4: 验证绿灯。** 重跑任务测试PASS；预览二维码/PDF与实际领卡token一致；读取、筛选和打印前后存储行不变。
- [x] **Step 5: 提交。** `git add`本任务Files内实际改动；`git commit -m "refactor: read print and redeem semester course cards"`。

### Task 6: 班主任确认即发布，师生读取单生最新快照

**Files:** Create `backend/services/reportCorePublishedReports.js`, `backend/__tests__/admin_simplification_publishing.test.js`; Modify `backend/services/reportCoreEvaluation.js`, `backend/services/reportCoreReportBrowser.js`, `backend/services/reportCoreReadModels.js`, `backend/services/reportCoreV2Lifecycle.js`, `backend/services/reportCoreStore.js`, `backend/routes/reportCoreFeatures.js`。

**Interfaces:** Produces `publishConfirmedReport(c,{actor,studentKey,term,evaluation,fingerprint})->{reportId,version,publishedAt}`，必须使用调用方事务且不commit；`findLatestPublishedReport(c,{schoolId,termId,studentId,reportId?})->row|null`；`getPublishedReport({pool,actor,termId,studentId,reportId?})->原current接口格式|null`。confirmReport原参数不变，result增加reportId/version/publishedAt；保留确认前的revision、fingerprint、FULL版面复核和必填校验。

- [x] **Step 1: 写失败测试。** `head_confirmation_publishes_only_this_student`断言CONFIRMED及PUBLISHED同事务、第二个未完学生不阻断、学期不FROZEN；插入快照失败则确认也回滚。`student_reads_latest_published_excluding_prepared`构造旧release_version大于新版本、PREPARED版本更大，仍选最新PUBLISHED的version；含显式旧reportId打印。`correction_keeps_old_snapshot_until_reconfirmation`断言内容更正后草稿失效但旧快照hash不变，再确认版本+1。`confirmation_retry_does_not_duplicate_snapshot`涵盖相同command及相同fingerprint新command；`teacher_detail_never_leaks_head_comment`检查JSON/HTML均无寄语；`wrong_head_and_stale_layout_rejected`覆盖换班主任/旧documentKey/来源更新。
  ```js
  assert.equal(published.id, confirmation.result.reportId);
  assert.equal(published.snapshot.fingerprint, confirmation.result.fingerprint);
  assert.equal(afterCorrectionPublished.id, published.id);
  ```
- [x] **Step 2: 运行红灯。** `cd backend && node --test __tests__/admin_simplification_publishing.test.js`，预期没有确认即发布行为。
- [x] **Step 3: 实现冻结发布。** 在confirmReport已有学期/学生锁中，更新确认后调用publishConfirmedReport；按学生所有历史MAX(version)+1，source_revision/fingerprint绑定来源。release_key=stableHash(['HEAD_CONFIRM',schoolId,termId,studentId,revision,fingerprint])，release_version使用该学生新version，仅作兼容元数据，不改全校active_release_version。同fingerprint和来源revision已有PUBLISHED则复用。快照复用现有renderPrintableA4渲染FULL/DETAIL_ONLY、renderedDetailHash/snapshot_hash与94字段；published_at非空满足约束，DETAIL去私有字段。current、print、教师报告列表/明细和工作台published计数都用统一单生最新PUBLISHED查询，不再按全校release过滤。
- [x] **Step 4: 调整生命周期。** 新导入学期标记`reportPublicationMode:'HEAD_CONFIRM'`，不依赖管理员phase切换；仍按上海采集截止控制学生新增/直评/领卡，教师核对、结算、寄语及确认在截止后可用。历史FROZEN/ARCHIVED保持只读；既有发布接口由任务9删除。来源更正沿用现有投影使审核失效，不更改term_report。confirmReports逐个成功后立即可见，保留partial成功/blocked返回语义。
- [x] **Step 5: 验证绿灯。** 重跑任务测试PASS；用实际报告渲染检查94字段与两页结构，DETAIL_ONLY不带班主任评语；按学生school/term范围读取，学生访问别人报告403。
- [x] **Step 6: 提交。** `git add`本任务Files内实际改动；`git commit -m "feat: publish student report on head teacher confirmation"`。

### Task 7: 三模块管理员界面与统一导入工作台

**Files:** Create `frontend/src/app/manager/roster/{AdminRegistry.jsx,RegistryWorkbookImport.jsx,RegistryRelations.jsx,registryModel.js,registryModel.test.js,registry.css}`, `frontend/src/app/manager/quota/{SemesterCardQuota.jsx,semesterQuotaModel.js,semesterQuotaModel.test.js,semesterQuota.css}`; Modify `frontend/src/app/manager/index.jsx`, `frontend/src/app/core/{navigation.js,navigation.test.js,RoleShell.jsx}`, `frontend/src/app/index.jsx`。

**Interfaces:** Consumes任务3、4API。`AdminRegistry({ctx})`和`SemesterCardQuota({ctx})`沿用ctx.termId/error/notify/navigate/refresh/reloadTerms约定；在index.jsx新增`ctx.selectTerm(nextTermId:string)->void`，执行离开检查、setTermId及当前路由更新。成功导入先await ctx.reloadTerms()再ctx.selectTerm(result.termId)，不向现有单参数navigate传入未定义选项。`buildInitializeSummary(settings)->{teacherCount,courseCount,total,warning}`；`registryQuery({view,q,grade,classNo,subjectCode,cursor})->string`；前端不重复维护Excel字段契约，下载和说明来自任务3模板契约。

- [x] **Step 1: 写失败测试。** navigation断言manager恰为`[['roster','学籍账号管理'],['quota','卡额度管理'],['statistics','数据统计']]`，旧releases/classes/config/audit路由回roster；保留学生5菜单及教师6菜单。模型断言默认100、60×3=180、0不生成、INITIALIZED/LEGACY_LOCKED不可初始化；查询变更清cursor，切term清预览。
  ```js
  assert.deepEqual(navigation.manager.map(x => x[1]), ['学籍账号管理', '卡额度管理', '数据统计']);
  assert.equal(routeForRole({role:'manager',page:'releases'}, 'manager').page, 'roster');
  ```
- [x] **Step 2: 运行红灯。** `cd frontend && node --test src/app/core/navigation.test.js src/app/manager/roster/registryModel.test.js src/app/manager/quota/semesterQuotaModel.test.js`，预期旧导航断言失败/新模块缺失。
- [x] **Step 3: 实现学籍界面。** 以已展示静态预览的绿色米白视觉落地，单文件→跨表检查→差异确认；错误带工作表/行/字段，失败可重新选择，确认前不写数据。学生/教师/班级三个只读视角、姓名账号/年级/班级/学科筛选及分页；不提供手工账号、班级、关系维护。成功后刷新学期列表并切到返回termId；支持无可选学期时直接上传初始化文件。所有读取AbortController，晚返回不覆盖新学期状态；上传/提交期间防重复操作。
- [x] **Step 4: 实现额度界面。** 12学科输入、默认100、预计教师/课程/总量、只读初始化结果；只有保存配置和初始化操作。初始化按钮先保存有效未保存配置，再显示服务端返回计划/版本确认框；确认文案精确为“本学期只能初始化一次，确认后不能重置或修改额度”，默认焦点取消，可Esc关闭并还原焦点。确认提交expectedRevision，409/423刷新并提示，不静默用新总量初始化。已初始化所有额度输入只读，无重置/删除入口；旧学期标注历史批次且不重新生成。
- [x] **Step 5: 验证绿灯。** 上述测试PASS，再`npm test && npm run lint && npm run build`。用MCP核对1440和390宽度、只读表格、键盘确认/取消、取消不请求初始化、错误与空态；窄屏仅表格容器内横向滚动。
- [x] **Step 6: 提交。** `git add`本任务Files内实际改动；`git commit -m "feat: simplify administrator workspace to three modules"`。

### Task 8: 教师学期卡界面与学生报告阅读界面

**Files:** Modify `frontend/src/app/teacher/cards/{CourseCards.jsx,courseCardPrint.js,courseCards.css}`, `frontend/src/app/student/report/PublishedReport.jsx`, `frontend/src/app/teacher/reports/ClassReports.jsx`, `frontend/src/app/core/RoleShell.jsx`; Create `frontend/src/app/teacher/cards/{semesterCardsModel.js,semesterCardsModel.test.js}`, `frontend/src/app/student/report/{publishedReportModel.js,publishedReportModel.test.js}`。

**Interfaces:** Consumes任务5、6。`courseCardsQuery({termId,grade,classNo,subjectCode,status,q,page})->string`不含monthKey；`canPrintSemesterCards({initializationStatus,available})->boolean`仅INITIALIZED/LEGACY_LOCKED且available>0可打印；`reportEmptyMessage()->'等待班主任确认'`；`publishedDocumentKey(report)->string|null`以termId/studentId/id/version组合识别已发布文档，无报告返回null；保留courseCardPrint现有渲染入口和二维码数据结构。

- [ ] **Step 1: 写失败测试。** `semester_card_query_has_no_month_or_sync`断言URL按学期查询、不含monthKey；`uninitialized_cards_show_waiting_state`断言打印不可用；`published_empty_state_names_head_confirmation`断言空态等待班主任；`report_selection_uses_published_identity`断言同学生新reportId/version才替换当前已发布文档，不用草稿revision/全校active版本代替。
  ```js
  assert.equal(courseCardsQuery({termId:'2',page:1}).includes('monthKey'), false);
  assert.equal(reportEmptyMessage(), '等待班主任确认');
  ```
- [ ] **Step 2: 运行红灯。** `cd frontend && node --test src/app/teacher/cards/semesterCardsModel.test.js src/app/student/report/publishedReportModel.test.js`，预期新模块缺失。
- [ ] **Step 3: 改造教师卡片页。** 删除月份选择、默认月份、canSync effect、自动POST与月份header portal；改用学期上下文，按班级/学科筛选、卡号搜索、状态分页、预览/打印/PDF，已领取/过期无有效二维码。未初始化明确显示“等待管理员初始化本学期卡片”。教师菜单继续叫积分卡管理。切term撤销旧读取和打印预览，下载参数同任务5。
- [ ] **Step 4: 改造报告读取。** 学生current接口按任务6读取本人最新发布快照，无报告显示“等待班主任确认”；现有快照打印/阅读直接使用冻结文档，来源更正不使它消失。班主任确认成功后教师页提示“已确认并发布，学生可查看”；任课教师冻结明细使用published版本，不显示未审核草稿为已发布。切用户/学期立即清理旧文档，晚返回不恢复。
- [ ] **Step 5: 验证绿灯。** 上述模型测试PASS，`cd frontend && npm test && npm run lint && npm run build`。MCP验证教师页面无月份及自动发卡请求、学期切换和打印；学生在班主任确认前/后、来源更正/再次确认四个状态正确。
- [ ] **Step 6: 提交。** `git add`本任务Files内实际改动；`git commit -m "refactor: align teacher cards and student reports with semester workflow"`。

### Task 9: 删除旧模块、专用接口及失效引用

**Files:** Delete `frontend/src/app/manager/releases/{ManagerWorkspace.jsx,V2Administration.jsx,ClassProgress.jsx}`, `frontend/src/app/manager/config/{AdminTermSettings.jsx,NewTerm.jsx,termSettingsModel.js,termSettingsModel.test.js}`, `frontend/src/app/manager/audit/AdminAudit.jsx`, `frontend/src/app/manager/classes/AdminClasses.jsx`, `frontend/src/app/manager/roster/{AdminRoster.jsx,AdminDataImport.jsx,AccountMaintenance.jsx}`, `frontend/src/app/manager/quota/{AdminQuota.jsx,SubjectCardQuota.jsx}`, `frontend/src/app/manager/health/AdminHealth.jsx`（如确认无共享调用）。Delete `backend/routes/{reportCoreAdminOps.js,reportCoreAdminClasses.js}`, `backend/services/{reportCoreAdmin.js,reportCoreTermSettings.js,reportCoreAdminOps.js,reportCoreAdminClasses.js,reportCoreAdminProgress.js,reportCoreAdminData.js,reportCoreQuotaBatch.js,reportCorePublish.js}`（共享代码先迁移）。Modify `backend/routes/{reportCore.js,reportCoreFeatures.js,reportCoreViews.js,reportCoreV2.js}`, `backend/services/{reportCoreImports.js,reportCoreCards.js,reportCoreV2Lifecycle.js}`, `frontend/src/app/core/{style.css,index.js}`, `backend/package.json`, `backend/scripts/verifyDevelopmentPasswords.js`；更新引用旧接口的测试和演示脚本。Create `backend/__tests__/admin_simplification_surface.test.js`。

**Interfaces:** Produces最终仅任务3、4的管理员维护API及原统计API。保留来源/CMD/AUDIT写事实、师生ledger、教师综合成绩上传、认证和公开学期读接口。`reportCorePublish.getPublishedReport`调用全部改任务6；日期改任务1；rosterImpact所需投影逻辑迁入任务3或现有projection，不保留旧手工维护服务。

- [ ] **Step 1: 写失败测试。** `retired_routes_are_absent`以manager身份访问发布begin/prepare/activate/resume/cancel、readiness、phase、term-settings、手工assignments、班级imports/teachers/transfers、accounts状态/密码、terms/create/current、audits/progress、旧course-card-settings写和sync、旧quota保存/plan/generate/批量配额，全部404；新三模块API有效。`legacy_registry_import_cannot_bypass_lock`断言旧ROSTER/HEALTH/ASSIGNMENTS管理导入不再可用，教师ACADEMIC及文件体测上传仍有效。`retired_source_modules_have_no_live_imports`扫描产品代码不存在对删除文件的引用。
  ```js
  assert.equal((await fetch(base + '/admin/report-core/readiness?termId=1', {headers:managerHeaders})).status, 404);
  assert.deepEqual(danglingProductImports, []);
  ```
- [ ] **Step 2: 运行红灯。** `cd backend && node --test __tests__/admin_simplification_surface.test.js`，预期现存旧路由使测试失败。
- [ ] **Step 3: 清理旧页面和路由。** 按Files清单删除；抽取实际被复用的只读工具再删除旧文件；RoleShell icons/pageTitles/ManagerModule exports与专用CSS同步清理。旧通用imports只保留教师学术/体测路径，明确拒绝旧管理员名单、职责和健康维护入口。去除旧配额生成/计划函数及无调用导出；独立单卡作废不能绕过本学期不可删除规则，合法撤回评分保留。
- [ ] **Step 4: 清理回归和文档入口。** 删除只测试已撤功能的用例，保留并迁移授权/幂等/隐私/渲染等仍适用回归，移到安全测试集合或纯mock；更新verifyDevelopmentPasswords使用新导入、不再调用已删reset/audit服务。旧交付文档加历史说明链接新文档，不修改真实历史迁移SQL。更新package description去掉“全校统一发布”，为安全验证添加`test:admin-simplification`脚本；默认旧测试脚本若仍需建库不得在本次执行。
- [ ] **Step 5: 验证绿灯。** surface测试PASS；`rg`检查删除组件名、旧服务require、旧接口客户端引用均无产品命中；`cd frontend && npm test && npm run lint && npm run build`成功。统计四标签名称/筛选和数据口径与重构前基线一致。
- [ ] **Step 6: 提交。** `git add`本任务变更与删除清单；`git commit -m "refactor: remove retired administrator workflows and references"`。

### Task 10: 正式迁移、闭环验收、MCP三角色演示和交付

**Files:** Create `backend/scripts/verifyAdminSimplification.js`, `backend/scripts/adminSimplificationFixtures.js`, `backend/__tests__/admin_simplification_closure.test.js`, `docs/delivery/admin-simplification/{README.md,excel-format.md,migration.md,verification.md,mcp-demo.md}`; Modify `backend/scripts/runAdminClosureDemo.js`（正式库运行保持）、`docs/delivery/admin-closure/formal-database.md`（新流程入口）。忽略目录`output/report-core/admin-simplification/`保存私有备份、xlsx和截图。

**Interfaces:** `verifyAdminSimplification()->Promise<{checks,unchangedStoredRows}>`调用任务1安全回滚工具及新业务接口，覆盖整个新学期导入→师生日常事实→报告发布。`buildAdminSimplificationFixtures({academicYear,semester,dates,credentials})->{workbook,teacherScoreWorkbook,expected}`复用现有adminClosureFixtures的60教师字段及11自评约束，不嵌入真实密码。

- [ ] **Step 1: 写闭环失败测试。** `import_to_daily_records_to_published_six_education_report`断言导入2教师/3班/1学生/18课程，额度60/70/75和其余100合计1515（林1080、徐435），领卡1+直评1后相应raw=2，自评11、故事及荣誉事实、教师成绩/体测导入、结算与寄语，班主任确认后学生读取94字段两页报告；任课教师无私有寄语、四类统计与事实一致。准备故意错误文件验证全单回滚；再重试正确文件成功。
  ```js
  assert.equal(initialization.result.generatedTotal, 1515);
  assert.equal(published.studentId, student.id);
  assert.equal(reportCellCount, 94);
  assert.deepEqual(afterRollbackStoredRows, beforeStoredRows);
  ```
- [ ] **Step 2: 运行红灯。** `cd backend && node --test __tests__/admin_simplification_closure.test.js`（本任务同时创建该测试），预期闭环未齐或fixture未实现时失败；不调用旧临时数据库setup。
- [ ] **Step 3: 实现回滚闭环验证并完成实际迁移。** 验证脚本读取正式库，测试数据只在外层事务中可见，结束存储行hash一致。迁移先check、备份并校验SHA256，确保无blockedTerms后显式--apply；复查八表、已领卡、积分、历史报告数量与hash保持，迁移只改变目标学期配置键。记录备份路径和恢复命令但不自动还原；无新表时明确交付为数据/配置迁移，不虚构DDL。
- [ ] **Step 4: 验证绿灯并运行安全验收命令。** `cd backend && node --test __tests__/admin_simplification_*.test.js`及`node scripts/verifyAdminSimplification.js`全部PASS；`cd frontend && npm test && npm run lint && npm run build`全部成功。需要数据库/本地端口权限时按工具申请沙箱升级，不更换测试库。每个失败先定位根因、加对应断言、修复、复跑相关用例；在verification.md逐项记录“问题→修复→验证证据”，不把取消/跳过记为通过。
- [ ] **Step 5: 用MCP验收实际浏览器。** 使用正式student_growth上的管理员/教师/学生账号操作localhost:19981。先只读核对现有旧学期锁定及历史报告；新导入、初始化和日常行为演示使用同一学校的待初始化学期，只有完整演示数据已准备且该学期确认为待初始化才执行一次初始化，不删除或重置任何旧卡。若演示时间不在采集期，优先复用有效日期的既有演示学期；否则使用带明确演示标识、仅localhost可启用且默认关闭的固定clock运行配置，不修改正式学期真实日期或放开生产截止校验。在演示前备份，完成后保留一套可重复查看的演示结果，不创造第二学校或临时库。
- [ ] **Step 6: 编写可复演脚本及证据。** mcp-demo.md按管理员→教师→学生顺序列出：登录、下载/上传五表、错误定位和确认、只读关系、额度60/70/75及100默认、取消再确认一次初始化、教师学期卡筛选打印、学生领取/自评/故事/奖状、教师评审/综合成绩及体测/结算/寄语/版面复核确认、学生最新报告与管理员四类统计。每步写路径、输入、MCP点击目标、预期结果及不可重做的初始化提示；为等待班主任确认→确认即发布的依赖，明确安排角色再次切换。演示发起新账号/凭证变更时遵循MCP接管规则；凭证保存在本机忽略文件，不进脚本正文。保存三个角色关键页和确认/报告截图，最终回复嵌入截图。
- [ ] **Step 7: 交付与提交。** README写模块职责、数据流、API和清理清单；excel-format写五表精确字段/文本账号/日期/重导入/错误示例；migration与verification只记录实际结果。检查`git diff --check`与无敏感文件入库，提交`feat: verify and document simplified administrator closure`。按选定执行方式完成独立整分支审阅，修复实际问题并复验，最后普通push至origin/feature-six-education-v4，记录远端commit。

## 自查结果与执行顺序

- 覆盖：统一导入/只读关系→任务2、3、7；一次性额度→任务1、4、7；教师学期卡→任务5、8；班主任确认和学生读取→任务6、8；统计→任务5、9、10；删除旧模块→任务9；迁移及三角色演示→任务1、10。
- 五项Review Focus均有上述明确测试归属；统计代码不无故重写。任务10回滚验证与实际MCP提交分开记录，不声称回滚测试等同真实持久化演示。
- 接口名与状态统一使用semesterCards、DRAFT/INITIALIZED/LEGACY_LOCKED、defaultTotal；新卡COURSE_SEMESTER，旧卡COURSE_SUBJECT只读兼容；新发布仅按学生version，不混用全校active_release_version。
- 顺序：1→2→3→4→5→6→7→8→9→10。任务间先保证接口和回归通过再继续，不为节省时间跳过旧模块调用清理或师生端修改。
- 推荐Native执行：导入、发卡和发布共同依赖正式库事务及权限边界，由同一实施者连续完成10项任务可减少接口偏差；结尾再做独立整分支审阅。若用户选择Subagent-driven，则按技能逐任务交接实现与审阅，沿用本计划接口。
