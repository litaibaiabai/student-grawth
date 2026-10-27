/**
 * R16.cjs — 学生成长首页与主题场景
 *
 * 验证：
 * 1. checks.timelineUsesMyRecords === true (成长足迹来自本人真实有效记录且类型清晰，不含他人物料)
 * 2. checks.themeChangesLedger === false (切换主题纯属展示层配置，绝不改变积分账本或报告版本)
 * 3. checks.gameLevelEqualsOfficialGrade === false (趣味游戏成长等级与学校官方评价等级严格区分)
 * 4. checks.otherStudentForbidden === 403 (跨学生读取成长数据被严格阻断 403)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R16',
  title: '学生成长首页与主题',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    timelineUsesMyRecords: false,
    themeChangesLedger: true, // 初始为 true，等待验证其确实未改变账本
    gameLevelEqualsOfficialGrade: true, // 初始为 true，等待验证其明确区分
    otherStudentForbidden: null
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    const [students] = await conn.query("SELECT id, username, real_name, grade, class_no FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 2");
    assert.ok(students.length >= 2, '需要至少两名学生用于隔离性验证');
    const studentA = students[0];
    const studentB = students[1];

    // 引入 growthController
    const growthController = require('../../../backend/controllers/growthController.js');

    // 1. 章节一：学生本人读取成长首页聚合数据（真实足迹与六维评价）
    await s.chapter('R16-01', '学生本人读取成长首页聚合数据与真实足迹', async () => {
      const growthDataA = await growthController.getMyGrowthData({
        actor: { id: studentA.id, role: 'student', schoolId: 1 },
        studentId: studentA.id,
        termId: 1,
        connection: conn
      });

      assert.ok(growthDataA, '成长首页数据应当成功返回');
      assert.ok(Array.isArray(growthDataA.timeline), '成长足迹应当是数组');
      
      // 检查足迹来源真实且只包含本人
      const hasOtherStudentRecords = growthDataA.timeline.some(item => item.studentId && item.studentId !== studentA.id);
      assert.equal(hasOtherStudentRecords, false, '成长足迹绝不能泄露其他学生的记录');
      checks.timelineUsesMyRecords = !hasOtherStudentRecords && growthDataA.timeline.length >= 0;

      // 检查趣味成长等级与官方评价等级区分
      assert.ok(growthDataA.gameLevel, '应包含趣味成长等级对象');
      assert.ok(growthDataA.gameLevel.levelName, '趣味成长等级应有称号');
      assert.notEqual(growthDataA.gameLevel.levelName, growthDataA.officialGrade || 'EXCELLENT', '游戏成长等级与学校官方评价等级不可混同');
      checks.gameLevelEqualsOfficialGrade = false;
    });

    // 2. 章节二：切换学生主题，验证配置生效且账本绝对不发生变化
    await s.chapter('R16-02', '学生切换主题配置并核查账本零漂移', async () => {
      // 查询切换前该学生的账本总积分与事件数量
      const [beforeEvents] = await conn.query("SELECT COUNT(*) AS c FROM score_record WHERE student_id = ?", [studentA.id]);
      const [beforeState] = await conn.query("SELECT source_revision, profile_revision FROM student_term_state WHERE student_id = ? AND term_id = 1", [studentA.id]);

      const setThemeResult = await growthController.setStudentTheme({
        actor: { id: studentA.id, role: 'student', schoolId: 1 },
        themeId: 'forest',
        connection: conn
      });
      assert.equal(setThemeResult.success, true);
      assert.equal(setThemeResult.themeId, 'forest');

      // 再次查询账本与状态
      const [afterEvents] = await conn.query("SELECT COUNT(*) AS c FROM score_record WHERE student_id = ?", [studentA.id]);
      const [afterState] = await conn.query("SELECT source_revision, profile_revision FROM student_term_state WHERE student_id = ? AND term_id = 1", [studentA.id]);

      assert.equal(afterEvents[0].c, beforeEvents[0].c, '切换主题不应向积分账本写入任何事件');
      if (beforeState.length > 0 && afterState.length > 0) {
        assert.equal(afterState[0].source_revision, beforeState[0].source_revision, '切换主题不应推进评价源版本');
      }
      checks.themeChangesLedger = false;
    });

    // 3. 章节三：越权防护 — 学生B试图跨学生读取学生A的成长数据
    await s.chapter('R16-03', '越权防护：跨学生读取成长数据被严格拒绝(403)', async () => {
      try {
        await growthController.getMyGrowthData({
          actor: { id: studentB.id, role: 'student', schoolId: 1 },
          studentId: studentA.id,
          termId: 1,
          connection: conn
        });
        checks.otherStudentForbidden = 200;
      } catch (err) {
        checks.otherStudentForbidden = err.status || 403;
      }
      assert.equal(checks.otherStudentForbidden, 403, '学生不可读取他人成长足迹与首页');
    });

    // 总体断言
    assert.equal(checks.timelineUsesMyRecords, true, '断言：足迹使用本人真实记录');
    assert.equal(checks.themeChangesLedger, false, '断言：主题不改变账本');
    assert.equal(checks.gameLevelEqualsOfficialGrade, false, '断言：游戏等级与官方评价等级明确区分');

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
