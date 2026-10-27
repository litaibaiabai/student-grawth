/**
 * reportIndicatorService.js — 年级指标与教师评价服务
 *
 * 合同 C4:
 * IndicatorValue={indicatorCode,valueType,rawValue,value,status,sourceRef,revision}
 * 遵循 C1/C2 事务与权限控制
 */
const { pool } = require('../db');
const { requireStudentScope } = require('../middleware/studentScope');
const { withStudentTermMutation } = require('./studentTermStateService');

class ServiceAppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

/**
 * 管理员配置年级指标字典
 */
async function configureGradeIndicators({ schoolId, termId, grade, indicators }, connection) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const results = [];
    for (const ind of indicators) {
      const code = ind.indicatorCode || ind.indicator_code;
      const name = ind.indicatorName || ind.indicator_name;
      const dimension = ind.dimension || 'D';
      const valueType = ind.valueType || ind.value_type || 'star';
      const unit = ind.unit || '';
      const isRequired = ind.isRequired ? 1 : 0;
      const status = ind.status || 'ACTIVE';

      await conn.query(`
        INSERT INTO grade_indicator_definition
        (school_id, term_id, grade, indicator_code, indicator_name, dimension, value_type, unit, is_required, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          indicator_name = VALUES(indicator_name),
          dimension = VALUES(dimension),
          value_type = VALUES(value_type),
          unit = VALUES(unit),
          is_required = VALUES(is_required),
          status = VALUES(status)
      `, [schoolId, termId, grade, code, name, dimension, valueType, unit, isRequired, status]);

      const [rows] = await conn.query(
        "SELECT * FROM grade_indicator_definition WHERE school_id = ? AND term_id = ? AND grade = ? AND indicator_code = ?",
        [schoolId, termId, grade, code]
      );
      if (rows.length > 0) results.push(rows[0]);
    }
    return results;
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 教师录入指标评价（C1 鉴权 + C2 原子递增学期版本）
 */
async function saveStudentIndicatorValues({ actor, studentId, termId, values, requestKey }, connection) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    // 1. C1 鉴权：严格校验教师对该学生的管理范围
    if (actor) {
      await requireStudentScope(actor, studentId, conn);
    }

    const schoolId = actor?.schoolId || 1;
    const studentKey = {
      schoolId,
      termId: Number(termId) || 1,
      studentId: Number(studentId)
    };

    // 2. C2 包装单学生事务与来源版本递增
    const crypto = require('crypto');
    const computedHash = crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');

    const mutationResult = await withStudentTermMutation(
      {
        connection: conn,
        actor,
        studentKey,
        requestKey: requestKey || `IND_${studentId}_${termId}_${Date.now()}`,
        payloadHash: computedHash
      },
      async (txConn) => {
        const savedList = [];
        for (const item of values) {
          const code = item.indicatorCode || item.indicator_code;
          const valueType = item.valueType || item.value_type || 'star';
          const rawValue = item.rawValue !== undefined ? String(item.rawValue) : null;
          const status = item.status || 'RECORDED';

          // 仅当类型为 number 且 rawValue 为有效数字时解析为 numeric_value
          let numericValue = null;
          if (valueType === 'number' && rawValue !== null && rawValue !== '' && !isNaN(Number(rawValue))) {
            numericValue = Number(rawValue);
          }

          // typedValue 处理
          const typedValue = rawValue;

          await txConn.query(`
            INSERT INTO student_indicator_value
            (school_id, term_id, student_id, indicator_code, value_type, raw_value, typed_value, numeric_value, status, evaluated_by, revision)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE
              value_type = VALUES(value_type),
              raw_value = VALUES(raw_value),
              typed_value = VALUES(typed_value),
              numeric_value = VALUES(numeric_value),
              status = VALUES(status),
              evaluated_by = VALUES(evaluated_by),
              revision = revision + 1,
              evaluated_at = CURRENT_TIMESTAMP
          `, [
            schoolId,
            termId,
            studentId,
            code,
            valueType,
            rawValue,
            typedValue,
            numericValue,
            status,
            actor?.id || 1
          ]);

          savedList.push({
            indicatorCode: code,
            valueType,
            rawValue,
            numericValue,
            status
          });
        }
        return savedList;
      }
    );

    return mutationResult;
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 查询年级指标定义
 */
async function getGradeIndicators({ schoolId, termId, grade }, connection) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;
  try {
    const [rows] = await conn.query(
      "SELECT * FROM grade_indicator_definition WHERE school_id = ? AND term_id = ? AND grade = ? AND status = 'ACTIVE' ORDER BY id ASC",
      [schoolId, termId, grade]
    );
    return rows;
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 查询学生指标评价值
 */
async function getStudentIndicatorValues({ actor, studentId, termId }, connection) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;
  try {
    if (actor && actor.role === 'teacher') {
      await requireStudentScope(actor, studentId, conn);
    }
    const [rows] = await conn.query(
      "SELECT * FROM student_indicator_value WHERE student_id = ? AND term_id = ? ORDER BY id ASC",
      [studentId, termId]
    );
    return rows;
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 管理员查看指标评定进度统计
 */
async function getGradeIndicatorProgress({ schoolId, grade, termId }, connection) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;
  try {
    const [students] = await conn.query(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'student' AND grade = ?",
      [grade]
    );
    const totalStudents = students[0]?.total || 0;

    const [evaluated] = await conn.query(`
      SELECT COUNT(DISTINCT student_id) AS evaluatedCount
      FROM student_indicator_value
      WHERE school_id = ? AND term_id = ?
    `, [schoolId, termId]);
    const evaluatedCount = evaluated[0]?.evaluatedCount || 0;

    const completionRate = totalStudents > 0 ? Number((evaluatedCount / totalStudents).toFixed(2)) : 0;

    return {
      totalStudents,
      evaluatedCount,
      completionRate
    };
  } finally {
    if (shouldRelease) conn.release();
  }
}

module.exports = {
  configureGradeIndicators,
  saveStudentIndicatorValues,
  getGradeIndicators,
  getStudentIndicatorValues,
  getGradeIndicatorProgress,
  ServiceAppError
};
