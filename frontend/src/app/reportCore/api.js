const pending = new Map();
let actorScope = 'anonymous';
export function resetApiSession(actorId = 'anonymous', { clear = false } = {}) {
  if (clear || actorScope !== String(actorId)) pending.clear();
  actorScope = String(actorId);
}
async function intentKey(path, body, method) {
  let payload = body;
  if (body instanceof FormData) {
    payload = await Promise.all([...body.entries()].filter(([key]) => key !== 'requestKey').map(async ([key, value]) => [key, value instanceof Blob ? { name: value.name, type: value.type, bytes: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await value.arrayBuffer()))) } : value]));
  }
  return JSON.stringify([actorScope, method, path, payload]);
}
export async function api(path, body, method, options = {}) {
  const token = localStorage.getItem("REPORT_CORE_TOKEN");
  const verb = method || (body ? 'POST' : 'GET');
  const key = await intentKey(path, body, verb);
  let requestBody = body;
  if (body) {
    if (!pending.has(key)) pending.set(key, crypto.randomUUID());
    if (body instanceof FormData) {
      requestBody = new FormData();
      for (const [name, value] of body.entries()) if (name !== 'requestKey') requestBody.append(name, value);
      requestBody.set('requestKey', pending.get(key));
    } else requestBody = { ...body, requestKey: pending.get(key) };
  }
  const response = await fetch('/api/v1' + path, {
    method: verb, signal: options.signal,
    headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? body instanceof FormData ? requestBody : JSON.stringify(requestBody) : undefined,
  });
  let result;
  try { result = await response.json(); } catch { throw Object.assign(new Error('服务器返回格式异常，请稍后重试'), { status: response.status, code: 'INVALID_RESPONSE' }); }
  if (!response.ok) throw Object.assign(new Error(result.message || '请求失败'), { status: response.status, details: result.details || result.error?.details, code: result.code });
  pending.delete(key);
  return result.data;
}
export async function download(path, name, options = {}) {
  const r = await fetch("/api/v1" + path, {
    signal: options.signal,
    headers: {
      Authorization: "Bearer " + localStorage.getItem("REPORT_CORE_TOKEN"),
    },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ message: "下载失败" }));
    throw Object.assign(new Error(e.message), { status: r.status, code: e.code, details: e.details });
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export const resultOf = (r) => r?.result || r;

export async function allStudents(termId, options = {}) {
  let rows = [],
    offset = 0;
  for (;;) {
    const page = await api(
      `/report-core/students?termId=${termId}&offset=${offset}`, undefined, undefined, options,
    );
    rows.push(...page);
    if (page.length < 100) return rows;
    offset += 100;
    if (offset > 100000) throw Error("学生名单过大，请按学校分开部署");
  }
}
