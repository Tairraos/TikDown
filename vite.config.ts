import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  // 构建时注入 package.json 版本(顶栏品牌展示;出包前必 bump,故恒为最新)
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
