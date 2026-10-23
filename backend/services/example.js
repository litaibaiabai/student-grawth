/**
 * 示例服务层（纯示例版本）
 *
 * 本文件仅作为模板示范，返回 mock 数据。
 * 接入真实数据库时，请参考下方注释中的模式替换即可。
 *
 * 真实查询模式（需引入 db）：
 *
 *   const db = require("../db");
 *
 *   async getList(params) {
 *     let sql = "SELECT * FROM your_table WHERE 1=1";
 *     const values = [];
 *     if (params.someField) {
 *       sql += " AND some_field = ?";
 *       values.push(params.someField);
 *     }
 *     const [rows] = await db.execute(sql, values);
 *     return rows;
 *   }
 */

class ExampleService {
  /**
   * 获取示例列表
   * @param {Object} params - 查询参数（当前忽略，仅演示）
   * @returns {Array} mock 数据数组
   */
  async getList(params = {}) {
    // 🖐️ 替换为真实 DB 查询即可
    return [
      { id: 1, name: "示例 A", role: "admin", createdAt: "2024-01-01" },
      { id: 2, name: "示例 B", role: "user",  createdAt: "2024-01-02" },
      { id: 3, name: "示例 C", role: "user",  createdAt: "2024-01-03" },
    ];
  }

  /**
   * 根据 ID 获取示例
   * @param {number|string} id
   * @returns {Object|null} mock 对象或 null
   */
  async getById(id) {
    // 🖐️ 替换为真实 DB 查询即可
    if (id == 1) {
      return { id: 1, name: "示例 A", role: "admin", createdAt: "2024-01-01" };
    }
    if (id == 2) {
      return { id: 2, name: "示例 B", role: "user", createdAt: "2024-01-02" };
    }
    return null;
  }
}

module.exports = new ExampleService();
