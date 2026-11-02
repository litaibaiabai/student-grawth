export function registryQuery({termId,view='students',q='',grade='',classNo='',subjectCode='',cursor=null}){const p=new URLSearchParams({termId,view,limit:'25'});for(const[k,v]of Object.entries({q,grade,classNo,subjectCode,cursor}))if(v)p.set(k,v);return p.toString();}
export const changeRegistryFilters=(state,patch)=>({...state,...patch,cursor:null});

export function registryFiltersForTerm(state,termId){return String(state.termId)===String(termId)?state:{...state,termId,cursor:null};}

export const registryRelationsForQuery=(loaded,query)=>loaded?.query===query?loaded.value:null;
