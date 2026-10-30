const { stableHash, fail } = require("./reportCorePolicy");
const { resolveActorContext } = require("./authorizationService");
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v || {});
async function getTerm(connection, schoolId, termId, lock = false) {
  if (![false, true, 'shared', 'exclusive'].includes(lock)) fail(400, '锁模式不合法');
  const [[term]] = await connection.query(
    `SELECT * FROM academic_year WHERE school_id=? AND id=?${lock === 'exclusive' ? ' FOR UPDATE' : lock ? ' FOR SHARE' : ''}`,
    [schoolId, termId],
  );
  if (!term) fail(404, "学期不存在");
  term.evaluation_config = parse(term.evaluation_config);
  return term;
}
async function addSource(c, s) {
  const v2=(s.schemaVersion || c.reportCoreSchemaVersion)==='SIX_EDU_V2';
  const payload = {...(s.payload || {}),...(v2?{schemaVersion:'SIX_EDU_V2'}:{})};
  const [r] = await c.query(
    `INSERT INTO evaluation_source_record(school_id,term_id,student_id,source_type,record_kind,parent_id,original_id,owner_teacher_id,actor_id,month_key,target_key,group_key,record_ordinal,version,business_key,payload_hash,status,delta,payload_json,token_hash,token_ciphertext,valid_from,valid_until,next_attempt_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      s.schoolId,
      s.termId,
      s.studentId || null,
      s.sourceType ?? null,
      s.kind,
      s.parentId || null,
      s.originalId || null,
      s.ownerId || null,
      s.actorId || null,
      s.monthKey || null,
      s.target || null,
      s.groupKey || null,
      s.ordinal || null,
      s.version || 1,
      stableHash(s.key),
      stableHash(payload),
      s.status,
      s.delta ?? null,
      JSON.stringify(payload),
      s.tokenHash || null,
      s.tokenCipher || null,
      s.validFrom || null,
      s.validUntil || null,
      s.nextAttempt || null,
    ],
  );
  if(v2)await c.query(`UPDATE evaluation_source_record SET schema_version='SIX_EDU_V2',event_type=?,dimension_code=?,subject_code=?,effect_key=?,submitted_at=?,effective_at=?,numeric_value=?,story_content_id=?,current_version_id=? WHERE school_id=? AND id=?`,[
    s.eventType || `${s.sourceType || 'SYSTEM'}_${s.kind}`,s.dimensionCode || null,s.subjectCode || null,s.effectKey || null,s.submittedAt || (['ITEM','FORM','DIRECT'].includes(s.kind)?new Date():null),s.effectiveAt || null,s.numericValue??null,s.storyContentId || null,s.currentVersionId || null,s.schoolId,r.insertId,
  ]);
  return String(r.insertId);
}
async function executeMutation(
  { pool, actor, termId, studentIds = [], command, action, termLock = 'shared' },
  mutate,
) {
  if (
    !command?.requestKey ||
    command.requestKey.length > 128 ||
    !command.payloadHash
  )
    fail(400, "requestKey与载荷必需");
  const key = stableHash([
    "CMD",
    actor.schoolId,
    actor.id,
    action,
    command.requestKey,
  ]);
  const replay = async (c) => {
    const [[row]] = await c.query(
      "SELECT payload_hash,response_json FROM evaluation_source_record WHERE school_id=? AND business_key=?",
      [actor.schoolId, key],
    );
    if (!row) return null;
    if (row.payload_hash !== command.payloadHash)
      fail(409, "同一请求键内容不一致");
    return { ...parse(row.response_json), replayed: true };
  };
  let result = await replay(pool);
  if (result) {
    await resolveActorContext(
      {
        userId: actor.id,
        schoolId: actor.schoolId,
        tokenVersion: actor.tokenVersion,
      },
      pool,
    );
    return result;
  }
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const observed=await getTerm(c,actor.schoolId,termId);
    const v2=require('./reportCoreV2Policy').isV2(observed.evaluation_config);
    const term = await getTerm(c, actor.schoolId, termId, v2?'exclusive':termLock);
    c.reportCoreSchemaVersion=v2?'SIX_EDU_V2':null;
    await resolveActorContext(
      {
        userId: actor.id,
        schoolId: actor.schoolId,
        tokenVersion: actor.tokenVersion,
      },
      c,
    );
    if (term.release_status !== "IDLE") fail(423, "全校发布期间暂停修改");
    require('./reportCoreV2Lifecycle').assertV2Phase(term,{action,actor});
    for (const id of [...new Set(studentIds.map(String))].sort((a, b) =>
      BigInt(a) < BigInt(b) ? -1 : 1,
    ))
      await c.query(
        "SELECT id FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=? FOR UPDATE",
        [actor.schoolId, termId, id],
      );
    result = await replay(c);
    if (result) {
      await c.rollback();
      return result;
    }
    const changed = await mutate(c, term);
    const revisions = {};
    for (const [studentId, targets] of Object.entries(
      changed.changedTargetsByStudent || {},
    )) {
      const { rebuildEvaluation } = require("./reportCoreProjection");
      const next = await rebuildEvaluation({
        connection: c,
        studentKey: { schoolId: actor.schoolId, termId, studentId },
        targets,
        config: term.evaluation_config,
      });
      const keys = Object.keys(next.values);
      const sets = keys.map((k) => `\`${k}\`=?`);
      const params = keys.map((k) =>
        typeof next.values[k] === "object" && next.values[k] !== null
          ? JSON.stringify(next.values[k])
          : next.values[k],
      );
      await c.query(
        `UPDATE student_term_evaluation SET ${sets.length ? sets.join(",") + "," : ""}field_sources=?,section_meta=?,revision=revision+1,status='DRAFT',confirmed_revision=NULL,confirmed_by=NULL,confirmed_at=NULL,approval_fingerprint=NULL,updated_by=? WHERE school_id=? AND term_id=? AND student_id=?`,
        [
          ...params,
          JSON.stringify(next.fieldSources),
          JSON.stringify(next.sectionMeta),
          actor.id,
          actor.schoolId,
          termId,
          studentId,
        ],
      );
      const [[e]] = await c.query(
        "SELECT revision FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?",
        [actor.schoolId, termId, studentId],
      );
      revisions[studentId] = String(e.revision);
    }
    if(v2 && Object.keys(changed.changedTargetsByStudent || {}).length) {
      await c.query('UPDATE academic_year SET data_revision=data_revision+1 WHERE school_id=? AND id=?',[actor.schoolId,termId]);
      await require('./reportCoreV2Statistics').rebuildV2Scope(c,term,changed.changedTargetsByStudent);
      for(const studentId of Object.keys(revisions)) {
        const [[row]]=await c.query('SELECT revision FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?',[actor.schoolId,termId,studentId]);
        revisions[studentId]=String(row.revision);
      }
    }
    const response = { result: changed.result, replayed: false, revisions };
    await c.query(
      "INSERT INTO evaluation_source_record(school_id,term_id,actor_id,record_kind,business_key,payload_hash,status,payload_json,response_json) VALUES(?,?,?,'AUDIT',?,?,'COMMITTED',?,?)",
      [
        actor.schoolId,
        termId,
        actor.id,
        key,
        command.payloadHash,
        JSON.stringify({ action, requestKey: command.requestKey }),
        JSON.stringify(response),
      ],
    );
    await c.commit();
    return response;
  } catch (e) {
    await c.rollback();
    if (e.code === "ER_DUP_ENTRY") {
      const old = await replay(pool);
      if (old) return old;
    }
    throw e;
  } finally {
    c.release();
  }
}
async function withMutation(args,mutate) {
  for(let attempt=0;attempt<3;attempt++) {
    try{return await executeMutation(args,mutate);}catch(error){if(!['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error.code)||attempt===2)throw error;}
  }
}
module.exports = { parse, getTerm, addSource, withMutation };
