import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, resetApiSession } from './api.js';
globalThis.localStorage = { getItem: () => 'token' };
test('command intent includes actor, method and FormData, survives retry but ends on success', async () => {
  resetApiSession('2'); const keys = []; let fail = true;
  globalThis.fetch = async (url, options) => {
    keys.push(options.body instanceof FormData ? options.body.get('requestKey') : JSON.parse(options.body).requestKey);
    return { ok: !fail, status: fail ? 409 : 200, json: async () => ({ message: '版本已变化', details: { field: 'revision' }, data: {} }) };
  };
  const form = new FormData(); form.set('termId', '1'); form.set('file', new Blob(['文本']), 'a.txt');
  await assert.rejects(api('/upload', form), e => e.status === 409 && e.details.field === 'revision');
  fail = false; await api('/upload', form); assert.equal(keys[0], keys[1]);
  await api('/upload', form); assert.notEqual(keys[1], keys[2]);
  fail = true; await assert.rejects(api('/x', { termId: '1' }, 'PATCH'));
  await assert.rejects(api('/x', { termId: '1' }, 'POST')); assert.notEqual(keys[3], keys[4]);
  resetApiSession('3'); await assert.rejects(api('/x', { termId: '1' }, 'POST')); assert.notEqual(keys[4], keys[5]);
});
test('abort signals and non-JSON responses remain identifiable', async () => {
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => { assert.equal(options.signal, controller.signal); return { ok:false, status:502, json:async () => { throw Error('html'); } }; };
  await assert.rejects(api('/read', undefined, undefined, { signal:controller.signal }), e => e.status === 502 && e.code === 'INVALID_RESPONSE');
});
