const XLSX=require('xlsx');
const {catalog,validateV2Value,policyFor,isV2}=require('./reportCoreV2Policy');
const {fail}=require('./reportCorePolicy');
const {inflateRawSync}=require('node:zlib');
function inspectZip(buffer,{maxBytes=50*1024*1024}={}) {
  const end=buffer.lastIndexOf(Buffer.from('504b0506','hex'));
  if(end<0 || end+22>buffer.length)fail(415,'ZIP结构不完整');
  const count=buffer.readUInt16LE(end+10),offset=buffer.readUInt32LE(end+16);
  if(count>2000)fail(413,'压缩包项目过多');
  let pos=offset,total=0;const entries=new Map();
  for(let i=0;i<count;i++) {
    if(pos+46>buffer.length || buffer.readUInt32LE(pos)!==0x02014b50)fail(415,'ZIP目录损坏');
    const flags=buffer.readUInt16LE(pos+8),method=buffer.readUInt16LE(pos+10),size=buffer.readUInt32LE(pos+20),nameLength=buffer.readUInt16LE(pos+28),extra=buffer.readUInt16LE(pos+30),comment=buffer.readUInt16LE(pos+32),local=buffer.readUInt32LE(pos+42);
    const name=buffer.subarray(pos+46,pos+46+nameLength).toString('utf8');
    if(flags&1 || /(^\/|\\|(^|\/)\.\.(\/|$))/.test(name) || entries.has(name))fail(415,'压缩包路径或加密不合法');
    if(local+30>buffer.length || buffer.readUInt32LE(local)!==0x04034b50)fail(415,'ZIP数据损坏');
    const dataStart=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
    if(dataStart+size>buffer.length)fail(415,'ZIP数据越界');
    let value;
    try {value=method===0?buffer.subarray(dataStart,dataStart+size):method===8?inflateRawSync(buffer.subarray(dataStart,dataStart+size),{maxOutputLength:maxBytes}):null;} catch {fail(413,'压缩内容超出上限或损坏');}
    if(!value)fail(415,'压缩算法不支持');
    total+=value.length;if(total>maxBytes)fail(413,'解压内容超出上限');
    entries.set(name,value);pos+=46+nameLength+extra+comment;
  }
  return entries;
}
const metadata={'学期标识':'termId','模板版本':'templateVersion','账号':'username','学号':'username','姓名':'real_name','年级':'grade','班级':'classNo','测量日期':'measurementDate','视力制式':'visionStandard','数据提供教师':'providedByTeacherId',studentId:'studentId',username:'username',real_name:'real_name',grade:'grade',classNo:'classNo',termId:'termId',templateVersion:'templateVersion'};
function normalizeMeasurement(input,values) {
  const health=['height_cm','weight_kg','vision_left','vision_right','jump_rope_1min'];
  if(!health.some(k=>values[k]!==null && values[k]!==undefined))return null;
  const date=input?.date;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(+new Date(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)fail(422,'健康原值需合法测量日期');
  if(['vision_left','vision_right'].some(k=>values[k]!==null && values[k]!==undefined) && !['5_POINT','DECIMAL'].includes(input?.visionStandard))fail(422,'请选择视力制式');
  return {date,visionStandard:input.visionStandard||null,groupId:require('node:crypto').randomUUID()};
}
function parseV2Workbook(buffer,{termId,review=false,config}) {
  const v2=config===undefined||isV2(config),policy=config===undefined?catalog:policyFor(config);
  const byColumn=new Map(policy.fields.filter(f=>!f.jsonPath).map(f=>[f.column,f]));
  if(!Buffer.isBuffer(buffer)||buffer.length>10*1024*1024)fail(413,'Excel文件限10MB');
  const zip=buffer.subarray(0,2).toString()==='PK';
  if(zip){const entries=inspectZip(buffer);if(!entries.has('xl/workbook.xml') || [...entries.keys()].some(n=>/vbaproject|externallinks/i.test(n)))fail(415,'Excel格式或宏不合法');}
  else if(!buffer.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')))fail(415,'仅支持真实Excel文件');
  let wb;try{wb=XLSX.read(buffer,{type:'buffer',bookVBA:true,cellFormula:true});}catch{fail(415,'Excel文件损坏或加密');}
  if(wb.vbaraw)fail(415,'不能导入宏');
  const result=[];
  for(const sheetName of wb.SheetNames){
  const ws=wb.Sheets[sheetName];
  if(!ws?.['!ref'])continue;
  const range=XLSX.utils.decode_range(ws['!ref']);
  if(range.e.r-range.s.r>500)fail(422,'每批最多500名学生');
  if(range.e.c>149)fail(422,'表头列数超限');
  const cellErrors=new Map();
  for(const [name,cell] of Object.entries(ws))if(!name.startsWith('!') && (cell.f || cell.F || cell.t==='e')){
    if(!review)fail(422,'不能导入公式或错误单元格');
    const position=XLSX.utils.decode_cell(name);
    if(position.r===range.s.r)fail(422,'表头不能包含公式或错误单元格');
    cellErrors.set(`${position.r}:${position.c}`,{reason:cell.f||cell.F?'不能导入公式，请粘贴为数值':'Excel 错误单元格，请更正原文件',value:cell.f?`=${cell.f}`:cell.w||'#ERROR!'});
  }
  const data=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
  const labels=new Map(policy.fields.filter(f=>f.sourceType==='IMPORT').map(f=>[f.label,f.column]));
  const headers=(data.shift()||[]).map(h=>metadata[h] || (byColumn.get(h)?.sourceType==='IMPORT'?h:labels.get(h)));
  if(headers.some(h=>!h) || new Set(headers).size!==headers.length || !headers.includes('username')&&!headers.includes('studentId'))fail(422,'表头未知、重复或缺少账号 / 学生编号');
  for(const [index,row] of data.entries()){
    const rowNo=range.s.r+index+2;
    for(let i=0;i<headers.length;i++){
      const problem=cellErrors.get(`${rowNo-1}:${range.s.c+i}`);
      if(problem)row[i]=problem.value;
    }
    if(!row.some(v=>String(v).trim()))continue;
    if(result.length>=500)fail(422,'每批最多500名学生');
    const out={values:{},rowNo,sheetName,...(review?{columns:headers.filter(h=>byColumn.has(h)),inputErrors:[]}: {})};
    const error=(field,reason)=>{if(!review)fail(422,reason);out.inputErrors.push({field,reason});};
    for(const [i,key] of headers.entries()) {
      const value=String(row[i]??'').trim();if(!value)continue;
      const problem=cellErrors.get(`${rowNo-1}:${range.s.c+i}`);
      if(problem){error(key,problem.reason);if(byColumn.has(key))out.values[key]=value;else out[key]=value;continue;}
      const f=byColumn.get(key);
      if(f){const n=f.valueType==='number'&&!key.startsWith('vision_')||f.valueType==='star'&&!/^★+$/.test(value)?Number(value):value;try{out.values[key]=v2?validateV2Value(key,n,config):require('./reportCorePolicy').validateValue(key,n,config);}catch(e){if(e.statusCode!==422)throw e;error(key,e.message);out.values[key]=value;}}
      else out[key]=['grade','classNo'].includes(key)?Number(value):value;
    }
    if((v2||out.termId)&&out.termId!==String(termId)||v2&&out.templateVersion!=='SIX_EDU_V2')error('templateVersion',`第${rowNo}行学期或模板版本不匹配`);
    if(!out.username&&!out.studentId)error('username',`第${rowNo}行账号或学生编号缺失`);
    if(out.measurementDate||out.visionStandard)out.measurement={date:out.measurementDate,visionStandard:out.visionStandard};
    result.push(out);
  }
  }
  if(!result.length)fail(422,'工作簿没有学生数据');
  return result;
}
function buildV2Workbook({termId,roster=[]}) {
  const fields=catalog.fields.filter(f=>f.sourceType==='IMPORT');
  const headers=['学期标识','模板版本','账号','姓名','年级','班级','测量日期','视力制式','数据提供教师',...fields.map(f=>f.column)];
  const rows=roster.map(e=>[String(termId),'SIX_EDU_V2',e.student_number||e.username,e.student_name_snapshot,e.grade_snapshot,e.class_no_snapshot,'','','',...fields.map(()=> '')]);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([headers,...rows]),'成绩');
  return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
module.exports={parseV2Workbook,buildV2Workbook,inspectZip,normalizeMeasurement};
