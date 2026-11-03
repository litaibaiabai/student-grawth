import React, { useEffect, useState, useRef } from "react";
import { faceApi } from "./transport";
import FaceCapture from "./FaceCapture";
import "./face.css";
export default function FaceSettings({ onClose }) {
  const [state, setState] = useState(null),
    [password, setPassword] = useState(""),
    [consent, setConsent] = useState(false),
    [challenge, setChallenge] = useState(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const dialog = useRef(null),
    controller = useRef(null),
    mounted = useRef(false);
  const load = () =>
    faceApi("/me/face", undefined, undefined, controller.current?.signal).then(
      (v) => {
        if (mounted.current) setState(v);
      },
    );
  useEffect(() => {
    const focus = document.activeElement;
    dialog.current?.focus();
    const c = (controller.current = new AbortController());
    mounted.current = true;
    faceApi("/me/face", undefined, undefined, c.signal)
      .then(setState)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => {
      mounted.current = false;
      controller.current?.abort();
      focus?.focus();
    };
  }, []);
  async function begin(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setChallenge(
        await faceApi(
          "/me/face/challenge",
          { password, consent },
          undefined,
          controller.current?.signal,
        ),
      );
      setPassword("");
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(frames) {
    setBusy(true);
    try {
      await faceApi(
        "/me/face",
        { nonce: challenge.nonce, frames },
        "PUT",
        controller.current?.signal,
      );
      setChallenge(null);
      setMessage("人脸已绑定，可在登录页选择人脸登录。");
      await load();
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message);
      setChallenge(null);
    } finally {
      frames.length = 0;
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await faceApi(
        "/me/face",
        { password },
        "DELETE",
        controller.current?.signal,
      );
      setPassword("");
      setConsent(false);
      setMessage("人脸已解绑，账号密码登录仍可使用。");
      await load();
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function keydown(e) {
    if (e.key === "Escape") onClose();
    if (e.key === "Tab") {
      const items = [
        ...dialog.current.querySelectorAll(
          "button:not(:disabled),input:not(:disabled)",
        ),
      ];
      if (!items.length) return;
      if (
        e.shiftKey &&
        (document.activeElement === items[0] ||
          document.activeElement === dialog.current)
      ) {
        e.preventDefault();
        items.at(-1).focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === items.at(-1) ||
          document.activeElement === dialog.current)
      ) {
        e.preventDefault();
        items[0].focus();
      }
    }
  }
  return (
    <div className="face-modal-shade">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="face-settings-title"
        className="face-settings panel"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={keydown}
      >
        <header>
          <div>
            <p className="kicker">本人验证 · 自愿开启</p>
            <h2 id="face-settings-title">人脸登录设置</h2>
          </div>
          <button type="button" aria-label="关闭人脸设置" onClick={onClose}>
            ×
          </button>
        </header>
        {message && (
          <p role="status" className="feedback">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="feedback error">
            {error}
          </p>
        )}
        {challenge ? (
          <FaceCapture
            challenge={challenge}
            onCapture={save}
            onCancel={() => {
              controller.current?.abort();
              controller.current = new AbortController();
              setChallenge(null);
              setBusy(false);
            }}
          />
        ) : (
          <form onSubmit={begin}>
            <p>
              {state?.enrolled
                ? "已绑定人脸。重新录入将替换当前模板。"
                : "尚未绑定。先验证当前密码，再由本人完成采集。"}
            </p>
            {state?.enrolledAt && (
              <p className="face-intro">
                绑定时间：
                {new Date(state.enrolledAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                })}
              </p>
            )}
            <p className="face-privacy">
              面部图像仅在本次验证时处理，不保存照片；人脸特征经独立密钥加密保存在本校系统。你可以随时解绑，密码登录始终保留。
            </p>
            <label>
              当前密码
              <input
                type="password"
                aria-label="人脸设置当前密码"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="face-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              我同意采集本人人脸特征，用于此账号登录。
            </label>
            {state && !state.available && (
              <p role="status">
                人脸验证暂不可用，仍可使用密码或解除已有绑定。
              </p>
            )}
            <div className="actions">
              <button
                className="primary"
                disabled={busy || !consent || !state?.available}
              >
                {state?.enrolled ? "验证密码并重新录入" : "验证密码并开始录入"}
              </button>
              {state?.enrolled && (
                <button
                  type="button"
                  disabled={busy || !password}
                  onClick={remove}
                >
                  验证密码并解绑
                </button>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
