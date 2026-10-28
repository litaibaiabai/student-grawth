const { withMutation, parse, addSource } = require("./reportCoreStore");
const { validateConfig, fail, fixedFields } = require("./reportCorePolicy");
async function updateTerm({
  pool,
  actor,
  termId,
  config,
  nextRegistrationDate,
  command,
}) {
  if (actor.role !== "manager") fail(403, "仅管理员配置");
  validateConfig(config);
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [[term]] = await c.query(
      "SELECT * FROM academic_year WHERE id=? AND school_id=? FOR UPDATE",
      [termId, actor.schoolId],
    );
    if (!term) fail(404, "学期不存在");
    if (term.release_status !== "IDLE") fail(423, "发布期间禁止修改");
    await c.query(
      "UPDATE academic_year SET evaluation_config=?,next_term_registration_date=?,config_version=CAST(CAST(config_version AS UNSIGNED)+1 AS CHAR),rule_version=CAST(CAST(rule_version AS UNSIGNED)+1 AS CHAR) WHERE id=?",
      [JSON.stringify(config), nextRegistrationDate || null, termId],
    );
    await c.query(
      "UPDATE student_term_evaluation SET status='DRAFT',confirmed_revision=NULL,confirmed_by=NULL,confirmed_at=NULL,approval_fingerprint=NULL,revision=revision+1 WHERE school_id=? AND term_id=?",
      [actor.schoolId, termId],
    );
    const { rebuildEvaluation } = require("./reportCoreProjection");
    const [all] = await c.query(
      "SELECT student_id FROM student_term_evaluation WHERE school_id=? AND term_id=?",
      [actor.schoolId, termId],
    );
    for (const e of all) {
      const next = await rebuildEvaluation({
        connection: c,
        studentKey: {
          schoolId: actor.schoolId,
          termId,
          studentId: e.student_id,
        },
        targets: fixedFields
          .filter((f) => ["CARD", "STORY"].includes(f.sourceType))
          .map((f) => f.column),
        config,
      });
      const keys = Object.keys(next.values);
      await c.query(
        "UPDATE student_term_evaluation SET " +
          keys.map((k) => `\`${k}\`=?`).join(",") +
          ",field_sources=? WHERE school_id=? AND term_id=? AND student_id=?",
        [
          ...keys.map((k) => next.values[k]),
          JSON.stringify(next.fieldSources),
          actor.schoolId,
          termId,
          e.student_id,
        ],
      );
    }
    await addSource(c, {
      schoolId: actor.schoolId,
      termId,
      actorId: actor.id,
      kind: "AUDIT",
      status: "COMMITTED",
      key: ["CONFIG", termId, command.requestKey],
      payload: {
        action: "UPDATE_CONFIG",
        previousConfig: parse(term.evaluation_config),
        config,
      },
    });
    await c.commit();
    return { updated: true };
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
async function saveAssignment({
  pool,
  actor,
  termId,
  teacherId,
  grade,
  classNo,
  subjectCode,
  isHeadTeacher = false,
  enabled = true,
  command,
}) {
  if (actor.role !== "manager") fail(403, "仅管理员维护任教");
  const codes = [
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
  ];
  if (
    !codes.includes(subjectCode) ||
    !Number.isInteger(grade) ||
    !Number.isInteger(classNo) ||
    grade < 1 ||
    classNo < 1
  )
    fail(422, "任教信息不合法");
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [[term]] = await c.query(
      "SELECT * FROM academic_year WHERE id=? AND school_id=? FOR UPDATE",
      [termId, actor.schoolId],
    );
    if (!term || term.release_status !== "IDLE") fail(423, "学期正在发布");
    const [[u]] = await c.query(
      "SELECT id FROM users WHERE id=? AND school_id=? AND role='teacher'",
      [teacherId, actor.schoolId],
    );
    if (!u) fail(422, "教师不存在");
    await c.query(
      "INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code,is_head_teacher,enabled) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE is_head_teacher=VALUES(is_head_teacher),enabled=VALUES(enabled)",
      [
        actor.schoolId,
        termId,
        teacherId,
        grade,
        classNo,
        subjectCode,
        isHeadTeacher ? 1 : 0,
        enabled ? 1 : 0,
      ],
    );
    await addSource(c, {
      schoolId: actor.schoolId,
      termId,
      actorId: actor.id,
      kind: "AUDIT",
      status: "COMMITTED",
      key: ["ASSIGN", command.requestKey],
      payload: {
        action: "ASSIGN",
        teacherId,
        grade,
        classNo,
        subjectCode,
        isHeadTeacher,
        enabled,
      },
    });
    await c.commit();
    return { saved: true };
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
module.exports = { updateTerm, saveAssignment };
