const { withMutation, addSource, parse } = require("./reportCoreStore");
const { fail, validateValue } = require("./reportCorePolicy");
const { assertScope } = require("./authorizationService");
const health = [
  "height_cm",
  "weight_kg",
  "vision_left",
  "vision_right",
  "jump_rope_1min",
];
async function validateAcademicRows(c,actor,term,rows) {
  const v2=require("./reportCoreV2Policy").isV2(term.evaluation_config);
  const byColumn=v2?require("./reportCoreV2Policy").byColumn:require("./reportCorePolicy").byColumn;
  if(v2 && rows?.length>500)fail(422,"每批最多500名学生");
  if(!Array.isArray(rows)||!rows.length||rows.length>1000)fail(422,'导入类型或行数不合法');
  if(actor.role!=='teacher')fail(403,'无此导入权限');
  const normalized=[],errors=[],seen=new Set();let skipped=0;
  for(let index=0;index<rows.length;index++) {
    const input=rows[index],rowNo=index+1,start=errors.length,values={};
    if(!input||typeof input!=='object'||Array.isArray(input)){errors.push({rowNo,field:'row',reason:'非法行'});continue;}
    for(const [field,value] of Object.entries(input.values||{})) {
      if(value===null||value===undefined||typeof value==='string'&&!value.trim())continue;
      try {const f=byColumn.get(field);if(!f||f.sourceType!=='IMPORT'||!v2&&health.includes(field))fail(422,'字段与来源不符');values[field]=validateValue(field,value,term.evaluation_config);}
      catch(error){if(!error.statusCode)throw error;errors.push({rowNo,field,reason:error.message});}
    }
    if(input.clearFields!==undefined&&!Array.isArray(input.clearFields))errors.push({rowNo,field:'clearFields',reason:'清空字段需为数组'});
    else for(const field of input.clearFields||[])try{if(!byColumn.has(field)||byColumn.get(field).sourceType!=='IMPORT'||!v2&&health.includes(field))fail(422,'不能清空此字段');values[field]=null;}catch(error){if(!error.statusCode)throw error;errors.push({rowNo,field,reason:error.message});}
    let studentId=input.studentId;
    if(!studentId&&input.username){const [[u]]=await c.query("SELECT id FROM users WHERE school_id=? AND username=? AND role='student'",[actor.schoolId,input.username]);studentId=u?.id;}
    if(!studentId){errors.push({rowNo,field:'studentId',reason:'学生不存在'});continue;}
    const id=String(studentId);if(seen.has(id)){errors.push({rowNo,field:'studentId',reason:'学生重复'});continue;}seen.add(id);
    try {
      const scope=await assertScope({actor,studentKey:{schoolId:actor.schoolId,termId:term.id,studentId:id},action:'import',fields:Object.keys(values)},c);
      if(v2){
        if(input.real_name && input.real_name!==scope.evaluation.student_name_snapshot)errors.push({rowNo,field:'real_name',reason:'姓名与学籍不一致'});
        if(input.grade!=null && Number(input.grade)!==scope.evaluation.grade_snapshot || input.classNo!=null && Number(input.classNo)!==scope.evaluation.class_no_snapshot)errors.push({rowNo,field:'classNo',reason:'班级与学籍不一致'});
        try{input.measurement=require('./reportCoreV2Imports').normalizeMeasurement(input.measurement,values);}catch(error){if(!error.statusCode)throw error;errors.push({rowNo,field:'measurement',reason:error.message});}
      }
      if(errors.length>start)continue;
      if(!Object.keys(values).length){skipped++;continue;}
      normalized.push({studentId:id,values,expectedRevision:String(scope.evaluation.revision),...(v2?{measurement:input.measurement,gender:input.gender||null,birthDate:input.birthDate||null,providedByTeacherId:input.providedByTeacherId||actor.id}: {})});
    }catch(error){if(!error.statusCode)throw error;errors.push({rowNo,field:'studentId',reason:error.message});}
  }
  return {normalized,errors,counts:{created:0,updated:normalized.length,skipped,errors:errors.length}};
}
async function previewImport({ pool, actor, termId, kind, rows, command }) {
  if(actor.role!=="teacher"||kind!=="ACADEMIC")fail(403,"学籍关系请使用统一初始化工作簿；综合成绩仅由教师维护");
  return withMutation(
    { pool, actor, termId, command, action: "import-preview" },
    async (c, term) => {
      const validated = await validateAcademicRows(c,actor,term,rows);
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
        payload: { kind, ...(require('./reportCoreV2Policy').isV2(term.evaluation_config)?{configVersion:term.config_version,rosterRevision:String(term.roster_revision)}:{}), rows: normalized,inputRowCount:rows.length,counts:validated.counts,diffs:validated.diffs||[], errors: [] },
      });
      return {
        result: {
          batchId,
          revision: "1",
          validCount: normalized.length,
          counts: validated.counts || {created:0,updated:normalized.length,skipped:0,errors:0},
          errors: [],
          diffs: validated.diffs||normalized.map((r) => ({
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
  if(actor.role!=="teacher"||p.kind!=="ACADEMIC")fail(403,"此旧管理导入入口已移除，请使用统一初始化工作簿");
  return withMutation(
    {
      pool,
      actor,
      termId: batch.term_id,
      studentIds: (Array.isArray(p.rows) ? p.rows : []).map((r) => r.studentId).filter(Boolean),
      command,
      action: "import-commit",
      termLock:'shared',
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
      if (!Array.isArray(p.rows)) fail(409, "导入预览已失效，请重新预览");
      if(require('./reportCoreV2Policy').isV2(term.evaluation_config) && (p.configVersion!==term.config_version || p.rosterRevision!==String(term.roster_revision)))fail(409,'预览后配置或名单已变化');
      const changed = {},
        updatedStudentIds = [];
      for (let i = 0; i < p.rows.length; i++) {
        const row = p.rows[i];
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
          payload: { rowNo: i + 1, values: row.values, previousValues,measurement:row.measurement,gender:row.gender,birthDate:row.birthDate,providedByTeacherId:row.providedByTeacherId },
        });
        changed[row.studentId] = Object.keys(row.values);
        updatedStudentIds.push(row.studentId);
      }
      const safePayload = { kind: p.kind, rowCount:p.inputRowCount||p.rows.length,counts:p.counts,commitDiffs:p.diffs||[] };
      await c.query(
        "UPDATE evaluation_source_record SET status='COMMITTED',payload_json=?,revision=revision+1 WHERE id=?",
        [JSON.stringify(safePayload), batchId],
      );
      return {
        result: { updatedStudentIds,counts:p.counts||{created:0,updated:updatedStudentIds.length,skipped:0} },
        changedTargetsByStudent: changed,
      };
    },
  );
}
module.exports = { previewImport, commitImport, health };
