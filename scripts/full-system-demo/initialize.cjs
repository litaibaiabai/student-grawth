// Only creates a NEW isolated demo database. Never resets an existing database.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const root=path.resolve(__dirname,'../..'),backend=path.join(root,'backend');
require(path.join(backend,'node_modules/dotenv')).config({path:path.join(backend,'.env')});
const mysql=require(path.join(backend,'node_modules/mysql2/promise')),bcrypt=require(path.join(backend,'node_modules/bcrypt'));
const {assertIsolatedDatabase}=require('./environment.cjs');
require(path.join(backend,'migrations/renovation'));
const {applyRegisteredMigrations}=require(path.join(backend,'services/migrationRunner'));
async function initialize(runtime){
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const runId=date.replaceAll('-','')+'_'+crypto.randomBytes(3).toString('hex'),dbName='liuyu_demo_'+runId;
 assertIsolatedDatabase(dbName);
 const out=path.join(root,'output/full-system-demo',runId),privateDir=path.join(out,'.private');
 const c=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,multipleStatements:true});
 try{
  await c.query('CREATE DATABASE `'+dbName+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  await c.query(fs.readFileSync(path.join(root,'sql/00_full_schema.sql'),'utf8').replaceAll('`student_growth`','`'+dbName+'`'));
  await require(path.join(backend,'migrations/20261026_subject_cards')).migrateSubjectCards(c);
  await applyRegisteredMigrations({connection:c, databaseName:dbName});
  const users=[{id:1,username:'demo_admin',realName:'演示管理员',role:'manager',schoolId:1},{id:2,username:'demo_teacher_a',realName:'林老师',role:'teacher',schoolId:1,classes:[{grade:4,class_no:1},{grade:4,class_no:2}]},{id:3,username:'demo_teacher_b',realName:'陈老师',role:'teacher',schoolId:1,classes:[{grade:4,class_no:2}]}];
  ['周知行','许星禾','沈乐知','陆安然','程子墨','唐可欣','顾明远','叶小满'].forEach((name,i)=>users.push({id:11+i,username:'demo_s'+String(i+1).padStart(2,'0'),realName:name,role:'student',schoolId:1,grade:4,classNo:i<4?1:2}));
  users.push({id:91,username:'other_manager',realName:'异校管理员',role:'manager',schoolId:2},{id:92,username:'other_teacher',realName:'异校教师',role:'teacher',schoolId:2,classes:[{grade:4,class_no:1}]},{id:93,username:'other_student',realName:'异校学生',role:'student',schoolId:2,grade:4,classNo:1});
  const password='Demo123456',hash=await bcrypt.hash(password,10);
  for(const u of users)await c.query('INSERT INTO users(id,school_id,username,password,real_name,role,grade,class_no,classes,status) VALUES (?,?,?,?,?,?,?,?,?,0)',[u.id,u.schoolId,u.username,hash,u.realName,u.role,u.grade||null,u.classNo||null,u.classes?JSON.stringify(u.classes):null]);
  const [year,mon]=date.split('-').map(Number); const sem=mon>=9||mon<=1?1:2,ay=mon>=9?year:year-1;
  const term={id:1,academicYear:ay+'-'+(ay+1),semester:sem,startDate:sem===1?ay+'-09-01':(ay+1)+'-02-01',endDate:sem===1?(ay+1)+'-01-31':(ay+1)+'-08-31'};
  await c.query('INSERT INTO academic_year(id,school_id,academic_year,semester,start_date,end_date,is_current,active,effective_at,review_deadline_at) VALUES(1,1,?,?,?,?,1,1,NOW(),?)',[term.academicYear,sem,term.startDate,term.endDate,term.endDate+' 23:59:59']);
  // Reuse only the existing canonical indicator tree, never its demo outcomes.
  const src=fs.readFileSync(path.join(backend,'scripts/init_db_data.js'),'utf8');
  const treeText=src.slice(src.indexOf('const categoryTree =')+20,src.indexOf('\n    for (const root of categoryTree)')).trim().replace(/;$/,'');
  const tree=vm.runInNewContext('('+treeText+')');
  for(const d of tree){const [r]=await c.query("INSERT INTO edu_evaluation_category(parent_id,category_level,category_code,category_name,score,sort_order,status,version) VALUES(0,1,?,?,0,?,1,'V1')",[d.code,d.name,d.sort]);for(const s of d.subs){const [p]=await c.query("INSERT INTO edu_evaluation_category(parent_id,category_level,category_code,category_name,score,sort_order,status,version) VALUES(?,2,?,?,0,?,1,'V1')",[r.insertId,s.code,s.name,s.sort]);for(const l of s.items)await c.query("INSERT INTO edu_evaluation_category(parent_id,category_level,category_code,category_name,score,sort_order,status,version) VALUES(?,3,?,?,1,?,1,'V1')",[p.insertId,l.code,l.name,l.sort]);}}
  const [[cat]]=await c.query("SELECT id FROM edu_evaluation_category WHERE category_code='D03-01'");
  for(let i=1;i<=18;i++)await c.query("INSERT INTO score_record(school_id,term_id,student_id,class_snapshot,dimension_code,category_id,source,delta,operator_id,request_key,remark) VALUES(1,1,11,?,'D',?,'A_DIRECT',1,2,?,?)",[JSON.stringify({grade:4,class_no:1}),cat.id,runId+'_history_'+i,'历史演示样本 '+i+'/18；非本次现场操作']);
  const initialOutcomes={};
  for(const [key,table]of Object.entries({cards:'reward_card',claims:'card_claim',honors:'honor_record',stories:'story_submission',reports:'term_report',subjectScores:'subject_score',dimensions:'student_dimension_score'})){const [[row]]=await c.query('SELECT COUNT(*) n FROM '+table);if(Number(row.n)!==0)throw Error('初始业务结果必须为空：'+table);initialOutcomes[key]=Number(row.n);}
  fs.mkdirSync(out,{recursive:true});fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
  const manifest={runId,generatedAt:new Date().toISOString(),date,monthKey:date.slice(0,7),dbName,backendPort:runtime.backendPort,frontendPort:runtime.frontendPort,baseUrl:'http://127.0.0.1:'+runtime.frontendPort,term,users:users.map(u=>({...u,password})),history:{studentId:11,records:18,delta:1},initialOutcomes};
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  fs.writeFileSync(path.join(privateDir,'secrets.json'),JSON.stringify({CARD_PRINT_KEY:crypto.randomBytes(32).toString('base64'),JWT_SECRET:crypto.randomBytes(48).toString('hex')}),{mode:0o600});
  return {...manifest,out,privateDir};
 }finally{await c.end();}
}
module.exports={initialize};
