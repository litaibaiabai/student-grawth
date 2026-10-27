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

// 12 AI 寄语任务与扩展位
const commentJobMigration = require('./12_comment_jobs');
registerMigration(commentJobMigration);

// 13 家长寄语与反馈记录
const familyFeedbackMigration = require('./13_family_feedback');
registerMigration(familyFeedbackMigration);

// 14 状态发布批次与版本冻结
const reportPublishMigration = require('./14_report_publish_jobs');
registerMigration(reportPublishMigration);

// 16 学生主题偏好与成长首页
const growthThemeMigration = require('./16_growth_theme');
registerMigration(growthThemeMigration);

// 17 学籍表导入与批次记录
const rosterImportMigration = require('./17_roster_imports');
registerMigration(rosterImportMigration);

// 18A 公共设备与受限短会话
const deviceSessionMigration = require('./18_device_sessions');
registerMigration(deviceSessionMigration);

module.exports = {
  initialized: true
};

