import React, { useState } from 'react';
import { download } from '../../core/api';
import { useAdminRows } from '../roster/adminData';
import { Pager } from '../roster/AdminDataImport';
import '../classes/adminClasses.css';
import auditLabels from '../../../../../backend/config/reportCoreAuditLabels.json';
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
          }), '操作记录.csv');
        } catch (e) {
          setError(e.message);
          if (e.status === 401) ctx.error(e);
        }
      }}>导出操作记录</button></div><form className="admin-filterbar admin-audit-filters" onSubmit={e => {
      e.preventDefault();
      view.first();
      setFilters(draft);
    }}>{[['q', '操作或人员', 'text'], ['from', '开始日期', 'date'], ['to', '结束日期', 'date']].map(([key, label, type]) => <label key={key}>{label}<input aria-label={label} type={type} value={draft[key]} onChange={e => setDraft({
          ...draft,
          [key]: e.target.value
        })} /></label>)}<label>操作类型<select aria-label="操作类型" value={draft.type} onChange={e => setDraft({...draft, type:e.target.value})}><option value="">全部操作</option>{Object.entries(auditLabels.actions).map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select></label><button>查询记录</button></form>{(error || view.error) && <p role="alert">{error || view.error}</p>}<div className="table-scroll"><table><thead><tr><th>操作 / 时间</th><th>操作人</th><th>结果</th><th>实际差异与影响</th></tr></thead><tbody>{view.state?.rows.map(r => <tr key={r.id}><td>{r.display.type}<small title="操作代码">{r.type}</small><small>{new Date(r.createdAt).toLocaleString('zh-CN')}</small></td><td>{r.actorName || '系统'}<small>#{r.actorId || '—'}</small></td><td><span title={r.status}>{r.display.status}</span></td><td className="admin-audit-diff">{r.display.diffs.map((text, i) => <p key={i}>{text}</p>)}{r.display.metadata.map((text, i) => <p key={i}>{text}</p>)}{!r.diffs.length && !Object.keys(r.metadata).length && <small>已记录操作结果</small>}</td></tr>)}</tbody></table></div>{view.state && !view.state.rows.length && <p className="admin-empty">当前范围没有操作记录。</p>}<Pager view={view} /></section>;
}
