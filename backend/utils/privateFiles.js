const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { fail } = require("../services/reportCorePolicy");
function directory() {
  return path.resolve(
    process.env.REPORT_FILES_DIR ||
      path.join(__dirname, "../private/report-core"),
  );
}
async function savePrivateFile(file) {
  if (!file?.buffer || file.buffer.length > 5 * 1024 * 1024)
    fail(413, "奖状限5MiB");
  const b = file.buffer;
  const png = b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
    jpg = b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (
    !(
      (png && file.mimetype === "image/png") ||
      (jpg && file.mimetype === "image/jpeg")
    )
  )
    fail(415, "仅支持真实PNG/JPEG图片");
  const ref = crypto.randomUUID() + (png ? ".png" : ".jpg");
  await fs.mkdir(directory(), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(directory(), ref), b, {
    flag: "wx",
    mode: 0o600,
  });
  return {
    fileRef: ref,
    fileHash: crypto.createHash("sha256").update(b).digest("hex"),
    mime: file.mimetype,
  };
}
function filePath(ref) {
  if (typeof ref !== "string" || !/^[-a-z0-9]+\.(png|jpg)$/.test(ref))
    fail(400, "非法文件引用");
  return path.join(directory(), ref);
}
const readPrivateFile = (ref) => fs.readFile(filePath(ref));
const removePrivateFile = (ref) => fs.unlink(filePath(ref)).catch(() => {});
module.exports = {
  savePrivateFile,
  readPrivateFile,
  removePrivateFile,
  filePath,
};
