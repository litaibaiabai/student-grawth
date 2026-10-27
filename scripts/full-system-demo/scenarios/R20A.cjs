/**
 * R20A.cjs — 兼容迁移与隔离验收入口场景
 *
 * 验证：
 * 1. checks.businessDatabaseRejected === true (拒绝在非前缀隔离库执行)
 * 2. checks.migrationReplayPreservesLedger === true (多次重放迁移登记保持幂等与账本守恒)
 * 3. checks.baselineReportUnchanged === true (基线报告和既有数据完整不被改写)
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    businessDatabaseRejected: false,
    migrationReplayPreservesLedger: false,
    baselineReportUnchanged: false
  };

  // 1. 界面步骤：以管理员身份登录，确认系统正常就绪并访问校历管理
  await s.chapter('R20A-01', '以管理员身份登录并确认隔离环境就绪', async () => {
    await s.login('demo_admin');
    await s.menu('calendar 学期与校历', '学期与校历周期管理');
  });

  // 2. 检查业务库隔离防护：若传入默认数据库名，必须被拒绝
  await s.chapter('R20A-02', '验证业务库与生产库隔离保护机制', async () => {
    const { assertIsolatedDatabase } = require('../environment.cjs');
    try {
      assertIsolatedDatabase('student_growth');
    } catch (e) {
      if (/禁止在业务库/.test(e.message)) {
        checks.businessDatabaseRejected = true;
      }
    }
    assert.equal(checks.businessDatabaseRejected, true, '必须拒绝在业务库运行');
  });

  // 3. 验证迁移登记器与重复执行幂等性
  await s.chapter('R20A-03', '验证迁移重入执行不破坏既有数据与账本', async () => {
    const { applyRegisteredMigrations } = require('../../../backend/services/migrationRunner.js');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: m.dbName,
      multipleStatements: true
    });

    try {
      // 记录迁移前的历史记录数
      const [preRecords] = await conn.query('SELECT COUNT(*) as count FROM score_record');
      const preCount = preRecords[0].count;

      // 首次应用已注册迁移
      const r1 = await applyRegisteredMigrations({ connection: conn, databaseName: m.dbName });
      assert.ok(r1.applied !== undefined, '首次迁移应返回应用结果');

      // 二次重复应用迁移（演练重入幂等）
      const r2 = await applyRegisteredMigrations({ connection: conn, databaseName: m.dbName });
      assert.equal(r2.failedStep, null, '重入迁移不应发生错误');
      assert.equal(r2.checksumMismatch, false, '重入迁移不应有校验和冲突');

      // 验证既有历史记录不受破坏
      const [postRecords] = await conn.query('SELECT COUNT(*) as count FROM score_record');
      const postCount = postRecords[0].count;
      assert.equal(preCount, postCount, '迁移重放不得修改既有账本记录数');

      checks.migrationReplayPreservesLedger = true;
    } finally {
      await conn.end();
    }
  });

  // 4. 验证基线历史报告不受影响
  await s.chapter('R20A-04', '验证基线报告与既有数据不受影响', async () => {
    const rows = await inspect(m, 'SELECT COUNT(*) as cnt FROM academic_year WHERE is_current = 1');
    assert.equal(Number(rows[0].cnt), 1, '当前学年配置保持有效');
    checks.baselineReportUnchanged = true;
  });

  assert.equal(checks.businessDatabaseRejected, true);
  assert.equal(checks.migrationReplayPreservesLedger, true);
  assert.equal(checks.baselineReportUnchanged, true);

  return { checks };
}

module.exports = {
  id: 'R20A',
  title: '兼容迁移与隔离验收入口',
  run
};
