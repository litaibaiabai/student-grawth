const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { FaceWorker } = require("../services/faceAuth/worker");
async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "face-worker-test-"));
  await fs.writeFile(path.join(dir, "manifest.json"), "{}");
  const script = path.join(dir, "fake.cjs");
  await fs.writeFile(
    script,
    `console.log(JSON.stringify({ready:true}));require('readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.action==='HANG')return;if(r.action==='BAD'){console.log('not json');return;}setTimeout(()=>console.log(JSON.stringify({id:r.id,result:{modelVersion:'test-only',descriptor:[1]}})),20);});`,
  );
  const worker = new FaceWorker({
    python: process.execPath,
    script,
    modelDir: dir,
    timeout: 800,
  });
  try {
    await fn(worker);
  } finally {
    worker.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}
test("face worker enforces a bounded queue and never launches unlimited jobs", async () =>
  fixture(async (w) => {
    const jobs = [1, 2, 3, 4].map(() => w.infer({ frames: [], action: "OK" }));
    const out = await Promise.allSettled(jobs);
    assert.equal(out.filter((r) => r.status === "fulfilled").length, 3);
    assert.equal(out[3].reason.status, 429);
  }));
test("timed out or malformed worker responses fail closed and permit a clean restart", async () =>
  fixture(async (w) => {
    await assert.rejects(w.infer({ frames: [], action: "HANG" }), {
      status: 503,
    });
    assert.equal(
      (await w.infer({ frames: [], action: "OK" })).modelVersion,
      "test-only",
    );
    await assert.rejects(w.infer({ frames: [], action: "BAD" }), {
      status: 503,
    });
    assert.equal(
      (await w.infer({ frames: [], action: "OK" })).modelVersion,
      "test-only",
    );
  }));
