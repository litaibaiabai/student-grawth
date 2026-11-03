import React, { useEffect, useRef, useState } from "react";
import {
  cameraError,
  sampleTargets,
  poseMatches,
  posePrompt,
} from "./captureModel";
import { createCaptureLease } from "./captureLease";
import "./face.css";
export default function FaceCapture({ challenge, onCapture, onCancel }) {
  const video = useRef(null),
    callbacks = useRef({ onCapture, onCancel });
  callbacks.current = { onCapture, onCancel };
  const [hint, setHint] = useState("正在开启摄像头…"),
    [error, setError] = useState(""),
    [stage, setStage] = useState(0);
  const { nonce, action, expiresAt } = challenge;
  useEffect(() => {
    let cancelled = false,
      stream,
      model,
      raf,
      lease,
      last = 0,
      lastSample = 0,
      phase = 0,
      count = 0;
    const frames = [];
    const stop = () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      lease?.close();
      frames.length = 0;
    };
    const fail = (e) => {
      setError(cameraError(e));
      stop();
    };
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw Error("当前页面无法使用摄像头，请使用HTTPS或密码登录。");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });
        if (!lease.useStream(stream)) return;
        video.current.srcObject = stream;
        await video.current.play();
        const { FaceLandmarker, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );
        const files = await FilesetResolver.forVisionTasks("/face-models/wasm");
        if (cancelled) return;
        model = await FaceLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: "/face-models/face_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 2,
          outputFaceBlendshapes: true,
        });
        if (!lease.useModel(model)) return;
        const canvas = document.createElement("canvas"),
          ctx = canvas.getContext("2d", { willReadFrequently: true }),
          targets = sampleTargets(action);
        const tick = async (time) => {
          if (cancelled) return;
          try {
            if (time - last < 100 || video.current.readyState < 2) {
              raf = requestAnimationFrame(tick);
              return;
            }
            last = time;
            if (Date.now() >= expiresAt)
              throw Error("采集已超时，请重新开始。");
            canvas.width = 64;
            canvas.height = 48;
            ctx.drawImage(video.current, 0, 0, 64, 48);
            const light = ctx.getImageData(0, 0, 64, 48).data;
            let mean = 0;
            for (let i = 0; i < light.length; i += 16)
              mean += (light[i] + light[i + 1] + light[i + 2]) / 3;
            mean /= light.length / 16;
            if (mean < 55 || mean > 235) {
              setHint("光照不足或过强，请调整面前光线");
              raf = requestAnimationFrame(tick);
              return;
            }
            const result = model.detectForVideo(video.current, time);
            if (result.faceLandmarks.length !== 1) {
              setHint(
                result.faceLandmarks.length
                  ? "请只保留一张人脸"
                  : "未检测到人脸，请正对摄像头",
              );
              raf = requestAnimationFrame(tick);
              return;
            }
            const points = result.faceLandmarks[0],
              blink = Object.fromEntries(
                result.faceBlendshapes[0].categories.map((c) => [
                  c.categoryName,
                  c.score,
                ]),
              );
            const p = {
              yaw:
                (points[1].x - (points[33].x + points[263].x) / 2) /
                Math.max(0.01, Math.abs(points[33].x - points[263].x)),
              blinkLeft: blink.eyeBlinkLeft,
              blinkRight: blink.eyeBlinkRight,
            };
            setHint(posePrompt(action, phase));
            if (poseMatches(action, phase, p) && time - lastSample > 250) {
              lastSample = time;
              const source = video.current,
                scale = Math.min(
                  1,
                  640 / Math.max(source.videoWidth, source.videoHeight),
                );
              canvas.width = Math.round(source.videoWidth * scale);
              canvas.height = Math.round(source.videoHeight * scale);
              ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
              const pixels = ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
              ).data;
              let brightness = 0;
              for (let i = 0; i < pixels.length; i += 64)
                brightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
              brightness /= Math.ceil(pixels.length / 64);
              if (brightness < 55 || brightness > 235) {
                setHint("光照不足或过强，请调整面前光线");
                raf = requestAnimationFrame(tick);
                return;
              }
              frames.push(canvas.toDataURL("image/jpeg", 0.8));
              if (++count >= targets[phase]) {
                phase++;
                count = 0;
                setStage(phase);
              }
              if (phase === targets.length) {
                const submitted = frames.slice();
                stop();
                setHint("采集完成，正在验证…");
                await callbacks.current.onCapture(submitted);
                return;
              }
            }
            raf = requestAnimationFrame(tick);
          } catch (e) {
            fail(e);
          }
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        if (!cancelled) fail(e);
        else lease?.close();
      }
    }
    lease = createCaptureLease(expiresAt - Date.now(), () =>
      fail(Error("采集超时，请重试或使用密码登录。")),
    );
    start();
    return stop;
  }, [nonce, action, expiresAt]);
  return (
    <section className="face-capture" aria-label="人脸采集">
      <div className="face-view">
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          aria-label="人脸摄像头画面"
        />
        <div className="face-oval" />
        <span className="face-live-dot">仅用于本次验证</span>
      </div>
      <div className="face-progress" aria-label="采集进度">
        {sampleTargets(action).map((_, i) => (
          <i className={i < stage ? "done" : ""} key={i} />
        ))}
      </div>
      <p role={error ? "alert" : "status"}>{error || hint}</p>
      <button type="button" onClick={() => callbacks.current.onCancel()}>
        {error ? "返回重试" : "取消采集"}
      </button>
    </section>
  );
}
