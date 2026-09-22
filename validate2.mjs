// 严格校验: JSON.parse 是否通过 / 重复 key / 异常字符 / 统计
import { readFileSync } from "node:fs";

const p = process.argv[2] || "dist/merged_gkd.json5";
const text = readFileSync(p, "utf8");

console.log("bytes:", Buffer.byteLength(text), "chars:", text.length);
console.log("has BOM:", text.charCodeAt(0) === 0xfeff);

let data;
try {
  data = JSON.parse(text);
  console.log("strict JSON.parse: OK");
} catch (e) {
  console.log("strict JSON.parse: FAIL ->", e.message);
  process.exit(1);
}

// 重复 key 检查
const appIds = new Set();
let dupApp = 0, dupGroup = 0, dupRule = 0, dupRuleSamples = [];
let strRulesGroups = 0, undefRulesGroups = 0, objRulesGroups = 0, objSamples = [];
let maxKey = 0, minKey = 0;
for (const app of data.apps) {
  if (appIds.has(app.id)) dupApp++;
  appIds.add(app.id);
  const gk = new Set();
  for (const g of app.groups || []) {
    if (gk.has(g.key)) dupGroup++;
    gk.add(g.key);
    maxKey = Math.max(maxKey, Number(g.key) || 0);
    minKey = Math.min(minKey, Number(g.key) || 0);
    if (typeof g.rules === "string") { strRulesGroups++; continue; }
    if (g.rules === undefined) { undefRulesGroups++; continue; }
    if (!Array.isArray(g.rules)) { objRulesGroups++; if (objSamples.length < 3) objSamples.push(`${app.id}#${g.name} -> ${JSON.stringify(g.rules).slice(0, 150)}`); continue; }
    const rk = new Set();
    let d = 0;
    for (const r of g.rules) {
      if (r.key !== undefined) {
        if (rk.has(r.key)) d++;
        rk.add(r.key);
        maxKey = Math.max(maxKey, Number(r.key) || 0);
        minKey = Math.min(minKey, Number(r.key) || 0);
      }
    }
    if (d) { dupRule += d; if (dupRuleSamples.length < 3) dupRuleSamples.push(`${app.id}#${g.name}:${d}`); }
  }
}

// 控制字符 / 孤立代理对检查
let loneSurrogate = 0, ctrlChar = 0;
for (let i = 0; i < text.length; i++) {
  const c = text.charCodeAt(i);
  if (c < 0x20 && c !== 9 && c !== 10 && c !== 13) ctrlChar++;
  if (c >= 0xd800 && c <= 0xdbff) {
    const n = text.charCodeAt(i + 1);
    if (!(n >= 0xdc00 && n <= 0xdfff)) loneSurrogate++;
  }
}

console.log("dup app ids:", dupApp, "dup group keys:", dupGroup, "dup rule keys:", dupRule, dupRuleSamples);
console.log("groups with string rules:", strRulesGroups, "rules undefined:", undefRulesGroups, "rules 非数组对象:", objRulesGroups, objSamples);
console.log("key range:", minKey, "~", maxKey);
console.log("lone surrogates:", loneSurrogate, "raw control chars:", ctrlChar);
console.log("apps:", data.apps.length, "globalGroups:", (data.globalGroups || []).length, "version:", data.version);
console.log("top-level keys:", Object.keys(data).join(","));
