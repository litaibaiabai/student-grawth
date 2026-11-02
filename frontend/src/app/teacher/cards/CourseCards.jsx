import React, { useEffect, useRef, useState } from 'react';
import { api, download } from '../../core/api';
import { UIIcon } from '../../core/illustrations';
import {courseCardsQuery,canPrintSemesterCards,scopedCoursePreview} from './semesterCardsModel.js';
import { printCourseCards } from './courseCardPrint';
import './courseCards.css';

const statuses = { available:'待领取', used:'已领取', expired:'已过期', future:'未生效', voided:'已作废' };
const courseLabel = c => `${c.grade}年级${c.classNo}班`;

export default function CourseCards({ ctx }) {
  const { termId, error:onError } = ctx;
  const [data, setData] = useState(null), [courseKey, setCourseKey] = useState('');
  const [loading, setLoading] = useState(true), [failure, setFailure] = useState('');
  const [refresh, setRefresh] = useState(0), [page, setPage] = useState(1);
  const [status, setStatus] = useState('all'), [query, setQuery] = useState('');
  const [preview, setPreview] = useState(null), [previewLoading, setPreviewLoading] = useState(false);
  const [action, setAction] = useState('');
  const [classFilter,setClassFilter]=useState(''),[subjectFilter,setSubjectFilter]=useState('');
  const actionController=useRef(null),popupRef=useRef(null);
  const identity=`${ctx.actor.id}:${termId}`;
  const currentData=data?.identity===identity?data:null;
  const titleRef = useRef(null);
  const course = currentData?.courses.find(c => c.key === courseKey);

  useEffect(() => {
    const c=new AbortController();actionController.current=c;setCourseKey('');setData(null);setPreview(null);setAction('');setClassFilter('');setSubjectFilter('');
    return()=>{c.abort();if(popupRef.current&&!popupRef.current.closed)popupRef.current.close();};
  }, [termId,identity]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailure('');
    const options = { signal:controller.signal };
    (async () => {
      const result=await api('/report-core/course-cards?'+courseCardsQuery({termId}),undefined,undefined,options);
      if(!controller.signal.aborted)setData({...result,identity});
    })().catch(e => {
      if (e.name !== 'AbortError') { setFailure(e.message); if (e.status===401) onError(e); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [termId, identity, refresh, ctx.refreshKey, onError]);
  const scope = course ? courseCardsQuery({termId,grade:course.grade,classNo:course.classNo,subjectCode:course.subjectCode}) : '';
  const shownPreview=scopedCoursePreview(preview,scope);
  useEffect(() => {
    setPreview(null);
    if (!scope) return;
    const controller = new AbortController();
    setPreviewLoading(true); setFailure('');
    api(`/report-core/course-cards/preview?${scope}&page=${page}&status=${status}&q=${encodeURIComponent(query)}`, undefined, undefined, { signal:controller.signal })
      .then(result => { if (!controller.signal.aborted) setPreview({...result,scope}); })
      .catch(e => { if (e.name!=='AbortError') { setFailure(e.message); if(e.status===401) onError(e); } })
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => controller.abort();
  }, [scope, page, status, query, refresh, ctx.refreshKey, onError]);
  const openCourse = c => {
    setCourseKey(c.key); setPage(1); setStatus('all'); setQuery(''); setFailure('');
    requestAnimationFrame(() => titleRef.current?.focus());
  };
  const run=async(kind,fn)=>{const c=actionController.current;if(!c||c.signal.aborted)return;setAction(kind);setFailure('');try{await fn(c.signal);}catch(e){if(!c.signal.aborted&&e.name!=='AbortError'){setFailure(e.message);if(e.status===401)onError(e);}}finally{if(!c.signal.aborted)setAction('');}};
  const print = () => {
    const popup = window.open('', '_blank');
    if (!popup) { setFailure('打印窗口未能打开，请允许此网站弹出窗口后重试。'); return; }
    popupRef.current=popup;popup.opener = null;
    popup.document.title = '正在准备积分卡…';
    popup.document.body.textContent = '正在准备打印卡片…';
    run('print', async signal => {
      try { await printCourseCards(popup, await api(`/report-core/course-cards/print?${scope}`,undefined,undefined,{signal})); }
      catch(e) { if (!popup.closed) popup.close(); throw e; }
    });
  };
  const courses = currentData?.courses || [];
  const visibleCourses=courses.filter(c=>(!classFilter||`${c.grade}:${c.classNo}`===classFilter)&&(!subjectFilter||c.subjectCode===subjectFilter));
  const total = courses.reduce((n,c) => n+c.total,0), remaining = courses.reduce((n,c) => n+c.available,0);
  return (
    <div className="course-cards-page" aria-busy={loading}>
      {failure && <div className="feedback error" role="alert">{failure}<button onClick={() => setRefresh(n=>n+1)} disabled={loading}>重新读取</button></div>}
      {loading ? <section className="panel course-loading" role="status"><UIIcon name="cards" /><h2>正在准备课程积分卡</h2><p>正在读取管理员已初始化的学期卡片…</p></section> : !currentData ? null : course ? (
        <>
          <button className="course-back" aria-label="返回我的课程" onClick={() => { setCourseKey(''); setFailure(''); }} disabled={!!action}>← 返回我的课程</button>
          <section className="course-detail-head" data-subject={course.subjectCode}>
            <div className="course-subject-icon"><UIIcon name="book" /></div>
            <div className="course-detail-name"><span className="course-eyebrow">{courseLabel(course)} · {ctx.term?.term_name}</span><h2 tabIndex={-1} ref={titleRef}>{course.subjectName}<span>积分卡</span></h2><p>共 {course.total} 张 · 待领取 {course.available} 张 · 已领取 {course.used} 张</p></div>
            <div className="course-export-actions">
              <button disabled={!!action || !canPrintSemesterCards({initializationStatus:currentData.initializationStatus,available:course.available})} onClick={() => run('download', signal => download(`/report-core/course-cards/pdf?${scope}`, `${courseLabel(course)}-${course.subjectName}-${ctx.term?.term_name}积分卡.pdf`,{signal}))}><UIIcon name="upload" />{action==='download' ? '正在下载…' : '下载 PDF'}</button>
              <button className="primary" disabled={!!action || !canPrintSemesterCards({initializationStatus:currentData.initializationStatus,available:course.available})} onClick={print}><UIIcon name="report" />{action==='print' ? '准备打印…' : '打印积分卡'}</button>
            </div>
          </section>
          <section className="course-preview-panel">
            <div className="course-preview-toolbar">
              <div><h3>二维码预览 <span>{shownPreview?.total ?? '—'} 张</span></h3></div>
              <div className="course-preview-filters">
                <label><span className="sr-only">卡片状态</span><select aria-label="卡片状态" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">全部卡片</option><option value="available">待领取</option><option value="used">已领取</option><option value="expired">已过期</option><option value="future">未生效</option><option value="voided">已作废</option></select></label>
                <label><span className="sr-only">搜索卡号</span><input aria-label="搜索卡号" placeholder="搜索卡号或序号" maxLength={64} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} /></label>
              </div>
            </div>
            {previewLoading ? <div className="course-loading" role="status">正在加载二维码…</div> : shownPreview?.rows.length ? (
              <div className="course-qr-grid">
                {shownPreview.rows.map(row => <article className="course-qr-card" key={row.id} data-qr-card={row.id}>
                  <div className="course-qr-top"><span>NO. {String(row.serial).padStart(3,'0')}</span><span className={`course-status ${row.status}`}>{statuses[row.status]}</span></div>
                  {row.qrDataUrl ? <img src={row.qrDataUrl} alt={`卡号 ${row.id} 的领取二维码`} width="240" height="240" /> : <div className="course-qr-unavailable"><UIIcon name={row.status==='used'?'check':'cards'} /><span>{statuses[row.status]}</span></div>}
                  <strong>{course.subjectName}积分卡 <span>＋1 分</span></strong>
                  <small>{courseLabel(course)} · 卡号 {row.id}</small>
                </article>)}
              </div>
            ) : <div className="course-empty"><UIIcon name="scan" /><h3>{course.total ? '没有符合条件的卡片' : '本学期此课程没有生成卡片'}</h3><p>{'可以调整筛选条件；学科额度为0时不会生成卡片。'}</p></div>}
            {shownPreview && shownPreview.total>0 && <nav className="course-pagination" aria-label="二维码分页"><span>共 {shownPreview.total} 张，每页 {shownPreview.pageSize} 张</span><div><button aria-label="上一页" disabled={previewLoading || shownPreview.page<=1} onClick={()=>setPage(shownPreview.page-1)}>←</button><span>第 {shownPreview.page} / {shownPreview.pages} 页</span><button aria-label="下一页" disabled={previewLoading || shownPreview.page>=shownPreview.pages} onClick={()=>setPage(shownPreview.page+1)}>→</button></div></nav>}
          </section>
        </>
      ) : (
        <>
          <div className="course-overview"><span><b>{courses.length}</b> 门任教课程</span><i/><span><b>{total}</b> 张学期卡片</span><i/><span><b>{remaining}</b> 张待领取</span></div>
          <div className="course-list-heading"><h3>任教课程 <span>{courses.length}</span></h3><span>每班独立额度 · 全学期一次生成</span></div>
          {currentData.initializationStatus==='DRAFT'?<section className="panel course-empty"><UIIcon name="cards"/><h3>等待管理员初始化本学期卡片</h3><p>初始化完成后，本人课程的学期卡片会显示在这里。</p></section>:<><div className="course-filterbar"><label>班级<select aria-label="任教班级筛选" value={classFilter} onChange={e=>setClassFilter(e.target.value)}><option value="">全部任教班级</option>{[...new Map(courses.map(c=>[`${c.grade}:${c.classNo}`,c])).values()].map(c=><option key={`${c.grade}:${c.classNo}`} value={`${c.grade}:${c.classNo}`}>{courseLabel(c)}</option>)}</select></label><label>学科<select aria-label="任教学科筛选" value={subjectFilter} onChange={e=>setSubjectFilter(e.target.value)}><option value="">全部任教学科</option>{[...new Map(courses.map(c=>[c.subjectCode,c.subjectName]))].map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label></div>{visibleCourses.length ? <div className="course-gallery">{visibleCourses.map(c => <button className="course-collection" key={c.key} data-course-key={c.key} data-subject={c.subjectCode} aria-label={`预览${courseLabel(c)}${c.subjectName}积分卡`} onClick={()=>openCourse(c)}>
            <span className="course-collection-top"><span className="course-class-label">{courseLabel(c)}</span><UIIcon name="scan" /></span>
            <span className="course-compact-title"><strong>{c.subjectName}</strong><span><b>{c.total}</b> 张</span></span>
            <span className="course-collection-progress"><span style={{width:`${c.total ? c.used/c.total*100 : 0}%`}} /></span>
            <span className="course-compact-meta">{c.quotaId ? <><span>待领取 <b>{c.available}</b></span><span>已领取 <b>{c.used}</b></span></> : <span>{'本学期未生成卡片'}</span>}<span className="course-compact-arrow" aria-hidden="true">↗</span></span>
          </button>)}</div> : <section className="panel course-empty"><UIIcon name="book" /><h3>还没有任教课程</h3><p>导入的任教关系或当前筛选范围内没有课程。</p></section>}</>}
          <div className="course-footer-note"><UIIcon name="cards" /><p>管理员按班级和学科，一次性生成全学期卡片。<br/><span>重复预览、下载或打印均使用同一批二维码。</span></p></div>
        </>
      )}
    </div>
  );
}
