/**
 * cardController.js — 实体卡配额、制卡与扫码申领审核控制器 (严格对接 SPEC V2.0 数据库架构)
 */

const crypto = require("crypto");
const { pool } = require("../db");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");
const { getMonthKey } = require("../utils/monthKey");

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

/**
 * POST /api/v1/admin/card-quotas
 * 配置教师月度卡配额
 */
async function setCardQuota(req, res, next) {
  const teacherId = req.body.teacherId || req.body.teacher_id;
  const monthKey = req.body.monthKey || req.body.month_key;
  const quotaN = req.body.quotaN !== undefined ? req.body.quotaN : (req.body.quota_count !== undefined ? req.body.quota_count : req.body.quota_n);
  const rawAlloc = req.body.allocationJson || req.body.allocation_json || req.body.allocations;

  if (!teacherId || !monthKey || quotaN === undefined) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "请填写完整配额参数 (教师、月份与配额总额度)", 422);
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user?.schoolId || 1;
    const adminId = req.user?.id || req.user?.userId || 1;

    let termId = req.body.termId || req.body.term_id;
    if (!termId) {
      const [termRows] = await conn.query(
        "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
        [schoolId]
      );
      termId = termRows.length > 0 ? termRows[0].id : 1;
    }

    let alloc = {};
    if (typeof rawAlloc === "string") {
      try { alloc = JSON.parse(rawAlloc); } catch { alloc = {}; }
    } else if (typeof rawAlloc === "object" && rawAlloc !== null) {
      if (Array.isArray(rawAlloc)) {
        rawAlloc.forEach((a) => {
          if (a?.code && a?.count) alloc[a.code] = Number(a.count);
        });
      } else {
        alloc = rawAlloc;
      }
    }

    const totalAlloc = Object.values(alloc).reduce((sum, val) => sum + Number(val || 0), 0);
    if (Object.keys(alloc).length > 0 && totalAlloc !== Number(quotaN)) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, `指标分配卡片总数(${totalAlloc})必须等于配额N(${quotaN})`, 422);
    }

    await conn.query(
      `INSERT INTO card_quota_rule (
        school_id, term_id, month_key, teacher_id, quota_n, allocation_json, config_version, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'V1', ?)
      ON DUPLICATE KEY UPDATE quota_n = VALUES(quota_n), allocation_json = VALUES(allocation_json)`,
      [schoolId, termId, monthKey, teacherId, quotaN, JSON.stringify(alloc), adminId]
    );

    success(res, { teacherId, monthKey, quotaN, allocation: alloc }, "配额配置成功");
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/admin/cards/generate-month
 * 批量生成月度实体卡印刷条目及安全令牌
 */
async function generateMonthCards(req, res, next) {
  const { termId = 1, monthKey, teacherId, count = 10, categoryId } = req.body;
  const mKey = monthKey || getMonthKey(new Date());

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const schoolId = req.user?.schoolId || 1;

    // 默认获取三级加分指标
    let targetCatId = categoryId;
    if (!targetCatId) {
      const [catRows] = await conn.query(
        "SELECT id FROM edu_evaluation_category WHERE category_level = 3 AND status = 1 LIMIT 1"
      );
      if (catRows.length === 0) throw new Error("无有效的三级加分指标");
      targetCatId = catRows[0].id;
    }

    // 默认分配给首个教师
    let targetTeacherId = teacherId;
    if (!targetTeacherId) {
      const [tRows] = await conn.query("SELECT id FROM users WHERE role = 'teacher' AND school_id = ? LIMIT 1", [
        schoolId
      ]);
      targetTeacherId = tRows.length > 0 ? tRows[0].id : 2;
    }

    // 查当前教师当月最大序号
    const [[maxRow]] = await conn.query(
      "SELECT COALESCE(MAX(serial_no), 0) AS max_s FROM reward_card WHERE school_id = ? AND teacher_id = ? AND month_key = ?",
      [schoolId, targetTeacherId, mKey]
    );
    let startSerial = Number(maxRow.max_s);

    const validFrom = `${mKey}-01 00:00:00`;
    // 计算月末
    const [y, m] = mKey.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const validUntil = `${mKey}-${lastDay} 23:59:59`;

    const createdCards = [];
    for (let i = 1; i <= Number(count); i++) {
      startSerial++;
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = sha256(rawToken);

      const [resInsert] = await conn.query(
        `INSERT INTO reward_card (
          school_id, term_id, teacher_id, month_key, serial_no, category_id,
          token_hash, valid_from, valid_until, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNUSED')`,
        [schoolId, termId, targetTeacherId, mKey, startSerial, targetCatId, tokenHash, validFrom, validUntil]
      );

      createdCards.push({
        id: resInsert.insertId,
        serialNo: startSerial,
        token: rawToken, // 供打印二维码 / 扫码调用
        monthKey: mKey,
        status: "UNUSED"
      });
    }

    await conn.commit();
    success(res, { count: createdCards.length, cards: createdCards }, "月度实体卡批量生成成功");
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/v1/cards
 * 卡片查询（管理员/教师）
 */
async function getCards(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user?.schoolId || 1;
    const { monthKey, status } = req.query;
    const teacherId = req.user?.role === "teacher" ? req.user.id || req.user.userId : req.query.teacherId;

    let sql = `
      SELECT c.id, c.teacher_id, c.month_key, c.serial_no, c.token_hash, c.status, c.created_at,
             cat.category_name, cat.category_code,
             u.real_name AS teacher_name,
             stu.real_name AS used_student_name
      FROM reward_card c
      LEFT JOIN edu_evaluation_category cat ON c.category_id = cat.id
      LEFT JOIN users u ON c.teacher_id = u.id
      LEFT JOIN users stu ON c.used_student_id = stu.id
      WHERE c.school_id = ?
    `;
    const params = [schoolId];

    if (monthKey) {
      sql += " AND c.month_key = ?";
      params.push(monthKey);
    }
    if (status) {
      sql += " AND c.status = ?";
      params.push(status);
    }
    if (teacherId) {
      sql += " AND c.teacher_id = ?";
      params.push(teacherId);
    }

    sql += " ORDER BY c.id DESC LIMIT 100";

    const [rows] = await conn.query(sql, params);
    success(res, rows);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/v1/student/cards/preview
 * 移动端扫描实体卡，展示卡片预览信息（只读，不加分）
 */
async function previewCard(req, res, next) {
  const { token } = req.query;
  if (!token) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "请提供卡片安全凭证 token", 422);
  }

  const tokenHash = sha256(token);
  let conn;
  try {
    conn = await pool.getConnection();

    const [rows] = await conn.query(
      `SELECT c.id, c.month_key, c.serial_no, c.status,
              cat.category_name, cat.category_code, cat.score,
              u.real_name AS teacher_name
       FROM reward_card c
       LEFT JOIN edu_evaluation_category cat ON c.category_id = cat.id
       LEFT JOIN users u ON c.teacher_id = u.id
       WHERE c.token_hash = ?
       LIMIT 1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return fail(res, ErrorCodes.NOT_FOUND, "未查询到该实体卡信息", 404);
    }

    const card = rows[0];
    if (card.status === "USED") {
      return fail(res, ErrorCodes.CARD_USED, "该实体卡已审核通过并入账，属于永久失效卡", 409);
    }
    if (card.status === "PENDING") {
      return fail(res, ErrorCodes.CARD_PENDING, "该实体卡已被扫码申领，正在教师审核中", 409);
    }
    if (card.status === "EXPIRED") {
      return fail(res, ErrorCodes.CARD_EXPIRED, "实体卡跨月未扫码已超期，禁止发起新申领", 400);
    }
    if (card.status === "VOID") {
      return fail(res, ErrorCodes.CARD_VOID, "该实体卡已被作废，不可继续使用", 409);
    }

    success(res, {
      cardId: card.id,
      monthKey: card.month_key,
      serialNo: card.serial_no,
      categoryName: card.category_name,
      categoryCode: card.category_code,
      teacherName: card.teacher_name,
      points: 1,
      status: card.status
    });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/student/card-claims
 * B模式学生确认申领实体卡，悲观行锁防并发抢卡，生成待审单据
 */
async function claimCard(req, res, next) {
  const { token, requestKey } = req.body;
  if (!token) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "缺少卡片安全凭证 token", 422);
  }

  const tokenHash = sha256(token);
  const studentId = req.user?.id || req.user?.userId;
  const schoolId = req.user?.schoolId || 1;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. 悲观行锁锁定卡片
    const [cardRows] = await conn.query(
      `SELECT c.id, c.school_id, c.term_id, c.month_key, c.status, c.category_id,
              cat.category_name, cat.category_code
       FROM reward_card c
       LEFT JOIN edu_evaluation_category cat ON c.category_id = cat.id
       WHERE c.token_hash = ?
       FOR UPDATE`,
      [tokenHash]
    );

    if (cardRows.length === 0) {
      await conn.rollback();
      return fail(res, ErrorCodes.NOT_FOUND, "该实体卡不存在", 404);
    }

    const card = cardRows[0];

    // 状态判定
    if (card.status === "PENDING") {
      await conn.rollback();
      return fail(res, ErrorCodes.CARD_PENDING, "该实体卡已被其他同学扫码申领，正在审核中", 409);
    }
    if (card.status === "USED") {
      await conn.rollback();
      return fail(res, ErrorCodes.CARD_USED, "该实体卡已审核通过并入账，属于永久失效卡", 409);
    }
    if (card.status === "EXPIRED") {
      await conn.rollback();
      return fail(res, ErrorCodes.CARD_EXPIRED, "实体卡跨月未扫码已超期，禁止发起新申领", 400);
    }
    if (card.status === "VOID") {
      await conn.rollback();
      return fail(res, ErrorCodes.CARD_VOID, "该实体卡已被作废，不可继续使用", 409);
    }
    if (card.status !== "UNUSED") {
      await conn.rollback();
      return fail(res, ErrorCodes.BAD_REQUEST, `卡片当前状态不可申领(${card.status})`, 400);
    }

    // 2. 写入 card_claim 记录
    const reqKey = requestKey || `CLAIM_${card.id}_${studentId}_${Date.now()}`;
    const [claimInsert] = await conn.query(
      `INSERT INTO card_claim (
        school_id, card_id, student_id, status, request_key
      ) VALUES (?, ?, ?, 'PENDING', ?)`,
      [schoolId, card.id, studentId, reqKey]
    );

    // 3. 将 reward_card 状态变更为 PENDING
    await conn.query("UPDATE reward_card SET status = 'PENDING' WHERE id = ?", [card.id]);

    await conn.commit();

    success(
      res,
      {
        claimId: claimInsert.insertId,
        cardId: card.id,
        status: "PENDING",
        cardStatus: "PENDING",
        category: card.category_name,
        pointsPending: 1,
        pointsCredited: 0
      },
      "申领已提交，等待教师审核"
    );
  } catch (err) {
    if (conn) await conn.rollback();
    if (String(err.code) === "ER_DUP_ENTRY") {
      return fail(res, ErrorCodes.DUPLICATE_REQUEST, "该实体卡已在申领流程中，请勿重复提交", 409);
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/v1/teacher/card-claims
 * 教师查询待审扫卡清单
 */
async function getTeacherClaims(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection();
    const teacherId = req.user?.id || req.user?.userId;
    const { status = "PENDING" } = req.query;

    let sql = `
      SELECT cl.id AS claim_id, cl.status AS claim_status, cl.claimed_at, cl.created_at AS claim_time,
             c.id AS card_id, c.month_key, c.serial_no,
             cat.category_name, cat.category_code,
             u.id AS student_id, u.real_name AS student_name, u.grade, u.class_no
      FROM card_claim cl
      JOIN reward_card c ON cl.card_id = c.id
      JOIN edu_evaluation_category cat ON c.category_id = cat.id
      JOIN users u ON cl.student_id = u.id
      WHERE (c.teacher_id = ? OR ? IN (SELECT id FROM users WHERE role = 'manager'))
    `;
    const params = [teacherId, teacherId];

    if (status) {
      sql += " AND cl.status = ?";
      params.push(status);
    }

    sql += " ORDER BY cl.id DESC";

    const [rows] = await conn.query(sql, params);
    success(res, rows);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/teacher/card-claims/:id/decision
 * 教师审核决定（APPROVE 加1分并USED / REJECT 驳回并VOID）
 */
async function decideClaim(req, res, next) {
  const claimId = req.params.id;
  const { decision, rejectReason, requestKey } = req.body;
  if (!["APPROVE", "REJECT"].includes(decision)) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "审核决定只能是 APPROVE 或 REJECT", 422);
  }

  const teacherId = req.user?.id || req.user?.userId;
  const schoolId = req.user?.schoolId || 1;

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. 悲观锁锁定申领单
    const [claimRows] = await conn.query(
      `SELECT cl.id, cl.school_id, cl.card_id, cl.student_id, cl.status,
              c.term_id, c.category_id, c.teacher_id,
              cat.category_code,
              u.grade, u.class_no
       FROM card_claim cl
       JOIN reward_card c ON cl.card_id = c.id
       JOIN edu_evaluation_category cat ON c.category_id = cat.id
       JOIN users u ON cl.student_id = u.id
       WHERE cl.id = ?
       FOR UPDATE`,
      [claimId]
    );

    if (claimRows.length === 0) {
      await conn.rollback();
      return fail(res, ErrorCodes.NOT_FOUND, "未找到该扫码申领记录", 404);
    }

    const claim = claimRows[0];
    if (claim.status !== "PENDING") {
      await conn.rollback();
      return fail(res, ErrorCodes.CLAIM_NOT_PENDING, "该扫卡单据已被处理过（已通过或已驳回），不可重复审核", 400);
    }

    let scoreRecordId = null;
    const now = new Date();
    const dimCode = (claim.category_code || "D").charAt(0);
    const classSnapshot = JSON.stringify({ grade: claim.grade, class_no: claim.class_no });

    if (decision === "APPROVE") {
      // 通过申领
      await conn.query("UPDATE card_claim SET status = 'APPROVED', reviewer_id = ?, reviewed_at = ? WHERE id = ?", [
        teacherId,
        now,
        claimId
      ]);
      // 卡片置为终态 USED，绑定 used_student_id
      await conn.query("UPDATE reward_card SET status = 'USED', used_student_id = ?, used_at = ? WHERE id = ?", [
        claim.student_id,
        now,
        claim.card_id
      ]);

      // 原子写入不可篡改积分流水 score_record (+1)
      const reqKey = requestKey || `DECISION_SCORE_${claimId}_${Date.now()}`;
      const [scoreRes] = await conn.query(
        `INSERT INTO score_record (
          school_id, term_id, student_id, class_snapshot, dimension_code, category_id,
          source, delta, card_claim_id, operator_id, request_key
        ) VALUES (?, ?, ?, ?, ?, ?, 'B_CARD', 1, ?, ?, ?)`,
        [
          schoolId,
          claim.term_id,
          claim.student_id,
          classSnapshot,
          dimCode,
          claim.category_id,
          claim.id,
          teacherId,
          reqKey
        ]
      );
      scoreRecordId = scoreRes.insertId;

      // 写入审计日志 operation_audit
      await conn.query(
        `INSERT INTO operation_audit (
          school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, new_summary
        ) VALUES (?, ?, ?, 'CARD_CLAIM', ?, 'CLAIM_APPROVE', ?, ?)`,
        [
          schoolId,
          teacherId,
          req.user?.role || "teacher",
          claimId,
          reqKey || `REQ_CLAIM_${claimId}_${Date.now()}`,
          JSON.stringify({ scoreRecordId, delta: 1 })
        ]
      );
    } else {
      // 驳回申领
      await conn.query(
        "UPDATE card_claim SET status = 'REJECTED', reviewer_id = ?, reviewed_at = ?, reject_reason = ? WHERE id = ?",
        [teacherId, now, rejectReason || null, claimId]
      );
      // 卡片置为作废 VOID
      await conn.query("UPDATE reward_card SET status = 'VOID' WHERE id = ?", [claim.card_id]);

      // 写入审计日志 operation_audit
      await conn.query(
        `INSERT INTO operation_audit (
          school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, new_summary
        ) VALUES (?, ?, ?, 'CARD_CLAIM', ?, 'CLAIM_REJECT', ?, ?)`,
        [
          schoolId,
          teacherId,
          req.user?.role || "teacher",
          claimId,
          `REQ_REJECT_${claimId}_${Date.now()}`,
          JSON.stringify({ status: "REJECTED", reason: rejectReason })
        ]
      );
    }

    await conn.commit();

    success(
      res,
      {
        claimId: Number(claimId),
        claimStatus: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        cardStatus: decision === "APPROVE" ? "USED" : "VOID",
        scoreRecordId,
        delta: decision === "APPROVE" ? 1 : 0,
        creditedAt: now.toISOString()
      },
      decision === "APPROVE" ? "审核通过，积分已正式入账，实体卡已置为失效终态" : "申领已驳回作废"
    );
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  setCardQuota,
  generateMonthCards,
  getCards,
  previewCard,
  claimCard,
  getTeacherClaims,
  decideClaim
};
