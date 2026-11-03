// Do not retain biometric frames in the generic API's idempotency-key cache.
export async function faceApi(path, body, method, signal) {
  const token = localStorage.getItem("REPORT_CORE_TOKEN"),
    controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 30000);
  try {
    const response = await fetch("/api/v1" + path, {
      method: method || (body ? "POST" : "GET"),
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch((e) => {
      if (e.name === "AbortError") throw e;
      throw Error("服务返回异常，请使用密码登录");
    });
    if (!response.ok)
      throw Object.assign(Error(data.message || "人脸验证失败"), {
        status: response.status,
      });
    return data.data;
  } catch (e) {
    if (timedOut) throw Error("网络验证超时，请重试或使用密码登录。");
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
