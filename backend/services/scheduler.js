/**
 * scheduler.js — 系统定时任务与消息投递守护服务
 */

const { pool } = require("../db");
const { getMonthKey } = require("../utils/monthKey");
const { logger } = require("../utils/logger");
const { reconcileMonth } = require('./cardAllocationService');
const {schoolTimestamp}=require('./cardRules');
const {processPrintJobs}=require('./cardPrintService');

/**
 * 卡片自然月过期任务
 * 未申领卡按申领截止到期，待审卡按最终审核截止到期。
 */
async function expireOldCards(now=new Date()) {
  const stamp=schoolTimestamp(now);
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [cards]=await conn.query(`SELECT c.id,c.status,cl.id claim_id FROM reward_card c JOIN academic_year t ON c.term_id=t.id LEFT JOIN card_claim cl ON cl.card_id=c.id AND cl.status='PENDING'
      WHERE c.is_legacy_test=0 AND ((c.status='UNUSED' AND LEAST(c.valid_until,COALESCE(t.review_deadline_at,c.valid_until))<?)
      OR (c.status='PENDING' AND LEAST(COALESCE(c.review_deadline_at,c.valid_until),COALESCE(t.review_deadline_at,c.review_deadline_at,c.valid_until))<?)) FOR UPDATE`,[stamp,stamp]);
    for(const card of cards){
      if(card.claim_id) await conn.query("UPDATE card_claim SET status='EXPIRED' WHERE id=? AND status='PENDING'",[card.claim_id]);
      await conn.query("UPDATE reward_card SET status='EXPIRED' WHERE id=? AND status IN ('UNUSED','PENDING')",[card.id]);
    }
    await conn.commit();
    return cards.length;
  } catch (err) {
    if(conn)await conn.rollback();
    console.error("❌ 卡片过期定时任务执行失败:", err.code||err.name);
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
  const reconcile=()=>reconcileMonth().catch(e=>console.error('自动发卡任务失败:',e.code||e.name));
  reconcile();
  setInterval(reconcile,60*1000);
  const prints=()=>processPrintJobs().catch(e=>console.error('打印任务重试失败:',e.code||e.name));
  prints();
  setInterval(prints,60*1000);

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
