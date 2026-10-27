/**
 * api.js — 六育学生综合素质评价系统 REST API v1 路由总线
 */

const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { login, getMe } = require("../controllers/authController");
const { getCurrentTerm, getTerms, saveTerm, setCurrentTerm } = require("../controllers/termController");
const { getCategories } = require("../controllers/categoryController");
const {
  setCardQuota,
  getCardQuotas,
  generateMonthCards,
  getCards,
  previewCard,
  claimCard,
  getTeacherClaims,
  decideClaim
} = require("../controllers/cardController");
const {retiredPreview}=require('../controllers/cardController');
const { directScoreBatch, reverseScore, teacherCorrectScore, getStudentScores } = require("../controllers/scoreController");
const { submitHonor, resubmitHonor, reviewHonor, revokeHonor, getHonors } = require("../controllers/honorController");
const { uploadHonorCertificate, uploadLimiter, getHonorCertificate } = require("../controllers/uploadController");
const { submitStory, reviewStory, getStories } = require("../controllers/storyController");
const { previewImport, commitImport, previewBatchImport, commitBatchImport } = require("../controllers/importController");
const { getComprehensiveScore, getRules, saveRule } = require("../controllers/evaluationController");
const { publishBatch, getCurrentReport, exportReportHtml, getPublishStatus } = require("../controllers/reportController");
const { expireOldCards } = require("../services/scheduler");
const { pool } = require("../db");
const cardPolicies = require('../controllers/cardPolicyController');
const cardPrint = require('../controllers/cardPrintController');
const { requireCardAccount } = require('../middleware/cardAccount');
const { success } = require("../utils/response");
const {queueReconcile}=require('../services/cardAllocationService');
const teachingAssignments = require("../controllers/teachingAssignmentController");
const reportIndicators = require("../controllers/reportIndicatorController");
const reconcileCalendar=(req,res,next)=>{res.once('finish',()=>{if(res.statusCode<300)queueReconcile(req.user.schoolId);});next();};

const router = express.Router();

// ---------------------- 认证与身份 ----------------------
router.post("/auth/login", login);
router.get("/me", requireAuth, getMe);

// ---------------------- 学期管理 ----------------------
router.get("/terms/current", getCurrentTerm);
router.get("/terms", requireAuth, getTerms);
router.post('/admin/terms',requireAuth,requireRole('manager'),requireCardAccount,reconcileCalendar,saveTerm);
router.put('/admin/terms/:id',requireAuth,requireRole('manager'),requireCardAccount,reconcileCalendar,saveTerm);
router.post('/admin/terms/:id',requireAuth,requireRole('manager'),requireCardAccount,reconcileCalendar,saveTerm);
router.post("/admin/terms/:id/set-current", requireAuth, requireRole("manager"), setCurrentTerm);

// ---------------------- 任教授权与班主任职责 ----------------------
router.get("/admin/teaching-assignments", requireAuth, requireRole("manager", "teacher"), teachingAssignments.getTeachingAssignments);
router.post("/admin/teaching-assignments", requireAuth, requireRole("manager"), teachingAssignments.saveTeachingAssignment);
router.delete("/admin/teaching-assignments/:id", requireAuth, requireRole("manager"), teachingAssignments.deleteTeachingAssignment);
router.post("/admin/import/subject-scores", requireAuth, requireRole("teacher", "manager"), teachingAssignments.submitSubjectScores);

// ---------------------- 六育指标字典 ----------------------
router.get("/evaluation-categories", getCategories);

// ---------------------- 年级指标与过程评价 ----------------------
router.post("/admin/grade-indicators/configure", requireAuth, requireRole("manager"), reportIndicators.configureGradeIndicators);
router.get("/admin/grade-indicators/progress", requireAuth, requireRole("manager"), reportIndicators.getGradeIndicatorProgress);
router.post("/teacher/students/:studentId/indicator-values", requireAuth, requireRole("teacher"), reportIndicators.saveStudentIndicatorValues);
router.get("/grade-indicators", requireAuth, reportIndicators.getGradeIndicators);
router.get("/students/:studentId/indicator-values", requireAuth, reportIndicators.getStudentIndicatorValues);

// ---------------------- 实体卡管理 & 扫码申领 ----------------------
router.get('/student/cards/preview',requireAuth,retiredPreview);
router.post('/student/cards/preview',requireAuth,requireRole('student'),requireCardAccount,previewCard);
router.post('/student/card-claims',requireAuth,requireRole('student'),requireCardAccount,claimCard);
router.get('/teacher/card-claims',requireAuth,requireRole('teacher','manager'),requireCardAccount,getTeacherClaims);
router.post('/teacher/card-claims/:id/decision',requireAuth,requireRole('teacher','manager'),requireCardAccount,decideClaim);

router.get('/admin/card-subjects',requireAuth,requireRole('manager'),requireCardAccount,cardPolicies.getSubjects);
router.post('/admin/card-subjects',requireAuth,requireRole('manager'),requireCardAccount,cardPolicies.saveSubject);
router.put('/admin/card-subjects/:id',requireAuth,requireRole('manager'),requireCardAccount,cardPolicies.saveSubject);
router.get('/admin/card-teachers',requireAuth,requireRole('manager'),requireCardAccount,cardPolicies.getTeachers);
router.put('/admin/card-teachers/:id/subjects',requireAuth,requireRole('manager'),requireCardAccount,cardPolicies.saveTeacherSubjects);
router.get('/admin/subject-card-policies',requireAuth,requireRole('manager'),requireCardAccount,cardPolicies.getPolicies);
router.put('/admin/subject-card-policies/:subjectId',requireAuth,requireRole('manager'),requireCardAccount,cardPolicies.savePolicy);
router.get('/card-allocations',requireAuth,requireRole('manager','teacher'),requireCardAccount,cardPolicies.getAllocations);
router.get('/admin/card-generation-issues',requireAuth,requireRole('manager'),requireCardAccount,cardPolicies.getGenerationIssues);
router.post('/admin/card-print-packs',requireAuth,requireRole('manager'),requireCardAccount,cardPrint.create);
router.get('/admin/card-print-packs/:id',requireAuth,requireRole('manager'),requireCardAccount,cardPrint.get);
router.get('/admin/card-print-packs/:id/download',requireAuth,requireRole('manager'),requireCardAccount,cardPrint.download);
router.get('/admin/card-quotas',requireAuth,requireRole('manager','teacher'),cardPolicies.retiredCardEndpoint);
router.post('/admin/card-quotas',requireAuth,requireRole('manager'),cardPolicies.retiredCardEndpoint);
router.post('/admin/cards/generate-month',requireAuth,requireRole('manager'),cardPolicies.retiredCardEndpoint);
router.get('/cards',requireAuth,requireRole('manager','teacher'),requireCardAccount,getCards);

// ---------------------- 过程积分 & 冲销 ----------------------
router.post("/teacher/scores/direct-batch", requireAuth, requireRole("teacher", "manager"), directScoreBatch);
router.post("/teacher/scores/correction", requireAuth, requireRole("teacher", "manager"), teacherCorrectScore);
router.post("/admin/scores/reversal", requireAuth, requireRole("manager"), reverseScore);
router.get("/student/scores", requireAuth, getStudentScores);

// ---------------------- 荣誉申报 & 审核 ----------------------
router.post("/student/honors", requireAuth, requireRole("student"), submitHonor);
router.post("/student/honors/:id/resubmit", requireAuth, requireRole("student"), resubmitHonor);
router.post("/teacher/honors/:id/review", requireAuth, requireRole("teacher", "manager"), reviewHonor);
router.post("/teacher/honors/:id/revoke", requireAuth, requireRole("teacher", "manager"), revokeHonor);
router.get("/honors", requireAuth, getHonors);
router.post("/uploads/honor-certificate", requireAuth, requireRole("student"), uploadLimiter, uploadHonorCertificate);
router.get("/uploads/honor/:name", requireAuth, getHonorCertificate);

// ---------------------- 月度故事 & AI 预评 ----------------------
router.post("/student/stories", requireAuth, requireRole("student"), submitStory);
router.post("/teacher/stories/:id/review", requireAuth, requireRole("teacher", "manager"), reviewStory);

// 改造报告草稿与教师确认
const reportDrafts = require("../controllers/reportDraftController");
router.post("/teacher/reports/draft", requireAuth, requireRole("teacher"), reportDrafts.buildDraft);
router.get("/teacher/reports/draft/:draftId", requireAuth, requireRole("teacher"), reportDrafts.getDraft);
router.post("/teacher/reports/confirm", requireAuth, requireRole("teacher"), reportDrafts.confirmDraft);
router.post("/teacher/reports/draft/:draftId/ai-comment", requireAuth, requireRole("teacher"), reportDrafts.requestAiComment);
router.post("/teacher/reports/draft/:draftId/ai-comment/apply", requireAuth, requireRole("teacher"), reportDrafts.applyAiComment);
router.get("/stories", requireAuth, getStories);

// 改造家长寄语与反馈记录
const familyFeedbacks = require("../controllers/familyFeedbackController");
router.post("/family/token", requireAuth, requireRole("teacher", "manager"), familyFeedbacks.issueToken);
router.post("/family/comment", familyFeedbacks.submitComment);
router.get("/family/feedbacks/:studentId", requireAuth, familyFeedbacks.getFeedbacks);

// ---------------------- 数据导入 ----------------------
router.post("/import/preview", requireAuth, requireRole("teacher", "manager"), previewImport);
router.post("/import/commit", requireAuth, requireRole("teacher", "manager"), commitImport);
router.post("/import/batch-preview", requireAuth, requireRole("teacher", "manager"), previewBatchImport);
router.post("/import/batch-commit", requireAuth, requireRole("teacher", "manager"), commitBatchImport);

// ---------------------- 综合评分 ----------------------
router.get("/student/comprehensive-score", requireAuth, getComprehensiveScore);
router.get("/admin/evaluation-rules", requireAuth, requireRole("manager"), getRules);
router.post("/admin/evaluation-rules", requireAuth, requireRole("manager"), saveRule);

// ---------------------- 期末报告 & 导出 ----------------------
router.get("/admin/reports/publish-status", requireAuth, requireRole("manager"), getPublishStatus);
router.post("/admin/reports/publish-batch", requireAuth, requireRole("manager"), publishBatch);
router.get("/student/reports/current", requireAuth, getCurrentReport);
router.get("/student/reports/:id/export-pdf", requireAuth, exportReportHtml);

// ---------------------- 定时任务触发 ----------------------
router.post("/admin/tasks/trigger-card-expiration", requireAuth, requireRole("manager"), async (req, res) => {
  const expiredCount = await expireOldCards();
  success(res, { expiredCount }, `超期实体卡过期扫描完成，已将 ${expiredCount} 张卡置为 EXPIRED`);
});

// ---------------------- 辅助用户数据查询 ----------------------
router.get("/users/students", requireAuth, requireRole("teacher", "manager"), async (req, res, next) => {
  try {
    const schoolId = req.user?.schoolId || 1;
    let sql = "SELECT id, username, real_name, grade, class_no FROM users WHERE school_id = ? AND role = 'student'";
    const params = [schoolId];

    // 教师仅可见任教班级的学生
    if (req.user?.role === "teacher") {
      let classes = req.user.classes;
      if (typeof classes === "string") {
        try {
          classes = JSON.parse(classes);
        } catch {
          classes = [];
        }
      }
      if (!Array.isArray(classes) || classes.length === 0) return success(res, []);
      sql += ` AND (${classes.map(() => "(grade = ? AND class_no = ?)").join(" OR ")})`;
      classes.forEach((c) => params.push(Number(c.grade), Number(c.class_no)));
    }

    const [rows] = await pool.query(`${sql} ORDER BY grade ASC, class_no ASC, id ASC`, params);
    success(res, rows);
  } catch (err) {
    next(err);
  }
});

router.get("/users/teachers", requireAuth, async (req, res, next) => {
  try {
    const schoolId = req.user?.schoolId || 1;
    const [rows] = await pool.query(
      "SELECT id, username, real_name, classes FROM users WHERE school_id = ? AND role = 'teacher' ORDER BY id ASC",
      [schoolId]
    );
    success(res, rows);
  } catch (err) {
    next(err);
  }
});

// 审计日志查询 (管理员)
router.get("/admin/audits", requireAuth, requireRole("manager"), async (req, res, next) => {
  try {
    const schoolId = req.user?.schoolId || 1;
    const [rows] = await pool.query(
      `SELECT 
         a.id,
         a.school_id,
         a.actor_user_id AS operator_id,
         a.actor_user_id,
         a.actor_role,
         a.target_type AS resource_type,
         a.target_type,
         a.target_id,
         a.action,
         a.old_summary AS before_value,
         a.new_summary AS after_value,
         a.old_summary,
         a.new_summary,
         a.request_id,
         a.client_ip,
         a.created_at,
         u.real_name AS operator_name
       FROM operation_audit a
       LEFT JOIN users u ON a.actor_user_id = u.id
       WHERE a.school_id = ?
       ORDER BY a.id DESC LIMIT 100`,
      [schoolId]
    );
    success(res, rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------- 学生成长首页与主题 (Task 16) ----------------------
const growthController = require("../controllers/growthController");
router.get("/growth/my", requireAuth, growthController.handleGetMyGrowth);
router.post("/growth/theme", requireAuth, growthController.handleSetTheme);

module.exports = router;
