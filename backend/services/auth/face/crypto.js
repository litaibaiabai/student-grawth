const crypto = require("node:crypto");
function readKeys(env = process.env) {
  const active = env.FACE_AUTH_KEY_ID;
  let data;
  try {
    data = JSON.parse(env.FACE_AUTH_KEYS || "");
  } catch {
    throw Error("人脸加密密钥未配置");
  }
  const values = {};
  for (const [id, key] of Object.entries(data || {})) {
    if (typeof key !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(key))
      throw Error("人脸密钥格式无效");
    const bytes = Buffer.from(key, "base64");
    if (bytes.length !== 32) throw Error("人脸密钥长度无效");
    values[id] = bytes;
  }
  if (!active || !values[active]) throw Error("人脸加密密钥未配置");
  return { active, values };
}
const aad = (s) =>
  Buffer.from(
    JSON.stringify([String(s.schoolId), String(s.userId), Number(s.version)]),
  );
function sealTemplate(value, scope, keys) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", keys.values[keys.active], iv);
  cipher.setAAD(aad(scope));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    v: 1,
    keyId: keys.active,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: bytes.toString("base64"),
  });
}
function openTemplate(text, scope, keys) {
  try {
    const e = JSON.parse(text);
    if (e.v !== 1 || !keys.values[e.keyId]) throw Error();
    const d = crypto.createDecipheriv(
      "aes-256-gcm",
      keys.values[e.keyId],
      Buffer.from(e.iv, "base64"),
    );
    d.setAAD(aad(scope));
    d.setAuthTag(Buffer.from(e.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        d.update(Buffer.from(e.data, "base64")),
        d.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw Object.assign(Error("人脸模板不可用，请使用密码重新绑定"), {
      status: 503,
      code: 503,
    });
  }
}
module.exports = { readKeys, sealTemplate, openTemplate };
