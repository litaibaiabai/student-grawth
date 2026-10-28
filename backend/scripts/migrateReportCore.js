const { dbConfig, createDbPool } = require("../db");
const mysql = require("mysql2/promise");
const { parse, addSource } = require("../services/reportCoreStore");
const {
  stableHash,
  fixedFields,
  validateValue,
} = require("../services/reportCorePolicy");
async function migrateReportCore({
  sourceConnection: src,
  targetConnection: dst,
  mode = "audit",
  schoolId,
  termIds,
}) {
  const [[from]] = await src.query(
    "SELECT DATABASE() db,@@hostname host,@@port port",
  );
  const [[to]] = await dst.query(
    "SELECT DATABASE() db,@@hostname host,@@port port",
  );
  if (from.db === to.db && from.host === to.host && from.port === to.port)
    throw Error("Source and target must be different databases");
  if (!/^liuyu_report_(test|pilot|prod)(_[a-z0-9_]+)?$/.test(to.db))
    throw Error("Unsafe target");
  if (
    !["audit", "apply"].includes(mode) ||
    !schoolId ||
    !Array.isArray(termIds) ||
    !termIds.length
  )
    throw Error("Explicit school and termIds required");
  const [tableRows] = await src.query("SHOW TABLES");
  const names = new Set(tableRows.map((r) => Object.values(r)[0]));
  const report = {
    mode,
    counts: {},
    warnings: [],
    unmapped: [],
    checksums: {},
  };
  const read = async (name, where, params = []) => {
    if (!names.has(name)) return [];
    return (
      await src.query(`SELECT * FROM \`${name}\` WHERE ${where}`, params)
    )[0];
  };
  const users = await read("users", "school_id=?", [schoolId]);
  report.counts.users = users.length;
  const terms = await read("academic_year", "school_id=? AND id IN (?)", [
    schoolId,
    termIds,
  ]);
  report.counts.terms = terms.length;
  const snapshots = await read(
    "term_report",
    "school_id=? AND term_id IN (?) AND status='PUBLISHED'",
    [schoolId, termIds],
  );
  report.counts.reports = snapshots.length;
  for (const s of snapshots)
    report.checksums[`report:${s.id}`] = stableHash(parse(s.snapshot_json));
  const archivalTables = [
    "card_quota_rule",
    "card_allocation",
    "reward_card",
    "card_claim",
    "score_record",
    "honor_record",
    "story_submission",
    "material_revision",
    "health_import_batch",
    "roster_import_batch",
    "subject_import_batch",
    "operation_audit",
    "student_indicator_value",
    "subject_score",
    "student_dimension_score",
    "student_health_record",
    "student_report_draft",
  ];
  const archive = [];
  for (const table of archivalTables) {
    if (!names.has(table)) continue;
    const [columns] = await src.query(`SHOW COLUMNS FROM \`${table}\``);
    const hasSchool = columns.some((c) => c.Field === "school_id"),
      hasTerm = columns.some((c) => c.Field === "term_id");
    if (!hasSchool) {
      report.warnings.push(
        `${table}: cannot safely establish school scope; not copied`,
      );
      continue;
    }
    const rows = await read(
      table,
      `school_id=?${hasTerm ? " AND term_id IN (?)" : ""}`,
      hasTerm ? [schoolId, termIds] : [schoolId],
    );
    report.counts[table] = rows.length;
    for (const row of rows) {
      archive.push({ table, row });
      if (
        [
          "reward_card",
          "score_record",
          "story_submission",
          "student_dimension_score",
          "student_indicator_value",
          "subject_score",
        ].includes(table)
      )
        report.unmapped.push({
          table,
          id: String(row.id),
          reason:
            "Require proven target/source/version mapping; preserve original privately, no fabricated report values",
        });
    }
  }
  report.warnings.push(
    "Legacy active cards require classification and credential recovery before reissue; legacy six-dimension totals and single story grades are not split into new indicators.",
    "Raw materials are archived privately. File migration requires an explicit asset map and hash verification before cutover.",
  );
  if (mode === "audit") return report;
  const c = await dst.getConnection();
  try {
    await c.beginTransaction();
    for (const u of users) {
      if (!["manager", "teacher", "student"].includes(u.role)) {
        report.unmapped.push({
          table: "users",
          id: String(u.id),
          reason: "unknown role",
        });
        continue;
      }
      const [[old]] = await c.query(
        "SELECT id FROM users WHERE id=? OR (school_id=? AND username=?)",
        [u.id, schoolId, u.username],
      );
      if (old && String(old.id) !== String(u.id))
        throw Error("Target username/id conflict");
      await c.query(
        "INSERT IGNORE INTO users(id,school_id,username,password,real_name,role,grade,class_no,status,legacy_info) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [
          u.id,
          schoolId,
          u.username,
          u.password,
          u.real_name,
          u.role,
          u.grade,
          u.class_no,
          u.status || 0,
          JSON.stringify({
            legacyId: String(u.id),
            externalId: u.external_id || null,
          }),
        ],
      );
    }
    for (const term of terms) {
      const config = term.evaluation_config
        ? parse(term.evaluation_config)
        : {
            requiredMonths: [],
            cardTarget: 10,
            applicableFields: fixedFields.map((f) => f.column),
            certificateMappings: [],
          };
      await c.query(
        "INSERT IGNORE INTO academic_year(id,school_id,academic_year,semester,term_name,start_date,end_date,is_current,active,evaluation_config,config_version,template_version,rule_version) VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,?)",
        [
          term.id,
          schoolId,
          term.academic_year,
          term.semester,
          term.term_name || `${term.academic_year} 第${term.semester}学期`,
          term.start_date,
          term.end_date,
          term.is_current || 0,
          term.active || 0,
          JSON.stringify(config),
          "1",
          "CORE_V1",
          "1",
        ],
      );
      for (const u of users.filter((u) => u.role === "student"))
        await c.query(
          "INSERT IGNORE INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES(?,?,?,?,?,?,?,?)",
          [
            schoolId,
            term.id,
            u.id,
            u.real_name,
            u.grade || 1,
            u.class_no || 1,
            "CORE_V1",
            "1",
          ],
        );
    }
    const assignments = await read(
      "teacher_teaching_assignment",
      "school_id=? AND term_id IN (?)",
      [schoolId, termIds],
    );
    for (const a of assignments)
      await c.query(
        "INSERT IGNORE INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code,is_head_teacher) VALUES(?,?,?,?,?,?,?)",
        [
          schoolId,
          a.term_id,
          a.teacher_id,
          a.grade,
          a.class_no,
          a.subject_code,
          a.is_head_teacher || 0,
        ],
      );
    for (const { table, row } of archive) {
      const termId = row.term_id || terms[0]?.id;
      if (!termId) continue;
      const businessKey = stableHash([
        "LEGACY",
        from.db,
        table,
        String(row.id),
      ]);
      const [[old]] = await c.query(
        "SELECT id FROM evaluation_source_record WHERE school_id=? AND business_key=?",
        [schoolId, businessKey],
      );
      if (!old)
        await addSource(c, {
          schoolId,
          termId,
          studentId: users.some(
            (u) =>
              u.role === "student" && String(u.id) === String(row.student_id),
          )
            ? row.student_id
            : null,
          kind: "AUDIT",
          status: "COMMITTED",
          key: ["LEGACY", from.db, table, String(row.id)],
          payload: {
            action: "LEGACY_ARCHIVE",
            migrationRef: { table, id: String(row.id) },
            privateChanges: row,
          },
        });
    }
    for (const s of snapshots) {
      const snapshot = parse(s.snapshot_json);
      await c.query(
        "INSERT IGNORE INTO term_report(school_id,term_id,student_id,version,release_version,release_key,schema_version,template_version,rule_version,source_revision,approval_fingerprint,snapshot_json,snapshot_hash,status,published_at) VALUES(?,?,?,?,0,?,'LEGACY_V1',?,?,0,?,?,?,'PUBLISHED',?)",
        [
          schoolId,
          s.term_id,
          s.student_id,
          s.version,
          stableHash(["LEGACY_REPORT", from.db, s.id]),
          s.template_version || "LEGACY_V1",
          s.rule_version || null,
          s.approval_fingerprint || null,
          JSON.stringify(snapshot),
          stableHash(snapshot),
          s.published_at,
        ],
      );
    }
    await c.commit();
    return report;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
if (require.main === module) {
  (async () => {
    const srcName = process.env.LEGACY_DB_NAME,
      dstName = process.env.REPORT_DB_NAME;
    if (!srcName || !dstName)
      throw Error("Set LEGACY_DB_NAME and REPORT_DB_NAME");
    const src = createDbPool({ database: srcName }),
      dst = createDbPool({ database: dstName });
    try {
      console.log(
        JSON.stringify(
          await migrateReportCore({
            sourceConnection: src,
            targetConnection: dst,
            mode: process.argv.includes("--apply") ? "apply" : "audit",
            schoolId: process.env.SCHOOL_ID,
            termIds: (process.env.MIGRATE_TERM_IDS || "")
              .split(",")
              .filter(Boolean),
          }),
          null,
          2,
        ),
      );
    } finally {
      await src.end();
      await dst.end();
    }
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
module.exports = { migrateReportCore };
