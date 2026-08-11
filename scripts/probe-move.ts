import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";

const NMS = "https://jmng2-api.jioaicloud.com";
const folderKey = "57CFCCC99EB04B84E063800B10AC954B";
const fileKey = "5d7bec2c91c84815aa2a476961916395";

async function call(label: string, method: string, url: string, body?: unknown) {
  const session = getActiveSession(loadConfig());
  const res = await fetch(url, {
    method,
    headers: { ...WEB_HEADERS, ...authHeaders(session) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text.slice(0, 700);
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep */
  }
  console.log(label, res.status, JSON.stringify(parsed).slice(0, 500));
}

async function main() {
  const bodies = [
    { objects: [fileKey], destinationKey: folderKey },
    { objectKeys: [fileKey], destinationKey: folderKey },
    { objects: [{ objectKey: fileKey }], destinationKey: folderKey },
    { objects: [{ objectKey: fileKey, destinationKey: folderKey }] },
    { objects: [{ objectKey: fileKey }], parentObjectKey: folderKey },
    {
      objects: [
        {
          correlationId: folderKey + "MOVE" + fileKey,
          object: { objectKey: fileKey },
          operation: "MOVE",
          destinationKey: folderKey,
        },
      ],
    },
  ];

  for (const [i, body] of bodies.entries()) {
    await call(`move PUT ${i}`, "PUT", `${NMS}/nms/metadata/move`, body);
    await call(`move POST ${i}`, "POST", `${NMS}/nms/metadata/move`, body);
    await call(`copy PUT ${i}`, "PUT", `${NMS}/nms/metadata/copy`, body);
  }

  // Also try move path with folder in URL
  await call(
    "move to folder path",
    "PUT",
    `${NMS}/nms/metadata/move/${folderKey}`,
    { objects: [{ objectKey: fileKey }] }
  );
  await call(
    "move objectKeys only + dest query",
    "PUT",
    `${NMS}/nms/metadata/move?destinationKey=${folderKey}`,
    { objectKeys: [fileKey] }
  );
}

main().catch(console.error);
