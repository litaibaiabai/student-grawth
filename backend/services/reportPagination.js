const {catalog}=require('./reportCorePolicy');
const narrativeLabels={self_conduct_text:'品行美',self_wisdom_text:'智慧美',self_health_text:'健康美',self_art_text:'艺术美',self_labor_text:'劳动美',semester_highlights:'本学期最大收获与活动',next_term_goals:'下学期努力目标',teacher_comment:'学期寄语',family_message:'家长寄语'};
const normalize=text=>String(text??'').replace(/\r\n?/g,'\n');
const width=char=>char==='\t'?2:char.codePointAt(0)>=0x1f000?2:1;
function splitText(text,{columns=80,maxLines=24}={}){
 const chunks=[];let current='',col=0,lines=1,offset=0;
 const flush=()=>{if(current){chunks.push({text:current,lines,start:offset});offset+=current.length;}current='';col=0;lines=1;};
 for(const char of normalize(text)){
  let nextLine=char==='\n'||col+width(char)>columns;
  if(nextLine&&lines>=maxLines){flush();nextLine=char==='\n';}
  if(nextLine){lines++;col=0;}
  current+=char;if(char!=='\n')col+=width(char);
 }
 flush();return chunks;
}
function needs(text,limit,allowTwoLines=false){const t=normalize(text);return [...t].length>limit||splitText(t,{columns:limit,maxLines:99999})[0]?.lines>(allowTwoLines?2:1);}
function specialtyId(collection,item,index,property){return `special:${collection}:${String(item.id||'index-'+index)}:${property}`;}
function createContinuationPlan(model,scope='FULL'){
 const entries=[],refs=new Map();
 const add=(id,label,text,extra={})=>{if(String(text??'').length)entries.push({id,label,text:normalize(text),...extra});};
 if(scope==='FULL')for(const [key,label] of Object.entries(narrativeLabels))if(needs(model.narratives?.[key],36,true))add('narrative:'+key,label,model.narratives[key]);
 for(const field of catalog.fields.filter(f=>!f.jsonPath&&(f.valueType==='text'||f.column.startsWith('vision_'))))if(needs(model.values?.[field.column],field.column.startsWith('vision_')?8:22))add('field:'+field.column,field.label,model.values[field.column]);
 for(const [collection,array,min] of [['sports_specialties',model.sportsSpecialties||[],1],['art_specialties',model.artSpecialties||[],2]])array.forEach((item,index)=>{
  const prefix=collection==='sports_specialties'?'体育特长':'艺术特长',rating=`自评${item.self_star?'★'.repeat(item.self_star):'—'} / 教师${item.teacher_star?'★'.repeat(item.teacher_star):'—'}`;
  for(const property of ['name','outcome'])if(index>=min||needs(item[property],property==='name'?12:10))add(specialtyId(collection,item,index,property),`${prefix} · 项目${index+1} · ${property==='name'?'项目名称':'成果表现'} · ${rating}`,item[property],{specialtyId:String(item.id||'index-'+index),collection});
 });
 const pages=[];let page=null;const base=scope==='FULL'?2:1;
 for(const entry of entries)for(const part of splitText(entry.text)){
  const cost=part.lines+2;if(!page||page.units+cost>28){page={number:base+pages.length+1,units:0,blocks:[]};pages.push(page);}
  page.units+=cost;page.blocks.push({...entry,...part,continued:part.start>0});if(!refs.has(entry.id))refs.set(entry.id,page.number);
 }
 return {pages,refs,pageCount:base+pages.length};
}
module.exports={createContinuationPlan,splitText,specialtyId,narrativeLabels,normalize};
