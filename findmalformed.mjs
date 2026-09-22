// 找出产物中的畸形节点: rules 非数组 / groups 非数组 / 其他异常
import { readFileSync } from "node:fs";
import JSON5 from "json5";

const data = JSON5.parse(readFileSync(process.argv[2] || "dist/merged_gkd.json5", "utf8"));
const problems = [];
const sourceFiles = process.argv.slice(3);

function isPlainArray(v) { return Array.isArray(v); }

for (const app of data.apps) {
  if (!isPlainArray(app.groups)) { problems.push(`app ${app.id} groups not array: ${typeof app.groups}`); continue; }
  for (const g of app.groups) {
    if (g.rules !== undefined && !isPlainArray(g.rules)) {
      problems.push(`app=${app.id} group=${g.name} key=${g.key} rules type=${typeof g.rules} value=${JSON.stringify(g.rules).slice(0, 200)}`);
    }
  }
}
for (const g of data.globalGroups || []) {
  if (g.rules !== undefined && !isPlainArray(g.rules)) {
    problems.push(`globalGroup=${g.name} rules type=${typeof g.rules} value=${JSON.stringify(g.rules).slice(0, 200)}`);
  }
}

// 同时检查各源文件里是否本来就存在这种结构
for (const f of sourceFiles) {
  const d = JSON5.parse(readFileSync(f, "utf8"));
  let cnt = 0, samples = [];
  for (const app of d.apps || []) {
    for (const g of app.groups || []) {
      if (g.rules !== undefined && !isPlainArray(g.rules)) { cnt++; if (samples.length < 3) samples.push(`${app.id}#${g.name} type=${typeof g.rules} ${JSON.stringify(g.rules).slice(0, 120)}`); }
    }
  }
  for (const g of d.globalGroups || []) {
    if (g.rules !== undefined && !isPlainArray(g.rules)) { cnt++; if (samples.length < 3) samples.push(`GLOBAL#${g.name} type=${typeof g.rules} ${JSON.stringify(g.rules).slice(0, 120)}`); }
  }
  problems.push(`[source ${f}] malformed groups: ${cnt} ${samples.join(" | ")}`);
}

console.log(problems.length ? problems.join("\n") : "no problems");
