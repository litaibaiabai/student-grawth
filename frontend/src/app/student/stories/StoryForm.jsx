import React, { useEffect, useState, useRef, useCallback } from "react";
import { api, resultOf } from "../../core/api";
import { statusName } from "../../core/materialStatus";
import { decodeStoryBytes } from "./storyText";
import { defaultStoryMonth } from "../../../util/storyMonths";

const storyLabels = { READ: '我爱读故事', LISTEN: '我爱听故事', TELL: '我爱讲故事' };
const blankStory = () => Object.keys(storyLabels).map((category) => ({ category, text: '' }));

export default function StoryForm({ ctx }) {
  const { termId, refreshKey, error: onError, setLeaveGuard } = ctx;
  const [month, setMonth] = useState(() => defaultStoryMonth(ctx.term)),
    [articles, setArticles] = useState(blankStory),
    [view, setView] = useState(null),
    [category, setCategory] = useState('READ'),
    [articleIndex, setArticleIndex] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(''),
    [fileReading, setFileReading] = useState(false);
  const cache = useRef(new Map()),
    fileReadVersion = useRef(0),
    activeFileRead = useRef(null),
    live = useRef({ dirty: false });
  live.current = { dirty, month, termId, fileReading };
  const invalidateFileRead = useCallback(() => {
    fileReadVersion.current++;
    activeFileRead.current = null;
  }, []);
  const lookup = useCallback(
    (key = month, signal) =>
      api(
        `/report-core/story-month?termId=${termId}&monthKey=${key}`,
        undefined,
        undefined,
        { signal },
      ),
    [termId, month],
  );
  useEffect(() => {
    const controller = new AbortController();
    invalidateFileRead();
    activeFileRead.current = null;
    setFileReading(false);
    setLoading(true);
    setMessage('');
    setView(null);
    setArticleIndex(0);
    const stored = cache.current.get(month);
    setArticles(stored?.articles || blankStory());
    setDirty(stored?.dirty || false);
    lookup(month, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setView(result);
        if (!stored?.dirty) {
          const existing = result.draftBatch?.articles || result.articles;
          setArticles(
            existing?.length
              ? Object.keys(storyLabels).flatMap((c) =>
                  existing.some((a) => a.category === c)
                    ? existing.filter((a) => a.category === c)
                    : [{ category: c, text: '' }],
                )
              : blankStory(),
          );
          setDirty(false);
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') onError(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      invalidateFileRead();
      controller.abort();
    };
  }, [month, termId, refreshKey, lookup, onError, invalidateFileRead]);
  useEffect(() => {
    setLeaveGuard?.(
      () =>
        (!live.current.dirty &&
          !live.current.fileReading &&
          ![...cache.current.values()].some((v) => v.dirty)) ||
        window.confirm('故事还有未保存内容，离开会放弃本次填写。是否离开？'),
    );
    return () => setLeaveGuard?.(null);
  }, [setLeaveGuard]);
  const update = (next) => {
    fileReadVersion.current++;
    setArticles(next);
    setDirty(true);
    cache.current.set(month, { articles: next, dirty: true });
  };
  const valid = articles.every((a) => [...a.text].length <= 20000),
    formal = Object.keys(storyLabels).every(
      (c) => articles.filter((a) => a.category === c && a.text.trim()).length >= 1,
    );
  const save = async () => {
    const b = view?.latestBatch;
    const r = resultOf(
      await api('/report-core/story-batches', {
        termId: termId,
        monthKey: month,
        expectedBatchId: b?.batchId ?? null,
        expectedVersion: b?.version ?? null,
        expectedRevision: b?.revision ?? null,
        articles: articles.filter((a) => a.text.trim()),
      }),
    );
    setView((old) => ({
      ...old,
      latestBatch: { ...r, status: 'DRAFT' },
      draftBatch: { ...r, articles },
    }));
    setDirty(false);
    cache.current.set(month, { articles, dirty: false });
    return r;
  };
  const execute = async (submit) => {
    if (fileReading || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const draft = dirty || !view?.draftBatch ? await save() : view.draftBatch;
      if (submit) {
        await api(`/report-core/story-batches/${draft.batchId}/submit`, {
          expectedRevision: draft.revision,
        });
        setView(await lookup());
        ctx.notify('整月故事已提交，评分中');
      } else ctx.notify('草稿已保存');
      ctx.refresh();
    } catch (e) {
      if (e.status === 409) {
        setDirty(true);
        cache.current.set(month, { articles, dirty: true });
        try {
          setView(await lookup());
        } catch (error) {
          onError(error);
        }
        setMessage(
          '服务器已有新版本，本次文字已保留。核对后可保存为新草稿。',
        );
      } else onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="panel story-book">
        <p className="kicker">每月一次 · 阅读、倾听与表达</p>
        <h2>我的故事小书房</h2>
        <p>
          读、听、讲每类1–3篇，直接输入、粘贴或载入TXT。每篇最多20000字，篇数不会增加权重。
        </p>
        <label>
          所属月份
          <input
            aria-label="故事月份"
            type="month"
            value={month}
            disabled={busy}
            onChange={(e) => {
              fileReadVersion.current++;
              setMonth(e.target.value);
            }}
          />
        </label>
        <div className="self-steps" role="tablist" aria-label="故事类别">
          {Object.entries(storyLabels).map(([c, label]) => (
            <button
              key={c}
              role="tab"
              aria-selected={category === c}
              onClick={() => {
                setCategory(c);
                setArticleIndex(0);
              }}
            >
              {label} · {articles.filter((a) => a.category === c && a.text.trim()).length}/3
            </button>
          ))}
        </div>
        {loading && <p role="status">正在读取本月草稿…</p>}
        <section role="tabpanel" aria-label={storyLabels[category]}>
          <div className="story-article-tabs" aria-label="本类篇目">
            {articles
              .filter((a) => a.category === category)
              .map((a, i) => (
                <button
                  key={i}
                  aria-pressed={articleIndex === i}
                  onClick={() => setArticleIndex(i)}
                >
                  第{i + 1}篇{' '}
                  <small>{a.text.trim() ? '已填写' : '待填写'}</small>
                </button>
              ))}
          </div>
          {articles.map(
            (a, i) =>
              a.category === category &&
              articles.slice(0, i).filter((x) => x.category === category).length ===
                articleIndex && (
                <div className="story-group" key={i}>
                  <label>
                    {storyLabels[category]}第
                    {
                      articles
                        .slice(0, i + 1)
                        .filter((x) => x.category === category).length
                    }
                    篇
                    <textarea
                      aria-label={`${storyLabels[category]}${articles.slice(0, i + 1).filter((x) => x.category === category).length}`}
                      disabled={busy || loading || !view}
                      rows={7}
                      value={a.text}
                      onChange={(e) =>
                        update(
                          articles.map((x, j) =>
                            j === i ? { ...x, text: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="写下、粘贴你的故事文本…"
                    />
                  </label>
                  <small>{[...a.text].length} / 20000字</small>
                  <div className="actions">
                    <label>
                      载入TXT
                      <input
                        aria-label={`${storyLabels[category]}文本文件`}
                        type="file"
                        accept=".txt,text/plain"
                        disabled={busy || loading}
                        onChange={async (e) => {
                          const input = e.currentTarget,
                            file = input.files?.[0];
                          if (!file) return;
                          const version = ++fileReadVersion.current,
                            readId = Symbol();
                          activeFileRead.current = readId;
                          setFileReading(true);
                          try {
                            const bytes = await file.arrayBuffer();
                            if (version !== fileReadVersion.current) {
                              if (
                                live.current.month === month &&
                                live.current.termId === termId
                              )
                                setMessage(
                                  '文件读取期间内容已更新，已保留你的新填写，请重新载入文件。',
                                );
                              return;
                            }
                            const text = decodeStoryBytes(bytes);
                            update(
                              articles.map((x, j) =>
                                j === i ? { ...x, text } : x,
                              ),
                            );
                          } catch (error) {
                            if (version === fileReadVersion.current)
                              onError(error);
                          } finally {
                            input.value = '';
                            if (activeFileRead.current === readId) {
                              activeFileRead.current = null;
                              setFileReading(false);
                            }
                          }
                        }}
                      />
                    </label>
                    {articles.filter((x) => x.category === category).length > 1 && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          update(articles.filter((_, j) => j !== i));
                          setArticleIndex(Math.max(0, articleIndex - 1));
                        }}
                      >
                        删除此篇
                      </button>
                    )}
                  </div>
                </div>
              ),
          )}
        </section>
        <button
          disabled={
            busy ||
            loading ||
            articles.filter((a) => a.category === category).length >= 3
          }
          onClick={() => {
            setArticleIndex(
              articles.filter((a) => a.category === category).length,
            );
            update([...articles, { category, text: '' }]);
          }}
        >
          ＋ 添加一篇
        </button>
        {fileReading && (
          <p role="status">正在载入文本，完成后即可保存或提交。</p>
        )}
        {message && <p role="alert">{message}</p>}
        <div className="self-save">
          <button
            disabled={
              busy || fileReading || loading || !view || !valid || !dirty
            }
            onClick={() => execute(false)}
          >
            保存草稿
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              fileReading ||
              loading ||
              !view ||
              !valid ||
              !formal ||
              (!dirty && !view.draftBatch)
            }
            onClick={() => execute(true)}
          >
            {busy ? '正在提交…' : '提交本月三类故事'}
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>本月正式提交与评分</h2>
        {view?.effectiveBatch ? (
          <>
            <p>
              版本 {view.effectiveBatch.version} ·{' '}
              {statusName[view.effectiveBatch.status] ||
                view.effectiveBatch.status}
              ，新草稿不会替换此版本，正式提交后才更新。
            </p>
            {view.articles.map((a) => (
              <details key={a.id}>
                <summary>
                  {storyLabels[a.category]} · {a.title || `篇目${a.ordinal}`} ·{' '}
                  {statusName[a.status] || a.status}
                  {a.score ? ` · ${a.score.total}分` : ''}
                </summary>
                <p className="story-text">{a.text}</p>
                <p>{a.score?.feedback || a.error || '等待系统评分'}</p>
              </details>
            ))}
          </>
        ) : (
          <p>本月尚未正式提交。读、听、讲各至少一篇后再提交。</p>
        )}
      </section>
    </>
  );
}
export { StoryForm };
