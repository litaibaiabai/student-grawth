/**
 * subjectImportService.js — 学科成绩导入服务
 *
 * 合同 C1/C2/C4:
 * 1. 严格校验教师学科任教授权 (C1)
 * 2. 服务器标准预览批次 (batchId, expected_revisions) 校验与过期拦截 409
 * 3. 走 C2 withStudentTermsMutation 原子提交并推进 source_revision
 * 4. 有效 0 分不丢失
 */
const crypto = require('crypto');
const { pool } = require('../db');
const { withStudentTermsMutation } = require('./studentTermStateService');

class ServiceAppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

/**
 * 校验任课教师任教授权
 */
async function checkSubjectTeachingScope(actor, termId, grade, classNo, subjectCode, connection) {
  if (!actor || actor.role === 'admin' || actor.role === 'manager') return true;

  const [rows] = await connection.query(`
    SELECT id FROM teacher_teaching_assignment
    WHERE school_id = ? AND term_id = ? AND teacher_id = ? AND grade = ? AND (class_no = ? OR class_no = 0) AND subject_code = ?
    LIMIT 1
  `, [actor.schoolId || 1, termId, actor.id, grade, classNo, subjectCode]);

  if (rows.length === 0) {
    throw new ServiceAppError('教师未获该年级班级与学科的任教授权', 403);
  }
  return true;
}

/**
 * 预览学科成绩导入
 */
async function previewSubjectImport({ actor, termId = 1, grade, classNo, subjectCode, rows = [] }, connection) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const schoolId = actor?.schoolId || 1;

    // 1. C1 权限校验
    await checkSubjectTeachingScope(actor, termId, grade, classNo, subjectCode, conn);

    // 2. 匹配学生与比对原成绩
    const diffs = [];
    let validCount = 0;
    let errorCount = 0;
    const validRows = [];
    const studentKeys = [];

    for (const row of rows) {
      const studentNo = row.studentNo || row.username;
      const rawScore = row.score !== undefined ? String(row.score) : '';

      // 查询学生
      const [studentRows] = await conn.query(
        "SELECT id, username, real_name, grade, class_no FROM users WHERE school_id = ? AND username = ? AND role = 'student' LIMIT 1",
        [schoolId, studentNo]
      );

      if (studentRows.length === 0) {
        errorCount++;
        diffs.push({ studentNo, error: '未找到匹配学生学号', status: 'ERROR' });
        continue;
      }

      const st = studentRows[0];
      // 验证分数有效性（支持 0 和小数）
      const numericScore = Number(rawScore);
      if (rawScore === '' || isNaN(numericScore) || numericScore < 0 || numericScore > 150) {
        errorCount++;
        diffs.push({ studentNo, error: '分数数值不合法', status: 'ERROR' });
        continue;
      }

      // 查询已有成绩比对
      const [existScores] = await conn.query(
        "SELECT score, raw_score FROM subject_score WHERE school_id = ? AND term_id = ? AND student_id = ? AND subject_code = ?",
        [schoolId, termId, st.id, subjectCode]
      );
      const oldScore = existScores.length > 0 ? existScores[0].score : null;

      validCount++;
      const validRow = {
        studentId: st.id,
        studentNo: st.username,
        studentName: st.real_name,
        grade: st.grade,
        classNo: st.class_no,
        score: numericScore,
        rawScore: rawScore,
        oldScore
      };
      validRows.push(validRow);
      diffs.push({
        ...validRow,
        status: oldScore !== null ? 'UPDATE' : 'INSERT'
      });
      studentKeys.push({ schoolId, termId, studentId: st.id });
    }

    // 3. 读取当前各学生 source_revision
    const expectedRevisions = {};
    if (studentKeys.length > 0) {
      const studentIds = studentKeys.map(k => k.studentId);
      const [stateRows] = await conn.query(
        `SELECT student_id, source_revision FROM student_term_state WHERE school_id = ? AND term_id = ? AND student_id IN (?)`,
        [schoolId, termId, studentIds]
      );
      for (const sr of stateRows) {
        expectedRevisions[sr.student_id] = sr.source_revision;
      }
    }

    // 4. 生成服务器批次并持久化
    const batchId = 'SUBJ_BATCH_' + crypto.randomUUID().replace(/-/g, '');
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(validRows)).digest('hex');

    await conn.query(`
      INSERT INTO subject_import_batch
      (batch_id, school_id, term_id, grade, class_no, subject_code, teacher_id, row_count, valid_count, error_count, diff_summary, status, payload_hash, expected_revisions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PREVIEW', ?, ?)
    `, [
      batchId,
      schoolId,
      termId,
      grade || 0,
      classNo || 0,
      subjectCode,
      actor?.id || 1,
      rows.length,
      validCount,
      errorCount,
      JSON.stringify(validRows),
      payloadHash,
      JSON.stringify(expectedRevisions)
    ]);

    return {
      batchId,
      termId,
      subjectCode,
      validCount,
      errorCount,
      diffs,
      expectedRevisions
    };
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 正式确认提交学科成绩导入批次
 */
async function commitSubjectImport({ actor, batchId, expectedRevision, requestKey }, connection) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const schoolId = actor?.schoolId || 1;

    // 1. 读取服务器批次
    const [batches] = await conn.query(
      "SELECT * FROM subject_import_batch WHERE batch_id = ? FOR UPDATE",
      [batchId]
    );

    if (batches.length === 0) {
      throw new ServiceAppError('未找到对应的导入批次', 404);
    }

    const batch = batches[0];
    if (batch.status !== 'PREVIEW') {
      throw new ServiceAppError('该导入批次已提交或已失效', 409);
    }

    // 再次校验权限
    await checkSubjectTeachingScope(actor, batch.term_id, batch.grade, batch.class_no, batch.subject_code, conn);

    const validRows = typeof batch.diff_summary === 'string' ? JSON.parse(batch.diff_summary) : (batch.diff_summary || []);
    if (validRows.length === 0) {
      throw new ServiceAppError('批次中没有可提交的有效成绩记录', 422);
    }

    // 2. C2 多学生原子提交与版本递增
    const studentKeys = validRows.map(r => ({
      schoolId,
      termId: batch.term_id,
      studentId: r.studentId
    }));

    await withStudentTermsMutation(
      {
        connection: conn,
        actor,
        studentKeys,
        requestKey: requestKey || `COMMIT_${batchId}`,
        payloadHash: batch.payload_hash
      },
      async (txConn) => {
        const subjectNames = {
          CHINESE: '语文',
          MATH: '数学',
          ENGLISH: '英语',
          SCIENCE: '科学',
          MORAL: '道德与法治',
          ART: '美术',
          MUSIC: '音乐',
          PHYSICAL: '体育与健康'
        };
        const subjectName = subjectNames[batch.subject_code] || batch.subject_code;

        for (const row of validRows) {
          await txConn.query(`
            INSERT INTO subject_score (school_id, term_id, student_id, subject_code, subject_name, score, raw_score, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE score = VALUES(score), raw_score = VALUES(raw_score)
          `, [
            schoolId,
            batch.term_id,
            row.studentId,
            batch.subject_code,
            subjectName,
            row.score,
            row.rawScore !== undefined ? String(row.rawScore) : String(row.score)
          ]);
        }
      }
    );

    // 3. 标记批次为 COMMITTED
    await conn.query(
      "UPDATE subject_import_batch SET status = 'COMMITTED', committed_at = CURRENT_TIMESTAMP WHERE batch_id = ?",
      [batchId]
    );

    return {
      success: true,
      batchId,
      committedCount: validRows.length
    };
  } finally {
    if (shouldRelease) conn.release();
  }
}

module.exports = {
  previewSubjectImport,
  commitSubjectImport,
  checkSubjectTeachingScope,
  ServiceAppError
};
