// 统计产物中各部分体积占比, 评估可裁剪的展示型元数据
import { readFileSync } from "node:fs";
import JSON5 from "json5";

const data = JSON5.parse(readFileSync("dist/merged_gkd.json5", "utf8"));
let snapLen = 0, nameLen = 0, total = JSON.stringify(data).length;
function walkRules(rules, cb) {
  if (!Array.isArray(rules)) return;
  for (const r of rules) cb(r);
}
let ruleCount = 0;
for (const app of data.apps) {
  for (const g of app.groups || []) walkRules(g.rules, (r) => {
    ruleCount++;
    if (r.snapshotUrls) snapLen += JSON.stringify(r.snapshotUrls).length;
    if (r.exampleUrls) snapLen += JSON.stringify(r.exampleUrls).length;
    if (r.name) nameLen += JSON.stringify(r.name).length;
  });
}
for (const g of data.globalGroups || []) walkRules(g.rules, (r) => {
  ruleCount++;
  if (r.snapshotUrls) snapLen += JSON.stringify(r.snapshotUrls).length;
});

console.log("total JSON chars:", total);
console.log("rules:", ruleCount);
console.log("snapshotUrls+exampleUrls chars:", snapLen, `(${(snapLen / total * 100).toFixed(1)}%)`);
console.log("rule name chars:", nameLen, `(${(nameLen / total * 100).toFixed(1)}%)`);
