const {tokenHash}=require('./cardCredentials');
const {withMutation,addSource,parse,getTerm}=require('../core/reportCoreStore');
const {fail,collectionCutoff}=require('../core/reportCorePolicy');
const {assertScope}=require('../auth/authorizationService');
async function source(pool, actor, id) {
  const [[s]] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE school_id=? AND id=?",
    [actor.schoolId, id],
  );
  if (!s) fail(404, "记录不存在");
  s.payload = parse(s.payload_json);
  return s;
}
async function previewCard({ pool, actor, token }) {
  const [[s]] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE token_hash=? AND school_id=? AND record_kind='CARD'",
    [tokenHash(token), actor.schoolId],
  );
  if (!s) fail(404, "卡片不存在");
  await assertScope(
    {
      actor,
      studentKey: {
        schoolId: actor.schoolId,
        termId: s.term_id,
        studentId: actor.id,
      },
      action: "read",
    },
    pool,
  );
  const p = parse(s.payload_json);
  return {
    id: String(s.id),
    termId: String(s.term_id),
    category: p.categoryCode,
    grade: p.grade,
    classNo: p.classNo,
    status: s.status,
  };
}
async function redeemCard({ pool, actor, token, command, now = new Date() }) {
  if (actor.role !== "student") fail(403, "学生本人扫码");
  const [[s]] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE school_id=? AND token_hash=? AND record_kind='CARD'",
    [actor.schoolId, tokenHash(token)],
  );
  if (!s) fail(404, "卡片不存在");
  return withMutation(
    {
      pool,
      actor,
      termId: s.term_id,
      studentIds: [actor.id],
      command,
      action: "redeem-card",
    },
    async (c) => {
      const { evaluation: e } = await assertScope(
        {
          actor,
          studentKey: {
            schoolId: actor.schoolId,
            termId: s.term_id,
            studentId: actor.id,
          },
        },
        c,
      );
      const [[row]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE",
        [s.id],
      );
      if (row.token_hash !== tokenHash(token)) fail(409, '卡片凭据已更新');
      const p = parse(row.payload_json);
      if (['COURSE_SUBJECT','COURSE_SEMESTER'].includes(p.mode)) {
        const [[current]] = await c.query("SELECT a.teacher_id FROM teacher_teaching_assignment a JOIN users u ON u.school_id=a.school_id AND u.id=a.teacher_id AND u.status=0 AND u.role='teacher' WHERE a.school_id=? AND a.term_id=? AND a.grade=? AND a.class_no=? AND a.subject_code=? AND a.teacher_id=? AND a.enabled=1 FOR SHARE",[actor.schoolId,s.term_id,p.grade,p.classNo,p.subjectCode,row.owner_teacher_id]);
        if (!current) fail(409, '任课配置已变化，卡片失效');
      }
      if (e.grade_snapshot !== p.grade || e.class_no_snapshot !== p.classNo)
        fail(403, "非发行班级");
      if (row.status !== "UNUSED") fail(409, "卡片已领取或失效");
      if (now < row.valid_from || now >= row.valid_until)
        fail(422, "不在有效期");
      p.usedAt = now.toISOString();
      await c.query(
        "UPDATE evaluation_source_record SET status='USED',student_id=?,payload_json=?,effective_at=?,submitted_at=COALESCE(submitted_at,?),revision=revision+1 WHERE id=?",
        [actor.id, JSON.stringify(p), now, now, s.id],
      );
      return {
        result: { sourceId: String(s.id), pointsCredited: 1 },
        changedTargetsByStudent: { [actor.id]: [s.target_key] },
      };
    },
  );
}
async function directScore({
  pool,
  actor,
  termId,
  studentIds,
  categoryCode,
  reason,
  command,
  now = new Date(),
}) {
  const configTerm=await getTerm(pool,actor.schoolId,termId);
  const category = require("../core/reportCoreV2Policy").policyFor(configTerm.evaluation_config).cardCatalog.find((x) => x.code === categoryCode);
  if (reason !== undefined && reason !== null && typeof reason !== 'string') fail(422, '评价说明需为文字');
  reason = reason?.trim() || '';
  if (
    !category ||
    !Array.isArray(studentIds) ||
    !studentIds.length ||
    studentIds.length > 100
  )
    fail(422, "评价信息不完整");
  if (actor.role !== "teacher") fail(403, "仅教师直评");
  if(studentIds.some(id=>!/^[1-9]\d*$/.test(String(id))))fail(422,'学生标识不合法');
  studentIds=[...new Set(studentIds.map(String))];
  return withMutation(
    { pool, actor, termId, studentIds, command, action: "direct-score" },
    async (c, term) => {
      if (now >= collectionCutoff(term))
        fail(422, "采集已截止");
      const changed = {};
      for (const id of new Set(studentIds)) {
        await assertScope(
          {
            actor,
            studentKey: { schoolId: actor.schoolId, termId, studentId: id },
            action: "score",
            fields: [category.targetColumn],
          },
          c,
        );
        await addSource(c, {
          schoolId: actor.schoolId,
          termId,
          studentId: id,
          actorId: actor.id,
          sourceType: "CARD",
          kind: "DIRECT",
          target: category.targetColumn,
          status: "CONFIRMED",
          delta: 1,
          payload: { reason, categoryCode, occurredAt: now.toISOString() },
          key: ["DIRECT", actor.id, command.requestKey, id, categoryCode],
        });
        changed[id] = [category.targetColumn];
      }
      return {
        result: { count: studentIds.length },
        changedTargetsByStudent: changed,
      };
    },
  );
}
async function reverseSource({ pool, actor, sourceId, reason, command }) {
  if (actor.role !== "teacher" || typeof reason!=='string' || !reason.trim())
    fail(403, "需教师填写更正原因");
  const s = await source(pool, actor, sourceId);
  if (
    s.source_type !== "CARD" ||
    !["DIRECT", "CARD"].includes(s.record_kind) ||
    !s.student_id ||
    !["USED", "CONFIRMED"].includes(s.status)
  )
    fail(422, "不能冲销该记录");
  return withMutation(
    {
      pool,
      actor,
      termId: s.term_id,
      studentIds: [s.student_id],
      command,
      action: "reverse",
    },
    async (c, term) => {
      const scope=await assertScope(
        {
          actor,
          studentKey: {
            schoolId: actor.schoolId,
            termId: s.term_id,
            studentId: s.student_id,
          },
          action: require('../core/reportCoreV2Policy').isV2(term.evaluation_config)?'reverse':'score',
          fields: [s.target_key],
        },
        c,
      );
      if(require('../core/reportCoreV2Policy').isV2(term.evaluation_config) && !scope.head && String(s.owner_teacher_id || s.actor_id)!==actor.id)fail(403,'仅原评价教师或本班班主任可更正');
      const [[old]] = await c.query(
        "SELECT id FROM evaluation_source_record WHERE original_id=? AND record_kind='REVERSAL'",
        [sourceId],
      );
      if (old) fail(409, "已冲销");
      await addSource(c, {
        schoolId: actor.schoolId,
        termId: s.term_id,
        studentId: s.student_id,
        actorId: actor.id,
        sourceType: "CARD",
        kind: "REVERSAL",
        originalId: sourceId,
        target: s.target_key,
        status: "CONFIRMED",
        delta: -1,
        key: ["REVERSE", sourceId],
        payload: { reason },
      });
      return {
        result: { reversed: true },
        changedTargetsByStudent: { [s.student_id]: [s.target_key] },
      };
    },
  );
}

module.exports={previewCard,redeemCard,directScore,reverseSource};
