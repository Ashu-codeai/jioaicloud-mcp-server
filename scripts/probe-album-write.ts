import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";

const BOARD_URL = "https://boards.jioaicloud.com";

async function req(method: string, url: string, body?: unknown) {
  const config = loadConfig();
  const session = getActiveSession(config);
  const headers = { ...WEB_HEADERS, ...authHeaders(session) };
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep */
  }
  return { status: res.status, body: parsed };
}

async function main() {
  const mode = process.argv[2] || "probe";
  const objectKey = process.argv[3];

  if (mode === "list") {
    const r = await req("GET", `${BOARD_URL}/boards/sync/initial`);
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (mode === "create") {
    const name = process.argv[3] || `Test Album ${Date.now()}`;
    const bodies = [
      { boardName: name, boardDescription: "", parentObjectKey: null },
      { boardName: name + " B", boardDescription: "" },
      { objectName: name + " C", parentObjectKey: null, sourceName: "DRIVE" },
    ];
    for (const [i, body] of bodies.entries()) {
      const r = await req("POST", `${BOARD_URL}/boards`, body);
      console.log(`create body ${i}`, JSON.stringify({ status: r.status, body: r.body }, null, 2));
    }
    return;
  }

  if (mode === "add") {
    const boardKey = process.argv[3];
    const fileKey = process.argv[4];
    if (!boardKey || !fileKey) {
      console.error("Usage: add <boardKey> <objectKey>");
      process.exit(1);
    }
    const candidates: { label: string; url: string; body: unknown }[] = [
      {
        label: "boards/metadata/copy objects+parent",
        url: `${BOARD_URL}/boards/metadata/copy`,
        body: { objects: [{ objectKey: fileKey }], parentObjectKey: boardKey },
      },
      {
        label: "metadata/copy objects+parent",
        url: `${BOARD_URL}/metadata/copy`,
        body: { objects: [{ objectKey: fileKey }], parentObjectKey: boardKey },
      },
      {
        label: "boards/{key}/metadata/copy",
        url: `${BOARD_URL}/boards/${boardKey}/metadata/copy`,
        body: { objects: [{ objectKey: fileKey }] },
      },
      {
        label: "boards/metadata/copy objectKeys",
        url: `${BOARD_URL}/boards/metadata/copy`,
        body: { objectKeys: [fileKey], parentObjectKey: boardKey },
      },
      {
        label: "boards/metadata copy with boardKey",
        url: `${BOARD_URL}/boards/metadata/copy`,
        body: { objects: [fileKey], boardKey },
      },
      {
        label: "POST boards/{key}/metadata",
        url: `${BOARD_URL}/boards/${boardKey}/metadata`,
        body: { objects: [{ objectKey: fileKey, operation: "COPY" }] },
      },
      {
        label: "copyrts style",
        url: `${BOARD_URL}/boards/metadata/copy`,
        body: {
          objects: [{ objectKey: fileKey }],
          parentObjectKey: boardKey,
          operation: "COPY",
        },
      },
    ];
    for (const c of candidates) {
      const r = await req("POST", c.url, c.body);
      console.log(c.label, r.status, JSON.stringify(r.body).slice(0, 400));
    }
    return;
  }

  console.log("modes: list | create | add");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
