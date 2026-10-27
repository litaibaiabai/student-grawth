/**
 * renovation_reports.integration.test.js — 任务 11 报告草稿与教师确认集成测试
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { buildDraft, confirmDraft, getDraft } = require('../services/reportDraftService');

describe('Task 11: 报告草稿与教师确认集成测试', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_reports_' + Date.now();
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
        (101, 1, 'headmaster_01', 'hash123', '班主任李老师', 'teacher', 0),
        (102, 1, 'subject_teacher', 'hash123', '科任王老师', 'teacher', 0),
        (999, 1, 'admin_user', 'hash123', '管理员', 'manager', 0);
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES 
        (201, 1, 'student_01', 'hash123', '小明', 'student', 4, 1, 0);
      INSERT INTO comprehensive_score_rule
        (school_id, term_id, rule_version, six_weight, process_weight, honor_weight, process_target, honor_target, rule_status)
      VALUES 
        (1, 1, 'TEST_V1', 0.70, 0.20, 0.10, 20.00, 10.00, 'ACTIVE');
      INSERT INTO teacher_teaching_assignment
        (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES
        (1, 1, 101, 4, 1, 'CHINESE', 1),
        (1, 1, 102, 4, 1, 'MATH', 0);
    `);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  let draftId;
  let fingerprint;

  test('1. 非班主任教师或管理员读取草稿正文被拒绝 (403)', async () => {
    // 管理员访问
    await assert.rejects(
      async () => {
        await buildDraft({
          actor: { id: 999, role: 'admin' },
          studentKey: { schoolId: 1, termId: 1, studentId: 201, grade: 4, classNo: 1 },
          connection
        });
      },
      (err) => err.status === 403 || err.statusCode === 403
    );

    // 非班主任教师访问
    await assert.rejects(
      async () => {
        await buildDraft({
          actor: { id: 102, role: 'teacher' },
          studentKey: { schoolId: 1, termId: 1, studentId: 201, grade: 4, classNo: 1 },
          connection
        });
      },
      (err) => err.status === 403 || err.statusCode === 403
    );
  });

  test('2. 班主任成功构建草稿并生成审批指纹', async () => {
    const draft = await buildDraft({
      actor: { id: 101, role: 'teacher' },
      studentKey: { schoolId: 1, termId: 1, studentId: 201, grade: 4, classNo: 1 },
      connection
    });

    assert.ok(draft);
    assert.ok(draft.draftId);
    assert.ok(draft.approvalFingerprint);
    assert.equal(draft.status, 'DRAFT');
    assert.equal(draft.sourceRevision, 1);

    draftId = draft.draftId;
    fingerprint = draft.approvalFingerprint;
  });

  test('3. 班主任手写学期寄语并确认草稿', async () => {
    const result = await confirmDraft({
      actor: { id: 101, role: 'teacher' },
      draftId,
      expectedFingerprint: fingerprint,
      comment: '期末寄语：在各方面表现优异，有责任心。',
      connection
    });

    assert.ok(result);
    assert.equal(result.status, 'CONFIRMED');
    assert.equal(result.teacherComment, '期末寄语：在各方面表现优异，有责任心。');

    // 验证历史记录表
    const [revs] = await connection.query("SELECT * FROM report_comment_revision WHERE draft_id = ?", [draftId]);
    assert.equal(revs.length, 1);
    assert.equal(revs[0].comment_text, '期末寄语：在各方面表现优异，有责任心。');
  });

  test('4. 来源数据变更使草稿重新变为待确认', async () => {
    // 模拟数据源变更，source_revision 递增
    await connection.query(`
      INSERT INTO student_term_state (school_id, term_id, student_id, source_revision)
      VALUES (1, 1, 201, 2)
      ON DUPLICATE KEY UPDATE source_revision = source_revision + 1
    `);

    const recheck = await getDraft({
      actor: { id: 101, role: 'teacher' },
      draftId,
      connection
    });

    assert.equal(recheck.isStale, true);
    assert.equal(recheck.status, 'PENDING_CONFIRMATION');
  });

  test('5. 携带陈旧指纹确认草稿抛出 409 Conflict', async () => {
    await assert.rejects(
      async () => {
        await confirmDraft({
          actor: { id: 101, role: 'teacher' },
          draftId,
          expectedFingerprint: fingerprint,
          comment: '旧指纹确认',
          connection
        });
      },
      (err) => err.status === 409 || err.statusCode === 409
    );
  });

  test('6. 发起 AI 寄语生成任务并生成 MODEL 建议，附带引用证据', async () => {
    const { requestComment, processCommentJob } = require('../services/commentGenerationService');
    const job = await requestComment({
      actor: { id: 101, role: 'teacher' },
      draftId,
      expectedFingerprint: fingerprint,
      connection
    });

    assert.ok(job.jobId);

    const result = await processCommentJob({
      jobId: job.jobId,
      connection
    });

    assert.equal(result.source, 'MODEL');
    assert.ok(result.suggestionText);
    assert.ok(result.citedEvidence);
  });

  test('7. 晚到模型响应绝不覆盖教师已确认寄语 (CAS)', async () => {
    const { applyCommentResult } = require('../services/commentGenerationService');
    const applyRes = await applyCommentResult({
      actor: { id: 101, role: 'teacher' },
      jobId: 'LATE_JOB_TEST',
      draftId,
      expectedFingerprint: 'STALE_OLD_FINGERPRINT',
      result: {
        suggestionText: '晚到的AI响应尝试覆盖',
        source: 'MODEL'
      },
      connection
    });

    assert.equal(applyRes.overwrittenTeacher, false);

    // 重新获取草稿确认教师寄语依然保留
    const draftAfter = await getDraft({
      actor: { id: 101, role: 'teacher' },
      draftId,
      connection
    });
    assert.equal(draftAfter.teacherComment, '期末寄语：在各方面表现优异，有责任心。');
  });

  test('8. 模型生成失败不丢失草稿，允许转人工', async () => {
    const { handleGenerationFailure } = require('../services/commentGenerationService');
    const failRes = await handleGenerationFailure({
      draftId,
      errorMessage: '模型服务模拟超时',
      connection
    });

    assert.equal(failRes.status, 'FAILED');
    assert.equal(failRes.canFallbackToManual, true);
  });
});
