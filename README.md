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
├── update.cmd      <- Windows 一键合并（本地手动更新用）
├── sync.cmd        <- 一键提交并推送 GitHub（本地强制覆盖远端）
├── sources/        <- 各源缓存（自动生成，不入库）
└── dist/
    └── merged_gkd.json5   <- 合并产物（手机订阅这个）
```

## 合并去重逻辑

- 按「应用包名 → 规则组名」聚合，同名规则组合并为一条
- 跨组规则去重：同一 App 下，指纹完全相同的规则（跨源、跨组名）只保留第一次出现的（按源优先级，Lin-arm 最优先），被清空的组删除
- 分类(categories)取并集；规则组 key 重新编号保证合法
- 输出为标准 JSON（合法的 JSON5），GKD 可直接解析，输出前自校验
- 4 个源并行拉取，全部失败时回退用上次的本地缓存

## 日常自动更新方案（三选一）

### 方案 A：GitHub Actions 自动更新（当前使用中）

- 仓库：https://github.com/briamafo/gkd-merge
- Actions 每天北京时间 9:00 / 15:00 / 21:00 自动拉源 → 合并 → 提交 → 刷新 jsDelivr 缓存
- 手机 GKD 订阅链接（推荐 ghproxy，无缓存问题）：

```
https://ghproxy.net/https://raw.githubusercontent.com/briamafo/gkd-merge/main/dist/merged_gkd.json5
```

备用（jsDelivr，最长 12h 缓存，Actions 每次推送后会自动清）：

```
https://cdn.jsdelivr.net/gh/briamafo/gkd-merge@main/dist/merged_gkd.json5
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
