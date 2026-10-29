const bcrypt = require("bcrypt");
const { withMutation, addSource, parse } = require("./reportCoreStore");
const { byColumn, fail, validateValue, stableHash } = require("./reportCorePolicy");
const { assertScope } = require("./authorizationService");
const health = [
  "height_cm",
  "weight_kg",
  "vision_left",
  "vision_right",
  "jump_rope_1min",
];
function accountSnapshot(u){return u?{id:String(u.id),role:u.role,real_name:u.real_name,grade:u.grade,classNo:u.class_no,status:u.status}:null;}
function rejectRows(errors,counts){const {AppError}=require('../middleware/errorHandler');throw Object.assign(new AppError(422,'请修正全部导入错误后重新预览',422),{details:{errors,counts},safeDetails:true});}
async function validateAdminRows(c,actor,term,kind,rows){
 if(actor.role!=='manager')fail(403,'仅管理员导入学籍与体测');
 if(!['ROSTER','HEALTH'].includes(kind)||!Array.isArray(rows)||!rows.length||rows.length>1000)fail(422,'导入类型或行数不合法');
 const normalized=[],errors=[],diffs=[],seen=new Set();const counts={created:0,updated:0,skipped:0,errors:0};
 for(let index=0;index<rows.length;index++){
  const input=rows[index],rowNo=index+1,start=errors.length;const error=(field,reason)=>errors.push({rowNo,field,reason});
  if(!input||typeof input!=='object'||Array.isArray(input)){error('row','非法行');continue;}
  if(kind==='ROSTER'){
   const username=typeof input.username==='string'?input.username.trim():'';
   if(!username||username.length>100)error('username','账号不能为空且不超过100字');
   if(!['student','teacher'].includes(input.role))error('role','仅支持学生或教师模板');
   if(typeof input.real_name!=='string'||!input.real_name.trim()||input.real_name.length>100)error('real_name','姓名不能为空且不超过100字');
   if(input.role==='student'&&(!Number.isInteger(input.grade)||input.grade<1||!Number.isInteger(input.classNo)||input.classNo<1))error('classNo','学生需要合法年级和班级');
   if(seen.has(username))error('username','同批账号重复');seen.add(username);
   const [[u]]=await c.query('SELECT id,role,real_name,grade,class_no,status FROM users WHERE school_id=? AND username=?',[actor.schoolId,username]);
   if(u&&u.role!==input.role)error('role','已有账号角色不一致，不能变更角色');
   if(!u&&(typeof input.password!=='string'||input.password.length<10))error('password','新账号需至少10位初始密码');
   if(errors.length>start)continue;
   const [[e]]=u&&input.role==='student'?await c.query('SELECT student_name_snapshot,grade_snapshot,class_no_snapshot,revision FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=?',[actor.schoolId,term.id,u.id]):[[]];
   const before=input.role==='teacher'?{real_name:u?.real_name??null}:{real_name:e?.student_name_snapshot??null,grade:e?.grade_snapshot??null,classNo:e?.class_no_snapshot??null};
   const after=input.role==='teacher'?{real_name:input.real_name.trim()}:{real_name:input.real_name.trim(),grade:input.grade,classNo:input.classNo};
   const action=!u?'NEW':stableHash(before)===stableHash(after)?'UNCHANGED':'UPDATE';
   if(action==='UNCHANGED'){counts.skipped++;continue;}
   const row={username,role:input.role,...after,grade:input.role==='student'?input.grade:null,classNo:input.role==='student'?input.classNo:null,existingId:u?String(u.id):null,expectedAccount:accountSnapshot(u),expectedRevision:e?String(e.revision):null,...(!u?{passwordHash:await bcrypt.hash(input.password,10)}:{})};
   normalized.push(row);diffs.push({rowNo,username,studentId:input.role==='student'?row.existingId:null,action,before,after,hasInitialPassword:!u});counts[action==='NEW'?'created':'updated']++;continue;
  }
  const values={};
  for(const [key,v] of Object.entries(input.values||{})){if(v===null||v===undefined||typeof v==='string'&&!v.trim())continue;try{if(!health.includes(key))fail(422,'仅允许五项体测原值');values[key]=validateValue(key,v,term.evaluation_config);}catch(e){if(!e.statusCode)throw e;error(key,e.message);}}
  if(input.clearFields!==undefined&&!Array.isArray(input.clearFields))error('clearFields','清空字段需为数组');else for(const key of input.clearFields||[])if(!health.includes(key))error(key,'不能清空此字段');else values[key]=null;
  let id=input.studentId;if(!id&&input.username){const [[u]]=await c.query("SELECT id FROM users WHERE school_id=? AND username=? AND role='student'",[actor.schoolId,String(input.username)]);id=u?.id;}
  if(!id){error('studentId','学生不存在');continue;}id=String(id);if(seen.has(id)){error('studentId','学生重复');continue;}seen.add(id);
  try{const scope=await assertScope({actor,studentKey:{schoolId:actor.schoolId,termId:term.id,studentId:id},action:'import',fields:Object.keys(values)},c);const e=scope.evaluation;
   if(input.real_name&&input.real_name!==e.student_name_snapshot)error('real_name','姓名与学籍不一致');if(input.grade!=null&&Number(input.grade)!==e.grade_snapshot||input.classNo!=null&&Number(input.classNo)!==e.class_no_snapshot)error('classNo','班级与学籍不一致');
   if(errors.length>start)continue;const changed=Object.fromEntries(Object.entries(values).filter(([k,v])=>String(v??'')!==String(e[k]??'')));
   if(!Object.keys(changed).length){counts.skipped++;continue;}
   const before=Object.fromEntries(Object.keys(changed).map(k=>[k,e[k]]));normalized.push({studentId:id,values:changed,expectedRevision:String(e.revision)});diffs.push({rowNo,studentId:id,name:e.student_name_snapshot,action:'UPDATE',before,after:changed,values:changed});counts.updated++;
  }catch(e){if(!e.statusCode)throw e;error('studentId',e.message);}
 }
 counts.errors=errors.length;if(errors.length)rejectRows(errors,counts);return {normalized,errors,diffs,counts};
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
      const validated = kind === 'ACADEMIC' ? await validateAcademicRows(c,actor,term,rows) : await validateAdminRows(c,actor,term,kind,rows);
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
        payload: { kind, rows: normalized,inputRowCount:rows.length,counts:validated.counts,diffs:validated.diffs||[], errors: [] },
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
  return withMutation(
    {
      pool,
      actor,
      termId: batch.term_id,
      studentIds: (Array.isArray(p.rows) ? p.rows : []).map((r) => r.studentId).filter(Boolean),
      command,
      action: "import-commit",
      termLock:p.kind==='ROSTER'?'exclusive':'shared',
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
      const changed = {},
        updatedStudentIds = [];
      for (let i = 0; i < p.rows.length; i++) {
        const row = p.rows[i];
        if (p.kind === "ROSTER") {
          const [[account]]=await c.query('SELECT id,role,real_name,grade,class_no,status FROM users WHERE school_id=? AND username=? FOR UPDATE',[actor.schoolId,row.username]);
          if(stableHash(accountSnapshot(account))!==stableHash(row.expectedAccount))fail(409,'预览后账号已变化，请重新预览');
          let id=row.existingId;
          if(id&&row.role==='student'){
           const [[e]]=await c.query('SELECT revision FROM student_term_evaluation WHERE school_id=? AND term_id=? AND student_id=? FOR UPDATE',[actor.schoolId,batch.term_id,id]);
           if((e?String(e.revision):null)!==row.expectedRevision)fail(409,'预览后学籍已变化，请重新预览');
          }
          if(id){if(term.is_current||row.role==='teacher')await c.query('UPDATE users SET real_name=?,grade=?,class_no=? WHERE id=? AND school_id=?',[row.real_name,row.grade,row.classNo,id,actor.schoolId]);}
          else{const [r]=await c.query('INSERT INTO users(school_id,username,password,real_name,role,grade,class_no) VALUES(?,?,?,?,?,?,?)',[actor.schoolId,row.username,row.passwordHash,row.real_name,row.role,term.is_current?row.grade:null,term.is_current?row.classNo:null]);id=String(r.insertId);}
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
          if(p.diffs?.[i])p.diffs[i].studentId=row.role==='student'?id:null;
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
            payload: { rowNo:p.diffs?.[i]?.rowNo||i+1, username: row.username, kind: "ROSTER" },
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
