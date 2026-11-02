const path=require('node:path');
const {parse}=require('../services/reportCoreStore');
const {semesterState}=require('../services/semesterCardPolicy');
async function migrateAdminSimplification({connection,targetDb,mode='check',backupDir}={}){
 if(targetDb!=='student_growth'||(await connection.query('SELECT DATABASE() db'))[0][0].db!==targetDb)throw Error('Formal database target mismatch');
 const names=(await connection.query('SHOW TABLES'))[0].map(r=>Object.values(r)[0]).sort();
 const expected=['users','academic_year','story_content','teacher_teaching_assignment','school_class','evaluation_source_record','student_term_evaluation','term_report'].sort();
 if(JSON.stringify(names)!==JSON.stringify(expected))throw Error('Expected existing eight formal tables');
 const [terms]=await connection.query('SELECT * FROM academic_year ORDER BY school_id,id');
 const blockedTerms=terms.filter(t=>t.release_status!=='IDLE').map(t=>String(t.id));
 const pending=terms.filter(t=>parse(t.evaluation_config).schemaVersion==='SIX_EDU_V2'&&!parse(t.evaluation_config).semesterCards);
 const result={ready:!blockedTerms.length&&!pending.length,changedTerms:pending.length,blockedTerms,backupPath:null};
 if(mode==='check'||!pending.length)return result;
 if(mode!=='apply'||blockedTerms.length)throw Error('Unfinished school release blocks migration');
 const backup=await require('../services/formalDatabaseBackup').backupFormal(backupDir||path.resolve(__dirname,'../../output/report-core/admin-simplification/backups'));
 result.backupPath=backup.file;
 const c=connection.getConnection?await connection.getConnection():connection;
 try{await c.beginTransaction();const [locked]=await c.query('SELECT * FROM academic_year ORDER BY school_id,id FOR UPDATE');if(locked.some(t=>t.release_status!=='IDLE'))throw Error('Release state changed');let changed=0;
 for(const t of locked){const config=parse(t.evaluation_config);if(config.schemaVersion!=='SIX_EDU_V2'||config.semesterCards)continue;const [[n]]=await c.query("SELECT SUM(record_kind='CARD') cardCount,COUNT(*) batchCount FROM evaluation_source_record WHERE school_id=? AND term_id=? AND record_kind IN ('CARD','QUOTA')",[t.school_id,t.id]);config.semesterCards={...semesterState(config),status:Number(n.batchCount)?'LEGACY_LOCKED':'DRAFT',generatedTotal:Number(n.cardCount||0)};await c.query('UPDATE academic_year SET evaluation_config=? WHERE school_id=? AND id=?',[JSON.stringify(config),t.school_id,t.id]);changed++;}
 await c.commit();return{...result,ready:true,changedTerms:changed};
 }catch(e){await c.rollback();throw e;}finally{if(c!==connection)c.release();}
}
if(require.main===module){const p=require('../db').createDbPool({database:'student_growth'});migrateAdminSimplification({connection:p,targetDb:'student_growth',mode:process.argv.includes('--apply')?'apply':'check'}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>p.end());}
module.exports={migrateAdminSimplification};
