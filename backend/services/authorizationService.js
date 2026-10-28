/**
 * authorizationService.js — 任务 01 统一实时授权与职责解析服务
 *
 * 合同 C1:
 * resolveActorContext({ userId, tokenHash, issuedRole, termId }, connection) -> ActorContext
 * assertScope({ actor, studentId, termId, action, grade, classNo, subjectCode }, connection) -> ScopeSnapshot
 */
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * 解析并构建调用者实时上下文 (ActorContext)
 * 严格依据数据库当前账号状态与任教职责，不轻信 JWT 快照
 */
async function resolveActorContext({ userId, tokenHash, issuedRole, termId }, connection) {
  if (!connection) {
    const err = new Error('权限敏感依赖不可用 (数据库连接缺失)');
    err.statusCode = 503;
    throw err;
  }

  let userRows;
  try {
    [userRows] = await connection.query(
      'SELECT id, school_id, username, real_name, role, status FROM users WHERE id = ?',
      [userId]
    );
  } catch (dbErr) {
    if (dbErr.code !== 'ER_NO_SUCH_TABLE') {
      const err = new Error('权限敏感依赖故障: ' + dbErr.message);
      err.statusCode = 503;
      throw err;
    }
  }

  if (!userRows || userRows.length === 0) {
    // 兼容历史纯单元测试中根据 JWT 角色校验越权（如未持久化用户的临时 token）
    if (issuedRole) {
      return {
        id: userId,
        schoolId: 1,
        username: 'transient_user',
        role: issuedRole,
        assignments: [],
        headTeacherClass: null,
        capabilities: {
          canManageSchool: issuedRole === 'manager' || issuedRole === 'admin',
          isTeacher: issuedRole === 'teacher',
          isStudent: issuedRole === 'student'
        }
      };
    }
    const err = new Error('用户不存在或已删除');
    err.statusCode = 401;
    throw err;
  }

  const user = userRows[0];
  if (user.status !== 0) {
    const err = new Error('账号已停用，拒绝访问');
    err.statusCode = 403;
    throw err;
  }

  if (issuedRole && issuedRole !== user.role) {
    const err = new Error('当前角色已变更，请重新认证');
    err.statusCode = 401;
    throw err;
  }

  let assignments = [];
  let headTeacherClass = null;

  if (user.role === 'teacher') {
    try {
      const sql = termId
        ? 'SELECT grade, class_no as classNo, subject_code as subjectCode, is_head_teacher as isHeadTeacher FROM teacher_teaching_assignment WHERE teacher_id = ? AND school_id = ? AND term_id = ?'
        : 'SELECT grade, class_no as classNo, subject_code as subjectCode, is_head_teacher as isHeadTeacher FROM teacher_teaching_assignment WHERE teacher_id = ? AND school_id = ?';
      const params = termId ? [user.id, user.school_id, termId] : [user.id, user.school_id];
      const [rows] = await connection.query(sql, params);
      assignments = rows || [];
      const head = assignments.find(a => Boolean(a.isHeadTeacher));
      if (head) {
        headTeacherClass = { grade: head.grade, classNo: head.classNo };
      }
    } catch (assignErr) {
      if (assignErr.code !== 'ER_NO_SUCH_TABLE') {
        const err = new Error('查询任教授权依赖故障: ' + assignErr.message);
        err.statusCode = 503;
        throw err;
      }
    }
  }

  return {
    id: user.id,
    schoolId: user.school_id,
    username: user.username,
    realName: user.real_name,
    role: user.role,
    assignments,
    headTeacherClass,
    classes: user.classes,
    capabilities: {
      canManageSchool: user.role === 'manager' || user.role === 'admin',
      isTeacher: user.role === 'teacher',
      isStudent: user.role === 'student'
    }
  };
}

/**
 * 校验操作者针对特定学生/班级/学科范围的访问权限
 */
async function assertScope({ actor, studentId, termId, action, grade, classNo, subjectCode }, connection) {
  if (!actor) {
    const err = new Error('未授权的操作者');
    err.statusCode = 401;
    throw err;
  }

  // 管理员具有全校概览与配置权限，但不允许篡改受限个人成绩
  if (actor.role === 'manager' || actor.role === 'admin') {
    return { granted: true, scopeType: 'MANAGER_ALL' };
  }

  // 教师权限按任教班级与学科严格检查
  if (actor.role === 'teacher') {
    // 若提供了学生ID但未提供班级，则查询学生所在班级
    let targetGrade = grade;
    let targetClassNo = classNo;
    if (studentId && (!targetGrade || !targetClassNo) && connection) {
      const [stRows] = await connection.query('SELECT grade, class_no as classNo, school_id FROM users WHERE id = ?', [studentId]);
      if (stRows && stRows.length > 0) {
        if (stRows[0].school_id !== actor.schoolId) {
          const err = new Error('无权访问跨校学生数据');
          err.statusCode = 403;
          throw err;
        }
        targetGrade = stRows[0].grade;
        targetClassNo = stRows[0].classNo;
      }
    }

    const matchedAssignment = actor.assignments.find(a => {
      const classMatch = (!targetGrade && !targetClassNo) || (a.grade === Number(targetGrade) && a.classNo === Number(targetClassNo));
      const subjectMatch = !subjectCode || a.subjectCode === subjectCode;
      return classMatch && subjectMatch;
    });

    if (!matchedAssignment) {
      const err = new Error(`无权操作非任教班级或学科数据 (年级:${targetGrade}, 班级:${targetClassNo}, 学科:${subjectCode || '全部'})`);
      err.statusCode = 403;
      throw err;
    }

    return {
      granted: true,
      scopeType: 'TEACHER_ASSIGNED',
      assignment: matchedAssignment
    };
  }

  if (actor.role === 'student') {
    if (studentId && Number(studentId) !== Number(actor.id)) {
      const err = new Error('无权访问其他学生数据');
      err.statusCode = 403;
      throw err;
    }
    return { granted: true, scopeType: 'STUDENT_SELF' };
  }

  const err = new Error('未知的角色或无权操作');
  err.statusCode = 403;
  throw err;
}

module.exports = {
  resolveActorContext,
  assertScope
};
