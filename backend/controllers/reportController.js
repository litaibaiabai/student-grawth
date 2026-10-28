/**
 * reportController.js — 学生学期综合素质报告生成、发布与导出控制器
 */

const crypto = require("crypto");
const { pool } = require("../db");
const {requireStudentScope}=require("../middleware/studentScope");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");
const { normalizeReportSnapshot } = require("../services/reportSnapshot");

/**
 * POST /api/v1/admin/reports/publish-batch
 * 批量将已审定报告正式发布给学生（前置 6 项完整性强校验）
 */
async function publishBatch(req, res, next) {
  const studentIds = req.body.studentIds || req.body.student_ids;
  if (!Array.isArray(studentIds) || !studentIds.length) return fail(res, ErrorCodes.VALIDATION_ERROR, '请指定要发布报告的学生列表', 422);
  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user.schoolId;
    let termId = req.body.termId || req.body.term_id;
    const [[term]] = await conn.query(`SELECT id FROM academic_year WHERE (school_id=? OR school_id IS NULL) AND ${termId ? 'id=?' : 'is_current=1'} ORDER BY id DESC LIMIT 1`,termId ? [schoolId,termId] : [schoolId]);
    if (!term) return fail(res, ErrorCodes.VALIDATION_ERROR, '指定学期不存在',422);
    termId = term.id;
    const result = await require('../services/reportPublishService').publishBatchReports({actor:req.user,schoolId,termId,studentIds,connection:conn});
    return success(res,{...result,total:result.totalTarget,publishedCount:result.successCount,blocked:result.blockedList},`批量报告发布完成：成功 ${result.successCount} 份，阻断 ${result.blockedCount} 份`);
  } catch(err) { next(err); } finally { if(conn)conn.release(); }
}

/**
 * GET /api/v1/student/reports/current
 * 查看本人或指定学生已发布的期末报告
 */
async function getCurrentReport(req, res, next) {
  if (req.user?.role === "manager" || req.user?.role === "admin") {
    return fail(res, "AUTH_FORBIDDEN", "管理员无权查阅学生个人报告正文与详情", 403);
  }

  let studentId = req.query.studentId;
  if (req.user?.role === "student" || !studentId) {
    studentId = req.user?.id || req.user?.userId;
  }

  const schoolId = req.user?.schoolId || 1;
  let termId = req.query.termId || req.query.term_id;

  let conn;
  try {
    conn = await pool.getConnection();

    if (!termId) {
      const [termRows] = await conn.query(
        "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
        [schoolId]
      );
      termId = termRows.length > 0 ? termRows[0].id : 1;
    }

    await requireStudentScope(req.user,studentId,conn);
    const [rows] = await conn.query(
      `SELECT r.*, a.academic_year, a.semester
       FROM term_report r
       JOIN academic_year a ON r.term_id = a.id
       WHERE r.school_id = ? AND r.student_id = ? AND r.term_id = ? AND r.status = 'PUBLISHED'
       ORDER BY r.version DESC LIMIT 1`,
      [schoolId, studentId, termId]
    );

    if (rows.length === 0) {
      return success(res, null, "该学期综合素质发展报告尚未正式发布");
    }

    const report = rows[0];

    // 更新学生首次阅读时间 read_at
    if (req.user?.role === "student" && !report.read_at) {
      await conn.query("UPDATE term_report SET read_at = NOW() WHERE id = ?", [report.id]);
    }

    const snapshot = normalizeReportSnapshot(typeof report.snapshot_json === "string" ? JSON.parse(report.snapshot_json) : report.snapshot_json);

    success(res, {
      id: report.id,
      studentId: report.student_id,
      termId: report.term_id,
      academicYear: report.academic_year,
      semester: report.semester,
      version: report.version,
      comprehensiveScore: Number(report.comprehensive_score),
      comprehensiveGrade: report.comprehensive_grade,
      teacherComment: report.teacher_comment,
      studentStatement: report.student_statement,
      familyMessage: report.family_message,
      publishedAt: report.published_at,
      readAt: report.read_at,
      snapshot
    });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/v1/student/reports/:id/export-pdf
 * 导出带学生姓名与下载时间水印的防伪 HTML / PDF 打印视图
 */
async function exportReportHtml(req, res, next) {
  const reportId = req.params.id;
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  const levelOf = (s) =>
    s === undefined || s === null ? "--" : s >= 90 ? "优秀" : s >= 80 ? "良好" : s >= 60 ? "合格" : "待提升";
  let conn;
  try {
    conn = await pool.getConnection();

    const [rows] = await conn.query(
      `SELECT r.*, u.real_name AS student_name, u.grade, u.class_no, u.username,
              a.academic_year, a.semester
       FROM term_report r
       JOIN users u ON r.student_id = u.id
       JOIN academic_year a ON r.term_id = a.id
       WHERE r.id = ? AND r.school_id = ? LIMIT 1`,
      [reportId, req.user?.schoolId || 1]
    );

    if (rows.length === 0) {
      return res.status(404).send("Report not found");
    }

    const rep = rows[0];

    // 学生仅能查看本人报告，教师仅能查看任教班级，管理员禁止借打印访问正文
    const role = req.user?.role;
    const uid = req.user?.id || req.user?.userId;
    if (role === "manager" || role === "admin") {
      return res.status(403).send("管理员无权查阅学生个人报告正文与详情");
    }
    if (role === "student" && (Number(rep.student_id) !== Number(uid) || rep.status !== "PUBLISHED")) {
      return res.status(403).send("无权查看该报告");
    }
    if (role === "teacher") {
      let classes = req.user.classes;
      if (typeof classes === "string") {
        try {
          classes = JSON.parse(classes);
        } catch {
          classes = [];
        }
      }
      const ok =
        Array.isArray(classes) &&
        classes.some((c) => Number(c.grade) === Number(rep.grade) && Number(c.class_no) === Number(rep.class_no));
      if (!ok) return res.status(403).send("无权查看该报告");
    }

    const snapshot = normalizeReportSnapshot(typeof rep.snapshot_json === "string" ? JSON.parse(rep.snapshot_json) : rep.snapshot_json);
    // Authorization above uses current class membership; report content uses frozen identity.
    rep.student_name = snapshot.student?.name || '未记录姓名';
    rep.username = snapshot.student?.username || '';
    rep.grade = snapshot.student?.grade ?? '';
    rep.class_no = snapshot.student?.classNo ?? '';
    const downloadTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const watermarkText = esc(`${rep.student_name} (${rep.username}) · 查验时间：${downloadTime}`);
    const securityHash = crypto
      .createHash("sha256")
      .update(`${rep.id}-${rep.student_id}-${rep.comprehensive_score}`)
      .digest("hex")
      .slice(0, 16)
      .toUpperCase();

    // 构建排版优美的证书式防伪打印页面
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
  <title>${esc(rep.student_name)} - ${esc(rep.academic_year)}学年第${Number(rep.semester)}学期综合素质评价报告</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 24px;
      position: relative;
      background: #f8fafc;
    }
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 26px;
      color: rgba(148, 163, 184, 0.15);
      white-space: nowrap;
      pointer-events: none;
      z-index: 9999;
      font-weight: 700;
      letter-spacing: 4px;
    }
    .report-card {
      background: #ffffff;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header h1 {
      margin: 0 0 8px 0;
      color: #1e3a8a;
      font-size: 24px;
      letter-spacing: 1px;
    }
    .header p {
      margin: 0;
      color: #64748b;
      font-size: 14px;
    }
    .info-bar {
      display: flex;
      justify-content: space-between;
      background: #f1f5f9;
      padding: 12px 18px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .score-summary {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
    }
    .score-box {
      flex: 1;
      padding: 16px;
      border-radius: 8px;
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      text-align: center;
    }
    .score-box .num {
      font-size: 28px;
      font-weight: bold;
      color: #1d4ed8;
    }
    .score-box .label {
      font-size: 13px;
      color: #475569;
      margin-top: 4px;
    }
    .section {
      margin-bottom: 20px;
    }
    .section-title {
      font-size: 16px;
      font-weight: bold;
      color: #0f172a;
      border-left: 3px solid #2563eb;
      padding-left: 8px;
      margin-bottom: 12px;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .table th, .table td {
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
      text-align: left;
    }
    .table th {
      background: #f8fafc;
      font-weight: 600;
    }
    .comment-box {
      background: #faf5ff;
      border: 1px solid #f3e8ff;
      border-radius: 8px;
      padding: 14px;
      font-size: 14px;
      line-height: 1.6;
      color: #334155;
    }
    .footer {
      margin-top: 32px;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px dashed #cbd5e1;
      padding-top: 12px;
    }
  </style>
</head>
<body>
  <div class="watermark">${watermarkText}</div>
  <div class="report-card">
    <div class="header">
      <h1>中小学学生学期综合素质发展报告</h1>
      <p>${esc(rep.academic_year)} 学年 第 ${Number(rep.semester)} 学期 · 官方正式版</p>
    </div>

    <div class="info-bar">
      <div><strong>姓名：</strong>${esc(rep.student_name)}</div>
      <div><strong>学号：</strong>${esc(rep.username)}</div>
      <div><strong>班级：</strong>${rep.grade ? `${Number(rep.grade)}年级${Number(rep.class_no)}班` : "未分配"}</div>
      <div><strong>版本：</strong>第 ${Number(rep.version)} 版</div>
    </div>

    <div class="score-summary">
      <div class="score-box">
        <div class="num">${Number(rep.comprehensive_score).toFixed(2)}</div>
        <div class="label">综合素质总分</div>
      </div>
      <div class="score-box">
        <div class="num">${esc(rep.comprehensive_grade)}</div>
        <div class="label">评定等级</div>
      </div>
      <div class="score-box">
        <div class="num">${Number(snapshot.evaluation?.process?.netPoints) || 0}</div>
        <div class="label">过程净积分</div>
      </div>
      <div class="score-box">
        <div class="num">${snapshot.honors?.length || 0}</div>
        <div class="label">审定荣誉项数</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">六育综合素质维度得分</div>
      <table class="table">
        <thead>
          <tr>
            <th>育别维度</th>
            <th>维度代码</th>
            <th>百分制核算分</th>
            <th>考核评定</th>
          </tr>
        </thead>
        <tbody>
          ${[
            ["德育", "D"],
            ["智育", "Z"],
            ["体育", "T"],
            ["美育", "M"],
            ["劳育", "L"],
            ["故事", "G"]
          ]
            .map(([name, code]) => {
              const v = snapshot.evaluation?.dimensions?.[code];
              return `<tr><td>${name}</td><td>${code}</td><td>${v === undefined || v === null ? "--" : Number(v)} 分</td><td>${levelOf(v)}</td></tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">班主任审定评语</div>
      <div class="comment-box">${esc(rep.teacher_comment || "暂无评语")}</div>
    </div>

    <div class="section">
      <div class="section-title">学生学期自述与反思</div>
      <div class="comment-box" style="background:#f0fdf4; border-color:#dcfce7;">
        ${esc(rep.student_statement || "未填写自述")}
      </div>
    </div>

    <div class="section">
      <div class="section-title">家长寄语</div>
      <div class="comment-box" style="background:#fffbeb; border-color:#fef3c7;">
        ${esc(rep.family_message || "未填写家长寄语")}
      </div>
    </div>

    <div class="footer">
      <div>防伪安全校验码：<strong>${securityHash}</strong></div>
      <div>生成时间：${rep.published_at ? new Date(rep.published_at).toLocaleString("zh-CN") : downloadTime}</div>
    </div>
  </div>
</body>
</html>
    `;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/v1/admin/reports/publish-status
 * 获取全校/年级发布准备宏观状态（无学生敏感正文）
 */
async function getPublishStatus(req, res, next) {
  try {
    const actor = {
      id: req.user?.id || req.user?.userId,
      role: req.user?.role
    };
    const schoolId = req.user?.schoolId || 1;
    const termId = req.query.termId || req.query.term_id || 1;
    const grade = req.query.grade;

    const reportPublishService = require("../services/reportPublishService");
    const status = await reportPublishService.getPublishReadinessStatus({
      actor,
      schoolId: Number(schoolId),
      termId: Number(termId),
      grade: grade !== undefined && grade !== null ? Number(grade) : null
    });

    return success(res, status);
  } catch (err) {
    if (err.status) {
      return fail(res, "AUTH_ERROR", err.message, err.status);
    }
    next(err);
  }
}

module.exports = {
  publishBatch,
  getCurrentReport,
  exportReportHtml,
  getPublishStatus
};
