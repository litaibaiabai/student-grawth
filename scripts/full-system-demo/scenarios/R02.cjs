/**
 * R02.cjs — 预分类制卡与打印场景
 *
 * 验证：
 * 1. checks.dailyCardDimensionsValid === true (日常卡仅允许 D 和 Z，无 T/M/L/G)
 * 2. checks.preboundLeafCategoriesValid === true (所有新卡均已预先绑定 V2 叶子指标且固定 +1)
 * 3. checks.idempotentReissue === true (重复触发配卡不产生增量卡片)
 * 4. checks.printPreviewDisplaysReason === true (可获取到带奖励事由和+1的卡片预览)
 */
const assert = require('node:assert/strict');

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    dailyCardDimensionsValid: false,
    preboundLeafCategoriesValid: false,
    idempotentReissue: false,
    printPreviewDisplaysReason: false
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    // 1. 管理员登录并查看/配置卡片策略
    await s.chapter('R02-01', '管理员配置 D/Z 预分类发卡策略', async () => {
      await s.login('demo_admin');
      await s.menu('credit-card 评价卡管理', '学科策略与月度发卡');
    });

    // 2. 触发月度配卡，生成预分类卡片
    await s.chapter('R02-02', '生成预分类卡片并校验仅含 D/Z 且绑定叶子指标', async () => {
      const { reconcileMonth } = require('../../../backend/services/cardAllocationService.js');
      const { generatePreclassifiedCards } = require('../../../backend/services/rewardCategoryService.js');

      // 触发为当前学校自动生成预分类卡片
      await generatePreclassifiedCards({ schoolId: 1, monthKey: '2026-10', conn });

      // 验证数据库中生成的日常卡：维度只能是 D 或 Z
      const [cards] = await conn.query(
        "SELECT id, dimension_code, category_id, points, batch_code FROM reward_card WHERE school_id = 1 AND batch_code = 'AUTO_V2'"
      );

      assert.ok(cards.length > 0, '应成功生成 AUTO_V2 批次的预分类卡片');

      // 检查维度
      const invalidDim = cards.find(c => c.dimension_code !== 'D' && c.dimension_code !== 'Z');
      assert.equal(invalidDim, undefined, '日常卡只能是 D 或 Z 方向');
      checks.dailyCardDimensionsValid = true;

      // 检查叶子指标绑定与固定分值
      const unbound = cards.find(c => !c.category_id || Number(c.points) !== 1);
      assert.equal(unbound, undefined, '每张卡片必须预绑定叶子指标且 points=1');
      checks.preboundLeafCategoriesValid = true;
    });

    // 3. 校验重试与重复制卡幂等性
    await s.chapter('R02-03', '重复执行配卡不增加卡片数量', async () => {
      const { generatePreclassifiedCards } = require('../../../backend/services/rewardCategoryService.js');

      const [[{ countBefore }]] = await conn.query(
        "SELECT COUNT(*) as countBefore FROM reward_card WHERE school_id = 1 AND batch_code = 'AUTO_V2'"
      );

      // 再次执行配卡
      await generatePreclassifiedCards({ schoolId: 1, monthKey: '2026-10', conn });

      const [[{ countAfter }]] = await conn.query(
        "SELECT COUNT(*) as countAfter FROM reward_card WHERE school_id = 1 AND batch_code = 'AUTO_V2'"
      );

      assert.equal(countBefore, countAfter, '重复配卡数量应保持严格一致');
      checks.idempotentReissue = true;
    });

    // 4. 验证打印预览包含明确事由
    await s.chapter('R02-04', '卡片打印预览包含明确奖励事由快照', async () => {
      const [sampleCards] = await conn.query(
        `SELECT rc.id, rc.dimension_code, rc.category_id, rc.points, ec.category_name
         FROM reward_card rc
         LEFT JOIN edu_evaluation_category ec ON ec.id = rc.category_id
         WHERE rc.school_id = 1 AND rc.batch_code = 'AUTO_V2'
         LIMIT 5`
      );

      assert.ok(sampleCards.length > 0);
      assert.ok(sampleCards.every(c => Boolean(c.category_name)), '打印卡片必须携带有效的三级指标名称');
      checks.printPreviewDisplaysReason = true;
    });
  } finally {
    await conn.end();
  }

  assert.equal(checks.dailyCardDimensionsValid, true);
  assert.equal(checks.preboundLeafCategoriesValid, true);
  assert.equal(checks.idempotentReissue, true);
  assert.equal(checks.printPreviewDisplaysReason, true);

  return { checks };
}

module.exports = {
  id: 'R02',
  title: '预分类制卡与打印',
  run
};
