# 文档索引

> `docs/` 是本项目的记录系统。本索引由文档门禁（`npm run gate:docs`）校验：死链即失败。
> 状态标注约定：**常驻**=日常开发依赖；**规格**=产品行为来源；**计划**=时效性工件。

## 入口

| 文档 | 角色 | 状态 |
|---|---|---|
| [../AGENTS.md](../AGENTS.md) | 智能体/新人入口地图（≤200 行） | 常驻 |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | 架构与依赖方向白名单 | 常驻 |
| [../README.md](../README.md) | 对外项目说明 | 常驻 |

## 设计与产品

| 文档 | 角色 | 状态 |
|---|---|---|
| [design-docs/index.md](design-docs/index.md) | 设计文档索引 | 常驻 |
| [design-docs/core-beliefs.md](design-docs/core-beliefs.md) | 第一性原则（争议裁决依据） | 常驻 |
| [design-docs/platform-harness-research.md](design-docs/platform-harness-research.md) | yt-dlp 选型实测报告 | 常驻（依据，按需复核） |
| [product-specs/index.md](product-specs/index.md) | 产品规格索引 | 规格 |
| [product-specs/product-overview.md](product-specs/product-overview.md) | 产品概述与设置项 | 规格 |
| [product-specs/cookie-access.md](product-specs/cookie-access.md) | Cookie 获取方法设计 | 规格 |

## 工程与质量

| 文档 | 角色 | 状态 |
|---|---|---|
| [CI.md](CI.md) | 框架判定、CI 决策与发布链路 | 常驻 |
| [QUALITY_SCORE.md](QUALITY_SCORE.md) | 分域质量评分 | 常驻 |
| [GATES.md](GATES.md) | 门禁清单（每项：触发/失败含义/修复指引） | 常驻（阶段 3 建立） |
| [TESTING.md](TESTING.md) | 测试策略与分层 | 常驻（阶段 5 建立） |
| [exec-plans/tech-debt-tracker.md](exec-plans/tech-debt-tracker.md) | 技术债台账 | 常驻 |
| [exec-plans/active/](exec-plans/active/) | 进行中的执行计划 | 计划 |
| [exec-plans/completed/](exec-plans/completed/) | 已完成计划与归档 | 计划 |
| [HARNESS-RULES.md](HARNESS-RULES.md) | 本次改造的施工图（竣工后按 §14 归档） | 施工期 |
