/**
 * commentGenerationService.js — 任务 12 AI 寄语生成服务
 *
 * 合同与接口：
 * requestComment({ actor, draftId, expectedFingerprint, connection }) -> Job
 * processCommentJob({ jobId, connection }) -> Result
 * applyCommentResult({ actor, jobId, draftId, expectedFingerprint, result, connection }) -> SuggestionRevision
 * handleGenerationFailure({ draftId, errorMessage, connection })
 */
const { pool } = require('../db');
const commentProvider = require('./commentProvider');

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.statusCode = status;
  }
}

/**
 * 发起寄语生成异步任务
 */
async function requestComment({ actor, draftId, expectedFingerprint, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const [draftRows] = await conn.query("SELECT * FROM student_report_draft WHERE id = ? LIMIT 1", [draftId]);
    if (draftRows.length === 0) {
      throw new HttpError('报告草稿不存在', 404);
    }
    const draft = draftRows[0];

    const jobId = `JOB_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    await conn.query(`
      INSERT INTO ai_comment_job (job_id, draft_id, expected_fingerprint, status, source)
      VALUES (?, ?, ?, 'PENDING', 'MODEL')
    `, [jobId, draftId, expectedFingerprint || draft.approval_fingerprint]);

    return {
      jobId,
      draftId,
      status: 'PENDING'
    };
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 执行并处理寄语生成任务
 */
async function processCommentJob({ jobId, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const [jobs] = await conn.query("SELECT * FROM ai_comment_job WHERE job_id = ? LIMIT 1", [jobId]);
    if (jobs.length === 0) {
      throw new HttpError('寄语任务不存在', 404);
    }
    const job = jobs[0];

    // 获取草稿中的证据快照
    const [draftRows] = await conn.query("SELECT * FROM student_report_draft WHERE id = ? LIMIT 1", [job.draft_id]);
    const draft = draftRows[0] || {};
    const evidence = typeof draft.draft_snapshot === 'string' ? JSON.parse(draft.draft_snapshot) : draft.draft_snapshot;

    // 调用模型生成
    const genResult = await commentProvider.generateCommentSuggestion({ evidence });

    // 更新任务状态
    await conn.query(`
      UPDATE ai_comment_job
      SET status = 'COMPLETED',
          source = ?,
          suggestion_text = ?,
          cited_evidence = ?,
          prompt_tokens = ?,
          completion_tokens = ?
      WHERE job_id = ?
    `, [
      genResult.source || 'MODEL',
      genResult.suggestionText,
      JSON.stringify(genResult.citedEvidence || []),
      genResult.promptTokens || 0,
      genResult.completionTokens || 0,
      jobId
    ]);

    return {
      jobId,
      source: genResult.source || 'MODEL',
      suggestionText: genResult.suggestionText,
      citedEvidence: genResult.citedEvidence
    };
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 将 AI 结果作为建议应用到草稿（带 CAS 防覆盖机制）
 */
async function applyCommentResult({ actor, jobId, draftId, expectedFingerprint, result, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const [draftRows] = await conn.query("SELECT * FROM student_report_draft WHERE id = ? LIMIT 1", [draftId]);
    if (draftRows.length === 0) {
      throw new HttpError('草稿不存在', 404);
    }
    const draft = draftRows[0];

    const suggestionText = result?.suggestionText || '';

    // CAS 防覆盖规则：
    // 若当前草稿已被确认 (status === 'CONFIRMED') 或指纹与任务发起时不一致 (draft.approval_fingerprint !== expectedFingerprint)
    // 绝不覆盖 teacher_comment，仅写入 ai_suggestion 供教师参考
    const isLateOrConflict = (draft.status === 'CONFIRMED') || (expectedFingerprint && draft.approval_fingerprint !== expectedFingerprint);

    if (isLateOrConflict) {
      // 仅更新 ai_suggestion 扩展位，不改动教师已确认评语与状态
      await conn.query(`
        UPDATE student_report_draft
        SET ai_suggestion = ?
        WHERE id = ?
      `, [suggestionText, draftId]);

      // 记录到修订历史作为 AI 建议
      await conn.query(`
        INSERT INTO report_comment_revision (draft_id, revision_no, author_id, author_role, comment_text)
        VALUES (?, ?, ?, 'AI_SUGGESTION', ?)
      `, [draftId, draft.comment_version + 1, actor?.id || 0, suggestionText]);

      return {
        applied: true,
        overwrittenTeacher: false,
        status: draft.status,
        suggestion: suggestionText,
        message: '草稿已由教师确认或版本已演进，AI结果已保存为建议扩展位，未覆盖教师人工寄语'
      };
    } else {
      // 未确认状态下，更新 ai_suggestion
      await conn.query(`
        UPDATE student_report_draft
        SET ai_suggestion = ?
        WHERE id = ?
      `, [suggestionText, draftId]);

      return {
        applied: true,
        overwrittenTeacher: false,
        status: draft.status,
        suggestion: suggestionText
      };
    }
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 处理生成失败，保持草稿完整
 */
async function handleGenerationFailure({ draftId, errorMessage, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    // 验证草稿存在，不删除或清空草稿任何内容
    const [draftRows] = await conn.query("SELECT * FROM student_report_draft WHERE id = ? LIMIT 1", [draftId]);
    if (draftRows.length === 0) {
      throw new HttpError('草稿不存在', 404);
    }

    return {
      draftId,
      status: 'FAILED',
      errorMessage: errorMessage || '模型服务暂不可用，已保留草稿，可重试或手写寄语',
      canFallbackToManual: true
    };
  } finally {
    if (shouldRelease) conn.release();
  }
}

module.exports = {
  requestComment,
  processCommentJob,
  applyCommentResult,
  handleGenerationFailure
};
