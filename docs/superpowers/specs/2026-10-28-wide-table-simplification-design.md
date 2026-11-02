# 六板块宽表与最少数据表设计

> 最新方案已收敛为[学校期末报告核心工作流精简方案](2026-10-28-term-report-core-workflow-design.md)：六种来源、劳美不发卡、每月三类各1–3篇文本、6张核心业务表。本文保留宽表取代竖表的历史说明；11表目标和旧来源分工不再作为实施基线。

日期：2026-10-28。状态：结构提案，未修改数据库。按用户最新要求，以一张学生学期宽表取代此前的指标字典、逐项结果及多来源明细表方案。

## 1. 当前 student_indicator_value 是什么结构

目前它是“一名学生的一项指标一行”的竖表。实库字段如下：

| 字段组 | 实际字段 | 作用 |
| --- | --- | --- |
| 身份 | `id`、`school_id`、`term_id`、`student_id` | 谁、哪校、哪学期 |
| 指标 | `indicator_id`、`indicator_code` | 这一行评哪一项 |
| 值 | `value_type`、`raw_value TEXT`、`typed_value VARCHAR(255)`、`numeric_value DECIMAL(10,2)` | 泛化保存星级、字母、数值或文字 |
| 状态与留痕 | `status`、`evaluated_by`、`evaluated_at`、`revision` | 评定状态、评定人、时间和修订号 |

当前唯一键为 `(student_id, term_id, indicator_code)`。现有表没有独立自评/他评字段，因此此前才提出增加视角、字典、来源和版本等结构。这种通用指标模型适合经常变化的评价体系，但对学校当前固定报告，开发、联表查询和维护成本偏高。

## 2. 改为一张学生学期宽表

建议表名：`student_term_evaluation`。它**替代** `student_indicator_value` 等期末明细表，最终不让两套模型并行维护。

**粒度：一个学校、一个学生、一个学期一行。** 同一张表保存所有学生；下一学期新增一行，不覆盖上学期。

唯一键：`UNIQUE(school_id, term_id, student_id)`。

| 公共字段 | 含义 |
| --- | --- |
| `id / school_id / term_id / student_id` | 主键、学校、学期、学生 |
| `student_name_snapshot / grade_snapshot / class_no_snapshot` | 当前学期报告使用的姓名和班级快照 |
| 六板块固定字段 | 直接保存每一项自评、他评、学科等级、健康值和实践文字 |
| `sports_specialties / art_specialties` | 两个 JSON 数组，保存可有多条的特长项目 |
| 五方面自述、学期收获、下学期目标、教师和家长寄语 | 同行保存，不另建自述、家长反馈、草稿表 |
| `field_sources JSON` | 按字段保存来源类型、来源记录/版本、录入人及时间 |
| `section_meta JSON` | 各板块/学科提交与确认状态 |
| `status / revision / confirmed_revision / confirmed_by / confirmed_at` | 草稿和班主任确认；数据变化后原确认失效 |
| `template_version / rule_version / updated_by / created_at / updated_at` | 模板规则版本和维护信息 |

### 六板块直接对应字段

| 板块 | 直接设列的字段 | 来源 |
| --- | --- | --- |
| 德美 | 8 项行为各有 `_self_star / _other_star`，共 16 列 | 学生自评、班主任等授权教师他评；积分按批准规则辅助生成 |
| 智美 | 五科兴趣、习惯、方法、过程星级，以及 18 项能力等级，共 38 列 | 对应任课教师录入；有准确分项来源时自动同步 |
| 健美 | 身高、体重、左右视力、跳绳 5 列；体育学业/过程及体测自评/水平/过程 5 列 | 实际健康数据、体育教师与学生自评 |
| 艺美 | 音乐、美术的学习过程自评/教师评价、学业水平、过程表现、技能自评/教师评价，共 12 列 | 学生和音乐、美术教师 |
| 劳美 | 四课程各有学业星级、实践描述，共 8 列 | 对应课程教师确认 |
| 故事美 | 读、听、讲各有评价与实践描述，共 6 列 | 小程序对应最终成绩或教师评定；描述本系统填写确认 |

固定六板块共 **90 个业务列**，再加体育、艺术特长两个数组列。它们能承载页面原有 102 个展示位置，并继续增加特长条目；不需要 102 条指标记录或 102 张表。报告正面文字另为同行中的 9 个 TEXT 字段。

典型字段：

```text
conduct_politeness_self_star       有礼貌自评
conduct_politeness_other_star      有礼貌他评
chinese_reading_appreciation_grade 语文阅读与鉴赏等级
math_problem_solving_grade         数学解决问题等级
height_cm / weight_kg              身高、体重
vision_left / vision_right         左右视力原值
jump_rope_1min                     1分钟跳绳
music_learning_self_star           音乐学习过程自评
music_learning_teacher_star        音乐学习过程教师评价
labor_academic_star                劳动学业水平
labor_experience                   劳动实践描述
story_read_star                    我爱读故事评价
story_read_experience              我爱读故事实践描述
```

星级使用 `TINYINT UNSIGNED`，NULL 表示未填，已填值限制为 1/2/3；字母等级使用 `VARCHAR(8)`；完整描述使用 TEXT；身高体重使用 DECIMAL；视力保留字符串原值，记录标准仍待学校确认。空值不转成零分，测量值不作为奖惩积分。

特长数组对象统一为 `{id, name, self_star, teacher_star, outcome}`。`id` 是稳定项目标识；数组支持任意条，图中两行不是数据库上限。这里采用两个数组，是为了在不增加明细表的前提下支持重复项目；固定评价项仍全部使用普通列。

## 3. 最少保留哪些表

**保留教师按班级、学科分别授权时，六板块录入与查看使用 4 张核心表；加上已发布报告归档为 5 张。** 这里只将六板块评价数据合为一张表，账号和任教授权不混入评价行。

| 表 | 作用 |
| --- | --- |
| `users` | 学生、教师、管理员账号及身份 |
| `academic_year` | 学年学期、校历、报到日期、统一发布状态和少量配置 |
| `teacher_teaching_assignment` | 教师负责的班级和学科，控制可读写的宽表列 |
| `student_term_evaluation` | 所有学生各学期六板块、报告文字、来源、草稿与确认 |
| `term_report` | 已发布报告归档，保存冻结 JSON、版本和发布批次号；不拆六板块 |

如果同时保留本轮讨论的配卡、扫码积分、荣誉和月度故事，建议采用以下 **11 张核心业务表**：

| 序号 | 表 | 处理 |
| --- | --- | --- |
| 1 | `users` | 保留 |
| 2 | `academic_year` | 保留并承载学期配置、报告发布批次状态 |
| 3 | `teacher_teaching_assignment` | 保留，明确教师负责的班级、学科和班主任职责 |
| 4 | `student_term_evaluation` | 新宽表，合并六板块及当前报告草稿 |
| 5 | `term_report` | 保留已发布归档 |
| 6 | `card_quota_rule` | 管理员总额度＋教师班级/学科/分类分配计划 JSON |
| 7 | `reward_card` | 每张卡的固定分类、班级、学科、凭证及使用学生 |
| 8 | `score_record` | 每笔积分及冲销；不能只保存汇总分，否则无法纠错 |
| 9 | `honor_record` | 荣誉申报、证书和审核结果 |
| 10 | `story_submission` | 月度故事正文、评分和状态；把正文直接放入本表 |
| 11 | `operation_audit` | 操作、更正和导入来源留痕，复用一张日志表 |

这 11 张是上述核心业务的目标，不表示当前 44 张表都可以马上删到 11 张。正在使用的钉钉多身份关联、公共设备、通知、登录撤销及家长访问凭证仍可保留对应功能表；迁移记录也属于技术表。不能通过删表暗中取消仍在用的功能。

## 4. 哪些表可以合并或退役

| 当前表或前版拟新增表 | 精简后的去向 |
| --- | --- |
| `student_indicator_value`、`grade_indicator_definition` | 固定值进入宽表，固定字段与校验定义放统一配置文件；学期个性配置放 `academic_year.evaluation_config` |
| `student_health_record`、`subject_score`、`student_dimension_score` | 该报告需要的当期正式值进入宽表；旧来源与历史成绩先备份归档。图外体测值仍在用时不得丢弃，可放宽表的 `extra_health JSON` |
| `student_evaluation_snapshot`、`student_report_draft`、`student_term_state` | 当前值、状态和 revision 归宽表；发布快照归 `term_report` |
| `student_term_reflection`、`family_feedback_record`、`report_comment_revision` | 当前自述/寄语归宽表；改动留痕归操作日志 |
| `external_story_result`、`student_indicator_value_revision` | 不再新增；正式外部成绩归宽表，外部记录及更正证据归来源元数据和日志 |
| `card_allocation`、前版班级分配/细分表 | 分配计划归 `card_quota_rule.allocation_json`；生成后的真实归属归 `reward_card` |
| `card_claim` | 新卡即时兑换信息归 `reward_card` 和 `score_record`；历史待审核记录先结清归档 |
| `card_subject`、`teacher_subject`、`subject_card_policy`、`edu_evaluation_category`、`comprehensive_score_rule` | 固定学科、分类和规则统一由代码配置/学期配置承载，不再拆多张配置表 |
| `card_print_pack`、`card_generation_issue`、`ai_comment_job` | 打印从已有卡重建；异常进日志；AI 初稿归宽表临时字段或草稿元数据；无长期任务能力需求时不单建任务表 |
| `health_import_batch`、`subject_import_batch`、`roster_import_batch` | 批次状态、错误和更正记录归操作日志；预览短期缓存，最终提交仍需校验并留痕 |
| `report_publish_batch` | 学校当前发布控制归 `academic_year`；每份归档保留批次/版本，不再另拆发布明细表 |
| `request_idempotency` | 逐接口改用业务唯一键、稳定请求键和操作日志唯一约束后才可退役，不能先删 |
| `material_revision` | 月度正文移至故事表，证书引用移至荣誉表；历史修订归日志/历史归档，不能丢失 |
| `student_theme_preference` | 用户偏好可归 `users.preferences JSON` |

配置版本必须可重现：学期配置发布后冻结，变更生成新版本；已发布报告归档带实际使用的配置和模板版本，不只保存一个当前配置指针。

## 5. 少表方案如何保留必要流程

### 不互相覆盖

学生只能更新指定自评列和自述列，任课教师只能更新本学科列，班主任负责最终确认。接口采用字段白名单和局部 UPDATE，不把完整宽表对象回传覆盖。更新校验 `revision`；发生版本冲突时重新取值后按本次字段合并，不能拿旧整行直接重试。

不同来源的值各占独立列，例如 `story_read_star` 与 `story_read_experience`。外部成绩更正只更新对应成绩列及其来源，不改掉实践描述。

### 配额与重印

`card_quota_rule` 的 `quota_n` 只允许管理员修改；教师只编辑额度内的计划 JSON，按班设总数并细分学科和分类。确认/生成时事务锁定额度，核对班额和总额。每张 `reward_card` 冻结班级、学科、分类及计划版本；已生成卡有唯一序号，重印只恢复同一张卡，不生成新凭证。

### 来源与更正

`field_sources` 记录每个正式字段来自教师、测量或小程序的哪个版本。操作日志追加变更和导入证据；建议给 `operation_audit` 增加仅授权角色可读的 `private_payload JSON`，保存必要的历史成绩/文字/原始结果，原有公开摘要只写字段名和状态。管理员状态页和审计接口不能因此读到健康或寄语正文。

外部重复投递使用稳定请求键：学校、提供方、外部记录、版本和目标字段组成摘要，在日志建立相应唯一约束并与宽表更新同事务提交。外部版本撤回或被更正后，宽表确认状态失效。

### 发布与历史

宽表保留草稿、确认和当前 revision。`term_report` 只保存已准备/发布的冻结归档。全校发布先冻结本期应评名单和预期版本清单，检查所有学生确认有效、必填项齐备、来源及模板版本一致；清单与任务状态保存到 `academic_year.release_manifest JSON / release_state JSON`，准备期间禁止相关源写入。全部报告准备成功后，原子切换学期的 `active_release_version`，读取端只展示该版本，不逐学生提前可见。

同一学校学期同一批次请求重试复用稳定 release key，归档唯一键含学生和发布版本；准备失败不改当前 active_release_version，旧报告继续可见。新数据重新确认后发布新批次，旧报告不覆盖。

## 6. 交付与迁移边界

- [宽表字段定义 SQL 提案](../../database/student_term_evaluation.proposed.sql)：完整普通列及两个特长数组列，没有 DROP 或 ALTER 语句，未执行。
- [展示位置到宽表字段的映射](../../data/six-section-wide-field-map.json)：原页面 102 个位置均可定位。
- 本轮只更改设计资料。正式迁移需先列出现有功能仍在引用的表，将历史数据、隐私读取、幂等和发布查询切换验证后，再退役旧表。
- 旧竖表尚无自评/他评标识，迁移时不能猜测视角；原有总成绩也不能拆造能力分项。可确定的数据回填，不确定的保留来源并待补录。

这是本方案作出的精简选择：固定学校报告采用宽表；动态特长使用两个数组；配置集中；当前草稿与来源并入宽表；只把真正的一对多业务和已发布历史留作独立表。
