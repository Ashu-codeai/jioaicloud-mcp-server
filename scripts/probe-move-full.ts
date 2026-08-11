import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";
import { JioClient } from "../src/api/client.ts";
import { listFiles } from "../src/api/files.ts";

const NMS = "https://jmng2-api.jioaicloud.com";
const BOARD = "https://boards.jioaicloud.com";
const boardKey = "84c3d13095b911f189eb23824291833c";
const folderKey = "57CFCCC99EB04B84E063800B10AC954B";
const userId = "73d844860ad24aa6897f9cf9d5934c95";

async function call(label: string, method: string, url: string, body?: unknown) {
  const session = getActiveSession(loadConfig());
  const res = await fetch(url, {
    method,
    headers: { ...WEB_HEADERS, ...authHeaders(session) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text.slice(0, 900);
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep */
  }
  console.log(label, res.status, JSON.stringify(parsed).slice(0, 650));
  return parsed as Record<string, unknown>;
}

async function main() {
  const config = loadConfig();
  const client = new JioClient(config);
  const page = await listFiles(client, config, { limit: 100, type: "f" });
  const img =
    page.objects.find((o) => /\.jpe?g$/i.test(String(o.objectName || ""))) ||
    page.objects[0];
  console.log("using", img.objectKey, img.objectName);

  const moved = { ...img, parentObjectKey: folderKey };
  const moveRes = await call("MOVE with list object", "PUT", `${NMS}/nms/metadata`, {
    objects: [{ correlationId: userId, object: moved, operation: "MOVE" }],
  });

  // verify folder contents
  const folderList = await listFiles(client, config, {
    folderKey,
    limit: 20,
    type: "f",
  });
  console.log(
    "folder files",
    folderList.objects.map((o) => o.objectName)
  );

  // Album add
  const fileKey = String(img.objectKey);
  await call(
    "POST boards/metadata?boardKey COPY",
    "POST",
    `${BOARD}/boards/metadata?boardKey=${boardKey}`,
    {
      objects: [
        {
          correlationId: boardKey + "COPY" + fileKey,
          object: { ...img, boardKey, parentObjectKey: boardKey },
          operation: "COPY",
        },
      ],
    }
  );
  await call(
    "PUT boards/metadata?boardKey COPY",
    "PUT",
    `${BOARD}/boards/metadata?boardKey=${boardKey}`,
    {
      objects: [
        {
          correlationId: boardKey + "COPY" + fileKey,
          object: { objectKey: fileKey, objectName: img.objectName, boardKey },
          operation: "COPY",
        },
      ],
    }
  );

  // Minimal move-style fields only
  await call("MOVE minimal fields", "PUT", `${NMS}/nms/metadata`, {
    objects: [
      {
        correlationId: userId,
        object: {
          objectKey: fileKey,
          objectName: img.objectName,
          parentObjectKey: folderKey,
          sourceName: "DRIVE",
        },
        operation: "MOVE",
      },
    ],
  });

  console.log("moveRes summary", {
    objects: moveRes?.objects,
    unprocessed: moveRes?.unprocessed,
  });
}

main().catch(console.error);
