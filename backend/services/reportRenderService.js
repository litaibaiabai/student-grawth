/**
 * reportRenderService.js — 合同 C9 报告阅读与 A4 打印服务
 *
 * 合同与原则：
 * 1. 严格权限隔离：学生仅能看本人，班主任看所带班级，管理员禁止读取个人报告正文(403)
 * 2. 报告呈现直接来源于已冻结的 snapshot_json，不受实时库表后续更改影响
 * 3. A4 打印版移除交互元素，附带页脚防伪指纹与打印时间戳
 */
const { pool } = require('../db');

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.statusCode = status;
  }
}

/**
 * 校验阅读权限
 */
async function assertReportReadAuth({ actor, studentId, schoolId, termId, conn }) {
  if (!actor) {
    throw new HttpError('未授权访问', 401);
  }

  // 管理员禁止读取学生个人报告正文
  if (actor.role === 'manager' || actor.role === 'admin') {
    throw new HttpError('管理员无权查阅学生个人报告正文与评语', 403);
  }

  // 公共终端受限会话禁止读取个人报告正文 (Task 18A)
  if (actor.scope === 'CARD_REDEEM' || actor.sessionType === 'DEVICE_SESSION') {
    throw new HttpError('公共终端受限短会话禁止访问学期报告隐私正文', 403);
  }

  const targetStudentId = Number(studentId);

  // 学生本人可看
  if (actor.role === 'student') {
    if (actor.id !== targetStudentId) {
      throw new HttpError('学生仅能查看本人的期末综合素质报告', 403);
    }
    return;
  }

  // 教师：必须为该学生当前学期的任教老师或班主任
  if (actor.role === 'teacher') {
    const [stu] = await conn.query("SELECT grade, class_no FROM users WHERE id = ? LIMIT 1", [targetStudentId]);
    if (stu.length === 0) throw new HttpError('学生不存在', 404);
    const { grade, class_no } = stu[0];

    const [authRows] = await conn.query(
      `SELECT id FROM teacher_teaching_assignment 
       WHERE school_id = ? AND term_id = ? AND teacher_id = ? AND grade = ? AND class_no = ?
       LIMIT 1`,
      [schoolId || 1, termId || 1, actor.id, grade, class_no]
    );

    if (authRows.length === 0) {
      throw new HttpError('非任教或带班教师，无权查看此学生报告', 403);
    }
    return;
  }

  throw new HttpError('未知角色，拒绝访问', 403);
}

/**
 * 获取已发布的报告数据（只读消费冻结快照）
 */
async function getPublishedReport({ actor, schoolId = 1, termId = 1, studentId, reportId = null, connection }) {
  const conn = connection || await pool.getConnection();
  const shouldRelease = !connection;

  try {
    const targetStudentId = Number(studentId);
    await assertReportReadAuth({ actor, studentId: targetStudentId, schoolId, termId, conn });

    let query = "SELECT * FROM term_report WHERE school_id = ? AND student_id = ? AND status = 'PUBLISHED'";
    const params = [schoolId, targetStudentId];

    if (reportId) {
      query += " AND id = ?";
      params.push(Number(reportId));
    } else if (termId) {
      query += " AND term_id = ?";
      params.push(Number(termId));
    }

    query += " ORDER BY version DESC LIMIT 1";

    const [rows] = await conn.query(query, params);
    if (rows.length === 0) {
      throw new HttpError('未找到已发布的期末报告', 404);
    }

    const report = rows[0];
    const snapshotJson = typeof report.snapshot_json === 'string'
      ? JSON.parse(report.snapshot_json)
      : report.snapshot_json;

    // 获取学生基础展示信息
    const [u] = await conn.query("SELECT username, real_name, grade, class_no FROM users WHERE id = ? LIMIT 1", [targetStudentId]);
    const studentInfo = u[0] || {};

    return {
      reportId: report.id,
      schoolId: report.school_id,
      termId: report.term_id,
      studentId: report.student_id,
      studentName: studentInfo.real_name || studentInfo.username,
      grade: studentInfo.grade,
      classNo: studentInfo.class_no,
      version: report.version,
      ruleVersion: report.rule_version,
      status: report.status,
      comprehensiveScore: report.comprehensive_score,
      comprehensiveGrade: report.comprehensive_grade,
      teacherComment: report.teacher_comment,
      familyMessage: report.family_message,
      approvalFingerprint: report.approval_fingerprint,
      sourceRevision: report.source_revision,
      publishedAt: report.published_at,
      snapshotJson
    };

  } finally {
    if (shouldRelease) conn.release();
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

/**
 * 渲染适合 A4 打印的纯静态 HTML (移除一切交互与脚本，附带防伪指纹与实体转义)
 */
function renderPrintableA4({ reportData }) {
  const {
    studentName,
    grade,
    classNo,
    version,
    comprehensiveScore,
    teacherComment,
    familyMessage,
    approvalFingerprint,
    publishedAt,
    snapshotJson
  } = reportData;

  const evalSnap = snapshotJson?.evaluationSnapshot || {};
  const sixDims = evalSnap.sixDimensions || {};
  const honors = snapshotJson?.honors || [];
  const subjects = snapshotJson?.subjects || [];

  const dimsHtml = Object.entries(sixDims).map(([code, val]) => {
    const dimNames = { D: '德育', Z: '智育', T: '体育', M: '美育', L: '劳育', G: '生活故事' };
    const scoreVal = val.score !== undefined ? val.score : val.value;
    return `
      <div class="dim-card">
        <div class="dim-name">${escapeHtml(dimNames[code] || code)}</div>
        <div class="dim-score">${escapeHtml(scoreVal)} 分</div>
        <div class="dim-status">${escapeHtml(val.status === 'NORMAL' ? '正常就绪' : val.status)}</div>
      </div>
    `;
  }).join('');

  const honorsHtml = honors.length > 0
    ? honors.map(h => `<li class="honor-item"><strong>${escapeHtml(h.title)}</strong> — ${escapeHtml(h.award_level || '')} (${escapeHtml(h.prize_level || '')})</li>`).join('')
    : '<div class="empty-tip">本学期暂无申报荣誉记录</div>';

  const subjectsHtml = subjects.length > 0
    ? subjects.map(s => `<tr><td>${escapeHtml(s.subject_name || s.subject_code)}</td><td>${escapeHtml(s.score !== null ? s.score : s.raw_score)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty-tip">暂无学科成绩</td></tr>';

  const printTimestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>小学生综合素质发展报告单 - ${escapeHtml(studentName)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 15mm 15mm 15mm;
    }
    @media print {
      body {
        margin: 0;
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
      color: #262626;
      line-height: 1.5;
      background: #f0f2f5;
      padding: 20px 0;
    }
    .a4-sheet {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #fff;
      padding: 16mm 16mm 14mm;
      box-sizing: border-box;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      position: relative;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #277460;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .school-title {
      font-size: 20px;
      font-weight: 700;
      color: #277460;
      letter-spacing: 1px;
    }
    .sub-title {
      font-size: 14px;
      color: #595959;
      margin-top: 4px;
    }
    .meta-bar {
      display: flex;
      justify-content: space-between;
      background: #f6f8f7;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #277460;
      border-left: 4px solid #277460;
      padding-left: 8px;
      margin: 14px 0 10px;
    }
    .dim-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }
    .dim-card {
      border: 1px solid #e8e8e8;
      border-radius: 6px;
      text-align: center;
      padding: 8px 4px;
      background: #fafafa;
    }
    .dim-name { font-size: 12px; color: #595959; font-weight: 600; }
    .dim-score { font-size: 16px; font-weight: 700; color: #277460; margin: 4px 0; }
    .dim-status { font-size: 10px; color: #8c8c8c; }
    .table-custom {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 12px;
    }
    .table-custom th, .table-custom td {
      border: 1px solid #e8e8e8;
      padding: 6px 10px;
      text-align: left;
    }
    .table-custom th {
      background: #f6f8f7;
      color: #262626;
      font-weight: 600;
    }
    .comment-block {
      border: 1px solid #e8e8e8;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 13px;
      background: #fafafa;
      line-height: 1.6;
      margin-bottom: 14px;
    }
    .footer {
      border-top: 1px dashed #d9d9d9;
      padding-top: 10px;
      margin-top: 24px;
      font-size: 11px;
      color: #8c8c8c;
      display: flex;
      justify-content: space-between;
    }
    .security-hash {
      font-family: monospace;
      color: #595959;
    }
  </style>
</head>
<body>
  <div class="a4-sheet">
    <div class="header">
      <div class="school-title">小学生综合素质发展报告单</div>
      <div class="sub-title">六育融合 · 德智体美劳与生活实践全息评价 (第 ${version} 版)</div>
    </div>

    <div class="meta-bar">
      <span><strong>姓名：</strong>${escapeHtml(studentName)}</span>
      <span><strong>班级：</strong>${escapeHtml(grade)}年级 ${escapeHtml(classNo)}班</span>
      <span><strong>综合折算分：</strong>${escapeHtml(comprehensiveScore || '待核算')} 分</span>
      <span><strong>发布时间：</strong>${publishedAt ? new Date(publishedAt).toLocaleDateString('zh-CN') : '已归档'}</span>
    </div>

    <div class="section-title">六育综合素质各维度表现</div>
    <div class="dim-grid">
      ${dimsHtml}
    </div>

    <div class="section-title">学科阶段学业表现</div>
    <table class="table-custom">
      <thead>
        <tr><th>学科名称</th><th>学期考查 / 综合成绩</th></tr>
      </thead>
      <tbody>
        ${subjectsHtml}
      </tbody>
    </table>

    <div class="section-title">荣誉表彰与成长事实</div>
    <ul style="padding-left: 20px; margin: 6px 0 14px; font-size: 13px;">
      ${honorsHtml}
    </ul>

    <div class="section-title">班主任寄语</div>
    <div class="comment-block">
      ${escapeHtml(teacherComment) || '班主任暂未填写正式评语'}
    </div>

    <div class="section-title">家长寄语与心愿</div>
    <div class="comment-block">
      ${escapeHtml(familyMessage) || '暂无家长留言反馈'}
    </div>

    <div class="footer">
      <div>防伪安全指纹: <span class="security-hash">${escapeHtml(approvalFingerprint || 'N/A')}</span></div>
      <div>打印时间: ${printTimestamp}</div>
    </div>
  </div>
</body>
</html>
  `;
}

module.exports = {
  getPublishedReport,
  renderPrintableA4
};
