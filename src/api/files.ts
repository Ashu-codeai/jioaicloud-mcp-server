import { PAGE_LIMIT, PATHS, type AppConfig } from "../config.js";
import { getActiveSession } from "../auth/login.js";
import type { JioClient } from "./client.js";

export interface JioFileObject {
  objectKey?: string;
  objectName?: string;
  parentObjectKey?: string;
  mimeType?: string;
  actualMimeType?: string;
  size?: number | string;
  createdDate?: number | string;
  lastModifiedDate?: number | string;
  fileCreatedDate?: number | string;
  checksum?: string;
  md5?: string;
  contentHash?: string;
  path?: string;
  folderPath?: string;
  imageTranscodeUrl?: string;
  downloadUrl?: string;
  publicUrl?: string;
  [key: string]: unknown;
}

export interface ListResult {
  objects: JioFileObject[];
  nextLink?: string | null;
  raw: Record<string, unknown>;
}

function asObjects(body: Record<string, unknown>): JioFileObject[] {
  if (Array.isArray(body.objects)) return body.objects as JioFileObject[];
  if (Array.isArray(body.files)) return body.files as JioFileObject[];
  if (Array.isArray(body)) return body as JioFileObject[];
  return [];
}

export function normalizeFile(obj: JioFileObject) {
  const rawSize = obj.size ?? obj.sizeInBytes;
  const sizeNum =
    typeof rawSize === "string" ? Number(rawSize) : Number(rawSize ?? 0);
  return {
    id: obj.objectKey || "",
    name: obj.objectName || "",
    parentId: obj.parentObjectKey || "",
    mimeType: obj.actualMimeType || obj.mimeType || "",
    size: Number.isFinite(sizeNum) ? sizeNum : 0,
    createdDate: obj.fileCreatedDate || obj.createdDate || null,
    modifiedDate: obj.lastModifiedDate || null,
    checksum: obj.checksum || obj.md5 || obj.contentHash || null,
    path: obj.path || obj.folderPath || null,
    downloadUrl: obj.downloadUrl || obj.publicUrl || null,
  };
}

export type NormalizedFile = ReturnType<typeof normalizeFile>;

export async function listFiles(
  client: JioClient,
  config: AppConfig,
  opts: {
    folderKey?: string;
    type?: "f" | "w" | "";
    limit?: number;
    sort?: string;
    nextLink?: string;
  } = {}
): Promise<ListResult> {
  if (opts.nextLink) {
    const body = await client.nmsGet<Record<string, unknown>>(opts.nextLink);
    return {
      objects: asObjects(body),
      nextLink: (body.nextLink as string) || null,
      raw: body,
    };
  }

  const session = getActiveSession(config);
  const folderKey = opts.folderKey || session.rootFolderKey;
  if (!folderKey) {
    throw new Error("No folderKey / rootFolderKey available. Re-login.");
  }

  const limit = opts.limit ?? PAGE_LIMIT;
  const typePart = opts.type ? `&type=${opts.type}` : "";
  const sort = opts.sort || "%2DlastModifiedDate";
  const path = `${PATHS.nmsMetadata}${PATHS.defaultView}?limit=${limit}&folderKey=${encodeURIComponent(folderKey)}${typePart}&sort=${sort}`;

  const body = await client.nmsGet<Record<string, unknown>>(path);
  return {
    objects: asObjects(body),
    nextLink: (body.nextLink as string) || null,
    raw: body,
  };
}

export async function listByMimeCategory(
  client: JioClient,
  category: "photos" | "videos" | "documents" | "audio" | "others",
  opts: { limit?: number; sort?: string; nextLink?: string } = {}
): Promise<ListResult> {
  if (opts.nextLink) {
    const body = await client.nmsGet<Record<string, unknown>>(opts.nextLink);
    return {
      objects: asObjects(body),
      nextLink: (body.nextLink as string) || null,
      raw: body,
    };
  }

  const limit = opts.limit ?? PAGE_LIMIT;
  const sort = opts.sort || "%2DlastModifiedDate";
  const path = `${PATHS.nmsMetadata}${PATHS.mimeTypeFilter}?limit=${limit}&mimeType=${encodeURIComponent(category)}&sort=${sort}`;

  const body = await client.nmsGet<Record<string, unknown>>(path);
  return {
    objects: asObjects(body),
    nextLink: (body.nextLink as string) || null,
    raw: body,
  };
}

export async function getFile(
  client: JioClient,
  objectKey: string
): Promise<NormalizedFile> {
  const path = `${PATHS.nmsMetadata}/info/${encodeURIComponent(objectKey)}`;
  const body = await client.nmsGet<Record<string, unknown>>(path);
  const obj = (body.object as JioFileObject) || (body as JioFileObject);
  return normalizeFile(obj);
}

export async function searchFiles(
  client: JioClient,
  query: string,
  opts: { limit?: number } = {}
): Promise<ListResult> {
  const limit = opts.limit ?? PAGE_LIMIT;
  const path = `${PATHS.searchKeyword}?q=${encodeURIComponent(query)}&limit=${limit}`;
  const body = await client.nmsGet<Record<string, unknown>>(path);
  return {
    objects: asObjects(body),
    nextLink: (body.nextLink as string) || null,
    raw: body,
  };
}

export async function trashFiles(
  client: JioClient,
  objectKeys: string[]
): Promise<Record<string, unknown>> {
  const objects = objectKeys.map((objectKey) => ({
    objectKey,
    operation: "TRASH",
  }));
  return client.nmsPut(`${PATHS.nmsMetadata}${PATHS.trash}`, { objects });
}

export async function collectAll(
  fetchPage: (nextLink?: string) => Promise<ListResult>,
  maxPages = 50
): Promise<JioFileObject[]> {
  const all: JioFileObject[] = [];
  let next: string | undefined | null = undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(next || undefined);
    all.push(...page.objects);
    if (!page.nextLink) break;
    next = page.nextLink;
  }
  return all;
}
