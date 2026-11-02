const path=require('node:path');
const fs=require('node:fs/promises');
const mysql=require('mysql2/promise');
const XLSX=require('xlsx');
const {dbConfig,createDbPool}=require('../db');
const fixtures=require('./adminClosureFixtures');

async function seedAdminClosureDemo({database,outputDir,password='Demo-pass-2026',schoolId='1'}) {
 if(!/^liuyu_report_test_admin_(demo|flow)_[a-z0-9_]+$/.test(database||''))throw Error('Use a new isolated admin demo/flow database');
 if(typeof password!=='string'||password.length<10)throw Error('Initial password must contain at least 10 characters');
 const root=path.resolve(outputDir||path.join(__dirname,'../../output/report-core/admin-closure',database));
 const admin=await mysql.createConnection(dbConfig({database:undefined}));
 try {
  const [existing]=await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[database]);
  if(existing.length)throw Error('Database already exists; choose a fresh run name. Existing runs are preserved.');
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
 } finally {await admin.end();}
 const pool=createDbPool({database});
 try {
  await require('./runCoreMigrations').runCoreMigrations({connection:pool,targetDb:database,mode:'apply'});
  const initialized=await require('./initReportCore').initializeSchool({pool,schoolId,password,demo:false});
  await require('./migrateSixEducationV2').migrateSixEducationV2({connection:pool,targetDb:database,mode:'apply'});
  const config={...require('../services/reportCoreV2Policy').createV2Config(),collectionDeadline:'2027-02-01',courseCardDefaultQuota:100};
  await pool.query("UPDATE academic_year SET template_version='CORE_V2',rule_version='V2_1',evaluation_config=? WHERE school_id=? AND id=?",[JSON.stringify(config),schoolId,initialized.termId]);
  await require('./migrateAdminClasses').migrateAdminClasses({connection:pool,targetDb:database,mode:'apply'});
  await fs.mkdir(root,{recursive:true,mode:0o700});
  const workbook=async(name,rows)=>{
   const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),'填写数据');
   const file=path.join(root,name+'.xlsx');await fs.writeFile(file,XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{mode:0o600});return file;
  };
  const teachers=fixtures.teacherRows.map(r=>({...r,password})),students=fixtures.studentRows.map(r=>({...r,password}));
  const files={
   teachers:await workbook('01-教师导入',teachers.map(r=>({教师账号:r.username,姓名:r.real_name,初始密码:r.password}))),
   classes:await workbook('02-班级导入',fixtures.classRows.map(r=>({年级:r.grade,班级:r.classNo,班级名称:r.displayName,班主任账号:r.responsibleTeacherUsername}))),
   students:await workbook('03-学生导入',students.map(r=>({'学号/账号':r.username,姓名:r.real_name,年级:r.grade,班级:r.classNo,初始密码:r.password}))),
   scores:await workbook('04-教师综合成绩及体测',[{学期标识:initialized.termId,模板版本:'SIX_EDU_V2',账号:students[0].username,姓名:students[0].real_name,年级:4,班级:1,测量日期:'2026-11-01',视力制式:'5_POINT',...fixtures.importValues}]),
   certificate:path.join(root,'05-虚构奖状.png'),
   scoreCorrection:await workbook('06-期末成绩更正',[{学期标识:initialized.termId,模板版本:'SIX_EDU_V2',账号:students[0].username,姓名:students[0].real_name,年级:4,班级:1,测量日期:'2026-11-01',视力制式:'5_POINT',...fixtures.importValues,math_regular_grade:'A'}]),
  };
  await fs.copyFile(path.join(__dirname,'../../docs/test-file/admin-closure-award.png'),files.certificate);
  const input={teachers,classes:fixtures.classRows,students,importValues:fixtures.importValues,selfValues:fixtures.selfValues,processTargets:fixtures.processTargets};
  await fs.writeFile(path.join(root,'inputs.json'),JSON.stringify(input,null,2),{mode:0o600});
  await fs.writeFile(path.join(root,'expected-report-values.json'),JSON.stringify({...fixtures.expectedValues({listenCount:1,writeCount:1,chinesePoints:2}),math_regular_grade:'A'},null,2),{mode:0o600});
  const manifest={database,schoolId,termId:initialized.termId,createdAt:new Date().toISOString(),files,
   initialState:{users:1,classes:0,assignments:0,evaluations:0,sources:0,reports:0},
   notice:'独立虚构演示库。初始仅管理员与完整字段学期；师生、班级、评价、审核及报告必须由实际业务操作产生。录音保存不冒充ASR评分。'};
  await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  await fs.writeFile(path.join(root,'local-accounts.json'),JSON.stringify({notice:'仅本机虚构演示账号',accounts:[{username:'admin',password},...teachers.map(({username,password})=>({username,password})),...students.map(({username,password})=>({username,password}))]},null,2),{mode:0o600});
  return {...manifest,outputDir:root};
 }finally{await pool.end();}
}
if(require.main===module&&!process.env.ADMIN_DEMO_DB){console.error('开发演示统一使用 student_growth；本脚本不再默认创建数据库。请先运行 restoreAdminDemoIntoFormal.js 预检，再按需 --apply 还原。');process.exitCode=1;}
else if(require.main===module)seedAdminClosureDemo({database:process.env.ADMIN_DEMO_DB,outputDir:process.env.ADMIN_DEMO_OUTPUT,password:process.env.ADMIN_DEMO_PASSWORD||'Demo-pass-2026'})
 .then(r=>console.log(JSON.stringify({database:r.database,termId:r.termId,outputDir:r.outputDir,initialState:r.initialState})))
 .catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={seedAdminClosureDemo};
