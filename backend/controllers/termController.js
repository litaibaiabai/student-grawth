/**
 * termController.js — 学年学期控制器
 */

const { pool } = require("../db");
const { ErrorCodes } = require("../constants/errorCodes");
const { success, fail } = require("../utils/response");
const {AppError}=require('../middleware/errorHandler');
const {sqlDate,sqlTimestamp,schoolTimestamp}=require('../services/cardRules');
const {withSchoolLock}=require('../services/cardAllocationService');

function parseReviewDeadline(value){
  if(typeof value!=='string')throw new AppError(422,'请填写有效的学期审核截止时间',422);
  if(/(Z|[+-]\d{2}:\d{2})$/i.test(value)){
    const d=new Date(value);if(Number.isNaN(d.getTime()))throw new AppError(422,'审核截止时间无效',422);return schoolTimestamp(d);
  }
  const stamp=value.replace('T',' ').length===16?value.replace('T',' ')+':59':value.replace('T',' ');
  const d=new Date(stamp.replace(' ','T')+'+08:00');
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stamp)||Number.isNaN(d.getTime())||schoolTimestamp(d)!==stamp)throw new AppError(422,'审核截止时间无效',422);
  return stamp;
}

/**
 * GET /api/v1/terms/current
 * 获取当前默认展示与活动学期
 */
async function getCurrentTerm(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user?.schoolId || 1;

    const [rows] = await conn.query(
      `SELECT id, school_id, academic_year, semester, start_date, end_date, is_current, active, effective_at, review_deadline_at
       FROM academic_year
       WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 AND active = 1
       ORDER BY school_id DESC, id DESC
       LIMIT 1`,
      [schoolId]
    );

    if (rows.length === 0) {
      return fail(res, ErrorCodes.TERM_CLOSED, "暂无当前活动学期，请联系教务管理员配置", 400);
    }

    const term = rows[0];
    success(res, {
      termId: term.id,
      id: term.id,
      schoolId: term.school_id,
      academicYear: term.academic_year,
      semester: term.semester,
      startDate: sqlDate(term.start_date),
      endDate: sqlDate(term.end_date),
      reviewDeadlineAt:term.review_deadline_at?sqlTimestamp(term.review_deadline_at):`${sqlDate(term.end_date)} 23:59:59`,
      isCurrent: Boolean(term.is_current),
      isActive: Boolean(term.active),
      timezone: "Asia/Shanghai"
    });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/v1/terms
 * 获取所有学期列表
 */
async function getTerms(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection();
    const schoolId = req.user?.schoolId || 1;

    const [rows] = await conn.query(
      `SELECT id, school_id, academic_year, semester, start_date, end_date, is_current, active, effective_at, review_deadline_at
       FROM academic_year
       WHERE school_id = ? OR school_id IS NULL
       ORDER BY academic_year DESC, semester DESC`,
      [schoolId]
    );

    const formatted = rows.map((r) => {
      const termName = `${r.academic_year}学年第${Number(r.semester) === 1 ? "一" : "二"}学期`;
      return {
        ...r,
        termId: r.id,
        academicYear: r.academic_year,
        startDate: r.start_date,
        endDate: r.end_date,
        reviewDeadlineAt:r.review_deadline_at?sqlTimestamp(r.review_deadline_at):`${sqlDate(r.end_date)} 23:59:59`,
        isCurrent: Boolean(r.is_current),
        isActive: Boolean(r.active),
        term_name: termName,
        termName,
        status: r.active ? "ACTIVE" : "ARCHIVED"
      };
    });

    success(res, formatted);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * POST /api/v1/admin/terms
 * 创建或更新学期 (高度容错：兼容驼峰/下划线、term_name 自动解构)
 */
async function saveTerm(req, res, next) {
  const rawId = req.params?.id || req.body?.id || req.body?.termId || req.body?.term_id;
  const id = rawId ? Number(rawId) : undefined;
  let academicYear = req.body?.academicYear || req.body?.academic_year;
  let semester = req.body.semester;
  let startDate = req.body.startDate || req.body.start_date;
  let endDate = req.body.endDate || req.body.end_date;
  const isCurrent = req.body.isCurrent !== undefined ? req.body.isCurrent : (req.body.is_current !== undefined ? req.body.is_current : false);
  const active = req.body.active !== undefined ? req.body.active : 1;
  const termName = req.body.termName || req.body.term_name;

  // 容错：如果前端传入 term_name (如 "2027-2028学年第一学期")，自动解析 academicYear 与 semester
  if ((!academicYear || !semester) && termName) {
    const match = String(termName).match(/(\d{4}-\d{4}).*?第?([一二12])学期?/);
    if (match) {
      academicYear = academicYear || match[1];
      semester = semester || ((match[2] === "一" || match[2] === "1") ? 1 : 2);
    }
  }

  // 容错：若未明确提供起止日期，按中国小学校历标准自动补全起止段
  // 第一学期（秋季学期）：当年9月1日 ~ 次年1月31日；第二学期（春季学期）：次年2月20日 ~ 7月15日
  if ((!startDate || !endDate) && academicYear && semester) {
    const match = String(academicYear).match(/^(\d{4})-(\d{4})$/);
    if (match) {
      const startYear = match[1];
      const endYear = match[2];
      if (Number(semester) === 1) {
        startDate = startDate || `${startYear}-09-01`;
        endDate = endDate || `${endYear}-01-31`;
      } else if (Number(semester) === 2) {
        startDate = startDate || `${endYear}-02-20`;
        endDate = endDate || `${endYear}-07-15`;
      }
    }
  }

  if (!academicYear || !semester || !startDate || !endDate) {
    return fail(res, ErrorCodes.VALIDATION_ERROR, "学年、学期、起止日期均为必填项", 422);
  }

  try {
    const schoolId=req.user?.schoolId||1;
    const data=await withSchoolLock(schoolId,async conn=>{
      const isCurrentVal=(isCurrent===true||isCurrent===1||isCurrent==='1')?1:0;
      let old;
      if(id){
        [[old]]=await conn.query('SELECT id,review_deadline_at,end_date FROM academic_year WHERE id=? AND school_id=? FOR UPDATE',[id,schoolId]);
        if(!old)throw new AppError(403,'只能修改本校学期，请为本校单独配置校历',403);
      }
      const explicit=req.body.reviewDeadlineAt??req.body.review_deadline_at;
      const endDeadline=`${sqlDate(endDate)} 23:59:59`;
      const reviewDeadlineAt=explicit!==undefined?parseReviewDeadline(explicit):[old?.review_deadline_at?sqlTimestamp(old.review_deadline_at):endDeadline,endDeadline].sort().at(-1);
      if(reviewDeadlineAt<endDeadline)throw new AppError(422,'学期审核截止不能早于学期结束日末',422);
      if(isCurrentVal)await conn.query('UPDATE academic_year SET is_current = 0 WHERE school_id = ?',[schoolId]);
      let savedId=id;
      if(id){
        await conn.query(`UPDATE academic_year SET academic_year = ?, semester = ?, start_date = ?, end_date = ?, is_current = ?, active = ?, review_deadline_at = ? WHERE id = ? AND school_id = ?`,[academicYear,Number(semester),startDate,endDate,isCurrentVal,active?1:0,reviewDeadlineAt,id,schoolId]);
        // Persist a shortened bound so a later extension cannot revive old cards.
        await conn.query('UPDATE card_allocation SET valid_until=LEAST(valid_until,?),review_deadline_at=LEAST(review_deadline_at,?) WHERE school_id=? AND term_id=?',[reviewDeadlineAt,reviewDeadlineAt,schoolId,id]);
        await conn.query('UPDATE reward_card SET valid_until=LEAST(valid_until,?),review_deadline_at=LEAST(COALESCE(review_deadline_at,valid_until),?) WHERE school_id=? AND term_id=? AND is_legacy_test=0',[reviewDeadlineAt,reviewDeadlineAt,schoolId,id]);
      }else{
        const [created]=await conn.query(`INSERT INTO academic_year(school_id,academic_year,semester,start_date,end_date,is_current,active,effective_at,review_deadline_at) VALUES (?,?,?,?,?,?,?,NOW(),?)`,[schoolId,academicYear,Number(semester),startDate,endDate,isCurrentVal,active?1:0,reviewDeadlineAt]);
        savedId=created.insertId;
      }
      return {id:savedId,academicYear,semester:Number(semester),startDate,endDate,reviewDeadlineAt,isCurrent:Boolean(isCurrentVal)};
    });
    success(res,data,id?'学期更新成功':'学期创建成功');
  }catch(err){next(err);}

}

/**
 * POST /api/v1/admin/terms/:id/set-current
 * 将指定学期设为当前活跃学期
 */
async function setCurrentTerm(req, res, next) {
  const termId = req.params.id;
  const schoolId = req.user?.schoolId || 1;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT id, academic_year, semester, start_date, end_date FROM academic_year WHERE id = ? AND (school_id = ? OR school_id IS NULL)",
      [termId, schoolId]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return fail(res, ErrorCodes.NOT_FOUND, "指定的学期记录不存在", 404);
    }

    await conn.query("UPDATE academic_year SET is_current = 0 WHERE school_id = ? OR school_id IS NULL", [schoolId]);
    await conn.query(
      "UPDATE academic_year SET is_current = 1, active = 1 WHERE id = ? AND (school_id = ? OR school_id IS NULL)",
      [termId, schoolId]
    );

    // 写入不可变审计记录 operation_audit
    try {
      await conn.query(
        `INSERT INTO operation_audit (
          school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, new_summary
        ) VALUES (?, ?, ?, 'ACADEMIC_YEAR', ?, 'SET_CURRENT_TERM', ?, ?)`,
        [
          schoolId,
          req.user?.id || 0,
          req.user?.role || "manager",
          termId,
          `REQ_TERM_${termId}_${Date.now()}`,
          JSON.stringify({ academicYear: rows[0].academic_year, semester: rows[0].semester })
        ]
      );
    } catch {
      // 容错：审计记录不阻断核心学期切换
    }

    await conn.commit();
    success(
      res,
      {
        termId: Number(termId),
        id: Number(termId),
        academicYear: rows[0].academic_year,
        semester: rows[0].semester,
        isCurrent: true
      },
      "已将该学期设为当前活跃学期"
    );
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  getCurrentTerm,
  getTerms,
  saveTerm,
  setCurrentTerm
};
