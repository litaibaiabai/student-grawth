const {
  fail,
  stableHash
} = require('./reportCorePolicy');
const {
  getTerm,
  withMutation,
  addSource,
  parse
} = require('./reportCoreStore');
const enhanced = term => term.evaluation_config.adminClassRegistryVersion === 1;
function manager(actor) {
  if (actor.role !== 'manager') fail(403, '仅管理员维护班级');
}
function registry(term) {
  if (!enhanced(term)) fail(422, '请先升级班级注册表');
}
const id = v => /^[1-9]\d*$/.test(String(v));
async function teacher(c, actor, value) {
  if (value === null) return null;
  if (!id(value)) fail(422, '教师编号不合法');
  const [[u]] = await c.query("SELECT id FROM users WHERE school_id=? AND id=? AND role='teacher' AND status=0", [actor.schoolId, value]);
  if (!u) fail(422, '教师必须是本校启用教师');
  return String(u.id);
}
async function classRecord(c, actor, termId, classId) {
  if (!id(classId)) fail(422, '班级编号不合法');
  const [[row]] = await c.query('SELECT * FROM school_class WHERE school_id=? AND term_id=? AND id=?', [actor.schoolId, termId, classId]);
  if (!row) fail(404, '班级不存在');
  return row;
}
async function registryHash(c, actor, termId) {
  const [rows] = await c.query('SELECT id,revision FROM school_class WHERE school_id=? AND term_id=? ORDER BY id', [actor.schoolId, termId]);
  return stableHash(rows);
}
const activeRoster = alias => `COALESCE(JSON_EXTRACT(${alias}.section_meta,'$.roster.included'),true)<>false AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${alias}.section_meta,'$.enrollment.status')),'ACTIVE') NOT IN ('TRANSFERRED_OUT','NOT_APPLICABLE')`;
const rowView = r => ({
  id: String(r.id),
  grade: r.grade,
  classNo: r.class_no,
  displayName: r.display_name,
  responsibleTeacherId: r.responsible_teacher_id ? String(r.responsible_teacher_id) : null,
  responsibleTeacherName: r.responsible_teacher_name || null,
  studentCount: Number(r.student_count || 0),
  revision: String(r.revision)
});
async function listClasses({
  pool,
  actor,
  termId,
  grade,
  q,
  cursor,
  limit = 50
}) {
  manager(actor);
  registry(await getTerm(pool, actor.schoolId, termId));
  const where = ['c.school_id=?', 'c.term_id=?'],
    args = [actor.schoolId, termId];
  if (grade !== undefined && grade !== '') {
    if (!Number.isInteger(Number(grade)) || Number(grade) < 1) fail(422, '年级不合法');
    where.push('c.grade=?');
    args.push(Number(grade));
  }
  if (q) {
    where.push("(c.display_name LIKE ? OR CONCAT(c.grade,'年',c.class_no,'班') LIKE ? OR u.real_name LIKE ?)");
    args.push(...Array(3).fill('%' + String(q).slice(0, 100) + '%'));
  }
  const sql = ' FROM school_class c LEFT JOIN users u ON u.school_id=c.school_id AND u.id=c.responsible_teacher_id WHERE ' + where.join(' AND ');
  const [[total]] = await pool.query('SELECT COUNT(*) total' + sql, args);
  const offset = Number(cursor || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) fail(422, '分页游标不合法');
  limit = Math.min(100, Math.max(1, Number(limit) || 50));
  const [rows] = await pool.query(`SELECT c.*,u.real_name responsible_teacher_name,(SELECT COUNT(*) FROM student_term_evaluation e WHERE e.school_id=c.school_id AND e.term_id=c.term_id AND e.grade_snapshot=c.grade AND e.class_no_snapshot=c.class_no AND ${activeRoster('e')}) student_count` + sql + ' ORDER BY c.grade,c.class_no,c.id LIMIT ? OFFSET ?', [...args, limit, offset]);
  return {
    rows: rows.map(rowView),
    total: Number(total.total),
    nextCursor: offset + rows.length < Number(total.total) ? String(offset + rows.length) : null
  };
}
async function getClass({
  pool,
  actor,
  termId,
  classId
}) {
  manager(actor);
  registry(await getTerm(pool, actor.schoolId, termId));
  const cls = await classRecord(pool, actor, termId, classId);
  const [[head]] = cls.responsible_teacher_id ? await pool.query('SELECT real_name FROM users WHERE school_id=? AND id=?', [actor.schoolId, cls.responsible_teacher_id]) : [[]];
  const [students] = await pool.query(`SELECT student_id studentId,student_name_snapshot name,revision,status FROM student_term_evaluation e WHERE school_id=? AND term_id=? AND grade_snapshot=? AND class_no_snapshot=? AND ${activeRoster('e')} ORDER BY student_id`, [actor.schoolId, termId, cls.grade, cls.class_no]);
  const [assignments] = await pool.query('SELECT a.subject_code subjectCode,a.teacher_id teacherId,u.real_name teacherName FROM teacher_teaching_assignment a JOIN users u ON u.school_id=a.school_id AND u.id=a.teacher_id WHERE a.school_id=? AND a.term_id=? AND a.grade=? AND a.class_no=? AND a.enabled=1 ORDER BY a.subject_code,a.teacher_id', [actor.schoolId, termId, cls.grade, cls.class_no]);
  return {
    class: rowView({
      ...cls,
      responsible_teacher_name: head?.real_name,
      student_count: students.length
    }),
    students: students.map(s => ({
      ...s,
      studentId: String(s.studentId),
      revision: String(s.revision)
    })),
    assignments: assignments.map(a => ({
      ...a,
      teacherId: String(a.teacherId)
    }))
  };
}
async function savePreview(c, args, kind, payload) {
  const previewId = await addSource(c, {
    schoolId: args.actor.schoolId,
    termId: args.termId,
    actorId: args.actor.id,
    kind: 'AUDIT',
    status: 'PREVIEW',
    key: ['ADMIN_CLASS_PREVIEW', kind, args.command.requestKey],
    payload: {
      kind,
      ...payload
    }
  });
  return {
    result: {
      previewId,
      revision: '1',
      diffs: payload.diffs || [],
      ...(payload.counts ? {
        counts: payload.counts,
        errors: []
      } : {}),
      ...(payload.impact ? {
        impact: payload.impact
      } : {})
    }
  };
}
function preview(args, kind, fn) {
  manager(args.actor);
  return withMutation({
    ...args,
    action: 'admin-class-import-preview',
    readCommitted: true
  }, async (c, term) => {
    registry(term);
    return savePreview(c, args, kind, await fn(c, term));
  });
}
async function previewClassImport(args) {
  return preview(args, 'CLASS_IMPORT', async (c, term) => {
    const {
      rows,
      actor,
      termId
    } = args;
    if (!Array.isArray(rows) || !rows.length || rows.length > 500) fail(422, '每批需要1至500个班级');
    const normalized = [],
      diffs = [],
      errors = [],
      seen = new Set(),
      counts = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0
      };
    for (const [index, row] of rows.entries()) {
      try {
        if (!row || !Number.isInteger(row.grade) || row.grade < 1 || row.grade > 65535 || !Number.isInteger(row.classNo) || row.classNo < 1 || row.classNo > 65535) fail(422, '年级班号须为合法正整数');
        if (row.displayName != null && (typeof row.displayName !== 'string' || row.displayName.trim().length > 100)) fail(422, '班名不超过100字');
        const key = `${row.grade}:${row.classNo}`;
        if (seen.has(key)) {
          counts.skipped++;
          continue;
        }
        seen.add(key);
        const [[exists]] = await c.query('SELECT * FROM school_class WHERE school_id=? AND term_id=? AND grade=? AND class_no=?', [actor.schoolId, termId, row.grade, row.classNo]);
        const displayName = row.displayName?.trim() || null;
        if (exists) {
          if (exists.display_name === displayName) { counts.skipped++; continue; }
          const after = { grade:row.grade, classNo:row.classNo, displayName };
          normalized.push({...after, classId:String(exists.id)});
          diffs.push({rowNo:index+1, action:'UPDATE', classId:String(exists.id), before:{grade:exists.grade,classNo:exists.class_no,displayName:exists.display_name}, after});
          counts.updated++;
          continue;
        }
        let head = null;
        if (row.responsibleTeacherUsername) {
          const [[u]] = await c.query("SELECT id FROM users WHERE school_id=? AND username=? AND role='teacher' AND status=0", [actor.schoolId, row.responsibleTeacherUsername]);
          if (!u) fail(422, '负责人必须是本校启用教师');
          head = String(u.id);
        }
        const after = {
          grade: row.grade,
          classNo: row.classNo,
          displayName: row.displayName?.trim() || null,
          responsibleTeacherId: head
        };
        normalized.push(after);
        diffs.push({
          rowNo: index + 1,
          action: 'NEW',
          before: null,
          after
        });
        counts.created++;
      } catch (e) {
        if (!e.statusCode) throw e;
        errors.push({
          rowNo: index + 1,
          reason: e.message
        });
      }
    }
    if (errors.length) {
      const {
        AppError
      } = require('../middleware/errorHandler');
      throw Object.assign(new AppError(422, '请修正全部班级导入错误', 422), {
        safeDetails: true,
        details: {
          errors,
          counts: {
            ...counts,
            errors: errors.length
          }
        }
      });
    }
    return {
      rows: normalized,
      diffs,
      counts,
      registryHash: await registryHash(c, actor, termId)
    };
  });
}
async function previewTeachers(args) {
  return preview(args, 'CLASS_TEACHERS', async c => {
    const cls = await classRecord(c, args.actor, args.termId, args.classId);
    if (String(cls.revision) !== String(args.expectedRevision)) fail(409, '班级配置已变化');
    const head = await teacher(c, args.actor, args.responsibleTeacherId);
    if (!Array.isArray(args.assignments)) fail(422, '任课配置必需');
    const subjects = new Set(['MORAL', 'CHINESE', 'MATH', 'SCIENCE', 'ENGLISH', 'PE', 'MUSIC', 'FINE_ART', 'INFORMATION_TECHNOLOGY', 'LABOR', 'INTEGRATED_PRACTICE', 'LOCAL_COURSE']);
    subjects.add('STORY');
    const seen = new Set(),
      assignments = [];
    for (const row of args.assignments) {
      if (!row || !id(row.teacherId) || !subjects.has(row.subjectCode) || seen.has(row.subjectCode)) fail(422, '学科不合法或重复');
      seen.add(row.subjectCode);
      assignments.push({
        subjectCode: row.subjectCode,
        teacherId: await teacher(c, args.actor, row.teacherId)
      });
    }
    const old = await getClass({
      pool: c,
      actor: args.actor,
      termId: args.termId,
      classId: args.classId
    });
    return {
      classId: String(cls.id),
      grade: cls.grade,
      classNo: cls.class_no,
      classRevision: String(cls.revision),
      responsibleTeacherId: head,
      assignments,
      diffs: [{
        before: {
          responsibleTeacherId: old.class.responsibleTeacherId,
          assignments: old.assignments
        },
        after: {
          responsibleTeacherId: head,
          assignments
        }
      }],
      impact: {
        studentCount: old.students.length,
        permissionsChanged: true
      }
    };
  });
}
async function previewTransfer(args) {
  return preview(args, 'CLASS_TRANSFER', async (c, term) => {
    if (!Array.isArray(args.studentIds) || !args.studentIds.length || args.studentIds.length > 500 || args.studentIds.some(s => !id(s)) || new Set(args.studentIds.map(String)).size !== args.studentIds.length || typeof args.reason !== 'string' || !args.reason.trim() || args.reason.length > 1000) fail(422, '学生名单和调班原因必需');
    const target = await classRecord(c, args.actor, args.termId, args.targetClassId);
    const rows = [],
      diffs = [];
    for (const studentId of args.studentIds) {
      const [[e]] = await c.query('SELECT * FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?', [args.actor.schoolId, args.termId, studentId]);
      if (!e || !require('./reportCoreV2Statistics').enrolled(e)) fail(422, '学生不在本学期有效名单');
      if (e.grade_snapshot === target.grade && e.class_no_snapshot === target.class_no) continue;
      rows.push({
        studentId: String(studentId),
        revision: String(e.revision)
      });
      diffs.push({
        studentId: String(studentId),
        before: {
          grade: e.grade_snapshot,
          classNo: e.class_no_snapshot
        },
        after: {
          grade: target.grade,
          classNo: target.class_no
        }
      });
    }
    return {
      rows,
      targetClassId: String(target.id),
      targetRevision: String(target.revision),
      rosterRevision: String(term.roster_revision),
      reason: args.reason.trim(),
      diffs,
      impact: {
        studentCount: rows.length,
        confirmationsInvalidated: true,
        rankingsRebuilt: true
      }
    };
  });
}
async function rosterImpact(c, term, actor, classes) {
  await c.query('UPDATE academic_year SET roster_revision=roster_revision+1 WHERE school_id=? AND id=?', [actor.schoolId, term.id]);
  term.roster_revision = String(BigInt(term.roster_revision) + 1n);
  const [all] = await c.query('SELECT student_id,grade_snapshot,class_no_snapshot FROM student_term_evaluation WHERE school_id=? AND term_id=?', [actor.schoolId, term.id]);
  const keys = new Set(classes.map(r => `${r.grade}:${r.classNo}`));
  const targets = [...require('./reportCoreV2Policy').catalog.cardCatalog.map(r => r.targetColumn), 'story_summary'];
  return Object.fromEntries(all.filter(e => keys.has(`${e.grade_snapshot}:${e.class_no_snapshot}`)).map(e => [String(e.student_id), targets]));
}
async function commit(args, kind, apply) {
  manager(args.actor);
  return withMutation({
    ...args,
    action: 'admin-class-import-commit',
    readCommitted: true
  }, async (c, term) => {
    registry(term);
    const [[p]] = await c.query('SELECT * FROM evaluation_source_record WHERE school_id=? AND term_id=? AND id=? FOR UPDATE', [args.actor.schoolId, args.termId, args.previewId]);
    if (!p || p.record_kind !== 'AUDIT' || String(p.actor_id) !== args.actor.id) fail(404, '班级预览不存在');
    const saved = parse(p.payload_json);
    if (saved.kind !== kind || p.status !== 'PREVIEW' || String(p.revision) !== String(args.expectedRevision)) fail(409, '预览已变化');
    const changed = await apply(c, term, saved);
    await c.query("UPDATE evaluation_source_record SET status='COMMITTED',revision=revision+1 WHERE id=?", [p.id]);
    await addSource(c, {
      schoolId: args.actor.schoolId,
      termId: args.termId,
      actorId: args.actor.id,
      kind: 'AUDIT',
      status: 'COMMITTED',
      key: ['ADMIN_CLASS_COMMIT', p.id],
      payload: {
        action: kind,
        classId: saved.classId,
        targetClassId: saved.targetClassId,
        grade: saved.grade,
        classNo: saved.classNo,
        counts: saved.counts,
        diffs: saved.diffs,
        reason: saved.reason,
        impact: saved.impact
      }
    });
    return changed;
  });
}
async function commitClassImport(args) {
  return commit(args, 'CLASS_IMPORT', async (c, term, p) => {
    if (p.registryHash !== (await registryHash(c, args.actor, args.termId))) fail(409, '班级列表已变化，请重新预览');
    for (const row of p.rows) {
      if (row.classId) {
        await c.query('UPDATE school_class SET display_name=?,revision=revision+1,updated_by=? WHERE school_id=? AND term_id=? AND id=?',[row.displayName,args.actor.id,args.actor.schoolId,args.termId,row.classId]);
        continue;
      }
      if (row.responsibleTeacherId) await teacher(c, args.actor, row.responsibleTeacherId);
      await c.query('INSERT INTO school_class(school_id,term_id,grade,class_no,display_name,responsible_teacher_id,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?)', [args.actor.schoolId, args.termId, row.grade, row.classNo, row.displayName, row.responsibleTeacherId, args.actor.id, args.actor.id]);
    }
    return {
      result: {
        counts: p.counts
      }
    };
  });
}
async function commitTeachers(args) {
  return commit(args, 'CLASS_TEACHERS', async (c, term, p) => {
    if (String(args.classId) !== p.classId) fail(409, '班级不符');
    const cls = await classRecord(c, args.actor, args.termId, p.classId);
    if (String(cls.revision) !== p.classRevision) fail(409, '班级配置已变化');
    await teacher(c, args.actor, p.responsibleTeacherId);
    for (const row of p.assignments) await teacher(c, args.actor, row.teacherId);
    const [beforeAssignments] = await c.query('SELECT subject_code,teacher_id FROM teacher_teaching_assignment WHERE school_id=? AND term_id=? AND grade=? AND class_no=? AND enabled=1',[args.actor.schoolId,args.termId,cls.grade,cls.class_no]);
    await require('./reportCoreCourseCards').replaceCourseQuotaOwners(c,{schoolId:args.actor.schoolId,termId:args.termId,grade:cls.grade,classNo:cls.class_no,before:beforeAssignments,after:p.assignments});
    await c.query('UPDATE teacher_teaching_assignment SET enabled=0,is_head_teacher=0 WHERE school_id=? AND term_id=? AND grade=? AND class_no=?', [args.actor.schoolId, args.termId, cls.grade, cls.class_no]);
    for (const row of p.assignments) await c.query('INSERT INTO teacher_teaching_assignment(school_id,term_id,grade,class_no,subject_code,teacher_id,is_head_teacher,enabled) VALUES(?,?,?,?,?,?,0,1) ON DUPLICATE KEY UPDATE enabled=1,is_head_teacher=0', [args.actor.schoolId, args.termId, cls.grade, cls.class_no, row.subjectCode, row.teacherId]);
    await c.query('UPDATE school_class SET responsible_teacher_id=?,revision=revision+1,updated_by=? WHERE school_id=? AND id=?', [p.responsibleTeacherId, args.actor.id, args.actor.schoolId, cls.id]);
    await c.query("UPDATE student_term_evaluation SET revision=revision+1,status='DRAFT',confirmed_revision=NULL,confirmed_by=NULL,confirmed_at=NULL,approval_fingerprint=NULL WHERE school_id=? AND term_id=? AND grade_snapshot=? AND class_no_snapshot=?", [args.actor.schoolId, args.termId, cls.grade, cls.class_no]);
    await c.query('UPDATE academic_year SET data_revision=data_revision+1 WHERE school_id=? AND id=?', [args.actor.schoolId, args.termId]);
    return {
      result: {
        classId: p.classId,
        revision: String(BigInt(cls.revision) + 1n),
        impact: p.impact
      }
    };
  });
}
async function commitTransfer(args) {
  return commit(args, 'CLASS_TRANSFER', async (c, term, p) => {
    if (String(term.roster_revision) !== p.rosterRevision) fail(409, '名单已变化');
    const target = await classRecord(c, args.actor, args.termId, p.targetClassId);
    if (String(target.revision) !== p.targetRevision) fail(409, '目标班级已变化');
    const classes = [{
      grade: target.grade,
      classNo: target.class_no
    }];
    for (const row of p.rows) {
      const [[e]] = await c.query('SELECT * FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=? FOR UPDATE', [args.actor.schoolId, args.termId, row.studentId]);
      if (!e || String(e.revision) !== row.revision) fail(409, '学生数据已变化');
      classes.push({
        grade: e.grade_snapshot,
        classNo: e.class_no_snapshot
      });
      await c.query('UPDATE student_term_evaluation SET grade_snapshot=?,class_no_snapshot=? WHERE school_id=? AND term_id=? AND student_id=?', [target.grade, target.class_no, args.actor.schoolId, args.termId, row.studentId]);
      if (term.is_current) await c.query('UPDATE users SET grade=?,class_no=? WHERE school_id=? AND id=?', [target.grade, target.class_no, args.actor.schoolId, row.studentId]);
    }
    return {
      result: {
        studentIds: p.rows.map(r => r.studentId),
        impact: p.impact
      },
      changedTargetsByStudent: p.rows.length ? await rosterImpact(c, term, args.actor, classes) : {}
    };
  });
}
module.exports = {
  enhanced,
  listClasses,
  getClass,
  previewClassImport,
  commitClassImport,
  previewTeachers,
  commitTeachers,
  previewTransfer,
  commitTransfer,
  rosterImpact
};
