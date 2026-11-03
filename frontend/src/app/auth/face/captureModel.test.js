import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraError, poseMatches, sampleTargets } from "./captureModel.js";
test("camera errors give actionable password fallback messages", () => {
  assert.match(cameraError({ name: "NotAllowedError" }), /允许/);
  assert.match(cameraError({ name: "NotFoundError" }), /摄像头/);
});
test("face challenge progress requires actual pose and eye motion", () => {
  assert.deepEqual(sampleTargets("TURN"), [2, 3, 3, 2]);
  assert.equal(
    poseMatches("BLINK", 1, { yaw: 0, blinkLeft: 0.9, blinkRight: 0.9 }),
    true,
  );
  assert.equal(
    poseMatches("BLINK", 1, { yaw: 0, blinkLeft: 0, blinkRight: 0 }),
    false,
  );
  assert.equal(poseMatches("TURN", 1, { yaw: -0.2 }), true);
  assert.equal(poseMatches("TURN", 2, { yaw: -0.2 }), false);
});
