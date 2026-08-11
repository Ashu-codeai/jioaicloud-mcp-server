import { readFileSync, writeFileSync } from "node:fs";

const main = readFileSync("downloads/main.2e5550489ce17e33.js", "utf8");
const hits: string[] = [];
let i = 0;
while ((i = main.indexOf("destinationKey", i)) !== -1 && hits.length < 30) {
  hits.push(main.slice(Math.max(0, i - 300), i + 400));
  i += 14;
}
writeFileSync("downloads/destinationKey-hits.json", JSON.stringify(hits, null, 2));
console.log("hits", hits.length);
hits.forEach((h, idx) => {
  console.log("\n====", idx, "====");
  console.log(h);
});
