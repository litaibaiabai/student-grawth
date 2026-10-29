import React,{useEffect,useState,useRef} from 'react';
import {api} from './api';
import {getSelfProgress} from './selfEvaluationModel';
import {defaultStoryMonth} from '../../util/storyMonths';
import {SourceList} from './Materials';
export default function StudentHome({ctx}) {
 const [data,setData]=useState(null);
 useEffect(()=>{const c=new AbortController();Promise.all([
  api(`/report-core/workspace?termId=${ctx.termId}`,undefined,undefined,{signal:c.signal}),
  api(`/report-core/evaluations/${ctx.actor.id}?termId=${ctx.termId}`,undefined,undefined,{signal:c.signal}),
  api(`/report-core/story-month?termId=${ctx.termId}&monthKey=${defaultStoryMonth(ctx.term)}`,undefined,undefined,{signal:c.signal}),
 ]).then(([summary,self,story])=>setData({summary,self,story})).catch(e=>{if(e.name!=='AbortError')ctx.error(e);});return()=>c.abort();},[ctx.termId,ctx.refreshKey]);
 const progress=data?getSelfProgress(data.self,ctx.catalog):null;
 return <><section className="student-cloud"><svg aria-hidden="true" viewBox="0 0 260 100"><path d="M20 75C-10 60 15 20 45 30C60-12 123-4 135 30C174 4 215 20 215 45C264 31 280 91 229 91H30Z" fill="#fff"/><circle cx="184" cy="30" r="18" fill="#ffd46f"/></svg><p className="kicker">成长有迹 · 云美少年</p><h2>{ctx.actor.real_name||'同学'}，今天也有小小进步</h2><p>一张卡、一个故事，慢慢装满你的成长手册。</p><div className="student-main-actions"><button onClick={()=>ctx.navigate('cards')}><span aria-hidden="true">✦</span><strong>领取我的卡片</strong><small>扫码后自动记1分</small></button><button onClick={()=>ctx.navigate('awards')}><span aria-hidden="true">♧</span><strong>晒晒我的奖状</strong><small>上传图片，等待老师认定</small></button></div></section>
 <div className="student-shortcuts"><button onClick={()=>ctx.navigate('stories')}><strong>我的故事小书房</strong><span>{data?.story.effectiveBatch?'本月已正式提交':'本月读、听、讲各1–3篇'}</span></button><button onClick={()=>ctx.navigate('self')}><strong>给自己点星星</strong><span>{progress?`已完成 ${progress.complete} / ${progress.total}`:'正在读取进度…'}</span></button><button onClick={()=>ctx.navigate('report')}><strong>我的期末报告</strong><span>{data?.summary.counts.published?'学校已发布，可以阅读和打印':'等待学校统一发布'}</span></button></div>
 {data&&<section className="panel"><h3>小提醒</h3>{data.summary.tasks.length?<ul>{data.summary.tasks.slice(0,4).map(t=><li key={t.taskId}>{ctx.catalog.fields.find(f=>f.column===t.fieldKey)?.label||t.reason}</li>)}</ul>:<p>当前没有待办，继续积累成长的故事吧。</p>}</section>}</>;
}
export function StudentArchive({ctx}) {
 const [group,setGroup]=useState('materials'),[rows,setRows]=useState([]),[offset,setOffset]=useState(null),[busy,setBusy]=useState(false);
 const sequence=useRef(0);
 const load=async(start=0)=>{const request=++sequence.current;setBusy(true);try{const query=new URLSearchParams({termId:ctx.termId,page:'1',offset:String(start),sourceType:group==='stories'?'STORY':group==='self'?'SELF':'CERTIFICATE'});const result=await api('/report-core/sources?'+query);if(request!==sequence.current)return;setRows(old=>start?[...old,...result.rows]:result.rows);setOffset(result.nextOffset);}catch(e){ctx.error(e);}finally{if(request===sequence.current)setBusy(false);}};
 useEffect(()=>{setRows([]);load();return()=>{sequence.current++;};},[group,ctx.termId,ctx.refreshKey]);
 return <><section className="panel"><h2>我的成长档案</h2><div className="self-steps">{[['materials','奖状材料'],['stories','故事历史'],['self','自评记录']].map(([key,label])=><button key={key} className={group===key?'primary':''} onClick={()=>setGroup(key)}>{label}</button>)}<button onClick={()=>ctx.navigate('report')}>已发布报告</button></div><p>保留原材料与历史版本，期末报告以学校已发布版本为准。</p></section><SourceList ctx={{...ctx,sources:rows}} types={group==='stories'?['STORY']:group==='self'?['SELF']:['CERTIFICATE']}/>{offset!==null&&<button disabled={busy} onClick={()=>load(offset)}>加载更多档案</button>}</>;
}
