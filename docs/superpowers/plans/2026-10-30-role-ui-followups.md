# 三角色界面延期项补齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline to implement this plan task-by-task.

**Goal:** 补齐上次公开延期的三组界面操作，保持已确认布局与数据权限。
**Architecture:** 扩展现有额度预览、班级报告DTO与组件、台账已有filters；不引入表单引擎或统计缓存。沿用React/Express/MySQL六表。
**Tech Stack:** Node≥22.12、React18、Vite、Express、MySQL8；无新增依赖。
**Spec:** docs/superpowers/specs/2026-10-29-admin-three-menus-design.md、2026-10-29-class-report-browser-design.md、2026-10-28-teacher-card-ledger-design.md，以及docs/delivery/role-ux/独立审阅与修复.md延期清单。用户“继续”授权补齐延期项。

## Global Constraints

保持六张业务表；不用生产数据库/线上LLM；模板账号按字符串保留前导零。现有CAS/整批原子提交/草稿保护/报告私有正面权限不可退化。使用当前工作树codex/role-ux，不部署/合并，不改用户已打开预览的数据。

## Review Focus

账号与ID混用重复/未知/停用教师须完整报错且整批不写；迟到预览不能恢复旧输入。切页大小须清游标且保留返回范围。板块定位仅滚动屏幕DOM，不改变冻结HTML或打印。台账下钻不能把过滤量误称教师总盘；未知时间仍明示，不补造归属。窄屏/键盘仍可操作。

## Task 1: 额度模板及完整错误

Files: backend/services/reportCoreQuotaBatch.js、reportCoreAdminData.js；frontend/src/app/reportCore/AdminQuota.jsx；backend/__tests__/report_core_quota_batch.test.js、frontend/tests/report-core-followups.cjs。
- [x] RED：账号匹配与ID混用重复、未知/停用/非法额度、多行同时报错；前导零模板及职责摘要浏览器断言。
- [x] GREEN：entries可用teacherAccount，解析成内部ID再确定顺序加锁；返回422安全errors数组，任一错误不创建预览；UI展示全部错误并保留输入。模板按教师账号，兼容旧ID模板；目录增加安全任教摘要。绑定预览输入版本。
- [x] 验证后端quota及admin数据测试、浏览器对应场景并提交。

## Task 2: 班级报告搜索与定位

Files: ClassReports.jsx、navigation.js、TermReport/index.jsx、reportCoreReportBrowser.js；报告与followups测试。
- [x] RED：班级搜索/各班就绪缺项确认发布数、25/50/100清游标、摘要板块直达报告、往返保持筛选。
- [x] GREEN：班级列表本地搜索与现有counts，DTO补ready；URL绑定reportLimit/reportSection，服务分页hash含limit；TermReport仅scrollIntoView屏幕section，不改冻结HTML/打印。
- [x] 验证报告权限/版本竞态、打印与前端test/lint/build并提交。

## Task 3: 台账筛选、下钻与完整性

Files: CardLedger.jsx、必要style.css；frontend/tests/report-core-followups.cjs、ledger测试。
- [x] RED：六育/一级联动过滤、指标重置；数字进入对应使用明细，方向计划展开；UNKNOWN历史标记。
- [x] GREEN：使用现有section/primary filters；统计卡下钻到有明确范围的视图（额度/余额到制卡计划，制卡/领取/待领到对应纸卡状态）；原教师总盘统计保持原名。班级行展开已有indicatorPlans；展示summary历史完整性和未知时间/状态数量。
- [x] 运行followups、backend、frontend test/lint/build及受影响浏览器；一次新上下文最终审阅，仅修复真实问题；写交付增量说明并提交。保留分支/预览，不部署。
