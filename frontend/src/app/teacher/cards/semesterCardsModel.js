export function courseCardsQuery({termId,grade,classNo,subjectCode,status,q,page}){const p=new URLSearchParams({termId});for(const[k,v]of Object.entries({grade,classNo,subjectCode,status,q,page}))if(v!==undefined&&v!=='')p.set(k,String(v));return p.toString();}
export const canPrintSemesterCards=({initializationStatus,available})=>['INITIALIZED','LEGACY_LOCKED'].includes(initializationStatus)&&available>0;
export const scopedCoursePreview=(preview,scope)=>preview?.scope===scope?preview:null;
