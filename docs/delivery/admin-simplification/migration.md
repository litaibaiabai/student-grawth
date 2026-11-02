# 正式库迁移记录

目标仅为现有 student_growth，仍为原有八表；此次为 academic_year.evaluation_config 中 semesterCards 的配置/数据迁移，**无新增表、无DDL、无临时数据库**。

2026-11-02 实际先 check：changedTerms=1、blockedTerms=[]；备份后 apply：ready=true、changedTerms=1。旧第一学期标记 LEGACY_LOCKED，新第二学期已经由统一导入配置 DRAFT，随后通过MCP唯一一次初始化为 INITIALIZED。

实际迁移备份：`output/report-core/admin-simplification/backups/student_growth-before-restore-20261102T131923886Z.sql`。SHA256：`3cbec9c8b3b03b74ecb6b1d3c2b36a90825e3679db8558f01fbc3d6fa0cdbd46`。迁移证据在同目录的 `migration-evidence.json`，含前后八表hash；除academic_year配置外，其余七表hash完全相同，旧1515张卡、1张已领卡及历史报告均未改动。历史测试可能生成其他备份并更新 latest.json，恢复应明确选择此文件，不能盲从 latest.json。

迁移入口（Node22，仓库根目录）：

```sh
node backend/scripts/migrateAdminSimplification.js          # check，只读
node backend/scripts/migrateAdminSimplification.js --apply  # 自动先完整备份再迁移
```

重复apply不重发卡、不重复修改。若存在未完成的全校发布，脚本阻止迁移；先核实历史状态，不能把PREPARED当PUBLISHED。运行前应暂停演示/导入写入以取得一致验收证据。

恢复为灾难恢复操作，不属于正常重置功能。本次未执行恢复；如确需恢复，先停止本地服务，保留当前新备份，核对SQL SHA256和文件权限，再由维护者执行 `mysql --defaults-extra-file=/安全路径/mysql.cnf student_growth < /绝对路径/所选备份.sql`。该命令会覆盖备份时点之后的数据，须单独授权。密码放在权限0600配置，不放命令行。不要调用历史临时库种子脚本。

备份及原始导入文件只保存在忽略的本地output目录，不进git。迁移后的正式演示结果仍是一所学校、同一套账号、正常两个学期历史；回滚验收数据全部撤回，未留第二学校或测试表。
