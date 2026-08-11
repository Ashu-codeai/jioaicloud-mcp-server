import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";

const BOARD = "https://boards.jioaicloud.com";
const NMS = "https://jmng2-api.jioaicloud.com";
const boardKey = "84c3d13095b911f189eb23824291833c";
const fileKey = "5d7bec2c91c84815aa2a476961916395";

async function call(method: string, url: string, body?: unknown) {
  const session = getActiveSession(loadConfig());
  const res = await fetch(url, {
    method,
    headers: { ...WEB_HEADERS, ...authHeaders(session) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text.slice(0, 500);
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep */
  }
  console.log(
    method,
    url.replace(BOARD, "BOARD").replace(NMS, "NMS"),
    res.status,
    JSON.stringify(parsed).slice(0, 280)
  );
}

const bodies = [
  { objects: [fileKey], parentObjectKey: boardKey },
  { objects: [{ objectKey: fileKey }], parentObjectKey: boardKey },
  { objectKeys: [fileKey], parentObjectKey: boardKey },
  {
    objects: [
      {
        correlationId: boardKey + "COPY" + fileKey,
        object: { objectKey: fileKey, boardKey },
        operation: "COPY",
      },
    ],
  },
  {
    objects: [
      {
        correlationId: boardKey + "ADD" + fileKey,
        object: { objectKey: fileKey, boardKey },
        operation: "ADD",
      },
    ],
  },
];

const urls = [
  `${BOARD}/boards/${boardKey}/metadata/copy`,
  `${BOARD}/boards/${boardKey}/metadata`,
  `${BOARD}/boards/metadata/copy`,
  `${BOARD}/boards/metadata`,
  `${BOARD}/metadata/copy`,
  `${BOARD}/copyrts`,
  `${BOARD}/boards/copyrts`,
  `${NMS}/nms/metadata/copy`,
  `${NMS}/metadata/copy`,
  `${NMS}/nms/metadata/copyrts`,
  `${BOARD}/boards/${boardKey}/copy`,
  `${BOARD}/boards/${boardKey}/metadata/objects`,
];

async function main() {
  for (const url of urls) {
    for (const [i, body] of bodies.entries()) {
      await call("POST", url, body);
      if (i === 0) await call("PUT", url, body);
    }
    console.log("---");
  }
}

main().catch(console.error);
