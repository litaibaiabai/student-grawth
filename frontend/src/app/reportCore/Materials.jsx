import React, { useEffect, useState, useRef } from "react";
import { api, resultOf, download } from "./api";
import { decodeStoryBytes } from "./storyText";
import { defaultStoryMonth } from "../../util/storyMonths";
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
 const labels={READ:'我爱读故事',LISTEN:'我爱听故事',TELL:'我爱讲故事'};
 const blank=()=>Object.keys(labels).map(category=>({category,text:''}));
 const [month,setMonth]=useState(()=>defaultStoryMonth(ctx.term)),[articles,setArticles]=useState(blank),[view,setView]=useState(null),[category,setCategory]=useState('READ'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[message,setMessage]=useState('');
 const cache=useRef(new Map()),live=useRef({dirty:false});live.current={dirty};
 const lookup=(key=month,signal)=>api(`/report-core/story-month?termId=${ctx.termId}&monthKey=${key}`,undefined,undefined,{signal});
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setMessage('');setView(null);
  const stored=cache.current.get(month);setArticles(stored?.articles||blank());setDirty(stored?.dirty||false);
  lookup(month,controller.signal).then(result=>{
   if(controller.signal.aborted)return;setView(result);
   if(!stored?.dirty){const existing=result.draftBatch?.articles||result.articles;setArticles(existing?.length?Object.keys(labels).flatMap(c=>existing.some(a=>a.category===c)?existing.filter(a=>a.category===c):[{category:c,text:''}]):blank());setDirty(false);}
  }).catch(e=>{if(e.name!=='AbortError')ctx.error(e);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[month,ctx.termId]);
 useEffect(()=>{ctx.setLeaveGuard?.(()=>!live.current.dirty&&![...cache.current.values()].some(v=>v.dirty)||window.confirm('故事还有未保存内容，离开会放弃本次填写。是否离开？'));return()=>ctx.setLeaveGuard?.(null);},[]);
 const update=next=>{setArticles(next);setDirty(true);cache.current.set(month,{articles:next,dirty:true});};
 const valid=articles.every(a=>[...a.text].length<=20000),formal=Object.keys(labels).every(c=>articles.filter(a=>a.category===c&&a.text.trim()).length>=1);
 const save=async()=>{
  const b=view?.latestBatch;
  const r=resultOf(await api('/report-core/story-batches',{termId:ctx.termId,monthKey:month,expectedBatchId:b?.batchId??null,expectedVersion:b?.version??null,expectedRevision:b?.revision??null,articles:articles.filter(a=>a.text.trim())}));
  setView(old=>({...old,latestBatch:{...r,status:'DRAFT'},draftBatch:{...r,articles}}));setDirty(false);cache.current.set(month,{articles,dirty:false});return r;
 };
 const execute=async submit=>{
  setBusy(true);setMessage('');
  try{
   const draft=dirty||!view?.draftBatch?await save():view.draftBatch;
   if(submit){await api(`/report-core/story-batches/${draft.batchId}/submit`,{expectedRevision:draft.revision});setView(await lookup());ctx.notify('整月故事已提交，评分中');}
   else ctx.notify('草稿已保存');
   ctx.refresh();
  }catch(e){if(e.status===409){setDirty(true);cache.current.set(month,{articles,dirty:true});try{setView(await lookup());}catch{}setMessage('服务器已有新版本，本次文字已保留。核对后可保存为新草稿。');}else ctx.error(e);}
  finally{setBusy(false);}
 };
 return <><section className="panel story-book"><p className="kicker">每月一次 · 阅读、倾听与表达</p><h2>我的故事小书房</h2><p>读、听、讲每类1–3篇，直接输入、粘贴或载入TXT。每篇最多20000字，篇数不会增加权重。</p>
 <label>所属月份<input aria-label="故事月份" type="month" value={month} disabled={busy} onChange={e=>setMonth(e.target.value)}/></label>
 <div className="self-steps" role="tablist" aria-label="故事类别">{Object.entries(labels).map(([c,label])=><button key={c} role="tab" aria-selected={category===c} onClick={()=>setCategory(c)}>{label} · {articles.filter(a=>a.category===c&&a.text.trim()).length}/3</button>)}</div>
 {loading&&<p role="status">正在读取本月草稿…</p>}
 <section role="tabpanel" aria-label={labels[category]}><h3>{labels[category]}</h3>{articles.map((a,i)=>a.category===category&&<div className="story-group" key={i}><label>{labels[category]}第{articles.slice(0,i+1).filter(x=>x.category===category).length}篇<textarea aria-label={`${labels[category]}${articles.slice(0,i+1).filter(x=>x.category===category).length}`} disabled={busy||loading||!view} rows={7} value={a.text} onChange={e=>update(articles.map((x,j)=>j===i?{...x,text:e.target.value}:x))} placeholder="写下、粘贴你的故事文本…"/></label><small>{[...a.text].length} / 20000字</small><div className="actions"><label>载入TXT<input aria-label={`${labels[category]}文本文件`} type="file" accept=".txt,text/plain" disabled={busy||loading} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const text=decodeStoryBytes(await file.arrayBuffer());update(articles.map((x,j)=>j===i?{...x,text}:x));}catch(error){ctx.error(error);}e.target.value='';}}/></label>{articles.filter(x=>x.category===category).length>1&&<button disabled={busy} onClick={()=>update(articles.filter((_,j)=>j!==i))}>删除此篇</button>}</div></div>)}</section>
 <button disabled={busy||loading||articles.filter(a=>a.category===category).length>=3} onClick={()=>update([...articles,{category,text:''}])}>＋ 添加一篇</button>
 {message&&<p role="alert">{message}</p>}<div className="self-save"><button disabled={busy||loading||!view||!valid||!dirty} onClick={()=>execute(false)}>保存草稿</button><button className="primary" disabled={busy||loading||!view||!valid||!formal||!dirty&&!view.draftBatch} onClick={()=>execute(true)}>{busy?'正在提交…':'提交本月三类故事'}</button></div>
 </section><section className="panel"><h2>本月正式提交与评分</h2>{view?.effectiveBatch?<><p>版本 {view.effectiveBatch.version} · {statusName[view.effectiveBatch.status]||view.effectiveBatch.status}，新草稿不会替换此版本，正式提交后才更新。</p>{view.articles.map(a=><details key={a.id}><summary>{labels[a.category]} · {a.title||`篇目${a.ordinal}`} · {statusName[a.status]||a.status}{a.score?` · ${a.score.total}分`:''}</summary><p className="story-text">{a.text}</p><p>{a.score?.feedback||a.error||'等待系统评分'}</p></details>)}</>:<p>本月尚未正式提交。读、听、讲各至少一篇后再提交。</p>}</section></>;
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
                  : s.source_type === "SELF" ? "自评保存记录" : s.payload.facts?.title || "奖状材料"}{" "}
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
