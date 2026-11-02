# 教师六育综合情况优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 任教班级选择 → 学生星级/等级比例概要 → 原格式六育报表。

**Architecture:** 保留 `ClassReports` 原有路由、详情对象、`TermReport`、版本及权限逻辑；将列表改为上方班级选择、下方两组比例分布。后端摘要按当前学期字典统计，前端只计算比例。

**Tech Stack:** 现有 React 18、CSS、Node 测试与 MySQL 隔离测试库，无新增依赖。

**Spec:** 本聊天已评审的交互草图及用户补充：详情报表按之前的对象格式显示；关联 `../specs/2026-10-29-class-report-browser-design.md`。

## Global Constraints

- 初次进入先选择任教班级，未选班级不加载跨班学生列表。
- 概要只展示身份、三星/二星/一星比例、A/B/C/D 比例与报表入口。
- 分母为各自已评价项目；空数据不显示成一星或 D；零分布仍显示 0%。
- 详情继续使用原对象、原生成器和原 `TermReport`，不采用草图示例表格。
- 保留原搜索、状态筛选、分页、版本权限与详情返回恢复。
- 在当前存在目录迁移的工作区原地修改；不提交其他现有改动。

## Review Focus

- 未选班级、无任教职责、空班与搜索无结果。
- 全空比例与缺失项；未知字母不能挤入 ABCD 分母。
- V1/V2 学期字典变化，重复展示字段不得重复计数。
- 详情返回、浏览器前进后退、学期切换不呈现旧请求数据。
- 窄屏概要不溢出；原详情 HTML 与权限不因样式变化而改变。

### Task 1: 可靠比例与学期摘要

**Files:** `frontend/src/app/teacher/reports/reportSummary.js`、同目录 `reportSummary.test.js`；`backend/services/reportCoreReportBrowser.js`、`backend/__tests__/report_core_report_browser.test.js`。

**Interfaces:** `ratingDistribution(counts, keys)` → `{total, items:[{key,count,percent}]}`；沿用 API 的 `starCounts`、`gradeCounts`，增加 `gradeMissingCount`。

- [x] 编写比例测试：空值、0%、缺失不入分母、整数比例；编写 V2 字典摘要回归。
- [x] 先运行测试观察失败，再实现按字典去重统计与比例函数。
- [x] 验证相关前后端测试。

### Task 2: 班级与学生概要界面

**Files:** `frontend/src/app/teacher/reports/ClassReports.jsx`、`classReports.css`。

**Interfaces:** 沿用 `ctx` 和 hash route；`TermReport` 的原 props 与详情数据保持原样。

- [x] 首屏班级卡片与未选择提示；只有选择班级后请求学生摘要。
- [x] 两组分布色条、百分比及悬停数量，保留查询/分页；学生姓名与按钮可进入详情。
- [x] 添加独立局部样式和响应式布局，保留原详情结构。
- [x] 浏览器验证空态、切班、搜索、详情原格式、返回恢复与窄屏。

### Task 3: 验收

- [x] 运行前端测试、构建、相关后端摘要与报告回归。
- [x] 检查改动范围与可视截图，记录验证结果。

## 执行记录

- 前置判断：当前目录含尚未提交的角色目录迁移，本次保留工作区与原详情链路；直接实施已授权的小范围模块优化。

- 完成：比例函数 3 项测试；前端全量 27/27；后端报告浏览器 9/9；局部 ESLint 通过；生产构建通过。
- 浏览器验收：隔离合成班级；未选班无摘要请求；28 人按 25+3 分页；搜索、切班、空班、无评价、详情及返回恢复通过；390px 下页面宽度未超视口。
- 原格式证明：详情仍调用原 getReportDetail 和 TermReport，实际显示六育评价明细表、六板块、原字段及打印/导出按钮。对象构造和详情 JSX 未修改。
- 调整：全局范围栏对 drafts 隐藏，避免出现第二组不控制此模块的班级/学科选择。
- 独立只读审查无阻断问题；唯一轻微问题“班级数缩减后搜索框消失”已用保留非空查询输入修正；浏览器发现的搜索图标与文字重叠也已修正。
- 全量后端：149 通过、3 失败、1 跳过。与本次修改无关的失败：report_core_course_card_fixtures.test.js 的 course card demo keeps four assignments…、course card demo refuses a non-demo teacher…（缺失 seedCourseCardFixtures 模块）；report_core_provider.test.js 的 vendor account failures remain retryable without exposing billing details（期望503，实际502/404）。未改动这些文件。
- 交付为当前工作区代码，不提交现有目录迁移或其他任务改动。实际预览使用独立测试数据库，非学校业务数据。

## 后续界面调整：标题与操作位置

- 按用户截图要求，详情标题只显示学生基本信息：学号、班级、学期、报告状态，不放按钮或下拉控件。
- 报告版本、范围选择移入报表工具栏；按钮依次为打印、导出PDF、确认本份报告、返回班级列表。
- 刷新报告按钮移除；缺项核对和原编辑功能置于报表下方，报表 HTML 对象及确认权限、布局校验不变。
- 验证：浏览器读取标题按钮/下拉数量为 0，工具栏按钮顺序正确；范围切换正常且缺项时确认仍禁用；27 项前端测试、局部 ESLint 与生产构建通过。

## 后续精简：默认完整报告

- 按用户最新要求移除报告版本、报告范围下拉，以及底部待补充说明、查看缺项、过程表现采集结算入口。
- 有完整报告权限时，学生入口和无范围参数的详情默认显示完整报告；没有完整权限的任课教师仍通过后端权限检查读取明细。
- 保留原报表对象、四个工具栏按钮和既有确认校验。剩余寄语/免修编辑区仅在有对应权限时显示，不保留空白底部面板。
- 验证：27 项前端测试和构建通过；浏览器确认完整报告共 2 页、删除的两个下拉和两个入口数量为 0、旧提示不存在；任课教师回退明细正常且无越权确认入口。
- 局部 ESLint：报表组件通过；TeacherModule 文件存在既有 react-refresh/only-export-components 导出规则问题，单独关闭该规则检查后其余规则通过。
