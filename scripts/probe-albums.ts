import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadConfig, ENDPOINTS, WEB_HEADERS } from "../src/config.ts";
import { JioClient } from "../src/api/client.ts";
import { getActiveSession, authHeaders } from "../src/auth/login.ts";
import { listFiles, normalizeFile } from "../src/api/files.ts";

const BOARD_URL = "https://boards.jioaicloud.com";

async function collectRootFiles(client: JioClient, config: ReturnType<typeof loadConfig>) {
  const all: ReturnType<typeof normalizeFile>[] = [];
  let next: string | undefined;
  for (let page = 0; page < 200; page++) {
    const res = await listFiles(client, config, {
      limit: 100,
      type: "f",
      nextLink: next,
    });
    all.push(...res.objects.map(normalizeFile));
    if (!res.nextLink) break;
    next = res.nextLink;
    if (page % 10 === 0) console.error(`listed page ${page}, files=${all.length}`);
  }
  return all;
}

function isImage(f: { name: string; mimeType: string }) {
  const mime = (f.mimeType || "").toLowerCase();
  return mime.includes("image") || /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(f.name);
}

function dateKeyFromFile(f: { name: string; createdDate: unknown }) {
  const m = /^(\d{4})(\d{2})(\d{2})_/.exec(f.name);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const ts = Number(f.createdDate);
  if (Number.isFinite(ts) && ts > 0) {
    const d = new Date(ts);
    return d.toISOString().slice(0, 10);
  }
  return "unknown";
}

function monthKey(day: string) {
  return day === "unknown" ? "unknown" : day.slice(0, 7);
}

function clusterByGap(
  images: { id: string; name: string; day: string; created: number }[],
  gapDays = 3
) {
  const sorted = [...images].sort((a, b) => a.created - b.created || a.name.localeCompare(b.name));
  const clusters: { start: string; end: string; count: number; files: typeof images }[] = [];
  let cur: typeof images = [];
  let last = -Infinity;
  const gapMs = gapDays * 24 * 60 * 60 * 1000;
  for (const img of sorted) {
    if (cur.length && img.created - last > gapMs) {
      clusters.push({
        start: cur[0].day,
        end: cur[cur.length - 1].day,
        count: cur.length,
        files: cur,
      });
      cur = [];
    }
    cur.push(img);
    last = img.created;
  }
  if (cur.length) {
    clusters.push({
      start: cur[0].day,
      end: cur[cur.length - 1].day,
      count: cur.length,
      files: cur,
    });
  }
  return clusters;
}

function albumNameForCluster(c: { start: string; end: string; count: number }) {
  if (c.start === c.end) return `${c.start} (${c.count})`;
  return `${c.start} to ${c.end} (${c.count})`;
}

async function probeBoardApis(config: ReturnType<typeof loadConfig>) {
  const session = getActiveSession(config);
  const headers = { ...authHeaders(session) };
  const probes: { label: string; method: string; url: string; body?: unknown }[] = [
    { label: "list albums sync", method: "GET", url: `${BOARD_URL}/boards/sync/initial` },
    { label: "list albums metadata", method: "GET", url: `${BOARD_URL}/boards/metadata` },
    { label: "list boards root", method: "GET", url: `${BOARD_URL}/boards` },
  ];

  const results: Record<string, unknown> = {};
  for (const p of probes) {
    try {
      const res = await fetch(p.url, {
        method: p.method,
        headers: { ...WEB_HEADERS, ...headers, ...(p.body ? { "Content-Type": "application/json" } : {}) },
        body: p.body ? JSON.stringify(p.body) : undefined,
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* keep text */
      }
      results[p.label] = { status: res.status, body: parsed };
      console.error(p.label, res.status, typeof parsed === "object" ? Object.keys(parsed as object) : String(parsed).slice(0, 120));
    } catch (err) {
      results[p.label] = { error: String(err) };
    }
  }
  return results;
}

async function main() {
  const config = loadConfig();
  const client = new JioClient(config);
  const outDir = path.join(config.projectRoot, "downloads");
  mkdirSync(outDir, { recursive: true });

  console.error("Probing board APIs...");
  const apiProbe = await probeBoardApis(config);

  console.error("Collecting root files...");
  const files = await collectRootFiles(client, config);
  const images = files.filter(isImage).map((f) => {
    const day = dateKeyFromFile(f);
    const fromName = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(f.name);
    let created = Number(f.createdDate) || 0;
    if (fromName) {
      created = Date.UTC(
        Number(fromName[1]),
        Number(fromName[2]) - 1,
        Number(fromName[3]),
        Number(fromName[4]),
        Number(fromName[5]),
        Number(fromName[6])
      );
    }
    return { id: f.id, name: f.name, day, month: monthKey(day), created, mimeType: f.mimeType };
  });

  const byMonth: Record<string, number> = {};
  for (const img of images) byMonth[img.month] = (byMonth[img.month] || 0) + 1;

  const clusters = clusterByGap(images, 3).filter((c) => c.count >= 2);
  const singles = clusterByGap(images, 3).filter((c) => c.count < 2);

  const albumPlan = clusters.map((c) => ({
    name: albumNameForCluster(c),
    start: c.start,
    end: c.end,
    count: c.count,
    sampleNames: c.files.slice(0, 5).map((f) => f.name),
    objectKeys: c.files.map((f) => f.id),
  }));

  // Also propose year albums as coarser grouping
  const byYear: Record<string, typeof images> = {};
  for (const img of images) {
    const y = img.day.slice(0, 4);
    (byYear[y] ||= []).push(img);
  }
  const yearAlbums = Object.entries(byYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, imgs]) => ({
      name: `Photos ${year}`,
      count: imgs.length,
      objectKeys: imgs.map((i) => i.id),
    }));

  const monthAlbums = Object.entries(
    images.reduce((acc: Record<string, typeof images>, img) => {
      (acc[img.month] ||= []).push(img);
      return acc;
    }, {})
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, imgs]) => ({
      name: month === "unknown" ? "Photos Unknown Date" : `Photos ${month}`,
      count: imgs.length,
      objectKeys: imgs.map((i) => i.id),
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      rootFiles: files.length,
      images: images.length,
      videos: files.filter((f) => (f.mimeType || "").includes("video") || /\.mp4$/i.test(f.name)).length,
      eventClusters: albumPlan.length,
      singletonImages: singles.length,
      months: Object.keys(byMonth).length,
      years: Object.keys(byYear).length,
    },
    byMonth,
    yearAlbums: yearAlbums.map(({ name, count }) => ({ name, count })),
    monthAlbums: monthAlbums.map(({ name, count }) => ({ name, count })),
    eventAlbums: albumPlan.map(({ name, start, end, count, sampleNames }) => ({
      name,
      start,
      end,
      count,
      sampleNames,
    })),
    apiProbe,
  };

  writeFileSync(path.join(outDir, "album-plan.json"), JSON.stringify({ ...report, monthAlbums, yearAlbums, eventAlbums: albumPlan }, null, 2));
  writeFileSync(path.join(outDir, "album-plan-summary.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
