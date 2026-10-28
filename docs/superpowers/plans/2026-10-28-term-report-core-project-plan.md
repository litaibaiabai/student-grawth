# 学校期末报告核心系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有系统收敛为六种来源采集、学生学期宽表、班主任确认、全校统一发布及 HTML 打印的完整闭环。

**Architecture:** 沿用单体 Express、React 和 MySQL，目标数据库只有6张核心业务表。固定评价直接使用宽表列，所有原始材料、批次、卡及更正共用类型受限的来源表；发布报告独立冻结归档。采用新库旁路迁移和一次应用切换，不在原44表库上直接删改，也不长期维护新旧双写。

**Tech Stack:** Node.js 22.12+、Express 5、React 18、Ant Design 5、Vite、mysql2、MySQL 8.0.21+；复用 bcrypt/JWT、multer、pdfkit、qrcode 和前端 xlsx。测试使用 node:test、原生 fetch 和现有可用的 Playwright；不新增 ORM、微服务、消息中间件、通用工作流引擎或任务表。

ZIP仅新增生产依赖`yazl@3.3.1`并提交lock文件，采用`ZipFile.addReadStreamLazy/outputStream`流式组合每班PDF，不把全校PDF缓冲到内存。[维护者API说明](https://github.com/thejoshwolfe/yazl#usage)与[版本声明](https://github.com/thejoshwolfe/yazl/blob/master/package.json)支持该选择。ZIP解包断言使用测试环境Python3标准库zipfile，生产不依赖Python。当前终端系统Node为18，实施前必须切到符合版本的Node，不能据Node18的运行失败判定业务测试结果。

**Spec:** [学校期末报告核心工作流精简方案](../specs/2026-10-28-term-report-core-workflow-design.md)，配套[109项来源合同](../../data/term-report-core-source-policy.json)、[完整六表SQL](../../database/term-report-core-v1.schema.sql)和[字段字典](../../database/term-report-core-v1.schema.json)。以最新 Spec 和来源合同为准，不执行旧宽表提案或旧全库迁移脚本。

**实施状态（2026-10-28）：** 核心代码和三角色闭环已实现并提交；已验证109位置、A4双面、8学生浏览器闭环及规模预算。真实LLM验收受供应方Arrearage阻挡，正式校样审批与旧素材/卡凭证恢复、生产切换仍为外部门槛。

## Global Constraints

- “一个学生每月一个有效批次，内含三类，每类 1–3 篇。”
- “一名学生一学期的完整六板块宽表、学生自述、寄语、来源及确认状态”。
- “每张卡生成时固定末级项目、班级、学科、学期和 +1 分。”
- “劳美不发卡”；音美“各有学科素养教师评价、学科素养过程表现、艺术技能教师评价三类，独立累计”。
- “未兑换卡不计分，重复提交不重复计分。”
- “来源正式提交、撤回、更正或重新评分后，受影响宽表 revision 变化，原确认失效。”
- “全校适用项目就绪、报告来源版本与确认版本一致后，统一发布。”
- “无奖状不阻断报告”；“无奖状属于合法无成果状态”。
- “宽表更新使用字段白名单、局部 UPDATE 和 revision 校验，不允许客户端提交整行覆盖。”
- “旧版本迟到的结果仅保留追溯，不覆盖新版本或宽表。”
- “本稿不包含任何删库操作”；实施必须新库演练、备份、对账后切换。
- 计划采用 Spec 建议参数作为首版可配置默认值：卡 T=10、故事60/85分档、月份等权；它们不是既有校规。启用学期前由管理员确认规则版本及奖状映射，不在代码中不可逆写死。

## Review Focus

- 手机重复点击、并发抢扫、同键不同正文：只产生一次有效结果，同键异载荷409；归属他人的幂等结果不泄露。测试落在 T3/T4。
- 评分响应晚于故事修订、规则变更或发布冻结：旧结果不能回写当前宽表，失败文本保留。测试落在 T7。
- 跨校、跨班、跨学科及 JSON 特长字段篡改：角色和目标字段同时校验，不能通过来源详情或导入父批次泄露其他学生。测试落在 T2/T5/T8。
- 超长中文、emoji、HTML片段、视力字符串及星级/字母混用：保留原值、明确校验、转义输出，预览报告不静默裁切。测试落在 T5/T9/T11。
- 旧库历史报告、未定分类卡、双版本成绩与发布中断：不伪造迁移、不执行旧引导、失败批次不对学生可见，回退不覆盖历史。测试落在 T1/T10/T12。

---

## 第1轮产出：需求骨架与范围

核心对象只保留：账号、学期、任教职责、学生学期评价、来源记录、发布报告。卡额度、导入批次、故事月份和审核不是新实体表，使用来源表中的固定记录形态。

| 业务 | 交付边界 | 不纳入本期 |
| --- | --- | --- |
| 卡与直评 | 37类卡；管理员总额度；教师分班；分班文件打包；扫码/直评+1；冲销及折星 | 二次选分类审核、商城、排行榜、成长闯关 |
| 导入 | 学籍/任教、五项健康原值、25个学业字段；预览、差异和提交 | 导入六育终测总分、从总分伪造能力分项 |
| 奖状 | 图片提交、事实提取、归属确认、成果生成和撤回 | 独立荣誉墙、额外荣誉总分 |
| 自评/教师评价 | 独立自评、特长教师评价、九段报告正面文字、批量确认 | 多人互评平台、独立家长账号/签署系统 |
| 故事 | 月度3–9篇文本、批量评分、失败重试、分类月均及期末均分 | 音视频、Word/PDF故事解析、外部故事平台专用对接 |
| 报告 | 最新PDF六板块，109个展示位置；完整草稿、冻结归档、全校发布、移动查看和浏览器打印 | 独立Word/Excel报告导出、默认雷达图或综合总分 |

先前提及的钉钉统一登录与AI寄语仍需单独追踪：现有钉钉实现只预留身份关联，真实回调被主动阻断；现有AI寄语也没有真实供应方。本基线保留账号登录、移动端填报与教师手填寄语，两项外部接入均不计为已完成。若校方将它们列为首发必需，应在范围评审时增补T2身份适配及T6/T9寄语适配的任务和估算；不以模拟回调或固定模板充当交付。

性能是验证预算而非当前系统实测：试点按3000学生、每学期200万来源行、50个并发家长请求设计；班级列表p95≤800ms，普通提交p95≤1500ms，不计外部评分；3000份报告准备≤120s，激活事务≤3s。T11在部署同级环境实测，超预算先查索引/批量查询，不增加中间件掩盖问题。

## 第2轮产出：模块与交互边界

只有四个后端业务区：基础/权限、六种来源、宽表汇总/确认、发布/渲染；评分与识别是可替换的窄接口，不建设供应商注册平台。

| 层 | 职责 | 与邻接模块的合同 |
| --- | --- | --- |
| React | 材料与自评、教师任务、班主任确认、管理员配置/导入/发布 | API只提交本次字段及稳定requestKey；不决定权限、分数或发布名单 |
| Express路由 | 鉴权、参数转换、统一响应 | 新路由集中在`backend/routes/reportCore.js`，复用现有成功/错误响应格式 |
| 业务服务 | 每种来源固定状态、幂等、评分和映射 | 数据库写入统一经过T3事务函数；外部调用不占数据库事务 |
| MySQL | 六表、唯一键、约束、来源和报告快照 | 同校复合外键；评价唯一键；卡令牌及冲销唯一约束 |
| 私有文件 | 证书文件及重印临时资料 | 数据库只保存私有fileRef，读取必须鉴权；TXT最终正文入来源表 |
| 外部评分/识别 | 故事量规评分、证书事实提取 | T6定义接口和返回验证；未配置时返回未就绪，不返回虚构MODEL结果 |

### 最终文件结构

| 文件 | 责任 |
| --- | --- |
| `backend/config/reportCorePolicy.json` | 从设计合同落地的97列、37卡、角色、制式及前端分组配置 |
| `backend/services/reportCorePolicy.js` | 配置验证、规范化、卡/故事折星与稳定JSON摘要 |
| `backend/services/reportCoreStore.js` | 六表事务、幂等、共享发布锁、宽表修订失效 |
| `backend/services/reportCoreProjection.js` | 按固定六来源重算本次受影响字段，不提供插件/DSL |
| `backend/services/reportCoreCards.js` | 额度、分班计划、制卡、兑换、直评、冲销、分班打印 |
| `backend/services/reportCoreImports.js` | 三类导入：ROSTER、HEALTH、ACADEMIC |
| `backend/services/reportCoreMaterials.js` | 证书提交、识别结果、认定、撤回与成果映射 |
| `backend/services/reportCoreProvider.js` | 真实故事评分/证书识别调用与输出验证 |
| `backend/services/reportCoreStories.js` | 月度批次及各类均分、修订、评分回写 |
| `backend/services/reportCoreWorker.js` | 同进程轮询来源表，租约、重试、退出恢复 |
| `backend/services/reportCoreEvaluation.js` | 自评/教师表单、完成状态、草稿组装、班主任确认 |
| `backend/services/reportCorePublish.js` | 冻结名单、分块准备、统一激活、失败恢复 |
| `backend/services/reportRenderService.js` | 唯一报告HTML模板，包含移动与打印CSS；发布时HTML随模型冻结 |
| `backend/utils/privateFiles.js` | 文件类型/大小/路径验证、原子落盘及授权读取 |
| `backend/routes/reportCore.js` | 薄HTTP入口，不再并行挂载旧业务路由 |
| `backend/app.js`、`db.js`、认证/授权文件 | 注入pool的应用工厂、无DDL连接、实时身份与字段授权 |
| `frontend/src/app/student/materials.jsx` | 统一材料入口，组合扫码、奖状、故事、自评子页面 |
| `frontend/src/app/student/{claim,honors,stories,selfEvaluation,report}.jsx` | 各来源具体交互及本人报告 |
| `frontend/src/app/teacher/{tasks,reportDrafts}.jsx` | 任课任务及班主任草稿确认 |
| `frontend/src/app/admin/{terms,teachingAssignments,rosterImport,import,cards,reports}.jsx` | 基础、配置、额度、导入与发布 |
| `frontend/src/component/TermReport/index.jsx` | 草稿/已发布共用HTML容器、测量和打印按钮，不再拼装第二套评价表格 |
| `frontend/src/App.jsx`、`constant/{menu,urls}.jsx/js`、`StudentLayout` | 精简路由、菜单、导航；不再请求成长主题/积分等级接口 |

列举的services是具体业务文件，不引入Controller/Repository/Factory等额外成套抽象。现有薄控制器可退役；复用`cardCredentials.js`、错误响应、字体及可用导入解析算法，先用新合同测试再接入。

### 原44表与界面的明确去向

以下按[实库结构快照](../specs/2026-10-28-current-database-schema.json)逐一覆盖44张表。这里的“退役”指新应用不再读写；旧库保留备份和历史，不生成DROP语句。

| 原表（组内每张均按此处理） | 新系统去向与迁移边界 |
| --- | --- |
| `users`、`academic_year`、`teacher_teaching_assignment`、`term_report` | 4张同名表在新库按新DDL创建；迁账号/学期/任教及原报告快照；不在原表直接ALTER |
| `grade_indicator_definition`、`edu_evaluation_category`、`card_subject`、`subject_card_policy`、`comprehensive_score_rule`、`teacher_subject` | 6张配置表退出运行链；可证明的目录/阈值并入固定policy及学期JSON，任教并入职责表；旧综合总分公式只归档 |
| `student_indicator_value`、`subject_score`、`student_health_record`、`student_report_draft`、`student_term_state`、`student_evaluation_snapshot`、`student_dimension_score`、`family_feedback_record`、`report_comment_revision` | 9张结果/草稿表退出运行链；明确匹配97列、九段文字及状态的数据迁宽表，原始导入/人工变更另留来源；不明视角/总分仅归档、不拆造新值 |
| `card_quota_rule`、`card_allocation`、`reward_card`、`card_claim`、`score_record`、`honor_record`、`story_submission`、`material_revision`、`health_import_batch`、`roster_import_batch`、`subject_import_batch`、`operation_audit`、`request_idempotency` | 13张采集表归入来源记录；卡领取与积分原记录按原ID去重，不能迁成两次+1；旧幂等响应仅摘要归档，不复用旧命令命名空间 |
| `ai_comment_job`、`report_publish_batch`、`card_print_pack`、`card_generation_issue` | 4张过程表退出运行链；旧AI建议/发布/打印诊断归档，确需保留的审计入AUDIT；新发布控制归学期，新卡按原凭证重印 |
| `token_blacklist`、`renovation_schema_migrations` | 2张基础设施表不迁入新库；切换使旧JWT全部失效，改token_version；旧迁移校验记录保留原库 |
| `external_identity_link`、`family_access_token`、`kiosk_device`、`kiosk_session`、`notification_outbox`、`student_theme_preference` | 6张外围表退出运行链；不迁可用会话/设备密钥/发送队列，外部身份只保非秘密历史引用；相关旧入口410 |

界面重构分工：学生扫码/荣誉/故事改为“我的材料”子页，自评新增，报告重构；教师直评/卡/导入/材料审核合并任务入口，班主任草稿确认重构；管理员学期/任教/学籍/导入/额度保留并简化，发布中心改为全校就绪状态。指标树、终测总分导入、成长主题、排行榜/商城、独立荣誉墙/故事社区、公共终端、消息管理退出核心菜单和API挂载。只保留真正使用的路由与请求，页面改造对应T2、T4–T11。

## 第3轮产出：依赖、关键路径与排期

各来源共同服务同一份报告，不拆成独立子项目。先冻结数据库/接口，再并行实现互不写同一来源的功能。

| 任务 | 强依赖 | 单人日估算 | 独立验收产物 |
| --- | --- | ---: | --- |
| T1 | 无 | 1 | 六表SQL、隔离测试库、启动不重建旧表 |
| T2 | T1 | 1.5 | 登录、学期、任教授权及精简菜单壳 |
| T3 | T2 | 2 | 来源事务、宽表投射和幂等合同 |
| T4 | T3 | 2 | 卡/直评/冲销/分班打印闭环 |
| T5 | T3 | 1.5 | 角色受限导入闭环 |
| T6 | T3、可用识别/评分供应方 | 2 | 奖状闭环、两个评分接口及共享任务租约 |
| T7 | T6 | 2.5 | 故事一次月批、自动评分/重试/汇总 |
| T8 | T3 | 1 | 自评、教师评价和正文表单 |
| T9 | T4/T5/T6/T7/T8、学校正面校样 | 2 | 完整草稿、预览及确认 |
| T10 | T9 | 2 | 全校原子发布和历史阅读 |
| T11 | T10 | 2 | 正式入口端到端、旧入口退役及性能 |
| T12 | T11、迁移对账及学校验收 | 1.5 | 新库切换、回退演练与交付 |

关键路径：T1→T2→T3→T6→T7→T9→T10→T11→T12，理想串行约16.5工作日。全部任务约21人日；按两名能跨前后端工作的工程师、半职测试，预留约4工作日集成/外部依赖缓冲，基线约4周。该估算依赖评分供应方和规则在T6前就绪，不能将等待供应方计为已完成开发。

W1完成基础、事务与卡；W2完成导入、材料、月度故事、自评；W3完成草稿与发布；W4做真实入口、规模验证、迁移与学校验收。没有T1–T3验收不得抢先实现独立业务接口。

## 第4轮产出：风险与Plan B

| 前置风险 | 发现证据/触发条件 | 处理和Plan B | 发布门槛 |
| --- | --- | --- | --- |
| 旧表自动重建 | `backend/db.js`启动建黑名单；`scripts/runMigrations.js`加载全库和旧seed | 新库专用初始化；移除运行时DDL/旧scheduler；测试启动后仍只有6业务表 | 绝不能用旧migrate引导新库 |
| 身份回退越权 | `authorizationService.js`缺用户时会信任JWT角色；旧认证读黑名单 | 活用户+token_version；无用户401、数据库异常503；事务内重新查任教范围 | 不保留兼容降级 |
| 自动评分/识别不可用 | 目前故事按篇幅模拟，寄语返回假的MODEL来源 | 真实适配器超时/重试；故事异常可由授权教师按同一量规复核，证书可人工确认事实 | 人工回退能保报告；不能据此宣称自动评分验收通过 |
| 迟到结果覆盖新文本 | 家长重新提交或规则已变，旧请求仍在返回 | 正文hash+批次version+ruleVersion+leaseToken全匹配才提交 | T7竞态测试通过 |
| 卡额度与折星目标不匹配 | 人数×项目目标明显超过发卡/直评可达量 | 配置页显示量级；T按年级项目设置；真实零分只在教师结算后折星 | 初始阈值经学校确认 |
| 奖状无法归类/无成果 | OCR不确定、没有匹配规则、没有奖状 | 待认定/待配置/无成果分开；人工认定仍保CERTIFICATE来源 | 无奖合法；未认定材料不可冒充无奖 |
| 旧库混杂数据 | 无分类卡、多版本成绩、不明自评视角 | 只迁可证明数据；不明项列补录清单；原报告按LEGACY归档 | 不把总分拆造为能力分 |
| 宽表互相覆盖 | 多教师/家长同时写同一行 | 字段白名单、部分更新、revision冲突409；先刷新再提交本次字段 | T3/T8并发测试 |
| 全校发布部分可见 | 准备一半崩溃、旧worker恢复、名单改变 | term发布锁+fence；PREPARED不可读；最后短事务统一激活 | T10注入失败后旧批次仍可读 |
| 文件或长文拖垮工作量 | 格式错误、过大图片、非法UTF-8、打印溢出 | 明确限制、回显修正、只重试失败项；不静默截断 | 格式提示和布局复核通过 |
| 正面版式依据不齐 | 当前项目未找到曾提到的正面.jpg/反面.jpg；最新PDF只有明细一页 | T9前取得学校正式正面及双面打印设置；可先完成九段正文数据和明细版面 | 未比对正式正面，不宣称A4双面校样验收通过 |

外部依赖登记：学校提供启用学期、故事应交月份、学籍/任教样本、奖状归属及等级映射、评分量规/评分供应方、报告正式文字。未就绪项不阻断T1–T5，但相应功能不可伪装完成。供应方选择由实施人员按学校批准条件落实，不在本计划阶段获取或输出密钥。

## 第5轮产出：SQL、接口与任务落地

### 5.1 六表详细SQL设计

可执行DDL原文在 [term-report-core-v1.schema.sql](../../database/term-report-core-v1.schema.sql)，共6个CREATE TABLE，未在任何数据库执行；字段字典在 [schema.json](../../database/term-report-core-v1.schema.json)。SQL不含DROP/ALTER/USE/CREATE DATABASE或默认账号。

| 表 | 主键及核心唯一约束 | 关键字段/索引 |
| --- | --- | --- |
| `users` | id；(school_id,username)唯一；(school_id,id)供同校FK | bcrypt密码、角色、班级、状态、token_version；学校角色班级索引 |
| `academic_year` | id；(school_id,学年,学期)；生成列current_school保证每校最多一个当前学期 | evaluation_config、三种配置版本、active_release_version、release_key/fence/manifest/state |
| `teacher_teaching_assignment` | (学校,学期,教师,年级,班号,学科)唯一 | 任教与班主任标记；班级确认查询索引；教师/学期同校FK |
| `student_term_evaluation` | (school_id,term_id,student_id)唯一 | 97固定评价列：60星级、25等级、5健康原值、7描述；两个特长数组、九段正面文字；状态/班级索引 |
| `evaluation_source_record` | business_key唯一；token_hash唯一；同父记录版本位置唯一；同原记录仅一次冲销 | 六种source_type+固定record_kind；payload/response/hash、租约、重试；学生项目、逻辑组、教师月份、作业索引 |
| `term_report` | 学生学期version唯一；同批次学生唯一 | PREPARED/PUBLISHED、release_version/key、CORE/LEGACY、完整snapshot/hash、发布时间 |

全部主外键采用BIGINT UNSIGNED；应用层ID使用十进制字符串，mysql2配置`supportBigNumbers:true,bigNumberStrings:true`，不使用Number强转。时间戳为UTC DATETIME(6)，月份/校历按Asia/Shanghai。所有外键ON DELETE RESTRICT，账号停用替代物理删除。JSON只用于动态特长、配置、材料、来源和状态，不把固定97项再塞回泛化JSON。

保留原有校内用户名唯一规则，不改成全库唯一。首版一校一部署，登录的schoolId由部署`SCHOOL_ID`确定，客户端不能切换该值；查询必须带school_id，消除旧代码只按username取第一行的问题。身份令牌始终包含并核验schoolId。保留多个学校样本做隔离测试，不新增学校目录表。

SQL CHECK约束覆盖星级1–3、JSON对象/数组、确认版本有效、卡必要凭证、USED卡有学生、处理中有租约、source/kind合法组合和delta。状态细分仍由固定代码合同验证，不能仅依赖全局status枚举。

初始化由T1专用脚本对明确的空目标库执行；不增加业务迁移表。已存在6表且结构指纹一致时初始化只读返回；部分建成或指纹不符时停止并输出恢复说明，不自动删表重建。后续版本升级另做显式迁移，不靠启动应用补列。

### 5.2 公共合同与不变式

```text
Actor = {id:string,schoolId:string,role:'student'|'teacher'|'manager',tokenVersion:number}
StudentKey = {schoolId:string,termId:string,studentId:string}
Patch = {values:Record<allowedColumn,scalar>,specialtyChanges?:{collection:'sports'|'art',id:string,changes:Record<allowedProperty,scalar>}[]}
Specialty = {id:string,name:string,self_star:1|2|3|null,teacher_star:1|2|3|null,outcome:string|null,sourceIds:string[]}
Command = {requestKey:string,payloadHash:string}; hash由服务端稳定JSON生成，不能信任客户端摘要
MutationResult<T> = {result:T,replayed:boolean,revisions:Record<studentId,string>}
Readiness = {complete:boolean,missing:{studentId:string,field:string,reason:string}[],counts:object}
ScoreResult = {dimensions:[number,number,number,number],total:number,evidence:string[],feedback:string,provider:string,model:string,ruleVersion:string}
Release = {releaseKey:string,releaseVersion:number,fence:string,status:string,total:number,prepared:number}
ReportModel = {schemaVersion:'CORE_V1',student:object,term:object,values:object,sportsSpecialties:Specialty[],artSpecialties:Specialty[],narratives:object,policySnapshot:object,sourceSummary:object,displayFieldCount:number}
FrozenReport = {id:string,termId:string,studentId:string,version:number,releaseVersion:number,publishedAt:string,snapshot:object,html:string}
```

事务顺序统一为学期共享锁→实时操作者/任教校验→按student_id排序锁宽表→按ID排序锁来源记录。配置、学籍、任教变更与发布开始取该学期独占锁；所有会影响报告的写入都经过此守门。来源处理租约领取是短事务，外部HTTP调用在事务外；回写再按相同顺序取锁。

每个写命令在来源表追加一个`source_type=NULL,record_kind=AUDIT`的命令信封，保存服务端business_key/payload_hash和可回放响应；实际材料/卡记录另按固定类型创建或修改，仍只有一张来源表。先查本人已成功命令可回放，再对新写入检查发布锁；同键异载荷409，事务内再次查键，失败整体回滚。不要让领取卡或修订同一材料必须复用该材料的business_key。

命令键为SHA256稳定JSON`['CMD',schoolId,actorId,action,requestKey]`；载荷摘要包含termId、目标学生及全部规范化正文。领域键使用不同前缀：额度`['QUOTA',schoolId,termId,teacherId,monthKey]`，实体卡`['CARD',quotaId,serial]`，故事批次`['STORY_BATCH',schoolId,termId,studentId,monthKey,version]`。其余明细以命令源ID、学生ID、项目/槽号生成，不按正文去重。所有parent_id/original_id还须在服务内核验同学期、合法父类型及应有的同学生关系，不能仅凭同校外键放行。

宽表投射只处理受影响目标：卡按有效事件求和；导入/表单用当前有效确认版本；奖状按已认定映射取最高档；故事按当前月批次均值。原始来源保留，表单和处理状态不作为额外加分。一次事务结束时每个受影响学生revision只增加一次，清除确认字段；幂等回放不递增。

卡算法固定为：采集未结算返回null；结算后`P < ceil(T/2)`为1星，`ceil(T/2) <= P < T`为2星，`P >= T`为3星；T为至少2的整数，P为非负整数。故事四维依次是内容完整性、类别相关性、表达条理、个人理解与感受，各0–25分；返回值须为有限数、总分0–100且与四项之和一致。证据和反馈是文本，按不可信内容转义；未提供事实不能生成实践经历。

字母默认允许A/B/C/D，管理员可按校规配置替换，不做90/80/60隐式转换。星级导入接受1/2/3或★/★★/★★★并标准化；视力保持字符串。文本长度按Unicode码点而非JS UTF-16长度验证。TXT采用严格UTF-8并处理BOM/CRLF，每篇1–10000码点、原文件≤64KiB；证书仅JPEG/PNG且≤5MiB。正文上限初值：自述/实践每项2000码点，寄语每项1000码点，超过明确报错，不能静默裁切。

运行学科代码固定为MORAL、CHINESE、MATH、SCIENCE、ENGLISH、PE、MUSIC、FINE_ART、INFORMATION_TECHNOLOGY、LABOR、INTEGRATED_PRACTICE、LOCAL_COURSE、STORY。德美他评卡允许该班任课教师；其他卡必须匹配任教学科，体测项归PE。特长教师评价由匹配PE/MUSIC/FINE_ART的教师或班主任填写，未明确归属的艺术项目只由班主任处理。管理员代导学业由`allowManagerAcademicImport`控制，初值false；管理员导健康原值不因此获得报告正文权限。

### 5.3 来源payload的固定形态

| source/kind | 必需payload及关键状态 |
| --- | --- |
| CARD/QUOTA | `{quotaTotal,planVersion,plans:[{grade,classNo,classTotal,items:[{categoryCode,count}]}]}`；DRAFT→CONFIRMED。管理员改quotaTotal，教师只改plans；已生成量不可回收补发 |
| CARD/CARD | `{quotaId,planVersion,grade,classNo,subjectCode,categoryCode,serial,usedRequestKey?,usedAt?}`；UNUSED→USED，或VOID/EXPIRED；delta=1 |
| CARD/DIRECT | `{grade,classNo,subjectCode,categoryCode,reason}`；CONFIRMED，delta=1 |
| CARD/REVERSAL | `{reason}`；CONFIRMED，delta=-1，original_id指同学生同项目的正记录 |
| IMPORT/BATCH | `{kind:'ROSTER'|'HEALTH'|'ACADEMIC',fileHash,expectedRevisions,errors}`；PREVIEW→COMMITTED |
| IMPORT/ITEM | `{rowNo,values,previousValues,subjectCode?}`；COMMITTED，parent_id指批次；不将全班数据放进学生可读响应 |
| CERTIFICATE/ITEM | `{fileRef,fileHash,facts,candidateTargets,approvedTargets,outputs,recognitionMethod,reviewReason?}`；QUEUED→PROCESSING→SUBMITTED→APPROVED，或FAILED/REJECTED/REVOKED |
| STORY/BATCH | `{monthKey,ruleVersion,requiredCategories:['READ','LISTEN','TELL'],monthlyScores,submissionHash}`；DRAFT→SUBMITTED→SCORED，旧版SUPERSEDED |
| STORY/ITEM | `{category,slot:1..3,title?,text,contentHash,scoringRuleVersion,score?,scoreMethod?,feedback?,scoreEvidence?}`；QUEUED→PROCESSING→SCORED/FAILED；parent_id指批次 |
| SELF/FORM、TEACHER/FORM | `{values,previousValues,specialtyChanges?,reason?}`；SUBMITTED或CONFIRMED。特长按稳定ID改指定属性，不整数组覆盖 |
| NULL/AUDIT | `{action,requestKey,changedFields,privateChanges?,migrationRef?}`；COMMITTED；普通列表只返摘要 |

来源收口也是有来源的操作：教师按班确认卡项目采集完成，或材料截止后确认确无奖状，形成TEACHER/FORM，其payload含`action:'SETTLE_CARD_TARGETS'|'DECLARE_NO_AWARDS'`和targetKeys，只更新完成状态、不直接写系统评分。仍有待识别/待认定材料时不能声明无奖。报告是否齐全据此区分未收集、真实零分和无成果。

故事槽号仅在类别内1–3，DB record_ordinal固定映射READ=1..3、LISTEN=4..6、TELL=7..9。新月批次通过group_key与version定位，父批次保存当前有效版本；补交或修订产生新业务version，旧材料不覆盖。

### 5.4 API边界

基础URL保持`/api/v1`；登录、退出兼容现有`/api/auth`。只挂载新路由，旧路径若不兼容则明确410且不能触发旧服务。所有列表分页默认50、上限100。

| API | 方法 | 角色与合同归属 |
| --- | --- | --- |
| `/auth/login`、`/auth/logout`、`/me` | POST/POST/GET | T2；JWT带tokenVersion，每次读活账号；退出使该账号旧token全部失效 |
| `/report-core/config`、`/report-core/terms` | GET | T2；只返该角色可用字段和分类；不返私有配置/材料 |
| `/admin/report-core/terms`、`/admin/report-core/assignments` | GET/POST/PATCH | T2；manager；发布准备期间禁止改影响名单/规则的内容 |
| `/report-core/evaluations/:studentId` | GET | T3/T8；学生只看本人可读自评/进度，任课教师只看授权字段，班主任完整 |
| `/report-core/forms/:studentId` | PATCH | T8；SELF或TEACHER，含`expectedRevision,requestKey,values,specialtyChanges` |
| `/report-core/settlements` | POST | T8；授权任课教师结算本人卡项目，班主任按班确认材料状态；含termId/grade/classNo/subjectCode/targetKeys/expectedRevisions/requestKey |
| `/report-core/card-quotas`、`/report-core/card-quotas/:id/plan`、`/:id/generate`、`/:id/print` | GET/POST/PATCH/POST/GET | T4；管理员总额，教师本人计划/生成/下载；print返回ZIP |
| `/report-core/cards/preview`、`/report-core/cards/redeem` | POST | T4；学生本人，token只放请求体，成功1分；同班限制按首版设计 |
| `/report-core/direct-scores`、`/report-core/sources/:id/reverse` | POST | T4；授权教师，稳定requestKey，reason必填 |
| `/report-core/imports/preview`、`/:id/commit` | POST | T5；kind与目标字段白名单；ROSTER仅manager，HEALTH仅manager，ACADEMIC按任教学科或管理员明确代导权限 |
| `/report-core/certificates`、`/:id/decision`、`/:id/revoke` | POST | T6；学生本人上传；负责学科教师或班主任认定；源文件另走授权`/files/:sourceId` |
| `/report-core/story-batches`、`/:id/submit`、`/:id/items/:itemId/review` | GET/POST、POST、PATCH | T7；学生月批，故事教师(STORY任教)或班主任处理异常 |
| `/report-core/sources`、`/report-core/sources/:id` | GET | T3/T11；学生只看本人、教师按职责、管理员默认摘要；父导入批次不向学生返回 |
| `/report-core/reports/drafts/:studentId`、`/confirm`、`/confirm-batch` | GET/POST | T9；仅班主任；expectedRevision和fingerprint必需 |
| `/admin/report-core/readiness`、`/releases`、`/releases/:key`、`/:key/resume`、`/:key/cancel` | GET/POST/GET/POST/POST | T10；manager；输入termId和requestKey，不收studentIds子集 |
| `/report-core/reports/current`、`/report-core/reports/:id`、`/:id/print` | GET | T10；本人或该学期班主任，管理员正文403；PREPARED永不可见 |

错误合同：400参数形状错误，401未登录/账号不存在/旧token，403范围不符，404不存在，409修订/幂等冲突，413超限，415文件类型，422值或配置不合法，423发布冻结，503数据库或评分依赖未就绪。成功继续使用`{code:200,message,data}`。不返回SQL、密钥、卡明文或其他学生的payload。

---

### Task 1:六表基线、目标库引导与测试隔离

**Files:**
- Create: `sql/05_term_report_core_schema.sql`（从本计划DDL复制）；`backend/scripts/runCoreMigrations.js`；`backend/__tests__/helpers/reportCoreDb.js`；`backend/__tests__/report_core_schema.test.js`。
- Modify: `backend/db.js`、`backend/package.json`；测试需创建应用时采用T2工厂，不导入旧seed。

**Interfaces:** Consumes 六表SQL和字段字典。Produces `createCoreTestDb(t) -> {pool,seedBase(),close()}`；`runCoreMigrations({connection,targetDb,mode:'check'|'apply'}) -> {tables,unchanged}`。测试库名`liuyu_report_test_<pid>_<timestamp>`，目标仅允许`liuyu_report_(test|pilot|prod)(_[a-z0-9_]+)?`，必须与LEGACY_DB_NAME不同。

`backend/db.js`导出`createDbPool(config)->Pool`供应用/测试显式创建，无任何DDL。各测试片段中的apiAs、mintPlan、insertStar等是对应测试文件的局部fixture助手，不是遗漏的生产接口；生产边界仅以Interfaces列出者为准。

- [x] **Step 1：写失败测试**，用独立库断言以下行为。
```js
assert.deepEqual((await listBusinessTables(pool)).sort(), expectedSixTables.sort());
await assert.rejects(insertStar(pool, 4), /constraint|check/i);
await assert.rejects(insertSecondReversal(pool, originalId), /duplicate/i);
assert.equal((await schemaFingerprintAfterPoolInit(pool)), baselineFingerprint);
```
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_schema.test.js`；预期新helper/脚本未定义而失败，记录原因，不能依靠连接失败冒充RED。
- [x] **Step 3：最小实现**：初始化只认空库；已完整同构则不变，部分表则报错。pool配置大整数返回字符串和UTC；移除`db.js`自动CREATE黑名单。SQL必须验证跨校FK、重复学生学期、同父槽位及NULL确认版本约束。
- [x] **Step 4：运行GREEN**：同命令全部通过；校验`97`列和映射覆盖`109/109`，pool初始化无额外表；完整应用启动检查在T11完成。不得连接原业务库建表。
- [x] **Step 5：提交**：`git add sql/05_term_report_core_schema.sql backend/db.js backend/package.json backend/scripts/runCoreMigrations.js backend/__tests__/helpers/reportCoreDb.js backend/__tests__/report_core_schema.test.js`；`git commit -m "feat: add isolated six-table report schema"`。

### Task 2:认证、学期、学籍职责与精简应用壳

**Files:**
- Modify: `backend/app.js`、`backend/middleware/auth.js`、`backend/controllers/authController.js`、`backend/services/authorizationService.js`、`backend/routes/auth.js`、`backend/controllers/termController.js`、`backend/controllers/teachingAssignmentController.js`。
- Create: `backend/routes/reportCore.js`、`backend/__tests__/report_core_auth.test.js`；Modify `frontend/src/App.jsx`、`frontend/src/constant/menu.jsx`、`frontend/src/constant/urls.js`、`frontend/src/component/StudentLayout/index.jsx`、`frontend/src/app/admin/terms.jsx`、`frontend/src/app/admin/teachingAssignments.jsx`。

**Interfaces:** Consumes T1 pool。Produces `createApp({pool,provider,clock,schoolId}) -> ExpressApp`（`backend/app.js`导出，直接启动仅在require.main===module）；`resolveActorContext({userId,tokenVersion,termId},connection)->Actor`；`assertScope({actor,studentKey,action,fields},connection)->{allowedFields}`。`requireAuth`从app.locals.pool读取，不再读取黑名单、JWT班级快照或缺用户回退。直接启动从SCHOOL_ID注入，测试显式注入；缺配置拒绝启动。

- [x] **Step 1：写失败测试**。
```js
assert.equal((await apiAs(deletedUserToken).get('/api/v1/me')).status, 401);
assert.equal((await teacherApi.patch(otherClassAssignment, {})).status, 403);
await logout(token); assert.equal((await apiAs(token).get('/api/v1/me')).status, 401);
```
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_auth.test.js`；必须失败在旧身份降级或未实现工厂，不是数据库不可达。
- [x] **Step 3：实现上述函数及基础API**：账号存在/启用、角色和token_version实时验证；数据库异常503。登录按部署学校和username查询，允许两校同名但不能串校；上线强制旧token重新登录。职责按term读取，STORY专任教师或班主任可复核故事；班主任完整报告、普通教师仅学科字段。先提供可用的学期/职责页面与角色导航壳，不请求旧growth接口。
- [x] **Step 4：运行GREEN**：同测试全过；另断言无账号跨校、两校同名登录只命中部署学校、manager看报告正文403、已撤任教师不能复用旧token授权。前端`npm test --prefix frontend`执行兼容的工具测试，新增壳测试按T11正式收口。
- [x] **Step 5：提交**：`git add backend/app.js backend/middleware/auth.js backend/controllers/authController.js backend/services/authorizationService.js backend/routes/auth.js backend/routes/reportCore.js backend/controllers/termController.js backend/controllers/teachingAssignmentController.js backend/__tests__/report_core_auth.test.js frontend/src/App.jsx frontend/src/constant/menu.jsx frontend/src/constant/urls.js frontend/src/component/StudentLayout/index.jsx frontend/src/app/admin/terms.jsx frontend/src/app/admin/teachingAssignments.jsx`；`git commit -m "feat: add report-only auth and term scope"`。

### Task 3:固定字段策略、来源事务、幂等与投射

**Files:** Create `backend/config/reportCorePolicy.json`、`backend/services/reportCorePolicy.js`、`backend/services/reportCoreStore.js`、`backend/services/reportCoreProjection.js`、`backend/__tests__/report_core_policy.test.js`、`backend/__tests__/report_core_store.test.js`；Modify `backend/routes/reportCore.js`。

**Interfaces:** Consumes T2 Actor/assertScope。Produces `validateConfig(config)->ValidatedConfig`；`cardStars({points,target,settled})->1|2|3|null`；`storyStars(score)->1|2|3`；`stableHash(value)->string`；`withMutation({pool,actor,termId,studentIds,command,action},mutate)->MutationResult`；`rebuildEvaluation({connection,studentKey,targets,config})->{values,fieldSources,sectionMeta}`。`mutate(connection)`只处理同一事务内来源，返回`{result,changedTargetsByStudent}`；修订、确认失效和回放统一由withMutation处理。

- [x] **Step 1：写失败测试**。
```js
assert.deepEqual([0,4,5,9,10].map(points=>cardStars({points,target:10,settled:true})),[1,1,2,2,3]);
assert.equal(cardStars({points:0,target:10,settled:false}), null);
assert.equal((await repeatSameCommand()).replayed,true);
assert.equal(await revisionAfterReplay(), beforeRevision);
await assert.rejects(sameKeyWithDifferentBody(), {statusCode:409});
```
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_policy.test.js backend/__tests__/report_core_store.test.js`；预期新策略和事务方法缺失。
- [x] **Step 3：实现合同**：严格采用公共锁序；公开source列表不返私有payload。字段SOURCE权限由静态policy和任教职责共同确定。服务端business_key绑定操作者/动作/requestKey；先读已有成功信封再取冻结锁，回放无需再次写入。卡T≥2且积分非负；奖状无映射返回待认定；校验97固定字段全部覆盖，37卡类别与37个CARD目标逐一对应。
- [x] **Step 4：运行GREEN**：同命令全过；补并发两个不同字段都保留、同键不同学生或正文不回放、回滚不递增、来源变更清空CONFIRMED、自评不被自动投射改写的断言。
- [x] **Step 5：提交**：`git add backend/config/reportCorePolicy.json backend/services/reportCorePolicy.js backend/services/reportCoreStore.js backend/services/reportCoreProjection.js backend/routes/reportCore.js backend/__tests__/report_core_policy.test.js backend/__tests__/report_core_store.test.js`；`git commit -m "feat: unify report sources and revision-safe projection"`。

### Task 4:卡额度、分班制卡、扫码、直评与更正

**Files:** Create `backend/services/reportCoreCards.js`、`backend/__tests__/report_core_cards.test.js`；Modify `backend/services/cardCredentials.js`、`backend/routes/reportCore.js`、`frontend/src/app/admin/cards.jsx`、`frontend/src/app/student/claim.jsx`、`frontend/src/app/teacher/directScore.jsx`。

**Interfaces:** Consumes T3事务/折星。Produces `saveQuota({pool,actor,termId,teacherId,monthKey,total,command})`；`savePlan({pool,actor,quotaId,expectedRevision,plans,command})`；`generateCards({pool,actor,quotaId,expectedRevision,command})->{cardIds,counts}`；`redeemCard({pool,actor,token,command})->{sourceId,pointsCredited:1}`；`directScore({pool,actor,termId,studentIds,categoryCode,reason,command})`；`reverseSource({pool,actor,sourceId,reason,command})`；`buildClassPrintZip({pool,actor,quotaId})->Readable`。凭证AAD改为`CORE_V1:schoolId:quotaId:serial`，旧库恢复仍使用旧AAD，不能混用。

- [x] **Step 1：写失败测试**。
```js
const race = await raceEligibleSameClassStudents();
assert.equal(race.fulfilledCount,1);
assert.deepEqual(race.netPoints.sort(),[0,1]);
assert.equal((await mintPlan([20,25,25,30],100)).cardCount,100);
await assert.rejects(mintPlan([25,25,25,26],100), {statusCode:422});
```
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_cards.test.js`。
- [x] **Step 3：实现合同与页面**：manager只改总额度，teacher只改本人计划；37类目标白名单排除劳美。发行班级校验、有效期、唯一序号、重复冲销约束；执行`npm install --save-exact yazl@3.3.1 --prefix backend`，每班独立PDF通过ZIP流输出，下载不造新卡，不新增打印表。卡有效期取学期、月份与领取截止的交集；直评截止限制新增，后台评分/审核可在采集截止后继续，发布冻结统一阻断回写。
- [x] **Step 4：运行GREEN**：同测试通过；真实解析ZIP中4个PDF、卡数20/25/25/30和二维码各唯一；再次下载token不变。正向5分两星、冲销后4分一星；跨班403、旧请求回放不+1、密钥未配置503且不占额度。
- [x] **Step 5：提交**：`git add backend/services/reportCoreCards.js backend/services/cardCredentials.js backend/routes/reportCore.js backend/__tests__/report_core_cards.test.js frontend/src/app/admin/cards.jsx frontend/src/app/student/claim.jsx frontend/src/app/teacher/directScore.jsx`；`git commit -m "feat: close classified card collection workflow"`。新增ZIP依赖时同时提交对应package文件。

### Task 5:学籍、健康与学业导入

**Files:** Create `backend/services/reportCoreImports.js`、`backend/__tests__/report_core_imports.test.js`；Modify `frontend/src/app/admin/import.jsx`、`frontend/src/app/admin/rosterImport.jsx`、`frontend/src/util/excelScoreParser.js`、`backend/routes/reportCore.js`。

**Interfaces:** `previewImport({pool,actor,termId,kind,rows,command})->{batchId,validCount,errors,diffs}`；`commitImport({pool,actor,batchId,expectedRevision,command})->{updatedStudentIds}`。最多1000行；前端解析xlsx/csv为规范rows，服务端重新校验；ROSTER含users与assignments，HEALTH只五项原值及测量信息，ACADEMIC只对应导入列。空格留空不覆盖旧值，清空必须显式`clearFields`并预览。

- [x] **Step 1：写失败测试**。
```js
await assert.rejects(mathTeacherImportChinese(), {statusCode:403});
await assert.rejects(commitAfterStudentRevisionChanged(), {statusCode:409});
assert.equal((await importHealth({vision_left:'5.0',jump_rope_1min:160})).vision_left,'5.0');
await assert.rejects(importKind('DIMENSION'), {statusCode:422});
```
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_imports.test.js`；前端解析回归`node --test frontend/src/util/__tests__/excelScoreParser.test.js`记录受旧模板约束的失败。
- [x] **Step 3：实现合同**：BATCH与每学生ITEM分开存；校验全批后提交，存在非法行时不默默部分成功。SELECT显式有效版本，不复制一门总分至多项能力；星级、字母、视力按公共合同处理。身高/体重须有限且大于0并可无损存为一位小数，跳绳为非负整数，视力为1–16码点非空字符串；超SQL类型范围明确422，不隐式截断/舍入。只刷新实际改变学生/目标，新增学生建立该学期宽表。
- [x] **Step 4：运行GREEN**：两命令通过；覆盖同名学生用稳定学号匹配、重复行冲突、0跳绳合法且不当空、非法UTF/emoji、超1000行、未知字段、父批次不能被学生读到其他行。
- [x] **Step 5：提交**：`git add backend/services/reportCoreImports.js backend/__tests__/report_core_imports.test.js backend/routes/reportCore.js frontend/src/app/admin/import.jsx frontend/src/app/admin/rosterImport.jsx frontend/src/util/excelScoreParser.js frontend/src/util/__tests__/excelScoreParser.test.js`；`git commit -m "feat: add scoped preview and commit imports"`。

### Task 6:评分/识别窄接口与奖状闭环

**Files:** Create `backend/services/reportCoreProvider.js`、`backend/services/reportCoreMaterials.js`、`backend/services/reportCoreWorker.js`、`backend/utils/privateFiles.js`、`backend/__tests__/report_core_provider.test.js`、`backend/__tests__/report_core_certificates.test.js`、`backend/__tests__/report_core_worker.test.js`；Modify `backend/routes/reportCore.js`、`frontend/src/app/student/honors.jsx`、`frontend/src/app/teacher/honors.jsx`。

**Interfaces:** `scoreStory({text,category,grade,rubric,ruleVersion,signal})->ScoreResult`；`extractCertificate({fileBytes,mime,signal})->{title,issuer,date,awardLevel,prizeLevel,studentName?,evidence,confidence}`；`submitCertificate({pool,actor,termId,file,command})`；`decideCertificate({pool,actor,sourceId,expectedRevision,facts,targets,manualOutputs?,reason?,command})`；`revokeCertificate({pool,actor,sourceId,reason,command})`。真实供应方HTTP在此模块内接入，不另建服务；30s超时、输出schema验证、显式MODEL或TEACHER_REVIEW来源。

本任务同时产出`claimAssessmentJobs({pool,now,limit:2,leaseSeconds:90})->Job[]`、`applyCertificateFacts({pool,job,leaseToken,result})->{applied:boolean}`和`startCoreWorker({pool,provider,clock})->{tick(),stop()}`。T6先处理证书；T7扩展同一领取/租约机制处理故事。worker单向依赖材料/故事服务，这些业务服务不反向导入worker，避免循环依赖。单进程总在途调用最多2，tick不能每次再额外启动2个。先按30s/120s间隔完成最多3次尝试，之后FAILED；stop停止领取并等待/取消现有请求，未完成租约允许恢复。

- [x] **Step 1：写失败测试**。
```js
await assert.rejects(scoreWithUnconfiguredProvider(), {statusCode:503});
assert.equal((await approveLaborAward()).fieldSources.labor_outcome_grade.sourceType,'CERTIFICATE');
assert.equal((await studentWithNoAwardsReadiness()).complete,true);
await assert.rejects(readOtherStudentCertificate(), {statusCode:403});
```
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_provider.test.js backend/__tests__/report_core_certificates.test.js backend/__tests__/report_core_worker.test.js`。
- [x] **Step 3：实现合同与上传/审核页面**：JPEG/PNG≤5MiB，魔数与声明类型同时验证；原文件私有原子落盘，数据库失败清理本次孤儿文件。无可靠识别进入人工事实确认；无映射时由审核教师在奖状认定内明确目标等级并记录理由，不能改成普通TEACHER来源。多成果取最高已认定档，撤回重算；不使自评和人工特长评价丢失。
- [ ] **Step 4：运行GREEN**：同测试通过，覆盖类型伪装、路径穿越、重传、同证多目标、人工认定、撤回后降档/无奖、未审核不算无奖；手动tick跑通上传→识别→认定，不依赖T7。用学校批准的真实供应方和虚构样本另做1次联调；mock通过不能替代该验收。
- [x] **Step 5：提交**：`git add backend/services/reportCoreProvider.js backend/services/reportCoreMaterials.js backend/services/reportCoreWorker.js backend/utils/privateFiles.js backend/__tests__/report_core_provider.test.js backend/__tests__/report_core_certificates.test.js backend/__tests__/report_core_worker.test.js backend/routes/reportCore.js frontend/src/app/student/honors.jsx frontend/src/app/teacher/honors.jsx`；`git commit -m "feat: add auditable certificate-derived outcomes"`。

### Task 7:月度文本故事与可恢复评分

**Files:** Create `backend/services/reportCoreStories.js`、`backend/__tests__/report_core_stories.test.js`；Modify `backend/services/reportCoreWorker.js`、`backend/__tests__/report_core_worker.test.js`、`frontend/src/app/student/stories.jsx`、`frontend/src/app/teacher/stories.jsx`、`backend/routes/reportCore.js`。

**Interfaces:** Consumes T6领取和worker合同，扩展到STORY/ITEM。Produces `saveStoryDraft({pool,actor,termId,monthKey,expectedRevision,articles,command})`；`submitStoryBatch({pool,actor,batchId,expectedRevision,command})`；`applyStoryResult({pool,job,leaseToken,contentHash,ruleVersion,result})->{applied:boolean}`；`reviewStoryItem({pool,actor,itemId,expectedRevision,dimensions,reason,command})`。重试沿用T6间隔及次数，教师可单项重试/复核。

- [x] **Step 1：写失败测试**。
```js
assert.equal((await submitStories({READ:1,LISTEN:1,TELL:1})).itemCount,3);
await assert.rejects(submitStories({READ:4,LISTEN:1,TELL:1}), {statusCode:422});
assert.equal(await termReadingMean([[80,90,100],[80]]),85);
assert.equal((await applyOldLeaseAfterResubmit()).applied,false);
```
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_stories.test.js backend/__tests__/report_core_worker.test.js`。
- [x] **Step 3：实现合同与一次月批UI**：草稿可不完整，提交要求三类各1–3篇；文本粘贴与TXT回显编辑相同正文入口。评分外调不持DB锁；成功结果经四维总分/证据schema验证、当前批次/文本hash/ruleVersion/leaseToken全部一致后才回写。新提交立即使该月待重新评分，旧结果不覆盖。均分按月份等权、无提前四舍五入；失败不得给0。
- [ ] **Step 4：运行GREEN**：同测试通过；覆盖3/9篇边界、缺类别、UTF-8 BOM、CRLF、10000/10001码点、重试保留正文及其他成功项、两个worker抢同作业、租约超时、规则改变、发布冻结回写423后可恢复。真实评分器对三类各一个虚构文本完成联调。
- [x] **Step 5：提交**：`git add backend/services/reportCoreStories.js backend/services/reportCoreWorker.js backend/__tests__/report_core_stories.test.js backend/__tests__/report_core_worker.test.js backend/routes/reportCore.js frontend/src/app/student/stories.jsx frontend/src/app/teacher/stories.jsx`；`git commit -m "feat: add monthly story batches and fenced scoring"`。

### Task 8:集中自评、教师评价与材料工作区

**Files:** Create `backend/services/reportCoreEvaluation.js`、`backend/__tests__/report_core_forms.test.js`、`frontend/src/app/student/materials.jsx`、`frontend/src/app/student/selfEvaluation.jsx`、`frontend/src/app/teacher/tasks.jsx`；Modify `backend/routes/reportCore.js`、`frontend/src/App.jsx`、`frontend/src/constant/menu.jsx`。

**Interfaces:** `getEvaluationView({pool,actor,studentKey})->{revision,allowedFields,values,progress}`；`submitForm({pool,actor,studentKey,expectedRevision,values,specialtyChanges,command})->MutationResult`。self只改16个自评位置及本人自述/家长代录寄语，teacher只改授权特长教师评价，班主任可改teacher_comment。数组更改为`{id,changes}`，根据稳定id校验每个属性，不接收整数组替换。

同时产出`settleSources({pool,actor,termId,grade,classNo,subjectCode,targetKeys,settlement:'CARD_CLOSED'|'NO_AWARD',expectedRevisions,command})->MutationResult`。只改本学科或班主任范围内的完成状态；现存待审核/处理失败材料时声明无奖返回422。

- [x] **Step 1：写失败测试**。
```js
await assert.rejects(studentPatch({music_learning_teacher_star:3}), {statusCode:403});
await assert.rejects(studentPatchSpecialty({teacher_star:3}), {statusCode:403});
await concurrentSelfAndTeacherUpdatesThenRefreshAndRetryConflict();
assert.deepEqual(await readSpecialty(),{self_star:2,teacher_star:3});
assert.equal((await settleCollectedZeroPoints()).star,1);
await assert.rejects(declareNoAwardsWhileCertificatePending(),{statusCode:422});
```
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_forms.test.js`。
- [x] **Step 3：实现合同与角色工作区**：自评/教师输入及来源结算产生FORM记录，再投射指定列/状态。材料页合并扫码/奖状/月度故事/自评四页签；教师页合并任务/导入/卡/材料异常及按班结算。409后刷新仅本角色可读字段，保留本次草稿；若本次字段未变可自动重试一次，字段已变则显示差异让用户选择，绝不重放旧整行。未经发布不返回完整期末报告；保留本人故事评分反馈。
- [x] **Step 4：运行GREEN**：同测试通过；覆盖跨学生、伪造source_type、对象嵌套多塞字段、旧revision409、项目重排不换归属、无特长时跳过特长自评、超长说明明确422且原文不被截断保存。
- [x] **Step 5：提交**：`git add backend/services/reportCoreEvaluation.js backend/__tests__/report_core_forms.test.js backend/routes/reportCore.js frontend/src/app/student/materials.jsx frontend/src/app/student/selfEvaluation.jsx frontend/src/app/teacher/tasks.jsx frontend/src/App.jsx frontend/src/constant/menu.jsx`；`git commit -m "feat: add field-scoped self and teacher forms"`。

### Task 9:完整报告草稿、版面与班主任确认

**Files:** Modify `backend/services/reportCoreEvaluation.js`、`backend/services/reportRenderService.js`、`backend/routes/reportCore.js`、`frontend/src/app/teacher/reportDrafts.jsx`、`frontend/src/app/student/report.jsx`、`frontend/src/app/student/reportPrint.css`；Create `frontend/src/component/TermReport/index.jsx`、`backend/__tests__/report_core_drafts.test.js`、`frontend/tests/report-core-preview.cjs`。

**Interfaces:** `buildReportModel({evaluation,config,studentSnapshot})->ReportModel`为无数据库读写的固定模型组装函数；`buildReportDraft({pool,actor,studentKey})->{model,html,revision,fingerprint,missingItems}`；`confirmReport({pool,actor,studentKey,expectedRevision,expectedFingerprint,layoutReview,command})->{confirmedRevision,fingerprint}`；`confirmReports({pool,actor,termId,items,command})->{confirmed,blocked}`，items含每学生revision/fingerprint。`renderPrintableA4({reportData}) -> string`保留现有签名但内部仅使用CORE或LEGACY报告模型。

报告HTML只在reportRenderService生成。草稿API在上述结果另附`html`，已发布API返回冻结`html`；TermReport只用无脚本iframe srcDoc承载同一文档（sandbox允许same-origin测量和modals打印，不允许scripts），按375–430px重排、按A4横向打印。组件在独立的固定打印宽度容器测量溢出，不能拿手机屏幕高度判断能否装进纸页。快照准备时将HTML保存在snapshot_json.renderedHtml，历史打印直接读取，不套用后续模板；HTML中的指纹使用已确认fingerprint，避免自含snapshot_hash造成循环计算。

- [x] **Step 1：写失败测试**。
```js
assert.equal((await buildCompleteDraft()).model.displayFieldCount,109);
await changeOneSource(); await assert.rejects(confirmOldFingerprint(),{statusCode:409});
assert.equal(await managerCanReadDraft(),false);
assert.equal(renderPrintableA4({reportData:xssFixture}).includes('<script>alert'),false);
```
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_drafts.test.js`；浏览器测试先断言旧102位置原型缺7项而失败，不能用静态JSON数量冒充页面覆盖。
- [x] **Step 3：实现合同**：前后端使用同一字段目录；最新PDF劳美成果A/学业星级、故事两列星级必须独立。正面九段文字与开学日期读取草稿模型。前端预览实际检测打印容器溢出，layoutReview绑定templateVersion、fingerprint及检查结果；溢出不确认，提示教师调整文字或由管理员调整模板，不静默裁切或自动改成未经批准的附页。
- [ ] **Step 4：运行GREEN**：后端测试全过；运行`node frontend/tests/report-core-preview.cjs`，检查375/390/430/1440px、109个位置可见、零横向溢出、emoji/长中文、空奖状、双列及两行以上特长。样例明细A4横向1页，完整前后面样例2页；长文fixture必须显示溢出提示并保留原文。检查实际浏览器PDF渲染，不能只查CSS。
- [x] **Step 5：提交**：`git add backend/services/reportCoreEvaluation.js backend/services/reportRenderService.js backend/routes/reportCore.js frontend/src/app/teacher/reportDrafts.jsx frontend/src/app/student/report.jsx frontend/src/app/student/reportPrint.css frontend/src/component/TermReport/index.jsx backend/__tests__/report_core_drafts.test.js frontend/tests/report-core-preview.cjs`；`git commit -m "feat: add complete report preview and confirmation"`。

### Task 10:全校发布、失败恢复与历史阅读

**Files:** Create `backend/services/reportCorePublish.js`、`backend/__tests__/report_core_release.test.js`；Modify `backend/routes/reportCore.js`、`frontend/src/app/admin/reports.jsx`、`frontend/src/app/student/report.jsx`。

**Interfaces:** Consumes T9的buildReportModel/renderPrintableA4；内部准备使用发布清单和已确认宽表，不伪装班主任调用受限草稿API，管理员接口只返回进度。Produces `getReadiness({pool,actor,termId})->Readiness`；`beginRelease({pool,actor,termId,command})->Release`；`prepareReleaseChunk({pool,termId,releaseKey,fence,limit:50})->Release`；`activateRelease({pool,actor,termId,releaseKey,fence,command})->Release`；`resumeRelease({pool,actor,termId,releaseKey,fence,command})->Release`；`cancelRelease({pool,actor,termId,releaseKey,fence,command})->Release`；`getPublishedReport({pool,actor,termId,studentId?,reportId?})->FrozenReport|null`。快照只含该学生报告值及来源ID/版本摘要，不混入全班导入payload、私有文件字节或令牌。

- [x] **Step 1：写失败测试**。
```js
await assert.rejects(beginWithOneMissingStudent(),{statusCode:422});
await prepareThenCrashAtStudent(2); assert.equal(await visibleNewReports(),0);
await resumeAndActivate(); assert.equal(await visibleNewReports(),expectedSchoolCount);
await assert.rejects(oldFencePrepareOrActivate(),{statusCode:409});
```
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_release.test.js`。
- [x] **Step 3：实现合同**：名单由服务端全校宽表和有效学籍产生，缺宽表也阻断。begin独占学期行、冻结清单并推进fence；准备逐份/每50份短事务，重试通过唯一键复用。activate在一个短事务中复核全部清单、将目标PREPARED行设PUBLISHED及published_at，再切换active_release_version。历史查询只读status=PUBLISHED，绝不单凭`release_version<=active`开放失败批次；当前查询按active批次，legacy版0按原个人版本降序读取。
- [x] **Step 4：运行GREEN**：同测试通过，覆盖重试不多生成、终止后旧worker被拒、发布期间六来源/规则/学籍/任教写入423、取消恢复原批次、历史旧报告仍可读、直接猜PREPARED id也不可见、manager正文403、跨校404/403。发布中心不再勾选学生名单。
- [x] **Step 5：提交**：`git add backend/services/reportCorePublish.js backend/__tests__/report_core_release.test.js backend/routes/reportCore.js frontend/src/app/admin/reports.jsx frontend/src/app/student/report.jsx`；`git commit -m "feat: publish school reports atomically with recovery"`。

### Task 11:正式入口整合、旧模块退役与规模验证

**Files:** Modify `backend/app.js`、`backend/routes/api.js`、`backend/package.json`、`backend/__tests__/health.test.js`、`frontend/src/App.jsx`、`frontend/src/constant/urls.js`、`frontend/src/constant/menu.jsx`、`frontend/src/component/StudentLayout/index.jsx`、`frontend/package.json`、`deploy/backend.env.example`、`deploy/ecosystem.config.js`、`backend/Dockerfile`、`frontend/Dockerfile`；Create `backend/__tests__/report_core_bootstrap.test.js`、`backend/__tests__/report_core_performance.test.js`、`frontend/tests/report-core-flow.cjs`、`docs/delivery/report-core/验收清单.md`。

**Interfaces:** Consumes T1–T10。最终`app.js`只挂载reportCore/auth/health；启动`startCoreWorker`而非旧scheduler。保留 `/api/auth/login|logout`，其余已退役业务前缀统一410，不导入旧controller。`backend/package.json`的test基线只跑`report_core_*.test.js`和更新后的health测试；health中旧db.pool/execute/query断言改为createDbPool且导入无DDL，token样例改成合法角色和tokenVersion。旧业务套件移至`backend/__tests__/legacy/`作历史资料，不据它们要求恢复旧表。新浏览器脚本沿用现有PLAYWRIGHT_MODULE或scripts/full-system-demo的Playwright解析方式，预检Node版本/浏览器可用性，输出缺依赖原因；脚本自行启动隔离测试库对应的后端与Vite，退出时关闭，不依赖人工启动中的服务。

- [x] **Step 1：写失败测试**：GET旧growth/kiosk/终测接口明确410；启动和轮询后表名仍恰好六张；从实际UI完成两个班、8个虚构学生的六来源→草稿→全校发布，source API只用只读对账，不用后台SQL替代可见业务动作。
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_bootstrap.test.js`和`node frontend/tests/report-core-flow.cjs`；先证明旧scheduler/旧菜单或旧接口依赖仍在。
- [x] **Step 3：收口实现**：移除旧入口挂载、临时兼容读写和成长主题请求；更新Node运行时版本和环境样例。PM2首版固定1个应用实例，避免多实例叠加供应方并发；外调30s超时、总在途2及三次尝试，数据库pool默认10。评分类故障独立于普通提交，停止服务时释放轮询并让租约可恢复。私有文件、打印密钥与数据库共同备份。
- [x] **Step 4：运行GREEN**：`npm test --prefix backend`、`npm test --prefix frontend`、`npm run build --prefix frontend`、`node frontend/tests/report-core-flow.cjs`；另在专用性能库跑`REPORT_PERF=1 NODE_ENV=test node --test backend/__tests__/report_core_performance.test.js`并记录本节预算，普通测试默认跳过大数据构造。用EXPLAIN检查学生项目、任务领取和发布索引；未达标先修SQL。新校样与完整前后面PDF实际查看无截断。
- [x] **Step 5：提交**：`git add backend/app.js backend/routes/api.js backend/package.json backend/__tests__ frontend/src/App.jsx frontend/src/constant/urls.js frontend/src/constant/menu.jsx frontend/src/component/StudentLayout/index.jsx frontend/package.json deploy/backend.env.example deploy/ecosystem.config.js backend/Dockerfile frontend/Dockerfile frontend/tests/report-core-flow.cjs docs/delivery/report-core/验收清单.md`；`git commit -m "refactor: retire non-report workflows and validate core release"`。

### Task 12:旧库迁移演练、上线与回退

**Files:** Create `backend/scripts/migrateReportCore.js`、`backend/__tests__/report_core_migration.test.js`、`deploy/report-core-cutover.md`、`docs/delivery/report-core/迁移对账.md`；Modify `README.md`、`deploy/deploy.sh`。不得复用旧seed初始化目标库。

**Interfaces:** `migrateReportCore({sourceConnection,targetConnection,mode:'audit'|'apply',schoolId,termIds,assetMap})->MigrationReport`；source只读，target明确新库且不同于source。CLI `--audit`默认不写；`--apply`需指定目标。MigrationReport含counts、warnings、unmapped、checksums和可复跑business_key，不含密码/令牌/正文。

- [x] **Step 1：写失败测试**。
```js
await assert.rejects(migrateWithSameSourceAndTarget(),/different|不同/);
assert.equal((await migrateUnknownSelfPerspective()).inventedValues,0);
assert.equal((await rerunMigration()).duplicateSources,0);
assert.equal(await legacySnapshotHashAfterMigration(),beforeHash);
```
- [x] **Step 2：运行RED**：`NODE_ENV=test node --test backend/__tests__/report_core_migration.test.js`，使用旧schema最小fixture和新6表库，绝不指向真实师生库。
- [x] **Step 3：实现迁移与演练手册**：按users→学期→任教→宽表→来源→报告顺序导入，优先保留原ID/用户名/bcrypt哈希。已定分类且可准确映射的积分才迁入对应项目；不明卡/总分/视角进unmapped，不填默认三星。旧故事只具单一G分，保留原文历史记录，不拆造读听讲；旧版报告原JSON作LEGACY_V1归档，release_version=0、原个人version及发布时间保留。复制私有素材并核对sha256；旧AAD卡先在旧环境解密后以新来源上下文重新加密，无法恢复则列失效/补发名单，不能盲改密文上下文。
- [ ] **Step 4：运行GREEN与上线Gate**：同迁移测试全过；在原库只读副本完成一次审计/应用/复跑，用户数、材料数、原始净积分、有效报告、文件哈希与异常名单逐项对账。上线窗口暂停旧入口写入，完成最终增量重放、校方确认补录名单和评分规则、切换DB_NAME与静态包后冒烟。备份/回退演练通过才切换；绝不在此步骤自动DROP旧库。
- [x] **Step 5：提交**：`git add backend/scripts/migrateReportCore.js backend/__tests__/report_core_migration.test.js deploy/report-core-cutover.md docs/delivery/report-core/迁移对账.md README.md deploy/deploy.sh`；`git commit -m "chore: add audited report-core migration and cutover"`。

回退决策明确：新系统开放写入前可直接回原库/旧包；开放后发现故障先冻结新系统写入并备份差异。不能直接切回旧库丢新材料；默认在新库前向修复。确需回旧系统时，先将新来源增量按清单导回或保留只读新材料入口，由学校确认受影响范围后再开放旧系统。已有发布批次始终保留。

## 计划自检与交付门槛

| 检查 | 结论/对应任务 |
| --- | --- |
| Spec各节覆盖 | 账号/学期T1–T2；六来源T3–T8；报告T9；发布T10；退役/迁移T11–T12 |
| 少表约束 | DDL仅6表；运行时无DDL；幂等/评分队列/日志在来源表；当前草稿在宽表 |
| 数量与规则 | 109位置→97普通评价列+两个数组的12样例位置；37卡、劳美0卡；每月3–9篇；1卡1分 |
| 接口一致性 | 所有写入口通过withMutation；共享StudentKey/Actor/Command；函数名和文件在各Task定义 |
| Review Focus | 五类风险均在所属TDD步骤有明确失败断言，不留“补边界测试”空项 |
| SQL细节 | 字段/唯一键/FK/索引/CHECK/JSON及类型已列；MySQL实际建表与约束验证安排在T1，本计划阶段只做静态核对 |
| 来源真实性 | 真实供应方未联调不宣称自动评分完成；手工异常回退保留方法和理由 |
| 验收与回退 | 真实UI六来源、规模测试、静态/打印校样、只读旧库对账、新写入后不盲回旧库 |

2026-10-28已完成文档静态核对：6个CREATE TABLE、97固定字段/109位置、37卡类别、44旧表逐一去向、14处外键的列类型与引用唯一键、39个不重复约束名、12任务/60复选步骤及7个本地链接均对应。该结果只验证设计文件的一致性，不等同于MySQL成功建表、业务测试或性能达标；这些验证分别属于T1、T2–T10及T11。

计划编制时的交付为设计稿；当前已按文末实施记录完成核心代码及独立六表试运行，原44表库未改造。外部验收/生产切换仍需满足对应门槛。

## 2026-10-28 实施记录

核心实现已提交，三角色/六来源/2班8学生实际浏览器闭环、独立六表MySQL测试、规模与A4双面校样已验证。实现与计划的裁定及外部验收门槛见[执行裁定](../../delivery/report-core/执行裁定.md)，详细证据见[验收清单](../../delivery/report-core/验收清单.md)。LLM供应方账号Arrearage、学校正式正面版式审批、旧素材/卡凭证恢复及生产切换均未宣称完成。最新用户要求按PDF的具体表格排版已纳入实现。
