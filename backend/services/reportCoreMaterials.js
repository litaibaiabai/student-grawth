const { withMutation, addSource, parse } = require("./reportCoreStore");
const {
  fail,
  byColumn,
  validateValue,
  stableHash,
} = require("./reportCorePolicy");
const { assertScope } = require("./authorizationService");
const { savePrivateFile, removePrivateFile } = require("../utils/privateFiles");
async function submitCertificate({ pool, actor, termId, file, command }) {
  if (actor.role !== "student") fail(403, "仅学生本人上传");
  const saved = await savePrivateFile(file);
  try {
    const r = await withMutation(
      {
        pool,
        actor,
        termId,
        studentIds: [actor.id],
        command,
        action: "certificate-upload",
      },
      async (c) => {
        await assertScope(
          {
            actor,
            studentKey: {
              schoolId: actor.schoolId,
              termId,
              studentId: actor.id,
            },
            action: "material",
          },
          c,
        );
        const sourceId = await addSource(c, {
          schoolId: actor.schoolId,
          termId,
          studentId: actor.id,
          sourceType: "CERTIFICATE",
          kind: "ITEM",
          actorId: actor.id,
          status: "QUEUED",
          key: ["AWARD", actor.id, command.requestKey],
          payload: { ...saved, facts: {}, outputs: {} },
        });
        return {
          result: { sourceId },
          changedTargetsByStudent: { [actor.id]: [] },
        };
      },
    );
    if (r.replayed) await removePrivateFile(saved.fileRef);
    return r;
  } catch (e) {
    await removePrivateFile(saved.fileRef);
    throw e;
  }
}
async function getCertificate(pool, actor, sourceId) {
  const [[s]] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE id=? AND school_id=? AND source_type='CERTIFICATE'",
    [sourceId, actor.schoolId],
  );
  if (!s) fail(404, "奖状不存在");
  return s;
}
async function decideCertificate({
  pool,
  actor,
  sourceId,
  expectedRevision,
  facts,
  targets,
  manualOutputs,
  reason,
  command,
  reject = false,
}) {
  if (actor.role !== "teacher") fail(403, "仅教师审核");
  const s = await getCertificate(pool, actor, sourceId);
  return withMutation(
    {
      pool,
      actor,
      termId: s.term_id,
      studentIds: [s.student_id],
      command,
      action: "award-decision",
    },
    async (c, term) => {
      const [[row]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE",
        [sourceId],
      );
      if (
        String(row.revision) !== String(expectedRevision) ||
        ["REVOKED", "REJECTED", "APPROVED"].includes(row.status)
      )
        fail(409, "奖状版本已变化");
      const p = parse(row.payload_json);
      if (reject) {
        await assertScope(
          {
            actor,
            studentKey: {
              schoolId: actor.schoolId,
              termId: s.term_id,
              studentId: s.student_id,
            },
            action: "score",
          },
          c,
        );
        await c.query(
          "UPDATE evaluation_source_record SET status='REJECTED',revision=revision+1,payload_json=? WHERE id=?",
          [
            JSON.stringify({ ...p, reviewReason: reason || "不予认定" }),
            sourceId,
          ],
        );
        return {
          result: { rejected: true },
          changedTargetsByStudent: {
            [s.student_id]: Object.keys(p.outputs || {}),
          },
        };
      }
      if (!Array.isArray(targets) || !targets.length || targets.length > 30)
        fail(422, "请选择成果目标");
      await assertScope(
        {
          actor,
          studentKey: {
            schoolId: actor.schoolId,
            termId: s.term_id,
            studentId: s.student_id,
          },
          action: "score",
          fields: targets,
        },
        c,
      );
      const outputs = {};
      for (const target of targets) {
        const f = byColumn.get(target);
        if (
          f?.sourceType !== "CERTIFICATE" &&
          !["sports_specialties", "art_specialties"].includes(target)
        )
          fail(422, "不是奖状生成字段");
        let value = manualOutputs?.[target];
        if (value !== undefined && !reason?.trim()) fail(422, "人工认定需理由");
        if (value === undefined) {
          const mapping = (
            term.evaluation_config.certificateMappings || []
          ).find(
            (m) =>
              m.target === target &&
              m.awardLevel === (facts || p.facts).awardLevel &&
              m.prizeLevel === (facts || p.facts).prizeLevel,
          );
          if (!mapping) fail(422, "尚无成果映射，请人工认定并注明理由");
          value = mapping.value;
        }
        if (["sports_specialties", "art_specialties"].includes(target)) {
          if (
            !Array.isArray(value) ||
            value.some(
              (v) =>
                !v.name ||
                typeof v.name !== "string" ||
                typeof v.outcome !== "string" ||
                [...v.name].length > 80 ||
                [...v.outcome].length > 500,
            )
          )
            fail(422, "特长项目不合法");
          value = value.map((v) => ({
            id: `award-${sourceId}-${stableHash(v.name).slice(0, 12)}`,
            name: v.name,
            outcome: v.outcome,
          }));
        } else value = validateValue(target, value, term.evaluation_config);
        outputs[target] = value;
      }
      const payload = {
        ...p,
        facts: facts || p.facts,
        approvedTargets: targets,
        outputs,
        reviewReason: reason,
        recognitionMethod: manualOutputs ? "TEACHER_REVIEW" : "MODEL",
        reviewerId: actor.id,
      };
      await c.query(
        "UPDATE evaluation_source_record SET status='APPROVED',payload_json=?,revision=revision+1,lease_token=NULL,locked_until=NULL WHERE id=?",
        [JSON.stringify(payload), sourceId],
      );
      return {
        result: { sourceId },
        changedTargetsByStudent: {
          [s.student_id]: [
            ...new Set([...Object.keys(p.outputs || {}), ...targets]),
          ],
        },
      };
    },
  );
}
async function revokeCertificate({ pool, actor, sourceId, reason, command }) {
  const s = await getCertificate(pool, actor, sourceId);
  return withMutation(
    {
      pool,
      actor,
      termId: s.term_id,
      studentIds: [s.student_id],
      command,
      action: "award-revoke",
    },
    async (c) => {
      await assertScope(
        {
          actor,
          studentKey: {
            schoolId: actor.schoolId,
            termId: s.term_id,
            studentId: s.student_id,
          },
          action: actor.role === "student" ? "material" : "score",
          fields: Object.keys(parse(s.payload_json).outputs || {}),
        },
        c,
      );
      const [[row]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE",
        [sourceId],
      );
      if (row.status === "REVOKED") fail(409, "已撤回");
      const p = parse(row.payload_json);
      await c.query(
        "UPDATE evaluation_source_record SET status='REVOKED',revision=revision+1,payload_json=? WHERE id=?",
        [JSON.stringify({ ...p, revokeReason: reason }), sourceId],
      );
      return {
        result: { revoked: true },
        changedTargetsByStudent: {
          [s.student_id]: Object.keys(p.outputs || {}),
        },
      };
    },
  );
}
async function applyCertificateFacts({ pool, job, leaseToken, result }) {
  const [[u]] = await pool.query("SELECT token_version FROM users WHERE id=?", [
    job.actor_id,
  ]);
  const actor = {
    id: String(job.actor_id),
    schoolId: String(job.school_id),
    role: "student",
    tokenVersion: u.token_version,
  };
  return withMutation(
    {
      pool,
      actor,
      termId: job.term_id,
      studentIds: [job.student_id],
      command: {
        requestKey: `award-facts-${job.id}-${leaseToken}`,
        payloadHash: stableHash(result),
      },
      action: "award-facts",
    },
    async (c) => {
      const [[row]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE",
        [job.id],
      );
      if (row.status !== "PROCESSING" || row.lease_token !== leaseToken)
        return { result: { applied: false } };
      const p = parse(row.payload_json);
      await c.query(
        "UPDATE evaluation_source_record SET status='SUBMITTED',payload_json=?,revision=revision+1,lease_token=NULL,locked_until=NULL WHERE id=?",
        [
          JSON.stringify({ ...p, facts: result, recognitionMethod: "MODEL" }),
          job.id,
        ],
      );
      return {
        result: { applied: true },
        changedTargetsByStudent: { [job.student_id]: [] },
      };
    },
  );
}
module.exports = {
  submitCertificate,
  decideCertificate,
  revokeCertificate,
  applyCertificateFacts,
  getCertificate,
};
