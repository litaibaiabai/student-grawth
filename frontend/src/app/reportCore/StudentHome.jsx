import React,{useEffect,useState,useRef} from 'react';
import {api} from './api';
import {getSelfProgress} from './selfEvaluationModel';
import {defaultStoryMonth} from '../../util/storyMonths';
import {SourceList} from './Materials';
import {CloudMascot,UIIcon} from './illustrations';
export default function StudentHome({ctx}) {
 const [data,setData]=useState(null);
 useEffect(()=>{const c=new AbortController();Promise.all([
  api(`/report-core/workspace?termId=${ctx.termId}`,undefined,undefined,{signal:c.signal}),
  api(`/report-core/evaluations/${ctx.actor.id}?termId=${ctx.termId}`,undefined,undefined,{signal:c.signal}),
  api(`/report-core/story-month?termId=${ctx.termId}&monthKey=${defaultStoryMonth(ctx.term)}`,undefined,undefined,{signal:c.signal}),
 ]).then(([summary,self,story])=>setData({summary,self,story})).catch(e=>{if(e.name!=='AbortError')ctx.error(e);});return()=>c.abort();},[ctx.termId,ctx.refreshKey]);
 const progress=data?getSelfProgress(data.self,ctx.catalog):null;
 const month=defaultStoryMonth(ctx.term),names={READ:'读故事',LISTEN:'听故事',TELL:'讲故事'};
 const storyArticles=data?.story.draftBatch?.articles||data?.story.articles||[];
 return <><section className="student-hero"><div><p className="kicker">成长手账 · {ctx.term?.term_name}</p><h2>嗨，{ctx.actor.real_name||'同学'}，<br/>今天也闪闪发光！</h2><p>一次小小的努力，都值得被认真记下。</p><span className="hero-chip">{data?.story.effectiveBatch?'本月故事已提交，内容已收到':'读、听、讲，一起留下本月故事'}</span></div><CloudMascot/></section>
 <div className="action-pair"><button className="action-tile" aria-label="领取积分卡" onClick={()=>ctx.navigate('cards')}><span className="tile-icon"><UIIcon name="scan"/></span><span><b>领取积分卡</b><small>打开扫码链接，确认就记分</small></span><span className="tile-arrow">↗</span></button><button className="action-tile award" aria-label="上传奖状" onClick={()=>ctx.navigate('awards')}><span className="tile-icon"><UIIcon name="award"/></span><span><b>上传奖状</b><small>选一张清晰的奖状照片</small></span><span className="tile-arrow">↗</span></button></div>
 <div className="student-bottom"><section className="panel"><div className="student-card-title"><h2>我的 {Number(month.slice(5))} 月故事</h2><span className={'badge '+(data?.story.effectiveBatch?'':'orange')}>{data?.story.effectiveBatch?'已提交':'待填写'}</span></div><p>读、听、讲，每类1篇就可以一起提交。</p><div className="story-track">{Object.entries(names).map(([key,label])=><span key={key}><b>{label}</b>{storyArticles.filter(a=>a.category===key&&a.text?.trim()).length} 篇</span>)}</div><div className="student-card-foot"><button className="primary" onClick={()=>ctx.navigate('stories')}>继续写故事</button><small>支持粘贴文字或载入TXT</small></div></section><section className="panel"><div className="student-card-title"><h2>给自己点星星</h2><span className="badge blue">学期自评</span></div><div className="student-card-illustration"><UIIcon name="star"/><p>想一想这个学期，<br/>你又长大了哪些呢？</p></div><div className="student-progress"><span style={{width:progress?.total?`${progress.complete/progress.total*100}%`:'0%'}}/></div><div className="student-card-foot"><button className="text-action" onClick={()=>ctx.navigate('self')}>开始自我评价 →</button><small>{progress?`已完成 ${progress.complete} / ${progress.total} 项`:'正在读取进度…'}</small></div></section></div></>;

}
export function StudentArchive({ctx}) {
 const [group,setGroup]=useState('materials'),[rows,setRows]=useState([]),[offset,setOffset]=useState(null),[busy,setBusy]=useState(false);
 const sequence=useRef(0);
 const load=async(start=0)=>{const request=++sequence.current;setBusy(true);try{const query=new URLSearchParams({termId:ctx.termId,page:'1',offset:String(start),sourceType:group==='stories'?'STORY':group==='self'?'SELF':'CERTIFICATE'});const result=await api('/report-core/sources?'+query);if(request!==sequence.current)return;setRows(old=>start?[...old,...result.rows]:result.rows);setOffset(result.nextOffset);}catch(e){ctx.error(e);}finally{if(request===sequence.current)setBusy(false);}};
 useEffect(()=>{setRows([]);load();return()=>{sequence.current++;};},[group,ctx.termId,ctx.refreshKey]);
 return <><section className="panel"><h2>我的档案</h2><p>这一学期的努力，都慢慢记在这里。</p><div className="archive-actions"><button className="action-tile" onClick={()=>ctx.navigate('self')}><span className="tile-icon"><UIIcon name="star"/></span><span><b>学期自我评价</b><small>给自己的表现点星星，写下成长</small></span><span className="tile-arrow">↗</span></button><button className="action-tile award" onClick={()=>ctx.navigate('report')}><span className="tile-icon"><UIIcon name="report"/></span><span><b>查看期末报告</b><small>学校统一发布后可以阅读、打印</small></span><span className="tile-arrow">↗</span></button></div><div className="self-steps">{[['materials','奖状材料'],['stories','故事历史'],['self','自评记录']].map(([key,label])=><button key={key} className={group===key?'primary':''} onClick={()=>setGroup(key)}>{label}</button>)}</div><p>保留原材料与历史版本，期末报告以学校已发布版本为准。</p></section><SourceList ctx={{...ctx,sources:rows}} types={group==='stories'?['STORY']:group==='self'?['SELF']:['CERTIFICATE']}/>{offset!==null&&<button disabled={busy} onClick={()=>load(offset)}>加载更多档案</button>}</>;
}
