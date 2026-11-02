import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../core/api';
import { UIIcon } from '../../core/illustrations';
import './awardReviews.css';
import { awardRegions, awardLevels, awardSubjects, subjectLabel, missingAwardFacts } from './awardFacts';

const pendingStates = ['QUEUED', 'PROCESSING', 'SUBMITTED', 'FAILED'];
const statusLabels = { QUEUED: '识别排队中', PROCESSING: '识别中', SUBMITTED: '待评审', FAILED: '待人工核对', APPROVED: '已通过', REJECTED: '未通过', REVOKED: '已撤回', SUPERSEDED: '已替换' };
const classLabel = key => key.replace(':', '年级') + '班';
const canApprove = row => row.canRecognize && pendingStates.includes(row.status);

export default function V2Reviews({ ctx }) {
  const { termId, refreshKey, error: onError, setLeaveGuard } = ctx;
  const [classKey, setClassKey] = useState('');
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(false), [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0), [keyword, setKeyword] = useState(''), [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0), [checked, setChecked] = useState([]), [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(null), [facts, setFacts] = useState({}), [reason, setReason] = useState('');
  const [preview, setPreview] = useState(''), [previewError, setPreviewError] = useState(''), [previewRetry, setPreviewRetry] = useState(0);
  const [result, setResult] = useState(null);
  const dialog = useRef(null), submitting = useRef(false);
  const students = ctx.students || [], assignments = ctx.assignments || [];
  const classes = [...new Set(assignments.filter(a => a.enabled !== 0).map(a => `${a.grade}:${a.class_no}`))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const studentFor = row => students.find(s => String(s.student_id) === String(row.student_id));
  const nameFor = row => studentFor(row)?.student_name_snapshot || `学生 #${row.student_id}`;
  const validClass = classes.includes(classKey);

  useEffect(() => {
    const controller = new AbortController();
    setRows([]);
    setLoadError('');
    if (!classKey || !validClass) { setLoading(false); return; }
    setLoading(true);
    const [grade, classNo] = classKey.split(':');
    (async () => {
      const all = [];
      let offset = 0;
      do {
        const query = new URLSearchParams({ termId, grade, classNo, sourceType: 'CERTIFICATE', recordKind: 'ITEM', page: '1', offset: String(offset) });
        const data = await api(`/report-core/sources?${query}`, undefined, undefined, { signal: controller.signal });
        all.push(...data.rows);
        offset = data.nextOffset;
      } while (offset !== null && offset !== undefined);
      if (!controller.signal.aborted) setRows(all);
    })().catch(e => { if (!controller.signal.aborted) { setLoadError(e.message); if (e.status === 401) onError(e); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [classKey, validClass, termId, refreshKey, reload, onError]);

  useEffect(() => {
    setLeaveGuard?.(() => !submitting.current);
    return () => setLeaveGuard?.(null);
  }, [setLeaveGuard]);

  useEffect(() => {
    const element = dialog.current;
    if (!opened) return;
    const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, [opened]);

  useEffect(() => {
    setPreview('');
    setPreviewError('');
    if (!opened) return;
    const controller = new AbortController();
    let url;
    fetch(`/api/v1/report-core/files/${opened.id}`, {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('REPORT_CORE_TOKEN') }, signal: controller.signal,
    }).then(response => {
      if (!response.ok) throw Error('奖状原件暂时无法读取，请重试');
      return response.blob();
    }).then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setPreview(url);
    }).catch(e => { if (!controller.signal.aborted) setPreviewError(e.message); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [opened, previewRetry]);

  function chooseClass(key) {
    setClassKey(key);
    setChecked([]);
    setOpened(null);
    setKeyword('');
    setFilter('all');
    setPage(0);
    setResult(null);
  }
  function openDetail(row) {
    if (busy) return;
    setOpened(row);
    setFacts({ ...(row.payload.facts || {}) });
    setReason(row.payload.reviewReason || '');
  }
  async function approve(records, editedFacts) {
    if (submitting.current || !records.length) return;
    submitting.current = true;
    setBusy(true);
    setResult(null);
    const succeeded = [], failures = [];
    try {
      for (const row of records) {
        const currentFacts = editedFacts || row.payload.facts || {};
        try {
          if (!canApprove(row)) throw Error('记录已处理或没有评审权限，请刷新后查看');
          const missing = missingAwardFacts(currentFacts);
          if (missing.length) throw Error(`请在详情中补齐：${missing.join('、')}`);
          await api(`/report-core/certificates/${row.id}/decision`, {
            expectedRevision: row.revision, facts: currentFacts,
            reason: editedFacts ? reason.trim() : (row.payload.reviewReason || ''),
          });
          succeeded.push(String(row.id));
        } catch (e) {
          failures.push({ id: String(row.id), name: nameFor(row), title: currentFacts.title || '未命名奖状', message: e.message });
          if (e.status === 409 && String(opened?.id) === String(row.id)) setOpened(null);
          if (e.status === 401) { onError(e); break; }
        }
      }
      setResult({ succeeded: succeeded.length, failures });
      setChecked(ids => ids.filter(id => !succeeded.includes(id)));
      if (succeeded.length) {
        setRows(current => current.map(row => succeeded.includes(String(row.id)) ? { ...row, status: 'APPROVED', canRecognize: false } : row));
        if (opened && succeeded.includes(String(opened.id))) setOpened(null);
        ctx.refresh();
      }
      if (failures.some(f => !f.message.startsWith('请在详情中补齐'))) setReload(n => n + 1);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const pending = rows.filter(row => pendingStates.includes(row.status));
  const approved = rows.filter(row => row.status === 'APPROVED');
  const filtered = rows.filter(row => {
    const match = filter === 'all' || (filter === 'pending' ? pendingStates.includes(row.status) : row.status === 'APPROVED');
    return match && `${nameFor(row)} ${studentFor(row)?.student_number || ''} ${row.payload.facts?.title || ''}`.includes(keyword.trim());
  });
  const lastPage = Math.max(0, Math.ceil(filtered.length / 10) - 1), currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(currentPage * 10, currentPage * 10 + 10);
  const selectable = visible.filter(canApprove).map(row => String(row.id));
  const selectedRows = rows.filter(row => checked.includes(String(row.id)) && canApprove(row));
  const allChecked = selectable.length > 0 && selectable.every(id => checked.includes(id));
  const missing = opened ? missingAwardFacts(facts) : [];
  const classStudents = students.filter(s => `${s.grade_snapshot}:${s.class_no_snapshot}` === classKey);

  return <div className="award-workspace">
    <div className="award-intro">
      <div><p className="award-eyebrow">学生荣誉 · 教师认定</p><h2>{validClass ? '让每一份荣誉，留下成长的印记' : '选择评审班级'}</h2><p>核对学生上传的奖状，确认每一份努力与收获。</p></div>
      <div className="award-intro-mark"><UIIcon name="award"/><span>荣誉有据<br/>成长有迹</span></div>
    </div>
    <ol className="award-steps" aria-label="评审步骤"><li className={!validClass ? 'current' : 'done'}><span>{validClass ? '✓' : '01'}</span>选择班级</li><li className={validClass ? 'current' : ''}><span>02</span>核对与评审</li></ol>
    {!validClass ? <section className="award-class-section" aria-label="评审班级">
      <div className="award-section-heading"><h3>我的任教班级</h3><span>{classes.length} 个班级</span></div>
      <div className="award-class-grid">{classes.map(key => {
        const count = students.filter(s => `${s.grade_snapshot}:${s.class_no_snapshot}` === key).length;
        const isHead = assignments.some(a => `${a.grade}:${a.class_no}` === key && Number(a.is_head_teacher) === 1);
        return <button className="award-class-card" key={key} onClick={() => chooseClass(key)}><span className="award-class-icon"><UIIcon name="people"/></span><span><strong>{classLabel(key)}</strong><small>{count} 位学生 · {isHead ? '班主任' : '任课教师'}</small></span><span className="award-class-arrow" aria-hidden="true">→</span></button>;
      })}</div>
      {!classes.length && <div className="award-empty"><UIIcon name="people"/><h3>暂无可评审班级</h3><p>当前学期尚未配置任教班级，请联系管理员。</p></div>}
      <p className="award-scope-note"><UIIcon name="check"/>本模块仅评审学生上传的奖状，学生故事无需审核。</p>
    </section> : <section className="award-board" aria-label="班级获奖记录" aria-busy={loading || busy}>
      <div className="award-board-header"><div><span className="award-class-caption">当前评审班级</span><h3>{classLabel(classKey)}<small>{classStudents.length} 位学生</small></h3></div><button className="award-change" disabled={busy} onClick={() => chooseClass('')}>切换班级 <span aria-hidden="true">↗</span></button></div>
      <div className="award-overview"><span>全部奖状 <b>{rows.length}</b></span><span className="award-pending-count">待评审 <b>{pending.length}</b></span><span>已通过 <b>{approved.length}</b></span><small>按获奖记录逐条评审</small></div>
      <div className="award-tools"><div className="award-tabs" aria-label="评审状态">{[['all', '全部记录'], ['pending', '待评审'], ['approved', '已通过']].map(([id, label]) => <button key={id} aria-pressed={filter === id} disabled={busy} onClick={() => { setFilter(id); setPage(0); setChecked([]); }}>{label}</button>)}</div><label className="award-search"><span>搜索记录</span><input type="search" aria-label="搜索学生或奖项" placeholder="搜索学生姓名、学号或奖项" value={keyword} disabled={busy} onChange={e => { setKeyword(e.target.value); setPage(0); setChecked([]); }}/></label></div>
      {result && <div className={`award-result ${result.failures.length ? 'has-failures' : ''}`} role={result.failures.length ? 'alert' : 'status'}>
        {result.succeeded > 0 && <strong>已通过 {result.succeeded} 条获奖记录</strong>}
        {result.failures.length > 0 && <><strong>{result.failures.length} 条记录未通过，请处理后重试</strong><ul>{result.failures.map(f => <li key={f.id}>{f.name} · {f.title}：{f.message}</li>)}</ul></>}
        <button aria-label="关闭处理结果" onClick={() => setResult(null)}>×</button>
      </div>}
      {loadError ? <div className="award-empty" role="alert"><h3>获奖记录读取失败</h3><p>{loadError}</p><button onClick={() => setReload(n => n + 1)}>重新加载</button></div> : loading ? <div className="award-empty" role="status">正在读取班级获奖记录…</div> : filtered.length ? <>
        <div className="award-table-scroll"><table className="award-table"><thead><tr><th className="award-select-cell"><input aria-label="全选本页待审记录" type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = !allChecked && selectable.some(id => checked.includes(id)); }} disabled={busy || !selectable.length} onChange={() => setChecked(ids => allChecked ? ids.filter(id => !selectable.includes(id)) : [...new Set([...ids, ...selectable])])}/></th><th>学生</th><th>荣誉名称</th><th>荣誉地域</th><th>荣誉级别</th><th>所属学科</th><th>评审状态</th><th>操作</th></tr></thead><tbody>{visible.map(row => <tr key={row.id} data-award-id={row.id} className={checked.includes(String(row.id)) ? 'is-selected' : ''} onClick={() => openDetail(row)}>
          <td className="award-select-cell" onClick={e => e.stopPropagation()}><input aria-label={`选择${nameFor(row)}的${row.payload.facts?.title || '未命名奖状'}，记录${row.id}`} type="checkbox" checked={checked.includes(String(row.id))} disabled={busy || !canApprove(row)} onChange={e => setChecked(ids => e.target.checked ? [...ids, String(row.id)] : ids.filter(id => id !== String(row.id)))}/></td>
          <td><div className="award-student"><span className="award-avatar" aria-hidden="true">{nameFor(row).slice(-2)}</span><div><strong>{nameFor(row)}</strong><small>{studentFor(row)?.student_number || `学生编号 ${row.student_id}`}</small></div></div></td>
          <td><button className="award-record-title" disabled={busy} onClick={e => { e.stopPropagation(); openDetail(row); }}>{row.payload.facts?.title || '待补充奖项名称'}</button></td>
          <td><span className="award-region">{row.payload.facts?.awardRegion || '待核对'}</span></td>
          <td><span className="award-level">{row.payload.facts?.awardLevel || '待核对'}</span></td><td className="award-subject">{subjectLabel(row.payload.facts?.subjectCode)}</td><td><span className={`award-status ${row.status === 'APPROVED' ? 'approved' : pendingStates.includes(row.status) ? 'pending' : 'muted'}`}>{statusLabels[row.status] || row.status}</span></td>
          <td onClick={e => e.stopPropagation()}><div className="award-row-actions"><button disabled={busy} onClick={() => openDetail(row)}>查看详情</button>{canApprove(row) && <button className="award-approve-link" disabled={busy} onClick={() => missingAwardFacts(row.payload.facts || {}).length ? openDetail(row) : approve([row])}>评审通过</button>}</div></td>
        </tr>)}</tbody></table></div>
        <div className="award-pagination"><span>共 {filtered.length} 条记录 · 第 {currentPage + 1} / {lastPage + 1} 页</span><div><button aria-label="上一页获奖记录" disabled={busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>← 上一页</button><button aria-label="下一页获奖记录" disabled={busy || currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>下一页 →</button></div></div>
      </> : <div className="award-empty"><UIIcon name="award"/><h3>{keyword || filter !== 'all' ? '没有符合条件的获奖记录' : '这个班级还没有上传奖状'}</h3><p>{keyword || filter !== 'all' ? '试试其他关键词，或切换到全部记录。' : '学生上传奖状后，将在这里展示。'}</p></div>}
      <div className={`award-batch-bar ${selectedRows.length ? 'has-selection' : ''}`}><div><strong>{selectedRows.length ? `已选择 ${selectedRows.length} 条获奖记录` : '勾选获奖记录，批量完成评审'}</strong><small>{selectedRows.length ? '仅通过所选奖项，同一学生的其他奖项不受影响' : '可同时选择不同学生的奖状'}</small></div><div>{checked.length > 0 && <button className="award-clear" disabled={busy} onClick={() => setChecked([])}>取消选择</button>}<button className="primary" disabled={busy || loading || !!loadError || !selectedRows.length} onClick={() => approve(selectedRows)}><UIIcon name="check"/>{busy ? '正在评审…' : `批量通过（${selectedRows.length}）`}</button></div></div>
    </section>}
    <dialog ref={dialog} className="award-detail-dialog" aria-labelledby="award-detail-title" onCancel={e => { e.preventDefault(); if (!busy) setOpened(null); }}>
      {opened && <><header className="award-detail-header"><div><p className="award-eyebrow">{classLabel(classKey)} · {nameFor(opened)}</p><h2 id="award-detail-title">奖状详情</h2></div><button aria-label="关闭奖状详情" disabled={busy} onClick={() => setOpened(null)}>×</button></header><div className="award-detail-body"><div className="award-original"><div className="award-original-caption"><span>学生上传的原件</span><span>{opened.payload.mime === 'application/pdf' ? 'PDF' : '图片'}</span></div>{previewError ? <div className="award-preview-empty" role="alert"><p>{previewError}</p><button onClick={() => setPreviewRetry(n => n + 1)}>重新读取原件</button></div> : !preview ? <div className="award-preview-empty" role="status">正在加载奖状原件…</div> : opened.payload.mime === 'application/pdf' ? <object data={preview} type="application/pdf" aria-label="学生上传的奖状PDF"><a href={preview} target="_blank" rel="noreferrer">打开奖状 PDF</a></object> : <a href={preview} target="_blank" rel="noreferrer" aria-label="在新窗口查看奖状原图"><img src={preview} alt="学生上传的奖状原件"/></a>}<p>核对原件中的荣誉名称、地域、级别与所属学科。</p></div><div className="award-facts"><div className="award-facts-heading"><h3>获奖信息</h3><span className={`award-status ${opened.status === 'APPROVED' ? 'approved' : 'pending'}`}>{statusLabels[opened.status] || opened.status}</span></div><p>请依据原件核对，信息有误可在通过前修正。</p><fieldset disabled={busy || !canApprove(opened)}><div className="award-facts-grid">
                <label className="award-full-field">荣誉名称<span className="award-required"> *</span>
                  <input aria-label="荣誉名称" value={facts.title || ''} maxLength={250} onChange={e => setFacts({...facts,title:e.target.value})}/>
                </label>
                <label>荣誉地域<span className="award-required"> *</span>
                  <select aria-label="荣誉地域" value={facts.awardRegion || ''} onChange={e => setFacts({...facts,awardRegion:e.target.value})}>
                    <option value="">请选择地域</option>
                    {facts.awardRegion && !awardRegions.includes(facts.awardRegion) && <option value={facts.awardRegion} disabled>历史记录：{facts.awardRegion}</option>}
                    {awardRegions.map(region => <option key={region}>{region}</option>)}
                  </select>
                </label>
                <label>荣誉级别<span className="award-required"> *</span>
                  <select aria-label="荣誉级别" value={facts.awardLevel || ''} onChange={e => setFacts({...facts,awardLevel:e.target.value})}>
                    <option value="">请选择级别</option>{awardLevels.map(level => <option key={level}>{level}</option>)}
                  </select>
                </label>
                <label className="award-full-field">所属学科<span className="award-required"> *</span>
                  <select aria-label="所属学科" value={facts.subjectCode || ''} onChange={e => setFacts({...facts,subjectCode:e.target.value})}>
                    <option value="">请选择学科</option>{awardSubjects.map(([code,label]) => <option value={code} key={code}>{label}</option>)}
                  </select>
                </label>
              </div><label>评审备注 <small>选填</small><textarea aria-label="评审备注" rows={3} maxLength={1000} placeholder="如有需要，填写核验说明" value={reason} onChange={e => setReason(e.target.value)}/></label></fieldset>{canApprove(opened) && missing.length > 0 && <p className="award-validation" role="status">请补齐或核对：{missing.join('、')}</p>}{!canApprove(opened) && <p className="award-validation">{opened.status === 'APPROVED' ? '该奖状已通过评审。' : pendingStates.includes(opened.status) ? '可浏览奖状详情，请由有权限的教师完成评审。' : '该记录已处理，可浏览原件与获奖信息。'}</p>}{result?.failures.some(f => f.id === String(opened.id)) && <p className="award-validation" role="alert">{result.failures.find(f => f.id === String(opened.id)).message}</p>}</div></div><footer className="award-detail-footer"><small>通过后，该奖项将计入学生荣誉记录</small><div><button disabled={busy} onClick={() => setOpened(null)}>关闭详情</button>{canApprove(opened) && <button className="primary" disabled={busy || missing.length > 0} onClick={() => approve([opened], facts)}><UIIcon name="check"/>{busy ? '正在评审…' : '评审通过'}</button>}</div></footer></>}
    </dialog>
  </div>;
}
export { V2Reviews };
