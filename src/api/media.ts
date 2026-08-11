import type { AppConfig } from "../config.js";
import type { JioClient } from "./client.js";
import {
  collectAll,
  listByMimeCategory,
  listFiles,
  normalizeFile,
  type JioFileObject,
} from "./files.js";

export type MediaCategory = "photos" | "videos" | "documents" | "audio" | "others";

export async function listMedia(
  client: JioClient,
  category: MediaCategory,
  opts: { limit?: number; nextLink?: string; allPages?: boolean } = {}
) {
  if (opts.allPages) {
    const objects = await collectAll((nextLink) =>
      listByMimeCategory(client, category, { limit: opts.limit, nextLink })
    );
    return {
      category,
      count: objects.length,
      files: objects.map(normalizeFile),
    };
  }

  const page = await listByMimeCategory(client, category, opts);
  return {
    category,
    count: page.objects.length,
    nextLink: page.nextLink,
    files: page.objects.map(normalizeFile),
  };
}

export async function backupSummary(
  client: JioClient,
  config: AppConfig,
  opts: { sampleLimit?: number } = {}
) {
  const limit = opts.sampleLimit ?? 100;
  const categories: MediaCategory[] = [
    "photos",
    "videos",
    "documents",
    "audio",
    "others",
  ];

  const summary: Record<
    string,
    { count: number; bytes: number; hasMore: boolean }
  > = {};

  for (const category of categories) {
    try {
      const page = await listByMimeCategory(client, category, { limit });
      const files = page.objects.map(normalizeFile);
      summary[category] = {
        count: files.length,
        bytes: files.reduce((sum, f) => sum + (f.size || 0), 0),
        hasMore: Boolean(page.nextLink),
      };
    } catch {
      summary[category] = { count: 0, bytes: 0, hasMore: false };
    }
  }

  // Also peek root all-files
  let rootFiles = 0;
  let rootBytes = 0;
  try {
    const root = await listFiles(client, config, { limit, type: "f" });
    const files = root.objects.map(normalizeFile);
    rootFiles = files.length;
    rootBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  } catch {
    /* ignore */
  }

  return {
    note: "Counts are per first page unless you use list tools with allPages. hasMore=true means more pages exist.",
    categories: summary,
    rootSample: { count: rootFiles, bytes: rootBytes },
  };
}

export function categorizeLocally(obj: JioFileObject): MediaCategory {
  const mime = String(obj.actualMimeType || obj.mimeType || "").toLowerCase();
  const name = String(obj.objectName || "").toLowerCase();
  if (mime.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(name)) {
    return "photos";
  }
  if (mime.startsWith("video/") || /\.(mp4|mov|mkv|avi|webm|3gp)$/i.test(name)) {
    return "videos";
  }
  if (
    mime.startsWith("audio/") ||
    /\.(mp3|wav|aac|m4a|flac|ogg)$/i.test(name)
  ) {
    return "audio";
  }
  if (
    mime.includes("pdf") ||
    mime.includes("document") ||
    mime.includes("sheet") ||
    mime.includes("presentation") ||
    mime.includes("text") ||
    /\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i.test(name)
  ) {
    return "documents";
  }
  return "others";
}
