const pending = new Map();
export async function api(path, body, method) {
  const token = localStorage.getItem("REPORT_CORE_TOKEN");
  let requestBody = body;
  const key = path + JSON.stringify(body);
  if (body && !(body instanceof FormData)) {
    if (!pending.has(key)) pending.set(key, crypto.randomUUID());
    requestBody = { ...body, requestKey: pending.get(key) };
  }
  const response = await fetch("/api/v1" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(requestBody)
      : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.message || "请求失败"), {
      status: response.status,
    });
  pending.delete(key);
  return result.data;
}
export async function download(path, name) {
  const r = await fetch("/api/v1" + path, {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("REPORT_CORE_TOKEN"),
    },
  });
  if (!r.ok) {
    const e = await r.json();
    throw Error(e.message);
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

export async function allStudents(termId) {
  let rows = [],
    offset = 0;
  for (;;) {
    const page = await api(
      `/report-core/students?termId=${termId}&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < 100) return rows;
    offset += 100;
    if (offset > 100000) throw Error("学生名单过大，请按学校分开部署");
  }
}
