# 当前八表系统的部署检查与回退

当前运行基线为现有 `student_growth` 八表和六育V2。管理员三个模块，班主任确认单名学生即发布；不再使用旧六表初始化、旧库搬迁或管理员统一发布流程。

## 部署前检查

1. 备份数据库、私有材料目录、现用打印/加密密钥及部署配置，记录SQL备份SHA256。新环境使用已核验的八表SQL备份恢复；旧V1初始化和旧库搬迁脚本已退役，不再用于建立新环境。
2. 使用Node22.12+，配置 `REPORT_DB_NAME=student_growth`、实际 `SCHOOL_ID`、数据库连接、鉴权及打印密钥、私有材料持久卷。密钥不提交到Git。
3. 在暂停业务写入的维护窗口内，先只读核对结构和当前配置迁移状态：

```sh
REPORT_DB_NAME=student_growth node backend/scripts/runCoreMigrations.js
node backend/scripts/migrateAdminSimplification.js
```

结构检查不等于执行迁移。配置迁移若确有待办，按[迁移说明](../docs/delivery/admin-simplification/migration.md)先备份，再显式应用；不要把apply放入日常启动命令。当前已完成的旧成绩升级和开发密码列补建不再提供重复执行入口。

4. 核对来源事实与私有附件，可逐学期执行只读资产审计：

```sh
REPORT_DB_NAME=student_growth SCHOOL_ID=1 MIGRATE_TERM_IDS=1 node backend/scripts/migrateSixEducationV2.js --audit-sources
```

此命令仍然有效，使用独立的来源/附件核验服务。`MIGRATE_TERM_IDS`在该入口填写单个学期ID；文件根目录按实际 `REPORT_FILES_DIR` 配置。缺文件、哈希不符或未经明确映射的旧事实不能推测成新成绩。

5. 构建前端并按现有部署方式启动后端。生产环境不启用本地演示时钟；核对三角色权限、本人报告读取、卡片归属、附件访问及历史发布快照。测试与MCP验收方式见[验证记录](../docs/delivery/admin-simplification/verification.md)。

## 数据保全与回退

停止原实例写入后保留数据库与材料备份。开放新版本写入后，如需回退，应先停止新增写入并保存当前数据库、文件和新增事实，优先前向修复。确需从SQL备份恢复时，按[恢复说明](../docs/delivery/admin-simplification/migration.md)核对备份版本与密钥，并保全备份时点后的数据；不能直接切回旧库丢失新增记录。

源事实、幂等记录、已领卡和已发布报告均需保留。PREPARED快照不得作为已发布报告向学生开放，旧历史报告也不原地重绘。

全部有效脚本及用途见[后端脚本清单](../backend/scripts/README.md)。本说明不执行部署、数据恢复或新库创建。
