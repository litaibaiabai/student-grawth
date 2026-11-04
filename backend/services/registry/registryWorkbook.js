const XLSX=require('xlsx');
const {AppError}=require('../../middleware/errorHandler');
const {subjects}=require('../cards/semesterCardPolicy');
const registryColumns={
 学期:['学年','学期序号','学期名称','开始日期','结束日期','采集截止日期','下学期报到日期','设为当前学期'],
 教师:['教师账号','姓名','初始密码'],班级:['年级','班级','班主任账号','班级名称'],
 学生:['学号/账号','姓名','年级','班级','初始密码'],任教关系:['年级','班级','学科','教师账号'],
};
const optional=new Set(['采集截止日期','下学期报到日期','设为当前学期','班级名称']);
function reject(errors){const e=new AppError(422,'请修正Excel中的全部错误后重新上传',422);e.safeDetails=true;e.details={errors};throw e;}
function buildRegistryTemplate(){const b=XLSX.utils.book_new();for(const [name,columns]of Object.entries(registryColumns)){const rows=[columns];if(name==='学期')rows.push(['2026-2027',1,'2026-2027学年第一学期','2026-09-01','2027-01-31','','','是']);const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=columns.map(()=>({wch:22}));XLSX.utils.book_append_sheet(b,ws,name);}return XLSX.write(b,{type:'buffer',bookType:'xlsx'});}
function parseRegistryWorkbook(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length>10*1024*1024||buffer[0]!==0x50||buffer[1]!==0x4b)reject([{sheet:'文件',rowNo:1,field:'文件格式',message:'只接收10MiB以内的xlsx工作簿'}]);
 let book;try{book=XLSX.read(buffer,{cellFormula:true,cellDates:false});}catch{reject([{sheet:'文件',rowNo:1,field:'文件格式',message:'无法读取xlsx文件'}]);}
 const errors=[],data={};let count=0;
 for(const [name,columns]of Object.entries(registryColumns)){
  const ws=book.Sheets[name];if(!ws){errors.push({sheet:name,rowNo:1,field:'工作表',message:'缺少工作表'});continue;}
  const range=XLSX.utils.decode_range(ws['!ref']||'A1');if(range.e.r>10001||range.e.c>100){errors.push({sheet:name,rowNo:1,field:'行数',message:'数据行过多或表格范围过大'});continue;}
  const headers=[];for(let col=0;col<=range.e.c;col++)headers.push(String(ws[XLSX.utils.encode_cell({r:0,c:col})]?.v??'').trim());
  for(const field of columns)if((!optional.has(field)&&!headers.includes(field))||headers.filter(h=>h===field).length>1)errors.push({sheet:name,rowNo:1,field,message:'缺少或重复表头'});
  data[name]=[];
  for(let r=1;r<=range.e.r;r++){
   const cells=columns.map(field=>ws[XLSX.utils.encode_cell({r,c:headers.indexOf(field)})]);
   if(cells.every(c=>!c?.f&&(c?.v===undefined||String(c.v).trim()==='')))continue;
   count++;const row={sheet:name,rowNo:r+1};
   columns.forEach((field,i)=>{const cell=cells[i],value=cell?.v??'';if(cell?.f)errors.push({sheet:name,rowNo:r+1,field,message:'请填写原始值，不使用公式'});if((field.includes('账号')||field==='初始密码')&&value!==''&&cell?.t!=='s'&&cell?.t!=='str')errors.push({sheet:name,rowNo:r+1,field,message:'请将单元格设置为文本，保留前导零'});row[field]=typeof value==='string'?value.trim():value;});data[name].push(row);
  }
 }
 if(count>10000)errors.push({sheet:'文件',rowNo:1,field:'行数',message:'一个工作簿最多10000条数据'});
 if(errors.length)reject(errors);
 const err=(row,field,message)=>errors.push({sheet:row.sheet,rowNo:row.rowNo,field,message});
 const text=(row,field,allowBlank=false)=>{const v=String(row[field]??'').trim();if((!v&&!allowBlank)||v.length>100)err(row,field,'必填文本不能超过100字');return v;};
 const positive=(row,field)=>{const v=Number(row[field]);if(!Number.isInteger(v)||v<1||v>32767)err(row,field,'需填写正整数');return v;};
 const date=(row,field,allowBlank=false)=>{let v=row[field];if(v===''&&allowBlank)return null;if(typeof v==='number'){const p=XLSX.SSF.parse_date_code(v,{date1904:!!book.Workbook?.WBProps?.date1904});v=p?`${String(p.y).padStart(4,'0')}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`:'';}if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)err(row,field,'日期须为有效的YYYY-MM-DD或Excel日期');return v;};
 if(data.学期.length!==1)reject([{sheet:'学期',rowNo:2,field:'学期',message:'学期表必须只有一行数据'}]);
 const t=data.学期[0],academicYear=text(t,'学年'),semester=Number(t.学期序号);
 if(!/^\d{4}-\d{4}$/.test(academicYear)||Number(academicYear.slice(5))!==Number(academicYear.slice(0,4))+1)err(t,'学年','示例：2026-2027，须为连续两年');
 if(![1,2].includes(semester))err(t,'学期序号','只能填写1或2');
 const term={academicYear,semester,termName:text(t,'学期名称'),startDate:date(t,'开始日期'),endDate:date(t,'结束日期'),collectionDeadline:date(t,'采集截止日期',true),nextRegistrationDate:date(t,'下学期报到日期',true),makeCurrent:t.设为当前学期!=='否'};
 term.collectionDeadline=term.collectionDeadline||term.endDate;
 if(!['','是','否'].includes(String(t.设为当前学期??'')))err(t,'设为当前学期','填写是或否');
 if(term.startDate>=term.endDate||term.collectionDeadline<term.startDate||term.collectionDeadline>term.endDate)err(t,'结束日期','开始日须早于结束日，采集截止日须在区间内');
 const teachers=data.教师.map(r=>({sheet:r.sheet,rowNo:r.rowNo,username:text(r,'教师账号'),realName:text(r,'姓名'),initialPassword:String(r.初始密码||'')}));
 const classes=data.班级.map(r=>({sheet:r.sheet,rowNo:r.rowNo,grade:positive(r,'年级'),classNo:positive(r,'班级'),headTeacherUsername:text(r,'班主任账号'),displayName:text(r,'班级名称',true)}));
 const students=data.学生.map(r=>({sheet:r.sheet,rowNo:r.rowNo,username:text(r,'学号/账号'),realName:text(r,'姓名'),grade:positive(r,'年级'),classNo:positive(r,'班级'),initialPassword:String(r.初始密码||'')}));
 const assignments=data.任教关系.map(r=>{const name=text(r,'学科'),subject=subjects.find(s=>s.subjectName===name);if(!subject)err(r,'学科','请使用模板支持的12个学科名称');return{sheet:r.sheet,rowNo:r.rowNo,grade:positive(r,'年级'),classNo:positive(r,'班级'),subjectCode:subject?.subjectCode,teacherUsername:text(r,'教师账号')};});
 if(errors.length)reject(errors);return{term,teachers,classes,students,assignments};
}
module.exports={registryColumns,buildRegistryTemplate,parseRegistryWorkbook,reject};
