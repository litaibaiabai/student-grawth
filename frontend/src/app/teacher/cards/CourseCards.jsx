import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, download } from '../../core/api';
import { UIIcon } from '../../core/illustrations';
import { defaultStoryMonth } from '../../../util/storyMonths';
import { printCourseCards } from './courseCardPrint';
import './courseCards.css';

const statuses = { available:'待领取', used:'已领取', expired:'已过期', future:'未生效', voided:'已作废' };
const courseLabel = c => `${c.grade}年级${c.classNo}班`;
const prettyMonth = m => `${m.slice(0,4)} 年 ${Number(m.slice(5))} 月`;

export default function CourseCards({ ctx }) {
  const { termId, error:onError } = ctx;
  const [month, setMonth] = useState(() => defaultStoryMonth(ctx.term));
  const [data, setData] = useState(null), [courseKey, setCourseKey] = useState('');
  const [loading, setLoading] = useState(true), [failure, setFailure] = useState('');
  const [refresh, setRefresh] = useState(0), [page, setPage] = useState(1);
  const [status, setStatus] = useState('all'), [query, setQuery] = useState('');
  const [preview, setPreview] = useState(null), [previewLoading, setPreviewLoading] = useState(false);
  const [action, setAction] = useState('');
  const [headerSlot, setHeaderSlot] = useState(null);
  const titleRef = useRef(null);
  const course = data?.courses.find(c => c.key === courseKey);

  useLayoutEffect(() => {
    setHeaderSlot(document.getElementById('course-card-month-filter'));
  }, []);

  useEffect(() => {
    setMonth(defaultStoryMonth(ctx.term)); setCourseKey(''); setData(null);
  }, [termId, ctx.term]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailure('');
    const options = { signal:controller.signal };
    (async () => {
      let result = await api(`/report-core/course-cards?termId=${termId}&monthKey=${month}`, undefined, undefined, options);
      if (result.canSync && month === result.currentMonth) {
        await api('/report-core/course-cards/sync', { termId }, undefined, options);
        result = await api(`/report-core/course-cards?termId=${termId}&monthKey=${month}`, undefined, undefined, options);
      }
      if (!controller.signal.aborted) setData(result);
    })().catch(e => {
      if (e.name !== 'AbortError') { setFailure(e.message); if (e.status===401) onError(e); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [termId, month, refresh, ctx.refreshKey, onError]);
  const scope = course ? new URLSearchParams({ termId, monthKey:month, grade:course.grade, classNo:course.classNo, subjectCode:course.subjectCode }).toString() : '';
  useEffect(() => {
    setPreview(null);
    if (!scope) return;
    const controller = new AbortController();
    setPreviewLoading(true); setFailure('');
    api(`/report-core/course-cards/preview?${scope}&page=${page}&status=${status}&q=${encodeURIComponent(query)}`, undefined, undefined, { signal:controller.signal })
      .then(result => { if (!controller.signal.aborted) setPreview(result); })
      .catch(e => { if (e.name!=='AbortError') { setFailure(e.message); if(e.status===401) onError(e); } })
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => controller.abort();
  }, [scope, page, status, query, refresh, ctx.refreshKey, onError]);
  const openCourse = c => {
    setCourseKey(c.key); setPage(1); setStatus('all'); setQuery(''); setFailure('');
    requestAnimationFrame(() => titleRef.current?.focus());
  };
  const run = async (kind, fn) => {
    setAction(kind); setFailure('');
    try { await fn(); } catch(e) { setFailure(e.message); if(e.status===401) onError(e); }
    finally { setAction(''); }
  };
  const print = () => {
    const popup = window.open('', '_blank');
    if (!popup) { setFailure('打印窗口未能打开，请允许此网站弹出窗口后重试。'); return; }
    popup.opener = null;
    popup.document.title = '正在准备积分卡…';
    popup.document.body.textContent = '正在准备打印卡片…';
    run('print', async () => {
      try { await printCourseCards(popup, await api(`/report-core/course-cards/print?${scope}`)); }
      catch(e) { if (!popup.closed) popup.close(); throw e; }
    });
  };
  const courses = data?.courses || [];
  const total = courses.reduce((n,c) => n+c.total,0), remaining = courses.reduce((n,c) => n+c.available,0);
  const monthFilter = (
    <label className="course-month"><UIIcon name="calendar" /><span className="sr-only">打印月份</span>
      <select aria-label="打印月份" value={month} disabled={loading || !!action} onChange={e => { setMonth(e.target.value); setCourseKey(''); setData(null); }}>
        {(data?.months || [month]).map(m => <option key={m} value={m}>{prettyMonth(m)}</option>)}
      </select>
    </label>
  );
  return (
    <div className="course-cards-page" aria-busy={loading}>
      {headerSlot ? createPortal(monthFilter, headerSlot) : <div className="course-page-top">{monthFilter}</div>}
      {failure && <div className="feedback error" role="alert">{failure}<button onClick={() => setRefresh(n=>n+1)} disabled={loading}>重新读取</button></div>}
      {loading ? <section className="panel course-loading" role="status"><UIIcon name="cards" /><h2>正在准备课程积分卡</h2><p>系统会自动备齐本月的课程卡片，请稍候…</p></section> : !data ? null : course ? (
        <>
          <button className="course-back" aria-label="返回我的课程" onClick={() => { setCourseKey(''); setFailure(''); }} disabled={!!action}>← 返回我的课程</button>
          <section className="course-detail-head" data-subject={course.subjectCode}>
            <div className="course-subject-icon"><UIIcon name="book" /></div>
            <div className="course-detail-name"><span className="course-eyebrow">{courseLabel(course)} · {prettyMonth(month)}</span><h2 tabIndex={-1} ref={titleRef}>{course.subjectName}<span>积分卡</span></h2><p>共 {course.total} 张 · 待领取 {course.available} 张 · 已领取 {course.used} 张</p></div>
            <div className="course-export-actions">
              <button disabled={!!action || !course.available} onClick={() => run('download', () => download(`/report-core/course-cards/pdf?${scope}`, `${courseLabel(course)}-${course.subjectName}-${month}积分卡.pdf`))}><UIIcon name="upload" />{action==='download' ? '正在下载…' : '下载 PDF'}</button>
              <button className="primary" disabled={!!action || !course.available} onClick={print}><UIIcon name="report" />{action==='print' ? '准备打印…' : '打印积分卡'}</button>
            </div>
          </section>
          <section className="course-preview-panel">
            <div className="course-preview-toolbar">
              <div><h3>二维码预览 <span>{preview?.total ?? '—'} 张</span></h3></div>
              <div className="course-preview-filters">
                <label><span className="sr-only">卡片状态</span><select aria-label="卡片状态" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">全部卡片</option><option value="available">待领取</option><option value="used">已领取</option><option value="expired">已过期</option><option value="future">未生效</option><option value="voided">已作废</option></select></label>
                <label><span className="sr-only">搜索卡号</span><input aria-label="搜索卡号" placeholder="搜索卡号或序号" maxLength={64} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} /></label>
              </div>
            </div>
            {previewLoading ? <div className="course-loading" role="status">正在加载二维码…</div> : preview?.rows.length ? (
              <div className="course-qr-grid">
                {preview.rows.map(row => <article className="course-qr-card" key={row.id} data-qr-card={row.id}>
                  <div className="course-qr-top"><span>NO. {String(row.serial).padStart(3,'0')}</span><span className={`course-status ${row.status}`}>{statuses[row.status]}</span></div>
                  {row.qrDataUrl ? <img src={row.qrDataUrl} alt={`卡号 ${row.id} 的领取二维码`} width="240" height="240" /> : <div className="course-qr-unavailable"><UIIcon name={row.status==='used'?'check':'cards'} /><span>{statuses[row.status]}</span></div>}
                  <strong>{course.subjectName}积分卡 <span>＋1 分</span></strong>
                  <small>{courseLabel(course)} · 卡号 {row.id}</small>
                </article>)}
              </div>
            ) : <div className="course-empty"><UIIcon name="scan" /><h3>{course.total ? '没有符合条件的卡片' : '这个月还没有生成卡片'}</h3><p>{course.configuredTotal===null ? '请联系管理员配置本学科每班月额度。' : course.configuredTotal===0 ? '管理员已暂停本学科的新卡生成。' : '可以调整筛选条件，或查看当前月份的课程卡片。'}</p></div>}
            {preview && preview.total>0 && <nav className="course-pagination" aria-label="二维码分页"><span>共 {preview.total} 张，每页 {preview.pageSize} 张</span><div><button aria-label="上一页" disabled={previewLoading || preview.page<=1} onClick={()=>setPage(preview.page-1)}>←</button><span>第 {preview.page} / {preview.pages} 页</span><button aria-label="下一页" disabled={previewLoading || preview.page>=preview.pages} onClick={()=>setPage(preview.page+1)}>→</button></div></nav>}
          </section>
        </>
      ) : (
        <>
          <div className="course-overview"><span><b>{courses.length}</b> 门任教课程</span><i/><span><b>{total}</b> 张本月卡片</span><i/><span><b>{remaining}</b> 张待领取</span></div>
          <div className="course-list-heading"><h3>任教课程 <span>{courses.length}</span></h3><span>每个班级独立发卡 · 每月自动备齐</span></div>
          {courses.length ? <div className="course-gallery">{courses.map(c => <button className="course-collection" key={c.key} data-course-key={c.key} data-subject={c.subjectCode} aria-label={`预览${courseLabel(c)}${c.subjectName}积分卡`} onClick={()=>openCourse(c)}>
            <span className="course-collection-top"><span className="course-class-label">{courseLabel(c)}</span><UIIcon name="scan" /></span>
            <span className="course-compact-title"><strong>{c.subjectName}</strong><span><b>{c.total}</b> 张</span></span>
            <span className="course-collection-progress"><span style={{width:`${c.total ? c.used/c.total*100 : 0}%`}} /></span>
            <span className="course-compact-meta">{c.quotaId ? <><span>待领取 <b>{c.available}</b></span><span>已领取 <b>{c.used}</b></span></> : <span>{c.configuredTotal===null ? '等待管理员配置' : c.configuredTotal===0 ? '已暂停生成' : '本月暂无批次'}</span>}<span className="course-compact-arrow" aria-hidden="true">↗</span></span>
          </button>)}</div> : <section className="panel course-empty"><UIIcon name="book" /><h3>还没有任教课程</h3><p>管理员添加本学期的任教班级和学科后，课程积分卡会显示在这里。</p></section>}
          <div className="course-footer-note"><UIIcon name="cards" /><p>系统按管理员设置的每班月额度自动生成，无需手动分配。<br/><span>重复预览、下载或打印均使用同一批二维码。</span></p></div>
        </>
      )}
    </div>
  );
}
