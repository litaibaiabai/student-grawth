import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, resultOf } from '../../core/api';
import { UIIcon } from '../../core/illustrations';
import { ConfirmDialog } from '../../core/ui';
import { subjectLabel } from '../../shared/materials/awardFacts';
import LegacyAwardUpload from './LegacyAwardUpload';
import AwardCamera from './AwardCamera';
import './studentAwards.css';

const activeStates = ['QUEUED', 'PROCESSING', 'SUBMITTED', 'FAILED'];
const states = {
  QUEUED: ['系统识别中', 'working'], PROCESSING: ['系统识别中', 'working'],
  SUBMITTED: ['待老师评审', 'pending'], FAILED: ['等待老师人工核对', 'pending'],
  APPROVED: ['已通过', 'approved'], REJECTED: ['未通过', 'rejected'],
  REVOKED: ['已撤回', 'muted'], SUPERSEDED: ['已替换', 'muted'],
};
const titleOf = row => row.payload.facts?.title || (['QUEUED', 'PROCESSING'].includes(row.status) ? '正在识别这份荣誉' : '新上传的奖状');
const statusOf = row => states[row.status] || ['等待老师核对', 'pending'];
const fileSize = size => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;

function StudentAwards({ ctx }) {
  const { termId, refreshKey, error: onError, setLeaveGuard } = ctx;
  const [file, setFile] = useState(null), [preview, setPreview] = useState(''), [imageReady, setImageReady] = useState(false);
  const [fileError, setFileError] = useState(''), [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [listError, setListError] = useState('');
  const [termState, setTermState] = useState(null), [stateError, setStateError] = useState(''), [uploadBlocked, setUploadBlocked] = useState(false);
  const [reload, setReload] = useState(0), [filter, setFilter] = useState('all'), [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(null), [selectedId, setSelectedId] = useState(null);
  const [original, setOriginal] = useState(''), [originalError, setOriginalError] = useState(''), [previewRetry, setPreviewRetry] = useState(0);
  const [withdrawRow, setWithdrawRow] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const picker = useRef(null), uploader = useRef(null), detail = useRef(null);
  const lock = useRef(false), mounted = useRef(true), sequence = useRef(0), draft = useRef({ file, busy });
  draft.current = { file, busy };
  const selected = rows.find(row => String(row.id) === selectedId);
  const selectedKey = selected?.id;
  const cutoff = termState?.collectionCutoff;
  const closed = !!termState && (termState.phase !== 'COLLECTING' || (cutoff && Date.now() >= +new Date(cutoff)));
  const canUpload = termState?.phase === 'COLLECTING' && !closed && !uploadBlocked && ctx.sessionActive !== false;

  useEffect(() => { if (!canUpload) setCameraOpen(false); }, [canUpload]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const guard = () => !draft.current.busy && (!draft.current.file || window.confirm('图片还没有提交，离开会放弃这次选择。是否离开？'));
    setLeaveGuard?.(guard);
    const protect = event => { if (draft.current.file || draft.current.busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protect);
    return () => { setLeaveGuard?.(null); window.removeEventListener('beforeunload', protect); };
  }, [setLeaveGuard]);
  useEffect(() => {
    setPreview('');
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const load = useCallback(async signal => {
    const id = ++sequence.current;
    setLoading(true);
    const readRows = async () => {
      const all = [];
      let offset = 0;
      do {
        const query = new URLSearchParams({ termId, sourceType: 'CERTIFICATE', recordKind: 'ITEM', page: '1', offset: String(offset) });
        const data = await api(`/report-core/sources?${query}`, undefined, undefined, { signal });
        all.push(...data.rows);
        offset = data.nextOffset;
      } while (offset !== null && offset !== undefined);
      return all;
    };
    const [records, state] = await Promise.allSettled([
      readRows(), api(`/report-core/term-state?termId=${termId}`, undefined, undefined, { signal }),
    ]);
    if (!mounted.current || signal?.aborted || id !== sequence.current) return;
    if (records.status === 'fulfilled') { setRows(records.value); setListError(''); }
    else { setListError(records.reason.message); if (records.reason.status === 401) onError(records.reason); }
    if (state.status === 'fulfilled') { setTermState(state.value); setStateError(''); }
    else { setStateError('暂时无法确认上传时间，请刷新重试。'); if (state.reason.status === 401) onError(state.reason); }
    setLoading(false);
  }, [termId, onError]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey, reload]);
  const hasPending = rows.some(row => activeStates.includes(row.status));
  useEffect(() => {
    const refresh = () => { if (!document.hidden && !lock.current && !loading) setReload(n => n + 1); };
    const timer = hasPending && !loading ? setInterval(refresh, 5000) : null;
    document.addEventListener('visibilitychange', refresh);
    return () => { if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [hasPending, loading]);

  useEffect(() => {
    if (!selectedKey) return;
    const element = detail.current, previous = document.activeElement;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, [selectedKey]);
  useEffect(() => {
    setOriginal(''); setOriginalError('');
    if (!selectedKey) return;
    const controller = new AbortController();
    let url;
    fetch(`/api/v1/report-core/files/${selectedKey}`, {
      signal: controller.signal, headers: { Authorization: 'Bearer ' + localStorage.getItem('REPORT_CORE_TOKEN') },
    }).then(async response => {
      if (!response.ok) throw Object.assign(Error('暂时无法读取奖状原图，请重试。'), { status: response.status });
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob); setOriginal(url);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setOriginalError(error.message);
      if (error.status === 401) { setSelectedId(null); onError(error); }
    });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [selectedKey, previewRetry, onError]);

  function chooseFiles(files) {
    if (busy || !canUpload || !files?.length) return;
    setMessage(null); setDragging(false);
    if (files.length !== 1) { setFileError('每次只提交一张奖状，请逐张上传。'); return; }
    const next = files[0];
    if (!['image/png', 'image/jpeg'].includes(next.type) || next.size > 10 * 1024 * 1024 || !next.size) {
      setFileError('请选择10MB以内的PNG或JPEG奖状图片。'); return;
    }
    setFileError(''); setImageReady(false); setFile(next);
  }
  function chooseAgain() {
    setSelectedId(null); setCameraOpen(false);
    uploader.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    picker.current?.click();
  }
  async function submit() {
    if (lock.current || !file || !imageReady || !canUpload || cameraOpen) return;
    lock.current = true; setBusy(true); setMessage(null);
    try {
      const data = new FormData(); data.set('file', file); data.set('termId', termId);
      const result = resultOf(await api('/report-core/certificates', data));
      if (!mounted.current) return;
      setFile(null); setImageReady(false); setFileError(''); setFilter('all'); setPage(0);
      setMessage({ type: 'success', text: result.duplicate ? '这张奖状已经提交过，可以直接查看当前记录。' : '奖状已收到，系统会自动识别，之后由老师核对。' });
      await load();
      if (mounted.current && result.duplicate) setSelectedId(String(result.sourceId));
      ctx.refresh();
    } catch (error) {
      if (!mounted.current) return;
      setMessage({ type: 'error', text: error.message });
      if (error.status === 401) onError(error);
      if (error.status === 423) setUploadBlocked(true);
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function withdraw() {
    if (lock.current || !withdrawRow || !canUpload) return;
    lock.current = true; setBusy(true); setMessage(null);
    try {
      const result = resultOf(await api(`/report-core/certificates/${withdrawRow.id}/revoke`, { expectedRevision: withdrawRow.revision, reason: '学生本人撤回，准备重新上传' }));
      if (!mounted.current) return;
      setWithdrawRow(null); setSelectedId(null);
      setMessage({ type: 'success', text: result.requested ? '撤回申请已收到，请等待老师处理。' : '奖状已撤回，需要时可以重新上传。' });
      await load(); ctx.refresh();
    } catch (error) {
      if (!mounted.current) return;
      setWithdrawRow(null);
      setMessage({ type: 'error', text: error.status === 409 ? '这份奖状的状态已更新，请查看最新记录。' : error.message });
      if (error.status === 401) { setSelectedId(null); onError(error); }
      if (error.status === 409) await load();
      if (error.status === 423) setUploadBlocked(true);
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }

  const filtered = rows.filter(row => filter === 'all' || (filter === 'pending' ? activeStates.includes(row.status) : row.status === 'APPROVED'));
  const lastPage = Math.max(0, Math.ceil(filtered.length / 6) - 1), currentPage = Math.min(page, lastPage);
  const pendingCount = rows.filter(row => activeStates.includes(row.status)).length;
  const approvedCount = rows.filter(row => row.status === 'APPROVED').length;
  const recognized = selected && !['QUEUED', 'PROCESSING'].includes(selected.status);
  const canWithdraw = row => canUpload && activeStates.includes(row.status);

  return <div className="student-awards">
    <header className="student-awards-heading"><div><p className="student-awards-eyebrow">我的成长手账 / 荣誉篇</p><h1>上传奖状</h1></div><span className="student-awards-heading-icon"><UIIcon name="award"/></span></header>
    {message && <div className={`student-awards-feedback ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}><UIIcon name={message.type === 'error' ? 'report' : 'check'}/><span>{message.text}</span><button aria-label="关闭奖状提示" onClick={() => setMessage(null)}>×</button></div>}
    <div className="student-awards-columns">
      <section ref={uploader} className="student-awards-uploader" aria-labelledby="student-awards-upload-title">
        <div className="student-awards-section-title"><span className="student-awards-number">01</span><h2 id="student-awards-upload-title">上传我的奖状</h2></div>
        <p className="student-awards-upload-intro">姓名、荣誉名称和获奖内容要拍清楚哦。</p>
        <input ref={picker} className="student-awards-file" aria-label="奖状图片" type="file" accept="image/png,image/jpeg" disabled={busy || !canUpload} onChange={event => { chooseFiles(event.target.files); event.target.value = ''; }}/>
        {cameraOpen ? <AwardCamera onCancel={() => setCameraOpen(false)} onCapture={photo => { setCameraOpen(false); chooseFiles([photo]); }}/> : <div className={`student-awards-drop ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={event => { event.preventDefault(); if (canUpload && !busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); chooseFiles(event.dataTransfer.files); }}>
          {file && preview ? <><div className="student-awards-image-wrap"><img key={preview} src={preview} alt="待上传的奖状图片" onLoad={() => setImageReady(true)} onError={() => { setImageReady(false); setFileError('这张图片暂时无法打开，请重新选择清晰的PNG或JPEG图片。'); }}/><button className="student-awards-remove" aria-label="移除待上传图片" disabled={busy} onClick={() => { setFile(null); setFileError(''); setImageReady(false); }}>×</button></div><div className="student-awards-file-name"><strong>{file.name}</strong><small>{fileSize(file.size)}</small></div></> : <div className="student-awards-drop-empty"><span className="student-awards-upload-icon"><UIIcon name="upload"/></span><strong>让你的努力被看见</strong><p>点击选择，或把奖状图片拖到这里</p><small>PNG / JPEG · 每张不超过10MB</small></div>}
        </div>}
        <div className="student-awards-pick-actions"><button disabled={busy || !canUpload} onClick={() => { setCameraOpen(false); picker.current?.click(); }}>{file ? '重新选择图片' : '选择奖状图片'}</button><button className="student-awards-camera" disabled={busy || !canUpload || cameraOpen} onClick={() => { setFileError(''); setCameraOpen(true); }}>拍照上传</button></div>
        {fileError && <p className="student-awards-file-error" role="alert">{fileError}</p>}
        {closed ? <div className="student-awards-closed"><strong>本学期上传已结束</strong><span>仍然可以查看奖状和老师的评审结果。</span></div> : uploadBlocked ? <div className="student-awards-closed"><strong>当前暂不支持上传</strong><span>请稍后刷新，或联系老师确认学期状态。</span></div> : stateError ? <p role="alert" className="student-awards-file-error">{stateError}</p> : !termState ? <p className="student-awards-upload-hint" role="status">正在确认本学期上传时间…</p> : null}
        <button className="primary student-awards-submit" data-submit-student-award disabled={busy || !file || !imageReady || !canUpload || cameraOpen} onClick={submit}><UIIcon name="upload"/>{busy ? '正在提交…' : '提交奖状'}</button>

        <ol className="student-awards-mini-steps" aria-label="奖状提交步骤"><li><span>1</span>上传图片</li><li><span>2</span>系统识别</li><li><span>3</span>老师核对</li></ol>
      </section>
      <section className="student-awards-history" aria-labelledby="student-awards-history-title" aria-busy={loading}>
        <div className="student-awards-history-header"><div><h2 id="student-awards-history-title">我的获奖记录 <small>{rows.length} 份</small></h2></div><button aria-label="刷新获奖记录" className="student-awards-refresh" disabled={loading || busy} onClick={() => setReload(n => n + 1)}><span aria-hidden="true">↻</span>刷新</button></div>
        <div className="student-awards-tabs" aria-label="我的获奖状态">{[['all','全部记录',rows.length],['pending','进行中',pendingCount],['approved','已通过',approvedCount]].map(([id,label,count]) => <button key={id} aria-pressed={filter === id} disabled={busy} onClick={() => { setFilter(id); setPage(0); }}>{label}<span>{count}</span></button>)}</div>
        {listError ? <div className="student-awards-empty" role="alert"><h3>记录暂时没有打开</h3><p>{listError}</p><button onClick={() => setReload(n => n + 1)}>重新读取记录</button></div> : loading && !rows.length ? <div className="student-awards-empty" role="status">正在打开我的荣誉手账…</div> : !filtered.length ? <div className="student-awards-empty"><span className="student-awards-empty-medal"><UIIcon name="award"/></span><h3>{filter === 'all' ? '第一份荣誉，从这里开始' : '暂时没有这类记录'}</h3><p>{filter === 'all' ? '上传你获得的奖状，等老师核对后，就能留下属于你的荣誉记录。' : '可以切换到全部记录，看看其他奖状。'}</p></div> : <>
          <div className="student-awards-records">{filtered.slice(currentPage * 6, currentPage * 6 + 6).map(row => {
            const [label,tone] = statusOf(row), facts = row.payload.facts || {};
            return <article className={`student-awards-record ${tone}`} key={row.id} data-student-award-id={row.id}>
              <div className="student-awards-record-top"><span className="student-awards-record-medal"><UIIcon name="award"/></span><h3><button onClick={() => setSelectedId(String(row.id))}>{titleOf(row)}</button></h3><span className={`student-awards-status ${tone}`}>{label}</span></div>
              <div className="student-awards-record-facts"><span>{facts.awardRegion || '地域待核对'}</span><span>{facts.awardLevel || '级别待核对'}</span><span>{subjectLabel(facts.subjectCode)}</span></div>
              {row.status === 'FAILED' && <p className="student-awards-record-note">原图已收到，老师会帮助核对。</p>}
              {row.status === 'REJECTED' && row.payload.reviewReason && <p className="student-awards-record-note">老师的话：{row.payload.reviewReason}</p>}
              <div className="student-awards-record-actions"><button onClick={() => setSelectedId(String(row.id))}>查看详情 <span aria-hidden="true">↗</span></button>{canWithdraw(row) && <button disabled={busy} onClick={() => setWithdrawRow(row)}>撤回</button>}{canUpload && ['REJECTED','REVOKED'].includes(row.status) && <button disabled={busy} onClick={chooseAgain}>重新上传</button>}</div>
            </article>;
          })}</div>
          {lastPage > 0 && <div className="student-awards-pagination"><span>第 {currentPage + 1} / {lastPage + 1} 页</span><button aria-label="上一页获奖记录" disabled={busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><button aria-label="下一页获奖记录" disabled={busy || currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
        </>}
      </section>
    </div>
    <dialog className="student-awards-dialog" ref={detail} aria-labelledby="student-awards-detail-title" onCancel={event => { event.preventDefault(); if (!busy) setSelectedId(null); }}>
      {selected && <><header className="student-awards-dialog-header"><div><p className="student-awards-eyebrow">我的成长手账 / 荣誉篇</p><h2 id="student-awards-detail-title">我的奖状详情</h2></div><button aria-label="关闭奖状详情" disabled={busy} onClick={() => setSelectedId(null)}>×</button></header>
        <div className="student-awards-detail-body"><div className="student-awards-original"><div className="student-awards-original-label"><span>我上传的原件</span>{original && <a href={original} target="_blank" rel="noreferrer">放大查看 ↗</a>}</div>{originalError ? <div className="student-awards-original-empty" role="alert"><p>{originalError}</p><button onClick={() => setPreviewRetry(n => n + 1)}>重新加载原图</button></div> : !original ? <div className="student-awards-original-empty" role="status">正在打开奖状原图…</div> : selected.payload.mime === 'application/pdf' ? <object data={original} type="application/pdf" aria-label="历史奖状PDF"><a href={original} target="_blank" rel="noreferrer">打开奖状PDF</a></object> : <img src={original} alt="奖状原图"/>}</div>
          <div className="student-awards-detail-facts"><span className={`student-awards-status ${statusOf(selected)[1]}`}>{statusOf(selected)[0]}</span><h3>{titleOf(selected)}</h3><p>{selected.status === 'FAILED' ? '系统暂时没有识别完整，老师会依据原图人工核对，你不用填写信息。' : recognized ? '以下信息由系统识别，老师核对后确认。' : '系统正在识别图片中的获奖信息，完成后会交给老师核对。'}</p><dl>{[['title','荣誉名称'],['awardRegion','荣誉地域'],['awardLevel','荣誉级别'],['subjectCode','所属学科']].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{key === 'subjectCode' ? subjectLabel(selected.payload.facts?.[key]) : selected.payload.facts?.[key] || '待老师核对'}</dd></div>)}</dl>
            {['APPROVED','REJECTED'].includes(selected.status) && selected.payload.reviewReason && <div className="student-awards-teacher-note"><h4>老师的评审备注</h4><p>{selected.payload.reviewReason}</p></div>}
            <div className="student-awards-detail-progress"><span className="done">✓ 图片已上传</span><span className={recognized && selected.status !== 'REVOKED' ? 'done' : ''}>{recognized && selected.status !== 'REVOKED' ? '✓' : '2'} {selected.status === 'FAILED' ? '转交人工核对' : '系统识别'}</span><span className={selected.status === 'APPROVED' ? 'done' : ''}>{selected.status === 'APPROVED' ? '✓' : '3'} 老师评审</span></div>
          </div></div><footer className="student-awards-dialog-footer"><small>{selected.status === 'APPROVED' ? '这份荣誉，已收进你的成长记录。' : selected.status === 'REVOKED' ? '这份记录已撤回，需要时可以重新上传。' : '不用重复提交，可以在这里查看最新进度。'}</small><div>{canWithdraw(selected) && <button disabled={busy} onClick={() => setWithdrawRow(selected)}>撤回</button>}{canUpload && ['REJECTED','REVOKED'].includes(selected.status) && <button disabled={busy} onClick={chooseAgain}>重新上传</button>}<button className="primary" disabled={busy} onClick={() => setSelectedId(null)}>我知道了</button></div></footer></>}
    </dialog>
    <ConfirmDialog open={!!withdrawRow} title="撤回这张奖状？" busy={busy} onCancel={() => setWithdrawRow(null)} onConfirm={withdraw}><p>撤回后老师将不再评审这份记录，需要时可以重新上传。</p></ConfirmDialog>
  </div>;
}

export default function AwardUpload({ ctx }) {
  return ctx.catalog.schemaVersion === 'SIX_EDU_V2' ? <StudentAwards ctx={ctx}/> : <LegacyAwardUpload ctx={ctx}/>;
}
export { AwardUpload };
