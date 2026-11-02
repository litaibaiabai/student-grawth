const {test}=require('node:test'),assert=require('node:assert/strict');
const {withFormalRollback,storedHashes}=require('./helpers/formalRollback');
const {importRegistryFixture,command,manager}=require('./helpers/registryFixture');
const semester=require('../services/reportCoreSemesterCards'),course=require('../services/reportCoreCourseCards'),cards=require('../services/reportCoreCards');
async function actor(c,username){const[[u]]=await c.query('SELECT * FROM users WHERE school_id=1 AND username=?',[username]);return{id:String(u.id),schoolId:'1',role:u.role,tokenVersion:u.token_version};}
test('teacher reads semester courses and used cards expose no redeemable QR',async()=>withFormalRollback(async({pool,connection:c})=>{
 const args=await importRegistryFixture(pool,c),teacher=await actor(c,args.f.teacher),student=await actor(c,args.f.student),now=new Date('2028-09-15T00:00:00Z');
 const read={pool,actor:teacher,termId:args.termId,now},selection={...read,grade:4,classNo:1,subjectCode:'CHINESE'};
 assert.deepEqual((await course.listCourseCards(read)).courses,[]);await assert.rejects(course.getCourseCardPrint(selection),{statusCode:422});
 await semester.saveSemesterCardSettings({...args,expectedRevision:1,defaultTotal:0,quotas:{CHINESE:1},command:command()});await semester.initializeSemesterCards({...args,expectedRevision:2,command:command()});
 const before=await storedHashes(c),list=await course.listCourseCards(read);assert.equal(list.initializationStatus,'INITIALIZED');assert.equal(list.courses.reduce((n,v)=>n+v.total,0),3);assert.equal(list.canSync,undefined);
 const page=await course.getCourseCardPage(selection);assert.equal(page.rows.length,1);assert.ok(page.rows[0].qrDataUrl.startsWith('data:image/png'));
 const print=await course.getCourseCardPrint(selection);assert.equal(print.rows[0].claimUrl,page.rows[0].claimUrl);
 const pdf=await course.buildCourseCardPdf(selection),chunks=[];for await(const chunk of pdf.stream)chunks.push(chunk);assert.equal(Buffer.concat(chunks).subarray(0,4).toString(),'%PDF');assert.equal(pdf.cardCount,1);
 await course.listCourseCards({...read,now:new Date('2028-10-15T00:00:00Z')});assert.deepEqual(await storedHashes(c),before);
 const other=await actor(c,args.f.other);await assert.rejects(course.getCourseCardPage({...selection,actor:other}),{statusCode:403});
 const token=new URL(page.rows[0].claimUrl).hash.split('card=')[1];
 await c.query('UPDATE student_term_evaluation SET class_no_snapshot=2 WHERE term_id=? AND student_id=?',[args.termId,student.id]);await assert.rejects(cards.redeemCard({pool,actor:student,token:decodeURIComponent(token),now,command:command()}),{statusCode:403});await c.query('UPDATE student_term_evaluation SET class_no_snapshot=1 WHERE term_id=? AND student_id=?',[args.termId,student.id]);
 assert.equal((await cards.redeemCard({pool,actor:student,token:decodeURIComponent(token),now,command:command()})).result.pointsCredited,1);
 const used=(await course.getCourseCardPage(selection)).rows[0];assert.equal(used.status,'used');assert.equal(used.claimUrl,null);assert.equal(used.qrDataUrl,null);
 await assert.rejects(cards.redeemCard({pool,actor:student,token:decodeURIComponent(token),now,command:command()}),{statusCode:409});
 const stats=await require('../services/reportCoreAdminStatistics').getAdminStatistics({...args,tab:'cards'});assert.equal(stats.summary.cardCount,1);assert.equal(stats.summary.totalCount,1);
 const ledger=require('../services/reportCoreLedger'),ledgerSummary=await ledger.getLedgerSummary({pool,actor:teacher,filters:ledger.normalizeLedgerQuery({termId:args.termId},teacher),now,asOf:now.toISOString()});assert.equal(ledgerSummary.generated,3);assert.equal(ledgerSummary.redeemed,1);assert.equal(ledgerSummary.net,1);
 const [[fact]]=await c.query('SELECT effective_at FROM evaluation_source_record WHERE id=?',[used.id]);assert.equal(fact.effective_at.toISOString(),now.toISOString());
 const second=await course.getCourseCardPage({...selection,classNo:2}),token2=decodeURIComponent(new URL(second.rows[0].claimUrl).hash.split('card=')[1]);await c.query('UPDATE student_term_evaluation SET class_no_snapshot=2 WHERE term_id=? AND student_id=?',[args.termId,student.id]);await assert.rejects(cards.redeemCard({pool,actor:student,token:token2,now:new Date('2029-01-31T16:00:00Z'),command:command()}),{statusCode:422});assert.equal((await cards.redeemCard({pool,actor:student,token:token2,now:new Date('2029-01-31T15:59:59Z'),command:command()})).result.pointsCredited,1);
}));
test('legacy monthly batches aggregate by semester without generation or source changes',async()=>withFormalRollback(async({pool,connection:c})=>{
 const a=await actor(c,'teacher_lin'),before=await storedHashes(c),list=await course.listCourseCards({pool,actor:a,termId:'1',now:new Date('2026-11-02T00:00:00Z')});
 assert.equal(list.initializationStatus,'LEGACY_LOCKED');assert.equal(list.courses.reduce((n,r)=>n+r.total,0),1080);assert.deepEqual(await storedHashes(c),before);
 const admin=await manager(c);await assert.rejects(course.listCourseCards({pool,actor:admin,termId:'1'}),{statusCode:403});
}));
