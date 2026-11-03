import React, { useEffect, useState, useRef } from "react";
import { faceApi } from "./transport";
import FaceCapture from "./FaceCapture";
export default function FaceLogin({ username, onUsername, onLogin }) {
  const [ready, setReady] = useState(null),
    [challenge, setChallenge] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const controller = useRef(null),
    mounted = useRef(false);
  useEffect(() => {
    const c = (controller.current = new AbortController());
    mounted.current = true;
    faceApi("/auth/face/capabilities", undefined, undefined, c.signal)
      .then(setReady)
      .catch((e) => {
        if (e.name !== "AbortError") setReady({ available: false });
      });
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  async function start(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      setChallenge(
        await faceApi(
          "/auth/face/challenge",
          { username },
          undefined,
          controller.current?.signal,
        ),
      );
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(frames) {
    setBusy(true);
    try {
      const result = await faceApi(
        "/auth/face/login",
        { username, nonce: challenge.nonce, frames },
        undefined,
        controller.current?.signal,
      );
      if (mounted.current) onLogin(result);
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message);
      setChallenge(null);
    } finally {
      frames.length = 0;
      setBusy(false);
    }
  }
  return (
    <div className="face-login">
      <p className="face-intro">先填写账号，再由本人完成面部验证。</p>
      {challenge ? (
        <FaceCapture
          challenge={challenge}
          onCapture={submit}
          onCancel={() => {
            controller.current?.abort();
            controller.current = new AbortController();
            setChallenge(null);
            setBusy(false);
          }}
        />
      ) : (
        <form onSubmit={start}>
          <label>
            账号
            <input
              aria-label="人脸登录账号"
              autoComplete="username"
              required
              maxLength={80}
              value={username}
              onChange={(e) => onUsername(e.target.value)}
            />
          </label>
          <div className="face-welcome">
            <span aria-hidden="true">◎</span>
            <strong>让镜头认出你</strong>
            <p>首次使用，请先用密码登录并在账号中绑定人脸。</p>
          </div>
          {error && (
            <p role="alert" className="feedback error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy || !ready?.available}>
            {busy ? "正在验证…" : "开启摄像头"}
          </button>
          {!ready?.available && (
            <p role="status">
              {ready === null
                ? "正在准备人脸登录…"
                : "人脸登录暂不可用，请使用账号密码登录。"}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
