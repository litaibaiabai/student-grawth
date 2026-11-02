import React,{useEffect,useRef,useState} from 'react';
import {api,download} from '../../core/api';
import {useDraftGuard} from '../../core/ui';
export default function RegistryWorkbookImport({ctx}){
 const [preview,setPreview]=useState(null),[failure,setFailure]=useState(null),[busy,setBusy]=useState(false),[fileName,setFileName]=useState(''),[columns,setColumns]=useState(null);
 const request=useRef(null),input=useRef(null);useDraftGuard(ctx,Boolean(preview)||busy);
 useEffect(()=>{request.current=new AbortController();return()=>request.current.abort();},[]);
 const error=e=>{if(e.name!=='AbortError'){setFailure(e);if(e.status===401)ctx.error(e);}};
 const template=async()=>{try{await download('/admin/report-core/registry/template','学期初始化工作簿.xlsx');}catch(e){error(e);}};
 const fields=async()=>{try{setColumns(await api('/admin/report-core/registry/columns',undefined,undefined,{signal:request.current.signal}));}catch(e){error(e);}};
 const choose=async file=>{
  if(!file)return;setPreview(null);setFailure(null);setFileName(file.name);setBusy(true);
  try{if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>10*1024*1024)throw Error('请选择10MiB以内的xlsx文件');const form=new FormData();form.append('file',file);const result=await api('/admin/report-core/registry/preview',form,undefined,{signal:request.current.signal});setPreview(result);}catch(e){error(e);}finally{if(!request.current.signal.aborted)setBusy(false);}
 };
 const commit=async()=>{
  if(!preview||busy)return;setBusy(true);setFailure(null);
  try{const result=await api('/admin/report-core/registry/commit',{previewToken:preview.previewToken},undefined,{signal:request.current.signal});setPreview(null);setFileName('');ctx.notify(result.replayed?'该文件已导入，未重复写入数据。':'学期、师生和班级关系已一次导入。');await ctx.reloadTerms();ctx.selectTerm(result.result.termId);ctx.refresh();}catch(e){error(e);}finally{if(!request.current.signal.aborted)setBusy(false);}
 };
 return <section className="registry-intake"><div><p className="registry-eyebrow">从一份名单，开始一个学期</p><h2>把人、班级与课程，<br/>放在同一份名单里。</h2><p>一份 Excel，完成学期与师生初始化。<br/>导入后的关系集中查询，不再逐个维护任教班级。</p><ol className="registry-steps"><li>上传文件</li><li>检查关系</li><li>确认导入</li></ol></div><div className="registry-upload"><h3>学期初始化工作簿</h3><p>一个 .xlsx 文件 · 五张工作表<br/>学期、教师、班级、学生、任教关系</p><div className="actions"><button className="primary" disabled={busy} onClick={()=>input.current.click()}>{busy?'正在检查…':'选择 Excel 文件'}</button><button disabled={busy} onClick={template}>下载模板</button><button disabled={busy} onClick={fields}>字段说明</button><input ref={input} className="registry-file" type="file" accept=".xlsx" aria-label="上传学期初始化Excel" onChange={e=>{choose(e.target.files[0]);e.target.value='';}}/></div><small>{fileName||'账号使用文本 · 跨表关联校验 · 确认前不写入'}</small></div>
 {columns&&<div className="registry-review"><div className="section-heading"><h3>工作簿字段要求</h3><button onClick={()=>setColumns(null)}>收起说明</button></div><p>新账号初始密码至少10位；已有账号不会重置密码。学期表仅一行，日期使用 YYYY-MM-DD；账号为文本单元格。</p><div className="table-scroll"><table><thead><tr><th>工作表</th><th>列名</th></tr></thead><tbody>{Object.entries(columns).map(([name,fields])=><tr key={name}><th>{name}</th><td>{fields.join('、')}</td></tr>)}</tbody></table></div><small>采集截止日期默认结束日期；报到日期可空；设为当前学期默认“是”；班级名称可空。</small></div>}
 {failure&&<div className="registry-review feedback error" role="alert"><strong>{failure.message}</strong>{failure.details?.errors&&<ul>{failure.details.errors.map((e,i)=><li key={i}>{e.sheet} · 第{e.rowNo}行 · {e.field}：{e.message}</li>)}</ul>}</div>}
 {preview&&<div className="registry-review"><p className="registry-eyebrow">检查完成 · 等待确认</p><h3>{preview.term.termName}</h3><div className="registry-counts">{Object.entries(preview.counts).map(([key,c])=><div key={key}><strong>{({teachers:'教师',students:'学生',classes:'班级',assignments:'任教关系'})[key]}</strong><span>新增 {c.created} · 更新 {c.updated} · 不变 {c.skipped}</span></div>)}</div><p>将整单导入；任何一行失败均不部分保存。遗漏记录保留，既有密码不变。</p><details><summary>查看账号差异（{preview.diffs.length} 条）</summary><div className="table-scroll"><table><thead><tr><th>位置</th><th>账号 / 姓名</th><th>处理</th></tr></thead><tbody>{preview.diffs.map((d,i)=><tr key={i}><td>{d.sheet} 第{d.rowNo}行</td><td>{d.username} · {d.name}</td><td>{({created:'新增',updated:'更新',skipped:'不变'})[d.action]}</td></tr>)}</tbody></table></div></details><div className="actions"><button disabled={busy} onClick={()=>setPreview(null)}>取消导入</button><button className="primary" disabled={busy} onClick={commit}>{busy?'正在导入…':'确认整单导入'}</button></div></div>}
 </section>;
}
