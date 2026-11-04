const crypto = require("node:crypto");
const MODEL_VERSION = "sface-2021dec";
const failure = (message, status = 422) =>
  Object.assign(Error(message), { status, code: status });
const nonceHash = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");
function framesInput(frames) {
  if (!Array.isArray(frames) || frames.length < 8 || frames.length > 32)
    throw failure("请按提示完成面部采集");
  let total = 0;
  const hashes = new Set();
  for (const f of frames) {
    if (
      typeof f !== "string" ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(f)
    )
      throw failure("面部图像格式无效");
    const b = Buffer.from(f.slice(23), "base64");
    total += b.length;
    if (
      b.length < 100 ||
      b.length > 512 * 1024 ||
      b[0] !== 255 ||
      b[1] !== 216 ||
      b[2] !== 255
    )
      throw failure("面部图像格式无效");
    hashes.add(nonceHash(f));
  }
  if (total > 4 * 1024 * 1024) throw failure("面部采集数据过大", 413);
  if (hashes.size < Math.ceil(frames.length * 0.8))
    throw failure("请实时完成采集，不能使用静态或重复画面");
  return frames;
}
function descriptorInput(value) {
  if (
    value?.modelVersion !== MODEL_VERSION ||
    !Array.isArray(value.descriptor) ||
    value.descriptor.length !== 128 ||
    value.descriptor.some((v) => !Number.isFinite(v))
  )
    throw failure("人脸识别模型返回无效", 503);
  const norm = Math.hypot(...value.descriptor);
  if (Math.abs(norm - 1) > 0.01) throw failure("人脸特征无效", 503);
  return value;
}
const actionForNonce = (nonce) =>
  parseInt(nonceHash(nonce).slice(0, 2), 16) % 2 ? "TURN" : "BLINK";
const cosine = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
module.exports = {
  MODEL_VERSION,
  failure,
  nonceHash,
  framesInput,
  descriptorInput,
  cosine,
  actionForNonce,
};
