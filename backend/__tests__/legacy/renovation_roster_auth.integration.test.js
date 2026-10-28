/**
 * backend/__tests__/renovation_roster_auth.integration.test.js
 *
 * 任务 17: 学籍表导入权限与安全防覆盖集成测试
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const rosterImportService = require('../services/rosterImportService');

describe('Task 17: 学籍表导入权限与安全防覆盖集成测试', () => {
  let connection;
  let testDbName;
  const managerId = 101;
  const teacherId = 102;
  const studentId = 201;

  before(async () => {
    testDbName = 'test_renovation_roster_' + Date.now();
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
        (${managerId}, 1, 'admin_roster', 'hash123', '教导主任', 'manager', 0),
        (${teacherId}, 1, 'teacher_roster', 'hash123', '张老师', 'teacher', 0);
      
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES (${studentId}, 1, 'STU_2026_01', 'hash123', '陈晨', 'student', 4, 1, 0);

      INSERT INTO student_term_state (school_id, term_id, student_id, source_revision, profile_revision)
      VALUES (1, 1, ${studentId}, 1, 1);
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  let previewKey;
  let previewItems;

  test('1. 预览导入能精准识别新增、更新、冲突与重名', async () => {
    const rows = [
      // 更新（转班）
      { studentNo: 'STU_2026_01', realName: '陈晨', grade: 4, classNo: 2 },
      // 新增
      { studentNo: 'STU_2026_02', realName: '王小丫', grade: 4, classNo: 1 },
      // 冲突：学号已被陈晨占用，提交姓名却是李强
      { studentNo: 'STU_2026_01', realName: '李强', grade: 4, classNo: 1 },
      // 重名不同学号：也叫陈晨，但新学号 STU_2026_03
      { studentNo: 'STU_2026_03', realName: '陈晨', grade: 3, classNo: 1 }
    ];

    const res = await rosterImportService.previewRosterImport({
      actor: { id: managerId, role: 'manager', schoolId: 1 },
      schoolId: 1,
      termId: 1,
      rows,
      connection
    });

    assert.ok(res);
    assert.equal(res.summary.total, 4);
    assert.equal(res.summary.updateCount, 1);
    assert.equal(res.summary.insertCount, 2);
    assert.equal(res.summary.conflictCount, 1);

    previewKey = res.previewKey;
    previewItems = res.items;
  });

  test('2. 正式提交入库：新学生成功创建且角色恒为 student，原学生更新班级并递增 profile_revision', async () => {
    // 注入恶意篡改角色
    previewItems[0].role = 'manager';

    const commitRes = await rosterImportService.commitRosterImport({
      actor: { id: managerId, role: 'manager', schoolId: 1 },
      schoolId: 1,
      termId: 1,
      previewKey,
      items: previewItems,
      connection
    });

    assert.equal(commitRes.success, true);
    assert.equal(commitRes.inserted, 2);
    assert.equal(commitRes.updated, 1);
    assert.equal(commitRes.skippedConflicts, 1);

    // 检查转班学生角色未被提权，且班级更新
    const [u1] = await connection.query("SELECT role, grade, class_no FROM users WHERE id = ?", [studentId]);
    assert.equal(u1[0].role, 'student', '角色严禁被提权为 manager');
    assert.equal(u1[0].class_no, 2, '班级成功更新为 2 班');

    // 检查 profile_revision 递增
    const [s1] = await connection.query("SELECT profile_revision FROM student_term_state WHERE student_id = ? AND term_id = 1", [studentId]);
    assert.equal(s1[0].profile_revision, 2, 'profile_revision 应自增为 2');

    // 检查重名新生是否独立创建，未与原学生合并
    const [u3] = await connection.query("SELECT id, username, real_name FROM users WHERE username = 'STU_2026_03'");
    assert.equal(u3.length, 1);
    assert.notEqual(u3[0].id, studentId, '重名新学生必须创建独立用户');
  });

  test('3. 教师调用学籍导入预览被拒绝 (403)', async () => {
    await assert.rejects(
      async () => {
        await rosterImportService.previewRosterImport({
          actor: { id: teacherId, role: 'teacher', schoolId: 1 },
          schoolId: 1,
          termId: 1,
          rows: [],
          connection
        });
      },
      (err) => {
        assert.equal(err.status, 403);
        return true;
      }
    );
  });

  test('4. 学生调用学籍导入落库被拒绝 (403)', async () => {
    await assert.rejects(
      async () => {
        await rosterImportService.commitRosterImport({
          actor: { id: studentId, role: 'student', schoolId: 1 },
          schoolId: 1,
          termId: 1,
          previewKey: 'any',
          items: [],
          connection
        });
      },
      (err) => {
        assert.equal(err.status, 403);
        return true;
      }
    );
  });
});
