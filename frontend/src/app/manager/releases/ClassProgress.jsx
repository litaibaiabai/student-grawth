import React, { useEffect, useState } from 'react';
import { api, download } from '../../core/api';
import '../classes/adminClasses.css';
export default function ClassProgress({
  ctx
}) {
  const {
    termId,
    refreshKey,
    error: onError
  } = ctx;
  const [data, setData] = useState(null),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError('');
    api(`/admin/report-core/progress?termId=${termId}`, undefined, undefined, {
      signal: c.signal
    }).then(r => {
      if (!c.signal.aborted) setData(r);
    }).catch(e => {
      if (e.name !== 'AbortError') {
        setError(e.message);
        if (e.status === 401) onError(e);
      }
    });
    return () => c.abort();
  }, [termId, refreshKey, retry, onError]);
  const name = c => c.displayName || `${c.grade}年级${c.classNo}班`,
    current = data?.classes.find(c => `${c.grade}:${c.classNo}` === selected);
  const missing = data?.missing.filter(s => !selected || `${s.grade}:${s.classNo}` === selected) || [];
  const fieldLabel = k => ctx.catalog.fields.find(f => f.column === k)?.label || {
    teacher_comment: '班主任寄语',
    confirmation: '班主任确认',
    materials: '待处理材料'
  }[k] || k;
  return <section className="panel"><div className="section-heading"><div><h2>按班级核对缺项</h2><p>管理员核对完整性，报告内容由班主任审核确认。</p></div><button disabled={!data} onClick={async () => {
        try {
          await download('/admin/report-core/progress/export?' + new URLSearchParams({
            termId,
            ...(current ? {
              grade: String(current.grade),
              classNo: String(current.classNo)
            } : {})
          }), 'completion-progress.csv');
        } catch (e) {
          setError(e.message);
        }
      }}>导出完整性清单</button></div>{error && <p role="alert">{error}<button onClick={() => setRetry(n => n + 1)}>重新读取完整性</button></p>}{!data && !error && <p role="status">正在读取班级完整性…</p>}{data && <><p>全校 {data.counts.students} 人 · 数据齐全 {data.counts.complete} 人 · 班主任已确认 {data.counts.confirmed} 人 · 可发布 {data.counts.ready} 人</p><nav className="admin-progress-class-list" aria-label="发布班级筛选"><button aria-pressed={!selected} onClick={() => setSelected('')}>全部班级</button>{data.classes.map(c => <button key={`${c.grade}:${c.classNo}`} aria-label={`核对${name(c)}`} aria-pressed={selected === `${c.grade}:${c.classNo}`} onClick={() => setSelected(`${c.grade}:${c.classNo}`)}>{name(c)}<small>{c.counts.students}人 · 缺项 {c.counts.incomplete} · 已确认 {c.counts.confirmed}</small></button>)}</nav><div className="table-scroll admin-progress-missing"><table><thead><tr><th>学生 / 班级</th><th>待补充项目</th><th>协作入口</th></tr></thead><tbody>{missing.map(s => <tr key={s.studentId}><td>{s.name}<small>{s.grade}年级{s.classNo}班</small></td><td><details><summary>查看 {s.fields.length} 项缺项</summary><div className="admin-progress-field-list">{s.fields.map((f, i) => <p key={i}>{fieldLabel(f.field)} · {f.reason}</p>)}</div></details></td><td><button onClick={() => ctx.navigate('classes')}>核对教师配置</button></td></tr>)}</tbody></table></div>{!missing.length && <p className="admin-empty">{data.counts.students === 0 ? '本学期尚无学生，请先导入班级与学籍。' : current && !current.counts.students ? '这个班级暂无学生。' : '当前范围没有数据缺项，请继续核对班主任确认。'}</p>}</>}</section>;
}
