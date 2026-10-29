const { getTerm, parse, addSource } = require("./reportCoreStore");
const { stableHash, fail } = require("./reportCorePolicy");
const { resolveActorContext, assertScope } = require("./authorizationService");
const {
  missingItems,
  reportFingerprint,
  buildReportModel,
} = require("./reportCoreEvaluation");
const { renderPrintableA4 } = require("./reportRenderService");
async function getReadiness({ pool, actor, termId }) {
  if (actor.role !== 'manager') fail(403, '仅管理员查看发布状态');
  if (typeof pool.getConnection === 'function') {
    const connection = await pool.getConnection();
    try { await connection.beginTransaction(); const result = await getReadiness({pool:connection,actor,termId}); await connection.commit(); return result; }
    catch(error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  if (actor.role !== "manager") fail(403, "仅管理员查看发布状态");
  const term = await getTerm(pool, actor.schoolId, termId);
  const {resolveTermRoster,getBlockingMaterials,evaluateCompletion}=require('./reportCoreReadModels');
  const rows=await resolveTermRoster({connection:pool,schoolId:actor.schoolId,termId});
  const blocking=await getBlockingMaterials({connection:pool,schoolId:actor.schoolId,termId,config:term.evaluation_config});
  const byStudent=new Map();for(const row of blocking){const id=String(row.student_id);if(!byStudent.has(id))byStudent.set(id,[]);byStudent.get(id).push(row);}
  const missing = [];
  let confirmed = 0;
  for (const e of rows) {
    if (!e.id) {
      missing.push({
        studentId: String(e.user_id),
        field: "roster",
        reason: "缺少学期学籍",
      });
      continue;
    }
    const items = evaluateCompletion({evaluation:e,config:term.evaluation_config,blockingMaterials:byStudent.get(String(e.student_id))||[]}).missingItems;
    missing.push(
      ...items.map((i) => ({ ...i, studentId: String(e.student_id) })),
    );
    if (
      e.status !== "CONFIRMED" ||
      String(e.confirmed_revision) !== String(e.revision) ||
      e.approval_fingerprint !== reportFingerprint(e, term)
    )
      missing.push({
        studentId: String(e.student_id),
        field: "confirmation",
        reason: "班主任确认未完成或已失效",
      });
    else confirmed++;
  }
  return {
    complete: rows.length > 0 && !missing.length,
    missing,
    counts: { total: rows.length, confirmed },
    releaseStatus: term.release_status,
  };
}
function releaseInfo(term) {
  const state = parse(term.release_state),
    manifest = parse(term.release_manifest);
  return {
    releaseKey: term.release_key,
    releaseVersion: term.release_target_version,
    fence: String(term.release_fence),
    status: term.release_status,
    total: manifest.students?.length || 0,
    prepared: state.prepared || 0,
    activeVersion: term.active_release_version,
  };
}
async function releaseMutation({ pool, actor, termId, command, action }, fn) {
  if (actor.role !== "manager") fail(403, "仅管理员发布");
  if (!command?.requestKey) fail(400, "缺少请求键");
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [[row]] = await c.query(
      "SELECT * FROM academic_year WHERE school_id=? AND id=? FOR UPDATE",
      [actor.schoolId, termId],
    );
    if (!row) fail(404, "学期不存在");
    await resolveActorContext(
      {
        userId: actor.id,
        schoolId: actor.schoolId,
        tokenVersion: actor.tokenVersion,
      },
      c,
    );
    const key = stableHash([
      "CMD",
      actor.schoolId,
      actor.id,
      action,
      command.requestKey,
    ]);
    const [[old]] = await c.query(
      "SELECT * FROM evaluation_source_record WHERE business_key=? AND school_id=?",
      [key, actor.schoolId],
    );
    if (old) {
      if (old.payload_hash !== command.payloadHash) fail(409, "请求内容已改变");
      await c.rollback();
      return parse(old.response_json);
    }
    row.evaluation_config = parse(row.evaluation_config);
    const r = await fn(c, row);
    await c.query(
      "INSERT INTO evaluation_source_record(school_id,term_id,actor_id,record_kind,business_key,payload_hash,status,payload_json,response_json) VALUES(?,?,?,'AUDIT',?,?,'COMMITTED',?,?)",
      [
        actor.schoolId,
        termId,
        actor.id,
        key,
        command.payloadHash,
        JSON.stringify({ action }),
        JSON.stringify(r),
      ],
    );
    await c.commit();
    return r;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
async function beginRelease(args) {
  return releaseMutation(
    { ...args, action: "begin-release" },
    async (c, term) => {
      if (term.release_status !== "IDLE") fail(423, "已有发布正在准备");
      const readiness = await getReadiness({
        pool: c,
        actor: args.actor,
        termId: args.termId,
      });
      if (!readiness.complete)
        fail(422, `全校尚有${readiness.missing.length}项待完成`);
      const students = await require('./reportCoreReadModels').resolveTermRoster({connection:c,schoolId:args.actor.schoolId,termId:args.termId});
      const key = stableHash([
        "RELEASE",
        args.actor.schoolId,
        args.termId,
        args.command.requestKey,
      ]);
      const manifest = {
        students: students.map((e) => ({
          studentId: String(e.student_id),
          revision: String(e.revision),
          fingerprint: e.approval_fingerprint,
        })),
        templateVersion: term.template_version,
        ruleVersion: term.rule_version,
        configVersion: term.config_version,
      };
      const [[max]] = await c.query(
        "SELECT MAX(release_version) version FROM term_report WHERE school_id=? AND term_id=?",
        [args.actor.schoolId, args.termId],
      );
      const version = Number(max.version || 0) + 1;
      await c.query(
        "UPDATE academic_year SET release_status='PREPARING',release_key=?,release_target_version=?,release_fence=release_fence+1,release_manifest=?,release_state=? WHERE id=?",
        [
          key,
          version,
          JSON.stringify(manifest),
          JSON.stringify({ prepared: 0, actorId: args.actor.id }),
          args.termId,
        ],
      );
      const updated = await getTerm(c, args.actor.schoolId, args.termId);
      return releaseInfo(updated);
    },
  );
}
function fenceGuard(term, key, fence) {
  if (
    term.release_key !== key ||
    String(term.release_fence) !== String(fence) ||
    !["PREPARING", "READY", "FAILED"].includes(term.release_status)
  )
    fail(409, "发布批次或执行版本已变化");
}
async function prepareReleaseChunk({
  pool,
  termId,
  releaseKey,
  fence,
  limit = 50,
}) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [[term]] = await c.query(
      "SELECT * FROM academic_year WHERE id=? FOR UPDATE",
      [termId],
    );
    if (!term) fail(404, "学期不存在");
    fenceGuard(term, releaseKey, fence);
    const manifest = parse(term.release_manifest);
    term.evaluation_config = parse(term.evaluation_config);
    const [prepared] = await c.query(
      "SELECT student_id FROM term_report WHERE school_id=? AND term_id=? AND release_key=?",
      [term.school_id, termId, releaseKey],
    );
    const done = new Set(prepared.map((r) => String(r.student_id)));
    const todo = manifest.students
      .filter((s) => !done.has(s.studentId))
      .slice(0, Math.max(1, Math.min(limit, 50)));
    for (const s of todo) {
      const [[e]] = await c.query(
        "SELECT * FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?",
        [term.school_id, termId, s.studentId],
      );
      if (
        !e ||
        String(e.revision) !== s.revision ||
        e.approval_fingerprint !== s.fingerprint ||
        e.status !== "CONFIRMED"
      )
        fail(409, "准备期间来源变化");
      const model = buildReportModel({
        evaluation: e,
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
      model.ruleVersion = term.rule_version;
      model.configVersion = String(term.config_version);
      model.fingerprint = s.fingerprint;
      const renderedDetailHtml=renderPrintableA4({reportData:model,renderScope:'DETAIL_ONLY'});
      const snapshot=JSON.parse(JSON.stringify({...model,renderedHtml:renderPrintableA4({reportData:model}),renderedDetailHtml,renderedDetailHash:stableHash(renderedDetailHtml)}));
      const [[max]] = await c.query(
        "SELECT MAX(version) n FROM term_report WHERE school_id=? AND term_id=? AND student_id=?",
        [term.school_id, termId, s.studentId],
      );
      await c.query(
        "INSERT INTO term_report(school_id,term_id,student_id,version,release_version,release_key,schema_version,template_version,rule_version,source_revision,approval_fingerprint,snapshot_json,snapshot_hash,status) VALUES(?,?,?,?,?,?,'CORE_V1',?,?,?,?,?,?,'PREPARED')",
        [
          term.school_id,
          termId,
          s.studentId,
          Number(max.n || 0) + 1,
          term.release_target_version,
          releaseKey,
          term.template_version,
          term.rule_version,
          e.revision,
          s.fingerprint,
          JSON.stringify(snapshot),
          stableHash(snapshot),
        ],
      );
    }
    const count = done.size + todo.length;
    await c.query(
      "UPDATE academic_year SET release_status=?,release_state=? WHERE id=?",
      [
        count === manifest.students.length ? "READY" : "PREPARING",
        JSON.stringify({ prepared: count }),
        termId,
      ],
    );
    await c.commit();
    return releaseInfo({
      ...term,
      release_status:
        count === manifest.students.length ? "READY" : "PREPARING",
      release_state: { prepared: count },
    });
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
async function activateRelease(args) {
  return releaseMutation(
    { ...args, action: "activate-release" },
    async (c, term) => {
      fenceGuard(term, args.releaseKey, args.fence);
      if (term.release_status !== "READY") fail(422, "尚未准备完成");
      const manifest = parse(term.release_manifest);
      const [[count]] = await c.query(
        "SELECT COUNT(*) n FROM term_report WHERE school_id=? AND term_id=? AND release_key=? AND status='PREPARED'",
        [term.school_id, term.id, args.releaseKey],
      );
      if (Number(count.n) !== manifest.students.length)
        fail(409, "准备报告数不符");
      for (const s of manifest.students) {
        const [[e]] = await c.query(
          "SELECT revision,confirmed_revision,status,approval_fingerprint FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?",
          [term.school_id, term.id, s.studentId],
        );
        if (
          !e ||
          e.status !== "CONFIRMED" ||
          String(e.revision) !== s.revision ||
          String(e.confirmed_revision) !== s.revision ||
          e.approval_fingerprint !== s.fingerprint
        )
          fail(409, "确认数据已变化");
      }
      await c.query(
        "UPDATE term_report SET status='PUBLISHED',published_at=UTC_TIMESTAMP(6) WHERE school_id=? AND term_id=? AND release_key=? AND status='PREPARED'",
        [term.school_id, term.id, args.releaseKey],
      );
      await c.query(
        "UPDATE academic_year SET active_release_version=release_target_version,release_status='IDLE',released_at=UTC_TIMESTAMP(6) WHERE id=?",
        [term.id],
      );
      return releaseInfo({
        ...term,
        active_release_version: term.release_target_version,
        release_status: "IDLE",
      });
    },
  );
}
async function cancelRelease(args) {
  return releaseMutation(
    { ...args, action: "cancel-release" },
    async (c, term) => {
      fenceGuard(term, args.releaseKey, args.fence);
      await c.query(
        "UPDATE academic_year SET release_status='IDLE',release_fence=release_fence+1 WHERE id=?",
        [term.id],
      );
      return {
        ...releaseInfo(term),
        status: "IDLE",
        fence: String(BigInt(term.release_fence) + 1n),
      };
    },
  );
}
async function resumeRelease(args) {
  return releaseMutation(
    { ...args, action: "resume-release" },
    async (c, term) => {
      fenceGuard(term, args.releaseKey, args.fence);
      await c.query(
        "UPDATE academic_year SET release_status='PREPARING',release_fence=release_fence+1 WHERE id=?",
        [term.id],
      );
      return {
        ...releaseInfo(term),
        status: "PREPARING",
        fence: String(BigInt(term.release_fence) + 1n),
      };
    },
  );
}
async function getPublishedReport({
  pool,
  actor,
  termId,
  studentId = actor.id,
  reportId,
}) {
  await assertScope(
    {
      actor,
      studentKey: { schoolId: actor.schoolId, termId, studentId },
      action: "report",
    },
    pool,
  );
  const term = await getTerm(pool, actor.schoolId, termId);
  const params = [actor.schoolId, termId, studentId];
  let condition;
  if (reportId) {
    condition = "AND id=?";
    params.push(reportId);
  } else {
    condition = "AND release_version=?";
    params.push(term.active_release_version);
  }
  const [[r]] = await pool.query(
    `SELECT * FROM term_report WHERE school_id=? AND term_id=? AND student_id=? AND status='PUBLISHED' ${condition} ORDER BY version DESC LIMIT 1`,
    params,
  );
  if (!r) {
    if (reportId) fail(404, "已发布报告不存在");
    return null;
  }
  const snapshot = parse(r.snapshot_json);
  if(snapshot.renderedDetailHtml)require("./reportCoreReportBrowser").validateFrozenSnapshot(snapshot,r);
  return {
    id: String(r.id),
    termId: String(r.term_id),
    studentId: String(r.student_id),
    version: r.version,
    releaseVersion: r.release_version,
    publishedAt: r.published_at,
    snapshot,
    html: renderPrintableA4({ reportData: snapshot }),
  };
}
module.exports = {
  getReadiness,
  beginRelease,
  prepareReleaseChunk,
  activateRelease,
  resumeRelease,
  cancelRelease,
  getPublishedReport,
  releaseInfo,
};
