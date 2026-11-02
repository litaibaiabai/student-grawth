# 学生写故事实施计划

> 按用户“直接按现有风格实现”的要求，在当前工作区完成，不再等待设计确认；保留已有未提交改动。

**目标：** 学生通过输入正文或上传 PDF、DOC、DOCX 提交故事，查看历史正文及按篇数计算的本学期全校排名。

**架构：** React 独立写故事组件，沿用现有校园绿色与纸张配色。Express 提供本人故事列表、详情和提交接口；复用六育 V2 来源记录、事务、权限与学校统计，不新增业务表。文件在服务端提取纯文本，每次成功提交一篇，数量相同并列。

**约束：** Node 22.12+；上传最多 10MiB，正文 1–20000 个 Unicode 字符；未登录、跨学生、跨校不可读取；采集关闭仅可查看；不依赖付费模型。首次成功提交即时计数，网络重试同一请求不重复计数。

## 任务 1：存储、解析与排名

- [x] 先新增 HTTP 集成测试，证明现有提交接口缺失，期望 POST 成功和完整正文回读。
- [x] 增加 PDF、Word 解析依赖及 `backend/services/reportCoreWrittenStories.js`，保留段落与中文；拒绝损坏、空白、格式伪装、超限文件。
- [x] 在 `backend/routes/reportCoreV2.js` 添加 `/report-core/v2/written-stories` GET/POST 和 `/:id` GET；仅本人可读写，复用事务幂等及统计更新。
- [x] 验证数量排名、并列、学校和本人隔离、关闭采集、重试不重复计数、真实 PDF/DOCX 解析。

## 任务 2：写故事页面

- [x] 新增浏览器测试，覆盖直接提交、文件上传、失败保留草稿、历史详情和排名更新。
- [x] 新增 `frontend/src/app/student/stories/WrittenStories.jsx` 与局部样式；编辑区、学校排名、历史列表与只读详情，提供加载、空列表和失败重试状态。
- [x] 接入 `StoryActivities.jsx` 写故事选项，独立加载写故事数据，避免缺失的其他故事接口阻断写故事页面。
- [x] 验证 1440px、390px 和 320px 布局及键盘关闭详情，切换模块保护未提交正文。

## 验证

- [x] 后端写故事集成测试与后端标准测试命令。
- [x] 前端标准测试、ESLint、Vite 构建。
- [x] 写故事浏览器集成测试；检查桌面与移动端截图。

## 重点复核

- 上传失败不得清空编辑框；点击历史不修改草稿。
- 上传仅按一篇计数，重复点击及网络重放不额外计数。
- 中文、段落与长正文回读完整，无 HTML 执行。
- 学校排名不泄漏他人的故事正文。
- 已截止学期仍能查看历史，不能提交。

解析 API 参考：[pdf-parse 官方文档](https://github.com/mehmet-kozan/pdf-parse)、[word-extractor 官方文档](https://github.com/morungos/node-word-extractor)。

验收结果见 docs/delivery/student-written-stories/verification.md。专项与构建通过；后端全量8项卡片/台账失败、前端全量8项已有lint错误已逐项记录。
