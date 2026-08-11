import { readFileSync, writeFileSync } from "node:fs";

const main = readFileSync("downloads/main.2e5550489ce17e33.js", "utf8");

// Find callers - MoveObjects is likely called as something.MoveObjects(
const hits: string[] = [];
let i = 0;
while ((i = main.indexOf("MoveObjects", i)) !== -1 && hits.length < 20) {
  hits.push(main.slice(Math.max(0, i - 500), i + 200));
  i += 11;
}

// Also search for setPayload that builds MOVE
const hits2: string[] = [];
i = 0;
while ((i = main.indexOf('"MOVE"', i)) !== -1 && hits2.length < 30) {
  hits2.push(main.slice(Math.max(0, i - 250), i + 250));
  i += 6;
}

// Search for nmsMetadata + something move
const hits3: string[] = [];
for (const p of [
  "privateFolderObjectMove",
  "nmsMetadata+/",
  'metaData+"/move"',
  'metaData+"/trash"',
  "commonUrls.trash",
  "SERVICE_URL.MOVE",
  "FILE_OPERATIONS",
  "fileOperationsUrl",
  "objectOperations",
]) {
  let j = 0;
  let c = 0;
  while ((j = main.indexOf(p, j)) !== -1 && c < 4) {
    hits3.push(`${p} :: ` + main.slice(Math.max(0, j - 100), j + 300));
    j += p.length;
    c++;
  }
}

writeFileSync(
  "downloads/move-callers.json",
  JSON.stringify({ MoveObjects: hits, MOVE: hits2, other: hits3 }, null, 2)
);
console.log("MoveObjects", hits.length, "MOVE", hits2.length, "other", hits3.length);
hits.forEach((h, n) => {
  console.log("\n==== MoveObjects", n);
  console.log(h);
});
console.log("\n==== other ====");
hits3.forEach((h) => console.log("\n" + h));
