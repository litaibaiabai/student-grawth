/**
 * R06.cjs — 故事建议与终审场景
 *
 * 验证：
 * 1. checks.storyDraftToSubmitFlow === true (学生输入正文、保存草稿 DRAFT、再正式提交 SUBMITTED 并生成可解释建议分)
 * 2. checks.storyReviewTeacherScope === true (授权教师阅读故事、调整并确认正式分 REVIEWED；越权教师被拒绝 403)
 * 3. checks.reviewedStoryImmutable === true (已终审作品不能被学生重新提交覆盖 409)
 * 4. checks.monthMultiVersionPreserved === true (保留学期、月份、教师正式分与材料版本历史)
 */
const assert = require('node:assert/strict');

async function run({ page, s, m, rt, mysql, inspect }) {
  const checks = {
    storyDraftToSubmitFlow: false,
    storyReviewTeacherScope: false,
    reviewedStoryImmutable: false,
    monthMultiVersionPreserved: false
  };

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: m.dbName
  });

  try {
    // 动态获取学生和教师
    const [teachers] = await conn.query("SELECT id FROM users WHERE role = 'teacher' LIMIT 2");
    const teacherId = teachers[0].id;
    const otherTeacherId = teachers.length > 1 ? teachers[1].id : 999;
    const [students] = await conn.query("SELECT id, grade, class_no FROM users WHERE role = 'student' LIMIT 1");
    const student = students[0];

    // 授权 teacherId 负责该学生所在班级
    await conn.query(`
      INSERT INTO teacher_teaching_assignment (school_id, term_id, teacher_id, grade, class_no, subject_code, is_head_teacher)
      VALUES (1, 1, ?, ?, ?, 'CHINESE', 1)
      ON DUPLICATE KEY UPDATE is_head_teacher = 1
    `, [teacherId, student.grade, student.class_no]);

    const { submitStory, reviewStory } = require('../../../backend/controllers/storyController.js');

    // 章节 1: 学生草稿保存、正式提交与生成规则建议分
    let storyId = null;
    await s.chapter('R06-01', '学生保存草稿、正式提交并生成建议分', async () => {
      // 1.1 保存草稿 (DRAFT)
      const draftReq = {
        conn,
        body: {
          title: '我和我的班级',
          content: '今天在学校参加了班级值日劳动，我和同桌一起整理图书角……',
          monthKey: '2026-10',
          isDraft: true
        },
        user: { id: student.id, schoolId: 1, role: 'student' }
      };

      let draftResData = null;
      const draftRes = {
        status: () => draftRes,
        json: (data) => { draftResData = data; return draftRes; }
      };

      await submitStory(draftReq, draftRes, (err) => { if (err) throw err; });
      assert.equal(draftResData?.code, 200);
      assert.equal(draftResData?.data?.status, 'DRAFT');
      storyId = draftResData?.data?.id;
      assert.ok(storyId > 0);

      // 1.2 正式提交 (SUBMITTED)
      const submitReq = {
        conn,
        body: {
          title: '我和我的班级（定稿）',
          content: '今天在学校参加了班级值日劳动，我和同桌一起整理图书角。我们把杂乱的图书按照文史和科普分类整理好，同学们借阅更方便了。这让我体会到劳动的快乐与团队合作的重要性。',
          monthKey: '2026-10',
          isDraft: false
        },
        user: { id: student.id, schoolId: 1, role: 'student' }
      };

      let submitResData = null;
      const submitRes = {
        status: () => submitRes,
        json: (data) => { submitResData = data; return submitRes; }
      };

      await submitStory(submitReq, submitRes, (err) => { if (err) throw err; });
      assert.equal(submitResData?.code, 200);
      assert.equal(submitResData?.data?.status, 'SUBMITTED');
      assert.ok(submitResData?.data?.aiScore >= 60);

      // 验证版本号变为 2
      const [[st]] = await conn.query('SELECT status, current_version, ai_score FROM story_submission WHERE id = ?', [storyId]);
      assert.equal(st.status, 'SUBMITTED');
      assert.equal(st.current_version, 2);

      checks.storyDraftToSubmitFlow = true;
    });

    // 章节 2: 授权教师审核终审评分；越权教师被阻断
    await s.chapter('R06-02', '授权教师阅读并终审打分，越权教师阻断', async () => {
      // 2.1 未授权教师尝试审核，必须报 403
      const unauthorizedReq = {
        conn,
        params: { id: storyId },
        body: { teacherScore: 90, teacherComment: '很好' },
        user: { id: otherTeacherId, schoolId: 1, role: 'teacher' }
      };
      const unauthRes = { status: () => unauthRes, json: () => unauthRes };

      let got403 = false;
      try {
        await reviewStory(unauthorizedReq, unauthRes, (err) => {
          if (err && (err.statusCode === 403 || err.code === 403)) got403 = true;
        });
      } catch (err) {
        if (err.statusCode === 403 || err.code === 403) got403 = true;
      }
      assert.ok(got403, '跨班教师审核必须被拒绝 403');

      // 2.2 授权教师终审打分
      const reviewReq = {
        conn,
        params: { id: storyId },
        body: { teacherScore: 92, teacherComment: '行动真实，反思深刻，很有责任心！' },
        user: {
          id: teacherId,
          schoolId: 1,
          role: 'teacher',
          classes: [{ grade: student.grade, class_no: student.class_no }]
        }
      };

      let reviewResData = null;
      const reviewRes = {
        status: () => reviewRes,
        json: (data) => { reviewResData = data; return reviewRes; }
      };

      await reviewStory(reviewReq, reviewRes, (err) => { if (err) throw err; });
      assert.equal(reviewResData?.code, 200);
      assert.equal(reviewResData?.data?.status, 'REVIEWED');
      assert.equal(reviewResData?.data?.teacherScore, 92);

      // 检查主表状态
      const [[reviewed]] = await conn.query('SELECT status, teacher_score, reviewer_id FROM story_submission WHERE id = ?', [storyId]);
      assert.equal(reviewed.status, 'REVIEWED');
      assert.equal(Number(reviewed.teacher_score), 92);
      assert.equal(Number(reviewed.reviewer_id), teacherId);

      checks.storyReviewTeacherScope = true;
    });

    // 章节 3: 已终审的故事禁止被学生覆盖提交
    await s.chapter('R06-03', '已终审故事严禁覆盖提交', async () => {
      const overwriteReq = {
        conn,
        body: {
          title: '尝试篡改已终审故事',
          content: '修改内容试图重新提交……',
          monthKey: '2026-10',
          isDraft: false
        },
        user: { id: student.id, schoolId: 1, role: 'student' }
      };

      let got409 = false;
      const res = { status: () => res, json: () => res };
      try {
        await submitStory(overwriteReq, res, (err) => {
          if (err && (err.statusCode === 409 || err.code === 409)) got409 = true;
        });
      } catch (err) {
        if (err.statusCode === 409 || err.code === 409) got409 = true;
      }
      assert.ok(got409, '已终审故事严禁被覆盖提交');

      checks.reviewedStoryImmutable = true;
    });

    // 章节 4: 学期月份与版本留痕完整性
    await s.chapter('R06-04', '学期与版本留痕数据完整性', async () => {
      const [revs] = await conn.query(
        "SELECT version_no, text_content FROM material_revision WHERE owner_type = 'STORY' AND owner_id = ? ORDER BY version_no ASC",
        [storyId]
      );
      assert.ok(revs.length >= 2, '必须保留草稿和正式提交的版本');

      checks.monthMultiVersionPreserved = true;
    });

  } finally {
    await conn.end();
  }

  assert.equal(checks.storyDraftToSubmitFlow, true);
  assert.equal(checks.storyReviewTeacherScope, true);
  assert.equal(checks.reviewedStoryImmutable, true);
  assert.equal(checks.monthMultiVersionPreserved, true);

  return { checks };
}

module.exports = {
  id: 'R06',
  title: '故事建议与终审',
  run
};
