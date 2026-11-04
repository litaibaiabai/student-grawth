const bcrypt=require('bcrypt');
const {parse}=require('../../services/core/reportCoreStore');
function normalizeDemoOptions(input={}){
 const mode=input.mode||'auto',academicYear=input.academicYear||'2027-2028',semester=Number(input.semester||1);
 if(!['auto','full','replay'].includes(mode))throw Error('mode仅支持auto、full、replay');
 if(!/^\d{4}-\d{4}$/.test(academicYear)||Number(academicYear.slice(5))!==Number(academicYear.slice(0,4))+1)throw Error('学年须为连续两年，例如2027-2028');
 if(![1,2].includes(semester))throw Error('学期序号须为1或2');
 const first=academicYear.slice(0,4),last=academicYear.slice(5),startDate=semester===1?`${first}-09-01`:`${last}-02-01`,endDate=semester===1?`${last}-01-31`:`${last}-06-30`;
 const apiPort=Number(input.apiPort||20080),webPort=Number(input.webPort||20081),stepDelay=Number(input.stepDelay??1200);
 if([apiPort,webPort].some(n=>!Number.isInteger(n)||n<1024||n>65535)||apiPort===webPort)throw Error('端口须为两个不同的1024至65535整数');
 if(!Number.isFinite(stepDelay)||stepDelay<0||stepDelay>10000)throw Error('步骤停留须为0至10000毫秒');
 return{mode,academicYear,semester,startDate,endDate,demoNow:startDate.slice(0,8)+'15T00:00:00.000Z',apiPort,webPort,stepDelay,exitAfter:!!input.exitAfter};
}
function classifyDemoState(state,requested){
 if(Number(state?.publishedCount)>0){if(requested==='full')throw Error('该学期已完成，请用replay回放或选择未初始化学期');return'replay';}
 if(requested==='replay')throw Error('回放需要一个已有已发布报告的学期');
 if(state&&state.status!=='DRAFT')throw Error('该学期已初始化但闭环未完成，拒绝盲目重跑；请核对失败记录');
 if(Number(state?.activityCount)>0)throw Error('该学期已有日常事实，不能作为全新演示覆盖');
 return'full';
}
function resumeDemoFromReport(report,steps,state,options){
 if(report.mode!=='full'||!['FAIL','INTERRUPTED'].includes(report.status))throw Error('仅允许继续失败的完整演示');
 if(report.academicYear!==options.academicYear||Number(report.semester)!==options.semester||!state||String(report.termId)!==state.termId||state.status!=='INITIALIZED')throw Error('续跑学期与现有初始化记录不匹配');
 const passed=report.steps.filter(r=>r.status==='PASS');
 if(passed.some((r,i)=>r.id!==steps[i]?.id||report.steps[i]?.status!=='PASS'))throw Error('原演示步骤顺序不匹配，拒绝续跑');
 const at=passed.length,allowed=['head-comment','head-publish','student-published','student-correction','head-republish','admin-statistics','student-republished'];
 if(!allowed.includes(steps[at]?.id)||report.steps.some((r,i)=>i>=at&&r.id!==steps[at]?.id))throw Error('只支持日常事实已完成后的审核和发布阶段续跑，请先核对失败记录');
 return at;
}
function redactDemoText(value,secrets=[]){let text=String(value);for(const secret of secrets.filter(Boolean))text=text.split(secret).join('[REDACTED]');return text;}
async function loadDemoAccounts(pool,{password=process.env.DEMO_PASSWORD,managerOnly=false}={}){
 if(process.env.NODE_ENV==='production')throw Error('三角色演示仅允许本地开发环境');
 const [[column]]=await pool.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='password_plain'");
 const usernames=managerOnly?['admin']:['admin','teacher_lin','teacher_xu','20260401'];
 const [rows]=await pool.query('SELECT id,username,real_name,role,status,password'+(Number(column.n)?',password_plain':'')+' FROM users WHERE school_id=1 AND username IN (?)',[usernames]);
 const expected=[['manager','admin',null],['head','teacher_lin','林知行'],['other','teacher_xu','徐晨'],['student','20260401','林小禾']],accounts={};
 for(const[key,username,name]of expected.filter(([key])=>!managerOnly||key==='manager')){const row=rows.find(u=>u.username===username),role=key==='head'||key==='other'?'teacher':key;
  if(!row||row.role!==role||row.status!==0||name&&row.real_name!==name)throw Error('缺少匹配的现有虚构演示账号：'+username);
  const credential=password||row.password_plain;
  if(!credential||!await bcrypt.compare(credential,row.password))throw Error('演示凭据不可用，请在本机设置DEMO_PASSWORD；不会修改账号密码');
  accounts[key]={id:String(row.id),username:row.username,name:row.real_name,password:credential};
 }
 return accounts;
}
async function inspectDemoTerm(pool,options){
 const [[row]]=await pool.query('SELECT id,evaluation_config FROM academic_year WHERE school_id=1 AND academic_year=? AND semester=?',[options.academicYear,options.semester]);
 if(!row)return null;
 const [[activity]]=await pool.query("SELECT COUNT(*) n FROM evaluation_source_record WHERE school_id=1 AND term_id=? AND (student_id IS NOT NULL OR record_kind IN ('CARD','QUOTA'))",[row.id]);
 const [[published]]=await pool.query("SELECT COUNT(*) n FROM term_report WHERE school_id=1 AND term_id=? AND status='PUBLISHED'",[row.id]);
 return{termId:String(row.id),status:parse(row.evaluation_config).semesterCards?.status||'LEGACY_LOCKED',activityCount:Number(activity.n),publishedCount:Number(published.n)};
}
module.exports={normalizeDemoOptions,classifyDemoState,redactDemoText,loadDemoAccounts,inspectDemoTerm,resumeDemoFromReport};
