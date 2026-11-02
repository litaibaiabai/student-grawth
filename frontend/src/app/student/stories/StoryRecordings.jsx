import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../core/api';
import useStoryRecorder from './useStoryRecorder';
import './storyRecordings.css';

const endpoint = '/report-core/v2/story-recordings';
const time = ms => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const date = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function RecordingIcon({ name, ...props }) {
  const paths = {
    mic: <><rect x="8" y="2.5" width="8" height="13" rx="4"/><path d="M5 11.5a7 7 0 0 0 14 0M12 18.5v3M8.5 21.5h7"/></>,
    play: <path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none"/>,
    pause: <path d="M9 5v14M16 5v14" strokeWidth="3"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    trophy: <path d="M7 3h10v6a5 5 0 0 1-10 0ZM12 14v6M8 21h8M7 5H3v3a4 4 0 0 0 5 4M17 5h4v3a4 4 0 0 1-5 4"/>,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

export default function StoryRecordings({ ctx, registerGuard }) {
  const { termId, refreshKey, error: onError, setLeaveGuard } = ctx;
  const recorder = useStoryRecorder();
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(''), [message, setMessage] = useState(null), [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false), [draftUrl, setDraftUrl] = useState(null);
  const [selected, setSelected] = useState(null), [historyUrl, setHistoryUrl] = useState(null), [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState(''), [playing, setPlaying] = useState(false), [downloadId, setDownloadId] = useState(null);
  const mounted = useRef(false), sequence = useRef(0), saveLock = useRef(false), current = useRef({});
  const draftPlayer = useRef(null), historyPlayer = useRef(null), audioRequest = useRef(null), playbackToken = useRef(0);
  const playingUrl = useRef(null), downloadRequest = useRef(null), currentSelected = useRef(null);
  current.current = { status: recorder.status, file: recorder.file, busy };
  const recording = recorder.status === 'recording', requesting = recorder.status === 'requesting', stopping = recorder.status === 'stopping';
  const closed = blocked || data?.collection.open === false;
  const canRecord = !!data?.collection.open && !closed && ctx.sessionActive !== false;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      audioRequest.current?.abort(); downloadRequest.current?.abort();
      if (playingUrl.current) URL.revokeObjectURL(playingUrl.current);
    };
  }, []);
  useEffect(() => {
    const guard = () => {
      const draft = current.current;
      if (draft.busy) return false;
      return !(draft.file || ['requesting', 'recording', 'stopping'].includes(draft.status)) || window.confirm('录音尚未保存，离开会放弃本次录音，确定离开？');
    };
    setLeaveGuard?.(guard); registerGuard?.(guard);
    const protect = event => {
      const draft = current.current;
      if (draft.busy || draft.file || ['requesting', 'recording', 'stopping'].includes(draft.status)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', protect);
    return () => { setLeaveGuard?.(null); registerGuard?.(null); window.removeEventListener('beforeunload', protect); };
  }, [setLeaveGuard, registerGuard]);
  useEffect(() => {
    if (!recorder.file) { setDraftUrl(null); return; }
    const url = URL.createObjectURL(recorder.file);
    setDraftUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recorder.file]);
  useEffect(() => {
    const audio = draftPlayer.current;
    return () => { audio?.pause(); };
  }, [draftUrl]);
  useEffect(() => {
    const audio = historyPlayer.current;
    return () => { audio?.pause(); };
  }, [historyUrl]);

  const load = useCallback(async (beforeId, signal) => {
    const token = ++sequence.current;
    if (beforeId) setLoadingMore(true); else setLoading(true);
    try {
      const query = new URLSearchParams({ termId, ...(beforeId ? { beforeId } : {}) });
      const next = await api(`${endpoint}?${query}`, undefined, undefined, { signal });
      if (!mounted.current || signal?.aborted || token !== sequence.current) return;
      setData(previous => ({ ...next, rows: beforeId ? [...(previous?.rows || []), ...next.rows].filter((row, index, rows) => rows.findIndex(item => item.id === row.id) === index) : next.rows }));
      setLoadError('');
    } catch (error) {
      if (!mounted.current || signal?.aborted || token !== sequence.current) return;
      if (beforeId) setMessage({ error: true, text: `暂时无法读取更多录音：${error.message}` });
      else setLoadError(error.message);
      if (error.status === 401) onError(error);
    } finally {
      if (mounted.current && !signal?.aborted && token === sequence.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [termId, onError]);
  useEffect(() => {
    const controller = new AbortController();
    load(undefined, controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  const pauseAll = () => { draftPlayer.current?.pause(); historyPlayer.current?.pause(); setPlaying(false); };
  const start = () => {
    if (!canRecord || saveLock.current) return;
    pauseAll();
    audioRequest.current?.abort(); playbackToken.current++;
    setAudioLoading(false); setMessage(null);
    recorder.start();
  };
  async function save() {
    if (!recorder.file || recorder.status !== 'ready' || !canRecord || saveLock.current) return;
    saveLock.current = true; setBusy(true); setMessage(null); pauseAll();
    const body = new FormData();
    body.set('termId', termId); body.set('durationMs', String(recorder.durationMs)); body.set('file', recorder.file);
    try {
      await api(endpoint, body);
      if (!mounted.current) return;
      recorder.discard(); setMessage({ text: '录音保存成功，新的故事已加入你的记录。' });
      await load(); ctx.refresh();
    } catch (error) {
      if (!mounted.current) return;
      setMessage({ error: true, text: `${error.message}。本次录音仍保留，可以试听后重试。` });
      if (error.status === 401) onError(error);
      if (error.status === 423) { setBlocked(true); load(); }
    } finally { saveLock.current = false; if (mounted.current) setBusy(false); }
  }
  async function audioBlob(row, signal) {
    const response = await fetch(`/api/v1${endpoint}/${row.id}/audio`, { signal, headers: { Authorization: 'Bearer ' + localStorage.getItem('REPORT_CORE_TOKEN') } });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw Object.assign(Error(result.message || '录音暂时无法读取，请重试'), { status: response.status });
    }
    return response.blob();
  }
  async function playHistory(row) {
    if (recording || requesting || stopping || busy) return;
    draftPlayer.current?.pause();
    if (currentSelected.current === row.id && historyUrl) {
      const audio = historyPlayer.current;
      if (!audio) return;
      if (!audio.paused) { audio.pause(); return; }
      try { await audio.play(); } catch (error) { if (mounted.current && currentSelected.current === row.id && error.name !== 'AbortError') setAudioError('录音未能播放，请点击播放器的播放按钮或重新加载。'); }
      return;
    }
    const token = ++playbackToken.current;
    audioRequest.current?.abort(); historyPlayer.current?.pause();
    if (playingUrl.current) URL.revokeObjectURL(playingUrl.current);
    playingUrl.current = null; currentSelected.current = row.id;
    setHistoryUrl(null); setSelected(row); setPlaying(false); setAudioError(''); setAudioLoading(true);
    const controller = new AbortController(); audioRequest.current = controller;
    try {
      const blob = await audioBlob(row, controller.signal);
      if (!mounted.current || controller.signal.aborted || token !== playbackToken.current) return;
      const url = URL.createObjectURL(blob);
      playingUrl.current = url; setHistoryUrl(url);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || token !== playbackToken.current) return;
      setAudioError(error.message);
      if (error.status === 401) onError(error);
    } finally { if (mounted.current && token === playbackToken.current) setAudioLoading(false); }
  }
  async function download(row) {
    if (downloadRequest.current) return;
    const controller = new AbortController(); downloadRequest.current = controller; setDownloadId(row.id);
    try {
      const blob = await audioBlob(row, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      const ext = { 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav' }[row.mime] || 'webm';
      link.href = url; link.download = `story-${row.id}.${ext}`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      setMessage({ error: true, text: error.message });
      if (error.status === 401) onError(error);
    } finally { downloadRequest.current = null; if (mounted.current) setDownloadId(null); }
  }
  const rows = data?.rows || [], rank = data?.ranking.me;
  const playerBusy = recording || requesting || stopping || busy;

  return <div className="story-recordings">
    <p className="recordings-intro">把今天的想象，讲给世界听。</p>
    <div className="recordings-columns">
      <section className={`recording-studio panel ${recording ? 'is-recording' : ''}`} aria-label="故事录音室">
        <header className="recording-studio-heading"><h2>小小故事录音室</h2><span>每段最长 5 分钟</span></header>
        {recorder.status === 'ready' && draftUrl ? <div className="recording-review">
          <span className="recording-done"><RecordingIcon name="check"/></span><h3>故事录好啦</h3><p>先听一听，再把这一刻留下来。</p>
          <audio ref={draftPlayer} aria-label="本次故事录音试听" controls src={draftUrl} onPlay={() => { historyPlayer.current?.pause(); setPlaying(false); }}/>
          <div className="recording-review-meta"><span>我的新故事 · 待保存</span><span>{time(recorder.durationMs)}</span></div>
          <div className="recording-save-actions"><button disabled={busy || !canRecord} onClick={start}>重新录音</button><button className="primary" data-save-recording disabled={busy || !canRecord} onClick={save}>{busy ? '正在上传…' : '保存并上传'}</button></div>
          <p className="recording-hint">保存成功后，会计入录音数量和全校排名。</p>
        </div> : <div className="recording-capture">
          <div className="recording-mic-zone"><span className="recording-orbit" aria-hidden="true"/><span className="recording-spark" aria-hidden="true">✧</span><button type="button" data-start-recording className="recording-mic" aria-label={recording ? '停止录音' : requesting ? '正在申请麦克风' : stopping ? '正在整理录音' : '开始录音'} disabled={requesting || stopping || busy || !recording && !canRecord} onClick={recording ? recorder.stop : start}>{recording ? <span className="recording-stop-shape"/> : <RecordingIcon name="mic"/>}</button><span className="recording-spark small" aria-hidden="true">✧</span></div>
          <div className="recording-timer" data-recording-time aria-label="录音计时">{time(recorder.durationMs)}</div>
          <p className="recording-state" role="status">{recording ? <><span className="recording-red-dot"/>正在录音 · 点击按钮停止</> : requesting ? '请允许浏览器使用麦克风…' : stopping ? '正在整理你的故事…' : '点一下，开始你的故事'}</p>
          <div className="recording-wave" aria-hidden="true">{[4, 8, 14, 9, 21, 28, 18, 32, 25, 12, 22, 29, 34, 21, 30, 18, 26, 12, 20, 27, 15, 9, 19, 13, 6, 10, 4].map((height, index) => <i key={index} style={{ '--bar-height': `${height}px`, '--bar-delay': `${index * .07}s` }}/>)}</div>
          <p className="recording-hint">{recording ? <>慢慢说，每一句都值得被听见。<br/>说完后点击上方按钮，即可试听和保存。</> : <>不用一直按住，说完后点击停止。<br/>找一个安静的地方，让故事被好好听见。</>}</p>
        </div>}
        {closed && <div className="recording-closed" role="status"><strong>本学期录音上传已结束</strong><span>你仍可以播放和下载已经保存的故事。</span></div>}
        {loading && !data && <p className="recording-hint" role="status">正在连接录音服务，连接后即可开始录音…</p>}
        {loadError && !data && <div className="recording-feedback is-error" role="alert"><strong>录音功能暂时未连接成功</strong><p>请点击重新连接，成功后即可开始录音。</p><button disabled={loading} onClick={() => load()}>重新连接录音服务</button></div>}
        {recorder.error && <p className="recording-feedback is-error" role="alert">{recorder.error}</p>}
        {message && <p className={`recording-feedback ${message.error ? 'is-error' : ''}`} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      </section>
      <aside className="recording-ranking panel" aria-label="我的讲故事数量排名" aria-busy={loading}>
        <header><RecordingIcon name="trophy"/><h2>我的讲故事足迹</h2><span>本学期 · 全校</span></header>
        {loading && !data ? <p role="status">正在读取录音数量与名次…</p> : loadError ? <div className="recording-rank-unavailable"><p>录音数量与排名暂时未能更新。</p><button disabled={loading} onClick={() => load()}>重新读取</button></div> : <>
          <div className="recording-rank-numbers"><div aria-label="已保存录音数量"><span>已保存录音</span><strong>{rank?.value || 0}</strong><small> 条</small></div><div aria-label="我的全校录音名次"><span>全校排名</span>{rank?.rank ? <><strong>{rank.rank}</strong><small> 名</small></> : <b>暂无排名</b>}</div></div>
          <p className="recording-rank-caption">每一个讲出来的故事，<br/>都是一次小小的成长。</p>
        </>}
      </aside>
    </div>
    <section className="recording-history panel" aria-label="历史录音记录" aria-busy={loading}>
      <header className="recording-history-heading"><div><p className="kicker">收藏声音里的小故事</p><h2>我的录音集 <small>本学期</small></h2></div><button aria-label="刷新录音记录" disabled={loading || loadingMore || busy} onClick={() => load()}>↻ 刷新</button></header>
      {loadError ? <div className="recording-empty" role="alert"><h3>录音集暂时没有打开</h3><p>{loadError}</p><button onClick={() => load()}>重新读取录音</button></div> : loading && !data ? <p className="recording-empty" role="status">正在打开你的录音集…</p> : !rows.length ? <div className="recording-empty"><RecordingIcon name="mic"/><h3>你的第一个故事，等着被听见。</h3><p>录音后点击“保存并上传”，声音就会收藏在这里。</p></div> : <>
        <ol className="recording-history-list">{rows.map(row => <li key={row.id} data-story-recording-id={row.id}>
          <div className="recording-history-row"><button className={`recording-history-play ${selected?.id === row.id && playing ? 'is-playing' : ''}`} aria-label={`${selected?.id === row.id && playing ? '暂停' : '播放'}${row.title}`} disabled={playerBusy || audioLoading && selected?.id === row.id} onClick={() => playHistory(row)}><RecordingIcon name={selected?.id === row.id && playing ? 'pause' : 'play'}/></button><div className="recording-history-info"><h3>{row.title}</h3><p><time dateTime={row.createdAt}>{date(row.createdAt)}</time><span>{time(row.durationMs)}</span></p></div><button className="recording-download" aria-label={`下载${row.title}`} disabled={!!downloadId} onClick={() => download(row)}>{downloadId === row.id ? '…' : <RecordingIcon name="download"/>}</button></div>
          {selected?.id === row.id && <div className="recording-history-player">
            {audioLoading ? <p role="status">正在加载这段故事…</p> : <>
              {audioError && <p role="alert">{audioError}<button disabled={playerBusy} onClick={() => { currentSelected.current = null; playHistory(row); }}>重新加载录音</button></p>}
              {historyUrl && <audio ref={historyPlayer} controls={!playerBusy} src={historyUrl} aria-label="历史故事录音播放器" onLoadedMetadata={() => {
                const audio = historyPlayer.current;
                if (audio && !playerBusy) audio.play().catch(error => {
                  if (mounted.current && currentSelected.current === row.id && error.name !== 'AbortError') setAudioError('录音已经加载，请点击播放器的播放按钮。');
                });
              }} onPlay={() => {
                if (playerBusy) { historyPlayer.current?.pause(); return; }
                draftPlayer.current?.pause(); setPlaying(true); setAudioError('');
              }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { setPlaying(false); setAudioError('这段录音暂时无法播放，请重新加载。'); }}/>}
            </>}
          </div>}
        </li>)}</ol>
        {data.nextCursor && <button className="recording-more" disabled={loading || loadingMore || busy} onClick={() => load(data.nextCursor)}>{loadingMore ? '正在读取…' : '查看更早的录音 ↓'}</button>}
      </>}
    </section>
  </div>;
}
