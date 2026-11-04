const assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process"),
  { FaceWorker } = require("../services/auth/face/worker");
async function verifyFaceModels() {
  const w = new FaceWorker();
  try {
    await w.ready();
    const source =
      "import io,json,base64\nfrom PIL import Image\na=[]\nfor i in range(8):\n b=io.BytesIO();Image.new('RGB',(320,240),(110+i,120+i,130+i)).save(b,format='JPEG');a.append('data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode())\nprint(json.dumps(a))";
    const frames = JSON.parse(
      execFileSync(w.python, ["-c", source], { encoding: "utf8" }),
    );
    await assert.rejects(w.infer({ frames, action: "BLINK" }), /未检测到人脸/);
    return {
      realModelsLoaded: true,
      syntheticNoFaceRejected: true,
      realPersonVerification: "NOT_TESTED",
    };
  } finally {
    w.close();
  }
}
if (require.main === module)
  verifyFaceModels()
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
module.exports = { verifyFaceModels };
