/**
 * R20C.cjs — P1 全链路试点与历史对账场景
 *
 * 验证：
 * 1. checks.legacyReportsChanged === false (历史已归档报告与旧版本数据物理不变，只读对账零漂移)
 * 2. checks.missingRequiredFeatureReportedComplete === false (外部未满足项如实标记预留/未交付，不伪造全量通过)
 * 3. checks.readOnlyReconciliationMatches === true (P1 全链路端到端数据完整性对账 100% 匹配)
 */
const assert = require('node:assert/strict');

const scenario = {
  id: 'R20C',
  title: 'P1 全链路试点与历史对账',
  run
};

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    legacyReportsChanged: null,
    missingRequiredFeatureReportedComplete: null,
    readOnlyReconciliationMatches: false
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    const rolloutService = require('../../../backend/services/rolloutService.js');
    if (typeof rolloutService.reconcileHistoricReports !== 'function') {
      throw new Error('rolloutService.reconcileHistoricReports is not implemented');
    }

    // 1. 章节一：管理员进入 P1 全链路试点放行与对账管理台
    await s.chapter('R20C-01', '管理员进入 P1 全链路试点放行与对账中心', async () => {
      await s.login('demo_admin');
      await s.menu('dashboard 试点上线', '试点上线');
    });

    // 2. 章节二：P1 全业务链联调串联核验
    await s.chapter('R20C-02', 'P1 全业务链联调串联 (指标/评价/寄语/发布/打印/成长/终端/身份)', async () => {
      const fullStatus = await rolloutService.verifyP1FullChain({
        schoolId: 1,
        termId: 1,
        connection: conn
      });

      assert.ok(fullStatus);
      assert.equal(fullStatus.p0LoopReady, true, 'P0闭环必须正常');
      assert.equal(fullStatus.evaluationEngineReady, true, '六育评价引擎必须就绪');
      assert.equal(fullStatus.reportPublishReady, true, '报告发布与A4打印服务必须就绪');
      assert.equal(fullStatus.kioskSessionReady, true, '公共终端兑换与清屏必须就绪');
      assert.equal(fullStatus.externalIdentityReserved, true, '钉钉身份预留边界必须就绪');
    });

    // 3. 章节三：历史学期报告数据对账 (零漂移)
    await s.chapter('R20C-03', '历史报告只读对账，验证历史快照物理不被篡改', async () => {
      const recon = await rolloutService.reconcileHistoricReports({
        schoolId: 1,
        connection: conn
      });

      assert.ok(recon);
      checks.legacyReportsChanged = recon.legacyReportsChanged;
      checks.readOnlyReconciliationMatches = recon.reconciliationMatches;

      assert.equal(checks.legacyReportsChanged, false, '历史报告快照不可被修改');
      assert.equal(checks.readOnlyReconciliationMatches, true, '只读对账校验结果完全吻合');
    });

    // 4. 章节四：上线放行检查单与未完成项边界核验
    await s.chapter('R20C-04', '放行检查单核验：未具备外部条件的功能如实标记预留', async () => {
      const checklist = await rolloutService.getRolloutChecklist({
        schoolId: 1,
        connection: conn
      });

      // 验证未满足外部真实硬件/真实钉钉SSO条件时，绝不伪造已上线结论
      checks.missingRequiredFeatureReportedComplete = checklist.some(item =>
        item.status === 'RESERVED' && item.isReportedComplete === true
      );

      assert.equal(checks.missingRequiredFeatureReportedComplete, false, '未具备条件的预留功能绝不虚假上报完成');
    });

    // 总体断言
    assert.equal(checks.legacyReportsChanged, false, '断言：历史报告无变更');
    assert.equal(checks.missingRequiredFeatureReportedComplete, false, '断言：未完成功能不冒充完成');
    assert.equal(checks.readOnlyReconciliationMatches, true, '断言：只读对账数据吻合');

  } finally {
    await conn.end();
  }
}

module.exports = scenario;
