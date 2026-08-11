import { readFileSync, writeFileSync } from "node:fs";

const main = readFileSync("downloads/main.2e5550489ce17e33.js", "utf8");

// Find copy URL constructions involving nmsURL
const patterns = [
  /nmsURL[^;]{0,80}copy[^;]{0,80}/g,
  /commonUrls\.copy[^;,]{0,120}/g,
  /"\/metadata\/copy"[^;]{0,200}/g,
  /metadata\/copy[^"'`]{0,80}/g,
  /parentObjectKey:[^,}]{0,60}/g,
  /objects:this\.universalService\.objectsToBeAdded[^}]{0,80}/g,
  /objects:o\.universalService\.objectsToBeAdded[^}]{0,80}/g,
  /objects:u\.universalService\.objectsToBeAdded[^}]{0,80}/g,
  /objects:r[^}]{0,100}parentObjectKey[^}]{0,80}/g,
  /parentObjectKey:[^,}]+,objects:[^}]+/g,
  /objects:[^}]+,parentObjectKey:[^}]+/g,
];

const out: Record<string, string[]> = {};
for (const [idx, re] of patterns.entries()) {
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(main)) && hits.length < 15) {
    hits.push(main.slice(Math.max(0, m.index - 120), m.index + m[0].length + 180));
  }
  out[`p${idx}`] = [...new Set(hits)];
}

writeFileSync("downloads/copy-patterns.json", JSON.stringify(out, null, 2));
for (const [k, v] of Object.entries(out)) {
  console.log(`\n##### ${k} (${v.length})`);
  v.slice(0, 5).forEach((h) => console.log("---\n" + h));
}
