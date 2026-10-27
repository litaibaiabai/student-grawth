# 一键全自动三角色演示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 一个命令从全新独立数据启动可见浏览器并完成三角色23菜单和业务闭环。
**Architecture:** Node调度器持有运行清单/服务进程；初始化及Python资料生成写独立run；Playwright通过真实UI操作，API仅只读核对。全过程证据及失败状态与run绑定。
**Tech Stack:** Node20+、Playwright/Chrome、Python/xlsxwriter/Pillow/reportlab、MySQL、现有React/Express。
**Spec:** docs/superpowers/specs/2026-10-26-one-click-autonomous-demo-design.md

## Global Constraints
- 每次新建唯一数据库与runId，8名虚构学生、2个班、2名教师和1管理员。
- 单个可见浏览器窗口连续演示，业务全部通过UI；不用localStorage伪造登录或API替代提交。
- 原业务库/原.env/现有服务/旧证据不覆盖、不清空；秘密不进入普通报告。
- 用户要求正式演示顺畅无错误：开发阶段先完整试跑修复，交付成功运行证据；异常保障不能伪报成功。
- 单命令默认完整自动演示，不需逐步确认；成功保留浏览器与专用服务，Ctrl+C只关闭本任务资源。

## Review Focus
- Node18与Playwright不兼容：入口自动重启到可用Node20+并在预检证明。
- 已占用端口及旧库：只选择空闲端口、新建唯一库，不杀未知进程。
- 业务重试导致重复加分：仅只读轮询重试，提交失败保留现场并非0。
- 下载/新开页：真实文件下载与blob弹页/PDF打印必须等完成并断言内容。
- 多次运行归档与凭证：每run独立报告/输出；private权限限制，普通报告不含token或环境秘密。

### Task 1: 运行环境、唯一初始化与素材
**Files:** environment.cjs,initialize.cjs,materials.py,environment.test.cjs
**Interfaces:** preflight(options)->runtime；initialize(runtime)->manifest；运行目录output/full-system-demo/<runId>。
- [x] 先写日期/端口/参数/失败记录测试并看到失败。
- [x] 恢复归档中必要生成资源到新目录，改为参数化输出，禁止向原demo目录及旧docs写入。
- [x] 实现Node20回退、依赖/Chrome/Python/MySQL只读预检、端口分配；测试通过。

### Task 2: 浏览器章节与生命周期
**Files:** run.cjs,steps.cjs,browser-demo.cjs,service.cjs
**Interfaces:** run(options)调度初始化→素材→服务→browserDemo({page,manifest,steps})；步骤记录PASS/FAIL与截图。
- [x] 用步骤失败/成功与覆盖完整性测试建立证据。
- [x] 实现UI登录角色切换、主线所有步骤、真实PDF/QR/Excel/证书/故事/报告下载。
- [x] 实现统一等待和断言、脱敏日志、视频/trace、报告HTML/JSON与安全停止。

### Task 3: 全新库真实有头试跑
**Files:** 运行输出；必要的最小脚本或产品修复及回归。
- [x] 运行单入口，逐个定位失败并修复，不靠预写结果或跳过章节。
- [x] 从全新起点完整重跑，23菜单覆盖，8人预期一致，真实报告PDF可读。
- [x] 验证只读预检、重复run保留旧结果及退出清理。

### Task 4: 一键交付与独立审阅
**Files:** README.md,完整系统自动演示.command,delivery索引。
- [x] 使用说明、速度/检查/运行目录/终止方式，入口可执行。
- [x] 必要测试/前端构建、独立审阅、重要问题修复复测。
- [x] 交付已通过的完整自动演示运行报告，不把过去MCP手动测试当成本脚本证据。

## 执行授权
用户确认“继续”，在当前会话按计划内联完成，不另加计划审批。新脚本独立目录开发，保留当前已有修复与用户删除；不提交无关工作。

## 完成证据

最新有头试跑20261027_cc4fb4：退出0，13章/23菜单PASS，8人对账一致，真实200张卡与报告PDF已核验。脚本13测试及前端16测试通过，前端构建通过；生命周期和Node18信号问题已修复。交付索引：docs/delivery/full-system-demo/README.md。
