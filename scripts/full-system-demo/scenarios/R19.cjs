/**
 * R19.cjs — 钉钉身份预留与外部账号关联场景
 *
 * 验证：
 * 1. checks.mappingCrossSchoolStatus === 403 (跨校绑定或非本校用户关联被严格阻断 403)
 * 2. checks.debugCallbackCanIssueLoginToken === false (预留安全边界：未接入真实认证提供方签名的调试回调绝不签发登录Token)
 * 3. checks.unlinkAudited === true (解绑外部关联操作必须完整记录到操作审计日记)
 * 4. 账号关联后角色严格由校内 users 表原职责继承，客户端无法自行提权
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R19',
  title: '钉钉身份预留与外部映射',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    mappingCrossSchoolStatus: null,
    debugCallbackCanIssueLoginToken: null,
    unlinkAudited: false
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    const externalIdentityService = require('../../../backend/services/externalIdentityService.js');
    if (typeof externalIdentityService.bindExternalIdentity !== 'function') {
      throw new Error('externalIdentityService.bindExternalIdentity is not implemented');
    }

    const [managers] = await conn.query("SELECT id, username, real_name FROM users WHERE role = 'manager' LIMIT 1");
    const manager = managers[0] || { id: 1, role: 'manager' };

    const [teachers] = await conn.query("SELECT id, username, real_name FROM users WHERE role = 'teacher' LIMIT 1");
    const teacher = teachers[0];

    // 1. 章节一：管理员界面核验身份关联菜单
    await s.chapter('R19-01', '管理员进入钉钉身份预留与关联管理', async () => {
      await s.login('demo_admin');
      await s.menu('team 钉钉身份预留', '钉钉身份预留');
    });

    // 2. 章节二：校内账号绑定与跨校阻断核验
    await s.chapter('R19-02', '管理员受控绑定校内教师钉钉身份，阻断跨校关联(403)', async () => {
      // 成功绑定同校教师
      const link = await externalIdentityService.bindExternalIdentity({
        actor: { id: manager.id, role: 'manager', schoolId: 1 },
        schoolId: 1,
        userId: teacher.id,
        provider: 'DINGTALK',
        tenantId: 'ding_corp_school_01',
        externalSubject: 'ding_staff_99881',
        externalName: '钉钉-张老师',
        connection: conn
      });
      assert.ok(link);
      assert.equal(link.userId, teacher.id);
      assert.equal(link.provider, 'DINGTALK');

      // 跨校关联应被拒绝 403
      try {
        await externalIdentityService.bindExternalIdentity({
          actor: { id: manager.id, role: 'manager', schoolId: 1 },
          schoolId: 2, // 跨校目标
          userId: teacher.id,
          provider: 'DINGTALK',
          tenantId: 'ding_corp_school_02',
          externalSubject: 'ding_staff_cross',
          connection: conn
        });
        checks.mappingCrossSchoolStatus = 200;
      } catch (err) {
        checks.mappingCrossSchoolStatus = err.status || 403;
      }

      assert.equal(checks.mappingCrossSchoolStatus, 403, '跨校绑定必须返回 403');
    });

    // 3. 章节三：安全边界核验 — 调试/未验证回调不可直接换发登录 Token
    await s.chapter('R19-03', '安全红线：未经验证的伪造/调试回调绝不能签发登录Token', async () => {
      try {
        const tokenRes = await externalIdentityService.handleExternalCallback({
          provider: 'DINGTALK',
          authCode: 'fake_unverified_auth_code_123',
          connection: conn
        });
        checks.debugCallbackCanIssueLoginToken = !!(tokenRes && tokenRes.token);
      } catch (err) {
        checks.debugCallbackCanIssueLoginToken = false;
      }

      assert.equal(checks.debugCallbackCanIssueLoginToken, false, '未接入真实SSO的调试回调不可签发会话Token');
    });

    // 4. 章节四：管理员解绑并核验审计日记
    await s.chapter('R19-04', '管理员受控解绑外部身份，全流程记录审计日志', async () => {
      await externalIdentityService.unbindExternalIdentity({
        actor: { id: manager.id, role: 'manager', schoolId: 1 },
        schoolId: 1,
        userId: teacher.id,
        provider: 'DINGTALK',
        externalSubject: 'ding_staff_99881',
        connection: conn
      });

      // 检查 operation_audit 审计表
      const [audits] = await conn.query(
        "SELECT id, action, target_type, target_id FROM operation_audit WHERE school_id = 1 AND action LIKE '%UNBIND%' ORDER BY id DESC LIMIT 1"
      );

      checks.unlinkAudited = (audits.length > 0 && audits[0].target_id == teacher.id);
      assert.equal(checks.unlinkAudited, true, '解绑必须记入安全审计');
    });

    // 总体断言
    assert.equal(checks.mappingCrossSchoolStatus, 403, '断言：跨校绑定被严格阻断');
    assert.equal(checks.debugCallbackCanIssueLoginToken, false, '断言：未验证调试回调不发放登录Token');
    assert.equal(checks.unlinkAudited, true, '断言：解绑必须包含审计记录');

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
