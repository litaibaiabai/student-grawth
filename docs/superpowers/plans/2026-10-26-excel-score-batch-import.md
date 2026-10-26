# 全校学生成绩 Excel 批量导入实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底摒弃手工粘贴 JSON 模式，为全校 2000~3000 名学生成绩提供高性能、高容错的 Excel 大总表批量导入与异常导出闭环。

**Architecture:** 前端采用客户端极速解析 Excel（基于 SheetJS），提取学生标识与横向学科分值；后端提供批处理接口，采用内存映射过滤分流（正常集 vs 异常集），并通过 Chunked Bulk UPSERT 实现数万条成绩秒级原子入库。异常数据支持一键导出含诊断原因的专属 Excel 供修正补传。

**Tech Stack:** Node.js (Express), MySQL2 (Connection Pool & Batch Query), SheetJS (xlsx), React (Ant Design v5).

**Spec:** [docs/superpowers/specs/2026-10-26-excel-score-batch-import-design.md](file:///Users/quanta/Downloads/task/六育学生评价系统v2/docs/superpowers/specs/2026-10-26-excel-score-batch-import-design.md)

## Global Constraints

- 单次支持全校规模：2,000 ~ 3,000 名学生，单次导入科目成绩总数 15,000 ~ 30,000 条。
- 容错原则：正常学生数据直接入库，绝不因个别异常行阻断全表（Partial Success）。
- 性能指标：2,000 ~ 3,000 名学生成绩全量入库耗时 ≤ 3 秒。
- 权限隔离：学科成绩支持教务与教师导入，六育终测维度评分仅限教务管理员。
- 兼容性：保留原有的 `/api/v1/import/preview` 和 `/api/v1/import/commit` 兼容历史单科测试，新增专用的全科总表批处理接口。

## Review Focus

1. **学号首位包含前导 0 的字符串丢失**（如 `012345` 被 Excel 识别为数值 `12345`）：必须强制在解析与比对时转为字符串修剪处理。
2. **缺考科目与零分混淆**：单元格留空或横杠 `-` 应识别为缺考（跳过该科目写入），填 `0` 必须准确记录为 0 分。
3. **分值超出合法范围**：针对非数字、负数、超过对应满分（>100 或 >150）的数值，精准标记为异常并不入库该学生的该科目。
4. **Excel 内部包含重复学号行**：同一 Excel 出现相同学号时，记录诊断异常或在预览阶段明确预警。
5. **超大批量 SQL 拼接占位符超出限制**：按 1,000 条记录进行分块写入，防止单条 SQL 超过 MySQL `max_allowed_packet`。

---

### Task 1: 后端批处理路由与分块高效入库核心实现

**Files:**
- Create: `backend/services/batchImportService.js`
- Modify: `backend/controllers/importController.js`
- Modify: `backend/routes/import.js`
- Test: `backend/__tests__/batch_import.test.js`

**Interfaces:**
- Consumes: `pool` from `backend/db.js`, `ErrorCodes` from `backend/constants/errorCodes.js`
- Produces: 
  - `previewBatchExcel({ schoolId, termId, type, rows, operatorId })` -> `{ totalStudents, validCount, invalidCount, errors, validStudents, subjectsDetected }`
  - `commitBatchExcel({ schoolId, termId, type, validStudents, operatorId })` -> `{ batchNo, committedStudents, committedScoresCount }`

- [ ] **Step 1: 编写批处理验证测试用例**

在 `backend/__tests__/batch_import.test.js` 中创建测试套件，模拟 2500 名学生数据输入（包含 5 名异常学生：学号不存在、分值非数字、负分等），验证分流正确性与秒级写入。

- [ ] **Step 2: 运行测试验证失败**

运行: `NODE_ENV=test node --test backend/__tests__/batch_import.test.js`
期望: FAIL (模块未定义)

- [ ] **Step 3: 实现 `backend/services/batchImportService.js`**

编写内存学生预加载比对与分块批量 SQL：
1. 预加载全校学生 `Map<username, student>`。
2. 对输入的 `rows` 逐行校验：
   - 提取学号 `row.username` 并去除前后空格；
   - 匹配学生实体，未匹配记录到 `errors`；
   - 遍历各科得分，非空则校验数字有效性与范围；
   - 有非法分数的学生行记录到 `errors`，校验通过的进入 `validStudents`。
3. 分块多行批量 UPSERT：
   - 每次拼装 1,000 行 `INSERT INTO subject_score (...) VALUES ... ON DUPLICATE KEY UPDATE raw_score=VALUES(raw_score), batch_no=VALUES(batch_no)`；
   - 写入 `operation_audit` 审计日志。

- [ ] **Step 4: 在 `importController.js` 和路由中暴露接口**

在 `importController.js` 中新增 `previewBatchImport` 和 `commitBatchImport`，并在 `backend/routes/import.js` 中挂载：
- `POST /api/v1/import/batch-preview`
- `POST /api/v1/import/batch-commit`

- [ ] **Step 5: 运行后端测试验证通过**

运行: `NODE_ENV=test node --test backend/__tests__/batch_import.test.js`
期望: PASS (所有断言通过，耗时 < 2 秒)

- [ ] **Step 6: 提交代码**

```bash
git add backend/services/batchImportService.js backend/controllers/importController.js backend/routes/import.js backend/__tests__/batch_import.test.js
git commit -m "feat(backend): add high-performance batch score import service and routes"
```

---

### Task 2: 前端 Excel 解析与模板生成工具库

**Files:**
- Create: `frontend/src/util/excelScoreParser.js`
- Test: `frontend/src/util/__tests__/excelScoreParser.test.js`

**Interfaces:**
- Consumes: `xlsx` (SheetJS)
- Produces:
  - `parseScoreExcel(file: File): Promise<{ rows: Array, headers: Array }>`
  - `downloadScoreTemplate(type: 'subject' | 'dimension'): void`
  - `exportErrorReportExcel(errors: Array, originalRows: Array): void`

- [ ] **Step 1: 安装或引入 xlsx 依赖**

检查 `frontend/package.json`，确保包含 `xlsx` 库（如未安装则执行安装并配置）。

- [ ] **Step 2: 实现 `frontend/src/util/excelScoreParser.js`**

1. `parseScoreExcel`:
   - 使用 `FileReader` 将上传的 File 读取为 `ArrayBuffer`。
   - `XLSX.read` 解析第一个工作表，识别表头字段：
     - 学号字段映射：匹配“学号”、“账号”、“student_no”、“username”
     - 姓名字段映射：匹配“姓名”、“学生姓名”、“real_name”
     - 班级/年级映射：匹配“年级”、“班级”、“class”
     - 其余列自动映射为学科/维度列。
2. `downloadScoreTemplate`:
   - 预制包含常用学科（语文、数学、英语、物理、化学、生物、道德与法治、历史、地理、体育）及三行标准样例数据的标准 Excel。
3. `exportErrorReportExcel`:
   - 提取异常列表，将原学生数据与最后一列“系统诊断错误原因”导出为新的 Excel 文件供老师下载。

- [ ] **Step 3: 运行验证解析函数**

执行 node 测试或验证工具函数解析逻辑与列头匹配正确性。

- [ ] **Step 4: 提交代码**

```bash
git add frontend/src/util/excelScoreParser.js frontend/package.json
git commit -m "feat(frontend): implement client-side Excel parser and template generator"
```

---

### Task 3: 改造前端导入界面 (`AdminImport`)

**Files:**
- Modify: `frontend/src/app/admin/import.jsx`
- Modify: `frontend/src/constant/apis.js`
- Modify: `frontend/src/constant/urls.js`

**Interfaces:**
- Consumes: `parseScoreExcel`, `downloadScoreTemplate`, `exportErrorReportExcel` from `frontend/src/util/excelScoreParser.js`
- Produces: 完整的全校 Excel 成绩导入交互界面

- [ ] **Step 1: 声明 API 常量**

在 `frontend/src/constant/apis.js` 和 `urls.js` 中增加 `IMPORT_BATCH_PREVIEW` 和 `IMPORT_BATCH_COMMIT` 地址。

- [ ] **Step 2: 重构 `AdminImport` 交互组件**

1. 移除废弃的手工 JSON 输入框（`<TextArea>`）及 sample json 数据。
2. 顶部工具栏：
   - 当前学期显示与选择；
   - 【下载全科成绩标准模板】与【下载六育维度标准模板】快捷按钮。
3. 上传中心：
   - 使用 Ant Design `<Upload.Dragger>` 组件，支持点击与拖拽上传 `.xlsx` / `.xls`。
   - 上传后自动触发 `parseScoreExcel`，随后调用 `IMPORT_BATCH_PREVIEW` 发送预览请求。
4. 结果与体检面板：
   - 统计卡片：正常待入库学生数（绿色）、异常学生数（红色）、检测到的学科门数。
   - 异常明细表格：展示异常行号、学号、姓名、错误原因。
   - 操作按钮：【立即写入正常学生成绩】（主要操作按钮）、【导出异常数据 (Excel)】（次要操作按钮）。
5. 入库成功状态页：
   - 展示入库批次号 `batchNo`，入库学生总数与总科次数，并提供返回重新导入入口。

- [ ] **Step 3: 验证前端界面与交互流程**

运行 `npm run build` 确保前端构建无任何语法或打包错误。

- [ ] **Step 4: 提交代码**

```bash
git add frontend/src/app/admin/import.jsx frontend/src/constant/apis.js frontend/src/constant/urls.js
git commit -m "feat(frontend): redesign score import view with drag-and-drop Excel and error export"
```

---

### Task 4: 端到端集成回归与 3000 人压测验证

**Files:**
- Create: `backend/__tests__/excel_import_e2e.test.js`

- [ ] **Step 1: 编写全校 3000 人压测集成测试**

生成含 3,000 名学生、每人 8 门科目（共 24,000 条成绩分值）的模拟导入包，测试全流程耗时、数据库事务正确性、异常隔离机制。

- [ ] **Step 2: 执行全量测试**

运行: `npm test` (在 `backend` 目录下)
期望: 
- 所有既有回归测试用例全部 PASS
- 新增的大批量 Excel 导入测试 PASS
- 3,000 人批处理耗时 < 3 秒

- [ ] **Step 3: 提交代码**

```bash
git add backend/__tests__/excel_import_e2e.test.js
git commit -m "test: add e2e integration and 3000-student performance regression tests"
```
