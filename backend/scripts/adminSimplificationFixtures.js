const XLSX=require('xlsx');
const {importValues,teacherRows,studentRows}=require('./adminClosureFixtures');
const {subjects}=require('../services/cards/semesterCardPolicy');
function buildAdminSimplificationFixtures({academicYear='2026-2027',semester=2,dates={start:'2027-02-01',end:'2027-06-30'},credentials={},termId,accounts={},current=false}={}){
 const head=accounts.head||teacherRows[0].username,other=accounts.other||teacherRows[1].username,student=accounts.student||studentRows[0].username;
 const rows={学期:[['学年','学期序号','学期名称','开始日期','结束日期','设为当前学期'],[academicYear,semester,`${academicYear}第${semester}学期`,dates.start,dates.end,current?'是':'否']],教师:[['教师账号','姓名','初始密码'],[head,'林知行',credentials[head]||''],[other,'徐晨',credentials[other]||'']],班级:[['年级','班级','班主任账号'],...[1,2,3].map(n=>[4,n,head])],学生:[['学号/账号','姓名','年级','班级','初始密码'],[student,'林小禾',4,1,credentials[student]||'']],任教关系:[['年级','班级','学科','教师账号'],...subjects.map(s=>[4,1,s.subjectName,['MATH','ENGLISH'].includes(s.subjectCode)?other:head]),...[2,3].flatMap(n=>subjects.filter(s=>['CHINESE','MATH','ENGLISH'].includes(s.subjectCode)).map(s=>[4,n,s.subjectName,s.subjectCode==='CHINESE'?head:other]))]};
 const book=XLSX.utils.book_new();for(const[n,data]of Object.entries(rows))XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(data),n);
 const teacherScoreWorkbook={};for(const username of [head,other]){
  const values=Object.fromEntries(Object.entries(importValues).filter(([k])=> /^(math|english)_/.test(k)===(username===other)));
  const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.json_to_sheet([{学期标识:String(termId||''),模板版本:'SIX_EDU_V2',账号:student,姓名:'林小禾',年级:4,班级:1,测量日期:dates.measurement||dates.start,视力制式:'5_POINT',...values}]),'填写数据');
  teacherScoreWorkbook[username]=XLSX.write(b,{type:'buffer',bookType:'xlsx'});
 }
 return{workbook:XLSX.write(book,{type:'buffer',bookType:'xlsx'}),teacherScoreWorkbook,expected:{generatedTotal:1515,headTotal:1080,otherTotal:435,classes:3,courses:18,students:1}};
}
module.exports={buildAdminSimplificationFixtures};
