import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";
import { JioClient } from "../src/api/client.ts";
import { listFiles } from "../src/api/files.ts";

const NMS = "https://jmng2-api.jioaicloud.com";
const folderKey = "57CFCCC99EB04B84E063800B10AC954B";
const userId = "73d844860ad24aa6897f9cf9d5934c95";

async function call(label: string, method: string, url: string, body: unknown) {
  const session = getActiveSession(loadConfig());
  const res = await fetch(url, {
    method,
    headers: { ...WEB_HEADERS, ...authHeaders(session) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(label, res.status, text.slice(0, 350));
}

async function main() {
  const config = loadConfig();
  const client = new JioClient(config);
  const page = await listFiles(client, config, { limit: 5, type: "f" });
  const raw = page.objects.find((o) => o.mimeType === "image") || page.objects[0];
  console.log("file", raw.objectKey, raw.objectName);

  const variants: [string, string, string, unknown][] = [
    [
      "flat fields",
      "PUT",
      `${NMS}/nms/metadata`,
      {
        objects: [
          {
            correlationId: userId,
            operation: "MOVE",
            objectKey: raw.objectKey,
            objectName: raw.objectName,
            parentObjectKey: folderKey,
          },
        ],
      },
    ],
    [
      "array root",
      "PUT",
      `${NMS}/nms/metadata`,
      [
        {
          correlationId: userId,
          object: {
            objectKey: raw.objectKey,
            objectName: raw.objectName,
            parentObjectKey: folderKey,
          },
          operation: "MOVE",
        },
      ],
    ],
    [
      "objects with FullObject keys",
      "PUT",
      `${NMS}/nms/metadata`,
      {
        objects: [
          {
            correlationId: userId,
            operation: "MOVE",
            object: {
              objectKey: raw.objectKey,
              objectName: raw.objectName,
              parentObjectKey: folderKey,
              objectType: raw.objectType,
              mimeType: raw.mimeType,
              sourceName: raw.sourceName,
              status: raw.status,
            },
          },
        ],
      },
    ],
    [
      "objectKeys move attempt",
      "PUT",
      `${NMS}/nms/metadata`,
      { objectKeys: [raw.objectKey], parentObjectKey: folderKey, operation: "MOVE" },
    ],
    [
      "POST nms/folders nested?",
      "POST",
      `${NMS}/nms/folders`,
      {
        objectName: "should fail",
        parentObjectKey: folderKey,
        sourceName: "DRIVE",
      },
    ],
  ];

  // echo request body for first
  console.log(
    "body check",
    JSON.stringify({
      objectName: raw.objectName,
      type: typeof raw.objectName,
    })
  );

  for (const [label, method, url, body] of variants) {
    await call(label, method, url, body);
  }

  // Also try renaming the probe folder via FRN on /nms/metadata
  await call("FRN rename folder", "PUT", `${NMS}/nms/metadata`, {
    objects: [
      {
        correlationId: userId,
        object: {
          objectKey: folderKey,
          objectName: "Photos Probe Folder",
          parentObjectKey: "58AF7DA84FBE94C9E063800B10ACCDBA",
          objectType: "FR",
          sourceName: "DRIVE",
          status: "A",
        },
        operation: "FRN",
      },
    ],
  });
}

main().catch(console.error);
