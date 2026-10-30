# Six Education V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户已授权“制定计划后分阶段实施”，本计划落盘后直接由当前执行者实施，不重复申请实施许可。

**Goal:** 在现有报告核心上实现已批准的六育 V2，包括七表迁移、五来源、三类故事、94 位置报告和可恢复统一发布。

**Architecture:** 复用模块化单体、来源账本、权限、宽表、任务租约、发布 fence、React 角色壳。通过学期 schemaVersion 选择 V1／V2 策略，保留 V1 已发布快照解释器；新增故事目录表，作品身份与材料版本分离。先建立可测试契约与安全迁移，再接采集、排名、报告和前端。

**Tech Stack:** React 18、Vite、Express、Node ≥22.12、MySQL 8；node:test、现有 Playwright；受控文档／音频适配器，私有文件卷。

**Spec:** [2026-10-30-six-education-redesign-final.md](../specs/2026-10-30-six-education-redesign-final.md)

## Global Constraints

- 数据入口五种，CARD／IMPORT／CERTIFICATE／SELF／STORY；TEACHER 只作内部教师表单。
- 卡目标 14 项，单次直评／扫码 1 分，负向更正仅一次冲正；不以卡数冒充教师评价／体测。
- 94 位置，11 项自评；1–3 星、A／B／C／D，缺失与真实零值分开。
- 班内同目标竞赛排名，q=(R−1)/N；正分 q<0.20 三星、q<0.60 两星，其余一星，零分一星。
- 听按不同内置故事数、写按有效作品数、讲按最高有效分；独立三榜、同值同名次。
- 作品主记录 STORY/BATCH，材料 STORY/ITEM；正式材料永久 effect_key 唯一，current_version_id 指向当前版本。
- 同校权限与当前任教逐次核验；管理员不默认读取私有报告正文／材料；学校隔离。
- 默认 check／audit，不自动执行生产 DDL；隔离测试库命名 liuyu_report_test_*，不得以真实学生作夹具。
- 不删除旧列、旧报告、未映射数据与源文件；不调用收费模型作为自动化测试依赖。
- 不新增微服务、消息中间件、积分商城、家长账号及跨校总榜。

## Review Focus

1. 首次作品修订后主记录仍有效，子版本不可重复计数，迟到任务不能切换新指针（Task 6）。
2. 别人加／减分及转班会改变本人名次，须一起重算、使确认失效；不可只改当前学生（Task 4、8）。
3. 导入空白不能清空，0 不能消失，预览后变化不能被旧预览覆盖；实际文件需服务端校验（Task 5）。
4. MySQL DDL 隐式提交、升级中断后要可重入，旧卡与历史字段不能无证据伪映射（Task 2）。
5. 浏览器拒绝麦克风、解析／ASR 失败、冻结后迟到结果应可恢复且不得产生虚假分数（Task 6、7、8）。

## 当前基线与执行方式

基线 commit：3459deb。保留所有原有未跟踪文档、原型、output，不纳入本次提交。终端默认 Node 18，改用已存在的 `/Users/quanta/.nvm/versions/node/v22.16.0/bin`；数据库测试使用显式 sandbox escalation 访问本地 MySQL，只创建并清理测试库。使用隔离工作分支／工作区，按阶段提交。先运行 V1 基线并记录原有失败，再实施；最终验收不得把环境拦截当产品通过。

## 文件责任与复用

| 边界 | 复用并修改 | 新增 |
| --- | --- | --- |
| 契约 | reportCorePolicy.js、现有 config 路由 | reportCoreV2Policy.js、reportCoreV2Policy.json、V2 字段映射 |
| 数据库 | runCoreMigrations.js、migrateReportCore.js、app.js 启动核验 | 06_six_education_v2.sql、migrateSixEducationV2.js、V2 schema JSON |
| 事务／统计 | reportCoreStore.js、Projection、Evaluation、ReadModels | reportCoreV2Statistics.js、reportCoreV2Lifecycle.js |
| 导入／权限 | reportCoreImports.js、authorizationService.js、私有文件工具 | reportCoreV2Imports.js（文件解析边界） |
| 故事 | provider、worker、来源表、文件工具 | reportCoreV2Stories.js、reportCoreV2Listening.js、reportCoreV2Library.js、storyMediaAdapter.js |
| 报告 | Publish、ReportBrowser、reportRenderService.js | reportV2Render.js |
| 网页 | RoleShell、index、卡／导入／自评现有组件 | StoryActivities.jsx、V2 报告／编辑状态支持 |
| 验收 | 现有隔离库助手与浏览器脚本 | report_core_v2_*.test.js、V2 浏览器流程、交付验收矩阵 |

以下路径的 backend 文件均相对 backend/services，脚本相对 backend/scripts，前端组件相对 frontend/src/app/reportCore；每项新增文件在步骤中给出完整相对路径。

### Task 1：V2 字段、目录与算法契约（阶段一）

**Files:** Create `backend/config/reportCoreV2Policy.json`, `backend/services/reportCoreV2Policy.js`, `backend/__tests__/report_core_v2_policy.test.js`; Modify `backend/services/reportCorePolicy.js`, `docs/data/six-education-v2-field-map.json`.

**Interfaces:** `policyFor(config) -> catalog`; `rankProcess(rows) -> [{studentId,points,rank,star,population}]`; `storySummary({listenCount,writeCount,tellScore})`; `honorLevel(value) -> {level,points}`. catalog 固定包括 fields、cardCatalog、displayFieldCount、selfFields。

- [x] 写失败测试：14 目标唯一、94 格、11 自评、18+18 智美导入列；导入来源不混卡，劳美有卡，信息科技归智美。
- [x] 写边界测试：N=0/1/10、并列、全零／全正同分、非法负分；讲有效 0 分与未参与分开。
- [x] 执行 `node --test backend/__tests__/report_core_v2_policy.test.js`，确认失败后实现最小契约，保留 V1 导出兼容。
- [x] 重跑 V1 policy 和新测试，更新字段映射计数；提交 `feat: define six education v2 policy`。

### Task 2：七表 schema 与安全、可重入升级（阶段一）

**Files:** Create `sql/06_six_education_v2.sql`, `backend/scripts/migrateSixEducationV2.js`, `docs/database/six-education-v2.schema.json`, `backend/__tests__/report_core_v2_migration.test.js`; Modify `backend/scripts/runCoreMigrations.js`, `backend/scripts/migrateReportCore.js`, `backend/app.js`.

**Interfaces:** `migrateSixEducationV2({connection,targetDb,mode:'check'|'apply'}) -> {version,steps,conflicts}`；默认 check 不写；V1 初始化保持可用，V2 启动校验识别七表和完整约束。

- [x] 失败测试：六表升级后七表；重入无重复；check 不发 DDL；异库／旧44表／部分结构拒绝；主作品指针同校 FK、效果键唯一、星级范围与同班班主任唯一。
- [x] 逐步补列、索引、约束、CORE_V2 enum 和 story_content；每步预检，不使用假事务包裹全部 ALTER。
- [x] 以隔离库演练中断重跑；记录未映射旧来源，不将旧故事文本／卡派生评价冒充 V2 新来源。
- [x] 增只读资产 manifest／来源对账输出与切换说明；测试通过后提交 `feat: add resumable v2 schema migration`。

### Task 3：V2 策略选择、事务阶段和权限（阶段二）

**Files:** Modify Policy、Store、authorizationService、Evaluation、routes/reportCore.js、routes/reportCoreViews.js；Create `backend/services/reportCoreV2Lifecycle.js`, `backend/__tests__/report_core_v2_auth.test.js`.

**Interfaces:** `assertV2Phase(term,{action,actor,submittedAt})`; `withMutation` 接收受控 action、沿用幂等与并发 revision；`policyFor(term.evaluation_config)` 选择当前学期字段与卡目录。

- [ ] 失败测试：跨校／跨班／越学科拒绝；班主任本班完整导入；管理员只管理；V2 自评恰好11项；冻结后旧路由和worker同样拒写。
- [ ] 添加 V2 标量来源写入接口，公共幂等回执与旧调用保持兼容；任教查验使用学期学籍。
- [ ] 阶段变更排他锁、数据变化 data_revision、名单变化 roster_revision；配置采用 V2 白名单。
- [ ] V1 授权和卡测试回归后提交 `feat: enforce v2 scopes and collection lifecycle`。

### Task 4：14 类过程卡、班级排名和跨学生失效（阶段二）

**Files:** Modify Cards、Projection、Store、Evaluation；Create `backend/services/reportCoreV2Statistics.js`, `backend/__tests__/report_core_v2_statistics.test.js`.

**Interfaces:** `loadV2Statistics(connection,{schoolId,termId}) -> {processByStudent,storyByStudent,revision,rosterRevision}`；`rebuildV2Scope(connection,term,scope)` 按班目标更新全部受影响结果和确认状态。

- [ ] 测试实体卡并发只一分、直评至多100人且失败整批回滚、冲正只减一次、不扣重印额度。
- [ ] 测试其他学生变分使本人星级和确认一起失效，转班后按新班比较，真实0与未结算分开。
- [ ] 保留原制卡／PDF／ZIP／凭证加密，换用 V2 卡目录和 V2 排名派生。
- [ ] 运行 cards／ledger 原回归和新增数据库测试；提交 `feat: calculate class ranked process evaluations`。

### Task 5：综合导入、自评、健康、荣誉（阶段三）

**Files:** Modify Imports、Materials、Evaluation、authorizationService、routes/reportCoreFeatures.js；Create `backend/services/reportCoreV2Imports.js`, `backend/__tests__/report_core_v2_imports.test.js`, `backend/__tests__/report_core_v2_honors.test.js`.

**Interfaces:** `parseV2Workbook(buffer,{term,actor}) -> rows/errors`；`previewImport/commitImport` 复用原签名；`honorSummary(records) -> {items:[{name,level}],points}`。

- [ ] 测试500行、10MB、未知表头、重复单元格／身份、公式／宏拒绝、空白不改、0保留、陈旧预览整批409。
- [ ] 服务端解析实际 Excel，受控转换星／等级；保存日期／单位／视力制式，BMI 仅同组合法原值计算。
- [ ] 证书必须审核、五级1–5、同证换图提示／合并、撤销后重算，荣誉 DTO 只有两列；学生11项自评版本互不覆盖。
- [ ] 原导入／自评／证书回归及新测试通过，提交 `feat: implement v2 imports self assessment and honors`。

### Task 6：写／讲作品身份、版本与任务（阶段四）

**Files:** Create `backend/services/reportCoreV2Stories.js`, `backend/services/storyMediaAdapter.js`, `backend/__tests__/report_core_v2_stories.test.js`; Modify Worker、Provider、privateFiles、routes/reportCoreFeatures.js。

**Interfaces:** `submitWork({pool,actor,termId,type,workId,file,text,command})`; `applyWorkResult({pool,job,leaseToken,result})`; `createMediaAdapter({extract,transcribe,transcode,moderate})`，适配器缺失返回可恢复失败，不伪造模型成绩。

- [ ] 写测试：每个材料永久唯一、首版独立 ITEM、修订不增篇、当前指针原子切换、迟到worker拒绝正式回写、撤回后不刷量、每天含修订5次。
- [ ] 加文档类型／大小／字数边界与预览确认；音频实测时长、静音、转码、ASR、评分四项合计与证据校验；外部调用事务外。
- [ ] 每阶段持久结果、90秒租约、30秒超时／3次重试、失败人工复核；讲故事0分有效，故障无分；人工转写更正保留原音与原分。
- [ ] 测试模型结构错／断网／冻结／过期租约及成功重试幂等，提交 `feat: implement versioned writing and speaking activities`。

### Task 7：内置听故事、三榜、经典库与荣誉墙（阶段四）

**Files:** Create `backend/services/reportCoreV2Listening.js`, `backend/services/reportCoreV2Library.js`, `backend/__tests__/report_core_v2_listening.test.js`, `backend/__tests__/report_core_v2_library.test.js`; Modify Statistics、Worker、routes/reportCoreFeatures.js。

**Interfaces:** `startListening/heartbeat/completeListening`；`getV2Rankings({connection,actor,termId,type}) -> {top,me,population,asOf}`；`nominate/decide/publish/withdrawClassic`。

- [ ] 测试100目录完整性、15秒心跳、30秒大间隙不补算、95%覆盖和时长、快进不计、单活动会话、同故事版本只一分。
- [ ] 测试三榜同值并列、讲取最高、只读当前有效材料、榜单脱敏／同校；候选修订不顶替有效原稿。
- [ ] 经典库审核与展示授权分离，管理员只能发布通过的展示副本；同作品库／墙引用、撤回立即失效且不误撤合法成绩。
- [ ] 建资源导入检查命令与明确未提供资源清单；不凭空制造100个已授权音频。测试后提交 `feat: add listening rankings and curated story library`。

### Task 8：94 格报表、寄语、跨学生确认与冻结发布（阶段五）

**Files:** Create `backend/services/reportV2Render.js`, `backend/__tests__/report_core_v2_reports.test.js`; Modify Evaluation、ReadModels、Publish、ReportBrowser、reportRenderService.js。

**Interfaces:** `buildV2ReportModel({evaluation,term,statistics}) -> CORE_V2 DTO`；`renderV2Report(dto) -> html`；fingerprint 包括来源、跨学生统计、名单、配置、规则、模板与寄语版本。

- [ ] 测试94位置、两列荣誉、无参与／不适用／0、BMI；A3横向与长文本续页、HTML转义、历史V1仍可读。
- [ ] 构建V2完整性校验、无证书／未参与故事合法、待办必须解决或明确排除；事实寄语失败可手写。
- [ ] 发布期排他冻结；PREPARED不可见、人数哈希核验、激活原子、取消fence；迟到任务不写冻结版，更正走新版本。
- [ ] 新发布测试和原V1报告／发布回归，提交 `feat: publish immutable six education v2 reports`。

### Task 9：三个角色页面接通（阶段六）

**Files:** Create `frontend/src/app/reportCore/StoryActivities.jsx`; Modify index、Materials、SelfEvaluation、AcademicImport、CardPlan、DirectScore、ClassReports、StudentHome、Teacher、AdminTermSettings、navigation、style.css；Add `frontend/tests/report-core-v2.cjs`。

**Interfaces:** 页面读取 config.schemaVersion／动态 fields／cardCatalog，不在客户端另造评分。复用 api 的 requestKey、版本冲突与登录失效处理。

- [ ] 以模型测试锁定11自评、14卡、V2导航、表格序列化；保留V1页面入口与旧快照。
- [ ] 学生故事页三种独立任务、可访问录音／试听／重录／格式探测、错误草稿保留；榜单和本人指标说明。
- [ ] 教师支持V2完整导入、审核／复核、结算与确认；管理员提供资源校验／阶段／发布／授权展示，不暴露私有材料。
- [ ] 跑 frontend test／lint／build 和隔离浏览器闭环：学生提交→教师审核→榜单→报告确认→管理员发布→学生打印；提交 `feat: connect six education v2 role workflows`。

### Task 10：迁移演练、验收记录与收尾（阶段七）

**Files:** Create `docs/delivery/six-education-v2/验收矩阵.md`, `docs/delivery/six-education-v2/迁移演练.md`; Modify README、deploy/report-core-cutover.md、部署变量示例。

**Interfaces:** 矩阵逐行引用设计第11节，状态只能 PASS／FAIL／NOT_RUN，记录实际命令、输出摘要、夹具和证据路径。

- [ ] 完整Node22后端／前端测试、lint、build，V1回归；隔离MySQL实际执行check／apply／再apply和故障重跑。
- [ ] 隔离浏览器检查桌面／手机录音降级、导入预览、校内权限、长报告打印；实际解析适配器逐格式检查。
- [ ] 不以mock代替真实供应商、100音频版权／完整性、恢复演练或5000人压测；未运行明确列出依赖和剩余验收，产品功能不得伪装通过。
- [ ] 整体代码审阅、修复发现后重跑受影响检查；更新每项复用说明、迁移命令和回退；按阶段提交全部自有变更，保留用户原有文件。

## 设计覆盖自查

设计1–3节→Task1–3、9；4.1→Task4；4.2–4.4→Task5；4.5→Task6–7；4.6→Task7、9；第5节→Task1、4、7；第6节→Task8–9；第7–8节→Task2–3、6；第9节→Tasks3–9路由；第10节→Tasks2–8异常测试；第11节→Task10逐行验收；第12节问题均纳入任务断言。

## 执行记录

- 2026-10-30：计划落盘，尚未开始改产品代码。基线Node18下前端17/18，唯一失败为无全局crypto；后端数据库案例遭sandbox EPERM，不视为产品失败。下一步用已安装Node22与隔离测试库重跑。
