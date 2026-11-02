import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, resultOf } from '../../core/api';
import './listeningStories.css';

const time = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const completedDate = value => new Date(value).toLocaleString('zh-CN', { timeZone:'Asia/Shanghai', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });

export default function ListeningStories({ ctx }) {
  const { termId, refreshKey, error:onError } = ctx;
  const [catalog, setCatalog] = useState([]), [history, setHistory] = useState([]);
  const [ranking, setRanking] = useState(null), [term, setTerm] = useState(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null), [source, setSource] = useState(null);
  const [status, setStatus] = useState('idle'), [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0), [message, setMessage] = useState('');
  const player = useRef(null), active = useRef(null), generation = useRef(0);
  const playerPanel = useRef(null), loadSequence = useRef(0);
  const request = useRef(null), blobUrl = useRef(null), queue = useRef(Promise.resolve());
  const mounted = useRef(true);
  const collecting = term?.phase === 'COLLECTING' && Date.now() < +new Date(term.collectionCutoff);

  const load = useCallback(async signal => {
    const sequence = ++loadSequence.current;
    try {
      const options = { signal };
      const [c, h, r, t] = await Promise.all([
        api(`/report-core/v2/catalog?termId=${termId}`, undefined, undefined, options),
        api(`/report-core/v2/listening/history?termId=${termId}`, undefined, undefined, options),
        api(`/report-core/v2/rankings?termId=${termId}&type=LISTEN`, undefined, undefined, options),
        api(`/report-core/term-state?termId=${termId}`, undefined, undefined, options),
      ]);
      if (!mounted.current || signal?.aborted || sequence !== loadSequence.current) return;
      setCatalog(c); setHistory(h); setRanking(r); setTerm(t); setLoadError('');
    } catch (e) {
      if (!mounted.current || signal?.aborted || sequence !== loadSequence.current) return;
      setLoadError(e.message);
      if (e.status === 401) onError(e);
    } finally {
      if (mounted.current && !signal?.aborted && sequence === loadSequence.current) setLoading(false);
    }
  }, [termId, onError]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current = null;
      request.current?.abort();
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, []);
  useEffect(() => {
    const audio = player.current;
    if (!audio || !source) return;
    return () => { audio.pause(); audio.removeAttribute('src'); audio.load(); };
  }, [source]);

  const failPlayback = useCallback((e, token) => {
    if (!mounted.current || generation.current !== token) return;
    active.current = null;
    player.current?.pause();
    setStatus('error');
    setMessage(`${e.message}。请重新播放，完整听完后才会计分。`);
    if (e.status === 401) onError(e);
  }, [onError]);

  // Serialize samples with their capture-time positions. A pause, resume or end
  // can never overtake an in-flight periodic heartbeat.
  const beat = useCallback(playing => {
    const current = active.current, audio = player.current;
    if (!current || !audio || current.alreadyCompleted) return Promise.resolve();
    const sample = { position:audio.currentTime, playing, sampleMs:performance.now()-current.startedAt };
    const task = queue.current.then(async () => {
      if (active.current !== current || generation.current !== current.token) return;
      return api(`/report-core/v2/listening/${current.sessionId}/heartbeat`, {
        position:sample.position, playing:sample.playing, sampleMs:sample.sampleMs,
      });
    });
    queue.current = task.catch(() => {});
    return task;
  }, []);
  useEffect(() => {
    if (status !== 'playing') return;
    const timer = setInterval(() => {
      const current = active.current, audio = player.current;
      if (current && audio && !audio.paused && !audio.ended)
        beat(true).catch(e => failPlayback(e, current.token));
    }, 3000);
    return () => clearInterval(timer);
  }, [status, beat, failPlayback]);

  const choose = async story => {
    const token = ++generation.current;
    active.current = null;
    request.current?.abort();
    player.current?.pause();
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = null;
    setSelected(story); setSource(null); setPosition(0); setDuration(0);
    setStatus('loading'); setMessage('');
    if (window.matchMedia('(max-width:699px)').matches)
      requestAnimationFrame(() => playerPanel.current?.scrollIntoView({block:'center',behavior:'smooth'}));
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(`/api/v1/report-core/v2/catalog/${story.id}/audio`, {
        signal:controller.signal,
        headers:{ Authorization:'Bearer ' + localStorage.getItem('REPORT_CORE_TOKEN') },
      });
      if (!response.ok) throw Object.assign(Error('故事音频暂不可用'), { status:response.status });
      const blob = await response.blob();
      if (!mounted.current || generation.current !== token) return;
      blobUrl.current = URL.createObjectURL(blob);
      setSource(blobUrl.current);
    } catch (e) {
      if (!controller.signal.aborted) failPlayback(e, token);
    }
  };

  const play = async () => {
    const audio = player.current, token = generation.current;
    if (!audio || !selected) return;
    setMessage(''); setStatus('starting');
    try {
      if (!active.current || status === 'completed') {
        audio.currentTime = 0; setPosition(0);
        let session;
        if (!collecting) session = { alreadyCompleted:true, sessionId:null };
        else session = resultOf(await api('/report-core/v2/listening', { termId, storyId:selected.id }));
        if (generation.current !== token || !mounted.current) return;
        active.current = { ...session, token, startedAt:performance.now() };
      }
      await beat(true);
      if (generation.current !== token || !mounted.current) return;
      await audio.play();
      if (active.current?.alreadyCompleted) setMessage(collecting ? '这个故事已计分，再次播放不会重复加分。' : '当前为欣赏播放，学期采集已结束。');
    } catch (e) {
      // A quick pause can reject the still-pending play() promise after the
      // browser has already emitted playing. The pause remains valid.
      if (e.name === 'AbortError' && audio.paused) return;
      failPlayback(e, token);
    }
  };
  const pause = async () => {
    const current = active.current;
    if (!current) return;
    setStatus('pausing');
    player.current?.pause();
    try {
      await beat(false);
      if (active.current === current) setStatus('paused');
    } catch (e) { failPlayback(e, current.token); }
  };
  const finish = async () => {
    const current = active.current;
    if (!current || current.finishing) return;
    current.finishing = true;
    setStatus('completing');
    try {
      if (current.alreadyCompleted) {
        setStatus('completed');
        setMessage(collecting ? '再次收听已完成，该故事已计分。' : '故事播放完毕。');
        return;
      }
      if (!current.finalSampleConfirmed) {
        await beat(false);
        current.finalSampleConfirmed = true;
      }
      if (active.current !== current) return;
      const result = resultOf(await api(`/report-core/v2/listening/${current.sessionId}/complete`, {}));
      if (!mounted.current || active.current !== current) return;
      setRanking(result.ranking);
      setHistory(result.history);
      const completedIds = new Set(result.history.map(story => story.id));
      setCatalog(stories => stories.map(story => ({ ...story, completed:completedIds.has(story.id) })));
      setStatus('completed');
      setMessage(result.awarded ? '完整收听已完成，听故事积分 +1' : '收听已完成，该故事已计分。');
      ctx.refresh();
    } catch (e) {
      if (!mounted.current || active.current !== current) return;
      current.finishing = false;
      if (e.status === 409 || e.status === 423) failPlayback(e, current.token);
      else {
        setStatus('submit-error');
        setMessage('故事已播放完毕，积分保存失败，请重试。');
        if (e.status === 401) onError(e);
      }
    }
  };
  const locked = ['starting','pausing','completing'].includes(status);
  const progress = duration ? Math.min(100, position / duration * 100) : 0;

  return (
    <div className="listening-workspace">
      <header className="listening-intro">
        <div className="listening-intro-copy"><p className="kicker">给耳朵一段好时光</p><h3>听见一个故事，收获一点成长。</h3><p>选一篇喜欢的故事，完整听完，点亮你的成长记录。</p></div>
        <section className="listening-personal listening-header-stats" aria-label="我的听故事成绩">
          <div className="listening-total"><b>{history.length}</b> / 100<span>本学期已听完</span></div>
          <div><span>当前学校排名</span><strong>{ranking?.me?.rank ? `第 ${ranking.me.rank} 名` : '暂无排名'}</strong></div>
        </section>
      </header>
      {loadError && <div className="listening-alert" role="alert">{loadError}<button onClick={() => load()}>刷新故事与成绩</button></div>}
      {loading ? <p role="status">正在打开故事书架…</p> : (
        <>
          {!collecting && <p role="status">本学期采集已结束，可以继续欣赏故事、查看历史记录和学校排名。</p>}
          <div className="listening-columns">
            <section className="listening-shelf" aria-label="故事列表">
              <div className="listening-story-grid">
                {catalog.map((story, index) => <button key={story.id} type="button" className={`listening-story-choice${story.completed ? ' is-completed' : ''}`} aria-label={`选择故事：${story.title}`} aria-pressed={selected?.id === story.id} disabled={locked} onClick={() => choose(story)}>
                  <span className="listening-story-number">{String(index + 1).padStart(2,'0')}</span><span className="listening-story-info"><b>{story.title}</b><small>{time(story.durationMs / 1000)} · {story.completed ? '已听完 ✓' : '待聆听'}</small></span><span aria-hidden="true">{selected?.id === story.id ? '●' : '↗'}</span>
                </button>)}
              </div>
              {!catalog.length && !loadError && <p>故事书架暂时为空，请稍后再来。</p>}
            </section>
            <aside ref={playerPanel} className="listening-player" aria-label="故事播放器">
              <div className="listening-player-art" aria-hidden="true"><svg viewBox="0 0 180 120" fill="none"><path d="M45 70V54a45 45 0 0 1 90 0v16" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/><rect x="33" y="60" width="25" height="40" rx="12" fill="currentColor"/><rect x="122" y="60" width="25" height="40" rx="12" fill="currentColor"/><path d="M73 69v20m16-31v40m16-27v16" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/><circle cx="20" cy="30" r="4" fill="#b78839"/><path d="M155 22v14m-7-7h14" stroke="#b78839" strokeWidth="2"/></svg></div>
              <span className="kicker">{selected ? '你选择的故事' : '故事即将开始'}</span>
              <h3>{selected?.title || '先选一个喜欢的故事'}</h3>
              <p>{selected ? '把这一段时间，留给认真倾听的自己。' : '从左侧书架挑选，听故事的旅程从这里开始。'}</p>
              {selected && <>
                <audio key={selected.id} ref={player} src={source || undefined} preload="auto" aria-label="校园故事播放器"
                  onLoadedMetadata={() => { setDuration(player.current.duration); setStatus('ready'); }}
                  onTimeUpdate={() => { if (player.current) setPosition(player.current.currentTime); }}
                  onPlaying={() => { const current = active.current; if (!current) return; setStatus('playing'); beat(true).catch(e => failPlayback(e,current.token)); }}
                  onWaiting={() => { const current = active.current; if (!current) return; setStatus('buffering'); beat(false).catch(e => failPlayback(e,current.token)); }}
                  onPause={() => { const audio = player.current; if (audio && !audio.ended && active.current) { setStatus(s => s === 'playing' ? 'paused' : s); beat(false).catch(e => failPlayback(e,generation.current)); } }}
                  onRateChange={() => { if (player.current && player.current.playbackRate !== 1) player.current.playbackRate = 1; }}
                  onSeeking={() => { const audio = player.current; if (active.current && audio && Math.abs(audio.currentTime-position) > 1) failPlayback(Error('不能跳过故事片段'),generation.current); }}
                  onEnded={finish}
                  onError={() => { if (source) failPlayback(Error('音频加载失败'),generation.current); }} />
                <progress aria-label="故事播放进度" value={progress} max="100" />
                <div className="listening-time"><span>{time(position)}</span><span>{time(duration || selected.durationMs / 1000)}</span></div>
                {status === 'error' ? <button className="primary listening-play" onClick={() => choose(selected)}>重新加载故事</button> : status === 'submit-error' ? <button className="primary listening-play" onClick={finish}>重试保存积分</button> :
                  <button className="primary listening-play" disabled={locked || status === 'loading' || !source} onClick={status === 'playing' || status === 'buffering' ? pause : play}>
                    {status === 'playing' || status === 'buffering' ? '暂停播放' : status === 'paused' ? '继续播放' : status === 'loading' ? '正在加载音频…' : status === 'completing' ? '正在保存积分…' : status === 'starting' ? '正在开始…' : status === 'pausing' ? '正在暂停…' : status === 'completed' ? '再次播放' : '播放故事'}
                  </button>}
                {status === 'buffering' && <p role="status">音频缓冲中，缓冲时间不计入收听。</p>}
              </>}
              <p className="listening-rule">完整听完 1 个新故事，积分 +1。<br/>暂停不加分，同一故事每学期计分一次。</p>
              {message && <p className={status === 'completed' ? 'listening-success' : 'listening-message'} role="status">{message}</p>}
            </aside>
          </div>
          <section className="listening-history" aria-label="历史听过的故事">
            <div className="listening-section-heading"><h3>已听完的故事</h3><span>{history.length} 个故事 · 本学期收听足迹</span></div>
            {history.length ? <ol>{history.map(story => <li className="listening-history-item" key={story.id}><span className="listening-history-check" aria-hidden="true">✓</span><div><b>{story.title}</b><small>{completedDate(story.completedAt)} 听完 · 已计 1 分</small></div><button disabled={locked} onClick={() => { choose(catalog.find(s => s.id === story.id) || story); document.querySelector('.listening-player')?.scrollIntoView({block:'center',behavior:'smooth'}); }}>再听一次</button></li>)}</ol> : <div className="listening-empty"><b>你的第一段收听足迹，等着被点亮。</b><p>完整听完故事后，故事名称和完成时间会保存在这里。</p></div>}
          </section>
          <section className="listening-school-ranking" aria-label="全校听故事榜"><div className="listening-section-heading"><h3>全校听故事榜</h3><span>按本学期完整听完的不同故事数排名</span></div>{ranking?.top?.length ? <ol>{ranking.top.map((row,index) => <li key={index}><span>第 {row.rank} 名</span><b>{row.displayName}{row.isMe && '（我）'}</b><span>{row.value} 分</span></li>)}</ol> : <p>还没有有效成绩，听完第一个故事就能加入榜单。</p>}</section>
        </>
      )}
    </div>
  );
}
