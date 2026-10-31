import React,{useCallback,useEffect,useRef,useState} from 'react';
import {api,download,resultOf} from './api';
import {UIIcon} from './illustrations';
import StudentAssessmentReport from '../../component/StudentAssessmentReport';
import './comprehensiveImport.css';

const uploadSections=['conduct','wisdom','health','art','labor'];
export default function ComprehensiveImport({ctx}){
 const [batch,setBatch]=useState(null),[index,setIndex]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[downloading,setDownloading]=useState(false),[committed,setCommitted]=useState(false);
 const input=useRef(null),request=useRef(0),controller=useRef(null),downloadController=useRef(null),report=useRef(null);
 const {termId,actor,sessionActive}=ctx;
 const invalidate=useCallback(()=>{request.current++;controller.current?.abort();downloadController.current?.abort();},[]);
 useEffect(()=>{
  invalidate();setBatch(null);setIndex(0);setBusy(false);setError('');setDownloading(false);setCommitted(false);
  return invalidate;
 },[termId,actor.id,sessionActive,invalidate]);
  const downloadTemplate = async () => {
    if (downloading) return;
    const pending = new AbortController();
    downloadController.current = pending;
    setDownloading(true);
    setError('');
    try {
      await download(`/report-core/imports/template?termId=${encodeURIComponent(termId)}`, '综合成绩导入模板.xlsx', { signal: pending.signal });
    } catch (e) {
      if (!pending.signal.aborted) {
        setError(`模板下载失败：${e.message || '请检查网络后重试'}`);
        if (e.status === 401) ctx.error(e);
      }
    } finally {
      if (!pending.signal.aborted) setDownloading(false);
    }
  };
 const upload=async file=>{
  const current=++request.current;controller.current?.abort();controller.current=new AbortController();
  setError('');setBatch(null);setIndex(0);setCommitted(false);
  if(!/\.xlsx?$/i.test(file.name)){setError('请选择 .xlsx 或 .xls 格式的 Excel 文件。');return;}
  if(file.size>10*1024*1024){setError('Excel 文件不能超过 10 MiB。');return;}
  setBusy(true);
  try{
   const form=new FormData();form.set('termId',termId);form.set('kind','ACADEMIC');form.set('file',file);
   const response=resultOf(await api('/report-core/imports/file-preview',form,undefined,{signal:controller.current.signal}));
   if(current!==request.current)return;
   if(!Array.isArray(response.students)||!response.students.length)throw Error('未读取到完整学生名单，请检查 Excel 后重新上传。');
   setBatch({...response,fileName:file.name});
  }catch(e){if(current===request.current&&e.name!=='AbortError'){setError(e.message);if(e.status===401)ctx.error(e);}}
  finally{if(current===request.current)setBusy(false);}
 };
 const commit=async()=>{
  if(!batch?.batchId||batch.demonstration||batch.errors.length||busy||committed)return;
  const current=request.current;setBusy(true);setError('');
  try{
   await api(`/report-core/imports/${batch.batchId}/commit`,{expectedRevision:batch.revision});
   if(current!==request.current)return;
   setCommitted(true);ctx.notify(`综合成绩已导入 · ${batch.totalCount} 名学生`);ctx.refresh();
  }catch(e){if(current===request.current){setError(e.status===409?`${e.message}，请重新上传文件后再核对。`:e.message);if(e.status===401)ctx.error(e);}}
  finally{if(current===request.current)setBusy(false);}
 };
 const record=batch?.students[index],errorStudents=batch?.students.filter(s=>s.errors.length)||[];
 const focusError=field=>{
  const element=[...(report.current?.querySelectorAll('[data-report-field]')||[])].find(el=>el.dataset.reportField===field);
  if(element){element.setAttribute('tabindex','-1');element.focus({preventScroll:true});element.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
 };
 const pick=()=>input.current?.click();
 return <section className="comprehensive-import" aria-label="综合成绩核对" aria-busy={busy}>
  <input className="assessment-file-input" ref={input} aria-label="综合成绩文件" type="file" accept=".xlsx,.xls" disabled={busy||sessionActive===false} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)upload(file);}}/>
  {error&&<p className="assessment-upload-error" role="alert">{error}</p>}
      <div className="assessment-template-bar">
        <div><strong>先下载模板，再填写成绩</strong><span>8 名示例学生可上传预览；正式导入请替换为真实学号、姓名与成绩。</span></div>
        <button className="assessment-template-button" disabled={busy || downloading || sessionActive === false || !termId} onClick={downloadTemplate}>
          <UIIcon name="report" />{downloading ? '正在下载…' : '下载模板'}
        </button>
      </div>
  {!batch?<div className="assessment-upload-empty"><button className="primary assessment-upload-button" disabled={busy||sessionActive===false} onClick={pick}><UIIcon name="upload"/>{busy?'正在读取 Excel…':'上传 Excel'}</button>{busy&&<p role="status">正在读取完整学生名单并核对成绩，请稍候…</p>}</div>:<>
   {batch.demonstration&&<p className="assessment-demo-notice" role="status"><strong>示例预览 · 不会写入正式成绩</strong>当前展示范本中的 8 名虚构学生，无需匹配真实学号。正式导入时，请将全部示例替换为任教范围内的真实学生和成绩。</p>}
   <header className="assessment-batch-bar"><div className="assessment-batch-count"><strong>{batch.totalCount}</strong><div>已上传学生<span title={batch.fileName}>{batch.fileName}</span></div></div><div className="assessment-batch-navigation"><button className="assessment-reupload" disabled={busy} onClick={pick}>重新上传</button><span className="assessment-position" aria-live="polite"><b>{String(index+1).padStart(2,'0')}</b> / {batch.totalCount}</span><button disabled={busy||index===0} onClick={()=>setIndex(n=>n-1)}>← 上一个</button><button disabled={busy||index===batch.students.length-1} onClick={()=>setIndex(n=>n+1)}>下一个 →</button></div></header>
   <div className="assessment-review-status"><span className={record.errors.length?'has-errors':''} role="status">{record.errors.length?`! 该页有错 · ${record.errors.length} 项需要核对`:'✓ 该页核对通过'}</span><div className="assessment-source-legend"><span><i/>教师上传</span><span><i className="prefill"/>系统 / 预填</span><span><i className="invalid"/>需核对</span></div></div>
   {record.errors.length>0&&<div className="assessment-row-errors" role="alert"><strong>{record.student.name} · 该页有错</strong><span>{record.sheetName} · Excel 第 {record.rowNo} 行</span><ul>{record.errors.map((item,i)=><li key={`${item.field}:${i}`}><button onClick={()=>focusError(item.field)}>{ctx.catalog.fields.find(f=>f.column===item.field)?.label||({username:'学生账号',real_name:'姓名',classNo:'班级',templateVersion:'模板 / 学期',measurementDate:'测量日期',visionStandard:'视力制式',permissions:'录入权限'})[item.field]||item.field}：{item.reason}</button></li>)}</ul><p>请在 Excel 中更正后重新上传。</p></div>}
   <div ref={report}><StudentAssessmentReport catalog={ctx.catalog} record={record} term={ctx.term} sequence={index+1} sections={uploadSections} showNarratives={false}/></div>
   <footer className="assessment-batch-footer"><div><span>共 {batch.totalCount} 名学生，按 Excel 顺序逐人核对。</span>{errorStudents.length>0?<span className="assessment-batch-error">{errorStudents.length} 名学生有错，暂不能导入。<button onClick={()=>setIndex(batch.students.findIndex(s=>s.errors.length))}>查看有错学生</button></span>:<span>{batch.demonstration?'示例数据仅供查看，不能导入正式成绩。':committed?'成绩已导入，可以继续翻页核对。':batch.batchId?'核对无误后，确认导入本批成绩。':'没有需要写入的新成绩，已保留完整名单供核对。'}</span>}</div><button className="primary" disabled={busy||batch.demonstration||batch.errors.length>0||!batch.batchId||committed} onClick={commit}>{batch.demonstration?'示例预览 · 不可导入':busy?'正在导入…':committed?'已导入':'确认导入'}</button></footer>
  </>}
 </section>;
}
