const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const {
  sealTemplate,
  openTemplate,
  readKeys,
} = require("../services/faceAuth/crypto");
const keys = { active: "v1", values: { v1: crypto.randomBytes(32) } },
  scope = { schoolId: "1", userId: "4", version: 1 },
  value = {
    modelVersion: "sface-2021dec",
    descriptor: Array(128).fill(1 / Math.sqrt(128)),
  };
test("face templates use randomized authenticated encryption and never contain raw features", () => {
  const a = sealTemplate(value, scope, keys),
    b = sealTemplate(value, scope, keys);
  assert.notEqual(a, b);
  assert.deepEqual(openTemplate(a, scope, keys), value);
  assert.ok(!a.includes("descriptor"));
});
test("template ciphertext is bound to account, school and credential version", () => {
  const a = sealTemplate(value, scope, keys);
  for (const other of [
    { ...scope, userId: "5" },
    { ...scope, schoolId: "2" },
    { ...scope, version: 2 },
  ])
    assert.throws(() => openTemplate(a, other, keys));
  const bad = JSON.parse(a);
  bad.tag = Buffer.alloc(16).toString("base64");
  assert.throws(() => openTemplate(JSON.stringify(bad), scope, keys));
});
test("missing or malformed face keys never fall back to the JWT secret", () => {
  assert.throws(() => readKeys({ JWT_SECRET: "x" }));
  assert.throws(() =>
    readKeys({ FACE_AUTH_KEY_ID: "v1", FACE_AUTH_KEYS: '{"v1":"short"}' }),
  );
});
