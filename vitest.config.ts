import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // 统计逻辑模块;lib/ipc.ts 是环境胶水(Tauri IPC / 浏览器 mock),
      // 由浏览器 E2E 覆盖(docs/TESTING.md 分层表),不计入门禁
      include: ["src/lib/types.ts", "src/state/**/*.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 80,
        branches: 60,
        functions: 70,
        lines: 80,
      },
    },
  },
});
