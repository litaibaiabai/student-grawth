const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const { createDbPool, dbConfig } = require("../../db");
const { runCoreMigrations } = require("../../scripts/runCoreMigrations");
async function createCoreTestDb(t) {
  const name = `liuyu_report_test_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const admin = await mysql.createConnection(dbConfig({ database: undefined }));
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
  const config = dbConfig({ database: name });
  const pool = createDbPool(config);
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP DATABASE \`${name}\``);
    await admin.end();
  });
  await runCoreMigrations({ connection: pool, targetDb: name, mode: "apply" });
  async function seedBase() {
    const password = await bcrypt.hash("Test-pass-2026", 4);
    for (const [id, role, user] of [
      ["1", "manager", "admin"],
      ["2", "teacher", "teacher"],
      ["3", "student", "student"],
      ["4", "student", "student2"],
    ])
      await pool.query(
        "INSERT INTO users(id,school_id,username,password,real_name,role,grade,class_no) VALUES(?,1,?,?,?,?,4,1)",
        [id, user, password, user, role],
      );
    const config = {
      requiredMonths: ["2026-10"],
      cardTarget: 10,
      applicableFields: require("../../config/reportCorePolicy.json")
        .fields.filter((f) => !f.jsonPath)
        .map((f) => f.column),
      allowManagerAcademicImport: false,
      certificateMappings: [],
      collectionDeadline: "2027-02-01",
    };
    await pool.query(
      "INSERT INTO academic_year(id,school_id,academic_year,semester,term_name,start_date,end_date,is_current,evaluation_config,config_version,template_version,rule_version) VALUES(1,1,'2026-2027',1,'2026上学期','2026-09-01','2027-01-31',1,?,'1','CORE_V1','1')",
      [JSON.stringify(config)],
    );
    for (const code of [
      "MORAL",
      "CHINESE",
      "MATH",
      "SCIENCE",
      "ENGLISH",
      "PE",
      "MUSIC",
      "FINE_ART",
      "INFORMATION_TECHNOLOGY",
      "LABOR",
      "INTEGRATED_PRACTICE",
      "LOCAL_COURSE",
      "STORY",
    ])
      await pool.query(
        "INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code,is_head_teacher) VALUES(1,1,2,4,1,?,1)",
        [code],
      );
    for (const id of ["3", "4"])
      await pool.query(
        "INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES(1,1,?,?,4,1,'CORE_V1','1')",
        [id, `学生${id}`],
      );
  }
  return { pool, name, config, seedBase };
}
module.exports = { createCoreTestDb };
