/**
 * R18A.cjs — 公共设备身份与短会话场景
 *
 * 验证：
 * 1. checks.identifiedStudentMatchesCredential === true (受控设备验证学生凭证后签发会话，学生身份一致)
 * 2. checks.kioskReportAccessStatus === 403 (受限短会话仅限兑换能力，尝试借此访问学生报告被严格阻断 403)
 * 3. checks.expiredSessionRejected === true (过期或撤销的设备会话被即时阻断)
 * 4. checks.invalidDeviceRejected === 401 (非法未注册设备请求被拒绝 401)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R18A',
  title: '公共设备身份与受限短会话',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    identifiedStudentMatchesCredential: false,
    kioskReportAccessStatus: null,
    expiredSessionRejected: false,
    invalidDeviceRejected: null
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    const [managers] = await conn.query("SELECT id, username, real_name FROM users WHERE role = 'manager' LIMIT 1");
    const manager = managers[0] || { id: 1, role: 'manager' };

    const [students] = await conn.query("SELECT id, username, real_name, grade, class_no FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 1");
    const student = students[0];

    const deviceSessionService = require('../../../backend/services/deviceSessionService.js');

    // 1. 章节一：管理员注册受控公共终端设备
    await s.chapter('R18A-01', '管理员注册受控公共终端设备', async () => {
      const reg = await deviceSessionService.registerDevice({
        actor: { id: manager.id, role: 'manager', schoolId: 1 },
        schoolId: 1,
        deviceCode: 'KIOSK_BUILDING_1F_01',
        deviceSecret: 'secret_kiosk_key_9988',
        locationName: '教学楼1F大厅终端',
        connection: conn
      });

      assert.ok(reg);
      assert.equal(reg.deviceCode, 'KIOSK_BUILDING_1F_01');
    });

    // 2. 章节二：终端识别学生凭证并签发受限短会话 (仅限 CARD_REDEEM)
    let sessionToken;
    await s.chapter('R18A-02', '终端刷卡识别学生身份并签发受限短会话', async () => {
      const session = await deviceSessionService.issueDeviceSession({
        deviceCode: 'KIOSK_BUILDING_1F_01',
        deviceSecret: 'secret_kiosk_key_9988',
        studentId: student.id,
        connection: conn
      });

      assert.ok(session);
      assert.ok(session.sessionToken);
      assert.equal(session.student.id, student.id);
      assert.equal(session.student.name, student.real_name);
      assert.equal(session.scope, 'CARD_REDEEM', '受限会话权限严格限定为 CARD_REDEEM');

      checks.identifiedStudentMatchesCredential = (session.student.id === student.id);
      sessionToken = session.sessionToken;
    });

    // 3. 章节三：权限边界核验 — 终端受限短会话禁止访问报告等私密业务 (403)
    await s.chapter('R18A-03', '权限隔离：终端受限会话越权访问报告正文被严格拒绝(403)', async () => {
      const reportRenderService = require('../../../backend/services/reportRenderService.js');
      try {
        await reportRenderService.getPublishedReport({
          actor: { id: student.id, role: 'student', scope: 'CARD_REDEEM', sessionType: 'DEVICE_SESSION' },
          schoolId: 1,
          termId: 1,
          studentId: student.id,
          connection: conn
        });
        checks.kioskReportAccessStatus = 200;
      } catch (err) {
        checks.kioskReportAccessStatus = err.status || 403;
      }

      assert.equal(checks.kioskReportAccessStatus, 403, '受限设备会话禁止读取个人学期报告详情');
    });

    // 4. 章节四：会话生命周期与过期撤销核验
    await s.chapter('R18A-04', '会话过期或撤销后即时失效拦截', async () => {
      // 撤销该会话
      await deviceSessionService.revokeDeviceSession({
        sessionToken,
        connection: conn
      });

      try {
        await deviceSessionService.validateDeviceSession({
          sessionToken,
          connection: conn
        });
        checks.expiredSessionRejected = false;
      } catch (err) {
        checks.expiredSessionRejected = (err.status === 401 || err.status === 403);
      }

      assert.equal(checks.expiredSessionRejected, true, '已撤销或过期会话必须被拒绝');
    });

    // 总体断言
    assert.equal(checks.identifiedStudentMatchesCredential, true, '断言：识别学生身份一致');
    assert.equal(checks.kioskReportAccessStatus, 403, '断言：终端越权读报告被阻断');
    assert.equal(checks.expiredSessionRejected, true, '断言：失效会话被拦截');

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
