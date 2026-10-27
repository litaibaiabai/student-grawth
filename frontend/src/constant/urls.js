import { API_SERVER } from "./apis";
export { API_SERVER };

const BASE = API_SERVER + "/api/v1";

// 认证相关 API
export const API_LOGIN = API_SERVER + "/api/auth/login";
export const API_AUTH_ME = BASE + "/me";
export const API_LOGOUT = API_SERVER + "/api/auth/logout";

// 学期与指标
export const API_CURRENT_TERM = BASE + "/terms/current";
export const API_TERMS = BASE + "/terms";
export const API_ADMIN_TERMS = BASE + "/admin/terms";
export const API_CATEGORIES = BASE + "/evaluation-categories";

// 实体卡 & 扫码申领
export const API_CARD_PREVIEW = BASE + "/student/cards/preview";
export const API_CARD_CLAIM = BASE + "/student/card-claims";
export const API_TEACHER_CLAIMS = BASE + "/teacher/card-claims";
export const API_DECIDE_CLAIM = (id) => `${BASE}/teacher/card-claims/${id}/decision`;
export const API_CARDS = BASE + "/cards";
export const API_CARD_SUBJECTS = BASE + "/admin/card-subjects";
export const API_CARD_TEACHERS = BASE + "/admin/card-teachers";
export const API_SUBJECT_CARD_POLICIES = BASE + "/admin/subject-card-policies";
export const API_CARD_ALLOCATIONS = BASE + "/card-allocations";
export const API_CARD_GENERATION_ISSUES = BASE + "/admin/card-generation-issues";
export const API_CARD_PRINT_PACKS = BASE + "/admin/card-print-packs";

// 积分流水 & 冲销
export const API_STUDENT_SCORES = BASE + "/student/scores";
export const API_DIRECT_SCORE = BASE + "/teacher/scores/direct-batch";
export const API_REVERSE_SCORE = BASE + "/admin/scores/reversal";

// 荣誉奖项
export const API_HONORS = BASE + "/honors";
export const API_UPLOAD_HONOR_CERT = BASE + "/uploads/honor-certificate";
export const API_HONOR_CERT_FILE = (fileRef) => `${BASE}/uploads/${fileRef}`;
export const API_SUBMIT_HONOR = BASE + "/student/honors";
export const API_RESUBMIT_HONOR = (id) => `${BASE}/student/honors/${id}/resubmit`;
export const API_REVIEW_HONOR = (id) => `${BASE}/teacher/honors/${id}/review`;

// 月度生活故事
export const API_STORIES = BASE + "/stories";
export const API_SUBMIT_STORY = BASE + "/student/stories";
export const API_REVIEW_STORY = (id) => `${BASE}/teacher/stories/${id}/review`;

// 成绩导入
export const API_IMPORT_PREVIEW = BASE + "/import/preview";
export const API_IMPORT_COMMIT = BASE + "/import/commit";
export const API_IMPORT_BATCH_PREVIEW = BASE + "/import/batch-preview";
export const API_IMPORT_BATCH_COMMIT = BASE + "/import/batch-commit";

// 综合评分
export const API_COMPREHENSIVE_SCORE = BASE + "/student/comprehensive-score";
export const API_EVALUATION_RULES = BASE + "/admin/evaluation-rules";

// 期末报告
export const API_CURRENT_REPORT = BASE + "/student/reports/current";
export const API_PUBLISH_REPORTS = BASE + "/admin/reports/publish-batch";
export const API_REPORT_PDF = (id) => `${BASE}/student/reports/${id}/export-pdf`;
export const API_TEACHER_REPORT_DRAFT = BASE + "/teacher/reports/draft";
export const API_TEACHER_REPORT_DRAFT_DETAIL = (id) => `${BASE}/teacher/reports/draft/${id}`;
export const API_TEACHER_REPORT_CONFIRM = BASE + "/teacher/reports/confirm";

// 辅助查询
export const API_STUDENTS_LIST = BASE + "/users/students";
export const API_TEACHERS_LIST = BASE + "/users/teachers";
export const API_AUDITS = BASE + "/admin/audits";

// 任教授权
export const API_ADMIN_TEACHING_ASSIGNMENTS = BASE + "/admin/teaching-assignments";
export const API_ADMIN_TEACHING_ASSIGNMENT_DELETE = (id) => `${BASE}/admin/teaching-assignments/${id}`;
