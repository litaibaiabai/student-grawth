import React, { useEffect, useState } from "react";
import { api, resultOf, download } from "./api";
export function Cards({ ctx }) {
  const [token, setToken] = useState(() => {
    const match = location.hash.match(/[?&]card=([^&]+)/);
    return match
      ? decodeURIComponent(match[1])
      : sessionStorage.getItem("pendingCard") || "";
  });
  const [card, setCard] = useState(null);
  useEffect(() => {
    if (token) sessionStorage.setItem("pendingCard", token);
  }, [token]);
  const value = () => {
    try {
      return new URL(token).hash.match(/[?&]card=([^&]+)/)?.[1] || token;
    } catch {
      return token;
    }
  };
  return (
    <section className="panel">
      <h2>扫卡领取</h2>
      <p>卡片已确定班级和评价方向，领取后自动记 1 分。</p>
      <label>
        扫码链接或卡片凭证
        <input
          aria-label="卡片凭证"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setCard(null);
          }}
          placeholder="扫描后粘贴链接，或输入凭证"
        />
      </label>
      <div className="actions">
        <button
          onClick={() =>
            ctx.run(async () =>
              setCard(
                await api("/report-core/cards/preview", { token: value() }),
              ),
            )
          }
        >
          读取卡片
        </button>
        <button
          className="primary"
          disabled={!card}
          onClick={() =>
            ctx.run(async () => {
              await api("/report-core/cards/redeem", { token: value() });
              setCard(null);
              setToken("");
              sessionStorage.removeItem("pendingCard");
              ctx.notify("领取成功，已记 1 分");
            })
          }
        >
          确认领取
        </button>
      </div>
      {card && (
        <p className="notice">
          {card.grade}年级{card.classNo}班 · {card.category} · {card.status}
        </p>
      )}
    </section>
  );
}
export function AwardUpload({ ctx }) {
  const [file, setFile] = useState(null);
  return (
    <>
      <section className="panel">
        <h2>上传奖状</h2>
        <p>
          上传清晰的 PNG / JPEG 图片，最大
          5MB。识别或人工确认后形成特长与成果记录。
        </p>
        <input
          aria-label="奖状文件"
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <button
          className="primary"
          disabled={!file}
          onClick={() =>
            ctx.run(async () => {
              const data = new FormData();
              data.set("file", file);
              data.set("termId", ctx.termId);
              data.set("requestKey", crypto.randomUUID());
              await api("/report-core/certificates", data);
              setFile(null);
              ctx.refresh();
              ctx.notify("奖状已提交，等待识别与认定");
            })
          }
        >
          提交奖状
        </button>
      </section>
      <SourceList ctx={ctx} types={["CERTIFICATE"]} />
    </>
  );
}
export function StoryForm({ ctx }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [articles, setArticles] = useState(
      ["READ", "LISTEN", "TELL"].map((category) => ({ category, text: "" })),
    );
  const [saved, setSaved] = useState(null);
  const labels = {
    READ: "我爱读故事",
    LISTEN: "我爱听故事",
    TELL: "我爱讲故事",
  };
  const update = (index, text) => {
    setArticles((a) => a.map((x, i) => (i === index ? { ...x, text } : x)));
    setSaved(null);
  };
  async function save() {
    if (saved) return saved;
    const last = ctx.sources
      .filter(
        (s) =>
          s.record_kind === "BATCH" &&
          s.source_type === "STORY" &&
          s.month_key === month,
      )
      .sort((a, b) => b.version - a.version)[0];
    const r = resultOf(
      await api("/report-core/story-batches", {
        termId: ctx.termId,
        monthKey: month,
        expectedRevision: last?.revision,
        articles: articles.filter((a) => a.text.trim()),
      }),
    );
    setSaved(r);
    return r;
  }
  return (
    <>
      <section className="panel">
        <h2>每月故事 · 一次提交</h2>
        <p>
          读、听、讲每类 1–3 篇，可粘贴文字或上传
          TXT。系统按类别评价，篇数不会增加权重。
        </p>
        <label>
          所属月份
          <input
            aria-label="故事月份"
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setSaved(null);
            }}
          />
        </label>
        {Object.entries(labels).map(([category, label]) => (
          <div className="story-group" key={category}>
            <h3>
              {label}{" "}
              <span>
                {articles.filter((a) => a.category === category).length} / 3 篇
              </span>
            </h3>
            {articles.map(
              (a, index) =>
                a.category === category && (
                  <div key={index}>
                    <label>
                      {label}第
                      {
                        articles
                          .slice(0, index + 1)
                          .filter((x) => x.category === category).length
                      }
                      篇
                      <textarea
                        aria-label={`${label}${articles.slice(0, index + 1).filter((x) => x.category === category).length}`}
                        maxLength={20000}
                        rows={5}
                        value={a.text}
                        onChange={(e) => update(index, e.target.value)}
                        placeholder="输入或粘贴故事文本…"
                      />
                    </label>
                    <div className="actions compact">
                      <input
                        aria-label={`${label}文本文件`}
                        type="file"
                        accept=".txt,text/plain"
                        onChange={(e) =>
                          ctx.run(async () => {
                            const f = e.target.files[0];
                            if (f.size > 65536) throw Error("TXT最大64KB");
                            const text = new TextDecoder("utf-8", {
                              fatal: true,
                            }).decode(await f.arrayBuffer());
                            update(index, text);
                          })
                        }
                      />
                      {articles.filter((x) => x.category === category).length >
                        1 && (
                        <button
                          onClick={() => {
                            setArticles(articles.filter((_, i) => i !== index));
                            setSaved(null);
                          }}
                        >
                          删除此篇
                        </button>
                      )}
                    </div>
                  </div>
                ),
            )}
            <button
              disabled={
                articles.filter((a) => a.category === category).length >= 3
              }
              onClick={() => {
                setArticles([...articles, { category, text: "" }]);
                setSaved(null);
              }}
            >
              ＋ 添加一篇
            </button>
          </div>
        ))}
        <div className="actions">
          <button
            onClick={() =>
              ctx.run(async () => {
                await save();
                ctx.notify("草稿已保存");
                ctx.refresh();
              })
            }
          >
            保存草稿
          </button>
          <button
            className="primary"
            onClick={() =>
              ctx.run(async () => {
                const d = await save();
                await api(`/report-core/story-batches/${d.batchId}/submit`, {
                  expectedRevision: d.revision,
                });
                setSaved(null);
                ctx.refresh();
                ctx.notify("整月故事已提交，评分中");
              })
            }
          >
            提交本月三类故事
          </button>
        </div>
      </section>
      <SourceList ctx={ctx} types={["STORY"]} />
    </>
  );
}
export function EvaluationForm({ ctx, studentId = ctx.actor.id }) {
  const [view, setView] = useState(null),
    [dirty, setDirty] = useState({}),
    [special, setSpecial] = useState([]);
  useEffect(() => {
    let active = true;
    api(`/report-core/evaluations/${studentId}?termId=${ctx.termId}`)
      .then((v) => {
        if (active) {
          setView(v);
          setDirty({});
          setSpecial([]);
        }
      })
      .catch(ctx.error);
    return () => {
      active = false;
    };
  }, [studentId, ctx.termId, ctx.refreshKey]);
  if (!view) return <p>正在读取评价…</p>;
  const labels = {
    self_conduct_text: "品行美自述",
    self_wisdom_text: "智慧美自述",
    self_health_text: "健康美自述",
    self_art_text: "艺术美自述",
    self_labor_text: "劳动美自述",
    semester_highlights: "本学期最大收获与活动",
    next_term_goals: "下学期努力目标",
    teacher_comment: "学期寄语",
    family_message: "家长寄语（家长协助填写，可选）",
  };
  const fields = ctx.catalog.fields.filter(
    (f) => !f.jsonPath && view.allowedFields.includes(f.column),
  );
  const value = (k) =>
    Object.hasOwn(dirty, k) ? dirty[k] : (view.values[k] ?? "");
  return (
    <section className="panel">
      <h2>
        {ctx.actor.role === "student" ? "我的自我评价" : "教师评价与学期寄语"}
      </h2>
      <p>只保存本次修改的字段。当前修订 {view.revision}。</p>
      <div className="field-grid">
        {fields.map((f) => (
          <label key={f.column}>
            {f.label}
            <select
              aria-label={f.label}
              value={value(f.column)}
              onChange={(e) =>
                setDirty({
                  ...dirty,
                  [f.column]: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">未填写</option>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {"★".repeat(n)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {view.allowedFields
        .filter((k) => labels[k])
        .map((k) => (
          <label key={k}>
            {labels[k]}
            <textarea
              aria-label={labels[k]}
              rows={3}
              value={value(k)}
              onChange={(e) => setDirty({ ...dirty, [k]: e.target.value })}
            />
          </label>
        ))}
      {[
        ["sports", view.sportsSpecialties],
        ["art", view.artSpecialties],
      ].flatMap(([collection, array]) =>
        Array.isArray(array)
          ? array.map((item) => (
              <label key={item.id}>
                {item.name} ·{" "}
                {ctx.actor.role === "student" ? "自评" : "教师评价"}
                <select
                  aria-label={`${item.name}评价`}
                  value={
                    special.find((x) => x.id === item.id)?.changes?.[
                      ctx.actor.role === "student"
                        ? "self_star"
                        : "teacher_star"
                    ] ??
                    item[
                      ctx.actor.role === "student"
                        ? "self_star"
                        : "teacher_star"
                    ] ??
                    ""
                  }
                  onChange={(e) =>
                    setSpecial([
                      ...special.filter((x) => x.id !== item.id),
                      {
                        collection,
                        id: item.id,
                        changes: {
                          [ctx.actor.role === "student"
                            ? "self_star"
                            : "teacher_star"]: Number(e.target.value),
                        },
                      },
                    ])
                  }
                >
                  <option value="">未填</option>
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {"★".repeat(n)}
                    </option>
                  ))}
                </select>
              </label>
            ))
          : [],
      )}
      <button
        className="primary"
        onClick={() =>
          ctx.run(async () => {
            await api(
              `/report-core/forms/${studentId}`,
              {
                termId: ctx.termId,
                expectedRevision: view.revision,
                values: dirty,
                specialtyChanges: special,
              },
              "PATCH",
            );
            ctx.notify("评价已保存");
            ctx.refresh();
          })
        }
      >
        保存评价
      </button>
    </section>
  );
}
export const statusName = {
  QUEUED: "排队中",
  PROCESSING: "处理中",
  SUBMITTED: "待认定",
  APPROVED: "已认定",
  FAILED: "处理失败",
  SCORED: "已评分",
  SUPERSEDED: "旧版本",
  DRAFT: "草稿",
  REJECTED: "未认定",
  REVOKED: "已撤回",
  COMMITTED: "已导入",
  CONFIRMED: "已确认",
};
export function SourceList({ ctx, types }) {
  const rows = ctx.sources.filter((s) => types.includes(s.source_type));
  return (
    <section className="panel">
      <h2>提交与处理记录</h2>
      {!rows.length ? (
        <p className="empty">还没有材料记录</p>
      ) : (
        rows.map((s) => (
          <div className="source-row" key={s.id}>
            <div>
              <strong>
                {s.source_type === "STORY"
                  ? s.payload.category || "整月故事"
                  : s.payload.facts?.title || "奖状材料"}{" "}
                <small>#{s.id}</small>
              </strong>
              <p>
                {s.month_key}{" "}
                {s.payload.score?.total !== undefined
                  ? `评分 ${s.payload.score.total} 分 · ${s.payload.score.feedback}`
                  : s.payload.lastError || ""}
              </p>
            </div>
            <span className={`status ${s.status === "FAILED" ? "warn" : ""}`}>
              {statusName[s.status] || s.status}
            </span>
            {s.source_type === "CERTIFICATE" &&
              ctx.actor.role === "student" &&
              s.status !== "REVOKED" && (
                <button
                  onClick={() =>
                    ctx.run(async () => {
                      await api(`/report-core/certificates/${s.id}/revoke`, {
                        reason: "本人撤回",
                      });
                      ctx.refresh();
                      ctx.notify("已撤回并重新汇总");
                    })
                  }
                >
                  撤回
                </button>
              )}
          </div>
        ))
      )}
    </section>
  );
}
