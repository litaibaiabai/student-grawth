/**
 * R12.cjs — AI寄语生成与教师审核场景
 *
 * 验证：
 * 1. checks.acceptedGenerationSource === 'MODEL' (成功调用并记录模型生成来源)
 * 2. checks.lateResponseOverwritesTeacher === false (晚到模型响应绝不覆盖教师已确认的人工寄语)
 * 3. checks.failureLosesDraft === false (模型调用失败时不丢失草稿或已有内容)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R12',
  title: 'AI寄语',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    acceptedGenerationSource: null,
    lateResponseOverwritesTeacher: true,
    failureLosesDraft: true
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    const [teachers] = await conn.query("SELECT id, username, real_name FROM users WHERE role = 'teacher' LIMIT 1");
    const headmaster = teachers[0];

    const [students] = await conn.query("SELECT id, username, real_name, grade, class_no FROM users WHERE role = 'student' LIMIT 1");
    const student = students[0];

    // 授权班主任
    await conn.query(`
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, ?, ?, ?, 'CHINESE', 1)
      ON DUPLICATE KEY UPDATE is_head_teacher = 1
    `, [headmaster.id, student.grade, student.class_no]);

    const reportDraftService = require('../../../backend/services/reportDraftService.js');
    const commentGenerationService = require('../../../backend/services/commentGenerationService.js');

    // 1. 构建初始草稿
    const draft = await reportDraftService.buildDraft({
      actor: { id: headmaster.id, role: 'teacher' },
      studentKey: { schoolId: 1, termId: 1, studentId: student.id, grade: student.grade, classNo: student.class_no },
      connection: conn
    });
    const draftId = draft.draftId;
    const initialFingerprint = draft.approvalFingerprint;

    // 章节 1: 提交 AI 寄语生成任务并完成，检查来源为 MODEL
    await s.chapter('R12-01', '发起 AI 寄语生成任务并成功获取 MODEL 建议', async () => {
      const job = await commentGenerationService.requestComment({
        actor: { id: headmaster.id, role: 'teacher' },
        draftId,
        expectedFingerprint: initialFingerprint,
        connection: conn
      });

      assert.ok(job);
      assert.ok(job.jobId);

      // 处理任务并获取结果
      const result = await commentGenerationService.processCommentJob({
        jobId: job.jobId,
        connection: conn
      });

      checks.acceptedGenerationSource = result.source;
      assert.equal(checks.acceptedGenerationSource, 'MODEL');
      assert.ok(result.suggestionText, '应包含生成的建议寄语');
      assert.ok(result.citedEvidence, '应包含引用的证据项');
    });

    // 章节 2: 晚到回复或并发冲突绝不覆盖教师已确认寄语 (CAS)
    await s.chapter('R12-02', '教师已确认寄语后，晚到模型响应不能强制覆盖', async () => {
      const manualComment = '教师专属手写寄语：本学期自主学习能力强。';
      // 教师主动确认了人工草稿
      await reportDraftService.confirmDraft({
        actor: { id: headmaster.id, role: 'teacher' },
        draftId,
        expectedFingerprint: initialFingerprint,
        comment: manualComment,
        connection: conn
      });

      // 模拟一个拿着旧指纹晚到的 AI 任务结果尝试覆盖
      const applyResult = await commentGenerationService.applyCommentResult({
        actor: { id: headmaster.id, role: 'teacher' },
        jobId: 'LATE_JOB_001',
        draftId,
        expectedFingerprint: initialFingerprint,
        result: {
          suggestionText: '这是晚到的AI回复，尝试强行覆盖',
          source: 'MODEL'
        },
        connection: conn
      });

      // 获取当前草稿验证
      const currentDraft = await reportDraftService.getDraft({
        actor: { id: headmaster.id, role: 'teacher' },
        draftId,
        connection: conn
      });

      // 验证教师寄语没有被覆盖
      checks.lateResponseOverwritesTeacher = (currentDraft.teacherComment === '这是晚到的AI回复，尝试强行覆盖');
      assert.equal(checks.lateResponseOverwritesTeacher, false);
      assert.equal(currentDraft.teacherComment, manualComment);
    });

    // 章节 3: 模拟模型失败，验证草稿与已有数据不受破坏
    await s.chapter('R12-03', 'AI 生成失败时不损坏草稿，保留已有人工稿并允许转人工/重试', async () => {
      // 模拟一个失败的生成任务
      try {
        await commentGenerationService.handleGenerationFailure({
          draftId,
          errorMessage: '模拟模型网络超时',
          connection: conn
        });
      } catch (e) {
        // 允许抛出友好业务提示
      }

      const finalDraft = await reportDraftService.getDraft({
        actor: { id: headmaster.id, role: 'teacher' },
        draftId,
        connection: conn
      });

      // 验证草稿依然完好无损，且没有被清空
      checks.failureLosesDraft = !finalDraft || !finalDraft.teacherComment;
      assert.equal(checks.failureLosesDraft, false);
    });

    // 最终断言汇总
    assert.equal(checks.acceptedGenerationSource, 'MODEL');
    assert.equal(checks.lateResponseOverwritesTeacher, false);
    assert.equal(checks.failureLosesDraft, false);

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
