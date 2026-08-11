import { readFileSync, writeFileSync } from "node:fs";

const main = readFileSync("downloads/main.2e5550489ce17e33.js", "utf8");

const needles = [
  "addtoAlbumApi",
  "boards/metadata",
  "metadata/copy",
  "copyrts",
  "objectsToBeAdded",
  "selectedFile.boardKey",
  "parentObjectKey",
  "BRSOM",
  "SSOM0429",
];

const findings: Record<string, string[]> = {};
for (const n of needles) {
  const hits: string[] = [];
  let i = 0;
  while ((i = main.indexOf(n, i)) !== -1 && hits.length < 12) {
    hits.push(main.slice(Math.max(0, i - 250), i + 350));
    i += n.length;
  }
  findings[n] = hits;
}

// specifically find URL assembly near "addToAlbum" confirmation buttons
const re =
  /boardURL[^;]{0,300}|albumsMetaData[^;]{0,200}|commonUrls\.(copy|metaData|albumsMetaData|albumDetails)[^;]{0,200}/g;
const urlHits: string[] = [];
let m: RegExpExecArray | null;
while ((m = re.exec(main)) && urlHits.length < 40) {
  urlHits.push(main.slice(Math.max(0, m.index - 100), m.index + m[0].length + 150));
}
findings.urlAssemblies = urlHits;

writeFileSync("downloads/album-api-findings.json", JSON.stringify(findings, null, 2));
console.log("wrote findings", Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length])));
