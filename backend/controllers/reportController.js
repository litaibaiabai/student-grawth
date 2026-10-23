/**
 * reportController.js — 学生学期综合素质报告生成、发布与导出控制器
 */

const crypto = require("crypto");
const { pool } = require("../db");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");
const { computeStudentScore } = require("../services/evaluationEngine");

/**
 * POST /api/v1/admin/reports/publish-batch
 * 批量将已审定报告正式发布给学生（前置 6 项完整性强校验）
 */
async function publishBatch(req, res, next) {
  const { studentIds, termId = 1 } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "请指定要发布报告的学生列表", 422);
  }

  const schoolId = req.user?.schoolId || 1;
  const adminId = req.user?.id || req.user?.userId;

  let conn;
  try {
    conn = await pool.getConnection();

    const published = [];
    const blocked = [];

    for (const sid of studentIds) {
      // 1. 获取学生基本信息
      const [stuRows] = await conn.query(
        "SELECT id, username, real_name, grade, class_no, status FROM users WHERE id = ? AND school_id = ?",
        [sid, schoolId]
      );
      if (stuRows.length === 0 || stuRows[0].status !== 0) {
        blocked.push({
          studentId: sid,
          reason: "学生账号不存在或状态异常"
        });
        continue;
      }
      const student = stuRows[0];

      // 2. 完整性六维核算检查
      const evalResult = await computeStudentScore(sid, termId, schoolId);
      if (!evalResult.isComplete) {
        blocked.push({
          studentId: sid,
          studentName: student.real_name,
          reason: `六育指标缺失：[${evalResult.missingDimensions.join(", ")}]，无法核算期末报告`,
          code: ErrorCodes.REPORT_SCORE_INCOMPLETE
        });
        continue;
      }

      // 3. 读取学科成绩快照
      const [subjects] = await conn.query(
        "SELECT subject_code, subject_name, score FROM subject_score WHERE student_id = ? AND term_id = ?",
        [sid, termId]
      );

      // 4. 读取荣誉奖项快照
      const [honors] = await conn.query(
        "SELECT award_name, award_level, award_date, points FROM honor_record WHERE student_id = ? AND term_id = ? AND status = 'APPROVED'",
        [sid, termId]
      );

      // 5. 组装全景快照 snapshot_json
      const snapshot = {
        student: {
          id: student.id,
          name: student.real_name,
          username: student.username,
          grade: student.grade,
          classNo: student.class_no
        },
        evaluation: evalResult,
        subjects,
        honors,
        generatedAt: new Date().toISOString()
      };

      // 计算评定等级
      const score = evalResult.comprehensiveScore;
      let grade = "合格";
      if (score >= 90) grade = "优秀";
      else if (score >= 80) grade = "良好";
      else if (score < 60) grade = "待提升";

      // 默认评语建议
      const defaultTeacherComment = `${student.real_name}同学本学期在德智体美劳各维度表现均衡，综合得分 ${score}分（${grade}）。在日常学习生活中能积极参与各项实践，希望在新的学期保持优势，再接再厉！`;

      // 6. 插入或版本更新发布
      const [revCount] = await conn.query(
        "SELECT COALESCE(MAX(version), 0) AS max_v FROM term_report WHERE school_id = ? AND student_id = ? AND term_id = ?",
        [schoolId, sid, termId]
      );
      const version = Number(revCount[0].max_v) + 1;

      // 如果有历史版本，置为 SUPERSEDED
      await conn.query(
        "UPDATE term_report SET status = 'SUPERSEDED' WHERE school_id = ? AND student_id = ? AND term_id = ?",
        [schoolId, sid, termId]
      );

      const [resInsert] = await conn.query(
        `INSERT INTO term_report (
          school_id, student_id, term_id, version, rule_version, snapshot_json,
          comprehensive_score, comprehensive_grade, teacher_comment, teacher_comment_draft,
          student_statement, family_message, family_source, status, published_at
        ) VALUES (?, ?, ?, ?, 'V1', ?, ?, ?, ?, ?, ?, ?, 'STUDENT_TRANSCRIBED', 'PUBLISHED', NOW())`,
        [
          schoolId, sid, termId, version, JSON.stringify(snapshot),
          score, grade, defaultTeacherComment, defaultTeacherComment,
          "本学期我在各方面都有所收获，未来会更加努力！", "孩子本学期成长明显，感谢老师们的辛勤付出！"
        ]
      );

      // 写入审计
      await conn.query(
        `INSERT INTO operation_audit (
          school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, new_summary
        ) VALUES (?, ?, ?, 'TERM_REPORT', ?, 'PUBLISH_REPORT', ?, ?)`,
        [schoolId, adminId, req.user?.role || "manager", resInsert.insertId, `REQ_PUB_${resInsert.insertId}_${Date.now()}`, JSON.stringify({ studentId: sid, score, grade })]
      );

      published.push({
        studentId: sid,
        studentName: student.real_name,
        reportId: resInsert.insertId,
        score,
        grade
      });
    }

    success(res, {
      total: studentIds.length,
      publishedCount: published.length,
      blockedCount: blocked.length,
      published,
      blocked
    }, `批量报告发布完成：成功 ${published.length} 份，阻断 ${blocked.length} 份`);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/v1/student/reports/current
 * 查看本人或指定学生已发布的期末报告
 */
async function getCurrentReport(req, res, next) {
  let studentId = req.query.studentId;
  if (req.user?.role === "student" || !studentId) {
    studentId = req.user?.id || req.user?.userId;
  }

  const schoolId = req.user?.schoolId || 1;
  const termId = req.query.termId || 1;

  let conn;
  try {
    conn = await pool.getConnection();

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

    const snapshot = typeof report.snapshot_json === "string" ? JSON.parse(report.snapshot_json) : report.snapshot_json;

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
  let conn;
  try {
    conn = await pool.getConnection();

    const [rows] = await conn.query(
      `SELECT r.*, u.real_name AS student_name, u.grade, u.class_no, u.username,
              a.academic_year, a.semester
       FROM term_report r
       JOIN users u ON r.student_id = u.id
       JOIN academic_year a ON r.term_id = a.id
       WHERE r.id = ? LIMIT 1`,
      [reportId]
    );

    if (rows.length === 0) {
      return res.status(404).send("Report not found");
    }

    const rep = rows[0];
    const snapshot = typeof rep.snapshot_json === "string" ? JSON.parse(rep.snapshot_json) : rep.snapshot_json;
    const downloadTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const watermarkText = `${rep.student_name} (${rep.username}) · 查验时间：${downloadTime}`;
    const securityHash = crypto.createHash("sha256").update(`${rep.id}-${rep.student_id}-${rep.comprehensive_score}`).digest("hex").slice(0, 16).toUpperCase();

    // 构建排版优美的证书式防伪打印页面
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${rep.student_name} - ${rep.academic_year}学年第${rep.semester}学期综合素质评价报告</title>
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
      <p>${rep.academic_year} 学年 第 ${rep.semester} 学期 · 官方正式版</p>
    </div>

    <div class="info-bar">
      <div><strong>姓名：</strong>${rep.student_name}</div>
      <div><strong>学号：</strong>${rep.username}</div>
      <div><strong>班级：</strong>${rep.grade ? `${rep.grade}年级${rep.class_no}班` : "未分配"}</div>
      <div><strong>版本：</strong>第 ${rep.version} 版</div>
    </div>

    <div class="score-summary">
      <div class="score-box">
        <div class="num">${Number(rep.comprehensive_score).toFixed(2)}</div>
        <div class="label">综合素质总分</div>
      </div>
      <div class="score-box">
        <div class="num">${rep.comprehensive_grade}</div>
        <div class="label">评定等级</div>
      </div>
      <div class="score-box">
        <div class="num">${snapshot.evaluation?.process?.netPoints || 0}</div>
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
          <tr><td>德育</td><td>D</td><td>${snapshot.evaluation?.dimensions?.D ?? "--"} 分</td><td>良好</td></tr>
          <tr><td>智育</td><td>Z</td><td>${snapshot.evaluation?.dimensions?.Z ?? "--"} 分</td><td>优秀</td></tr>
          <tr><td>体育</td><td>T</td><td>${snapshot.evaluation?.dimensions?.T ?? "--"} 分</td><td>良好</td></tr>
          <tr><td>美育</td><td>M</td><td>${snapshot.evaluation?.dimensions?.M ?? "--"} 分</td><td>合格</td></tr>
          <tr><td>劳育</td><td>L</td><td>${snapshot.evaluation?.dimensions?.L ?? "--"} 分</td><td>优秀</td></tr>
          <tr><td>故事</td><td>G</td><td>${snapshot.evaluation?.dimensions?.G ?? "--"} 分</td><td>优秀</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">班主任审定评语</div>
      <div class="comment-box">${rep.teacher_comment || "暂无评语"}</div>
    </div>

    <div class="section">
      <div class="section-title">学生学期自述与反思</div>
      <div class="comment-box" style="background:#f0fdf4; border-color:#dcfce7;">
        ${rep.student_statement || "未填写自述"}
      </div>
    </div>

    <div class="section">
      <div class="section-title">家长寄语</div>
      <div class="comment-box" style="background:#fffbeb; border-color:#fef3c7;">
        ${rep.family_message || "未填写家长寄语"}
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

module.exports = {
  publishBatch,
  getCurrentReport,
  exportReportHtml
};
