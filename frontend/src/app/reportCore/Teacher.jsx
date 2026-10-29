import React, { useEffect, useState } from "react";
import { api, allStudents } from "./api";
import { statusName } from "./Materials";
export const subjectFor = (column) =>
  ({
    conduct: "CONDUCT",
    moral: "MORAL",
    chinese: "CHINESE",
    math: "MATH",
    science: "SCIENCE",
    english: "ENGLISH",
    pe: "PE",
    fitness: "PE",
    music: "MUSIC",
    fine: "FINE_ART",
    information: "INFORMATION_TECHNOLOGY",
    labor: "LABOR",
    integrated: "INTEGRATED_PRACTICE",
    local: "LOCAL_COURSE",
    story: "STORY",
  })[column.split("_")[0]];
export function ReviewMaterials({ ctx }) {
  const [imageUrl,setImageUrl] = useState(null),[materialKind,setMaterialKind]=useState('all');
  const [selected, setSelected] = useState(null),
    [target, setTarget] = useState(""),
    [output, setOutput] = useState(""),
    [reason, setReason] = useState(""),
    [dimensions, setDimensions] = useState([0, 0, 0, 0]);
  useEffect(() => {
    const controller=new AbortController();let objectUrl;
    setImageUrl(null);
    if(selected?.source_type==='CERTIFICATE')fetch('/api/v1/report-core/files/'+selected.id,{signal:controller.signal,headers:{Authorization:'Bearer '+localStorage.getItem('REPORT_CORE_TOKEN')}}).then(r=>{if(!r.ok)throw Error('无法读取材料');return r.blob();}).then(blob=>{if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setImageUrl(objectUrl);}).catch(e=>{if(e.name!=='AbortError')ctx.error(e);});
    return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[selected?.id]);
  const rows = ctx.sources.filter(
    (s) =>
      s.record_kind === "ITEM" &&
      ["CERTIFICATE", "STORY"].includes(s.source_type) &&
      !["SUPERSEDED", "REVOKED", "REJECTED"].includes(s.status) && (materialKind==='all'||s.source_type===materialKind),
  );
  const selectMaterial=s=>{setSelected(s);setTarget('');setOutput('');setReason('');setDimensions([0,0,0,0]);};
  useEffect(()=>{const id=ctx.selectedTask?.sourceId;if(id){const row=ctx.sources.find(s=>String(s.id)===String(id));if(row){selectMaterial(row);setMaterialKind(row.source_type);ctx.focusTask?.(null);}}},[ctx.selectedTask,ctx.sources]);
  const fields = ctx.catalog.fields.filter(
    (f) => f.sourceType === "CERTIFICATE" && !f.jsonPath,
  );
  async function image(s) {
    const r = await fetch("/api/v1/report-core/files/" + s.id, {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("REPORT_CORE_TOKEN"),
      },
    });
    if (!r.ok) throw Error("无法读取材料");
    const url = URL.createObjectURL(await r.blob());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return (
    <section className="panel">
      <h2>材料认定与异常复核</h2>
      <p>
        系统自动评分失败时，教师按同一量规复核；奖状成果需依据实际材料认定。
      </p>
      <div className="evaluation-tabs" aria-label="材料类型">{[['all','全部材料'],['CERTIFICATE','奖状认定'],['STORY','故事复核']].map(([id,label])=><button key={id} className={materialKind===id?'active':''} onClick={()=>setMaterialKind(id)}>{label}</button>)}</div>
      <div className="material-review-layout"><div className="material-review-list">{rows.map((s) => (
        <div className="source-row" key={s.id}>
          <div>
            <strong>
              学生 #{s.student_id} ·{" "}
              {s.source_type === "STORY"
                ? s.payload.category
                : s.payload.facts?.title || "奖状材料"}
            </strong>
            <p>
              {s.month_key} · {statusName[s.status] || s.status}{" "}
              {s.payload.score?.total !== undefined
                ? `${s.payload.score.total}分`
                : ""}
            </p>
          </div>
          <button
            onClick={() => {
              selectMaterial(s);
            }}
          >
            查看与处理
          </button>
        </div>
      ))}
      </div>{selected ? (
        <div className="review-box">
          <h3>材料 #{selected.id}</h3>
          {selected.source_type === "STORY" ? (
            <>
              <p className="story-text">{selected.payload.text}</p>
              <div className="field-grid">
                {["内容完整性", "类别相关性", "表达条理", "个人理解与感受"].map(
                  (name, i) => (
                    <label key={i}>
                      {name} / 25
                      <input
                        aria-label={name}
                        type="number"
                        min="0"
                        max="25"
                        value={dimensions[i]}
                        onChange={(e) =>
                          setDimensions(
                            dimensions.map((n, j) =>
                              j === i ? Number(e.target.value) : n,
                            ),
                          )
                        }
                      />
                    </label>
                  ),
                )}
              </div>
            </>
          ) : (
            <>
              {imageUrl&&<img className="review-original" src={imageUrl} alt="待认定奖状原图"/>}
              <button onClick={() => ctx.run(() => image(selected))}>
                查看奖状原图
              </button>
              <p>
                {Object.entries(selected.payload.facts || {})
                  .filter(([, v]) => typeof v !== "object")
                  .map(([k, v]) => `${k}：${v}`)
                  .join("；")}
              </p>
              <label>
                成果归属
                <select
                  aria-label="成果归属"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">选择成果字段</option>
                  {fields.filter(f=>selected.allowedTargets?.includes(f.column)).map((f) => (
                    <option key={f.column} value={f.column}>
                      {f.label}
                    </option>
                  ))}
                  {selected.allowedTargets?.includes('sports_specialties')&&<option value="sports_specialties">体育特长</option>}
                  {selected.allowedTargets?.includes('art_specialties')&&<option value="art_specialties">艺术特长</option>}
                </select>
              </label>
              <label>
                认定值
                {target.endsWith("_star") ? (
                  <select
                    aria-label="成果认定值"
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                  >
                    <option value="">选择</option>
                    {[1, 2, 3].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                ) : target.endsWith("_grade") ? (
                  <select
                    aria-label="成果认定值"
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                  >
                    <option value="">选择</option>
                    {["A", "B", "C", "D"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label="成果认定值"
                    placeholder={
                      target.endsWith("specialties")
                        ? "项目名称｜成果事实描述"
                        : "根据奖状填写事实描述"
                    }
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                  />
                )}
              </label>
            </>
          )}
          <label>
            审核 / 复核依据
            <textarea
              aria-label="审核依据"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </label>
          <div className="actions">
            <button
              className="primary"
              disabled={!reason||!selected.canRecognize}
              onClick={() =>
                ctx.run(async () => {
                  if (selected.source_type === "STORY")
                    await api(
                      `/report-core/story-batches/${selected.parent_id}/items/${selected.id}/review`,
                      {
                        expectedRevision: selected.revision,
                        dimensions,
                        reason,
                      },
                      "PATCH",
                    );
                  else {
                    let value = target.endsWith("_star")
                      ? Number(output)
                      : output;
                    if (target.endsWith("specialties")) {
                      const [name, outcome] = output.split("｜");
                      value = [{ name, outcome: outcome || reason }];
                    }
                    await api(
                      `/report-core/certificates/${selected.id}/decision`,
                      {
                        expectedRevision: selected.revision,
                        facts: selected.payload.facts || {},
                        targets: [target],
                        manualOutputs: { [target]: value },
                        reason,
                      },
                    );
                  }
                  setSelected(null);
                  ctx.refresh();
                  ctx.notify("认定已保存并重新汇总");
                })
              }
            >
              保存认定
            </button>
            {selected.canReject&&<button disabled={!reason} onClick={()=>ctx.run(async()=>{await api(`/report-core/certificates/${selected.id}/decision`,{expectedRevision:selected.revision,reject:true,reason});setSelected(null);ctx.refresh();ctx.notify('材料已拒绝，学生可重新上传');})}>拒绝认定</button>}
            {selected.canRetry && (
              <button
                onClick={() =>
                  ctx.run(async () => {
                    await api(`/report-core/sources/${selected.id}/retry`, {expectedRevision:selected.revision});
                    setSelected(null);
                    ctx.refresh();
                    ctx.notify("已重新排队");
                  })
                }
              >
                重试自动处理
              </button>
            )}
          </div>
        </div>
      ) : <div className="review-empty"><h3>选择一份材料开始核对</h3><p>先看原文或原图，再填写认定内容；保存成功后可继续处理下一份。</p></div>}</div>
    </section>
  );
}
export function Settlements({ ctx }) {
  const classes = [
    ...new Set(
      ctx.students.map((s) => `${s.grade_snapshot}:${s.class_no_snapshot}`),
    ),
  ];
  const [cls, setCls] = useState(classes[0] || ""),
    [kind, setKind] = useState("CARD_CLOSED");
  const [currentGrade, currentClass] = cls.split(":").map(Number);
  const myClass = ctx.assignments.filter(
    (a) => a.grade === currentGrade && a.class_no === currentClass,
  );
  const targets =
    kind === "CARD_CLOSED"
      ? ctx.catalog.fields
          .filter(
            (f) =>
              f.sourceType === "CARD" &&
              !f.jsonPath &&
              (subjectFor(f.column) === "CONDUCT" ||
                ctx.assignments.some(
                  (a) => a.subject_code === subjectFor(f.column),
                )),
          )
          .map((f) => f.column)
      : [
          ...ctx.catalog.fields
            .filter((f) => f.sourceType === "CERTIFICATE" && !f.jsonPath)
            .map((f) => f.column),
          "sports_specialties",
          "art_specialties",
        ].filter((column) =>
          myClass.some(
            (a) =>
              a.is_head_teacher ||
              a.subject_code === subjectFor(column) ||
              (column === "sports_specialties" && a.subject_code === "PE") ||
              (column === "art_specialties" &&
                ["MUSIC", "FINE_ART"].includes(a.subject_code)),
          ),
        );
  return (
    <section className="panel">
      <h2>采集结算</h2>
      <p>
        完成记录后再结算。真实零积分折为一星；暂无奖状保持空值，不虚构成果。
      </p>
      <label>
        班级
        <select
          aria-label="结算班级"
          value={cls}
          onChange={(e) => setCls(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c} value={c}>
              {c.replace(":", "年级")}班
            </option>
          ))}
        </select>
      </label>
      <label>
        结算内容
        <select
          aria-label="结算内容"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="CARD_CLOSED">本班所负责卡项目采集完成</option>
          <option value="NO_AWARD">本班成果材料已经全部处理</option>
        </select>
      </label>
      <button
        className="primary"
        onClick={() =>
          ctx.run(async () => {
            const [grade, classNo] = cls.split(":").map(Number);
            const currentStudents=await allStudents(ctx.termId);
            const expectedRevisions = Object.fromEntries(
              currentStudents
                .filter(
                  (s) =>
                    s.grade_snapshot === grade &&
                    s.class_no_snapshot === classNo,
                )
                .map((s) => [s.student_id, s.revision]),
            );
            await api("/report-core/settlements", {
              termId: ctx.termId,
              grade,
              classNo,
              targetKeys: targets,
              settlement: kind,
              expectedRevisions,
            });
            ctx.refresh();
            ctx.notify("采集结算已完成");
          })
        }
      >
        确认结算
      </button>
    </section>
  );
}
