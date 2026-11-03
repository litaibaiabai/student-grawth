# Face Login Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. Steps use checkbox syntax for tracking.

**Goal:** 本人密码验证绑定后，可以使用MediaPipe采集并由服务端识别完成1:1登录，保留密码登录。
**Architecture:** React共享摄像头组件、Express认证服务、users加密模板/一次性挑战、本机Python MediaPipe+YuNet/SFace worker；所有身份和动作在服务端验证。
**Tech Stack:** Node22、React18、MySQL8、@mediapipe/tasks-vision、本地Python3.11/3.12与OpenCV/MediaPipe。
**Spec:** ../specs/2026-11-03-face-login-design.md（用户已回复继续实施）。

## Global Constraints
- 使用原student_growth八表，仅users加列；正式表测试事务回滚，不建临时库表。
- 只允许本人密码重新验证后绑定，默认未绑定；不采集用户物理摄像头，不给演示账号伪造模板。
- 原图不落盘，不向第三方传图；AES256GCM独立密钥及AAD绑定用户；HTTPS仅loopback开发例外。
- 前端向量/匹配/动作声明均不可信；服务端复核，challenge60s，一次性、单账号单活跃、失败也消耗。
- 生产默认关闭，普通RGB动作不是认证级防伪；真实验收缺失不能宣称生产安全。

## Review Focus
1. 推理期间解绑/停用/注销/重绑：最终锁内重查账号版本和模板版本，否则拒绝。
2. 并发nonce、同请求重试和跨用途：原子消耗，只有一次能进入推理。
3. 密钥/模型/worker丢失或超时：关闭人脸能力，密码仍可用；不错误放行。
4. 低光、多脸、重复帧、静态照片及伪造客户端结果：后端验证而非只检查前端。
5. 相机切换模式/离页/异常：轨道与模型资源均释放；无默认权限请求。

### Task 1: 加密、协议及迁移
Files: backend/services/faceAuth/{crypto,policy}.js, backend/scripts/migrateFaceAuth.js, backend/__tests__/admin_simplification_face_crypto.test.js.
Interfaces: sealTemplate(value,{schoolId,userId,version},keys), openTemplate(...); faceSchemaReady(pool), migrateFaceAuth({connection,targetDb,mode}); nonce hash, frame limits32 frames/4MB decoded、图片<=640x640、worker20秒、cosine>=0.65。
- [x] 写随机IV、AAD/密文篡改、缺密钥、模型版本及格式约束测试，验证RED。
- [x] 实现AES256GCM JSON封装含keyId，环境密钥校验和保守服务端输入限制，GREEN。
- [x] 幂等check/apply迁移users四列，apply先备份；旧库密码正常，缺列face关闭。

### Task 2: 本地识别工作进程
Files: backend/services/faceAuth/worker.js, backend/face_worker/{worker.py,requirements.txt}, backend/scripts/setupFaceModels.js.
Interfaces: createFaceWorker().infer({frames,action})->{descriptor,modelVersion}; stdin/stdout单请求有界，最多排队2、20秒超时kill重启；禁止把stderr或帧打印日志。
- [x] 写队列/超时/协议/缺模型安全失败测试，RED→GREEN。
- [x] 固定版本模型manifest、sha256、许可证及下载入口，Python虚拟环境；MediaPipe后端复核眨眼/转头顺序，YuNet五点对齐与SFace单位特征，全序列同人>=0.65。
- [x] 真实模型无脸/静态重复帧拒绝smoke，分别记录模型与替身测试，不能冒充真人验收。

### Task 3: 认证事务及路由
Files: backend/services/faceAuth/service.js, backend/routes/faceAuth.js, backend/routes/reportCore.js, backend/app.js, backend/__tests__/admin_simplification_face_auth.test.js.
Interfaces: createFaceAuthService({pool,schoolId,worker,config}); capabilities/status/challenge/verify/enroll/remove。
- [x] 写密码重验证、consent、跨账号/跨校、过期/重放/并发一次、推理中模板或token版本改变回归，RED。
- [x] challenge先锁行验证并消耗后再推理，最终短事务锁行重查status/token_version/face_credential_version；不持锁做推理。未知账号返回不可使用的同形challenge。
- [x] 复用signToken，安装两前缀路由/IP及账号限流、TLS检查、worker失败503、Cache-Control:no-store；保护私有字段不进入现有API/导出，GREEN。

### Task 4: 前端登录与本人设置
Files: frontend/src/app/auth/face/{FaceCapture,FaceLogin,FaceSettings}.jsx, captureModel.js/.test.js, face.css; frontend/src/app/index.jsx, core/RoleShell.jsx。
Interfaces: FaceCapture({challenge,onCapture,onCancel}); FaceLogin({username,onUsername,onLogin}); FaceSettings({onClose})。
- [x] 纯质量/动作状态机、相机错误映射/关闭清理回归RED→GREEN。
- [x] 按用户点击启动相机，在Worker或限帧调度中运行MediaPipe，采集32帧以内；提交服务器要求的动作序列，发送帧而非向量，所有路径stopTracks。
- [x] 密码与人脸共用登录后初始化方法；账号区域设置对话框、同意/密码/绑定/重绑/解绑；不改角色业务菜单。

### Task 5: 配置、实际迁移与集成验收
Files: deploy/backend.env.example, deploy/nginx相关配置, docs/delivery/face-login/README.md, scripts/README.md。
- [x] 模型、WASM本机资源，环境密钥不进Git；生产开关关闭。
- [x] 正式库check→备份apply四列→check；不预填人脸。
- [x] 安全套件、前端test/lint/build，浏览器密码回归、人脸未启用与相机异常；记录真人与照片/视频验证尚待本人配合的限制。

### Task 6: 独立审阅与交付
- [x] 全分支独立审阅，重要问题修复后验证；提交当前分支，保留真实限制并交付运行步骤。

## 交付状态

六项代码与自动化任务已执行，具体证据见../../delivery/face-login/verification.md。摄像头权限、光照与动作状态通过模拟测试；浏览器只验证密码登录和设置入口，未打开物理摄像头。真人绑定、异人及照片/视频攻击未验收，生产默认关闭；这些人工验收不以任务勾选代替。
