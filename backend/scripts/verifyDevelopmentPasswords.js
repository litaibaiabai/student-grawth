// Exercise actual initialization/import/reset and HTTP privacy against formal
// tables, inside one enclosing transaction that is ALWAYS rolled back.
const assert=require('node:assert/strict'),bcrypt=require('bcrypt');
const {createDbPool}=require('../db');
const {rollbackOnlyPool}=require('../__tests__/helpers/formalRollback');
async function verifyDevelopmentPasswords(){
 const pool=createDbPool({database:'student_growth'}),c=await pool.getConnection();let server;
 const oldEnvironment=process.env.NODE_ENV;
 try{
  await c.beginTransaction();
  assert.equal((await c.query("SHOW COLUMNS FROM users LIKE 'password_plain'"))[0].length,1,'Development plaintext column is missing');
  // A deadlock can end the real transaction. Never permit the service retry
  // loop to issue writes in autocommit mode after any database error.
  let calls=0;
  const probe=rollbackOnlyPool({query:async()=>{calls++;throw Object.assign(Error('simulated deadlock'),{code:'ER_LOCK_DEADLOCK'});}});
  await assert.rejects(probe.query('SELECT 1'),{code:'ER_LOCK_DEADLOCK'});
  await assert.rejects(probe.getConnection(),/transaction aborted/);
  await assert.rejects(probe.query('INSERT INTO users'),/transaction aborted/);
  assert.equal(calls,1);
  const transactional=rollbackOnlyPool(c);
  const [[admin]]=await c.query("SELECT id,token_version FROM users WHERE school_id=1 AND username='admin'");
  const actor={id:String(admin.id),schoolId:'1',role:'manager',tokenVersion:admin.token_version};
  const command=()=>({requestKey:'dev-password-'+require('node:crypto').randomUUID(),payloadHash:require('node:crypto').randomBytes(32).toString('hex')});
  const original='Dev-initial-pass-2026',replacement='Dev-replaced-pass-2026',username='dev_verify_'+Date.now();
  const imports=require('../services/reportCoreImports');
  const preview=await imports.previewImport({pool:transactional,actor,termId:'2',kind:'ROSTER',rows:[{username,real_name:'明文同步回滚验证',role:'teacher',password:original}],command:command()});
  assert.ok(!JSON.stringify(preview).includes(original));
  const batchId=preview.result.batchId;
  const [[batch]]=await c.query('SELECT payload_json FROM evaluation_source_record WHERE id=?',[batchId]);
  assert.ok(!JSON.stringify(batch).includes(original),'Preview must not store plaintext outside users');
  await imports.commitImport({pool:transactional,actor,batchId,expectedRevision:preview.result.revision,command:command()});
  let [[user]]=await c.query('SELECT * FROM users WHERE school_id=1 AND username=?',[username]);
  assert.equal(user.password_plain,original);assert.ok(await bcrypt.compare(original,user.password));
  const ops=require('../services/reportCoreAdminOps');
  const reset=await ops.resetAccountPassword({pool:transactional,actor,termId:'2',accountId:String(user.id),expectedTokenVersion:user.token_version,password:replacement,reason:'开发列事务回滚验证',command:command()});
  assert.ok(!JSON.stringify(reset).includes(replacement));
  [[user]]=await c.query('SELECT * FROM users WHERE school_id=1 AND username=?',[username]);
  assert.equal(user.password_plain,replacement);assert.ok(await bcrypt.compare(replacement,user.password));
  const audits=await ops.exportAudits({pool:transactional,actor,termId:'2'});
  assert.ok(!audits.includes(original)&&!audits.includes(replacement)&&!audits.includes('password_plain'));
  const app=require('../app').createApp({pool:transactional,schoolId:'1'});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:replacement})});
  assert.equal(response.status,200);const login=await response.json();
  const me=await(await fetch(base+'/me',{headers:{Authorization:'Bearer '+login.data.token}})).json();
  for(const body of [login,me]){assert.ok(!JSON.stringify(body).includes('password_plain'));assert.ok(!JSON.stringify(body).includes(replacement));}
  const initialized=await require('./initReportCore').initializeSchool({pool:transactional,schoolId:'999999',password:original});
  assert.ok(initialized.termId);const [[created]]=await c.query("SELECT password,password_plain FROM users WHERE school_id=999999 AND username='admin'");
  assert.equal(created.password_plain,original);assert.ok(await bcrypt.compare(original,created.password));
  process.env.NODE_ENV='production';await require('../services/developmentPasswords').writePassword(c,'1',String(user.id),replacement);
  const [[production]]=await c.query('SELECT password_plain FROM users WHERE id=?',[user.id]);assert.equal(production.password_plain,null);
  console.log('PASS: initialization, encrypted preview, import, reset, bcrypt login, /me, audit privacy, production suppression; all fixture writes rolled back.');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(oldEnvironment===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnvironment;
  await c.rollback();c.release();await pool.end();
 }
}
if(require.main===module)verifyDevelopmentPasswords().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={verifyDevelopmentPasswords};
