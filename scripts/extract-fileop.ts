import { readFileSync, writeFileSync } from "node:fs";

const main = readFileSync("downloads/main.2e5550489ce17e33.js", "utf8");
const markers = [
  "FileOpType",
  "fileOpType",
  "ppfobject/move",
  "object/move",
  "metadata/object",
  "setPayloadForFile",
  "setPayloadForMove",
  "prepareMove",
  "initiateMove",
  "confirmMove",
  "onMoveConfirm",
  "movePopup",
  "selectedFolder.objectKey",
  "parentObjectKey=this.universalService.selectedFolder",
  "parentObjectKey=this.universalService.destinationFolder",
];

const out: Record<string, string[]> = {};
for (const m of markers) {
  const hits: string[] = [];
  let i = 0;
  while ((i = main.indexOf(m, i)) !== -1 && hits.length < 6) {
    hits.push(main.slice(Math.max(0, i - 200), i + 450));
    i += m.length;
  }
  if (hits.length) out[m] = hits;
}

// All paths with /nms/metadata
const re = /"\/nms\/metadata[^"]*"/g;
const paths = new Set<string>();
let mm: RegExpExecArray | null;
while ((mm = re.exec(main))) paths.add(mm[0]);
out.nmsPaths = [...paths].sort();

writeFileSync("downloads/fileop-findings.json", JSON.stringify(out, null, 2));
console.log("nmsPaths");
(out.nmsPaths as string[]).forEach((p) => console.log(p));
for (const k of Object.keys(out)) {
  if (k === "nmsPaths") continue;
  console.log(`\n## ${k}`);
  out[k].slice(0, 2).forEach((h) => console.log("---\n" + h));
}
