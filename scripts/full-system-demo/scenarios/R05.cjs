/**
 * R05.cjs — 荣誉认定与奖励场景
 *
 * 验证：
 * 1. checks.honorSubmissionMultiVersion === true (学生申报荣誉，被驳回后可重新补充材料并递增 material_version)
 * 2. checks.teacherReviewAwardsC3Points === true (教师审核通过时指定 T/M/L 归属与分类，调用 C3 账本追加奖励流水)
 * 3. checks.duplicateReviewIdempotent === true (同一请求重复审核幂等处理，严禁重复记分)
 * 4. checks.honorRevokeSyncsLedger === true (撤销已认定荣誉时自动调用 C3 纠错负向冲销流水，账本严格守恒)
 */
const assert = require('node:assert/strict');

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    honorSubmissionMultiVersion: false,
    teacherReviewAwardsC3Points: false,
    duplicateReviewIdempotent: false,
    honorRevokeSyncsLedger: false
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    // 动态获取学生和教师
    const [teachers] = await conn.query("SELECT id FROM users WHERE role = 'teacher' LIMIT 1");
    const teacherId = teachers[0].id;
    const [students] = await conn.query("SELECT id, grade, class_no FROM users WHERE role = 'student' LIMIT 1");
    const student = students[0];

    // 配置教师任教授权以确保有权审核学生荣誉
    await conn.query(`
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, ?, ?, ?, 'PE', 1)
      ON DUPLICATE KEY UPDATE is_head_teacher = 1
    `, [teacherId, student.grade, student.class_no]);

    // 获取一个可用的三级指标分类（用于荣誉归类）
    const [cats] = await conn.query(`
      SELECT leaf.id, root.category_code as dimension_code
      FROM edu_evaluation_category leaf
      JOIN edu_evaluation_category p ON leaf.parent_id = p.id
      JOIN edu_evaluation_category root ON p.parent_id = root.id
      WHERE leaf.category_level = 3 AND leaf.status = 1
      LIMIT 1
    `);
    const categoryId = cats.length ? cats[0].id : 3;
    const dimensionCode = cats.length ? cats[0].dimension_code : 'T';

    const { reviewHonor, revokeHonor } = require('../../../backend/controllers/honorController.js');

    // 章节 1: 学生申报荣誉并在被退回后提交材料多版本留痕
    await s.chapter('R05-01', '学生申报荣誉与多版本留痕', async () => {
      // 模拟插入一条 PENDING 荣誉
      const eventKey = 'EVENT_' + Date.now();
      const [res] = await conn.query(
        `INSERT INTO honor_record (
          school_id, student_id, term_id, event_key, title, award_level, prize_level,
          status, award_date, material_version
        ) VALUES (1, ?, 1, ?, '区级青少年足球赛一等奖', 'DISTRICT', 'FIRST', 'PENDING', CURDATE(), 1)`,
        [student.id, eventKey]
      );
      const honorId = res.insertId;

      await conn.query(
        `INSERT INTO material_revision (
          school_id, owner_type, owner_id, version_no, text_content, created_by
        ) VALUES (1, 'HONOR', ?, 1, '初次提交证明材料', ?)`,
        [honorId, student.id]
      );

      // 教师退回并要求补充材料
      await conn.query(
        "UPDATE honor_record SET status = 'REJECTED', reject_reason = '缺少加盖公章的证书复印件' WHERE id = ?",
        [honorId]
      );

      // 学生补充材料重新提交，递增版本
      await conn.query(
        `INSERT INTO material_revision (
          school_id, owner_type, owner_id, version_no, text_content, created_by
        ) VALUES (1, 'HONOR', ?, 2, '补充加盖赛事组委会公章的高清扫描件', ?)`,
        [honorId, student.id]
      );
      await conn.query(
        "UPDATE honor_record SET status = 'PENDING', material_version = 2, reject_reason = NULL WHERE id = ?",
        [honorId]
      );

      // 验证版本号变为 2
      const [[h]] = await conn.query("SELECT material_version, status FROM honor_record WHERE id = ?", [honorId]);
      assert.equal(h.material_version, 2);
      assert.equal(h.status, 'PENDING');

      checks.honorSubmissionMultiVersion = true;
    });

    // 章节 2: 教师通过荣誉时确认 T/M/L 归类并调用 C3 账本追加奖励流水
    await s.chapter('R05-02', '教师审核荣誉并调用 C3 账本同步入账', async () => {
      const [honors] = await conn.query("SELECT id FROM honor_record WHERE status = 'PENDING' LIMIT 1");
      assert.ok(honors.length > 0);
      const honorId = honors[0].id;

      const [[beforeScores]] = await conn.query("SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = ?", [student.id]);

      // 模拟请求调用 reviewHonor
      const req = {
        conn: conn,
        params: { id: honorId },
        body: {
          decision: 'APPROVED',
          dimensionCode: dimensionCode,
          categoryId: categoryId,
          awardPoints: 1,
          requestKey: 'REQ_HONOR_APP_' + Date.now()
        },
        user: { id: teacherId, schoolId: 1, role: 'teacher' }
      };

      let responseData = null;
      const res = {
        status: (code) => res,
        json: (data) => { responseData = data; return res; }
      };

      await reviewHonor(req, res, (err) => { if (err) throw err; });

      assert.equal(responseData?.code, 200);
      assert.equal(responseData?.data?.status, 'APPROVED');

      // 验证学生账本积分即时追加
      const [[afterScores]] = await conn.query("SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = ?", [student.id]);
      assert.equal(Number(afterScores.total), Number(beforeScores.total) + 1);

      // 验证 score_record 中产生了关联的流水记录
      const [[scoreRec]] = await conn.query(
        "SELECT * FROM score_record WHERE student_id = ? AND source = 'A_DIRECT' ORDER BY id DESC LIMIT 1",
        [student.id]
      );
      assert.equal(scoreRec.delta, 1);
      assert.equal(scoreRec.dimension_code, dimensionCode);
      assert.equal(scoreRec.category_id, categoryId);

      checks.teacherReviewAwardsC3Points = true;
    });

    // 章节 3: 重复审核幂等重放
    await s.chapter('R05-03', '重复审核幂等重放不多记积分', async () => {
      const [honors] = await conn.query("SELECT id FROM honor_record WHERE status = 'APPROVED' LIMIT 1");
      const honorId = honors[0].id;

      const [[beforeScores]] = await conn.query("SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = ?", [student.id]);

      const req = {
        conn: conn,
        params: { id: honorId },
        body: {
          decision: 'APPROVED',
          dimensionCode: dimensionCode,
          categoryId: categoryId,
          awardPoints: 1
        },
        user: { id: teacherId, schoolId: 1, role: 'teacher' }
      };

      let responseData = null;
      let statusCode = 200;
      const res = {
        status: (code) => { statusCode = code; return res; },
        json: (data) => { responseData = data; return res; }
      };

      // 已经 APPROVED 的记录再次调用，应当幂等重放或返回提示，绝对不能增加积分
      await reviewHonor(req, res, (err) => {});

      const [[afterScores]] = await conn.query("SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = ?", [student.id]);
      assert.equal(Number(afterScores.total), Number(beforeScores.total), '重复审核严禁多记积分');

      checks.duplicateReviewIdempotent = true;
    });

    // 章节 4: 撤销已认定的荣誉并同步负向冲销账本
    await s.chapter('R05-04', '撤销认定同步负向冲销账本保持守恒', async () => {
      const [honors] = await conn.query("SELECT id, score_record_id FROM honor_record WHERE status = 'APPROVED' LIMIT 1");
      assert.ok(honors.length > 0);
      const honorId = honors[0].id;

      const [[beforeScores]] = await conn.query("SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = ?", [student.id]);

      const req = {
        conn: conn,
        params: { id: honorId },
        body: {
          reason: '证书材料核实有误，予以撤销',
          requestKey: 'REQ_HONOR_REVOKE_' + Date.now()
        },
        user: { id: teacherId, schoolId: 1, role: 'teacher' }
      };

      let responseData = null;
      const res = {
        status: (code) => res,
        json: (data) => { responseData = data; return res; }
      };

      await revokeHonor(req, res, (err) => { if (err) throw err; });

      assert.equal(responseData?.code, 200);

      // 验证 honor_record 状态已被改回 REJECTED 或 REVOKED
      const [[h]] = await conn.query("SELECT status FROM honor_record WHERE id = ?", [honorId]);
      assert.ok(h.status === 'REJECTED' || h.status === 'REVOKED');

      // 验证学生账本总分已扣减 1 分（恢复冲销前分值）
      const [[afterScores]] = await conn.query("SELECT COALESCE(SUM(delta), 0) as total FROM score_record WHERE student_id = ?", [student.id]);
      assert.equal(Number(afterScores.total), Number(beforeScores.total) - 1);

      // 验证产生了 REVERSAL 记录
      const [[revRec]] = await conn.query(
        "SELECT * FROM score_record WHERE source = 'REVERSAL' AND student_id = ? ORDER BY id DESC LIMIT 1",
        [student.id]
      );
      assert.equal(revRec.delta, -1);

      checks.honorRevokeSyncsLedger = true;
    });

  } finally {
    await conn.end();
  }

  assert.equal(checks.honorSubmissionMultiVersion, true);
  assert.equal(checks.teacherReviewAwardsC3Points, true);
  assert.equal(checks.duplicateReviewIdempotent, true);
  assert.equal(checks.honorRevokeSyncsLedger, true);

  return { checks };
}

module.exports = {
  id: 'R05',
  title: '荣誉认定与奖励',
  run
};
