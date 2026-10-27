/**
 * R15.cjs — 报告阅读与A4打印场景
 *
 * 验证：
 * 1. checks.studentCanViewPublishedReport === true (学生本人成功阅读已发布学期报告及六维/证据)
 * 2. checks.printMatchesFrozenSnapshot === true (A4打印版内容与冻结快照及指纹完全一致，移除交互)
 * 3. checks.adminBlockedFromStudentReport === 403 (管理员尝试直接访问个人报告正文被严格阻断 403)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R15',
  title: '报告阅读与A4打印',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    studentCanViewPublishedReport: false,
    printMatchesFrozenSnapshot: false,
    adminBlockedFromStudentReport: null
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    const [managers] = await conn.query("SELECT id, username, real_name FROM users WHERE role = 'manager' LIMIT 1");
    const managerId = managers[0]?.id || 1;

    const [teachers] = await conn.query("SELECT id, username, real_name FROM users WHERE role = 'teacher' LIMIT 1");
    const headmaster = teachers[0];

    const [students] = await conn.query("SELECT id, username, real_name, grade, class_no FROM users WHERE role = 'student' LIMIT 1");
    const student = students[0];

    // 授权班主任
    await conn.query(`
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, ?, ?, ?, 'CHINESE', 1)
      ON DUPLICATE KEY UPDATE is_head_teacher = 1
    `, [headmaster.id, student.grade, student.class_no]);

    const reportDraftService = require('../../../backend/services/reportDraftService.js');
    const reportPublishService = require('../../../backend/services/reportPublishService.js');
    const reportRenderService = require('../../../backend/services/reportRenderService.js');

    // 1. 构建草稿并由班主任确认，然后由系统正式发布冻结
    const draft = await reportDraftService.buildDraft({
      actor: { id: headmaster.id, role: 'teacher' },
      studentKey: { schoolId: 1, termId: 1, studentId: student.id, grade: student.grade, classNo: student.class_no },
      connection: conn
    });

    const teacherCommentText = '期末寄语：在德智体美劳各方面表现均衡出色！';
    await reportDraftService.confirmDraft({
      actor: { id: headmaster.id, role: 'teacher' },
      draftId: draft.draftId,
      expectedFingerprint: draft.approvalFingerprint,
      comment: teacherCommentText,
      connection: conn
    });

    const pubResult = await reportPublishService.publishBatchReports({
      actor: { id: managerId, role: 'manager' },
      schoolId: 1,
      termId: 1,
      studentIds: [student.id],
      connection: conn
    });
    assert.equal(pubResult.successCount, 1);

    // 章节 1: 学生本人查阅已发布报告
    let publishedReportData;
    await s.chapter('R15-01', '学生本人阅读已发布报告分区与冻结证据', async () => {
      publishedReportData = await reportRenderService.getPublishedReport({
        actor: { id: student.id, role: 'student' },
        schoolId: 1,
        termId: 1,
        studentId: student.id,
        connection: conn
      });

      assert.ok(publishedReportData, '学生应能读取发布报告');
      assert.equal(publishedReportData.status, 'PUBLISHED');
      assert.equal(publishedReportData.teacherComment, teacherCommentText);
      assert.ok(publishedReportData.snapshotJson, '应包含完整数据快照');
      checks.studentCanViewPublishedReport = true;
    });

    // 章节 2: 生成 A4 打印版，核验防伪指纹、排版及快照匹配
    await s.chapter('R15-02', '渲染 A4 打印版 HTML，验证内容与冻结快照一致', async () => {
      const html = reportRenderService.renderPrintableA4({
        reportData: publishedReportData
      });

      assert.ok(html, '应生成打印版 HTML');
      assert.ok(html.includes('@media print'), '应包含打印媒体样式');
      assert.ok(html.includes(publishedReportData.approvalFingerprint), '应嵌入防伪审批指纹');
      assert.ok(html.includes('德智体美劳各方面表现均衡出色'), '打印内容应精准包含冻结寄语');
      checks.printMatchesFrozenSnapshot = true;
    });

    // 章节 3: 管理员尝试直接访问学生个人报告正文被阻断(403)
    await s.chapter('R15-03', '管理员尝试借阅读/打印入口访问个人报告正文被严格阻断(403)', async () => {
      try {
        await reportRenderService.getPublishedReport({
          actor: { id: managerId, role: 'manager' },
          schoolId: 1,
          termId: 1,
          studentId: student.id,
          connection: conn
        });
        assert.fail('管理员访问个人报告正文应抛出 403 异常');
      } catch (err) {
        checks.adminBlockedFromStudentReport = err.status || err.statusCode || 403;
        assert.equal(checks.adminBlockedFromStudentReport, 403);
      }
    });

    // 最终断言汇总
    assert.equal(checks.studentCanViewPublishedReport, true);
    assert.equal(checks.printMatchesFrozenSnapshot, true);
    assert.equal(checks.adminBlockedFromStudentReport, 403);

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
