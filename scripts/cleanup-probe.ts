import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";
import { JioClient } from "../src/api/client.ts";
import { listFiles, trashFiles } from "../src/api/files.ts";

const NMS = "https://jmng2-api.jioaicloud.com";
const BOARD = "https://boards.jioaicloud.com";
const USER = "73d844860ad24aa6897f9cf9d5934c95";
const probeFolder = "57CFCCC99EB04B84E063800B10AC954B";
const may2021 = "57CFEEB771CC8636E063800B10ACA9E0";

async function api(method: string, url: string, body?: unknown) {
  const session = getActiveSession(loadConfig());
  const res = await fetch(url, {
    method,
    headers: { ...WEB_HEADERS, ...authHeaders(session) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(method, url.replace(BOARD, "BOARD").replace(NMS, "NMS"), res.status, text.slice(0, 300));
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

async function main() {
  const config = loadConfig();
  const client = new JioClient(config);

  // Move leftover image from probe folder into May 2021 album
  const probeFiles = await listFiles(client, config, {
    folderKey: probeFolder,
    limit: 50,
    type: "f",
  });
  console.log(
    "probe files",
    probeFiles.objects.map((o) => o.objectName)
  );
  for (const f of probeFiles.objects) {
    await api("PUT", `${NMS}/nms/metadata`, {
      objects: [
        {
          correlationId: USER,
          operation: "MOVE",
          objectKey: f.objectKey,
          objectName: f.objectName,
          parentObjectKey: may2021,
          sourceName: f.sourceName || "DRIVE",
          objectType: f.objectType || "FE",
          mimeType: f.mimeType,
          status: f.status || "A",
        },
      ],
    });
  }

  // Trash nested probe folder then probe folder
  const nested = await listFiles(client, config, {
    folderKey: probeFolder,
    limit: 50,
    type: "w",
  });
  const toTrash = [
    ...nested.objects.map((o) => String(o.objectKey)),
    probeFolder,
  ].filter(Boolean);
  if (toTrash.length) {
    console.log("trashing", toTrash);
    const r = await trashFiles(client, toTrash);
    console.log("trash result", JSON.stringify(r).slice(0, 400));
  }

  // Delete test albums
  const list = await api("GET", `${BOARD}/boards/sync/initial`);
  const boards = (list.body as { boards?: { boardKey: string; boardName: string }[] }).boards || [];
  console.log(
    "boards",
    boards.map((b) => b.boardName)
  );
  for (const b of boards) {
    if (!/^Test Album/.test(b.boardName)) continue;
    // try common delete endpoints
    await api("DELETE", `${BOARD}/boards/${b.boardKey}`);
    await api("POST", `${BOARD}/boards/${b.boardKey}/unjoin`);
    await api("PUT", `${BOARD}/boards/${b.boardKey}`, {
      objects: [
        {
          correlationId: b.boardKey + "DEL",
          object: { boardKey: b.boardKey, boardName: b.boardName },
          operation: "DELETE",
        },
      ],
    });
  }
}

main().catch(console.error);
