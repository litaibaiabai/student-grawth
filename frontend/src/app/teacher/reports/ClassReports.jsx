import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../core/api';
import { parseCoreLocation, formatCoreLocation } from '../../core/navigation';
import TermReport from '../../../component/TermReport';
import { ratingDistribution } from './reportSummary';
import './classReports.css';

function RatingDistribution({ counts, type, missing = 0 }) {
  const stars = type === 'stars';
  const { total, items } = ratingDistribution(counts, stars ? [3, 2, 1] : ['A', 'B', 'C', 'D']);
  const label = key => stars ? `${key}星` : key;
  return (
    <div className={`report-distribution report-distribution-${type}`}>
      <div className="report-distribution-bar" role="img" aria-label={total
        ? items.map(item => `${label(item.key)} ${item.percent}%`).join('，')
        : stars ? '暂无星级评价' : '暂无等级评价'}>
        {items.filter(item => item.count > 0).map(item => <span key={item.key} className={`report-tone-${stars ? 'star-' : ''}${item.key}`} style={{ flexGrow: item.count }} />)}
      </div>
      {total ? <div className="report-distribution-labels">
        {items.map(item => <span key={item.key} title={`${label(item.key)} ${item.count} 项 / 已评价 ${total} 项`}>
          <i className={`report-tone-${stars ? 'star-' : ''}${item.key}`} aria-hidden="true" />
          {label(item.key)} <b>{item.percent}%</b>
        </span>)}
      </div> : <span className="report-unrated">{stars ? '暂无星级评价' : '暂无等级评价'}</span>}
      {missing > 0 && <small className="report-distribution-missing">另有 {missing} 项未评价</small>}
    </div>
  );
}

const sectionNames = {
  conduct: '德美',
  wisdom: '智美',
  health: '健美',
  art: '艺美',
  labor: '劳美',
  story: '故事美',
};

export default function ClassReports({
  ctx,
  route: controlledRoute,
  onNavigate,
}) {
  const {
    termId,
    refreshKey,
    error: onError,
    setLeaveGuard,
    selectedTask,
    focusTask,
  } = ctx;
  const [localRoute, setLocalRoute] = useState(() =>
      parseCoreLocation(location.hash),
    ),
    route = controlledRoute || localRoute;
  const [classQuery, setClassQuery] = useState(''),
    [classes, setClasses] = useState([]),
    [classesBusy, setClassesBusy] = useState(true),
    [list, setList] = useState(null),
    [keyword, setKeyword] = useState(route.reportKeyword || ''),
    [status, setStatus] = useState(route.reportStatus || 'all'),
    [listBusy, setListBusy] = useState(false),
    [error, setError] = useState(''),
    [detail, setDetail] = useState(null),
    [detailBusy, setDetailBusy] = useState(false),
    [layout, setLayout] = useState(null),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false),
    [reload, setReload] = useState(0),
    [exemptField, setExemptField] = useState(''),
    [exemptReason, setExemptReason] = useState('');
  const currentRoute = useRef(route),
    currentDetail = useRef(detail),
    edit = useRef({ studentId: null, dirty: false, value: '' }),
    approvedRoute = useRef(null),
    listScroll = useRef(0),
    listRequest = useRef(0),
    detailRequest = useRef(0);
  currentRoute.current = route;
  currentDetail.current = detail;
  const listRef = useRef(list);
  listRef.current = list;
  const active = ctx.sessionActive !== false;
  const guard = useCallback(
    () =>
      !edit.current.dirty ||
      window.confirm(
        '学期寄语尚未保存，离开会放弃本次修改。是否离开？',
      ),
    [],
  );
  useEffect(() => {
    setLeaveGuard?.(guard);
    return () => setLeaveGuard?.(null);
  }, [setLeaveGuard, guard]);
  useEffect(() => {
    const changed = () => {
      const next = parseCoreLocation(location.hash),
        previous = currentRoute.current;
      if (next.page !== 'drafts') return;
      const switching =
        next.studentId !== previous.studentId ||
        next.reportVersion !== previous.reportVersion ||
        next.reportScope !== previous.reportScope;
      if (switching && approvedRoute.current !== location.hash && !guard()) {
        history.replaceState(null, '', formatCoreLocation(previous));
        return;
      }
      approvedRoute.current = null;
      if (switching) {
        edit.current = { studentId: next.studentId, dirty: false, value: '' };
        setDirty(false);
        setConflict(false);
      }
      setLocalRoute(next);
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, [guard]);
  const navigate = useCallback(
    (next) => {
      if (!guard()) return;
      edit.current.dirty = false;
      setDirty(false);
      setConflict(false);
      const hash = formatCoreLocation({
        ...next,
        role: 'teacher',
        page: 'drafts',
        termId: termId,
      });
      approvedRoute.current = hash;
      if (onNavigate) onNavigate(next);
      else location.hash = hash;
    },
    [guard, onNavigate, termId],
  );
  useEffect(() => {
    setKeyword(route.reportKeyword || '');
    setStatus(route.reportStatus || 'all');
  }, [route.reportKeyword, route.reportStatus]);
  useEffect(() => {
    const c = new AbortController();
    if (!active) {
      setClasses([]);
      setClassesBusy(false);
      return () => c.abort();
    }
    setClassesBusy(true);
    setClasses([]);
    api(`/report-core/report-classes?termId=${termId}`, undefined, undefined, {
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted) setClasses(r.rows);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') { setError(e.message); onError(e); }
      })
      .finally(() => {
        if (!c.signal.aborted) setClassesBusy(false);
      });
    return () => c.abort();
  }, [termId, refreshKey, active, onError]);
  useEffect(() => {
    const c = new AbortController(),
      request = ++listRequest.current;
    if (!active || route.studentId || !route.classKey) {
      if (!active || !route.classKey) setList(null);
      setListBusy(false);
      return () => c.abort();
    }
    setListBusy(true);
    setError('');
    setList(null);
    const p = new URLSearchParams({
      termId: termId,
      keyword: route.reportKeyword || '',
      status: route.reportStatus || 'all',
      limit: route.reportLimit || '25',
    });
    if (route.classKey) {
      const [grade, classNo] = route.classKey.split(':');
      p.set('grade', grade);
      p.set('classNo', classNo);
    }
    if (route.reportCursor) p.set('cursor', route.reportCursor);
    api('/report-core/report-students?' + p, undefined, undefined, {
      signal: c.signal,
    })
      .then((r) => {
        if (c.signal.aborted || request !== listRequest.current) return;
        setList(r);
        requestAnimationFrame(() => window.scrollTo({ top: listScroll.current }));
      })
      .catch((e) => {
        if (e.name !== 'AbortError' && request === listRequest.current) {
          setError(e.message);
          if (e.status === 401) onError(e);
        }
      })
      .finally(() => {
        if (!c.signal.aborted && request === listRequest.current)
          setListBusy(false);
      });
    return () => c.abort();
  }, [
    route.classKey,
    route.reportKeyword,
    route.reportStatus,
    route.reportCursor,
    route.reportLimit,
    route.studentId,
    termId,
    refreshKey,
    active,
    onError,
  ]);
  useEffect(() => {
    const c = new AbortController(),
      request = ++detailRequest.current;
    setDetail(null);
    setLayout(null);
    setError('');
    if (!active || !route.studentId) {
      setDetailBusy(false);
      return () => c.abort();
    }
    setDetailBusy(true);
    const studentId = route.studentId,
      scope = route.reportScope || 'full',
      known = listRef.current?.rows.find((s) => s.studentId === studentId),
      requested =
        route.reportVersion ||
        (known
          ? known.publishedVersion !== null
            ? 'published'
            : 'current'
          : 'published');
    const read = async (version) => {
      const fetchScope = reportScope => api(
        `/report-core/report-detail/${studentId}?termId=${termId}&version=${version}&scope=${reportScope}`,
        undefined,
        undefined,
        { signal: c.signal },
      );
      try {
        return await fetchScope(scope);
      } catch (e) {
        if (scope === 'full' && e.status === 403 && !c.signal.aborted)
          return fetchScope('detail');
        throw e;
      }
    };
    (async () => {
      let r;
      try {
        r = await read(requested);
      } catch (e) {
        if (e.status === 404 && !route.reportVersion && !c.signal.aborted)
          r = await read('current');
        else throw e;
      }
      if (c.signal.aborted || request !== detailRequest.current) return;
      setDetail(r);
    })()
      .catch((e) => {
        if (e.name !== 'AbortError' && request === detailRequest.current) {
          setError(e.message);
          if (e.status === 401) onError(e);
        }
      })
      .finally(() => {
        if (!c.signal.aborted && request === detailRequest.current)
          setDetailBusy(false);
      });
    return () => c.abort();
  }, [
    route.studentId,
    route.reportVersion,
    route.reportScope,
    termId,
    refreshKey,
    reload,
    active,
    onError,
  ]);
  useEffect(() => {
    const task = selectedTask;
    if (task?.fieldKey === 'teacher_comment') {
      focusTask?.(null);
      navigate({
        ...currentRoute.current,
        studentId: task.studentId,
        reportVersion: 'current',
        reportScope: 'full',
      });
    }
  }, [selectedTask, focusTask, navigate]);
  const onLayout = useCallback((result) => {
    if (currentDetail.current?.documentKey === result.documentKey)
      setLayout(result);
  }, []);
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
      if (e.status === 401) onError(e);
      else if (e.status === 409) {
        setConflict(edit.current.dirty);
        setReload((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  };
  const canConfirm =
    detail?.viewVersion === 'current' &&
    detail.scope === 'full' &&
    detail.permissions.canConfirm &&
    !dirty &&
    !conflict &&
    layout?.documentKey === detail.documentKey &&
    layout.renderScope === 'FULL' &&
    !layout.overflow &&
    (detail.model.schemaVersion === 'CORE_V2'
      ? layout.pageCount >= 1 &&
        layout.sections.some((s) =>
          Object.keys(sectionNames).every((key) => s.sections.includes(key)),
        )
      : layout.pageCount >= 2 &&
        layout.sections.some((s) => s.type === 'front') &&
        layout.sections.some(
          (s) =>
            s.type === 'detail' &&
            Object.keys(sectionNames).every((key) => s.sections.includes(key)),
        ));
  const confirm = () =>
    run(async () => {
      const document = detail;
      await api('/report-core/reports/confirm', {
        termId: termId,
        studentId: route.studentId,
        expectedRevision: document.revision,
        expectedFingerprint: document.fingerprint,
        layoutReview: {
          documentKey: document.documentKey,
          renderScope: 'FULL',
          fingerprint: document.fingerprint,
          templateVersion: document.templateVersion,
          overflow: layout.overflow,
          pageCount: layout.pageCount,
          sections: layout.sections,
        },
      });
      ctx.notify(
        currentDetail.current?.documentKey === document.documentKey
          ? '班主任确认已保存'
          : `已保存${document.model.student.name}的确认`,
      );
      setReload((n) => n + 1);
      ctx.refresh();
    });
  if (!active)
    return (
      <section className="panel">
        <p>请重新登录后读取报告。</p>
      </section>
    );
  const returnToClass = () => navigate({
    ...route,
    studentId: undefined,
    reportVersion: undefined,
    reportScope: undefined,
    reportSection: undefined,
  });
  if (route.studentId)
    return (
      <>
        {error && <p role="alert" className="feedback error">{error}</p>}
        {!detail && <section className="panel report-detail-loading">
          <p role="status">{detailBusy ? '正在读取报告…' : '报告暂时无法读取，请刷新后重试。'}</p>
          <button onClick={returnToClass}>返回班级列表</button>
        </section>}
        {detail && <>
          <TermReport
            html={detail.html}
            documentKey={detail.documentKey}
            printScope={detail.scope === 'full' ? 'FULL' : 'DETAIL_ONLY'}
            focusSection={route.reportSection}
            onLayout={onLayout}
            toolbarTitle={<div className="report-toolbar-title">
              <p className="kicker">学生档案 · 综合素质发展评价</p>
              <h2>{detail.model.student.name} · 六育评价报告</h2>
            </div>}
            toolbarActions={<>
              {detail.viewVersion === 'current' && detail.permissions.canReadFull && <button className="primary" disabled={busy || !canConfirm} onClick={confirm}>确认本份报告</button>}
              <button onClick={returnToClass}>返回班级列表</button>
            </>}
          />
          {detail.model.schemaVersion === 'CORE_V2' && detail.viewVersion === 'current' && detail.scope === 'full' && detail.permissions.canEditComment && <section className="panel report-detail-review">
              {detail.model.schemaVersion === 'CORE_V2' &&
                detail.viewVersion === 'current' &&
                detail.scope === 'full' &&
                detail.permissions.canEditComment && (
                  <details className="panel">
                    <summary>免修与不适用备案</summary>
                    <label>
                      评价项目
                      <select
                        aria-label="免修项目"
                        value={exemptField}
                        onChange={(e) => setExemptField(e.target.value)}
                      >
                        <option value="">请选择项目</option>
                        {ctx.catalog.fields
                          .filter(
                            (f) =>
                              !f.jsonPath &&
                              !['SELF', 'STORY'].includes(f.sourceType),
                          )
                          .map((f) => (
                            <option key={f.column} value={f.column}>
                              {f.label}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      备案或恢复原因
                      <input
                        aria-label="免修原因"
                        value={exemptReason}
                        onChange={(e) => setExemptReason(e.target.value)}
                      />
                    </label>
                    {[
                      [true, '登记不适用'],
                      [false, '恢复评价'],
                    ].map(([exempt, label]) => (
                      <button
                        key={label}
                        disabled={
                          busy || !exemptField || !exemptReason.trim()
                        }
                        onClick={() =>
                          run(async () => {
                            await api('/report-core/v2/exemptions', {
                              termId,
                              studentId: route.studentId,
                              expectedRevision: detail.revision,
                              targetKeys: [exemptField],
                              reason: exemptReason,
                              exempt,
                            });
                            setReload((n) => n + 1);
                            ctx.refresh();
                            ctx.notify(
                              '备案状态已更新并重新计算排名',
                            );
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </details>
                )}
          </section>}
        </>}
      </>
    );
  const currentClass = classes.find(c => `${c.grade}:${c.classNo}` === route.classKey);
  const chooseClass = c => {
    listScroll.current = 0;
    navigate({ ...route, classKey: `${c.grade}:${c.classNo}`, reportKeyword: undefined, reportStatus: undefined, reportCursor: undefined });
  };
  const openStudent = s => {
    listScroll.current = window.scrollY;
    navigate({ ...route, studentId: s.studentId, reportVersion: undefined, reportScope: s.canViewFull ? 'full' : 'detail', reportSection: undefined });
  };
  const queryReports = event => {
    event.preventDefault();
    listScroll.current = 0;
    navigate({ ...route, reportKeyword: keyword.trim() || undefined, reportStatus: status, reportCursor: undefined });
  };
  return (
    <section className="class-reports report-browser">
      <header className="report-browser-heading">
        <div className="report-browser-intro"><span className="report-step" aria-hidden="true">01</span><div>
          <h2>从你的班级开始</h2>
          <p>选择任教班级，查看每位学生的六育成长。</p>
        </div></div>
        <div className="actions"><small>本学期任教 <b>{classes.length}</b> 个班级</small><button onClick={() => ctx.navigate('settlements')}>采集结算</button></div>
      </header>
      {(classes.length > 6 || classQuery) && <label className="report-class-search">查找任教班级
        <input aria-label="查找负责班级" value={classQuery} onChange={e => setClassQuery(e.target.value)} placeholder="年级或班级" />
      </label>}
      <nav className="report-class-choices" aria-label="任教班级">
        {classes.filter(c => `${c.grade}年级${c.classNo}班`.includes(classQuery.trim())).map(c => (
          <button className="report-class-choice" aria-label={`${c.grade}年级${c.classNo}班`}
            aria-pressed={route.classKey === `${c.grade}:${c.classNo}`} key={`${c.grade}:${c.classNo}`} onClick={() => chooseClass(c)}>
            <strong>{c.grade}年级（{c.classNo}）班</strong><span className="report-class-check" aria-hidden="true">✓</span>
            <span className="report-class-meta"><span>{c.isHeadTeacher ? '班主任' : '任课教师'}</span><small>{c.studentCount} 名学生</small></span>
          </button>
        ))}
      </nav>
      {(classes.length > 6 || classQuery) && !classes.some(c => `${c.grade}年级${c.classNo}班`.includes(classQuery.trim())) && <p className="report-class-no-match">没有匹配的任教班级，请调整搜索内容。</p>}
      {error && <p role="alert" className="feedback error">{error}<button onClick={() => ctx.refresh()}>重新读取</button></p>}
      {classesBusy && <p className="working" role="status">正在读取任教班级…</p>}
      {!route.classKey ? <div className="report-roster-panel report-selection-empty">
        <div className="report-empty-mark" aria-hidden="true">六</div>
        <h3>{!classesBusy && !classes.length ? '暂无任教班级' : '先选择一个任教班级'}</h3>
        <p>{!classesBusy && !classes.length ? '本学期尚无有效任教职责，请联系管理员核对。' : '查看星级与等级分布，点击学生进入六育评价明细。'}</p>
      </div> : <div className="report-roster-panel" aria-busy={listBusy}>
        <div className="report-roster-heading"><div>
          <h3>{currentClass ? `${currentClass.grade}年级（${currentClass.classNo}）班` : '班级学生'}
            {list && <small>{list.counts.total} 名学生</small>}</h3>
          <p>星级与等级概要 · 基于当前评价数据</p>
        </div><span className="report-roster-label">学生六育概览</span></div>
        <form className="report-roster-filters" onSubmit={queryReports}>
          <label className="report-student-search"><span className="sr-only">搜索学生</span>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <input aria-label="搜索学生" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索姓名或学号" />
          </label>
          <label><span className="sr-only">报告状态</span><select aria-label="报告状态" value={status} onChange={e => setStatus(e.target.value)}>
            {[
              ['all', '全部报告状态'], ['published', '已发布'], ['missing', '当前草稿缺项'],
              ['confirmed', '已确认'], ['ready', '当前数据齐全'], ['draft', '当前待确认'],
            ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <button type="submit" className="primary">查询报告</button>
          {(route.reportKeyword || route.reportStatus && route.reportStatus !== 'all') && <button type="button" className="report-clear" onClick={() => {
            setKeyword(''); setStatus('all'); listScroll.current = 0;
            navigate({ ...route, reportKeyword: undefined, reportStatus: undefined, reportCursor: undefined });
          }}>清空报告筛选</button>}
        </form>
        <div className="report-student-table-head" aria-hidden="true"><span>学生</span><span>星级分布 <small>三星 / 二星 / 一星</small></span><span>等级分布 <small>A / B / C / D</small></span><span>六育报表</span></div>
        {listBusy && <p role="status" className="report-list-loading">正在读取学生摘要…</p>}
        {list && <>
          <div className="report-student-rows">
            {list.rows.map(s => <article className="report-student-summary" data-report-student="" key={s.studentId}>
              <div className="report-student-identity"><span className="report-student-initial" aria-hidden="true">{[...s.name].at(-1)}</span><div>
                <button className="report-student-name" aria-label={`查看${s.name}的六育报表`} onClick={() => openStudent(s)}>{s.name}</button>
                <small>学号 {s.studentNumber}</small>
              </div></div>
              <div className="report-rating-cell"><span className="report-mobile-rating-label">星级分布</span><RatingDistribution type="stars" counts={s.starCounts} missing={s.starCounts?.missing} /></div>
              <div className="report-rating-cell"><span className="report-mobile-rating-label">等级分布</span><RatingDistribution type="grades" counts={s.gradeCounts} missing={s.gradeMissingCount} /></div>
              <button className="report-student-open" aria-label={`${s.name} · ${s.studentNumber} · 查看报告`} onClick={() => openStudent(s)}>查看 <span aria-hidden="true">↗</span></button>
            </article>)}
          </div>
          {!list.rows.length && <div className="report-selection-empty"><h3>{route.reportKeyword || route.reportStatus && route.reportStatus !== 'all' ? '没有符合条件的学生' : '这个班级还没有学生'}</h3><p>{route.reportKeyword || route.reportStatus && route.reportStatus !== 'all' ? '请调整姓名、学号或报告状态。' : '请联系管理员核对本学期班级名单。'}</p></div>}
          <footer className="report-roster-footer"><span>找到 {list.total} 名学生 · 本页 {list.rows.length} 人</span><div className="report-pagination">
            <label><span className="sr-only">每页人数</span><select aria-label="报告每页人数" value={route.reportLimit || '25'} onChange={e => {
              listScroll.current = 0;
              navigate({ ...route, reportLimit: e.target.value, reportCursor: undefined });
            }}>{[25, 50, 100].map(n => <option key={n} value={n}>{n} 人 / 页</option>)}</select></label>
            {route.reportCursor && <button onClick={() => { listScroll.current = 0; navigate({ ...route, reportCursor: undefined }); }}>返回第一页</button>}
            <button disabled={!list.nextCursor} onClick={() => { listScroll.current = 0; navigate({ ...route, reportCursor: list.nextCursor }); }}>下一页 <span aria-hidden="true">→</span></button>
          </div></footer>
        </>}
      </div>}
      <p className="report-statistics-note"><b>统计说明</b><span>星级、等级分别以已评价项目为分母，未评价项单独提示。百分比四舍五入可能有尾差；点击学生可查看原格式六育报表。</span></p>
    </section>
  );
}
