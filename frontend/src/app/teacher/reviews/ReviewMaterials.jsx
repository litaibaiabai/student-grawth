import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../core/api";
import { statusName } from "../../core/materialStatus";

export default function ReviewMaterials({ ctx }) {
  const { error: onError, selectedTask, sources, focusTask } = ctx;
  const [imageUrl, setImageUrl] = useState(null),
    [materialKind, setMaterialKind] = useState('all');
  const [selected, setSelected] = useState(null),
    [target, setTarget] = useState(""),
    [output, setOutput] = useState(""),
    [reason, setReason] = useState(""),
    [dimensions, setDimensions] = useState([0, 0, 0, 0]);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    setImageUrl(null);
    if (selected?.source_type === 'CERTIFICATE')
      fetch('/api/v1/report-core/files/' + selected.id, {
        signal: controller.signal,
        headers: {
          Authorization: 'Bearer ' + localStorage.getItem('REPORT_CORE_TOKEN'),
        },
      })
        .then((r) => {
          if (!r.ok) throw Error('无法读取材料');
          return r.blob();
        })
        .then((blob) => {
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
        })
        .catch((e) => {
          if (e.name !== 'AbortError') onError(e);
        });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected?.id, selected?.source_type, onError]);
  const rows = sources.filter(
    (s) =>
      s.record_kind === "ITEM" &&
      ["CERTIFICATE", "STORY"].includes(s.source_type) &&
      !["SUPERSEDED", "REVOKED", "REJECTED"].includes(s.status) &&
      (materialKind === 'all' || s.source_type === materialKind),
  );
  const selectMaterial = useCallback((s) => {
    setSelected(s);
    setTarget('');
    setOutput('');
    setReason('');
    setDimensions([0, 0, 0, 0]);
  }, []);
  useEffect(() => {
    const id = selectedTask?.sourceId,
      c = new AbortController();
    if (id) {
      const open = (row) => {
        selectMaterial(row);
        setMaterialKind(row.source_type);
        focusTask?.(null);
      };
      const row = sources.find((s) => String(s.id) === String(id));
      if (row) open(row);
      else
        api(
          `/report-core/sources?termId=${ctx.termId}&page=1&sourceId=${id}`,
          undefined,
          undefined,
          { signal: c.signal },
        )
          .then((result) => {
            if (c.signal.aborted) return;
            const source = result.rows.find((s) => String(s.id) === String(id));
            if (!source) throw Error('材料已撤回或无处理权限');
            open(source);
          })
          .catch((e) => {
            if (e.name !== 'AbortError') onError(e);
          });
    }
    return () => c.abort();
  }, [
    selectedTask,
    sources,
    focusTask,
    selectMaterial,
    ctx.termId,
    onError,
  ]);
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
      <div className="section-heading"><h2>材料认定与异常复核</h2><button onClick={ctx.refresh}>刷新材料状态</button></div>
      <p>
        系统自动评分失败时，教师按同一量规复核；奖状成果需依据实际材料认定。
      </p>
      <div className="evaluation-tabs" aria-label="材料类型">
        {[
          ['all', '全部材料'],
          ['CERTIFICATE', '奖状认定'],
          ['STORY', '故事复核'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={materialKind === id ? 'active' : ''}
            onClick={() => setMaterialKind(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="material-review-layout">
        <div className="material-review-list">
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
                  selectMaterial(s);
                }}
              >
                查看与处理
              </button>
            </div>
          ))}
          {ctx.sourceNext !== null && <div className="source-pagination"><p>还有材料尚未载入</p><button onClick={ctx.loadMoreSources}>加载下一批材料</button></div>}
        </div>
        {selected ? (
          <div className="review-box">
            <h3>材料 #{selected.id}</h3>
            {selected.source_type === "STORY" ? (
              <>
                <p className="story-text">{selected.payload.text}</p>
                <div className="field-grid">
                  {[
                    "内容完整性",
                    "类别相关性",
                    "表达条理",
                    "个人理解与感受",
                  ].map((name, i) => (
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
                  ))}
                </div>
              </>
            ) : (
              <>
                {imageUrl && (
                  <img
                    className="review-original"
                    src={imageUrl}
                    alt="待认定奖状原图"
                  />
                )}
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
                    {fields
                      .filter((f) =>
                        selected.allowedTargets?.includes(f.column),
                      )
                      .map((f) => (
                        <option key={f.column} value={f.column}>
                          {f.label}
                        </option>
                      ))}
                    {selected.allowedTargets?.includes(
                      'sports_specialties',
                    ) && <option value="sports_specialties">体育特长</option>}
                    {selected.allowedTargets?.includes(
                      'art_specialties',
                    ) && <option value="art_specialties">艺术特长</option>}
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
                disabled={!reason || !selected.canRecognize}
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
              {selected.canReject && (
                <button
                  disabled={!reason}
                  onClick={() =>
                    ctx.run(async () => {
                      await api(
                        `/report-core/certificates/${selected.id}/decision`,
                        {
                          expectedRevision: selected.revision,
                          reject: true,
                          reason,
                        },
                      );
                      setSelected(null);
                      ctx.refresh();
                      ctx.notify("材料已拒绝，学生可重新上传");
                    })
                  }
                >
                  拒绝认定
                </button>
              )}
              {selected.canRetry && (
                <button
                  onClick={() =>
                    ctx.run(async () => {
                      await api(
                        `/report-core/sources/${selected.id}/retry`,
                        { expectedRevision: selected.revision },
                      );
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
        ) : (
          <div className="review-empty">
            <h3>选择一份材料开始核对</h3>
            <p>
              先看原文或原图，再填写认定内容；保存成功后可继续处理下一份。
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
export { ReviewMaterials };
