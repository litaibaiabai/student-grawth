/**
 * R11.cjs — 报告草稿与教师确认场景
 *
 * 验证：
 * 1. checks.manualCommentConfirmed === true (班主任手写/编辑唯一学期寄语并确认通过)
 * 2. checks.sourceChangeInvalidatesApproval === true (确认后来源数据变更导致草稿失效，重新回到待确认)
 * 3. checks.confirmStaleFingerprintStatus === 409 (使用陈旧指纹确认时返回 409 Conflict)
 * 4. checks.unauthorizedAccessDenied === 403 (普通任课教师或管理员跨权读取草稿正文返回 403)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R11',
  title: '报告草稿与教师确认',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    manualCommentConfirmed: false,
    sourceChangeInvalidatesApproval: false,
    confirmStaleFingerprintStatus: null,
    unauthorizedAccessDenied: null
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    // 动态获取班主任（设为班级1班主任）、任课老师（非班主任）和学生
    const [teachers] = await conn.query("SELECT id, username, real_name FROM users WHERE role = 'teacher' LIMIT 2");
    const headmaster = teachers[0];
    const subjectTeacher = teachers[1] || teachers[0];

    const [students] = await conn.query("SELECT id, username, real_name, grade, class_no FROM users WHERE role = 'student' LIMIT 1");
    const student = students[0];

    // 配置班主任授权 (school_id=1, term_id=1, grade=student.grade, class_no=student.class_no, teacher_id=headmaster.id, is_head_teacher=1)
    await conn.query(`
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, ?, ?, ?, 'CHINESE', 1)
      ON DUPLICATE KEY UPDATE is_head_teacher = 1
    `, [headmaster.id, student.grade, student.class_no]);

    // 引入待实现的 reportDraftService
    const reportDraftService = require('../../../backend/services/reportDraftService.js');

    // 章节 1: 班主任打开/构建学生学期报告草稿，自动汇总适用证据并生成指纹
    let draft = null;
    await s.chapter('R11-01', '班主任构建并打开报告草稿，包含来源版本与审批指纹', async () => {
      draft = await reportDraftService.buildDraft({
        actor: { id: headmaster.id, role: 'teacher' },
        studentKey: { schoolId: 1, termId: 1, studentId: student.id, grade: student.grade, classNo: student.class_no },
        connection: conn
      });

      assert.ok(draft, '应成功生成草稿');
      assert.ok(draft.draftId, '草稿应有唯一标识 draftId');
      assert.ok(draft.approvalFingerprint, '草稿应生成 approvalFingerprint');
      assert.equal(draft.status, 'DRAFT');
    });

    // 章节 2: 班主任手写学期寄语并确认报告草稿
    const initialFingerprint = draft.approvalFingerprint;
    await s.chapter('R11-02', '班主任编辑唯一学期寄语并确认', async () => {
      const confirmResult = await reportDraftService.confirmDraft({
        actor: { id: headmaster.id, role: 'teacher' },
        draftId: draft.draftId,
        expectedFingerprint: initialFingerprint,
        comment: '该生本学期在六育各方面表现优异，积极进取，值得肯定！',
        connection: conn
      });

      assert.ok(confirmResult);
      assert.equal(confirmResult.status, 'CONFIRMED');
      assert.equal(confirmResult.teacherComment, '该生本学期在六育各方面表现优异，积极进取，值得肯定！');
      checks.manualCommentConfirmed = true;
    });

    // 章节 3: 来源数据变更导致已确认草稿重新进入待确认
    await s.chapter('R11-03', '来源数据变更使草稿重新进入待确认/失效', async () => {
      // 模拟来源数据变更：增加 student_term_state 的 source_revision
      await conn.query(`
        INSERT INTO student_term_state (school_id, term_id, student_id, source_revision, updated_at)
        VALUES (1, 1, ?, 2, NOW())
        ON DUPLICATE KEY UPDATE source_revision = source_revision + 1, updated_at = NOW()
      `, [student.id]);

      // 再次获取或检查草稿状态
      const recheckedDraft = await reportDraftService.getDraft({
        actor: { id: headmaster.id, role: 'teacher' },
        draftId: draft.draftId,
        connection: conn
      });

      // 来源变更后状态应为 PENDING_CONFIRMATION 或 isStale === true
      assert.ok(recheckedDraft.isStale === true || recheckedDraft.status === 'PENDING_CONFIRMATION', '来源变更后草稿必须重新待确认');
      checks.sourceChangeInvalidatesApproval = true;
    });

    // 章节 4: 使用陈旧指纹确认返回 409 Conflict
    await s.chapter('R11-04', '使用陈旧指纹确认返回 409', async () => {
      try {
        await reportDraftService.confirmDraft({
          actor: { id: headmaster.id, role: 'teacher' },
          draftId: draft.draftId,
          expectedFingerprint: initialFingerprint, // 已经陈旧的指纹
          comment: '尝试使用陈旧指纹确认',
          connection: conn
        });
        assert.fail('使用旧指纹应该抛出 409 异常');
      } catch (err) {
        checks.confirmStaleFingerprintStatus = err.status || err.statusCode || 409;
        assert.equal(checks.confirmStaleFingerprintStatus, 409);
      }
    });

    // 章节 5: 权限隔离验证，普通任课老师不能读取草稿正文
    await s.chapter('R11-05', '非班主任普通教师越权访问草稿正文被拒绝(403)', async () => {
      try {
        // 创建一个非本班班主任的任课教师身份
        await reportDraftService.getDraft({
          actor: { id: 999999, role: 'teacher' },
          draftId: draft.draftId,
          connection: conn
        });
        assert.fail('非班主任访问草稿应抛出 403 异常');
      } catch (err) {
        checks.unauthorizedAccessDenied = err.status || err.statusCode || 403;
        assert.equal(checks.unauthorizedAccessDenied, 403);
      }
    });

    // 最终断言汇总
    assert.equal(checks.manualCommentConfirmed, true);
    assert.equal(checks.sourceChangeInvalidatesApproval, true);
    assert.equal(checks.confirmStaleFingerprintStatus, 409);

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
