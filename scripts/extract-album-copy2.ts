import { readFileSync, writeFileSync } from "node:fs";

const main = readFileSync("downloads/main.2e5550489ce17e33.js", "utf8");

const markers = [
  "copyInSelectedPath",
  "performFileOperation",
  "addtoAlbumApi",
  "objects:this.universalService.objectsToBeAdded",
  "objects:o.universalService.objectsToBeAdded",
  "objects:u.universalService.objectsToBeAdded",
  "parentObjectKey:this.universalService.selectedFile",
  "parentObjectKey:i.boardKey",
  "parentObjectKey:o.boardKey",
  "parentObjectKey:r.boardKey",
  "parentObjectKey:f.boardKey",
  "parentObjectKey:a.boardKey",
  "boardURL+",
  "albumsMetaData+",
  "commonUrls.copy",
  "/metadata/copy",
];

const out: Record<string, string[]> = {};
for (const m of markers) {
  const hits: string[] = [];
  let i = 0;
  while ((i = main.indexOf(m, i)) !== -1 && hits.length < 5) {
    hits.push(main.slice(Math.max(0, i - 250), i + 600));
    i += m.length;
  }
  if (hits.length) out[m] = hits;
}

const re = /\{objects:[^}]{0,160}parentObjectKey[^}]{0,100}\}/g;
out.bodyShapes = [];
let m: RegExpExecArray | null;
while ((m = re.exec(main)) && out.bodyShapes.length < 20) {
  out.bodyShapes.push(m[0]);
}

const re2 = /boardURL\+[A-Za-z0-9_.]+(?:\+[A-Za-z0-9_."+/]*){0,12}/g;
out.boardUrlExpr = [];
while ((m = re2.exec(main)) && out.boardUrlExpr.length < 40) {
  out.boardUrlExpr.push(m[0]);
}

writeFileSync("downloads/album-copy2.json", JSON.stringify(out, null, 2));
console.log(
  Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]))
);
