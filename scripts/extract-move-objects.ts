import { readFileSync, writeFileSync } from "node:fs";

const main = readFileSync("downloads/main.2e5550489ce17e33.js", "utf8");

const markers = ["MoveObjects(", ".MoveObjects(", "MoveObjects", "addToDBForMoveCopy", "http.put(i,f)", "operation:\"MOVE\"", 'operation:"MOVE"'];
const out: Record<string, string[]> = {};
for (const m of markers) {
  const hits: string[] = [];
  let i = 0;
  while ((i = main.indexOf(m, i)) !== -1 && hits.length < 10) {
    hits.push(main.slice(Math.max(0, i - 400), i + 700));
    i += m.length;
  }
  if (hits.length) out[m] = hits;
}

// find "/move" exact path definition
let i = main.indexOf('move:"/');
if (i < 0) i = main.indexOf("/move");
out.movePathDef = [];
let idx = 0;
while ((idx = main.indexOf("/move", idx)) !== -1 && out.movePathDef.length < 20) {
  out.movePathDef.push(main.slice(Math.max(0, idx - 80), idx + 80));
  idx += 5;
}

writeFileSync("downloads/move-objects.json", JSON.stringify(out, null, 2));
for (const [k, v] of Object.entries(out)) {
  console.log(`\n##### ${k}`);
  (v as string[]).slice(0, 3).forEach((h, n) => {
    console.log("---", n);
    console.log(h);
  });
}
