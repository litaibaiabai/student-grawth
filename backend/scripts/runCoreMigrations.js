const fs = require("node:fs");
const path = require("node:path");
const { createDbPool, dbConfig } = require("../db");
const { addSource, parse } = require('../services/reportCoreStore');
const { stableHash } = require('../services/reportCorePolicy');
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
async function recordUtcCutover({ connection, targetDb, schoolId, verifiedLegacyOffsetMinutes = null }) {
  if (!/^\d+$/.test(String(schoolId)) || (verifiedLegacyOffsetMinutes !== null && (!Number.isInteger(verifiedLegacyOffsetMinutes) || Math.abs(verifiedLegacyOffsetMinutes) > 14 * 60))) throw Error('School or verified clock offset is invalid');
  await runCoreMigrations({ connection, targetDb });
  const [[clock]] = await connection.query('SELECT TIMESTAMPDIFF(MINUTE,UTC_TIMESTAMP(),NOW()) offsetMinutes');
  await connection.query("SET time_zone='+00:00'");
  await connection.beginTransaction();
  try {
    const [[term]] = await connection.query('SELECT id FROM academic_year WHERE school_id=? ORDER BY id LIMIT 1 FOR UPDATE', [schoolId]);
    if (!term) throw Error('School must have a term before recording cutover');
    const key = ['SOURCE_CLOCK_BASELINE', String(schoolId), 'UTC_V1'];
    const [[old]] = await connection.query('SELECT id,payload_json FROM evaluation_source_record WHERE school_id=? AND business_key=?', [schoolId, stableHash(key)]);
    if (old) { await connection.commit(); return { ...parse(old.payload_json), auditId: String(old.id), replayed: true }; }
    const [[last]] = await connection.query('SELECT MAX(id) id FROM evaluation_source_record WHERE school_id=?', [schoolId]);
    const payload = { action: 'SOURCE_CLOCK_BASELINE', schoolId: String(schoolId), lastLegacySourceId: String(last.id || '0'), previousSessionOffsetMinutes: Number(clock.offsetMinutes), verifiedLegacyOffsetMinutes, utcFrom: new Date().toISOString() };
    const auditId = await addSource(connection, { schoolId, termId: term.id, kind: 'AUDIT', status: 'COMMITTED', key, payload });
    await connection.commit();
    return { ...payload, auditId, replayed: false };
  } catch (error) { await connection.rollback(); throw error; }
}
if (require.main === module) {
  const targetDb = process.env.REPORT_DB_NAME;
  if (!targetDb)
    throw Error("Set REPORT_DB_NAME to an empty dedicated database");
  const cutover = process.argv.includes('--record-utc-cutover');
  const option = name => process.argv.find(v => v.startsWith(name + '='))?.slice(name.length + 1);
  let pool;
  (async () => {
    if (cutover) {
      if (process.argv.includes('--apply')) throw Error('Cutover audit and schema apply must be separate operations');
      // A dedicated raw probe observes the pre-cutover server session; app pools always use UTC.
      pool = await require('mysql2/promise').createConnection(dbConfig({ database: targetDb }));
      const verified = option('--verified-legacy-offset-minutes');
      return recordUtcCutover({ connection: pool, targetDb, schoolId: option('--school-id'), verifiedLegacyOffsetMinutes: verified === undefined ? null : Number(verified) });
    }
    pool = createDbPool({ database: targetDb });
    return runCoreMigrations({ connection: pool, targetDb, mode: process.argv.includes('--apply') ? 'apply' : 'check' });
  })()
    .then((r) => console.log(r))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool?.end());
}
module.exports = { runCoreMigrations, recordUtcCutover, tables };
