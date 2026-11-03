const fs = require("node:fs/promises"),
  path = require("node:path"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, "../.."),
  dir = path.join(root, "backend/private/face-models");
const resources = {
  landmarker:
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  yunet:
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
  sface:
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
};
async function setup({ install = false } = {}) {
  let expected = {};
  const manifestPath = path.join(__dirname, "../face_worker/models.json");
  try {
    expected = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {}
  if (!install) {
    for (const [id, entry] of Object.entries(expected)) {
      const bytes = await fs.readFile(path.join(dir, entry.file));
      if (
        crypto.createHash("sha256").update(bytes).digest("hex") !== entry.sha256
      )
        throw Error("模型校验失败：" + id);
    }
    if (Object.keys(expected).length !== 3)
      throw Error("请先运行 setupFaceModels.js --install");
    return { ready: true };
  }
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const manifest = {};
  for (const [id, url] of Object.entries(resources)) {
    let bytes;
    try {
      bytes = await fs.readFile(
        path.join(dir, id + (id === "landmarker" ? ".task" : ".onnx")),
      );
    } catch {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok) throw Error("模型下载失败：" + id);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    if (
      bytes.length < 100000 ||
      (expected[id] && expected[id].sha256 !== sha256)
    )
      throw Error("模型完整性检查失败：" + id);
    const file = id + (id === "landmarker" ? ".task" : ".onnx");
    await fs.writeFile(path.join(dir, file), bytes, { mode: 0o600 });
    manifest[id] = { file, sha256, url };
  }
  if (
    manifest.sface.sha256 !==
    "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"
  )
    throw Error("SFace官方内容哈希不符");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  const assets = path.join(root, "frontend/public/face-models");
  await fs.mkdir(assets, { recursive: true });
  await fs.copyFile(
    path.join(dir, "landmarker.task"),
    path.join(assets, "face_landmarker.task"),
  );
  await fs.cp(
    path.join(root, "frontend/node_modules/@mediapipe/tasks-vision/wasm"),
    path.join(assets, "wasm"),
    { recursive: true },
  );
  for (const [id, url] of Object.entries({
    sface:
      "https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_recognition_sface/LICENSE",
    yunet:
      "https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_detection_yunet/LICENSE",
    mediapipe:
      "https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE",
  })) {
    const r = await fetch(url);
    if (!r.ok) throw Error("许可证下载失败");
    await fs.writeFile(
      path.join(__dirname, "../face_worker/LICENSE-" + id + ".txt"),
      await r.text(),
    );
  }
  return { ready: true };
}
async function configureLocal() {
  const target = path.join(root, "backend/private/face-auth.env");
  const value =
    "FACE_AUTH_ENABLED=1\nFACE_AUTH_KEY_ID=local-v1\nFACE_AUTH_KEYS=" +
    JSON.stringify({ "local-v1": crypto.randomBytes(32).toString("base64") }) +
    "\nFACE_AUTH_PYTHON=" +
    JSON.stringify(path.join(root, "backend/private/face-venv/bin/python")) +
    "\n";
  try {
    await fs.writeFile(target, value, { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  return { configured: true };
}
if (require.main === module)
  setup({ install: process.argv.includes("--install") })
    .then(async (r) => {
      if (process.argv.includes("--init-local")) await configureLocal();
      console.log(JSON.stringify(r));
    })
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
module.exports = { setup };
