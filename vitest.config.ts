import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // 覆盖率门禁:阈值在批次 7 随测试补全收紧(当前仅报告不设限)
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/state/**/*.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
