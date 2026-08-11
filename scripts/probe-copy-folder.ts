import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";

const NMS = "https://jmng2-api.jioaicloud.com";
const BOARD = "https://boards.jioaicloud.com";
const boardKey = "84c3d13095b911f189eb23824291833c";
const fileKey = "5d7bec2c91c84815aa2a476961916395";
const rootKey = "58AF7DA84FBE94C9E063800B10ACCDBA";

async function call(label: string, method: string, url: string, body?: unknown) {
  const session = getActiveSession(loadConfig());
  const headers = { ...WEB_HEADERS, ...authHeaders(session) };
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text.slice(0, 600);
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep */
  }
  console.log(label, res.status, JSON.stringify(parsed).slice(0, 450));
}

async function main() {
  // NMS copy variants with destinationKey as query
  await call(
    "copy q dest",
    "PUT",
    `${NMS}/nms/metadata/copy?destinationKey=${boardKey}`,
    { objects: [fileKey] }
  );
  await call(
    "copy q dest obj",
    "PUT",
    `${NMS}/nms/metadata/copy?destinationKey=${boardKey}`,
    { objects: [{ objectKey: fileKey }] }
  );
  await call(
    "copy to root folder first (control)",
    "PUT",
    `${NMS}/nms/metadata/copy?destinationKey=${rootKey}`,
    { objects: [{ objectKey: fileKey }] }
  );
  await call(
    "copy body destKey root",
    "PUT",
    `${NMS}/nms/metadata/copy`,
    { objects: [{ objectKey: fileKey }], destinationKey: rootKey }
  );
  await call(
    "copy parentObjectKey root",
    "PUT",
    `${NMS}/nms/metadata/copy`,
    { objects: [{ objectKey: fileKey }], parentObjectKey: rootKey }
  );
  await call(
    "copy objects with dest inside",
    "PUT",
    `${NMS}/nms/metadata/copy`,
    { objects: [{ objectKey: fileKey, destinationKey: rootKey }] }
  );

  // Folder create + move (as album alternative)
  const folderName = `Album Probe ${Date.now()}`;
  await call("create folder", "POST", `${NMS}/nms/folders`, {
    objectName: folderName,
    parentObjectKey: rootKey,
    sourceName: "DRIVE",
  });

  // Board file add via boards sync / object copy paths
  await call("board copyrts", "POST", `${BOARD}/copyrts`, {
    objects: [fileKey],
    parentObjectKey: boardKey,
  });
  await call("board copystr", "POST", `${BOARD}/copystr`, {
    objects: [fileKey],
    parentObjectKey: boardKey,
  });
  await call(
    "board /boards/KEY/metadata POST objects ADD",
    "POST",
    `${BOARD}/boards/${boardKey}/metadata`,
    {
      objects: [
        {
          correlationId: `${boardKey}ADD${fileKey}`,
          object: { objectKey: fileKey, boardKey },
          operation: "ADD",
        },
      ],
    }
  );
  await call(
    "board /boards/KEY/metadata POST COPY",
    "POST",
    `${BOARD}/boards/${boardKey}/metadata`,
    {
      objects: [
        {
          correlationId: `${boardKey}COPY${fileKey}`,
          object: { objectKey: fileKey, boardKey },
          operation: "COPY",
        },
      ],
    }
  );
}

main().catch(console.error);
