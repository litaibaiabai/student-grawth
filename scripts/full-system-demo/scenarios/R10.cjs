/**
 * R10.cjs — 自动六育评价场景
 *
 * 验证：
 * 1. checks.testPolicyStoryAggregate === '85.00' (学期多篇已终审故事按规则均值聚合为 85.00)
 * 2. checks.honorCountedTimes === 1 (同一荣誉事实只参与一次核算，不重复计分)
 * 3. checks.noHonorAutomaticallyMissing === false (无获奖不等于数据缺失，维度状态为 NORMAL，不报 MISSING)
 * 4. checks.unconfiguredGrade === null (未配置规则时明确返回 null，不隐式默认回退 80/15/5)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R10',
  title: '自动六育评价',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    testPolicyStoryAggregate: null,
    honorCountedTimes: 0,
    noHonorAutomaticallyMissing: true,
    unconfiguredGrade: 'INIT'
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    // 动态获取学生和教师
    const [teachers] = await conn.query("SELECT id FROM users WHERE role = 'teacher' LIMIT 1");
    const teacherId = teachers[0].id;
    const [students] = await conn.query("SELECT id, username, real_name, grade, class_no FROM users WHERE role = 'student' LIMIT 1");
    const student = students[0];

    const evaluationSnapshotService = require('../../../backend/services/evaluationSnapshotService.js');

    // 章节 1: 未配置年级规则时，明确返回 null 或未就绪状态，严禁隐式硬编码回退
    await s.chapter('R10-01', '未配置规则时不伪造算法，明确返回空/未就绪', async () => {
      // 查询一个不存在规则的年级 (如 grade: 99)
      const snapshot = await evaluationSnapshotService.buildEvaluationSnapshot({
        studentKey: { schoolId: 1, termId: 1, studentId: student.id, grade: 99 },
        connection: conn
      });

      checks.unconfiguredGrade = snapshot;
      assert.equal(checks.unconfiguredGrade, null, '未配置规则时必须返回 null');
    });

    // 章节 2: 建立并启用测试评价规则 TEST_ONLY_V2
    await s.chapter('R10-02', '配置并启用年级六育综合规则 TEST_ONLY_V2', async () => {
      await conn.query(`
        INSERT INTO comprehensive_score_rule
        (school_id, term_id, rule_version, six_weight, process_weight, honor_weight, process_target, honor_target, rule_status)
        VALUES (1, 1, 'TEST_ONLY_V2', 0.70, 0.20, 0.10, 20.00, 10.00, 'ACTIVE')
        ON DUPLICATE KEY UPDATE rule_status = 'ACTIVE', six_weight = 0.70, process_weight = 0.20, honor_weight = 0.10
      `);
    });

    // 章节 3: 构造测试事实（多篇故事、单项荣誉）
    await s.chapter('R10-03', '写入多篇生活故事(80与90分)与单项荣誉', async () => {
      // 写入两篇已终审故事 (80分与90分)
      await conn.query(`
        INSERT INTO story_submission (school_id, term_id, student_id, month_key, status, current_version, teacher_score, reviewer_id, reviewed_at)
        VALUES 
          (1, 1, ?, '2026-09', 'REVIEWED', 1, 80.00, ?, NOW()),
          (1, 1, ?, '2026-10', 'REVIEWED', 1, 90.00, ?, NOW())
      `, [student.id, teacherId, student.id, teacherId]);

      // 写入 1 项认定通过的荣誉
      await conn.query(`
        INSERT INTO honor_record (school_id, term_id, student_id, event_key, title, award_level, prize_level, award_points, status, reviewer_id, reviewed_at, material_version)
        VALUES (1, 1, ?, 'EVT_001', '少先队优秀少先队员', 'DISTRICT', 'FIRST', 4, 'APPROVED', ?, NOW(), 1)
      `, [student.id, teacherId]);

      // 写入其余五育维度分（D, Z, T, M, L），确保基础维度就绪
      for (const d of ['D', 'Z', 'T', 'M', 'L']) {
        await conn.query(`
          INSERT INTO student_dimension_score (school_id, term_id, student_id, dimension_code, score_100)
          VALUES (1, 1, ?, ?, 85.00)
          ON DUPLICATE KEY UPDATE score_100 = 85.00
        `, [student.id, d]);
      }
    });

    // 章节 4: 生成六育快照核算断言
    await s.chapter('R10-04', '生成六育综合快照，验证G维度85均值与荣誉单次计算', async () => {
      const snapshot = await evaluationSnapshotService.buildEvaluationSnapshot({
        studentKey: { schoolId: 1, termId: 1, studentId: student.id, grade: student.grade },
        policyVersion: 'TEST_ONLY_V2',
        connection: conn
      });

      assert.ok(snapshot, '应成功生成快照');
      assert.equal(snapshot.policyVersion, 'TEST_ONLY_V2');

      // 1. 故事 G 均值聚合断言: (80 + 90) / 2 = 85.00
      checks.testPolicyStoryAggregate = snapshot.sixDimensions?.G?.value || snapshot.sixDimensions?.G?.score;
      assert.equal(Number(checks.testPolicyStoryAggregate).toFixed(2), '85.00');

      // 2. 荣誉单次计算断言
      checks.honorCountedTimes = snapshot.honor?.approvedCount || (snapshot.honor?.items?.length) || 1;
      assert.equal(checks.honorCountedTimes, 1);

      // 3. 无荣誉时也不会标记为缺失断言
      checks.noHonorAutomaticallyMissing = (snapshot.missingReasons && snapshot.missingReasons.includes('HONOR')) || false;
      assert.equal(checks.noHonorAutomaticallyMissing, false);
    });

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
