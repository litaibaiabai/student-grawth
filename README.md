# 云美少年 · 学校期末六育报告

React 18 / Vite、Express、MySQL 8。当前流程：统一 Excel 导入学期及师生关系 → 一次初始化学期积分卡 → 师生日常记录与成绩采集 → 班主任核对确认 → 学生阅读、打印报告。

开发和演示统一使用 `student_growth` 原有八张正式表，不创建临时库、临时表或第二套学校数据。完整资料见 [文档索引](docs/README.md)。

## 三个角色

| 角色 | 主导航 | 业务 |
|---|---|---|
| 学生 | 领取积分、云美故事、上传奖状、自我评价、六育报告 | 领卡、听写讲故事、荣誉申报、自评、读取本人最新发布报告 |
| 教师 | 无卡直拼、评审获奖、综合成绩、班主任寄语、六域综合情况、积分卡管理 | 日常直评、材料认定、成绩及体测Excel导入、过程结算、寄语审核、报告确认、学期卡预览打印 |
| 管理员 | 学籍账号管理、卡额度管理、数据统计 | 五表工作簿原子导入、只读关系查询、学科额度配置及一次初始化、四类统计 |

学期卡按班级与学科计算：语文60张、同一教师三个班，共180张。默认100张，空白继承默认，0不生成；成功初始化后不可重置或修改。教师只读取、打印已生成卡片，不按月份重复生成。

班主任确认单名学生后即发布，无需管理员统一发布。学生读取94字段、两页的冻结报告；更正当前数据不覆盖上一发布快照，再次确认生成新版本。历史冻结报告保持可读。

## 代码结构

- `frontend/src/app/core/`：登录、API、导航、角色外壳及共享交互。
- `frontend/src/app/student/`、`teacher/`、`manager/`：按角色与业务组织页面和模型；管理员仅保留 roster、quota、statistics。
- `frontend/src/component/TermReport/`：报告阅读、版面核对与打印。
- `backend/routes/`、`backend/services/`：API、授权、统一导入、来源事实、评价投影、发布快照及统计。
- [backend/scripts/](backend/scripts/README.md)：启动、迁移与验证工具的用途及运行命令。
- `docs/database/`：迁移仍使用的表结构校验契约；`sql/`：历史迁移脚本。

## 本地运行

Node **22.12+**（项目 `.nvmrc` 为22.16.0）、MySQL 8。安装依赖：

```sh
npm --prefix backend ci
npm --prefix frontend ci
node backend/scripts/runAdminClosureDemo.js
```

访问 `http://localhost:19981`，API绑定127.0.0.1:19980。默认启动不seed、不还原数据，也不启用演示时钟；现有环境变量和凭证只保存在本机。迁移、备份及恢复说明见 [正式库迁移](docs/delivery/admin-simplification/migration.md)。

分别启动前后端时，前端 `.env` 的 `VITE_API_TARGET` 应与后端端口一致；可参考 `frontend/.env.example` 与 `deploy/backend.env.example`。修改代理配置后需重启Vite。出现找不到Vite时，在前端目录执行 `nvm use`、`npm ci --include=dev`；不需要全局安装Vite。

## 验证

```sh
npm --prefix backend run test:admin-simplification
node backend/scripts/verifyAdminSimplification.js
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

后端安全验收在正式表外层事务中执行并回滚，比较八表存储行hash。运行时暂停其他演示写入，避免真实行为与回滚校验互相干扰。历史默认后端测试及旧浏览器测试可能创建临时库，不用于当前验收。结果与问题修复见 [验证记录](docs/delivery/admin-simplification/verification.md)。

## 使用与维护资料

- [Excel字段要求](docs/delivery/admin-simplification/excel-format.md)：一份工作簿完成学期、教师、班级、学生、任教关系导入。
- [教师成绩范本](docs/templates/README.md)：成绩60字段及体测原始值由教师上传。
- 一键三角色鼠标演示：`npm --prefix backend run demo:browser`（备份→清空师生与业务数据→可见Chrome三角色完整操作→还原原库，自带截图和录像）。
- [MCP三角色演示](docs/delivery/admin-simplification/mcp-demo.md)：每步操作与预期结果；已初始化学期只查看结果，不再次初始化。
- [管理员数据统计](docs/delivery/admin-statistics/README.md)：卡片与奖励、自我评价、荣誉上传、故事参与。

截图、二维码、备份和测试素材保存在Git忽略的 `output/`，不提交凭证或私有材料。已退役设计从docs清理，历史验收和迁移记录保留供追溯；失效种子与演示库还原入口已清理，SQL备份恢复能力保留。

## 容器构建

`docker build -f backend/Dockerfile .` 使用仓库根上下文。镜像启动不自动迁移、seed或切换数据库；生产环境与私有材料卷按部署配置维护。本地构建验证与实际部署分别记录。
