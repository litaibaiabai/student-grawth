import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../core/api';
import { useRun } from '../../shared/classics/V2Classics';

export default function V2Administration({ ctx }) {
  const [state, setState] = useState(null),
    [reason, setReason] = useState(''),
    [busy, run] = useRun(ctx);
  const { termId, refreshKey, error: onError } = ctx;
  const load = useCallback(
    () =>
      api(`/report-core/term-state?termId=${termId}`)
        .then(setState)
        .catch(onError),
    [termId, onError],
  );
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  return (
    <>
      <section className="panel">
        <h2>学期阶段</h2>
        <p>
          当前阶段：{({COLLECTING:'采集中',RECONCILING:'核对与更正',FROZEN:'已冻结',ARCHIVED:'已归档'})[state?.phase] || '读取中'}
          。进入核对阶段后检查完整性与班主任确认，再准备全校报告；统一发布后冻结本学期。
        </p>
        <label>
          阶段调整原因
          <input
            aria-label="阶段调整原因"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="actions">
          {(state?.phase === 'COLLECTING'
            ? ['RECONCILING']
            : state?.phase === 'FROZEN'
              ? ['RECONCILING', 'ARCHIVED']
              : []
          ).map((phase) => (
            <button
              key={phase}
              disabled={busy || !reason.trim()}
              onClick={() =>
                run(async () => {
                  await api('/admin/report-core/phase', {
                    termId,
                    phase,
                    reason,
                    expectedDataRevision: state.dataRevision,
                  });
                  await load();
                  ctx.refresh();
                  ctx.notify('学期阶段已调整');
                })
              }
            >
              {phase === 'RECONCILING' ? '进入核对与更正' : '归档学期'}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
export { V2Administration };
