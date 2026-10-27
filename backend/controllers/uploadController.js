/**
 * uploadController.js — 荣誉证书图片上传与受控读取
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { ErrorCodes } = require("../constants/errorCodes");
const { fail } = require("../utils/response");

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const HONOR_DIR = path.join(UPLOAD_ROOT, "honor");
const MAX_SIZE = 5 * 1024 * 1024;
const EXT_BY_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const FILE_REF_RE = /^honor\/[a-f0-9]{32}\.(jpg|png|webp)$/;

fs.mkdirSync(HONOR_DIR, { recursive: true });

// 文件名完全由服务端随机生成，不使用客户端文件名
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, HONOR_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(16).toString("hex")}.${EXT_BY_MIME[file.mimetype]}`)
  }),
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter: (req, file, cb) => cb(null, Object.prototype.hasOwnProperty.call(EXT_BY_MIME, file.mimetype))
}).single("file");

// 以文件头魔数校验真实类型，防止伪造 Content-Type
function matchesMagic(filePath, ext) {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  if (ext === "jpg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === "png") return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
}

// 按用户限制上传频率，避免未关联的图片把磁盘刷满
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.UPLOAD_RATE_LIMIT_MAX) || 20,
  keyGenerator: (req) => `u:${req.user?.id || req.user?.userId}`,
  message: { code: 429, message: "上传过于频繁，请稍后再试" }
});

/**
 * POST /api/v1/uploads/honor-certificate
 */
function uploadHonorCertificate(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      if (!(err instanceof multer.MulterError)) return next(err);
      const msg = err.code === "LIMIT_FILE_SIZE" ? "图片不能超过 5MB" : "上传失败，请重试";
      return fail(res, ErrorCodes.VALIDATION_ERROR, msg, 422);
    }
    if (!req.file) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, "仅支持 JPG、PNG、WebP 格式的图片", 422);
    }
    const ext = path.extname(req.file.filename).slice(1);
    if (!matchesMagic(req.file.path, ext)) {
      fs.unlink(req.file.path, () => {});
      return fail(res, ErrorCodes.VALIDATION_ERROR, "文件内容不是有效的图片", 422);
    }
    res.json({ code: 200, message: "上传成功", data: { fileRef: `honor/${req.file.filename}` } });
  });
}

/**
 * GET /api/v1/uploads/honor/:name
 * 仅申报学生本人、其任课教师（班级范围内）与管理员可读
 */
async function getHonorCertificate(req, res, next) {
  const fileRef = `honor/${req.params.name}`;
  if (!FILE_REF_RE.test(fileRef)) return res.status(404).end();

  try {
    const schoolId = req.user?.schoolId || 1;
    const [rows] = await pool.query(
      `SELECT h.student_id, u.grade, u.class_no
       FROM material_revision mr
       JOIN honor_record h ON mr.owner_type = 'HONOR' AND mr.owner_id = h.id
       JOIN users u ON h.student_id = u.id
       WHERE mr.file_ref = ? AND h.school_id = ? LIMIT 1`,
      [fileRef, schoolId]
    );
    if (rows.length === 0) return res.status(404).end();

    const { student_id: studentId, grade, class_no: classNo } = rows[0];
    const role = req.user?.role;
    const uid = req.user?.id || req.user?.userId;
    let allowed = role === "manager" || (role === "student" && Number(studentId) === Number(uid));
    if (role === "teacher") {
      let classes = req.user.classes;
      if (typeof classes === "string") {
        try {
          classes = JSON.parse(classes);
        } catch {
          classes = [];
        }
      }
      allowed =
        Array.isArray(classes) &&
        classes.some((c) => Number(c.grade) === Number(grade) && Number(c.class_no) === Number(classNo));
    }
    if (!allowed) return res.status(403).end();

    res.set({ "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" });
    res.sendFile(path.join(UPLOAD_ROOT, fileRef), {dotfiles:"allow"}, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadHonorCertificate, uploadLimiter, getHonorCertificate, FILE_REF_RE };
