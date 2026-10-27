/**
 * studentTermStateService.js — 任务 01 统一学期状态与版本事务服务
 *
 * 合同 C2:
 * withStudentTermMutation({ connection, actor, studentKey, requestKey, payloadHash }, mutate) -> { sourceRevision, result }
 * withStudentTermsMutation({ connection, actor, studentKeys, requestKey, payloadHash }, mutate) -> { sourceRevisions, result }
 */
const { pool } = require('../db');

/**
 * 单学生学期数据变更事务包装器
 */
async function withStudentTermMutation({ connection, actor, studentKey, requestKey, payloadHash }, mutate) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    if (shouldRelease) await conn.beginTransaction();

    // 1. 幂等校验
    if (requestKey) {
      const [idempotencyRows] = await conn.query(
        'SELECT payload_hash, response_body, source_revision FROM request_idempotency WHERE request_key = ? AND school_id = ? FOR UPDATE',
        [requestKey, studentKey.schoolId]
      );
      if (idempotencyRows && idempotencyRows.length > 0) {
        const record = idempotencyRows[0];
        if (record.payload_hash !== payloadHash) {
          const err = new Error('幂等请求冲突：相同的 request_key 但载荷哈希不匹配');
          err.statusCode = 409;
          throw err;
        }
        // 幂等命中，直接返回既有响应，不递增 sourceRevision
        const responseData = typeof record.response_body === 'string' ? JSON.parse(record.response_body) : record.response_body;
        return {
          sourceRevision: record.source_revision || 1,
          result: responseData,
          replayed: true
        };
      }
    }

    // 2. 获取并锁定 student_term_state
    await conn.query(`
      INSERT INTO student_term_state (school_id, term_id, student_id, source_revision)
      VALUES (?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE id = id
    `, [studentKey.schoolId, studentKey.termId, studentKey.studentId]);

    const [stateRows] = await conn.query(
      'SELECT source_revision FROM student_term_state WHERE school_id = ? AND term_id = ? AND student_id = ? FOR UPDATE',
      [studentKey.schoolId, studentKey.termId, studentKey.studentId]
    );

    const currentRevision = stateRows[0].source_revision;

    // 3. 执行业务变更
    const result = await mutate(conn);

    // 4. 原子递增版本
    const newRevision = currentRevision + 1;
    await conn.query(
      'UPDATE student_term_state SET source_revision = ? WHERE school_id = ? AND term_id = ? AND student_id = ?',
      [newRevision, studentKey.schoolId, studentKey.termId, studentKey.studentId]
    );

    // 5. 记录幂等结果
    if (requestKey) {
      await conn.query(`
        INSERT INTO request_idempotency (request_key, school_id, payload_hash, response_body, source_revision)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE payload_hash = VALUES(payload_hash), response_body = VALUES(response_body), source_revision = VALUES(source_revision)
      `, [requestKey, studentKey.schoolId, payloadHash, JSON.stringify(result || {}), newRevision]);
    }

    if (shouldRelease) await conn.commit();

    return {
      sourceRevision: newRevision,
      result,
      replayed: false
    };
  } catch (err) {
    if (shouldRelease) await conn.rollback();
    throw err;
  } finally {
    if (shouldRelease) conn.release();
  }
}

/**
 * 批量学生学期数据变更事务包装器 (按学生键稳定排序锁行，避免死锁)
 */
async function withStudentTermsMutation({ connection, actor, studentKeys, requestKey, payloadHash }, mutate) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    if (shouldRelease) await conn.beginTransaction();

    // 1. 幂等校验
    if (requestKey && studentKeys.length > 0) {
      const [idempotencyRows] = await conn.query(
        'SELECT payload_hash, response_body FROM request_idempotency WHERE request_key = ? AND school_id = ? FOR UPDATE',
        [requestKey, studentKeys[0].schoolId]
      );
      if (idempotencyRows && idempotencyRows.length > 0) {
        const record = idempotencyRows[0];
        if (record.payload_hash !== payloadHash) {
          const err = new Error('幂等请求冲突：相同的 request_key 但载荷哈希不匹配');
          err.statusCode = 409;
          throw err;
        }
        const responseData = typeof record.response_body === 'string' ? JSON.parse(record.response_body) : record.response_body;
        return {
          sourceRevisions: {},
          result: responseData,
          replayed: true
        };
      }
    }

    // 2. 按 student_id 升序排序并加锁，严格防止死锁
    const sortedKeys = [...studentKeys].sort((a, b) => a.studentId - b.studentId);
    const sourceRevisions = {};

    for (const k of sortedKeys) {
      await conn.query(`
        INSERT INTO student_term_state (school_id, term_id, student_id, source_revision)
        VALUES (?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE id = id
      `, [k.schoolId, k.termId, k.studentId]);

      const [stateRows] = await conn.query(
        'SELECT source_revision FROM student_term_state WHERE school_id = ? AND term_id = ? AND student_id = ? FOR UPDATE',
        [k.schoolId, k.termId, k.studentId]
      );
      sourceRevisions[k.studentId] = stateRows[0].source_revision;
    }

    // 3. 执行批量业务变更
    const result = await mutate(conn);

    // 4. 递增各学生版本
    for (const k of sortedKeys) {
      const nextRev = sourceRevisions[k.studentId] + 1;
      await conn.query(
        'UPDATE student_term_state SET source_revision = ? WHERE school_id = ? AND term_id = ? AND student_id = ?',
        [nextRev, k.schoolId, k.termId, k.studentId]
      );
      sourceRevisions[k.studentId] = nextRev;
    }

    // 5. 记录幂等
    if (requestKey && studentKeys.length > 0) {
      await conn.query(`
        INSERT INTO request_idempotency (request_key, school_id, payload_hash, response_body)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE payload_hash = VALUES(payload_hash), response_body = VALUES(response_body)
      `, [requestKey, studentKeys[0].schoolId, payloadHash, JSON.stringify(result || {})]);
    }

    if (shouldRelease) await conn.commit();

    return {
      sourceRevisions,
      result,
      replayed: false
    };
  } catch (err) {
    if (shouldRelease) await conn.rollback();
    throw err;
  } finally {
    if (shouldRelease) conn.release();
  }
}

module.exports = {
  withStudentTermMutation,
  withStudentTermsMutation
};
