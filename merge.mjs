// GKD 订阅合并去重工具
// 用法: node merge.mjs  (在 gkd-merge 目录下运行)
// 输出: dist/merged_gkd.json5
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSON5 from "json5";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(__dirname, "sources");
const DIST_DIR = join(__dirname, "dist");

// 订阅源配置在 sources.json5 中维护(增删订阅/开关只需改那个文件)
const CONFIG = JSON5.parse(readFileSync(join(__dirname, "sources.json5"), "utf8"));

// ---------- 稳定序列化(键排序) 用于指纹 ----------
function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

// ---------- FNV-1a 哈希 -> 稳定正整数 key ----------
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeKeyPicker() {
  const used = new Set();
  return (seed) => {
    let k = hash32(seed) % 2000000000;
    while (used.has(k)) k = (k + 1) % 2000000000;
    used.add(k);
    return k;
  };
}

// ---------- 规则归一化与指纹 ----------
// 不同作者的写法差异: 规则名(name)、key 编号、快照链接、选择器里的空格/引号风格
// 这些差异不影响实际点击行为 -> 计算指纹时统一剔除/归一, 输出时仍保留原始规则(首现者)
// 注意: 只做"文本层归一", 不做语义层等价判断(两条写法完全不同的规则是否点同一个按钮, 无法可靠自动判定)
const RULE_META_FIELDS = new Set(["key", "name", "desc", "snapshotUrls", "exampleUrls", "sr", "comment", "tags"]);
function normalizeSelector(v) {
  if (Array.isArray(v)) return v.map(normalizeSelector);
  if (typeof v !== "string") return v;
  return v.replace(/\s+/g, " ").trim().replace(/'([^']*)'/g, '"$1"');
}
function normalizeRule(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return r;
  const out = {};
  for (const k of Object.keys(r).sort()) {
    if (RULE_META_FIELDS.has(k)) continue;
    const v = r[k];
    out[k] = k === "matches" || k === "excludeMatches" || k === "anyMatches" ? normalizeSelector(v) : v;
  }
  return out;
}
function ruleFingerprint(r) {
  return stableStringify(normalizeRule(r));
}

// ---------- 可选瘦身: 去掉展示型元数据(快照链接), 约省 15% 体积 ----------
// GKD 运行时不需要 snapshotUrls/exampleUrls(仅用于查看规则快照)
// 在 sources.json5 顶层加 stripRuleMeta: true 即可开启, 默认关闭
const STRIP_RULE_META = CONFIG.stripRuleMeta === true;
function stripRuleMeta(r) {
  if (!STRIP_RULE_META || !r || typeof r !== "object" || Array.isArray(r)) return r;
  if (r.snapshotUrls === undefined && r.exampleUrls === undefined) return r;
  const { snapshotUrls, exampleUrls, ...rest } = r;
  return rest;
}

// ---------- 规则 key 唯一化 ----------
// 各源的规则 key 都是各自从 0 编号的, 合并到同一组会撞车(重复 key 会导致 GKD 解析/校验失败)
// 策略: 保留首次出现的 key, 冲突的用「作用域+规则指纹」哈希生成稳定 key
function ensureUniqueRuleKeys(scope, rules) {
  if (!Array.isArray(rules)) return rules;
  const seen = new Set();
  return rules.map((r) => {
    if (!r || typeof r !== "object" || r.key === undefined) return r;
    if (!seen.has(r.key)) {
      seen.add(r.key);
      return r;
    }
    let k = hash32(scope + "|" + stableStringify(r)) % 2000000000;
    while (seen.has(k)) k = (k + 1) % 2000000000;
    seen.add(k);
    return { ...r, key: k };
  });
}

// ---------- 下载(带重试/备用地址/缓存) ----------
async function fetchSource(src) {
  const cachePath = join(SOURCES_DIR, `${src.id}.json5`);
  const urls = [...new Set([src.url, ...src.fallbacks, src.url, ...src.fallbacks])]; // 每个地址重试一次
  for (const u of urls) {
    try {
      const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const text = buf.toString("utf8");
      JSON5.parse(text); // 先验证再写缓存
      writeFileSync(cachePath, text);
      return { src, text, fromCache: false };
    } catch (e) {
      console.log(`  [${src.id}] 下载失败 ${u} -> ${e.message}`);
    }
  }
  if (existsSync(cachePath)) {
    const ageH = (Date.now() - statSync(cachePath).mtimeMs) / 3600000;
    console.log(`  [${src.id}] 使用本地缓存 (${ageH.toFixed(1)}h 前)${ageH > 48 ? "  ⚠️ 缓存超过48小时, 规则可能过期" : ""}`);
    return { src, text: readFileSync(cachePath, "utf8"), fromCache: true };
  }
  return null;
}

// ---------- 合并 ----------
function mergeAll(subs) {
  const stats = { apps: 0, groupsRaw: 0, groupsOut: 0, rulesRaw: 0, rulesOut: 0, dupGroups: 0, dupRules: 0, globalRaw: 0, globalOut: 0, appsBase: 0, appsSupplement: 0, skippedShared: 0 };
  // 主体优先模式: 第一个启用的源 = 主体源, 它覆盖的应用只保留它自己的规则(不合入其他源的写法),
  // 其他源只补充"主体源没有的应用", 这样产物更瘦、GKD 里选项更少
  const baseFirst = CONFIG.mergeMode === "base-first";
  const baseAppIds = baseFirst && subs.length ? new Set((subs[0].apps || []).map((a) => a.id)) : null;
  // 例外白名单: 即使主体源已覆盖, 也把所有源的规则都合并进来(用于个别 App 主力跳不干净的情况)
  const supplementApps = new Set(CONFIG.supplementApps || []);
  // 分类合并
  const catMap = new Map();
  const appsMap = new Map(); // appId -> { id, name, groupsByName: Map }
  const ggMap = new Map(); // 全局规则组: name -> { g, rulesMap }
  for (let si = 0; si < subs.length; si++) {
    const sub = subs[si];
    const isSupplementOnly = baseFirst && si > 0; // 非主体源: 只补主体没有的应用
    for (const cat of sub.categories || []) {
      if (!catMap.has(cat.key)) catMap.set(cat.key, { key: cat.key, name: cat.name ?? cat.key, enableOrder: cat.enableOrder });
    }
    // 全局规则组: base-first 模式下只保留主体源的(其他源的全局组功能重复);
    // union 模式下名字聚合、指纹去重、首源元信息优先
    if (!isSupplementOnly) {
      for (const g of sub.globalGroups || []) {
        stats.globalRaw++;
        const ruleArr = Array.isArray(g.rules) ? g.rules : [];
        const gname = (g.name || "").trim();
        const bkey = gname || `__anon_${stableStringify(g).slice(0, 40)}`;
        let bucket = ggMap.get(bkey);
        if (!bucket) {
          bucket = { g, rulesMap: new Map() };
          ggMap.set(bkey, bucket);
        }
        for (const r of ruleArr) bucket.rulesMap.set(ruleFingerprint(r), r);
      }
    } else {
      stats.globalSkipped = (stats.globalSkipped || 0) + (sub.globalGroups || []).length;
    }
    for (const app of sub.apps || []) {
      if (!app.id) continue;
      if (isSupplementOnly && baseAppIds.has(app.id) && !supplementApps.has(app.id)) {
        // 主体源已覆盖该应用 -> 跳过(避免重复规则与选项膨胀)
        for (const g of app.groups || []) {
          stats.skippedShared++;
          stats.groupsRaw++;
          stats.rulesRaw += Array.isArray(g.rules) ? g.rules.length : 0;
        }
        continue;
      }
      let target = appsMap.get(app.id);
      if (!target) {
        target = { id: app.id, name: app.name || app.id, groupsByName: new Map() };
        appsMap.set(app.id, target);
        if (baseFirst) (isSupplementOnly ? stats.appsSupplement++ : stats.appsBase++);
      }
      if ((!target.name || target.name === target.id) && app.name) target.name = app.name;
      for (const g of app.groups || []) {
        stats.groupsRaw++;
        const ruleArr = Array.isArray(g.rules) ? g.rules : [];
        stats.rulesRaw += ruleArr.length;
        const gname = (g.name || "").trim();
        const bucketKey = gname || `__anon_${stableStringify(g).slice(0, 40)}`;
        let bucket = target.groupsByName.get(bucketKey);
        if (!bucket) {
          bucket = { g, rulesMap: new Map() };
          target.groupsByName.set(bucketKey, bucket);
        }
        for (const r of ruleArr) bucket.rulesMap.set(ruleFingerprint(r), r);
      }
    }
  }
  // 组装全局规则组(跨桶规则指纹去重; key 由名字哈希生成, 跨版本稳定)
  const globalGroups = [];
  const seenGlobalRules = new Set();
  const pickGlobalKey = makeKeyPicker();
  for (const [bname, bucket] of ggMap) {
    const g = { ...bucket.g };
    delete g.key;
    g.key = pickGlobalKey("global|" + bname);
    if (bucket.rulesMap.size) {
      g.rules = [...bucket.rulesMap.values()].filter((r) => {
        const fp = ruleFingerprint(r);
        if (seenGlobalRules.has(fp)) return false;
        seenGlobalRules.add(fp);
        return true;
      });
      g.rules = ensureUniqueRuleKeys("global|" + bname, g.rules).map(stripRuleMeta);
      stats.rulesOut += g.rules.length;
    }
    globalGroups.push(g);
    stats.globalOut++;
  }
  // 组装输出
  const categories = [...catMap.values()];
  const apps = [];
  for (const target of [...appsMap.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    stats.apps++;
    // 跨组规则去重: 同一 App 下指纹相同的规则只保留第一次出现的(按源优先级)
    const seenRules = new Set();
    // key 由「应用id+组名」哈希生成, 跨版本稳定 -> GKD 里手动开关状态不因更新丢失
    const pickKey = makeKeyPicker();
    const groups = [];
    for (const [bname, bucket] of target.groupsByName) {
      const g = { ...bucket.g };
      const rawLen = Array.isArray(bucket.g.rules) ? bucket.g.rules.length : 0;
      let rules;
    if (bucket.rulesMap.size) {
      rules = [...bucket.rulesMap.values()].filter((r) => {
        const fp = ruleFingerprint(r);
        if (seenRules.has(fp)) return false;
        seenRules.add(fp);
        return true;
      });
    }
    // 组内规则 key 唯一化(避免多源合并后 key 撞车)
    if (rules) rules = ensureUniqueRuleKeys(target.id + "|" + bname, rules).map(stripRuleMeta);
      // 原本有规则但去重后清空的组直接丢弃
      if (rawLen > 0 && (!rules || rules.length === 0)) {
        continue;
      }
      delete g.key;
      g.key = pickKey(target.id + "|" + bname);
      if (rules) g.rules = rules;
      groups.push(g);
      stats.groupsOut++;
      stats.rulesOut += rules ? rules.length : 0;
    }
    apps.push({ id: target.id, name: target.name, groups });
  }
  stats.dupGroups = stats.groupsRaw - stats.groupsOut;
  stats.dupRules = stats.rulesRaw - stats.rulesOut;
  const version = Number(
    new Date().toISOString().slice(0, 10).replace(/-/g, "")
  );
  const merged = {
    id: 99,
    name: "Merged-主流订阅合集",
    version,
    author: "WorkBuddy merge tool",
    categories,
    apps,
  };
  if (globalGroups.length) merged.globalGroups = globalGroups;
  return { stats, ...merged };
}

// ---------- 版本号: 内容变化才递增 ----------
// 内容与上一次产物完全一致 -> 沿用旧版本号(线上文件字节不变, GKD 显示"无更新"是准确的)
// 内容有变化 -> 递增
// ⚠️ version 必须 < 2^31(2147483647): GKD 内部按 32 位整数解析, 超出会"解析文本失败"
// 因此采用「Unix 分钟数」(约 2980 万, 约公元 6000 年前都不会溢出) 作为时间基准
const INT32_MAX = 2147483647;
function computeVersion(prevPath, body) {
  const timeBased = Math.floor(Date.now() / 60000);
  let prevVersion = 0;
  let prevBody = null;
  try {
    if (existsSync(prevPath)) {
      const prev = JSON5.parse(readFileSync(prevPath, "utf8"));
      prevVersion = Number(prev.version) || 0;
      if (prevVersion > INT32_MAX) prevVersion = 0; // 修正历史上超限的版本号
      delete prev.version;
      prevBody = stableStringify(prev);
    }
  } catch {}
  // 规范化后再比较: 内存对象可能带 undefined 值的键, 写文件时会被 JSON.stringify 丢弃,
  // 不做规范化会导致每次都误判为"内容有变化"
  const currBody = stableStringify(JSON.parse(JSON.stringify(body)));
  // 内容一致且旧版本号合法 -> 沿用(产物字节不变, 不产生空提交); 否则重新生成合法版本号
  if (prevBody !== null && prevBody === currBody && prevVersion > 0) return { version: prevVersion, changed: false };
  return { version: Math.min(INT32_MAX, Math.max(timeBased, prevVersion + 1)), changed: true };
}

// ---------- 主流程 ----------
async function main() {
  mkdirSync(SOURCES_DIR, { recursive: true });
  mkdirSync(DIST_DIR, { recursive: true });
  const enabled = CONFIG.sources.filter((s) => s.enabled);
  // 并行拉取全部源, 之后按配置顺序(优先级)依次处理
  const results = await Promise.all(
    enabled.map(async (src) => {
      console.log(`拉取 ${src.name} ...`);
      const got = await fetchSource(src);
      if (!got) { console.log(`  [${src.id}] 全部地址失败且无缓存, 跳过`); return null; }
      const parsed = JSON5.parse(got.text);
      const nApps = (parsed.apps || []).length;
      const nGroups = (parsed.apps || []).reduce((s, a) => s + (a.groups || []).length, 0);
      console.log(`  [${src.id}] name=${parsed.name} version=${parsed.version} 应用=${nApps} 规则组=${nGroups}${got.fromCache ? " (缓存)" : ""}`);
      return parsed;
    })
  );
  const subs = results.filter(Boolean);
  if (subs.length === 0) { console.error("没有任何可用订阅源"); process.exit(1); }
  const merged = mergeAll(subs);
  const { stats, ...out } = merged;
  const outPath = join(DIST_DIR, "merged_gkd.json5");
  // 版本号: 内容无变化则沿用旧版本(产物字节一致, 不会产生无意义的提交)
  const body = { id: out.id, name: out.name, author: out.author, categories: out.categories, apps: out.apps };
  if (out.globalGroups) body.globalGroups = out.globalGroups;
  const { version, changed } = computeVersion(outPath, body);
  const finalOut = { id: out.id, name: out.name, version, author: out.author, categories: out.categories, apps: out.apps };
  if (out.globalGroups) finalOut.globalGroups = out.globalGroups;
  writeFileSync(outPath, JSON.stringify(finalOut, null, 1), "utf8");
  // 自校验
  JSON5.parse(readFileSync(outPath, "utf8"));
  console.log("\n===== 合并完成 =====");
  console.log(`内容变化: ${changed ? "有(版本号已递增)" : "无(版本号沿用, 手机端会显示无更新)"}`);
  console.log(`订阅源: ${subs.length} 个`);
  console.log(`应用: ${stats.apps}${stats.appsBase ? `  (主体 ${stats.appsBase} + 补充 ${stats.appsSupplement})` : ""}`);
  if (stats.skippedShared) console.log(`主体已覆盖而跳过的组: ${stats.skippedShared} 个 (主体优先模式)`);
  console.log(`全局规则组: ${stats.globalRaw} -> ${stats.globalOut}${stats.globalSkipped ? `  (base-first 模式: 跳过补充源 ${stats.globalSkipped} 个)` : ""}`);
  console.log(`规则组: ${stats.groupsRaw} -> ${stats.groupsOut} (去重 ${stats.dupGroups})`);
  console.log(`规则: ${stats.rulesRaw} -> ${stats.rulesOut} (去重 ${stats.dupRules})`);
  console.log(`输出: ${outPath}  version=${version}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
