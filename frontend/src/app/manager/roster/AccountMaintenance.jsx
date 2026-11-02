import React, { useEffect, useState } from 'react';
import { api, resultOf } from '../../core/api';
import '../classes/adminClasses.css';
export default function AccountMaintenance({
  ctx,
  account,
  mode,
  onDone,
  onClose,
  onDirty
}) {
  const sessionError = ctx.error;
  const [reason, setReason] = useState(''),
    [password, setPassword] = useState(''),
    [target, setTarget] = useState(''),
    [classes, setClasses] = useState([]),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    onDirty(Boolean(reason || password || target));
  }, [reason, password, target, onDirty]);
  useEffect(() => {
    if (mode !== 'transfer') return;
    const c = new AbortController();
    (async () => {
      const rows = [];
      let cursor;
      do {
        const p = new URLSearchParams({
          termId: ctx.termId,
          limit: '100'
        });
        if (cursor) p.set('cursor', cursor);
        const r = await api('/admin/report-core/classes?' + p, undefined, undefined, {
          signal: c.signal
        });
        rows.push(...r.rows);
        cursor = r.nextCursor;
      } while (cursor);
      setClasses(rows);
    })().catch(e => {
      if (e.name !== 'AbortError' && !c.signal.aborted) { setError(e.message); if (e.status === 401) sessionError(e); }
    });
    return () => c.abort();
  }, [mode, ctx.termId, sessionError]);
  const run = async action => {
    setBusy(true);
    setError('');
    try {
      if (action === 'preview') setPreview(resultOf(await api('/admin/report-core/classes/transfers/preview', {
        termId: ctx.termId,
        studentIds: [account.id],
        targetClassId: target,
        reason
      })));else {
        if (action === 'transfer') await api(`/admin/report-core/classes/transfers/${preview.previewId}/commit`, {
          termId: ctx.termId,
          expectedRevision: preview.revision
        });else await api(`/admin/report-core/accounts/${account.id}/${action}`, {
          termId: ctx.termId,
          expectedTokenVersion: account.tokenVersion,
          reason,
          ...(action === 'password' ? {
            password
          } : {
            status: account.status === 0 ? 1 : 0
          })
        });
        setReason('');
        setPassword('');
        setTarget('');
        ctx.refresh();
        onDone(mode === 'transfer' ? '调班已保存' : '账号维护已保存');
      }
    } catch (e) {
      setPreview(null);
      setError(e.message);
      if (e.status === 401) ctx.error(e);
    } finally {
      setBusy(false);
    }
  };
  return <section className="admin-account-form"><div className="section-heading"><h3>{mode === 'transfer' ? '调班更正' : '账号维护'} · {account.name || account.realName}（{account.username}）</h3><button disabled={busy} onClick={() => {
        if (!(reason || password || target) || window.confirm('关闭会放弃当前输入，是否继续？')) onClose();
      }}>关闭维护</button></div><p>{mode === 'transfer' ? '调班后原始评价保留，班级排名重新计算，受影响学生的班主任确认需要重新核对。' : '停用或重置密码会立即使该账号已登录会话失效。'}</p><div className="admin-filterbar">{mode === 'transfer' && <label>目标班级<select aria-label="目标班级" value={target} disabled={busy} onChange={e => {
          setTarget(e.target.value);
          setPreview(null);
        }}><option value="">请选择目标班级</option>{classes.filter(c => c.grade !== account.grade || c.classNo !== account.classNo).map(c => <option value={c.id} key={c.id}>{c.displayName || `${c.grade}年级${c.classNo}班`}</option>)}</select></label>}<label>{mode === 'transfer' ? '调班原因' : '账号维护原因'}<input aria-label={mode === 'transfer' ? '调班原因' : '账号维护原因'} value={reason} disabled={busy} onChange={e => {
          setReason(e.target.value);
          setPreview(null);
        }} /></label>{mode !== 'transfer' && <label>新密码<input aria-label="新密码" type="password" autoComplete="new-password" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} placeholder="重置时填写，至少8位" /></label>}</div><div className="actions">{mode === 'transfer' ? <><button disabled={busy || !target || !reason.trim()} onClick={() => run('preview')}>预览调班影响</button><button className="primary" disabled={busy || !preview} onClick={() => run('transfer')}>确认调班</button></> : <><button disabled={busy || !reason.trim()} onClick={() => run('status')}>{account.status === 0 ? '停用账号' : '启用账号'}</button><button className="primary" disabled={busy || !reason.trim() || password.length < 8} onClick={() => run('password')}>重置密码</button></>}</div>{preview && <div className="feedback"><h4>请核对调班影响</h4>{preview.diffs.map(d => <p key={d.studentId}>学生 #{d.studentId}：{d.before.grade}年级{d.before.classNo}班 → {d.after.grade}年级{d.after.classNo}班</p>)}<p>影响 {preview.impact.studentCount} 名学生；原始评价保留，排名重算、班主任确认失效。</p></div>}{error && <p role="alert">{error}，输入已保留。若账号版本已改变，请重新打开维护。</p>}</section>;
}
