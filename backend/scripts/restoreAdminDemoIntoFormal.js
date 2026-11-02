// Restore data into the existing eight formal tables. Schema is never replaced.
// Default: read-only plan. --apply: verified backup, transactional replacement,
// exact row comparison, and validation of every declared foreign key.
const fs=require('node:fs/promises');
const {createWriteStream}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createDbPool,dbConfig}=require('../db');
const {stableHash}=require('../services/reportCorePolicy');
const tables=['users','academic_year','story_content','teacher_teaching_assignment','school_class','evaluation_source_record','student_term_evaluation','term_report'];
const q=s=>'`'+s+'`';

async function backupFormal(directory) {
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,'student_growth-before-restore-'+new Date().toISOString().replace(/[-:.]/g,'')+'.sql');
  const config=dbConfig(),out=createWriteStream(file,{mode:0o600});
  const child=spawn(process.env.MYSQLDUMP_BIN||'mysqldump',['--host='+config.host,'--port='+config.port,'--user='+config.user,'--single-transaction','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF','--routines','--triggers','--events','--databases','student_growth'],{env:{...process.env,MYSQL_PWD:config.password||''},stdio:['ignore','pipe','pipe']});
  let error='';child.stderr.on('data',bytes=>error+=bytes);child.stdout.pipe(out);
  await Promise.all([new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code?reject(Error('Backup failed: '+error)):resolve());}),new Promise((resolve,reject)=>{out.on('finish',resolve);out.on('error',reject);})]);
  const bytes=await fs.readFile(file);
  if(bytes.length<1000||!bytes.includes(Buffer.from('CREATE TABLE `users`')))throw Error('Incomplete database backup');
  const metadata={file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),createdAt:new Date().toISOString()};
  await fs.writeFile(path.join(directory,'latest.json'),JSON.stringify(metadata,null,2),{mode:0o600});
  return metadata;
}

async function restoreAdminDemoIntoFormal({apply=false,outputDir}={}) {
  const source='liuyu_report_pilot_admin_demo_v3',target='student_growth';
  const directory=path.resolve(outputDir||'output/report-core/formal-database-migration');
  const pool=createDbPool({database:target,dateStrings:true}),c=await pool.getConnection();let inTransaction=false;
  try {
    await require('./runCoreMigrations').runCoreMigrations({connection:c,targetDb:target});
    const sourcePool=createDbPool({database:source,dateStrings:true});
    let sourceRows;const derivedColumnsNotCopied=[];
    try {
      await require('./runCoreMigrations').runCoreMigrations({connection:sourcePool,targetDb:source});
      sourceRows=Object.fromEntries(await Promise.all(tables.map(async table=>{
        const [targetCols]=await c.query('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[table]);
        const [sourceCols]=await sourcePool.query('SELECT COLUMN_NAME,GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
        const targetNames=targetCols.map(x=>x.COLUMN_NAME),sourceNames=new Set(sourceCols.map(x=>x.COLUMN_NAME));
        if(targetNames.some(name=>!sourceNames.has(name)))throw Error('Source is missing formal columns: '+table);
        for(const column of sourceCols.filter(x=>!targetNames.includes(x.COLUMN_NAME))) {
          if(!column.GENERATION_EXPRESSION)throw Error('Source has additional stored data: '+table+'.'+column.COLUMN_NAME);
          derivedColumnsNotCopied.push(table+'.'+column.COLUMN_NAME);
        }
        return [table,(await sourcePool.query(`SELECT ${targetNames.map(q).join(',')} FROM ${q(table)} ORDER BY id`))[0]];
      })));
    }finally{await sourcePool.end();}
    const columns={},before={};
    for(const table of tables) {
      const [cols]=await c.query("SELECT COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND GENERATION_EXPRESSION='' ORDER BY ORDINAL_POSITION",[table]);
      columns[table]=cols;
      const [rows]=await c.query(`SELECT * FROM ${q(table)} ORDER BY id`);
      before[table]={count:rows.length,hash:stableHash(rows)};
    }
    const result={mode:apply?'apply':'check',source,target,before,derivedColumnsNotCopied,restoredCounts:Object.fromEntries(tables.map(t=>[t,sourceRows[t].length]))};
    if(!apply)return result;
    if(sourceRows.users.length!==4||sourceRows.term_report.length!==1||sourceRows.student_term_evaluation.length!==1)throw Error('Expected complete four-account demonstration source');
    result.backup=await backupFormal(path.join(directory,'backups'));
    await c.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await c.beginTransaction();inTransaction=true;
    for(const table of tables) {
      const [rows]=await c.query(`SELECT * FROM ${q(table)} ORDER BY id FOR UPDATE`);
      if(stableHash(rows)!==before[table].hash)throw Error('Formal data changed during backup; refusing restore: '+table);
    }
    // This session only; no global setting, DDL, TRUNCATE, or auto-commit.
    await c.query('SET FOREIGN_KEY_CHECKS=0');
    for(const table of [...tables].reverse())await c.query(`DELETE FROM ${q(table)}`);
    for(const table of tables) {
      const cols=columns[table],names=cols.map(x=>x.COLUMN_NAME);
      for(const row of sourceRows[table])await c.query(`INSERT INTO ${q(table)} (${names.map(q).join(',')}) VALUES (${names.map(()=>'?').join(',')})`,cols.map(col=>col.DATA_TYPE==='json'&&row[col.COLUMN_NAME]!==null&&typeof row[col.COLUMN_NAME]!=='string'?JSON.stringify(row[col.COLUMN_NAME]):row[col.COLUMN_NAME]));
      const [restored]=await c.query(`SELECT * FROM ${q(table)} ORDER BY id`);
      if(stableHash(restored)!==stableHash(sourceRows[table])) {
        const differences=[];
        for(let i=0;i<Math.max(restored.length,sourceRows[table].length);i++) {
          const left=restored[i],right=sourceRows[table][i];
          if(stableHash(left??null)!==stableHash(right??null))differences.push({id:right?.id,columns:[...new Set([...Object.keys(left||{}),...Object.keys(right||{})])].filter(key=>stableHash(left?.[key]??null)!==stableHash(right?.[key]??null))});
          if(differences.length===3)break;
        }
        throw Error('Restored data mismatch: '+table+' '+JSON.stringify(differences));
      }
    }
    const [keys]=await c.query("SELECT CONSTRAINT_NAME,TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION");
    const groups=new Map();
    for(const key of keys){const id=key.TABLE_NAME+'.'+key.CONSTRAINT_NAME;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(key);}
    for(const [name,fields]of groups) {
      const joins=fields.map(f=>`child.${q(f.COLUMN_NAME)}=parent.${q(f.REFERENCED_COLUMN_NAME)}`).join(' AND ');
      const nonnull=fields.map(f=>`child.${q(f.COLUMN_NAME)} IS NOT NULL`).join(' AND ');
      const [[row]]=await c.query(`SELECT COUNT(*) n FROM ${q(fields[0].TABLE_NAME)} child LEFT JOIN ${q(fields[0].REFERENCED_TABLE_NAME)} parent ON ${joins} WHERE ${nonnull} AND parent.id IS NULL`);
      if(Number(row.n))throw Error('Restored foreign key has orphans: '+name);
    }
    await c.query('SET FOREIGN_KEY_CHECKS=1');
    await c.commit();inTransaction=false;
    result.exactRowsVerified=true;result.foreignKeysVerified=groups.size;
    await fs.mkdir(directory,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(directory,'restore-result.json'),JSON.stringify(result,null,2),{mode:0o600});
    return result;
  }catch(error){if(inTransaction)await c.rollback();throw error;}
  finally{await c.query('SET FOREIGN_KEY_CHECKS=1').catch(()=>{});c.release();await pool.end();}
}
if(require.main===module)restoreAdminDemoIntoFormal({apply:process.argv.includes('--apply')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={restoreAdminDemoIntoFormal};
