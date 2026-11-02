import React, { useEffect, useRef, useState } from 'react';

export default function CameraScanner({ onResult, onCancel, onError }) {
  const video = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false, stream, frame, lastScan = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
    };
    const hidden = () => { if (document.hidden) onCancel(); };
    document.addEventListener('visibilitychange', hidden);
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('当前页面无法使用摄像头，请使用 HTTPS 打开，或粘贴卡片链接。');
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (cancelled) { stop(); return; }
        video.current.srcObject = stream;
        await video.current.play();
        const { default: decode } = await import('jsqr');
        if (cancelled) return;
        setReady(true);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const scan = time => {
          if (cancelled) return;
          const source = video.current;
          if (source?.readyState >= 2 && source.videoWidth && time - lastScan > 150) {
            lastScan = time;
            const scale = Math.min(1, 720 / source.videoWidth);
            canvas.width = Math.round(source.videoWidth * scale);
            canvas.height = Math.round(source.videoHeight * scale);
            context.drawImage(source, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const result = decode(pixels.data, pixels.width, pixels.height);
            if (result?.data) {
              stop();
              onResult(result.data);
              return;
            }
          }
          frame = requestAnimationFrame(scan);
        };
        frame = requestAnimationFrame(scan);
      } catch (error) {
        stop();
        if (cancelled) return;
        const messages = {
          NotAllowedError: '未获得摄像头权限，请在浏览器设置中允许使用摄像头后重试。',
          NotFoundError: '没有找到摄像头，请检查设备后重试，或粘贴卡片链接。',
          NotReadableError: '摄像头暂时无法使用，请关闭其他占用摄像头的应用后重试。',
        };
        onError(messages[error.name] || error.message || '摄像头启动失败，请重试。');
      }
    };
    start();
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', hidden); };
  }, [onResult, onCancel, onError]);
  return (
    <div className="claim-camera">
      <div className="claim-viewfinder">
        <video ref={video} autoPlay muted playsInline aria-label="摄像头扫码画面" />
        <div className="claim-scan-frame" aria-hidden="true"><i /></div>
        <p role="status">{ready ? '将卡片二维码放入框内' : '正在开启摄像头…'}</p>
      </div>
      <button type="button" onClick={onCancel}>取消扫描</button>
    </div>
  );
}
