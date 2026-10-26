/**
 * importController.js — 学科/五育成绩导入与内存解析比对控制器
 */

const crypto = require("crypto");
const { pool } = require("../db");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");
const batchImportService = require("../services/batchImportService");

/**
 * POST /api/v1/import/preview
 * 上传数据预览比对，内存解析返回逐行差异（只读，不落库）
 */
async function previewImport(req, res, next) {
  const type = (req.body.type || "SUBJECT").toUpperCase();
  if (type === "DIMENSION" && req.user?.role === "teacher") {
    return fail(res, ErrorCodes.FORBIDDEN, "教师仅可导入任教学科期末成绩，六育维度终测评分需由教务管理员统一导入", 403);
  }
  const rawItems = req.body.items || req.body.records;
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (items.length === 0) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "导入数据行不能为空", 422);
  }
  if (items.length > 1000) {
    return fail(res, ErrorCodes.BAD_REQUEST, "单次导入限制 ≤ 1000 行", 400);
  }

  const schoolId = req.user?.schoolId || 1;

  let conn;
  try {
    conn = await pool.getConnection();

    // 动态回退当前活跃学期
    let termId = req.body?.termId || req.body?.term_id;
    if (!termId) {
      const [termRows] = await conn.query(
        "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
        [schoolId]
      );
      termId = termRows.length > 0 ? termRows[0].id : 1;
    }

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

      // 查询旧值（严格限定当前学校、学生与当前学期）
      let oldScore = null;
      if (type === "SUBJECT") {
        const [exist] = await conn.query(
          "SELECT raw_score FROM subject_score WHERE (school_id = ? OR school_id IS NULL) AND student_id = ? AND term_id = ? AND subject_code = ? LIMIT 1",
          [schoolId, student.id, termId, item.subjectCode || "CHINESE"]
        );
        if (exist.length > 0 && exist[0].raw_score !== null) oldScore = Number(exist[0].raw_score);
      } else {
        const [exist] = await conn.query(
          "SELECT score_100 FROM student_dimension_score WHERE (school_id = ? OR school_id IS NULL) AND student_id = ? AND term_id = ? AND dimension_code = ? LIMIT 1",
          [schoolId, student.id, termId, item.dimension || "D"]
        );
        if (exist.length > 0) oldScore = Number(exist[0].score_100);
      }

      const dimMap = {
        D: "德育",
        Z: "智育",
        T: "体育",
        M: "美育",
        L: "劳育",
        G: "生活故事"
      };
      const dimCode = item.dimension || "D";
      const dimName = dimMap[dimCode] || "综合维度";

      diffs.push({
        row: i + 1,
        studentId: student.id,
        studentName: student.real_name,
        username: student.username,
        grade: student.grade,
        classNo: student.class_no,
        target: type === "SUBJECT" ? item.subjectName || item.subjectCode : `【${dimCode}】${dimName}终测分`,
        subjectCode: item.subjectCode || "CHINESE",
        subjectName: item.subjectName || item.subjectCode || "语文",
        dimension: dimCode,
        oldScore,
        newScore: scoreNum,
        action: oldScore === null ? "NEW" : oldScore === scoreNum ? "SAME" : "UPDATE",
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
  const type = (req.body.type || "SUBJECT").toUpperCase();
  if (type === "DIMENSION" && req.user?.role === "teacher") {
    return fail(res, ErrorCodes.FORBIDDEN, "教师仅可导入任教学科期末成绩，六育维度终测评分需由教务管理员统一导入", 403);
  }
  const rawItems = req.body.items || req.body.records;
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (items.length === 0) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "提交导入数据不能为空", 422);
  }

  const schoolId = req.user?.schoolId || 1;
  const operatorId = req.user?.id || req.user?.userId;
  const batchNo = `IMP_${Date.now()}_${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  let conn;
  try {
    conn = await pool.getConnection();

    // 动态回退当前活跃学期
    let termId = req.body?.termId || req.body?.term_id;
    if (!termId) {
      const [termRows] = await conn.query(
        "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
        [schoolId]
      );
      termId = termRows.length > 0 ? termRows[0].id : 1;
    }

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
            schoolId,
            termId,
            item.studentId,
            item.subjectCode || "CHINESE",
            item.subjectName || "语文",
            Number(item.newScore ?? item.score),
            batchNo
          ]
        );
      } else {
        await conn.query(
          `INSERT INTO student_dimension_score (
            school_id, term_id, student_id, dimension_code, score_100, batch_no, status, confirmed_by, confirmed_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, NOW(6))
          ON DUPLICATE KEY UPDATE
            score_100 = VALUES(score_100),
            batch_no = VALUES(batch_no)`,
          [
            schoolId,
            termId,
            item.studentId,
            item.dimension || "D",
            Number(item.newScore ?? item.score),
            batchNo,
            operatorId
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
        schoolId,
        operatorId,
        req.user?.role || "teacher",
        type === "SUBJECT" ? "SUBJECT_SCORE" : "STUDENT_DIMENSION_SCORE",
        batchNo || `REQ_IMPORT_${Date.now()}`,
        JSON.stringify({ batchNo, committedCount, type })
      ]
    );

    await conn.commit();

    success(
      res,
      {
        batchNo,
        committedCount,
        type
      },
      "数据批量导入入账成功"
    );
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/import/batch-preview
 * 全校成绩 Excel 内存批量解析体检（分流正常数据与异常数据）
 */
async function previewBatchImport(req, res, next) {
  try {
    const type = (req.body.type || "SUBJECT").toUpperCase();
    if (type === "DIMENSION" && req.user?.role === "teacher") {
      return fail(res, ErrorCodes.FORBIDDEN, "教师仅可导入任教学科期末成绩，六育维度终测评分需由教务管理员统一导入", 403);
    }
    const schoolId = req.user?.schoolId || 1;
    const operatorId = req.user?.id || req.user?.userId;
    const rows = req.body.rows || [];
    const termId = req.body.termId;

    if (!Array.isArray(rows) || rows.length === 0) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, "导入数据行不能为空", 422);
    }

    const result = await batchImportService.previewBatchExcel({
      schoolId,
      termId,
      type,
      rows,
      operatorId
    });

    success(res, result, "数据体检完成");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/import/batch-commit
 * 全校成绩 Excel 分块原子批量写入正式表
 */
async function commitBatchImport(req, res, next) {
  try {
    const type = (req.body.type || "SUBJECT").toUpperCase();
    if (type === "DIMENSION" && req.user?.role === "teacher") {
      return fail(res, ErrorCodes.FORBIDDEN, "教师仅可导入任教学科期末成绩，六育维度终测评分需由教务管理员统一导入", 403);
    }
    const schoolId = req.user?.schoolId || 1;
    const operatorId = req.user?.id || req.user?.userId;
    const validStudents = req.body.validStudents || req.body.students || [];
    const termId = req.body.termId;

    if (!Array.isArray(validStudents) || validStudents.length === 0) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, "提交导入数据不能为空", 422);
    }

    const result = await batchImportService.commitBatchExcel({
      schoolId,
      termId,
      type,
      validStudents,
      operatorId
    });

    success(res, result, "全校成绩批量导入成功");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  previewImport,
  commitImport,
  previewBatchImport,
  commitBatchImport
};
