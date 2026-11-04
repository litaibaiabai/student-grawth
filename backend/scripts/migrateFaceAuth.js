const columns = {
  face_template_enc: "MEDIUMTEXT NULL",
  face_enrolled_at: "DATETIME(3) NULL",
  face_credential_version: "INT NOT NULL DEFAULT 0",
  face_challenge_json: "JSON NULL",
};
async function faceSchemaReady(pool) {
  const [rows] = await pool.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'",
  );
  const names = new Set(rows.map((r) => r.COLUMN_NAME));
  return Object.keys(columns).every((k) => names.has(k));
}
async function migrateFaceAuth({
  connection,
  targetDb,
  mode = "check",
  backupDir,
} = {}) {
  if (
    targetDb !== "student_growth" ||
    (await connection.query("SELECT DATABASE() db"))[0][0].db !== targetDb
  )
    throw Error("正式数据库目标不符");
  const [rows] = await connection.query("SHOW COLUMNS FROM users");
  const missing = Object.keys(columns).filter(
    (k) => !rows.some((r) => r.Field === k),
  );
  if (mode === "check" || !missing.length)
    return { ready: !missing.length, missing };
  if (mode !== "apply") throw Error("无效迁移模式");
  const backup = await require("../services/infrastructure/formalDatabaseBackup").backupFormal(
    backupDir ||
      require("node:path").resolve(
        __dirname,
        "../../output/report-core/face-auth/backups",
      ),
  );
  for (const k of missing)
    await connection.query(
      "ALTER TABLE users ADD COLUMN `" + k + "` " + columns[k],
    );
  return {
    ready: await faceSchemaReady(connection),
    added: missing,
    backup: backup.file,
  };
}
if (require.main === module) {
  const pool = require("../db").createDbPool({ database: "student_growth" });
  migrateFaceAuth({
    connection: pool,
    targetDb: "student_growth",
    mode: process.argv.includes("--apply") ? "apply" : "check",
  })
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = { faceSchemaReady, migrateFaceAuth };
