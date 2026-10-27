/**
 * backend/__tests__/renovation_growth.integration.test.js
 *
 * 任务 16: 学生成长首页与主题集成测试
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const growthController = require('../controllers/growthController');

describe('Task 16: 学生成长首页与主题集成测试', () => {
  let connection;
  let testDbName;
  const studentAId = 201;
  const studentBId = 202;
  const managerId = 101;

  before(async () => {
    testDbName = 'test_renovation_growth_' + Date.now();
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
      VALUES (${managerId}, 1, 'admin_demo', 'hash123', '管理员', 'manager', 0);
      
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES 
        (${studentAId}, 1, 'student_a', 'hash123', '李明', 'student', 4, 1, 0),
        (${studentBId}, 1, 'student_b', 'hash123', '张华', 'student', 4, 1, 0);

      INSERT INTO student_term_state (school_id, term_id, student_id, source_revision, profile_revision)
      VALUES 
        (1, 1, ${studentAId}, 1, 1),
        (1, 1, ${studentBId}, 1, 1);

      INSERT INTO edu_evaluation_category (id, parent_id, category_level, category_code, category_name, score, status, version)
      VALUES (1, 0, 1, 'D', '德育', 0, 1, 'V2');

      INSERT INTO score_record (
        school_id, term_id, student_id, class_snapshot, dimension_code, category_id,
        source, delta, operator_id, request_key, remark
      ) VALUES (
        1, 1, ${studentAId}, '{"grade":4,"class_no":1}', 'D', 1,
        'A_DIRECT', 1, ${managerId}, 'REQ_TEST_001', '劳动扫除表现积极'
      );
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  test('1. 学生本人成功读取成长首页与真实足迹，趣味成长等级明确与官方评价区分', async () => {
    const data = await growthController.getMyGrowthData({
      actor: { id: studentAId, role: 'student', schoolId: 1 },
      studentId: studentAId,
      termId: 1,
      connection
    });

    assert.ok(data);
    assert.equal(data.studentProfile.id, studentAId);
    assert.ok(Array.isArray(data.timeline));
    assert.equal(data.timeline.length, 1);
    assert.equal(data.timeline[0].title, '获得激励积分 +1');
    assert.ok(data.gameLevel);
    assert.equal(data.gameLevel.isOfficial, false);
    assert.equal(data.gameLevel.level, 1); // 1 分对应 Level 1
    assert.ok(data.gameLevel.levelName.includes('Level 1'));
  });

  test('2. 跨学生读取他人成长足迹被严格阻断 (403)', async () => {
    await assert.rejects(
      async () => {
        await growthController.getMyGrowthData({
          actor: { id: studentBId, role: 'student', schoolId: 1 },
          studentId: studentAId,
          termId: 1,
          connection
        });
      },
      (err) => {
        assert.equal(err.status, 403);
        return true;
      }
    );
  });

  test('3. 管理员尝试读取学生个人成长足迹被严格阻断 (403)', async () => {
    await assert.rejects(
      async () => {
        await growthController.getMyGrowthData({
          actor: { id: managerId, role: 'manager', schoolId: 1 },
          studentId: studentAId,
          termId: 1,
          connection
        });
      },
      (err) => {
        assert.equal(err.status, 403);
        return true;
      }
    );
  });

  test('4. 切换学生主题成功，且账本积分与版本零漂移', async () => {
    const [beforeEvents] = await connection.query("SELECT COUNT(*) AS c FROM score_record WHERE student_id = ?", [studentAId]);
    const [beforeState] = await connection.query("SELECT source_revision, profile_revision FROM student_term_state WHERE student_id = ? AND term_id = 1", [studentAId]);

    const result = await growthController.setStudentTheme({
      actor: { id: studentAId, role: 'student', schoolId: 1 },
      themeId: 'ocean',
      connection
    });

    assert.equal(result.success, true);
    assert.equal(result.themeId, 'ocean');

    // 再次查验
    const [afterEvents] = await connection.query("SELECT COUNT(*) AS c FROM score_record WHERE student_id = ?", [studentAId]);
    const [afterState] = await connection.query("SELECT source_revision, profile_revision FROM student_term_state WHERE student_id = ? AND term_id = 1", [studentAId]);

    assert.equal(afterEvents[0].c, beforeEvents[0].c, '积分流水条数不变');
    assert.equal(afterState[0].source_revision, beforeState[0].source_revision, '评价源版本不变');
  });

  test('5. 非法主题参数被拒绝 (400)', async () => {
    await assert.rejects(
      async () => {
        await growthController.setStudentTheme({
          actor: { id: studentAId, role: 'student', schoolId: 1 },
          themeId: 'invalid_theme_name',
          connection
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        return true;
      }
    );
  });
});
