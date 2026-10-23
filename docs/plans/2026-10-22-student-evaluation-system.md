# 六育学生学期综合素质评价系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个面向中小学三角色（学生/教师/管理员）的可追溯、不可篡改、多版本留痕的六育综合素质评价系统，后端 REST API + 独立前端，覆盖评价卡、积分账本、荣誉申报、月度故事、成绩导入、综合得分、期末报告全流程。

**Architecture:** Spring Boot 3 REST API 服务 + MySQL 8.0（16 张核心表）+ Vue 3 / React 前端三端（学生/教师/管理员）；关键事务采用悲观行锁保证不可篡改；定时任务（Spring Scheduler）驱动卡片过期；Transactional Outbox 模式保障消息可靠投递；PDF 导出走异步 Job 队列。

**Tech Stack:** Java 17 / Spring Boot 3.2 / Spring Security / MyBatis-Plus / MySQL 8.0.16+ / Redis（分布式锁）/ Vue 3 + Vite（或 React 18）/ iText7（PDF 生成）/ MinIO/OSS（文件存储）/ Spring Scheduler

**Spec:** [spec/学生学期综合素质评价系统_SPEC_V1.0.md](../spec/学生学期综合素质评价系统_SPEC_V1.0.md)

## Global Constraints

- MySQL 8.0.16+，InnoDB，utf8mb4，utf8mb4_0900_ai_ci — 所有 DDL 严格遵守 `sql/00_full_schema.sql`
- `password` 字段存 Argon2id/BCrypt 散列密文，响应体中永不出现
- 所有业务写接口强制 `school_id = :caller_school_id` 过滤，无例外
- `score_record` 严禁 `UPDATE` / `DELETE`，只追加；`delta` 只允许 `+1` 或 `-1`
- 所有写接口强制 `requestKey` 幂等键，通过唯一索引拦截重试
- `month_key` 计算基准必须使用 `academic_year.timezone`（默认 `Asia/Shanghai`）
- 导入文件单次限制 ≤ 2 MB / ≤ 1000 行，超限立即拒绝
- API 版本前缀统一 `/api/v1/`
- 高危操作（制卡/冲销/荣誉撤销/报告发布）必须同事务写入 `operation_audit`

## Review Focus

1. **并发扫同一张卡**：两个学生同时 POST /card-claims 携带同一 token，必须只有一个成功；验证行锁 + `uk_claim_card` 唯一键协作，不产生两条 PENDING 记录 → Task 05 的并发测试
2. **冲销幂等**：对同一 `originalScoreId` 发两次冲销请求，`uk_score_reversal_original` 必须拦截第二次 → Task 07 的冲销幂等测试
3. **`month_key` 时区**：服务器本地时区与学校时区不一致时，自然月边界计算不能漂移 → Task 03 单元测试传入非默认时区
4. **报告发布六项前置**：六育任意一维缺失时调用 publish-batch 必须返回 `REPORT_SCORE_INCOMPLETE` 而非成功发布 → Task 11 前置条件测试
5. **定时任务幂等**：定时任务在 10 分钟内被触发两次（Redis 锁失效场景），不应产生重复 EXPIRED 更新或双写 audit → Task 12 的定时任务幂等测试

---

## 五轮推演摘要（内部决策记录）

### 第1轮：需求骨架提取

核心业务链路（9条，按数据流顺序）：
1. 账号 & 学期配置 → 2. 指标字典 → 3. 月度制卡 → 4. B模式扫码申领 + 教师审核 → 5. A模式直评 → 6. 荣誉申报/审核 → 7. 月度故事+AI预评+终审 → 8. 成绩导入（学科/五育） → 9. 综合得分核算 → 10. 期末报告发布

不做项（边界硬限制）：家长账号、学生申诉工单、积分转赠、客户端传分值、实体卡复用。

### 第2轮：模块划分

| 层 | 模块 | 主要职责 |
| :--- | :--- | :--- |
| 基础层 | 账号与鉴权 | 登录、JWT/Session、班级权限中间件 |
| 基础层 | 学期与指标 | academic_year CRUD、edu_evaluation_category 树 |
| 业务层 | 实体卡子系统 | 配额、制卡、定时过期任务 |
| 业务层 | 积分账本子系统 | B模式行锁事务、A模式直评、冲销、SUM聚合 |
| 业务层 | 荣誉子系统 | 申报-审核-REVOKED状态机、级联重算触发 |
| 业务层 | 故事子系统 | 月度提交、AI集成、终审分保护 |
| 业务层 | 成绩导入子系统 | 内存解析、差异预览、批次确认 |
| 业务层 | 综合评分子系统 | 规则版本管理、异步重算、INCOMPLETE 检测 |
| 业务层 | 期末报告子系统 | 快照生成、6项前置校验、PDF异步导出、受控更正 |
| 基础设施 | 审计 & 通知 | operation_audit 拦截器、outbox 投递守护 |
| 基础设施 | 定时任务 | 卡过期任务A/B（Redis幂等锁） |

### 第3轮：关键依赖路径（Critical Path）

```
Task01(DDL+环境) → Task02(账号+鉴权) → Task03(学期+指标)
                                          ↓
                              Task04(配额+制卡) → Task05(扫码+审核+积分账) → Task06(直评+冲销)
                                                                          ↓
                              Task07(荣誉)  Task08(故事)  Task09(成绩导入)
                                         ↘       ↓       ↙
                                          Task10(综合评分)
                                                ↓
                                          Task11(期末报告)
                                          ↓            ↓
                            Task12(定时任务)   Task13(通知外发)
                                          ↓
                                    Task14(前端三端)
```

Task01~Task03 为强前置，Task05 依赖 Task04，Task10 依赖 Task07~Task09，Task11 依赖 Task10。

### 第4轮：风险前置（隐形地雷）

| 风险点 | 严重度 | Plan B |
| :--- | :---: | :--- |
| AI 大模型接口不稳定/无授权 | 高 | ai_status=FAILED 降级到纯人工，接口必须有 3s 超时 + fallback |
| 钉钉 API 接入需授权，周期长 | 高 | 初期全部走模板文件导入，API 作为后期适配器，接口层预留 `ImportAdapter` 抽象 |
| PDF 生成大文件阻塞 | 中 | 异步 Job 队列 + 60s 超时，iText7 大批量并发限流 |
| 定时任务在多实例部署时重复执行 | 中 | Redis SET NX + TTL 15min 分布式锁，任务幂等可重入 |
| 历史数据库迁移（已有 users/academic_year 表结构不符） | 高 | 首期使用纯增量 ALTER（不 DROP），生产前 SHOW CREATE TABLE 比对，单独出迁移脚本 |
| 前端三端（学生/教师/管理员）工作量大 | 高 | Task14 按"主流程优先"分 3 个子任务，移动端优先教师扫码审核和学生扫码 |

### 第5轮：任务边界确认

共 14 个任务，每个任务可独立测试，总计约 12~16 周开发（含前端）。

---

## 文件结构（后端）

```
src/main/java/com/school/growth/
  auth/           # Task 02：JWT + Spring Security
  term/           # Task 03：academic_year + edu_evaluation_category
  card/           # Task 04：card_quota_rule + reward_card
  claim/          # Task 05：card_claim + B模式事务
  score/          # Task 06：score_record 直评/冲销/聚合
  honor/          # Task 07：honor_record + material_revision
  story/          # Task 08：story_submission + AI集成
  import_/        # Task 09：内存解析 + 批次导入
  evaluation/     # Task 10：comprehensive_score_rule + 重算
  report/         # Task 11：term_report + PDF
  scheduler/      # Task 12：定时过期任务
  notification/   # Task 13：outbox 投递守护
  common/
    audit/        # operation_audit 切面
    security/     # school_id 中间件
    idempotent/   # request_key 幂等拦截
sql/
  00_full_schema.sql   # 16张表完整DDL（已完成）
  01_migration_*.sql   # 生产迁移 ALTER 脚本
```

---

## Task 01：数据库初始化与迁移脚本

**Files:**
- Use: `sql/00_full_schema.sql`（已存在，不修改）
- Create: `sql/01_migration_academic_year_uk_fix.sql`
- Create: `sql/02_migration_add_timezone.sql`
- Test: 手动执行验证

**Interfaces:**
- Produces: 可连接的 MySQL 8.0 数据库实例，16 张表就绪，唯一键 `uk_school_year_semester(school_id, academic_year, semester)` 已生效

- [ ] **Step 1: 检查现有 `academic_year` 表唯一键**

```sql
SHOW CREATE TABLE academic_year;
-- 预期：唯一键包含 school_id；若不含，执行下步
```

- [ ] **Step 2: 创建增量迁移脚本 `sql/01_migration_academic_year_uk_fix.sql`**

```sql
ALTER TABLE `academic_year`
  DROP INDEX IF EXISTS `uk_school_year_semester`,
  ADD UNIQUE KEY `uk_school_year_semester` (`school_id`, `academic_year`, `semester`);
```

- [ ] **Step 3: 创建增量迁移脚本 `sql/02_migration_add_timezone.sql`**

```sql
ALTER TABLE `academic_year`
  ADD COLUMN IF NOT EXISTS `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai'
    COMMENT '学校业务时区，用于 month_key 计算' AFTER `effective_at`;
```

- [ ] **Step 4: 在测试环境执行 `00_full_schema.sql` + 两份迁移脚本，验证 16 张表全部创建成功**

```bash
mysql -u root -p student_growth < sql/00_full_schema.sql
mysql -u root -p student_growth < sql/01_migration_academic_year_uk_fix.sql
mysql -u root -p student_growth < sql/02_migration_add_timezone.sql
mysql -u root -p student_growth -e "SHOW TABLES;" | wc -l
# 预期：输出 17（含 header 行）即 16 张表
```

- [ ] **Step 5: Commit**

```bash
git add sql/
git commit -m "chore: db init scripts and academic_year uk + timezone migration"
```

---

## Task 02：账号体系与三角色鉴权

**Files:**
- Create: `src/main/java/com/school/growth/auth/AuthController.java`
- Create: `src/main/java/com/school/growth/auth/JwtTokenProvider.java`
- Create: `src/main/java/com/school/growth/common/security/SchoolScopeFilter.java`
- Create: `src/main/java/com/school/growth/common/security/ClassScopeGuard.java`
- Test: `src/test/java/com/school/growth/auth/AuthControllerTest.java`

**Interfaces:**
- Consumes: Task 01 的 `users` 表
- Produces:
  - `POST /api/v1/auth/login → {token, userId, schoolId, role}`
  - `GET /api/v1/me → {id, username, role, schoolId, grade?, classes?}`
  - `@AuthUser` 注解从 JWT 中解析 `{userId, schoolId, role}`
  - `ClassScopeGuard.assertStudentInScope(teacherClasses, studentId)` — 验证学生归属，失败抛 `ForbiddenScopeException`

- [ ] **Step 1: 写失败测试 — 正确密码登录返回 token，错误密码返回 401**

```java
@Test void login_success_returns_token()
@Test void login_wrong_password_returns_401()
@Test void me_without_token_returns_401()
@Test void me_with_valid_token_returns_user_profile()
```

- [ ] **Step 2: 运行测试，确认全部 FAIL（类不存在）**

- [ ] **Step 3: 实现 `JwtTokenProvider`**

签名算法 HS256，payload 包含 `{userId, schoolId, role}`，有效期 8h，不存 `password` 字段。

- [ ] **Step 4: 实现 `AuthController.login()`**

查 `users` by `(school_id, username)`，Argon2id 验证密码，返回 JWT。响应体 DTO 中明确排除 `password` 字段。

- [ ] **Step 5: 实现 `SchoolScopeFilter`**

所有请求从 JWT 提取 `schoolId`，注入 ThreadLocal，每条 SQL 通过 MyBatis 拦截器自动追加 `AND school_id = :threadLocalSchoolId`。

- [ ] **Step 6: 实现 `ClassScopeGuard.assertStudentInScope(classes, studentId)`**

从 DB 查 `users.grade + class_no`，解析 `classes JSON`（`[{"grade":4,"class_no":1}]`），不匹配抛 `ForbiddenScopeException(FORBIDDEN_SCOPE)`。

- [ ] **Step 7: 运行测试，全部 PASS**

- [ ] **Step 8: 补充越权测试**

```java
@Test void student_cannot_access_other_students_score()
// 修改请求 header 中的 student_id 参数，预期 403
```

- [ ] **Step 9: Commit**

```bash
git commit -m "feat: auth module — JWT login, school scope filter, class scope guard"
```

---

## Task 03：学期管理与六育指标字典

**Files:**
- Create: `src/main/java/com/school/growth/term/TermController.java`
- Create: `src/main/java/com/school/growth/term/CategoryController.java`
- Create: `src/main/java/com/school/growth/term/MonthKeyCalculator.java`
- Test: `src/test/java/com/school/growth/term/MonthKeyCalculatorTest.java`

**Interfaces:**
- Consumes: Task 02 的 `@AuthUser`
- Produces:
  - `GET /api/v1/terms/current → {termId, academicYear, semester, startDate, endDate, isActive, timezone}`
  - `GET /api/v1/evaluation-categories → List<CategoryNode>` （三级树，仅 ACTIVE）
  - `MonthKeyCalculator.currentMonthKey(timezone: String) → String` 格式 `"YYYY-MM"`

- [ ] **Step 1: 写失败测试 — `MonthKeyCalculator` 时区测试**

```java
@Test void month_key_uses_school_timezone_not_server_time() {
    // 固定 UTC 时间 2026-10-01T00:30:00Z
    // 时区 Asia/Shanghai(UTC+8) → month_key = "2026-10"
    // 时区 Pacific/Honolulu(UTC-10) → month_key = "2026-09"
    assertEquals("2026-10", calculator.monthKey(Instant.parse("2026-10-01T00:30:00Z"), "Asia/Shanghai"));
    assertEquals("2026-09", calculator.monthKey(Instant.parse("2026-10-01T00:30:00Z"), "Pacific/Honolulu"));
}
```

- [ ] **Step 2: 运行测试，确认 FAIL**

- [ ] **Step 3: 实现 `MonthKeyCalculator.monthKey(instant, timezone)`**

使用 `ZonedDateTime.ofInstant(instant, ZoneId.of(timezone)).format("yyyy-MM")`。

- [ ] **Step 4: 实现 `GET /api/v1/terms/current`**

查 `academic_year WHERE school_id = :sid AND is_current = 1 AND active = 1`，单条结果，无结果返回 404。

- [ ] **Step 5: 实现 `GET /api/v1/evaluation-categories`**

查 `edu_evaluation_category WHERE status = 'ACTIVE'`，构建三级树形 DTO。Level 3 节点含 `score = 1`。

- [ ] **Step 6: 运行全部测试，确认 PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: term module — current term query, category tree, month_key timezone"
```

---

## Task 04：月度配额配置与实体卡制卡

**Files:**
- Create: `src/main/java/com/school/growth/card/CardQuotaController.java`
- Create: `src/main/java/com/school/growth/card/CardGenerateService.java`
- Test: `src/test/java/com/school/growth/card/CardGenerateServiceTest.java`

**Interfaces:**
- Consumes: Task 02 `@AuthUser(role=manager)`、Task 03 `termId`
- Produces:
  - `POST /api/v1/admin/card-quotas` — 写 `card_quota_rule`，校验 `∑allocation = quotaN`
  - `POST /api/v1/admin/cards/generate-month` — 幂等批量写 `reward_card`（每张生成 UUID rawToken，存 SHA-256(rawToken) 到 token_hash）
  - `CardGenerateService.generateForMonth(termId, monthKey, teacherId) → List<Long>` 返回 cardId 列表

- [ ] **Step 1: 写失败测试**

```java
@Test void quota_rejects_when_allocation_sum_not_equal_n()
// allocationJson 总和 != quotaN → 400 INVALID_QUOTA_ALLOCATION

@Test void generate_month_is_idempotent()
// 同 (school_id, term_id, teacher_id, month_key, serial_no) 重复执行 → DB 行数不增加

@Test void token_hash_is_sha256_of_raw_token()
// rawToken 计算 SHA256，验证存入 DB 的 token_hash 一致
```

- [ ] **Step 2: 运行测试，确认 FAIL**

- [ ] **Step 3: 实现 `CardGenerateService`**

事务内批量 `INSERT IGNORE` + `uk_card_month_serial` 实现幂等。rawToken = `UUID.randomUUID().toString().replace("-","") + System.nanoTime()`，token_hash = `SHA256(rawToken)`（仅 token_hash 入库，rawToken 通过 Response 返回给管理员用于印刷）。

- [ ] **Step 4: 实现 `POST /api/v1/admin/card-quotas`（管理员专属）**

- [ ] **Step 5: 实现 `POST /api/v1/admin/cards/generate-month`（管理员专属）**

- [ ] **Step 6: 运行测试，PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: card module — quota config, idempotent card generation, SHA-256 token"
```

---

## Task 05：B模式扫码申领与教师审核入账（核心事务）

**Files:**
- Create: `src/main/java/com/school/growth/claim/CardClaimController.java`
- Create: `src/main/java/com/school/growth/claim/CardClaimService.java`（含审核事务）
- Test: `src/test/java/com/school/growth/claim/CardClaimServiceTest.java`

**Interfaces:**
- Consumes: Task 04 `reward_card`，Task 02 `ClassScopeGuard`，Task 03 `MonthKeyCalculator`
- Produces:
  - `GET /api/v1/student/cards/preview?token=<rawToken>` → 卡面信息（卡归属教师脱敏名、指标路径、validUntil、status）
  - `POST /api/v1/student/card-claims {token, requestKey}` → `{claimId, status:PENDING, pendingScore:1}`
  - `POST /api/v1/teacher/card-claims/{id}/decision {decision, rejectReason?, requestKey}` → 204
  - `CardClaimService.approve(claimId, teacherId)` — 含悲观锁事务，返回 `scoreRecordId`

- [ ] **Step 1: 写失败测试**

```java
@Test void preview_returns_card_info_by_sha256_token_lookup()
// GET preview?token=raw → server 计算 SHA256 查 DB

@Test void claim_creates_pending_and_locks_card()
// UNUSED 卡 POST → claim PENDING, card PENDING

@Test void concurrent_claim_second_request_returns_card_pending()
// 两个线程同时扫同一 UNUSED 卡，只有一个成功（行锁 + uk_claim_card）

@Test void claim_idempotent_with_same_request_key()
// 同 requestKey 重复 POST → 返回原 claimId，DB 无新行

@Test void approve_transitions_claim_and_card_and_inserts_score_record()
// 一个事务：claim→APPROVED, card→USED, score_record delta=1 插入

@Test void approve_writes_operation_audit_entry()

@Test void reject_voids_card_and_claim()
// claim→REJECTED, card→VOID

@Test void expired_card_claim_cannot_be_approved()
// claim.status=EXPIRED → 返回 CLAIM_NOT_PENDING
```

- [ ] **Step 2: 运行测试，全部 FAIL**

- [ ] **Step 3: 实现 `CardClaimService.claim(token, studentId, requestKey)`**

计算 `SHA256(token)` 查 `reward_card`；`SELECT FOR UPDATE`；校验 `UNUSED + validUntil >= NOW()`；`INSERT card_claim(PENDING)`；`UPDATE reward_card SET status=PENDING`；同事务 `INSERT notification_outbox(CLAIM_PENDING)` 。

- [ ] **Step 4: 实现 `CardClaimService.approve(claimId, teacherId, requestKey)`**

参照 Spec §7.1 事务伪代码：`FOR UPDATE card_claim` → `FOR UPDATE reward_card` → 校验 → `UPDATE claim=APPROVED` → `UPDATE card=USED` → `INSERT score_record(B_CARD, delta=1)` → `INSERT outbox(CLAIM_RESULT)` → `INSERT audit`。

- [ ] **Step 5: 实现 Controller 两端（学生扫码、教师审核）**

- [ ] **Step 6: 运行测试，全部 PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: claim module — scan preview, B-mode atomic approve/reject transaction"
```

---

## Task 06：A模式直评与积分冲销

**Files:**
- Create: `src/main/java/com/school/growth/score/ScoreController.java`
- Create: `src/main/java/com/school/growth/score/ScoreService.java`
- Test: `src/test/java/com/school/growth/score/ScoreServiceTest.java`

**Interfaces:**
- Consumes: Task 02 `ClassScopeGuard`，Task 05 `score_record` 表
- Produces:
  - `POST /api/v1/teacher/scores/direct-batch {studentIds[], categoryId, requestKey, remark?}` → `{results: [{studentId, scoreRecordId, status}]}`
  - `POST /api/v1/admin/scores/reversal {originalScoreId, reason, requestKey}` → 204
  - `GET /api/v1/student/scores?termId=` → `{byDimension: {D: 5, Z: 3, ...}, records: [...]}`

- [ ] **Step 1: 写失败测试**

```java
@Test void direct_batch_inserts_one_record_per_student_with_delta_1()
@Test void direct_batch_idempotent_same_request_key_returns_original_ids()
@Test void reversal_inserts_minus_1_record_linked_to_original()
@Test void reversal_second_time_same_original_id_returns_REVERSAL_ALREADY_EXISTS()
// uk_score_reversal_original 唯一键拦截
@Test void student_score_aggregate_sums_all_deltas_for_term()
@Test void reversal_writes_operation_audit()
```

- [ ] **Step 2: 运行测试，FAIL**

- [ ] **Step 3: 实现 `ScoreService.directBatch()`**

每个 studentId 单独 `INSERT score_record(A_DIRECT, delta=1)`，`requestKey = batchRequestKey + "_" + studentId`，`uk_score_request_key` 拦截重复，部分失败不阻断其他行。

- [ ] **Step 4: 实现 `ScoreService.reversal(originalScoreId, reason, requestKey)`**

先查原记录（校验 delta=1、school_id 一致），再 `INSERT score_record(REVERSAL, delta=-1, original_id=originalScoreId)`，`uk_score_reversal_original` 唯一约束硬拦截第二次。同事务写 `operation_audit(SCORE_REVERSAL)`。

- [ ] **Step 5: 实现 `GET /api/v1/student/scores`（学生只读）**

`SELECT SUM(delta) GROUP BY dimension_code` 聚合，同时返回原始流水列表（降序）。

- [ ] **Step 6: 运行测试，PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: score module — A-mode direct eval, immutable ledger, reversal"
```

---

## Task 07：荣誉申报、审核与撤销级联

**Files:**
- Create: `src/main/java/com/school/growth/honor/HonorController.java`
- Create: `src/main/java/com/school/growth/honor/HonorService.java`
- Test: `src/test/java/com/school/growth/honor/HonorServiceTest.java`

**Interfaces:**
- Consumes: Task 02 鉴权，Task 10 `EvaluationScoreService.triggerRecalc(studentId, termId)` (接口预留，Task 10 实现)
- Produces:
  - `POST /api/v1/student/honors` → `{honorId, honorPoints, status:SUBMITTED}`
  - `POST /api/v1/student/honors/{id}/resubmit` → 204
  - `POST /api/v1/teacher/honors/{id}/review {decision:APPROVE|RETURN, reason?}` → 204
  - `POST /api/v1/admin/honors/{id}/revoke {reason}` → 204（写 outbox 触发重算）
  - `HonorService.getApprovedPoints(studentId, termId) → int` 供综合评分使用

- [ ] **Step 1: 写失败测试**

```java
@Test void submit_honor_calculates_stored_honor_points()
// PROVINCE + FIRST → honor_points = 9（STORED 计算列，验证查回值）

@Test void duplicate_event_key_rejected_by_uk_honor_event()
// 同 student+term+event_key 第二次提交 → 409

@Test void revoke_triggers_recalc_via_outbox_message()
// revoke() 执行后 notification_outbox 存在 REPORT_RECALC_REQUIRED 消息

@Test void revoke_marks_honor_revoked_and_writes_audit()

@Test void material_revision_version_increments_on_resubmit()
// resubmit 后 material_revision.version_no 从 1 变为 2
```

- [ ] **Step 2: 运行测试，FAIL**

- [ ] **Step 3: 实现 `HonorService.submit()`**

写 `honor_record(SUBMITTED)` + `material_revision(version=1)`，`honor_points` 是 `STORED` 计算列，无需手动赋值。

- [ ] **Step 4: 实现 `HonorService.revoke(honorId, reason)`**

UPDATE `honor_record SET status=REVOKED`；同事务 `INSERT outbox(REPORT_RECALC_REQUIRED)`；`INSERT audit(HONOR_REVOKE)`。调用 `EvaluationScoreService.triggerRecalc()` 预留接口（Task 10 实现前用空实现）。

- [ ] **Step 5: 实现 Controller + 教师审核接口**

- [ ] **Step 6: 运行测试，PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: honor module — submit, review, revoke with cascade recalc trigger"
```

---

## Task 08：月度生活故事与 AI 预评分集成

**Files:**
- Create: `src/main/java/com/school/growth/story/StoryController.java`
- Create: `src/main/java/com/school/growth/story/StoryService.java`
- Create: `src/main/java/com/school/growth/story/AiEvalAdapter.java`（接口）
- Create: `src/main/java/com/school/growth/story/FallbackAiEvalAdapter.java`（无AI时空实现）
- Test: `src/test/java/com/school/growth/story/StoryServiceTest.java`

**Interfaces:**
- Consumes: Task 02 鉴权，`material_revision` 表
- Produces:
  - `POST /api/v1/student/stories {monthKey, textContent, isDraft}` → `{submissionId, aiStatus}`
  - `POST /api/v1/teacher/stories/{id}/review {teacherScore:0~100, comment}` → 204
  - `AiEvalAdapter.evaluate(text) → AiSuggestion`（异步，3s 超时）
  - `story_submission.ai_status` 枚举：`NOT_REQUESTED / PROCESSING / COMPLETED / FAILED / SKIPPED`

- [ ] **Step 1: 写失败测试**

```java
@Test void monthly_story_uk_prevents_duplicate_for_same_month()
// 同 school+student+term+month_key 第二次提交 → 409

@Test void ai_timeout_sets_ai_status_to_failed_not_blocks_submission()
// AiEvalAdapter mock 3s 超时 → ai_status=FAILED, submission 仍成功

@Test void teacher_score_saved_and_ai_suggestion_preserved_separately()
// teacher_score = 85，llm_suggestion 中有 AI 建议（不互相覆盖）

@Test void teacher_score_rejected_after_term_archived()
// academic_year.active = 0 时 PUT teacher_score → 403 TERM_ALREADY_ARCHIVED
```

- [ ] **Step 2: 运行测试，FAIL**

- [ ] **Step 3: 实现 `AiEvalAdapter` 接口 + `FallbackAiEvalAdapter`**

接口：`evaluate(text: String) → CompletableFuture<AiSuggestion>`，超时 3s 后抛异常，调用方 catch 后设 `ai_status=FAILED`。

- [ ] **Step 4: 实现 `StoryService.submit()`**

写 `story_submission(SUBMITTED)` + `material_revision(version=1)`；异步触发 AI 评估（不阻塞响应）；`ai_status` 更新由 AI 回调写。

- [ ] **Step 5: 实现 `StoryService.reviewTeacherScore()`**

验证学期 `active=1`，写 `teacher_score`，写 `operation_audit(STORY_SCORE_UPDATE)`。

- [ ] **Step 6: 运行测试，PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: story module — monthly submission, AI adapter with fallback, teacher score"
```

---

## Task 09：学科/五育成绩文件导入

**Files:**
- Create: `src/main/java/com/school/growth/import_/ImportController.java`
- Create: `src/main/java/com/school/growth/import_/ImportService.java`
- Create: `src/main/java/com/school/growth/import_/ExcelParser.java`
- Test: `src/test/java/com/school/growth/import_/ImportServiceTest.java`

**Interfaces:**
- Consumes: Task 02 鉴权
- Produces:
  - `POST /api/v1/import/preview` (Multipart) → `{rows: [{rowNo, status:NEW|CONFLICT|ERROR, oldValue?, newValue, errorMsg?}]}`
  - `POST /api/v1/import/commit {importType:DIM|SUBJECT, termId}` → `{batchNo, successCount, failCount}`
  - 写入 `student_dimension_score` 或 `subject_score`，带 `batch_no`

- [ ] **Step 1: 写失败测试**

```java
@Test void preview_rejects_file_larger_than_2MB()
// → 400 IMPORT_FILE_TOO_LARGE

@Test void preview_rejects_more_than_1000_rows()
// → 400 IMPORT_ROW_LIMIT_EXCEEDED

@Test void preview_returns_conflict_when_score_already_exists()
// 已有该生该维度成绩 → rowStatus=CONFLICT，展示 oldValue

@Test void commit_generates_batch_no_and_persists_all_rows()
// batch_no 格式 IMP_DIM_yyyyMMdd_schoolId_seq

@Test void commit_rolls_back_all_on_single_row_error()
// 若任一行写入失败 → 全量 ROLLBACK
```

- [ ] **Step 2: 运行测试，FAIL**

- [ ] **Step 3: 实现 `ExcelParser`**

使用 Apache POI（streaming SXSSFWorkbook），解析后验证行数 ≤ 1000、文件大小 ≤ 2MB（Multipart size 拦截）。

- [ ] **Step 4: 实现 `ImportService.preview()`**

纯内存比对，不写 DB。

- [ ] **Step 5: 实现 `ImportService.commit()`**

生成 `batch_no = IMP_{TYPE}_{yyyyMMdd}_{schoolId}_{seq}`，事务内批量 `INSERT`，失败全量 `ROLLBACK`。写 `operation_audit(IMPORT_COMMIT)`。

- [ ] **Step 6: 运行测试，PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: import module — in-memory parse, diff preview, atomic commit with batch_no"
```

---

## Task 10：综合评分规则管理与异步重算

**Files:**
- Create: `src/main/java/com/school/growth/evaluation/ScoreRuleController.java`
- Create: `src/main/java/com/school/growth/evaluation/EvaluationScoreService.java`
- Test: `src/test/java/com/school/growth/evaluation/EvaluationScoreServiceTest.java`

**Interfaces:**
- Consumes: Task 06 `ScoreService.getSumByDimension()`，Task 07 `HonorService.getApprovedPoints()`，Task 08 故事已确认分，Task 09 `student_dimension_score`
- Produces:
  - `GET /api/v1/student/comprehensive-score?termId=` → `{B, P, H, S, status:COMPLETE|INCOMPLETE}`
  - `EvaluationScoreService.triggerRecalc(studentId, termId)` — 异步重算（Task 07 调用）
  - `POST /api/v1/admin/rules` (管理员)— 写 `comprehensive_score_rule`，激活时将旧 ACTIVE 设为 DEPRECATED

- [ ] **Step 1: 写失败测试**

```java
@Test void returns_INCOMPLETE_when_any_dimension_missing()
// D 有确认成绩，Z 无 → status=INCOMPLETE

@Test void formula_matches_spec_example()
// D=88,Z=90,T=86,M=92,L=84,G=90, net_delta=20, honor_points=8
// B=88.33, P=100, H=66.67, S=round(0.8*88.33+0.15*100+0.05*66.67, 2)=89.00

@Test void activating_rule_deprecates_previous_active()
// 激活新规则 → 同 school+term 原 ACTIVE 变 DEPRECATED

@Test void recalc_triggered_after_honor_revoked()
// HonorService.revoke() 调用后 triggerRecalc() 被异步触发
```

- [ ] **Step 2: 运行测试，FAIL**

- [ ] **Step 3: 实现 `EvaluationScoreService.calculate(studentId, termId)`**

读 6 个 `student_dimension_score(CONFIRMED)` → 任意缺失返回 `INCOMPLETE`；读当前 `ACTIVE` 规则；按公式计算并封顶；结果缓存（可选）。

- [ ] **Step 4: 实现 `EvaluationScoreService.triggerRecalc()`**

投递到 `@Async` 线程池，异步执行 `calculate()` 并更新缓存/结果表。

- [ ] **Step 5: 实现规则激活逻辑**

同事务：`UPDATE old_rule SET rule_status=DEPRECATED`；`UPDATE new_rule SET rule_status=ACTIVE`。

- [ ] **Step 6: 运行测试，PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: evaluation module — score formula, INCOMPLETE guard, rule activation, async recalc"
```

---

## Task 11：期末报告生成、发布、PDF 导出与受控更正

**Files:**
- Create: `src/main/java/com/school/growth/report/ReportController.java`
- Create: `src/main/java/com/school/growth/report/ReportService.java`
- Create: `src/main/java/com/school/growth/report/PdfExportService.java`（iText7，异步）
- Test: `src/test/java/com/school/growth/report/ReportServiceTest.java`

**Interfaces:**
- Consumes: Task 10 `EvaluationScoreService`，Task 06 `score_record`，Task 07 `honor_record`，Task 09 成绩
- Produces:
  - `GET /api/v1/student/reports/current` → 报告 DTO（snapshot_json 展开）
  - `POST /api/v1/student/reports/{id}/export-pdf` → `{jobId}` (202)
  - `GET /api/v1/student/reports/{id}/export-pdf/status?jobId=` → `{status:PENDING|READY|FAILED, downloadUrl?}`
  - `POST /api/v1/admin/reports/publish-batch {termId, studentIds[]}` → `{published: [], blocked: [{studentId, reason}]}`

- [ ] **Step 1: 写失败测试**

```java
@Test void publish_blocked_when_any_dimension_missing()
// → blocked 列表包含该生，errorCode=REPORT_SCORE_INCOMPLETE

@Test void publish_blocked_when_no_active_rule()
// → blocked 包含该生，errorCode=REPORT_NO_ACTIVE_RULE

@Test void publish_blocked_when_teacher_not_confirmed()
// term_report.status=DRAFT → REPORT_NOT_CONFIRMED

@Test void publish_sets_status_to_published_and_writes_audit()

@Test void controlled_correction_creates_new_version_supersedes_old()
// 管理员受控更正 → version+1 报告 PUBLISHED，原版 SUPERSEDED

@Test void pdf_export_returns_job_id_and_eventually_ready()
// 异步生成：POST → 202+jobId；轮询 status → READY+downloadUrl
```

- [ ] **Step 2: 运行测试，FAIL**

- [ ] **Step 3: 实现 `ReportService.publishBatch()`**

对每个 studentId 逐一执行 6 项前置条件检查（见 Spec §FR-09.3），未通过加入 blocked 列表，通过则 `UPDATE term_report SET status=PUBLISHED`，写 `audit(REPORT_PUBLISH)`，写 `outbox(REPORT_PUBLISHED)`。

- [ ] **Step 4: 实现 `PdfExportService`**

`POST export-pdf` 生成 jobId，投递 `@Async` 任务；任务用 iText7 渲染报告快照（含学生姓名水印、下载时间）；完成后写 MinIO/OSS，更新 job 状态表；超时 60s 标记 `FAILED`。

- [ ] **Step 5: 实现受控更正**

管理员接口调用 `ReportService.correction()`：追加冲销 score_record → 重算综合分 → 创建新 version term_report(PUBLISHED) → 旧版 SUPERSEDED → 写 outbox(REPORT_UPDATED) → 写 audit(ARCHIVE_CORRECTION)。

- [ ] **Step 6: 运行测试，PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: report module — publish with 6-guard, PDF async export, controlled correction"
```

---

## Task 12：定时任务（卡过期与幂等锁）

**Files:**
- Create: `src/main/java/com/school/growth/scheduler/CardExpireScheduler.java`
- Test: `src/test/java/com/school/growth/scheduler/CardExpireSchedulerTest.java`

**Interfaces:**
- Consumes: `reward_card`、`card_claim` 表，Redis 分布式锁
- Produces: 每 10 分钟：UNUSED 卡月末过期；PENDING 申领宽限期超时过期；写 `operation_audit`

- [ ] **Step 1: 写失败测试**

```java
@Test void unused_card_expired_after_valid_until()
// 插入 valid_until = 过去时间的 UNUSED 卡，调度器执行后 status=EXPIRED

@Test void pending_claim_expired_after_grace_period()
// claim.claimed_at = 超过宽限期，调度器执行后 claim+card 均=EXPIRED

@Test void scheduler_idempotent_with_redis_lock()
// 模拟两次并发触发，Redis 锁保证只有一次实际执行，DB 行数不重复变更
```

- [ ] **Step 2: 实现 `CardExpireScheduler`**

`@Scheduled(fixedRate = 600_000)` + `StringRedisTemplate.opsForValue().setIfAbsent("lock:expire_job:{yyyyMMdd}", "1", 15, MINUTES)`；批量 200 行 `UPDATE`，失败记告警日志，不抛异常（幂等安全）。

- [ ] **Step 3: 运行测试，PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: scheduler — card expire tasks A/B with Redis idempotent lock"
```

---

## Task 13：通知外发守护服务

**Files:**
- Create: `src/main/java/com/school/growth/notification/OutboxDeliveryService.java`
- Create: `src/main/java/com/school/growth/notification/NotificationChannelAdapter.java`（接口）
- Test: `src/test/java/com/school/growth/notification/OutboxDeliveryServiceTest.java`

**Interfaces:**
- Consumes: `notification_outbox` 表，`NotificationChannelAdapter`（实现：钉钉/站内信）
- Produces: 每 10 秒扫 PENDING → 投递 → 指数退避重试（10s/30s/60s/120s/300s，5次上限）→ SENT 或 FAILED

- [ ] **Step 1: 写失败测试**

```java
@Test void pending_outbox_delivered_and_marked_sent()
@Test void failed_delivery_retried_up_to_5_times_then_marked_failed()
@Test void already_sent_message_not_redelivered()
```

- [ ] **Step 2: 实现 `OutboxDeliveryService`**

`@Scheduled(fixedRate = 10_000)` 查 PENDING + attempts < 5，调用 `NotificationChannelAdapter.send()`，成功 UPDATE SENT，失败 UPDATE attempts+1 并按退避设 `scheduled_at`。

- [ ] **Step 3: 实现 `NullNotificationChannelAdapter`（本地开发无外部依赖用）**

- [ ] **Step 4: 运行测试，PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: notification module — outbox delivery with exponential backoff retry"
```

---

## Task 14：前端三端（学生 / 教师 / 管理员）

**Files:**
- Create: `frontend/student/`（Vue 3 / React，移动端适配）
- Create: `frontend/teacher/`（移动端优先：待审扫码 + 荣誉/故事审核）
- Create: `frontend/admin/`（管理后台：PC端）

**Interfaces:**
- Consumes: Task 02~13 全部后端接口
- Produces: 三个独立 SPA，对应各角色核心主流程

**子任务 14-A：教师端（最高优先级）**

- [ ] **教师扫码审核列表**（`GET /teacher/card-claims`）
- [ ] **审核决定操作**（`POST /teacher/card-claims/{id}/decision`）+ 防重提交锁（前端 requestKey）
- [ ] **荣誉审核、故事终审分录入**

**子任务 14-B：学生端（次优先级）**

- [ ] **移动端扫码申领**（`GET /cards/preview` → `POST /card-claims`）+ requestKey 本地生成
- [ ] **积分明细流水账**（`GET /student/scores`）
- [ ] **荣誉申报表单 + 证书上传**
- [ ] **月度故事提交**
- [ ] **期末报告查看 + PDF 导出（轮询 jobId）**

**子任务 14-C：管理员后台**

- [ ] **学期配置 + 配额设置 + 月度制卡**
- [ ] **成绩导入（预览 Diff 表格 + 确认）**
- [ ] **综合规则激活**
- [ ] **报告批量发布（展示 blocked 列表）**
- [ ] **审计日志查看**

- [ ] **Step N: Commit（每个子任务完成后各 commit 一次）**

```bash
git commit -m "feat: frontend teacher — scan review, honor/story audit"
git commit -m "feat: frontend student — scan claim, score ledger, reports"
git commit -m "feat: frontend admin — term config, import, report publish"
```

---

## 开发顺序关键路径

```
Week 1-2 : Task01(DB) → Task02(Auth)
Week 3   : Task03(Term/Category)
Week 4-5 : Task04(Card) → Task05(Claim+B-mode) ← 核心路径，最复杂
Week 5-6 : Task06(Score/Reversal)
Week 6-7 : Task07(Honor) + Task08(Story) — 可并行
Week 7-8 : Task09(Import)
Week 8-9 : Task10(Evaluation) ← 依赖 07/08/09
Week 9-10: Task11(Report+PDF) ← 依赖 10
Week 10  : Task12(Scheduler) + Task13(Notification) — 可并行
Week 11-15: Task14(Frontend 三端) — 最长，并行 14-A/B/C
```
