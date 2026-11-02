import React, { useEffect, useState } from 'react';
import { api, resultOf } from '../../core/api';
import '../classes/adminClasses.css';
export default function NewTerm({
  ctx,
  source,
  onDirty
}) {
  const year = source.semester === 1 ? source.academicYear : source.academicYear.replace(/\d{4}/g, n => String(Number(n) + 1));
  const [draft, setDraft] = useState({
      academicYear: year,
      semester: source.semester === 1 ? '2' : '1',
      termName: '',
      startDate: '',
      endDate: '',
      collectionDeadline: '',
      makeCurrent: false
    }),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [created, setCreated] = useState(null);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const change = (k, v) => {
    setDraft({
      ...draft,
      [k]: v
    });
    setDirty(true);
    setCreated(null);
  };
  const makeCurrent = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/report-core/terms/${ctx.termId}/current`, {});
      await ctx.reloadTerms();
      ctx.refresh();
      ctx.notify('当前学期已切换');
    } catch (e) {
      setError(e.message);
      if (e.status === 401) ctx.error(e);
    } finally {
      setBusy(false);
    }
  };
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = resultOf(await api('/admin/report-core/terms/create', {
        sourceTermId: ctx.termId,
        ...draft,
        semester: Number(draft.semester)
      }));
      setCreated(r.term);
      setDirty(false);
      await ctx.reloadTerms();
      ctx.refresh();
    } catch (e) {
      setError(e.message);
      if (e.status === 401) ctx.error(e);
    } finally {
      setBusy(false);
    }
  };
  return <section className="panel admin-new-term"><div className="section-heading"><div><h2>开启下一学期</h2><p>创建空白六育 V2 学期。默认月额度 100；班级、教师职责、学籍和评价须在新学期重新导入。</p></div></div>{!source.isCurrent && <div className="actions"><p>当前选中的学期尚未设为全校当前学期。</p><button disabled={busy} onClick={makeCurrent}>设为当前学期</button></div>}<form onSubmit={submit}><fieldset disabled={busy} style={{
        border: 0,
        padding: 0,
        minWidth: 0
      }}><div className="admin-new-term-fields">{[['academicYear', '新学年', 'text'], ['termName', '新学期名称', 'text'], ['startDate', '新学期开始日期', 'date'], ['endDate', '新学期结束日期', 'date'], ['collectionDeadline', '新学期采集截止日期', 'date']].map(([key, label, type]) => <label key={key}>{label}<input aria-label={label} type={type} required value={draft[key]} onChange={e => change(key, e.target.value)} /></label>)}<label>新学期序号<select aria-label="新学期序号" value={draft.semester} onChange={e => change('semester', e.target.value)}><option value="1">第一学期</option><option value="2">第二学期</option></select></label></div><div className="actions"><label><input type="checkbox" checked={draft.makeCurrent} onChange={e => change('makeCurrent', e.target.checked)} /> 创建后设为当前学期</label><button className="primary" type="submit">{busy ? '正在创建…' : '创建空白新学期'}</button></div></fieldset></form>{error && <p role="alert">{error}，输入已保留。</p>}{created && <p role="status" className="feedback success">新学期已创建：{created.name}，班级与评价为空。可在顶部学期列表切换查看。</p>}</section>;
}
