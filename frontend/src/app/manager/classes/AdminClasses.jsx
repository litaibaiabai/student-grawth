import React, { useEffect, useRef, useState } from 'react';
import { api, resultOf } from '../../core/api';
import { readRows, writeTemplate, useAdminRows, useDraftGuard } from '../roster/adminData';
import { Pager } from '../roster/AdminDataImport';
import './adminClasses.css';
const subjects = {
  MORAL: '道德与法治',
  CHINESE: '语文',
  MATH: '数学',
  SCIENCE: '科学',
  ENGLISH: '英语',
  PE: '体育与健康',
  MUSIC: '音乐',
  FINE_ART: '美术',
  INFORMATION_TECHNOLOGY: '信息科技',
  LABOR: '劳动',
  INTEGRATED_PRACTICE: '综合实践活动',
  LOCAL_COURSE: '地方课程',
  STORY: '故事'
};
const className = c => c.displayName || `${c.grade}年级${c.classNo}班`;
export default function AdminClasses({
  ctx
}) {
  const [q, setQ] = useState(''),
    [filters, setFilters] = useState({}),
    [rows, setRows] = useState([]),
    [preview, setPreview] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(null),
    [teacherDirty, setTeacherDirty] = useState(false);
  const view = useAdminRows(ctx, 'classes', filters),
    version = useRef(0);
  useDraftGuard(ctx, rows.length > 0 || busy || teacherDirty);
  const load = async file => {
    const v = ++version.current;
    setBusy(true);
    setRows([]);
    setPreview(null);
    setError('');
    try {
      const raw = await readRows(file);
      const known = ['年级', '班级', '班级名称', '班主任账号', 'grade', 'classNo', 'displayName', 'responsibleTeacherUsername'];
      const unknown = Object.keys(raw[0] || {}).filter(k => !known.includes(k));
      if (unknown.length) throw Error('未识别列：' + unknown.join('、'));
      if (!raw.length || raw.length > 500) throw Error('请上传1–500行班级');
      if (v === version.current) setRows(raw.map(r => ({
        grade: Number(r['年级'] || r.grade),
        classNo: Number(r['班级'] || r.classNo),
        displayName: r['班级名称'] || r.displayName || '',
        responsibleTeacherUsername: r['班主任账号'] || r.responsibleTeacherUsername || ''
      })));
    } catch (e) {
      setError(e.message);
    } finally {
      if (v === version.current) setBusy(false);
    }
  };
  const submit = async commit => {
    setBusy(true);
    setError('');
    try {
      if (commit) {
        await api(`/admin/report-core/classes/imports/${preview.previewId}/commit`, {
          termId: ctx.termId,
          expectedRevision: preview.revision
        });
        setRows([]);
        setPreview(null);
        ctx.refresh();
        ctx.notify('班级导入已完成');
      } else setPreview(resultOf(await api('/admin/report-core/classes/imports/preview', {
        termId: ctx.termId,
        rows
      })));
    } catch (e) {
      setPreview(null);
      setError(e.details?.errors?.map(r => `第${r.rowNo}行：${r.reason}`).join('；') || e.message);
      if (e.status === 401) ctx.error(e);
    } finally {
      setBusy(false);
    }
  };
  return <><section className="panel admin-classes"><div className="section-heading"><div><h2>本学期班级</h2><p>通过模板导入班级，再配置负责教师与实际任课教师。</p></div><button onClick={() => writeTemplate([{
          年级: '',
          班级: '',
          班级名称: '',
          班主任账号: ''
        }], '班级导入模板')}>下载班级模板</button></div><form className="admin-filterbar" onSubmit={e => {
        e.preventDefault();
        setFilters({
          q
        });
      }}><label>查找班级<input aria-label="查找班级" value={q} onChange={e => setQ(e.target.value)} placeholder="班级名称或年级" /></label><button>查询班级</button></form>{view.error && <p role="alert">{view.error}</p>}<div className="admin-class-grid">{view.state?.rows.map(c => <button className="admin-class-card" aria-label={`查看${className(c)}`} key={c.id} onClick={() => {
          if (selected === c.id) return;
          if (!teacherDirty || window.confirm('切换班级会放弃未保存的教师配置，是否继续？')) {
            setSelected(c.id);
            setTeacherDirty(false);
          }
        }}><strong>{className(c)}</strong><span>负责教师 · {c.responsibleTeacherName || '待配置'}</span><small>{c.studentCount} 名学生 <b aria-hidden="true">↗</b></small></button>)}</div>{view.state && !view.state.rows.length && <p className="admin-empty">本学期还没有班级，请先导入班级模板。</p>}<Pager view={view} /></section><section className="panel"><h2>批量导入班级</h2><p>相同班级可重新导入更正班名，内容相同则跳过；教师职责请在班级详情中维护。</p><label className="upload-zone">选择班级模板<input aria-label="班级导入文件" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={e => {
          if (e.target.files?.[0]) load(e.target.files[0]);
          e.target.value = '';
        }} /><small>年级、班级必填；支持空班级，班主任账号可留空。</small></label><div className="actions"><button disabled={busy || !rows.length} onClick={() => submit(false)}>预览班级导入</button><button className="primary" disabled={busy || !preview?.previewId || preview.errors?.length > 0} onClick={() => submit(true)}>确认班级导入</button><small>{rows.length} 行</small></div>{preview && <div><h3>班级导入差异</h3><p>新增 {preview.counts?.created || 0} · 更新 {preview.counts?.updated || 0} · 跳过 {preview.counts?.skipped || 0}</p>{preview.diffs?.map((d, i) => <p key={i}>第{d.rowNo || i + 1}行 · {className(d.after || {})} · {d.action === 'NEW' ? '新增' : d.action === 'UPDATE' ? `班名更正：${d.before?.displayName || '默认班名'} → ${d.after?.displayName || '默认班名'}` : '跳过'}</p>)}{preview.errors?.map((e, i) => <p role="alert" key={i}>第{e.rowNo}行：{e.reason}</p>)}</div>}{error && <p role="alert">{error}，输入已保留，请修正后重新预览。</p>}</section>{selected && <ClassDetail key={`${ctx.termId}:${selected}`} ctx={ctx} id={selected} onDirty={setTeacherDirty} onClose={() => {
      setSelected(null);
      setTeacherDirty(false);
    }} />}</>;
}
function ClassDetail({
  ctx,
  id,
  onClose,
  onDirty
}) {
  const sessionError = ctx.error;
  const panel = useRef(null);
  const [detail, setDetail] = useState(null),
    [tab, setTab] = useState('students'),
    [teachers, setTeachers] = useState([]),
    [head, setHead] = useState(''),
    [assignments, setAssignments] = useState({}),
    [preview, setPreview] = useState(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState('');
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    panel.current?.scrollIntoView({
      block: 'start',
      behavior: 'smooth'
    });
  }, []);
  useEffect(() => {
    const c = new AbortController();
    Promise.all([api(`/admin/report-core/classes/${id}?termId=${ctx.termId}`, undefined, undefined, {
      signal: c.signal
    }), (async () => {
      const rows = [];
      let cursor;
      do {
        const p = new URLSearchParams({
          limit: '100'
        });
        if (cursor) p.set('cursor', cursor);
        const r = await api('/report-core/teachers?' + p, undefined, undefined, {
          signal: c.signal
        });
        rows.push(...r.rows);
        cursor = r.nextCursor;
      } while (cursor);
      return rows;
    })()]).then(([d, t]) => {
      setDetail(d);
      setHead(d.class.responsibleTeacherId || '');
      setAssignments(Object.fromEntries(d.assignments.map(a => [a.subjectCode, a.teacherId])));
      setTeachers(t);
    }).catch(e => {
      if (e.name !== 'AbortError' && !c.signal.aborted) { setError(e.message); if (e.status === 401) sessionError(e); }
    });
    return () => c.abort();
  }, [id, ctx.termId, sessionError]);
  const change = (setter, value) => {
    setter(value);
    setDirty(true);
    setPreview(null);
    setSaved('');
  };
  const run = async commit => {
    setBusy(true);
    setError('');
    try {
      if (commit) {
        await api(`/admin/report-core/classes/${id}/teachers/previews/${preview.previewId}/commit`, {
          termId: ctx.termId,
          expectedRevision: preview.revision
        });
        const d = await api(`/admin/report-core/classes/${id}?termId=${ctx.termId}`);
        setDetail(d);
        setDirty(false);
        setPreview(null);
        setSaved('教师配置已保存');
        ctx.refresh();
      } else setPreview(resultOf(await api(`/admin/report-core/classes/${id}/teachers/preview`, {
        termId: ctx.termId,
        expectedRevision: detail.class.revision,
        responsibleTeacherId: head || null,
        assignments: Object.entries(assignments).filter(([, v]) => v).map(([subjectCode, teacherId]) => ({
          subjectCode,
          teacherId
        }))
      })));
    } catch (e) {
      setPreview(null);
      setError(e.message);
      if (e.status === 401) ctx.error(e);
    } finally {
      setBusy(false);
    }
  };
  const options = <><option value="">暂不配置</option>{teachers.filter(t => t.status !== 1).map(t => <option value={t.id} key={t.id}>{t.realName || t.name} · {t.username}</option>)}</>;
  return <section ref={panel} className="panel admin-class-detail" aria-label="班级详情"><div className="section-heading"><h2>{detail ? className(detail.class) : '正在读取班级…'}</h2><button disabled={busy} onClick={() => {
        if (!dirty || window.confirm('关闭会放弃未保存的教师配置，是否继续？')) onClose();
      }}>关闭班级详情</button></div><nav className="evaluation-tabs" aria-label="班级详情分类"><button className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>学生名单</button><button className={tab === 'teachers' ? 'active' : ''} onClick={() => setTab('teachers')}>教师配置</button></nav>{error && <p role="alert">{error}，草稿已保留。<button disabled={busy} onClick={async () => {
        try {
          setDetail(await api(`/admin/report-core/classes/${id}?termId=${ctx.termId}`));
          setPreview(null);
          setError('');
        } catch (e) {
          setError(e.message);
          if (e.status === 401) ctx.error(e);
        }
      }}>刷新班级版本，保留配置</button></p>}{saved && <p role="status" className="feedback success">{saved}</p>}{detail && tab === 'students' && <div className="table-scroll"><table><thead><tr><th>学生</th><th>学生标识</th></tr></thead><tbody>{detail.students.map(s => <tr key={s.studentId}><td>{s.name}</td><td>{s.studentId}</td></tr>)}</tbody></table>{!detail.students.length && <p>这个班级尚未导入学生。</p>}</div>}{detail && tab === 'teachers' && <><p>负责教师承担班主任报告审核；任课关系决定学科采集权限与月度卡，不会自动分配全部学科。</p><fieldset disabled={busy} className="admin-teacher-grid"><label className="admin-head-select">负责教师<select aria-label="负责教师" value={head} onChange={e => change(setHead, e.target.value)}>{options}</select></label>{Object.entries(subjects).map(([code, name]) => <label key={code}>{name}<select aria-label={`${name}任课教师`} value={assignments[code] || ''} onChange={e => change(setAssignments, {
            ...assignments,
            [code]: e.target.value
          })}>{options}</select></label>)}</fieldset><div className="actions"><button disabled={busy || !dirty} onClick={() => run(false)}>预览教师配置</button><button className="primary" disabled={busy || !preview} onClick={() => run(true)}>确认教师配置</button></div>{preview && <div className="feedback"><h3>核对教师配置影响</h3><p>影响 {preview.impact?.studentCount || 0} 名学生；原始记录保留，权限与确认状态重新核对。</p>{preview.diffs?.map((d, i) => <div key={i}><p>负责教师：{teachers.find(t => t.id === d.before.responsibleTeacherId)?.realName || '未配置'} → {teachers.find(t => t.id === d.after.responsibleTeacherId)?.realName || '未配置'}</p><p>任课配置：{d.before.assignments.map(a => `${subjects[a.subjectCode] || a.subjectCode} · ${a.teacherName || teachers.find(t => t.id === a.teacherId)?.realName || a.teacherId}`).join('；') || '无'} → {d.after.assignments.map(a => `${subjects[a.subjectCode] || a.subjectCode} · ${teachers.find(t => t.id === a.teacherId)?.realName || a.teacherId}`).join('；') || '无'}</p></div>)}</div>}</>}</section>;
}
