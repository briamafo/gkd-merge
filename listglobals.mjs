import { readFileSync } from "node:fs";
import JSON5 from "json5";
const d = JSON5.parse(readFileSync("dist/merged_gkd.json5", "utf8"));
for (const g of d.globalGroups || []) {
  console.log(`${g.name}  | 规则数: ${(g.rules || []).length} | 来源字段: ${g.disableIfAppGroupMatch ? "disableIfAppGroupMatch=" + g.disableIfAppGroupMatch : "-"}`);
}
