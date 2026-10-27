# 三角色全系统演示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 交付可重复的全系统演示资料，并用本机MCP完成三角色闭环及异常验收。

**Architecture:** 新建资料目录和唯一独立MySQL库，复用当前源码及已安装依赖；不更改原环境。资料生成器提供账号、导入文件、模拟材料与独立预期核算；实际业务结果由页面操作产生并保存证据。

**Tech Stack:** Node/mysql2、Python/openpyxl/Pillow、PDFKit、HTML/SVG、CUA MCP。

**Spec:** docs/superpowers/specs/2026-10-26-three-role-full-demo-design.md

## Global Constraints

- 8名虚构学生、四年级两个班、2名演示教师、1名管理员；另设最小量的边界测试账号。
- 使用本机独立 MySQL 演示库和独立端口，不覆盖原业务库、原 `.env`、现有服务及旧材料。
- 先生成所有演示资料与演示方案，再使用 MCP 在本机完成一次全面测试。
- 未执行项目不得标通过；历史18条过程分明确标注。故事建议为规则模拟，学科成绩与六育终测独立。
- 不预置现场申领、审核、荣誉通过、报告；运行结果库保留。自动回归使用独立测试库。

## Review Focus

- 重建或重复运行不得覆盖既有数据库：初始化使用CREATE DATABASE并拒绝重名，清单与库名绑定。
- 演示素材与真实账号、日期一致：验证所有学号、月份、文件哈希及模板列名。
- 越权写入比列表泄露更危险：异校、跨班以及学生改studentId的API负向验证。
- 缺项与零分不可混淆：测试未补齐阻断、补齐发布及零分计算。
- 演示后可重演而不造假：保留终态，重建新运行实例，不重置使用过的卡。

### Task 1: 环境与资料生成器

**Files:** Create `demo_materials/full-system-demo/{initialize.cjs,start.cjs,generate.py,README.md}`；运行产物 `runs/<runId>/`。

**Interfaces:** initialize.cjs 输出manifest.json（数据库名、端口、账号映射、学期、月份）；私有环境放`.runtime/`，不输出数据库密码；generate.py读取manifest生成资料。

- [ ] 核对数据库schema与模板列，选择空闲3088/5188。
- [ ] 实现拒绝重名的独立初始化、基础字典/账号/历史18分、可重复启动；初始业务结果表为空。
- [ ] 生成账号/教师策略表、三版学科Excel、缺项/完整六育Excel、预期公式表与独立CSV、模拟证书两版、故事文本与材料哈希。
- [ ] 验证表格解析、公式缓存、图片及主角预期90.5分；确认没有现场业务预置。

### Task 2: 完整演示手册与流程图

**Files:** Create `docs/delivery/full-system-demo/{README.md,演示手册.md,演示手册.pdf,三角色流程图.html,三角色流程图.svg,MCP测试报告.md}`。

**Interfaces:** 使用Task1清单中的真实入口、账号、学号、素材路径；测试报告先为NOT RUN。

- [ ] 编写13阶段逐步操作、讲稿、角色切换、材料、预期数字与异常排查。
- [ ] 生成PDF、HTML/SVG图及测试矩阵；真实卡PDF和报告标明将在系统对应步骤生成。
- [ ] 渲染检查PDF、证书与流程图，修复溢出/错字；所有资料就绪再开始UI验收。

### Task 3: MCP全流程实测与真实下载

**Files:** 运行目录 `evidence/`、`downloads/`；更新MCP测试报告。

**Interfaces:** Task1start启动专用端口；Task2步骤控制UI主线，页面产物写证据索引。

- [ ] 管理员学期/指标/规则、主教学科/策略/分配/真实PDF；教师分配；学生预览取消/确认；教师两级审核；学生账本。
- [ ] 直评与冲销、荣誉退回补交、故事草稿修订终审；记录前后变化。
- [ ] Excel错误/正确/更新导入、六维缺项阻断/补齐、独立核算、报告发布及受控打印视图、审计。
- [ ] 覆盖三角色全部菜单，保存每阶段截图和实际卡片/报告产物。

### Task 4: 边界验证、缺陷修复及交付

**Files:** 如需产品修复，先明确最小文件并以新增回归验证；测试记录写 `docs/delivery/full-system-demo/`。

**Interfaces:** 独立回归库运行现有测试，API/只读DB核对与UI证据分开标注。

- [ ] 未登录/跨角色/跨校/跨班、重复提交、缺项/零分、版本快照与私有下载验证。
- [ ] 对普通闭环缺陷先复现再最小修复并复测；规则决策未解决则如实BLOCKED。
- [ ] 运行后端/前端回归及构建，汇总PASS/FAIL/BLOCKED与证据。
- [ ] 独立审阅最终资料/脚本/必要修复；更新可重建起点、保留终态和交付索引。

## 执行记录

用户已授权继续执行；按当前会话内联完成，不再次请求计划确认。资料任务在新目录隔离，不改写已有产品变更，不提交无关工作。
