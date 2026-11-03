# 人脸登录

现有密码登录保留。人脸入口为“输入账号→本人实时采集→后端验证→原角色首页”；三角色账号区域均有“人脸登录设置”。首次绑定/重新录入要求现有登录态、当前密码再次验证、主动勾选同意；解绑同样需要当前密码。系统没有为任何现有账号预填模板。

## 运行与安装

Node22，Python3.11或3.12；本轮验证环境为macOS Apple Silicon/Python3.11。Linux需部署方验证OpenCV所需系统库。只在原student_growth八表运行，原有账号和评价数据保留。

项目根目录：

```sh
npm --prefix backend ci --include=dev
npm --prefix frontend ci
python3.11 -m venv backend/private/face-venv
backend/private/face-venv/bin/pip install -r backend/face_worker/requirements-lock.txt
node backend/scripts/setupFaceModels.js --install
node backend/scripts/migrateFaceAuth.js       # 只读check
node backend/scripts/migrateFaceAuth.js --apply # 先SQL备份再加列
node backend/scripts/setupFaceModels.js --init-local
node backend/scripts/verifyFaceModels.js
node backend/scripts/runAdminClosureDemo.js
```

本轮本机依赖、模型、四列迁移、私有开发密钥均已准备；可直接启动服务。默认服务19980/19981；端口被占用时用ADMIN_DEMO_API_PORT/ADMIN_DEMO_WEB_PORT指定空闲端口。该服务入口不清理数据库、不自动绑定人脸。

`--init-local`仅在不存在时生成backend/private/face-auth.env，文件权限600，不打印密钥、不覆盖已有密钥；开发启动器加载该私有环境文件，production不加载。Node和Python模型资源由本站提供，浏览器不请求Google识别服务。下载失败可以重试，已下载缓存会校验SHA256；不要用漂移CDN或跳过校验。

正式发布前应先安装模型和WASM，再`npm --prefix frontend run build`，生成产物包含本地静态模型；仅源代码不包含约37MB SFace权重及生成的WASM文件，Git忽略这些本地大文件，安装器与固定hash manifest保留在仓库。

## 认证与数据边界

- Google MediaPipe负责前端关键点/动作提示，Python端独立复核动作；YuNet对齐、SFace提取128维身份特征，后端匹配阈值默认0.65。FACE_AUTH_MATCH_THRESHOLD允许0.65–0.95，其他配置安全关闭人脸能力。该阈值没有经过本校儿童真人样本校准，不能宣称误识率指标。
- 不信任浏览器的matched、向量、得分或liveness声明。60秒随机nonce绑定用途、学校、账号、会话版本、模板版本；原子消费后推理，再锁行复核状态。无效采集也消耗真实nonce。
- 公开登录失败统一401；对有效格式的匿名负例也运行相同图像校验，不通过错误响应或跳过模型泄露人脸开通状态。动作由随机nonce导出；无真实数据库挑战的请求，即使模型通过也绝不会登录。IP及数据库账号ID分别限流；大小写或重音用户名不能拆分同一账号的限流桶。
- Worker每实例最多3个在途任务（1运行、2等待），单次推理20秒，异常/超时终止重启；API30秒客户端超时，可取消并回到密码方式。CPU资源有限，面向大规模部署需实测容量。
- 关闭采集或设置会中止客户端请求；服务端检查已断开的连接，并在推理后、最终行锁内及提交前检查取消信号。已经完成提交后才到达的取消不能撤销绑定，可使用密码解绑；不能将网络取消描述为跨网络的绝对撤销保证。
- users新增face_template_enc、face_enrolled_at、face_credential_version、face_challenge_json。模板AES256GCM独立密钥、随机IV、keyId及学校/用户/版本AAD；原始照片/帧不写数据库或文件，图像不进入日志；普通账号查询和导入/导出不包含模板。
- 原图仅在请求和推理内存中处理，完成后释放应用引用；不宣称对操作系统交换区或第三方库内存做物理擦除。私有模板与备份均需控制访问权限。
- 解绑删除活动模板并推进版本，使未完成挑战失效；历史数据库备份按既有保留策略管理，不能把解绑描述为抹除所有历史备份。

## 生产配置和限制

生产默认FACE_AUTH_ENABLED=0，不读取开发私有配置。使用部署密钥管理系统注入FACE_AUTH_KEYS（keyId到base64的32字节密钥映射）、FACE_AUTH_KEY_ID、Python路径及模型目录，禁止复用JWT_SECRET、提交密钥或将其交给前端。模型/密钥/列缺失时人脸不可用，密码照常可用；仍可通过密码解绑已有模板。

轮换密钥时同时保留旧keyId，新增独立新密钥并切换active keyId、重启服务；下次成功验证时自动用新密钥重加密，凭据版本不变。旧密钥不可在模板/历史备份仍依赖它时随意删除；无法解密时只能密码重新绑定。

人脸API生产强制HTTPS。若使用同机Nginx，明确`proxy_set_header X-Forwarded-Proto $scheme`并设TRUST_PROXY_LOOPBACK=1；应用只信任loopback代理，不能信任任意客户端转发头。不要把明文9000端口暴露为外网人脸入口。开发HTTP例外仅为非production的loopback连接及localhost主机名。

普通RGB摄像头的随机转头/闭眼挑战不是认证级PAD，无法承诺抵抗深伪和虚拟摄像头注入。生产开关须在真人、异人、不同光照、照片/视频攻击测试通过后由部署方显式开启。本轮没有采集用户真实面部，真人及照片/视频验收尚未完成，不能视为生产安全验收通过。

## 接口

公共：GET /api/v1/auth/face/capabilities、POST challenge、POST login（均在/auth/face前缀）；兼容/api/auth/face别名。私有：GET /api/v1/me/face仅返回本人绑定状态；POST /me/face/challenge验证密码和同意；PUT /me/face绑定；DELETE /me/face密码解绑。响应沿用原code/message/data格式，成功登录沿用原JWT/权限。

## 验证方法

```sh
npm --prefix backend run test:admin-simplification
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
node backend/scripts/verifyFaceModels.js
```

安全后端测试在正式表外层事务中回滚并核对八表hash；模型替身只用于协议、事务和权限测试，不能证明真人识别精度。真实模型smoke仅证明三模型可以初始化且纯色无脸输入被拒绝，输出明确标记realPersonVerification=NOT_TESTED。

并发消费测试通过savepoint包装串行同一连接，验证应用消费语义；另有两个真实MySQL连接的users行锁排他测试，不宣称提交过真实生物模板来进行多连接登录竞争。摄像头lease单测模拟迟到stream/model及截止清理，不等同于挂载组件或物理摄像头实测。

首次真人验证请本人操作：密码登录→账号区域“人脸登录设置”→同意并输入当前密码→采集→退出→输入账号刷脸→确认正确角色；再验证其他人、照片和录制视频不能登录，最后密码解绑确认失效。不要让自动化替本人勾选真实生物识别同意或代录凭据。

自动测试、原三角色演示及待人工验收项详见[验证记录](verification.md)。
