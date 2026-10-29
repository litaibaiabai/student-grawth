const {runCoreMigrations}=require('./runCoreMigrations');
const columnDdl="ADD COLUMN ledger_occurred_utc CHAR(24) COLLATE utf8mb4_bin GENERATED ALWAYS AS (CASE WHEN record_kind='DIRECT' AND JSON_TYPE(JSON_EXTRACT(payload_json,'$.occurredAt'))='STRING' AND CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.occurredAt')))=24 THEN JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.occurredAt')) ELSE NULL END) STORED";
const indexColumns=['school_id','term_id','actor_id','source_type','record_kind','student_id','ledger_occurred_utc','created_at'];
async function upgradeLedgerIndex({connection,targetDb,apply=false}) {
 await runCoreMigrations({connection,targetDb});
 const [columns]=await connection.query("SHOW COLUMNS FROM evaluation_source_record LIKE 'ledger_occurred_utc'");
 const [index]=await connection.query("SHOW INDEX FROM evaluation_source_record WHERE Key_name='idx_source_ledger_direct'");
 if(columns.length&&(!columns[0].Type.toLowerCase().startsWith('char(24)')||!columns[0].Extra.includes('STORED GENERATED')))throw Error('Unexpected ledger derived column: stop');
 if(index.length&&index.sort((a,b)=>a.Seq_in_index-b.Seq_in_index).map(r=>r.Column_name).join(',')!==indexColumns.join(','))throw Error('Unexpected ledger index definition: stop');
 const required=!columns.length||!index.length;if(!apply||!required)return {required,changed:false};
 // DDL auto-commits. Each step is independently restartable; run in a reviewed maintenance window.
 if(!columns.length)await connection.query('ALTER TABLE evaluation_source_record '+columnDdl);
 if(!index.length)await connection.query('ALTER TABLE evaluation_source_record ADD INDEX idx_source_ledger_direct ('+indexColumns.join(',')+')');
 return {required:false,changed:true};
}
if(require.main===module){const {createDbPool}=require('../db');const pool=createDbPool({database:process.env.REPORT_DB_NAME});upgradeLedgerIndex({connection:pool,targetDb:process.env.REPORT_DB_NAME,apply:process.argv.includes('--apply')}).then(result=>console.log(result)).catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());}
module.exports={upgradeLedgerIndex};
