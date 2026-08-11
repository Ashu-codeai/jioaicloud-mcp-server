import { readFileSync, writeFileSync } from "node:fs";

const main = readFileSync("downloads/main.2e5550489ce17e33.js", "utf8");
const start = main.indexOf('albumsList:"/boards/sync/initial"');
const chunk = main.slice(start - 500, start + 4000);
writeFileSync("downloads/commonUrls-chunk.txt", chunk);
console.log(chunk);

// Also find all /boards paths
const re = /"[^"]*\/boards[^"]*"/g;
const paths = new Set<string>();
let m: RegExpExecArray | null;
while ((m = re.exec(main))) paths.add(m[0]);
console.log("\nALL BOARD PATHS");
[...paths].sort().forEach((p) => console.log(p));
