const express = require("express");
const bcrypt = require("bcrypt");
const { requireAuth, requireRole, signToken } = require("../middleware/auth");
const { fail, catalog, stableHash } = require("../services/reportCorePolicy");
const { assignments } = require("../services/authorizationService");
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
const ok = (res, data) => res.json({ code: 200, message: "成功", data });
function createCoreRouter() {
  const r = express.Router();
  r.post(
    "/auth/login",
    asyncRoute(async (req, res) => {
      const { username, password } = req.body;
      const [[u]] = await req.app.locals.pool.query(
        "SELECT * FROM users WHERE school_id=? AND username=?",
        [req.app.locals.schoolId, username || ""],
      );
      if (
        !u ||
        u.status !== 0 ||
        typeof password !== "string" ||
        !(await bcrypt.compare(password, u.password))
      )
        fail(401, "用户名或密码错误");
      ok(res, {
        token: signToken(u),
        user: {
          id: String(u.id),
          schoolId: String(u.school_id),
          username: u.username,
          real_name: u.real_name,
          role: u.role,
        },
      });
    }),
  );
  r.use(requireAuth);
  r.post(
    "/auth/logout",
    asyncRoute(async (req, res) => {
      await req.app.locals.pool.query(
        "UPDATE users SET token_version=token_version+1 WHERE id=?",
        [req.actor.id],
      );
      ok(res, { loggedOut: true });
    }),
  );
  r.get(
    "/me",
    asyncRoute(async (req, res) => ok(res, req.actor)),
  );
  r.get(
    "/report-core/config",
    asyncRoute(async (req, res) => ok(res, catalog)),
  );
  r.get(
    "/report-core/terms",
    asyncRoute(async (req, res) => {
      const [rows] = await req.app.locals.pool.query(
        "SELECT id,term_name,academic_year,semester,is_current,start_date,end_date,active_release_version FROM academic_year WHERE school_id=? ORDER BY id DESC",
        [req.actor.schoolId],
      );
      ok(res, rows);
    }),
  );
  r.get(
    "/report-core/students",
    asyncRoute(async (req, res) => {
      const termId = req.query.termId;
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const pool = req.app.locals.pool;
      let rows;
      if (req.actor.role === "student") {
        [rows] = await pool.query(
          "SELECT student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,revision,status FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?",
          [req.actor.schoolId, termId, req.actor.id],
        );
      } else if (req.actor.role === "manager") {
        [rows] = await pool.query(
          "SELECT student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,revision,status FROM student_term_evaluation WHERE school_id=? AND term_id=? ORDER BY student_id LIMIT 100 OFFSET ?",
          [req.actor.schoolId, termId, offset],
        );
      } else {
        const a = await assignments(req.actor, termId, pool);
        if (!a.length) fail(403, "没有任教职责");
        [rows] = await pool.query(
          "SELECT DISTINCT e.student_id,e.student_name_snapshot,e.grade_snapshot,e.class_no_snapshot,e.revision,e.status FROM student_term_evaluation e JOIN teacher_teaching_assignment a ON a.school_id=e.school_id AND a.term_id=e.term_id AND a.grade=e.grade_snapshot AND a.class_no=e.class_no_snapshot WHERE a.teacher_id=? AND a.enabled=1 AND e.school_id=? AND e.term_id=? ORDER BY e.student_id LIMIT 100 OFFSET ?",
          [req.actor.id, req.actor.schoolId, termId, offset],
        );
      }
      ok(res, rows);
    }),
  );
  r.get(
    "/admin/report-core/terms",
    requireRole("manager"),
    asyncRoute(async (req, res) =>
      ok(
        res,
        (
          await req.app.locals.pool.query(
            "SELECT * FROM academic_year WHERE school_id=?",
            [req.actor.schoolId],
          )
        )[0],
      ),
    ),
  );
  require("./reportCoreFeatures").mountFeatures(r, { asyncRoute, ok });
  return r;
}
module.exports = { createCoreRouter, asyncRoute, ok };
