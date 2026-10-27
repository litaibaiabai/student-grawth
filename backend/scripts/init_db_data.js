/**
 * init_db_data.js — 初始化 student_growth 基础数据
 * 包括：学期、三角色测试账号、六育三级评价指标树
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const bcrypt = require("bcrypt");
const { pool } = require("../db");

async function init() {
  const conn = await pool.getConnection();
  try {
    console.log("🚀 开始初始化数据库数据...");

    // 1. 初始化学期 (academic_year)
    await conn.query(`
      INSERT INTO academic_year (id, school_id, academic_year, semester, start_date, end_date, is_current, active, effective_at)
      VALUES (1, 1, '2026-2027', 1, '2026-09-01', '2027-01-31', 1, 1, NOW())
      ON DUPLICATE KEY UPDATE is_current = 1, active = 1;
    `);
    console.log("✅ 默认当前学期 (2026-2027 第1学期) 就绪");

    // 2. 初始化三角色用户 (users)
    const pwHash = await bcrypt.hash("123456", 10);
    const adminPwHash = await bcrypt.hash("admin123", 10);

    const users = [
      { id: 1, school_id: 1, username: "admin", password: adminPwHash, role: "manager", real_name: "系统管理员", grade: null, class_no: null, classes: null },
      { id: 2, school_id: 1, username: "teacher1", password: pwHash, role: "teacher", real_name: "张老师", grade: null, class_no: null, classes: JSON.stringify([{ grade: 4, class_no: 1 }, { grade: 4, class_no: 2 }]) },
      { id: 3, school_id: 1, username: "teacher2", password: pwHash, role: "teacher", real_name: "李老师", grade: null, class_no: null, classes: JSON.stringify([{ grade: 5, class_no: 1 }]) },
      { id: 4, school_id: 1, username: "student1", password: pwHash, role: "student", real_name: "王小明", grade: 4, class_no: 1, classes: null },
      { id: 5, school_id: 1, username: "student2", password: pwHash, role: "student", real_name: "李小华", grade: 4, class_no: 2, classes: null },
      { id: 6, school_id: 1, username: "student3", password: pwHash, role: "student", real_name: "赵小敏", grade: 5, class_no: 1, classes: null },
    ];

    for (const u of users) {
      await conn.query(`
        INSERT INTO users (id, school_id, username, password, real_name, role, grade, class_no, classes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON DUPLICATE KEY UPDATE password = VALUES(password), role = VALUES(role), real_name = VALUES(real_name), grade = VALUES(grade), class_no = VALUES(class_no), classes = VALUES(classes);
      `, [u.id, u.school_id, u.username, u.password, u.real_name, u.role, u.grade, u.class_no, u.classes]);
    }
    console.log("✅ 三角色用户已就绪 (admin/admin123, teacher1/123456, student1/123456)");

    // 3. 初始化六育三级分类树 (edu_evaluation_category)
    const categoryTree = [
      {
        code: "D", name: "德育", level: 1, score: 0, sort: 1,
        subs: [
          {
            code: "D01", name: "文明礼仪", level: 2, score: 0, sort: 1,
            items: [
              { code: "D01-01", name: "主动礼貌问候", score: 1, sort: 1 },
              { code: "D01-02", name: "文明沟通表达", score: 1, sort: 2 },
              { code: "D01-03", name: "文明用餐", score: 1, sort: 3 }
            ]
          },
          {
            code: "D02", name: "诚实守信", level: 2, score: 0, sort: 2,
            items: [
              { code: "D02-01", name: "主动承认错误", score: 1, sort: 1 },
              { code: "D02-02", name: "拾物主动归还", score: 1, sort: 2 },
              { code: "D02-03", name: "遵守约定", score: 1, sort: 3 }
            ]
          },
          {
            code: "D03", name: "关爱互助", level: 2, score: 0, sort: 3,
            items: [
              { code: "D03-01", name: "主动帮助同学", score: 1, sort: 1 },
              { code: "D03-02", name: "关心需要帮助的人", score: 1, sort: 2 }
            ]
          }
        ]
      },
      {
        code: "Z", name: "智育", level: 1, score: 0, sort: 2,
        subs: [
          {
            code: "Z01", name: "勤奋好学", level: 2, score: 0, sort: 1,
            items: [
              { code: "Z01-01", name: "课堂认真专注", score: 1, sort: 1 },
              { code: "Z01-02", name: "作业工整优质", score: 1, sort: 2 },
              { code: "Z01-03", name: "积极参与研讨", score: 1, sort: 3 }
            ]
          },
          {
            code: "Z02", name: "勇于探索", level: 2, score: 0, sort: 2,
            items: [
              { code: "Z02-01", name: "善于提出问题", score: 1, sort: 1 },
              { code: "Z02-02", name: "跨学科创新思考", score: 1, sort: 2 }
            ]
          }
        ]
      },
      {
        code: "T", name: "体育", level: 1, score: 0, sort: 3,
        subs: [
          {
            code: "T01", name: "运动健康", level: 2, score: 0, sort: 1,
            items: [
              { code: "T01-01", name: "课间积极锻炼", score: 1, sort: 1 },
              { code: "T01-02", name: "认真做好课间操", score: 1, sort: 2 },
              { code: "T01-03", name: "体育特长展示", score: 1, sort: 3 }
            ]
          }
        ]
      },
      {
        code: "M", name: "美育", level: 1, score: 0, sort: 4,
        subs: [
          {
            code: "M01", name: "艺术素养", level: 2, score: 0, sort: 1,
            items: [
              { code: "M01-01", name: "积极参与文艺活动", score: 1, sort: 1 },
              { code: "M01-02", name: "班级板报环境美化", score: 1, sort: 2 }
            ]
          }
        ]
      },
      {
        code: "L", name: "劳育", level: 1, score: 0, sort: 5,
        subs: [
          {
            code: "L01", name: "劳动实践", level: 2, score: 0, sort: 1,
            items: [
              { code: "L01-01", name: "认真完成值日", score: 1, sort: 1 },
              { code: "L01-02", name: "爱护公物整理环境", score: 1, sort: 2 }
            ]
          }
        ]
      },
      {
        code: "G", name: "故事", level: 1, score: 0, sort: 6,
        subs: [
          {
            code: "G01", name: "生活故事", level: 2, score: 0, sort: 1,
            items: [
              { code: "G01-01", name: "月度成长叙事", score: 1, sort: 1 }
            ]
          }
        ]
      }
    ];

    for (const root of categoryTree) {
      await conn.query(`
        INSERT INTO edu_evaluation_category (parent_id, category_level, category_code, category_name, score, sort_order, status, version)
        VALUES (0, 1, ?, ?, 0, ?, 1, 'V1')
        ON DUPLICATE KEY UPDATE category_name = VALUES(category_name), sort_order = VALUES(sort_order);
      `, [root.code, root.name, root.sort]);

      const [[rootRow]] = await conn.query("SELECT id FROM edu_evaluation_category WHERE category_code = ? AND version = 'V1'", [root.code]);
      const rootId = rootRow.id;

      for (const sub of root.subs) {
        await conn.query(`
          INSERT INTO edu_evaluation_category (parent_id, category_level, category_code, category_name, score, sort_order, status, version)
          VALUES (?, 2, ?, ?, 0, ?, 1, 'V1')
          ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), category_name = VALUES(category_name), sort_order = VALUES(sort_order);
        `, [rootId, sub.code, sub.name, sub.sort]);

        const [[subRow]] = await conn.query("SELECT id FROM edu_evaluation_category WHERE category_code = ? AND version = 'V1'", [sub.code]);
        const subId = subRow.id;

        for (const item of sub.items) {
          await conn.query(`
            INSERT INTO edu_evaluation_category (parent_id, category_level, category_code, category_name, score, sort_order, status, version)
            VALUES (?, 3, ?, ?, 1, ?, 1, 'V1')
            ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), category_name = VALUES(category_name), score = 1, sort_order = VALUES(sort_order);
          `, [subId, item.code, item.name, item.sort]);
        }
      }
    }
    console.log("✅ 六育评价指标分类树已全部就绪");

    // 4. 初始化综合评分规则 (comprehensive_score_rule)
    await conn.query(`
      INSERT INTO comprehensive_score_rule (
        school_id, term_id, rule_version,
        six_weight, process_weight, honor_weight,
        process_target, honor_target,
        rule_status, approved_by, approved_at
      ) VALUES (
        1, 1, 'V1',
        0.8000, 0.1500, 0.0500,
        20, 12,
        'ACTIVE', 1, NOW()
      ) ON DUPLICATE KEY UPDATE rule_status = 'ACTIVE';
    `);
    console.log("✅ 综合评分规则 (six: 0.80, process: 0.15, honor: 0.05) 已就绪");

    // 5. 确保 token_blacklist 表存在
    await conn.query(`
      CREATE TABLE IF NOT EXISTS token_blacklist (
        token_hash VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'Token SHA-256 散列',
        expires_at DATETIME(3) NOT NULL COMMENT 'Token 过期时间',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '加入黑名单时间'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Token注销黑名单表';
    `);
    console.log("✅ 表 token_blacklist 已就绪");

    // 6. 初始化演示实体卡 (reward_card)
    const crypto = require("crypto");
    const demoToken = "DEMO-CARD-OCT-2026-TOKEN-1";
    const demoHash = crypto.createHash("sha256").update(demoToken).digest("hex");
    const [[dRow]] = await conn.query("SELECT id FROM edu_evaluation_category WHERE category_code = 'D03-01' LIMIT 1");
    const catId = dRow ? dRow.id : 3;

    await conn.query(`
      INSERT INTO reward_card (
        school_id, term_id, teacher_id, month_key, serial_no, category_id,
        token_hash, valid_from, valid_until, status
      ) VALUES (
        1, 1, 2, '2026-10', 101, ?,
        ?, '2026-10-01 00:00:00', '2026-10-31 23:59:59', 'UNUSED'
      ) ON DUPLICATE KEY UPDATE status = 'UNUSED', used_student_id = NULL, used_at = NULL;
    `, [catId, demoHash]);
    console.log(`✅ 演示可用实体卡就绪 (Token: ${demoToken})`);

    // 7. 初始化月度生活故事演示数据 (story_submission + material_revision)
    // 9月故事 (已终审)
    await conn.query(`
      INSERT INTO story_submission (
        id, school_id, student_id, term_id, month_key, status, current_version,
        teacher_score, teacher_comment, reviewer_id, reviewed_at
      ) VALUES (
        1, 1, 4, 1, '2026-09', 'REVIEWED', 1,
        90.00, '把练习跳绳的过程写得很真实，遇到困难依然愿意尝试，这份坚持值得珍惜。', 2, NOW()
      ) ON DUPLICATE KEY UPDATE status = 'REVIEWED', teacher_score = 90.00;
    `);
    await conn.query(`
      INSERT INTO material_revision (
        school_id, owner_type, owner_id, version_no, text_content, content_hash,
        llm_suggestion, created_by, created_at
      ) VALUES (
        1, 'STORY', 1, 1,
        '这个月我练习了跳绳，从一分钟50个到120个，我学会了坚持。',
        'hash_sep_story',
        '{"score": 88, "suggestion": "叙述自然朴实，成长反思真实"}',
        4, NOW()
      ) ON DUPLICATE KEY UPDATE text_content = VALUES(text_content);
    `);

    // 10月故事 (已提交待审)
    const storyOctText = "这个月，我们班开展了一次校园观察活动。\n\n我和小组同学一起寻找秋天的变化，记录落叶的颜色，也观察种植角里的小生命。刚开始我总是急着说出自己的发现，后来才明白，认真听同伴分享，也是一种收获。\n\n我们把每个人的观察画在一张大纸上，完成了一份属于我们的小小自然笔记。我最开心的不是得到了表扬，而是发现大家一起合作，真的能把事情做得更好。\n\n下个月，我想继续记录身边的变化，也想学会更有耐心地听别人说话。";
    await conn.query(`
      INSERT INTO story_submission (
        id, school_id, student_id, term_id, month_key, status, current_version
      ) VALUES (
        2, 1, 4, 1, '2026-10', 'SUBMITTED', 1
      ) ON DUPLICATE KEY UPDATE status = 'SUBMITTED';
    `);
    await conn.query(`
      INSERT INTO material_revision (
        school_id, owner_type, owner_id, version_no, text_content, content_hash,
        llm_suggestion, created_by, created_at
      ) VALUES (
        1, 'STORY', 2, 1,
        ?,
        'hash_oct_story',
        '{"score": 85, "suggestion": "文稿情感真实，体现了观察、责任与合作意识。可鼓励学生补充更具体的观察细节。"}',
        4, NOW()
      ) ON DUPLICATE KEY UPDATE text_content = VALUES(text_content);
    `, [storyOctText]);
    console.log("✅ 演示月度生活故事 (9月已审定90分，10月已提交待审) 就绪");

    // 8. 初始化学生学期综合素质发展报告 (term_report)
    const reportSnapshot = {
      student: {
        id: 4,
        name: "王小明",
        username: "student1",
        grade: 4,
        classNo: 1
      },
      evaluation: {
        dimensions: { D: 92, Z: 88, T: 90, M: 86, L: 94, G: 89 },
        sixAverage: 89.83,
        sixContribution: 71.86,
        processNetPoints: 24,
        processStandardScore: 100,
        processContribution: 15.00,
        honorNetPoints: 8,
        honorStandardScore: 66.67,
        honorContribution: 3.33,
        comprehensiveScore: 90.19,
        grade: "优秀",
        isComplete: true
      },
      process_points_sum: 24,
      honor_points_sum: 8,
      subjects: [
        { subject_name: "语文", raw_score: 92.5 },
        { subject_name: "数学", raw_score: 98.0 },
        { subject_name: "英语", raw_score: 95.0 }
      ],
      honors: [
        { award_name: "青少年机器人挑战赛", award_level: "市级", points: 8 }
      ],
      generatedAt: new Date().toISOString()
    };

    await conn.query(`
      INSERT INTO term_report (
        id, school_id, student_id, term_id, version, rule_version,
        snapshot_json, comprehensive_score, comprehensive_grade,
        teacher_comment, teacher_id, student_statement, family_message,
        status, published_at
      ) VALUES (
        1, 1, 4, 1, 1, 'V1',
        ?, 90.19, '优秀',
        '小明同学这学期像一棵向阳的小树，在认真与善意中慢慢长大。主动帮助同学，也学会了在小组活动中耐心倾听。希望继续保持好奇，勇敢表达自己的想法，在每一次尝试中遇见更好的自己。',
        2,
        '这学期，我学会了和伙伴一起合作。我想继续练习耐心倾听，也想勇敢表达自己的想法。',
        '愿你在自己的节奏里，快乐、踏实地长大。',
        'PUBLISHED', NOW()
      ) ON DUPLICATE KEY UPDATE status = 'PUBLISHED', comprehensive_score = 90.19, snapshot_json = VALUES(snapshot_json);
    `, [JSON.stringify(reportSnapshot)]);
    console.log("✅ 演示学生学期发展报告已就绪 (综合分: 90.19 优秀)");

    console.log("\n🎉 所有基础数据初始化成功！");
  } catch (err) {
    console.error("❌ 初始化失败:", err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

init();
