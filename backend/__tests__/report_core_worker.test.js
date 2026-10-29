const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test("only one worker leases a queued certificate and expired processing can be recovered", async (t) => {
  const db = await createCoreTestDb(t);
  await db.seedBase();
  const { addSource } = require("../services/reportCoreStore");
  await addSource(db.pool, {
    schoolId: "1",
    termId: "1",
    studentId: "3",
    sourceType: "CERTIFICATE",
    kind: "ITEM",
    status: "QUEUED",
    payload: { fileRef: "fixture" },
    key: ["worker", 1],
  });
  const { claimAssessmentJobs } = require("../services/reportCoreWorker");
  const jobs = await Promise.all([
    claimAssessmentJobs({
      pool: db.pool,
      now: new Date(),
      limit: 2,
      leaseSeconds: 90,
    }),
    claimAssessmentJobs({
      pool: db.pool,
      now: new Date(),
      limit: 2,
      leaseSeconds: 90,
    }),
  ]);
  assert.equal(jobs.flat().length, 1);
  await db.pool.query(
    "UPDATE evaluation_source_record SET locked_until=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE record_kind='ITEM'",
  );
  assert.equal(
    (
      await claimAssessmentJobs({
        pool: db.pool,
        now: new Date(),
        limit: 2,
        leaseSeconds: 90,
      })
    ).length,
    1,
  );
});
test('controlled provider fixture drains 36 actual story jobs with concurrency two and one retried rate limit',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const [[u]]=await db.pool.query('SELECT password FROM users WHERE id=3');
 for(let id=5;id<=14;id++){await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role,grade,class_no) VALUES(?,1,?,?,?,'student',4,1)",[id,'queue'+id,u.password,'队列样本'+id]);await db.pool.query("INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES(1,1,?,?,4,1,'CORE_V1','1')",[id,'队列样本'+id]);}
 const stories=require('../services/reportCoreStories');let sequence=0,now=new Date(),running=0,maxRunning=0,calls=0,rateLimited=false;const times=[];
 const command=()=>({requestKey:'queue-fixture-'+ ++sequence,payloadHash:String(sequence).padStart(64,'0')});
 for(let id=3;id<=14;id++){const actor={id:String(id),schoolId:'1',role:'student',tokenVersion:1},batch=await stories.saveStoryDraft({pool:db.pool,actor,termId:'1',monthKey:'2026-10',articles:['READ','LISTEN','TELL'].map(category=>({category,text:`独立夹具${id}：我认真读故事，学会倾听与表达自己的理解。`})),command:command()});await stories.submitStoryBatch({pool:db.pool,actor,batchId:batch.result.batchId,expectedRevision:'1',command:command()});}
 const provider={async scoreStory({text,category}){assert.match(text,/独立夹具/);assert.ok(['READ','LISTEN','TELL'].includes(category));const start=performance.now();running++;maxRunning=Math.max(maxRunning,running);calls++;try{await new Promise(r=>setTimeout(r,25));if(!rateLimited){rateLimited=true;throw Object.assign(Error('controlled fixture rate limit'),{statusCode:503});}return {dimensions:[20,20,20,20],total:80,evidence:[],feedback:'基于夹具文本的固定可控评分，仅供自动化验证'};}finally{times.push(performance.now()-start);running--;}}};
 const worker=require('../services/reportCoreWorker').startCoreWorker({pool:db.pool,provider,clock:()=>now,intervalMs:60000}),start=performance.now();
 try{for(let i=0;i<20;i++)await worker.tick();now=new Date(+now+31000);await worker.tick();}finally{await worker.stop();}
 const [[state]]=await db.pool.query("SELECT SUM(status='SCORED') scored,SUM(status IN ('QUEUED','PROCESSING','FAILED')) pending FROM evaluation_source_record WHERE source_type='STORY' AND record_kind='ITEM'");assert.equal(Number(state.scored),36);assert.equal(Number(state.pending),0);assert.equal(maxRunning,2);assert.equal(calls,37);const [[e]]=await db.pool.query('SELECT story_read_star,story_listen_star,story_tell_star FROM student_term_evaluation WHERE student_id=3');assert.deepEqual(Object.values(e),[2,2,2]);
 const elapsedMs=performance.now()-start;times.sort((a,b)=>a-b);const metrics={fixtureOnly:true,articles:36,providerCalls:calls,retries:1,maxInflight:maxRunning,providerFixtureP95Ms:times[Math.ceil(times.length*.95)-1],elapsedMs,fixtureThroughputPerSecond:36/(elapsedMs/1000),realProviderP95Ms:null,realProviderAvailability:'not measured by automated tests'};const fs=require('node:fs/promises'),path=require('node:path');await fs.mkdir(path.join(__dirname,'../../output/report-core'),{recursive:true});await fs.writeFile(path.join(__dirname,'../../output/report-core/provider-queue-fixture.json'),JSON.stringify(metrics,null,2));
});
