import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";
import { JioClient } from "../src/api/client.ts";
import { listFiles } from "../src/api/files.ts";

const NMS = "https://jmng2-api.jioaicloud.com";
const folderKey = "57CFCCC99EB04B84E063800B10AC954B";
const userId = "73d844860ad24aa6897f9cf9d5934c95";

async function main() {
  const config = loadConfig();
  const client = new JioClient(config);
  const page = await listFiles(client, config, { limit: 5, type: "f" });
  const raw = page.objects[0];
  console.log("RAW OBJECT", JSON.stringify(raw, null, 2));

  // Try FRN rename first to see if objectName works there
  const session = getActiveSession(config);
  const headers = { ...WEB_HEADERS, ...authHeaders(session) };

  const payloads = [
    {
      label: "MOVE objectName string",
      body: {
        objects: [
          {
            correlationId: userId + "1",
            object: {
              objectKey: raw.objectKey,
              objectName: String(raw.objectName),
              parentObjectKey: folderKey,
              mimeType: raw.mimeType || raw.actualMimeType || "image",
              sourceName: "DRIVE",
              status: "A",
            },
            operation: "MOVE",
          },
        ],
      },
    },
    {
      label: "MOVE nested name",
      body: {
        objects: [
          {
            correlationId: userId + "2",
            object: {
              objectKey: raw.objectKey,
              name: raw.objectName,
              objectName: raw.objectName,
              parentObjectKey: folderKey,
            },
            operation: "MOVE",
          },
        ],
      },
    },
    {
      label: "COPY to folder",
      body: {
        objects: [
          {
            correlationId: userId + "3",
            object: {
              objectKey: raw.objectKey,
              objectName: raw.objectName,
              parentObjectKey: folderKey,
              sourceName: "DRIVE",
            },
            operation: "COPY",
          },
        ],
      },
    },
  ];

  for (const p of payloads) {
    const res = await fetch(`${NMS}/nms/metadata`, {
      method: "PUT",
      headers,
      body: JSON.stringify(p.body),
    });
    const text = await res.text();
    console.log(p.label, res.status, text.slice(0, 400));
  }
}

main().catch(console.error);
