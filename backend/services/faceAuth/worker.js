const { spawn } = require("node:child_process"),
  path = require("node:path"),
  fs = require("node:fs");
class FaceWorker {
  constructor({
    python = process.env.FACE_AUTH_PYTHON ||
      path.resolve(__dirname, "../../private/face-venv/bin/python"),
    script = path.resolve(__dirname, "../../face_worker/worker.py"),
    modelDir = process.env.FACE_AUTH_MODEL_DIR ||
      path.resolve(__dirname, "../../private/face-models"),
    timeout = 20000,
  } = {}) {
    Object.assign(this, { python, script, modelDir, timeout });
    this.pending = 0;
    this.tail = Promise.resolve();
    this.next = 0;
  }
  ready() {
    if (this.starting) return this.starting;
    if (
      !fs.existsSync(this.python) ||
      !fs.existsSync(path.join(this.modelDir, "manifest.json"))
    )
      return Promise.reject(Error("人脸识别资源未安装"));
    this.starting = new Promise((resolve, reject) => {
      const child = (this.child = spawn(
        this.python,
        [this.script, this.modelDir],
        {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            PYTHONUNBUFFERED: "1",
            OMP_NUM_THREADS: "1",
            MPLCONFIGDIR: path.join(this.modelDir, "runtime-cache"),
          },
        },
      ));
      child.unref();
      child.stdin.unref?.();
      child.stdout.unref?.();
      child.stderr.unref?.();
      child.stderr.resume();
      let buffer = "";
      const timer = setTimeout(() => {
        this.reset();
        reject(Error("人脸识别初始化超时"));
      }, this.timeout);
      child.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        if (buffer.length > 16384) {
          this.reset();
          return;
        }
        let at;
        while ((at = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, at);
          buffer = buffer.slice(at + 1);
          let data;
          try {
            data = JSON.parse(line);
          } catch {
            this.reset();
            return;
          }
          if (data.ready === true) {
            clearTimeout(timer);
            resolve();
          } else if (this.active && data.id === this.active.id) {
            const a = this.active;
            this.active = null;
            clearTimeout(a.timer);
            data.error
              ? a.reject(Object.assign(Error(data.error), { status: 422 }))
              : a.resolve(data.result);
          }
        }
      });
      const failed = () => {
        clearTimeout(timer);
        if (this.child === child) this.reset();
        reject(Error("人脸识别服务暂不可用"));
      };
      child.once("error", failed);
      child.once("exit", failed);
      child.stdin.on("error", () => {});
    });
    return this.starting;
  }
  reset() {
    const child = this.child;
    this.child = null;
    this.starting = null;
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.reject(
        Object.assign(Error("人脸识别服务暂不可用"), { status: 503 }),
      );
      this.active = null;
    }
    child?.kill("SIGKILL");
  }
  async infer(input) {
    if (this.pending >= 3)
      throw Object.assign(Error("人脸验证繁忙，请稍后重试"), { status: 429 });
    this.pending++;
    const previous = this.tail;
    let release;
    this.tail = new Promise((r) => (release = r));
    try {
      await previous;
      await this.ready();
      return await new Promise((resolve, reject) => {
        const id = ++this.next,
          timer = setTimeout(() => this.reset(), this.timeout);
        this.active = { id, timer, resolve, reject };
        this.child.stdin.write(JSON.stringify({ id, ...input }) + "\n");
      });
    } finally {
      this.pending--;
      release();
    }
  }
  close() {
    this.reset();
  }
}
module.exports = { FaceWorker };
