import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";
import { JioClient } from "../src/api/client.ts";
import { listFiles } from "../src/api/files.ts";

const BOARD = "https://boards.jioaicloud.com";
const boardKey = "84c3d13095b911f189eb23824291833c";
const folderKey = "57CFCCC99EB04B84E063800B10AC954B";

async function call(label: string, method: string, url: string, body?: unknown) {
  const session = getActiveSession(loadConfig());
  const res = await fetch(url, {
    method,
    headers: { ...WEB_HEADERS, ...authHeaders(session) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(label, res.status, text.slice(0, 400));
}

async function main() {
  const config = loadConfig();
  const client = new JioClient(config);
  const page = await listFiles(client, config, { folderKey, limit: 5, type: "f" });
  const img = page.objects[0];
  if (!img) throw new Error("no file in probe folder");
  console.log("file", img.objectKey, img.objectName);

  const flat = {
    objects: [
      {
        correlationId: boardKey + "COPY" + img.objectKey,
        operation: "COPY",
        objectKey: img.objectKey,
        objectName: img.objectName,
        boardKey,
        parentObjectKey: boardKey,
        sourceName: img.sourceName || "DRIVE",
        objectType: img.objectType || "FE",
        mimeType: img.mimeType,
      },
    ],
  };

  const urls = [
    `${BOARD}/boards/${boardKey}/metadata/copy`,
    `${BOARD}/boards/metadata/copy?boardKey=${boardKey}`,
    `${BOARD}/boards/${boardKey}/copy`,
    `${BOARD}/boards/${boardKey}/files`,
    `${BOARD}/boards/${boardKey}/objects`,
    `${BOARD}/boards/${boardKey}/metadata?limit=50`,
    `${BOARD}/copyrts?boardKey=${boardKey}`,
    `${BOARD}/boards/${boardKey}/metadata/objects`,
  ];

  for (const url of urls) {
    await call("POST " + url.replace(BOARD, ""), "POST", url, flat);
  }

  // GET album file list variants
  for (const url of [
    `${BOARD}/boards/${boardKey}/metadata?limit=50&sort=-lastModifiedDate`,
    `${BOARD}/boards/metadata?boardKey=${boardKey}&limit=50`,
    `${BOARD}/boards/${boardKey}?includeFiles=true`,
  ]) {
    await call("GET " + url.replace(BOARD, ""), "GET", url);
  }
}

main().catch(console.error);
