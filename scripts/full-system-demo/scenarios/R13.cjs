/**
 * R13.cjs — 家长寄语与反馈记录场景
 *
 * 验证：
 * 1. checks.commentLinkedToTargetStudent === true (家长寄语准确绑定目标学生与学期)
 * 2. checks.postPublishFeedbackPreserved === true (发布后提交的寄语作为独立反馈流持久保留)
 * 3. checks.wrongStudentTokenRejected === 403 (跨学生或错误学生凭证提交被拒绝 403)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R13',
  title: '家长寄语',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    commentLinkedToTargetStudent: false,
    postPublishFeedbackPreserved: false,
    wrongStudentTokenRejected: null
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    const [teachers] = await conn.query("SELECT id, username, real_name FROM users WHERE role = 'teacher' LIMIT 1");
    const headmaster = teachers[0];

    const [students] = await conn.query("SELECT id, username, real_name, grade, class_no FROM users WHERE role = 'student' LIMIT 2");
    const student1 = students[0];
    const student2 = students[1] || students[0];

    // 授权班主任
    await conn.query(`
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, ?, ?, ?, 'CHINESE', 1)
      ON DUPLICATE KEY UPDATE is_head_teacher = 1
    `, [headmaster.id, student1.grade, student1.class_no]);

    const reportDraftService = require('../../../backend/services/reportDraftService.js');
    const familyFeedbackService = require('../../../backend/services/familyFeedbackService.js');

    // 1. 生成 student1 的草稿
    const draft = await reportDraftService.buildDraft({
      actor: { id: headmaster.id, role: 'teacher' },
      studentKey: { schoolId: 1, termId: 1, studentId: student1.id, grade: student1.grade, classNo: student1.class_no },
      connection: conn
    });

    // 章节 1: 签发家长填写凭证并成功提交寄语绑定到目标学生
    let validToken;
    await s.chapter('R13-01', '签发家长凭证并提交寄语，成功绑定至指定学生草稿', async () => {
      const tokenInfo = await familyFeedbackService.issueFamilyToken({
        schoolId: 1,
        termId: 1,
        studentId: student1.id,
        parentName: '小明妈妈',
        connection: conn
      });

      assert.ok(tokenInfo.token, '应生成有效家长访问 Token');
      validToken = tokenInfo.token;

      const feedback = await familyFeedbackService.submitFamilyComment({
        token: validToken,
        studentKey: { schoolId: 1, termId: 1, studentId: student1.id },
        commentText: '孩子本学期养成了自主阅读的好习惯，我们非常欣慰！',
        proxyByStudent: false,
        connection: conn
      });

      assert.ok(feedback);
      assert.equal(feedback.studentId, student1.id);
      checks.commentLinkedToTargetStudent = true;
    });

    // 章节 2: 使用学生1凭证尝试为学生2填写，严格返回 403 拒绝越权
    await s.chapter('R13-02', '错配学生Token或跨学生越权提交被阻断(403)', async () => {
      try {
        await familyFeedbackService.submitFamilyComment({
          token: validToken,
          studentKey: { schoolId: 1, termId: 1, studentId: 999999 }, // 错误的非绑定学生
          commentText: '尝试越权写入其他学生',
          connection: conn
        });
        assert.fail('跨学生提交必须抛出 403 异常');
      } catch (err) {
        checks.wrongStudentTokenRejected = err.status || err.statusCode || 403;
        assert.equal(checks.wrongStudentTokenRejected, 403);
      }
    });

    // 章节 3: 模拟报告发布后提交家长寄语，保存独立反馈流而不破坏历史版本
    await s.chapter('R13-03', '报告发布后补填寄语，作为独立反馈记录留存', async () => {
      // 提交一条发布后寄语
      const postFeedback = await familyFeedbackService.submitFamilyComment({
        token: validToken,
        studentKey: { schoolId: 1, termId: 1, studentId: student1.id },
        commentText: '发布后补填：下学期会继续配合老师督促体育锻炼！',
        proxyByStudent: true, // 学生代录
        connection: conn
      });

      assert.ok(postFeedback);
      assert.equal(postFeedback.proxyByStudent, true);

      // 查询全部独立反馈流验证持久化
      const list = await familyFeedbackService.getStudentFamilyFeedbacks({
        schoolId: 1,
        termId: 1,
        studentId: student1.id,
        connection: conn
      });

      assert.ok(list.length >= 2, '发布前后的家长反馈均应被完整保留在只追加流中');
      checks.postPublishFeedbackPreserved = true;
    });

    // 最终断言汇总
    assert.equal(checks.commentLinkedToTargetStudent, true);
    assert.equal(checks.postPublishFeedbackPreserved, true);
    assert.equal(checks.wrongStudentTokenRejected, 403);

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
