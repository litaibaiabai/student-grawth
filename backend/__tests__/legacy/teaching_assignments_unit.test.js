const { test } = require('node:test');
const assert = require('node:assert/strict');
const teachingAssignments = require('../controllers/teachingAssignmentController');
const { pool } = require('../db');

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

test('teachingAssignmentController: saveTeachingAssignment 兼容 snake_case 与 "1班" 字符串', async (t) => {
  // 备份原 pool.query
  const originalQuery = pool.query;
  let executedSql = [];
  let executedParams = [];

  pool.query = async (sql, params) => {
    executedSql.push(sql);
    executedParams.push(params);
    if (sql.includes('academic_year')) {
      return [[{ id: 2 }]];
    }
    if (sql.includes('SELECT id FROM users')) {
      return [[{ id: 10 }]];
    }
    if (sql.includes('INSERT INTO teacher_teaching_assignment')) {
      return [{ insertId: 100 }];
    }
    return [[]];
  };

  t.after(() => {
    pool.query = originalQuery;
  });

  const req = {
    user: { schoolId: 1 },
    body: {
      term_id: 2,
      teacher_id: 10,
      grade: 3,
      class_name: "2班",
      subject: "MATH",
      is_head_teacher: 1
    }
  };
  const res = createMockRes();

  await teachingAssignments.saveTeachingAssignment(req, res, (err) => {
    assert.fail(err);
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.code, 200);

  // 验证写入的 params 中 classNo 为数字 2，而不是 "2班"
  const insertIndex = executedSql.findIndex(s => s.includes('INSERT INTO teacher_teaching_assignment'));
  assert.ok(insertIndex >= 0, '必须执行 INSERT INTO teacher_teaching_assignment');
  const insertParams = executedParams[insertIndex];
  // [schoolId, resolvedTermId, teacherId, grade, classNo, subjectCode, isHeadTeacher]
  assert.equal(insertParams[0], 1); // schoolId
  assert.equal(insertParams[1], 2); // termId
  assert.equal(insertParams[2], 10); // teacherId
  assert.equal(insertParams[3], 3); // grade
  assert.equal(insertParams[4], 2); // classNo 必须为数字 2
  assert.equal(insertParams[5], 'MATH'); // subjectCode
  assert.equal(insertParams[6], 1); // isHeadTeacher
});

test('teachingAssignmentController: saveTeachingAssignment 缺少参数返回 422', async (t) => {
  const req = {
    user: { schoolId: 1 },
    body: {}
  };
  const res = createMockRes();
  await teachingAssignments.saveTeachingAssignment(req, res, () => {});
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 422);
});

test('teachingAssignmentController: getTeachingAssignments 响应格式具备列表与兼容字段', async (t) => {
  const originalQuery = pool.query;
  let receivedGradeParam = false;

  pool.query = async (sql, params) => {
    if (sql.includes('academic_year')) {
      return [[{ id: 1 }]];
    }
    if (sql.includes('teacher_teaching_assignment')) {
      if (sql.includes('AND a.grade = ?')) {
        receivedGradeParam = true;
      }
      return [[{
        id: 99,
        school_id: 1,
        term_id: 1,
        teacher_id: 10,
        grade: 2,
        class_no: 3,
        subject_code: 'CHINESE',
        is_head_teacher: 1,
        teacher_name: '张老师',
        teacher_username: 'teacher_zhang'
      }]];
    }
    return [[]];
  };

  t.after(() => {
    pool.query = originalQuery;
  });

  const req = {
    user: { schoolId: 1 },
    query: { term_id: 1, grade: 2 }
  };
  const res = createMockRes();

  await teachingAssignments.getTeachingAssignments(req, res, (err) => {
    assert.fail(err);
  });

  assert.equal(res.statusCode, 200);
  assert.ok(receivedGradeParam, 'SQL 应支持按 grade 条件筛选');
  
  // 验证返回的数据结构与格式兼容
  const data = res.body.data;
  const list = Array.isArray(data) ? data : data.assignments;
  assert.ok(Array.isArray(list), '返回结果必须包含列表数组');
  assert.equal(list.length, 1);
  const row = list[0];
  assert.equal(row.class_name, '3班');
  assert.equal(row.subject, 'CHINESE');
  assert.equal(row.status, 'ACTIVE');
  assert.equal(row.teacher_name, '张老师');
});
