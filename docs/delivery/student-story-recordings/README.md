# 学生讲故事录音交付与验证

日期：2026-11-01。按已确认的手机 Chrome 草图实现，代码保留在当前工作区，未提交、推送或部署。

2026-11-01 补充修复：用户本地 `19380` 端口仍运行于新录音路由写入前启动的后端，导致新接口返回 410，录音按钮因未能确认采集状态而禁用。已按原目录、原 `.env` 配置重启本地开发后端，在用户实际 Chrome 页面确认“开始录音”不再禁用；同时在录音区补充连接中、连接失败与“重新连接录音服务”反馈，并以浏览器测试覆盖 410 → 重新连接 → 正常录音上传回放。前端 29/29 测试、修改文件 lint 与构建再次通过。无数据迁移或学期权限变更。

## 使用与完成内容

学生进入“故事生成”，选择“讲故事”，点击开始录音，再点击停止。停止后可试听、重新录音或保存并上传。成功保存后即时更新本学期录音数量和全校名次，数量相同并列。历史列表显示名称、保存时间与时长，提供播放、暂停、原生进度拖动、下载和分页。

- 失败保留音频草稿；重复点击、请求重放和服务器已保存但响应丢失的重试都只计一条。
- 尚无录音时显示 0 条和“暂无排名”；仅同校、同学期、在册学生的成功录音参与排名。
- 权限拒绝、设备不可用、加载失败和学期截止有明确提示；切换故事类型、页面或学期保护未保存录音，离开后停止音轨。
- 录音中采集被关闭，仍可停止并试听当前录音；关闭后禁止新增上传，历史依然可播放、下载。
- Chrome 录制优先使用 WebM/Opus，兼容 MP4、Ogg；服务端也接受真实 WAV 音频。最长 5 分钟，文件最多 20MiB。音频私有存储，按学生本人及学校鉴权读取。
- 不依赖转写、AI 评分或收费模型，不将录音数量写成旧版讲故事评分。听故事和写故事继续使用原组件。
- 无新数据库表、迁移或运行时依赖。私有音频随现有 `REPORT_FILES_DIR` 一起备份；部署模板为 20MiB 文件预留 multipart 请求开销。

手机录音须通过 HTTPS 打开并允许麦克风；localhost 用于本机开发。自动化测试使用合成麦克风及手机尺寸的 Chrome，未在实体 Android/iOS 设备上验证锁屏、后台挂起和系统来电。

## 本次验证

| 检查 | 结果 |
| --- | --- |
| 新录音 HTTP/服务测试 | 6/6 通过：持久化、原始字节和 Range 回放、权限/学校隔离、并列排名、分页、重放幂等、冻结后读取、错误与超限音频、文件失败回滚、MP4/Ogg |
| 新录音浏览器测试 | 通过：真实 MediaRecorder + 合成麦克风，点击开始/停止、试听/重录、上传失败保留、响应丢失重试、刷新回放、下载、权限拒绝/迟到清理、录音期间关闭采集仍可停止 |
| 自动播放限制回归 | 先复现播放器消失，再修复并验证手动播放仍可用 |
| 听故事浏览器回归 | 通过：选择、完整播放、积分、排名与历史 |
| 写故事浏览器回归 | 通过：文本/文档、历史、失败保留、持久化、截止、桌面/手机，并更新旧讲故事文件控件测试为新的点击录音流程 |
| 前端标准单元测试 | 29/29 通过 |
| 前端构建 | Vite 构建通过 |
| 本次修改的前端文件 lint | 0 错误、0 警告 |
| 响应式视觉检查 | 1440px、390px、320px 截图已检查，无横向溢出 |
| 独立代码审阅 | 发现并修复“采集关闭后无法停止当前录音”；对应测试 RED → GREEN |

运行：后端 `node --test backend/__tests__/report_core_story_recordings.test.js`；浏览器 `node frontend/tests/student-story-recordings.cjs`。使用项目要求的 Node 22.12+。测试创建并清理独立临时数据库及音频目录，不写入真实学生数据。

截图位于 `output/report-core/story-recordings/`。音频格式测试所用的 1 秒静音 MP4/Ogg 固定样本已保存于 `backend/__tests__/fixtures/story-recording.*`；测试及生产运行均无需安装 FFmpeg。

## 标准全量检查中的既有问题

后端标准 `npm test`：176 项中 165 通过、10 失败、1 跳过。新录音测试全部通过。禁用本次新增路由后，以下 8 项旧卡片/台账失败仍可复现；本次未修改其业务代码：

| 文件 | 失败测试名称 |
| --- | --- |
| `backend/__tests__/report_core_card_print_scopes.test.js` | original card print request is auditable and produces Chinese per-class PDFs without changing credentials |
| 同上 | class PDF and stale print requests enforce current unused status; old token and ZIP routes share the guard |
| `backend/__tests__/report_core_card_quota_limits.test.js` | void and redeem race has exactly one winner and never refunds issued quota |
| `backend/__tests__/report_core_cards.test.js` | quota restricts generation; same class concurrent redemption credits only one student; reversal only once |
| `backend/__tests__/report_core_ledger.test.js` | ledger reconciles generated/redeemed/void/reversed counts and never exposes card credentials |
| 同上 | cross-month reversals belong to original month while the event keeps its actual date |
| 同上 | historical asOf does not expose a future recipient or apply a later void; old unverified clock stays unknown |
| 同上 | current SQL aggregate keeps direct counts, mixed event ordering and pagination identical to exact asOf projection |

另两项在全量运行时失败，在隔离基线运行中通过，涉及本机 HTTP/模型测试环境：

- `backend/__tests__/report_core_provider.test.js`：provider accepts API roots and explicit completion URLs without duplicating the route。
- `backend/__tests__/report_core_review_regressions.test.js`：subject teacher source payloads redact other-subject values, historical values and private narratives/specialties。

前端标准 `npm run lint` 有 8 项旧错误，均不在本次修改文件：

- `frontend/src/app/core/ui.jsx`：混合组件与 hook 导出。
- `frontend/src/app/manager/index.jsx`、`frontend/src/app/student/index.jsx`、`frontend/src/app/teacher/index.jsx`：混合组件与模块对象导出。
- `frontend/src/app/reportCore/index.jsx`：通配导出无法通过 fast refresh 规则。
- `frontend/src/app/shared/classics/V2Classics.jsx`、`frontend/src/app/shared/materials/SourceList.jsx`：混合组件与非组件导出。
- `frontend/src/app/manager/roster/adminData.js`：既有未使用的 `useRef` 导入。

## 实施范围与审阅结论

在当前 `codex/six-education-v2` 工作区进行限定修改，以保留未提交的听故事、写故事基础代码；未新建会遗漏这些代码的 worktree。独立审阅未发现本功能范围内的其他明确阻断问题。实体手机系统打断行为仍需实机验证；六育星级规则及无关既有工作不在本次改动范围。
