const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createCoreTestDb } = require("./helpers/reportCoreDb");
test(
  "school release and indexed class reads meet dedicated 3000-student fixture budgets",
  { skip: !process.env.REPORT_PERF, timeout: 600000 },
  async (t) => {
    const db = await createCoreTestDb(t);
    await db.seedBase();
    const clockConnection=await db.pool.getConnection();try{await require('../scripts/runCoreMigrations').recordUtcCutover({connection:clockConnection,targetDb:db.name,schoolId:'1',verifiedLegacyOffsetMinutes:0});}finally{clockConnection.release();}
    const p = require("../services/reportCorePolicy");
    const e = require("../services/reportCoreEvaluation");
    const pub = require("../services/reportCorePublish");
    const { getTerm } = require("../services/reportCoreStore");
    const [[u]] = await db.pool.query("SELECT password FROM users LIMIT 1");
    const total = 3000;
    for (let start = 5; start < total + 3; start += 500) {
      const users = [],
        evals = [];
      for (let id = start; id < Math.min(start + 500, total + 3); id++) {
        const cls = Math.floor((id - 3) / 50) + 1;
        users.push([
          id,
          1,
          "perf" + id,
          u.password,
          "样本" + id,
          "student",
          4,
          cls,
        ]);
        evals.push([1, 1, id, "样本" + id, 4, cls, "CORE_V1", "1"]);
      }
      await db.pool.query(
        "INSERT INTO users(id,school_id,username,password,real_name,role,grade,class_no) VALUES ?",
        [users],
      );
      await db.pool.query(
        "INSERT INTO student_term_evaluation(school_id,term_id,student_id,student_name_snapshot,grade_snapshot,class_no_snapshot,template_version,rule_version) VALUES ?",
        [evals],
      );
    }
    const assignments = p.fixedFields.map((f) => `\`${f.column}\`=?`);
    const values = p.fixedFields.map((f) =>
      f.valueType === "star"
        ? 3
        : f.valueType === "grade"
          ? "A"
          : ["height_cm", "weight_kg"].includes(f.column)
            ? 100
            : f.column === "jump_rope_1min"
              ? 160
              : f.column.startsWith("vision_")
                ? "5.0"
                : "简短真实文本",
    );
    const sources = Object.fromEntries(
      p.fixedFields
        .filter((f) => f.sourceType === "CARD")
        .map((f) => [f.column, { settled: true }]),
    );
    await db.pool.query(
      "UPDATE student_term_evaluation SET " +
        assignments.join(",") +
        "," +
        p.narratives.map((n) => `\`${n}\`='期末简短评价'`).join(",") +
        ",field_sources=?",
      [...values, JSON.stringify(sources)],
    );
    const term = await getTerm(db.pool, "1", "1");
    const [all] = await db.pool.query("SELECT * FROM student_term_evaluation");
    for (const row of all)
      await db.pool.query(
        "UPDATE student_term_evaluation SET status='CONFIRMED',confirmed_revision=revision,confirmed_by=2,confirmed_at=UTC_TIMESTAMP(6),approval_fingerprint=? WHERE id=?",
        [e.reportFingerprint(row, term), row.id],
      );
    const sourceCount = Number(process.env.REPORT_PERF_SOURCES || 2000000);
    const teachers=Array.from({length:100},(_,i)=>i===0?2:5000+i);
    for(let i=1;i<teachers.length;i++){
      await db.pool.query("INSERT INTO users(id,school_id,username,password,real_name,role) VALUES(?,1,?,?,?,'teacher')",[teachers[i],'teacher'+i,u.password,'教师'+i]);
      for(const code of ['MORAL','CHINESE','MATH','SCIENCE','ENGLISH','PE','MUSIC','FINE_ART','INFORMATION_TECHNOLOGY','LABOR','INTEGRATED_PRACTICE','LOCAL_COURSE','STORY'])await db.pool.query('INSERT INTO teacher_teaching_assignment(school_id,term_id,teacher_id,grade,class_no,subject_code,is_head_teacher) VALUES(1,1,?,4,?,?,?)',[teachers[i],i%60+1,code,i<60?1:0]);
    }
    const actor={id:'1',schoolId:'1',role:'manager',tokenVersion:1},command=n=>({requestKey:'perf-'+n,payloadHash:p.stableHash(n)}),teacher=index=>({id:String(teachers[index]),schoolId:'1',role:'teacher',tokenVersion:1});
    const cards=require('../services/reportCoreCards'),ledger=require('../services/reportCoreLedger'),browser=require('../services/reportCoreReportBrowser'),read=require('../services/reportCoreReadModels');
    const quota=await cards.saveQuota({pool:db.pool,actor,termId:'1',teacherId:'2',monthKey:'2026-10',total:100,command:command('quota')});
    const plan=await cards.savePlan({pool:db.pool,actor:teacher(0),quotaId:quota.result.quotaId,expectedRevision:'1',plans:[{grade:4,classNo:1,classTotal:100,items:[{categoryCode:'CONDUCT_POLITENESS_OTHER_STAR',count:100}]}],command:command('plan')});
    await cards.generateCards({pool:db.pool,actor:teacher(0),quotaId:quota.result.quotaId,expectedRevision:plan.result.revision,command:command('generate')});
    for (let start=0;start<sourceCount;start+=5000){
      const rows=[];for(let i=start;i<Math.min(start+5000,sourceCount);i++){const ti=i%100,cls=ti%60+1,sid=3+(cls-1)*50+Math.floor(i/100)%50;rows.push([1,1,sid,'CARD','DIRECT','CONFIRMED',1,p.catalog.cardCatalog[i%37].targetColumn,i.toString(16).padStart(64,'0'),'a'.repeat(64),JSON.stringify({occurredAt:'2026-10-15T00:00:00.000Z'}),teachers[ti],teachers[ti],'2026-10']);}
      await db.pool.query('INSERT INTO evaluation_source_record(school_id,term_id,student_id,source_type,record_kind,status,delta,target_key,business_key,payload_hash,payload_json,actor_id,owner_teacher_id,month_key) VALUES ?',[rows]);if(start%250000===0)console.log('performance sources',start);
    }
    const metrics={};
    async function measure(name,fn,budget=800){const durations=await Promise.all(Array.from({length:50},async(_,i)=>{const started=performance.now();await fn(i);return performance.now()-started;}));durations.sort((a,b)=>a-b);metrics[name]={p95Ms:durations[47],maxMs:durations[49],budgetMs:budget,passed:budget?durations[47]<=budget:null};console.log('performance metric',name,metrics[name]);return durations[47];}
    const p95=await measure('indexedClassSql',()=>db.pool.query('SELECT student_id,revision,status FROM student_term_evaluation WHERE school_id=1 AND term_id=1 AND grade_snapshot=4 AND class_no_snapshot=1 LIMIT 100'));
    await measure('reportStudentList',i=>browser.listReportStudents({pool:db.pool,actor:teacher(i),termId:'1',limit:25}));
    await measure('workspace',i=>read.getWorkspace({pool:db.pool,actor:teacher(i),termId:'1',limit:25}));
    const ledgerArgs=i=>({pool:db.pool,actor:teacher(i),filters:ledger.normalizeLedgerQuery({termId:'1',monthFrom:'2026-10',monthTo:'2026-10'},teacher(i)),limit:25});
    await measure('ledgerCardListFirstTouch',i=>ledger.listLedgerCards(ledgerArgs(i)),null);
    await measure('ledgerCardList',async i=>{const result=await ledger.listLedgerCards(ledgerArgs(i));assert.equal(result.summary.direct,Math.floor(sourceCount/100));if(i===0)assert.equal(result.rows.length,25);});
    await measure('ledgerEventList',i=>ledger.listLedgerUsage({...ledgerArgs(i),groupBy:'event'}));
    for(const [name,filter] of [['ledgerClassFilter',i=>({grade:4,classNo:i%60+1})],['ledgerStudentFilter',i=>({studentId:String(3+(i%60)*50)})],['ledgerIndicatorFilter',()=>({categoryCode:'CONDUCT_POLITENESS_OTHER_STAR'})]])await measure(name,i=>ledger.listLedgerUsage({...ledgerArgs(i),filters:{...ledgerArgs(i).filters,...filter(i)},groupBy:'event'}));
    // One ordinary reversal per teacher must not disable the grouped list path.
    for(let i=0;i<50;i++){const [[source]]=await db.pool.query("SELECT id,student_id,target_key FROM evaluation_source_record WHERE actor_id=? AND record_kind='DIRECT' AND school_id=1 AND term_id=1 ORDER BY id LIMIT 1",[teachers[i]]);await require('../services/reportCoreStore').addSource(db.pool,{schoolId:'1',termId:'1',studentId:source.student_id,actorId:String(teachers[i]),sourceType:'CARD',kind:'REVERSAL',originalId:source.id,target:source.target_key,status:'CONFIRMED',delta:-1,key:['perf-reversal',i],payload:{reason:'disposable single reversal',occurredAt:new Date().toISOString()}});}
    for(const groupBy of ['student','indicator'])await measure('ledgerGrouped_'+groupBy,i=>ledger.listLedgerUsage({...ledgerArgs(i),groupBy}));
    await measure('ledgerAfterSingleReversal',i=>ledger.listLedgerUsage({...ledgerArgs(i),filters:{...ledgerArgs(i).filters,grade:4,classNo:i%60+1},groupBy:'event'}));
    await measure('ordinaryDirectWrite',i=>cards.directScore({pool:db.pool,actor:teacher(0),termId:'1',studentIds:[String(3+i)],categoryCode:'CONDUCT_POLITENESS_OTHER_STAR',reason:'',command:command('write-'+i)}),1500);
    const {Writable}=require('node:stream');let bytes=0,firstByteMs=null;const exportStart=performance.now(),response=new Writable({write(chunk,encoding,callback){bytes+=chunk.length;if(firstByteMs===null)firstByteMs=performance.now()-exportStart;callback();}});response.setHeader=()=>{};
    const exported=await ledger.streamLedgerCsv({...ledgerArgs(0),view:'events',response});metrics.csvExport={rows:exported.rowCount,bytes,firstByteMs,totalMs:performance.now()-exportStart};
    // Writes above legitimately invalidate their current reports; reconfirm only the disposable fixture for publication timing.
    for(const row of (await db.pool.query('SELECT * FROM student_term_evaluation WHERE student_id BETWEEN 3 AND 52'))[0])await db.pool.query("UPDATE student_term_evaluation SET status='CONFIRMED',confirmed_revision=revision,confirmed_by=2,confirmed_at=UTC_TIMESTAMP(6),approval_fingerprint=? WHERE id=?",[e.reportFingerprint(row,term),row.id]);
    const r = await pub.beginRelease({
      pool: db.pool,
      actor,
      termId: "1",
      command: command(1),
    });
    let state = r;
    const start = performance.now();
    while (state.prepared < state.total)
      state = await pub.prepareReleaseChunk({
        pool: db.pool,
        termId: "1",
        releaseKey: r.releaseKey,
        fence: r.fence,
        limit: 50,
      });
    const prepareMs = performance.now() - start;
    const active = performance.now();
    await pub.activateRelease({
      pool: db.pool,
      actor,
      termId: "1",
      releaseKey: r.releaseKey,
      fence: r.fence,
      command: command(2),
    });
    const activateMs = performance.now() - active;

    const settings=require('../services/reportCoreTermSettings');
    const settingsStart=performance.now();
    const settingsPreview=await settings.previewTermSettings({pool:db.pool,actor,termId:'1',section:'rules',expectedConfigVersion:term.config_version,expectedRuleVersion:term.rule_version,changes:{cardTarget:3,requiredMonths:['2026-10']},command:command('settings-preview')});
    const settingsPreviewMs=performance.now()-settingsStart,commitStart=performance.now();
    const recalculated=await settings.commitTermSettingsPreview({pool:db.pool,actor,previewId:settingsPreview.result.previewId,expectedRevision:'1',command:command('settings-commit')});
    metrics.configurationRecalculation={students:3000,previewMs:settingsPreviewMs,commitTransactionMs:performance.now()-commitStart,bodyLockMs:recalculated.result.elapsedMs};

    const dir = path.join(__dirname, "../../output/report-core");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "performance.json"),
      JSON.stringify(
        {
          students: total,
          sources: sourceCount,
          concurrentReads: 50,
          classListP95Ms: p95,
          teacherCount:teachers.length,metrics,
          prepareMs,
          activateMs,
        },
        null,
        2,
      ),
    );
    assert.ok(prepareMs <= 120000, `prepare ${prepareMs}`);
    assert.ok(activateMs <= 3000, `activate ${activateMs}`);
    for(const [name,result] of Object.entries(metrics))if(result.budgetMs)assert.ok(result.passed,`${name} p95 ${result.p95Ms} exceeds ${result.budgetMs}`);
  },
);
