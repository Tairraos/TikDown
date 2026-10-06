import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "safari15",
    // minify 恢复默认压缩(D5 决策:发布体积优先;调试走 dev 模式,无需保留未压缩产物)
    sourcemap: false,
  },
});
