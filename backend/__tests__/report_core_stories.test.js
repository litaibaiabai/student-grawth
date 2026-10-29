const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("monthly READ LISTEN TELL each need 1–3 texts, scores aggregate and obsolete leases cannot overwrite revisions", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  const story = require("../services/reportCoreStories");
  const { claimAssessmentJobs } = require("../services/reportCoreWorker");
  const actor = { id: "3", schoolId: "1", role: "student", tokenVersion: 1 };
  let n = 0;
  const cmd = () => ({
    requestKey: "story-" + ++n,
    payloadHash: String(n).padStart(64, "0"),
  });
  const args = { pool: db.pool, actor, termId: "1", monthKey: "2026-10" };
  const articles = ["READ", "LISTEN", "TELL"].map((category) => ({
    category,
    text: "虚构文本，我体会到要动脑思考。",
  }));
  const draft = await story.saveStoryDraft({
    ...args,
    articles,
    command: cmd(),
  });
  const id = draft.result.batchId;
  await story.submitStoryBatch({
    pool: db.pool,
    actor,
    batchId: id,
    expectedRevision: "1",
    command: cmd(),
  });
  let jobs = await claimAssessmentJobs({
    pool: db.pool,
    now: new Date(),
    limit: 2,
  });
  for (const job of jobs)
    await story.applyStoryResult({
      pool: db.pool,
      job,
      leaseToken: job.lease_token,
      contentHash: job.payload.contentHash,
      ruleVersion: "1",
      result: {
        dimensions: [20, 20, 20, 25],
        total: 85,
        evidence: ["动脑"],
        feedback: "表达了个人理解",
      },
    });
  jobs = await claimAssessmentJobs({
    pool: db.pool,
    now: new Date(),
    limit: 2,
  });
  await story.applyStoryResult({
    pool: db.pool,
    job: jobs[0],
    leaseToken: jobs[0].lease_token,
    contentHash: jobs[0].payload.contentHash,
    ruleVersion: "1",
    result: {
      dimensions: [20, 20, 20, 25],
      total: 85,
      evidence: ["动脑"],
      feedback: "表达了个人理解",
    },
  });
  assert.equal(
    (
      await db.pool.query(
        "SELECT story_read_star s FROM student_term_evaluation WHERE student_id=3",
      )
    )[0][0].s,
    3,
  );
  const revised = await story.saveStoryDraft({
    ...args,
    articles: articles.map((a) => ({ ...a, text: a.text + "新版" })),
    expectedRevision: "3",
    expectedBatchId: id,
    expectedVersion: 1,
    command: cmd(),
  });
  await story.submitStoryBatch({
    pool: db.pool,
    actor,
    batchId: revised.result.batchId,
    expectedRevision: "1",
    command: cmd(),
  });
  assert.equal(
    (
      await db.pool.query(
        "SELECT story_read_star s FROM student_term_evaluation WHERE student_id=3",
      )
    )[0][0].s,
    null,
  );
  const result = await story.applyStoryResult({
    pool: db.pool,
    job: jobs[0],
    leaseToken: "expired-lease",
    contentHash: jobs[0].payload.contentHash,
    ruleVersion: "1",
    result: {
      dimensions: [25, 25, 25, 25],
      total: 100,
      evidence: [],
      feedback: "旧反馈",
    },
  });
  assert.equal(result.result.applied, false);
  const d = await story.saveStoryDraft({
    ...args,
    monthKey: "2026-11",
    articles: [articles[0]],
    command: cmd(),
  });
  await assert.rejects(
    story.submitStoryBatch({
      pool: db.pool,
      actor,
      batchId: d.result.batchId,
      expectedRevision: "1",
      command: cmd(),
    }),
    { statusCode: 422 },
  );
});
test('inactive story batches do not expose retry or recognition actions',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const {addSource}=require('../services/reportCoreStore');
 const base={schoolId:'1',termId:'1',studentId:'3',sourceType:'STORY',actorId:'3',monthKey:'2026-10'};
 const parentId=await addSource(db.pool,{...base,kind:'BATCH',status:'SUPERSEDED',key:['inactive-parent']});
 const itemId=await addSource(db.pool,{...base,kind:'ITEM',parentId,status:'FAILED',key:['inactive-item'],payload:{text:'旧故事',category:'READ'}});
 const actor={id:'2',schoolId:'1',role:'teacher',tokenVersion:1};const rows=await require('../services/reportCoreSources').listSources({pool:db.pool,actor,termId:'1'});
 const item=rows.rows.find(r=>String(r.id)===itemId);assert.equal(item.canRetry,false);assert.equal(item.canRecognize,false);
 await assert.rejects(require('../services/reportCoreStories').retryStoryItem({pool:db.pool,actor,itemId,command:{requestKey:'inactive-retry',payloadHash:'a'.repeat(64)}}),{statusCode:409});
});
