import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../core/api';
import { UIIcon } from '../../core/illustrations';
import './writtenStories.css';

const endpoint = '/report-core/v2/written-stories';
const dateLabel = value => new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

export default function WrittenStories({ ctx, registerGuard }) {
  const { termId, refreshKey, error: onError, setLeaveGuard } = ctx;
  const [text, setText] = useState(''), [file, setFile] = useState(null);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState(''), [message, setMessage] = useState(null), [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false), [selectedId, setSelectedId] = useState(null);
  const [story, setStory] = useState(null), [detailError, setDetailError] = useState(''), [detailRetry, setDetailRetry] = useState(0);
  const picker = useRef(null), dialog = useRef(null), lock = useRef(false), mounted = useRef(true);
  const sequence = useRef(0), draft = useRef({});
  draft.current = { text, file, busy };
  const wordCount = [...text].length;
  const canSubmit = data?.collection?.open !== false && !blocked && ctx.sessionActive !== false;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const guard = () => !draft.current.busy && (!(draft.current.text.trim() || draft.current.file) || window.confirm('故事草稿尚未提交，确定离开？'));
    setLeaveGuard?.(guard);
    registerGuard?.(guard);
    const protect = event => {
      if (draft.current.text.trim() || draft.current.file || draft.current.busy) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', protect);
    return () => { setLeaveGuard?.(null); registerGuard?.(null); window.removeEventListener('beforeunload', protect); };
  }, [setLeaveGuard, registerGuard]);

  const load = useCallback(async (before, signal) => {
    const version = ++sequence.current;
    if (before) setLoadingMore(true); else setLoading(true);
    try {
      const query = new URLSearchParams({ termId, ...(before ? { before } : {}) });
      const next = await api(`${endpoint}?${query}`, undefined, undefined, { signal });
      if (!mounted.current || signal?.aborted || version !== sequence.current) return;
      setData(previous => ({ ...next, rows: before ? [...(previous?.rows || []), ...next.rows] : next.rows }));
      setListError('');
    } catch (error) {
      if (!mounted.current || signal?.aborted || version !== sequence.current) return;
      if (before) setMessage({ error: true, text: `暂时无法读取更多故事：${error.message}` });
      else setListError(error.message);
      if (error.status === 401) onError(error);
    } finally {
      if (mounted.current && !signal?.aborted && version === sequence.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [termId, onError]);
  useEffect(() => {
    const controller = new AbortController();
    load(undefined, controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!selectedId) return;
    const element = dialog.current, previous = document.activeElement;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, [selectedId]);
  useEffect(() => {
    setStory(null); setDetailError('');
    if (!selectedId) return;
    const controller = new AbortController();
    api(`${endpoint}/${selectedId}?termId=${termId}`, undefined, undefined, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setStory(value); })
      .catch(error => {
        if (controller.signal.aborted) return;
        setDetailError(error.message);
        if (error.status === 401) onError(error);
      });
    return () => controller.abort();
  }, [selectedId, termId, detailRetry, onError]);

  async function submit(documentFile = null) {
    if (lock.current || !canSubmit || !documentFile && (!text.trim() || wordCount > 20000)) return;
    lock.current = true; setBusy(true); setMessage(null);
    try {
      const body = documentFile ? new FormData() : { termId, text };
      if (documentFile) { body.set('termId', termId); body.set('file', documentFile); }
      await api(endpoint, body);
      if (!mounted.current) return;
      if (documentFile) setFile(null); else setText('');
      setMessage({ text: '故事已提交，已收进你的故事集。' });
      await load();
      ctx.refresh();
    } catch (error) {
      if (!mounted.current) return;
      setMessage({ error: true, text: error.message });
      if (error.status === 401) onError(error);
      if (error.status === 423) setBlocked(true);
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function chooseFile(event) {
    const next = event.target.files?.[0];
    event.target.value = '';
    if (!next || lock.current || !canSubmit) return;
    if (!/\.(pdf|docx?)$/i.test(next.name)) { setMessage({ error: true, text: '请选择PDF或Word（.doc、.docx）故事文档。' }); return; }
    if (!next.size || next.size > 10 * 1024 * 1024) { setMessage({ error: true, text: '请选择有内容且不超过10MB的故事文档。' }); return; }
    setFile(next);
    submit(next);
  }
  const rank = data?.ranking.me, rows = data?.rows || [];
  const closed = blocked || data?.collection.open === false;

  return <div className="written-stories">
    <div className="written-stories-columns">
      <section className="written-editor panel" aria-labelledby="written-editor-title">
        <div className="written-section-heading"><span className="written-section-icon"><UIIcon name="edit"/></span><div><p className="kicker">把日常写成故事</p><h2 id="written-editor-title">今天，想写些什么？</h2></div></div>
        <p className="written-editor-intro">一次小小的发现，一段难忘的经历，都值得被记住。</p>
        <label className="written-text-label" htmlFor="written-story-text">故事正文<span>第一行可以写故事的名字</span></label>
        <textarea id="written-story-text" aria-label="故事正文" aria-describedby="written-word-count" rows={10} value={text} disabled={busy || closed}
          placeholder={'给你的故事起个名字吧…\n\n然后，从“那一天”开始，写下你的发现与感受。'} onChange={event => setText(event.target.value)}/>
        <div className="written-editor-footer"><span id="written-word-count" className={wordCount > 20000 ? 'written-error' : ''}>{wordCount.toLocaleString()} / 20,000 字</span><span>每次递交计为一篇故事</span></div>
        <div className="written-submit-actions"><button className="primary" disabled={busy || !canSubmit || !text.trim() || wordCount > 20000} onClick={() => submit()}><UIIcon name="check"/>{busy && !file ? '正在递交…' : '递交故事'}</button><span>你的每一次表达，都是成长的足迹。</span></div>
        {!data && <p className="written-upload-hint" role="status">{loading ? '正在读取历史故事，不影响输入和递交。' : '历史记录暂未加载，不影响递交故事。'}</p>}
        <div className="written-upload-divider"><span>也可以上传已经写好的故事</span></div>
        <input ref={picker} className="written-file-input" aria-label="上传故事文档" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy || !canSubmit} onChange={chooseFile}/>
        <div className="written-upload"><span className="written-upload-icon"><UIIcon name="report"/></span><div><strong>从文档里，带来你的故事</strong><small>PDF / DOC / DOCX · 最大10MB</small></div><button disabled={busy || !canSubmit} onClick={() => picker.current?.click()}><UIIcon name="upload"/>上传故事</button></div>
        <p className="written-upload-hint">选择文件后自动提交。请使用含有可读取文字的文档。</p>
        {file && <div className="written-upload-file"><span><UIIcon name="report"/>{file.name}</span>{busy ? <span role="status">正在读取并上传…</span> : <div><button onClick={() => setFile(null)}>移除</button><button disabled={!canSubmit} onClick={() => submit(file)}>重新上传</button></div>}</div>}
        {closed && <div className="written-closed" role="status"><strong>本学期故事提交已结束</strong><span>还可以打开下面的故事，重温自己的成长。</span></div>}
        {message && <div className={`written-feedback ${message.error ? 'is-error' : ''}`} role={message.error ? 'alert' : 'status'}><UIIcon name={message.error ? 'report' : 'check'}/><span>{message.text}</span></div>}
      </section>
      <aside className="written-ranking panel" aria-labelledby="written-ranking-title" aria-busy={loading}>
        <span className="written-rank-icon"><UIIcon name="award"/></span><p className="kicker">每一篇，都是积累</p><h2 id="written-ranking-title">我的学校排名</h2>
        {loading && !data ? <p role="status">正在读取排名…</p> : listError ? <p>排名暂时未能更新，请刷新故事记录。</p> : <><div className="written-rank-number" aria-label={rank?.rank ? `学校排名第${rank.rank}名` : '暂未上榜'}>{rank?.rank ? <><small>第</small><strong>{rank.rank}</strong><small>名</small></> : <strong className="written-no-rank">等待你的第一篇</strong>}</div><p className="written-rank-count">已提交 {rank?.value || 0} 篇</p><div className="written-rank-rule"><strong>按写故事的篇数排名</strong><span>本学期全校共 {data?.ranking.population || 0} 位同学参与<br/>篇数相同的同学并列排名</span></div></>}
        <span className="written-rank-decoration" aria-hidden="true">一笔一画，写下成长。</span>
      </aside>
    </div>
    <section className="written-history panel" aria-labelledby="written-history-title" aria-busy={loading}>
      <header className="written-history-heading"><div><p className="kicker">翻开属于自己的故事集</p><h2 id="written-history-title">我写过的故事 <small>本学期</small></h2></div><button aria-label="刷新故事记录" disabled={loading || busy || loadingMore} onClick={() => load()}><span aria-hidden="true">↻</span> 刷新</button></header>
      {listError ? <div className="written-empty" role="alert"><h3>故事集暂时没有打开</h3><p>{listError}</p><button onClick={() => load()}>重新读取</button></div> : loading && !data ? <div className="written-empty" role="status">正在翻开你的故事集…</div> : !rows.length ? <div className="written-empty"><UIIcon name="book"/><h3>还没有故事，第一篇就从今天开始</h3><p>递交的文字和文档都会珍藏在这里，随时回来读一读。</p></div> : <><ol className="written-story-list">{rows.map((row, index) => <li key={row.id}><button className="written-story-row" data-written-story-id={row.id} onClick={() => setSelectedId(row.id)}><span className="written-story-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="written-story-summary"><strong>{row.title}</strong><span>{row.excerpt}</span><small>{dateLabel(row.createdAt)}<span aria-hidden="true"> · </span>{row.wordCount.toLocaleString()} 字<span aria-hidden="true"> · </span>{row.originalName ? '文档上传' : '文字创作'}</small></span><span className="written-story-open">阅读故事 <span aria-hidden="true">↗</span></span></button></li>)}</ol>{data.nextCursor && <button className="written-load-more" disabled={loadingMore || loading || busy} onClick={() => load(data.nextCursor)}>{loadingMore ? '正在读取…' : '再看看更早的故事'}</button>}</>}
    </section>
    <dialog className="written-story-dialog" ref={dialog} aria-label="我的故事详情" onCancel={event => { event.preventDefault(); setSelectedId(null); }}>
      <header><div><p className="kicker">我的故事集</p><h2>{story?.title || '故事详情'}</h2></div><button aria-label="关闭故事详情" onClick={() => setSelectedId(null)}>×</button></header>
      {detailError ? <div className="written-empty" role="alert"><p>{detailError}</p><button onClick={() => setDetailRetry(value => value + 1)}>重新打开故事</button></div> : !story ? <p role="status">正在打开故事…</p> : <><div className="written-story-meta">{dateLabel(story.createdAt)} · {story.wordCount.toLocaleString()} 字{story.originalName && <span>上传文档：{story.originalName}</span>}</div><div className="written-story-content"><p>{story.text}</p></div><footer><span>这是你留下的成长足迹。</span><button className="primary" onClick={() => setSelectedId(null)}>读完了</button></footer></>}
    </dialog>
  </div>;
}
