/**
 * categoryController.js — 六育三级评价指标体系控制器
 */

const { pool } = require("../db");
const { success } = require("../utils/response");

/**
 * GET /api/v1/evaluation-categories
 * 获取六育评价分类树形结构
 * 仅返回 status = 1 的有效指标
 */
async function getCategories(req, res, next) {
  let conn;
  try {
    conn = await pool.getConnection();

    const [rows] = await conn.query(
      `SELECT id, parent_id, category_level, category_code, category_name, score, description, sort_order, status, version
       FROM edu_evaluation_category
       WHERE status = 1
       ORDER BY category_level ASC, sort_order ASC, id ASC`
    );

    // 组装成三级树状结构
    const rootNodes = [];
    const nodeMap = new Map();

    for (const row of rows) {
      const dimCode = (row.category_code || "D").charAt(0);
      nodeMap.set(row.id, {
        id: row.id,
        parentId: row.parent_id,
        level: row.category_level,
        code: row.category_code,
        name: row.category_name,
        category_code: row.category_code,
        category_name: row.category_name,
        category_level: row.category_level,
        dimension_code: dimCode,
        dimensionCode: dimCode,
        score: row.score,
        description: row.description,
        sortOrder: row.sort_order,
        version: row.version,
        children: []
      });
    }

    for (const row of rows) {
      const node = nodeMap.get(row.id);
      if (row.category_level === 1 || row.parent_id === 0) {
        rootNodes.push(node);
      } else {
        const parent = nodeMap.get(row.parent_id);
        if (parent) {
          parent.children.push(node);
        }
      }
    }

    success(res, rootNodes);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  getCategories
};
