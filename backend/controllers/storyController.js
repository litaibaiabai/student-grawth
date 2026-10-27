/**
 * storyController.js — 月度生活故事作品提交与评分控制器 (严格对接 SPEC V2.0 数据库架构)
 */

const crypto = require("crypto");
const { pool } = require("../db");
const {requireStudentScope,classFilter}=require("../middleware/studentScope");
const {AppError}=require("../middleware/errorHandler");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");
const { getMonthKey } = require("../utils/monthKey");

/**
 * 模拟大模型推理评分与评语生成
 */
function mockEvaluateStory(content) {
  const len = (content || "").trim().length;
  let score = 75;
  let suggestion = "叙事较为通顺，真实记录了生活细节。";

  if (len >= 300) {
    score = Math.min(95, 82 + Math.floor(len / 100));
    suggestion = "故事生动具体，展现了积极向上的生活面貌，具有较强的反思与成长意识。";
  } else if (len >= 100) {
    score = 80;
    suggestion = "内容结构完整，建议进一步充实感悟与行动过程。";
  } else {
    score = 68;
    suggestion = "篇幅较短，建议补充具体事件情境与收获体会。";
  }

  return { score, suggestion };
}

/**
 * POST /api/v1/student/stories
 * 提交月度生活故事文稿正文（草稿/正式提交）
 */
async function submitStory(req, res, next) {
  const { title, content, monthKey, month_key, isDraft, is_draft } = req.body;
  if (!content || !content.trim()) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "文稿正文不能为空", 422);
  }

  const studentId = req.user?.id || req.user?.userId;
  const schoolId = req.user?.schoolId || 1;
  const mKey = monthKey || month_key || getMonthKey(new Date());
  const draftFlag = isDraft !== undefined ? isDraft : is_draft;
  const status = draftFlag ? "DRAFT" : "SUBMITTED";

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. 获取当前学期
    const [termRows] = await conn.query(
      "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
      [schoolId]
    );
    const termId = termRows.length > 0 ? termRows[0].id : 1;

    // 2. 检查当月是否已有记录
    const [existRows] = await conn.query(
      "SELECT id, current_version, status FROM story_submission WHERE school_id = ? AND student_id = ? AND term_id = ? AND month_key = ? FOR UPDATE",
      [schoolId, studentId, termId, mKey]
    );

    let storyId;
    let nextVer = 1;
    if (existRows.length > 0) {
      if(existRows[0].status!=='DRAFT')throw new AppError(409,'已提交或终审故事不可覆盖，请联系教师处理',409);
      storyId = existRows[0].id;
      nextVer = Number(existRows[0].current_version) + 1;
      await conn.query(
        "UPDATE story_submission SET status = ?, current_version = ? WHERE id = ?",
        [status, nextVer, storyId]
      );
    } else {
      const [ins] = await conn.query(
        `INSERT INTO story_submission (
          school_id, student_id, term_id, month_key, status, current_version
        ) VALUES (?, ?, ?, ?, ?, 1)`,
        [schoolId, studentId, termId, mKey, status]
      );
      storyId = ins.insertId;
    }

    // 3. AI 预评分与材料多版本留痕
    const aiResult = mockEvaluateStory(content);
    const contentHash = crypto.createHash("sha256").update(content).digest("hex");

    await conn.query(
      `INSERT INTO material_revision (
        school_id, owner_type, owner_id, version_no, text_content, content_hash,
        llm_suggestion, created_by, created_at
      ) VALUES (?, 'STORY', ?, ?, ?, ?, ?, ?, NOW())`,
      [schoolId, storyId, nextVer, content, contentHash, JSON.stringify(aiResult), studentId]
    );

    await conn.commit();

    success(res, {
      id: storyId,
      monthKey: mKey,
      status,
      version: nextVer,
      aiScore: aiResult.score,
      aiSuggestion: aiResult.suggestion
    }, isDraft ? "故事草稿已保存" : "故事已成功提交，AI初评建议已生成");
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/teacher/stories/:id/review
 * 教师人工复核 AI 建议并给出正式得分（0~100）
 */
async function reviewStory(req, res, next) {
  const storyId = req.params.id;
  const { teacherScore, teacher_score, finalScore, teacherComment, teacher_comment } = req.body;
  const scoreVal = teacherScore !== undefined ? teacherScore : (teacher_score !== undefined ? teacher_score : finalScore);
  const commentVal = teacherComment !== undefined ? teacherComment : (teacher_comment !== undefined ? teacher_comment : null);

  if (scoreVal === undefined || !Number.isFinite(Number(scoreVal)) || Number(scoreVal) < 0 || Number(scoreVal) > 100) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "正式得分必须在 0 ~ 100 之间", 422);
  }

  const teacherId = req.user?.id || req.user?.userId;

  let conn;
  try {
    conn = await pool.getConnection();

    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT * FROM story_submission WHERE id = ? FOR UPDATE", [storyId]);
    if (rows.length === 0) {
      await conn.rollback();
      return fail(res, ErrorCodes.NOT_FOUND, "故事记录不存在", 404);
    }

    if(Number(rows[0].school_id)!==Number(req.user.schoolId))throw new AppError(403,'禁止跨校审核',403);
    await requireStudentScope(req.user,rows[0].student_id,conn);
    if(rows[0].status!=='SUBMITTED')throw new AppError(409,'仅已提交故事可终审，请刷新列表',409);
    await conn.query(
      `UPDATE story_submission
       SET status = 'REVIEWED', teacher_score = ?, teacher_comment = ?, reviewer_id = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [Number(scoreVal), commentVal, teacherId, storyId]
    );

    await conn.query("INSERT INTO operation_audit(school_id,actor_user_id,actor_role,target_type,target_id,action,request_id,new_summary) VALUES(?,?,?,'STORY_SUBMISSION',?,'REVIEW_STORY',?,?)",[req.user.schoolId,teacherId,req.user.role,storyId,req.requestId||crypto.randomUUID(),JSON.stringify({teacherScore:Number(scoreVal),version:rows[0].current_version})]);
    await conn.commit();
    success(res, {
      id: Number(storyId),
      teacherScore: Number(scoreVal),
      status: "REVIEWED"
    }, "故事终审分已正式确认入账");
  } catch (err) {
    if(conn)await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/v1/stories
 * 查询故事文稿列表
 */
async function getStories(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user?.schoolId || 1;
    const { studentId, monthKey, month_key, status } = req.query;
    const queryMonth = monthKey || month_key;

    let sql = `
      SELECT s.*, u.real_name AS student_name, u.grade, u.class_no,
             t.real_name AS reviewer_name,
             mr.text_content,
             mr.llm_suggestion
      FROM story_submission s
      JOIN users u ON s.student_id = u.id
      LEFT JOIN users t ON s.reviewer_id = t.id
      LEFT JOIN material_revision mr ON (mr.owner_type = 'STORY' AND mr.owner_id = s.id AND mr.version_no = s.current_version)
      WHERE s.school_id = ?
    `;
    const params = [schoolId];
    sql += classFilter(req.user,"u",params);

    if (req.user?.role === "student") {
      sql += " AND s.student_id = ?";
      params.push(req.user.id || req.user.userId);
    } else if (studentId) {
      sql += " AND s.student_id = ?";
      params.push(studentId);
    }

    if (queryMonth) {
      sql += " AND s.month_key = ?";
      params.push(queryMonth);
    }
    if (status) {
      sql += " AND s.status = ?";
      params.push(status);
    }

    sql += " ORDER BY s.id DESC LIMIT 100";

    const [rows] = await conn.query(sql, params);
    const result = rows.map((row) => {
      let aiScore = null;
      let aiSuggestion = null;
      if (row.llm_suggestion) {
        try {
          const parsed = typeof row.llm_suggestion === "object" && row.llm_suggestion !== null
            ? row.llm_suggestion
            : JSON.parse(row.llm_suggestion);
          aiScore = parsed?.score ?? parsed?.pre_score ?? null;
          aiSuggestion = parsed?.suggestion ?? null;
        } catch (e) {}
      }
      return {
        ...row,
        content: row.text_content || "",
        ai_score: aiScore,
        ai_suggestion: aiSuggestion
      };
    });

    success(res, result);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  submitStory,
  reviewStory,
  getStories
};
