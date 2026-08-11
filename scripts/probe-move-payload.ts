import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";

const NMS = "https://jmng2-api.jioaicloud.com";
const BOARD = "https://boards.jioaicloud.com";
const boardKey = "84c3d13095b911f189eb23824291833c";
const folderKey = "57CFCCC99EB04B84E063800B10AC954B";
const fileKey = "5d7bec2c91c84815aa2a476961916395";
const userId = "73d844860ad24aa6897f9cf9d5934c95";

async function call(label: string, method: string, url: string, body?: unknown) {
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
  console.log(label, res.status, JSON.stringify(parsed).slice(0, 500));
}

async function main() {
  const movePayload = {
    objects: [
      {
        correlationId: userId,
        object: { objectKey: fileKey, parentObjectKey: folderKey },
        operation: "MOVE",
      },
    ],
  };

  await call("PUT nms/metadata MOVE", "PUT", `${NMS}/nms/metadata`, movePayload);
  await call("PUT nms/metadata/ MOVE", "PUT", `${NMS}/nms/metadata/`, movePayload);
  await call("PUT metadata MOVE", "PUT", `${NMS}/metadata`, movePayload);
  await call("PUT nms/metadata/object/move", "PUT", `${NMS}/nms/metadata/object/move`, movePayload);
  await call("PUT nms/metadata/move proper", "PUT", `${NMS}/nms/metadata/move`, movePayload);

  // Album add with similar payload
  const addPayload = {
    objects: [
      {
        correlationId: boardKey + "COPY" + fileKey,
        object: { objectKey: fileKey, boardKey, parentObjectKey: boardKey },
        operation: "COPY",
      },
    ],
  };
  const addPayload2 = {
    objects: [
      {
        correlationId: boardKey + "ADD" + fileKey,
        object: { objectKey: fileKey, boardKey },
        operation: "ADD",
      },
    ],
  };

  await call("PUT boards/{key} add", "PUT", `${BOARD}/boards/${boardKey}`, addPayload);
  await call("PUT boards/{key}/metadata add", "PUT", `${BOARD}/boards/${boardKey}/metadata`, addPayload);
  await call("PUT boards/metadata add", "PUT", `${BOARD}/boards/metadata`, addPayload);
  await call("PUT boards/metadata ADD op", "PUT", `${BOARD}/boards/metadata`, addPayload2);
  await call(
    "GET boards/{key}/metadata?limit",
    "GET",
    `${BOARD}/boards/${boardKey}/metadata?limit=50`
  );
  await call(
    "GET boards/metadata?boardKey",
    "GET",
    `${BOARD}/boards/metadata?boardKey=${boardKey}&limit=50`
  );

  // createFolder style rename path
  await call("PUT nms/rename", "PUT", `${NMS}/rename`, {
    objects: [
      {
        correlationId: userId,
        object: { objectKey: folderKey, objectName: "Photos Album Probe", parentObjectKey: "58AF7DA84FBE94C9E063800B10ACCDBA", sourceName: "DRIVE" },
        operation: "FRN",
      },
    ],
  });
}

main().catch(console.error);
