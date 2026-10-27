/**
 * R08.cjs — 学科成绩导入场景
 *
 * 验证：
 * 1. checks.forgedSubjectStatus === 403 (越权教师伪造/导入未任教学科被拒绝 403)
 * 2. checks.stalePreviewStatus === 409 (过期/已提交预览批次再次提交冲突 409)
 * 3. checks.effectiveVersionCount === 1 (有效成绩版本仅保留一份，不产生重复脏数据)
 * 4. checks.zeroLost === false (有效 0 分成绩正确保留，不丢失也不误转为 NULL)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R08',
  title: '学科成绩导入',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    forgedSubjectStatus: null,
    stalePreviewStatus: null,
    effectiveVersionCount: 0,
    zeroLost: true
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
    const [students] = await conn.query("SELECT id, username, real_name, grade, class_no FROM users WHERE role = 'student' LIMIT 2");
    const student1 = students[0];
    const student2 = students.length > 1 ? students[1] : students[0];

    // 授权 teacherId 负责 student1 所在班级的 CHINESE 学科
    await conn.query(`
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, ?, ?, ?, 'CHINESE', 0)
      ON DUPLICATE KEY UPDATE subject_code = 'CHINESE'
    `, [teacherId, student1.grade, student1.class_no]);

    const subjectImportService = require('../../../backend/services/subjectImportService.js');

    // 章节 1: 越权教师或伪造未授权学科导入被拦截 403
    await s.chapter('R08-01', '越权任课教师或未授权学科上传被阻断 403', async () => {
      let caughtStatus = null;
      try {
        await subjectImportService.previewSubjectImport({
          actor: {
            id: otherTeacherId,
            schoolId: 1,
            role: 'teacher',
            classes: [{ grade: student1.grade + 1, class_no: 1 }]
          },
          termId: 1,
          grade: student1.grade,
          classNo: student1.class_no,
          subjectCode: 'CHINESE',
          rows: [
            { studentNo: student1.username, score: '95' }
          ]
        }, conn);
      } catch (err) {
        caughtStatus = err.statusCode || err.status || 500;
      }

      checks.forgedSubjectStatus = caughtStatus;
      assert.equal(checks.forgedSubjectStatus, 403, '越权教师导入未授权学科必须返回 403');
    });

    // 章节 2: 授权教师上传并预览学科成绩（包含有效0分）
    let previewBatchId = null;
    await s.chapter('R08-02', '授权教师预览导入，比对差异且有效0分不丢失', async () => {
      const preview = await subjectImportService.previewSubjectImport({
        actor: {
          id: teacherId,
          schoolId: 1,
          role: 'teacher',
          classes: [{ grade: student1.grade, class_no: student1.class_no }]
        },
        termId: 1,
        grade: student1.grade,
        classNo: student1.class_no,
        subjectCode: 'CHINESE',
        rows: [
          { studentNo: student1.username, score: '0' },
          { studentNo: student2.username, score: '88.5' }
        ]
      }, conn);

      assert.ok(preview.batchId, '应生成服务器批次 ID');
      assert.equal(preview.validCount >= 1, true);
      previewBatchId = preview.batchId;
    });

    // 章节 3: 正式提交入库，推进 C2 版本，校验有效0分正确保留
    await s.chapter('R08-03', '确认提交，原子更新学科成绩与来源版本', async () => {
      const commitRes = await subjectImportService.commitSubjectImport({
        actor: {
          id: teacherId,
          schoolId: 1,
          role: 'teacher',
          classes: [{ grade: student1.grade, class_no: student1.class_no }]
        },
        batchId: previewBatchId,
        requestKey: 'COMMIT_' + previewBatchId
      }, conn);

      assert.ok(commitRes.success);

      // 查询数据库检验成绩与0分保留
      const [scores] = await conn.query(
        "SELECT student_id, score, raw_score FROM subject_score WHERE school_id = 1 AND term_id = 1 AND subject_code = 'CHINESE' AND student_id = ?",
        [student1.id]
      );
      assert.equal(scores.length, 1);
      checks.effectiveVersionCount = scores.length;
      assert.equal(checks.effectiveVersionCount, 1);

      // 验证有效 0 分未丢失
      const isZeroLost = (scores[0].score === null || scores[0].raw_score === '' || scores[0].raw_score === null);
      checks.zeroLost = isZeroLost;
      assert.equal(checks.zeroLost, false, '有效 0 分不得丢失');
      assert.equal(Number(scores[0].score), 0);
      assert.equal(Number(scores[0].raw_score), 0);
    });

    // 章节 4: 已提交/过期批次再次提交，返回 409 冲突
    await s.chapter('R08-04', '过期/重复批次提交返回 409', async () => {
      let staleStatus = null;
      try {
        await subjectImportService.commitSubjectImport({
          actor: {
            id: teacherId,
            schoolId: 1,
            role: 'teacher',
            classes: [{ grade: student1.grade, class_no: student1.class_no }]
          },
          batchId: previewBatchId,
          requestKey: 'COMMIT_REPEAT_' + previewBatchId
        }, conn);
      } catch (err) {
        staleStatus = err.statusCode || err.status || 500;
      }

      checks.stalePreviewStatus = staleStatus;
      assert.equal(checks.stalePreviewStatus, 409, '已提交批次再次提交必须拦截 409');
    });

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
