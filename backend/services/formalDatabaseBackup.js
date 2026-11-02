const fs=require('node:fs/promises');
const {createWriteStream}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {dbConfig}=require('../db');
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

module.exports={backupFormal};
