// Local browser acceptance fixture. Creates and cleans only a liuyu_report_test_* database.
const {createV2TestDb}=require('../../backend/__tests__/helpers/reportCoreV2Db');
const {spawn}=require('node:child_process'),path=require('node:path'),fs=require('node:fs/promises');
const XLSX=require('../../backend/node_modules/xlsx'),catalog=require('../../backend/config/reportCoreV2Policy.json');
(async()=>{
 const cleanup=[],db=await createV2TestDb({after:fn=>cleanup.push(fn)}),root=path.resolve(__dirname,'../..'),output=path.join(root,'output/report-core/assessment-upload');
 let server,vite,closing=false;
 const close=async()=>{
  if(closing)return;closing=true;if(vite)vite.kill();if(server)await new Promise(r=>server.close(r));
  try{for(const fn of cleanup.reverse())await fn();}
  catch(error){
   // A browser session may outlive MySQL's idle timeout; cleanup needs a fresh admin connection.
   if(!/closed state|ECONNRESET|PROTOCOL_CONNECTION_LOST/.test(error.message+' '+error.code)||!/^liuyu_report_test_[0-9]+_[0-9]+_[a-f0-9]+$/.test(db.name))throw error;
   const admin=await require('../../backend/node_modules/mysql2/promise').createConnection(require('../../backend/db').dbConfig({database:undefined}));
   try{await admin.query('DROP DATABASE IF EXISTS `'+db.name+'`');}finally{await admin.end();}
  }
  process.exit();
 };
 process.on('SIGTERM',close);process.on('SIGINT',close);
 try{
  await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role,grade,class_no) SELECT 5,school_id,'third',password,'学生5','student',4,1 FROM users WHERE id=3");
  await db.pool.query("INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES(1,1,5,'学生5',4,1,'CORE_V2','V2_1')");
  for(const f of catalog.fields.filter(f=>['SELF','CARD'].includes(f.sourceType)))await db.pool.query(`UPDATE student_term_evaluation SET \`${f.column}\`=?`,[f.sourceType==='SELF'?3:2]);
  await db.pool.query("UPDATE student_term_evaluation SET math_regular_grade='C',math_final_grade='B'");
  await fs.mkdir(output,{recursive:true});
  const fields=catalog.fields.filter(f=>f.sourceType==='IMPORT'),headers=['学期标识','模板版本','账号','姓名','年级','班级','测量日期','视力制式',...fields.map(f=>f.column)];
  const students=[['student2','学生4'],['student','学生3'],['third','学生5']];
  const score=f=>f.valueType==='star'?3:f.valueType==='grade'?'A':f.column==='height_cm'?142.5:f.column==='weight_kg'?34.8:f.column==='jump_rope_1min'?0:'5.0';
  const rows=students.map(([username,name])=>['1','SIX_EDU_V2',username,name,4,1,'2026-10-20','5_POINT',...fields.map(score)]);
  const save=async(name,sheets)=>{const wb=XLSX.utils.book_new();for(const [label,data] of Object.entries(sheets))XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(data),label);await fs.writeFile(path.join(output,name),XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));};
  await save('valid.xlsx',{第一组:[headers,...rows.slice(0,2)],第二组:[headers,rows[2]]});
  const invalid=rows.map(r=>r.slice());invalid[0][headers.indexOf('music_overall_grade')]='Z';invalid[1][headers.indexOf('math_interest_star')]='';for(let i=8;i<invalid[2].length;i++)invalid[2][i]='';
  await save('invalid.xlsx',{成绩:[headers,...invalid]});
  await save('prefill.xlsx',{成绩:[['学期标识','模板版本','账号','姓名','math_regular_grade','math_final_grade'],...students.map(([username,name])=>['1','SIX_EDU_V2',username,name,'',''])]});
  server=require('../../backend/app').createApp({pool:db.pool,schoolId:'1'}).listen(19587,'127.0.0.1');
  vite=spawn(process.execPath,[path.join(root,'frontend/node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','19588','--strictPort'],{cwd:path.join(root,'frontend'),env:{...process.env,VITE_API_TARGET:'http://127.0.0.1:19587'},stdio:'ignore'});
  for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:19588')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  console.log(JSON.stringify({url:'http://127.0.0.1:19588/#/teacher/imports?termId=1',username:'teacher',password:'Test-pass-2026',files:output,database:db.name}));
  process.stdin.resume();
 }catch(e){console.error(e);await close();}
})();
