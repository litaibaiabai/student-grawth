# 后端服务分类

服务按业务职责组织，保留原文件名。路由、脚本和测试直接引用分类后的实现；根目录不保留旧路径转发文件。

## 目录职责

| 目录 | 分类 | 内容 |
|---|---|---|
| `auth/` | 认证与权限 | 登录身份、任教范围、开发密码及人脸认证；人脸实现位于 face/。 |
| `core/` | 核心规则与来源存储 | V1/V2 字段策略、学期阶段、日期、来源记录、变更事务及来源资产审计。 |
| `cards/` | 积分卡 | 凭证、直评、卡片领取、学科卡、学期初始化、额度策略及台账。 |
| `evaluation/` | 评价计算 | 自评/教师评价、投影重算、BMI 判定和报告确认。 |
| `reports/` | 报告与班主任寄语 | 寄语、报告读模型、浏览、冻结快照发布、分页和 HTML 渲染。 |
| `imports/` | 成绩与体测导入 | 工作簿解析、上传预览、审核、提交及当前教师范本。 |
| `materials/` | 获奖材料 | 奖状事实规范化、材料处理和 V2 荣誉认定。 |
| `stories/` | 故事活动 | 听、写、讲故事，文档解析和录音。 |
| `registry/` | 统一学籍 | 学籍工作簿、预览和原子导入。 |
| `statistics/` | 统计 | 管理员统计与 V2 统计/排名。 |
| `infrastructure/` | 基础设施 | 模型提供方、异步识别 worker 和正式库备份。 |

## 服务文件

### 认证与权限 · auth

- [auth/authorizationService.js](auth/authorizationService.js)
- [auth/developmentPasswords.js](auth/developmentPasswords.js)
- [auth/face/crypto.js](auth/face/crypto.js)
- [auth/face/policy.js](auth/face/policy.js)
- [auth/face/service.js](auth/face/service.js)
- [auth/face/worker.js](auth/face/worker.js)

### 核心规则与来源存储 · core

- [core/reportCorePolicy.js](core/reportCorePolicy.js)
- [core/reportCoreV2Policy.js](core/reportCoreV2Policy.js)
- [core/reportCoreV2Lifecycle.js](core/reportCoreV2Lifecycle.js)
- [core/reportCoreStore.js](core/reportCoreStore.js)
- [core/reportCoreSources.js](core/reportCoreSources.js)
- [core/reportCoreSourceAudit.js](core/reportCoreSourceAudit.js)
- [core/termDates.js](core/termDates.js)

### 积分卡 · cards

- [cards/cardCredentials.js](cards/cardCredentials.js)
- [cards/reportCoreCards.js](cards/reportCoreCards.js)
- [cards/reportCoreCourseCards.js](cards/reportCoreCourseCards.js)
- [cards/reportCoreSemesterCards.js](cards/reportCoreSemesterCards.js)
- [cards/reportCoreLedger.js](cards/reportCoreLedger.js)
- [cards/semesterCardPolicy.js](cards/semesterCardPolicy.js)

### 评价计算 · evaluation

- [evaluation/bmiEvaluationService.js](evaluation/bmiEvaluationService.js)
- [evaluation/reportCoreEvaluation.js](evaluation/reportCoreEvaluation.js)
- [evaluation/reportCoreProjection.js](evaluation/reportCoreProjection.js)
- [evaluation/reportCoreV2Projection.js](evaluation/reportCoreV2Projection.js)

### 报告与班主任寄语 · reports

- [reports/reportCoreComments.js](reports/reportCoreComments.js)
- [reports/reportCorePublishedReports.js](reports/reportCorePublishedReports.js)
- [reports/reportCoreReadModels.js](reports/reportCoreReadModels.js)
- [reports/reportCoreReportBrowser.js](reports/reportCoreReportBrowser.js)
- [reports/reportPagination.js](reports/reportPagination.js)
- [reports/reportRenderService.js](reports/reportRenderService.js)
- [reports/reportRenderV2.js](reports/reportRenderV2.js)

### 成绩与体测导入 · imports

- [imports/reportCoreImports.js](imports/reportCoreImports.js)
- [imports/reportCoreV2ImportReview.js](imports/reportCoreV2ImportReview.js)
- [imports/reportCoreV2Imports.js](imports/reportCoreV2Imports.js)

### 获奖材料 · materials

- [materials/reportCoreAwardFacts.js](materials/reportCoreAwardFacts.js)
- [materials/reportCoreMaterials.js](materials/reportCoreMaterials.js)
- [materials/reportCoreV2Honors.js](materials/reportCoreV2Honors.js)

### 故事活动 · stories

- [stories/reportCoreListening.js](stories/reportCoreListening.js)
- [stories/reportCoreStories.js](stories/reportCoreStories.js)
- [stories/reportCoreStoryDocument.js](stories/reportCoreStoryDocument.js)
- [stories/reportCoreStoryRecordings.js](stories/reportCoreStoryRecordings.js)
- [stories/reportCoreWrittenStories.js](stories/reportCoreWrittenStories.js)

### 统一学籍 · registry

- [registry/registryPreview.js](registry/registryPreview.js)
- [registry/registryWorkbook.js](registry/registryWorkbook.js)
- [registry/reportCoreRegistry.js](registry/reportCoreRegistry.js)

### 统计 · statistics

- [statistics/reportCoreAdminStatistics.js](statistics/reportCoreAdminStatistics.js)
- [statistics/reportCoreV2Statistics.js](statistics/reportCoreV2Statistics.js)

### 基础设施 · infrastructure

- [infrastructure/formalDatabaseBackup.js](infrastructure/formalDatabaseBackup.js)
- [infrastructure/reportCoreProvider.js](infrastructure/reportCoreProvider.js)
- [infrastructure/reportCoreWorker.js](infrastructure/reportCoreWorker.js)

## 调用约定

- 新服务放入对应业务目录。公共规则、来源事务和来源存储放在 core/；业务实现不重新堆回根目录。
- 同目录使用 `./文件名`，跨目录使用 `../分类/文件名`；路由等上层调用使用 `../services/分类/文件名`。
- 保持延迟 require 的位置，避免改变原有循环依赖和初始化时序。
- `__dirname` 资源路径以新目录计算。字体、故事音频、人脸 Python worker、模型和私有文件仍使用 backend 下原来的资源目录，不复制资源。
- V1 兼容逻辑与迁移工具保留，目录分类不改变业务接口、SQL、字段规则或 HTTP 路由。

## 旧路径迁移

所有原根目录服务均按上表迁移，文件名未更改。例如 `services/reportCoreCards.js` 现在是 `services/cards/reportCoreCards.js`。原 `services/faceAuth/` 现在是 `services/auth/face/`。历史文档中的旧路径可按文件名在本表定位。
