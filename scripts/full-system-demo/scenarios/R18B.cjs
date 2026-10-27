/**
 * R18B.cjs — 公共设备兑换与切人清屏场景
 *
 * 验证：
 * 1. checks.nextStudentUsesPreviousIdentity === false (下一名学生使用设备时绝不残留或继承上一位学生的身份)
 * 2. checks.timeoutClearsSession === true (超时或手动清屏后前一会话彻底失效)
 * 3. checks.sharedDeviceDuplicateRewardCount === 0 (同一设备相同请求重试不产生多领积分)
 * 4. 兑换结果仅展示简明获得维度与分值，不泄露过往账本详情
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R18B',
  title: '公共设备兑换与切人清屏',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    nextStudentUsesPreviousIdentity: null,
    timeoutClearsSession: false,
    sharedDeviceDuplicateRewardCount: 0
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    const deviceSessionService = require('../../../backend/services/deviceSessionService.js');
    const { redeemKioskCard, clearKioskSession } = deviceSessionService;
    if (typeof redeemKioskCard !== 'function') {
      throw new Error('deviceSessionService.redeemKioskCard is not implemented');
    }

    // 0. 初始化受控设备与测试学生
    const [students] = await conn.query(
      "SELECT id, username, real_name, grade, class_no FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 2"
    );
    assert.ok(students.length >= 2, '需要至少两名测试学生进行切人清屏验证');
    const studentA = students[0];
    const studentB = students[1];

    await deviceSessionService.registerDevice({
      actor: { id: 1, role: 'manager', schoolId: 1 },
      schoolId: 1,
      deviceCode: 'KIOSK_TERMINAL_2F_01',
      deviceSecret: 'kiosk_shared_secret_2026',
      locationName: '教学楼2F公共大厅终端',
      connection: conn
    });

    // 预备两张未使用的预分类卡
    const { generatePreclassifiedCards } = require('../../../backend/services/rewardCategoryService.js');
    await generatePreclassifiedCards({ schoolId: 1, monthKey: '2026-10', conn });

    const [cards] = await conn.query(
      "SELECT id, token_ciphertext FROM reward_card WHERE school_id = 1 AND batch_code = 'AUTO_V2' AND status = 'UNUSED' LIMIT 2"
    );
    assert.ok(cards.length >= 2, '需要至少两张可用奖励卡片');

    const { decryptToken, credentialContext } = require('../../../backend/services/cardCredentials.js');
    const tokenA = decryptToken(cards[0].token_ciphertext, credentialContext({ school_id: 1, serial_no: 1, batch_code: 'AUTO_V2' }));
    const tokenB = decryptToken(cards[1].token_ciphertext, credentialContext({ school_id: 1, serial_no: 2, batch_code: 'AUTO_V2' }));

    // 1. 章节一：学生甲在公共设备识别并进行扫码兑换
    let sessionA;
    await s.chapter('R18B-01', '学生甲刷卡识别并发起即时兑换入账', async () => {
      sessionA = await deviceSessionService.issueDeviceSession({
        deviceCode: 'KIOSK_TERMINAL_2F_01',
        deviceSecret: 'kiosk_shared_secret_2026',
        studentId: studentA.id,
        connection: conn
      });

      assert.ok(sessionA.sessionToken);
      assert.equal(sessionA.student.id, studentA.id);

      // 学生甲兑换卡片 1
      const requestKeyA = 'KIOSK_CLAIM_A_' + Date.now();
      const resA = await redeemKioskCard({
        sessionToken: sessionA.sessionToken,
        cardToken: tokenA,
        requestKey: requestKeyA,
        connection: conn
      });

      assert.ok(resA.pointsCredited >= 1);
      assert.ok(resA.dimensionCode, '必须展示获得维度');
      // 验证未泄露历史账本明细
      assert.equal(resA.historicalLedger, undefined, '不可泄露学生历史账本明细');

      // 验证重试幂等防多领
      const resRetry = await redeemKioskCard({
        sessionToken: sessionA.sessionToken,
        cardToken: tokenA,
        requestKey: requestKeyA,
        connection: conn
      });
      assert.equal(resRetry.replayed, true, '相同请求重试必须幂等返回');

      // 统计该卡片在积分账本中记录数
      const [records] = await conn.query(
        "SELECT COUNT(*) as cnt FROM score_record WHERE student_id = ? AND request_key = ?",
        [studentA.id, requestKeyA]
      );
      if (records[0].cnt > 1) {
        checks.sharedDeviceDuplicateRewardCount += (records[0].cnt - 1);
      }
    });

    // 2. 章节二：学生甲兑换完毕，执行清屏注销，验证旧会话被清空
    await s.chapter('R18B-02', '兑换完毕或超时主动清屏，注销前一会话', async () => {
      const clearRes = await clearKioskSession({
        sessionToken: sessionA.sessionToken,
        connection: conn
      });
      assert.equal(clearRes.success, true);

      // 验证旧会话已被清除失效
      try {
        await deviceSessionService.validateDeviceSession({
          sessionToken: sessionA.sessionToken,
          connection: conn
        });
        checks.timeoutClearsSession = false;
      } catch (err) {
        checks.timeoutClearsSession = (err.status === 401 || err.status === 403);
      }
      assert.equal(checks.timeoutClearsSession, true, '旧会话必须失效');
    });

    // 3. 章节三：下一位学生乙使用同一台公共终端，验证身份完全隔离
    await s.chapter('R18B-03', '学生乙刷卡使用同一终端，验证无上一位身份残留', async () => {
      const sessionB = await deviceSessionService.issueDeviceSession({
        deviceCode: 'KIOSK_TERMINAL_2F_01',
        deviceSecret: 'kiosk_shared_secret_2026',
        studentId: studentB.id,
        connection: conn
      });

      assert.ok(sessionB.sessionToken);
      assert.notEqual(sessionB.sessionToken, sessionA.sessionToken, '新会话Token不可与旧会话相同');
      assert.equal(sessionB.student.id, studentB.id);

      // 检查是否残留上一位学生甲的身份
      checks.nextStudentUsesPreviousIdentity = (sessionB.student.id === studentA.id);
      assert.equal(checks.nextStudentUsesPreviousIdentity, false, '下一位学生绝不能使用上一位身份');

      // 学生乙兑换卡片 2
      const requestKeyB = 'KIOSK_CLAIM_B_' + Date.now();
      const resB = await redeemKioskCard({
        sessionToken: sessionB.sessionToken,
        cardToken: tokenB,
        requestKey: requestKeyB,
        connection: conn
      });
      assert.ok(resB.pointsCredited >= 1);

      // 确认积分准确归属学生乙，而非学生甲
      const [scoreB] = await conn.query(
        "SELECT student_id FROM score_record WHERE request_key = ?",
        [requestKeyB]
      );
      assert.equal(scoreB[0].student_id, studentB.id, '积分必须记入学生乙名下');
    });

    // 总体断言
    assert.equal(checks.nextStudentUsesPreviousIdentity, false, '断言：下一名学生无残留上一位身份');
    assert.equal(checks.timeoutClearsSession, true, '断言：清屏与超时清除会话有效');
    assert.equal(checks.sharedDeviceDuplicateRewardCount, 0, '断言：公共设备重试无重复积分发奖');

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
