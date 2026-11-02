# MCP三角色闭环演示脚本

状态：已执行。2026-11-01 至 2026-11-02 使用 MCP 操作同一真实浏览器标签，30 步全部完成；每一步的预期与实际结果如下。

## 环境与说明

运行 `node backend/scripts/runAdminClosureDemo.js` 可创建全新的虚构起点。本次已完成演示的数据库为 `liuyu_report_test_admin_demo_1793543741445`，网页 `http://localhost:19981`，文件在 `output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/`。账号密码读取同目录 `local-accounts.json`，不使用真实师生账号。

角色顺序为管理员→教师→学生，再回到教师完成审核、管理员发布、学生/教师回看。多次切换是业务时序所需；每次通过页面退出和登录，不用注入令牌替代登录。

演示寄语会明确显示“演示固定文案，未经AI生成”；教师人工改写后审核。奖状由教师人工核对，不把固定响应或人工结果称为生产模型识别。实际MCP动作与HTTP自动化测试分开记证。

## 步骤与预期

| 步骤 | 角色/入口与操作 | 预期结果 | MCP实际/证据 |
| --- | --- | --- | --- |
| 01 | 管理员登录，检查七个菜单 | 发布中心、学籍与账号、班级管理、月度卡额度、数据统计、学期配置、操作记录；无管理员体测入口 | 通过。已看到七个正式菜单，初始0学生/0报告 [01](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/01-admin-start.png) |
| 02 | 学籍与账号→教师，导入01-教师导入.xlsx，预览并提交 | 预览新增2，无错误；提交后林知行、徐晨出现 | 通过。teacher_lin/林知行、teacher_xu/徐晨已入库 [02-preview](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/02-teachers-preview.png)；[02](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/02-teachers-imported.png) |
| 03 | 班级管理导入02-班级导入.xlsx，预览并提交 | 预览不创建；提交后出现3个紧凑卡片，无手动新建或状态 | 通过。3班均显示负责教师林知行和0学生，无新建/状态/进度页签 [03-preview](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/03-classes-preview.png)；[03](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/03-classes-imported.png) |
| 04 | 学籍与账号→学生，导入03-学生导入.xlsx | 1名林小禾关联四年级1班；目标班级必须已存在 | 通过。20260401/林小禾，4年级1班，启用；真实导入批次已提交 [04](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/04-student-imported.png) |
| 05 | 每班详情→教师配置，负责教师林知行；1班数学/英语徐晨，其余学科林知行；2/3班语文林知行、数学/英语徐晨，预览提交 | 负责人和真实学科职责分别保存；只有“学生名单/教师配置”两个页签 | 通过。一班12课、二/三班各语数英；班主任均林知行；三班配置已保存 [05-1-preview](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/05-class1-teachers-preview.png)；[05-2-preview](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/05-class2-teachers-preview.png)；[05](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/05-class3-teachers-saved.png) |
| 06 | 月度卡额度保留默认100，语文60、数学70、英语75，保存 | 空白科目继承100；18个实际课程预计1515张/月；语文三班180 | 通过。保存成功；语文3课程各60，默认100保留，预计1515 [06](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/06-quota-saved.png) |
| 07 | 教师林知行登录→领取卡片 | 仅显示本人真实课程，自动生成；三班语文各60；取1班一张语文卡的实际领取链接 | 通过。已从可见卡号29图像保存二维码，供学生实际领取，不读取业务API [07](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/07-teacher-auto-cards.png)；[07-qr](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/07-chinese-qr-preview.png) |
| 08 | 教师无卡直评，选林小禾→语文过程表现，填写说明并奖励 | 有效直评+1；不消耗二维码卡 | 通过。已为1名学生各记1分；数学/英语直评按钮按职责禁用 [08](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/08-direct-score.png) |
| 09 | 教师综合成绩上传04-教师综合成绩及体测.xlsx，核对60项并确认 | 身高142、体重34.5、BMI17.11、跳绳0；体测由教师上传，正确保留0 | 通过。综合成绩已导入 [09-preview](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/09-score-preview.png)；[09](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/09-score-committed.png) |
| 10 | 从六育综合情况进入采集结算，结算1班本人负责的目标 | 本人目标有真实零积分时折一星；数学/英语留给徐晨结算 | 通过。采集结算已完成；不为未负责的数学/英语代结算 [10](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/10-lin-settlement.png) |
| 11 | 学生林小禾登录→自我评价，完成11个实际自评项 | 自评完成11/11，星级按输入保存；不产生奖励积分 | 通过。评价已保存，进度11/11（5项三星、6项两星） [11](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/11-student-self-saved.png) |
| 12 | 学生扫卡领分，粘贴步骤07实际链接并领取 | 同一张卡成功一次，语文卡+1；连同直评原始积分=2 | 通过。领取成功，语文过程表现+1；凭证输入已清空 [12](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/12-card-redeemed.png) |
| 13 | 学生故事→写故事，递交校园小树的文字作品 | 有效文字作品1篇，数量榜更新；不把排名当质量评分 | 通过。故事已提交；学校排名第1，已提交1篇 [13](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/13-written-story.png) |
| 14 | 学生故事→听故事，实际播放“校园里的老树”至结束 | 真实连续播放完成后计1篇；开始/心跳不计数 | 通过。0:16/0:16完整听完；本学期1/100，全校第1，历史含校园里的老树 [14](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/14-listening-complete.png) |
| 15 | 学生上传05-虚构奖状.png | 产生1条待核验申报；当前报告不能绕过待处理材料直接发布 | 通过。获奖记录1份，尚待教师人工核对，未伪造识别结果 [15](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/15-award-submitted.png) |
| 16 | 学生查看期末报告入口 | 学校尚未发布时不展示草稿或教师私有寄语 | 通过。显示期末报告尚未发布 [16](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/16-report-unpublished.png) |
| 17 | 教师徐晨登录→领取卡片，再结算1班数学/英语 | 数学每班70、英语每班75；本人项目结算；不能确认完整报告 | 通过。采集结算已完成；不代替班主任审核整份报告 [17-cards](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/17-xu-cards.png)；[17](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/17-xu-settlement.png) |
| 18 | 教师林知行登录→评审获奖，人工填写阅读表达活动/区级/一等奖/语文并审核 | 申报变已通过，荣誉进入当前报告；未调用OCR | 通过。区级一等奖语文荣誉已通过；待评审0 [18-review](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/18-award-manual-review.png)；[18](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/18-award-approved.png) |
| 19 | 学期寄语，改写明确标记的演示草稿并审核通过 | 人工复核文字进入报告，保存草稿和审核行为分开 | 通过。1/1寄语已通过，实际人工文字已写入六育报告 [19-fixture](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/19-comment-fixture.png)；[19](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/19-comment-approved.png) |
| 20 | 六育综合情况→林小禾完整草稿，核对六育与打印版面，确认本份报告 | 94个位置、2页基础A3横向版式无溢出；缺项0；班主任确认成功 | 通过。班主任确认已保存，记录对应当前报告版本指纹；94格独立对账通过，最终发布版另经A3版式检查。 [20-preview](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/20-full-report-reviewed.png)；[20](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/20-report-confirmed.png) |
| 21 | 教师上传06-期末成绩更正.xlsx，数学平时B→A | 实际字段更正，原确认失效；旧已发布快照不被原地重写 | 通过。管理员看到数据齐全1人、已确认0人、可发布0人、确认待办1人 [21-preview](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/21-score-correction-preview.png)；[21](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/21-confirmation-invalidated.png) |
| 22 | 班主任重读完整报告并再次确认 | 新指纹与数学A对应，确认重新有效 | 通过。94位置完整，新版确认已保存 [22](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/22-report-reconfirmed.png) |
| 23 | 管理员登录→发布中心，输入阶段调整原因，进入核对阶段 | 学生采集结束；未先进入核对时发布准备被阻止 | 通过。全校1、齐全1、确认1、可发布1；阶段核对与更正 [23](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/23-release-ready.png) |
| 24 | 准备全校报告，检查1份，再确认统一发布 | 准备不会提前可见；统一激活发布版本1并冻结FROZEN | 通过。统一发布成功：1/1，学生可见版本 1，当前阶段已冻结。 [24-prepared](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/24-release-prepared.png)；[24-hidden](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/24-prepared-hidden-from-student.png)；[24-published](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/24-published.png) |
| 25 | 管理员数据统计依次查看四标签 | 卡片1+直评1；自评完成1人/11项；荣誉上传1且已认定1；听1、写1、讲0，参与人数去重1 | 通过。新统计保留三个方向，听 1/写 1/讲 0，去重参与 1 人，没有把人数相加。 [25-cards](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/25-cards.png)；[25-self](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/25-self.png)；[25-honors](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/25-honors.png)；[25-stories](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/25-stories.png) |
| 26 | 管理员操作记录查看班级/教师/导入/更正/发布，并导出 | 能看到安全变更差异及操作者，不含密码、卡片凭证、私有正文和文件路径 | 通过。实际翻页可见三科空值到 60/70/75、班级职责与影响人数、ROSTER_IMPORT；首页显示 studentId/revision 和发布版本，CSV 已下载。 [26](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/26-audit.png) |
| 27 | 管理员创建下一学期，不复制数据；检查后回到原学期 | 新学期班级/学生评价/报告均为空，默认卡数100，原学期报告保留 | 通过。新学期班级0、真实课程0、预计新卡0，默认100且所有学科留空；未设为当前学期。；空评价/报告与切换门禁另由HTTP回归验证。 [27-classes](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/27-empty-classes.png)；[27](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/27-empty-quota.png) |
| 28 | 学生登录→六育报告，查看已发布版本与打印视图 | 本人版本1；数学平时A、BMI17.11、跳绳0、语文过程三星、听写各一星；讲故事未评分显示— | 通过。实际学生报告为 CORE_V2 发布版本1，共2页、94格；寄语和区级一等奖完整，数据符合预期。 [28](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/28-student-published.png) |
| 29 | 任课教师徐晨登录→本班已发布明细 | 可以读冻结六育明细，不显示班主任寄语，不显示完整报告确认功能 | 通过。徐晨可读发布版本1的1页明细，94位置；寄语标题0、完整确认按钮0。 [29](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/29-teacher-detail.png) |
| 30 | 返回学生已发布报告，保留浏览器标签 | 页面停在可复核的真实冻结报告，附关键截图 | 通过。已返回学生林小禾，完整冻结报告版本1保留在浏览器中。 [30](/Users/quanta/Downloads/task/六育学生评价系统v2/output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/30-final-report.png) |

## 补充自动化边界

并发预览提交CAS、跨校/跨角色拒绝、旧令牌撤销、密码重置、CSV公式防护、迁移漂移拒绝和重复apply等，由隔离数据库回归覆盖；不把这些API/数据库检查写成MCP页面操作。录音数量与正式故事评分分开；本次使用听/写行为闭环，不用无ASR评分的录音伪造讲故事成绩。

## 实际执行证据与复演注意

- 原始 MCP 顺序记录：[steps.jsonl](../../../output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/steps.jsonl)。截图、可见 DOM 字段以及页面实际下载的操作记录 CSV 位于同目录。
- 最终报告逐格核对：[published-reconciliation.json](../../../output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/published-reconciliation.json)，94/94 通过。预期来自独立输入夹具，仅使用字段目录对应列名，未调用报告投影计算预期。
- 最终发布 HTML 是从学生可见 iframe 读取的 DOM；屏幕 1120px、390px 均无横向溢出，A3 横向 2 页内容均未溢出。仅验证 HTML 打印布局，本次没有生成 PDF 文件。
- 步骤 07 的领取链接来自页面实际显示的二维码图像，在本地解码后交给同库学生领取；没有从业务接口获取凭证代替 MCP。链接与账号文件仅保存在本机测试目录。
- 选择文件期间一次外部工具长时间等待导致登录超过有效期；真实页面拒绝了过期导入。重新登录、重新选择同一输入后完成预览提交，没有跳过授权。日期控件需按年/月/日分段输入，并核对值后创建新学期。
- 本次旧学期仍为学校当前学期；新学期仅创建并查看，没有复制数据，也没有设为学校当前学期。全局切换当前学期另由隔离 HTTP 回归覆盖。
- 完成后的演示库保留发布数据，不能直接把 01–30 当空库重复执行。复演请启动新的演示库，或用 `ADMIN_DEMO_MANIFEST` 恢复既有状态并从适当步骤继续。

MCP 操作入口为 `cua.getTab`；登录、导入文件选择器、表单提交、审核和发布均通过页面控件执行。读取 DOM/截图仅用于验收和留证，没有在浏览器注入业务状态。

收尾补充：修复审计关键字后再次用 MCP 查询 `ROSTER_IMPORT`，实际返回教师2行、学生1行的两个导入批次，见[查询截图](../../../output/report-core/admin-closure/liuyu_report_test_admin_demo_1793543741445/mcp/26-keyword-fixed.png)。随后重新登录学生并保留最终报告；原始记录共50条（含预览、失败恢复和补充复核）。
