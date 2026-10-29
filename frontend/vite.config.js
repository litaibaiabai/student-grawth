import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    sourcemap: true, // 确保此项为 true（Vite 4.0+，这也是默认值）
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:3000",
        changeOrigin: true
      },
      "/dev-api": {
        target: process.env.VITE_API_TARGET || "http://localhost:3000",
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
});
