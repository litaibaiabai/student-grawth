import React, { useEffect, useState } from 'react';
import { api } from '../../core/api';
import { UIIcon } from '../../core/illustrations';
import { MetricStrip, BarChart, RingChart } from './StatisticsCharts';
import './adminStatistics.css';

const tabs=[['cards','卡片与奖励','cards'],['self','自我评价','star'],['honors','荣誉上传','award'],['stories','故事参与','book']];
const initialFilters={grade:'',classNo:'',subjectCode:'',keyword:'',state:'ALL',page:1,pageSize:20};
const number=value=>Number(value).toLocaleString('zh-CN');
const rate=(value,total)=>total ? `${(value/total*100).toFixed(1)}%` : '—';
const selfStates={COMPLETE:'已完成',IN_PROGRESS:'进行中',NOT_STARTED:'未开始',NOT_APPLICABLE:'无适用项'};
const date=value=>{const d=new Date(value);return value && !Number.isNaN(+d) ? d.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '未记录'};
const notes={
  cards:'只统计学生成功领取的二维码卡和有效无卡奖励，已撤销记录不计入。学科依原始记录或评价项目归属，日常行为与未归属记录单列。',
  self:'完成指全部适用自评星级项目均已填写；星级占比以已评价项目数为分母，不混入教师评价。无适用项的学生不计入完成率分母。',
  honors:'累计上传包含已撤回申报，各处理状态单独列出。每条荣誉申报计一份，重试不重复计数；荣誉级别仅统计已认定结果。',
  stories:'讲故事按已保存录音及有效提交作品计数，听故事按有效完成记录，写故事按当前有效作品计数。三个方向的参与人数分别去重，不能直接相加。',
};
const subtitles={cards:'学生实际扫码领取的卡片，以及老师无卡奖励的发生情况。',self:'同时查看完成进度与星级分布，及时发现尚未完成的学生。',honors:'了解学生荣誉申报的覆盖情况、上传数量与认定进度。',stories:'讲、听、写分别统计，参与任一方向即可计入参与学生。'};

function Overview({ data }) {
  const {tab,summary:s,scope,charts}=data;
  let items;
  if(tab==='cards') items=[['people','获得奖励的学生',number(s.participants),'人',`覆盖当前学生的 ${rate(s.participants,scope.students)}`],['cards','二维码卡领取',number(s.cardCount),'张','按学生成功领取计数'],['star','无卡奖励',number(s.directCount),'次','已撤销的奖励不计入'],['report','奖励总量',number(s.totalCount),'次','二维码卡 + 有效无卡奖励']];
  if(tab==='self') items=[['check','已完成自评',number(s.completed),'人','所有适用自评项均已填写'],['report','自评完成率',s.completionRate===null?'—':s.completionRate.toFixed(1),s.completionRate===null?'':'%',`在 ${number(s.eligible)} 名有适用项的学生中统计`],['people','尚未完成',number(s.inProgress+s.notStarted),'人',`进行中 ${number(s.inProgress)} 人 · 未开始 ${number(s.notStarted)} 人`],['star','已评价项目',number(s.rated),'项',`无适用项 ${number(s.notApplicable)} 人单列`]];
  if(tab==='honors') items=[['people','上传荣誉的学生',number(s.participants),'人',`占当前学生的 ${rate(s.participants,scope.students)}`],['award','荣誉上传总量',number(s.totalCount),'份','累计上传，包含已撤回申报'],['check','已认定荣誉',number(s.approved),'份','教师已完成认定'],['report','待处理荣誉',number(s.pending),'份',`识别失败另有 ${number(s.failed)} 份`]];
  if(tab==='stories') items=[['people','参与故事的学生',number(s.participants),'人',`三个方向去重后占 ${rate(s.participants,scope.students)}`],['book','讲故事',number(s.tellParticipants),'人',`共提交 ${number(s.tellCount)} 个作品`],['book','听故事',number(s.listenParticipants),'人',`共完成 ${number(s.listenCount)} 篇故事`],['book','写故事',number(s.writeParticipants),'人',`共提交 ${number(s.writeCount)} 篇作品`]];
  return <><MetricStrip items={items.map(([icon,label,value,unit,note])=>({icon,label,value,unit,note}))} />
    <div className="statistics-chart-pair">
      <section className="statistics-panel"><h3>{({cards:'各学科奖励对比',self:'自评完成情况',honors:'已认定荣誉的级别分布',stories:'三个方向的学生参与率'})[tab]}</h3>
        {tab==='cards' && <BarChart rows={charts.subjects} series={[{key:'cardCount',label:'二维码卡',tone:'green'},{key:'directCount',label:'无卡奖励',tone:'gold'}]} />}
        {tab==='self' && <BarChart rows={charts.groups.map(g=>({...g,completedRate:g.eligible?g.completed/g.eligible*100:0,incompleteRate:g.eligible?(g.eligible-g.completed)/g.eligible*100:0}))} series={[{key:'completedRate',label:'已完成',tone:'green'},{key:'incompleteRate',label:'未完成',tone:'gold'}]} maximum={100} unit="%" percent />}
        {tab==='honors' && <BarChart rows={charts.levels} series={[{key:'count',label:'已认定荣誉',tone:'green'}]} unit="份" />}
        {tab==='stories' && <BarChart rows={charts.stories.map(r=>({...r,participation:r.rate || 0}))} series={[{key:'participation',label:'参与学生 / 当前学生',tone:'green'}]} maximum={100} percent unit="%" />}
        <p className="statistics-insight">{({cards:'各学科使用统一刻度，零记录学科也保留展示。',self:'全校按年级对比；选定年级后，按班级对比完成率。',honors:`仅统计已认定的 ${number(s.approved || 0)} 份荣誉；缺失级别单列。`,stories:'同一学生可参与多个方向，各方向参与人数不能直接相加。'})[tab]}</p>
      </section>
      <section className="statistics-panel"><h3>{({cards:'奖励方式构成',self:'自评星级分布',honors:'荣誉处理状态',stories:'参与量一览'})[tab]}</h3>
        {tab==='cards' && <RingChart segments={[{label:'二维码卡',value:s.cardCount,tone:'green'},{label:'无卡奖励',value:s.directCount,tone:'gold'}]} centerValue={number(s.totalCount)} centerLabel="奖励总量 / 次" unit="次" />}
        {tab==='self' && <RingChart segments={[{label:'三颗星',value:s.stars[3],tone:'green'},{label:'两颗星',value:s.stars[2],tone:'sage'},{label:'一颗星',value:s.stars[1],tone:'gold'}]} centerValue={number(s.rated)} centerLabel="已评价项目 / 项" />}
        {tab==='honors' && <RingChart segments={[{label:'已认定',value:s.approved,tone:'green'},{label:'待处理',value:s.pending,tone:'gold'},{label:'不予认定',value:s.rejected,tone:'sage'},{label:'已撤回',value:s.revoked,tone:'gray'},{label:'识别失败',value:s.failed,tone:'blue'}]} centerValue={number(s.totalCount)} centerLabel="累计上传 / 份" unit="份" />}
        {tab==='stories' && <div className="statistics-story-totals">{charts.stories.map((r,i)=><div key={r.type}><span>{r.label}</span><strong>{number(r.count)}</strong><p>{['个录音 / 提交作品','篇故事完成','篇文字作品'][i]}</p><small>参与者人均 {r.participants?(r.count/r.participants).toFixed(1):'—'} {i===0?'个':'篇'}</small></div>)}</div>}
        <p className="statistics-insight">{tab==='self'?'一名学生可评价多个项目，星级占比按项目计算。':`当前范围内 ${number(scope.students-(s.participants || 0))} 人${({cards:'暂无奖励记录。',honors:'暂无荣誉上传。',stories:'尚未参与故事活动。'})[tab]}`}</p>
      </section>
    </div></>;
}

function RewardDetails({ studentId,termId,subjectCode,onError }) {
  const [page,setPage]=useState(1),[retry,setRetry]=useState(0),[load,setLoad]=useState(null);
  const query=new URLSearchParams({termId,page:String(page),pageSize:'10',...(subjectCode?{subjectCode}:{})});
  const url=`/admin/report-core/statistics/rewards/${studentId}?${query}`,key=`${url}:${retry}`;
  useEffect(()=>{
    const c=new AbortController();
    api(url,undefined,undefined,{signal:c.signal}).then(value=>{if(!c.signal.aborted)setLoad({key,value})}).catch(error=>{if(!c.signal.aborted){setLoad({key,error:error.message});if(error.status===401)onError(error)}});
    return ()=>c.abort();
  },[url,key,onError]);
  const data=load?.key===key?load.value:null,error=load?.key===key?load.error:null;
  return <div className="statistics-reward-details" aria-busy={!data&&!error}>
    <h4>奖励记录 <small>仅展示当前学科范围内的有效奖励</small></h4>
    {error ? <div role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>重试记录</button></div> : !data ? <p role="status">正在读取奖励记录…</p> : <>
      {data.rows.length ? <ul>{data.rows.map(r=><li key={r.id}><time>{date(r.occurredAt)}</time><b>{r.subjectName}</b><span>{r.kind==='CARD'?'二维码卡 +1':'无卡奖励 +1'}</span><span>{r.label}</span><small>{r.teacherName}</small></li>)}</ul> : <p>当前范围暂无有效奖励记录。</p>}
      <div className="statistics-detail-pages"><span>共 {number(data.pagination.total)} 条</span><button disabled={data.pagination.page<=1} onClick={()=>setPage(data.pagination.page-1)}>上一批记录</button><button disabled={data.pagination.page>=data.pagination.pages} onClick={()=>setPage(data.pagination.page+1)}>下一批记录</button></div>
    </>}
  </div>;
}

function StudentRows({ data,expanded,setExpanded,termId,subjectCode,onError }) {
  const {tab,rows}=data;
  const headers={cards:['二维码卡 / 张','无卡奖励 / 次','合计 / 次','奖励记录'],self:['自评进度','星级分布 / 已评价项目','完成状态'],honors:['上传 / 份','已认定','待处理','不予认定','已撤回','识别失败'],stories:['讲故事 / 个','听故事 / 篇','写故事 / 篇','参与方向']};
  return <div className="statistics-table-scroll"><table><caption className="statistics-sr-only">{tabs.find(t=>t[0]===tab)[1]}学生明细</caption><thead><tr>{['学生','班级',...headers[tab]].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>
    {rows.map(row=><React.Fragment key={row.studentId}><tr data-statistics-student={row.studentId}><th scope="row"><b>{row.studentName}</b><small>学号 / 账号 {row.studentNumber}</small></th><td>{row.grade} 年级 {row.classNo} 班</td>
      {tab==='cards' && <><td className="statistics-number">{number(row.cardCount)}</td><td className="statistics-number">{number(row.directCount)}</td><td className="statistics-number">{number(row.totalCount)}</td><td><button className="statistics-record-button" aria-expanded={expanded===row.studentId} aria-controls={`statistics-rewards-${row.studentId}`} onClick={()=>setExpanded(expanded===row.studentId?null:row.studentId)}>{expanded===row.studentId?'收起记录':'查看记录'}<span aria-hidden="true">{expanded===row.studentId?'↑':'↗'}</span></button></td></>}
      {tab==='self' && <><td><span className="statistics-number">{row.rated} / {row.total}</span><small>适用自评项目</small></td><td>{row.rated ? <><div className="statistics-star-meter">{[3,2,1].map(star=><i className={`star-${star}`} key={star} style={{width:`${row.stars[star]/row.rated*100}%`}} />)}</div><div className="statistics-star-labels">{[3,2,1].map(star=><span key={star}>{['','一星','二星','三星'][star]} <b>{rate(row.stars[star],row.rated)}</b></span>)}</div></> : <span className="statistics-unrated">暂无星级评价</span>}</td><td><span className={`statistics-status ${row.state.toLowerCase()}`}>{selfStates[row.state]}</span></td></>}
      {tab==='honors' && ['totalCount','approved','pending','rejected','revoked','failed'].map(key=><td className="statistics-number" key={key}>{number(row[key])}</td>)}
      {tab==='stories' && <>{['tellCount','listenCount','writeCount'].map(key=><td className="statistics-number" key={key}>{number(row[key])}</td>)}<td><span className={`statistics-status ${row.totalCount?'':'not_started'}`}>{row.totalCount?['tellCount','listenCount','writeCount'].filter(k=>row[k]).map(k=>({tellCount:'讲',listenCount:'听',writeCount:'写'})[k]).join(' · '):'未参与'}</span></td></>}
    </tr>{tab==='cards' && expanded===row.studentId && <tr><td className="statistics-expanded-cell" colSpan={6} id={`statistics-rewards-${row.studentId}`}><RewardDetails key={`${row.studentId}:${subjectCode}`} studentId={row.studentId} termId={termId} subjectCode={subjectCode} onError={onError} /></td></tr>}</React.Fragment>)}
  </tbody></table></div>;
}

export default function AdminStatistics({ ctx }) {
  const {termId,refreshKey,error:onError}=ctx;
  const [tab,setTab]=useState('cards'),[filters,setFilters]=useState(initialFilters),[retry,setRetry]=useState(0),[load,setLoad]=useState(null),[options,setOptions]=useState({grades:[],classes:[],subjects:[]}),[expanded,setExpanded]=useState(null);
  const query=new URLSearchParams({termId,tab});
  for(const [key,value] of Object.entries(filters)) if(value!=='' && value!=='ALL') query.set(key,String(value));
  const url=`/admin/report-core/statistics?${query}`,requestKey=`${url}:${refreshKey}:${retry}`;
  useEffect(()=>{
    const c=new AbortController();
    api(url,undefined,undefined,{signal:c.signal}).then(value=>{if(!c.signal.aborted){setLoad({key:requestKey,value});setOptions(value.filters)}}).catch(error=>{if(!c.signal.aborted){setLoad({key:requestKey,error:error.message});if(error.status===401)onError(error)}});
    return ()=>c.abort();
  },[url,requestKey,onError]);
  const data=load?.key===requestKey?load.value:null,error=load?.key===requestKey?load.error:null,pending=!data&&!error;
  const update=patch=>{setFilters(old=>({...old,...patch,page:1}));setExpanded(null)};
  const changeTab=key=>{setTab(key);setFilters(old=>({...initialFilters,grade:old.grade,classNo:old.classNo,pageSize:old.pageSize}));setExpanded(null)};
  const keyboard=(event,index)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4;changeTab(tabs[next][0]);event.currentTarget.parentElement.querySelectorAll('[role=tab]')[next].focus()};
  const stateOptions=tab==='self'?[['COMPLETE','已完成'],['IN_PROGRESS','进行中'],['NOT_STARTED','未开始'],['NOT_APPLICABLE','无适用项']]:tab==='honors'?[['UPLOADED','已上传'],['NONE','未上传']]:tab==='stories'?[['PARTICIPATED','已参与'],['NONE','未参与']]:[['REWARDED','有奖励记录'],['NONE','无奖励记录']];
  return <section className="admin-statistics" aria-label="学生数据统计">
    <p className="statistics-intro">从每一次参与，看见学生的成长。</p>
    <div className="statistics-scope"><div><label>年级<select aria-label="统计年级" value={filters.grade} onChange={e=>update({grade:e.target.value,classNo:''})}><option value="">全部年级</option>{options.grades.map(g=><option key={g} value={g}>{g} 年级</option>)}</select></label><label>班级<select aria-label="统计班级" value={filters.classNo} disabled={!filters.grade} onChange={e=>update({classNo:e.target.value})}><option value="">{filters.grade?'全部班级':'先选择年级'}</option>{options.classes.map(c=><option key={c} value={c}>{c} 班</option>)}</select></label></div><small>{data ? `${filters.grade?`${filters.grade} 年级`:'全校'}${filters.classNo?` ${filters.classNo} 班`:''} · ${number(data.scope.students)} 名学生 · ${number(data.scope.classes)} 个班级` : '统计范围由上方学期、年级与班级共同确定'}</small></div>
    <div className="statistics-tabs" role="tablist" aria-label="统计内容">{tabs.map(([key,label,icon],index)=><button key={key} id={`statistics-tab-${key}`} type="button" role="tab" aria-selected={tab===key} aria-controls="statistics-content" tabIndex={tab===key?0:-1} onClick={()=>changeTab(key)} onKeyDown={e=>keyboard(e,index)}><UIIcon name={icon}/>{label}<small>0{index+1}</small></button>)}</div>
    <div id="statistics-content" role="tabpanel" aria-labelledby={`statistics-tab-${tab}`} aria-busy={pending}>
      <div className="statistics-section-heading"><div><h2>{tabs.find(t=>t[0]===tab)[1]}</h2><p>{subtitles[tab]}</p></div>{tab==='cards'?<label className="statistics-subject">学科<select aria-label="统计学科" value={filters.subjectCode} onChange={e=>update({subjectCode:e.target.value})}><option value="">全部学科</option>{options.subjects.map(s=><option key={s.subjectCode} value={s.subjectCode}>{s.label}</option>)}</select></label>:<small>本学期累计</small>}</div>
      {error ? <div className="statistics-error" role="alert"><strong>统计暂时无法读取</strong><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>重新加载统计</button></div> : data ? <Overview data={data}/> : <div className="statistics-loading" role="status"><div className="statistics-loading-line"/><p>正在读取当前范围的统计数据…</p></div>}
      <section className="statistics-panel statistics-student-panel"><div className="statistics-table-heading"><div><h3>学生明细</h3><p>搜索和状态筛选仅影响下方名单，概览与图表保持当前范围。</p></div><div className="statistics-table-filters"><label><span className="statistics-sr-only">搜索学生姓名或学号</span><input aria-label="搜索学生姓名或学号" type="search" maxLength={80} placeholder="搜索姓名 / 学号" value={filters.keyword} onChange={e=>update({keyword:e.target.value})}/></label><label><span className="statistics-sr-only">学生明细状态</span><select aria-label="学生明细状态" value={filters.state} onChange={e=>update({state:e.target.value})}><option value="ALL">全部状态</option>{stateOptions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div></div>
        {pending ? <p className="statistics-table-empty" role="status">正在读取学生明细…</p> : error ? <p className="statistics-table-empty">统计读取成功后显示学生明细。</p> : data?.rows.length ? <StudentRows data={data} termId={termId} subjectCode={filters.subjectCode} expanded={expanded} setExpanded={setExpanded} onError={onError}/> : <div className="statistics-table-empty"><strong>{data?.scope.students?'没有符合条件的学生':'当前范围暂无在籍学生'}</strong><p>{data?.scope.students?'可以调整姓名或状态筛选。':'请选择其他年级、班级或学期。'}</p></div>}
        <div className="statistics-table-footer"><span>{data?`共 ${number(data.pagination.total)} 名学生`:'正在核对人数'}{data && (filters.keyword || filters.state!=='ALL') ? ' · 已筛选名单' : ''}</span><div><label>每页<select aria-label="统计每页人数" value={filters.pageSize} onChange={e=>update({pageSize:Number(e.target.value)})}><option value={20}>20 人</option><option value={50}>50 人</option></select></label><button disabled={!data || data.pagination.page<=1} onClick={()=>{setFilters(old=>({...old,page:data.pagination.page-1}));setExpanded(null)}}>上一页</button><span>{data?`${data.pagination.page} / ${data.pagination.pages}`:'—'}</span><button disabled={!data || data.pagination.page>=data.pagination.pages} onClick={()=>{setFilters(old=>({...old,page:data.pagination.page+1}));setExpanded(null)}}>下一页</button></div></div>
      </section>
      <p className="statistics-note"><b>统计口径</b><span>{notes[tab]}</span></p>{data && <p className="statistics-asof">数据读取于 {date(data.asOf)} · 百分比四舍五入可能存在尾差</p>}
    </div>
  </section>;
}
