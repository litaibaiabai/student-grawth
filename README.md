# 云美少年 · 学校期末六育报告

React 18 / Vite、Express、MySQL 8。核心业务为六类数据采集 → 学生学期评价宽表 → 班主任核对 → 全校统一发布 → 学生阅读、打印。数据库仅保留六张核心业务表；不会启动旧系统scheduler或执行旧库建表脚本。

## 三个角色

| 角色 | 当前主导航 | 高频操作 |
| --- | --- | --- |
| 学生 | 首页、月度故事、我的档案 | 领卡、上传奖状、每月读听讲各1–3篇文本、点星自评及七段自述、阅读已发布报告 |
| 教师 | 工作台、评价录入、卡片管理、班级报告 | 单页多选直评、学业录入、材料认定、采集结算、卡台账及分班制卡、负责班级报告 |
| 管理员 | 发布中心、学籍与账号、体测原始值、月度卡额度、学期配置 | 模板与差异导入、原子批量额度、职责/规则预览确认、全校发布 |

六类来源：卡生成（直评/扫码）、外部导入、奖状、自评、教师评价、月度故事评分。每张卡/每次直评1分，劳美不发卡；37种卡叶指标沿固定口径。自评与他评分别存储，不能互相覆盖。报告沿学校PDF六板块与109个呈现位置，明细/完整范围按权限区分；合法超长内容完整进入带姓名页码的续页，打印面板可另存PDF。

## 本地运行

Node **22.12+**、MySQL 8；先按[切换指引](deploy/report-core-cutover.md)准备独立报告库和最小权限账号。环境变量参考[后端示例](deploy/backend.env.example)，密钥只在本机环境配置，不提交文件。

```sh
npm --prefix backend ci
npm --prefix frontend ci
# 默认只检查指定REPORT_DB_NAME，绝不自动建旧库/seed
npm --prefix backend run migrate
# 仅在备份并确认安全新库后显式初始化空schema
npm --prefix backend run migrate -- --apply
# 全新学校初始化：先设置CORE_BOOTSTRAP_PASSWORD与SCHOOL_ID
node backend/scripts/initReportCore.js
npm --prefix backend start
# 另一个终端，VITE_API_TARGET指向实际后端端口
npm --prefix frontend run dev
```

`REPORT_DB_NAME`必须是独立`liuyu_report_test/pilot/prod...`库；不能指向旧库。已有学校切换先运行`node backend/scripts/migrateReportCore.js`只读audit，再审核映射与备份；不得把初始化当升级脚本。学年/起止日期和模板在学期配置页只读，首次学校建档按初始化配置完成。

## 验证

```sh
npm --prefix backend test
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:report-core
npm --prefix frontend run test:report-core-ledger
npm --prefix frontend run test:report-core-reports
npm --prefix frontend run test:report-core-admin
npm --prefix frontend run test:report-core-preview
```

浏览器测试使用独立`liuyu_report_test_*`库并清理，运行环境需Playwright/Chrome、MySQL、Poppler（PDF核对）。截图、PDF和机器可读验收证据放在Git忽略的`output/report-core`。不使用真实学校数据作测试夹具，也不把付费线上LLM当自动化依赖；provider测试与人工异常复核不等于线上模型已验收。

## 运行边界与资料

- 扫码通过浏览器收到链接或手动粘贴凭证；相机SDK、钉钉单点登录不作为已实现能力。
- 教师每月计划制卡后班级与方向锁定，追加额度不自动解锁旧计划。
- 导出报告为HTML打印/另存PDF；没有独立Word/Excel报告导出。卡PDF按班打包，台账CSV/打印与可领取原卡分开。
- 学期配置采用差异预览与版本/影响集合校验；日期或汇总规则更改不重调LLM。真实量规版本单独管理。
- 发布按全校一次激活，准备中学生仍只读上个已发布版本；已发布内容冻结。管理员发布中心不读取学生私有正文。
- [实施计划](docs/superpowers/plans/2026-10-29-role-ux-and-report-management.md)、[清理清单](docs/delivery/role-ux/cleanup-manifest.md)、[核心切换与回退](deploy/report-core-cutover.md)、[六表schema](sql/05_term_report_core_schema.sql)。
- 其他SQL与旧交付说明作为迁移参考/历史存档保留；旧商城、设备/家长端、自动配卡策略和旧演示脚本已退役，不属于当前运行入口。

本分支改造不自动部署、不合并、不删除旧库或用户上传。完整放行以本轮验收记录与学校切换演练为准。

## 容器构建

`docker build -f backend/Dockerfile .`使用仓库根上下文，将前端构建产物放到Express实际托管的`/app/frontend/dist`，同时包含核心SQL/schema校验资料和中文打印字体。镜像启动不自动迁移、seed或切换数据库；生产变量与私有材料卷仍按切换指引配置。本轮本地Express静态包验证与容器构建验证分别记录，不互相代替。

来源表台账覆盖索引升级：`node backend/scripts/upgradeCoreLedgerIndex.js`默认只检查指定REPORT_DB_NAME；明确`--apply`才执行可重入DDL。仅在备份及维护窗口内运行，不能把默认check当升级。旧库未升级时台账保持精确回退，性能较慢。

新增输入边界验收：`npm --prefix frontend run test:report-core-inputs`。特长教师评价在“评价录入→采集结算”；按已认定项目分别填写，学生自评另行保存。全校发布最后需核对学期、人数和版本。
