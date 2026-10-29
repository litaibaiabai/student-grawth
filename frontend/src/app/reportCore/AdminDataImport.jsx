import React,{useEffect,useRef,useState} from 'react';
import {api,resultOf} from './api';
import {writeTemplate,useAdminRows} from './adminData';
export function Pager({view}){return <div className="actions"><small>{view.busy?'正在读取…':`共 ${view.state?.total??'—'} 条`}</small>{view.cursor&&<button onClick={view.first}>返回第一页</button>}<button disabled={view.busy||!view.state?.nextCursor} onClick={view.next}>下一页</button></div>;}
export function ImportHistory({ctx,kind}){const view=useAdminRows(ctx,'imports',{kind});return <section className="panel"><div className="section-heading"><h2>最近导入记录</h2><small>批次、操作者与实际差异可追溯</small></div>{view.error&&<p role="alert">{view.error}</p>}{view.state?.rows.map(b=><details className="import-history" key={b.batchId}><summary>批次 #{b.batchId} · {b.rowCount}行 · {b.status==='COMMITTED'?'已导入':'待确认'} · {b.actorName} · {new Date(b.createdAt).toLocaleString('zh-CN')}</summary><DiffTable ctx={ctx} diffs={b.diffs}/></details>)}{view.state&&!view.state.rows.length&&<p>还没有导入记录。</p>}<Pager view={view}/></section>;}
export function DiffTable({ctx,diffs=[]}){const label=k=>ctx.catalog.fields.find(f=>f.column===k)?.label||({real_name:'姓名',grade:'年级',classNo:'班级'})[k]||k;return <div className="table-scroll"><table><thead><tr><th>行号 / 学生或账号</th><th>处理</th><th>变更前 → 变更后</th></tr></thead><tbody>{diffs.map((d,i)=><tr key={i}><td>{d.rowNo??i+1} · {d.name||d.username||d.studentId}</td><td>{({NEW:'新增',UPDATE:'更新',UNCHANGED:'不变'})[d.action]||'更新'}</td><td>{Object.entries(d.after||d.values||{}).map(([k,v])=><p className="diff-cell" key={k}><b>{label(k)}</b>：{String(d.before?.[k]??'空白')} <span>→</span> {v===null?'明确清空':String(v)}</p>)}</td></tr>)}</tbody></table></div>;}
export function ImportReview({ctx,kind,rows,inputVersion=0,inputBusy=false,onCommitted}) {
 const [preview,setPreview]=useState(null),[errors,setErrors]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(null);
 const key=JSON.stringify([ctx.actor?.id,ctx.termId,kind,inputVersion,rows]),latest=useRef(key),alive=useRef(true);latest.current=key;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{setPreview(null);setErrors([]);setMessage('');if(rows?.length)setResult(null);},[key,rows?.length]);
 const run=async submit=>{
  const sentKey=key,sentRows=rows,sentVersion=inputVersion,selected=preview;
  if(busy||inputBusy||submit&&selected?.inputKey!==sentKey)return;
  setBusy(true);setMessage('');
  try {
   if(submit){
    const r=resultOf(await api(`/report-core/imports/${selected.batchId}/commit`,{expectedRevision:selected.revision}));if(!alive.current)return;
    const changed=latest.current!==sentKey;setResult({batchId:selected.batchId,counts:r.counts||{created:0,updated:r.updatedStudentIds?.length||0,skipped:0}});setPreview(null);
    onCommitted?.(sentRows,sentVersion);if(changed)setMessage('本批已提交；处理期间的新输入已保留，请重新预览后再提交。');ctx.refresh();ctx.notify('导入已提交');
   }else{
    const r=resultOf(await api('/report-core/imports/preview',{termId:ctx.termId,kind,rows:sentRows}));if(!alive.current||latest.current!==sentKey)return;
    setPreview({...r,inputKey:sentKey});setErrors(r.errors||[]);ctx.notify('预览完成，请核对差异');
   }
  }catch(e){if(!alive.current||!submit&&latest.current!==sentKey)return;setPreview(null);setErrors(e.details?.errors||[]);setMessage(e.message);if(e.status===401)ctx.error(e);}
  finally{if(alive.current)setBusy(false);}
 };
 return <div className="admin-import-review"><div className="actions"><button disabled={busy||inputBusy||!rows?.length} onClick={()=>run(false)}>预览导入</button><button className="primary" disabled={busy||inputBusy||preview?.inputKey!==key||!preview?.batchId||errors.length>0} onClick={()=>run(true)}>{busy?'正在处理…':'确认导入'}</button><small>共 {rows?.length||0} 行；预览不写入业务数据。</small></div>{message&&<p role="alert" className="feedback error">{message}，输入已保留，可修正后重新预览。</p>}{errors.length>0&&<div className="import-errors" role="alert"><h3>请修正 {errors.length} 项错误</h3>{errors.map((e,i)=><p key={i}>第{e.rowNo}行 · {e.field}：{e.reason}</p>)}<button onClick={()=>writeTemplate(errors,'导入错误清单')}>下载错误清单</button></div>}{preview&&<><h3>请核对差异</h3><p>新增 {preview.counts?.created||0} · 更新 {preview.counts?.updated||0} · 跳过 {preview.counts?.skipped||0}，{preview.batchId?'无误后确认导入。':'没有需要提交的变更。'}</p><DiffTable ctx={ctx} diffs={preview.diffs}/></>}{result&&<p role="status" className="feedback success">批次 #{result.batchId} 已提交，新增 {result.counts.created}、更新 {result.counts.updated}、跳过 {result.counts.skipped}。</p>}</div>;
}
