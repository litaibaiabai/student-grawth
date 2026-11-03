export const cameraError = (e) =>
  ({
    NotAllowedError: "未获摄像头权限，请允许访问，或使用账号密码登录。",
    NotFoundError: "没有找到摄像头，请连接设备或使用密码登录。",
    NotReadableError: "摄像头被其他程序占用，请关闭后重试。",
    SecurityError: "摄像头需要安全连接，请使用HTTPS。",
  })[e.name] ||
  e.message ||
  "面部采集失败，请重试或使用密码登录。";
export const sampleTargets = (action) =>
  action === "TURN" ? [2, 3, 3, 2] : [3, 2, 3];
export const poseMatches = (action, stage, p) =>
  action === "TURN"
    ? [
        Math.abs(p.yaw) < 0.12,
        p.yaw < -0.16,
        p.yaw > 0.16,
        Math.abs(p.yaw) < 0.12,
      ][stage]
    : [
        Math.abs(p.yaw) < 0.12 && Math.max(p.blinkLeft, p.blinkRight) < 0.3,
        Math.min(p.blinkLeft, p.blinkRight) > 0.55,
        Math.abs(p.yaw) < 0.12 && Math.max(p.blinkLeft, p.blinkRight) < 0.3,
      ][stage];
export const posePrompt = (action, stage) =>
  action === "TURN"
    ? ["正对摄像头", "向画面左侧轻转头 ←", "向画面右侧轻转头 →", "回到正面"][
        stage
      ]
    : ["正对摄像头并睁眼", "轻闭双眼约1秒", "睁开双眼，正对摄像头"][stage];
