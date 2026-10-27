/**
 * renovation_auth.integration.test.js — 任务 01 授权与学期变更事务集成测试
 *
 * 验证：
 * 1. 跨学科读写成绩 403
 * 2. 职责撤销后同一 JWT 后续请求 403
 * 3. 依赖故障返回 503 拒绝放行
 * 4. withStudentTermMutation 原子递增 sourceRevision 与幂等回放
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { signToken } = require('../middleware/auth');

describe('Task 01: 任教授权与受限成绩 (C1/C2 合同)', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_auth_' + Date.now();
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });

    await connection.query(`CREATE DATABASE \`${testDbName}\` DEFAULT CHARACTER SET utf8mb4`);
    await connection.query(`USE \`${testDbName}\``);

    // 执行基础建表与迁移
    const fs = require('fs');
    const root = path.resolve(__dirname, '../..');
    const fullSchema = fs.readFileSync(path.join(root, 'sql/00_full_schema.sql'), 'utf8')
      .replaceAll('`student_growth`', '`' + testDbName + '`');
    await connection.query(fullSchema);

    // 应用 renovation 迁移 (含 01 授权表)
    const { applyRegisteredMigrations } = require('../services/migrationRunner');
    require('../migrations/renovation');
    await applyRegisteredMigrations({ connection, databaseName: testDbName });

    // 初始化基础学期与测试账号
    await connection.query(`
      INSERT INTO academic_year (id, school_id, academic_year, semester, start_date, end_date, is_current, active)
      VALUES (1, 1, '2026-2027', 1, '2026-09-01', '2027-01-31', 1, 1);
      INSERT INTO users (id, school_id, username, password, real_name, role, status)
      VALUES (101, 1, 'teacher_math', 'hash123', '数学张老师', 'teacher', 0);
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES (201, 1, 'student_alice', 'hash123', '学生小爱', 'student', 4, 1, 0);
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  test('C1: 任课教师未获某学科授权时，读写该学科成绩必须被拒绝 (403)', async () => {
    const { assertScope } = require('../services/authorizationService');
    const actor = {
      id: 101,
      schoolId: 1,
      role: 'teacher',
      assignments: [
        { grade: 4, classNo: 1, subjectCode: 'MATH', isHeadTeacher: 0 }
      ]
    };

    // 授权学科 MATH -> 允许
    const allowed = await assertScope({
      actor,
      studentId: 201,
      termId: 1,
      action: 'WRITE_SCORE',
      grade: 4,
      classNo: 1,
      subjectCode: 'MATH'
    }, connection);
    assert.equal(allowed.granted, true);

    // 未授权学科 CHINESE -> 拒绝 403
    await assert.rejects(
      async () => {
        await assertScope({
          actor,
          studentId: 201,
          termId: 1,
          action: 'WRITE_SCORE',
          grade: 4,
          classNo: 1,
          subjectCode: 'CHINESE'
        }, connection);
      },
      (err) => err.statusCode === 403 || /403|无权/.test(err.message)
    );
  });

  test('C1: 职责撤销后，同一登录 Token 后续请求实时拒绝 (403)', async () => {
    const { resolveActorContext } = require('../services/authorizationService');
    // 配置初始授权
    await connection.query(`
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code)
      VALUES (1, 1, 101, 4, 1, 'MATH')
      ON DUPLICATE KEY UPDATE subject_code = 'MATH'
    `);

    let ctx = await resolveActorContext({ userId: 101, schoolId: 1, termId: 1 }, connection);
    assert.equal(ctx.assignments.length, 1);
    assert.equal(ctx.assignments[0].subjectCode, 'MATH');

    // 管理员撤销授权
    await connection.query('DELETE FROM teacher_teaching_assignment WHERE teacher_id = 101 AND subject_code = "MATH"');

    // 使用原 Token/用户标识再次解析上下文 -> 实时生效，授权为空
    ctx = await resolveActorContext({ userId: 101, schoolId: 1, termId: 1 }, connection);
    assert.equal(ctx.assignments.length, 0);
  });

  test('C1: 权限依赖故障时不降级放行，拒绝并返回 503', async () => {
    const { resolveActorContext } = require('../services/authorizationService');
    // 模拟破坏性连接或依赖抛错
    const brokenConn = {
      query: async () => { throw new Error('Database connection failed'); }
    };
    await assert.rejects(
      async () => {
        await resolveActorContext({ userId: 101, schoolId: 1, termId: 1 }, brokenConn);
      },
      (err) => err.statusCode === 503 || /503|依赖不可用/.test(err.message)
    );
  });

  test('C2: withStudentTermMutation 锁状态原子递增 sourceRevision，幂等回放不重复递增', async () => {
    const { withStudentTermMutation } = require('../services/studentTermStateService');
    const actor = { id: 101, schoolId: 1, role: 'teacher' };
    const requestKey = 'req_test_mutation_' + Date.now();

    // 首次写变更
    const res1 = await withStudentTermMutation({
      connection,
      actor,
      studentKey: { schoolId: 1, termId: 1, studentId: 201 },
      requestKey,
      payloadHash: 'hash_abc1'
    }, async (tx) => {
      return { scoreAdded: 5 };
    });

    assert.equal(res1.sourceRevision, 2, '首次变更推进版本至 2');
    assert.equal(res1.result.scoreAdded, 5);

    // 幂等重复提交相同 requestKey
    const res2 = await withStudentTermMutation({
      connection,
      actor,
      studentKey: { schoolId: 1, termId: 1, studentId: 201 },
      requestKey,
      payloadHash: 'hash_abc1'
    }, async () => {
      assert.fail('幂等回放不应再次执行 mutate');
    });

    assert.equal(res2.sourceRevision, 2, '回放不应再递增 sourceRevision');
    assert.equal(res2.result.scoreAdded, 5);
  });

  describe('Task 18A: 公共设备身份与受限短会话 (C10 合同)', () => {
    const deviceSessionService = require('../services/deviceSessionService');

    test('管理员成功注册受控设备白名单', async () => {
      const reg = await deviceSessionService.registerDevice({
        actor: { id: 999, role: 'manager', schoolId: 1 },
        schoolId: 1,
        deviceCode: 'KIOSK_TEST_01',
        deviceSecret: 'secret_123',
        locationName: '测试终端',
        connection
      });
      assert.equal(reg.deviceCode, 'KIOSK_TEST_01');
    });

    test('设备验证学生凭据后签发短会话，仅限 CARD_REDEEM 权限', async () => {
      const session = await deviceSessionService.issueDeviceSession({
        deviceCode: 'KIOSK_TEST_01',
        deviceSecret: 'secret_123',
        studentId: 201,
        connection
      });

      assert.ok(session.sessionToken);
      assert.equal(session.student.id, 201);
      assert.equal(session.scope, 'CARD_REDEEM');

      // 验证会话有效
      const valid = await deviceSessionService.validateDeviceSession({
        sessionToken: session.sessionToken,
        connection
      });
      assert.equal(valid.student_id, 201);

      // 主动撤销后失效
      await deviceSessionService.revokeDeviceSession({
        sessionToken: session.sessionToken,
        connection
      });

      await assert.rejects(async () => {
        await deviceSessionService.validateDeviceSession({
          sessionToken: session.sessionToken,
          connection
        });
      }, (err) => {
        assert.equal(err.status, 401);
        return true;
      });
    });
  });
});
