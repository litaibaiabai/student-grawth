const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");
const fs = require("node:fs/promises");
const path = require("node:path");
const { dbConfig, createDbPool } = require("../db");
const { runCoreMigrations } = require("./runCoreMigrations");
const { fixedFields } = require("../services/reportCorePolicy");
async function initializeSchool({ pool, schoolId, password, demo = false }) {
  if (!schoolId || !password || password.length < 10)
    throw Error("School and password >=10 required");
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [[n]] = await c.query(
      "SELECT COUNT(*) n FROM users WHERE school_id=?",
      [schoolId],
    );
    if (Number(n.n))
      throw Error("School already initialized / 已有用户，不覆盖");
    const hash = await bcrypt.hash(password, 10);
    const accounts = demo
      ? [
          ["admin", "管理员", "manager"],
          ["teacher", "演示教师", "teacher"],
          ["student", "演示学生一", "student"],
          ["student2", "演示学生二", "student"],
        ]
      : [["admin", "学校管理员", "manager"]];
    const ids = {};
    for (const [username, name, role] of accounts) {
      const [r] = await c.query(
        "INSERT INTO users(school_id,username,password,real_name,role,grade,class_no) VALUES(?,?,?,?,?,4,1)",
        [schoolId, username, hash, name, role],
      );
      ids[username] = String(r.insertId);
    }
    const config = {
      requiredMonths: ["2026-10"],
      cardTarget: 10,
      applicableFields: fixedFields.map((f) => f.column),
      certificateMappings: [],
      allowManagerAcademicImport: false,
      collectionDeadline: "2027-02-01",
    };
    const [r] = await c.query(
      "INSERT INTO academic_year(school_id,academic_year,semester,term_name,start_date,end_date,is_current,evaluation_config,config_version,template_version,rule_version,next_term_registration_date) VALUES(?,'2026-2027',1,'2026-2027学年第一学期','2026-09-01','2027-01-31',1,?,'1','CORE_V1','1','2027-02-22')",
      [schoolId, JSON.stringify(config)],
    );
    const termId = String(r.insertId);
    if (demo) {
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
        await c.query(
          "INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code,is_head_teacher) VALUES(?,?,?,4,1,?,1)",
          [schoolId, termId, ids.teacher, code],
        );
      for (const name of ["student", "student2"])
        await c.query(
          "INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES(?,?,?,?,4,1,'CORE_V1','1')",
          [
            schoolId,
            termId,
            ids[name],
            name === "student" ? "演示学生一" : "演示学生二",
          ],
        );
    }
    await c.commit();
    return { termId, users: ids };
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
if (require.main === module) {
  (async () => {
    const target = process.env.REPORT_DB_NAME;
    if (
      !/^liuyu_report_(pilot|prod)(_[a-z0-9_]+)?$/.test(target || "") ||
      target === process.env.LEGACY_DB_NAME
    )
      throw Error("Dedicated REPORT_DB_NAME required");
    const admin = await mysql.createConnection(
      dbConfig({ database: undefined }),
    );
    try {
      await admin.query(
        `CREATE DATABASE IF NOT EXISTS \`${target}\` CHARACTER SET utf8mb4`,
      );
    } finally {
      await admin.end();
    }
    const pool = createDbPool({ database: target });
    try {
      await runCoreMigrations({
        connection: pool,
        targetDb: target,
        mode: "apply",
      });
      const password =
        process.env.CORE_BOOTSTRAP_PASSWORD ||
        crypto.randomBytes(15).toString("base64url");
      const result = await initializeSchool({
        pool,
        schoolId: process.env.SCHOOL_ID,
        password,
        demo: process.argv.includes("--demo"),
      });
      const directory = path.resolve(__dirname, "../../output/report-core");
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const file = path.join(directory, "local-accounts.json");
      await fs.writeFile(
        file,
        JSON.stringify(
          {
            database: target,
            accounts: Object.keys(result.users).map((username) => ({
              username,
              password,
            })),
            notice: "Only fictional demo; change passwords before real use",
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      console.log(
        JSON.stringify({
          initialized: true,
          termId: result.termId,
          accountFile: file,
        }),
      );
    } finally {
      await pool.end();
    }
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
module.exports = { initializeSchool };
