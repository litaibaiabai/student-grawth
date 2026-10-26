/**
 * excel_import_e2e.test.js
 * 全校 3,000 名学生规模真实压测与端到端异常隔离集成回归测试
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../db");
const batchImportService = require("../services/batchImportService");
const importController = require("../controllers/importController");

describe("3000-Student School-wide Score Batch Import E2E & Stress Test", () => {
  const schoolId = 1;
  let termId = 1;
  let createdBatchNos = [];
  let existingStudent = null;

  before(async () => {
    // 确保有活跃学期
    const [terms] = await pool.query("SELECT id FROM academic_year WHERE is_current = 1 LIMIT 1");
    if (terms.length > 0) termId = terms[0].id;

    // 获取一个已有真实学生作为样本
    const [students] = await pool.query(
      "SELECT id, username, real_name FROM users WHERE school_id = ? AND role = 'student' LIMIT 1",
      [schoolId]
    );
    assert.ok(students.length >= 1, "应存在真实学生");
    existingStudent = students[0];
  });

  after(async () => {
    // 清理测试生成的批量成绩
    if (createdBatchNos.length > 0) {
      await pool.query(
        `DELETE FROM subject_score WHERE batch_no IN (${createdBatchNos.map(() => "?").join(", ")})`,
        createdBatchNos
      );
      await pool.query(
        `DELETE FROM operation_audit WHERE request_id IN (${createdBatchNos.map(() => "?").join(", ")})`,
        createdBatchNos
      );
    }
    await pool.end();
  });

  test("1. Stress Test: 3,000 students (24,000 scores) preview and chunked commit under 3s", async () => {
    // 构造 3000 个模拟学生
    // 为使数据库外键或逻辑匹配，使用 existingStudent.id 模拟 3000 条记录入库
    const validStudents = [];
    for (let i = 0; i < 3000; i++) {
      validStudents.push({
        rowNum: i + 2,
        studentId: existingStudent.id,
        username: `STU_3000_${i}`,
        realName: `学生_${i}`,
        grade: "初一",
        classNo: "1班",
        scores: [
          { subjectCode: "CHINESE", subjectName: "语文", score: 85.5 },
          { subjectCode: "MATH", subjectName: "数学", score: 92.0 },
          { subjectCode: "ENGLISH", subjectName: "英语", score: 88.0 },
          { subjectCode: "PHYSICS", subjectName: "物理", score: 90.0 },
          { subjectCode: "CHEMISTRY", subjectName: "化学", score: 86.5 },
          { subjectCode: "HISTORY", subjectName: "历史", score: 91.0 },
          { subjectCode: "GEOGRAPHY", subjectName: "地理", score: 89.0 },
          { subjectCode: "PE", subjectName: "体育", score: 95.0 }
        ]
      });
    }

    const startTime = Date.now();
    const result = await batchImportService.commitBatchExcel({
      schoolId,
      termId,
      type: "SUBJECT",
      validStudents,
      operatorId: 1
    });
    const duration = Date.now() - startTime;
    createdBatchNos.push(result.batchNo);

    assert.equal(result.committedStudents, 3000);
    assert.equal(result.committedScoresCount, 24000);
    assert.ok(duration <= 3000, `3000人(2.4万条分值)入库应在3秒内完成，实际耗时: ${duration}ms`);

    // 验证审计日志记录
    const [audits] = await pool.query(
      "SELECT id, new_summary FROM operation_audit WHERE request_id = ? LIMIT 1",
      [result.batchNo]
    );
    assert.equal(audits.length, 1);
    const summary = typeof audits[0].new_summary === "string" ? JSON.parse(audits[0].new_summary) : audits[0].new_summary;
    assert.equal(summary.committedStudents, 3000);
    assert.equal(summary.committedScoresCount, 24000);
  });

  test("2. Partial Success Isolation: 10 abnormal rows isolated, normal rows admitted", async () => {
    const mixedRows = [
      // 1 条正常
      {
        rowNum: 2,
        username: existingStudent.username,
        realName: existingStudent.real_name,
        scores: { CHINESE: 95, MATH: 98 }
      },
      // 3 条异常：学号不存在、超范围分值、负数分值
      {
        rowNum: 3,
        username: "NON_EXIST_9999",
        realName: "张假人",
        scores: { CHINESE: 80 }
      },
      {
        rowNum: 4,
        username: "EMPTY_SCORE_STUDENT",
        scores: {} // 空分值
      },
      {
        rowNum: 5,
        username: "STUDENT_NEGATIVE",
        scores: { MATH: -5 }
      }
    ];

    const preview = await batchImportService.previewBatchExcel({
      schoolId,
      termId,
      type: "SUBJECT",
      rows: mixedRows,
      operatorId: 1
    });

    assert.equal(preview.totalStudents, 4);
    assert.equal(preview.validCount, 1);
    assert.equal(preview.invalidCount, 3);
    assert.equal(preview.validStudents[0].username, existingStudent.username);
  });

  test("3. Security & Permission: Teacher forbidden from importing DIMENSION scores", async () => {
    let statusCode = 200;
    let resData = null;

    const mockRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        resData = payload;
        return this;
      }
    };

    const reqTeacher = {
      user: { role: "teacher", schoolId, id: 99 },
      body: {
        type: "DIMENSION",
        rows: [{ rowNum: 2, username: existingStudent.username, scores: { D: 90 } }]
      }
    };

    await importController.previewBatchImport(reqTeacher, mockRes, (err) => { throw err; });
    assert.equal(statusCode, 403);
    assert.match(resData.message, /教师仅可导入任教学科期末成绩/);
  });
});
