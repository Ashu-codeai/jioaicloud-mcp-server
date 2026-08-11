import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadConfig, WEB_HEADERS } from "../src/config.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";
import { JioClient } from "../src/api/client.ts";
import { listFiles, type JioFileObject } from "../src/api/files.ts";

const NMS = "https://jmng2-api.jioaicloud.com";
const ROOT = "58AF7DA84FBE94C9E063800B10ACCDBA";
const PHOTO_ALBUMS = "57CEFB14B180102CE063800B10AC5D4F";
const USER = "73d844860ad24aa6897f9cf9d5934c95";
const DRY = process.argv.includes("--dry-run");

const MONTH_RE = /^Album - (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/;
const MONTH_NUM: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

function yearFolderName(year: string) {
  return `Album - ${year}`;
}

function monthFolderName(yearMonth: string) {
  if (yearMonth === "Unknown") return "Album - Unknown Date";
  const [y, m] = yearMonth.split("-");
  const month = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString(
    "en-US",
    { month: "short", timeZone: "UTC" }
  );
  return `Album - ${month} ${y}`;
}

function dateKeyFromFile(o: JioFileObject): { year: string; monthKey: string } {
  const name = String(o.objectName || "");
  const m = /^(\d{4})(\d{2})(\d{2})_/.exec(name);
  if (m) return { year: m[1], monthKey: `${m[1]}-${m[2]}` };
  const ts = Number(o.fileCreatedDate || o.createdDate || 0);
  if (ts > 0) {
    const d = new Date(ts);
    const y = String(d.getUTCFullYear());
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    return { year: y, monthKey: `${y}-${mo}` };
  }
  return { year: "Unknown", monthKey: "Unknown" };
}

function isVideo(o: JioFileObject) {
  const mime = String(o.mimeType || o.actualMimeType || "").toLowerCase();
  const name = String(o.objectName || "");
  return mime.includes("video") || /\.(mp4|mov|mkv|avi|webm|3gp)$/i.test(name);
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

async function ensureFolder(
  parentKey: string,
  name: string,
  cache: Map<string, string>
): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  if (DRY) {
    const fake = `dry-${parentKey}-${name}`;
    cache.set(name, fake);
    return fake;
  }
  const res = await api<{ objectKey?: string }>("POST", `${NMS}/nms/folders`, {
    objectName: name,
    parentObjectKey: parentKey,
    sourceName: "DRIVE",
  });
  if (res.status !== 201 || !res.body.objectKey) {
    throw new Error(
      `Create folder failed ${name}: ${res.status} ${JSON.stringify(res.body)}`
    );
  }
  cache.set(name, res.body.objectKey);
  console.error("created", name, res.body.objectKey);
  return res.body.objectKey;
}

async function moveObjects(items: JioFileObject[], destKey: string) {
  if (DRY || items.length === 0) {
    return { ok: items.length, fail: 0, errors: [] as string[] };
  }
  const body = {
    objects: items.map((f) => ({
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
  return {
    ok: res.body.objects?.length || 0,
    fail: res.body.unprocessed?.length || 0,
    errors: (res.body.unprocessed || []).map(
      (u) => `${u.objectName}: ${u.errorMessage}`
    ),
  };
}

async function collectRootFiles(client: JioClient, config: ReturnType<typeof loadConfig>) {
  const all: JioFileObject[] = [];
  let next: string | undefined;
  for (let i = 0; i < 100; i++) {
    const page = await listFiles(client, config, {
      limit: 100,
      type: "f",
      nextLink: next,
    });
    all.push(...page.objects);
    if (!page.nextLink) break;
    next = page.nextLink;
  }
  return all;
}

async function listFolders(
  client: JioClient,
  config: ReturnType<typeof loadConfig>,
  folderKey: string
) {
  const page = await listFiles(client, config, {
    folderKey,
    limit: 200,
    type: "w",
  });
  return page.objects;
}

async function main() {
  const config = loadConfig();
  const client = new JioClient(config);
  console.error(`dry=${DRY}`);

  // 1) Existing month folders under Photo Albums
  const monthFolders = await listFolders(client, config, PHOTO_ALBUMS);
  console.error(`month folders at Photo Albums root: ${monthFolders.length}`);

  const yearCache = new Map<string, string>();
  // also pick up any already-created year folders
  for (const f of monthFolders) {
    const name = String(f.objectName || "");
    if (/^Album - \d{4}$/.test(name) && f.objectKey) {
      yearCache.set(name, String(f.objectKey));
    }
  }

  const nestReport: {
    month: string;
    year: string;
    moved: number;
    failed: number;
    errors: string[];
  }[] = [];

  // 2) Create year folders and move month albums into them
  for (const folder of monthFolders) {
    const name = String(folder.objectName || "");
    const m = MONTH_RE.exec(name);
    if (!m || !folder.objectKey) continue;
    const year = m[2];
    const yearName = yearFolderName(year);
    const yearKey = await ensureFolder(PHOTO_ALBUMS, yearName, yearCache);

    console.error(`nest ${name} -> ${yearName}`);
    const result = await moveObjects(
      [
        {
          ...folder,
          objectType: folder.objectType || "FR",
          sourceName: folder.sourceName || "DRIVE",
        },
      ],
      yearKey
    );
    nestReport.push({
      month: name,
      year,
      moved: result.ok,
      failed: result.fail,
      errors: result.errors,
    });
    await new Promise((r) => setTimeout(r, 100));
  }

  // Refresh year folder children map: year -> (monthName -> folderKey)
  const monthByYear = new Map<string, Map<string, string>>();
  for (const [yearName, yearKey] of yearCache) {
    const year = yearName.replace("Album - ", "");
    const children = DRY
      ? []
      : await listFolders(client, config, yearKey);
    const map = new Map<string, string>();
    for (const c of children) {
      if (c.objectName && c.objectKey) map.set(String(c.objectName), String(c.objectKey));
    }
    // Also keep cache of year folder itself for ensureFolder later
    monthByYear.set(year, map);
  }

  // 3) Organize videos from root into year/month albums
  console.error("Collecting root videos...");
  const rootFiles = await collectRootFiles(client, config);
  const videos = rootFiles.filter(isVideo);
  console.error(`root files=${rootFiles.length} videos=${videos.length}`);

  const videoGroups = new Map<string, JioFileObject[]>();
  for (const v of videos) {
    const { monthKey } = dateKeyFromFile(v);
    (videoGroups.get(monthKey) || videoGroups.set(monthKey, []).get(monthKey)!).push(v);
  }

  const videoReport: {
    monthKey: string;
    album: string;
    year: string;
    count: number;
    moved: number;
    failed: number;
    errors: string[];
  }[] = [];

  for (const monthKey of [...videoGroups.keys()].sort()) {
    const vids = videoGroups.get(monthKey)!;
    const year = monthKey === "Unknown" ? "Unknown" : monthKey.slice(0, 4);
    const yearName = yearFolderName(year);
    const yearKey = await ensureFolder(PHOTO_ALBUMS, yearName, yearCache);

    if (!monthByYear.has(year)) monthByYear.set(year, new Map());
    const monthCache = monthByYear.get(year)!;
    const album = monthFolderName(monthKey);
    const monthFolderKey = await ensureFolder(yearKey, album, monthCache);

    console.error(`\n=== videos -> ${yearName}/${album} (${vids.length}) ===`);
    let moved = 0;
    let failed = 0;
    const errors: string[] = [];
    const batchSize = 25;
    for (let i = 0; i < vids.length; i += batchSize) {
      const batch = vids.slice(i, i + batchSize);
      const result = await moveObjects(batch, monthFolderKey);
      moved += result.ok;
      failed += result.fail;
      errors.push(...result.errors.slice(0, 5));
      console.error(`  batch ${i / batchSize + 1}: ok=${result.ok} fail=${result.fail}`);
      await new Promise((r) => setTimeout(r, 150));
    }
    videoReport.push({
      monthKey,
      album,
      year,
      count: vids.length,
      moved,
      failed,
      errors: errors.slice(0, 10),
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    DRY,
    nestedMonths: {
      total: nestReport.length,
      moved: nestReport.reduce((s, x) => s + x.moved, 0),
      failed: nestReport.reduce((s, x) => s + x.failed, 0),
      details: nestReport,
    },
    videos: {
      total: videos.length,
      moved: videoReport.reduce((s, x) => s + x.moved, 0),
      failed: videoReport.reduce((s, x) => s + x.failed, 0),
      groups: videoReport,
    },
    yearFolders: [...yearCache.entries()].map(([name, key]) => ({ name, key })),
  };

  mkdirSync(path.join(config.projectRoot, "downloads"), { recursive: true });
  const outPath = path.join(
    config.projectRoot,
    "downloads",
    "year-nest-and-videos.json"
  );
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify(
      {
        outPath,
        years: summary.yearFolders.length,
        nestedMonthsMoved: summary.nestedMonths.moved,
        nestedMonthsFailed: summary.nestedMonths.failed,
        videosMoved: summary.videos.moved,
        videosFailed: summary.videos.failed,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
