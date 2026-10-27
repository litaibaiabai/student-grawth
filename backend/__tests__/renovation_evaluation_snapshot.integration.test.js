/**
 * renovation_evaluation_snapshot.integration.test.js — 任务 10 自动六育评价快照集成测试
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { buildEvaluationSnapshot } = require('../services/evaluationSnapshotService');

describe('Task 10: 自动六育评价快照集成测试', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_eval_' + Date.now();
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });

    await connection.query(`CREATE DATABASE \`${testDbName}\` DEFAULT CHARACTER SET utf8mb4`);
    await connection.query(`USE \`${testDbName}\``);

    // 加载 schema 并应用全量迁移
    const root = path.resolve(__dirname, '../..');
    const fullSchema = fs.readFileSync(path.join(root, 'sql/00_full_schema.sql'), 'utf8')
      .replaceAll('`student_growth`', '`' + testDbName + '`');
    await connection.query(fullSchema);

    const { applyRegisteredMigrations } = require('../services/migrationRunner');
    require('../migrations/renovation');
    await applyRegisteredMigrations({ connection, databaseName: testDbName });

    // 初始化基础数据
    await connection.query(`
      INSERT INTO academic_year (id, school_id, academic_year, semester, start_date, end_date, is_current, active)
      VALUES (1, 1, '2026-2027', 1, '2026-09-01', '2027-01-31', 1, 1);
      INSERT INTO users (id, school_id, username, password, real_name, role, status)
      VALUES 
        (101, 1, 'teacher_test', 'hash123', '张老师', 'teacher', 0);
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES 
        (201, 1, 'student_01', 'hash123', '小明', 'student', 4, 1, 0);
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  test('1. 未配置有效规则时，明确返回 null，不隐式默认硬编码', async () => {
    const res = await buildEvaluationSnapshot({
      studentKey: { schoolId: 1, termId: 1, studentId: 201 },
      policyVersion: 'NON_EXISTENT_RULE',
      connection
    });

    assert.equal(res, null);
  });

  test('2. 故事均值聚合(80与90分均值为85.00)，荣誉单次计算，正确生成快照', async () => {
    // 写入规则
    await connection.query(`
      INSERT INTO comprehensive_score_rule
      (school_id, term_id, rule_version, six_weight, process_weight, honor_weight, process_target, honor_target, rule_status)
      VALUES (1, 1, 'TEST_ONLY_V2', 0.70, 0.20, 0.10, 20.00, 10.00, 'ACTIVE')
      ON DUPLICATE KEY UPDATE rule_status = 'ACTIVE'
    `);

    // 写入 2 篇终审故事：80 分与 90 分
    await connection.query(`
      INSERT INTO story_submission (school_id, term_id, student_id, month_key, status, current_version, teacher_score, reviewer_id, reviewed_at)
      VALUES 
        (1, 1, 201, '2026-09', 'REVIEWED', 1, 80.00, 101, NOW()),
        (1, 1, 201, '2026-10', 'REVIEWED', 1, 90.00, 101, NOW())
    `);

    // 写入五育维度基础分
    for (const d of ['D', 'Z', 'T', 'M', 'L']) {
      await connection.query(`
        INSERT INTO student_dimension_score (school_id, term_id, student_id, dimension_code, score_100)
        VALUES (1, 1, 201, ?, 90.00)
      `, [d]);
    }

    // 写入 1 项认定荣誉 (4 分)
    await connection.query(`
      INSERT INTO honor_record (school_id, term_id, student_id, event_key, title, award_level, prize_level, award_points, status, reviewer_id, reviewed_at, material_version)
      VALUES (1, 1, 201, 'EVT_001', '优秀标兵', 'DISTRICT', 'FIRST', 4, 'APPROVED', 101, NOW(), 1)
    `);

    const snapshot = await buildEvaluationSnapshot({
      studentKey: { schoolId: 1, termId: 1, studentId: 201 },
      policyVersion: 'TEST_ONLY_V2',
      connection
    });

    assert.ok(snapshot);
    assert.equal(snapshot.policyVersion, 'TEST_ONLY_V2');
    assert.equal(snapshot.sixDimensions.G.value, '85.00'); // (80 + 90) / 2 = 85.00
    assert.equal(snapshot.honor.approvedCount, 1);
    assert.equal(snapshot.honor.approvedPoints, '4.00');
    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.missingReasons.length, 0);

    // 验证快照表持久化
    const [snapRows] = await connection.query(
      "SELECT * FROM student_evaluation_snapshot WHERE student_id = 201 AND policy_version = 'TEST_ONLY_V2'"
    );
    assert.equal(snapRows.length, 1);
  });
});
