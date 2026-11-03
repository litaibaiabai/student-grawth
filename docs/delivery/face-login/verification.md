# 人脸登录验证记录

日期：2026-11-03。分支：feature-six-education-v4-face。Node22.16.0、macOS Apple Silicon、Python3.11、本机正式student_growth。

## 自动化与模型

| 检查 | 结果 | 证明范围 |
|---|---|---|
| `npm --prefix backend run test:admin-simplification` | 84/84，0失败 | 原闭环及加密、权限、一次性挑战、版本竞态、HTTP隐私、限流、取消、worker协议 |
| `npm --prefix frontend test` | 44/44，0失败 | 原前端及采集质量/动作状态、错误映射、模拟设备资源释放、超时及取消传输 |
| `npm --prefix frontend run lint` | exit0 | 应用源码lint；固定第三方WASM/模型不参与源码lint |
| `npm --prefix frontend run build` | exit0 | 前端产物包含安装器准备的本地模型与WASM |
| `node backend/scripts/verifyFaceModels.js` | realModelsLoaded=true、syntheticNoFaceRejected=true | 三个真实模型加载、内存纯色JPEG无脸拒绝；realPersonVerification=NOT_TESTED |
| 正式库只读检查 | 四列ready；4个账号、0模板、0挑战 | 没有预填或遗留测试模板 |

最终回归后八表hash与本轮演示还原后的hash完全一致。后端数据库用例仅在正式表事务内回滚；未建测试库表。受限执行环境不能连接MySQL/本机监听时得到EPERM，随后在允许本机连接的执行环境完整重跑84项通过；真实MediaPipe初始化也在允许本机原生运行的环境复核通过。

身份匹配测试使用明确标注的模型替身，覆盖异人向量、跨账号/跨校、过期/重放、停用/注销/重绑版本竞态及取消推理。一次性消费测试的savepoint连接为串行；另有两个真实连接验证users行锁排他，不能据此宣称完成提交式多连接真人竞争测试。

独立审阅发现并修复：公开登录负例响应/工作路径差异、大小写路径及body-parser日志泄漏风险、模型初始化/权限等待期间超时清理、请求在前置账号查询期间断开的取消窗口。后两类新增回归均观察到修复前失败、修复后通过；最终复核无剩余Critical/Important。

## 原系统与浏览器

MCP浏览器验证密码登录、三模块管理员菜单、人脸登录入口、本人设置弹窗、默认不勾选同意、未同意禁用采集、Escape关闭及焦点恢复。未打开物理摄像头、未勾选真实生物识别同意、未绑定真实凭据。页面截图位于本机`output/report-core/face-auth/screenshots/`。

`npm --prefix backend run demo:browser -- --step-delay 500`从空业务数据执行三角色鼠标流程，23/23通过：管理员导入及制卡、师生日常扫码/故事/奖状/成绩与审核、班主任确认发布、学生读取报告、管理员统计。摄像头二维码和故事录音沿用明确标注的虚拟输入，不用于人脸认证。

- 生命周期：`output/report-core/fresh-three-role-demo/2026-11-03T04-22-14-483Z/lifecycle.json`，status=PASS、restored=true。
- 浏览器报告：`output/report-core/three-role-browser-demo/2027-2028-1/2026-11-03T04-22-17-134Z/report.json`。
- 清理前已SQL备份，演示后八表hash与清理前完全一致；本轮后续安全回归结束再次只读核对一致。

## 尚未完成的人工验收

以下没有通过模拟单测替代；生产默认关闭，不视为已完成生产安全验收：

1. 本人密码验证及同意后真实绑定，同人多次登录与解绑；三角色正确进入各自首页。
2. 摄像头拒绝、撤销/占用、不同设备、低光/强光/模糊、多脸及动作未完成的物理设备检查。
3. 异人、儿童不同光照样本误识/拒识评估及阈值校准。
4. 静态照片、手机照片、录制视频、虚拟摄像头与深伪攻击验证；普通RGB动作挑战没有认证级PAD保证。
5. 生产HTTPS/代理、密钥保管及轮换、目标Linux运行库与并发容量验收。

本人操作步骤及部署配置见[运行说明](README.md)。
