/**
 * regression_20261026.test.js
 * 针对 20261026 回归测试报告中 35 项缺陷与接口契约问题的专项自动化回归测试套件
 */

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../db");

// 引入被测控制器
const termController = require("../controllers/termController");
const cardController = require("../controllers/cardController");
const evaluationController = require("../controllers/evaluationController");
const honorController = require("../controllers/honorController");
const scoreController = require("../controllers/scoreController");
const reportController = require("../controllers/reportController");
const importController = require("../controllers/importController");

// 辅助 mock 响应对象
function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(key, val) {
      this.headers[key] = val;
      return this;
    },
    send(content) {
      this.data = content;
      return this;
    }
  };
  return res;
}

describe("20261026 回归测试缺陷专项契约测试", () => {
  let originalGetConnection;
  let originalQuery;
  let mockConn;
  let executedQueries = [];

  beforeEach(() => {
    executedQueries = [];
    const queryHandler = async (sql, params = []) => {
      executedQueries.push({ sql, params });

      if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
      // 模拟当前活跃学期查询
      if (sql.includes("FROM academic_year") && sql.includes("is_current = 1")) {
        return [[{ id: 1, academic_year: "2026-2027", semester: 1, is_current: 1, active: 1, start_date: "2026-09-01", end_date: "2027-01-31" }]];
      }
      // 模拟全部学期列表
      if (sql.includes("FROM academic_year")) {
        return [[
          { id: 1, school_id: 1, academic_year: "2026-2027", semester: 1, is_current: 1, active: 1, start_date: "2026-09-01", end_date: "2027-01-31" }
        ]];
      }
      // 模拟指标查询
      if(sql.includes('FROM edu_evaluation_category leaf')){
        return [[{id:7,category_code:'D01-01',category_name:'主动礼貌问候',category_level:3,score:1,status:1,version:'V1',parent_id:6,parent_code:'D01',parent_name:'文明礼貌',parent_level:2,parent_status:1,parent_version:'V1',root_id:1,root_code:'D',root_name:'德育',root_level:1,root_status:1,root_version:'V1'}]];
      }
      if (sql.includes("FROM edu_evaluation_category")) {
        return [[{ id: 7, category_code: "D01-01", category_name: "主动礼貌问候", score: 1, category_level: 3, status: 1 }]];
      }
      // 模拟最大序号查询
      if (sql.includes("MAX(serial_no)")) {
        return [[{ max_s: 110 }]];
      }
      // 模拟用户/学生查询
      if (sql.includes("FROM users")) {
        return [[
          { id: 4, username: "student1", real_name: "王小明", grade: 4, class_no: 1, status: 0, role: "student", school_id: 1 },
          { id: 2, username: "teacher1", real_name: "张老师", role: "teacher", school_id: 1 }
        ]];
      }
      // 模拟卡片锁定查询
      if (sql.includes("FROM reward_card") && sql.includes("FOR UPDATE")) {
        return [[{ id: 110, school_id: 1, term_id: 1, month_key: "2026-10", status: "UNUSED", category_id: 7 }]];
      }
      // 模拟申领单锁定查询
      if (sql.includes("FROM card_claim") && sql.includes("FOR UPDATE")) {
        return [[{ id:701,school_id:1,card_school_id:1,card_id:110,student_id:4,status:'PENDING',card_status:'PENDING',teacher_id:2,term_id:1,dimension_code:'D',is_legacy_test:0,allocation_id:1,allocation_category_version:'V1',effective_review_deadline:'2099-01-03 23:59:59',category_id:null,grade:4,class_no:1 }]];
      }
      // 模拟荣誉查询
      if (sql.includes("FROM honor_record") && sql.includes("FOR UPDATE")) {
        return [[{ id: 1, school_id:1,student_id:4,status: "PENDING", honor_points: 3 }]];
      }
      if (sql.includes("SELECT honor_points FROM honor_record")) {
        return [[{ honor_points: 3 }]];
      }
      // 模拟故事查询
      if (sql.includes("FROM story_submission")) {
        return [[{ id: 10, current_version: 1, status: "REVIEWED", teacher_score: 85 }]];
      }
      // 模拟综合评价规则
      if (sql.includes("FROM comprehensive_score_rule")) {
        return [[{ id: 1, rule_version: "V1.0", six_weight: 0.8, process_weight: 0.15, honor_weight: 0.05, process_target: 20, honor_target: 12 }]];
      }
      // 模拟过程分求和与荣誉分求和
      if (sql.includes("total_process") || sql.includes("SUM(delta)")) {
        return [[{ total_process: 5 }]];
      }
      if (sql.includes("total_honor") || sql.includes("SUM(honor_points)")) {
        return [[{ total_honor: 3 }]];
      }
      if (sql.includes("MAX(version)")) {
        return [[{ max_v: 1 }]];
      }
      // 模拟六育维度分数
      if (sql.includes("FROM student_dimension_score")) {
        return [[
          { dimension_code: "D", score_100: 95 },
          { dimension_code: "Z", score_100: 90 },
          { dimension_code: "T", score_100: 88 },
          { dimension_code: "M", score_100: 92 },
          { dimension_code: "L", score_100: 94 },
          { dimension_code: "G", score_100: 96 }
        ]];
      }
      // 模拟学科/荣誉快照
      if (sql.includes("FROM subject_score")) {
        return [[{ subject_code: "CHINESE", subject_name: "语文", raw_score: 95 }]];
      }
      // 模拟期末报告
      if (sql.includes("FROM term_report")) {
        return [[
          {
            id: 101,
            school_id: 1,
            student_id: 4,
            term_id: 1,
            version: 1,
            comprehensive_score: 92.5,
            comprehensive_grade: "优秀",
            academic_year: "2026-2027",
            semester: 1,
            status: "PUBLISHED",
            snapshot_json: JSON.stringify({
              evaluation: { comprehensiveScore: 92.5, dimensions: { D: 95, Z: 90, T: 88, M: 92, L: 94, G: 96 } }
            })
          }
        ]];
      }
      // 模拟卡片配额规则查询
      if (sql.includes("FROM card_quota_rule")) {
        return [[{
          id: 1,
          school_id: 1,
          term_id: 1,
          month_key: "2026-10",
          teacher_id: 2,
          teacher_name: "张老师",
          quota_n: 50,
          allocation_json: JSON.stringify({ D: 10, Z: 10, T: 10, M: 10, L: 5, G: 5 }),
          created_at: "2026-10-22",
          updated_at: "2026-10-22"
        }]];
      }
      // 默认插入返回 insertId
      return [{ insertId: 999, affectedRows: 1 }];
    };

    mockConn = {
      query: queryHandler,
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    };

    originalGetConnection = pool.getConnection;
    originalQuery = pool.query;
    pool.getConnection = async () => mockConn;
    pool.query = queryHandler;
  });

  afterEach(() => {
    pool.getConnection = originalGetConnection;
    pool.query = originalQuery;
  });

  // ---------------------------------------------------------
  // 1. 学期与校历模块 (/admin/terms)
  // ---------------------------------------------------------
  test("1.1 saveTerm 支持 term_name 自动解构学年与学期", async () => {
    const req = {
      body: {
        term_name: "2027-2028学年第一学期",
        start_date: "2027-09-01",
        end_date: "2028-01-31",
        is_current: 0
      },
      user: { id: 1, schoolId: 1, role: "manager" }
    };
    const res = createMockRes();

    await termController.saveTerm(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.code, 200);
    assert.equal(res.data.data.academicYear, "2027-2028");
    assert.equal(res.data.data.semester, 1);
    assert.equal(res.data.data.startDate, "2027-09-01");
  });

  test("1.2 saveTerm 缺少必填字段时返回友好 422 提示", async () => {
    const req = {
      body: {},
      user: { id: 1, schoolId: 1, role: "manager" }
    };
    const res = createMockRes();

    await termController.saveTerm(req, res, () => {});

    assert.equal(res.statusCode, 422);
    assert.equal(res.data.code, 422);
    assert.match(res.data.message, /学年、学期、起止日期均为必填项/);
  });

  test("1.3 getTerms 包含 term_name、termName、status 等展示所需字段", async () => {
    const req = { user: { schoolId: 1 } };
    const res = createMockRes();

    await termController.getTerms(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.data.data));
    const term = res.data.data[0];
    assert.equal(term.term_name, "2026-2027学年第一学期");
    assert.equal(term.termName, "2026-2027学年第一学期");
    assert.equal(term.status, "ACTIVE");
    assert.equal(term.isCurrent, true);
  });

  test("1.4 saveTerm 未显式传入起止日期时自动按中国小学校历标准推导默认日期", async () => {
    // 验证第1学期（秋季学期）自动推导为 9月1日 ~ 次年1月31日
    const reqTerm1 = {
      body: {
        academic_year: "2028-2029",
        semester: 1
      },
      user: { id: 1, schoolId: 1, role: "manager" }
    };
    const resTerm1 = createMockRes();
    await termController.saveTerm(reqTerm1, resTerm1, (err) => { if (err) throw err; });

    assert.equal(resTerm1.statusCode, 200);
    assert.equal(resTerm1.data.data.startDate, "2028-09-01");
    assert.equal(resTerm1.data.data.endDate, "2029-01-31");

    // 验证第2学期（春季学期）自动推导为 2月20日 ~ 7月15日
    const reqTerm2 = {
      body: {
        academic_year: "2028-2029",
        semester: 2
      },
      user: { id: 1, schoolId: 1, role: "manager" }
    };
    const resTerm2 = createMockRes();
    await termController.saveTerm(reqTerm2, resTerm2, (err) => { if (err) throw err; });

    assert.equal(resTerm2.statusCode, 200);
    assert.equal(resTerm2.data.data.startDate, "2029-02-20");
    assert.equal(resTerm2.data.data.endDate, "2029-07-15");
  });

  // ---------------------------------------------------------
  // 2. 评价卡管理模块 (/admin/cards, /admin/card-quotas)
  // ---------------------------------------------------------
  test("2.1 旧逐教师配额写入已退役", async () => {
    const req = {
      body: {
        teacher_id: 2,
        month_key: "2026-10",
        quota_count: 30,
        allocations: [{ code: "D01-01", count: 30 }]
      },
      user: { id: 1, schoolId: 1, role: "manager" }
    };
    const res = createMockRes();

    await cardController.setCardQuota(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode,410);
    assert.equal(res.data.code,410);
    assert.equal(res.data.data,null);
  });

  test("2.2 旧手工制卡不再生成令牌", async () => {
    const req = {
      body: {
        category_id: 7,
        teacher_id: 2,
        count: 2,
        month_key: "2026-10"
      },
      user: { id: 1, schoolId: 1, role: "manager" }
    };
    const res = createMockRes();

    await cardController.generateMonthCards(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode,410);
    assert.equal(res.data.data,null);
  });

  test("2.3 decideClaim 兼容 APPROVE/APPROVED/通过 多种决策输入", async () => {
    for (const dec of ["APPROVE", "APPROVED", "通过"]) {
      const req = {
        params: { id: "701" },
        body: {decision:dec,categoryId:7},
        user: { id: 2, schoolId: 1, role: "teacher" }
      };
      const res = createMockRes();

      await cardController.decideClaim(req, res, (err) => { if (err) throw err; });
      assert.equal(res.statusCode, 200, `决策 ${dec} 应该成功`);
      assert.equal(res.data.data.claimStatus, "APPROVED");
      assert.equal(res.data.data.decision, "APPROVE");
    }
  });

  // ---------------------------------------------------------
  // 3. 综合评价规则模块 (/admin/evaluation-rules)
  // ---------------------------------------------------------
  test("3.1 saveRule 百分比权重转换、自动学期回退及 ON DUPLICATE KEY UPDATE 兼容", async () => {
    const req = {
      body: {
        rule_name: "V_20261026_TEST",
        weight_b: 80,
        weight_p: 15,
        weight_h: 5,
        process_target: 20,
        honor_target: 12
      },
      user: { id: 1, schoolId: 1, role: "manager" }
    };
    const res = createMockRes();

    await evaluationController.saveRule(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.code, 200);
    assert.equal(res.data.data.ruleVersion, "V_20261026_TEST");

    // 检查插入 SQL 包含 ON DUPLICATE KEY UPDATE
    const ruleInsert = executedQueries.find((q) => q.sql.includes("comprehensive_score_rule") && q.sql.includes("INSERT"));
    assert.ok(ruleInsert, "应执行规则插入");
    assert.ok(ruleInsert.sql.includes("ON DUPLICATE KEY UPDATE"), "必须包含 ON DUPLICATE KEY UPDATE 避免 500");
  });

  // ---------------------------------------------------------
  // 4. 荣誉审核模块 (/teacher/honors)
  // ---------------------------------------------------------
  test("4.1 submitHonor 修复 eventTitle 未定义错误", async () => {
    const req = {
      body: {
        title: "全国中小学人工智能创新挑战赛",
        awardLevel: "CITY",
        prizeLevel: "FIRST",
        awardDate: "2026-10-15"
      },
      user: { id: 4, schoolId: 1, role: "student" }
    };
    const res = createMockRes();

    await honorController.submitHonor(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.code, 200);
    assert.equal(res.data.data.status, "PENDING");
  });

  test("4.2 reviewHonor 容错 APPROVE / APPROVED / REJECT / REJECTED", async () => {
    for (const dec of ["APPROVE", "APPROVED"]) {
      const req = {
        params: { id: "1" },
        body: { decision: dec },
        user: { id: 2, schoolId: 1, role: "teacher",classes:[{grade:4,class_no:1}] }
      };
      const res = createMockRes();
      await honorController.reviewHonor(req, res, (err) => { if (err) throw err; });
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.data.status, "APPROVED");
    }

    for (const dec of ["REJECT", "REJECTED"]) {
      const req = {
        params: { id: "1" },
        body: { decision: dec, rejectReason: "材料模糊" },
        user: { id: 2, schoolId: 1, role: "teacher",classes:[{grade:4,class_no:1}] }
      };
      const res = createMockRes();
      await honorController.reviewHonor(req, res, (err) => { if (err) throw err; });
      assert.equal(res.statusCode, 200);
      assert.equal(res.data.data.status, "REJECTED");
    }
  });

  // ---------------------------------------------------------
  // 5. 无卡直评发分模块 (/teacher/scores/direct-batch)
  // ---------------------------------------------------------
  test("5.1 directScoreBatch 兼容 student_ids 与 category_id，正确记录审计", async () => {
    const req = {
      body: {
        student_ids: [4],
        category_id: 7,
        remark: "日常热心助人"
      },
      user: { id: 2, schoolId: 1, role: "teacher", classes: [{ grade: 4, class_no: 1 }] }
    };
    const res = createMockRes();

    await scoreController.directScoreBatch(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.code, 200);
    assert.equal(res.data.data.count, 1);

    // 检查 operation_audit 表操作
    const auditInsert = executedQueries.find((q) => q.sql.includes("operation_audit"));
    assert.ok(auditInsert, "必须写入 operation_audit 审计表");
  });

  // ---------------------------------------------------------
  // 6. 成绩导入比对模块 (/import/preview)
  // ---------------------------------------------------------
  test("6.1 previewImport 兼容 items 与 records 数组入参，杜绝 422", async () => {
    const sampleItems = [
      { studentId: 4, subjectCode: "CHINESE", score: 95 }
    ];

    // 测试 items
    const req1 = {
      body: { type: "SUBJECT", items: sampleItems },
      user: { schoolId: 1 }
    };
    const res1 = createMockRes();
    await importController.previewImport(req1, res1, (err) => { if (err) throw err; });
    assert.equal(res1.statusCode, 200);
    assert.equal(res1.data.data.diffs.length, 1);

    // 测试 records 别名
    const req2 = {
      body: { type: "SUBJECT", records: sampleItems },
      user: { schoolId: 1 }
    };
    const res2 = createMockRes();
    await importController.previewImport(req2, res2, (err) => { if (err) throw err; });
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.data.data.diffs.length, 1);
  });

  // ---------------------------------------------------------
  // 7. 报告批量发布与当前报告查询 (/admin/reports, /student/reports)
  // ---------------------------------------------------------
  test("7.1 publishBatch 支持 student_ids 别名并自动查寻当前学期", async () => {
    const req = {
      body: {
        student_ids: [4]
      },
      user: { id: 1, schoolId: 1, role: "manager" }
    };
    const res = createMockRes();

    await reportController.publishBatch(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.code, 200);
    assert.equal(res.data.data.total, 1);
  });

  test("7.2 getCurrentReport 在无 termId 时自动使用当前活跃学期", async () => {
    const req = {
      query: {},
      user: { id: 4, schoolId: 1, role: "student" }
    };
    const res = createMockRes();

    await reportController.getCurrentReport(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.code, 200);
    assert.equal(res.data.data.studentId, 4);
    assert.equal(res.data.data.comprehensiveScore, 92.5);
  });

  // ---------------------------------------------------------
  // 8. 20261026 有头模式缺陷针对性回归测试
  // ---------------------------------------------------------
  test("8.1 setCurrentTerm 成功将指定学期设为当前学期并清除其他学期当前标记", async () => {
    const req = {
      params: { id: "2" },
      user: { schoolId: 1, id: 1 }
    };
    const res = createMockRes();

    await termController.setCurrentTerm(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.code, 200);
    assert.equal(res.data.data.termId, 2);

    // 验证更新 SQL 执行了两次（一次重置，一次设置）
    const resetCurrent = executedQueries.find((q) => q.sql.includes("UPDATE academic_year SET is_current = 0"));
    const setCurrent = executedQueries.find((q) => q.sql.includes("UPDATE academic_year SET is_current = 1, active = 1"));
    assert.ok(resetCurrent, "必须清除原当前学期标记");
    assert.ok(setCurrent, "必须设置新当前学期标记");
  });

  test("8.2 saveTerm 支持通过 req.params.id 更新学期数据", async () => {
    const req = {
      params: { id: "3" },
      body: {
        academic_year: "2027-2028",
        semester: 2,
        start_date: "2028-02-20",
        end_date: "2028-07-15",
        is_current: false
      },
      user: { schoolId: 1, id: 1 }
    };
    const res = createMockRes();

    await termController.saveTerm(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.code, 200);
    assert.equal(res.data.data.id, 3);

    const updateQuery = executedQueries.find((q) => q.sql.includes("UPDATE academic_year"));
    assert.ok(updateQuery, "必须执行 UPDATE academic_year 语句");
  });

  test("8.3 旧配额查询明确提示迁移至只读分配", async () => {
    const req = {
      user: { schoolId: 1, id: 1 }
    };
    const res = createMockRes();

    await cardController.getCardQuotas(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode,410);
    assert.equal(res.data.code,410);
    assert.equal(res.data.data,null);
  });

  test("8.4 previewImport 教师角色导入 DIMENSION 维度终测分必须被拦截 (403)", async () => {
    const req = {
      body: {
        type: "DIMENSION",
        items: [{ studentId: 4, dimension: "D", score: 95 }]
      },
      user: { schoolId: 1, id: 2, role: "teacher" }
    };
    const res = createMockRes();

    await importController.previewImport(req, res, (err) => {
      assert.ok(err, "教师导入终测分应被阻断");
      assert.equal(err.status, 403);
      assert.ok(err.message.includes("管理员"));
    });
  });

  test("8.5 previewImport 六育终测分展示清晰的维度标签而非'五育维度分'", async () => {
    const req = {
      body: {
        type: "DIMENSION",
        items: [
          { studentId: 4, dimension: "D", score: 95 },
          { studentId: 4, dimension: "G", score: 96 }
        ]
      },
      user: { schoolId: 1, id: 1, role: "manager" }
    };
    const res = createMockRes();

    await importController.previewImport(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    const diffs = res.data.data.diffs;
    assert.equal(diffs.length, 2);
    assert.equal(diffs[0].target, "【D】德育终测分");
    assert.equal(diffs[1].target, "【G】生活故事终测分");
  });

  test("8.6 教师也无法访问已退役的旧配额入口", async () => {
    const req = {
      user: { schoolId: 1, id: 2, role: "teacher" },
      query: {}
    };
    const res = createMockRes();

    await cardController.getCardQuotas(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode,410);
    assert.equal(res.data.data,null);
  });

  test("8.7 setCurrentTerm 成功将操作记录落盘至 operation_audit", async () => {
    const req = {
      params: { id: "1" },
      user: { schoolId: 1, id: 10, role: "manager" }
    };
    const res = createMockRes();

    await termController.setCurrentTerm(req, res, (err) => { if (err) throw err; });

    assert.equal(res.statusCode, 200);
    const auditRecord = executedQueries.find((q) => q.sql.includes("INSERT INTO operation_audit") && q.sql.includes("SET_CURRENT_TERM"));
    assert.ok(auditRecord, "必须记录 SET_CURRENT_TERM 审计留痕");
    assert.equal(auditRecord.params[1], 10, "操作人 ID 必须准确记录");
  });
});
