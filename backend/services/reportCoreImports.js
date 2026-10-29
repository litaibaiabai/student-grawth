const bcrypt = require("bcrypt");
const { withMutation, addSource, parse } = require("./reportCoreStore");
const { byColumn, fail, validateValue } = require("./reportCorePolicy");
const { assertScope } = require("./authorizationService");
const health = [
  "height_cm",
  "weight_kg",
  "vision_left",
  "vision_right",
  "jump_rope_1min",
];
async function validateRows(c, actor, term, kind, rows) {
  if (
    !["ROSTER", "HEALTH", "ACADEMIC"].includes(kind) ||
    !Array.isArray(rows) ||
    rows.length < 1 ||
    rows.length > 1000
  )
    fail(422, "导入类型或行数不合法");
  if (
    actor.role === "student" ||
    (["ROSTER", "HEALTH"].includes(kind) && actor.role !== "manager") ||
    (kind === "ACADEMIC" &&
      actor.role === "manager" &&
      !term.evaluation_config.allowManagerAcademicImport)
  )
    fail(403, "无此导入权限");
  const seen = new Set(),
    out = [];
  for (const input of rows) {
    if (!input || typeof input !== "object") fail(422, "非法行");
    if (kind === "ROSTER") {
      if (
        typeof input.username !== "string" ||
        !input.username.trim() ||
        !["student", "teacher"].includes(input.role) ||
        !input.real_name ||
        !Number.isInteger(input.grade) ||
        !Number.isInteger(input.classNo) ||
        input.grade < 1 ||
        input.classNo < 1
      )
        fail(422, "学籍需用户名/姓名/角色/年级/班级");
      if (seen.has(input.username)) fail(422, "学号重复");
      seen.add(input.username);
      const [[u]] = await c.query(
        "SELECT id FROM users WHERE school_id=? AND username=?",
        [actor.schoolId, input.username],
      );
      if (
        !u &&
        (typeof input.password !== "string" || input.password.length < 10)
      )
        fail(422, "新账号需至少10位初始密码");
      out.push({
        username: input.username,
        role: input.role,
        real_name: input.real_name,
        grade: input.grade,
        classNo: input.classNo,
        ...(!u ? { passwordHash: await bcrypt.hash(input.password, 10) } : {}),
        existingId: u ? String(u.id) : null,
      });
      continue;
    }
    let studentId = input.studentId;
    if (!studentId && input.username) {
      const [[u]] = await c.query(
        "SELECT id FROM users WHERE school_id=? AND username=? AND role='student'",
        [actor.schoolId, input.username],
      );
      studentId = u?.id;
    }
    if (!studentId || seen.has(String(studentId)))
      fail(422, "学生不存在或重复");
    seen.add(String(studentId));
    const values = {};
    for (const [key, v] of Object.entries(input.values || {})) {
      if (v === null || v === undefined || typeof v === "string" && !v.trim()) continue;
      const f = byColumn.get(key);
      if (
        !f ||
        f.sourceType !== "IMPORT" ||
        (kind === "HEALTH") !== health.includes(key)
      )
        fail(422, "字段与来源不符");
      values[key] = validateValue(key, v, term.evaluation_config);
    }
    for (const key of input.clearFields || []) {
      if (
        !byColumn.has(key) ||
        byColumn.get(key).sourceType !== "IMPORT" ||
        (kind === "HEALTH") !== health.includes(key)
      )
        fail(422, "不能清空此字段");
      values[key] = null;
    }
    if (!Object.keys(values).length) fail(422, "没有导入值");
    const scope = await assertScope(
      {
        actor,
        studentKey: { schoolId: actor.schoolId, termId: term.id, studentId },
        action: "import",
        fields: Object.keys(values),
      },
      c,
    );
    out.push({
      studentId: String(studentId),
      values,
      expectedRevision: String(scope.evaluation.revision),
    });
  }
  return out;
}
async function validateAcademicRows(c,actor,term,rows) {
  if(!Array.isArray(rows)||!rows.length||rows.length>1000)fail(422,'导入类型或行数不合法');
  if(actor.role==='student'||actor.role==='manager'&&!term.evaluation_config.allowManagerAcademicImport)fail(403,'无此导入权限');
  const normalized=[],errors=[],seen=new Set();let skipped=0;
  for(let index=0;index<rows.length;index++) {
    const input=rows[index],rowNo=index+1,start=errors.length,values={};
    if(!input||typeof input!=='object'||Array.isArray(input)){errors.push({rowNo,field:'row',reason:'非法行'});continue;}
    for(const [field,value] of Object.entries(input.values||{})) {
      if(value===null||value===undefined||typeof value==='string'&&!value.trim())continue;
      try {const f=byColumn.get(field);if(!f||f.sourceType!=='IMPORT'||health.includes(field))fail(422,'字段与来源不符');values[field]=validateValue(field,value,term.evaluation_config);}
      catch(error){if(!error.statusCode)throw error;errors.push({rowNo,field,reason:error.message});}
    }
    if(input.clearFields!==undefined&&!Array.isArray(input.clearFields))errors.push({rowNo,field:'clearFields',reason:'清空字段需为数组'});
    else for(const field of input.clearFields||[])try{if(!byColumn.has(field)||byColumn.get(field).sourceType!=='IMPORT'||health.includes(field))fail(422,'不能清空此字段');values[field]=null;}catch(error){if(!error.statusCode)throw error;errors.push({rowNo,field,reason:error.message});}
    let studentId=input.studentId;
    if(!studentId&&input.username){const [[u]]=await c.query("SELECT id FROM users WHERE school_id=? AND username=? AND role='student'",[actor.schoolId,input.username]);studentId=u?.id;}
    if(!studentId){errors.push({rowNo,field:'studentId',reason:'学生不存在'});continue;}
    const id=String(studentId);if(seen.has(id)){errors.push({rowNo,field:'studentId',reason:'学生重复'});continue;}seen.add(id);
    try {
      const scope=await assertScope({actor,studentKey:{schoolId:actor.schoolId,termId:term.id,studentId:id},action:'import',fields:Object.keys(values)},c);
      if(errors.length>start)continue;
      if(!Object.keys(values).length){skipped++;continue;}
      normalized.push({studentId:id,values,expectedRevision:String(scope.evaluation.revision)});
    }catch(error){if(!error.statusCode)throw error;errors.push({rowNo,field:'studentId',reason:error.message});}
  }
  return {normalized,errors,counts:{created:0,updated:normalized.length,skipped,errors:errors.length}};
}
async function previewImport({ pool, actor, termId, kind, rows, command }) {
  return withMutation(
    { pool, actor, termId, command, action: "import-preview" },
    async (c, term) => {
      const validated = kind === 'ACADEMIC' ? await validateAcademicRows(c,actor,term,rows) : {normalized:await validateRows(c,actor,term,kind,rows),errors:[],counts:null};
      const {normalized,errors}=validated;
      if(errors.length || !normalized.length)return {result:{batchId:null,revision:null,validCount:normalized.length,errors,diffs:[],counts:validated.counts}};
      const batchId = await addSource(c, {
        schoolId: actor.schoolId,
        termId,
        sourceType: "IMPORT",
        kind: "BATCH",
        actorId: actor.id,
        status: "PREVIEW",
        key: ["IMPORT", actor.id, command.requestKey],
        payload: { kind, rows: normalized, errors: [] },
      });
      return {
        result: {
          batchId,
          revision: "1",
          validCount: normalized.length,
          counts: validated.counts || {created:0,updated:normalized.length,skipped:0,errors:0},
          errors: [],
          diffs: normalized.map((r) => ({
            studentId: r.studentId,
            username: r.username,
            values: r.values,
          })),
        },
      };
    },
  );
}
async function commitImport({
  pool,
  actor,
  batchId,
  expectedRevision,
  command,
}) {
  const [[batch]] = await pool.query(
    "SELECT * FROM evaluation_source_record WHERE school_id=? AND id=?",
    [actor.schoolId, batchId],
  );
  if (!batch || batch.record_kind !== "BATCH" || batch.source_type !== "IMPORT")
    fail(404, "导入批次不存在");
  if (String(batch.actor_id) !== actor.id) fail(403, "仅本人提交导入批次");
  const p = parse(batch.payload_json);
  return withMutation(
    {
      pool,
      actor,
      termId: batch.term_id,
      studentIds: p.rows.map((r) => r.studentId).filter(Boolean),
      command,
      action: "import-commit",
    },
    async (c, term) => {
      const [[current]] = await c.query(
        "SELECT * FROM evaluation_source_record WHERE id=? FOR UPDATE",
        [batchId],
      );
      if (
        current.status !== "PREVIEW" ||
        String(current.revision) !== String(expectedRevision)
      )
        fail(409, "导入批次已改变");
      const changed = {},
        updatedStudentIds = [];
      for (let i = 0; i < p.rows.length; i++) {
        const row = p.rows[i];
        if (p.kind === "ROSTER") {
          let id = row.existingId;
          if (id) {
            await c.query(
              "UPDATE users SET real_name=?,grade=?,class_no=? WHERE id=? AND school_id=?",
              [row.real_name, row.grade, row.classNo, id, actor.schoolId],
            );
          } else {
            const [r] = await c.query(
              "INSERT INTO users(school_id,username,password,real_name,role,grade,class_no) VALUES(?,?,?,?,?,?,?)",
              [
                actor.schoolId,
                row.username,
                row.passwordHash,
                row.real_name,
                row.role,
                row.grade,
                row.classNo,
              ],
            );
            id = String(r.insertId);
          }
          if (row.role === "student") {
            await c.query(
              "INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE student_name_snapshot=VALUES(student_name_snapshot),grade_snapshot=VALUES(grade_snapshot),class_no_snapshot=VALUES(class_no_snapshot)",
              [
                actor.schoolId,
                batch.term_id,
                id,
                row.real_name,
                row.grade,
                row.classNo,
                term.template_version,
                term.rule_version,
              ],
            );
            changed[id] = [];
            updatedStudentIds.push(id);
          }
          await addSource(c, {
            schoolId: actor.schoolId,
            termId: batch.term_id,
            studentId: row.role === "student" ? id : null,
            sourceType: "IMPORT",
            kind: "ITEM",
            parentId: batchId,
            ordinal: i + 1,
            actorId: actor.id,
            status: "COMMITTED",
            key: ["IMPORT_ROW", batchId, i],
            payload: { rowNo: i + 1, username: row.username, kind: "ROSTER" },
          });
          continue;
        }
        const scope = await assertScope(
          {
            actor,
            studentKey: {
              schoolId: actor.schoolId,
              termId: batch.term_id,
              studentId: row.studentId,
            },
            action: "import",
            fields: Object.keys(row.values),
          },
          c,
        );
        if (String(scope.evaluation.revision) !== row.expectedRevision)
          fail(409, "预览后学生数据已变化，请重新预览");
        const previousValues = Object.fromEntries(
          Object.keys(row.values).map((k) => [k, scope.evaluation[k]]),
        );
        await addSource(c, {
          schoolId: actor.schoolId,
          termId: batch.term_id,
          studentId: row.studentId,
          sourceType: "IMPORT",
          kind: "ITEM",
          parentId: batchId,
          ordinal: i + 1,
          actorId: actor.id,
          status: "COMMITTED",
          key: ["IMPORT_ROW", batchId, i],
          payload: { rowNo: i + 1, values: row.values, previousValues },
        });
        changed[row.studentId] = Object.keys(row.values);
        updatedStudentIds.push(row.studentId);
      }
      const safePayload = { kind: p.kind, rowCount: p.rows.length };
      await c.query(
        "UPDATE evaluation_source_record SET status='COMMITTED',payload_json=?,revision=revision+1 WHERE id=?",
        [JSON.stringify(safePayload), batchId],
      );
      return {
        result: { updatedStudentIds },
        changedTargetsByStudent: changed,
      };
    },
  );
}
module.exports = { previewImport, commitImport, health };
