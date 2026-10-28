/**
 * renovation_p1_rollout.integration.test.js — 任务 20C: P1 全链路试点与历史对账集成测试
 *
 * 验证：
 * 1. P1 全链路业务链检查就绪
 * 2. 历史学期报告只读对账零漂移
 * 3. 外部未满足项如实标记预留，绝不虚假冒充完成
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

describe('Task 20C: P1 全链路试点与历史对账', () => {
  let connection;
  let testDbName;

  before(async () => {
    testDbName = 'test_renovation_rollout_' + Date.now();
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });

    await connection.query(`CREATE DATABASE \`${testDbName}\` DEFAULT CHARACTER SET utf8mb4`);
    await connection.query(`USE \`${testDbName}\``);

    const fs = require('fs');
    const root = path.resolve(__dirname, '../..');
    const fullSchema = fs.readFileSync(path.join(root, 'sql/00_full_schema.sql'), 'utf8')
      .replaceAll('`student_growth`', '`' + testDbName + '`');
    await connection.query(fullSchema);

    const { applyRegisteredMigrations } = require('../services/migrationRunner');
    require('../migrations/renovation');
    await applyRegisteredMigrations({ connection, databaseName: testDbName });
  });

  after(async () => {
    if (connection) {
      await connection.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
      await connection.end();
    }
  });

  test('1. verifyP1FullChain 验证全业务链表与依赖就绪', async () => {
    const rolloutService = require('../services/rolloutService');
    const status = await rolloutService.verifyP1FullChain({
      schoolId: 1,
      termId: 1,
      connection
    });

    assert.equal(status.p0LoopReady, true);
    assert.equal(status.evaluationEngineReady, true);
    assert.equal(status.reportPublishReady, true);
    assert.equal(status.kioskSessionReady, true);
    assert.equal(status.externalIdentityReserved, true);
  });

  test('2. reconcileHistoricReports 历史报告数据对账与校验和一致性', async () => {
    const rolloutService = require('../services/rolloutService');
    const recon = await rolloutService.reconcileHistoricReports({
      schoolId: 1,
      connection
    });

    assert.equal(recon.legacyReportsChanged, false);
    assert.equal(recon.reconciliationMatches, true);
  });

  test('3. getRolloutChecklist 确保预留功能如实标记未交付，不冒充完成', async () => {
    const rolloutService = require('../services/rolloutService');
    const checklist = await rolloutService.getRolloutChecklist({
      schoolId: 1,
      connection
    });

    assert.ok(checklist.length >= 20);
    const dingtalk = checklist.find(c => c.code === 'TASK_19');
    assert.ok(dingtalk);
    assert.equal(dingtalk.status, 'RESERVED');
    assert.equal(dingtalk.isReportedComplete, false);
  });
});
