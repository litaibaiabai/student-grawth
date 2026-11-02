> v4 当前管理员简化流程、迁移与演示见 [新交付文档](../admin-simplification/README.md)。本文保留历史恢复背景；旧发布/配置/操作记录页面及临时库种子流程不适用于当前运行。

# 正式库统一与演示数据还原记录

2026-11-02用户最终决定：不保留两套运行数据；将原正式数据先备份，再按可以演示的数据还原。该要求覆盖此前“保留并合并”的选择。

## 已执行结果

运行库为 `student_growth`，学校1，仍是原来的八张表。没有创建数据库、临时表或新的学校数据分区，没有改动表结构。

| 正式表 | 还原前 | 还原后 |
| --- | ---: | ---: |
| users | 34 | 4 |
| academic_year | 1 | 2 |
| story_content | 100 | 100 |
| teacher_teaching_assignment | 26 | 18 |
| school_class | 2 | 3 |
| evaluation_source_record | 996 | 1621 |
| student_term_evaluation | 32 | 1 |
| term_report | 0 | 1 |

原数据完整备份：`output/report-core/formal-database-migration/backups/student_growth-before-restore-20261102T110217867Z.sql`，1,266,337字节，SHA256为 `c4b37cc1ae1cf5aea6e8ebf290e5a981061d89a7d68c0c01c636a39a1cfef497`。文件权限600，仅保存在本机Git忽略目录。

还原来源为此前已通过完整闭环的虚构演示数据。只复制数据到正式表，不运行dump中的建表语句。原演示库只是本次还原来源，开发服务已不再连接它；未擅自删除其他历史数据库。

## 还原机制与实际验证

`backend/scripts/restoreAdminDemoIntoFormal.js` 默认只读预检。显式 `--apply` 时先生成新备份，再锁定并复核旧数据；全部DELETE和INSERT在同一事务中完成，不使用TRUNCATE、建库或建表语句。外键检查只在该连接上临时关闭，提交前逐一检查全部22组外键并恢复检查；异常整体回滚。

来源比正式表多一个可选生成索引列 `evaluation_source_record.ledger_occurred_utc`。第一次严格整行比较发现此差异并实际回滚；调整后只允许跳过来源额外生成列，任何缺失正式字段或额外存储字段仍拒绝。正式表所有字段逐行一致才提交，微秒日期使用字符串读取，未损失时间精度。

- 八表全部行内容对比通过，22组外键无孤立记录。
- 四账号经19981真实接口登录均为200：`admin`、`teacher_lin`、`teacher_xu`、`20260401`，密码统一为演示密码。
- 学生冻结报告版本1、94个展示位置、数学平时A、跳绳0；四类新统计逐项对账通过。
- 林知行12门真实课程及卡片打印凭证解密读取通过。
- MCP在19981重新登录学生，已查看完整2页发布报告。截图为 `output/report-core/formal-database-migration/formal-db-report.png`。

机器证据：`restore-result.json`、`verification.json`和备份元数据`backups/latest.json`，均在 `output/report-core/formal-database-migration/`。

## 后续启动

```sh
node backend/scripts/runAdminClosureDemo.js
```

默认直接连接现有 `student_growth`，不自动初始化、还原或创建其他库。启动时只检查结构，日常数据操作直接落入正式表。`seedAdminClosureDemo.js` 不再在无明确参数时创建数据库。

如以后确实需要重新还原，先确认当前新增数据也已备份，再运行预检与显式apply；不要将apply放入日常启动命令。

## 本机开发密码查看列

按用户追加要求，正式 `users` 表新增可空的 `password_plain VARCHAR(255)`。原 `password` 列继续保存bcrypt哈希，认证不读取明文列。当前四个演示账号已逐一验证哈希后补入已知密码；未知历史密码不能反解，保持NULL。

```sql
SELECT username, real_name, role, password_plain FROM users;
```

```sh
node backend/scripts/migrateDevelopmentPasswords.js          # 只读检查
node backend/scripts/migrateDevelopmentPasswords.js --apply  # 备份后建立开发列并补已核验演示值
node backend/scripts/verifyDevelopmentPasswords.js            # 正式表内事务验证，最终全部回滚
```

初始化账号、管理员导入和密码重置同步该列。导入预览只保留绑定学校与账号的加密信封，提交时才解密写入用户表；预览响应、登录、/me及审计不返回明文。没有此可选列的旧结构仍能工作。`NODE_ENV=production`禁用明文迁移、预览采集，并在账号密码写入时将该列置NULL。已有明文列与备份仅供本机开发，正式部署前应移除或清空，禁止将其作为生产密码存储方式。

已通过实际初始化、导入、重置、bcrypt登录、/me和审计隐私验证；所有验证数据使用现有正式表的单一事务，最终回滚，未建立任何测试数据库或临时表。
