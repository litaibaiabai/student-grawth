/**
 * backend/migrations/renovation/index.js
 *
 * 改造工程迁移注册入口
 * 各开发票通过此文件或向 migrationRunner 注册独立的增量迁移步骤
 */
const { registerMigration } = require('../../services/migrationRunner');

// 20A 基础迁移：确保迁移登记表及隔离前缀兼容
registerMigration({
  id: '20A_migration_registry_baseline',
  checksum: '20a_baseline_v1',
  up: async (connection) => {
    await connection.query('SELECT 1');
  }
});

// 01 任教授权与学期状态迁移
const authMigration = require('./01_authorization');
registerMigration(authMigration);

// 02 预分类制卡与固定分值
const cardMigration = require('./02_classified_cards');
registerMigration(cardMigration);

// 04 账本追加合同与纠错
const ledgerMigration = require('./04_reward_ledger');
registerMigration(ledgerMigration);

// 05 荣誉认定与奖励
const honorMigration = require('./05_honor_awards');
registerMigration(honorMigration);

// 06 故事建议与终审
const storyMigration = require('./06_story_review');
registerMigration(storyMigration);

// 07 年级指标与教师评价
const indicatorMigration = require('./07_report_indicators');
registerMigration(indicatorMigration);

// 08 学科成绩导入
const subjectImportMigration = require('./08_subject_imports');
registerMigration(subjectImportMigration);

// 09 体测与健康导入
const healthMigration = require('./09_health_values');
registerMigration(healthMigration);

// 10 自动六育评价快照
const evaluationMigration = require('./10_evaluation_versions');
registerMigration(evaluationMigration);

// 11 报告草稿与教师确认
const reportDraftMigration = require('./11_report_drafts');
registerMigration(reportDraftMigration);

module.exports = {
  initialized: true
};

