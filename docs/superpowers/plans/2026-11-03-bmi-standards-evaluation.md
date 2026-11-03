# 小学生 BMI 标准计算与体型评价实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现依据国家卫健委标准（WS/T 586-2018 / WS/T 456-2014）与教育部体测标准（2014年修订）对小学生身高体重自动计算 BMI 与体型评价，支持 `.env` 环境变量切换标准，并在报告单与评价表格中采用方案 A 双行纯文本展示。

**Architecture:** 
构建独立的 `bmiEvaluationService` 模块封装两套国标对照表与连续区间分档判定算法；在 `reportCoreV2Policy` 中导出；在 Excel 导入流程 `reportCoreV2Imports` 与 `reportCoreV2ImportReview` 中解析学生性别与出生日期（并支持无出生日期时按标准入学年龄自动推算）；在 `reportCoreEvaluation` 投射层生成兼容的扁平 `values`（`bmi`, `bmi_label`, `bmi_score`, `bmi_standard`）；最后在 `reportRenderV2` 与前端 `StudentAssessmentReport` 组件中呈现双行纯文本样式。

**Tech Stack:** Node.js, Express, Jest / Node.js native test runner, React / JSX, SheetJS (xlsx).

**Spec:** `docs/superpowers/specs/2026-11-03-bmi-standards-evaluation-design.md`

## Global Constraints

- `.env` 环境变量名：`BMI_EVALUATION_STANDARD`，可选值：`WS_T_2018`（默认）与 `MOE_2014`。
- BMI 计算公式：$\text{BMI} = \text{weight}/(\text{height}/100)^2$，结果四舍五入保留两位小数。
- 数据模型兼容：`values.bmi` 保持纯数字或 `null`，同级扩展 `values.bmi_label`、`values.bmi_score`、`values.bmi_standard`，严禁将 `values.bmi` 改造为对象。
- 数据库无实体 DDL 迁移：性别与生日沉淀在 `section_meta` 与数据源快照 JSON 中。
- 报告单排版采用方案 A 双行纯文本：上方数值，下方结论；无数据时显示“—”。

## Review Focus

1. **2位小数国标区间缝隙（Gap）**：BMI 为 `13.04`、`13.45` 等带有 2 位小数的值时，必须通过连续半开区间严密分档，不能出现未命中分类或返回 `null`。
2. **缺省出生日期时的入学年龄推断**：导入若未提供出生日期，必须按一至六年级法定入学年龄精准匹配半岁档（1年级=6.5岁，2年级=7.5岁...6年级=11.5岁），不能中断评定。
3. **超界年龄与年级**：年龄 $<6.0$ 岁或 $>12.0$ 岁、年级不在 1~6 年级时，必须自动就近截断到边界档（6.0 / 12.0 岁），不能抛出异常。
4. **缺失性别或身高体重**：性别缺失或身高/体重无效（$\le 0$、`null`、非数字）时，`bmi` 或 `bmi_label` 必须优雅回退为 `null` 或占位符 `—`，严禁运行时报错。
5. **保持既有 94 项 Catalog 完整性**：报告单第一张表插入 BMI 列时，必须保持现有 94 个 `data-view` 字段映射完全不变，不能破坏既有单据验证断言。

---

### Task 1: 核心计算模块 `bmiEvaluationService.js` 与单元测试

**Files:**
- Create: `backend/services/bmiEvaluationService.js`
- Create: `backend/__tests__/bmi_evaluation.test.js`
- Modify: `backend/services/reportCoreV2Policy.js:54-62`

**Interfaces:**
- Consumes: None (独立纯函数服务)
- Produces:
  - `computeBMI(height: number|null, weight: number|null) -> number|null`
  - `evaluateBMI(options: { height: number, weight: number, gender?: string, birthDate?: string, measurementDate?: string, grade?: number, standard?: string }) -> { bmi: number|null, bmi_label: string|null, bmi_score: number|null, bmi_standard: string }`
  - `inferAgeFromGrade(grade: number) -> number`
  - `calculateAge(birthDate: string, measurementDate: string) -> number`
  - `alignHalfYearAge(age: number) -> number`

- [ ] **Step 1: Write the failing test in `backend/__tests__/bmi_evaluation.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeBMI, evaluateBMI, inferAgeFromGrade, alignHalfYearAge } = require('../services/bmiEvaluationService');

test('computeBMI calculates weight/(height/100)^2 rounded to 2 decimal places', () => {
  assert.equal(computeBMI(125.0, 18.0), 11.52);
  assert.equal(computeBMI(null, 18.0), null);
  assert.equal(computeBMI(120.0, 0), null);
});

test('inferAgeFromGrade infers 6.5 for grade 1 to 11.5 for grade 6', () => {
  assert.equal(inferAgeFromGrade(1), 6.5);
  assert.equal(inferAgeFromGrade(6), 11.5);
  assert.equal(inferAgeFromGrade(7), 12.0);
});

test('alignHalfYearAge clamps between 6.0 and 12.0 and rounds to nearest 0.5', () => {
  assert.equal(alignHalfYearAge(5.5), 6.0);
  assert.equal(alignHalfYearAge(6.2), 6.0);
  assert.equal(alignHalfYearAge(6.3), 6.5);
  assert.equal(alignHalfYearAge(12.8), 12.0);
});

test('evaluateBMI with WS_T_2018 accurately classifies boys and girls across boundary gaps', () => {
  // 6.0 岁男生: <=13.0 中重度消瘦, 13.1~13.4 轻度消瘦, 13.5~16.3 正常, 16.4~17.6 超重, >=17.7 肥胖
  const res1 = evaluateBMI({ height: 125, weight: 18, gender: '男', grade: 1, standard: 'WS_T_2018', age: 6.0 });
  assert.equal(res1.bmi, 11.52);
  assert.equal(res1.bmi_label, '中重度消瘦');
  assert.equal(res1.bmi_standard, 'WS_T_2018');

  // Gap test: 13.04 (in gap between 13.0 and 13.1) -> 中重度消瘦
  const resGap = evaluateBMI({ height: 100, weight: 13.04, gender: '男', grade: 1, standard: 'WS_T_2018', age: 6.0 });
  assert.equal(resGap.bmi_label, '中重度消瘦');

  // Normal: 15.0
  const resNorm = evaluateBMI({ height: 100, weight: 15.0, gender: '男', grade: 1, standard: 'WS_T_2018', age: 6.0 });
  assert.equal(resNorm.bmi_label, '正常');
});

test('evaluateBMI with MOE_2014 classifies by grade with score mapping', () => {
  // 一年级男生: <=13.4 低体重(80), 13.5~18.1 正常(100), 18.2~20.3 超重(80), >=20.4 肥胖(60)
  const res = evaluateBMI({ height: 100, weight: 15.0, gender: '男', grade: 1, standard: 'MOE_2014' });
  assert.equal(res.bmi, 15.0);
  assert.equal(res.bmi_label, '正常');
  assert.equal(res.bmi_score, 100);
  assert.equal(res.bmi_standard, 'MOE_2014');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/__tests__/bmi_evaluation.test.js`
Expected: FAIL with "Cannot find module '../services/bmiEvaluationService'"

- [ ] **Step 3: Implement `backend/services/bmiEvaluationService.js` and re-export in `reportCoreV2Policy.js`**

Implement tables according to spec:
- Standard tables for `WS_T_2018` (boys & girls, 6.0~12.0) and `MOE_2014` (boys & girls, grades 1~6).
- Function `computeBMI(height, weight)`.
- Function `inferAgeFromGrade(grade)`: `Math.min(12.0, Math.max(6.0, 5.5 + Number(grade || 1)))`.
- Function `calculateAge(birthDate, measurementDate)`: calculate time diff in years.
- Function `alignHalfYearAge(age)`: round to nearest 0.5 and clamp to [6.0, 12.0].
- Function `evaluateBMI({ height, weight, gender, age, birthDate, measurementDate, grade, standard })`.
- In `backend/services/reportCoreV2Policy.js`: export `computeBMI` and `evaluateBMI`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/__tests__/bmi_evaluation.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/bmiEvaluationService.js backend/__tests__/bmi_evaluation.test.js backend/services/reportCoreV2Policy.js
git commit -m "feat(health): implement BMI calculation and standards evaluation service"
```

---

### Task 2: Excel 导入解析扩展与学籍元数据整合

**Files:**
- Modify: `backend/services/reportCoreV2Imports.js:27-35, 70-110`
- Modify: `backend/services/reportCoreV2ImportReview.js:20-58`
- Test: `backend/__tests__/report_core_v2_import_review.test.js`

**Interfaces:**
- Consumes: `evaluateBMI` from `backend/services/bmiEvaluationService`
- Produces:
  - Excel 解析支持列别名 `性别` (`gender`) 与 `出生日期` (`birthDate`)
  - `reviewV2Workbook` 返回包含完整 `record.values.bmi`, `record.values.bmi_label`, `record.values.bmi_score`, `record.values.bmi_standard`

- [ ] **Step 1: Write the failing test in `backend/__tests__/report_core_v2_import_review.test.js`**

Add test checking that a workbook containing `性别` and `出生日期` columns populates `bmi` and `bmi_label` under current `.env` standard.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/__tests__/report_core_v2_import_review.test.js`
Expected: FAIL (missing `bmi_label` in values or undefined column)

- [ ] **Step 3: Modify `reportCoreV2Imports.js` and `reportCoreV2ImportReview.js`**

1. In `reportCoreV2Imports.js`:
   - Add aliases to `metadata`: `'性别': 'gender'`, `'gender': 'gender'`, `'出生日期': 'birthDate'`, `'生日': 'birthDate'`, `'birthDate': 'birthDate'`.
   - Store normalized `gender` (`'男'`/`'女'`) and `birthDate` in parsed row metadata.
2. In `reportCoreV2ImportReview.js`:
   - Call `evaluateBMI({ height: h, weight: w, gender: record.student.gender || input.gender, birthDate: record.student.birthDate || input.birthDate, measurementDate: record.measurement.date, grade: record.student.grade, standard: process.env.BMI_EVALUATION_STANDARD || 'WS_T_2018' })`.
   - Assign `record.values.bmi = res.bmi; record.values.bmi_label = res.bmi_label; record.values.bmi_score = res.bmi_score; record.values.bmi_standard = res.bmi_standard;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/__tests__/report_core_v2_import_review.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/reportCoreV2Imports.js backend/services/reportCoreV2ImportReview.js backend/__tests__/report_core_v2_import_review.test.js
git commit -m "feat(import): support gender and birthDate in V2 workbook import review"
```

---

### Task 3: 评价视图投射与保存层接入

**Files:**
- Modify: `backend/services/reportCoreEvaluation.js:280-290`
- Modify: `backend/.env.example`
- Test: `backend/__tests__/report_core_v2_report.test.js`

**Interfaces:**
- Consumes: `evaluateBMI` from `backend/services/bmiEvaluationService`
- Produces: `getEvaluationView` and `submitForm` output structured `bmi` and `bmi_label`

- [ ] **Step 1: Write test assertion in `backend/__tests__/report_core_v2_report.test.js`**

Verify that `m.values.bmi` is numeric `17.11` and `m.values.bmi_label` is populated.

- [ ] **Step 2: Run test to verify current output**

Run: `node --test backend/__tests__/report_core_v2_report.test.js`

- [ ] **Step 3: Update `reportCoreEvaluation.js` and `.env.example`**

1. In `reportCoreEvaluation.js` line 285:
   Compute BMI evaluation result and merge `bmi`, `bmi_label`, `bmi_score`, `bmi_standard` into `values`.
2. In `backend/.env.example`:
   Document `BMI_EVALUATION_STANDARD=WS_T_2018 # 可选: WS_T_2018 (国家卫健委标准), MOE_2014 (教育部体测标准)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/__tests__/report_core_v2_report.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/reportCoreEvaluation.js backend/.env.example backend/__tests__/report_core_v2_report.test.js
git commit -m "feat(evaluation): integrate BMI evaluation into core projection view"
```

---

### Task 4: 报告渲染端双行纯文本（方案 A）展示

**Files:**
- Modify: `backend/services/reportRenderV2.js:20-25`
- Modify: `frontend/src/component/StudentAssessmentReport/index.jsx:20-30`
- Test: `backend/__tests__/report_core_v2_report.test.js`

**Interfaces:**
- Consumes: `values.bmi`, `values.bmi_label`
- Produces:
  - HTML 打印与报告表格中 6 列布局：`身高 / cm | 体重 / kg | BMI | 视力左 | 视力右 | 跳绳 / 次`
  - BMI 单元格包含上行数值与下行小字结论，无数据时居中显示“—”
  - 严格保持 94 个 `data-view` 字段映射与 Catalog 校验一致

- [ ] **Step 1: Write the failing test assertion for dual-line BMI cell rendering**

In `backend/__tests__/report_core_v2_report.test.js`:
Add assertion that rendered HTML contains `<td class="bmi-cell">` with `17.11` and `bmi-label`, while `(html.match(/data-view=/g)||[]).length === 94`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/__tests__/report_core_v2_report.test.js`
Expected: FAIL (missing `.bmi-cell` in table)

- [ ] **Step 3: Update `reportRenderV2.js` and `frontend/src/component/StudentAssessmentReport/index.jsx`**

1. In `backend/services/reportRenderV2.js`:
   - Adjust `health` section table header: `['身高 / cm','体重 / kg','BMI','视力左','视力右','跳绳 / 次']`.
   - In row render, insert `bmiCell`:
     ```javascript
     const bmiCell = values.bmi != null
       ? `<td class="bmi-cell"><div style="font-weight:600;font-size:13px;line-height:1.2;">${escape(values.bmi)}</div><div style="font-size:11px;color:#7d5c3e;margin-top:2px;">${escape(values.bmi_label||'')}</div></td>`
       : `<td class="blank">—</td>`;
     ```
   - Retain all `cell(...)` calls so all 94 catalog fields are tracked in `used`.
2. In `frontend/src/component/StudentAssessmentReport/index.jsx`:
   - Render dual-line in the BMI cell:
     ```jsx
     <td className="assessment-prefill bmi-cell" data-report-field="bmi">
       {record.values?.bmi != null ? (
         <>
           <div className="bmi-value">{record.values.bmi}</div>
           {record.values.bmi_label && <div className="bmi-label" style={{ fontSize: '11px', color: '#7d5c3e' }}>{record.values.bmi_label}</div>}
         </>
       ) : '—'}
     </td>
     ```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/__tests__/report_core_v2_report.test.js`
Expected: PASS (94 `data-view` elements intact, BMI table rendered cleanly)

- [ ] **Step 5: Commit**

```bash
git add backend/services/reportRenderV2.js frontend/src/component/StudentAssessmentReport/index.jsx backend/__tests__/report_core_v2_report.test.js
git commit -m "feat(render): render dual-line pure text Scheme A for BMI in reports"
```

---

### Task 5: 全套测试验证与环境变量切换端到端测试

**Files:**
- Create: `backend/__tests__/bmi_env_switch.test.js`
- Test: All backend tests (`npm test` in `backend`)

**Interfaces:**
- Consumes: Entire BMI pipeline and `.env` configuration
- Produces: Automated verification of dynamic algorithm switching and edge case resilience

- [ ] **Step 1: Write integration test `backend/__tests__/bmi_env_switch.test.js`**

Test switching `process.env.BMI_EVALUATION_STANDARD` between `WS_T_2018` and `MOE_2014`:
- Verifies that with `WS_T_2018`, a 6-year-old boy with BMI 11.52 produces `"中重度消瘦"`.
- Verifies that with `MOE_2014`, a Grade 1 boy with BMI 11.52 produces `"低体重"` and score `80`.
- Verifies missing birthDate correctly infers age from grade.
- Verifies missing gender gracefully falls back to numeric BMI with `—` label.

- [ ] **Step 2: Run all backend tests**

Run: `npm test` in `backend`
Expected: All tests PASS with 0 failures

- [ ] **Step 3: Commit**

```bash
git add backend/__tests__/bmi_env_switch.test.js
git commit -m "test(health): add end-to-end environment switching and boundary tests for BMI"
```

