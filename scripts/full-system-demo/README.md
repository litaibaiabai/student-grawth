# 三角色全系统一键自动演示

在项目根目录双击 **完整系统自动演示.command**，或执行：

```bash
node scripts/full-system-demo/run.cjs
```

一条命令自动预检→创建新独立数据库→生成全部素材→启动专用本机服务→打开可见Chrome→完成三角色13章、23菜单→核对8名学生→下载真实评价卡与期末报告PDF。

## 使用参数

```bash
node scripts/full-system-demo/run.cjs --check           # 只读预检，不建库
node scripts/full-system-demo/run.cjs --speed 2         # 加快演示；默认1
node scripts/full-system-demo/run.cjs --speed 6 --exit  # 加速完整验证，结束自动关闭本次浏览器/服务
```

默认是可见浏览器。每次点击、输入、选择、上传和页面跳转完成后停留2.5秒，让观众看清动作结果；章节结束也停留2.5秒。`--headless`仅用于无人值守验证。速度为0到20之间正数，越大越快（例如`--speed 2`会把动作停顿缩短到1.25秒，面向观众演示请使用默认速度）；服务生成、下载和渲染仍等待真实结果，不用调快参数跳过步骤。

默认成功后保留浏览器与专用服务，停在学生报告。回到启动终端按 **Ctrl+C** 结束本次资源；程序只关闭自己创建的进程。不要直接关闭终端或杀其他Node进程。若浏览器被人为关闭或操作，演示可能被中断，需根据报告重新运行。

## 环境

- 本项目已有frontend/backend的node_modules和backend/.env，MySQL运行且该账号可新建数据库。
- Node20以上；本机默认Node18时入口会自动改用Codex已安装的Node运行时，不改变全局Node。其他机器可设置`DEMO_NODE`指向Node20+。
- 已安装Google Chrome，或Playwright已安装的Chromium。脚本启动全新浏览器会话，不读取个人浏览器登录资料。
- Playwright优先本目录安装，其次frontend依赖，最后本机Codex捆绑依赖。其他机器：`npm install --prefix scripts/full-system-demo`；使用Chromium时安装其浏览器。可用`PLAYWRIGHT_MODULE_PATH`指定已有模块。
- Python包含xlsxwriter、openpyxl、Pillow、reportlab；优先Codex已有运行时，可用`DEMO_PYTHON`指定。Poppler的pdftoppm/pdftotext需已安装；字体使用项目内NotoSansCJK。

## 数据与输出

每次独立run：`output/full-system-demo/YYYYMMDD_随机值/`。每次新建`liuyu_demo_...`库，不重置、不删除旧库；原backend/.env只读取连接信息，实际服务强制使用新库，打印密钥及JWT为每run新建，服务只监听本机回环地址。端口自动选择空闲值，现有服务保持运行。

- `manifest.json`：真实账号、月份、端口、库名；密码仅为虚构演示账号Demo123456。
- `inputs/`、`stories/`、`materials/`：全部表格、两版模拟证书、故事稿、预期核算与手册。
- `screenshots/`、`video/`、`trace.zip`：本次真实浏览器操作证据。
- `downloads/`：浏览器实际下载的200张二维码卡PDF、错误名单、系统真实报告HTML/PDF。
- `report.html`、`report.json`、`steps.json`、`independent-check.json`：章节状态、23菜单、8人独立核对。
- `.private/`：本次密钥、私有打印文件/上传素材，权限限制，勿公开。

整个run目录被git忽略，并限制为本机所有者访问。trace、录像及真实QR含本机虚构演示凭证，不自动发布到外部。数据库密码和原环境秘密不写入报告。

预期业务拦截属于演示内容：漏分类必填校验、错误成绩隔离、荣誉退回、缺体育2人受阻，补齐后全部通过。意外失败必须保留失败截图和非成功报告，不能跳过后继续报成功。开发阶段会完整试跑修复；正式使用前建议运行一次`--speed 6 --exit`检查当前机器。

## 真实业务主线

管理员校历/字典/规则→维护学科和兼课主科→自动月配卡→真实PDF/QR→学生预览取消再领取→教师两级审核→直评与受控冲销→荣誉v1退回/v2复审→故事草稿修订终审→Excel错误、正确和更正→六育缺项阻断与补齐→8人独立对账→再次发布→学生90.50分第2版报告→真实打印PDF。

业务提交通过UI完成。API只读用于账本ID及数据对账，不代替发卡、申领、审核、导入和发布。正式故事分88.5；模拟建议并非大模型。学科语文96与智育94独立。
