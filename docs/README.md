# 项目文档索引

当前基线为 **feature-six-education-v4**：管理员三个模块、统一工作簿导入、学期卡一次初始化、班主任确认即发布。当前说明优先于历史验收记录。

## 当前设计与使用说明

- [管理员三模块重构设计](superpowers/specs/2026-11-02-admin-simplification-design.md)
- [本轮实施计划（已完成）](superpowers/plans/2026-11-02-admin-simplification.md)
- [完整交付与模块数据流](delivery/admin-simplification/README.md)
- [统一 Excel 字段格式](delivery/admin-simplification/excel-format.md)
- [正式库迁移、备份与恢复](delivery/admin-simplification/migration.md)
- [验证与修复记录](delivery/admin-simplification/verification.md)
- [从空数据演示并还原原库](superpowers/plans/2026-11-02-fresh-demo-restoration.md)
- [三角色鼠标演示实施与验收](superpowers/plans/2026-11-02-three-role-browser-demo.md)
- [MCP 三角色演示脚本](delivery/admin-simplification/mcp-demo.md)
- [管理员四类数据统计](delivery/admin-statistics/README.md)
- [教师综合成绩 Excel 范本](templates/README.md)
- [学生故事录音](delivery/student-story-recordings/README.md)
- [学生写故事验收](delivery/student-written-stories/verification.md)

## 数据与维护资料

- [后端脚本清单与运行方式](../backend/scripts/README.md)

- [六育 V2 字段映射](data/six-education-v2-field-map.json)
- [核心表结构校验契约](database/term-report-core-v1.schema.json)、[V2 校验契约](database/six-education-v2.schema.json)、[班级表校验契约](database/admin-closure.schema.json)：迁移脚本仍使用，保留。
- [错误码](error-codes.md)
- `test-file/`：测试材料；`templates/`：Excel 范本。均保留，不能当作设计草稿删除。

## 历史资料

`delivery/` 中其他目录保留当时的验收、迁移、回退和演示证据，不能直接作为当前操作步骤。旧发布中心、月度制卡、学期配置等功能以当前交付说明为准。

已清理早期设计、已完成的旧计划/审阅稿、旧原型与流程图、Wayfinder 决策草稿，以及16表/竖表等旧数据方案。历史版本可用 `git log -- docs`、`git show <提交>:<路径>` 查阅；不再在 docs 中维护另一套归档副本。
