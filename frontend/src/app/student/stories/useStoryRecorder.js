import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_MS = 300000;
const stopTracks = stream => stream?.getTracks().forEach(track => track.stop());
const clearTimers = session => { clearInterval(session?.interval); clearTimeout(session?.timeout); };

function microphoneError(error) {
  if (error.name === 'NotAllowedError') return '麦克风未授权，请在 Chrome 的网站设置中允许使用麦克风后重试。';
  if (error.name === 'NotFoundError') return '没有找到麦克风，请连接麦克风后重试。';
  if (error.name === 'NotReadableError') return '麦克风暂时无法使用，请关闭其他正在录音的应用后重试。';
  return error.message || '录音未能完成，请重新录音。';
}

export default function useStoryRecorder() {
  const [status, setStatus] = useState('idle'), [file, setFile] = useState(null);
  const [durationMs, setDurationMs] = useState(0), [error, setError] = useState('');
  const active = useRef(null), generation = useRef(0), mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const session = active.current;
      active.current = null;
      clearTimers(session);
      if (session?.recorder?.state === 'recording') session.recorder.stop();
      stopTracks(session?.stream);
    };
  }, []);

  const stop = useCallback(() => {
    const session = active.current;
    if (!session?.recorder || session.recorder.state !== 'recording') return;
    session.durationMs = Math.max(1, Math.min(MAX_MS, Math.round(performance.now() - session.startedAt)));
    clearTimers(session);
    setStatus('stopping');
    session.recorder.stop();
    stopTracks(session.stream);
  }, []);

  const start = useCallback(async () => {
    if (active.current || !mounted.current) return;
    const token = ++generation.current, session = { token, stream: null, recorder: null };
    active.current = session;
    setError(''); setStatus('requesting');
    try {
      if (!window.isSecureContext) throw Error('录音需要安全连接，请使用学校的 HTTPS 地址打开本页。');
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw Error('当前浏览器不能录音，请使用新版 Chrome 打开本页。');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || generation.current !== token || active.current !== session) { stopTracks(stream); return; }
      session.stream = stream;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      session.recorder = recorder;
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        if (active.current !== session) return;
        active.current = null;
        clearTimers(session); stopTracks(stream);
        if (recorder.state === 'recording') recorder.stop();
        if (mounted.current) { setStatus('idle'); setError('录音被中断，请重新录音。'); }
      };
      recorder.onstop = () => {
        clearTimers(session); stopTracks(stream);
        if (!mounted.current || active.current !== session || generation.current !== token) return;
        active.current = null;
        const type = recorder.mimeType || chunks[0]?.type || mime || 'audio/webm';
        const blob = new Blob(chunks, { type });
        if (!blob.size || blob.size > 20 * 1024 * 1024) {
          setStatus('idle'); setError(blob.size ? '录音超过20MiB，请录制一段较短的故事。' : '没有录到声音数据，请重新录音。'); return;
        }
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        setFile(new File([blob], `我的故事.${ext}`, { type }));
        setDurationMs(session.durationMs || Math.max(1, Math.min(MAX_MS, Math.round(performance.now() - session.startedAt))));
        setStatus('ready');
      };
      session.startedAt = performance.now();
      recorder.start();
      setFile(null); setDurationMs(0); setStatus('recording');
      session.interval = setInterval(() => {
        if (mounted.current && active.current === session) setDurationMs(Math.min(MAX_MS, Math.round(performance.now() - session.startedAt)));
      }, 250);
      session.timeout = setTimeout(stop, MAX_MS);
      stream.getAudioTracks().forEach(track => { track.onended = stop; });
    } catch (cause) {
      clearTimers(session); stopTracks(session.stream);
      if (!mounted.current || generation.current !== token) return;
      active.current = null;
      setStatus('idle'); setError(microphoneError(cause));
    }
  }, [stop]);

  const discard = useCallback(() => { setFile(null); setDurationMs(0); setError(''); setStatus('idle'); }, []);
  return { status, file, durationMs, error, start, stop, discard };
}
