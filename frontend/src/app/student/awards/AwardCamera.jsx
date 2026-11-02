import React, { useEffect, useRef, useState } from 'react';

export default function AwardCamera({ onCapture, onCancel }) {
  const video = useRef(null), stopCamera = useRef(() => {}), alive = useRef(false), capturing = useRef(false);
  const handlers = useRef({ onCapture, onCancel });
  handlers.current = { onCapture, onCancel };
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [shooting, setShooting] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false, stream;
    alive.current = true;
    setReady(false); setError('');
    const stop = () => stream?.getTracks().forEach(track => track.stop());
    stopCamera.current = stop;
    const hidden = () => { if (document.hidden) handlers.current.onCancel(); };
    document.addEventListener('visibilitychange', hidden);
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Error('当前页面无法使用摄像头，请通过HTTPS或本机地址打开，或使用“选择奖状图片”。');
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        if (cancelled) { stop(); return; }
        video.current.srcObject = stream;
        await video.current.play();
        if (cancelled) { stop(); return; }
        setReady(video.current.readyState >= 2 && video.current.videoWidth > 0);
      } catch (failure) {
        stop();
        if (cancelled) return;
        const messages = {
          NotAllowedError: '未获得摄像头权限，请在浏览器设置中允许使用摄像头后重试。',
          NotFoundError: '没有找到摄像头，请连接摄像头，或使用“选择奖状图片”。',
          NotReadableError: '摄像头暂时无法使用，请关闭其他占用摄像头的应用后重试。',
          SecurityError: '摄像头访问受限，请通过HTTPS或本机地址打开页面。',
        };
        setError(messages[failure.name] || failure.message || '摄像头启动失败，请重试。');
      }
    };
    start();
    return () => {
      cancelled = true; alive.current = false; stop();
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [attempt]);

  function capture() {
    if (!ready || capturing.current) return;
    const source = video.current;
    if (!source?.videoWidth || !source.videoHeight) { setError('摄像头画面还没有准备好，请稍后再试。'); return; }
    capturing.current = true; setShooting(true); setError('');
    const canvas = document.createElement('canvas');
    canvas.width = source.videoWidth; canvas.height = source.videoHeight;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw Error('无法生成照片，请重新拍摄。');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      stopCamera.current(); setReady(false);
      canvas.toBlob(blob => {
        capturing.current = false;
        if (!alive.current) return;
        setShooting(false);
        if (!blob) { setError('照片没有生成成功，请重新开启摄像头后拍摄。'); return; }
        handlers.current.onCapture(new File([blob], '奖状拍照.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.94);
    } catch (failure) {
      stopCamera.current(); capturing.current = false; setShooting(false); setReady(false); setError(failure.message);
    }
  }
  return <div className="student-award-camera">
    <div className="student-award-camera-view"><video ref={video} autoPlay muted playsInline aria-label="奖状拍照画面" onLoadedData={() => { if (alive.current) setReady(true); }}/><div className="student-award-camera-frame" aria-hidden="true"/>{!error && <p role="status">{shooting ? '正在生成照片…' : ready ? '请把整张奖状放入画面' : '正在开启摄像头…'}</p>}</div>
    {error && <div className="student-award-camera-error" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(n => n + 1)}>重新开启摄像头</button></div>}
    <div className="student-award-camera-actions"><button type="button" onClick={() => handlers.current.onCancel()}>取消拍照</button><button type="button" className="primary" data-capture-award disabled={!ready || shooting || !!error} onClick={capture}>{shooting ? '正在生成…' : '拍摄奖状'}</button></div>
  </div>;
}
