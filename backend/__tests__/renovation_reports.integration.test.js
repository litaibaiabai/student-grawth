/**
 * renovation_reports.integration.test.js — 任务 11 报告草稿与教师确认集成测试
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { buildDraft, confirmDraft, getDraft } = require('../services/reportDraftService');

describe('Task 11: 报告草稿与教师确认集成测试', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_reports_' + Date.now();
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });

    await connection.query(`CREATE DATABASE \`${testDbName}\` DEFAULT CHARACTER SET utf8mb4`);
    await connection.query(`USE \`${testDbName}\``);

    // 加载 schema 并应用全量迁移
    const root = path.resolve(__dirname, '../..');
    const fullSchema = fs.readFileSync(path.join(root, 'sql/00_full_schema.sql'), 'utf8')
      .replaceAll('`student_growth`', '`' + testDbName + '`');
    await connection.query(fullSchema);

    const { applyRegisteredMigrations } = require('../services/migrationRunner');
    require('../migrations/renovation');
    await applyRegisteredMigrations({ connection, databaseName: testDbName });

    // 初始化基础数据
    await connection.query(`
      INSERT INTO academic_year (id, school_id, academic_year, semester, start_date, end_date, is_current, active)
      VALUES (1, 1, '2026-2027', 1, '2026-09-01', '2027-01-31', 1, 1);
      INSERT INTO users (id, school_id, username, password, real_name, role, status)
      VALUES 
        (101, 1, 'headmaster_01', 'hash123', '班主任李老师', 'teacher', 0),
        (102, 1, 'subject_teacher', 'hash123', '科任王老师', 'teacher', 0),
        (999, 1, 'admin_user', 'hash123', '管理员', 'manager', 0);
      INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, status)
      VALUES 
        (201, 1, 'student_01', 'hash123', '小明', 'student', 4, 1, 0);
      INSERT INTO comprehensive_score_rule
        (school_id, term_id, rule_version, six_weight, process_weight, honor_weight, process_target, honor_target, rule_status)
      VALUES 
        (1, 1, 'TEST_V1', 0.70, 0.20, 0.10, 20.00, 10.00, 'ACTIVE');
      INSERT INTO teacher_teaching_assignment
        (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES
        (1, 1, 101, 4, 1, 'CHINESE', 1),
        (1, 1, 102, 4, 1, 'MATH', 0);
    `);
    for (const code of ['D','Z','T','M','L','G']) await connection.query('INSERT INTO student_dimension_score(school_id,term_id,student_id,dimension_code,score_100) VALUES(1,1,201,?,90)', [code]);
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  let draftId;
  let fingerprint;

  test('1. 非班主任教师或管理员读取草稿正文被拒绝 (403)', async () => {
    // 管理员访问
    await assert.rejects(
      async () => {
        await buildDraft({
          actor: { id: 999, role: 'admin' },
          studentKey: { schoolId: 1, termId: 1, studentId: 201, grade: 4, classNo: 1 },
          connection
        });
      },
      (err) => err.status === 403 || err.statusCode === 403
    );

    // 非班主任教师访问
    await assert.rejects(
      async () => {
        await buildDraft({
          actor: { id: 102, role: 'teacher' },
          studentKey: { schoolId: 1, termId: 1, studentId: 201, grade: 4, classNo: 1 },
          connection
        });
      },
      (err) => err.status === 403 || err.statusCode === 403
    );
  });

  test('2. 班主任成功构建草稿并生成审批指纹', async () => {
    const draft = await buildDraft({
      actor: { id: 101, role: 'teacher' },
      studentKey: { schoolId: 1, termId: 1, studentId: 201, grade: 4, classNo: 1 },
      connection
    });

    assert.ok(draft);
    assert.ok(draft.draftId);
    assert.ok(draft.approvalFingerprint);
    assert.equal(draft.status, 'DRAFT');
    assert.equal(draft.sourceRevision, 1);

    draftId = draft.draftId;
    fingerprint = draft.approvalFingerprint;
  });

  test('3. 班主任手写学期寄语并确认草稿', async () => {
    const result = await confirmDraft({
      actor: { id: 101, role: 'teacher' },
      draftId,
      expectedFingerprint: fingerprint,
      comment: '期末寄语：在各方面表现优异，有责任心。',
      connection
    });

    assert.ok(result);
    assert.equal(result.status, 'CONFIRMED');
    assert.equal(result.teacherComment, '期末寄语：在各方面表现优异，有责任心。');

    // 验证历史记录表
    const [revs] = await connection.query("SELECT * FROM report_comment_revision WHERE draft_id = ?", [draftId]);
    assert.equal(revs.length, 1);
    assert.equal(revs[0].comment_text, '期末寄语：在各方面表现优异，有责任心。');
  });

  test('4. 来源数据变更使草稿重新变为待确认', async () => {
    // 模拟数据源变更，source_revision 递增
    await connection.query(`
      INSERT INTO student_term_state (school_id, term_id, student_id, source_revision)
      VALUES (1, 1, 201, 2)
      ON DUPLICATE KEY UPDATE source_revision = source_revision + 1
    `);

    const recheck = await getDraft({
      actor: { id: 101, role: 'teacher' },
      draftId,
      connection
    });

    assert.equal(recheck.isStale, true);
    assert.equal(recheck.status, 'PENDING_CONFIRMATION');
  });

  test('5. 携带陈旧指纹确认草稿抛出 409 Conflict', async () => {
    await assert.rejects(
      async () => {
        await confirmDraft({
          actor: { id: 101, role: 'teacher' },
          draftId,
          expectedFingerprint: fingerprint,
          comment: '旧指纹确认',
          connection
        });
      },
      (err) => err.status === 409 || err.statusCode === 409
    );
  });

  test('6. 发起 AI 寄语生成任务并生成 MODEL 建议，附带引用证据', async () => {
    const { requestComment, processCommentJob } = require('../services/commentGenerationService');
    const job = await requestComment({
      actor: { id: 101, role: 'teacher' },
      draftId,
      expectedFingerprint: fingerprint,
      connection
    });

    assert.ok(job.jobId);

    const result = await processCommentJob({
      jobId: job.jobId,
      connection
    });

    assert.equal(result.source, 'MODEL');
    assert.ok(result.suggestionText);
    assert.ok(result.citedEvidence);
  });

  test('7. 晚到模型响应绝不覆盖教师已确认寄语 (CAS)', async () => {
    const { applyCommentResult } = require('../services/commentGenerationService');
    const applyRes = await applyCommentResult({
      actor: { id: 101, role: 'teacher' },
      jobId: 'LATE_JOB_TEST',
      draftId,
      expectedFingerprint: 'STALE_OLD_FINGERPRINT',
      result: {
        suggestionText: '晚到的AI响应尝试覆盖',
        source: 'MODEL'
      },
      connection
    });

    assert.equal(applyRes.overwrittenTeacher, false);

    // 重新获取草稿确认教师寄语依然保留
    const draftAfter = await getDraft({
      actor: { id: 101, role: 'teacher' },
      draftId,
      connection
    });
    assert.equal(draftAfter.teacherComment, '期末寄语：在各方面表现优异，有责任心。');
  });

  test('8. 模型生成失败不丢失草稿，允许转人工', async () => {
    const { handleGenerationFailure } = require('../services/commentGenerationService');
    const failRes = await handleGenerationFailure({
      draftId,
      errorMessage: '模型服务模拟超时',
      connection
    });

    assert.equal(failRes.status, 'FAILED');
    assert.equal(failRes.canFallbackToManual, true);
  });

  test('9. 家长凭有效 Token 提交寄语，成功绑定学生与草稿', async () => {
    const { issueFamilyToken, submitFamilyComment, getStudentFamilyFeedbacks } = require('../services/familyFeedbackService');
    const tokenInfo = await issueFamilyToken({
      schoolId: 1,
      termId: 1,
      studentId: 201,
      parentName: '李妈妈',
      connection
    });

    assert.ok(tokenInfo.token);

    const feedback = await submitFamilyComment({
      token: tokenInfo.token,
      studentKey: { schoolId: 1, termId: 1, studentId: 201 },
      commentText: '孩子在学校表现积极，感谢老师悉心教导！',
      proxyByStudent: false,
      connection
    });

    assert.equal(feedback.studentId, 201);
    assert.equal(feedback.parentName, '李妈妈');

    // 检查草稿中的 parent_comment 扩展位
    const draftCheck = await getDraft({
      actor: { id: 101, role: 'teacher' },
      draftId,
      connection
    });
    const [draftRow] = await connection.query("SELECT parent_comment FROM student_report_draft WHERE id = ?", [draftId]);
    assert.equal(draftRow[0].parent_comment, '孩子在学校表现积极，感谢老师悉心教导！');
  });

  test('10. 跨学生凭证提交家长寄语被拒绝 (403)', async () => {
    const { issueFamilyToken, submitFamilyComment } = require('../services/familyFeedbackService');
    const tokenInfo = await issueFamilyToken({
      schoolId: 1,
      termId: 1,
      studentId: 201,
      connection
    });

    await assert.rejects(
      async () => {
        await submitFamilyComment({
          token: tokenInfo.token,
          studentKey: { schoolId: 1, termId: 1, studentId: 999 }, // 错误学生
          commentText: '尝试越权写入',
          connection
        });
      },
      (err) => err.status === 403 || err.statusCode === 403
    );
  });

  test('11. 报告发布后补填家长寄语，只追加保留且支持学生代录标注', async () => {
    const { issueFamilyToken, submitFamilyComment, getStudentFamilyFeedbacks } = require('../services/familyFeedbackService');
    const tokenInfo = await issueFamilyToken({
      schoolId: 1,
      termId: 1,
      studentId: 201,
      connection
    });

    const postFeedback = await submitFamilyComment({
      token: tokenInfo.token,
      studentKey: { schoolId: 1, termId: 1, studentId: 201 },
      commentText: '发布后补填：下学期会继续配合家校共育。',
      proxyByStudent: true,
      connection
    });

    assert.equal(postFeedback.proxyByStudent, true);

    const feedbacks = await getStudentFamilyFeedbacks({
      schoolId: 1,
      termId: 1,
      studentId: 201,
      connection
    });

    assert.ok(feedbacks.length >= 2);
  });

  test('12. 管理员查询宏观发布准备状态，绝不泄露学生个人分数或寄语快照', async () => {
    const { getPublishReadinessStatus } = require('../services/reportPublishService');
    const status = await getPublishReadinessStatus({
      actor: { id: 999, role: 'manager' },
      schoolId: 1,
      termId: 1,
      grade: 4,
      connection
    });

    assert.ok(status);
    assert.equal(typeof status.totalCount, 'number');
    assert.equal(typeof status.confirmedCount, 'number');
    assert.equal(typeof status.pendingCount, 'number');

    const jsonStr = JSON.stringify(status);
    assert.equal(jsonStr.includes('期末寄语'), false);
    assert.equal(jsonStr.includes('draftSnapshot'), false);
  });

  test('13. 批量发布已确认草稿，未确认或陈旧者被阻断并返回原因', async () => {
    const { publishBatchReports, getPublishedReportSummary } = require('../services/reportPublishService');
    // 此时学生201草稿处于陈旧状态，发布应受阻
    const blockedRes = await publishBatchReports({
      actor: { id: 999, role: 'manager' },
      schoolId: 1,
      termId: 1,
      studentIds: [201],
      connection
    });
    assert.equal(blockedRes.blockedCount, 1);
    assert.ok(blockedRes.blockedList[0].reason.includes('失效') || blockedRes.blockedList[0].reason.includes('变更'));

    // 班主任刷新草稿并重新确认
    const refreshed = await buildDraft({
      actor: { id: 101, role: 'teacher' },
      studentKey: { schoolId: 1, termId: 1, studentId: 201, grade: 4, classNo: 1 },
      connection
    });
    await confirmDraft({
      actor: { id: 101, role: 'teacher' },
      draftId: refreshed.draftId,
      expectedFingerprint: refreshed.approvalFingerprint,
      comment: '期末寄语：已核对最新变动，确认无误。',
      connection
    });

    // 重新发布，应该成功
    const batchRes = await publishBatchReports({
      actor: { id: 999, role: 'manager' },
      schoolId: 1,
      termId: 1,
      studentIds: [201],
      connection
    });

    assert.equal(batchRes.totalTarget, 1);
    assert.equal(batchRes.successCount, 1);
    assert.equal(batchRes.blockedCount, 0);

    const published = await getPublishedReportSummary({
      schoolId: 1,
      termId: 1,
      studentId: 201,
      connection
    });

    assert.ok(published);
    assert.equal(published.status, 'PUBLISHED');
    assert.equal(published.versionNo, 1);
    assert.ok(published.approvalFingerprint);
  });

  test('14. 重复发布幂等保护，版本不重复创建', async () => {
    const { publishBatchReports } = require('../services/reportPublishService');
    const repeatRes = await publishBatchReports({
      actor: { id: 999, role: 'manager' },
      schoolId: 1,
      termId: 1,
      studentIds: [201],
      connection
    });

    assert.equal(repeatRes.successCount, 1);

    // 检查 term_report 仍只有 1 条 PUBLISHED
    const [rows] = await connection.query(
      "SELECT id FROM term_report WHERE school_id = 1 AND term_id = 1 AND student_id = 201 AND status = 'PUBLISHED'"
    );
    assert.equal(rows.length, 1);
  });

  test('15. 学生本人成功读取已发布报告快照与评语', async () => {
    const { getPublishedReport } = require('../services/reportRenderService');
    const report = await getPublishedReport({
      actor: { id: 201, role: 'student' },
      schoolId: 1,
      termId: 1,
      studentId: 201,
      connection
    });

    assert.ok(report);
    assert.equal(report.studentId, 201);
    assert.equal(report.status, 'PUBLISHED');
    assert.ok(report.snapshotJson);
  });

  test('16. 渲染 A4 打印版 HTML，附带防伪哈希与打印样式', async () => {
    const { getPublishedReport, renderPrintableA4 } = require('../services/reportRenderService');
    const report = await getPublishedReport({
      actor: { id: 201, role: 'student' },
      schoolId: 1,
      termId: 1,
      studentId: 201,
      connection
    });

    const a4Html = renderPrintableA4({ reportData: report });
    assert.ok(a4Html);
    assert.ok(a4Html.includes('@media print'));
    assert.ok(a4Html.includes(report.approvalFingerprint));
  });

  test('17. 管理员直接访问学生个人报告正文被拒绝 (403)', async () => {
    const { getPublishedReport } = require('../services/reportRenderService');
    await assert.rejects(
      async () => {
        await getPublishedReport({
          actor: { id: 999, role: 'manager' },
          schoolId: 1,
          termId: 1,
          studentId: 201,
          connection
        });
      },
      (err) => err.status === 403 || err.statusCode === 403
    );
  });
  test('客户端伪造本人班级不能生成其他班级学生的草稿', async () => {
    await connection.query("INSERT INTO users(id,school_id,username,password,real_name,role,grade,class_no,status) VALUES(202,1,'outside_class','hash','别班同学','student',5,2,0)");
    await assert.rejects(buildDraft({actor:{id:101,role:'teacher',schoolId:1},studentKey:{schoolId:1,termId:1,studentId:202,grade:4,classNo:1},connection}), err=>err.status===403);
    const [rows]=await connection.query('SELECT id FROM student_report_draft WHERE student_id=202');
    assert.equal(rows.length,0);
  });
  test('新版本插入失败时原已发布版本仍可读取', async () => {
    const { publishBatchReports } = require('../services/reportPublishService');
    const before=(await connection.query("SELECT id FROM term_report WHERE student_id=201 AND status='PUBLISHED'"))[0];
    const oldDraft=(await connection.query('SELECT * FROM student_report_draft WHERE student_id=201'))[0][0];
    const draft=await buildDraft({actor:{id:101,role:'teacher'},studentKey:{schoolId:1,termId:1,studentId:201},connection});
    await confirmDraft({actor:{id:101,role:'teacher'},draftId:draft.draftId,expectedFingerprint:draft.approvalFingerprint,comment:'新的确认寄语',connection});
    await connection.query("CREATE TRIGGER fail_report_insert BEFORE INSERT ON term_report FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='TEST INSERT FAILURE'");
    try {
      try { await publishBatchReports({actor:{id:999,role:'manager'},schoolId:1,termId:1,studentIds:[201],connection}); } catch(err) { assert.match(err.message,/TEST INSERT FAILURE/); }
      const after=(await connection.query("SELECT id FROM term_report WHERE student_id=201 AND status='PUBLISHED'"))[0];
      assert.deepEqual(after,before,'新报告失败不能让旧报告消失');
    } finally {await connection.query('DROP TRIGGER fail_report_insert');await connection.query('UPDATE student_report_draft SET status=?,teacher_comment=?,approval_fingerprint=?,draft_snapshot=? WHERE id=?',[oldDraft.status,oldDraft.teacher_comment,oldDraft.approval_fingerprint,JSON.stringify(typeof oldDraft.draft_snapshot==='string'?JSON.parse(oldDraft.draft_snapshot):oldDraft.draft_snapshot),oldDraft.id]);}
  });

  test('实际发布控制器阻断未确认草稿，返回无分数状态投影；阅读打印保留冻结身份', async () => {
    const {pool}=require('../db');
    const original=pool.getConnection;
    const lease=new Proxy(connection,{get(target,key){if(key==='release')return ()=>{};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
    pool.getConnection=async()=>lease;
    const controller=require('../controllers/reportController');
    async function invoke(method,req){let result,failure;const res={status(){return this;},json(value){result=value;return this;},setHeader(){},send(value){result=value;}};await method(req,res,err=>{failure=err;});if(failure)throw failure;return result;}
    try {
      await connection.query("UPDATE student_report_draft SET status='DRAFT' WHERE student_id=201");
      const req={user:{id:999,role:'manager',schoolId:1},body:{termId:1,studentIds:[201]}};
      const blocked=await invoke(controller.publishBatch,req);
      assert.equal(blocked.data.publishedCount,0);
      assert.equal(blocked.data.blockedCount,1);
      await connection.query("UPDATE student_report_draft SET status='CONFIRMED' WHERE student_id=201");
      const published=await invoke(controller.publishBatch,req);
      assert.equal(published.data.publishedCount,1);
      assert.equal('score' in published.data.published[0],false);
      await connection.query("UPDATE users SET real_name='改名后的学生' WHERE id=201");
      const report=await invoke(controller.getCurrentReport,{user:{id:201,role:'student',schoolId:1},query:{termId:1}});
      assert.equal(report.data.snapshot.student.name,'小明');
      assert.equal(Number(report.data.snapshot.evaluation.dimensions.D),90);
      const html=await invoke(controller.exportReportHtml,{user:{id:201,role:'student',schoolId:1},params:{id:report.data.id}});
      assert.ok(html.includes('小明'));
      assert.equal(html.includes('改名后的学生'),false);
      const {getPublishedReport}=require('../services/reportRenderService');
      assert.equal((await getPublishedReport({actor:{id:201,role:'student'},schoolId:1,termId:1,studentId:201,connection})).studentName,'小明');
    } finally {pool.getConnection=original;await connection.query("UPDATE users SET real_name='小明' WHERE id=201");}
  });

  test('教师确认后的家长新增反馈只在下次刷新确认后进入新版本', async () => {
    const {issueFamilyToken,submitFamilyComment}=require('../services/familyFeedbackService');
    const {publishBatchReports}=require('../services/reportPublishService');
    const issued=await issueFamilyToken({studentId:201,connection});
    const submit=commentText=>submitFamilyComment({token:issued.token,studentKey:{schoolId:1,termId:1,studentId:201},commentText,connection});
    const refresh=async()=>{const draft=await buildDraft({actor:{id:101,role:'teacher'},studentKey:{schoolId:1,termId:1,studentId:201},connection});await confirmDraft({actor:{id:101,role:'teacher'},draftId:draft.draftId,expectedFingerprint:draft.approvalFingerprint,comment:'已审阅家长反馈',connection});};
    const publish=()=>publishBatchReports({actor:{id:999,role:'manager'},studentIds:[201],connection});
    await submit('已审阅的家长寄语');await refresh();await submit('确认后新增寄语');
    assert.equal((await publish()).successCount,1);
    let [[report]]=await connection.query("SELECT version,family_message FROM term_report WHERE student_id=201 AND status='PUBLISHED'");
    assert.equal(report.family_message,'已审阅的家长寄语');
    const previousVersion=report.version;
    await refresh();assert.equal((await publish()).successCount,1);
    [[report]]=await connection.query("SELECT version,family_message FROM term_report WHERE student_id=201 AND status='PUBLISHED'");
    assert.equal(report.family_message,'确认后新增寄语');assert.equal(report.version,previousVersion+1);
  });

  test('保存已确认快照提供的正式等级，不在发布器中推断阈值', async () => {
    const {computeApprovalFingerprint}=require('../services/reportDraftService');
    const {publishBatchReports}=require('../services/reportPublishService');
    const draft=await buildDraft({actor:{id:101,role:'teacher'},studentKey:{schoolId:1,termId:1,studentId:201},connection});
    // Explicit test policy result; this is not a school grading rule.
    draft.draftSnapshot.evaluationSnapshot.comprehensiveGrade='已确认测试等级';
    const fingerprint=computeApprovalFingerprint({schoolId:1,termId:1,studentId:201,sourceRevision:draft.sourceRevision,policyVersion:draft.policyVersion,draftSnapshot:draft.draftSnapshot,teacherComment:draft.teacherComment});
    await connection.query('UPDATE student_report_draft SET draft_snapshot=?,approval_fingerprint=? WHERE id=?',[JSON.stringify(draft.draftSnapshot),fingerprint,draft.draftId]);
    await confirmDraft({actor:{id:101,role:'teacher'},draftId:draft.draftId,expectedFingerprint:fingerprint,comment:'核对已确认等级',connection});
    assert.equal((await publishBatchReports({actor:{id:999,role:'manager'},studentIds:[201],connection})).successCount,1);
    const [[report]]=await connection.query("SELECT comprehensive_grade FROM term_report WHERE student_id=201 AND status='PUBLISHED'");
    assert.equal(report.comprehensive_grade,'已确认测试等级');
  });
  test('两个并发发布请求对同一确认指纹只生成一个新版本', async () => {
    const {publishBatchReports}=require('../services/reportPublishService');
    const draft=await buildDraft({actor:{id:101,role:'teacher'},studentKey:{schoolId:1,termId:1,studentId:201},connection});
    await confirmDraft({actor:{id:101,role:'teacher'},draftId:draft.draftId,expectedFingerprint:draft.approvalFingerprint,comment:'并发发布确认',connection});
    const [[before]]=await connection.query('SELECT COUNT(*) AS count FROM term_report WHERE student_id=201');
    const config={host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,database:testDbName};
    const first=await mysql.createConnection(config),second=await mysql.createConnection(config);
    try {
      const results=await Promise.all([first,second].map(conn=>publishBatchReports({actor:{id:999,role:'manager'},studentIds:[201],connection:conn})));
      assert.equal(results[0].successCount,1);assert.equal(results[1].successCount,1);
      assert.equal(results[0].published[0].reportId,results[1].published[0].reportId);
      const [[after]]=await connection.query("SELECT COUNT(*) AS count,SUM(status='PUBLISHED') AS currentCount FROM term_report WHERE student_id=201");
      assert.equal(after.count,before.count+1);assert.equal(Number(after.currentCount),1);
    } finally {await first.end();await second.end();}
  });

});
