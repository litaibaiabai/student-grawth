# 学生学期综合素质评价系统｜SPEC V2.0 交付说明

## 交付文件清单

- **[学生学期综合素质评价系统_SPEC_V1.0.md](file:///Users/quanta/Downloads/task/六育学生评价系统v2/spec/学生学期综合素质评价系统_SPEC_V1.0.md)**：已全面升级至 V2.0 规范，包含完整需求规格、业务流程、三角色权限矩阵与业务不变量。
- **[数据库详细设计说明书.md](file:///Users/quanta/Downloads/task/六育学生评价系统v2/spec/数据库详细设计说明书.md)**：16 张表的 ER 关系、业务数据字典、核心状态机与高并发事务伪代码。
- **[sql/00_full_schema.sql](file:///Users/quanta/Downloads/task/六育学生评价系统v2/sql/00_full_schema.sql)**：16 张核心表完整 DDL 建表脚本（MySQL 8.0.16+，包含所有唯一键与外键约束）。
- **[附件A_接口契约与错误码.md](file:///Users/quanta/Downloads/task/六育学生评价系统v2/spec/附件A_接口契约与错误码.md)**：对应 16 表架构的 RESTful 接口清单、报文示例及系统统一业务错误码。
- **[附件B_UAT验收用例.md](file:///Users/quanta/Downloads/task/六育学生评价系统v2/spec/附件B_UAT验收用例.md)**：33 项严格测试用例与 7 项上线阻断性红线标准。
- **[附件C_增量数据结构.md](file:///Users/quanta/Downloads/task/六育学生评价系统v2/spec/附件C_增量数据结构.md)**：16 张表清单与 12 组核心业务唯一约束说明。
- **[附件D_业务决策清单.md](file:///Users/quanta/Downloads/task/六育学生评价系统v2/spec/附件D_业务决策清单.md)**：待校方最终确认的业务参数清单（如 80/15/5 权重试行值等）。

## 核心架构与业务变更要点

1. **表结构高度收敛**：从最初设想的 20 张表收敛至 **16 张核心表**。彻底剔除了学期生命周期表（复用 `academic_year`）、导入暂存表（采用内存解析与 `batch_no` 追溯）、申诉工单表（不涉及前台申诉功能）。
2. **B模式扫卡严格闭环**：实体卡归属教师但不预绑定学生，学生扫码进入待审，教师核准同事务触发加 1 分并置卡为永久失效（`USED`）。
3. **金融级不可篡改记账**：`score_record` 严禁物理 UPDATE/DELETE，正常加分 `+1`，差错纠正 `-1` 冲销流水，`original_id` 唯一约束杜绝二次扣减。
4. **AI赋能与人工兜底**：大模型仅提供评语建议与故事初评参考，正式成绩必须由教师人工核准终审。
