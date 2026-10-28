/**
 * backend/controllers/growthController.js
 *
 * 任务 16: 学生成长首页与主题控制器
 * 
 * 职责：
 * 1. 提供学生专属卡通适龄成长首页聚合数据 (getMyGrowthData)
 * 2. 真实足迹聚合 (score_event, honor_application, student_story)，严禁使用伪造/静态数值
 * 3. 严格权限隔离：学生只能查阅本人成长记录，管理员禁止借此读取个人详情(403)
 * 4. 趣味成长等级与官方评价评级明确区分 (gameLevel vs officialGrade)
 * 5. 主题配置独立管理，切换主题绝不影响积分账本、评价规则或报告版本
 */
const db = require('../db');

const ALLOWED_THEMES = ['default', 'ocean', 'forest', 'sunset', 'cartoon'];

function getGameLevel(points = 0) {
  const p = Number(points) || 0;
  if (p < 20) {
    return {
      level: 1,
      levelName: '萌芽新星 (Level 1)',
      badge: '🌱',
      minPoints: 0,
      nextLevelPoints: 20,
      isOfficial: false,
      note: '此为趣味成长等级，非学校正式评价结论'
    };
  } else if (p < 50) {
    return {
      level: 2,
      levelName: '奋楫少年 (Level 2)',
      badge: '⭐',
      minPoints: 20,
      nextLevelPoints: 50,
      isOfficial: false,
      note: '此为趣味成长等级，非学校正式评价结论'
    };
  } else if (p < 100) {
    return {
      level: 3,
      levelName: '博雅达人 (Level 3)',
      badge: '🏆',
      minPoints: 50,
      nextLevelPoints: 100,
      isOfficial: false,
      note: '此为趣味成长等级，非学校正式评价结论'
    };
  } else {
    return {
      level: 4,
      levelName: '领航先锋 (Level 4)',
      badge: '👑',
      minPoints: 100,
      nextLevelPoints: null,
      isOfficial: false,
      note: '此为趣味成长等级，非学校正式评价结论'
    };
  }
}

async function getMyGrowthData({ actor, studentId, termId = null, connection = null }) {
  const conn = connection || db;
  const reject = (message, status) => { const err = new Error(message); err.status = status; throw err; };
  if (!actor || !['student', 'teacher'].includes(actor.role)) reject('无权读取学生个人成长详情', 403);
  const schoolId = actor.schoolId || actor.school_id || 1;
  const targetStudentId = Number(studentId || actor.id);
  if (actor.role === 'student' && Number(actor.id) !== targetStudentId) reject('无权查看其他学生的成长足迹与隐私数据', 403);
  if (actor.role === 'teacher') {
    const { requireStudentScope } = require('../middleware/studentScope');
    await requireStudentScope(actor, targetStudentId, conn);
  }
  const [students] = await conn.query("SELECT id, username, real_name, grade, class_no FROM users WHERE id = ? AND school_id = ? AND role = 'student'", [targetStudentId, schoolId]);
  if (!students.length) reject('学生不存在', 404);
  const student = students[0];
  const explicitTerm = termId !== null && termId !== undefined && termId !== '';
  if (explicitTerm && (!Number.isSafeInteger(Number(termId)) || Number(termId) <= 0)) reject('学期参数无效', 422);
  const [terms] = await conn.query(`SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND ${explicitTerm ? 'id = ?' : 'is_current = 1'} ORDER BY id DESC LIMIT 1`, explicitTerm ? [schoolId, termId] : [schoolId]);
  if (!terms.length) reject(explicitTerm ? '指定学期不存在' : '尚未配置当前学期', 404);
  termId = terms[0].id;

  // Preserve the existing cumulative-points window. A query failure is not zero points.
  const [[points]] = await conn.query('SELECT COALESCE(SUM(delta), 0) AS total_points FROM score_record WHERE student_id = ? AND school_id = ?', [targetStudentId, schoolId]);
  const currentPoints = Number(points.total_points);
  const [records] = await conn.query('SELECT id, source, delta, dimension_code, remark, created_at FROM score_record WHERE student_id = ? AND school_id = ? ORDER BY created_at DESC LIMIT 30', [targetStudentId, schoolId]);
  const timeline = records.map(r => ({ id:`score-${r.id}`, studentId:targetStudentId, type:'SCORE', eventType:r.source, title:r.delta > 0 ? `获得激励积分 +${r.delta}` : `积分冲销 ${r.delta}`, detail:r.remark || `维度: ${r.dimension_code}`, delta:r.delta, createdAt:r.created_at }));
  const [honors] = await conn.query('SELECT id, title, award_level, prize_level, status, created_at FROM honor_record WHERE student_id = ? AND school_id = ? ORDER BY created_at DESC LIMIT 20', [targetStudentId, schoolId]);
  timeline.push(...honors.map(h => ({id:`honor-${h.id}`,studentId:targetStudentId,type:'HONOR',title:`荣誉申报: ${h.title}`,detail:`级别: ${h.award_level} ${h.prize_level}`,status:h.status,delta:0,createdAt:h.created_at})));
  const [stories] = await conn.query('SELECT id, month_key, status, teacher_score, created_at FROM story_submission WHERE student_id = ? AND school_id = ? ORDER BY created_at DESC LIMIT 20', [targetStudentId, schoolId]);
  timeline.push(...stories.map(story => ({id:`story-${story.id}`,studentId:targetStudentId,type:'STORY',title:`${story.month_key} 生活故事`,detail:story.status === 'REVIEWED' ? `终审得分: ${story.teacher_score ?? '待确认'}` : story.status === 'DRAFT' ? '故事草稿' : '故事已提交，等待审核',status:story.status,delta:0,createdAt:story.created_at})));
  timeline.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const [reports] = await conn.query("SELECT snapshot_json, comprehensive_grade, version FROM term_report WHERE school_id = ? AND student_id = ? AND term_id = ? AND status = 'PUBLISHED' ORDER BY version DESC LIMIT 1", [schoolId, targetStudentId, termId]);
  let evaluation = {isPublished:false,message:'期末报告尚未正式发布'};
  let officialGrade = null;
  if (reports.length) {
    const report = reports[0];
    const snapshot = require('../services/reportSnapshot').normalizeReportSnapshot(typeof report.snapshot_json === 'string' ? JSON.parse(report.snapshot_json) : report.snapshot_json);
    evaluation = {isPublished:true,version:report.version,radarScores:snapshot.evaluation.dimensions,dimensions:snapshot.evaluation.dimensions};
    officialGrade = report.comprehensive_grade || null;
  }
  const [themes] = await conn.query('SELECT theme_id FROM student_theme_preference WHERE student_id = ?', [targetStudentId]);
  return {studentProfile:{id:student.id,name:student.real_name,studentNo:student.username,grade:student.grade,classNo:student.class_no,avatarUrl:null},termId,currentPoints,gameLevel:getGameLevel(currentPoints),officialGrade,evaluation,timeline,theme:themes[0]?.theme_id || 'default'};
}

async function setStudentTheme({ actor, themeId, connection = null }) {
  const conn = connection || db;

  if (!actor || actor.role !== 'student') {
    const err = new Error('仅学生本人可设置个性化成长主题');
    err.status = 403;
    throw err;
  }

  if (!ALLOWED_THEMES.includes(themeId)) {
    const err = new Error(`不支持的主题类型: ${themeId}，可选: ${ALLOWED_THEMES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  await conn.query(`
    INSERT INTO student_theme_preference (student_id, theme_id, updated_at)
    VALUES (?, ?, NOW())
    ON DUPLICATE KEY UPDATE theme_id = VALUES(theme_id), updated_at = NOW()
  `, [actor.id, themeId]);

  return {
    success: true,
    themeId
  };
}

async function handleGetMyGrowth(req, res) {
  try {
    const actor = req.user;
    const termId = req.query.termId ?? null;
    const studentId = req.query.studentId ? Number(req.query.studentId) : actor.id;

    const data = await getMyGrowthData({ actor, studentId, termId });
    return res.json({ code: 200, message: 'success', data });
  } catch (err) {
    return res.status(err.status || 500).json({ code: err.status || 500, message: err.message });
  }
}

async function handleSetTheme(req, res) {
  try {
    const actor = req.user;
    const { themeId } = req.body;
    const data = await setStudentTheme({ actor, themeId });
    return res.json({ code: 200, message: '主题切换成功', data });
  } catch (err) {
    return res.status(err.status || 500).json({ code: err.status || 500, message: err.message });
  }
}

module.exports = {
  getMyGrowthData,
  setStudentTheme,
  handleGetMyGrowth,
  handleSetTheme,
  getGameLevel,
  ALLOWED_THEMES
};
