import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../core/api';

// Shared module API intentionally includes this non-component export.
// eslint-disable-next-line react-refresh/only-export-components
export function useRun(ctx) {
  const [busy, setBusy] = useState(false);
  return [
    busy,
    async (fn) => {
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        ctx.error(e);
      } finally {
        setBusy(false);
      }
    },
  ];
}

export function V2Classics({ ctx }) {
  const [offset, setOffset] = useState(0),
    [rows, setRows] = useState([]),
    [reason, setReason] = useState(''),
    [author, setAuthor] = useState(ctx.actor.real_name || '同学'),
    [busy, run] = useRun(ctx);
  const { termId, refreshKey, error: onError } = ctx;
  const load = useCallback(
    () =>
      api(
        `/report-core/v2/classics/candidates?termId=${termId}&offset=${offset}`,
      )
        .then(setRows)
        .catch(onError),
    [termId, onError, offset],
  );
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  const act = (row, method) =>
    run(async () => {
      await api(`/report-core/v2/classics/${row.id}/${method}`, {
        expectedRevision: row.revision,
        reason,
        displayAuthor: author,
      });
      ctx.notify('展示状态已更新');
      await load();
    });
  return (
    <section className="panel">
      <h2>经典故事展示管理</h2>
      {ctx.actor.role === 'teacher' && (
        <label>
          内容审核意见
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      {ctx.actor.role === 'student' && (
        <label>
          校内展示署名
          <input
            aria-label="校内展示署名"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </label>
      )}
      {rows.map((row) => (
        <article className="source-row" key={row.id}>
          <details>
            <summary>
              {row.title} · {row.status} · {row.authorized ? '已授权' : '未授权'}
            </summary>
            <p className="story-text">{row.text_content}</p>
          </details>
          <div className="actions">
            {ctx.actor.role === 'teacher' && row.status === 'DRAFT' && (
              <button
                disabled={busy || !reason.trim()}
                onClick={() => act(row, 'review')}
              >
                内容审核通过
              </button>
            )}
            {ctx.actor.role === 'student' &&
              row.status === 'REVIEWED' &&
              !row.authorized && (
                <button
                  disabled={busy || !author.trim()}
                  onClick={() => act(row, 'authorize')}
                >
                  同意校内展示
                </button>
              )}
            {ctx.actor.role === 'manager' && row.status === 'REVIEWED' && (
              <button
                disabled={busy || !row.authorized}
                onClick={() => act(row, 'publish')}
              >
                发布到经典库及荣誉墙
              </button>
            )}
            {row.status !== 'WITHDRAWN' && (
              <button disabled={busy} onClick={() => act(row, 'withdraw')}>
                撤回展示
              </button>
            )}
          </div>
        </article>
      ))}
      {!rows.length && <p>暂无待处理的展示副本。</p>}
      <div className="actions">
        <button
          disabled={busy || offset === 0}
          onClick={() => setOffset((n) => Math.max(0, n - 100))}
        >
          上一页
        </button>
        <button
          disabled={busy || rows.length < 100}
          onClick={() => setOffset((n) => n + 100)}
        >
          下一页
        </button>
      </div>
      <p>展示授权可以撤回；原有合法成绩会保留。</p>
    </section>
  );
}
export default V2Classics;
