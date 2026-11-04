const schema=require('../../docs/database/six-education-v2.schema.json');
function safeTarget(name) {
  return typeof name==='string' && /^(student_growth(?:_v2)?|liuyu_report_(?:test|pilot|prod)(?:_[a-z0-9_]+)?)$/.test(name) && name!==process.env.LEGACY_DB_NAME;
}
async function migrateSixEducationV2({connection,targetDb,mode='check'}) {
  if (!safeTarget(targetDb) || !['check','apply'].includes(mode)) throw Error('Unsafe target database or mode');
  const [[current]]=await connection.query('SELECT DATABASE() db');
  if(current.db!==targetDb)throw Error('Connection target mismatch');
  const [tables]=await connection.query('SHOW TABLES');
  const names=tables.map(r=>Object.values(r)[0]);
  if(names.length<6 || names.length>8 || schema.tables.slice(0,6).some(n=>!names.includes(n)) || names.some(n=>!schema.tables.includes(n)&&n!=='school_class'))throw Error('Partial or legacy schema: stop; establish a verified six-table clone first');
  const conflicts=[];
  if(names.includes('school_class'))conflicts.push(...await require('./migrateAdminClasses').inspectRegistry(connection,targetDb));
  const [heads]=await connection.query('SELECT school_id,term_id,grade,class_no,COUNT(*) total FROM teacher_teaching_assignment WHERE enabled=1 AND is_head_teacher=1 GROUP BY school_id,term_id,grade,class_no HAVING COUNT(*)>1');
  for(const row of heads)conflicts.push({kind:'DUPLICATE_HEAD',...row});
  const columns={},indexes={};
  for(const table of names){
    const [cols]=await connection.query(`SHOW COLUMNS FROM \`${table}\``);
    columns[table]=new Map(cols.map(c=>[c.Field,c]));
    const [idx]=await connection.query(`SHOW INDEX FROM \`${table}\``);
    indexes[table]=new Set(idx.map(i=>i.Key_name));
  }
  const [constraints]=await connection.query('SELECT tc.TABLE_NAME,tc.CONSTRAINT_NAME,cc.CHECK_CLAUSE FROM information_schema.TABLE_CONSTRAINTS tc LEFT JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME WHERE tc.CONSTRAINT_SCHEMA=?',[targetDb]);
  const constraintMap=new Map(constraints.map(c=>[c.CONSTRAINT_NAME,c]));
  const pending=schema.operations.filter(op=>{
    if(op.kind==='table')return !names.includes(op.table);
    if(op.kind==='column')return !columns[op.table]?.has(op.name);
    if(op.kind==='index')return !indexes[op.table]?.has(op.name);
    if(op.kind==='enum')return !columns[op.table]?.get(op.name)?.Type.includes(op.contains);
    if(op.kind==='check')return !constraintMap.get(op.name)?.CHECK_CLAUSE?.includes(op.contains);
    return !constraintMap.has(op.name);
  });
  for(const op of schema.operations.filter(o=>o.kind==='column')) {
    const actual=columns[op.table]?.get(op.name);
    const expected=op.definition.match(/^[A-Z]+(?:\(\d+(?:,\d+)?\))?(?: UNSIGNED)?/i)?.[0].toLowerCase();
    if(actual && actual.Type.toLowerCase()!==expected)conflicts.push({kind:'COLUMN_DEFINITION',table:op.table,column:op.name,actual:actual.Type,expected});
  }
  if(names.includes('story_content')) {
    for(const name of ['id','school_id','kind','stable_code','version','title','text_ref','text_content','audio_ref','audio_duration_ms','asset_hashes','origin_record_id','origin_version','authorization_ref','status','featured_term_id','revision'])
      if(!columns.story_content.has(name))conflicts.push({kind:'STORY_SCHEMA',column:name});
  }
  if(mode==='apply' && conflicts.length)throw Object.assign(Error('结构冲突或班主任重复，必须人工核对后再迁移'),{conflicts});
  const applied=[];
  if(mode==='apply')for(const op of pending){await connection.query(op.sql);applied.push(op.key);}
  return {version:schema.version,mode,ready:!conflicts.length && (mode==='apply'||!pending.length),pending:pending.map(o=>o.key),conflicts,applied};
}
if(require.main===module){
  const {createDbPool}=require('../db');
  const targetDb=process.env.REPORT_DB_NAME;
  if(!safeTarget(targetDb))throw Error('Set a safe REPORT_DB_NAME target clone');
  const pool=createDbPool({database:targetDb});
  const run=process.argv.includes('--audit-sources')
    ? require('../services/core/reportCoreSourceAudit').auditV2SourceAssets({connection:pool,schoolId:process.env.SCHOOL_ID,termId:process.env.MIGRATE_TERM_IDS,filesRoot:process.env.REPORT_FILES_DIR})
    : migrateSixEducationV2({connection:pool,targetDb,mode:process.argv.includes('--apply')?'apply':'check'});
  run
    .then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
}
module.exports={migrateSixEducationV2,safeTarget};
