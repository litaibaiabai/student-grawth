import React, { useState } from 'react';
import { download } from '../../core/api';
import { useAdminRows } from '../roster/adminData';
import { Pager } from '../roster/AdminDataImport';
import '../classes/adminClasses.css';
const labels = {
  classCreated: '新增班级',
  responsibleTeacherId: '负责教师',
  assignment: '任课关系',
  grade: '年级',
  classNo: '班级',
  status: '账号状态',
  tokenVersion: '登录版本',
  passwordChanged: '密码已重置'
};
const value = v => v === null ? '空' : v === true ? '是' : v === false ? '否' : String(v ?? '—');
export default function AdminAudit({
  ctx
}) {
  const [draft, setDraft] = useState({
      q: '',
      type: '',
      from: '',
      to: ''
    }),
    [filters, setFilters] = useState({}),
    [error, setError] = useState('');
  const view = useAdminRows(ctx, 'audits', filters);
  return <section className="panel"><div className="section-heading"><div><h2>操作记录</h2><p>查看本学期操作与安全差异。学生自述、故事正文及密码不在记录中展示。</p></div><button onClick={async () => {
        try {
          await download('/admin/report-core/audits/export?' + new URLSearchParams({
            termId: ctx.termId,
            ...filters
          }), 'operation-audits.csv');
        } catch (e) {
          setError(e.message);
          if (e.status === 401) ctx.error(e);
        }
      }}>导出操作记录</button></div><form className="admin-filterbar admin-audit-filters" onSubmit={e => {
      e.preventDefault();
      view.first();
      setFilters(draft);
    }}>{[['q', '操作或人员', 'text'], ['type', '操作类型', 'text'], ['from', '开始日期', 'date'], ['to', '结束日期', 'date']].map(([key, label, type]) => <label key={key}>{label}<input aria-label={label} type={type} value={draft[key]} onChange={e => setDraft({
          ...draft,
          [key]: e.target.value
        })} /></label>)}<button>查询记录</button></form>{(error || view.error) && <p role="alert">{error || view.error}</p>}<div className="table-scroll"><table><thead><tr><th>操作 / 时间</th><th>操作人</th><th>结果</th><th>实际差异与影响</th></tr></thead><tbody>{view.state?.rows.map(r => <tr key={r.id}><td>{r.type}<small>{new Date(r.createdAt).toLocaleString('zh-CN')}</small></td><td>{r.actorName || '系统'}<small>#{r.actorId || '—'}</small></td><td>{r.status}</td><td className="admin-audit-diff">{r.diffs.map((d, i) => <p key={i}>{d.studentId && `学生 #${d.studentId} · `}{d.classId && `班级 #${d.classId} · `}{d.subjectCode && `${d.subjectCode} · `}{labels[d.field] || d.field}：{value(d.before)} → {value(d.after)}</p>)}{Object.entries(r.metadata).map(([k, v]) => <p key={k}>{{
                  studentCount: '影响学生',
                  confirmationsInvalidated: '确认已失效',
                  rankingsRebuilt: '排名已重算',
                  permissionsChanged: '权限变更',
                  created: '新增',
                  updated: '更新',
                  skipped: '跳过',
                  classId: '班级标识',
                  targetClassId: '目标班级',
                  grade: '年级',
                  classNo: '班级'
                }[k] || k}：{value(v)}</p>)}{!r.diffs.length && !Object.keys(r.metadata).length && <small>已记录操作结果</small>}</td></tr>)}</tbody></table></div>{view.state && !view.state.rows.length && <p className="admin-empty">当前范围没有操作记录。</p>}<Pager view={view} /></section>;
}
