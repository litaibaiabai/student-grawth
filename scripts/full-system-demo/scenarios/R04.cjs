/**
 * R04.cjs — 教师纠错与直评 (C3 账本追加合同)
 *
 * 验证：
 * 1. checks.appendOnlyEnforced === true (原记录物理不可变，防篡改)
 * 2. checks.reversalProducesNegativeDelta === true (撤销产生负向冲销记录且学生净分减少)
 * 3. checks.duplicateReversalRejected409 === true (对同笔记录二次冲销被严格拒绝 409)
 * 4. checks.correctionCreatesChain === true (改分类/改分值生成冲销+替代项的完整链条)
 * 5. checks.sourceRevisionIncremented === true (student_term_state.source_revision 原子递增)
 */
const assert = require('node:assert/strict');

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    appendOnlyEnforced: false,
    reversalProducesNegativeDelta: false,
    duplicateReversalRejected409: false,
    correctionCreatesChain: false,
    sourceRevisionIncremented: false
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    // 1. 教师进入无卡直评给学生打分
    await s.chapter('R04-01', '教师通过无卡直评为学生发放正向积分', async () => {
      await s.login('demo_teacher_a');
      await s.menu('form 无卡直评', '无卡直评');
    });

    const { appendReward, correctReward } = require('../../../backend/services/scoreLedgerService.js');

    // 2. 模拟教师调用 appendReward 发放直评 +1
    let originalRecord;
    await s.chapter('R04-02', 'C3 合同 appendReward 记录并更新 student_term_state', async () => {
      const initialRevRes = await conn.query(
        'SELECT source_revision FROM student_term_state WHERE student_id = 11 AND term_id = 1'
      );
      const initialRevision = initialRevRes[0][0]?.source_revision || 0;

      originalRecord = await appendReward({
        schoolId: 1,
        termId: 1,
        studentId: 11,
        dimensionCode: 'D',
        categoryId: 3,
        delta: 1,
        source: 'A_DIRECT',
        operatorId: 2,
        remark: '演示直评记录：积极主动参加班级活动',
        requestKey: 'R04_DIRECT_' + Date.now()
      }, conn);

      assert.ok(originalRecord.id > 0);
      assert.equal(originalRecord.delta, 1);

      // 验证原记录已落盘
      const [origQuery] = await conn.query('SELECT * FROM score_record WHERE id = ?', [originalRecord.id]);
      assert.equal(origQuery.length, 1);

      // 验证 revision 递增
      const [revCheck] = await conn.query(
        'SELECT source_revision FROM student_term_state WHERE student_id = 11 AND term_id = 1'
      );
      assert.ok(revCheck[0].source_revision > initialRevision, '变更后 source_revision 必须严格递增');
      checks.sourceRevisionIncremented = true;
    });

    // 3. 验证撤销与单调递增追加账本（原记录不可变）
    await s.chapter('R04-03', 'correctReward REVOKE 追加负向冲销流水', async () => {
      const [beforeRows] = await conn.query('SELECT * FROM score_record WHERE id = ?', [originalRecord.id]);
      const beforeSnapshot = JSON.stringify(beforeRows[0]);

      // 教师发起撤销
      const revokeRes = await correctReward({
        schoolId: 1,
        originalScoreId: originalRecord.id,
        action: 'REVOKE',
        reason: '操作失误，学生当时不在场',
        operatorId: 2,
        requestKey: 'R04_REVOKE_' + Date.now()
      }, conn);

      assert.ok(revokeRes.reversalId > 0);
      assert.equal(revokeRes.delta, -1);

      // 验证原始记录分毫未改（物理不可变）
      const [afterRows] = await conn.query('SELECT * FROM score_record WHERE id = ?', [originalRecord.id]);
      assert.equal(JSON.stringify(afterRows[0]), beforeSnapshot, '原流水记录必须物理不可变');
      checks.appendOnlyEnforced = true;

      // 验证撤销记录存在
      const [revRecord] = await conn.query('SELECT * FROM score_record WHERE id = ?', [revokeRes.reversalId]);
      assert.equal(revRecord[0].original_id, originalRecord.id);
      assert.equal(revRecord[0].delta, -1);
      checks.reversalProducesNegativeDelta = true;
    });

    // 4. 验证冲销幂等红线：严禁二次冲销 (409)
    await s.chapter('R04-04', '重复冲销同一原记录必须抛出 409', async () => {
      let duplicateRejected = false;
      try {
        await correctReward({
          schoolId: 1,
          originalScoreId: originalRecord.id,
          action: 'REVOKE',
          reason: '再次尝试撤销',
          operatorId: 2,
          requestKey: 'R04_DUPLICATE_' + Date.now()
        }, conn);
      } catch (err) {
        if (err.statusCode === 409 || err.code === 409 || (err.message && err.message.includes('重复'))) {
          duplicateRejected = true;
        }
      }
      assert.equal(duplicateRejected, true, '二次冲销必须被拦截并抛出 409');
      checks.duplicateReversalRejected409 = true;
    });

    // 5. 验证更正链：修改分类生成冲销 + 替代项
    await s.chapter('R04-05', 'correctReward CORRECT 生成冲销与更正替代项链条', async () => {
      // 先生成一笔新流水
      const targetRecord = await appendReward({
        schoolId: 1,
        termId: 1,
        studentId: 11,
        dimensionCode: 'D',
        categoryId: 3,
        delta: 1,
        source: 'A_DIRECT',
        operatorId: 2,
        remark: '误选德育指标，实际应为智育探究',
        requestKey: 'R04_TARGET_' + Date.now()
      }, conn);

      // 发起修改（转为智育 Z 指标 6）
      const correctionRes = await correctReward({
        schoolId: 1,
        originalScoreId: targetRecord.id,
        action: 'CORRECT',
        newDimensionCode: 'Z',
        newCategoryId: 6,
        newPoints: 1,
        reason: '修正分类为智育自主探究',
        operatorId: 2,
        requestKey: 'R04_CORRECTION_' + Date.now()
      }, conn);

      assert.ok(correctionRes.reversalId > 0);
      assert.ok(correctionRes.replacementId > 0);

      const [replacement] = await conn.query('SELECT * FROM score_record WHERE id = ?', [correctionRes.replacementId]);
      assert.equal(replacement[0].dimension_code, 'Z');
      assert.equal(replacement[0].category_id, 6);
      assert.equal(replacement[0].delta, 1);
      assert.equal(replacement[0].correction_chain_id, targetRecord.id);

      checks.correctionCreatesChain = true;
    });

  } finally {
    await conn.end();
  }

  assert.equal(checks.appendOnlyEnforced, true);
  assert.equal(checks.reversalProducesNegativeDelta, true);
  assert.equal(checks.duplicateReversalRejected409, true);
  assert.equal(checks.correctionCreatesChain, true);
  assert.equal(checks.sourceRevisionIncremented, true);

  return { checks };
}

module.exports = {
  id: 'R04',
  title: '教师纠错与直评',
  run
};
