import { useEffect, useState } from 'react';
import { api } from '../../core/api';
export { useDraftGuard } from '../../core/ui';

export const healthFields = [
  ['height_cm', '身高', 'cm'],
  ['weight_kg', '体重', 'kg'],
  ['vision_left', '左视力', ''],
  ['vision_right', '右视力', ''],
  ['jump_rope_1min', '1分钟跳绳', '次'],
];

export async function writeTemplate(rows, name) {
  const XLSX = await import('xlsx');
  const b = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(b, XLSX.utils.json_to_sheet(rows), '填写数据');
  XLSX.writeFile(b, name + '.xlsx');
}

export async function readRows(file) {
  const XLSX = await import('xlsx');
  const bytes = await file.arrayBuffer();
  let b;
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    let csv;
    try {
      csv = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('CSV文件需使用UTF-8编码，请转换编码后重新上传。');
    }
    b = XLSX.read(csv, { type: 'string', raw: true });
  } else b = XLSX.read(bytes);
  return XLSX.utils.sheet_to_json(b.Sheets[b.SheetNames[0]], {
    defval: '',
    raw: false,
  });
}

export function useAdminRows(ctx, path, filters) {
  const { termId, refreshKey, error: onError } = ctx;
  const [state, setState] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [paging, setPaging] = useState(null);
  const key = JSON.stringify(filters),
    cursor = paging?.key === key ? paging.cursor : null;
  useEffect(() => {
    const c = new AbortController(),
      p = new URLSearchParams({ termId: termId, limit: '25', ...JSON.parse(key) });
    if (cursor) p.set('cursor', cursor);
    setBusy(true);
    setState(null);
    setError('');
    api('/admin/report-core/' + path + '?' + p, undefined, undefined, {
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted) setState(r);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          onError(e);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [termId, path, key, cursor, refreshKey, onError]);
  return {
    state,
    error,
    busy,
    next: () => setPaging({ key, cursor: state.nextCursor }),
    first: () => setPaging(null),
    cursor,
  };
}
