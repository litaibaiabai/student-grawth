import React, { useEffect, useState, useRef } from "react";
import { api, resultOf, download } from "./api";
import { decodeStoryBytes } from "./storyText";
import { defaultStoryMonth } from "../../util/storyMonths";
export function Cards({ctx}) {
 const initial=()=>{const match=location.hash.match(/[?&]card=([^&]+)/);return match?decodeURIComponent(match[1]):sessionStorage.getItem('pendingCard')||'';};
 const [token,setToken]=useState(initial),[card,setCard]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const sequence=useRef(0),current=useRef(token);current.current=token;
 const normalize=text=>{try{return decodeURIComponent(new URL(text).hash.match(/[?&]card=([^&]+)/)?.[1]||text);}catch{return text.trim();}};
 const read=async text=>{const request=++sequence.current;setCard(null);setMessage('');setBusy(true);try{const result=await api('/report-core/cards/preview',{token:normalize(text)});if(request===sequence.current&&current.current===text)setCard({...result,credential:normalize(text)});}catch(e){if(request===sequence.current){setMessage(e.message);if(e.status===401)ctx.error(e);}}finally{if(request===sequence.current)setBusy(false);}};
 useEffect(()=>{if(token)read(token);return()=>{sequence.current++;};},[]);
 const change=text=>{sequence.current++;setBusy(false);setToken(text);setCard(null);setMessage('');if(text)sessionStorage.setItem('pendingCard',text);else sessionStorage.removeItem('pendingCard');};
 return <section className="panel claim-card"><p className="kicker">小小卡片 · 大大进步</p><h2>领取我的积分卡</h2><p>扫码链接会自动读取卡片，确认后记1分，无需选择评价方向。</p><label>卡片链接或凭证<input aria-label="卡片凭证" value={token} disabled={busy&&!!card} onChange={e=>change(e.target.value)} placeholder="把扫码后的链接粘贴到这里"/></label><button disabled={busy||!token.trim()} onClick={()=>read(token)}>{busy?'正在读取…':'读取卡片'}</button>{card&&<div className="claim-preview"><span className="claim-star" aria-hidden="true">★</span><div><h3>发现一张成长积分卡</h3><p>{card.grade}年级{card.classNo}班 · {card.category}</p><small>卡片状态：{card.status}</small></div></div>}{message&&<p role="alert">{message}</p>}<div className="self-save"><button className="primary" disabled={!card||busy} onClick={async()=>{const selected=card;setBusy(true);try{await api('/report-core/cards/redeem',{token:selected.credential});change('');ctx.refresh();ctx.notify('领取成功，已记 1 分');}catch(e){setMessage(e.message);if(e.status===401)ctx.error(e);}finally{setBusy(false);}}}>{busy&&card?'正在领取…':'确认领取'}</button></div></section>;
}
export function AwardUpload({ ctx }) {
  const [file, setFile] = useState(null), [preview,setPreview]=useState(''), [fileError,setFileError]=useState('');
  const fileInput=useRef(null);
  useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
  return (
    <>
      <section className="panel">
        <h2>上传奖状</h2>
        <p>
          上传清晰的 PNG / JPEG 图片，最大
          5MB。识别或人工确认后形成特长与成果记录。
        </p>
        <input
          ref={fileInput}
          aria-label="奖状文件"
          type="file"
          accept="image/png,image/jpeg"
          onChange={e=>{const next=e.target.files?.[0];setFileError('');if(!next)return;if(!['image/png','image/jpeg'].includes(next.type)||next.size>5*1024*1024){setFile(null);setFileError('请选择5MB以内的PNG或JPEG图片');e.target.value='';return;}setFile(next);}}
        />
        {fileError&&<p role="alert">{fileError}</p>}
        {preview&&file&&<div className="award-preview"><img src={preview} alt="待提交奖状预览"/><div><strong>{file.name}</strong><p>请检查姓名、奖项和日期是否清晰。</p><button onClick={()=>fileInput.current?.click()}>重新选择图片</button></div></div>}
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
              if(fileInput.current)fileInput.current.value='';
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
 const [month,setMonth]=useState(()=>defaultStoryMonth(ctx.term)),[articles,setArticles]=useState(blank),[view,setView]=useState(null),[category,setCategory]=useState('READ'),[articleIndex,setArticleIndex]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[message,setMessage]=useState('');
 const cache=useRef(new Map()),live=useRef({dirty:false});live.current={dirty};
 const lookup=(key=month,signal)=>api(`/report-core/story-month?termId=${ctx.termId}&monthKey=${key}`,undefined,undefined,{signal});
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setMessage('');setView(null);setArticleIndex(0);
  const stored=cache.current.get(month);setArticles(stored?.articles||blank());setDirty(stored?.dirty||false);
  lookup(month,controller.signal).then(result=>{
   if(controller.signal.aborted)return;setView(result);
   if(!stored?.dirty){const existing=result.draftBatch?.articles||result.articles;setArticles(existing?.length?Object.keys(labels).flatMap(c=>existing.some(a=>a.category===c)?existing.filter(a=>a.category===c):[{category:c,text:''}]):blank());setDirty(false);}
  }).catch(e=>{if(e.name!=='AbortError')ctx.error(e);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[month,ctx.termId,ctx.refreshKey]);
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
 <div className="self-steps" role="tablist" aria-label="故事类别">{Object.entries(labels).map(([c,label])=><button key={c} role="tab" aria-selected={category===c} onClick={()=>{setCategory(c);setArticleIndex(0);}}>{label} · {articles.filter(a=>a.category===c&&a.text.trim()).length}/3</button>)}</div>
 {loading&&<p role="status">正在读取本月草稿…</p>}
 <section role="tabpanel" aria-label={labels[category]}><div className="story-article-tabs" aria-label="本类篇目">{articles.filter(a=>a.category===category).map((a,i)=><button key={i} aria-pressed={articleIndex===i} onClick={()=>setArticleIndex(i)}>第{i+1}篇 <small>{a.text.trim()?'已填写':'待填写'}</small></button>)}</div>{articles.map((a,i)=>a.category===category&&articles.slice(0,i).filter(x=>x.category===category).length===articleIndex&&<div className="story-group" key={i}><label>{labels[category]}第{articles.slice(0,i+1).filter(x=>x.category===category).length}篇<textarea aria-label={`${labels[category]}${articles.slice(0,i+1).filter(x=>x.category===category).length}`} disabled={busy||loading||!view} rows={7} value={a.text} onChange={e=>update(articles.map((x,j)=>j===i?{...x,text:e.target.value}:x))} placeholder="写下、粘贴你的故事文本…"/></label><small>{[...a.text].length} / 20000字</small><div className="actions"><label>载入TXT<input aria-label={`${labels[category]}文本文件`} type="file" accept=".txt,text/plain" disabled={busy||loading} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const text=decodeStoryBytes(await file.arrayBuffer());update(articles.map((x,j)=>j===i?{...x,text}:x));}catch(error){ctx.error(error);}e.target.value='';}}/></label>{articles.filter(x=>x.category===category).length>1&&<button disabled={busy} onClick={()=>{update(articles.filter((_,j)=>j!==i));setArticleIndex(Math.max(0,articleIndex-1));}}>删除此篇</button>}</div></div>)}</section>
 <button disabled={busy||loading||articles.filter(a=>a.category===category).length>=3} onClick={()=>{setArticleIndex(articles.filter(a=>a.category===category).length);update([...articles,{category,text:''}]);}}>＋ 添加一篇</button>
 {message&&<p role="alert">{message}</p>}<div className="self-save"><button disabled={busy||loading||!view||!valid||!dirty} onClick={()=>execute(false)}>保存草稿</button><button className="primary" disabled={busy||loading||!view||!valid||!formal||!dirty&&!view.draftBatch} onClick={()=>execute(true)}>{busy?'正在提交…':'提交本月三类故事'}</button></div>
 </section><section className="panel"><h2>本月正式提交与评分</h2>{view?.effectiveBatch?<><p>版本 {view.effectiveBatch.version} · {statusName[view.effectiveBatch.status]||view.effectiveBatch.status}，新草稿不会替换此版本，正式提交后才更新。</p>{view.articles.map(a=><details key={a.id}><summary>{labels[a.category]} · {a.title||`篇目${a.ordinal}`} · {statusName[a.status]||a.status}{a.score?` · ${a.score.total}分`:''}</summary><p className="story-text">{a.text}</p><p>{a.score?.feedback||a.error||'等待系统评分'}</p></details>)}</>:<p>本月尚未正式提交。读、听、讲各至少一篇后再提交。</p>}</section></>;
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
                  : s.source_type === "SELF" ? (s.payload.action === "INVALIDATE_NO_AWARD" ? "奖状撤回记录" : "自评保存记录") : s.payload.facts?.title || "奖状材料"}{" "}
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
