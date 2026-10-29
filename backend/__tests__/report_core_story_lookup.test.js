const {test}=require('node:test');const assert=require('node:assert/strict');
const {createCoreTestDb}=require('./helpers/reportCoreDb');const story=require('../services/reportCoreStories');const {addSource}=require('../services/reportCoreStore');
const actor={id:'3',schoolId:'1',role:'student',tokenVersion:1};let n=0;const command=()=>({requestKey:'lookup-'+ ++n,payloadHash:String(n).padStart(64,'0')});
const articles=['READ','LISTEN','TELL'].map(category=>({category,text:`${category}我理解了帮助别人的意义。`}));
const identity=b=>({expectedBatchId:b.batchId,expectedVersion:b.version,expectedRevision:b.revision});
test('stories accept 20000 Unicode codepoints and reject 20001 and a fourth article per category',()=>{
 for(const length of [10000,10001,20000])assert.equal([...story.normalizeArticles([{category:'READ',text:'😀'.repeat(length)}])[0].text].length,length);
 assert.throws(()=>story.normalizeArticles([{category:'READ',text:'😀'.repeat(20001)}]),{statusCode:422});
 assert.throws(()=>story.normalizeArticles(Array(4).fill(articles[0])),{statusCode:422});
});
test('month lookup reads original submitted items beyond 100 sources and preserves effective results while a new draft exists',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const args={pool:db.pool,actor,termId:'1',monthKey:'2026-10'};
 const b=(await story.saveStoryDraft({...args,articles,command:command()})).result;
 await story.submitStoryBatch({...args,batchId:b.batchId,expectedRevision:'1',command:command()});
 for(let i=0;i<105;i++)await addSource(db.pool,{schoolId:'1',termId:'1',studentId:'3',sourceType:'SELF',kind:'FORM',status:'SUBMITTED',key:['noise',i]});
 let view=await story.getStudentStoryMonth(args);assert.equal(view.effectiveBatch.batchId,b.batchId);assert.equal(view.articles.length,3);assert.equal(view.articles[0].text,articles[0].text);
 const draft=(await story.saveStoryDraft({...args,...identity(view.latestBatch),articles:[articles[0]],command:command()})).result;
 view=await story.getStudentStoryMonth(args);assert.equal(view.draftBatch.batchId,draft.batchId);assert.equal(view.effectiveBatch.batchId,b.batchId);
 const listing=await require('../services/reportCoreSources').listSources({...args,sourceType:'STORY',recordKind:'BATCH',latest:true});assert.equal(listing.rows.length,1);assert.equal(String(listing.rows[0].id),draft.batchId);
 assert.equal((await story.getStudentStoryMonth({...args,monthKey:'2026-11'})).latestBatch,null);
 await assert.rejects(story.getStudentStoryMonth({...args,studentId:'4'}),{statusCode:403});
 await assert.rejects(story.getStudentStoryMonth({...args,actor:{...actor,role:'teacher',id:'2'}}),{statusCode:403});
});
test('stale_revision_one_draft_cannot_replace_new_batch and old_batch_submit_cannot_supersede_newer_submission',async t=>{
 const db=await createCoreTestDb(t);await db.seedBase();const args={pool:db.pool,actor,termId:'1',monthKey:'2026-10'};
 const first=(await story.saveStoryDraft({...args,articles,command:command()})).result;
 const second=(await story.saveStoryDraft({...args,...identity(first),articles,command:command()})).result;
 await assert.rejects(story.saveStoryDraft({...args,...identity(first),articles,command:command()}),{statusCode:409});
 await assert.rejects(story.submitStoryBatch({...args,batchId:first.batchId,expectedRevision:'1',command:command()}),{statusCode:409});
 await story.submitStoryBatch({...args,batchId:second.batchId,expectedRevision:'1',command:command()});
 assert.equal((await story.getStudentStoryMonth(args)).effectiveBatch.batchId,second.batchId);
});
