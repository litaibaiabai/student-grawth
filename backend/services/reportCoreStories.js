const {
  withMutation,
  addSource,
  parse,
  stableHash: unused,
} = require("./reportCoreStore");
const { fail, stableHash } = require("./reportCorePolicy");
const { validateScore } = require("./reportCoreProvider");
const { assertScope } = require("./authorizationService");
const categories = ["READ", "LISTEN", "TELL"];
const targets = [
  "story_read_star",
  "story_read_experience",
  "story_listen_star",
  "story_listen_experience",
  "story_tell_star",
  "story_tell_experience",
];
function normalizeArticles(articles, formal = false) {
  if (!Array.isArray(articles) || articles.length > 9) fail(422, "每月最多9篇");
  const counts = { READ: 0, LISTEN: 0, TELL: 0 };
  const result = articles.map((a) => {
    if (!categories.includes(a.category) || typeof a.text !== "string")
      fail(422, "故事类别或正文不合法");
    const text = a.text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    if (!text.trim() || [...text].length > 20000) fail(422, "每篇需1至20000字");
    if (++counts[a.category] > 3) fail(422, "每类最多3篇");
    return {
      category: a.category,
      text,
      title: typeof a.title === "string" ? a.title.slice(0, 100) : "",
      contentHash: stableHash(text),
    };
  });
  if (formal && categories.some((c) => counts[c] < 1))
    fail(422, "读听讲每类至少1篇");
  return result;
}
async function saveStoryDraft({
  pool,
  actor,
  termId,
  monthKey,
  expectedRevision,
  expectedBatchId,
  expectedVersion,
  articles,
  command,
}) {
  if (actor.role !== "student") fail(403, "仅学生本人提交");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) fail(422, "月份不合法");
  const normalized = normalizeArticles(articles);
  return withMutation(
    {
      pool,
      actor,
      termId,
      studentIds: [actor.id],
      command,
      action: "story-draft",
    },
    async (c, term) => {
      await assertScope(
        {
          actor,
          studentKey: { schoolId: actor.schoolId, termId, studentId: actor.id },
          action: "material",
        },
        c,
      );
      const [old] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE school_id=? AND term_id=? AND student_id=? AND source_type='STORY' AND record_kind='BATCH' AND month_key=? ORDER BY version DESC FOR UPDATE",
        [actor.schoolId, termId, actor.id, monthKey],
      );
      const latest = old[0];
      if (latest ? String(latest.id) !== String(expectedBatchId) || String(latest.version) !== String(expectedVersion) || String(latest.revision) !== String(expectedRevision) : [expectedBatchId,expectedVersion,expectedRevision].some(v => v !== undefined && v !== null)) fail(409, '月批次已变化，请重新读取并保留本次输入');
      const version = latest ? latest.version + 1 : 1;
      const groupKey = `STORY:${actor.id}:${monthKey}`;
      const batchId = await addSource(c, {
        schoolId: actor.schoolId,
        termId,
        studentId: actor.id,
        actorId: actor.id,
        sourceType: "STORY",
        kind: "BATCH",
        monthKey,
        groupKey,
        version,
        status: "DRAFT",
        key: [
          "STORY_BATCH",
          actor.schoolId,
          termId,
          actor.id,
          monthKey,
          version,
        ],
        payload: {
          monthKey,
          articles: normalized,
          ruleVersion: term.rule_version,
        },
      });
      return { result: { batchId, revision: "1", version } };
    },
  );
}
async function submitStoryBatch({
  pool,
  actor,
  batchId,
  expectedRevision,
  command,
}) {
  const [[batch]] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE school_id=? AND id=? AND source_type='STORY' AND record_kind='BATCH'",
    [actor.schoolId, batchId],
  );
  if (
    !batch ||
    String(batch.student_id) !== actor.id ||
    actor.role !== "student"
  )
    fail(403, "仅本人提交故事");
  return withMutation(
    {
      pool,
      actor,
      termId: batch.term_id,
      studentIds: [actor.id],
      command,
      action: "story-submit",
    },
    async (c, term) => {
      const [[row]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE",
        [batchId],
      );
      if (
        row.status !== "DRAFT" ||
        String(row.revision) !== String(expectedRevision)
      )
        fail(409, "批次状态已改变");
      if (
        !(term.evaluation_config.requiredMonths || []).includes(row.month_key)
      )
        fail(422, "此月不在应交月份");
      const [[latest]] = await c.query("SELECT id FROM evaluation_source_record WHERE school_id=? AND term_id=? AND student_id=? AND month_key=? AND source_type='STORY' AND record_kind='BATCH' ORDER BY version DESC LIMIT 1 FOR UPDATE", [actor.schoolId,row.term_id,actor.id,row.month_key]);
      if (String(latest.id) !== String(row.id)) fail(409, '已有更新的月度草稿，请刷新后提交');
      const p = parse(row.payload_json),
        articles = normalizeArticles(p.articles, true);
      const [[e]] = await c.query(
        "SELECT grade_snapshot FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?",
        [actor.schoolId, row.term_id, actor.id],
      );
      await c.query(
        "UPDATE evaluation_source_record SET status='SUPERSEDED' WHERE school_id=? AND term_id=? AND student_id=? AND month_key=? AND source_type='STORY' AND record_kind='BATCH' AND id<>?",
        [actor.schoolId, row.term_id, actor.id, row.month_key, batchId],
      );
      await c.query(
        "UPDATE evaluation_source_record SET status='SUPERSEDED' WHERE school_id=? AND term_id=? AND student_id=? AND month_key=? AND source_type='STORY' AND record_kind='ITEM'",
        [actor.schoolId, row.term_id, actor.id, row.month_key],
      );
      const counts = { READ: 0, LISTEN: 0, TELL: 0 };
      for (const a of articles) {
        const ordinal =
          categories.indexOf(a.category) * 3 + ++counts[a.category];
        await addSource(c, {
          schoolId: actor.schoolId,
          termId: row.term_id,
          studentId: actor.id,
          actorId: actor.id,
          sourceType: "STORY",
          kind: "ITEM",
          parentId: batchId,
          monthKey: row.month_key,
          version: row.version,
          ordinal,
          status: "QUEUED",
          key: ["STORY_ITEM", batchId, ordinal],
          payload: {
            ...a,
            grade: e.grade_snapshot,
            scoringRuleVersion: term.rule_version,
          },
        });
      }
      await c.query(
        "UPDATE evaluation_source_record SET status='SUBMITTED',revision=revision+1,payload_json=? WHERE id=?",
        [
          JSON.stringify({
            monthKey: row.month_key,
            ruleVersion: term.rule_version,
            requiredCategories: categories,
            submissionHash: stableHash(articles),
          }),
          batchId,
        ],
      );
      return {
        result: { batchId, itemCount: articles.length },
        changedTargetsByStudent: { [actor.id]: targets },
      };
    },
  );
}
async function applyStoryResult({
  pool,
  job,
  leaseToken,
  contentHash,
  ruleVersion,
  result,
}) {
  validateScore(result);
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
        requestKey: `story-result-${job.id}-${leaseToken}`,
        payloadHash: stableHash(result),
      },
      action: "story-result",
    },
    async (c, term) => {
      const [[row]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE",
        [job.id],
      );
      const p = parse(row.payload_json);
      const [[parent]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=?",
        [row.parent_id],
      );
      if (
        row.status !== "PROCESSING" ||
        row.lease_token !== leaseToken ||
        p.contentHash !== contentHash ||
        p.scoringRuleVersion !== ruleVersion ||
        parent.status !== "SUBMITTED"
      )
        return { result: { applied: false } };
      if (term.rule_version !== ruleVersion) {
        await c.query(
          "UPDATE evaluation_source_record SET status='QUEUED',attempts=0,next_attempt_at=NULL,lease_token=NULL,locked_until=NULL,revision=revision+1,payload_json=? WHERE id=?",
          [
            JSON.stringify({
              ...p,
              scoringRuleVersion: term.rule_version,
              lastError: "评分规则已更新，正在按新规则重试",
            }),
            row.id,
          ],
        );
        return { result: { applied: false, requeued: true } };
      }
      await c.query(
        "UPDATE evaluation_source_record SET status='SCORED',payload_json=?,revision=revision+1,lease_token=NULL,locked_until=NULL WHERE id=?",
        [JSON.stringify({ ...p, score: result, scoreMethod: "MODEL" }), row.id],
      );
      await completeBatch(c, row.parent_id);
      return {
        result: { applied: true },
        changedTargetsByStudent: (term.evaluation_config.requiredMonths || []).includes(row.month_key) ? { [row.student_id]: targets } : {},
      };
    },
  );
}
async function completeBatch(c, batchId) {
  const [[remaining]] = await c.query(
    "SELECT COUNT(*) n FROM evaluation_source_record WHERE parent_id=? AND record_kind='ITEM' AND status<>'SCORED'",
    [batchId],
  );
  if (Number(remaining.n) === 0)
    await c.query(
      "UPDATE evaluation_source_record SET status='SCORED',revision=revision+1 WHERE id=?",
      [batchId],
    );
}
async function reviewStoryItem({
  pool,
  actor,
  itemId,
  expectedRevision,
  dimensions,
  reason,
  command,
}) {
  if (actor.role !== "teacher" || !reason?.trim()) fail(403, "教师复核需理由");
  const [[s]] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE school_id=? AND id=? AND source_type='STORY' AND record_kind='ITEM'",
    [actor.schoolId, itemId],
  );
  if (!s) fail(404, "故事不存在");
  return withMutation(
    {
      pool,
      actor,
      termId: s.term_id,
      studentIds: [s.student_id],
      command,
      action: "story-review",
    },
    async (c) => {
      const scope = await assertScope(
        {
          actor,
          studentKey: {
            schoolId: actor.schoolId,
            termId: s.term_id,
            studentId: s.student_id,
          },
          action: "score",
          fields: ["story_read_star"],
        },
        c,
      );
      const [[row]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE",
        [itemId],
      );
      const [[parent]] = await c.query(
        "SELECT status FROM evaluation_source_record WHERE id=?",
        [row.parent_id],
      );
      if (
        String(row.revision) !== String(expectedRevision) ||
        !["SUBMITTED", "SCORED"].includes(parent.status)
      )
        fail(409, "故事版本已变化");
      const result = {
        dimensions,
        total: dimensions.reduce((a, b) => a + b, 0),
        evidence: [],
        feedback: reason,
        provider: "teacher",
        model: "TEACHER_REVIEW",
      };
      validateScore(result);
      const p = parse(row.payload_json);
      await c.query(
        "UPDATE evaluation_source_record SET status='SCORED',payload_json=?,revision=revision+1,lease_token=NULL,locked_until=NULL WHERE id=?",
        [
          JSON.stringify({
            ...p,
            score: result,
            scoreMethod: "TEACHER_REVIEW",
            reviewerId: actor.id,
          }),
          itemId,
        ],
      );
      await completeBatch(c, row.parent_id);
      return {
        result: { reviewed: true },
        changedTargetsByStudent: { [s.student_id]: targets },
      };
    },
  );
}
async function retryStoryItem({ pool, actor, itemId, command }) {
  const [[s]] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE school_id=? AND id=? AND record_kind='ITEM' AND source_type IN ('STORY','CERTIFICATE')",
    [actor.schoolId, itemId],
  );
  if (!s) fail(404, "材料不存在");
  return withMutation(
    {
      pool,
      actor,
      termId: s.term_id,
      studentIds: [s.student_id],
      command,
      action: "retry-material",
    },
    async (c) => {
      if (actor.role !== "teacher") fail(403, "仅教师重试");
      await assertScope(
        {
          actor,
          studentKey: {
            schoolId: actor.schoolId,
            termId: s.term_id,
            studentId: s.student_id,
          },
          action: "score",
          fields: s.source_type === "STORY" ? ["story_read_star"] : [],
        },
        c,
      );
      if (s.status !== "FAILED") fail(409, "仅失败材料可重试");
      await c.query(
        "UPDATE evaluation_source_record SET status='QUEUED',attempts=0,next_attempt_at=NULL,revision=revision+1 WHERE id=?",
        [itemId],
      );
      return { result: { queued: true } };
    },
  );
}
async function getStudentStoryMonth({pool,actor,termId,monthKey,studentId}) {
  if(actor.role !== 'student' || studentId && String(studentId) !== actor.id) fail(403,'仅本人查看月度故事');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey))fail(422,'月份不合法');
  const c=await pool.getConnection();
  try {
    await c.beginTransaction();
    await assertScope({actor,studentKey:{schoolId:actor.schoolId,termId,studentId:actor.id},action:'material'},c);
    const [batches]=await c.query("SELECT id,version,revision,status,month_key,payload_json FROM evaluation_source_record WHERE school_id=? AND term_id=? AND student_id=? AND source_type='STORY' AND record_kind='BATCH' AND month_key=? ORDER BY version DESC",[actor.schoolId,termId,actor.id,monthKey]);
    const dto=b=>b?{batchId:String(b.id),version:b.version,revision:String(b.revision),status:b.status,monthKey:b.month_key,...(b.status==='DRAFT'?{articles:parse(b.payload_json).articles||[]}: {})}:null;
    const latest=batches[0],effective=batches.find(b=>['SUBMITTED','SCORED'].includes(b.status));
    let articles=[];
    if(effective){const [items]=await c.query("SELECT id,status,record_ordinal,payload_json FROM evaluation_source_record WHERE school_id=? AND parent_id=? AND record_kind='ITEM' ORDER BY record_ordinal",[actor.schoolId,effective.id]);articles=items.map(r=>{const p=parse(r.payload_json);return {id:String(r.id),status:r.status,ordinal:r.record_ordinal,category:p.category,title:p.title||'',text:p.text,score:p.score||null,error:p.lastError||null};});}
    const summary={};for(const item of articles)summary[item.status]=(summary[item.status]||0)+1;
    await c.commit();return {latestBatch:dto(latest),draftBatch:latest?.status==='DRAFT'?dto(latest):null,effectiveBatch:dto(effective),articles,processingSummary:summary};
  }catch(e){await c.rollback();throw e;}finally{c.release();}
}
module.exports = {
  getStudentStoryMonth,
  saveStoryDraft,
  submitStoryBatch,
  applyStoryResult,
  reviewStoryItem,
  retryStoryItem,
  normalizeArticles,
  targets,
};
