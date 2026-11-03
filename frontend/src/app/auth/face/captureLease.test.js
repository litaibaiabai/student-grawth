import { test } from "node:test";
import assert from "node:assert/strict";
import { createCaptureLease } from "./captureLease.js";
test("capture deadline stops opened tracks while model loading is still pending", async () => {
  let stops = 0,
    closed = 0,
    expired = 0;
  const lease = createCaptureLease(15, () => expired++);
  lease.useStream({ getTracks: () => [{ stop: () => stops++ }] });
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(stops, 1);
  assert.equal(expired, 1);
  assert.equal(lease.useModel({ close: () => closed++ }), false);
  assert.equal(closed, 1);
  lease.close();
  assert.equal(stops, 1);
});
test("late camera permission resolution after cancellation is immediately released", () => {
  let stops = 0;
  const lease = createCaptureLease(1000, () => {});
  lease.close();
  assert.equal(
    lease.useStream({ getTracks: () => [{ stop: () => stops++ }] }),
    false,
  );
  assert.equal(stops, 1);
});
