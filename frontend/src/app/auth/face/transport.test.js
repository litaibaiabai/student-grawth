import { test } from "node:test";
import assert from "node:assert/strict";
import { faceApi } from "./transport.js";
async function withFetch(fetcher, fn) {
  const originalFetch = globalThis.fetch,
    storage = globalThis.localStorage;
  globalThis.fetch = fetcher;
  globalThis.localStorage = { getItem: () => null };
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
    if (storage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = storage;
  }
}
test("biometric transport rejects malformed successful responses with a friendly error", async () =>
  withFetch(
    async () => new Response("not-json", { status: 200 }),
    async () => {
      await assert.rejects(
        faceApi("/auth/face/login", { frames: ["sensitive-test-frame"] }),
        /服务|返回/,
      );
    },
  ));
test("biometric transport sends no retained idempotency key and propagates cancellation", async () => {
  let seen;
  await withFetch(
    async (_url, options) => {
      seen = options;
      return new Response(JSON.stringify({ data: { available: false } }));
    },
    async () => {
      await faceApi("/auth/face/login", { frames: ["test-only"] });
      assert.equal(JSON.parse(seen.body).requestKey, undefined);
      assert.equal(seen.cache, "no-store");
    },
  );
  const c = new AbortController();
  c.abort();
  await withFetch(
    async (_url, options) => {
      if (options.signal.aborted)
        throw new DOMException("Aborted", "AbortError");
    },
    async () => {
      await assert.rejects(
        faceApi("/auth/face/login", {}, undefined, c.signal),
        { name: "AbortError" },
      );
    },
  );
});
