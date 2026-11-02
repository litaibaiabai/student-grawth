# 三角色可见浏览器闭环演示 Implementation Plan

> **For agentic workers:** Execute the already-authorized missing browser-script deliverable inline, following test-driven-development and verification-before-completion. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 用户一条命令启动可见Chrome，观看管理员、教师、学生真实鼠标操作，完整走通已确认的闭环。

**Architecture:** 新入口runThreeRoleDemo负责只读预检、备份、素材生成、服务与浏览器生命周期；三角色步骤独立模块只通过页面交互写业务数据。完整演示使用同校未初始化学期，已完成学期采用明确标记的结果回放，不重置或删除卡。步骤验证、截图、录像与JSON报告独立保存，报告与日志不记录密码或token；含测试二维码的录像与PDF仅保存本机私有输出。

**Tech Stack:** Node22、现有Express/Vite及统一工作簿工厂、Playwright可见Chrome。业务规则不改造。

**Spec:** 用户原闭环要求及[三角色逐步预期](../../delivery/admin-simplification/mcp-demo.md)；本轮明确补上可执行的三角色鼠标操作。

## Global Constraints

- 只使用student_growth学校1和现有虚构师生；账号不新建、不改密码。
- 所有业务写入必须经可见页面点击、输入、文件上传；禁止API请求代跑、SQL造结果、DOM点击注入或伪造听故事完成。
- 每学期卡初始化只执行一次；不提供重置。未完成且已初始化的异常运行拒绝盲目重新写入。
- 默认演示目标2027-2028第一学期，可显式指定；使用带页面标记、production禁止的本地演示时钟。
- 配置及日志不得包含明文密码/token，登录录像保持密码掩码；二维码与粘贴凭证画面仅限本机测试资料；登录使用环境变量或正式库已有开发凭据，只保存在进程内存。
- 不运行历史会建库的测试集合。新增单元用例与现有安全回滚套件验证。

## Review Focus

1. 学期已初始化/异常中断：不得重发卡、重复记日常事实，完整与回放结果明确区分。
2. 登录失败/缺少凭据：在新建学期前预检失败，不把密码写入报告。
3. 页面加载、文件选择、弹窗与角色切换：按真实可见状态等待，失败保留截图及失败步骤。
4. 真实播放与奖状认定：音频从头播放至完成，不写假心跳；教师人工页面核对材料。
5. Chrome/服务启动失败或关闭：只清理本次拥有的资源，不终止用户服务，录像正确结束。

### Task 1: 配置与只读预检

**Files:** Create backend/scripts/threeRoleDemo/config.js, backend/__tests__/admin_simplification_browser_demo.test.js.
**Interfaces:** normalizeDemoOptions(options), classifyDemoState(state), loadDemoAccounts(pool,options); DB仅SELECT，完整模式须无初始化/来源事实，已发布为replay，部分运行拒绝盲重跑。
- [x] 写配置、已有状态分流、凭据脱敏测试，运行看到RED。
- [x] 实现配置与只读预检，验证GREEN；保留现有账号和密码。

### Task 2: 浏览器步骤

**Files:** Create backend/scripts/threeRoleDemo/steps.js, driver.js.
**Interfaces:** createDemoSteps(context)返回有id/role/title/expected/run的步骤；driver统一真实鼠标点击、填值、选择文件、等待及断言；运行器逐步记录结果。
- [x] 写步骤顺序、各角色覆盖、完整/回放边界与失败记录测试，运行看到RED。
- [x] 实现管理员五表导入/一次卡初始化→两教师课程卡/直评/成绩→学生领卡/11自评/听写故事/奖状→教师评审/结算/寄语/确认→学生报告/更正再确认→管理员四类统计。QR从页面图片解码，禁止读后端凭证替代。
- [x] 所有步骤写预期并验证真实页面结果，登录截图不含明文密码，包含测试二维码的截图仅保存本机私有输出。

### Task 3: 一键运行及产物

**Files:** Create backend/scripts/runThreeRoleDemo.js; modify backend/package.json/package-lock.json, backend/scripts/README.md, docs/delivery/admin-simplification/mcp-demo.md.
**Interfaces:** --mode auto|full|replay，--academic-year，--semester，--exit-after；默认可见Chrome。自有服务20080/20081，视频在关闭后定稿，成功保留报告页供观看，Ctrl+C退出。
- [x] 测试参数、无敏感报告、失败时finally清理及资源归属，RED→GREEN。
- [x] 加标准Playwright开发依赖、启动入口和帮助；不改原服务启动入口语义。

### Task 4: 实际验收与交付

- [x] 新学期通过真实浏览器鼠标操作完成全部闭环；MCP核对关键页面与最终报告，截图及每步PASS/FAIL保存本机output。
- [x] npm --prefix backend run test:admin-simplification；npm --prefix frontend test；脚本--help及依赖检查。
- [x] 文档明确运行命令、默认/回放区别、一次性初始化和录像位置。
- [ ] 提交v4，普通push并报告真实同步结果。


验收：新学期term297完整21步骤含两次安全续跑全部PASS，后端47、前端38、lint/build通过；独立审阅的端口归属Important已RED→GREEN并复核关闭。实际原始录像及失败证据保留，合成MP4包含修复续跑过程，不宣称一次未中断执行。MCP再次依次登录管理员、教师、学生，核对统计1+1=2、教师1080/1079张以及学生版本2两页。
