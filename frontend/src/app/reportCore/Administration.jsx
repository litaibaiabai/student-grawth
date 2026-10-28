import React, { useEffect, useState } from "react";
import { api, resultOf, download } from "./api";
export function CardManagement({ ctx }) {
  const [cards, setCards] = useState([]),
    [teacher, setTeacher] = useState(""),
    [total, setTotal] = useState(100),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [quota, setQuota] = useState(null),
    [plan, setPlan] = useState([
      {
        grade: 4,
        classNo: 1,
        count: 10,
        categoryCode: "CONDUCT_POLITENESS_OTHER_STAR",
      },
    ]),
    [token, setToken] = useState("");
  useEffect(() => {
    api(`/report-core/card-quotas?termId=${ctx.termId}`)
      .then(setCards)
      .catch(ctx.error);
  }, [ctx.termId, ctx.refreshKey]);
  const teachers = [
    ...new Map(ctx.assignments.map((a) => [a.teacher_id, a])).values(),
  ];
  const quotas = cards.filter((s) => s.record_kind === "QUOTA");
  return (
    <>
      <section className="panel">
        <h2>
          {ctx.actor.role === "manager" ? "卡总额度下发" : "卡片计划与打印"}
        </h2>
        {ctx.actor.role === "manager" ? (
          <>
            <p>管理员下发教师总额度。班级与细分方向由教师分配。</p>
            <label>
              教师
              <select
                aria-label="额度教师"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
              >
                <option value="">选择教师</option>
                {teachers.map((t) => (
                  <option key={t.teacher_id} value={t.teacher_id}>
                    {t.real_name || `教师 #${t.teacher_id}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              月份
              <input
                aria-label="额度月份"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
            <label>
              总张数
              <input
                aria-label="额度总张数"
                type="number"
                min="0"
                max="10000"
                value={total}
                onChange={(e) => setTotal(Number(e.target.value))}
              />
            </label>
            <button
              className="primary"
              onClick={() =>
                ctx.run(async () => {
                  await api("/report-core/card-quotas", {
                    termId: ctx.termId,
                    teacherId: teacher,
                    total,
                    monthKey: month,
                  });
                  ctx.refresh();
                  ctx.notify("额度已下发");
                })
              }
            >
              下发总额度
            </button>
          </>
        ) : (
          <p>一个计划一次生成所有班级，按班级分别输出 PDF 后打包。</p>
        )}
        {quotas.map((q) => (
          <div className="source-row" key={q.id}>
            <span>
              #{q.id} · {q.month_key} · 总额 {q.payload.quotaTotal} 张 · 修订{" "}
              {q.revision}
            </span>
            {ctx.actor.role === "teacher" && (
              <button
                onClick={() => {
                  setQuota(q);
                  setPlan(
                    q.payload.plans?.length
                      ? q.payload.plans.flatMap((p) =>
                          p.items.map((i) => ({
                            grade: p.grade,
                            classNo: p.classNo,
                            count: i.count,
                            categoryCode: i.categoryCode,
                          })),
                        )
                      : [
                          {
                            grade: ctx.assignments[0]?.grade || 4,
                            classNo: ctx.assignments[0]?.class_no || 1,
                            count: 10,
                            categoryCode: "CONDUCT_POLITENESS_OTHER_STAR",
                          },
                        ],
                  );
                }}
              >
                管理此计划
              </button>
            )}
          </div>
        ))}
      </section>
      {quota && ctx.actor.role === "teacher" && (
        <section className="panel">
          <h2>分班计划 #{quota.id}</h2>
          {plan.map((row, i) => (
            <div className="plan-row" key={i}>
              <label>
                年级
                <input
                  aria-label={`计划年级${i}`}
                  type="number"
                  value={row.grade}
                  onChange={(e) =>
                    setPlan(
                      plan.map((p, j) =>
                        j === i ? { ...p, grade: Number(e.target.value) } : p,
                      ),
                    )
                  }
                />
              </label>
              <label>
                班号
                <input
                  aria-label={`计划班号${i}`}
                  type="number"
                  value={row.classNo}
                  onChange={(e) =>
                    setPlan(
                      plan.map((p, j) =>
                        j === i ? { ...p, classNo: Number(e.target.value) } : p,
                      ),
                    )
                  }
                />
              </label>
              <label>
                方向
                <select
                  aria-label={`计划方向${i}`}
                  value={row.categoryCode}
                  onChange={(e) =>
                    setPlan(
                      plan.map((p, j) =>
                        j === i ? { ...p, categoryCode: e.target.value } : p,
                      ),
                    )
                  }
                >
                  {ctx.catalog.cardCatalog.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.group} · {c.item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                张数
                <input
                  aria-label={`计划张数${i}`}
                  type="number"
                  value={row.count}
                  onChange={(e) =>
                    setPlan(
                      plan.map((p, j) =>
                        j === i ? { ...p, count: Number(e.target.value) } : p,
                      ),
                    )
                  }
                />
              </label>
              <button onClick={() => setPlan(plan.filter((_, j) => j !== i))}>
                移除
              </button>
            </div>
          ))}
          <div className="actions">
            <button onClick={() => setPlan([...plan, { ...plan[0] }])}>
              添加班级 / 方向
            </button>
            <button
              onClick={() =>
                ctx.run(async () => {
                  const groups = Object.groupBy(
                    plan,
                    (p) => `${p.grade}:${p.classNo}`,
                  );
                  const plans = Object.values(groups).map((items) => ({
                    grade: items[0].grade,
                    classNo: items[0].classNo,
                    classTotal: items.reduce((n, i) => n + i.count, 0),
                    items: items.map(({ count, categoryCode }) => ({
                      count,
                      categoryCode,
                    })),
                  }));
                  await api(
                    `/report-core/card-quotas/${quota.id}/plan`,
                    { expectedRevision: quota.revision, plans },
                    "PATCH",
                  );
                  setQuota(null);
                  ctx.refresh();
                  ctx.notify("分班计划已保存，请重新打开后生成");
                })
              }
            >
              保存分班计划
            </button>
            <button
              className="primary"
              onClick={() =>
                ctx.run(async () => {
                  await api(`/report-core/card-quotas/${quota.id}/generate`, {
                    expectedRevision: quota.revision,
                  });
                  setQuota(null);
                  ctx.refresh();
                  ctx.notify("卡片已生成");
                })
              }
            >
              生成全部班级卡片
            </button>
            <button
              onClick={() =>
                ctx.run(() =>
                  download(
                    `/report-core/card-quotas/${quota.id}/print`,
                    "class-cards.zip",
                  ),
                )
              }
            >
              下载分班 PDF 压缩包
            </button>
          </div>
        </section>
      )}
      {ctx.actor.role === "teacher" && (
        <section className="panel">
          <h2>卡片查询</h2>
          <p>最多显示最近100条，未兑换卡不计分。打印包含完整卡片。</p>
          {cards
            .filter((c) => c.record_kind === "CARD")
            .map((c) => (
              <div className="source-row" key={c.id}>
                <span>
                  {c.payload.grade}年级{c.payload.classNo}班 ·{" "}
                  {c.payload.categoryCode} · {c.status}
                </span>
                <button
                  onClick={() =>
                    ctx.run(async () =>
                      setToken(
                        (await api(`/report-core/cards/${c.id}/token`)).token,
                      ),
                    )
                  }
                >
                  查看扫码凭证
                </button>
              </div>
            ))}
          {token && (
            <div className="notice">
              <label>
                卡片扫码凭证
                <input aria-label="生成卡片凭证" readOnly value={token} />
              </label>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(token);
                  ctx.notify("已复制凭证");
                }}
              >
                复制
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
export function Configuration({ ctx }) {
  const [config, setConfig] = useState(null),
    [months, setMonths] = useState(""),
    [target, setTarget] = useState(10),
    [date, setDate] = useState(""),
    [teacher, setTeacher] = useState(""),
    [grade, setGrade] = useState(4),
    [classNo, setClass] = useState(1),
    [subject, setSubject] = useState("CHINESE"),
    [head, setHead] = useState(false);
  useEffect(() => {
    api("/admin/report-core/terms")
      .then((rows) => {
        const term = rows.find((t) => String(t.id) === String(ctx.termId));
        const c =
          typeof term.evaluation_config === "string"
            ? JSON.parse(term.evaluation_config)
            : term.evaluation_config;
        setConfig(c);
        setMonths(c.requiredMonths.join(","));
        setTarget(c.cardTarget || 10);
        setDate(term.next_term_registration_date?.slice(0, 10) || "");
      })
      .catch(ctx.error);
  }, [ctx.termId, ctx.refreshKey]);
  return (
    <>
      <section className="panel">
        <h2>学期评价规则</h2>
        <p>规则变更将使相关报告确认失效，发布期间无法修改。</p>
        <label>
          卡项目达标分 T
          <input
            aria-label="卡达标分"
            type="number"
            min="2"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
        </label>
        <label>
          应交故事月份（逗号分隔）
          <input
            aria-label="应交故事月份"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
        </label>
        <label>
          下学期开学报到日期
          <input
            aria-label="报到日期"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button
          className="primary"
          disabled={!config}
          onClick={() =>
            ctx.run(async () => {
              await api(
                `/admin/report-core/terms/${ctx.termId}`,
                {
                  config: {
                    ...config,
                    cardTarget: target,
                    requiredMonths: months
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                  nextRegistrationDate: date,
                },
                "PATCH",
              );
              ctx.refresh();
              ctx.notify("规则已保存，需重新确认报告");
            })
          }
        >
          保存学期规则
        </button>
      </section>
      <section className="panel">
        <h2>教师任教职责</h2>
        <div className="field-grid">
          <label>
            教师账号 ID
            <input
              aria-label="任教教师ID"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
            />
          </label>
          <label>
            年级
            <input
              type="number"
              value={grade}
              onChange={(e) => setGrade(Number(e.target.value))}
            />
          </label>
          <label>
            班号
            <input
              type="number"
              value={classNo}
              onChange={(e) => setClass(Number(e.target.value))}
            />
          </label>
          <label>
            学科
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {[
                "MORAL",
                "CHINESE",
                "MATH",
                "SCIENCE",
                "ENGLISH",
                "PE",
                "MUSIC",
                "FINE_ART",
                "INFORMATION_TECHNOLOGY",
                "LABOR",
                "INTEGRATED_PRACTICE",
                "LOCAL_COURSE",
                "STORY",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="inline">
          <input
            type="checkbox"
            checked={head}
            onChange={(e) => setHead(e.target.checked)}
          />
          兼任该班班主任
        </label>
        <button
          onClick={() =>
            ctx.run(async () => {
              await api("/admin/report-core/assignments", {
                termId: ctx.termId,
                teacherId: teacher,
                grade,
                classNo,
                subjectCode: subject,
                isHeadTeacher: head,
              });
              ctx.refresh();
              ctx.notify("任教职责已保存");
            })
          }
        >
          保存任教职责
        </button>
        {ctx.assignments.map((a) => (
          <div key={a.id} className="source-row">
            <span>
              教师 #{a.teacher_id} · {a.grade}年级{a.class_no}班 ·{" "}
              {a.subject_code} {a.is_head_teacher ? "· 班主任" : ""}
            </span>
            <button
              onClick={() =>
                ctx.run(async () => {
                  await api("/admin/report-core/assignments", {
                    termId: ctx.termId,
                    teacherId: String(a.teacher_id),
                    grade: a.grade,
                    classNo: a.class_no,
                    subjectCode: a.subject_code,
                    isHeadTeacher: !!a.is_head_teacher,
                    enabled: !a.enabled,
                  });
                  ctx.refresh();
                })
              }
            >
              {a.enabled ? "停用" : "启用"}
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
export function Releases({ ctx }) {
  const [ready, setReady] = useState(null),
    [release, setRelease] = useState(null);
  useEffect(() => {
    api(`/admin/report-core/readiness?termId=${ctx.termId}`)
      .then(setReady)
      .catch(ctx.error);
  }, [ctx.termId, ctx.refreshKey]);
  async function prepare(r) {
    let state = r;
    while (state.prepared < state.total) {
      state = await api(
        `/admin/report-core/releases/${state.releaseKey}/prepare`,
        { termId: ctx.termId, fence: state.fence, limit: 50 },
      );
      setRelease(state);
    }
    return state;
  }
  return (
    <section className="panel">
      <h2>全校统一发布</h2>
      <p>
        管理员核查完成状态，全校报告一次性发布。准备期间学生仍只能看到上一已发布版本。
      </p>
      {ready && (
        <>
          <div className="stats">
            <div>
              <b>{ready.counts.total}</b>
              <span>适用学生</span>
            </div>
            <div>
              <b>{ready.counts.confirmed}</b>
              <span>已确认</span>
            </div>
            <div>
              <b>{ready.missing.length}</b>
              <span>待完成项</span>
            </div>
          </div>
          <p>发布状态：{ready.releaseStatus}</p>
          <ul className="missing-list">
            {ready.missing.map((m, i) => (
              <li key={i}>
                学生 #{m.studentId} ·{" "}
                {ctx.catalog.fields.find((f) => f.column === m.field)?.label ||
                  m.field}{" "}
                · {m.reason}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="actions">
        <button
          className="primary"
          disabled={!ready?.complete || ready.releaseStatus !== "IDLE"}
          onClick={() =>
            ctx.run(async () => {
              const r = await api("/admin/report-core/releases", {
                termId: ctx.termId,
              });
              setRelease(r);
              await prepare(r);
              ctx.refresh();
              ctx.notify("全校报告准备完成，请统一发布");
            })
          }
        >
          准备全校报告
        </button>
        <button
          onClick={() =>
            ctx.run(async () => {
              const terms = await api("/admin/report-core/terms");
              const t = terms.find((t) => String(t.id) === String(ctx.termId));
              if (!t.release_key) throw Error("没有待恢复发布");
              const r = await api(
                `/admin/report-core/releases/${t.release_key}/resume`,
                { termId: ctx.termId, fence: String(t.release_fence) },
              );
              setRelease(r);
              await prepare(r);
              ctx.refresh();
            })
          }
        >
          恢复准备
        </button>
        {release && (
          <>
            <button
              className="primary"
              disabled={release.prepared !== release.total}
              onClick={() =>
                ctx.run(async () => {
                  await api(
                    `/admin/report-core/releases/${release.releaseKey}/activate`,
                    { termId: ctx.termId, fence: release.fence },
                  );
                  setRelease(null);
                  ctx.refresh();
                  ctx.notify("全校报告已统一发布");
                })
              }
            >
              统一发布
            </button>
            <button
              onClick={() =>
                ctx.run(async () => {
                  await api(
                    `/admin/report-core/releases/${release.releaseKey}/cancel`,
                    { termId: ctx.termId, fence: release.fence },
                  );
                  setRelease(null);
                  ctx.refresh();
                  ctx.notify("准备已取消，旧报告仍可查看");
                })
              }
            >
              取消本次准备
            </button>
          </>
        )}
      </div>
      {release && (
        <p className="notice">
          已准备 {release.prepared} / {release.total} 份
        </p>
      )}
    </section>
  );
}
