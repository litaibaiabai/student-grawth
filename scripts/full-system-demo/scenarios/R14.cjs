/**
 * R14.cjs — 状态发布与版本冻结场景
 *
 * 验证：
 * 1. checks.adminViewsStatusOnly === true (管理员仅见宏观准备状态与缺项，绝不泄露个人报告正文/评语/分数)
 * 2. checks.staleDraftBlockedFromPublishing === true (陈旧或未确认草稿被阻断发布，明确返回阻断原因)
 * 3. checks.partialBatchReportsAtomic === true (批量发布支持部分成功：合格者独立事务冻结版本，受阻者记录原因)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R14',
  title: '状态发布与版本冻结',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    adminViewsStatusOnly: false,
    staleDraftBlockedFromPublishing: false,
    partialBatchReportsAtomic: false
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
    const reportPublishService = require('../../../backend/services/reportPublishService.js');

    // 准备测试数据：
    // 学生1：生成草稿并由班主任成功确认
    const draft1 = await reportDraftService.buildDraft({
      actor: { id: headmaster.id, role: 'teacher' },
      studentKey: { schoolId: 1, termId: 1, studentId: student1.id, grade: student1.grade, classNo: student1.class_no },
      connection: conn
    });
    await reportDraftService.confirmDraft({
      actor: { id: headmaster.id, role: 'teacher' },
      draftId: draft1.draftId,
      expectedFingerprint: draft1.approvalFingerprint,
      comment: '期末寄语：品学兼优，本学期表现突出。',
      connection: conn
    });

    // 学生2：未确认状态的草稿（处于 DRAFT）
    const draft2 = await reportDraftService.buildDraft({
      actor: { id: headmaster.id, role: 'teacher' },
      studentKey: { schoolId: 1, termId: 1, studentId: student2.id, grade: student2.grade, classNo: student2.class_no },
      connection: conn
    });

    // 章节 1: 管理员查询准备状态，严格只有状态与数量投影，不返回学生个人敏感正文
    await s.chapter('R14-01', '管理员查询宏观发布准备状态投影，不泄露个人正文', async () => {
      const projection = await reportPublishService.getPublishReadinessStatus({
        actor: { id: managerId, role: 'manager' },
        schoolId: 1,
        termId: 1,
        grade: student1.grade,
        connection: conn
      });

      assert.ok(projection);
      assert.ok(typeof projection.totalCount === 'number');
      assert.ok(typeof projection.confirmedCount === 'number');
      assert.ok(typeof projection.pendingCount === 'number');

      // 隐私验证：projection 绝不能包含任何学生的 personal comment、score、story、snapshot
      const jsonStr = JSON.stringify(projection);
      assert.equal(jsonStr.includes('品学兼优'), false, '管理员状态投影绝不能泄露个人寄语正文');
      assert.equal(jsonStr.includes('draftSnapshot'), false, '管理员状态投影绝不能泄露草稿快照');

      checks.adminViewsStatusOnly = true;
    });

    // 章节 2: 批量发布中，陈旧或未确认草稿被阻断
    await s.chapter('R14-02', '未确认或陈旧草稿受阻并返回明确原因', async () => {
      const batchResult = await reportPublishService.publishBatchReports({
        actor: { id: managerId, role: 'manager' },
        schoolId: 1,
        termId: 1,
        studentIds: [student1.id, student2.id],
        connection: conn
      });

      assert.ok(batchResult);
      assert.equal(batchResult.successCount, 1, '仅已确认的学生1成功发布');
      assert.equal(batchResult.blockedCount, 1, '未确认的学生2应被阻断');

      const blockedItem = batchResult.blockedList.find(b => b.studentId === student2.id);
      assert.ok(blockedItem, '应包含学生2的受阻条目');
      assert.ok(blockedItem.reason, '受阻条目应有明确原因');

      checks.staleDraftBlockedFromPublishing = true;
    });

    // 章节 3: 发布结果版本冻结与部分成功原子性验证
    await s.chapter('R14-03', '已发布报告版本冻结，各学生独立事务互不干扰', async () => {
      // 检查学生1在 student_term_report 表中已被冻结为 PUBLISHED
      const published = await reportPublishService.getPublishedReportSummary({
        schoolId: 1,
        termId: 1,
        studentId: student1.id,
        connection: conn
      });

      assert.ok(published);
      assert.equal(published.status, 'PUBLISHED');
      assert.ok(published.versionNo >= 1);
      assert.ok(published.approvalFingerprint);

      // 重复发布学生1，幂等返回已发布，不创建重复冲突
      const rePublish = await reportPublishService.publishBatchReports({
        actor: { id: managerId, role: 'manager' },
        schoolId: 1,
        termId: 1,
        studentIds: [student1.id],
        connection: conn
      });

      assert.equal(rePublish.successCount, 1);
      checks.partialBatchReportsAtomic = true;
    });

    // 最终断言汇总
    assert.equal(checks.adminViewsStatusOnly, true);
    assert.equal(checks.staleDraftBlockedFromPublishing, true);
    assert.equal(checks.partialBatchReportsAtomic, true);

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
