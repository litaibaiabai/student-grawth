/**
 * batchImportService.js
 * 面向全校规模（2000~3000名学生）的 Excel 成绩高效内存校验与分块批量入库服务
 */

const crypto = require("crypto");
const { pool } = require("../db");

const SUBJECT_MAP = {
  CHINESE: "语文",
  MATH: "数学",
  ENGLISH: "英语",
  PHYSICS: "物理",
  CHEMISTRY: "化学",
  BIOLOGY: "生物",
  MORALITY: "道德与法治",
  POLITICS: "政治",
  HISTORY: "历史",
  GEOGRAPHY: "地理",
  PE: "体育",
  MUSIC: "音乐",
  ART: "美术",
  IT: "信息技术"
};

const DIMENSION_MAP = {
  D: "德育",
  Z: "智育",
  T: "体育",
  M: "美育",
  L: "劳育",
  G: "生活故事"
};

/**
 * 预览并校验全校成绩行数据（只读比对，内存分流）
 */
async function previewBatchExcel({ schoolId = 1, termId, type = "SUBJECT", rows = [], operatorId, user }) {
  const normType = (type || "SUBJECT").toUpperCase();
  const inputRows = Array.isArray(rows) ? rows : [];

  let conn;
  try {
    conn = await pool.getConnection();

    // 动态回退当前活跃学期
    let actualTermId = termId;
    if (!actualTermId) {
      const [termRows] = await conn.query(
        "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
        [schoolId]
      );
      actualTermId = termRows.length > 0 ? termRows[0].id : 1;
    }

    // 预加载全校学生
    const [students] = await conn.query(
      "SELECT id, username, real_name, grade, class_no FROM users WHERE school_id = ? AND role = 'student'",
      [schoolId]
    );

    const userMap = new Map();
    for (const s of students) {
      userMap.set(String(s.username).trim(), s);
      userMap.set(String(s.id), s);
    }

    const errors = [];
    const validStudents = [];
    const subjectsDetected = new Set();
    const seenUsernamesInBatch = new Set();

    for (let i = 0; i < inputRows.length; i++) {
      const row = inputRows[i];
      const rowNum = row.rowNum || i + 2; // Excel 数据行默认从第 2 行开始
      const rawUsername = row.username !== undefined && row.username !== null ? String(row.username).trim() : "";
      const realName = row.realName || row.name || "";

      if (!rawUsername) {
        errors.push({
          rowNum,
          username: "",
          realName,
          reason: "学号/账号不能为空"
        });
        continue;
      }

      if (seenUsernamesInBatch.has(rawUsername)) {
        errors.push({
          rowNum,
          username: rawUsername,
          realName,
          reason: `Excel 表格中存在重复学号【${rawUsername}】`
        });
        continue;
      }
      seenUsernamesInBatch.add(rawUsername);

      const student = userMap.get(rawUsername) || userMap.get(String(row.studentId));
      if (!student) {
        errors.push({
          rowNum,
          username: rawUsername,
          realName,
          reason: `未找到该学生账号（查无此人: ${rawUsername}）`
        });
        continue;
      }

      if(user?.role==='teacher'){
        let classes=user.classes;
        if(typeof classes==='string'){try{classes=JSON.parse(classes)}catch{classes=[]}}
        if(!Array.isArray(classes)||!classes.some(c=>Number(c.grade)===Number(student.grade)&&Number(c.class_no)===Number(student.class_no))){
          errors.push({rowNum,username:rawUsername,realName,reason:'学生不在当前教师任教班级范围内'});continue;
        }
      }
      // 解析科目/维度分值
      const rawScores = row.scores || {};
      const scoreEntries = Array.isArray(rawScores)
        ? rawScores
        : Object.entries(rawScores).map(([key, val]) => ({
            code: key,
            score: val
          }));

      let hasRowError = false;
      const validScores = [];

      for (const entry of scoreEntries) {
        const code = (entry.code || entry.subjectCode || entry.dimension || "").toUpperCase().trim();
        const rawVal = entry.score;

        if (!code) continue;

        // 空白/缺考跳过
        if (rawVal === "" || rawVal === null || rawVal === undefined || rawVal === "-") {
          continue;
        }

        const scoreNum = Number(rawVal);
        const maxScore = normType === "SUBJECT" ? 100 : 100; // 六育与标准学科默认 100

        if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > maxScore) {
          const itemLabel = normType === "SUBJECT" ? (SUBJECT_MAP[code] || code) : (DIMENSION_MAP[code] || code);
          errors.push({
            rowNum,
            username: student.username,
            realName: student.real_name,
            reason: `${normType === "SUBJECT" ? "学科" : "维度"}【${itemLabel}】分值必须在 0 ~ ${maxScore} 之间，实际填写为: "${rawVal}"`
          });
          hasRowError = true;
          break;
        }

        if (normType === "SUBJECT") {
          subjectsDetected.add(code);
          validScores.push({
            subjectCode: code,
            subjectName: entry.subjectName || SUBJECT_MAP[code] || code,
            score: scoreNum
          });
        } else {
          subjectsDetected.add(code);
          validScores.push({
            dimension: code,
            score: scoreNum
          });
        }
      }

      if (!hasRowError) {
        if (validScores.length === 0) {
          errors.push({
            rowNum,
            username: student.username,
            realName: student.real_name,
            reason: "该学生未填写任何有效成绩分值（全部为空或缺考）"
          });
        } else {
          validStudents.push({
            rowNum,
            studentId: student.id,
            username: student.username,
            realName: student.real_name,
            grade: student.grade,
            classNo: student.class_no,
            scores: validScores
          });
        }
      }
    }

    return {
      totalStudents: inputRows.length,
      validCount: validStudents.length,
      invalidCount: errors.length,
      errors,
      validStudents,
      subjectsDetected: Array.from(subjectsDetected),
      type: normType,
      termId: actualTermId
    };
  } finally {
    if (conn) conn.release();
  }
}

/**
 * 分块原子批量写入（Chunked Bulk UPSERT）
 */
async function commitBatchExcel({ schoolId = 1, termId, type = "SUBJECT", validStudents = [], operatorId }) {
  const normType = (type || "SUBJECT").toUpperCase();
  const students = Array.isArray(validStudents) ? validStudents : [];
  if (students.length === 0) {
    throw new Error("待入库学生数据不能为空");
  }

  const batchNo = `IMP_${Date.now()}_${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  let conn;

  try {
    conn = await pool.getConnection();

    let actualTermId = termId;
    if (!actualTermId) {
      const [termRows] = await conn.query(
        "SELECT id FROM academic_year WHERE (school_id = ? OR school_id IS NULL) AND is_current = 1 LIMIT 1",
        [schoolId]
      );
      actualTermId = termRows.length > 0 ? termRows[0].id : 1;
    }

    await conn.beginTransaction();

    let totalScoresCount = 0;

    if (normType === "SUBJECT") {
      // 展开所有分值项
      const flatRecords = [];
      for (const s of students) {
        for (const item of s.scores) {
          flatRecords.push([
            schoolId,
            actualTermId,
            s.studentId,
            item.subjectCode || "CHINESE",
            item.subjectName || "语文",
            Number(item.score),
            100.0,
            batchNo
          ]);
        }
      }
      totalScoresCount = flatRecords.length;

      // 按 1000 条分块写入
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < flatRecords.length; i += CHUNK_SIZE) {
        const chunk = flatRecords.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const params = chunk.flat();

        const sql = `
          INSERT INTO subject_score (
            school_id, term_id, student_id, subject_code, subject_name, raw_score, full_score, batch_no
          ) VALUES ${placeholders}
          ON DUPLICATE KEY UPDATE
            raw_score = VALUES(raw_score),
            batch_no = VALUES(batch_no)
        `;
        await conn.query(sql, params);
      }
    } else {
      // 六育维度批量入库
      const flatRecords = [];
      for (const s of students) {
        for (const item of s.scores) {
          flatRecords.push([
            schoolId,
            actualTermId,
            s.studentId,
            item.dimension || "D",
            Number(item.score),
            batchNo,
            "CONFIRMED",
            operatorId
          ]);
        }
      }
      totalScoresCount = flatRecords.length;

      const CHUNK_SIZE = 1000;
      for (let i = 0; i < flatRecords.length; i += CHUNK_SIZE) {
        const chunk = flatRecords.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, NOW(6), ?)").join(", ");
        const params = chunk.flat();

        const sql = `
          INSERT INTO student_dimension_score (
            school_id, term_id, student_id, dimension_code, score_100, batch_no, status, confirmed_at, confirmed_by
          ) VALUES ${placeholders}
          ON DUPLICATE KEY UPDATE
            score_100 = VALUES(score_100),
            batch_no = VALUES(batch_no)
        `;
        await conn.query(sql, params);
      }
    }

    // 记录操作审计
    await conn.query(
      `INSERT INTO operation_audit (
        school_id, actor_user_id, actor_role, target_type, target_id, action, request_id, new_summary
      ) VALUES (?, ?, ?, ?, 0, 'EXCEL_BATCH_IMPORT', ?, ?)`,
      [
        schoolId,
        operatorId,
        "admin",
        normType === "SUBJECT" ? "SUBJECT_SCORE" : "STUDENT_DIMENSION_SCORE",
        batchNo,
        JSON.stringify({
          batchNo,
          committedStudents: students.length,
          committedScoresCount: totalScoresCount,
          type: normType
        })
      ]
    );

    await conn.commit();

    return {
      batchNo,
      committedStudents: students.length,
      committedScoresCount: totalScoresCount,
      type: normType
    };
  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  previewBatchExcel,
  commitBatchExcel,
  SUBJECT_MAP,
  DIMENSION_MAP
};
