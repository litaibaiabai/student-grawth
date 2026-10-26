const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../db");
const batchImportService = require("../services/batchImportService");
const importController = require("../controllers/importController");

function createMockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };
  return res;
}

describe("Batch Score Import Service & Controller", () => {
  let schoolId = 1;
  let termId = 1;
  let operatorId = 1;

  before(async () => {
    // 确保有活跃学期
    const [terms] = await pool.query("SELECT id FROM academic_year WHERE is_current = 1 LIMIT 1");
    if (terms.length > 0) {
      termId = terms[0].id;
    }
  });

  after(async () => {
    await pool.end();
  });

  test("Step 1: previewBatchExcel correctly filters valid vs invalid rows", async () => {
    // 获取系统中真实存在的 2 个学生
    const [students] = await pool.query(
      "SELECT id, username, real_name FROM users WHERE school_id = ? AND role = 'student' LIMIT 2",
      [schoolId]
    );
    assert.ok(students.length >= 1, "系统中应至少有测试学生");
    const validStudent = students[0];
    const secondStudent = students[1] || { username: "student2", real_name: "学生2" };

    const mockRows = [
      {
        rowNum: 2,
        username: validStudent.username,
        realName: validStudent.real_name,
        grade: "初一",
        classNo: "1班",
        scores: {
          CHINESE: 92.5,
          MATH: 98.0,
          ENGLISH: 88.0
        }
      },
      {
        rowNum: 3,
        username: "NON_EXISTENT_STUDENT_9999",
        realName: "不存在的学生",
        grade: "初一",
        classNo: "1班",
        scores: {
          CHINESE: 90
        }
      },
      {
        rowNum: 4,
        username: secondStudent.username,
        realName: secondStudent.real_name,
        grade: "初一",
        classNo: "1班",
        scores: {
          CHINESE: 160.0 // 超过 100 分上限
        }
      },
      {
        rowNum: 5,
        username: validStudent.username, // 重复学号
        realName: validStudent.real_name,
        grade: "初一",
        classNo: "1班",
        scores: {
          CHINESE: 90
        }
      }
    ];

    const previewResult = await batchImportService.previewBatchExcel({
      schoolId,
      termId,
      type: "SUBJECT",
      rows: mockRows,
      operatorId
    });

    assert.equal(previewResult.totalStudents, 4);
    assert.equal(previewResult.validCount, 1);
    assert.equal(previewResult.invalidCount, 3);
    assert.equal(previewResult.errors.length, 3);
    assert.equal(previewResult.errors[0].rowNum, 3);
    assert.match(previewResult.errors[0].reason, /未找到该学生账号/);
    assert.equal(previewResult.errors[1].rowNum, 4);
    assert.match(previewResult.errors[1].reason, /分值必须在/);
    assert.equal(previewResult.errors[2].rowNum, 5);
    assert.match(previewResult.errors[2].reason, /存在重复学号/);
  });

  test("Step 2: commitBatchExcel performs fast chunked bulk upsert into subject_score", async () => {
    const [students] = await pool.query(
      "SELECT id, username, real_name FROM users WHERE school_id = ? AND role = 'student' LIMIT 10",
      [schoolId]
    );
    assert.ok(students.length >= 1, "系统中应至少有测试学生");

    const validStudents = students.map((s, idx) => ({
      rowNum: idx + 2,
      studentId: s.id,
      username: s.username,
      realName: s.real_name,
      scores: [
        { subjectCode: "CHINESE", subjectName: "语文", score: 85 + (idx % 15) },
        { subjectCode: "MATH", subjectName: "数学", score: 90 + (idx % 10) },
        { subjectCode: "ENGLISH", subjectName: "英语", score: 88 + (idx % 12) }
      ]
    }));

    const startTime = Date.now();
    const commitResult = await batchImportService.commitBatchExcel({
      schoolId,
      termId,
      type: "SUBJECT",
      validStudents,
      operatorId
    });
    const duration = Date.now() - startTime;

    assert.ok(commitResult.batchNo.startsWith("IMP_"));
    assert.equal(commitResult.committedStudents, students.length);
    assert.equal(commitResult.committedScoresCount, students.length * 3);
    assert.ok(duration < 3000, `批量导入耗时应小于 3 秒，实际: ${duration}ms`);

    // 验证数据库落库情况
    const [scores] = await pool.query(
      "SELECT raw_score FROM subject_score WHERE student_id = ? AND term_id = ? AND subject_code = 'CHINESE' AND batch_no = ?",
      [students[0].id, termId, commitResult.batchNo]
    );
    assert.equal(scores.length, 1);
    assert.equal(Number(scores[0].raw_score), 85);
  });

  test("Step 3: Controller endpoints previewBatchImport & commitBatchImport handle HTTP requests", async () => {
    const [students] = await pool.query(
      "SELECT id, username, real_name FROM users WHERE school_id = ? AND role = 'student' LIMIT 1",
      [schoolId]
    );
    const student = students[0];

    const reqPreview = {
      user: { schoolId, id: operatorId, role: "admin" },
      body: {
        type: "SUBJECT",
        termId,
        rows: [
          {
            rowNum: 2,
            username: student.username,
            realName: student.real_name,
            scores: { CHINESE: 95 }
          }
        ]
      }
    };
    const resPreview = createMockRes();
    await importController.previewBatchImport(reqPreview, resPreview, (err) => { throw err; });

    assert.equal(resPreview.statusCode, 200);
    assert.equal(resPreview.data.code, 200);
    assert.equal(resPreview.data.data.validCount, 1);

    const reqCommit = {
      user: { schoolId, id: operatorId, role: "admin" },
      body: {
        type: "SUBJECT",
        termId,
        validStudents: resPreview.data.data.validStudents
      }
    };
    const resCommit = createMockRes();
    await importController.commitBatchImport(reqCommit, resCommit, (err) => { throw err; });

    assert.equal(resCommit.statusCode, 200);
    assert.equal(resCommit.data.code, 200);
    assert.equal(resCommit.data.data.committedStudents, 1);
  });
});
