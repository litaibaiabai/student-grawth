# StudentAssessmentReport

只读、可复用的学生测评报表，不依赖路由、上传接口或保存逻辑。

```jsx
import StudentAssessmentReport from '../../component/StudentAssessmentReport';

// 完整模板：德美 / 智美，健美 / 艺美 / 劳美，故事美独占一行，以及成长自述与寄语。
<StudentAssessmentReport catalog={catalog} record={record} term={term} />

// 教师上传模块：仅显示五个板块，隐藏故事美、自述与寄语。
<StudentAssessmentReport
  catalog={catalog}
  record={record}
  term={term}
  sections={['conduct', 'wisdom', 'health', 'art', 'labor']}
  showNarratives={false}
  sequence={1}
/>
```

- `catalog.fields`：字段配置，含 `column`、`viewCode`、`label`、`section`、`valueType`、`sourceType` 和可选 `jsonPath`。
- `record.student`：`name`、`studentNumber`、`grade`、`classNo`、可选 `id`。
- `record.values`：完整测评字段值；`record.uploadedFields` 是本次教师填写的字段名列表，已有预填、学生自评和系统值显示为灰色。
- `record.errors`：`{field, reason}` 数组，对应单元格显示红色及原因。
- `record.measurement`：测量 `date` 和 `visionStandard`；`record.values.bmi` 由调用方计算。
- `record.narratives`：以字段名为键的自述与寄语，可选。
- `sections` 默认展示六个板块；`showNarratives` 默认为 `true`；`sequence` 可选。

按用户要求，报表不显示运动特长与荣誉、艺术特长与荣誉、独立的德美过程表现表格，以及健美中的过程表现列；对应字段不会重新进入补充列表。其他可见字段呈现一次。没有成绩不等于零，真实数字 `0` 会保留。

验证完整模板与教师裁剪视图：`node frontend/tests/assessment-report-render.cjs`（仓库根目录，Node 22）。
