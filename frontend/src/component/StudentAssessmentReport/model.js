const sectionDefinitions=[['conduct','德美','CHARACTER'],['wisdom','智美','ACADEMIC LEARNING'],['health','健美','HEALTH & FITNESS'],['art','艺美','ARTS & EXPRESSION'],['labor','劳美','LABOR & PRACTICE'],['story','故事美','STORIES & GROWTH']];
export function reportSections(catalog,sections=sectionDefinitions.map(s=>s[0])){
 return sectionDefinitions.filter(([id])=>sections.includes(id)).map(([id,title,subtitle])=>({id,title,subtitle,fields:catalog.fields.filter(f=>f.section===id)}));
}
export function fieldPresentation(record,field){
 let value=record.values?.[field.column];
 if(field.jsonPath){
  if(typeof value==='string')try{value=JSON.parse(value);}catch{value=null;}
  value=field.jsonPath.replace(/^\$\[(\d+)\]\.?/,'$1.').split('.').filter(Boolean).reduce((v,key)=>v?.[key],value);
 }
 const error=(record.errors||[]).filter(e=>e.field===field.column).map(e=>e.reason).join('；');
 const source=field.sourceType==='IMPORT'&&(record.uploadedFields||[]).includes(field.column)?'teacher':'prefill';
 const text=value===null||value===undefined||value===''?(error?'待填写':'—'):field.valueType==='star'&&[1,2,3].includes(Number(value))?'★'.repeat(Number(value)):typeof value==='object'?JSON.stringify(value):String(value);
 return {value,text,source,error};
}
