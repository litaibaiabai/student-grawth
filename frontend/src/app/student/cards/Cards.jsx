import React, { useEffect, useState, useRef, useCallback } from "react";
import { api } from "../../core/api";
import CameraScanner from "./CameraScanner";
import "./cards.css";

export default function Cards({ ctx }) {
  const { error: onError } = ctx;
  const initial = () => {
    const match = location.hash.match(/[?&]card=([^&]+)/);
    return match
      ? decodeURIComponent(match[1])
      : sessionStorage.getItem('pendingCard') || '';
  };
  const [token, setToken] = useState(initial),
    [card, setCard] = useState(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [scanning, setScanning] = useState(false);
  const redeeming = useRef(false);
  const sequence = useRef(0);
  const normalize = useCallback((text) => {
    try {
      return decodeURIComponent(
        new URL(text).hash.match(/[?&]card=([^&]+)/)?.[1] || text,
      );
    } catch {
      return text.trim();
    }
  }, []);
  const read = useCallback(
    async (text) => {
      const request = ++sequence.current;
      setCard(null);
      setMessage('');
      setBusy(true);
      try {
        const result = await api('/report-core/cards/preview', {
          token: normalize(text),
        });
        if (request === sequence.current)
          setCard({ ...result, credential: normalize(text) });
      } catch (e) {
        if (request === sequence.current) {
          setMessage(e.message);
          if (e.status === 401) onError(e);
        }
      } finally {
        if (request === sequence.current) setBusy(false);
      }
    },
    [normalize, onError],
  );
  const bootToken = useRef(token),
    invalidate = useCallback(() => {
      sequence.current++;
    }, []);
  useEffect(() => {
    if (bootToken.current) read(bootToken.current);
    return invalidate;
  }, [read, invalidate]);
  const change = useCallback((text) => {
    sequence.current++;
    setBusy(false);
    setToken(text);
    setCard(null);
    setMessage('');
    if (text) sessionStorage.setItem('pendingCard', text);
    else sessionStorage.removeItem('pendingCard');
  }, []);
  const cancelScan = useCallback(() => setScanning(false), []);
  const scanError = useCallback((message) => { setScanning(false); setMessage(message); }, []);
  const scanned = useCallback((text) => {
    setScanning(false);
    change(text);
    read(text);
  }, [change, read]);
  const category = ctx.catalog.cardCatalog.find(
    (c) => c.code === card?.category,
  );
  return (
    <section className="panel claim-card">
      <p className="kicker">小小卡片 · 大大进步</p>
      <h2>领取积分</h2>
      <p className="claim-intro">扫描老师发放的积分卡，确认后计入对应学科的过程表现。</p>
      <ol className="claim-steps" aria-label="领分步骤">
        <li className={!card ? 'active' : ''}><span>1</span>扫描二维码</li>
        <li className={card ? 'active' : ''}><span>2</span>核对编码</li>
        <li><span>3</span>确认加分</li>
      </ol>
      {scanning ? <CameraScanner onResult={scanned} onCancel={cancelScan} onError={scanError} /> : (
        <button className={card ? "claim-rescan" : "claim-scan-button"} aria-label={card ? "重新扫描" : "扫一扫"} disabled={busy} onClick={() => { change(''); setScanning(true); }}>
          {!card && <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path d="M23 10H12a2 2 0 0 0-2 2v11m31-13h11a2 2 0 0 1 2 2v11M10 41v11a2 2 0 0 0 2 2h11m18 0h11a2 2 0 0 0 2-2V41M6 32h52" />
            <path d="M21 20h7v7h-7zm15 0h7v7h-7zM21 38h7v7h-7zm15 0h7v7h-7z" strokeWidth="2" />
          </svg>}
          <strong>{card ? "重新扫描" : "扫一扫"}</strong>
          {!card && <span>点击开启摄像头，扫描卡片二维码</span>}
        </button>
      )}
      {!scanning && <details className="claim-manual">
        <summary>无法扫码？粘贴卡片链接</summary>
        <label>卡片链接或凭证
          <input aria-label="卡片凭证" value={token} disabled={busy} onChange={e => change(e.target.value)} placeholder="把卡片链接粘贴到这里" />
        </label>
        <button disabled={busy || !token.trim()} onClick={() => read(token)}>{busy ? '正在读取…' : '读取卡片'}</button>
      </details>}
      {busy && !card && <p role="status">正在核对卡片信息…</p>}
      {card && (
        <div className="claim-preview">
          <span className="claim-star" aria-hidden="true">
            ★
          </span>
          <div>
            <h3>已识别积分卡 <span className="claim-points">+1 分</span></h3>
            <dl className="claim-code"><dt>二维码编码</dt><dd>{card.credential}</dd><dt>卡片编号</dt><dd>{card.id}</dd></dl>
            <p>
              {card.grade}年级{card.classNo}班 ·{' '}
              {category
                ? `${category.group} · ${category.item}`
                : '已确定评价方向'}
            </p>
            <small>
              卡片状态：
              {({
                UNUSED: '待领取',
                USED: '已领取',
                VOID: '已作废',
                EXPIRED: '已过期',
              })[card.status] || card.status}
            </small>
          </div>
        </div>
      )}
      {message && <p role="alert">{message}</p>}
      {card && <div className="self-save">
        <button
          className="primary"
          disabled={!card || busy || scanning || card.status !== 'UNUSED'}
          onClick={async () => {
            if (redeeming.current) return;
            redeeming.current = true;
            const selected = card;
            setBusy(true);
            try {
              await api('/report-core/cards/redeem', {
                token: selected.credential,
              });
              change('');
              ctx.refresh();
              ctx.notify(`领取成功，${category?.item || '对应过程表现'}已加 1 分`);
            } catch (e) {
              setMessage(e.message);
              if (e.status === 401) onError(e);
            } finally {
              redeeming.current = false;
              setBusy(false);
            }
          }}
        >
          {busy && card ? '正在加分…' : '确认加分'}
        </button>
      </div>}
    </section>
  );
}
export { Cards };
