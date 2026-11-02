# 后端脚本入口

从项目根目录运行，使用Node22。日常开发/演示使用现有 `student_growth`。服务启动器不seed；空库演示入口会先备份、清理业务数据，结束后还原。按用途选入口，不能把迁移、初始化或素材生成当作演示启动。

## 日常启动与验收

| 文件 | 用途 | 项目根目录命令 |
|---|---|---|
| runFreshThreeRoleDemo.js | 从空业务数据进行三角色鼠标演示，结束后还原原库 | `npm --prefix backend run demo:browser` |
| runThreeRoleDemo.js | 内部浏览器步骤运行器，也可显式回放已有结果 | `npm --prefix backend run demo:replay` |
| runAdminClosureDemo.js | 同时启动本地前后端，页面19981、API19980 | `node backend/scripts/runAdminClosureDemo.js` |
| verifyAdminSimplification.js | 当前v4完整闭环验收；使用正式表外层事务回滚并检查八表hash，不启动页面 | `node backend/scripts/verifyAdminSimplification.js` |

### 从空数据演示并还原原库

项目根目录使用Node22、本机Google Chrome、MySQL客户端（mysql、mysqldump）及ffmpeg。首次安装依赖和录像编码器：

```sh
npm --prefix backend ci --include=dev
npm --prefix frontend ci
node backend/node_modules/playwright/cli.js install ffmpeg
```

运行：

```sh
npm --prefix backend run demo:browser
# 可调整鼠标步骤停留时间或端口
npm --prefix backend run demo:browser -- --step-delay 2000 --api-port 21080 --web-port 21081
```

该命令每次都执行完整流程，**不会自动改成已有结果回放**。它操作现有正式库student_growth，在维护期间暂停其他业务写入：

1. 获取数据库互斥锁，完整SQL备份，记录八表hash，并验证备份期间没有写入变化。
2. 清空原业务数据，仅保留管理员与100篇内置故事。验证教师、学生、学期、班级、关系、卡片、评价及报告均为0。
3. 打开可见Chrome，管理员现场核对空态，上传Excel新建师生和学期关系；配置额度并一次初始化1515张卡。
4. 两教师操作课程卡、直评和成绩；学生点击扫一扫、填自评、完整听故事、写故事、录音上传讲故事、上传奖状；教师评审、寄语、结算及确认发布；学生读取报告并验证更正后的第二版；管理员核对四类统计。
5. 演示结束自动关闭本次Chrome和服务，**还原原SQL备份并逐表比较八表hash**。失败或Ctrl+C同样还原；不会把演示数据留在原库。

自动演示的摄像头使用教师页面真实二维码的虚拟视频输入，经过系统摄像头画面识别；麦克风使用内置虚构故事音频的虚拟输入，经过页面MediaRecorder录音和保存上传。字幕明确标注虚拟素材，不通过API/SQL伪造扫码或故事结果。只要求本机存在可登录的管理员，不要求原库预先有教师或学生；师生初始密码在内存中随机生成，清理后通过私有Excel的初始密码字段创建师生；密码不写日志或JSON报告，输入文件和二维码只保存本机私有输出。

`output/report-core/fresh-three-role-demo/<时间>/lifecycle.json`记录SQL备份、空态计数、演示报告路径、前后hash与`restored`结果；步骤截图、WebM录像、工作簿在关联的浏览器报告目录。默认完整学期2027–2028第一学期；因每次开始清空、结束还原，相同命令可重复完整演示。互斥锁阻止两个演示同时清库；不建立临时数据库或表。

强制结束进程（SIGKILL）、断电无法执行finally；此时用lifecycle.json中完整SQL备份恢复，恢复方法见迁移说明。普通Ctrl+C由运行器接管，还原子进程隔离终端信号，等待恢复完成后退出。

已有结果回放独立为`npm --prefix backend run demo:replay -- --academic-year 2027-2028 --semester 1 --exit-after`，只用于明确查看历史结果，不是完整闭环验收。原服务启动器只启动服务，不操作浏览器、不清理或还原数据。

全部安全回归：`npm --prefix backend run test:admin-simplification`。只核对账号导入、密码保持及隐私边界时：`node --test backend/__tests__/admin_simplification_registry.test.js`。验收期间暂停其他业务写入，避免真实操作干扰回滚前后的hash比较。历史默认测试集合可能建临时库，不用于当前开发验收。

需要继续演示未来学期的领卡、听故事时，显式启动演示时钟：

```sh
ADMIN_DEMO_NOW=2027-02-15T00:00:00.000Z node backend/scripts/runAdminClosureDemo.js
```

页面会显示演示日期，默认关闭且production禁止。`Ctrl+C`停止。启动不自动操作浏览器，角色切换与每步预期见[三角色演示脚本](../../docs/delivery/admin-simplification/mcp-demo.md)。

## 迁移与维护

以下工具保留用于结构检查、版本升级及维护，不在本次整理中执行写入。除特别说明外默认check/audit，显式`--apply`才写入；运行前核对文件中的目标库约束、备份与维护窗口。

| 文件 | 职责与使用边界 |
|---|---|
| runCoreMigrations.js | 启动器和正式服务使用的核心表结构检查；`REPORT_DB_NAME`指定库，`--apply`仅用于相应结构初始化。含时间契约切换维护选项 |
| migrateAdminSimplification.js | 当前v4的semesterCards配置迁移，固定正式库student_growth；`node backend/scripts/migrateAdminSimplification.js`只读检查，`--apply`先备份 |
| migrateSixEducationV2.js | 六育V2结构检查/升级，核心检查器仍调用；另有来源资产审计入口，调用独立的reportCoreSourceAudit服务 |
| migrateAdminClasses.js | school_class及相关职责数据约束检查，核心检查器仍调用 |
| upgradeCoreLedgerIndex.js | 可选台账索引升级；目标库受脚本安全规则限制，不能把旧索引升级当正常启动 |
| buildBuiltinStoryAudio.js | macOS素材制作工具，依赖`say`、ffmpeg、ffprobe；重生成100篇内置故事音频及catalog，会覆盖素材，不是启动前置步骤 |

仍在使用的来源及附件核验已独立保存在 `backend/services/reportCoreSourceAudit.js`，由V2检查器的`--audit-sources`入口调用，不再依赖旧库搬迁脚本。

数据库备份实现保留在 `backend/services/formalDatabaseBackup.js`，当前迁移仍调用。恢复使用SQL备份，见[迁移与恢复说明](../../docs/delivery/admin-simplification/migration.md)，不依赖已删除的旧演示库。

## 内部辅助模块

下面三个文件供其他脚本或当前测试导入，不是独立CLI：

- `adminSimplificationFixtures.js`：统一五表及两教师成绩工作簿生成。
- `adminClosureFixtures.js`：仍被当前闭环使用的60教师字段、11自评及14过程项目数据。
- `localDemoClock.js`：本地演示时钟，默认关闭、production拒绝。

## 已清理的旧入口

- 四个旧种子：`seedAdminClosureDemo.js`、`seedCourseCardFixtures.js`、`seedClassUiFixtures.js`、`seedAwardReviewFixtures.js`。分别依赖临时演示库、已删除的月度同步接口或旧演示账号/99班数据。
- `restoreAdminDemoIntoFormal.js`：来源库硬编码为已删除的旧演示库，已失效；通用SQL备份恢复能力保留。
- `verifyDevelopmentPasswords.js`：只是转调当前学籍回归的重复包装，改用上面的定向测试命令。
- 同步删除四个完全依赖旧种子的专用旧入口：后端`report_core_course_card_fixtures.test.js`，前端`admin-closure.cjs`、`admin-closure-flow.cjs`、`course-cards.cjs`。当前学籍、学期卡、授权、幂等、隐私和发布回归保留在`admin_simplification_*`安全集合。

后续已清理：`initReportCore.js`（旧V1建校/演示初始化）、`migrateReportCore.js`（旧库搬迁）、`upgradeScoreInputV2.js`（已完成的旧成绩升级）、`migrateDevelopmentPasswords.js`（已完成的开发列补建）。同步删除两个专用V1回归文件`report_core_bootstrap.test.js`、`report_core_migration.test.js`及过时的`backend/docs/api.md`。现有八表结构检查、当前配置迁移、可选台账索引、音频素材制作和当前闭环辅助模块仍然使用，保留。

删除仅涉及代码文件，不执行数据库删除、迁移、还原或重新初始化；旧源代码可从Git历史查阅。
