/**
 * R09.cjs — 体测与健康导入场景
 *
 * 验证：
 * 1. checks.heightUnit === 'cm' (身高单位规范保留为 cm)
 * 2. checks.managerCanReadHealth === false (教务/管理员不能越权读取个人健康隐私数据，仅看准备状态)
 * 3. checks.healthConvertedToReward === false (体测与健康数据绝对不与奖惩流水或日常积分混算)
 * 4. checks.healthImportCommitted === true (授权体育教师/班主任成功导入体测数据)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R09',
  title: '体测与健康导入',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    heightUnit: null,
    managerCanReadHealth: true,
    healthConvertedToReward: true,
    healthImportCommitted: false
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    // 动态获取学生和体育教师
    const [teachers] = await conn.query("SELECT id FROM users WHERE role = 'teacher' LIMIT 2");
    const peTeacherId = teachers[0].id;
    const [students] = await conn.query("SELECT id, username, real_name, grade, class_no FROM users WHERE role = 'student' LIMIT 1");
    const student = students[0];

    // 授权 peTeacherId 负责该学生所在班级体育健康
    await conn.query(`
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, ?, ?, ?, 'PHYSICAL', 1)
      ON DUPLICATE KEY UPDATE subject_code = 'PHYSICAL'
    `, [peTeacherId, student.grade, student.class_no]);

    const healthImportService = require('../../../backend/services/healthImportService.js');

    // 章节 1: 授权人员导入体测健康数据
    let batchId = null;
    await s.chapter('R09-01', '授权体育教师预览并提交体测数据', async () => {
      const preview = await healthImportService.previewHealthImport({
        actor: {
          id: peTeacherId,
          schoolId: 1,
          role: 'teacher',
          classes: [{ grade: student.grade, class_no: student.class_no }]
        },
        termId: 1,
        items: [
          {
            studentNo: student.username,
            height: '142.5',
            weight: '36.0',
            vitalCapacity: '2100',
            leftVision: '5.0',
            rightVision: '4.9',
            fiftyRun: '8.8',
            sitAndReach: '14.5',
            status: 'NORMAL'
          }
        ]
      }, conn);

      assert.ok(preview.batchId);
      assert.equal(preview.validCount, 1);
      batchId = preview.batchId;

      const commitRes = await healthImportService.commitHealthImport({
        actor: {
          id: peTeacherId,
          schoolId: 1,
          role: 'teacher',
          classes: [{ grade: student.grade, class_no: student.class_no }]
        },
        batchId,
        requestKey: 'HEALTH_' + batchId
      }, conn);

      assert.ok(commitRes.success);
      checks.healthImportCommitted = true;
    });

    // 章节 2: 验证原值与单位留存
    await s.chapter('R09-02', '验证体测身高单位cm及隐私字段留痕', async () => {
      const record = await healthImportService.getStudentHealthRecord({
        actor: {
          id: peTeacherId,
          schoolId: 1,
          role: 'teacher',
          classes: [{ grade: student.grade, class_no: student.class_no }]
        },
        studentId: student.id,
        termId: 1
      }, conn);

      assert.ok(record, '体测记录应成功持久化');
      checks.heightUnit = record.height_unit || record.heightUnit;
      assert.equal(checks.heightUnit, 'cm');
      assert.equal(Number(record.height), 142.5);
    });

    // 章节 3: 管理员只能看准备状态，禁止越权读取学生体测明细
    await s.chapter('R09-03', '管理员禁止越权读取健康体测明细（403）', async () => {
      let adminCanRead = true;
      try {
        await healthImportService.getStudentHealthRecord({
          actor: { id: 1, schoolId: 1, role: 'manager' }, // 管理员
          studentId: student.id,
          termId: 1
        }, conn);
      } catch (err) {
        if (err.statusCode === 403 || err.status === 403) {
          adminCanRead = false;
        }
      }

      checks.managerCanReadHealth = adminCanRead;
      assert.equal(checks.managerCanReadHealth, false, '管理员严禁直接读取学生个人体测隐私明细');

      // 管理员可查看全局准备状态与进度
      const progress = await healthImportService.getHealthImportStatus({
        actor: { id: 1, schoolId: 1, role: 'manager' },
        termId: 1
      }, conn);
      assert.ok(progress.totalStudents >= 1);
      assert.ok(progress.completedCount >= 1);
    });

    // 章节 4: 绝不将体测与健康数据自动转化为日常奖惩积分
    await s.chapter('R09-04', '体测健康数据与日常奖惩账本保持物理隔离', async () => {
      const [rewardRows] = await conn.query(
        "SELECT * FROM score_record WHERE student_id = ? AND source = 'HEALTH'",
        [student.id]
      );
      checks.healthConvertedToReward = (rewardRows.length > 0);
      assert.equal(checks.healthConvertedToReward, false, '体测数据严禁转为加分流水');
    });

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
