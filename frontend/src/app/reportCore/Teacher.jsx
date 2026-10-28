import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { api, resultOf, download } from "./api";
import { EvaluationForm, statusName } from "./Materials";
import TermReport from "../../component/TermReport";
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
export function StudentPicker({ ctx, value, onChange }) {
  return (
    <label>
      选择学生
      <select
        aria-label="选择学生"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {ctx.students.map((s) => (
          <option key={s.student_id} value={s.student_id}>
            {s.grade_snapshot}年级{s.class_no_snapshot}班 ·{" "}
            {s.student_name_snapshot}
          </option>
        ))}
      </select>
    </label>
  );
}
export function DirectScore({ ctx }) {
  const [ids, setIds] = useState([]),
    [category, setCategory] = useState(""),
    [reason, setReason] = useState("");
  const allowed = ctx.catalog.cardCatalog.filter(
    (c) =>
      subjectFor(c.targetColumn) === "CONDUCT" ||
      ctx.assignments.some(
        (a) => a.subject_code === subjectFor(c.targetColumn),
      ),
  );
  return (
    <section className="panel">
      <h2>无卡直评</h2>
      <p>选择学生和细分方向，每名学生记 1 分。重复提交会自动去重。</p>
      <label>
        评价方向
        <select
          aria-label="直评方向"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">请选择</option>
          {allowed.map((c) => (
            <option key={c.code} value={c.code}>
              {c.group} · {c.item}
            </option>
          ))}
        </select>
      </label>
      <div className="student-checks">
        {ctx.students.map((s) => (
          <label key={s.student_id}>
            <input
              type="checkbox"
              checked={ids.includes(s.student_id)}
              onChange={(e) =>
                setIds(
                  e.target.checked
                    ? [...ids, s.student_id]
                    : ids.filter((id) => id !== s.student_id),
                )
              }
            />
            {s.student_name_snapshot}
          </label>
        ))}
      </div>
      <label>
        评价说明
        <input
          aria-label="直评说明"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        className="primary"
        disabled={!ids.length || !category || !reason}
        onClick={() =>
          ctx.run(async () => {
            await api("/report-core/direct-scores", {
              termId: ctx.termId,
              studentIds: ids,
              categoryCode: category,
              reason,
            });
            ctx.refresh();
            ctx.notify("直评已记分");
          })
        }
      >
        为选中学生记 1 分
      </button>
      <section className="history">
        <h3>本次记录</h3>
        {ctx.sources
          .filter(
            (s) =>
              ["DIRECT", "REVERSAL", "CARD"].includes(s.record_kind) &&
              s.student_id,
          )
          .map((s) => (
            <div className="source-row" key={s.id}>
              <span>
                学生 #{s.student_id} ·{" "}
                {ctx.catalog.fields.find((f) => f.column === s.target_key)
                  ?.label || s.target_key}
              </span>
              <span>{s.record_kind === "REVERSAL" ? "−1" : "+1"}</span>
              {s.record_kind !== "REVERSAL" && (
                <button
                  onClick={() => {
                    const reason = prompt("填写冲销原因");
                    if (reason)
                      ctx.run(async () => {
                        await api(`/report-core/sources/${s.id}/reverse`, {
                          reason,
                        });
                        ctx.refresh();
                        ctx.notify("已冲销并重新计算");
                      });
                  }}
                >
                  冲销
                </button>
              )}
            </div>
          ))}
      </section>
    </section>
  );
}
export function ImportData({ ctx }) {
  const isManager = ctx.actor.role === "manager";
  const [kind, setKind] = useState(isManager ? "HEALTH" : "ACADEMIC"),
    [student, setStudent] = useState(ctx.students[0]?.student_id || ""),
    [values, setValues] = useState({}),
    [rows, setRows] = useState(null),
    [preview, setPreview] = useState(null);
  const fields = ctx.catalog.fields.filter(
    (f) =>
      !f.jsonPath &&
      f.sourceType === "IMPORT" &&
      (kind === "HEALTH"
        ? [
            "height_cm",
            "weight_kg",
            "vision_left",
            "vision_right",
            "jump_rope_1min",
          ].includes(f.column)
        : ![
            "height_cm",
            "weight_kg",
            "vision_left",
            "vision_right",
            "jump_rope_1min",
          ].includes(f.column)) &&
      (isManager ||
        ctx.assignments.some((a) => a.subject_code === subjectFor(f.column))),
  );
  async function loadFile(f) {
    const book = XLSX.read(await f.arrayBuffer());
    const raw = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
      defval: "",
    });
    if (kind === "ROSTER") {
      setRows(
        raw.map((r) => ({
          username: String(r.username),
          real_name: r.real_name,
          role: r.role,
          grade: Number(r.grade),
          classNo: Number(r.classNo),
          password: r.password,
        })),
      );
    } else
      setRows(
        raw.map((r) => ({
          ...(r.studentId
            ? { studentId: String(r.studentId) }
            : { username: String(r.username) }),
          values: Object.fromEntries(
            fields
              .filter(
                (field) =>
                  r[field.column] !== undefined && r[field.column] !== "",
              )
              .map((field) => [
                field.column,
                ["height_cm", "weight_kg", "jump_rope_1min"].includes(
                  field.column,
                ) || field.valueType === "star"
                  ? Number(r[field.column])
                  : String(r[field.column]),
              ]),
          ),
        })),
      );
    setPreview(null);
  }
  function template() {
    const headers =
      kind === "ROSTER"
        ? ["username", "real_name", "role", "grade", "classNo", "password"]
        : ["username", ...fields.map((f) => f.column)];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([headers]),
      "导入模板",
    );
    XLSX.writeFile(book, `${kind}-template.xlsx`);
  }
  return (
    <section className="panel">
      <h2>数据导入</h2>
      <p>
        先预览差异，再正式提交。空白不覆盖旧值；固定字段按实际星级或等级填写。
      </p>
      <label>
        导入类型
        <select
          aria-label="导入类型"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setRows(null);
            setPreview(null);
            setValues({});
          }}
        >
          {isManager ? (
            <>
              <option value="HEALTH">体测原始值</option>
              <option value="ROSTER">学籍账号</option>
              <option value="ACADEMIC">学业水平（需代导授权）</option>
            </>
          ) : (
            <option value="ACADEMIC">任教学科学业水平</option>
          )}
        </select>
      </label>
      <div className="actions">
        <button onClick={template}>下载 Excel 模板</button>
        <input
          aria-label="导入文件"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => ctx.run(() => loadFile(e.target.files[0]))}
        />
      </div>
      {kind !== "ROSTER" && (
        <>
          <h3>也可逐项录入后预览</h3>
          <StudentPicker ctx={ctx} value={student} onChange={setStudent} />
          <div className="field-grid">
            {fields.map((f) => (
              <label key={f.column}>
                {f.label}
                {["star", "grade"].includes(f.valueType) ? (
                  <select
                    aria-label={f.label}
                    value={values[f.column] ?? ""}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        [f.column]:
                          f.valueType === "star"
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  >
                    <option value="">不导入</option>
                    {(f.valueType === "star"
                      ? [1, 2, 3]
                      : ["A", "B", "C", "D"]
                    ).map((v) => (
                      <option key={v} value={v}>
                        {typeof v === "number" ? "★".repeat(v) : v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={f.label}
                    value={values[f.column] ?? ""}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        [f.column]: [
                          "height_cm",
                          "weight_kg",
                          "jump_rope_1min",
                        ].includes(f.column)
                          ? Number(e.target.value)
                          : e.target.value,
                      })
                    }
                  />
                )}
              </label>
            ))}
          </div>
        </>
      )}
      <div className="actions">
        <button
          onClick={() =>
            ctx.run(async () => {
              const r = resultOf(
                await api("/report-core/imports/preview", {
                  termId: ctx.termId,
                  kind,
                  rows: rows || [{ studentId: student, values }],
                }),
              );
              setPreview(r);
              ctx.notify("预览完成，请核对后提交");
            })
          }
        >
          预览导入
        </button>
        <button
          className="primary"
          disabled={!preview}
          onClick={() =>
            ctx.run(async () => {
              await api(`/report-core/imports/${preview.batchId}/commit`, {
                expectedRevision: preview.revision,
              });
              setPreview(null);
              setRows(null);
              setValues({});
              ctx.refresh();
              ctx.notify("导入已提交");
            })
          }
        >
          确认导入
        </button>
      </div>
      {rows && <p>{rows.length} 行待预览</p>}
      {preview && (
        <div className="preview-diff">
          <h3>预览通过 · {preview.validCount} 行</h3>
          {preview.diffs.map((row, i) => (
            <p key={i}>
              学生 #{row.studentId || row.username}　
              {Object.entries(row.values || {})
                .map(
                  ([k, v]) =>
                    `${ctx.catalog.fields.find((f) => f.column === k)?.label || k}：${v}`,
                )
                .join("；")}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
export function ReviewMaterials({ ctx }) {
  const [selected, setSelected] = useState(null),
    [target, setTarget] = useState(""),
    [output, setOutput] = useState(""),
    [reason, setReason] = useState(""),
    [dimensions, setDimensions] = useState([0, 0, 0, 0]);
  const rows = ctx.sources.filter(
    (s) =>
      s.record_kind === "ITEM" &&
      ["CERTIFICATE", "STORY"].includes(s.source_type) &&
      !["SUPERSEDED", "REVOKED", "REJECTED"].includes(s.status),
  );
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
      {rows.map((s) => (
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
              setSelected(s);
              setTarget("");
              setOutput("");
              setReason("");
            }}
          >
            查看与处理
          </button>
        </div>
      ))}
      {selected && (
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
                  {fields.map((f) => (
                    <option key={f.column} value={f.column}>
                      {f.label}
                    </option>
                  ))}
                  <option value="sports_specialties">体育特长</option>
                  <option value="art_specialties">艺术特长</option>
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
              disabled={!reason}
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
            {selected.status === "FAILED" && (
              <button
                onClick={() =>
                  ctx.run(async () => {
                    await api(`/report-core/sources/${selected.id}/retry`, {});
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
      )}
    </section>
  );
}
export function ReportDrafts({ ctx }) {
  const [student, setStudent] = useState(ctx.students[0]?.student_id || ""),
    [draft, setDraft] = useState(null),
    [layout, setLayout] = useState(false);
  useEffect(() => {
    setDraft(null);
    setLayout(false);
  }, [student, ctx.refreshKey]);
  return (
    <>
      <section className="panel">
        <h2>班级报告确认</h2>
        <StudentPicker ctx={ctx} value={student} onChange={setStudent} />
        <button
          onClick={() =>
            ctx.run(async () => {
              setLayout(false);
              setDraft(
                await api(
                  `/report-core/reports/drafts/${student}?termId=${ctx.termId}`,
                ),
              );
            })
          }
        >
          生成报告草稿
        </button>
      </section>
      {student && (
        <EvaluationForm key={student} ctx={ctx} studentId={student} />
      )}{" "}
      {draft && (
        <>
          <section className="panel">
            <h3>完整性检查</h3>
            {draft.missingItems.length ? (
              <ul>
                {draft.missingItems.map((m, i) => (
                  <li key={i}>
                    {ctx.catalog.fields.find((f) => f.column === m.field)
                      ?.label || m.field}
                    ：{m.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p>所有必需数据已齐全。</p>
            )}
            <p>
              {layout
                ? "打印布局检查通过"
                : "正在检查打印布局，或内容超出纸页；请核对并精简文字。"}
            </p>
            <button
              className="primary"
              disabled={!layout || !!draft.missingItems.length}
              onClick={() =>
                ctx.run(async () => {
                  await api("/report-core/reports/confirm", {
                    termId: ctx.termId,
                    studentId: student,
                    expectedRevision: draft.revision,
                    expectedFingerprint: draft.fingerprint,
                    layoutReview: {
                      fingerprint: draft.fingerprint,
                      templateVersion: draft.model.templateVersion,
                      overflow: false,
                    },
                  });
                  ctx.refresh();
                  ctx.notify("班主任确认已保存");
                })
              }
            >
              确认本份报告
            </button>
          </section>
          <TermReport html={draft.html} onLayout={setLayout} />
        </>
      )}
    </>
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
        ];
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
            const expectedRevisions = Object.fromEntries(
              ctx.students
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
