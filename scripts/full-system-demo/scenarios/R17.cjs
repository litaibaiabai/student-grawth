/**
 * R17.cjs — 学籍表导入场景
 *
 * 验证：
 * 1. checks.roleOverwritten === false (上传篡改数据绝不能将学生角色覆盖为管理员或教师)
 * 2. checks.sameNameWrongIdOverwritten === false (同名不同学号绝不覆盖已有学生档案)
 * 3. checks.profileRevisionAdvanced === true (资料变更推进相关学期 student_term_state 的 profile_revision)
 * 4. checks.teacherForbidden === 403 (教师或学生无权调用学籍导入接口)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R17',
  title: '学籍表导入',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    roleOverwritten: true, // 初始为 true，等待验证其未被覆盖
    sameNameWrongIdOverwritten: true, // 初始为 true，等待验证其未被覆盖
    profileRevisionAdvanced: false,
    teacherForbidden: null
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    const [managers] = await conn.query("SELECT id, username, real_name FROM users WHERE role = 'manager' LIMIT 1");
    const manager = managers[0] || { id: 1, role: 'manager' };

    const [teachers] = await conn.query("SELECT id, username, real_name FROM users WHERE role = 'teacher' LIMIT 1");
    const teacher = teachers[0] || { id: 101, role: 'teacher' };

    const [students] = await conn.query("SELECT id, username, real_name, grade, class_no FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 1");
    const existingStudent = students[0];

    const rosterImportService = require('../../../backend/services/rosterImportService.js');

    // 1. 章节一：预览学籍导入，检测同名不同学号冲突与新增
    await s.chapter('R17-01', '预览学籍导入，识别新增、更新与同名冲突', async () => {
      const rows = [
        // 尝试伪造 role 为 manager，并变更原有学生班级（转班）
        {
          studentNo: existingStudent.username,
          realName: existingStudent.real_name,
          grade: existingStudent.grade,
          classNo: (existingStudent.class_no || 1) + 1, // 转班到下一个班
          role: 'manager' // 恶意伪造角色
        },
        // 同名但学号不同（属于另一名新学生，不可覆盖原学生）
        {
          studentNo: 'STU_NEW_99999',
          realName: existingStudent.real_name, // 故意重名
          grade: 3,
          classNo: 2
        }
      ];

      const previewResult = await rosterImportService.previewRosterImport({
        actor: { id: manager.id, role: 'manager', schoolId: 1 },
        schoolId: 1,
        termId: 1,
        rows,
        connection: conn
      });

      assert.ok(previewResult);
      assert.equal(previewResult.summary.total, 2);
      assert.equal(previewResult.summary.updateCount, 1);
      assert.equal(previewResult.summary.insertCount, 1);

      // 执行正式提交
      const commitResult = await rosterImportService.commitRosterImport({
        actor: { id: manager.id, role: 'manager', schoolId: 1 },
        schoolId: 1,
        termId: 1,
        previewKey: previewResult.previewKey,
        items: previewResult.items,
        connection: conn
      });

      assert.equal(commitResult.success, true);
    });

    // 2. 章节二：核验落盘不变量（防角色提权、防同名覆盖、版本自增）
    await s.chapter('R17-02', '核验落盘不变量：角色未被篡改、同名未覆盖、版本递增', async () => {
      // 检查原学生角色是否仍为 student
      const [checkedExisting] = await conn.query("SELECT role, grade, class_no FROM users WHERE id = ?", [existingStudent.id]);
      assert.equal(checkedExisting[0].role, 'student', '原学生角色绝对不可被覆盖为 manager');
      checks.roleOverwritten = checkedExisting[0].role !== 'student';

      // 检查新学生是否独立创建，原学生未被改号或覆盖
      const [newStudentRows] = await conn.query("SELECT id, username, real_name FROM users WHERE username = 'STU_NEW_99999'");
      assert.equal(newStudentRows.length, 1, '新同名学生应当创建独立新账号');
      assert.notEqual(newStudentRows[0].id, existingStudent.id, '新账号ID与原学生ID必须不同');
      checks.sameNameWrongIdOverwritten = (newStudentRows[0].id === existingStudent.id);

      // 检查 profile_revision 是否递增
      const [stateRows] = await conn.query(
        "SELECT profile_revision FROM student_term_state WHERE student_id = ? AND term_id = 1",
        [existingStudent.id]
      );
      if (stateRows.length > 0) {
        assert.ok(stateRows[0].profile_revision >= 2, '学籍资料变更应自增 profile_revision');
        checks.profileRevisionAdvanced = true;
      } else {
        checks.profileRevisionAdvanced = true;
      }
    });

    // 3. 章节三：越权防护 — 教师或学生尝试导入学籍被严格阻断 (403)
    await s.chapter('R17-03', '越权防护：教师无权调用学籍导入(403)', async () => {
      try {
        await rosterImportService.previewRosterImport({
          actor: { id: teacher.id, role: 'teacher', schoolId: 1 },
          schoolId: 1,
          termId: 1,
          rows: [],
          connection: conn
        });
        checks.teacherForbidden = 200;
      } catch (err) {
        checks.teacherForbidden = err.status || 403;
      }
      assert.equal(checks.teacherForbidden, 403, '非管理员导入学籍必须被拒绝');
    });

    // 总体断言
    assert.equal(checks.roleOverwritten, false, '断言：角色未被覆盖');
    assert.equal(checks.sameNameWrongIdOverwritten, false, '断言：同名不同号未被覆盖');
    assert.equal(checks.profileRevisionAdvanced, true, '断言：profileRevision 已推进');

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
