# 三角色界面、卡片台账与班级报告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认原型实现为真实三角色工作流，补齐卡片追溯和班级报告，安全移除退役代码并保持六类输入到全校发布的闭环。

**Architecture:** 复用React/Express与六张核心表，在现有report-core入口内替换角色页面，新增少量聚合读取服务。卡片和报告查询各有一个服务；权限、来源投影、幂等、报告确认与全校发布继续由现有后端执行。先形成可运行的新页面再按依赖清单删除旧代码。

**Tech Stack:** React 18、Vite、原生CSS/SVG、Express 5、MySQL 8、node:test、现有Playwright回归；Node.js ≥22.12。

**Spec:**
- `docs/superpowers/specs/2026-10-28-three-role-ux-and-cleanup-design.md`
- `docs/superpowers/specs/2026-10-28-teacher-card-ledger-design.md`
- `docs/superpowers/specs/2026-10-29-class-report-browser-design.md`
- `docs/superpowers/specs/2026-10-29-admin-three-menus-design.md`
- `docs/superpowers/specs/2026-10-29-admin-term-configuration-design.md`
- 可点击视觉参考：`docs/ui-prototype/three-role-design/index.html`，仅作布局参考，禁止把虚构数据、内存保存或toast代入正式业务。

## Global Constraints

- 学生三个主导航“首页 / 月度故事 / 我的档案”；教师四个“工作台 / 评价录入 / 卡片管理 / 班级报告”；管理员五个“发布中心 / 学籍与账号 / 体测原始值 / 月度卡额度 / 学期配置”。
- 教师快速直评单页展示全部区域：先学生多选，再六育→一级→二级，评价说明选填；每人每次1分。
- 劳美/故事不参与卡式直评；37种现有卡指标不增不减；音乐美术各三个教师卡指标分别记分。
- 13个固定星级自评 + 已认定特长逐项自评 + 七项学生文字；家长寄语可选，自评他评不能互改。
- 每月读、听、讲各1–3篇文本，整月提交；TXT≤64KB且UTF-8，每篇≤20000字；篇数不加权。
- 沿用六表，不新建分类、指标值、卡库存、统计、导出任务表；不DROP旧业务库或修改真实上传资料。
- 教师获配额度与学生领取分开；纸卡和无卡直评分开；补打原码不产生新卡或新积分。
- 班级报告范围为当前教师负责的全部班级；任课教师仅获完整六育明细，班主任另获正面、自述寄语与确认；管理员无正文权限。
- 导出报告使用浏览器打印面板另存PDF；六育明细A4横向1页，完整报告正反2页；溢出阻止打印/确认，页面保留全文，不裁字。
- 卡台账CSV为UTF-8 BOM，导出当前筛选全量，最大50000行；台账HTML打印最大1000行，超限明确报错不截断。
- 学校时区Asia/Shanghai；数据库时刻使用UTC契约，边界查询先转换，不以浏览器时区决定月份。
- 保留现有期末报告六板块、合并表头、自评/他评和109个呈现位置；109不是每位学生的必填常量。
- 正文14px成人/16px学生，辅助文字≥12px，触摸目标≥44×44px、学生主动作48px；响应式<700/700–1099/≥1100px。
- 不增加状态框架、路由框架、UI组件库、在线字体、扫码SDK或PDF服务器依赖；LLM继续既有配置，无成功结果不得补造分数。
- 保护`.env`、private/uploads、已有本地账号和证据、相关未追踪文档；不执行`git clean -fdx`。

## Review Focus

1. 家长填写时遇到并发更新/退出账号：不得丢草稿或把草稿恢复给另一个学生；Task 4/6/16验证。
2. 月末边界与跨月冲正、调额/生成/扫码竞争：月归属、数量和净分必须可对账；Task 1/2/3验证。
3. 任课教师猜学生ID、请求full或查看历史HTML：不能取得无关班级或正面私有文字；Task 9/10/11验证。
4. 第101条、CSV公式文本/前导零、超限与中断：查询、导出、打印不得遗漏或泄露凭证；Task 2/3/8验证。
5. 长文本/多特长与快速切换学生/版本：报告不裁切、不串人，溢出不得确认/打印；Task 10/11/16验证。

---

## 0. 执行上下文、依赖与交付顺序

经核对的源码目录：`/Users/quanta/Downloads/task/六育学生评价系统v2`，设计基线提交`3b551da`（包含管理员三菜单）。聊天曾附加的`/Users/quanta/.codex/worktrees/term-report-core/六育学生评价系统v2`为空的旧基线，不能拿它当当前源码。执行前按using-git-worktrees核对附件与HEAD，复用合适工作区；若需隔离，只从已核对提交建立允许写入的工作区，不复制/提交密钥。

使用当前Node≥22.12；本机可用二进制为`/Users/quanta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`。命令中的`node/npm`必须来自该版本或等价受支持版本，不能使用系统Node18。

依赖主线：

`基线 → Task 1 → Task 2 → Task 3 → Task 8`

`基线 → Task 4 → Task 9 → Task 5 → Task 6 → Task 7`

`Task 4 → Task 9 → Task 10 → Task 11`

`Task 4/9 → Task 12 → Task 13 → Task 14 → Task 15 → Task 16`

实际执行次序为 **1→2→3→4→9→5→6→7→8→10→11→12→12A→12B→13→14→15→16**；编号是稳定引用标识，12A为管理员三菜单，12B为新增详细学期配置设计。Task9先为学生首页与后续工作台提供真实聚合，不用静态数字占位。依赖图不要求启动并行代理。每任务完成一个可单独核对的提交。任务16前不切换正式部署、不销毁旧运行资料。

实施方式延续此前的executing-plans：当前会话逐任务实现，结束后独立审阅；不自行改成每任务实现代理。先审阅本计划，再开始产品修改。

### 文件职责图

| 文件 | 动作 / 职责 |
| --- | --- |
| `backend/services/reportCoreCards.js` | 修改：直评选填、额度锁校验、未领作废、按范围打印原卡 |
| `backend/db.js`、`backend/scripts/runCoreMigrations.js` | 修改：新连接UTC契约与显式时钟切换审计，保留安全数据库检查 |
| `backend/services/reportCoreLedger.js` | 新增：卡台账过滤、状态、汇总、流向、CSV/台账数据、历史审计查询 |
| `backend/services/reportCoreReadModels.js` | 新增：角色工作台聚合、教师目录与批量完成情况 |
| `backend/services/reportCoreReportBrowser.js` | 新增：全部负责班级、学生摘要、按版本与权限的报告详情 |
| `backend/routes/reportCoreViews.js` | 新增：上述只读/导出/打印及作废路由；由已鉴权coreRouter挂载 |
| `backend/services/reportCoreEvaluation.js` | 修改：纯完整度计算、适用自评范围、保留原保存/确认 |
| `backend/services/authorizationService.js` | 修改：明细只读与完整正面/确认区分 |
| `backend/services/reportRenderService.js` | 修改：DETAIL_ONLY/FULL、草稿标识和版面检测标记 |
| `frontend/src/app/reportCore/navigation.js` | 新增：最小hash路由与角色导航，保留扫码入站参数 |
| `frontend/src/app/reportCore/RoleShell.jsx`、`tokens.css`、`ui.jsx` | 新增：统一角色布局、视觉变量和少量原生组件 |
| `frontend/src/app/reportCore/cardModel.js`、`selfEvaluationModel.js` | 新增：分类树/权限交集、自评字段分组/冲突合并，纯函数供单测 |
| `StudentHome.jsx`、`SelfEvaluation.jsx`、`TeacherWorkspace.jsx`、`DirectScore.jsx` | 新增于同目录：对应角色页面 |
| `CardLedger.jsx`、`CardPlan.jsx`、`ClassReports.jsx`、`ManagerWorkspace.jsx` | 新增于同目录：台账、制卡、报告、发布工作区 |
| `AdminRoster.jsx`、`AdminHealth.jsx`、`AdminQuota.jsx` | 新增于同目录：三个独立管理菜单，不用一个弹窗拼装全部业务 |
| `AdminTermSettings.jsx`、`termSettingsModel.js` | 新增于同目录：学期配置四页签、字段白名单、差异预览与规则试算 |
| `backend/services/reportCoreTermSettings.js` | 新增：配置/职责预览、版本和影响指纹、事务提交与审计；复用现有保存核心 |
| `index.jsx`、`Materials.jsx`、`Teacher.jsx`、`Administration.jsx`、`api.js` | 修改：接入新页面，保留真实业务适配，逐步移除已替代的组件 |
| `frontend/src/component/TermReport/index.jsx` | 修改：可靠加载/高度/打印和溢出事件，仅接获准HTML |
| `docs/delivery/role-ux/` | 新增：基线、接口/验证说明、精确清理清单与验收证据索引 |

新文件仅按上述职责创建；不要为每张卡或每个输入建子类/配置表。文件中旧导出移除时先改调用者，保持每次build可运行。

### 开始前基线（计入首个任务提交）

- [ ] 核对AGENTS/工作区、Git状态、用户修改与当前分支；列出受保护的未追踪文档，不重置或替用户提交。
- [ ] 运行前端现有test/build/lint、后端test与现有report-core浏览器流程，结果写`docs/delivery/role-ux/基线.md`；记录既有失败，不冒称由本次引入。
- [ ] 确认集成测试只使用`createCoreTestDb`生成并清理`liuyu_report_test_*`，不重建pilot或旧库；记录测试环境但不记录口令。
- [ ] 重新核查数据库session时区与时间戳约定。本轮只读结果：`liuyu_report_pilot_20261028`的`@@session.time_zone=SYSTEM`、`NOW()-UTC_TIMESTAMP()=08:00:00`，而dbConfig为`timezone:'Z'`；因此Task1必须修正新连接的服务器会话，不能误以为驱动参数已完成此事。旧created_at没有可靠来源证明时不批量改时刻，交付说明单列历史不确定性。

## Task 1: 直评与额度写入的最小修正

**Files:** Modify `backend/services/reportCoreCards.js`, `backend/routes/reportCoreFeatures.js`, `backend/db.js`, `backend/scripts/runCoreMigrations.js`; Test `backend/__tests__/report_core_cards.test.js`与新增`report_core_card_quota_limits.test.js`、`report_core_timezone.test.js`。

**Interfaces:** 保持`directScore({pool,actor,termId,studentIds,categoryCode,reason,command})`、`saveQuota(...)`、`generateCards(...)`签名；`reason`接受undefined/null/空白，存空字符串，非字符串422。`voidCard({pool,actor,sourceId,expectedRevision,reason,command})`返回原来源ID与最新修订。

`createDbPool`保证每个新连接在业务查询前已设置`time_zone='+00:00'`。现有迁移脚本增加显式`--record-utc-cutover`操作，只向原来源表写一次`SOURCE_CLOCK_BASELINE` AUDIT（学校/切换前最大来源ID/原会话offset/是否已核实历史offset），不新增表或改写旧时间；执行时短暂停止写入，审计完成后统一启用新连接。默认check无此写副作用。未核实历史来源保留未知标志，不能静默当UTC。

- [ ] **Step 1 — 写失败回归：** 空说明四种输入各成功+1；对象说明422；同requestKey重试不重复；越权学生批次全部回滚；冲正空原因仍拒绝。另测多个新池连接session均为UTC、`NOW()`与UTC_TIMESTAMP一致，显式时钟审计重跑不重复，默认迁移check不写审计或历史值。
- [ ] **Step 2 — 跑失败：** `cd backend && node --test __tests__/report_core_cards.test.js __tests__/report_core_card_quota_limits.test.js`，期望新断言在旧代码失败，不能因为连接错误当作红测。
- [ ] **Step 3 — 实现：** 在同一QUOTA行事务锁下读取Q/P/G，调减要求`Qnew >= max(P,G)`，生成再次校验`P<=Q`；不剪裁计划。额度新发/真实变更追加`QUOTA_CHANGE` AUDIT（quotaId/monthKey/oldTotal/newTotal/delta/操作者），保存计划和生成卡追加`PLAN_SAVE/CARD_GENERATE` AUDIT（版本/班级张数），不以原created_at补造旧历史。作废仅所属教师、未领取卡、有效revision，写VOID及AUDIT，不返额度。继续原学生锁/幂等/冲正唯一约束。
- [ ] **Step 4 — 补并发验证：** 保存80计划后降50应拒绝；调额与生成竞争不能超额；作废/扫码同时执行仅一方成功，已用卡不能作废。上述命令PASS，再跑`report_core_store.test.js`与`report_core_timezone.test.js`。时区切换先在独立测试库演练，真实库切换步骤留在交付/部署说明，不能在改页面时擅自改历史数据。
- [ ] **Step 5 — 提交：** 仅上述文件，`fix: enforce card quota bounds and optional direct-score notes`。

## Task 2: 可对账的卡台账查询

**Files:** Create `backend/services/reportCoreLedger.js`, `backend/routes/reportCoreViews.js`, `backend/__tests__/report_core_ledger.test.js`; Modify `backend/routes/reportCore.js`。

**Interfaces:**
- `normalizeLedgerQuery(query,actor)` → 白名单过滤对象；教师owner从登录者派生，管理员必须指定本校教师，学生403。
- `getLedgerSummary({pool,actor,filters,asOf})` → `{quota,planned,generated,redeemed,pending,future,expired,voided,reversed,remaining,net,classRows,asOf}`。
- `listLedgerCards({pool,actor,filters,cursor,limit,asOf})` → `{rows,total,summary,nextCursor,asOf}`；`limit`25/50/100。
- `listLedgerUsage({pool,actor,filters,groupBy,sourceMode,cursor,limit,asOf})`；groupBy=`event|student|indicator`，sourceMode=`paper|direct|all`。
- `getLedgerCardDetail(...)`及`listLedgerAudits(...)`只返回元数据，不返token/hash/ciphertext。
- `resolveSourceInstant(source,clockBaseline)` → `{occurredAt:string|null,timeBasis:'UTC'|'VERIFIED_LEGACY'|'UNKNOWN'}`；扫码优先原ISO usedAt，直评按时钟审计边界读取，新连接写入为UTC，已核实旧offset只在读取时换算；未知旧行不猜日期，保留原始显示与未知数量，精确事件日期筛选不混入未知行。
- 路由路径按卡台账设计第6.2节，不复用现有前100条列表假装全量。

- [ ] **Step 1 — 写失败集成：** 额度100、原卡80（52已领、26待领、2VOID），2张已领已冲正，断言生成80、领取52、净分50；插入121卡测试101以后可分页查询/统计。加入其他教师/其他学校、未来卡、失效卡和无卡直评。
- [ ] **Step 2 — 跑失败：** `cd backend && node --test __tests__/report_core_ledger.test.js`；期望服务不存在/业务断言失败。
- [ ] **Step 3 — 实现：** 使用同一查询构造器的参数化WHERE与排序白名单，先按school/term/owner/month限制候选；CARD关联QUOTA、当学期学生快照和唯一REVERSAL。状态由asOf派生；“已领”含冲正，“有效积分”扣冲正，DIRECT不占纸卡张数。公共目录/聚合不读取学生私有正文。
- [ ] **Step 4 — 验证月边界：** 学校10月1日00:00对应UTC9月30日16:00；10月直评11月冲正回溯10月净分，事件发生时刻保持11月。UTC新行、已核实UTC+8旧行换算为同一真实时刻，未知旧行明确计入“待核对时间N条”且不伪分月份。事件日期额外筛选汇总标“筛选事件变动合计”。相同asOf下各状态互斥求和=G；重复学科任教不重复计学生。测试PASS；典型EXPLAIN写交付记录，初版不先加DDL。
- [ ] **Step 5 — 提交：** `feat: add scoped monthly card ledger and student flows`。

## Task 3: 卡台账导出、打印及原卡补打

**Files:** Modify `reportCoreLedger.js`, `reportCoreCards.js`, `reportCoreViews.js`; Create `backend/__tests__/report_core_ledger_exports.test.js`, `backend/__tests__/report_core_card_print_scopes.test.js`。

**Interfaces:**
- `streamLedgerCsv({pool,actor,filters,view,response})`；支持`monthly|cards|students|indicators|events`视图，同一过滤规范。
- `getLedgerPrintModel({pool,actor,filters,view})` → 受限HTML台账模型，≤1000行；CSV≤50000。
- `createCardPrintRequest({pool,actor,quotaId,grade,classNo,cardIds,command})` → `{requestId,downloadUrl,cardCount}`，写现有AUDIT，非新打印任务表。
- `buildClassPrintZip`与单班PDF读取获准原凭证，补打同ID/同token；打印请求POST与文件GET分开，查询GET不变更业务状态。

- [ ] **Step 1 — 写失败测试：** 121条导出全量而非100条，筛选学生与指标一致；中文/BOM/引号/换行、公式文本`=1+1`、`@x`与学号`0012`安全按文本保存，数值−1不被改成文本；非法owner/学生导出403，正文不含任何token字段。
- [ ] **Step 2 — 跑失败：** `cd backend && node --test __tests__/report_core_ledger_exports.test.js __tests__/report_core_card_print_scopes.test.js`。
- [ ] **Step 3 — 实现：** CSV一致性快照流式读取，开始响应前检验上限与条件，连接中断释放查询/事务；不做持久导出队列。文本危险首字符与学号/卡号列用明确文本前缀加CSV引号编码，数值列按原数值输出，不能仅靠双引号假定Excel保留前导零。打印台账重复表头/筛选/时间与汇总。打印原卡默认只取当前可领取原卡；POST仅留`PRINT_REQUEST`审计及当时选择范围，GET下载只读，不伪造GENERATED或物理打印成功事件。
- [ ] **Step 4 — 验证：** 同一原卡两次下载二维码一致且卡数/积分不变；已用/失效不输出可领二维码，学生在请求后先领取需刷新范围；ZIP按班分PDF且中文正常。测试50001/1001条报422不截断，导出中断连接回收，测试PASS。
- [ ] **Step 5 — 提交：** `feat: export filtered card ledgers and reprint original cards safely`。

## Task 4: 角色外壳与受控导航

**Files:** Create `frontend/src/app/reportCore/RoleShell.jsx`, `ui.jsx`, `tokens.css`, `navigation.js`, `navigation.test.js`; Modify `index.jsx`, `style.css`, `api.js`, `frontend/src/component/ErrorBoundary/index.jsx`。

**Interfaces:** `RoleShell({actor,term,scope,route,onNavigate,children})`；`parseCoreLocation(hash)`/`formatCoreLocation(route)` → `{page,termId,classKey,studentId,cardToken?}`。`api`保留原契约并支持`{signal}`；错误保留status/定位信息。ui.jsx仅`StarPicker`、`StatusBadge`、`ConfirmDialog`、`EmptyState`等实际共享组件，不含业务状态。

- [ ] **Step 1 — 写失败单测：** 原`#/student/materials?card=...`仍恢复入站凭证；报告详情路由可编码/解码，普通导航不把卡token写入列表URL；非法角色路由回默认。`node --test src/app/reportCore/navigation.test.js`旧代码FAIL。
- [ ] **Step 2 — 接入外壳：** 三角色导航、学期/班级/学科合法组合、真实退出、局部busy、错误状态。新任务相关页面先复用旧核心组件，确保此任务后仍可登录和使用所有六类输入。清除草稿/凭证的边界以actorId+termId隔离，退出不跨账号回放。
- [ ] **Step 3 — 接入视觉与无障碍：** 使用总设计token、统一SVG、44/48px目标和focus；对话框焦点捕获/返回、Escape、reduced-motion；ErrorBoundary用原生可访问错误页替换antd，先不删依赖。按设计范围保留草稿离开提示，正常浏览不弹无意义确认。
- [ ] **Step 4 — 验证：** 单测PASS；`npm run build`；现有`test:report-core`必要改成新菜单定位但不删业务断言，三角色真实登录/退出及入站扫码可用。记录390/768/1440与键盘核验结果。
- [ ] **Step 5 — 提交：** `feat: unify role navigation and accessible interface foundations`。

## Task 5: 学生四步自评与可靠保存

**Files:** Create `SelfEvaluation.jsx`, `selfEvaluationModel.js`, `selfEvaluationModel.test.js`; Modify `Materials.jsx`, `index.jsx`, `backend/services/reportCoreEvaluation.js`; Test新增`backend/__tests__/report_core_self_view.test.js`。

**Interfaces:** `getEvaluationView`增加`applicableSelfFields,editable,lockReason`；既有`allowedFields/values/revision/sportsSpecialties/artSpecialties`不变。`buildSelfGroups(view,catalog)`、`getSelfProgress(...)`；`mergeSelfDraft({base,local,remote,specialtyChanges})` → `{merged,conflicts,removedSpecialtyIds}`。`SelfEvaluation({ctx})`按原PATCH提交dirty及稳定特长ID。

- [ ] **Step 1 — 写失败测试：** 13固定字段全部落入日常8/健康1/艺术4；五自述+收获+目标七文本，家长寄语不进必填分母；未适用项不计数；无特长不造行，数组调序后仍按id写；服务端不返回他评可写权限。
- [ ] **Step 2 — 跑红：** `cd frontend && node --test src/app/reportCore/selfEvaluationModel.test.js`；`cd backend && node --test __tests__/report_core_self_view.test.js`。
- [ ] **Step 3 — 实现：** 四步卡通表单、1–3星/清除null、独立7文本、可选家长寄语；不默认满星，不新建completion字段。先保存可部分提交，下一步只切组；成功后新revision，保存中继续编辑不清新dirty，失败保留输入，409三方合并同格冲突让用户选，不自动覆盖。
- [ ] **Step 4 — 验证：** 单测/后端测试PASS；浏览器验证清除/返回回看、刷新服务器恢复、旧修订409、特长被撤回、冻结只读、账号切换不带入他人草稿。七文本≤2000 Unicode字符、家长≤1000，自评不能改teacher_star。
- [ ] **Step 5 — 提交：** `feat: simplify complete student self-evaluation with conflict-safe saves`。

## Task 6: 学生首页、月度故事与档案

**Files:** Create `StudentHome.jsx`; Modify `Materials.jsx`, `index.jsx`, `api.js`, `backend/services/reportCoreSources.js`, `backend/routes/reportCoreFeatures.js`; Test新增`backend/__tests__/report_core_story_lookup.test.js`。

**Interfaces:** sources查询增加`monthKey/sourceType/recordKind/latest`，学生仅本人，返回该月最新BATCH及原文/状态，不依赖旧第一页。`StudentHome({ctx,summary})`消费提前完成的Task9学生workspace；原StoryForm改为三分类页签，复用story-batches保存/提交接口。

- [ ] **Step 1 — 写失败测试：** 存超过100条来源，指定月仍取得正确最新版；切月不取其他月草稿，非本人403/空结果；已评分旧版保留。读听讲每类1–3篇、4篇拒绝、篇数不增权沿用原故事回归。
- [ ] **Step 2 — 跑红并最小实现查询：** `cd backend && node --test __tests__/report_core_story_lookup.test.js __tests__/report_core_stories.test.js`，先确认新测试红，再补服务端精确条件。
- [ ] **Step 3 — 实现页面：** 云朵首页双主动作领卡/奖状、真实月度故事/自评进度；故事同月三页签、篇目与TXT载入，文件失败保留原文；保存/提交状态来自真实响应。档案分组原材料、故事历史、自评、已发布报告；无发布只显示说明，不读取草稿。
- [ ] **Step 4 — 验证：** 新查询测试PASS；真实浏览器执行扫码登录回跳→预览→领1分；PNG/JPEG≤5MB上传，提交不假称已识别；故事每类1篇整月提交、UTF-8非法/64KB超限/断网/切月/409均不丢输入。禁止持久化学生全文至公共设备localStorage。
- [ ] **Step 5 — 提交：** `feat: streamline student monthly stories and personal archive`。

## Task 7: 教师单页快速直评与整班录入

**Files:** Create `DirectScore.jsx`, `cardModel.js`, `cardModel.test.js`; Modify `Teacher.jsx`, `index.jsx`, `importRows.js`; Test扩展现有`frontend/src/util/reportCoreImport.test.js`（Task15再迁址）。

**Interfaces:** `eligibleCardCodes({catalog,assignments,studentRows,selectedStudentIds})`、`buildCardTree(catalog,allowedCodes)`，返回六育→一级→二级及原categoryCode；`DirectScore({ctx})`使用Task1原直评POST。

- [ ] **Step 1 — 写失败模型测试：** 37叶节点唯一；德美一级日常行为、智美5科×4、健康3、艺术2科×3；劳美故事不可直评；多学生取权限交集，无学生没有可选项；重复点击相同父值不清空叶节点，真实上级/学生变化清下级。
- [ ] **Step 2 — 跑红：** `cd frontend && node --test src/app/reportCore/cardModel.test.js`。
- [ ] **Step 3 — 实现：** 单页学生名单/六育/一级/二级/选填说明/摘要和按钮全部存在，桌面左右列手机纵向；无上一步/下一步/分步弹窗。不自动按页头学科替用户选路径。成功清学生/路径/说明，失败保留；重复提交沿原幂等。
- [ ] **Step 4 — 优化真实录入与审核：** 既有ImportData改班级学生×适用分项格、粘贴/Excel→预览→确认，不静默部分导入；ReviewMaterials同屏原图/原文与认定、权限内保存下一份；保留Settlements、零卡结算和无奖状确认。模型/导入测试PASS，实际多选2学生空说明各+1，越权事务无部分记分。
- [ ] **Step 5 — 提交：** `feat: make teacher direct evaluation a single-page cascade`。

## Task 8: 教师卡台账和按班制卡页面

**Files:** Create `CardLedger.jsx`, `CardPlan.jsx`; Modify `Administration.jsx`, `Teacher.jsx`, `index.jsx`, `api.js`; Test扩展`frontend/tests/report-core-flow.cjs`与新增`frontend/tests/report-core-ledger.cjs`。

**Interfaces:** `CardLedger({ctx})`消费Task2/3真实API，不在前端重算全量统计；`CardPlan({ctx,quotaId,onSaved})`保留保存响应的id/revision；下载使用带鉴权的现有download适配器。

- [ ] **Step 1 — 写失败浏览器场景：** 121卡月度统计及第二页、按班/学生/指标筛选、CSV全量计数与当前筛选一致；按学生聚合去重，未领取不虚构学生，DIRECT显示独立事件视图。运行`node tests/report-core-ledger.cjs`确认旧页面无新交互而失败。
- [ ] **Step 2 — 实现三页签：** 月度台账五数字/班级分配/获配变更、使用明细逐卡/学生/指标/评价事件、制卡打印；过滤标签、手动查询/重置/25/50/100、排序、明细侧栏和就地错误；截至时间与实际服务端口径一致。
- [ ] **Step 3 — 接入真实制卡/打印：** 保存计划后原地预览和生成，ZIP每班独立PDF；生成后锁定且剩余额度不误写可再生成；原码补打/台账打印分按钮；未领作废原因必填、已领仅允许原冲正；下载失败不算成功。
- [ ] **Step 4 — 验证：** Task1–3测试及浏览器场景PASS；CSV无凭证，台账非二维码打印纸；手机局部表格横滚但页面不溢出；刷新保留筛选不缓存私有记录。默认管理员只查元数据，教师不能切换别人的ownerId。
- [ ] **Step 5 — 提交：** `feat: connect teacher card ledger queries exports and class printing`。

## Task 9: 统一完成情况与工作台读取

**Files:** Create `backend/services/reportCoreReadModels.js`, `backend/__tests__/report_core_read_models.test.js`; Modify `reportCoreEvaluation.js`, `reportCorePublish.js`, `reportCoreViews.js`。

**Interfaces:**
- `evaluateCompletion({evaluation,config,pendingMaterialCount})` → `{missingItems,sectionProgress,narrativeReady,selfProgress}`，纯计算，读取field_sources/特长但不发SQL。
- 既有`missingItems(c,e,term)`成为读取pending计数后调用纯计算的兼容包装；readiness与报告浏览器复用同一定义。
- `getWorkspace({pool,actor,termId,grade,classNo,subjectCode,cursor,limit})` → `{counts,tasks,classRows,nextCursor,asOf}`。
- `listTeachers({pool,actor,q,cursor,limit})` → 本校启用教师`{id,realName,username}`及分页，仅管理员。

- [ ] **Step 1 — 写失败测试：** NULL/零分已结算/未结算、noAward、动态特长缺自评、可选家长寄语、不适用字段、材料FAIL各影响正确；重复任教学科不重复计学生，121学生不漏；管理员响应不含健康值/故事/寄语正文。
- [ ] **Step 2 — 跑红：** `cd backend && node --test __tests__/report_core_read_models.test.js`。
- [ ] **Step 3 — 实现：** 分页任务与全量计数分离，批量读取来源状态/学籍/职责，避免每学生SQL或每行HTTP；任务ID复用来源/学生/fieldKey。负责人按任教/班主任映射，未配置明确显示，不随意猜老师。学生workspace只本人、教师只本人责任范围。
- [ ] **Step 4 — 验证：** 新测试PASS，同时`report_core_drafts.test.js`、`report_core_release.test.js`原完整性结论一致；全校发布必须全量就绪，不能被分页误判。教师搜索同名加账号区分，不要求手填ID。
- [ ] **Step 5 — 提交：** `feat: share completion rules and add role workspace summaries`。

## Task 10: 全部负责班级、只读明细与版本安全

**Files:** Create `backend/services/reportCoreReportBrowser.js`, `backend/__tests__/report_core_report_browser.test.js`; Modify `authorizationService.js`, `reportRenderService.js`, `reportCoreViews.js`。

**Interfaces:**
- `listReportClasses({pool,actor,termId})` → 去重班级与isHeadTeacher/全量counts。
- `listReportStudents({pool,actor,termId,grade,classNo,keyword,status,cursor,limit})` → `{rows,total,counts,nextCursor}`，每行sectionProgress/gradeCounts/starCounts、currentRevision、publishedVersion及can*权限标志。
- `getReportDetail({pool,actor,studentKey,version,scope})` → `{model,html,revision,publishedVersion,missingItems,permissions}`；version=`current|published`，scope=`detail|full`。
- 新动作`report-detail-read`允许有效任教班级；`report-front-read/confirm`仍head。`renderPrintableA4({reportData,renderScope='FULL',draftLabel})`接受`DETAIL_ONLY`并在服务端根本不生成正面HTML。

- [ ] **Step 1 — 写失败权限测试：** 一教师两班、一班任课一班班主任，同班多学科只算一次；两班所有学生可列表；无关班级/跨校/学生账号拒绝；任课可取detail但full403、确认403，响应与HTML不含带唯一标识的自述/家长/寄语文本。
- [ ] **Step 2 — 跑红：** `cd backend && node --test __tests__/report_core_report_browser.test.js`。
- [ ] **Step 3 — 实现：** 复用Task9批量完整度；当前草稿和发布快照分开读取，published取当前有效releaseVersion冻结数据。教师必须当前仍有任教；参数不能扩权。普通教师model也不带narratives，不能只CSS隐藏。未知结构LEGACY_V1原始HTML无法安全裁剪时，任课返回明确不支持，不走renderer的renderedHtml直接返回捷径；班主任沿历史读取规则。
- [ ] **Step 4 — 验证：** 发布后改草稿，不改变已发布视图；任教撤销后列表/猜ID/导出均拒绝；筛选“已发布”与“当前草稿缺项”可分别匹配同一人，counts不宣称互斥求和。DETAIL_ONLY保留全部六育呈现字段和自评他评，FULL两面，测试PASS并重跑原auth/drafts/release测试。
- [ ] **Step 5 — 提交：** `feat: browse all assigned classes with scoped report details`。

## Task 11: 班级摘要页与PDF式学生详情

**Files:** Create `frontend/src/app/reportCore/ClassReports.jsx`, `frontend/tests/report-core-reports.cjs`; Modify `component/TermReport/index.jsx`, `Teacher.jsx`, `navigation.js`, `index.jsx`; Test扩展`frontend/tests/report-core-preview.cjs`。

**Interfaces:** `ClassReports({ctx,route,onNavigate})`；`TermReport({html,documentKey,printScope,onLayout,onReady})`，printScope=`DETAIL_ONLY|FULL`，回调`onLayout({documentKey,overflow,sections})`及`onReady({documentKey,print:()=>void})`。ClassReports用documentKey绑定Task10响应的revision/fingerprint/templateVersion，再构造原确认载荷；旧文档回调忽略，不能操作残留iframe。

- [ ] **Step 1 — 写失败浏览器测试：** 默认所有负责班级及6名以上真实测试学生、按班/姓名/状态过滤；点学生开独立路由；返回恢复条件/页码/滚动；慢A请求后快B返回时不得把A报告挂到B名下。
- [ ] **Step 2 — 跑红：** `cd frontend && node tests/report-core-reports.cjs`。
- [ ] **Step 3 — 实现列表与详情：** 侧班级+学生摘要，六板块filled/applicable而非总分；默认有发布版本选published，否则current；明细默认一页，班主任可切完整两页。任课没有正面选项/寄语编辑/确认。保存班主任评价后拉新草稿与布局，再按原协议确认。
- [ ] **Step 4 — 实现打印与边界验证：** 两按钮明确“导出PDF”需打印面板另存；打印当前iframe获准范围，草稿标识印入内容。隔离探针以目标A4打印CSS检查每页真实溢出，长Unicode文本/多特长超出时禁用导出打印与确认但屏幕全文可读；不裁切或假造layoutReview。预览回归验证6表/109位置、1/2个打印页、表头合并、原始值；390/1440、快速切人和版本、登录过期清旧DOM全部PASS。
- [ ] **Step 5 — 提交：** `feat: render class report summaries and printable student detail pages`。

## Task 12: 教师待办与管理员发布中心

**Files:** Create `TeacherWorkspace.jsx`, `ManagerWorkspace.jsx`; Modify `Administration.jsx`, `Teacher.jsx`, `index.jsx`; Test扩展`frontend/tests/report-core-flow.cjs`。

**Interfaces:** 消费Task9的workspace及教师目录；复用既有terms/assignments/config/import/release命令，后端仍决定can*和状态机。

- [ ] **Step 1 — 写失败UI流程：** 教师首页待办能定位具体奖状/故事异常/缺项；管理员默认发布中心，少一人缺确认不能准备/发布；重新加载恢复PREPARING，全部prepare完成后一次activate才对学生可见。
- [ ] **Step 2 — 实现教师工作台：** 合法班级/学科范围和三摘要，快速操作入口，材料同屏核对/保存下一条；只显本人任务，失败保留表单，系统评分失败不补默认分。
- [ ] **Step 3 — 实现管理员外壳：** 五个独立导航；发布中心显示缺项与责任人，三个数据菜单接Task12A、学期配置接Task12B。健康无六育终测导入；任教维护不输数据库ID。
- [ ] **Step 4 — 验证：** 沿现有prepare/batch/activate/recover/cancel接口状态，按服务端允许动作呈现；刷新/网络中断恢复，无按班提前发布、管理员无私有正文。`test:report-core`与backend release/auth/read-model tests PASS。
- [ ] **Step 5 — 提交：** `feat: prioritize teacher tasks and school-wide report publication`。

## Task 12A: 三个独立管理菜单与真实批量额度

**Files:** Create `frontend/src/app/reportCore/AdminRoster.jsx`, `AdminHealth.jsx`, `AdminQuota.jsx`；Modify `Administration.jsx`, `navigation.js`, `index.jsx`, `backend/services/reportCoreImports.js`, `reportCoreCards.js`, `reportCoreReadModels.js`, `reportCoreViews.js`及`backend/middleware/errorHandler.js`安全details支持；Create `backend/__tests__/report_core_admin_menus.test.js`, `report_core_quota_batch.test.js`, `frontend/tests/report-core-admin.cjs`。

**Interfaces:** accounts/health/import-history/teacher-quotas GET契约按管理员三菜单设计第5节；模板由前端现有xlsx产生。`previewQuotaBatch({pool,actor,termId,monthKey,entries,command})` → `{batchId,revision,diffs,counts,errors}`；`commitQuotaBatch({pool,actor,batchId,expectedRevision,command})`一次事务；`saveQuotaInTransaction(connection,args)`供单笔和批量共用，不嵌套withMutation。AUDIT/PREVIEW存批量快照，无新表、无CARD/BATCH类型。

- [ ] **Step 1 — 写失败后端回归：** 教师ROSTER无班级可导入且不建学生学籍；已有账号角色冲突拒绝、密码不被重置、明文/hash不返响应。健康预览返回全部行/格错误及旧→新、空白不覆盖/显式clearFields/合法0正确、预览后revision冲突整批拒绝。两名教师额度预览后有一人计划改变，确认409且两人均不更新；重复提交不重复加额，未选教师不变，超过200人拒绝。
- [ ] **Step 2 — 跑红：** `cd backend && node --test __tests__/report_core_admin_menus.test.js __tests__/report_core_quota_batch.test.js`。新增浏览器流程确认原来只有“数据与额度”时失败，不能删除原ROSTER/HEALTH/单人quota回归来换绿。
- [ ] **Step 3 — 实现服务：** 名册/体测预览聚合错误，错误422/details无可提交batchId，成功仅安全diff；提交复验现值/角色/修订。管理员健康GET仅五原值。额度预览最多200启用本校教师、按绝对月总额度0–10000并校验max(P,G)；确认校验批次owner/修订，稳定顺序锁行，一次withMutation写所有QUOTA及逐人/批次AUDIT，一错全回滚。
- [ ] **Step 4 — 实现三个页面并跑绿：** 学籍与账号按学生/教师列表和模板→错误/差异预览→结果/记录；体测按班五原值→逐格差异→确认/记录；月度额度按教师勾选、统一设值/逐行编辑/模板→前后额预览→批量确认/结果。新总额与本次增量分列，未选不清零；同页保留输入与范围，真实成功才刷新。后端测试及`node tests/report-core-admin.cjs` PASS，390/1440可操作、三条地址可刷新进入。
- [ ] **Step 5 — 提交：** `feat: split admin data menus and atomically grant teacher quotas`。

## Task 12B: 学期配置四页签与有影响提示的原子保存

**Files:** Create `frontend/src/app/reportCore/AdminTermSettings.jsx`, `termSettingsModel.js`, `termSettingsModel.test.js`, `backend/services/reportCoreTermSettings.js`, `backend/__tests__/report_core_term_settings.test.js`; Modify `Administration.jsx`, `index.jsx`, `navigation.js`, `api.js`, `backend/services/reportCoreAdmin.js`, `reportCoreViews.js`, `reportCoreFeatures.js`; Extend `frontend/tests/report-core-admin.cjs`。

**Interfaces:** 按学期配置设计第7节定义 `getTermSettings`, `previewTermSettings`, `commitTermSettingsPreview`, `listTermSettingHistory`，参数统一`{pool,actor,termId,...,command}`；preview产生`{previewId,revision,diffs,impact,versions}`，消费配置双版本、职责指纹和服务端影响学生集合指纹。前端`buildTermSettingChanges(section,draft,current)`只产生该页签白名单，`getCardStarPreview(points,target,settled)`沿既有公式；历史/预览用现有AUDIT，不新增表。

- [ ] **Step 1 — 写失败回归：** 日期无变化不推进版本/确认；合法日期保存、显式清空、期末前日期拒绝；T=2/3/10边界、未结算为null、期外/重复/零月份拒绝。预览后学生修订或确认变化、配置版本变化、职责变化任一409且无部分修改；同key异内容拒绝，同内容重试返回原结果。跨校/非管理员拒绝，规则保存只重算CARD/STORY当前投影且冻结发布快照不变。
- [ ] **Step 2 — 验证红测：** `cd backend && node --test __tests__/report_core_term_settings.test.js`、前端`node --test src/app/reportCore/termSettingsModel.test.js`在旧实现业务断言失败；补两管理员交接竞争、重复任教跳过、多学科班主任一致和最后职责停用必须明确继任/暂缺的失败测试。
- [ ] **Step 3 — 实现事务服务：** 提取现有updateTerm/saveAssignment的同事务核心，严格section白名单并保留其他配置键；预览AUDIT存旧新值、预期配置/规则版本、受影响学生修订/确认集合指纹。提交学期锁内复验，任教最多100项、稳定顺序锁行、每班最多一个有效班主任；变更仅失效实际受影响班级确认，日期/规则沿全学期失效行为。发布非IDLE全部写入拒绝，旧PATCH/单笔职责端点不能绕过CAS/唯一/确认失效；幂等重试不二次重算。
- [ ] **Step 4 — 实现四页签并跑绿：** 只读已有学期信息/可编辑报到日期、按班任教与姓名搜索/中文学科、T与月份可视选择/试算、只读口径与分页历史。独立草稿→同页差异/影响→确认→真实结果，409保留输入，非IDLE只读；切页签不丢，切学期/退出保护。后端和模型测试PASS，admin浏览器覆盖四页签、预览后改输入失效、真实保存/重载、并发冲突、发布锁和手机键盘；不以静态示例记录冒充后台审计。
- [ ] **Step 5 — 提交：** `feat: add term settings with scoped assignments and reviewed rule changes`；记录实际全学期重算耗时，不为配置默认另建队列表；用户设计评审通过后才实现本任务。

## Task 13: 形成精确清理清单与断言迁移

**Files:** Create `docs/delivery/role-ux/cleanup-manifest.md`; Modify `frontend/package.json`, `frontend/tests/report-core-flow.cjs`及有明确替代的测试文件。

**Interfaces:** 清理清单逐路径记录`action,reason,activeReferences,replacement,verification,protected`；不存在“直接删除整个services目录”的条目。

- [ ] **Step 1 — 枚举入口：** 运行入口、package全部脚本、测试、核心迁移/init、样式/字体/运行时资源、README命令及相对链接一起查引用。`rg`/编译输出与人工核对足够，不新建通用依赖分析框架。动态require无法证实无用时保留并标注。
- [ ] **Step 2 — 登记候选：** 旧student/teacher/admin/login/dashboard/kiosk/family等页面及Sidebar/Nav/StudentLayout/ExampleTable；旧controllers/routes、旧业务service/middleware/util；legacy测试/旧演示入口/缓存。每个文件在删除前排除核心运行、脚本和迁移测试的引用。
- [ ] **Step 3 — 保住核心契约：** initReportCore/migrateReportCore/runCoreMigrations、sql/05、policy JSON、docs/database schema JSON、真实打印中文字体与许可证、core tests和所需fixtures全部保护；用户未追踪需求/报告原型文档保护；private/env/output本地证据不参与删除。
- [ ] **Step 4 — 迁移有效断言：** 保留`frontend/src/util/reportCoreImport.test.js`业务断言并迁到`src/app/reportCore/importRows.test.js`，原旧学生主题/商城/兑换断言若已退役不伪造成新需求。package.test改`node --test src/app/reportCore/*.test.js`且实际覆盖新纯模型；先跑绿后删旧命令。所有新core浏览器流程仍有可执行入口。
- [ ] **Step 5 — 提交清单：** 测试与文档变更PASS后`docs: inventory retired files and preserve core verification`，此提交不先删未经确认依赖的文件。

## Task 14: 分批删除退役代码与旧执行入口

**Files:** 仅删除Task13清单已判定的精确路径；Modify `backend/package.json`, `README.md`、相关执行说明。

**Interfaces:** 消费Task13逐路径清单与已迁移回归；产出保留核心入口、六表check/apply和旧库audit的精简目录。`npm run migrate`与`npm run migrate:core`均默认check，显式`-- --apply`才初始化安全新库。

- [ ] **Step 1 — 前端批次：** 按清单删未挂载旧页面/组件/常量/工具与对应已退役测试；每批`npm run build`与当前纯函数测试PASS，查找404资源。保留related docs及正在评审的prototype，不以untracked认定垃圾。
- [ ] **Step 2 — 后端批次：** 仅删旧API闭包（已由app返回410）；保留report-core、authorization、cardCredentials、privateFiles和被核心调用的通用代码。运行`npm test`确认PASS后继续，不按命名前缀猜用途。
- [ ] **Step 3 — 旧迁移/演示退役：** 默认`migrate`改指`runCoreMigrations.js`且默认只check，建新库必须显式`--apply`。旧runMigrations/seed/init_db_data、full-system-demo与.command仅在核心迁移/测试不依赖时删；更新README所有命令/链接，历史交付文档标历史，不给已删除脚本留“当前支持”承诺。
- [ ] **Step 4 — 缓存与对账：** 删除已追踪`__pycache__/materials.cpython-314.pyc`等缓存，补忽略规则。清单写实际删除量/保留理由；确认未删除.env、上传、源数据库或核心字体。核心新库初始化check/apply及旧库只读audit回归仍PASS。
- [ ] **Step 5 — 提交：** 前后端/执行入口可各独立提交，均带对应清单与验证证据；禁止一次无差别清空目录或真实数据。

## Task 15: 依赖、样式与构建收敛

**Files:** Modify `frontend/src/main.jsx`, `frontend/src/app/reportCore/style.css`, `frontend/vite.config.js`, `frontend/package.json`, `frontend/package-lock.json`, `backend/package.json`, `backend/package-lock.json`；按清单删除已退役less和未用资产。

**Interfaces:** 消费Task4共享tokens和Task14已清理入口；产出可`npm ci`重建的锁文件、前端test/lint/build命令和可被Express直接托管的dist，业务API契约不变。

- [ ] **Step 1 — 样式迁移：** 确认reset/字体/布局已由tokens/style承担，再移除main的index.less/var.less导入及Vite less配置；视觉核对无回退后删除文件。核心页面不再依赖旧全局class碰运气生效。
- [ ] **Step 2 — 精简依赖：** 全量引用清零后才移除antd、icons、axios、classnames、jotai、react-router-dom、less等候选；xlsx/PDFKit/qrcode/yazl/中文字体及核心后端依赖保留。由包管理器同步lock，不删锁文件或手改虚假依赖树；无使用证据的后端包同样先审后删。
- [ ] **Step 3 — 构建验证：** 独立临时工作目录按锁定依赖`npm ci`，前端test/build/lint PASS，后端test PASS；用构建dist启动Express确认真实页面及资源可读。不得先删除当前提供服务的dist再让用户遇到空站。
- [ ] **Step 4 — 量化结果：** 记录构建体积/依赖变化、实际保留源文件和命令，不以“少了N行”代替正确性；文档本身不列入垃圾目标。
- [ ] **Step 5 — 提交：** `chore: remove unused legacy dependencies and consolidate core styles`。

## Task 16: 三角色全链路与交付

**Files:** Update `frontend/tests/report-core-flow.cjs`, `report-core-ledger.cjs`, `report-core-reports.cjs`, `report-core-preview.cjs`; Create `docs/delivery/role-ux/验收记录.md`、`变更与回退.md`。

**Interfaces:** 消费Task1–15的真实服务和角色界面；产出可重复的独立测试库流程、校验断言、实际删除清单及Git回退范围。测试夹具仅在隔离测试环境，不进入业务默认行为。

- [ ] **Step 1 — 执行真实闭环：** 独立测试库中两班、班主任/普通任课/管理员/学生：模板账号/学籍导入→多教师原子额度→分班制卡→原卡扫码；空说明多选直评；教师学业导入/管理员健康逐格差异导入；奖状→认定；自评13+动态特长+7文本；三类月故事→真实worker评分或明确失败处理；寄语/结算→确认→全校准备→activate→学生读取冻结报告。使用批准的可控provider夹具测试，不调用付费线上模型充当自动化依赖。
- [ ] **Step 2 — 执行负向/恢复：** 幂等超时重试、409保留草稿、跨账号退出、跨班/跨校猜ID、任课请求full/确认、扫码/作废竞争、调额/生成竞争、101+分页、跨月冲正、导出超限/中断、发布中断恢复；所有失败不产生半成品积分或提前暴露学生报告。
- [ ] **Step 3 — 执行视觉/打印：** 390/768/1440、200%缩放、键盘、焦点和对比度；检查PDF基准6板块109位置与合并表头，学生身份/版本一致，明细1页/完整2页，长文本/多特长溢出拦截不截字；台账重复表头、CSV全量、按班二维码PDF原码复打；保留截图/下载哈希/布局结果于ignored output而非代码目录。
- [ ] **Step 4 — 终检：** 后端`npm test`；前端`npm test && npm run lint && npm run build`；core-flow/ledger/reports/admin四个浏览器测试和preview测试全部PASS。性能只对新增聚合/导出/报告列表测本次新增风险，沿用原发布基线，不无理由反复跑全量压力。确认库仍六张业务表、没有伪造LLM成功、没有密钥进入代码/日志/示例。
- [ ] **Step 5 — 交付与提交：** 记录真实可用项、已知限制（每教师月计划生成后不可增补、扫码依赖链接/粘贴、打印面板另存PDF、历史未知留痕不补造）、文件删除清单、回退提交范围；最终独立审阅只处理真实可复现问题，不自动部署/合并/重建业务库。

## 最终完成标准

六类真实输入和全校统一发布仍闭环；新三角色界面不是静态页面壳。学生自评完整且可保存恢复；教师单页直评选填说明、卡台账可对账/查询/导出/打印、全部负责班级与PDF式详情可用；管理员不拿到私有正文。所有清理动作有依赖证据与可恢复Git提交，现有业务数据和必要运行/迁移/测试/文档均保留。

## 计划自审记录

- 范围覆盖：总设计→Task4–7/9/12；卡台账→Task1–3/8；班级报告→Task9–11；管理员三菜单与原子批量额度→Task12A；学期配置→Task12B；清理→Task13–15；跨模块验收→Task16。
- 接口一致：归属月/实际事件时间及asOf由Task2定义，导出与页面消费同一口径；Task9纯完整度供readiness、workspace与Task10复用；Task10权限产生Task11动作，不由UI推断。
- 五类Review Focus均有对应失败/负向测试；没有以颜色测试代替保存、权限、分页和打印边界。
- 计划没有额外业务表、通用表单/库存/报表引擎、服务端PDF依赖或微服务；旧SQL/字体/相关文档按真实依赖保护。
- 本文件只是实施步骤与验收门槛，未执行产品代码修改、删除、依赖安装或数据库变更。管理员三个独立菜单已完成原型展示与独立设计审阅；新增学期配置设计待用户页面评审。任务扩为18个、90项任务步骤，覆盖五份设计。实施方式保持当前会话逐任务执行，不另行要求选择。
