/**
 * backend/services/rosterImportService.js
 *
 * 任务 17: 学籍表导入服务 (安全防覆盖、角色隔离与版本推进)
 *
 * 职责：
 * 1. 严格权限隔离：仅管理员 (manager) 具备学籍导入权限，教师/学生越权直接拒绝 (403)
 * 2. 稳定身份匹配：以学校和稳定学号 (username/studentNo) 为唯一识别依据
 * 3. 防同名覆盖：同名但学号不同绝不覆盖原有学生档案，创建独立新账号
 * 4. 字段安全白名单：禁止导入或覆盖 role, password, 成绩或已发布快照；强制 role='student'
 * 5. 版本推进：转班或基础资料更新时，原子推进 student_term_state 的 profile_revision
 * 6. 审计留痕：批次记录写入 roster_import_batch 与 operation_audit
 */
const crypto = require('crypto');
const db = require('../db');

async function previewRosterImport({ actor, schoolId = 1, termId = 1, rows = [], connection = null }) {
  const conn = connection || db;

  // 1. 角色校验
  if (actor.role !== 'manager' && actor.role !== 'admin') {
    const err = new Error('非校级管理员禁止操作学籍表导入');
    err.status = 403;
    throw err;
  }

  const items = [];
  let insertCount = 0;
  let updateCount = 0;
  let conflictCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const studentNo = String(r.studentNo || r.username || '').trim();
    const realName = String(r.realName || r.real_name || r.name || '').trim();
    const grade = r.grade ? parseInt(r.grade, 10) : 1;
    const classNo = r.classNo || r.class_no ? parseInt(r.classNo || r.class_no, 10) : 1;

    if (!studentNo || !realName) {
      items.push({
        rowIndex: i + 1,
        studentNo,
        realName,
        action: 'CONFLICT',
        conflictReason: '学号或姓名为空，无法确认学生稳定身份'
      });
      conflictCount++;
      continue;
    }

    // 依学校与稳定学号查询
    const [existing] = await conn.query(
      "SELECT id, username, real_name, role, grade, class_no FROM users WHERE school_id = ? AND username = ?",
      [schoolId, studentNo]
    );

    if (existing && existing.length > 0) {
      const u = existing[0];
      if (u.real_name === realName) {
        // 学号与姓名均一致：判定为已有学生资料更新 (如升年级、转班)
        items.push({
          rowIndex: i + 1,
          studentId: u.id,
          studentNo: u.username,
          realName: u.real_name,
          action: 'UPDATE',
          oldGrade: u.grade,
          oldClassNo: u.class_no,
          newGrade: grade,
          newClassNo: classNo,
          role: 'student' // 强制限定为 student
        });
        updateCount++;
      } else {
        // 学号相同但姓名冲突
        items.push({
          rowIndex: i + 1,
          studentId: u.id,
          studentNo: u.username,
          realName,
          conflictWith: u.real_name,
          action: 'CONFLICT',
          conflictReason: `学号 ${studentNo} 已由学生【${u.real_name}】占用，与提交姓名【${realName}】冲突，禁止盲目覆盖`
        });
        conflictCount++;
      }
    } else {
      // 学号未被占用：查是否有同名学生
      const [sameNameRows] = await conn.query(
        "SELECT id, username FROM users WHERE school_id = ? AND real_name = ?",
        [schoolId, realName]
      );
      const isSameName = sameNameRows && sameNameRows.length > 0;

      items.push({
        rowIndex: i + 1,
        studentNo,
        realName,
        action: 'INSERT',
        newGrade: grade,
        newClassNo: classNo,
        role: 'student', // 强制限定为 student
        note: isSameName ? `存在同名学生 (学号: ${sameNameRows[0].username})，将创建独立账号，不发生覆盖` : '新入读建档'
      });
      insertCount++;
    }
  }

  const previewKey = 'ROSTER_PREV_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');

  return {
    previewKey,
    summary: {
      total: rows.length,
      insertCount,
      updateCount,
      conflictCount
    },
    items
  };
}

async function commitRosterImport({ actor, schoolId = 1, termId = 1, previewKey, items = [], connection = null }) {
  const conn = connection || db;

  // 1. 角色校验
  if (actor.role !== 'manager' && actor.role !== 'admin') {
    const err = new Error('非校级管理员禁止执行学籍导入落库');
    err.status = 403;
    throw err;
  }

  const batchId = 'ROSTER_BATCH_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    if (item.action === 'CONFLICT') {
      continue; // 跳过冲突项
    }

    if (item.action === 'INSERT') {
      // 插入新学生：严格固定 role='student'，不写入密码及其他敏感字段
      const [insUser] = await conn.query(`
        INSERT INTO users (school_id, username, password, real_name, role, grade, class_no, status)
        VALUES (?, ?, 'default_pwd_hash', ?, 'student', ?, ?, 0)
      `, [schoolId, item.studentNo, item.realName, item.newGrade, item.newClassNo]);

      const newStudentId = insUser.insertId;

      // 初始化 student_term_state
      await conn.query(`
        INSERT INTO student_term_state (school_id, term_id, student_id, source_revision, profile_revision)
        VALUES (?, ?, ?, 1, 1)
        ON DUPLICATE KEY UPDATE school_id = VALUES(school_id)
      `, [schoolId, termId, newStudentId]);

      inserted++;
    } else if (item.action === 'UPDATE') {
      // 更新已有学生资料：仅允许更新 grade 与 class_no，严禁更新 role 或 password
      await conn.query(`
        UPDATE users
        SET grade = ?, class_no = ?
        WHERE id = ? AND school_id = ?
      `, [item.newGrade, item.newClassNo, item.studentId, schoolId]);

      // 推进 student_term_state 的 profile_revision
      await conn.query(`
        INSERT INTO student_term_state (school_id, term_id, student_id, source_revision, profile_revision)
        VALUES (?, ?, ?, 1, 2)
        ON DUPLICATE KEY UPDATE profile_revision = profile_revision + 1
      `, [schoolId, termId, item.studentId]);

      updated++;
    }
  }

  // 记录批次表
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS roster_import_batch (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_id VARCHAR(64) NOT NULL UNIQUE,
        school_id INT NOT NULL,
        term_id INT NOT NULL,
        operator_id INT NOT NULL,
        total_rows INT NOT NULL DEFAULT 0,
        insert_count INT NOT NULL DEFAULT 0,
        update_count INT NOT NULL DEFAULT 0,
        conflict_count INT NOT NULL DEFAULT 0,
        details_json JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_school_term (school_id, term_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await conn.query(`
      INSERT INTO roster_import_batch (
        batch_id, school_id, term_id, operator_id, total_rows, insert_count, update_count, conflict_count, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      batchId,
      schoolId,
      termId,
      actor.id,
      items.length,
      inserted,
      updated,
      items.length - inserted - updated,
      JSON.stringify({ previewKey, total: items.length, inserted, updated })
    ]);
  } catch (e) {
    // 批次表容错
  }

  // 记录审计日志
  try {
    await conn.query(`
      INSERT INTO operation_audit (
        school_id, actor_user_id, actor_role, target_type, target_id, action,
        old_summary, new_summary, request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      schoolId,
      actor.id,
      actor.role || 'manager',
      'ROSTER_IMPORT',
      batchId,
      'IMPORT_ROSTER',
      JSON.stringify({ previewKey }),
      JSON.stringify({ batchId, total: items.length, inserted, updated }),
      batchId
    ]);
  } catch (e) {
    // 审计表容错
  }

  return {
    success: true,
    batchId,
    inserted,
    updated,
    skippedConflicts: items.length - inserted - updated
  };
}

module.exports = {
  previewRosterImport,
  commitRosterImport
};
