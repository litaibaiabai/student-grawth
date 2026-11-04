const XLSX=require('xlsx'),crypto=require('node:crypto');
function registryFixture({tag=crypto.randomBytes(4).toString('hex'),year='2028-2029',semester=1}={}){
 const teacher='verify_lin_'+tag,other='verify_xu_'+tag,student='00verify_'+tag,password='Verify-pass-2026';
 const subjects=['道德与法治','语文','数学','科学','英语','体育与健康','音乐','美术','信息科技','劳动','综合实践活动','地方课程'];
 const rows={学期:[['学年','学期序号','学期名称','开始日期','结束日期','设为当前学期'],[year,semester,'回滚验证学期','2028-09-01','2029-01-31','否']],教师:[['教师账号','姓名','初始密码'],[teacher,'验证班主任',password],[other,'验证任课教师',password]],班级:[['年级','班级','班主任账号'],...[1,2,3].map(n=>[4,n,teacher])],学生:[['学号/账号','姓名','年级','班级','初始密码'],[student,'验证同学',4,1,password]],任教关系:[['年级','班级','学科','教师账号'],...subjects.map(s=>[4,1,s,['数学','英语'].includes(s)?other:teacher]),...[2,3].flatMap(n=>['语文','数学','英语'].map(s=>[4,n,s,s==='语文'?teacher:other]))]};
 const buffer=()=>{const b=XLSX.utils.book_new();for(const[n,r]of Object.entries(rows))XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet(r),n);return XLSX.write(b,{type:'buffer',bookType:'xlsx'});};
 return{rows,buffer,teacher,other,student,password};
}
async function manager(c){const[[r]]=await c.query("SELECT id,token_version FROM users WHERE school_id=1 AND username='admin'");return{id:String(r.id),schoolId:'1',role:'manager',tokenVersion:r.token_version};}
const command=()=>({requestKey:crypto.randomUUID(),payloadHash:crypto.randomBytes(32).toString('hex')});
module.exports={registryFixture,manager,command};
async function importRegistryFixture(pool,c,options){const actor=await manager(c),f=registryFixture(options),service=require('../../services/registry/reportCoreRegistry'),p=await service.previewRegistry({pool,actor,buffer:f.buffer()});const r=await service.commitRegistry({pool,actor,previewToken:p.previewToken,command:command()});return{pool,actor,termId:r.result.termId,f};}
module.exports.importRegistryFixture=importRegistryFixture;
