// GKD 订阅合并去重工具
// 用法: node merge.mjs  (在 gkd-merge 目录下运行)
// 输出: dist/merged_gkd.json5
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

// ---------- 下载(带缓存与备用地址) ----------
async function fetchSource(src) {
  const cachePath = join(SOURCES_DIR, `${src.id}.json5`);
  const urls = [src.url, ...src.fallbacks];
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
    console.log(`  [${src.id}] 使用本地缓存`);
    return { src, text: readFileSync(cachePath, "utf8"), fromCache: true };
  }
  return null;
}

// ---------- 合并 ----------
function mergeAll(subs) {
  const stats = { apps: 0, groupsRaw: 0, groupsOut: 0, rulesRaw: 0, rulesOut: 0, dupGroups: 0, dupRules: 0 };
  // 分类合并
  const catMap = new Map();
  const appsMap = new Map(); // appId -> { id, name, groupsByName: Map }
  for (const sub of subs) {
    for (const cat of sub.categories || []) {
      if (!catMap.has(cat.key)) catMap.set(cat.key, { key: cat.key, name: cat.name ?? cat.key, enableOrder: cat.enableOrder });
    }
    for (const app of sub.apps || []) {
      if (!app.id) continue;
      let target = appsMap.get(app.id);
      if (!target) {
        target = { id: app.id, name: app.name || app.id, groupsByName: new Map() };
        appsMap.set(app.id, target);
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
        for (const r of ruleArr) bucket.rulesMap.set(stableStringify(r), r);
      }
    }
  }
  // 组装输出
  const categories = [...catMap.values()];
  const apps = [];
  for (const target of [...appsMap.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    stats.apps++;
    const groups = [];
    let key = 0;
    for (const [bname, bucket] of target.groupsByName) {
      const g = { ...bucket.g };
      const rules = bucket.rulesMap.size ? [...bucket.rulesMap.values()] : undefined;
      // 与桶内原始规则数对比统计去重
      const rawLen = Array.isArray(bucket.g.rules) ? bucket.g.rules.length : 0;
      if (rules && rules.length < rawLen) stats.dupRules += rawLen - rules.length;
      delete g.key;
      g.key = key++;
      if (rules) g.rules = rules;
      groups.push(g);
      stats.groupsOut++;
      stats.rulesOut += rules ? rules.length : 0;
    }
    apps.push({ id: target.id, name: target.name, groups });
  }
  stats.dupGroups = stats.groupsRaw - stats.groupsOut;
  const version = Number(
    new Date().toISOString().slice(0, 10).replace(/-/g, "")
  );
  return {
    id: 99,
    name: "Merged-主流订阅合集",
    version,
    author: "WorkBuddy merge tool",
    categories,
    apps,
    stats,
  };
}

// ---------- 主流程 ----------
async function main() {
  mkdirSync(SOURCES_DIR, { recursive: true });
  mkdirSync(DIST_DIR, { recursive: true });
  const subs = [];
  for (const src of CONFIG.sources.filter((s) => s.enabled)) {
    console.log(`拉取 ${src.name} ...`);
    const got = await fetchSource(src);
    if (!got) { console.log(`  [${src.id}] 全部地址失败且无缓存, 跳过`); continue; }
    const parsed = JSON5.parse(got.text);
    const nApps = (parsed.apps || []).length;
    const nGroups = (parsed.apps || []).reduce((s, a) => s + (a.groups || []).length, 0);
    console.log(`  [${src.id}] name=${parsed.name} version=${parsed.version} 应用=${nApps} 规则组=${nGroups}${got.fromCache ? " (缓存)" : ""}`);
    subs.push(parsed);
  }
  if (subs.length === 0) { console.error("没有任何可用订阅源"); process.exit(1); }
  const merged = mergeAll(subs);
  const { stats, ...out } = merged;
  const outPath = join(DIST_DIR, "merged_gkd.json5");
  writeFileSync(outPath, JSON.stringify(out, null, 1), "utf8");
  // 自校验
  JSON5.parse(readFileSync(outPath, "utf8"));
  console.log("\n===== 合并完成 =====");
  console.log(`订阅源: ${subs.length} 个`);
  console.log(`应用: ${stats.apps}`);
  console.log(`规则组: ${stats.groupsRaw} -> ${stats.groupsOut} (去重 ${stats.dupGroups})`);
  console.log(`规则: ${stats.rulesRaw} -> ${stats.rulesOut} (去重 ${stats.dupRules})`);
  console.log(`输出: ${outPath}  version=${out.version}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
