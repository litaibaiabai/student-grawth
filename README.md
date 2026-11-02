# 云美少年 · 学校期末六育报告

React 18 / Vite、Express、MySQL 8。核心业务为六类数据采集 → 学生学期评价宽表 → 班主任核对 → 全校统一发布 → 学生阅读、打印。数据库仅保留六张核心业务表；不会启动旧系统scheduler或执行旧库建表脚本。

## 三个角色

| 角色 | 当前主导航 | 高频操作 |
| --- | --- | --- |
| 学生 | 首页、月度故事、我的档案 | 领卡、上传奖状、每月读听讲各1–3篇文本、点星自评及七段自述、阅读已发布报告 |
| 教师 | 工作台、评价录入、卡片管理、班级报告 | 单页多选直评、学业录入、材料认定、采集结算、卡台账及分班制卡、负责班级报告 |
| 管理员 | 发布中心、学籍与账号、体测原始值、月度卡额度、学期配置 | 模板与差异导入、原子批量额度、职责/规则预览确认、全校发布 |

六类来源：卡生成（直评/扫码）、外部导入、奖状、自评、教师评价、月度故事评分。每张卡/每次直评1分，劳美不发卡；37种卡叶指标沿固定口径。自评与他评分别存储，不能互相覆盖。报告沿学校PDF六板块与109个呈现位置，明细/完整范围按权限区分；合法超长内容完整进入带姓名页码的续页，打印面板可另存PDF。

## 前端模块架构与目录结构

前端应用核心源码位于 `frontend/src/app`，遵循**按角色与菜单层级封装为独立模块对象**的架构设计，彻底解耦原有单文件夹平铺模式。

### 目录分层结构

```
frontend/src/app/
├── index.jsx                  # 主应用入口：组装各角色模块，负责顶层登录、角色切换与全局状态
├── core/                      # [核心基建] 跨业务通用的底层基础设施
│   ├── api.js & api.test.js   # API 客户端、请求幂等、重试与网络状态处理
│   ├── navigation.js & test   # 角色菜单定义、路由契约与 URL hash 编解码
│   ├── RoleShell.jsx          # 应用主外壳、顶部操作栏与响应式侧边导航
│   ├── ui.jsx                 # 通用基础 UI（星级组件 StarPicker、确认框、草稿离开保护）
│   ├── illustrations.jsx      # 图标与吉祥物组件（UIIcon, CloudMascot）
│   ├── materialStatus.js      # 数据源与材料状态文案映射
│   ├── style.css, tokens.css  # 设计系统设计令牌与全局基础样式
│   └── v2Model.test.js 等     # 六育评价计算与报表核心模型算法测试
├── shared/                    # [共享业务] 跨角色复用的业务级组件
│   ├── index.js               # 共享业务组件导出
│   ├── classics/              # 经典故事展厅组件 (V2Classics)
│   └── materials/             # 材料历史流水与数据源列表 (SourceList)
├── student/                   # [学生端模块] 封装为 StudentModule & StudentView
│   ├── index.jsx              # 学生端对象装配与子路由分发器
│   ├── home/                  # 首页概览与我的档案 (StudentHome, StudentArchive)
│   ├── self/                  # 自我评价：星级自评、七段自述及模型校验
│   ├── awards/                # 奖状申报：奖状图片上传与自动识别
│   ├── cards/                 # 扫卡领分：实体卡二维码核销与积分领取
│   ├── stories/               # 故事生成：学期故事申报、活动记录与月份校验
│   └── report/                # 期末报告：已发布的六育综合评价报告阅读与打印
├── teacher/                   # [教师端模块] 封装为 TeacherModule & TeacherView
│   ├── index.jsx              # 教师端对象装配与子路由分发器
│   ├── workspace/             # 教师工作台：任务总览与待办分发
│   ├── direct/                # 评价录入/现场直评：单页多选直评与特长评价打分
│   ├── imports/               # 综合成绩导入：学科成绩/考勤批量 Excel 导入
│   ├── reviews/               # 评审获奖：学生申报奖状与故事活动审核
│   ├── comments/              # 学期寄语：班主任寄语评语撰写
│   ├── cards/                 # 卡片管理：卡片流水台账与分班制卡打印计划
│   └── reports/               # 班级报告与采集结算：六育草稿汇总与审核
├── manager/                   # [管理员模块] 封装为 ManagerModule & ManagerView
│   ├── index.jsx              # 管理员端对象装配与子路由分发器
│   ├── releases/              # 发布中心：全校发布流程与评价运行态管理
│   ├── roster/                # 学籍与账号：班级名单、账号生成与批量导入
│   ├── health/                # 体测原始值：学生体质健康数据录入与核对
│   ├── quota/                 # 月度卡额度：各学科教师卡片额度批量划拨
│   └── config/                # 学期配置：学期生命周期、指标规则与权重配置
└── reportCore/                # [兼容层]
    └── index.jsx              # 向下兼容导出代理，保证遗留路径透明映射
```

### 模块对象化封装契约

每个角色目录下的 `index.jsx` 将其所有菜单层级视图与模型聚合封装为一个具名对象（Module）与路由分发组件（View），例如学生端模块：

```javascript
// frontend/src/app/student/index.jsx
export const StudentModule = {
  name: "student",
  views: {
    home: StudentHome,
    archive: StudentArchive,
    self: SelfEvaluationView,
    awards: AwardUploadView,
    cards: CardsView,
    stories: StoriesView,
    report: PublishedReport,
  },
  models: { selfEvaluation: selfEvaluationModel, storyText },
};
export function StudentView({ tab, ctx }) { ... }
```

主入口 `frontend/src/app/index.jsx` 直接聚合各角色模块（`StudentView`, `TeacherView`, `ManagerView`），职责清晰，各菜单代码自包含，新增或调整页面时只需在对应角色目录下增改。


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

前端开发前将 `frontend/.env.example` 复制为 `frontend/.env`，设置 `VITE_API_TARGET=http://127.0.0.1:后端端口`，与 `backend/.env` 的 `PORT` 一致。Vite会读取该变量；旧 `VITE_API_SERVER` 不配置开发代理。若终端出现 `http proxy error / ECONNREFUSED`，先检查后端是否运行和两侧端口是否一致。修改 `.env` 后重启前端开发服务。

`REPORT_DB_NAME=student_growth` 为当前正式库名，管理员闭环版本使用现有八张业务表；启动时会核验并拒绝旧44表或不完整结构。隔离测试仍使用 `liuyu_report_test_*` 临时库，测试结束后清理。已有学校切换先运行`node backend/scripts/migrateReportCore.js`只读audit，再审核映射与备份；不得把初始化当升级脚本。学年/起止日期和模板在学期配置页只读，首次学校建档按初始化配置完成。

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


## yarn dev 找不到 Vite 时

请进入实际前端目录，使用项目锁定的Node22。前端的Vite属于开发依赖；仅安装生产依赖不会安装Vite。项目使用package-lock.json，恢复依赖用npm ci，启动可继续用yarn dev，无需全局安装Vite。

```sh
cd "/Users/quanta/Downloads/task/六育学生评价系统v2/frontend"
# 若当前终端尚未加载nvm，先执行：source ~/.nvm/nvm.sh
nvm use
# 依赖缺失时执行；包括Vite等开发依赖
npm ci --include=dev
yarn dev
```

项目根和frontend均有.nvmrc（22.16.0）。在已经打开的终端中仍需执行nvm use；.nvmrc本身不会自动修改当前shell的Node版本。默认开发端口5173若已运行本项目，可直接打开页面，不必重复启动。

## 学生写故事（六育 V2）

进入“故事生成”选择“写故事”，直接输入正文并递交，或点击“上传故事”选择 PDF、DOC、DOCX 文件，文档会自动解析并提交。正文最多 20000 字，文档最多 10MB；PDF 需要包含可读取文字，扫描图片版请先识别为文字。历史列表展示本学期本人作品，点击可阅读完整正文。

学校排名按本学期成功提交的故事篇数计算，篇数相同并列；提交后自动刷新。沿用 V2 来源记录与学期统计，不增加业务表，不依赖模型评分。采集截止后仍可阅读历史；同一网络请求重试不会重复计数。

新增解析依赖通过 `npm --prefix backend ci` 安装，后端需要 Node 22.12+。专项验收：

```sh
node --test backend/__tests__/report_core_written_stories.test.js
npm --prefix frontend run test:student-written-stories
```


### 当前开发数据入口（2026-11-02）

开发/演示统一使用 `student_growth` 正式表。原有数据已完整备份，再按用户要求还原可演示的数据；不使用两套并行运行数据，也不在日常启动时创建临时库或表。

```sh
node backend/scripts/runAdminClosureDemo.js
```

访问 http://localhost:19981。默认启动不执行seed或数据还原。备份与事务还原说明见 [正式库还原记录](docs/delivery/admin-closure/formal-database.md)。上述历史自动化测试隔离说明不代表当前开发服务连接方式。
