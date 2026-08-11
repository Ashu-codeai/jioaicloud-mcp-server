import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";
import { JioClient } from "../src/api/client.ts";
import { listFiles } from "../src/api/files.ts";

const NMS = "https://jmng2-api.jioaicloud.com";
const BOARD = "https://boards.jioaicloud.com";
const folderKey = "57CFCCC99EB04B84E063800B10AC954B";
const boardKey = "84c3d13095b911f189eb23824291833c";
const userId = "73d844860ad24aa6897f9cf9d5934c95";

async function call(label: string, method: string, url: string, body: unknown) {
  const session = getActiveSession(loadConfig());
  const res = await fetch(url, {
    method,
    headers: { ...WEB_HEADERS, ...authHeaders(session) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(label, res.status, text.slice(0, 500));
  return text;
}

async function main() {
  const config = loadConfig();
  const client = new JioClient(config);
  const page = await listFiles(client, config, { limit: 50, type: "f" });
  const raw =
    page.objects.find((o) => o.mimeType === "image") || page.objects[0];
  console.log("moving", raw.objectKey, raw.objectName, "source", raw.sourceName);

  // MOVE into folder
  await call("MOVE flat+sourceName", "PUT", `${NMS}/nms/metadata`, {
    objects: [
      {
        correlationId: userId,
        operation: "MOVE",
        objectKey: raw.objectKey,
        objectName: raw.objectName,
        parentObjectKey: folderKey,
        sourceName: raw.sourceName || "DRIVE",
        objectType: raw.objectType || "FE",
        mimeType: raw.mimeType,
        status: raw.status || "A",
      },
    ],
  });

  const inFolder = await listFiles(client, config, {
    folderKey,
    limit: 20,
    type: "f",
  });
  console.log(
    "folder now",
    inFolder.objects.map((o) => o.objectName)
  );

  // Try album add flat
  const img =
    inFolder.objects.find((o) => o.mimeType === "image") ||
    page.objects.find((o) => o.mimeType === "image") ||
    raw;

  for (const op of ["COPY", "ADD", "MOVE"]) {
    await call(
      `album flat ${op} via boards/metadata?boardKey POST`,
      "POST",
      `${BOARD}/boards/metadata?boardKey=${boardKey}`,
      {
        objects: [
          {
            correlationId: boardKey + op + img.objectKey,
            operation: op,
            objectKey: img.objectKey,
            objectName: img.objectName,
            boardKey,
            parentObjectKey: boardKey,
            sourceName: img.sourceName || "DRIVE",
            objectType: img.objectType || "FE",
            mimeType: img.mimeType,
          },
        ],
      }
    );
  }

  await call(
    "album flat COPY via nms/metadata to boardKey",
    "PUT",
    `${NMS}/nms/metadata`,
    {
      objects: [
        {
          correlationId: userId + "alb",
          operation: "COPY",
          objectKey: img.objectKey,
          objectName: img.objectName,
          parentObjectKey: boardKey,
          sourceName: img.sourceName || "DRIVE",
          objectType: img.objectType || "FE",
        },
      ],
    }
  );
}

main().catch(console.error);
