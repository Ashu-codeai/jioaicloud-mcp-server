import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";

const NMS = "https://jmng2-api.jioaicloud.com";
const BOARD = "https://boards.jioaicloud.com";
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
  let parsed: unknown = text.slice(0, 800);
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep */
  }
  console.log(method, url.includes("boards") ? "BOARD" : "NMS", res.status, JSON.stringify(parsed).slice(0, 500));
}

const bodies = [
  { objects: [fileKey], destinationKey: boardKey },
  { objectKeys: [fileKey], destinationKey: boardKey },
  { objects: [{ objectKey: fileKey }], destinationKey: boardKey },
  { objects: [{ objectKey: fileKey, destinationKey: boardKey }] },
  { objects: [fileKey], parentObjectKey: boardKey, destinationKey: boardKey },
  {
    objects: [{ objectKey: fileKey }],
    destinationKey: boardKey,
    destinationType: "BOARD",
  },
  {
    objects: [{ objectKey: fileKey }],
    destinationKey: boardKey,
    sourceName: "DRIVE",
  },
  { objectKey: fileKey, destinationKey: boardKey },
];

async function main() {
  for (const body of bodies) {
    await call("PUT", `${NMS}/nms/metadata/copy`, body);
    await call("POST", `${NMS}/nms/metadata/copy`, body);
    await call("POST", `${BOARD}/boards/${boardKey}/metadata/copy`, body);
    await call("PUT", `${BOARD}/boards/${boardKey}/metadata/copy`, {
      ...body,
      destinationKey: undefined,
      objects: body.objects || body.objectKeys,
    });
    console.log("---");
  }

  // Also try board metadata list for album contents
  await call("GET", `${BOARD}/boards/${boardKey}/metadata`);
  await call("GET", `${BOARD}/boards/metadata/${boardKey}`);
  await call("GET", `${BOARD}/boards/${boardKey}`);
}

main().catch(console.error);
