const { fail, subjectFor } = require('../core/reportCorePolicy');
const { getTerm } = require('../core/reportCoreStore');
const { catalog, isV2 } = require('../core/reportCoreV2Policy');
const { enrolled } = require('./reportCoreV2Statistics');

const subjects = [
  ['MORAL','道德与法治'], ['CHINESE','语文'], ['MATH','数学'], ['SCIENCE','科学'],
  ['ENGLISH','英语'], ['PE','体育与健康'], ['MUSIC','音乐'], ['FINE_ART','美术'],
  ['INFORMATION_TECHNOLOGY','信息科技'], ['LABOR','劳动'], ['INTEGRATED_PRACTICE','综合实践活动'],
  ['LOCAL_COURSE','地方课程'], ['CONDUCT','日常行为'], ['UNASSIGNED','未归属学科'],
];
const subjectNames = new Map(subjects);
const selfFields = catalog.fields.filter(f => !f.jsonPath && f.sourceType === 'SELF' && f.valueType === 'star');
const levels = ['校级','区/县级','市级','省级','国家级','未标级别'];
const states = { cards:['ALL','REWARDED','NONE'], self:['ALL','COMPLETE','IN_PROGRESS','NOT_STARTED','NOT_APPLICABLE'],
  honors:['ALL','UPLOADED','NONE'], stories:['ALL','PARTICIPATED','NONE'] };
const percent = (value,total) => total ? Math.round(value / total * 1000) / 10 : null;
const subjectOf = row => subjectNames.has(row.subject_code) ? row.subject_code
  : subjectNames.has(subjectFor(row.target_key || '')) ? subjectFor(row.target_key) : 'UNASSIGNED';
const gradeName = n => `${['','一','二','三','四','五','六'][n] || n}年级`;

function validate(args) {
  if (args.actor?.role !== 'manager') fail(403,'仅管理员可查看数据统计');
  if (!/^[1-9]\d{0,19}$/.test(String(args.termId))) fail(422,'请选择有效学期');
  const tab = args.tab || 'cards', state = args.state || 'ALL';
  if (!Object.hasOwn(states,tab) || !states[tab].includes(state)) fail(422,'统计类型或筛选状态不合法');
  const int = (value,name,max) => {
    if (value === undefined || value === '') return undefined;
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value)<1 || Number(value)>max) fail(422,`${name}不合法`);
    return Number(value);
  };
  const grade = int(args.grade,'年级',99), classNo = int(args.classNo,'班级',999);
  if (classNo && !grade) fail(422,'请先选择年级');
  const subjectCode = args.subjectCode || '';
  if (subjectCode && (tab !== 'cards' || !subjectNames.has(subjectCode))) fail(422,'学科筛选不合法');
  if (args.keyword !== undefined && (typeof args.keyword !== 'string' || args.keyword.length > 80)) fail(422,'搜索内容最多80字');
  return { tab,state,grade,classNo,subjectCode,keyword:(args.keyword || '').trim(),page:int(args.page,'页码',1000000) || 1,pageSize:int(args.pageSize,'每页人数',100) || 20 };
}

async function snapshot(args, read) {
  const filters = validate(args), c = await args.pool.getConnection();
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await c.beginTransaction();
    const term = await getTerm(c,args.actor.schoolId,args.termId);
    if (!isV2(term.evaluation_config)) fail(422,'当前统计适用于六育 V2，请选择六育 V2 学期');
    // Only self-rating columns and identity metadata are read; no narratives or materials.
    const [all] = await c.query(`SELECT e.student_id,e.student_name_snapshot,e.grade_snapshot,e.class_no_snapshot,e.section_meta,
      ${selfFields.map(f=>`e.\`${f.column}\``).join(',')},u.username
      FROM student_term_evaluation e JOIN users u ON u.school_id=e.school_id AND u.id=e.student_id
      WHERE e.school_id=? AND e.term_id=? ORDER BY e.grade_snapshot,e.class_no_snapshot,e.student_id`,[args.actor.schoolId,args.termId]);
    const roster = all.filter(enrolled);
    const scope = roster.filter(r => (!filters.grade || Number(r.grade_snapshot)===filters.grade) && (!filters.classNo || Number(r.class_no_snapshot)===filters.classNo));
    const result = await read({c,term,roster,scope,filters});
    await c.commit();
    return result;
  } catch (error) { await c.rollback(); throw error; }
  finally { c.release(); }
}

const rewardFrom = `FROM evaluation_source_record s
  LEFT JOIN evaluation_source_record rev ON rev.school_id=s.school_id AND rev.term_id=s.term_id
    AND rev.original_id=s.id AND rev.record_kind='REVERSAL' AND rev.status='CONFIRMED'`;
const rewardWhere = `s.school_id=? AND s.term_id=? AND s.schema_version='SIX_EDU_V2' AND rev.id IS NULL
  AND s.source_type='CARD' AND ((s.record_kind='CARD' AND s.status='USED') OR (s.record_kind='DIRECT' AND s.status='CONFIRMED'))`;
const sourceSubject = "COALESCE(NULLIF(s.subject_code,''),JSON_UNQUOTE(JSON_EXTRACT(s.payload_json,'$.subjectCode')))";
const identity = r => ({studentId:String(r.student_id),studentName:r.student_name_snapshot,studentNumber:r.username,grade:Number(r.grade_snapshot),classNo:Number(r.class_no_snapshot)});
function paginate(rows, filters) {
  const total=rows.length, pages=Math.max(1,Math.ceil(total/filters.pageSize)), page=Math.min(filters.page,pages);
  return {rows:rows.slice((page-1)*filters.pageSize,page*filters.pageSize),pagination:{total,page,pageSize:filters.pageSize,pages}};
}
function matches(row, f) {
  if (f.keyword && !`${row.studentName}\n${row.studentNumber}`.toLocaleLowerCase().includes(f.keyword.toLocaleLowerCase())) return false;
  if (f.state === 'ALL') return true;
  if (f.tab==='self') return row.state===f.state;
  return f.state==='NONE' ? row.totalCount===0 : row.totalCount>0;
}

async function getAdminStatistics(args) {
  return snapshot(args,async ({c,term,roster,scope,filters:f}) => {
    const params=[args.actor.schoolId,args.termId];
    let rows=scope.map(identity),summary,charts;
    const byStudent=new Map(rows.map(r=>[r.studentId,r]));
    if (f.tab==='cards') {
      for (const r of rows) Object.assign(r,{cardCount:0,directCount:0,totalCount:0});
      const bySubject=new Map(subjects.map(([subjectCode,label])=>[subjectCode,{subjectCode,label,cardCount:0,directCount:0,totalCount:0}]));
      const [counts]=await c.query(`SELECT s.student_id,s.target_key,${sourceSubject} subject_code,s.record_kind,COUNT(*) count ${rewardFrom}
        WHERE ${rewardWhere} GROUP BY s.student_id,s.target_key,subject_code,s.record_kind`,params);
      for (const count of counts) {
        const student=byStudent.get(String(count.student_id)), subjectCode=subjectOf(count);
        if (!student || f.subjectCode && f.subjectCode!==subjectCode) continue;
        const key=count.record_kind==='CARD'?'cardCount':'directCount', n=Number(count.count), subject=bySubject.get(subjectCode);
        student[key]+=n; student.totalCount+=n; subject[key]+=n; subject.totalCount+=n;
      }
      summary={participants:rows.filter(r=>r.totalCount>0).length,cardCount:0,directCount:0,totalCount:0};
      for (const row of rows) for (const key of ['cardCount','directCount','totalCount']) summary[key]+=row[key];
      charts={subjects:[...bySubject.values()].filter(s=>!f.subjectCode || s.subjectCode===f.subjectCode)};
    } else if (f.tab==='self') {
      const applicable=new Set(term.evaluation_config.applicableFields || selfFields.map(f=>f.column));
      const fields=selfFields.filter(f=>applicable.has(f.column));
      rows=scope.map(e=>{
        const stars={1:0,2:0,3:0};
        for (const field of fields) if ([1,2,3].includes(Number(e[field.column]))) stars[Number(e[field.column])]++;
        const rated=stars[1]+stars[2]+stars[3],total=fields.length;
        return {...identity(e),total,rated,stars,state:!total?'NOT_APPLICABLE':rated===total?'COMPLETE':rated?'IN_PROGRESS':'NOT_STARTED'};
      });
      summary={completed:0,inProgress:0,notStarted:0,notApplicable:0,eligible:0,completionRate:null,rated:0,stars:{1:0,2:0,3:0}};
      const keys={COMPLETE:'completed',IN_PROGRESS:'inProgress',NOT_STARTED:'notStarted',NOT_APPLICABLE:'notApplicable'},groups=new Map();
      for (const row of rows) {
        summary[keys[row.state]]++; summary.rated+=row.rated;
        for (const star of [1,2,3]) summary.stars[star]+=row.stars[star];
        const key=f.grade?`${row.grade}:${row.classNo}`:String(row.grade);
        if (!groups.has(key)) groups.set(key,{key,label:f.grade?`${row.classNo} 班`:gradeName(row.grade),total:0,eligible:0,completed:0});
        const group=groups.get(key); group.total++; if(row.total) group.eligible++; if(row.state==='COMPLETE') group.completed++;
      }
      summary.eligible=rows.length-summary.notApplicable;
      summary.completionRate=percent(summary.completed,summary.eligible);
      charts={groups:[...groups.values()].map(g=>({...g,rate:percent(g.completed,g.eligible)}))};
    } else if (f.tab==='honors') {
      for (const row of rows) Object.assign(row,{totalCount:0,approved:0,pending:0,rejected:0,revoked:0,failed:0});
      const [counts]=await c.query(`SELECT student_id,status,
        CASE WHEN status='APPROVED' THEN COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.honor.region')),JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.facts.awardRegion'))) END level,
        COUNT(*) count FROM evaluation_source_record WHERE school_id=? AND term_id=? AND schema_version='SIX_EDU_V2'
        AND source_type='CERTIFICATE' AND record_kind='ITEM' AND status IN ('APPROVED','QUEUED','PROCESSING','SUBMITTED','REJECTED','REVOKED','FAILED')
        GROUP BY student_id,status,level`,params);
      const byLevel=new Map(levels.map(label=>[label,{label,count:0}]));
      const statusKey={APPROVED:'approved',QUEUED:'pending',PROCESSING:'pending',SUBMITTED:'pending',REJECTED:'rejected',REVOKED:'revoked',FAILED:'failed'};
      for (const count of counts) {
        const row=byStudent.get(String(count.student_id)); if(!row) continue;
        const n=Number(count.count); row.totalCount+=n; row[statusKey[count.status]]+=n;
        if (count.status==='APPROVED') {
          let level=['区级','县级','区／县级'].includes(count.level)?'区/县级':count.level;
          if(!byLevel.has(level)) level='未标级别'; byLevel.get(level).count+=n;
        }
      }
      summary={participants:rows.filter(r=>r.totalCount>0).length,totalCount:0,approved:0,pending:0,rejected:0,revoked:0,failed:0};
      for(const row of rows) for(const key of ['totalCount','approved','pending','rejected','revoked','failed']) summary[key]+=row[key];
      charts={levels:[...byLevel.values()]};
    } else {
      for(const row of rows) Object.assign(row,{tellCount:0,listenCount:0,writeCount:0,totalCount:0});
      const [counts]=await c.query(`SELECT w.student_id,w.event_type,COUNT(*) count FROM evaluation_source_record w
        LEFT JOIN evaluation_source_record v ON v.school_id=w.school_id AND v.term_id=w.term_id AND v.student_id=w.student_id
          AND v.id=w.current_version_id AND v.parent_id=w.id AND v.source_type='STORY' AND v.record_kind='ITEM' AND v.schema_version='SIX_EDU_V2'
        WHERE w.school_id=? AND w.term_id=? AND w.schema_version='SIX_EDU_V2' AND w.source_type='STORY' AND (
          (w.record_kind='ITEM' AND w.event_type IN ('TELL_RECORDING','LISTEN_COMPLETE') AND w.status='CONFIRMED') OR
          (w.record_kind='BATCH' AND w.status='SUBMITTED' AND v.status IN ('SUBMITTED','QUEUED','PROCESSING','SCORED','APPROVED','FAILED') AND
            ((w.event_type='WRITE_WORK' AND v.event_type='WRITE_SUBMISSION') OR (w.event_type='TELL_WORK' AND v.event_type='TELL_SUBMISSION'))))
        GROUP BY w.student_id,w.event_type`,params);
      for(const count of counts) {
        const row=byStudent.get(String(count.student_id)); if(!row) continue;
        const key=count.event_type==='WRITE_WORK'?'writeCount':count.event_type==='LISTEN_COMPLETE'?'listenCount':'tellCount';
        row[key]+=Number(count.count); row.totalCount+=Number(count.count);
      }
      summary={participants:rows.filter(r=>r.totalCount>0).length,tellParticipants:0,listenParticipants:0,writeParticipants:0,tellCount:0,listenCount:0,writeCount:0};
      for(const row of rows) for(const type of ['tell','listen','write']) { summary[`${type}Count`]+=row[`${type}Count`]; if(row[`${type}Count`]) summary[`${type}Participants`]++; }
      charts={stories:['tell','listen','write'].map((type,i)=>({type,label:['讲故事','听故事','写故事'][i],count:summary[`${type}Count`],participants:summary[`${type}Participants`],rate:percent(summary[`${type}Participants`],rows.length)}))};
    }
    return {tab:f.tab,scope:{students:scope.length,classes:new Set(scope.map(r=>`${r.grade_snapshot}:${r.class_no_snapshot}`)).size},
      filters:{grades:[...new Set(roster.map(r=>Number(r.grade_snapshot)))].sort((a,b)=>a-b),classes:[...new Set(roster.filter(r=>!f.grade || Number(r.grade_snapshot)===f.grade).map(r=>Number(r.class_no_snapshot)))].sort((a,b)=>a-b),subjects:subjects.map(([subjectCode,label])=>({subjectCode,label}))},
      summary,charts,...paginate(rows.filter(row=>matches(row,f)),f),asOf:new Date().toISOString()};
  });
}

async function getStudentRewardRecords(args) {
  if(!/^[1-9]\d{0,19}$/.test(String(args.studentId))) fail(422,'学生标识不合法');
  return snapshot({...args,tab:'cards'},async ({c,scope,filters})=>{
    const student=scope.find(r=>String(r.student_id)===String(args.studentId));
    if(!student) fail(404,'学生不在当前统计范围');
    const [records]=await c.query(`SELECT s.id,s.target_key,${sourceSubject} subject_code,s.record_kind,u.real_name teacher_name,
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.payload_json,'$.usedAt')),JSON_UNQUOTE(JSON_EXTRACT(s.payload_json,'$.occurredAt'))) occurred_at,s.created_at
      ${rewardFrom} LEFT JOIN users u ON u.school_id=s.school_id AND u.id=COALESCE(s.owner_teacher_id,s.actor_id)
      WHERE ${rewardWhere} AND s.student_id=? ORDER BY s.id DESC`,[args.actor.schoolId,args.termId,args.studentId]);
    const rows=records.filter(r=>!filters.subjectCode || subjectOf(r)===filters.subjectCode).map(r=>({id:String(r.id),
      subjectCode:subjectOf(r),subjectName:subjectNames.get(subjectOf(r)),kind:r.record_kind,teacherName:r.teacher_name || '未记录',
      label:catalog.cardCatalog.find(f=>f.targetColumn===r.target_key)?.label || catalog.fields.find(f=>f.column===r.target_key)?.label || '奖励记录',occurredAt:r.occurred_at || r.created_at}));
    return {student:identity(student),...paginate(rows,filters)};
  });
}
module.exports={getAdminStatistics,getStudentRewardRecords};
