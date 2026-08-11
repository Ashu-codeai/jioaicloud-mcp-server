import { PATHS, type AppConfig } from "../config.js";
import { getActiveSession } from "../auth/login.js";
import type { JioClient } from "./client.js";
import {
  listFiles,
  normalizeFile,
  trashFiles,
  type JioFileObject,
  type NormalizedFile,
} from "./files.js";

export interface FolderAlbum extends NormalizedFile {
  kind: "folder";
}

export interface BoardAlbum {
  kind: "board";
  id: string;
  name: string;
  description?: string;
  imageCount?: number;
  videoCount?: number;
  filesCount?: number;
  createdDate?: number | null;
  modifiedDate?: number | null;
  isShareAlbum?: boolean;
  raw?: Record<string, unknown>;
}

export interface MoveResult {
  moved: string[];
  failed: { id?: string; name?: string; error?: string }[];
  raw: Record<string, unknown>;
}

function sessionUserId(config: AppConfig): string {
  const session = getActiveSession(config);
  if (!session.userId) throw new Error("Session missing userId. Re-login.");
  return session.userId;
}

function rootFolderKey(config: AppConfig): string {
  const session = getActiveSession(config);
  if (!session.rootFolderKey) {
    throw new Error("No rootFolderKey available. Re-login.");
  }
  return session.rootFolderKey;
}

export async function listFolderAlbums(
  client: JioClient,
  config: AppConfig,
  opts: { parentId?: string; limit?: number; nextLink?: string } = {}
): Promise<{ count: number; nextLink?: string | null; albums: FolderAlbum[] }> {
  const page = await listFiles(client, config, {
    folderKey: opts.parentId || rootFolderKey(config),
    type: "w",
    limit: opts.limit,
    nextLink: opts.nextLink,
  });
  return {
    count: page.objects.length,
    nextLink: page.nextLink,
    albums: page.objects.map((o) => ({
      ...normalizeFile(o),
      kind: "folder" as const,
    })),
  };
}

export async function createFolderAlbum(
  client: JioClient,
  config: AppConfig,
  opts: { name: string; parentId?: string }
): Promise<FolderAlbum> {
  const parentObjectKey = opts.parentId || rootFolderKey(config);
  const body = await client.nmsPost<JioFileObject>(PATHS.createFolder, {
    objectName: opts.name,
    parentObjectKey,
    sourceName: "DRIVE",
  });
  return { ...normalizeFile(body), kind: "folder" };
}

export async function renameFolderAlbum(
  client: JioClient,
  config: AppConfig,
  opts: { id: string; name: string; parentId?: string }
): Promise<MoveResult> {
  const userId = sessionUserId(config);
  const parentObjectKey = opts.parentId || rootFolderKey(config);
  const raw = await client.nmsPut<Record<string, unknown>>(PATHS.nmsMetadata, {
    objects: [
      {
        correlationId: userId,
        operation: "FRN",
        objectKey: opts.id,
        objectName: opts.name,
        parentObjectKey,
        objectType: "FR",
        sourceName: "DRIVE",
        status: "A",
      },
    ],
  });
  return summarizeMutation(raw, [opts.id]);
}

export async function moveToAlbum(
  client: JioClient,
  config: AppConfig,
  opts: {
    ids: string[];
    albumId: string;
    /** Optional metadata keyed by objectKey for better move success */
    items?: {
      id: string;
      name?: string;
      objectType?: string;
      sourceName?: string;
      mimeType?: string;
    }[];
  }
): Promise<MoveResult> {
  if (!opts.ids.length) throw new Error("ids must not be empty");
  const userId = sessionUserId(config);
  const metaById = new Map((opts.items || []).map((i) => [i.id, i]));

  // Prefer caller metadata; otherwise fetch each file (folders may 404 on info).
  const objects = [];
  for (const id of opts.ids) {
    const meta = metaById.get(id);
    let name = meta?.name;
    let objectType = meta?.objectType || "FE";
    let sourceName = meta?.sourceName || "DRIVE";
    let mimeType = meta?.mimeType;
    if (!name) {
      try {
        const info = await client.nmsGet<Record<string, unknown>>(
          `${PATHS.nmsMetadata}/info/${encodeURIComponent(id)}`
        );
        const obj = (info.object as JioFileObject) || (info as JioFileObject);
        name = String(obj.objectName || id);
        objectType = String(obj.objectType || objectType);
        sourceName = String(obj.sourceName || sourceName);
        mimeType = String(obj.mimeType || obj.actualMimeType || mimeType || "");
      } catch {
        name = id;
      }
    }
    objects.push({
      correlationId: userId,
      operation: "MOVE",
      objectKey: id,
      objectName: name,
      parentObjectKey: opts.albumId,
      objectType,
      sourceName,
      mimeType,
      status: "A",
    });
  }

  const raw = await client.nmsPut<Record<string, unknown>>(PATHS.nmsMetadata, {
    objects,
  });
  return summarizeMutation(raw, opts.ids);
}

export async function deleteFolderAlbums(
  client: JioClient,
  ids: string[],
  opts: { dry_run?: boolean; confirm?: boolean } = {}
): Promise<Record<string, unknown>> {
  const dryRun = opts.dry_run !== false;
  const confirm = opts.confirm === true;
  if (!ids.length) throw new Error("ids must not be empty");
  if (ids.length > 50) {
    throw new Error("Max 50 albums per delete call");
  }
  if (dryRun) {
    return { dry_run: true, wouldTrash: ids, count: ids.length };
  }
  if (!confirm) {
    throw new Error(
      "Destructive album delete requires dry_run=false AND confirm=true"
    );
  }
  const result = await trashFiles(client, ids);
  return { dry_run: false, trashed: ids, result };
}

function normalizeBoard(b: Record<string, unknown>): BoardAlbum {
  return {
    kind: "board",
    id: String(b.boardKey || ""),
    name: String(b.boardName || ""),
    description: b.boardDescription ? String(b.boardDescription) : undefined,
    imageCount: Number(b.imageCount ?? 0),
    videoCount: Number(b.videoCount ?? 0),
    filesCount: Number(b.filesCount ?? 0),
    createdDate: (b.createdDate as number) || null,
    modifiedDate: (b.lastModifiedDate as number) || null,
    isShareAlbum: Boolean(b.isShareAlbum),
    raw: b,
  };
}

export async function listBoardAlbums(
  client: JioClient
): Promise<{ count: number; albums: BoardAlbum[] }> {
  const body = await client.boardGet<{ boards?: Record<string, unknown>[] }>(
    PATHS.albumsList
  );
  const boards = Array.isArray(body.boards) ? body.boards : [];
  return {
    count: boards.length,
    albums: boards.map(normalizeBoard),
  };
}

export async function createBoardAlbum(
  client: JioClient,
  opts: { name: string; description?: string }
): Promise<BoardAlbum> {
  const body = await client.boardPost<Record<string, unknown>>(
    PATHS.albumDetails,
    {
      boardName: opts.name,
      boardDescription: opts.description || "",
      parentObjectKey: null,
    }
  );
  return normalizeBoard(body);
}

function summarizeMutation(
  raw: Record<string, unknown>,
  requestedIds: string[]
): MoveResult {
  const movedObjs = Array.isArray(raw.objects)
    ? (raw.objects as Record<string, unknown>[])
    : [];
  const failedObjs = Array.isArray(raw.unprocessed)
    ? (raw.unprocessed as Record<string, unknown>[])
    : [];
  const moved = movedObjs
    .map((o) => String(o.objectKey || ""))
    .filter(Boolean);
  const failed = failedObjs.map((o) => ({
    id: o.objectKey ? String(o.objectKey) : undefined,
    name: o.objectName ? String(o.objectName) : undefined,
    error: o.errorMessage
      ? String(o.errorMessage)
      : o.error
        ? String(o.error)
        : "unprocessed",
  }));
  // If API returns empty objects but also empty unprocessed, treat as unknown
  if (!moved.length && !failed.length && requestedIds.length) {
    return {
      moved: [],
      failed: requestedIds.map((id) => ({
        id,
        error: "No confirmation from API (empty objects/unprocessed)",
      })),
      raw,
    };
  }
  return { moved, failed, raw };
}
