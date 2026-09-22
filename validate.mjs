// 校验合并产物的"唯一性约束": 组 key 唯一 / 规则 key 唯一
import { readFileSync } from "node:fs";
import JSON5 from "json5";

const data = JSON5.parse(readFileSync(process.argv[2] || "dist/merged_gkd.json5", "utf8"));

let dupAppIds = 0;
let dupGroupKeys = 0;
let dupRuleKeys = 0;
let groupsWithDupRuleKeys = [];
let maxKey = 0;
let negativeKeys = 0;

const appIds = new Set();
for (const app of data.apps) {
  if (appIds.has(app.id)) dupAppIds++;
  appIds.add(app.id);
  const gkeys = new Set();
  for (const g of app.groups || []) {
    if (gkeys.has(g.key)) dupGroupKeys++;
    gkeys.add(g.key);
    maxKey = Math.max(maxKey, Number(g.key) || 0);
    const rkeys = new Set();
    let dup = 0;
    for (const r of g.rules || []) {
      if (r.key !== undefined) {
        if (rkeys.has(r.key)) dup++;
        rkeys.add(r.key);
        maxKey = Math.max(maxKey, Number(r.key) || 0);
        if (Number(r.key) < 0) negativeKeys++;
      }
    }
    if (dup) { dupRuleKeys += dup; if (groupsWithDupRuleKeys.length < 5) groupsWithDupRuleKeys.push(`${app.id}#${g.name}(${dup})`); }
  }
}
for (const g of data.globalGroups || []) {
  const rkeys = new Set();
  let dup = 0;
  for (const r of g.rules || []) {
    if (r.key !== undefined) { if (rkeys.has(r.key)) dup++; rkeys.add(r.key); }
  }
  if (dup) dupRuleKeys += dup;
}

console.log("dup app ids:", dupAppIds);
console.log("dup group keys:", dupGroupKeys);
console.log("dup rule keys:", dupRuleKeys, groupsWithDupRuleKeys);
console.log("max key value:", maxKey);
console.log("negative rule keys:", negativeKeys);
console.log("apps:", data.apps.length, "globalGroups:", (data.globalGroups || []).length);
console.log("version:", data.version);
