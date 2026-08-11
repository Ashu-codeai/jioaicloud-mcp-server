import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";
import { JioClient } from "../src/api/client.ts";
import { listFiles, type JioFileObject } from "../src/api/files.ts";

const NMS = "https://jmng2-api.jioaicloud.com";
const BOARD = "https://boards.jioaicloud.com";
const ROOT = "58AF7DA84FBE94C9E063800B10ACCDBA";
const USER = "73d844860ad24aa6897f9cf9d5934c95";
const DRY = process.argv.includes("--dry-run");
const MODE = process.argv.includes("--years") ? "years" : "months";
const CREATE_BOARDS = process.argv.includes("--boards");

function isImage(o: JioFileObject) {
  const mime = String(o.mimeType || o.actualMimeType || "").toLowerCase();
  const name = String(o.objectName || "");
  return mime.includes("image") || /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(name);
}

function albumKey(o: JioFileObject): string {
  const name = String(o.objectName || "");
  const m = /^(\d{4})(\d{2})(\d{2})_/.exec(name);
  if (m) return MODE === "years" ? m[1] : `${m[1]}-${m[2]}`;
  const ts = Number(o.fileCreatedDate || o.createdDate || 0);
  if (ts > 0) {
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    return MODE === "years" ? String(y) : `${y}-${mo}`;
  }
  return "Unknown";
}

function albumName(key: string) {
  if (key === "Unknown") return "Album - Unknown Date";
  if (MODE === "years") return `Album - Photos ${key}`;
  const [y, m] = key.split("-");
  const month = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString(
    "en-US",
    { month: "short", timeZone: "UTC" }
  );
  return `Album - ${month} ${y}`;
}

async function api<T = Record<string, unknown>>(
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; body: T }> {
  const session = getActiveSession(loadConfig());
  const res = await fetch(url, {
    method,
    headers: { ...WEB_HEADERS, ...authHeaders(session) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 300) };
  }
  return { status: res.status, body: parsed as T };
}

async function collectAllFiles(client: JioClient, config: ReturnType<typeof loadConfig>) {
  const all: JioFileObject[] = [];
  let next: string | undefined;
  for (let i = 0; i < 300; i++) {
    const page = await listFiles(client, config, { limit: 100, type: "f", nextLink: next });
    all.push(...page.objects);
    if (!page.nextLink) break;
    next = page.nextLink;
  }
  return all;
}

async function ensureFolder(
  parentKey: string,
  name: string,
  existing: Map<string, string>
): Promise<string> {
  const found = existing.get(name);
  if (found) return found;
  if (DRY) {
    const fake = `dry-${name}`;
    existing.set(name, fake);
    return fake;
  }
  const res = await api<{ objectKey?: string }>("POST", `${NMS}/nms/folders`, {
    objectName: name,
    parentObjectKey: parentKey,
    sourceName: "DRIVE",
  });
  if (res.status !== 201 || !res.body.objectKey) {
    throw new Error(`Create folder failed ${name}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  existing.set(name, res.body.objectKey);
  console.error("created folder", name, res.body.objectKey);
  return res.body.objectKey;
}

async function moveBatch(files: JioFileObject[], destKey: string) {
  if (DRY || files.length === 0) return { ok: files.length, fail: 0, errors: [] as string[] };
  const body = {
    objects: files.map((f) => ({
      correlationId: USER,
      operation: "MOVE",
      objectKey: f.objectKey,
      objectName: f.objectName,
      parentObjectKey: destKey,
      sourceName: f.sourceName || "DRIVE",
      objectType: f.objectType || "FE",
      mimeType: f.mimeType,
      status: f.status || "A",
    })),
  };
  const res = await api<{
    objects?: unknown[];
    unprocessed?: { objectName?: string; errorMessage?: string }[];
  }>("PUT", `${NMS}/nms/metadata`, body);
  const fail = res.body.unprocessed?.length || 0;
  const ok = (res.body.objects?.length || 0);
  const errors = (res.body.unprocessed || []).map(
    (u) => `${u.objectName}: ${u.errorMessage}`
  );
  return { ok, fail, errors };
}

async function createBoardAlbum(name: string) {
  if (DRY) return { boardKey: `dry-${name}`, boardName: name };
  const res = await api<{ boardKey?: string; boardName?: string }>(
    "POST",
    `${BOARD}/boards`,
    { boardName: name, boardDescription: "Auto-created from photo dates", parentObjectKey: null }
  );
  if (res.status !== 201) {
    throw new Error(`Create album failed ${name}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function main() {
  const config = loadConfig();
  const client = new JioClient(config);
  console.error(`Mode=${MODE} dry=${DRY}`);

  console.error("Listing root files...");
  const files = await collectAllFiles(client, config);
  const images = files.filter(isImage);
  console.error(`files=${files.length} images=${images.length}`);

  const groups = new Map<string, JioFileObject[]>();
  for (const img of images) {
    const key = albumKey(img);
    (groups.get(key) || groups.set(key, []).get(key)!).push(img);
  }

  // Parent folder
  const rootFolders = await listFiles(client, config, { limit: 200, type: "w" });
  const existingRoot = new Map<string, string>();
  for (const f of rootFolders.objects) {
    if (f.objectName && f.objectKey) existingRoot.set(String(f.objectName), String(f.objectKey));
  }
  // also include any folders already known from previous probe if listed under files? type=w only

  const parentName = "Photo Albums";
  const parentKey = await ensureFolder(ROOT, parentName, existingRoot);

  // Existing children
  const childExisting = new Map<string, string>();
  if (!DRY && !parentKey.startsWith("dry-")) {
    const children = await listFiles(client, config, {
      folderKey: parentKey,
      limit: 200,
      type: "w",
    });
    for (const f of children.objects) {
      if (f.objectName && f.objectKey) childExisting.set(String(f.objectName), String(f.objectKey));
    }
  }

  const report: {
    albums: {
      name: string;
      key: string;
      count: number;
      folderKey?: string;
      boardKey?: string;
      moved?: number;
      failed?: number;
      errors?: string[];
    }[];
  } = { albums: [] };

  const sortedKeys = [...groups.keys()].sort();
  for (const key of sortedKeys) {
    const imgs = groups.get(key)!;
    const name = albumName(key);
    console.error(`\n=== ${name} (${imgs.length}) ===`);

    const folderKey = await ensureFolder(parentKey, name, childExisting);

    // Optional: create empty JioAICloud Album boards (files cannot be added via API yet)
    let boardKey: string | undefined;
    if (CREATE_BOARDS) {
      try {
        const board = await createBoardAlbum(name);
        boardKey = board.boardKey;
        console.error("created board album", boardKey);
      } catch (err) {
        console.error("board create skipped/failed:", err);
      }
    }

    let moved = 0;
    let failed = 0;
    const errors: string[] = [];
    const batchSize = 25;
    for (let i = 0; i < imgs.length; i += batchSize) {
      const batch = imgs.slice(i, i + batchSize);
      const result = await moveBatch(batch, folderKey);
      moved += result.ok;
      failed += result.fail;
      errors.push(...result.errors.slice(0, 5));
      console.error(`  moved batch ${i / batchSize + 1}: ok=${result.ok} fail=${result.fail}`);
      // small pause to be gentle
      await new Promise((r) => setTimeout(r, 150));
    }

    report.albums.push({
      name,
      key,
      count: imgs.length,
      folderKey,
      boardKey,
      moved,
      failed,
      errors: errors.slice(0, 10),
    });
  }

  mkdirSync(path.join(config.projectRoot, "downloads"), { recursive: true });
  const outPath = path.join(config.projectRoot, "downloads", "albums-created.json");
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), MODE, DRY, report }, null, 2));
  console.log(JSON.stringify({ outPath, albumCount: report.albums.length, totals: {
    images: images.length,
    moved: report.albums.reduce((s, a) => s + (a.moved || 0), 0),
    failed: report.albums.reduce((s, a) => s + (a.failed || 0), 0),
  }}, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
