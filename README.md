# GKD 订阅合并工具

把多个 GKD 订阅合并去重成一个订阅文件 `dist/merged_gkd.json5`，手机端只订阅这一个链接即可。

## 日常使用（三步）

1. **增减订阅源**：编辑 `sources.json5`
   - 加一个源 = 复制一段 `{ id, name, url, fallbacks, enabled }` 改掉即可
   - 不想用某个源 = 把它的 `enabled` 改成 `false`
2. **合并**：双击 `update.cmd`（或命令行 `node merge.mjs`）
3. **手机更新**：GKD 的订阅会自动拉取最新文件；也可在订阅页手动下拉刷新

## 目录结构

```
gkd-merge/
├── sources.json5   <- 订阅源配置（唯一需要日常编辑的文件）
├── merge.mjs       <- 合并脚本（无需改动）
├── update.cmd      <- Windows 一键合并
├── sources/        <- 各源缓存（自动生成）
└── dist/
    └── merged_gkd.json5   <- 合并产物（手机订阅这个）
```

## 合并去重逻辑

- 按「应用包名 → 规则组名」聚合，同名规则组合并为一条
- 组内规则按完整指纹（键排序序列化）去重，不会丢规则
- 分类(categories)取并集；规则组 key 重新编号保证合法
- 输出为标准 JSON（合法的 JSON5），GKD 可直接解析
- 运行结束会打印去重统计，并自校验输出文件

## 日常自动更新方案（三选一）

### 方案 A：GitHub Actions 自动更新（推荐，全免费）

1. 把整个 `gkd-merge` 目录推到一个 GitHub 仓库（`.github/workflows/update.yml` 已备好）
2. Actions 每天北京时间 09:00 自动拉源 → 合并 → 提交
3. 手机 GKD 添加订阅链接（二选一，国内可用镜像）：

```
https://ghproxy.net/https://raw.githubusercontent.com/<你的用户名>/<仓库名>/main/dist/merged_gkd.json5
https://cdn.jsdelivr.net/gh/<你的用户名>/<仓库名>@main/dist/merged_gkd.json5
```

### 方案 B：WorkBuddy 发布在线链接（无 GitHub）

用 WorkBuddy「发布为应用」把 `dist` 目录发布成在线链接，手机订阅该链接；
再建一个每天定时运行的 WorkBuddy 自动化：执行 `node merge.mjs` 后重新发布。

### 方案 C：纯本地

直接把 `dist/merged_gkd.json5` 传到手机，GKD 里通过本地订阅/文件导入；
之后每次 `update.cmd` 后重新传输（最麻烦，不推荐）。

## 订阅源维护状态（2026-09 核实）

| 源 | 状态 | 默认 |
|---|---|---|
| aoguai（默认订阅） | 活跃维护 | ✅ 开 |
| 甘霖 ganlinte | 活跃维护 | ✅ 开 |
| 梦念逍遥 | 活跃维护（补充型） | ✅ 开 |
| Lin-arm (id667) | 活跃维护，规模最大（977 应用） | ✅ 开 |

判断某个源是否还活着：看仓库最近提交时间，或订阅文件里的 `version` 是否还在涨。
曾经主流的 Adpro / AIsouler / GKD 官方订阅均已停止维护，如需找回可在 git 历史里查 `sources.json5` 的旧地址。
