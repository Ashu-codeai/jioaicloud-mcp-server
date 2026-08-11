import { readFileSync, writeFileSync } from "node:fs";

const main = readFileSync("downloads/main.2e5550489ce17e33.js", "utf8");

const markers = [
  "destinationFolder",
  "operation:\"MOVE\"",
  'operation:"MOVE"',
  "MOVE\",",
  '"MOVE"',
  "moveFiles",
  "moveApi",
  "performMove",
  "fileMoved",
  "objectsToBeAdded,parentObjectKey",
  "parentObjectKey:this.universalService.destinationFolder",
  "destinationFolder.objectKey",
  "commonUrls.move",
  "move:\"",
  "/move",
];

const out: Record<string, string[]> = {};
for (const m of markers) {
  const hits: string[] = [];
  let i = 0;
  while ((i = main.indexOf(m, i)) !== -1 && hits.length < 8) {
    hits.push(main.slice(Math.max(0, i - 220), i + 450));
    i += m.length;
  }
  if (hits.length) out[m] = hits;
}

// Find all path strings containing move
const re = /"[^"]*move[^"]*"/gi;
const paths = new Set<string>();
let mm: RegExpExecArray | null;
while ((mm = re.exec(main))) {
  if (mm[0].includes("/") || mm[0].toLowerCase().includes("move")) paths.add(mm[0]);
}
out.movePathStrings = [...paths].filter((p) => /move/i.test(p)).slice(0, 80);

writeFileSync("downloads/move-findings.json", JSON.stringify(out, null, 2));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
console.log("\nPATHS");
(out.movePathStrings as string[]).forEach((p) => console.log(p));
