/**
 * scheduler.js — 系统定时任务与消息投递守护服务
 */

const { pool } = require("../db");
const { getMonthKey } = require("../utils/monthKey");
const { logger } = require("../utils/logger");

/**
 * 卡片自然月过期任务
 * 将所有历史月份未申领的 ACTIVE 卡片原子批量置为 EXPIRED
 */
async function expireOldCards() {
  const currentMonth = getMonthKey(new Date());
  let conn;
  try {
    conn = await pool.getConnection();
    const [result] = await conn.query(
      `UPDATE reward_card
       SET status = 'EXPIRED'
       WHERE status = 'ACTIVE' AND month_key < ?`,
      [currentMonth]
    );

    if (result.affectedRows > 0) {
      console.log(`⏰ [定时任务] 已将 ${result.affectedRows} 张超期实体卡置为 EXPIRED (当前月: ${currentMonth})`);
    }
    return result.affectedRows;
  } catch (err) {
    console.error("❌ 卡片过期定时任务执行失败:", err.message);
    return 0;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Transactional Outbox 消息队列投递守护
 */
async function processNotificationOutbox() {
  let conn;
  try {
    conn = await pool.getConnection();

    // 查待发送消息
    const [messages] = await conn.query(
      `SELECT id, payload, retry_count
       FROM notification_outbox
       WHERE status = 'PENDING' AND retry_count < 5
       LIMIT 20`
    );

    for (const msg of messages) {
      try {
        // 模拟外部通知渠道发送（钉钉/短信/站内信）
        // console.log(`📨 [Outbox] 发送通知 #${msg.id}:`, msg.payload);
        await conn.query("UPDATE notification_outbox SET status = 'SENT', sent_at = NOW() WHERE id = ?", [msg.id]);
      } catch (sendErr) {
        await conn.query(
          "UPDATE notification_outbox SET retry_count = retry_count + 1, last_error = ? WHERE id = ?",
          [sendErr.message, msg.id]
        );
      }
    }
  } catch (err) {
    // 忽略守护错误
  } finally {
    if (conn) conn.release();
  }
}

/**
 * 启动系统定时任务轮询
 */
function startSchedulers() {
  if (process.env.NODE_ENV === "test") return;

  console.log("⏱️ 后台调度器与 Outbox 投递守护服务已启动");
  // 启动即执行一次卡片检查
  expireOldCards();

  // 每 10 分钟检查一次超期卡片
  setInterval(expireOldCards, 10 * 60 * 1000);

  // 每 30 秒执行一次 Outbox 投递
  setInterval(processNotificationOutbox, 30 * 1000);
}

module.exports = {
  expireOldCards,
  processNotificationOutbox,
  startSchedulers
};
