# Student Story Recordings Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. User approved continuing from the mobile mockup on 2026-11-01; execute inline without another approval step.

**Goal:** 学生点击录音、停止、试听和保存，查看按数量计算的本学期全校排名及本人历史回放。

**Architecture:** 独立 React 录音组件与局部样式接入现有听/写/讲入口；Express 私有音频接口和 MySQL 来源记录提供持久化、幂等、分页和数量排名。不依赖旧作品评分、转写或收费模型。

**Tech Stack:** Node 22.12+、React 18、Vite、Express、MySQL、MediaRecorder，复用现有依赖。

**Spec:** `docs/superpowers/specs/2026-11-01-student-story-recordings-design.md`

## Global Constraints

- 主要验证手机 Chrome，兼容电脑；保持校园绿和暖纸色，320px 不横向溢出。
- 单段最长 5 分钟、单文件最多 20MiB，不设置 30 秒下限；不新增音频内容评分。
- 仅本人读取音频与历史；本学期同校在册学生按成功录音数量排名，同数并列。
- 采集结束后禁止新增，仍可回放；网络重试不重复计数。
- 保留现有听故事与写故事实现及全部无关的未提交改动。

## Review Focus

- 授权麦克风时离开或卸载，迟到的 stream 必须停止，不能产生遗留录音。
- 请求已保存但响应丢失，重试仍是同一条；保存失败保留试听草稿。
- 正在播放历史音频时开始录音或播放另一段，前一音频必须暂停。
- 切换故事类型、学期与刷新页面时保护未保存内容，并清理音轨和对象 URL。
- 排名与历史查询不能把跨校、跨学期、转出学籍或旧评分记录计入。

### Task 1: 私有录音持久化与数量榜

**Files:** 新增 `backend/services/reportCoreStoryRecordings.js`、`backend/routes/reportCoreStoryRecordings.js`、`backend/__tests__/report_core_story_recordings.test.js`；修改 `backend/routes/reportCore.js` 挂载新路由。

**Interfaces:**
- Produces: `listRecordings({pool,actor,termId,beforeId,limit=20}) -> {rows,nextCursor,ranking:{me:{rank,value},population},collection:{open,cutoff,phase}}`。
- Produces: `submitRecording({pool,actor,termId,durationMs,file,command}) -> withMutation response`，成功结果包含 `id`。
- Produces: `getRecordingAudio({pool,actor,recordingId}) -> {path,mime,filename}`，HTTP 使用 `sendFile` 支持 range。
- Rows: `{id,title,createdAt,durationMs,mime}`；文件引用与物理路径不进入列表。

- [x] 写 HTTP 测试：缺失接口预期 200 实际 404；上传后字节一致回放，排名即时更新。
- [x] 执行 RED：`node --test backend/__tests__/report_core_story_recordings.test.js`，确认缺失路由导致断言失败。
- [x] 增加来源事件 `TELL_RECORDING`（ITEM / CONFIRMED），随机私有文件，按内容签名识别浏览器 WebM、MP4、Ogg 录音，严格大小和非空校验。
- [x] 复用学籍范围、学期事务和命令幂等；失败/重放清理无效文件，成功增加学期数据版本；不触发旧评分投影。
- [x] 补齐并列、分页、学生/学校隔离、截止/冻结后读取、幂等重放、错误文件、文件失败清理测试并运行至 GREEN。

### Task 2: 真实录音交互与历史播放

**Files:** 新增 `frontend/src/app/student/stories/StoryRecordings.jsx`、`storyRecordings.css`、`useStoryRecorder.js`、`frontend/tests/student-story-recordings.cjs`；修改 `StoryActivities.jsx` 的讲故事入口。

**Interfaces:**
- Consumes: Task 1 的 GET/POST 与本人音频 GET；沿用 `api()` 的请求幂等与登录处理。
- Produces: `StoryRecordings({ctx,registerGuard})`，与当前 `WrittenStories` 的故事切换保护契约一致。
- Produces: `useStoryRecorder() -> {status,file,durationMs,error,start,stop,discard}`，管理录音生命周期与权限迟到清理。

- [x] 写浏览器 RED：进入讲故事，点击“开始录音”；当前旧界面不能提供新按钮或提交链路。
- [x] 实现开始/停止、计时、5 分钟自动停止、试听、重录、保存状态与失败重试；退出停止麦克风，防止重复请求与迟到状态更新。
- [x] 按草图实现本人数量/全校名次、历史时间和时长、逐条私有获取、播放暂停/进度、下载和分页；加载/空列表/错误/截止状态可见。
- [x] 验证实际浏览器录音上传、重放幂等、刷新回放、麦克风拒绝、授权中离开、未保存切换保护与手机宽度。

### Task 3: 回归、视觉检查与审阅

**Files:** 更新本计划的完成记录；截图输出到忽略目录 `output/report-core/story-recordings/`。

- [x] 执行前后端标准测试、前端 lint 与 build；记录任何原有失败。
- [x] 检查桌面、390px 和 320px 的真实页面截图，以及听故事/写故事入口回归。
- [x] 按 executing-plans 要求委派一次最终代码审阅，修复影响本功能的实际问题并验证。
- [x] 更新设计与完成记录，交付功能和必要的环境限制说明。

## Execution notes

- 当前目录在 `codex/six-education-v2`，包含其他任务新建且未跟踪的听/写故事实现；直接在当前目录进行限定修改，避免新 worktree 遗漏这些必要基础代码。不执行清理、重置、提交或推送其他任务的文件。
- 2026-11-01 用户“继续”确认手机草图，批准完整设计。

## 完成记录

录音后端 6/6 与完整浏览器流程通过；听故事、写故事回归通过；前端 29/29 测试与构建通过；修改文件 lint 无错误。独立审阅的采集关闭时停止按钮问题已按 RED→GREEN 修复。标准全量检查中的既有失败见 `docs/delivery/student-story-recordings/README.md`。代码留在当前工作区，未提交或部署。
