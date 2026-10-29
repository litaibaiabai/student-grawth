const {
  withMutation,
  addSource,
  parse,
  getTerm,
} = require("./reportCoreStore");
const {
  byColumn,
  fixedFields,
  narratives,
  fail,
  validateValue,
  subjectFor,
} = require("./reportCorePolicy");
const { assertScope } = require("./authorizationService");
function editable(actor, scope) {
  if (actor.role === "student")
    return [
      ...fixedFields
        .filter((f) => f.sourceType === "SELF")
        .map((f) => f.column),
      ...narratives.filter((c) => c !== "teacher_comment"),
    ];
  if (actor.role === "teacher") return scope.head ? ["teacher_comment"] : [];
  return [];
}
async function getEvaluationView({ pool, actor, studentKey }) {
  if (actor.role === "manager") fail(403, "管理员只查看完成统计");
  const scope = await assertScope({ actor, studentKey }, pool);
  const allowedFields = editable(actor, scope);
  const e = scope.evaluation;
  const term = await getTerm(pool, actor.schoolId, studentKey.termId);
  const applicable = new Set(term.evaluation_config.applicableFields || fixedFields.map(f => f.column));
  const applicableSelfFields = fixedFields.filter(f => f.sourceType === "SELF" && applicable.has(f.column)).map(f => f.column);
  let visible = allowedFields;
  if (actor.role === "teacher") {
    visible = fixedFields
      .filter(
        (f) =>
          scope.head ||
          scope.assignments.some(
            (a) => a.subject_code === subjectFor(f.column),
          ) ||
          subjectFor(f.column) === "CONDUCT",
      )
      .map((f) => f.column);
    if (scope.head) visible.push(...narratives);
  }
  return {
    revision: String(e.revision),
    applicableSelfFields,
    editable: term.release_status === "IDLE",
    lockReason: term.release_status === "IDLE" ? null : "全校报告发布准备中，暂时只读",
    status: e.status,
    allowedFields,
    values: Object.fromEntries(visible.map((f) => [f, e[f]])),
    sportsSpecialties:
      actor.role === "student" ||
      scope.head ||
      scope.assignments?.some((a) => a.subject_code === "PE")
        ? (Array.isArray(parse(e.sports_specialties)) ? parse(e.sports_specialties) : [])
        : [],
    artSpecialties:
      actor.role === "student" ||
      scope.head ||
      scope.assignments?.some((a) =>
        ["MUSIC", "FINE_ART"].includes(a.subject_code),
      )
        ? (Array.isArray(parse(e.art_specialties)) ? parse(e.art_specialties) : [])
        : [],
    progress: Object.fromEntries(
      Object.entries(parse(e.field_sources))
        .filter(([k]) => visible.includes(k))
        .map(([k, v]) => [
          k,
          { settled: v.settled, noAward: v.noAward, hasValue: e[k] !== null },
        ]),
    ),
  };
}
async function submitForm({
  pool,
  actor,
  studentKey,
  expectedRevision,
  values = {},
  specialtyChanges = [],
  command,
}) {
  return withMutation(
    {
      pool,
      actor,
      termId: studentKey.termId,
      studentIds: [studentKey.studentId],
      command,
      action: "submit-form",
    },
    async (c, term) => {
      const scope = await assertScope({ actor, studentKey, action: "form" }, c);
      if (String(scope.evaluation.revision) !== String(expectedRevision))
        fail(409, "数据已变化，请刷新并保留本次输入");
      const allowed = editable(actor, scope),
        normalized = {};
      for (const [k, v] of Object.entries(values)) {
        if (!allowed.includes(k)) fail(403, "不能修改此字段");
        normalized[k] = validateValue(k, v, term.evaluation_config);
      }
      const safeChanges = [];
      for (const item of specialtyChanges) {
        if (
          !["sports", "art"].includes(item.collection) ||
          !item.id ||
          !item.changes ||
          typeof item.changes !== "object"
        )
          fail(422, "特长修改格式不合法");
        const col =
          item.collection === "sports"
            ? "sports_specialties"
            : "art_specialties";
        const array = parse(scope.evaluation[col]);
        if (!Array.isArray(array) || !array.some((x) => x.id === item.id))
          fail(409, "特长项目已改变");
        const changes = {};
        for (const [key, v] of Object.entries(item.changes)) {
          if (key !== (actor.role === "student" ? "self_star" : "teacher_star"))
            fail(403, "特长自评他评不能互改");
          if (actor.role === "teacher")
            await assertScope(
              { actor, studentKey, action: "score", fields: [col] },
              c,
            );
          if (![1, 2, 3, null].includes(v)) fail(422, "星级不合法");
          changes[key] = v;
        }
        safeChanges.push({ collection: item.collection, id: item.id, changes });
      }
      if (!Object.keys(normalized).length && !safeChanges.length)
        fail(422, "没有提交字段");
      const previousValues = Object.fromEntries(
        Object.keys(normalized).map((k) => [k, scope.evaluation[k]]),
      );
      await addSource(c, {
        schoolId: actor.schoolId,
        termId: studentKey.termId,
        studentId: studentKey.studentId,
        actorId: actor.id,
        sourceType: actor.role === "student" ? "SELF" : "TEACHER",
        kind: "FORM",
        status: "SUBMITTED",
        key: ["FORM", actor.id, command.requestKey],
        payload: {
          values: normalized,
          previousValues,
          specialtyChanges: safeChanges,
        },
      });
      return {
        result: { saved: true },
        changedTargetsByStudent: {
          [studentKey.studentId]: [
            ...Object.keys(normalized),
            ...safeChanges.map((i) =>
              i.collection === "sports"
                ? "sports_specialties"
                : "art_specialties",
            ),
          ],
        },
      };
    },
  );
}
async function settleSources({
  pool,
  actor,
  termId,
  grade,
  classNo,
  targetKeys,
  settlement,
  expectedRevisions = {},
  command,
}) {
  if (
    actor.role !== "teacher" ||
    !["CARD_CLOSED", "NO_AWARD"].includes(settlement) ||
    !Array.isArray(targetKeys) ||
    !targetKeys.length
  )
    fail(403, "结算需教师与指定项目");
  const [students] = await pool.query(
    "SELECT * FROM student_term_evaluation WHERE school_id=? AND term_id=? AND grade_snapshot=? AND class_no_snapshot=?",
    [actor.schoolId, termId, grade, classNo],
  );
  if (!students.length) fail(422, "班级没有学生");
  return withMutation(
    {
      pool,
      actor,
      termId,
      studentIds: students.map((s) => s.student_id),
      command,
      action: "settle",
    },
    async (c) => {
      const changed = {};
      for (const e of students) {
        const scope = await assertScope(
          {
            actor,
            studentKey: {
              schoolId: actor.schoolId,
              termId,
              studentId: e.student_id,
            },
            action: settlement === "NO_AWARD" ? "award" : "score",
            fields: targetKeys,
          },
          c,
        );
        if (
          String(expectedRevisions[e.student_id]) !==
          String(scope.evaluation.revision)
        )
          fail(409, "结算前数据已变化");
        for (const target of targetKeys) {
          if (
            settlement === "CARD_CLOSED" &&
            byColumn.get(target)?.sourceType !== "CARD"
          )
            fail(422, "只能结算卡项目");
          if (
            settlement === "NO_AWARD" &&
            byColumn.get(target)?.sourceType !== "CERTIFICATE" &&
            !["sports_specialties", "art_specialties"].includes(target)
          )
            fail(422, "只能确认成果项目");
        }
        if (settlement === "NO_AWARD") {
          const [[pending]] = await c.query(
            "SELECT COUNT(*) n FROM evaluation_source_record WHERE school_id=? AND term_id=? AND student_id=? AND source_type='CERTIFICATE' AND status IN ('QUEUED','PROCESSING','SUBMITTED','FAILED')",
            [actor.schoolId, termId, e.student_id],
          );
          if (Number(pending.n)) fail(422, "仍有奖状待处理，不能声明无奖");
        }
        await addSource(c, {
          schoolId: actor.schoolId,
          termId,
          studentId: e.student_id,
          actorId: actor.id,
          sourceType: "TEACHER",
          kind: "FORM",
          status: "CONFIRMED",
          key: ["SETTLE", actor.id, command.requestKey, e.student_id],
          payload: {
            action:
              settlement === "CARD_CLOSED"
                ? "SETTLE_CARD_TARGETS"
                : "DECLARE_NO_AWARDS",
            targetKeys,
          },
        });
        changed[e.student_id] = targetKeys;
      }
      return {
        result: { settled: students.length },
        changedTargetsByStudent: changed,
      };
    },
  );
}
module.exports = { getEvaluationView, submitForm, settleSources };
function buildReportModel({ evaluation: e, config, studentSnapshot }) {
  const values = Object.fromEntries(
    fixedFields.map((f) => [f.column, e[f.column] ?? null]),
  );
  return {
    schemaVersion: "CORE_V1",
    student: studentSnapshot || {
      id: String(e.student_id),
      name: e.student_name_snapshot,
      grade: e.grade_snapshot,
      classNo: e.class_no_snapshot,
    },
    term: {},
    values,
    sportsSpecialties: Array.isArray(parse(e.sports_specialties))
      ? parse(e.sports_specialties)
      : [],
    artSpecialties: Array.isArray(parse(e.art_specialties))
      ? parse(e.art_specialties)
      : [],
    narratives: Object.fromEntries(narratives.map((n) => [n, e[n] || ""])),
    policySnapshot: config,
    sourceSummary: parse(e.field_sources),
    displayFieldCount: 109,
  };
}
function reportFingerprint(e, term) {
  const { stableHash } = require("./reportCorePolicy");
  return stableHash({
    model: buildReportModel({ evaluation: e, config: term.evaluation_config }),
    revision: String(e.revision),
    templateVersion: term.template_version,
    ruleVersion: term.rule_version,
    configVersion: term.config_version,
    registrationDate: term.next_term_registration_date,
  });
}
async function missingItems(c, e, term) {
  const { getBlockingMaterials, evaluateCompletion } = require('./reportCoreReadModels');
  const blockingMaterials = await getBlockingMaterials({connection:c,schoolId:String(e.school_id),termId:String(e.term_id),studentId:String(e.student_id),config:term.evaluation_config});
  return evaluateCompletion({evaluation:e,config:term.evaluation_config,blockingMaterials}).missingItems;
}

async function buildReportDraft({ pool, actor, studentKey }) {
  if (actor.role !== "teacher") fail(403, "报告草稿仅班主任可查看");
  const scope = await assertScope(
    { actor, studentKey, action: "report" },
    pool,
  );
  const term = await getTerm(pool, actor.schoolId, studentKey.termId);
  const model = buildReportModel({
    evaluation: scope.evaluation,
    config: term.evaluation_config,
  });
  model.term = {
    id: String(term.id),
    name: term.term_name,
    academicYear: term.academic_year,
    semester: term.semester,
    nextRegistrationDate: term.next_term_registration_date,
  };
  model.templateVersion = term.template_version;
  const fingerprint = reportFingerprint(scope.evaluation, term);
  const html = require("./reportRenderService").renderPrintableA4({
    reportData: { ...model, fingerprint },
  });
  return {
    model,
    html,
    revision: String(scope.evaluation.revision),
    fingerprint,
    missingItems: await missingItems(pool, scope.evaluation, term),
  };
}
async function confirmReport({
  pool,
  actor,
  studentKey,
  expectedRevision,
  expectedFingerprint,
  layoutReview,
  command,
}) {
  return withMutation(
    {
      pool,
      actor,
      termId: studentKey.termId,
      studentIds: [studentKey.studentId],
      command,
      action: "confirm-report",
    },
    async (c, term) => {
      const scope = await assertScope(
        { actor, studentKey, action: "confirm" },
        c,
      );
      const e = scope.evaluation,
        fingerprint = reportFingerprint(e, term);
      if (
        String(e.revision) !== String(expectedRevision) ||
        fingerprint !== expectedFingerprint
      )
        fail(409, "报告来源已变化");
      if (
        !layoutReview ||
        layoutReview.overflow !== false ||
        layoutReview.fingerprint !== fingerprint ||
        layoutReview.templateVersion !== term.template_version
      )
        fail(422, "请完成打印版面复核");
      const missing = await missingItems(c, e, term);
      if (missing.length) fail(422, `报告有${missing.length}个待完成项目`);
      await c.query(
        "UPDATE student_term_evaluation SET status='CONFIRMED',confirmed_revision=revision,confirmed_by=?,confirmed_at=UTC_TIMESTAMP(6),approval_fingerprint=?,section_meta=JSON_SET(COALESCE(section_meta,JSON_OBJECT()),'$.layoutReview',CAST(? AS JSON)) WHERE id=?",
        [actor.id, fingerprint, JSON.stringify(layoutReview), e.id],
      );
      return { result: { confirmedRevision: String(e.revision), fingerprint } };
    },
  );
}
async function confirmReports({ pool, actor, termId, items, command }) {
  const confirmed = [],
    blocked = [];
  for (const item of items) {
    try {
      await confirmReport({
        pool,
        actor,
        studentKey: {
          schoolId: actor.schoolId,
          termId,
          studentId: item.studentId,
        },
        expectedRevision: item.revision,
        expectedFingerprint: item.fingerprint,
        layoutReview: item.layoutReview,
        command: {
          requestKey: `${command.requestKey}-${item.studentId}`,
          payloadHash: require("./reportCorePolicy").stableHash(item),
        },
      });
      confirmed.push(item.studentId);
    } catch (e) {
      blocked.push({ studentId: item.studentId, message: e.message });
    }
  }
  return { confirmed, blocked };
}
Object.assign(module.exports, {
  buildReportModel,
  buildReportDraft,
  reportFingerprint,
  missingItems,
  confirmReport,
  confirmReports,
});
