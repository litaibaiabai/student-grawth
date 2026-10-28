const fs = require("node:fs");
const path = require("node:path");
const { createDbPool } = require("../db");
const tables = [
  "users",
  "academic_year",
  "teacher_teaching_assignment",
  "student_term_evaluation",
  "evaluation_source_record",
  "term_report",
];
async function runCoreMigrations({ connection, targetDb, mode = "check" }) {
  if (
    !/^liuyu_report_(test|pilot|prod)(_[a-z0-9_]+)?$/.test(targetDb) ||
    targetDb === process.env.LEGACY_DB_NAME
  )
    throw Error("Unsafe target database");
  const [[current]] = await connection.query("SELECT DATABASE() db");
  if (current.db !== targetDb) throw Error("Connection target mismatch");
  const [rows] = await connection.query("SHOW TABLES");
  const names = rows.map((r) => Object.values(r)[0]);
  if (names.length) {
    if (names.length !== 6 || tables.some((t) => !names.includes(t)))
      throw Error("Partial or legacy schema: stop");
    const [columns] = await connection.query(
      "SHOW COLUMNS FROM student_term_evaluation",
    );
    const actual = new Map(columns.map((c) => [c.Field, c.Type.toUpperCase()]));
    for (const f of require("../../docs/database/term-report-core-v1.schema.json")
      .fixedFields)
      if (!actual.has(f.column) || !actual.get(f.column).startsWith(f.sqlType))
        throw Error("Schema fingerprint mismatch");
    return { tables: names, unchanged: true };
  }
  if (mode !== "apply") throw Error("Empty target schema");
  const ddl = fs.readFileSync(
    path.join(__dirname, "../../sql/05_term_report_core_schema.sql"),
    "utf8",
  );
  for (const statement of ddl
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await connection.query(statement);
  return { tables, unchanged: false };
}
if (require.main === module) {
  const targetDb = process.env.REPORT_DB_NAME;
  if (!targetDb)
    throw Error("Set REPORT_DB_NAME to an empty dedicated database");
  const pool = createDbPool({ database: targetDb });
  runCoreMigrations({
    connection: pool,
    targetDb,
    mode: process.argv.includes("--apply") ? "apply" : "check",
  })
    .then((r) => console.log(r))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = { runCoreMigrations, tables };
