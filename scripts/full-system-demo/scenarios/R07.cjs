/**
 * R07.cjs — 年级指标与教师评价场景
 *
 * 验证：
 * 1. checks.rawStars === '★★★' (教师评定星级保留原始原值 '★★★')
 * 2. checks.gradeRawNumericValue === null (等级 A 不会被偷偷转成数值百分分，rawValue 为 'A'，typedValue 为 'A'，numericValue 为 null)
 * 3. checks.recordedZeroIsMissing === false (有效 0 分 status 为 RECORDED，不当作 MISSING 缺失)
 * 4. checks.nonApplicableBlocks === false (NOT_APPLICABLE / EXEMPT 免测不阻塞学生评定)
 * 5. checks.teacherScopeEnforced === true (越权跨班教师打分被 403 阻断)
 * 6. checks.sourceRevisionIncremented === true (打分走 C2 推进 student_term_state 的 source_revision)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R07',
  title: '年级指标与教师评价',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    gradeIndicatorsConfigured: false,
    rawStars: null,
    gradeRawNumericValue: 'INIT',
    recordedZeroIsMissing: true,
    nonApplicableBlocks: true,
    teacherScopeEnforced: false,
    sourceRevisionIncremented: false
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
    const [teachers] = await conn.query("SELECT id FROM users WHERE role = 'teacher' LIMIT 2");
    const teacherId = teachers[0].id;
    const otherTeacherId = teachers.length > 1 ? teachers[1].id : 999;
    const [students] = await conn.query("SELECT id, grade, class_no FROM users WHERE role = 'student' LIMIT 1");
    const student = students[0];

    // 授权 teacherId 负责该学生所在班级
    await conn.query(`
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, ?, ?, ?, 'CHINESE', 1)
      ON DUPLICATE KEY UPDATE is_head_teacher = 1
    `, [teacherId, student.grade, student.class_no]);

    const reportIndicatorController = require('../../../backend/controllers/reportIndicatorController.js');

    // 章节 1: 管理员按年级和学校配置指标字典
    let indicatorIds = {};
    await s.chapter('R07-01', '管理员配置适用年级指标字典（涵盖star/grade/number/text）', async () => {
      const configureReq = {
        conn,
        user: { id: 1, schoolId: 1, role: 'admin' },
        body: {
          grade: student.grade,
          termId: 1,
          indicators: [
            { indicatorCode: 'READ_STAR', indicatorName: '阅读习惯', dimension: 'Z', valueType: 'star', unit: '星', isRequired: 1 },
            { indicatorCode: 'LISTEN_GRADE', indicatorName: '倾听表现', dimension: 'D', valueType: 'grade', unit: '等', isRequired: 1 },
            { indicatorCode: 'ROPE_SKIPPING', indicatorName: '跳绳次数', dimension: 'T', valueType: 'number', unit: '次', isRequired: 0 },
            { indicatorCode: 'SPECIAL_TALENT', indicatorName: '特长展示', dimension: 'M', valueType: 'text', unit: '', isRequired: 0 }
          ]
        }
      };

      let configResData = null;
      const res = {
        status(code) { this.statusCode = code; return this; },
        json(data) { configResData = data; return this; }
      };

      await reportIndicatorController.configureGradeIndicators(configureReq, res, (err) => {
        if (err) throw err;
      });

      assert.equal(res.statusCode, 200);
      assert.ok(configResData.data && configResData.data.length >= 4);
      checks.gradeIndicatorsConfigured = true;

      for (const item of configResData.data) {
        indicatorIds[item.indicator_code || item.indicatorCode] = item.id;
      }
    });

    // 章节 2: 授权教师录入指标评价（原始值、类型化结果、状态与非转换验证）
    await s.chapter('R07-02', '教师录入星级/等级/数值/免测，验证原值保留与状态区分', async () => {
      // 查询更新前学期来源版本
      const [beforeState] = await conn.query(
        "SELECT source_revision FROM student_term_state WHERE student_id = ? AND term_id = 1",
        [student.id]
      );
      const revBefore = beforeState[0]?.source_revision || 0;

      const evalReq = {
        conn,
        user: {
          id: teacherId,
          schoolId: 1,
          role: 'teacher',
          classes: [{ grade: student.grade, class_no: student.class_no }]
        },
        params: { studentId: String(student.id) },
        body: {
          termId: 1,
          values: [
            {
              indicatorCode: 'READ_STAR',
              valueType: 'star',
              rawValue: '★★★',
              status: 'RECORDED'
            },
            {
              indicatorCode: 'LISTEN_GRADE',
              valueType: 'grade',
              rawValue: 'A',
              status: 'RECORDED'
            },
            {
              indicatorCode: 'ROPE_SKIPPING',
              valueType: 'number',
              rawValue: '0',
              status: 'RECORDED'
            },
            {
              indicatorCode: 'SPECIAL_TALENT',
              valueType: 'text',
              rawValue: '',
              status: 'NOT_APPLICABLE'
            }
          ]
        }
      };

      let evalResData = null;
      const res = {
        status(code) { this.statusCode = code; return this; },
        json(data) { evalResData = data; return this; }
      };

      await reportIndicatorController.saveStudentIndicatorValues(evalReq, res, (err) => {
        if (err) throw err;
      });

      assert.equal(res.statusCode, 200);

      // 查询数据库持久化记录
      const [savedRows] = await conn.query(
        "SELECT * FROM student_indicator_value WHERE student_id = ? AND term_id = 1",
        [student.id]
      );

      const starRow = savedRows.find(r => r.indicator_code === 'READ_STAR');
      const gradeRow = savedRows.find(r => r.indicator_code === 'LISTEN_GRADE');
      const zeroRow = savedRows.find(r => r.indicator_code === 'ROPE_SKIPPING');
      const naRow = savedRows.find(r => r.indicator_code === 'SPECIAL_TALENT');

      assert.ok(starRow, 'starRow 应存在');
      assert.ok(gradeRow, 'gradeRow 应存在');
      assert.ok(zeroRow, 'zeroRow 应存在');
      assert.ok(naRow, 'naRow 应存在');

      // 1. checks.rawStars === '★★★'
      checks.rawStars = starRow.raw_value;
      assert.equal(checks.rawStars, '★★★');

      // 2. checks.gradeRawNumericValue === null
      // 严格验证：未配置规则时，系统不得擅自将 A 转换映射为百分分（如 90 或 95）
      checks.gradeRawNumericValue = gradeRow.numeric_value ?? null;
      assert.equal(checks.gradeRawNumericValue, null);

      // 3. checks.recordedZeroIsMissing === false
      // 有效0分必须是 RECORDED，不能被判定为 MISSING
      checks.recordedZeroIsMissing = (zeroRow.status === 'MISSING' || zeroRow.raw_value === null);
      assert.equal(checks.recordedZeroIsMissing, false);
      assert.equal(zeroRow.status, 'RECORDED');
      assert.equal(zeroRow.raw_value, '0');

      // 4. checks.nonApplicableBlocks === false
      // NOT_APPLICABLE 不阻塞
      checks.nonApplicableBlocks = (naRow.status === 'MISSING');
      assert.equal(checks.nonApplicableBlocks, false);
      assert.equal(naRow.status, 'NOT_APPLICABLE');

      // 5. C2 来源版本递增检查
      const [afterState] = await conn.query(
        "SELECT source_revision FROM student_term_state WHERE student_id = ? AND term_id = 1",
        [student.id]
      );
      const revAfter = afterState[0]?.source_revision || 0;
      checks.sourceRevisionIncremented = revAfter > revBefore;
      assert.ok(checks.sourceRevisionIncremented);
    });

    // 章节 3: 越权访问控制
    await s.chapter('R07-03', '越权教师跨班打分被拒绝 403', async () => {
      const unauthorizedReq = {
        conn,
        user: {
          id: otherTeacherId,
          schoolId: 1,
          role: 'teacher',
          classes: [{ grade: student.grade + 1, class_no: student.class_no + 1 }]
        },
        params: { studentId: String(student.id) },
        body: {
          termId: 1,
          values: [{ indicatorCode: 'READ_STAR', valueType: 'star', rawValue: '★★★★', status: 'RECORDED' }]
        }
      };

      let rejected403 = false;
      const res = {
        status(code) { this.statusCode = code; return this; },
        json(data) { return this; }
      };

      try {
        await reportIndicatorController.saveStudentIndicatorValues(unauthorizedReq, res, (err) => {
          if (err && (err.statusCode === 403 || err.status === 403)) {
            rejected403 = true;
          }
        });
        if (res.statusCode === 403) rejected403 = true;
      } catch (err) {
        if (err.statusCode === 403 || err.status === 403) rejected403 = true;
      }

      checks.teacherScopeEnforced = rejected403;
      assert.equal(checks.teacherScopeEnforced, true, '越权教师必须被拒绝 403');
    });

    // 章节 4: 管理员仅能看指标完成进度统计，不能越权读取学生个人的过程评价值
    await s.chapter('R07-04', '管理员获取完成状态进度，不越权直查个人评价值', async () => {
      const progressReq = {
        conn,
        user: { id: 1, schoolId: 1, role: 'admin' },
        query: { grade: String(student.grade), termId: '1' }
      };

      let progressData = null;
      const res = {
        status(code) { this.statusCode = code; return this; },
        json(data) { progressData = data; return this; }
      };

      await reportIndicatorController.getGradeIndicatorProgress(progressReq, res, (err) => {
        if (err) throw err;
      });

      assert.equal(res.statusCode, 200);
      assert.ok(progressData.data);
      assert.ok(progressData.data.totalStudents >= 1);
      assert.ok(typeof progressData.data.completionRate === 'number');
    });

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
