const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCoreTestDb}=require('./helpers/reportCoreDb');
const cards=require('../services/reportCoreCards');
const actor={id:'1',schoolId:'1',role:'manager',tokenVersion:1};let seq=0;const command=()=>({requestKey:'quota-batch-'+ ++seq,payloadHash:String(seq).padStart(64,'0')});
test('batch quota preview and commit are atomic, replay once and reject stale plan or >200 teachers',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const [[u]]=await db.pool.query('SELECT password FROM users WHERE id=2');await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) VALUES(5,1,'teacher5',?,'教师5','teacher')",[u.password]);
 const p=await cards.previewQuotaBatch({pool:db.pool,actor,termId:'1',monthKey:'2026-10',entries:[{teacherId:'2',total:100},{teacherId:'5',total:120}],command:command()});
 const args={pool:db.pool,actor,batchId:p.result.batchId,expectedRevision:'1',command:command()};await cards.commitQuotaBatch(args);assert.equal((await cards.commitQuotaBatch(args)).replayed,true);
 const p2=await cards.previewQuotaBatch({pool:db.pool,actor,termId:'1',monthKey:'2026-10',entries:[{teacherId:'2',total:200},{teacherId:'5',total:200}],command:command()});
 await cards.saveQuota({pool:db.pool,actor,termId:'1',monthKey:'2026-10',teacherId:'2',total:110,command:command()});
 await assert.rejects(cards.commitQuotaBatch({pool:db.pool,actor,batchId:p2.result.batchId,expectedRevision:'1',command:command()}),{statusCode:409});
 const [[q]]=await db.pool.query("SELECT payload_json FROM evaluation_source_record WHERE record_kind='QUOTA' AND owner_teacher_id=5");const payload=typeof q.payload_json==='string'?JSON.parse(q.payload_json):q.payload_json;assert.equal(payload.quotaTotal,120);
 await assert.rejects(cards.previewQuotaBatch({pool:db.pool,actor,termId:'1',monthKey:'2026-10',entries:Array.from({length:201},(_,i)=>({teacherId:String(i+1),total:1})),command:command()}),{statusCode:422});
});
