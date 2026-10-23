/**
 * importController.js — 学科/五育成绩导入与内存解析比对控制器
 */

const crypto = require("crypto");
const { pool } = require("../db");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");

/**
 * POST /api/v1/import/preview
 * 上传数据预览比对，内存解析返回逐行差异（只读，不落库）
 */
async function previewImport(req, res, next) {
  const { type = "SUBJECT", items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "导入数据行不能为空", 422);
  }
  if (items.length > 1000) {
    return fail(res, ErrorCodes.BAD_REQUEST, "单次导入限制 ≤ 1000 行", 400);
  }

  const schoolId = req.user?.schoolId || 1;

  let conn;
  try {
    conn = await pool.getConnection();

    // 预加载全校学生
    const [students] = await conn.query(
      "SELECT id, username, real_name, grade, class_no FROM users WHERE school_id = ? AND role = 'student'",
      [schoolId]
    );
    const userMap = new Map();
    for (const s of students) {
      userMap.set(s.username, s);
      userMap.set(String(s.id), s);
    }

    const diffs = [];
    let validCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const student = userMap.get(item.username) || userMap.get(String(item.studentId));

      if (!student) {
        diffs.push({
          row: i + 1,
          username: item.username || item.studentId,
          error: "未找到该学生账号",
          valid: false
        });
        continue;
      }

      const scoreNum = Number(item.score);
      if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
        diffs.push({
          row: i + 1,
          studentName: student.real_name,
          username: student.username,
          error: "分值必须在 0 ~ 100 之间",
          valid: false
        });
        continue;
      }

      // 查询旧值
      let oldScore = null;
      if (type === "SUBJECT") {
        const [exist] = await conn.query(
          "SELECT raw_score FROM subject_score WHERE student_id = ? AND subject_code = ? LIMIT 1",
          [student.id, item.subjectCode || "CHINESE"]
        );
        if (exist.length > 0 && exist[0].raw_score !== null) oldScore = Number(exist[0].raw_score);
      } else {
        const [exist] = await conn.query(
          "SELECT score_100 FROM student_dimension_score WHERE student_id = ? AND dimension_code = ? LIMIT 1",
          [student.id, item.dimension || "D"]
        );
        if (exist.length > 0) oldScore = Number(exist[0].score_100);
      }

      diffs.push({
        row: i + 1,
        studentId: student.id,
        studentName: student.real_name,
        username: student.username,
        grade: student.grade,
        classNo: student.class_no,
        target: type === "SUBJECT" ? (item.subjectName || item.subjectCode) : `【${item.dimension}】五育维度分`,
        oldScore,
        newScore: scoreNum,
        action: oldScore === null ? "NEW" : (oldScore === scoreNum ? "SAME" : "UPDATE"),
        valid: true
      });
      validCount++;
    }

    success(res, {
      total: items.length,
      validCount,
      type,
      diffs
    });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/import/commit
 * 确认导入，生成 batch_no，原子写入正式表
 */
async function commitImport(req, res, next) {
  const { type = "SUBJECT", items, termId = 1 } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "提交导入数据不能为空", 422);
  }

  const schoolId = req.user?.schoolId || 1;
  const operatorId = req.user?.id || req.user?.userId;
  const batchNo = `IMP_${Date.now()}_${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    let committedCount = 0;

    for (const item of items) {
      if (!item.valid && item.valid !== undefined) continue;

      if (type === "SUBJECT") {
        await conn.query(
          `INSERT INTO subject_score (
            school_id, term_id, student_id, subject_code, subject_name, raw_score, full_score, batch_no
          ) VALUES (?, ?, ?, ?, ?, ?, 100.00, ?)
          ON DUPLICATE KEY UPDATE
            raw_score = VALUES(raw_score),
            batch_no = VALUES(batch_no)`,
          [
            schoolId, termId, item.studentId,
            item.subjectCode || "CHINESE",
            item.subjectName || "语文",
            Number(item.newScore ?? item.score),
            batchNo
          ]
        );
      } else {
        await conn.query(
          `INSERT INTO student_dimension_score (
            school_id, term_id, student_id, dimension_code, score_100, batch_no, status
          ) VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED')
          ON DUPLICATE KEY UPDATE
            score_100 = VALUES(score_100),
            batch_no = VALUES(batch_no)`,
          [
            schoolId, termId, item.studentId,
            item.dimension || "D",
            Number(item.newScore ?? item.score),
            batchNo
          ]
        );
      }
      committedCount++;
    }

    // 写入操作审计
    await conn.query(
      `INSERT INTO operation_audit (
        school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, new_summary
      ) VALUES (?, ?, ?, ?, 0, 'IMPORT_DIFF', ?, ?)`,
      [
        schoolId, operatorId, req.user?.role || "teacher",
        type === "SUBJECT" ? "SUBJECT_SCORE" : "STUDENT_DIMENSION_SCORE",
        batchNo || `REQ_IMPORT_${Date.now()}`,
        JSON.stringify({ batchNo, committedCount, type })
      ]
    );

    await conn.commit();

    success(res, {
      batchNo,
      committedCount,
      type
    }, "数据批量导入入账成功");
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  previewImport,
  commitImport
};
