import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { StarPicker } from './ui';
import { buildSelfGroups,getSelfProgress,mergeSelfDraft } from './selfEvaluationModel';
export default function SelfEvaluation({ctx}) {
 const [view,setView]=useState(null),[step,setStep]=useState(0),[dirty,setDirty]=useState({}),[special,setSpecial]=useState([]),[saving,setSaving]=useState(false),[conflicts,setConflicts]=useState([]),[message,setMessage]=useState('');
 const current=useRef({dirty,special});current.current={dirty,special};
 useEffect(()=>{ctx.setLeaveGuard?.(()=>!Object.keys(current.current.dirty).length&&!current.current.special.length||window.confirm('还有未保存的评价，离开会放弃本次填写。是否离开？'));return()=>ctx.setLeaveGuard?.(null);},[]);
 const read=()=>api(`/report-core/evaluations/${ctx.actor.id}?termId=${ctx.termId}`);
 useEffect(()=>{let active=true;read().then(v=>{if(active)setView(v);}).catch(ctx.error);return()=>{active=false;};},[ctx.actor.id,ctx.termId]);
 useEffect(()=>{const handler=e=>{if(Object.keys(current.current.dirty).length||current.current.special.length){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[]);
 if(!view)return <section className="panel" role="status">正在打开我的成长手册…</section>;
 const groups=buildSelfGroups(view,ctx.catalog),values={...view.values,...dirty};
 const overlay=(array,collection)=>(array||[]).map(x=>{const c=special.find(s=>s.id===x.id&&s.collection===collection);return c?{...x,...c.changes}:x;});
 const progress=getSelfProgress({...view,values,sportsSpecialties:overlay(view.sportsSpecialties,'sports'),artSpecialties:overlay(view.artSpecialties,'art')},ctx.catalog);
 const setValue=(column,value)=>setDirty(old=>({...old,[column]:value}));
 const setStar=(collection,id,value)=>setSpecial(old=>[...old.filter(x=>!(x.collection===collection&&x.id===id)),{collection,id,changes:{self_star:value}}]);
 const tooLong=Object.entries(values).some(([k,v])=>typeof v==='string'&&[...v].length>(k==='family_message'?1000:2000));
 const save=async()=>{
  const sent=current.current,base=view;setSaving(true);setMessage('');
  try{
   await api(`/report-core/forms/${ctx.actor.id}`,{termId:ctx.termId,expectedRevision:view.revision,values:sent.dirty,specialtyChanges:sent.special},'PATCH');
   const fresh=await read();
   setDirty(now=>Object.fromEntries(Object.entries(now).filter(([k,v])=>!Object.hasOwn(sent.dirty,k)||sent.dirty[k]!==v)));
   setSpecial(now=>now.filter(x=>!sent.special.some(y=>y.id===x.id&&y.collection===x.collection&&y.changes.self_star===x.changes.self_star)));
   setView(fresh);setMessage('');ctx.notify('评价已保存');
  }catch(error){
   if(error.status===409){
    try{const fresh=await read();const merged=mergeSelfDraft({base,local:current.current.dirty,remote:fresh,specialtyChanges:current.current.special});setView(fresh);setDirty(merged.merged);setSpecial(merged.specialtyChanges);setConflicts(merged.conflicts);setMessage(merged.removedSpecialtyIds.length?'特长项目已撤回，相关修改已移除；其他输入保留。':'内容有更新，请核对冲突后再次保存。');}catch(e){ctx.error(e);}
   }else ctx.error(error);
  }finally{setSaving(false);}
 };
 const resolve=(conflict,useLocal)=>{
  if(!useLocal){if(conflict.specialty)setStar(conflict.specialty.collection,conflict.specialty.id,conflict.remote);else setValue(conflict.field,conflict.remote);}
  setConflicts(old=>old.filter(x=>x.field!==conflict.field));
 };
 return <section className="panel self-book">
  <div className="self-welcome"><span className="self-mascot" aria-hidden="true">☀</span><div><p className="kicker">我的成长手册</p><h2>给自己点星星</h2><p>想一想自己的表现，选出最像自己的星星吧。</p></div><span className="core-badge">已完成 {progress.complete} / {progress.total}</span></div>
  <nav className="self-steps" aria-label="自评内容">{groups.map((g,i)=><button key={g.key} aria-current={step===i?'step':undefined} className={step===i?'primary':''} onClick={()=>setStep(i)}>{i+1} · {g.description}</button>)}</nav>
  {!view.editable&&<p role="status">{view.lockReason}</p>}
  <h3>{groups[step].title}</h3><div className="self-fields">
  {groups[step].fields.map(f=>f.valueType==='text'?<label key={f.column}>{f.label}<textarea aria-label={f.label} rows={4} disabled={!view.editable} value={values[f.column]||''} onChange={e=>setValue(f.column,e.target.value)}/><small>{[...(values[f.column]||'')].length} / 2000 字</small></label>:<div className="self-star-card" key={f.column}><StarPicker label={f.label} value={values[f.column]} disabled={!view.editable} onChange={v=>setValue(f.column,v)}/><button disabled={!view.editable||values[f.column]==null} onClick={()=>setValue(f.column,null)} aria-label={`清除${f.label}`}>清除</button></div>)}
  </div>
  {['health','art'].includes(groups[step].key)&&<section><h3>我的{step===1?'体育':'艺术'}特长</h3>{(step===1?overlay(view.sportsSpecialties,'sports'):overlay(view.artSpecialties,'art')).length===0?<p>还没有已认定的特长项目，有了以后再来点星星。</p>:(step===1?overlay(view.sportsSpecialties,'sports'):overlay(view.artSpecialties,'art')).map(x=><div className="self-star-card" key={x.id}><StarPicker label={`${x.name} · 自评`} value={x.self_star} disabled={!view.editable} onChange={v=>setStar(step===1?'sports':'art',x.id,v)}/><button disabled={!view.editable||x.self_star==null} onClick={()=>setStar(step===1?'sports':'art',x.id,null)}>清除</button></div>)}</section>}
  {step===3&&<label>家长寄语（可选）<textarea aria-label="家长寄语（家长协助填写，可选）" value={values.family_message||''} disabled={!view.editable} onChange={e=>setValue('family_message',e.target.value)}/><small>{[...(values.family_message||'')].length} / 1000 字，不计入完成进度</small></label>}
  {conflicts.map(c=><div className="feedback error" key={c.field}><p>{ctx.catalog.fields.find(f=>f.column===c.field)?.label||'特长自评'}发生变化：本次 {String(c.local??'清除')}，已保存 {String(c.remote??'清除')}</p><button onClick={()=>resolve(c,true)}>保留我的填写</button><button onClick={()=>resolve(c,false)}>采用已保存内容</button></div>)}
  {tooLong&&<p role="alert">文字超出上限，请按每段提示调整后保存。</p>}{message&&<p role="status">{message}</p>}<div className="self-save"><p>可先保存一部分，再回来继续填写。</p><button className="primary" disabled={tooLong||saving||!view.editable||conflicts.length>0||(!Object.keys(dirty).length&&!special.length)} onClick={save}>{saving?'正在保存…':'保存评价'}</button></div>
 </section>;
}
