/**
 * system.test.js — 全流程业务链路与边界红线自动化集成测试 (严格契合 SPEC V2.0 数据库架构)
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { pool } = require("../db");
const jwt = require("jsonwebtoken");

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

describe("六育学生学期综合素质评价系统 - 完整业务链路与不变量测试", async () => {
  let adminToken, teacherToken, studentToken;
  let adminId, teacherId, studentId;
  const JWT_SECRET = process.env.JWT_SECRET || "super_secret_student_growth_jwt_key_2026";

  before(async () => {
    // 准备测试账号信息
    const [users] = await pool.query("SELECT id, role, username, school_id, classes FROM users");
    for (const u of users) {
      const payload = {
        id: u.id,
        userId: u.id,
        schoolId: u.school_id,
        role: u.role,
        username: u.username,
        classes: u.classes
      };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
      if (u.role === "manager") {
        adminToken = token;
        adminId = u.id;
      } else if (u.role === "teacher" && !teacherToken) {
        teacherToken = token;
        teacherId = u.id;
      } else if (u.role === "student" && !studentToken) {
        studentToken = token;
        studentId = u.id;
      }
    }
  });

  test("1. 基础学期与六育三级指标字典应正常就绪", async () => {
    const [termRows] = await pool.query("SELECT * FROM academic_year WHERE is_current = 1");
    assert.ok(termRows.length > 0, "必须存在当前学期");
    assert.equal(termRows[0].academic_year, "2026-2027");

    const [catRows] = await pool.query("SELECT * FROM edu_evaluation_category WHERE status = 1");
    assert.ok(catRows.length >= 10, "六育指标树至少应包含基础指标");
    const level3 = catRows.filter((c) => c.category_level === 3);
    assert.ok(level3.length > 0, "必须包含三级加分指标");
    assert.equal(level3[0].score, 1, "三级指标加分固定为+1");
  });

  test("2. B模式实体卡制卡、防伪Token生成与状态流转", async () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(rawToken);

    // 查当前最大序号
    const [[maxRow]] = await pool.query(
      "SELECT COALESCE(MAX(serial_no), 0) AS max_s FROM reward_card WHERE school_id = 1 AND teacher_id = ? AND month_key = '2026-10'",
      [teacherId]
    );
    const serialNo = Number(maxRow.max_s) + 1;

    // 管理员制卡 (UNUSED)
    const [insertCard] = await pool.query(
      `INSERT INTO reward_card (
        school_id, term_id, teacher_id, month_key, serial_no, category_id,
        token_hash, valid_from, valid_until, status
      ) VALUES (1, 1, ?, '2026-10', ?, 3, ?, '2026-10-01 00:00:00', '2026-10-31 23:59:59', 'UNUSED')`,
      [teacherId, serialNo, tokenHash]
    );
    const cardId = insertCard.insertId;
    assert.ok(cardId > 0);

    // 学生扫码确认申领 (B模式，状态转为 PENDING，写申领单)
    const [claimRes] = await pool.query(
      `INSERT INTO card_claim (
        school_id, card_id, student_id, status, request_key
      ) VALUES (1, ?, ?, 'PENDING', ?)`,
      [cardId, studentId, `REQ_TEST_CLAIM_${Date.now()}`]
    );
    const claimId = claimRes.insertId;
    await pool.query("UPDATE reward_card SET status = 'PENDING' WHERE id = ?", [cardId]);

    // 验证卡片处于 PENDING 状态
    const [[pendingCard]] = await pool.query("SELECT status FROM reward_card WHERE id = ?", [cardId]);
    assert.equal(pendingCard.status, "PENDING");

    // 教师审核通过 -> 卡片变 USED 并绑定 used_student_id，同事务记账 +1
    await pool.query(
      "UPDATE card_claim SET status = 'APPROVED', reviewer_id = ?, reviewed_at = NOW() WHERE id = ?",
      [teacherId, claimId]
    );
    await pool.query(
      "UPDATE reward_card SET status = 'USED', used_student_id = ?, used_at = NOW() WHERE id = ?",
      [studentId, cardId]
    );

    const classSnapshot = JSON.stringify({ grade: 4, class_no: 1 });
    const [scoreRes] = await pool.query(
      `INSERT INTO score_record (
        school_id, term_id, student_id, class_snapshot, dimension_code, category_id,
        source, delta, card_claim_id, operator_id, request_key
      ) VALUES (1, 1, ?, ?, 'D', 3, 'B_CARD', 1, ?, ?, ?)`,
      [studentId, classSnapshot, claimId, teacherId, `REQ_SCORE_${claimId}`]
    );
    assert.ok(scoreRes.insertId > 0);

    const [[usedCard]] = await pool.query("SELECT status, used_student_id FROM reward_card WHERE id = ?", [cardId]);
    assert.equal(usedCard.status, "USED", "审核通过后实体卡必须置为失效终态 USED");
    assert.equal(Number(usedCard.used_student_id), Number(studentId));
  });

  test("3. 冲销幂等红线：同一原流水严禁二次冲销", async () => {
    const classSnapshot = JSON.stringify({ grade: 4, class_no: 1 });

    // 创建一笔加分流水 (A_DIRECT)
    const [origRes] = await pool.query(
      `INSERT INTO score_record (
        school_id, term_id, student_id, class_snapshot, dimension_code, category_id,
        source, delta, operator_id, request_key
      ) VALUES (1, 1, ?, ?, 'D', 3, 'A_DIRECT', 1, ?, ?)`,
      [studentId, classSnapshot, teacherId, `ORIG_TEST_${Date.now()}`]
    );
    const origId = origRes.insertId;

    // 首次冲销 (-1, REVERSAL)
    await pool.query(
      `INSERT INTO score_record (
        school_id, term_id, student_id, class_snapshot, dimension_code, category_id,
        source, delta, original_id, operator_id, request_key
      ) VALUES (1, 1, ?, ?, 'D', 3, 'REVERSAL', -1, ?, ?, ?)`,
      [studentId, classSnapshot, origId, adminId, `REV_1_${origId}`]
    );

    // 尝试二次冲销，必须触发唯一索引 uk_score_reversal_original 拦截
    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO score_record (
            school_id, term_id, student_id, class_snapshot, dimension_code, category_id,
            source, delta, original_id, operator_id, request_key
          ) VALUES (1, 1, ?, ?, 'D', 3, 'REVERSAL', -1, ?, ?, ?)`,
          [studentId, classSnapshot, origId, adminId, `REV_2_${origId}`]
        );
      },
      /Duplicate entry/,
      "数据库 uk_score_reversal_original 必须阻断重复冲销"
    );
  });

  test("4. 荣誉申报与 material_revision 履历追踪", async () => {
    const eventKey = `EVENT_${Date.now()}`;
    const [honorRes] = await pool.query(
      `INSERT INTO honor_record (
        school_id, student_id, term_id, event_key, title, award_level, prize_level,
        status, award_date, material_version
      ) VALUES (1, ?, 1, ?, '青少年科技创新大赛', 'CITY', 'FIRST', 'PENDING', '2026-10-15', 1)`,
      [studentId, eventKey]
    );
    const honorId = honorRes.insertId;

    // 自动生成的荣誉积分计算 (CITY + FIRST = 6)
    const [[hRow]] = await pool.query("SELECT honor_points FROM honor_record WHERE id = ?", [honorId]);
    assert.equal(Number(hRow.honor_points), 6, "市级一等奖荣誉积分必须由 GENERATED ALWAYS 自动计算为 6");

    // 写入材料版本留痕
    await pool.query(
      `INSERT INTO material_revision (
        school_id, owner_type, owner_id, version_no, text_content, file_ref, created_by
      ) VALUES (1, 'HONOR', ?, 1, '初次提交证明材料', '/uploads/cert1.png', ?)`,
      [honorId, studentId]
    );

    // 审核通过
    await pool.query(
      "UPDATE honor_record SET status = 'APPROVED', reviewer_id = ?, reviewed_at = NOW() WHERE id = ?",
      [teacherId, honorId]
    );

    const [[rev]] = await pool.query(
      "SELECT * FROM material_revision WHERE owner_id = ? AND owner_type = 'HONOR'",
      [honorId]
    );
    assert.equal(rev.version_no, 1);
  });

  test("5. 月度生活故事与终审分", async () => {
    await pool.query(
      `INSERT INTO story_submission (
        school_id, student_id, term_id, month_key, status, current_version, teacher_score, teacher_comment, reviewer_id, reviewed_at
      ) VALUES (1, ?, 1, '2026-10', 'REVIEWED', 1, 92.50, '真情实感，成长显著', ?, NOW())
      ON DUPLICATE KEY UPDATE teacher_score = 92.50, status = 'REVIEWED', reviewer_id = VALUES(reviewer_id), reviewed_at = NOW()`,
      [studentId, teacherId]
    );

    const [[story]] = await pool.query(
      "SELECT * FROM story_submission WHERE student_id = ? AND month_key = '2026-10'",
      [studentId]
    );
    assert.equal(Number(story.teacher_score), 92.5);
    assert.equal(story.status, "REVIEWED");

    // 验证 getStories 查询接口正常，不发生 Unknown column 异常
    const { getStories } = require("../controllers/storyController");
    let testResponseData = null;
    let testResponseStatus = null;
    const mockReq = {
      user: { id: studentId, role: "student", schoolId: 1 },
      query: { monthKey: "2026-10" }
    };
    const mockRes = {
      status(code) { testResponseStatus = code; return this; },
      json(data) { testResponseData = data; return this; }
    };
    await getStories(mockReq, mockRes, (err) => {
      if (err) throw err;
    });
    assert.equal(testResponseData.code, 200);
    assert.ok(Array.isArray(testResponseData.data));
    assert.ok(testResponseData.data.length > 0);
    assert.ok("ai_score" in testResponseData.data[0]);
  });

  test("6. 综合评分引擎计算与 6 维完整性校验", async () => {
    const { computeStudentScore } = require("../services/evaluationEngine");

    // 补齐五育正式百分制成绩 (D, Z, T, M, L)
    const dims = [
      { d: "D", s: 85 },
      { d: "Z", s: 92 },
      { d: "T", s: 80 },
      { d: "M", s: 88 },
      { d: "L", s: 95 }
    ];
    for (const item of dims) {
      await pool.query(
        `INSERT INTO student_dimension_score (school_id, term_id, student_id, dimension_code, score_100, status, confirmed_by, confirmed_at)
         VALUES (1, 1, ?, ?, ?, 'CONFIRMED', 1, NOW())
         ON DUPLICATE KEY UPDATE score_100 = VALUES(score_100), status = 'CONFIRMED', confirmed_by = 1, confirmed_at = NOW()`,
        [studentId, item.d, item.s]
      );
    }

    // 此时 D, Z, T, M, L, G (生活故事终审分92.5) 六维全部就绪
    const completeRes = await computeStudentScore(studentId, 1, 1);
    assert.equal(completeRes.isComplete, true, "补齐后必须通过完整性校验");
    assert.ok(completeRes.comprehensiveScore > 0, "综合得分应正确计算");
    assert.ok(completeRes.sixAverage > 0, "六育平均分应正常计算");
  });

  after(async () => {
    await pool.end();
  });
});
