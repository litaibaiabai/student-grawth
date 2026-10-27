/**
 * healthImportService.js — 体测与健康导入及隐私访问控制服务
 *
 * 合同 C1/C2/C4:
 * 1. 严格保护健康隐私：管理员不能借接口读取个人体测明细 (403)，仅可看准备状态
 * 2. 规范保存原值与计量单位 (如身高 cm, 体重 kg)
 * 3. 绝不把体测数据转为奖惩积分
 * 4. 走 C2 推进学生学期状态来源版本
 */
const crypto = require('crypto');
const { pool } = require('../db');
const { requireStudentScope } = require('../middleware/studentScope');
const { withStudentTermsMutation } = require('./studentTermStateService');

class ServiceAppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

/**
 * 预览体测与健康数据导入
 */
async function previewHealthImport({ actor, termId = 1, items = [] }, connection) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const schoolId = actor?.schoolId || 1;
    const diffs = [];
    const validRows = [];
    let validCount = 0;
    let errorCount = 0;

    for (const item of items) {
      const studentNo = item.studentNo || item.username;
      const [students] = await conn.query(
        "SELECT id, username, real_name, grade, class_no FROM users WHERE school_id = ? AND username = ? AND role = 'student' LIMIT 1",
        [schoolId, studentNo]
      );

      if (students.length === 0) {
        errorCount++;
        diffs.push({ studentNo, error: '未找到匹配学生', status: 'ERROR' });
        continue;
      }

      const st = students[0];
      // 检查教师班级权限
      if (actor && actor.role === 'teacher') {
        await requireStudentScope(actor, st.id, conn);
      }

      validCount++;
      const validRow = {
        studentId: st.id,
        studentNo: st.username,
        studentName: st.real_name,
        grade: st.grade,
        classNo: st.class_no,
        height: item.height ? Number(item.height) : null,
        heightUnit: 'cm',
        weight: item.weight ? Number(item.weight) : null,
        weightUnit: 'kg',
        vitalCapacity: item.vitalCapacity ? Number(item.vitalCapacity) : null,
        leftVision: item.leftVision || '',
        rightVision: item.rightVision || '',
        fiftyRun: item.fiftyRun ? Number(item.fiftyRun) : null,
        sitAndReach: item.sitAndReach ? Number(item.sitAndReach) : null,
        absenceType: item.absenceType || item.status || 'NORMAL'
      };
      validRows.push(validRow);
      diffs.push({ ...validRow, status: 'VALID' });
    }

    const batchId = 'HEALTH_BATCH_' + crypto.randomUUID().replace(/-/g, '');
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(validRows)).digest('hex');

    await conn.query(`
      INSERT INTO health_import_batch
      (batch_id, school_id, term_id, teacher_id, row_count, valid_count, error_count, diff_summary, status, payload_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PREVIEW', ?)
    `, [
      batchId,
      schoolId,
      termId,
      actor?.id || 1,
      items.length,
      validCount,
      errorCount,
      JSON.stringify(validRows),
      payloadHash
    ]);

    return {
      batchId,
      termId,
      validCount,
      errorCount,
      diffs
    };
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 确认提交体测导入
 */
async function commitHealthImport({ actor, batchId, requestKey }, connection) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const schoolId = actor?.schoolId || 1;
    const [batches] = await conn.query(
      "SELECT * FROM health_import_batch WHERE batch_id = ? FOR UPDATE",
      [batchId]
    );

    if (batches.length === 0) {
      throw new ServiceAppError('未找到对应的体测导入批次', 404);
    }

    const batch = batches[0];
    if (batch.status !== 'PREVIEW') {
      throw new ServiceAppError('该体测导入批次已提交或失效', 409);
    }

    const validRows = typeof batch.diff_summary === 'string' ? JSON.parse(batch.diff_summary) : (batch.diff_summary || []);
    if (validRows.length === 0) {
      throw new ServiceAppError('批次中没有可提交的有效数据', 422);
    }

    const studentKeys = validRows.map(r => ({
      schoolId,
      termId: batch.term_id,
      studentId: r.studentId
    }));

    // C2 事务批量写与版本递增
    await withStudentTermsMutation(
      {
        connection: conn,
        actor,
        studentKeys,
        requestKey: requestKey || `COMMIT_${batchId}`,
        payloadHash: batch.payload_hash
      },
      async (txConn) => {
        for (const row of validRows) {
          await txConn.query(`
            INSERT INTO student_health_record
            (school_id, term_id, student_id, height, height_unit, weight, weight_unit, vital_capacity, left_vision, right_vision, fifty_run, sit_and_reach, absence_type, imported_by, batch_id, revision)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE
              height = VALUES(height),
              height_unit = VALUES(height_unit),
              weight = VALUES(weight),
              weight_unit = VALUES(weight_unit),
              vital_capacity = VALUES(vital_capacity),
              left_vision = VALUES(left_vision),
              right_vision = VALUES(right_vision),
              fifty_run = VALUES(fifty_run),
              sit_and_reach = VALUES(sit_and_reach),
              absence_type = VALUES(absence_type),
              imported_by = VALUES(imported_by),
              batch_id = VALUES(batch_id),
              revision = revision + 1
          `, [
            schoolId,
            batch.term_id,
            row.studentId,
            row.height,
            row.heightUnit || 'cm',
            row.weight,
            row.weightUnit || 'kg',
            row.vitalCapacity,
            row.leftVision,
            row.rightVision,
            row.fiftyRun,
            row.sitAndReach,
            row.absenceType || 'NORMAL',
            actor?.id || 1,
            batchId
          ]);
        }
      }
    );

    await conn.query(
      "UPDATE health_import_batch SET status = 'COMMITTED', committed_at = CURRENT_TIMESTAMP WHERE batch_id = ?",
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

/**
 * 查询学生体测健康明细（严格权限控制）
 */
async function getStudentHealthRecord({ actor, studentId, termId = 1 }, connection) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    // 管理员禁止越权读取学生健康明细
    if (actor && (actor.role === 'admin' || actor.role === 'manager')) {
      throw new ServiceAppError('管理员无权直接查看个人健康体测隐私明细', 403);
    }

    if (actor && actor.role === 'teacher') {
      await requireStudentScope(actor, studentId, conn);
    } else if (actor && actor.role === 'student') {
      if (Number(actor.id) !== Number(studentId)) {
        throw new ServiceAppError('学生只能查看本人的健康体测数据', 403);
      }
    }

    const [rows] = await conn.query(
      "SELECT * FROM student_health_record WHERE student_id = ? AND term_id = ? LIMIT 1",
      [studentId, termId]
    );

    return rows.length > 0 ? rows[0] : null;
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 管理员查看体测录入准备状态与进度统计
 */
async function getHealthImportStatus({ actor, termId = 1 }, connection) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const schoolId = actor?.schoolId || 1;
    const [students] = await conn.query(
      "SELECT COUNT(*) AS total FROM users WHERE school_id = ? AND role = 'student'",
      [schoolId]
    );
    const totalStudents = students[0]?.total || 0;

    const [records] = await conn.query(
      "SELECT COUNT(DISTINCT student_id) AS completed FROM student_health_record WHERE school_id = ? AND term_id = ?",
      [schoolId, termId]
    );
    const completedCount = records[0]?.completed || 0;

    return {
      totalStudents,
      completedCount,
      completionRate: totalStudents > 0 ? Number((completedCount / totalStudents).toFixed(2)) : 0
    };
  } finally {
    if (shouldRelease) conn.release();
  }
}

module.exports = {
  previewHealthImport,
  commitHealthImport,
  getStudentHealthRecord,
  getHealthImportStatus,
  ServiceAppError
};
