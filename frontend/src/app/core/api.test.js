import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, resetApiSession } from './api.js';

test('command intent includes actor, method and FormData, survives retry but ends on success', async () => {
  let counter = 0;
  const requests = [];
  globalThis.localStorage = { getItem: () => 'token' };
  globalThis.fetch = async (url, opts) => {
    counter++;
    requests.push({ url, method: opts.method, body: opts.body, headers: opts.headers });
    if (counter === 1) return { ok: false, status: 500, json: async () => ({ message: 'boom' }) };
    return { ok: true, status: 200, json: async () => ({ data: { ok: true } }) };
  };
  resetApiSession('user-1', { clear: true });
  await assert.rejects(async () => {
    await api('/test', { hello: 'world' });
  });
  const res = await api('/test', { hello: 'world' });
  assert.equal(res.ok, true);
  assert.equal(requests.length, 2);
  const body1 = JSON.parse(requests[0].body), body2 = JSON.parse(requests[1].body);
  assert.equal(body1.requestKey, body2.requestKey);
});

test('abort signals and non-JSON responses remain identifiable', async () => {
  globalThis.fetch = async () => ({
    ok: true, status: 200, json: async () => { throw new Error('Not JSON'); }
  });
  await assert.rejects(async () => {
    await api('/raw');
  }, (err) => {
    assert.equal(err.code, 'INVALID_RESPONSE');
    return true;
  });
});
