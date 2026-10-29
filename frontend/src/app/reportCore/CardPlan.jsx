import React,{useCallback,useEffect,useRef,useState} from 'react';
import {api,resultOf,download} from './api';
import {useDraftGuard} from './adminData';
import {cardSubject} from './cardModel';
export default function CardPlan({ctx,quotaId,onSaved,onGuardChange}) {
 const {termId,error:onError}=ctx;
 const [quota,setQuota]=useState(null),[plans,setPlans]=useState([]),[generated,setGenerated]=useState(0),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[printClass,setPrintClass]=useState('');
 const dirtyRef=useRef(dirty);dirtyRef.current=dirty;useDraftGuard(ctx,dirty,'分班计划尚未保存，离开会放弃修改。是否离开？');
 const guard=useCallback(()=>!dirtyRef.current||window.confirm('分班计划尚未保存，切换会放弃修改。是否切换？'),[]);
 useEffect(()=>{onGuardChange?.(guard);return()=>onGuardChange?.(null);},[onGuardChange,guard]);
 const sequence=useRef(0);
 const classes=[...new Map(ctx.assignments.map(a=>[`${a.grade}:${a.class_no}`,{grade:a.grade,classNo:a.class_no}])).values()];
 const classList=useRef(classes);classList.current=classes;
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const read=useCallback(async()=>{
  const request=++sequence.current;
  const qs=await api(`/report-core/card-quotas?termId=${termId}&kind=QUOTA`),q=qs.find(q=>String(q.id)===String(quotaId));if(!q)throw Error('计划不存在或无权限');
  const summary=await api(`/report-core/card-ledger/summary?termId=${termId}&monthFrom=${q.month_key}&monthTo=${q.month_key}`);
  if(request!==sequence.current)return;
  setQuota(q);setGenerated(summary.generatedRecords);setPlans(q.payload.plans?.length?q.payload.plans:[{...(classList.current[0]||{}),classTotal:0,items:[{categoryCode:'',count:0}]}]);setDirty(false);
 },[termId,quotaId]);
 useEffect(()=>{read().catch(e=>{setError(e.message);if(e.status===401)onError(e);});return invalidate;},[read,onError,invalidate]);
 const run=async fn=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);if(e.status===401)onError(e);}finally{setBusy(false);}};
 const updateItem=(i,j,changes)=>{setPlans(old=>old.map((p,k)=>k===i?{...p,items:p.items.map((item,n)=>n===j?{...item,...changes}:item)}:p));setDirty(true);};
 const update=(i,changes)=>{setPlans(old=>old.map((p,j)=>i===j?{...p,...changes}:p));setDirty(true);};
 if(!quota)return <section className="panel"><p role={error?'alert':'status'}>{error||'正在读取分班计划…'}</p></section>;
 const total=plans.reduce((n,p)=>n+Number(p.classTotal||0),0),valid=total>0&&total<=quota.payload.quotaTotal&&new Set(plans.map(p=>`${p.grade}:${p.classNo}`)).size===plans.length&&plans.every(p=>classes.some(c=>c.grade===p.grade&&c.classNo===p.classNo)&&Number.isInteger(p.classTotal)&&p.classTotal>=0&&p.items.every(i=>i.categoryCode&&Number.isInteger(i.count)&&i.count>=0)&&p.items.reduce((n,i)=>n+i.count,0)===p.classTotal);
 return <section className="panel card-plan"><h2>分班计划 · {quota.month_key}</h2><p>管理员额度 {quota.payload.quotaTotal} 张 · 按班分配 {total} 张 · 已制卡 {generated} 张</p>{generated>0&&<p className="feedback success">本计划已制卡，班级和方向已锁定。剩余额度不代表此计划可再次生成；可补打当前未领取原卡。</p>}
 <fieldset disabled={busy||generated>0}><legend>每班总量与评价方向</legend>{plans.map((p,i)=><section className="class-plan" key={i}><div className="actions"><label>班级<select aria-label={`计划班级${i}`} value={`${p.grade}:${p.classNo}`} onChange={e=>{const [grade,classNo]=e.target.value.split(':').map(Number);update(i,{grade,classNo,items:[{categoryCode:'',count:0}]});}}>{classes.map(c=><option key={`${c.grade}:${c.classNo}`} value={`${c.grade}:${c.classNo}`}>{c.grade}年级{c.classNo}班</option>)}</select></label><label>班级总量<input aria-label={`班级总量${i}`} type="number" min="0" value={p.classTotal} onChange={e=>update(i,{classTotal:Number(e.target.value)})}/></label><button onClick={()=>{setPlans(plans.filter((_,j)=>j!==i));setDirty(true);}}>移除班级</button></div>{p.items.map((item,j)=>{const allowed=ctx.catalog.cardCatalog.filter(c=>ctx.assignments.some(a=>a.grade===p.grade&&a.class_no===p.classNo&&(c.group==='德美'||a.subject_code===cardSubject(c.targetColumn))));return <div className="actions" key={j}><label>细分方向<select aria-label={`计划方向${i}-${j}`} value={item.categoryCode} onChange={e=>updateItem(i,j,{categoryCode:e.target.value})}><option value="">选择方向</option>{allowed.map(c=><option key={c.code} value={c.code}>{c.group} · {c.item}</option>)}</select></label><label>张数<input aria-label={`计划张数${i}-${j}`} type="number" min="0" value={item.count} onChange={e=>updateItem(i,j,{count:Number(e.target.value)})}/></label><button onClick={()=>update(i,{items:p.items.filter((_,k)=>k!==j)})}>移除方向</button></div>;})}<button onClick={()=>update(i,{items:[...p.items,{categoryCode:'',count:0}]})}>添加细分方向</button><p>明细合计 {p.items.reduce((n,item)=>n+item.count,0)} / 班级总量 {p.classTotal}</p></section>)}<button onClick={()=>{const next=classes.find(c=>!plans.some(p=>p.grade===c.grade&&p.classNo===c.classNo));if(next){setPlans([...plans,{...next,classTotal:0,items:[{categoryCode:'',count:0}]}]);setDirty(true);}}} disabled={plans.length>=classes.length}>添加负责班级</button></fieldset>
 {error&&<p role="alert" className="feedback error">{error}</p>}<div className="actions"><button disabled={busy||generated>0||!valid||!dirty} onClick={()=>run(async()=>{const result=resultOf(await api(`/report-core/card-quotas/${quota.id}/plan`,{expectedRevision:quota.revision,plans},'PATCH'));setQuota({...quota,revision:result.revision,status:'CONFIRMED',payload:{...quota.payload,plans}});setDirty(false);ctx.notify('分班计划已保存，可直接预览并生成');onSaved?.();})}>保存分班计划</button><button className="primary" disabled={busy||generated>0||!valid||dirty||quota.status!=='CONFIRMED'} onClick={()=>run(async()=>{await api(`/report-core/card-quotas/${quota.id}/generate`,{expectedRevision:quota.revision});await read();ctx.notify('卡片已生成');onSaved?.();})}>生成全部班级卡片</button></div>
 {generated>0&&<div className="actions"><label>原卡打印范围<select aria-label="原卡打印班级" value={printClass} onChange={e=>setPrintClass(e.target.value)}><option value="">全部班级（ZIP内每班一个PDF）</option>{plans.map(p=><option key={`${p.grade}:${p.classNo}`} value={`${p.grade}:${p.classNo}`}>{p.grade}年级{p.classNo}班（PDF）</option>)}</select></label><button disabled={busy} onClick={()=>run(async()=>{const [grade,classNo]=printClass.split(':').map(Number);const r=resultOf(await api(`/report-core/card-quotas/${quota.id}/print-requests`,printClass?{grade,classNo}:{}));await download(r.downloadUrl.replace('/api/v1',''),printClass?'班级原积分卡.pdf':'class-cards.zip');ctx.notify('原卡文件已下载，请在打印机中选择打印');onSaved?.();})}>{printClass?'下载本班原卡 PDF':'下载分班 PDF 压缩包'}</button></div>}
 </section>;
}
