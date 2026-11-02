# 学生写故事验收记录

日期：2026-11-01。Node 22.16.0，Chrome，本机独立 `liuyu_report_test_*` 测试库，结束后自动清理。

## 实现范围

- 学生选择“写故事”，输入正文后递交，或上传 PDF / DOC / DOCX 自动递交。
- 上传最多 10MB，正文最多 20000 个 Unicode 字符；空白、损坏、格式伪装、超限文件均不计数。PDF 需要可读取文字，不含扫描件 OCR。
- 成功提交即时按一篇计数，展示本学期全校排名，同篇数并列。复用已有 V2 来源表及统计投影，不新增业务表。
- 本人历史按新到旧分页，点击打开完整正文，不覆盖编辑框草稿。服务端拒绝跨学生和跨校读取。
- 相同请求重试只保存一次；采集截止后可回读原故事及重放已完成请求，不能新增提交。
- 输入、文档解析失败时保留草稿；切换故事活动保护未提交材料，录音及提交中阻止切换。

## 通过的检查

| 检查 | 结果 |
| --- | --- |
| `node --test backend/__tests__/report_core_written_stories.test.js backend/__tests__/report_core_v2_statistics.test.js` | 8/8 通过 |
| `npm --prefix frontend test` | 29/29 通过 |
| `npm --prefix frontend run build` | 通过 |
| 对 `WrittenStories.jsx`、`StoryActivities.jsx` 运行 ESLint | 通过 |
| `npm --prefix frontend run test:student-written-stories` | 通过 |

浏览器覆盖真实文本、PDF、DOCX 提交，重复点击只保存一次、数量排名刷新、历史完整回读、失败保留草稿、刷新后数据持久化、截止后只读、键盘关闭详情、相邻故事活动材料保护。后端另用自己编写的真实 DOC 夹具验证中文及段落。

桌面 1440px 与手机 390px、320px 均已检查截图和横向溢出；截图在 `output/report-core/written-stories/`。

独立代码审查发现的故事类型切换保护问题已通过失败测试复现并修复。请求丢失后跨截止时间重试的问题也已完成失败到通过的回归验证。

## 仓库全量检查中的已有失败

`npm --prefix backend test`：159 通过、8 失败、1 跳过。8 项均在本次未修改的卡片/台账测试及实现中；其中卡片用例使用固定 2026 年 10 月卡片，当前日期已进入 11 月。未改动这些测试或业务代码：

| 测试文件 | 失败用例 |
| --- | --- |
| `report_core_card_print_scopes.test.js` | original card print request is auditable and produces Chinese per-class PDFs without changing credentials |
| `report_core_card_print_scopes.test.js` | class PDF and stale print requests enforce current unused status; old token and ZIP routes share the guard |
| `report_core_card_quota_limits.test.js` | void and redeem race has exactly one winner and never refunds issued quota |
| `report_core_cards.test.js` | quota restricts generation; same class concurrent redemption credits only one student; reversal only once |
| `report_core_ledger.test.js` | ledger reconciles generated/redeemed/void/reversed counts and never exposes card credentials |
| `report_core_ledger.test.js` | cross-month reversals belong to original month while the event keeps its actual date |
| `report_core_ledger.test.js` | historical asOf does not expose a future recipient or apply a later void; old unverified clock stays unknown |
| `report_core_ledger.test.js` | current SQL aggregate keeps direct counts, mixed event ordering and pagination identical to exact asOf projection |

全量 `npm --prefix frontend run lint` 有 8 个已有错误：

- `core/ui.jsx`：组件与工具混合导出的 Fast Refresh 规则。
- `manager/index.jsx`：混合导出。
- `manager/roster/adminData.js`：未使用的 `useRef`。
- `reportCore/index.jsx`：`export *` 无法判断是否全部为组件。
- `shared/classics/V2Classics.jsx`：混合导出。
- `shared/materials/SourceList.jsx`：混合导出。
- `student/index.jsx`：混合导出。
- `teacher/index.jsx`：混合导出。

以上不将全量检查宣称为通过；写故事专项、相关统计回归及构建均已通过。

## 输入框禁用问题修复（2026-11-01）

用户当前页面复现为故事记录接口返回 410“旧业务接口已退役”，输入框原来依赖该请求返回的采集状态，因而被连带禁用。

- 输入框仅在提交处理中或明确确认采集关闭时禁用。历史/排名加载中和加载失败时仍可输入草稿；递交、上传不再依赖历史加载成功，提交时由后端再次校验学期状态。
- 增加浏览器回归：让记录接口返回 410，确认输入框仍可编辑；接口恢复后刷新记录，确认草稿完整保留，继续验证递交、上传及历史正文。
- 已重启当前项目本地后端 19380 和前端 5173；只读检查当前页面的演示学生，后端直连及前端代理均返回 HTTP 200，采集状态开放。
- 修复后的故事浏览器专项、前端 29 项单元测试、目标文件 ESLint 与生产构建均通过。

## 递交按钮灰色及旧接口缓存修复（2026-11-01）

上一轮只解除了输入框对历史请求的依赖，递交按钮仍被 `data.collection.open` 和历史加载状态阻塞。另用真实 Chrome 复现了旧 410 响应被缓存、后端恢复后相同请求仍读取旧错误的情况。

- 有效正文可以直接递交，历史/排名读取失败不再禁用递交、上传按钮。明确已关闭的学期仍禁用操作；服务端始终执行权限、截止日期和学期状态检查。
- API 请求采用 `cache: 'no-store'`，避免继续读取或保存过期的接口错误。
- `npm --prefix frontend run test:api-cache`：真实 HTTP 服务首次返回可缓存 410，恢复后再次读取同一地址；修复前持续失败，修复后真实发出第二次网络请求并返回成功。
- 写故事浏览器专项增加另一位测试学生：让历史接口持续返回 500，输入正文并实际点击递交，数据库中确认保存 1 篇，编辑框清空且显示成功。原学生的文本/PDF/Word、排名、历史、失败保护、手机与截止场景继续通过。
- 前端 29 项单元测试、两个修改文件的 ESLint、Vite 生产构建均通过。
