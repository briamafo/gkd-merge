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

## 合并模式（sources.json5 里的 mergeMode）

| 模式 | 行为 | 适用 |
|---|---|---|
| `base-first`（当前） | 第一个启用的源=主体源，它覆盖的应用**只保留它自己的规则**；其他源只补充"主体源没有的应用"；**全局规则组也只保留主力的**（实测主力 3 个，其他源 13 个重复的跳过） | 产物瘦、GKD 里选项少（推荐） |
| `union` | 所有源同名组合并、规则跨源去重（覆盖最广但臃肿） | 想要最大覆盖面时 |

- 个别 App 主力源跳不干净 → 在 `supplementApps: ["包名"]` 里加回来，这些 App 会按 `union` 方式合并
- 换主体源：把它在 `sources` 里调到第一位即可

## 合并去重逻辑

- 按「应用包名 → 规则组名」聚合，同名规则组合并为一条
- 规则指纹去重（归一化后比对）：跨源、跨组名，重复规则丢弃；被清空的组删除
  - 归一化会剔除 `key`/`name`/`desc`/`snapshotUrls` 等纯标识字段，并统一选择器里的空格与引号风格
  - 因此"同一条规则被不同作者起了不同名字/编号"也能识别为重复
- 规则 key 唯一化（组内冲突用稳定哈希重分配）；规则组 key 用 `hash(应用+组名)` 稳定生成，跨版本不变
- 分类(categories)、全局规则组(globalGroups) 取并集
- 输出标准 JSON（合法 JSON5），写前自校验；4 个源并行拉取，全部失败回退本地缓存
- 内容无变化则沿用旧版本号（产物字节不变、不产生空提交）；有变化则版本号递增（Unix 分钟数，保证 < 2^31）

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
