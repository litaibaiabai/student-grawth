# 六育学生综合素质报告单：数据结构与教师寄语设计（建议稿）

基于附件《学生综合素质报告单.doc》《报告单录入（模板）.xls》和现有六育系统修改方向编制。

> 状态：需求设计建议稿。两份原始文件仅证明已有展示/录入字段及示例格式；新报告分区、数据库设计、六维映射、生成规则是设计建议，不是学校已确认的评价规则。尤其星级与等级换算、六育权重、权限、体检导入及打印格式需要学校确认。

## 1. 两份附件分析

- Word：包含教师寄语、班级、姓名、学年、学期、日期及各项评价字段，是基于邮件合并占位符的打印版报告单；没有提供结构化的数据校验、评分口径或字段定义。
- Excel：一个名为“正面”的工作表，第一行包含82个字段，第二行为“样例”记录，后续44个序号行为空白。格式混有`★★★`、`A`、数值（141cm、35kg、左右视力与跳绳次数）和定性文字描述。
- 82个字段中，前8个是基本资料、日期和教师寄语，后74个为各类评价、测量与叙述类内容。
- 两份文件不能证明“★★★”是三星满分还是五级制中的三星，也不能证明`A`与星级、六育积分的换算关系。

## 2. 推荐的最终报告版块

| 报告版块 | 核心内容 | 主数据来源 | 是否建议班主任再录入 |
|---|---|---|---|
| 学生与学期信息 | 姓名、班级、学年、学期、报告日期 | 学籍/学期配置 | 否 |
| 六育成长总览 | 德、智、体、美、劳、故事六项等级；可附雷达图 | 六维汇总结果 | 否，必要时修正源记录 |
| 六育成长证据 | 德/智积分，获奖荣誉，体育/美育/劳育活动，成长故事 | 积分流水、荣誉审核、故事 | 否 |
| 行为习惯 | 有礼貌、讲文明、讲信用、负责任、有爱心、守规则、善交流、会合作 | 学期过程评价 | 无已有证据时需评价 |
| 学科成长表现 | 语文、数学、科学、英语、道法、音乐、美术、信息、劳动、实践、地方 | 各任课教师评价/成绩导入 | 否，学科老师录入 |
| 身体健康 | 身高、体重、视力、1分钟跳绳、体育学业/过程、体测 | 学校体测数据/体育老师 | 否，待表格样例 |
| 故事成长 | 阅读、聆听、讲述故事，成长故事精选与评阅 | 月度故事模块 | 否 |
| 教师寄语/学期总述 | 长处+有事实支撑的例子+下一步期待 | 生成建议/教师审核 | **班主任确认** |
| 家长寄语（新增） | 家长对学期成长的回应 | 家长填写 | 否 |
| 署名与发布 | 班主任姓名、发布日期、版本号 | 报告发布流水 | 否 |

**展示建议**：六育结果在报告首页；学科等细项展示在详情/背面；教师寄语单独留出醒目区域。是否A4对折或双面打印，以学校最终样例为准。

## 3. 数据设计原则

1. 学生、班级、学期、教师等基本实体复用现有表。
2. 积分流水、荣誉审核、成长故事、学科成绩、体测/健康信息是来源记录，不要再为报告重复记账。
3. 用“指标字典 + 指标结果”承接74个原有评价字段，而不是建74个固定列，方便学校日后增减科目或指标。
4. 保留`raw_value`，区分`grade` / `star` / `number` / `text`；指标级显示规则和等级换算需要配置。
5. 六育总评单独计算，不能把某个学科的`A`直接等同于某项六育的`A`。
6. 报告发布后保存快照及评分规则版本；更改源数据后需要明确的重算/重新发布流程，不能让历史报告悄悄改变。
7. 教师寄语生成仅可引用已核实信息，健康、视力、体重不默认送入生成模型。

## 4. 核心数据结构（MySQL 8.0 示例）

以下是新增的**报告专用结构**。学生、学期、积分、荣誉、故事、学科成绩等业务表假定已存在，应通过实际项目表名关联；`student_id`/`term_id`等暂不添加外键，避免假设既有主表的字段类型。

```sql
CREATE TABLE report_indicator (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  section_code VARCHAR(32) NOT NULL COMMENT 'behavior/subject/health/story',
  subject_code VARCHAR(32) NULL COMMENT 'chinese/math/english等',
  dimension_code VARCHAR(32) NULL COMMENT '德智体美劳故事之一；可空',
  value_type VARCHAR(24) NOT NULL COMMENT 'star/grade/number/text',
  unit VARCHAR(20) NULL,
  source_type VARCHAR(32) NOT NULL COMMENT 'teacher_import/score/physical/...',
  display_order INT NOT NULL DEFAULT 0,
  required_flag TINYINT(1) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  config_version VARCHAR(32) NOT NULL DEFAULT 'v1'
);

CREATE TABLE student_report_indicator_value (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  term_id BIGINT NOT NULL,
  indicator_id BIGINT NOT NULL,
  raw_value VARCHAR(300) NULL COMMENT '保留导入原值，如★★★、A、141cm',
  grade_code VARCHAR(20) NULL,
  star_count INT NULL,
  number_value DECIMAL(12,3) NULL,
  text_value TEXT NULL,
  unit VARCHAR(20) NULL,
  data_status VARCHAR(24) NOT NULL DEFAULT 'recorded'
    COMMENT 'recorded/missing/exempt/not_applicable',
  source_type VARCHAR(40) NULL,
  source_id VARCHAR(80) NULL,
  recorded_by BIGINT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_term_indicator (student_id,term_id,indicator_id),
  KEY idx_student_term (student_id,term_id)
);

CREATE TABLE student_term_report (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  term_id BIGINT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  report_status VARCHAR(24) NOT NULL DEFAULT 'draft'
    COMMENT 'draft/review/ready/published',
  template_version VARCHAR(32) NOT NULL,
  score_policy_version VARCHAR(32) NULL,
  data_snapshot JSON NULL COMMENT '发布时冻结的完整打印数据',
  completeness JSON NULL COMMENT '六维及必填字段完成情况；管理员仅看汇总',
  reviewed_by BIGINT NULL,
  reviewed_at DATETIME NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_term_version (student_id,term_id,version)
);

CREATE TABLE report_dimension_result (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  dimension_code VARCHAR(20) NOT NULL,
  raw_score DECIMAL(12,2) NULL,
  display_grade VARCHAR(20) NULL,
  breakdown JSON NULL COMMENT '过程/荣誉/学科/故事按规则计分的明细',
  evidence_refs JSON NULL COMMENT '关联经过审核的积分/荣誉/故事等源记录',
  evaluation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  UNIQUE KEY uq_report_dimension (report_id,dimension_code)
);

CREATE TABLE report_teacher_comment_revision (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  revision_no INT NOT NULL,
  generated_by VARCHAR(20) NOT NULL COMMENT 'rule/llm/teacher',
  content TEXT NOT NULL,
  evidence_json JSON NULL COMMENT '生成依据的记录ID、事实、统计期间',
  prompt_or_rule_version VARCHAR(32) NULL,
  edited_by BIGINT NULL,
  review_status VARCHAR(20) NOT NULL DEFAULT 'draft'
    COMMENT 'draft/approved/rejected',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME NULL,
  UNIQUE KEY uq_comment_revision (report_id,revision_no)
);
```

**补充约束**：上述`source_id`如源表使用不同主键形式，可统一为字符串；实际应用中的修改、审批、发布需要后端事务和角色级授权，不能仅靠表中状态字段。

## 5. 报告API结构（JSON 示例；演示结构，不代表真实学生成绩）

```json
{
  "reportId": "2026-fall-student-001",
  "status": "review",
  "student": {
    "id": "student-001",
    "name": "示例学生",
    "className": "一年级1班"
  },
  "term": {"academicYear": "2026-2027", "semester": "上学期"},
  "dimensions": [
    {"code": "DE", "name": "德", "grade": null, "rawScore": null, "status": "pending", "evidenceRefs": []},
    {"code": "ZHI", "name": "智", "grade": null, "rawScore": null, "status": "pending", "evidenceRefs": []},
    {"code": "TI", "name": "体", "grade": null, "rawScore": null, "status": "pending", "evidenceRefs": []},
    {"code": "MEI", "name": "美", "grade": null, "rawScore": null, "status": "pending", "evidenceRefs": []},
    {"code": "LAO", "name": "劳", "grade": null, "rawScore": null, "status": "pending", "evidenceRefs": []},
    {"code": "STORY", "name": "故事", "grade": null, "rawScore": null, "status": "pending", "evidenceRefs": []}
  ],
  "behavior": [
    {"code": "polite", "label": "有礼貌", "rawValue": "★★★", "valueType": "star", "starCount": 3}
  ],
  "subjects": [
    {
      "code": "CHINESE",
      "name": "语文",
      "indicators": [
        {"code": "chinese_interest", "label": "语文兴趣", "rawValue": "★★★", "valueType": "star"},
        {"code": "chinese_reading", "label": "阅读与理解", "rawValue": "A", "valueType": "grade"}
      ]
    }
  ],
  "physical": {
    "heightCm": null,
    "weightKg": null,
    "visionLeft": null,
    "visionRight": null,
    "jumpRope1Min": null,
    "status": "not_imported"
  },
  "honors": [],
  "stories": [],
  "teacherComment": {
    "suggestedText": null,
    "finalText": null,
    "reviewStatus": "draft",
    "approvedBy": null
  },
  "parentComment": {"content": null},
  "publishedAt": null
}
```

空值表示未获取，**不等于0分或表现不合格**；等级和六维原始分在学校评分口径确定前保持空值。

## 6. 教师寄语设计

### 6.1 定位

将原表的“教师寄语”升级为报告内的**学期总述**，作为唯一的班主任综合评语字段，避免“教师寄语”和“学期总述”各写一段造成重复。

### 6.2 生成依据及优先级

| 优先级 | 数据 | 使用方式 |
|---|---|---|
| P0 | 教师确认的学科/行为评价 | 找出有事实支撑的突出优势及需培养习惯 |
| P0 | 德智积分与本学期过程记录 | 支持对日常努力和规则意识的叙述 |
| P0 | 已审核荣誉、活动 | 用一项具体经历举例，不夸大获奖 |
| P1 | 月度成长故事、读听讲故事 | 描述表达与阅读兴趣，尽量援引真实细节 |
| P1 | 上学期同口径记录 | 仅在口径可比时陈述“比上学期有进步” |
| 不默认使用 | 身高、体重、视力等个人健康数据 | 不自动写入寄语；须有学校必要性和相应授权 |

### 6.3 内容结构

1. **积极肯定（1句话）**：最稳定的1–2项优点。
2. **举出具体行为（1–2句话）**：最好涉及课堂表现、合作交流、实践或成长故事，避免空话。
3. **提出温和、可行动的建议（1句话）**：例如大胆表达想法、独立整理学习计划。
4. **面向下一学期的鼓励（1句话）**。

推荐100–180个汉字，长度仅为**版式设计建议**，需打印试验确认。使用“你”的第二人称语气；不与其他学生比较；不暴露敏感信息。

### 6.4 示例（参考附件样例字段和描述）

> 你在日常学习中表现认真，能够遵守规则，也愿意与同学交流合作。你热爱阅读，乐于倾听和分享故事，在实践活动中也展现出积极的一面。希望你今后能够更加自信地表达自己的想法，遇到难题勇敢尝试。期待你在新的学期继续保持好奇心，收获更多成长与快乐！

**说明**：上述表述为对模板样例的示意改写，不可视为对实际学生的评语。原样例同时有全三星/A的表现、阅读与劳动实践文本，并在既有寄语中提到“缺少自信”。

### 6.5 建议生成流程

```
学生学期报告数据
  ↓
收集本学期已确认的行为、学科、故事、荣誉等证据
  ↓
生成结构化摘要（不含未经证实的趋势、诊断、排名）
  ↓
规则模板生成初稿，或经授权交由模型生成初稿
  ↓
班主任查看所用证据、修改文案、确认最终版本
  ↓
保存版本/修改人/确认时间
  ↓
管理员只检查准备状态并发布，不查看个人评语内容
```

为减少成本与风险，第一版可先采用规则模板，再评估引入大模型；两者共用相同的数据输入与教师审批流程。

### 6.6 可直接用于大模型的生成要求

```text
你是小学班主任的教师寄语起草助手。

只根据提供的“已确认评价证据”生成一段100—180个汉字左右的学期寄语。
结构：肯定优势 → 提及1—2项真实的学习/活动经历 → 提出一条温和、具体的成长建议 → 给予鼓励。
语气：自然、亲切，使用第二人称“你”。

严格禁止：
1. 编造获奖、名次、活动、性格特征、进步趋势；
2. 用没有比较依据的“比以前进步”“全班最好”等判断；
3. 做身体、心理、家庭情况的推断；
4. 因某一维分数较低而给学生贴负面标签；
5. 模板化套话过多，或与其他同学进行比较。

如证据不足，只写有证据支持的内容，并提示老师补充典型事例。
输出JSON：
{
  "suggestedText": "寄语初稿",
  "evidenceIds": ["source-id-1", "source-id-2"],
  "needsTeacherReview": true,
  "insufficientEvidence": []
}
```

## 7. 旧Excel字段完整索引

以下索引直接对应原始Excel第一行的实际82个字段，列号是从1开始的Excel顺序。字段名称为原文保留，`建议值类型`是根据样例推断的初稿，**不是文件中已有的数据字典**。

| 列序号 | 原Excel表头 | 分类 | 建议值类型 |
|---:|---|---|---|
| 1 | 序号 | 基本资料与寄语 | `sequence` |
| 2 | 班级 | 基本资料与寄语 | `text` |
| 3 | 姓名 | 基本资料与寄语 | `text` |
| 4 | 学年 | 基本资料与寄语 | `text` |
| 5 | 学期 | 基本资料与寄语 | `term` |
| 6 | 教师寄语 | 基本资料与寄语 | `narrative` |
| 7 | 月 | 基本资料与寄语 | `month` |
| 8 | 日 | 基本资料与寄语 | `day` |
| 9 | 有礼貌 | 日常行为习惯 | `stars_or_grade` |
| 10 | 讲文明 | 日常行为习惯 | `stars_or_grade` |
| 11 | 讲信用 | 日常行为习惯 | `stars_or_grade` |
| 12 | 负责任 | 日常行为习惯 | `stars_or_grade` |
| 13 | 有爱心 | 日常行为习惯 | `stars_or_grade` |
| 14 | 守规则 | 日常行为习惯 | `stars_or_grade` |
| 15 | 善交流 | 日常行为习惯 | `stars_or_grade` |
| 16 | 会合作 | 日常行为习惯 | `stars_or_grade` |
| 17 | 道法兴趣 | 道德与法治 | `stars_or_grade` |
| 18 | 道法习惯 | 道德与法治 | `stars_or_grade` |
| 19 | 道法方法 | 道德与法治 | `stars_or_grade` |
| 20 | 道德认识水平 | 道德与法治 | `grade` |
| 21 | 道德实践能力 | 道德与法治 | `grade` |
| 22 | 道德过程表现 | 道德与法治 | `stars_or_grade` |
| 23 | 语文兴趣 | 语文 | `stars_or_grade` |
| 24 | 语文习惯 | 语文 | `stars_or_grade` |
| 25 | 语文方法 | 语文 | `stars_or_grade` |
| 26 | 积累与运用 | 语文 | `grade` |
| 27 | 阅读与理解 | 语文 | `grade` |
| 28 | 表达与交流 | 语文 | `grade` |
| 29 | 梳理与探究 | 语文 | `grade` |
| 30 | 书写 | 语文 | `grade` |
| 31 | 语文过程表现 | 语文 | `stars_or_grade` |
| 32 | 数学兴趣 | 数学 | `stars_or_grade` |
| 33 | 数学习惯 | 数学 | `stars_or_grade` |
| 34 | 数学方法 | 数学 | `stars_or_grade` |
| 35 | 基础知识 | 数学 | `grade` |
| 36 | 数学思维 | 数学 | `grade` |
| 37 | 信息提取 | 数学 | `grade` |
| 38 | 解决问题 | 数学 | `grade` |
| 39 | 数学过程表现 | 数学 | `stars_or_grade` |
| 40 | 科学兴趣 | 科学 | `stars_or_grade` |
| 41 | 科学习惯 | 科学 | `stars_or_grade` |
| 42 | 科学方法 | 科学 | `stars_or_grade` |
| 43 | 科学观念 | 科学 | `grade` |
| 44 | 科学思维 | 科学 | `grade` |
| 45 | 探究实践 | 科学 | `grade` |
| 46 | 科学过程表现 | 科学 | `stars_or_grade` |
| 47 | 英语兴趣 | 英语 | `stars_or_grade` |
| 48 | 英语习惯 | 英语 | `stars_or_grade` |
| 49 | 英语方法 | 英语 | `stars_or_grade` |
| 50 | 听力素养 | 英语 | `grade` |
| 51 | 口语素养 | 英语 | `grade` |
| 52 | 书面表达 | 英语 | `grade` |
| 53 | 阅读能力 | 英语 | `grade` |
| 54 | 英语过程表现 | 英语 | `stars_or_grade` |
| 55 | 身高 | 身体健康与体育 | `number_with_unit` |
| 56 | 体重 | 身体健康与体育 | `number_with_unit` |
| 57 | 视力左 | 身体健康与体育 | `number_with_unit` |
| 58 | 视力右 | 身体健康与体育 | `number_with_unit` |
| 59 | 1分钟跳绳 | 身体健康与体育 | `number_with_unit` |
| 60 | 体育学业水平 | 身体健康与体育 | `grade` |
| 61 | 体育过程表现 | 身体健康与体育 | `stars_or_grade` |
| 62 | 体测水平 | 身体健康与体育 | `stars_or_grade` |
| 63 | 体测过程表现 | 身体健康与体育 | `stars_or_grade` |
| 64 | 音乐素养教师评价 | 音乐 | `stars_or_grade` |
| 65 | 音乐学业水平 | 音乐 | `grade` |
| 66 | 音乐过程表现 | 音乐 | `stars_or_grade` |
| 67 | 音乐技能教师评价 | 音乐 | `stars_or_grade` |
| 68 | 美术素养教师评价 | 美术 | `stars_or_grade` |
| 69 | 美术学业水平 | 美术 | `grade` |
| 70 | 美术过程表现 | 美术 | `stars_or_grade` |
| 71 | 美术技能教师评价 | 美术 | `stars_or_grade` |
| 72 | 信息学业水平 | 信息技术 | `stars_or_grade` |
| 73 | 信息成果、实践、表现 | 信息技术 | `text` |
| 74 | 劳动学业水平 | 劳动 | `stars_or_grade` |
| 75 | 劳动成果、实践、表现 | 劳动 | `text` |
| 76 | 综合实践学业水平 | 综合实践 | `stars_or_grade` |
| 77 | 综合实践成果、实践、表现 | 综合实践 | `text` |
| 78 | 地方学业水平 | 地方课程 | `stars_or_grade` |
| 79 | 地方成果、实践、表现 | 地方课程 | `text` |
| 80 | 我爱读故事 | 故事 | `text` |
| 81 | 我爱听故事 | 故事 | `text` |
| 82 | 我爱讲故事 | 故事 | `text` |

## 8. 原字段如何合入六育（待审批的数据映射）

| 六育维度 | 建议主要数据 | 原Excel可对应内容 | 说明 |
|---|---|---|---|
| 德育 | 德育卡积分、行为习惯评价、相关荣誉 | 8项行为习惯、道法 | 不能简单相加成统一分值 |
| 智育 | 智育卡积分、学科成绩与过程评价 | 语数科英及信息等 | 仅作为证据源；最终计算由评分规则决定 |
| 体育 | 体育/体测评价、体育荣誉 | 身体健康与体育9项 | 健康测量值可展示，但不能自动当作奖惩性分数 |
| 美育 | 音乐美术评价、艺术荣誉 | 音乐4项、美术4项 | 按实际考核方案计分 |
| 劳育 | 劳动实践记录、劳动荣誉 | 劳动2项，部分综合实践 | 结合教师审核实践证据 |
| 故事 | 学生成长故事、故事评阅分 | 读/听/讲故事3项 | 读听讲指标与月度原创故事不是同一数据，需要并存 |

## 9. 建议的角色权限与发布流程

- **任课教师**：管理自己任教的班级及学科评价，只读取履职必需数据。
- **班主任**：阅读班级学生的汇总证据；生成、编辑和确认教师寄语；查看个人报告草稿。
- **管理员**：维护学期配置、指标规则、模板；仅查询“缺哪一维、多少份待完成、多少份可发布”等状态，不读取完整学生报告与教师寄语；发布已满足门槛的报告。
- **学生与家长**：报告发布后查看自己的内容，不能看到其他学生的信息。
- **系统**：负责数据汇总、缺失检查、版本冻结、权限控制、审计记录和打印。

发布门槛必须结合学校政策配置，不应把无该学科/免测的情形直接认定为“数据缺失”。

## 10. 需要学校最终确认

1. 星级`★★★`的最高星数、各星代表含义；`A/B/C`的正式名称和边界。
2. 六育维度的等级评定规则及积分/学科/荣誉/故事的权重。
3. 是否需要旧报告中全部74个评价字段；不同年级科目不同，必填字段应按年级配置。
4. 身体健康、体测Excel样例能否导入、展示范围、隐私权限。
5. “教师寄语”是否等同“学期总述”，建议合并为一个字段。
6. 打印版面：纸张大小、单双面、是否保留原学校版式与签章。
7. 试点时是否先采用规则生成，后续再接大模型。
8. 教师评论的字数、语言风格、是否允许附可核实的具体事例。
9. 管理员仅看状态、不看原始报告的规则是否最终确认。

**建议首版验收标准**：一名学生的积分、学科成绩、荣誉、故事能自动汇总成报告；缺失项不会误判为零分；班主任可修改确认寄语；管理员不见个人详细内容却能发布；发布后再修改数据不会静默改动已经打印过的报告。
