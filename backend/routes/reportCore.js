const express = require("express");
const bcrypt = require("bcrypt");
const { requireAuth, requireRole, signToken } = require("../middleware/auth");
const { fail, stableHash } = require("../services/reportCorePolicy");
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
    asyncRoute(async (req, res) => {
      const [[profile]] = await req.app.locals.pool.query('SELECT username,real_name FROM users WHERE school_id=? AND id=?',[req.actor.schoolId,req.actor.id]);
      ok(res, {...req.actor, username:profile.username, real_name:profile.real_name});
    }),
  );
  r.get(
    "/report-core/config",
    asyncRoute(async (req, res) => {
      const pool=req.app.locals.pool;
      const [terms]=await pool.query(`SELECT evaluation_config FROM academic_year WHERE school_id=? AND ${req.query.termId?'id=?':'is_current=1'} LIMIT 1`,[req.actor.schoolId,...(req.query.termId?[req.query.termId]:[])]);
      ok(res,require('../services/reportCoreV2Policy').policyFor(terms[0]?require('../services/reportCoreStore').parse(terms[0].evaluation_config):{}));
    }),
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
      const roster = await require('../services/reportCoreReadModels').resolveTermRoster({
        connection: pool,
        schoolId: req.actor.schoolId,
        termId,
        ...(req.actor.role === 'teacher' ? { teacherId: req.actor.id } : req.actor.role === 'student' ? { studentId: req.actor.id } : {})
      });
      const rows = roster.slice(req.actor.role === 'student' ? 0 : offset, req.actor.role === 'student' ? undefined : offset + 100).map(e => ({
        student_id: e.student_id,
        student_number: e.student_number,
        student_name_snapshot: e.student_name_snapshot,
        grade_snapshot: e.grade_snapshot,
        class_no_snapshot: e.class_no_snapshot,
        revision: e.revision,
        status: e.status
      }));
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
  require('./reportCoreViews').mountViews(r, { asyncRoute, ok });
  require('./reportCoreV2').mountV2(r, { asyncRoute, ok });
  require('./reportCoreListening').mountListening(r, { asyncRoute, ok });
  require('./reportCoreStoryRecordings').mountStoryRecordings(r, { asyncRoute, ok });
  require('./reportCoreCourseCards').mountCourseCards(r, { asyncRoute, ok });
  require('./reportCoreStatistics').mountStatistics(r, { asyncRoute, ok });
  require('./reportCoreAdminClasses').mountAdminClasses(r, { asyncRoute, ok });
  require('./reportCoreAdminOps').mountAdminOps(r, { asyncRoute, ok });
  return r;
}
module.exports = { createCoreRouter, asyncRoute, ok };
