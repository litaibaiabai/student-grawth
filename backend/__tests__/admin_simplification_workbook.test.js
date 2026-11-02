const {test}=require('node:test'),assert=require('node:assert/strict'),XLSX=require('xlsx');
const {buildRegistryTemplate,parseRegistryWorkbook}=require('../services/registryWorkbook');
function edit(fn){const b=XLSX.read(buildRegistryTemplate());fn(b);return XLSX.write(b,{type:'buffer',bookType:'xlsx'});}
test('template roundtrips five named sheets with text identities',()=>{
 const buffer=buildRegistryTemplate(),b=XLSX.read(buffer),p=parseRegistryWorkbook(buffer);
 assert.deepEqual(b.SheetNames,['学期','教师','班级','学生','任教关系']);assert.equal(p.term.semester,1);
 const p2=parseRegistryWorkbook(edit(b=>{b.Sheets['学生']=XLSX.utils.aoa_to_sheet([['学号/账号','姓名','年级','班级','初始密码'],['00123','同学',4,1,'']]);}));
 assert.equal(p2.students[0].username,'00123');assert.equal(p2.students[0].rowNo,2);
});
test('Excel serial dates and 1904 workbooks use the correct calendar',()=>{
 for(const [date1904,serial] of [[false,46812],[true,45350]]){
 const p=parseRegistryWorkbook(edit(b=>{b.Workbook={WBProps:{date1904}};const ws=b.Sheets['学期'];ws.D2={t:'n',v:serial};ws.E2={t:'s',v:'2028-06-30'};ws.F2={t:'s',v:'2028-06-30'};}));
 assert.equal(p.term.startDate,'2028-02-29');
 }
});
test('ambiguous or unsafe workbooks provide precise row errors without passwords',()=>{
 const cases=[
  [b=>{delete b.Sheets['教师'];b.SheetNames=b.SheetNames.filter(n=>n!=='教师');},'教师'],
  [b=>{b.Sheets['教师']=XLSX.utils.aoa_to_sheet([['教师账号','姓名','姓名']]);},'教师'],
  [b=>{b.Sheets['学期'].D2={t:'s',v:'2028-02-30'};},'学期'],
  [b=>{b.Sheets['学期'].D2={t:'n',v:1,f:'1+1'};},'学期'],
  [b=>{b.Sheets['学生']=XLSX.utils.aoa_to_sheet([['学号/账号','姓名','年级','班级','初始密码'],[123,'同学',4,1,'should-never-echo']]);},'学生'],
  [b=>{b.Sheets['任教关系']=XLSX.utils.aoa_to_sheet([['年级','班级','学科','教师账号'],[4,1,'不存在学科','T001']]);},'任教关系'],
 ];
 for(const [change,sheet] of cases)assert.throws(()=>parseRegistryWorkbook(edit(change)),e=>e.statusCode===422&&e.details.errors.some(x=>x.sheet===sheet)&&!JSON.stringify(e.details).includes('should-never-echo'));
});
module.exports={edit};
