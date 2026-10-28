/**
 * renovation_stories.integration.test.js — 任务 06 故事建议与终审集成测试
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { submitStory, reviewStory } = require('../controllers/storyController');

describe('Task 06: 故事建议与终审集成测试', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_stories_' + Date.now();
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
        (101, 1, 'teacher_demo', 'hash123', '李老师', 'teacher', 0),
        (102, 1, 'teacher_other', 'hash123', '张老师', 'teacher', 0);
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES (201, 1, 'student_test', 'hash123', '王同学', 'student', 4, 1, 0);
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  let createdStoryId = null;

  test('学生保存草稿再正式提交，生成 AI 规则建议分并留存版本', async () => {
    // 1. 保存草稿
    const draftReq = {
      conn: connection,
      body: {
        title: '我的成长故事',
        content: '这是我在学校的一天……',
        monthKey: '2026-10',
        isDraft: true
      },
      user: { id: 201, schoolId: 1, role: 'student' }
    };

    let draftResData = null;
    const draftRes = {
      status: () => draftRes,
      json: (d) => { draftResData = d; return draftRes; }
    };

    await submitStory(draftReq, draftRes, (err) => { if (err) throw err; });
    assert.equal(draftResData?.code, 200);
    assert.equal(draftResData?.data?.status, 'DRAFT');
    createdStoryId = draftResData?.data?.id;
    assert.ok(createdStoryId > 0);

    // 2. 正式提交
    const submitReq = {
      conn: connection,
      body: {
        title: '我的成长故事（终版）',
        content: '这是我在学校充实的一天，今天我帮助了新同学熟悉校园环境，这让我懂得互助友爱的珍贵。',
        monthKey: '2026-10',
        isDraft: false
      },
      user: { id: 201, schoolId: 1, role: 'student' }
    };

    let submitResData = null;
    const submitRes = {
      status: () => submitRes,
      json: (d) => { submitResData = d; return submitRes; }
    };

    await submitStory(submitReq, submitRes, (err) => { if (err) throw err; });
    assert.equal(submitResData?.code, 200);
    assert.equal(submitResData?.data?.status, 'SUBMITTED');
    assert.ok(submitResData?.data?.aiScore > 0);

    // 检查版本号为 2
    const [[row]] = await connection.query('SELECT current_version, status, ai_score FROM story_submission WHERE id = ?', [createdStoryId]);
    assert.equal(row.current_version, 2);
    assert.equal(row.status, 'SUBMITTED');
  });

  test('越权跨班教师审核被拒绝 403，授权教师审核通过确认正式分', async () => {
    // 越权教师（没有 4年级1班 权限）
    const unauthReq = {
      conn: connection,
      params: { id: createdStoryId },
      body: { teacherScore: 88, teacherComment: '不错' },
      user: { id: 102, schoolId: 1, role: 'teacher', classes: [{ grade: 3, class_no: 1 }] }
    };
    const unauthRes = { status: () => unauthRes, json: () => unauthRes };

    await assert.rejects(
      async () => {
        await reviewStory(unauthReq, unauthRes, (err) => { if (err) throw err; });
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // 授权教师终审打分
    const reviewReq = {
      conn: connection,
      params: { id: createdStoryId },
      body: { teacherScore: 95, teacherComment: '叙事真挚，善于助人！' },
      user: { id: 101, schoolId: 1, role: 'teacher', classes: [{ grade: 4, class_no: 1 }] }
    };

    let reviewResData = null;
    const reviewRes = {
      status: () => reviewRes,
      json: (d) => { reviewResData = d; return reviewRes; }
    };

    await reviewStory(reviewReq, reviewRes, (err) => { if (err) throw err; });
    assert.equal(reviewResData?.code, 200);
    assert.equal(reviewResData?.data?.status, 'REVIEWED');
    assert.equal(reviewResData?.data?.teacherScore, 95);

    // 检查数据库主表
    const [[reviewed]] = await connection.query('SELECT status, teacher_score, reviewer_id FROM story_submission WHERE id = ?', [createdStoryId]);
    assert.equal(reviewed.status, 'REVIEWED');
    assert.equal(Number(reviewed.teacher_score), 95);
    assert.equal(Number(reviewed.reviewer_id), 101);
  });

  test('已终审故事严禁被学生重新提交覆盖 (409)', async () => {
    const overwriteReq = {
      conn: connection,
      body: {
        title: '恶意篡改已终审故事',
        content: '试图重新提交新的内容……',
        monthKey: '2026-10',
        isDraft: false
      },
      user: { id: 201, schoolId: 1, role: 'student' }
    };
    const res = { status: () => res, json: () => res };

    await assert.rejects(
      async () => {
        await submitStory(overwriteReq, res, (err) => { if (err) throw err; });
      },
      (err) => {
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });
});
