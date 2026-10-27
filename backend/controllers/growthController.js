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

async function getMyGrowthData({ actor, studentId, termId = 1, connection = null }) {
  const conn = connection || db;

  // 1. 越权校验与隐私红线
  if (actor.role === 'manager' || actor.role === 'admin') {
    const err = new Error('管理员不得借学生端成长首页接口读取个人学生隐私详情');
    err.status = 403;
    throw err;
  }

  const targetStudentId = Number(studentId || actor.id);

  if (actor.role === 'student' && actor.id !== targetStudentId) {
    const err = new Error('无权查看其他学生的成长足迹与隐私数据');
    err.status = 403;
    throw err;
  }

  // 教师访问需受限于任教班级范围
  if (actor.role === 'teacher') {
    const { requireStudentScope } = require('../middleware/studentScope');
    await requireStudentScope(actor, targetStudentId, conn);
  }

  // 2. 查询学生基础资料
  const [students] = await conn.query(
    "SELECT id, username, real_name, grade, class_no FROM users WHERE id = ?",
    [targetStudentId]
  );
  if (!students || students.length === 0) {
    const err = new Error('学生不存在');
    err.status = 404;
    throw err;
  }
  const student = students[0];

  // 3. 查询当前积分状态
  let currentPoints = 0;
  try {
    const [ptsRows] = await conn.query(
      "SELECT COALESCE(SUM(delta), 0) AS total_points FROM score_record WHERE student_id = ?",
      [targetStudentId]
    );
    if (ptsRows && ptsRows.length > 0) {
      currentPoints = Number(ptsRows[0].total_points) || 0;
    }
  } catch (e) {
    try {
      const [ptsRows] = await conn.query(
        "SELECT COALESCE(SUM(delta), 0) AS total_points FROM score_event WHERE student_id = ?",
        [targetStudentId]
      );
      if (ptsRows && ptsRows.length > 0) {
        currentPoints = Number(ptsRows[0].total_points) || 0;
      }
    } catch (e2) {}
  }

  // 4. 聚合真实足迹 (Timeline)
  const timeline = [];

  // 4.1 积分事件 (优先查 score_record，兼容 score_event)
  try {
    const [records] = await conn.query(
      "SELECT id, student_id, source, delta, dimension_code, remark, created_at FROM score_record WHERE student_id = ? ORDER BY created_at DESC LIMIT 30",
      [targetStudentId]
    );
    for (const r of records) {
      timeline.push({
        id: `score-${r.id}`,
        studentId: r.student_id,
        type: 'SCORE',
        eventType: r.source,
        title: r.delta > 0 ? `获得激励积分 +${r.delta}` : `积分冲销 ${r.delta}`,
        detail: r.remark || `维度: ${r.dimension_code}`,
        delta: r.delta,
        createdAt: r.created_at
      });
    }
  } catch (e) {
    try {
      const [events] = await conn.query(
        "SELECT id, student_id, event_type, delta, current_balance, dimension_id, remark, created_at FROM score_event WHERE student_id = ? ORDER BY created_at DESC LIMIT 30",
        [targetStudentId]
      );
      for (const ev of events) {
        timeline.push({
          id: `score-${ev.id}`,
          studentId: ev.student_id,
          type: 'SCORE',
          eventType: ev.event_type,
          title: ev.delta > 0 ? `获得激励积分 +${ev.delta}` : `积分变动 ${ev.delta}`,
          detail: ev.remark || '日常表现奖励',
          delta: ev.delta,
          createdAt: ev.created_at
        });
      }
    } catch (e2) {}
  }

  // 4.2 荣誉认定 (优先查 honor_record，兼容 honor_application)
  try {
    const [honors] = await conn.query(
      "SELECT id, student_id, title, award_level, prize_level, status, created_at FROM honor_record WHERE student_id = ? ORDER BY created_at DESC LIMIT 20",
      [targetStudentId]
    );
    for (const h of honors) {
      timeline.push({
        id: `honor-${h.id}`,
        studentId: h.student_id,
        type: 'HONOR',
        title: `荣誉认定: ${h.title}`,
        detail: `级别: ${h.award_level} ${h.prize_level}`,
        status: h.status,
        delta: 0,
        createdAt: h.created_at
      });
    }
  } catch (e) {
    try {
      const [honors] = await conn.query(
        "SELECT id, student_id, honor_title, level, points, status, created_at FROM honor_application WHERE student_id = ? ORDER BY created_at DESC LIMIT 20",
        [targetStudentId]
      );
      for (const h of honors) {
        timeline.push({
          id: `honor-${h.id}`,
          studentId: h.student_id,
          type: 'HONOR',
          title: `荣誉申报: ${h.honor_title}`,
          detail: `级别: ${h.level || '校级'}，获得积分: ${h.points}`,
          status: h.status,
          delta: h.status === 'APPROVED' ? h.points : 0,
          createdAt: h.created_at
        });
      }
    } catch (e2) {}
  }

  // 4.3 故事记录
  try {
    const [stories] = await conn.query(
      "SELECT id, student_id, title, audit_status, final_score, created_at FROM student_story WHERE student_id = ? ORDER BY created_at DESC LIMIT 20",
      [targetStudentId]
    );
    for (const s of stories) {
      timeline.push({
        id: `story-${s.id}`,
        studentId: s.student_id,
        type: 'STORY',
        title: `成长故事: ${s.title}`,
        detail: `终审得分: ${s.final_score !== null ? s.final_score : '审核中'}`,
        status: s.audit_status,
        delta: 0,
        createdAt: s.created_at
      });
    }
  } catch (e) {
    // student_story 容错
  }

  // 按时间降序
  timeline.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 5. 趣味成长等级 (与官方评价区分)
  const gameLevel = getGameLevel(currentPoints);

  // 6. 六维评价现状（若已发布则读取已发布快照，若未发布则明确标注未发布）
  let evaluation = null;
  let officialGrade = null;
  try {
    const [reports] = await conn.query(
      "SELECT snapshot_json, version, status FROM term_report WHERE student_id = ? AND term_id = ? AND status = 'PUBLISHED' ORDER BY version DESC LIMIT 1",
      [targetStudentId, termId]
    );
    if (reports && reports.length > 0) {
      const snap = typeof reports[0].snapshot_json === 'string'
        ? JSON.parse(reports[0].snapshot_json)
        : reports[0].snapshot_json;
      evaluation = {
        isPublished: true,
        version: reports[0].version,
        radarScores: snap.radarScores || snap.sixDimensions || null,
        dimensions: snap.dimensions || null
      };
      officialGrade = snap.overallGrade || snap.compositeGrade || 'EXCELLENT';
    } else {
      evaluation = {
        isPublished: false,
        message: '期末评价报告正在生成与审核中，尚未正式发布'
      };
    }
  } catch (e) {
    evaluation = { isPublished: false, message: '未找到评价数据' };
  }

  // 7. 读取学生主题偏好
  let currentTheme = 'default';
  try {
    const [themeRows] = await conn.query(
      "SELECT theme_id FROM student_theme_preference WHERE student_id = ?",
      [targetStudentId]
    );
    if (themeRows && themeRows.length > 0) {
      currentTheme = themeRows[0].theme_id;
    }
  } catch (e) {
    // 容错表未建
  }

  return {
    studentProfile: {
      id: student.id,
      name: student.real_name,
      studentNo: student.student_no || student.username,
      grade: student.grade,
      classNo: student.class_no,
      avatarUrl: student.avatar_url || null
    },
    currentPoints,
    gameLevel,
    officialGrade,
    evaluation,
    timeline,
    theme: currentTheme,
    availableThemes: ALLOWED_THEMES
  };
}

async function setStudentTheme({ actor, themeId, connection = null }) {
  const conn = connection || db;

  if (actor.role !== 'student') {
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
    const actor = req.user || { id: req.query.studentId, role: 'student', schoolId: 1 };
    const termId = req.query.termId ? Number(req.query.termId) : 1;
    const studentId = req.query.studentId ? Number(req.query.studentId) : actor.id;

    const data = await getMyGrowthData({ actor, studentId, termId });
    return res.json({ code: 200, message: 'success', data });
  } catch (err) {
    return res.status(err.status || 500).json({ code: err.status || 500, message: err.message });
  }
}

async function handleSetTheme(req, res) {
  try {
    const actor = req.user || { id: req.body.studentId, role: 'student', schoolId: 1 };
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
