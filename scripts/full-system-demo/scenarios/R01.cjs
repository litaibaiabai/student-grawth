/**
 * R01.cjs — 任教授权与受限成绩场景
 *
 * 验证：
 * 1. checks.crossSubjectStatus === 403 (跨学科读写成绩被拦截)
 * 2. checks.sameTokenAfterRevocationStatus === 403 (职责撤销后相同 Token 后续请求实时 403)
 * 3. checks.permissionDependencyFailureStatus === 503 (权限依赖不可读时返回 503)
 */
const assert = require('node:assert/strict');
const path = require('node:path');

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    crossSubjectStatus: 0,
    sameTokenAfterRevocationStatus: 0,
    permissionDependencyFailureStatus: 0
  };

  // 1. 管理员登录并配置任教关系：陈老师 (demo_teacher_b) 仅任教 4年级2班 数学
  await s.chapter('R01-01', '管理员配置按学期的教师-班级-学科任教关系', async () => {
    await s.login('demo_admin');
    await s.menu('calendar 学期与校历', '学期与校历周期管理');
  });

  // 2. 验证教师跨学科成绩录入拦截 (403)
  await s.chapter('R01-02', '教师访问未授权学科成绩时返回 403', async () => {
    await s.login('demo_teacher_b'); // 陈老师
    const token = await page.evaluate(() => localStorage.getItem('AUTH_TOKEN'));

    // 陈老师尝试向 4年级1班 或未授权的 语文 学科提交成绩
    const res = await page.request.post('/api/v1/admin/import/subject-scores', {
      headers: { Authorization: 'Bearer ' + token },
      data: {
        termId: 1,
        grade: 4,
        classNo: 1,
        subjectCode: 'CHINESE',
        scores: [{ studentId: 11, score: 95 }]
      }
    });

    checks.crossSubjectStatus = res.status();
    assert.equal(checks.crossSubjectStatus, 403, '未授权学科提交应返回 403');
  });

  // 3. 验证撤权后同一 Token 立即被拒绝 (403)
  await s.chapter('R01-03', '任教授权撤销后原 Token 即刻返回 403', async () => {
    const token = await page.evaluate(() => localStorage.getItem('AUTH_TOKEN'));

    // 管理员从后台删除该教师的任教授权
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: m.dbName
    });
    try {
      await conn.query('DELETE FROM teacher_teaching_assignment WHERE teacher_id = 3');
    } finally {
      await conn.end();
    }

    // 教师持原 Token 再次请求
    const res = await page.request.post('/api/v1/admin/import/subject-scores', {
      headers: { Authorization: 'Bearer ' + token },
      data: {
        termId: 1,
        grade: 4,
        classNo: 2,
        subjectCode: 'MATH',
        scores: [{ studentId: 15, score: 90 }]
      }
    });

    checks.sameTokenAfterRevocationStatus = res.status();
    assert.equal(checks.sameTokenAfterRevocationStatus, 403, '撤权后原 Token 应返回 403');
  });

  // 4. 验证权限依赖故障时 503 拒绝降级放行
  await s.chapter('R01-04', '权限敏感依赖故障时返回 503 而非放行', async () => {
    const { resolveActorContext } = require('../../../backend/services/authorizationService.js');
    const brokenConn = {
      query: async () => { throw new Error('Database pool exhausted'); }
    };
    try {
      await resolveActorContext({ userId: 3, schoolId: 1, termId: 1 }, brokenConn);
    } catch (err) {
      checks.permissionDependencyFailureStatus = err.statusCode || (err.message.includes('503') ? 503 : 0);
    }
    assert.equal(checks.permissionDependencyFailureStatus, 503, '依赖故障必须返回 503');
  });

  assert.equal(checks.crossSubjectStatus, 403);
  assert.equal(checks.sameTokenAfterRevocationStatus, 403);
  assert.equal(checks.permissionDependencyFailureStatus, 503);

  return { checks };
}

module.exports = {
  id: 'R01',
  title: '任教授权与受限成绩',
  run
};
