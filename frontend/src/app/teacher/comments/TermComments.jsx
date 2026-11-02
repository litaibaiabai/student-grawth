import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, resultOf } from '../../core/api';
import StudentAssessmentReport from '../../../component/StudentAssessmentReport';
import './termComments.css';

const statusNames = { EMPTY: '未生成', DRAFT: '待审核', APPROVED: '已通过' };
const sectionNames = ['德美', '智美', '健美', '艺美', '劳美', '故事美'];
function PenMark() {
  return <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M18 45l4-15L44 8l12 12-22 22-16 3zM22 30l12 12M40 12l12 12M18 45l-4 5M12 55h38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M23 35l6 6-8 2 2-8z" fill="currentColor"/></svg>;
}

export default function TermComments({ ctx }) {
  return <CommentWorkspace key={`${ctx.termId}:${ctx.actor.id}`} ctx={ctx} />;
}

function CommentWorkspace({ ctx }) {
  const { termId, error: onError, setLeaveGuard, refreshKey } = ctx;
  const [classKey, setClassKey] = useState('');
  const [headerSlot, setHeaderSlot] = useState(null);
  useEffect(() => { setHeaderSlot(document.getElementById('term-comment-class-filter')); }, []);
  const [rows, setRows] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [record, setRecord] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [selected, setSelected] = useState([]);
  const [reload, setReload] = useState(0);
  const alive = useRef(true), detailRequest = useRef(0), rosterRequest = useRef(0);
  const session = useRef(ctx.sessionActive), detailController = useRef(null);
  session.current = ctx.sessionActive;
  const classes = useMemo(() => [...new Map(ctx.assignments
    .filter(a => Number(a.is_head_teacher) === 1)
    .map(a => [`${a.grade}:${a.class_no}`, { key: `${a.grade}:${a.class_no}`, grade: a.grade, classNo: a.class_no }])).values()]
    .sort((a, b) => a.grade - b.grade || a.classNo - b.classNo), [ctx.assignments]);
  const dirty = !!record && text !== record.comment;
  const locked = !!busy || ctx.sessionActive === false;
  const currentClass = classes.find(c => c.key === classKey);
  const filtered = rows.filter(r => (filter === 'ALL' || r.status === filter) &&
    (!keyword || r.student.name.includes(keyword) || r.student.id.includes(keyword)));
  const selectable = filtered.filter(r => r.status === 'DRAFT' && r.canEdit);
  const counts = { ALL: rows.length, EMPTY: 0, DRAFT: 0, APPROVED: 0 };
  rows.forEach(r => counts[r.status]++);
  const mayLeave = () => !dirty || window.confirm('寄语尚未保存，离开会放弃本次修改，是否继续？');
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (ctx.sessionActive !== false) return;
    detailController.current?.abort();
    detailRequest.current++;
    setLoading(false); setBusy('');
  }, [ctx.sessionActive]);
  useEffect(() => {
    setLeaveGuard?.(() => !dirty || window.confirm('寄语尚未保存，确定离开？'));
    const beforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { setLeaveGuard?.(null); window.removeEventListener('beforeunload', beforeUnload); };
  }, [dirty, setLeaveGuard]);

  const loadRoster = useCallback(async signal => {
    if (!classKey) return;
    const request = ++rosterRequest.current;
    const [grade, classNo] = classKey.split(':');
    setRosterLoading(true);
    try {
      const data = await api(`/report-core/v2/comments?termId=${termId}&grade=${grade}&classNo=${classNo}`, undefined, undefined, { signal });
      if (!alive.current || request !== rosterRequest.current) return;
      setRows(data.rows);
      setSelected(ids => ids.filter(id => data.rows.some(r => r.student.id === id && r.status === 'DRAFT' && r.canEdit)));
    } catch (e) {
      if (e.name !== 'AbortError' && alive.current && request === rosterRequest.current) {
        setError(e.message);
        if (e.status === 401) onError(e);
      }
    } finally { if (alive.current && request === rosterRequest.current) setRosterLoading(false); }
  }, [classKey, termId, onError]);
  useEffect(() => {
    const controller = new AbortController(), counter = rosterRequest;
    loadRoster(controller.signal);
    return () => { controller.abort(); counter.current++; };
  }, [loadRoster, refreshKey]);
  const updateRecord = useCallback(data => {
    setRecord(data);
    setText(data.comment);
    setRows(old => old.map(r => r.student.id === data.student.id ? data : r));
  }, []);
  useEffect(() => {
    const controller = new AbortController(), counter = detailRequest, request = ++counter.current;
    detailController.current = controller;
    setRecord(null); setText(''); setError(''); setLoading(!!studentId);
    if (studentId) (async () => {
      try {
        let data = await api(`/report-core/v2/comments/${studentId}?termId=${termId}`, undefined, undefined, { signal: controller.signal });
        if (request !== detailRequest.current || controller.signal.aborted || session.current === false) return;
        updateRecord(data);
        if (data.status === 'EMPTY' && data.canEdit && session.current !== false) {
          data = resultOf(await api('/report-core/v2/comments/generate', { termId, studentId }, undefined, { signal: controller.signal }));
          if (request !== detailRequest.current || controller.signal.aborted || session.current === false) return;
          updateRecord(data);
        }
      } catch (e) {
        if (e.name !== 'AbortError' && request === detailRequest.current) {
          setError(e.message);
          if (e.status === 401) onError(e);
        }
      } finally { if (request === detailRequest.current && !controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); counter.current++; };
  }, [studentId, termId, reload, onError, updateRecord]);
  const chooseStudent = id => {
    if (id !== studentId && mayLeave()) { setStudentId(id); setError(''); }
  };
  const run = async (action, fn) => {
    if (locked) return;
    const request = detailRequest.current;
    setBusy(action); setError('');
    try { await fn(() => alive.current && request === detailRequest.current); }
    catch (e) {
      if (alive.current && request === detailRequest.current) { setError(e.message); if (e.status === 401) onError(e); }
    } finally { if (alive.current && request === detailRequest.current) setBusy(''); }
  };
  const save = () => run('save', async current => {
    const data = resultOf(await api('/report-core/v2/comments/save', { termId, studentId, comment: text, expectedRevision: record.revision, expectedCommentId: record.commentId }));
    if (!current()) return;
    updateRecord(data); ctx.notify('寄语草稿已保存');
  });
  const generate = () => {
    if ((dirty || record?.comment) && !window.confirm('重新生成会替换当前寄语，是否继续？')) return;
    run('generate', async current => {
      const data = resultOf(await api('/report-core/v2/comments/generate', { termId, studentId, force: !!record?.comment, expectedCommentId: record?.commentId ?? null }));
      if (!current()) return;
      updateRecord(data); ctx.notify('已根据六育报表生成新草稿');
    });
  };
  const approve = ids => run('approve', async current => {
    const entries = ids.map(id => {
      const row = id === studentId ? record : rows.find(r => r.student.id === id);
      return { studentId: id, comment: id === studentId ? text : row.comment, expectedRevision: row.revision, expectedCommentId: row.commentId };
    });
    await api('/report-core/v2/comments/approve', { termId, entries });
    if (!current()) return;
    if (ids.includes(studentId)) {
      const data = await api(`/report-core/v2/comments/${studentId}?termId=${termId}`);
      if (!current()) return;
      updateRecord(data);
    }
    setSelected([]);
    ctx.notify(ids.length === 1 ? '寄语已审核通过' : `已审核通过 ${ids.length} 名学生的寄语`);
    await loadRoster();
    if (current()) ctx.refresh();
  });
  const validText = !!text.trim() && [...text.trim()].length <= 1000;
  const canApprove = record?.canEdit && validText && (record.commentId || record.status === 'APPROVED') && (dirty || record.status !== 'APPROVED');
  const next = rows.find((r, index) => index > rows.findIndex(r => r.student.id === studentId) && r.status !== 'APPROVED');
  return <section className="term-comments" aria-label="学期寄语工作台">
    {headerSlot && createPortal(<label className="term-class-picker"><span>选择班级</span><select aria-label="寄语班级" value={classKey} disabled={locked || !classes.length} onChange={e => {
        if (!mayLeave()) return;
        rosterRequest.current++; setClassKey(e.target.value); setStudentId(''); setRecord(null); setText(''); setRows([]); setSelected([]); setKeyword(''); setFilter('ALL'); setError('');
      }}><option value="">请选择班主任负责班级</option>{classes.map(c => <option key={c.key} value={c.key}>{c.grade}年级（{c.classNo}）班</option>)}</select></label>, headerSlot)}
    {classKey && <div className="term-class-progress"><div><span>寄语审核进度</span><b>{counts.APPROVED}<small> / {rows.length} 人</small></b></div><progress aria-label="寄语审核进度" value={counts.APPROVED} max={rows.length || 1} /></div>}
    {!classes.length && <p className="term-class-empty">当前没有班主任负责班级，请联系管理员配置班主任职责。</p>}
    {error && <div className="term-error" role="alert"><span>{error}</span>{record && <button disabled={locked || loading} onClick={() => { if (mayLeave()) setReload(n => n + 1); }}>刷新寄语</button>}{!record && classKey && <button disabled={locked} onClick={() => studentId ? setReload(n => n + 1) : loadRoster()}>重新加载</button>}</div>}
    {!classKey ? <div className="term-start"><PenMark /><h3>一班孩子，一学期的成长。</h3><p>选择班级后，查看学生名册与寄语审核进度。</p><div>{sectionNames.map(name => <span key={name}>{name}</span>)}</div></div> : <div className="term-workspace">
      <aside className="term-roster" aria-label="班级学生名册">
        <div className="term-roster-heading"><h3>班级学生<span>{currentClass?.grade}年级（{currentClass?.classNo}）班</span></h3><b>{rows.length}<small> 人</small></b></div>
        <label className="term-search"><span className="sr-only">查找寄语学生</span><input aria-label="查找寄语学生" placeholder="查找姓名 / 编号" value={keyword} onChange={e => setKeyword(e.target.value)} /></label>
        <div className="term-filters" aria-label="寄语状态筛选">{[['ALL', '全部'], ['EMPTY', '未生成'], ['DRAFT', '待审核'], ['APPROVED', '已通过']].map(([value, name]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{name}<span>{counts[value]}</span></button>)}</div>
        <div className="term-select-bar"><label><input type="checkbox" aria-label="全选待审核学生" disabled={locked || !selectable.length} checked={!!selectable.length && selectable.every(r => selected.includes(r.student.id))} onChange={e => setSelected(e.target.checked ? [...new Set([...selected, ...selectable.map(r => r.student.id)])] : selected.filter(id => !selectable.some(r => r.student.id === id)))} />全选待审核</label><span>{selected.length ? `已选 ${selected.length} 人` : '点击姓名查看寄语'}</span></div>
        <div className="term-roster-list" aria-busy={rosterLoading}>
          {rosterLoading && !rows.length ? <p className="term-list-empty">正在读取班级名册…</p> : filtered.map(row => <div key={row.student.id} className={`term-student ${row.student.id === studentId ? 'is-active' : ''}`}>
            <input type="checkbox" aria-label={`选择${row.student.name}`} disabled={locked || row.status !== 'DRAFT' || !row.canEdit} checked={selected.includes(row.student.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, row.student.id] : ids.filter(id => id !== row.student.id))} />
            <button className="term-student-open" aria-label={`查看${row.student.name}的学期寄语`} title={`${row.student.name} · 编号 ${row.student.id}`} aria-pressed={row.student.id === studentId} disabled={locked} onClick={() => chooseStudent(row.student.id)}><span className="term-student-name"><b>{row.student.name}</b></span><span className={`term-status status-${row.status.toLowerCase()}`}>{statusNames[row.status]}</span></button>
          </div>)}
          {!rosterLoading && !filtered.length && <p className="term-list-empty">{rows.length ? '没有符合条件的学生。' : '当前班级还没有学生。'}</p>}
        </div>
        <footer className="term-batch"><button className="primary" disabled={locked || loading || !selected.length || selected.length > 100 || (selected.includes(studentId) && !validText)} onClick={() => approve(selected)}>批量审核通过（{selected.length}）</button><p>{selected.length > 100 ? '每批最多审核100名学生，请减少勾选。' : '审核后，寄语将写入学生的六育报告。'}</p></footer>
      </aside>
      <div className="term-editor-column">
        {!studentId ? <div className="term-editor-empty"><span>02 / 核对寄语</span><PenMark /><h3>从一个名字，读懂一段成长。</h3><p>点击左侧学生，自动生成专属学期寄语。<br />你可以修改文字，也可以直接审核通过。</p></div> : <>
          <div className="term-editor-top"><div><span>02 / 核对寄语</span><h3>{record?.student.name || rows.find(r => r.student.id === studentId)?.student.name}<small>的学期寄语</small></h3></div><span className={`term-status status-${record?.status.toLowerCase() || 'empty'}`}>{dirty ? '修改未保存' : loading ? '正在生成 / 读取' : statusNames[record?.status] || '读取中'}</span></div>
          <div className="term-letter">
            <div className="term-letter-heading"><span>致正在成长的你</span><span>{ctx.term?.term_name || record?.report?.term.name}</span></div>
            {loading && <div className="term-generating" role="status"><span className="term-loading-dot" />正在读取六育报表，为这份成长落笔…</div>}
            <label className="sr-only" htmlFor="term-comment-text">学期寄语</label>
            <textarea id="term-comment-text" aria-label="学期寄语" aria-describedby="term-comment-hint" value={text} disabled={locked || loading || !record?.canEdit} onChange={e => setText(e.target.value)} placeholder={loading ? '寄语生成后会显示在这里，请稍候。' : '寄语暂未生成，可以重试生成，或亲自为孩子写下寄语。'} />
            <div className="term-letter-footer"><span>一份鼓励，一程相伴。</span><span className={[...text.trim()].length > 1000 ? 'term-limit-error' : ''}>{[...text.trim()].length} / 1000 字</span></div>
          </div>
          {record?.reportChanged && <p className="term-data-note">这份寄语生成后，六育数据有更新。请展开报表核对，必要时重新生成。</p>}
          {record && !record.canEdit && <p className="term-data-note">当前学期已冻结或正在发布，寄语仅供查看。</p>}
          <div className="term-editor-actions"><button disabled={locked || loading || !record?.canEdit} onClick={generate}><span aria-hidden="true">↻</span> {busy === 'generate' ? '正在生成…' : text ? '重新生成' : '重试生成'}</button><div><button disabled={locked || loading || !record?.canEdit || !dirty || !validText} onClick={save}>{busy === 'save' ? '正在保存…' : '保存草稿'}</button><button className="primary" disabled={locked || loading || !canApprove} onClick={() => approve([studentId])}>{busy === 'approve' ? '正在审核…' : '审核通过'}</button></div></div>
          <p className="term-editor-hint" id="term-comment-hint">{record?.status === 'APPROVED' && !dirty ? '这份寄语已写入六育报告。再次修改后，请重新审核。' : '可直接修改生成的文字。保存草稿供稍后核对，审核通过后写入六育报告。'}</p>
          {record?.report && <details className="term-evidence"><summary><span>查看六育报表依据</span><small>德 · 智 · 健 · 艺 · 劳 · 故事</small></summary><div><StudentAssessmentReport catalog={ctx.catalog} record={record.report} term={ctx.term} showNarratives={false} /></div></details>}
          {next && <button className="term-next" disabled={locked} onClick={() => chooseStudent(next.student.id)}>继续核对下一位 <b>{next.student.name}</b><span aria-hidden="true">→</span></button>}
        </>}
      </div>
    </div>}
  </section>;
}
