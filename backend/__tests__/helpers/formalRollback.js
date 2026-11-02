const assert=require('node:assert/strict');
const {stableHash}=require('../../services/reportCorePolicy');
const tables=['users','academic_year','story_content','teacher_teaching_assignment','school_class','evaluation_source_record','student_term_evaluation','term_report'];
function rollbackOnlyPool(c){
 let aborted=false,tail=Promise.resolve(),ordinal=0;
 const check=()=>{if(aborted)throw Error('Verification transaction aborted; further operations forbidden');};
 const query=async(sql,args)=>{check();if(/\b(CREATE|DROP|ALTER|TRUNCATE|USE|COMMIT|ROLLBACK|START\s+TRANSACTION)\b/i.test(sql))throw Error('DDL/transaction control forbidden');try{return sql.startsWith('SET TRANSACTION ISOLATION LEVEL')?[[]]:await c.query(sql,args);}catch(e){aborted=true;throw e;}};
 return{query,getConnection:async()=>{check();let unlock;const next=new Promise(r=>unlock=r),previous=tail;tail=next;await previous;try{check();}catch(e){unlock();throw e;}let savepoint=null;const connection={query,beginTransaction:async()=>{check();savepoint='verify_'+(++ordinal);await c.query('SAVEPOINT '+savepoint);},commit:async()=>{check();if(savepoint){await c.query('RELEASE SAVEPOINT '+savepoint);savepoint=null;}},rollback:async()=>{if(!aborted&&savepoint){await c.query('ROLLBACK TO SAVEPOINT '+savepoint);await c.query('RELEASE SAVEPOINT '+savepoint);savepoint=null;}},release:()=>unlock()};return connection;}};
}
async function storedHashes(c){const out={};for(const t of tables)out[t]=stableHash(JSON.parse(JSON.stringify((await c.query('SELECT * FROM `'+t+'` ORDER BY id'))[0])));return out;}
async function withFormalRollback(fn){
 const p=require('../../db').createDbPool({database:'student_growth'}),c=await p.getConnection();let before;
 try{assert.equal((await c.query('SELECT DATABASE() db'))[0][0].db,'student_growth');before=await storedHashes(c);await c.beginTransaction();await fn({pool:rollbackOnlyPool(c),connection:c});}
 finally{await c.rollback();try{if(before)assert.deepEqual(await storedHashes(c),before,'Stored formal rows changed after rollback');}finally{c.release();await p.end();}}
}
module.exports={rollbackOnlyPool,withFormalRollback,storedHashes};
