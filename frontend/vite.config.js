import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const configureProxy = proxy => {
  proxy.on("error", (_error, _request, response) => {
    if (response.headersSent || response.destroyed) return;
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      code: "BACKEND_UNAVAILABLE",
      message: "无法连接后端服务，请检查后端是否启动，以及 VITE_API_TARGET 的端口配置。",
    }));
  });
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "VITE_");
  const target = process.env.VITE_API_TARGET || env.VITE_API_TARGET || "http://127.0.0.1:3000";
  return {
  server: {
    sourcemap: true, // 确保此项为 true（Vite 4.0+，这也是默认值）
    proxy: {
      "/api": {
        target,
        configure: configureProxy,
        changeOrigin: true
      },
      "/dev-api": {
        target,
        configure: configureProxy,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dev-api/, "")
      }
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@app": path.resolve(__dirname, "src/app"),
      "@util": path.resolve(__dirname, "src/util"),
      "@constant": path.resolve(__dirname, "src/constant"),
      "@component": path.resolve(__dirname, "src/component"),
    }
  },
  build: {
    rollupOptions: {
      output: {
        // 1. 配置JS文件（入口文件和代码分割块）都输出到 js 目录
        entryFileNames: "js/[name]-[hash].js",
        chunkFileNames: "js/[name]-[hash].js",

        // 2. 配置非JS资源（CSS、图片等），使用函数进行细分
        assetFileNames: (assetInfo) => {
          const fileName = assetInfo.name || "";

          // 将CSS文件输出到 css 目录
          if (fileName.endsWith(".css")) {
            return "css/[name]-[hash][extname]";
          }

          // 定义图片类型，输出到 images 目录
          const imgExts = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];
          if (imgExts.some((ext) => fileName.endsWith(ext))) {
            return "images/[name]-[hash][extname]";
          }

          // 其他资源类型，例如字体文件
          const fontExts = [".woff", ".woff2", ".ttf", ".eot"];
          if (fontExts.some((ext) => fileName.endsWith(ext))) {
            return "fonts/[name]-[hash][extname]";
          }

          // 其他未匹配的资源默认放到 assets 目录
          return "assets/[name]-[hash][extname]";
        }
      }
    }
  }
  };
});
