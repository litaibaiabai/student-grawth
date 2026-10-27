# 本轮需求与现状依据

日期：2026-10-27；代码核对基线：`c239a4d`。开始时只有 userReq.md、userAdvice.md 为未跟踪文件。

## 用户直接表达

用户要求使用 wayfinder 与 brainstorming，根据两份材料分析设计系统改造方案；强调区分文档内容与用户本轮请求。

用户确认的验收目标原话：“减少老师操作、简化积分流程、重新设计学生端、自动生成学期报告。”用户也同意展示学生端和报告草图。

以上确认不覆盖具体权重、设备、家长身份或数据迁移选择。当前没有授权实施产品改造。

## 输入与证据等级

1. [需求清单](../../../userReq.md)：36 项功能方向及 10 项开发前待确认事项。
2. [报告建议稿](../../../userAdvice.md)：建议内容，不是已确认校规；未独立取得其描述的原 Word/XLS。
3. [路由](../../../backend/routes/api.js)、[卡片](../../../backend/controllers/cardController.js)、[积分](../../../backend/controllers/scoreController.js)、[荣誉](../../../backend/controllers/honorController.js)、[故事](../../../backend/controllers/storyController.js)、[导入](../../../backend/controllers/importController.js)、[批量服务](../../../backend/services/batchImportService.js)、[核算](../../../backend/services/evaluationEngine.js)、[报告](../../../backend/controllers/reportController.js)、[范围校验](../../../backend/middleware/studentScope.js)、[表结构](../../../sql/00_full_schema.sql)及[菜单](../../../frontend/src/constant/menu.jsx)：本轮静态核对来源。
4. [旧发卡地图](../subject-card-issuance/map.md)：历史决策依据。新需求明确改变扫码审核及定类时点，旧地图保留历史，不静默改写其决策。

## 已发现的关键冲突

- 当前新卡只有方向，分类在审核时选；新需求只发 D/Z，并要求制卡定类、扫卡直接入账。
- 当前只有管理员可冲销；新需求要求教师自行纠错，管理员退出逐笔处理。
- 当前教师主要按班级授权；新需求要求班级与学科同时匹配，班主任职责需另建明确授权。
- 当前六育主要依赖手工导入终测，再叠加过程/荣誉；新需求要求来源自动形成六育，须避免双重计分。
- 已有报告快照和 family_message 字段不等于已有教师确认、家长真实填写及管理员只看状态的流程。
- userAdvice 中示例 `DE/ZHI/.../STORY` 与仓库 `D/Z/T/M/L/G` 不一致；方案沿用仓库编码，显示名与外部字段通过显式映射处理。

## 术语对齐

“卡型”指日常奖励卡的 D/Z 两种；“六育维度”仍有 D/Z/T/M/L/G 六项。“来源分”是积分或评价原始事实，“维度结果”是规则生成结果，“展示等级”是面向报告的表达。“游戏成长等级”仅为体验层激励，不能自动等同学校评价等级。

## 资产

- [功能规格（to-spec）](spec.md)：已发布到本地问题跟踪器，标注 ready-for-agent，保留开放决策依赖。
- [改造方案评审草案](../../superpowers/specs/2026-10-27-system-renovation-design.md)
- [逐项需求追踪](requirements.md)
- [系统改造决策地图](map.md)
- [可点击讨论草图](prototype.html)：虚构数据，浏览器可切换首页、成长足迹、学期报告和主题。
- [独立审阅与本轮校验](review.md)

当前只做本仓库内调查，不需要外部研究票；没有向远程跟踪器、学校或其他聊天发送信息。

## 规格编制补充确认

2026-10-27，用户调用 to-spec，要求从当前讨论综合规格；没有新增业务规则答案。

用户对测试边界的确认原话：“符合，按此写入规格”。对应提案为：以三角色真实浏览器端到端流程为主要验收边界，沿用独立测试库；仅对并发兑换、越权请求和发布事务补充真实 API／数据库集成测试。
