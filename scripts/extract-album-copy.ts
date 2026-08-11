import { readFileSync, writeFileSync } from "node:fs";

const main = readFileSync("downloads/main.2e5550489ce17e33.js", "utf8");

// Find functions related to confirming move/copy/add
const markers = [
  "moveToSelectedPath",
  "copyToSelectedPath",
  "addToSelectedAlbum",
  "confirmMoveCopy",
  "setRequiredDataForAdding",
  "setPayloadForAlbumFileOperations",
  "addtoAlbumApi(",
  "folderService.addto",
  "commonUrls.copy",
  "SERVICE_URL.COPY",
  "COPY_URL",
  "copyURL",
  "getCopyUrl",
  "boards\"+/",
  "albumDetails+\"/\"",
  "albumDetails+",
  "/metadata/copy",
  "objects:this.universalService.objectsToBeAdded",
  "objects:o.universalService.objectsToBeAdded",
  "parentObjectKey:this.universalService.selectedFile",
  "parentObjectKey:i.boardKey",
  "parentObjectKey:o.boardKey",
  "parentObjectKey:r.boardKey",
  "boardKey:this.universalService.selectedFile.boardKey",
];

const out: Record<string, string[]> = {};
for (const m of markers) {
  const hits: string[] = [];
  let i = 0;
  while ((i = main.indexOf(m, i)) !== -1 && hits.length < 6) {
    hits.push(main.slice(Math.max(0, i - 200), i + 500));
    i += m.length;
  }
  if (hits.length) out[m] = hits;
}

// Broader: find "addToAlbum" near http.post
let idx = 0;
const nearPost: string[] = [];
while ((idx = main.indexOf("addToAlbum", idx)) !== -1 && nearPost.length < 20) {
  const slice = main.slice(Math.max(0, idx - 100), idx + 100);
  if (slice.includes("http.") || slice.includes("post(") || slice.includes("Api")) {
    nearPost.push(main.slice(Math.max(0, idx - 300), idx + 400));
  }
  idx += 8;
}
out.nearPost = nearPost;

writeFileSync("downloads/album-copy-findings.json", JSON.stringify(out, null, 2));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
