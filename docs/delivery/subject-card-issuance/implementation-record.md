# SDD ledger — plan: docs/superpowers/plans/2026-10-26-subject-card-issuance.md

Spec: docs/superpowers/specs/2026-10-26-subject-card-issuance-design.md

Execution: inline in the managed worktree, with one independent whole-change review at completion. User authorized implementation by “继续” after the reviewed design.

Baseline: current working copy copied into managed worktree; source hashes saved at `/private/tmp/subject-card-source-baseline.json`. Initial baseline: 29 passed, 12 cancelled by sandbox-denied database access; isolated MySQL test database setup follows.

Ruling: preserve the copied uncommitted baseline and review our changes against that snapshot; do not make a commit that bundles other tasks' pre-existing edits. Cost: implementation remains as workspace changes until explicitly integrated/committed.

Pre-flight: Task 1 supplies rules/migration to Task 2; Task 2 allocation IDs and credential format feed Tasks 3/4; Tasks 5/6 consume the API names fixed in the spec. Task 7 owns integration and source merge. No interface conflicts found.

Task 1: complete — 规则与旧表迁移 RED→GREEN；整套测试 48/48 通过。测试夹具解析误把 UNUSED 中的 USE 当作命令，已删去不必要的替换。

Task 2: complete — 自动配卡与管理API RED→GREEN；整套测试59/59通过。使用学校级数据库互斥（涵盖学科），避免配置与生成并发混用版本。Node18顶层after阻碍空闲连接退出，测试改用现有describe模式。

Task 3: complete — 扫码、审核分类、固定+1、幂等、期限、权限、停用接管与脱敏 RED→GREEN；旧契约断言已按退役更新。整套测试67/67通过。Ruling: 修复学期唯一键纳入school_id，使私有校历可与其他学校同学年共存；旧数据保持不变。

Task 4: complete — 打印包测试RED→GREEN；真实PDF生成、文件丢失恢复、教师增补清单隔离、鉴权下载及渲染QR解码已通过。中文卡面已人工检查。字体及OFL随包。
Task 5: complete — 三页签管理、只读教师分配、校历审核截止编辑已接入；首次打开策略表单曾因动态字段preserve=false清空回填，浏览器复现后去除该清理行为，实际100张70/20/10预览复查通过。
Task 6: complete — 登录恢复与取整行为测试RED→GREEN；真实浏览器完成学生申领、教师分类审核和账本+1。连续扫码广播新意图测试补齐。
Final review: independent fresh-context review by subject_cards_final_review；已收到5项重要发现（截止回退、校历并发、字典停用绕过、增量SQL部署路径、同页连续扫码）。中途用户续接后代理已结束，保留已交付发现并自行完成修复验证，不重复派遣审阅。
Final: fixed 截止回退 — 缩短后再延长不恢复旧截止 RED→GREEN。
Final: fixed 校历并发 — 逐教师预留时重读校历 RED→GREEN，校历保存使用同一学校锁事务。
Final: fixed 字典停用绕过 — 已有策略学科停发统一走策略版本，API拒绝即时字典停用 RED→GREEN。
Final: fixed 增量SQL缺失 — 仅后端打包结构迁移测试 RED→GREEN，SQL随迁移目录打包。
Final: fixed 同页连续扫码 — 凭证变更事件测试 RED→GREEN，已挂载领取页订阅变更。
Final: Ruling: 已维护策略的学科仅通过策略开关暂停发卡，字典状态变更拒绝 — 统一生效月避免绕过当月有效版本 — 代价：需进入策略表单停发。
Final: minor (deferred): Ant Design现有部分属性有弃用警告，前端构建有既有大包提示；不影响功能，暂不做全项目样式/API迁移。
Final suite after fixes: backend 75/75, frontend card helper 4/4；浏览器复查与合回继续。

Browser follow-up: 策略表单preserve=false卸载清理问题已完成实际RED→GREEN；100张70/20/10保存成功并显示2026-11生效。现有request封装PUT使用表单编码导致数字/布尔转为字符串，改成POST/PUT/PATCH统一JSON后真实保存及教师主学科保存通过。同页先扫智育卡再扫体育卡，预览从序号2切到3且方向同步；未自动申领。PDF页面显示可下载。
Task 7: full suite backend75/75、frontend7/7、build通过、git diff --check通过；准备按基线合回本次差异。
Ruling: 学校级锁覆盖学科与校历修改 — 避免跨配置竞态 — 代价：同校配置与预留会短暂串行。

Task 7: complete — 53个本次文件按源哈希安全合回，0并发冲突；原文件私有备份 /private/tmp/subject-card-source-premerge。原目录后端依赖npm ci成功；原目录frontend测试7/7和build成功，合回文件checksum一致，diff --check通过。正式/原开发业务数据库未迁移，启用步骤在交付说明中。托管detached工作树保留以便追溯，不混入原有未提交成果做提交。
