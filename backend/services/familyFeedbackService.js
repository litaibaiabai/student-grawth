/**
 * familyFeedbackService.js — 任务 13 家长寄语与反馈记录服务
 *
 * 接口契约：
 * issueFamilyToken({ schoolId, termId, studentId, parentName, parentPhone, connection }) -> TokenInfo
 * submitFamilyComment({ token, studentKey, commentText, proxyByStudent, connection }) -> FeedbackRecord
 * getStudentFamilyFeedbacks({ schoolId, termId, studentId, connection }) -> Array
 */
const crypto = require('crypto');
const { pool } = require('../db');

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.statusCode = status;
  }
}

/**
 * 为指定学生与学期签发家长临时访问凭证（限期有效）
 */
async function issueFamilyToken({ schoolId = 1, termId = 1, studentId, parentName = '家长', parentPhone = null, expiresInDays = 7, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const [result] = await conn.query(`
      INSERT INTO family_access_token (token, school_id, term_id, student_id, parent_name, parent_phone, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [token, schoolId, termId, studentId, parentName, parentPhone, expiresAt]);

    return {
      tokenId: result.insertId,
      token,
      schoolId,
      termId,
      studentId,
      expiresAt
    };
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 家长提交学期寄语与反馈（严格凭证校验与越权隔离）
 */
async function submitFamilyComment({ token, studentKey, commentText, proxyByStudent = false, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    if (!token) {
      throw new HttpError('缺少家长授权访问凭证', 401);
    }

    if (!commentText || !commentText.trim()) {
      throw new HttpError('寄语内容不能为空', 422);
    }

    // 1. 凭证存在与有效性校验
    const [tokenRows] = await conn.query(
      "SELECT * FROM family_access_token WHERE token = ? AND revoked_at IS NULL LIMIT 1",
      [token]
    );

    if (tokenRows.length === 0) {
      throw new HttpError('家长凭证无效或已被撤销', 401);
    }

    const tokenRecord = tokenRows[0];
    if (new Date(tokenRecord.expires_at) < new Date()) {
      throw new HttpError('家长访问凭证已过期', 401);
    }

    // 2. 严格目标学生比对（严禁凭证越权访问或写入其他学生）
    const targetStudentId = Number(studentKey.studentId);
    if (tokenRecord.student_id !== targetStudentId) {
      throw new HttpError('该凭证仅限为指定学生填写，禁止跨学生提交', 403);
    }

    const schoolId = studentKey.schoolId || tokenRecord.school_id;
    const termId = studentKey.termId || tokenRecord.term_id;

    // 3. 记录独立追加反馈流
    const [insertResult] = await conn.query(`
      INSERT INTO family_feedback_record (school_id, term_id, student_id, parent_name, comment_text, proxy_by_student, token_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      schoolId,
      termId,
      targetStudentId,
      tokenRecord.parent_name || '家长',
      commentText.trim(),
      proxyByStudent ? 1 : 0,
      tokenRecord.id
    ]);

    // 4. 同步更新当前草稿的 parent_comment 扩展位（如果存在当前草稿）
    await conn.query(`
      UPDATE student_report_draft
      SET parent_comment = ?
      WHERE school_id = ? AND term_id = ? AND student_id = ?
    `, [commentText.trim(), schoolId, termId, targetStudentId]);

    return {
      feedbackId: insertResult.insertId,
      schoolId,
      termId,
      studentId: targetStudentId,
      parentName: tokenRecord.parent_name || '家长',
      commentText: commentText.trim(),
      proxyByStudent: !!proxyByStudent,
      createdAt: new Date()
    };

  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 查询指定学生的家长反馈历史
 */
async function getStudentFamilyFeedbacks({ schoolId = 1, termId = 1, studentId, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const [rows] = await conn.query(`
      SELECT id, school_id, term_id, student_id, parent_name, comment_text, proxy_by_student, created_at
      FROM family_feedback_record
      WHERE school_id = ? AND term_id = ? AND student_id = ?
      ORDER BY id ASC
    `, [schoolId, termId, Number(studentId)]);

    return rows.map(r => ({
      ...r,
      proxy_by_student: !!r.proxy_by_student
    }));
  } finally {
    if (shouldRelease) conn.release();
  }
}

module.exports = {
  issueFamilyToken,
  submitFamilyComment,
  getStudentFamilyFeedbacks
};
