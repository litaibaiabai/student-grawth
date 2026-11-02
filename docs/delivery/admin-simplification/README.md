# 管理员简化交付（v4）

管理员仅保留三个模块，沿用师生端现有色彩、导航、表格及报告组件。

| 模块 | 职责 | 数据流 |
|---|---|---|
| 学籍账号管理 | 下载五表模板、整单预览/确认导入；只读查询学生、教师、班级关系 | 写 academic_year、users、school_class、teacher_teaching_assignment、student_term_evaluation；导入凭据与审计保存在 evaluation_source_record。教师权限与学生学籍读取同一份关系 |
| 卡额度管理 | 默认100、各学科覆盖值、0不生成；按每班每学科学期一次初始化 | semesterCards 配置保存在 academic_year.evaluation_config；课程配额及二维码写 evaluation_source_record，教师只读预览/打印，学生领取后投影到评价表 |
| 数据统计 | 保留卡片与奖励、自我评价、荣誉上传、故事参与四类统计 | 从有效来源事实和学生评价读模型统计；搜索仅过滤明细，概览口径不变 |

班主任确认把单名学生的当前评价和完整冻结文档原子写入 term_report，学生立即读取本人最新 PUBLISHED 快照。无需管理员发布、全校冻结或全校版本切换。后续更正使当前数据待确认，旧快照继续可读；班主任从已发布页点击“核对当前数据”，重新确认生成新版本。

学期卡额度以课程为单位：同一教师三个班各教语文，60×3=180张。初始化成功后额度和关系锁定；没有重置、删除、自动月度发卡功能。失败回滚可重试，同一请求返回原结果。旧月卡只读汇总为学期，不增发。

主要接口（均位于 `/api/v1`）：

- `/admin/report-core/registry/{template,columns,preview,commit,relations}`：管理员整单导入和关系查询。
- `/admin/report-core/semester-card-settings`：读取、保存未初始化额度；`/admin/report-core/semester-cards/initialize`：一次性初始化。
- 教师继续使用 `/report-core/course-cards` 系列接口，参数按学期、班级、学科；无月份和同步写入。
- `/report-core/reports/confirm`：班主任确认即发布；学生 `/report-core/reports/current` 和报告打印读取最新已发布快照。
- 统计接口和四页业务口径保留。

运行时已删除发布中心、学期配置、操作记录、旧学籍维护、班级手工编辑及旧月度卡额度页面，以及相应路由/服务/样式/导航引用。旧 API 进入应用既有的 **410 Gone** 退役响应，不再执行写入。历史验收证据保留。后续按用户要求清理了失效种子、旧演示库还原和重复验证脚本及其四个专用旧测试入口；有效迁移、通用SQL备份恢复及当前安全回归保留，详见[后端脚本清单](../../../backend/scripts/README.md)。

交付说明：[Excel格式](excel-format.md)、[迁移与恢复](migration.md)、[验证记录](verification.md)、[MCP演示脚本](mcp-demo.md)。完整代码已在 feature-six-education-v4 分支，本文档不重复粘贴整个仓库。
