# 学科自动配卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将逐教师手工制卡替换为按主教学科自动月配卡，支持审核归类与集中 PDF 打印。

**Architecture:** Express/MySQL 保存学科、策略版本、不可变月分配与加密卡片凭证；后台任务自动恢复生成并提供持久打印包。React/Ant Design 沿用现有页面与菜单，新增学科配置和审核选择，扫码凭证经登录恢复。

**Tech Stack:** 现有 React、Express、MySQL 8、node:test；PDFKit、qrcode、OFL 中文字体。

**Spec:** `docs/superpowers/specs/2026-10-26-subject-card-issuance-design.md`

## Global Constraints

- 每位教师每月一份，按管理员指定主教学科分配；唯一键为学校＋教师＋月份。
- 月总张数与六育比例配置；固定每卡 +1，审核时才选择两层子类。
- 每月1日及补发检查自动生成；已有批次时策略修改下月生效，零张不占批次。
- 有效学期覆盖月份才发卡；待审截止取次月3日23:59与学期审核截止较早者。
- PDF 按教师分组；重复打印不增发；保留旧测试数据并隔离，退役旧配额与制卡接口。
- 保留原工作区其他任务修改；本次先在托管工作树实现，核对基线后只合回本次差异。

## Review Focus

- 策略并发修改与首次批次：同学科当月不得出现不同版本，任务中断不得重发。
- 学校私有校历未覆盖月份：不得回退全局基线误发假期卡。
- 跨年月份、月底和提前学期截止：申领与审核在同一学校时区执行。
- 未登录扫码与错误角色：凭证恢复后仍由学生主动确认，不自动发分。
- PDF 中断与部分教师异常：凭证可恢复、清单固定，不能把部分完成当成全校完成。

### Task 1: 规则与增量结构

**Files:** 新建 `backend/services/cardRules.js`、`backend/migrations/20261026_subject_cards.js`；修改全量 SQL 与迁移入口；测试 `backend/__tests__/card_rules.test.js`、隔离库迁移测试。

**Interfaces:** 输出 `allocateCards(total,ratios)`、`selectCardTerm(terms,schoolId,monthKey)`、`cardWindow(term,monthKey)`、`effectivePolicyMonth(monthKey,hasAllocation)` 与 `migrateSubjectCards(connection)`。

- [ ] 先写数量101分配、0比例、非法数值、专属校历、跨年审核截止、旧字段升级和重复迁移测试并观察失败。
- [ ] 实现整数比例、月份与截止计算；新增字典、教师关系、策略、分配、异常、打印包表及卡/申领扩展，保留旧数据。
- [ ] 在独立库运行规则与迁移测试，再运行现有套件。

### Task 2: 学科配置与自动分配

**Files:** 新建 `backend/services/cardAllocationService.js`、`backend/controllers/cardPolicyController.js`；修改 `backend/routes/api.js`、`backend/services/scheduler.js`；测试 `backend/__tests__/subject_cards.integration.test.js`。

**Interfaces:** `reconcileMonth({schoolId,now})`、`saveSubjectPolicy({schoolId,subjectId,monthlyTotal,ratios,enabled,actorId,now})`；按规格提供字典、教师学科、策略、分配与异常 API。

- [ ] 写无卡月修改、已有批次修改、新教师补发、重试并发、缺数据与停用教师集成测试，观察失败。
- [ ] 用学科行锁和不可变分配快照实现版本生效；批次事务生成稳定卡位与加密令牌，异常可恢复，保存配置后自动检查当前月。
- [ ] 验证同校/跨校、教师仅本人、零配额不占批次及所有预期失败状态。

### Task 3: 扫码与审核

**Files:** 修改 `backend/controllers/cardController.js`、`backend/controllers/categoryController.js`、`backend/controllers/termController.js`、路由与日志；扩展集成测试并更新旧回归断言。

**Interfaces:** POST preview；申领请求 `{token,requestKey}`；审核通过 `{decision,categoryId,requestKey,remark?}`；学期字段 `reviewDeadlineAt`。

- [ ] 写无叶子卡可申领、跨方向/父子/版本校验、教师归属、幂等一次+1、截止竞争、旧接口退役测试，观察失败。
- [ ] 实现方向独立、审核分类入账、分类快照、同校管理员接管、接口级时间检查与正式状态过期。
- [ ] 更新有意退役的旧契约测试，运行整套后端测试。

### Task 4: 持久化 PDF

**Files:** 新建 `backend/services/cardPrintService.js`、`backend/controllers/cardPrintController.js`、中文字体与许可；修改依赖、环境示例、忽略规则及 Docker 打包；测试打印包和恢复。

**Interfaces:** `createPrintPack({schoolId,monthKey,actorId})`、查询及鉴权下载 API；采用固定分配清单，QR 使用前端 HashRouter 领取地址。

- [ ] 写打印包不就绪摘要、同卡重印、凭证解密、跨校下载和可解析 PDF 测试，观察失败。
- [ ] 实现私有文件、持久密钥、可重试 PDF、教师分组与六育卡面；不提供原始令牌列表。
- [ ] 渲染样例 PDF 为 PNG 检查中文、分页、二维码留白与卡面；解码二维码核对可领取路径。

### Task 5: 管理员配置界面与学期字段

**Files:** 重写 `frontend/src/app/admin/cards.jsx`；新增三个页签组件；修改 URL 常量、学期页面、仪表盘相关查询。

**Interfaces:** 使用 Task 2/4 的 API；管理员显示教师学科／学科策略／月度分配与打印，教师显示本人只读分配。

- [ ] 按 API 契约核对页面加载、表单验证、数量预览、生效月份和异常；删除旧表单及调用。
- [ ] 沿用现有绿白学校管理风格，实现完整加载、空态、失败态和 PDF 下载。
- [ ] 构建前端并以真实页面检查管理员配置与教师权限。

### Task 6: 审核界面与扫码登录恢复

**Files:** 修改 `frontend/src/app/teacher/claims.jsx`、`frontend/src/app/student/claim.jsx`、`frontend/src/App.jsx`、登录页；新增扫码暂存工具和行为测试。

**Interfaces:** 在认证守卫挂载领取页之前保存卡片凭证；登录后恢复内部领取路由；审核两级联动，学生确认才提交。

- [ ] 写扫码凭证捕获/清理/安全内部返回测试，观察失败；再实现认证恢复。
- [ ] 实现审核弹窗、锁定方向、完整子类必填与固定+1；学生预览显示待老师确定分类。
- [ ] 真实浏览器核对未登录扫码→登录→预览→申领→教师选择→账本+1。

### Task 7: 整体验证与合回

**Files:** 文档、环境样例、既有/新增测试及必要衔接。

- [ ] 跑完整后端套件、前端构建、迁移重复执行、月度并发恢复与 PDF 视觉/扫码检查；修正实际失败。
- [ ] 独立审阅本次基线差异，处理重要问题并补回归测试。
- [ ] 对照原工作区基线，只合回本次文件差异；并发修改文件逐项合并，保留其他任务成果。
- [ ] 交付实现、验证结果、部署所需配置和实际限制。仅提交本次工作，不捎带原有未提交改动。
