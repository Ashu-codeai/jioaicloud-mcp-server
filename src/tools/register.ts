import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config.js";
import { MAX_DELETE_BATCH } from "../config.js";
import {
  authStatus,
  importSession,
  login,
  logoutLocal,
  sendOtp,
  unlockPassphrase,
  verifyOtpAndLogin,
} from "../auth/login.js";
import { publicSessionView } from "../auth/session.js";
import { JioClient } from "../api/client.js";
import {
  collectAll,
  getFile,
  listByMimeCategory,
  listFiles,
  normalizeFile,
  searchFiles,
  trashFiles,
} from "../api/files.js";
import { backupSummary, listMedia } from "../api/media.js";
import { storageUsage } from "../api/storage.js";
import { downloadFile, exportInventory } from "../api/download.js";
import { duplicateReport, findDuplicates } from "../duplicates/detect.js";
import { assertDeleteAllowed, resolveDeleteIds } from "../duplicates/policy.js";
import {
  addFilesToBoardAlbum,
  createBoardAlbum,
  createFolderAlbum,
  deleteFolderAlbums,
  listBoardAlbums,
  listFolderAlbums,
  moveToAlbum,
  renameFolderAlbum,
} from "../api/albums.js";

function text(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

// In-memory cache of last duplicate find for delete_duplicates
let lastDuplicateGroups: ReturnType<typeof findDuplicates> = [];

export function registerTools(server: McpServer, config: AppConfig): void {
  const client = new JioClient(config);

  server.registerTool(
    "jio_login",
    {
      description:
        "Log in to JioAICloud using env credentials (Mobile + Passphrase). Uses saved session when possible. For first-time login on this machine, send OTP first (jio_send_otp / jio_verify_otp) or set JIOAICLOUD_OTP.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return text(await login(config));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_send_otp",
    {
      description:
        "Send login OTP SMS to JIOAICLOUD_MOBILE (needed only for first login when no local session exists).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return text(await sendOtp(config));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_verify_otp",
    {
      description:
        "Verify OTP and establish a session, then unlock with passphrase from env.",
      inputSchema: z.object({
        otp: z.string().min(4).describe("OTP received on mobile"),
      }),
    },
    async ({ otp }) => {
      try {
        const session = await verifyOtpAndLogin(config, otp);
        return text({
          ...publicSessionView(session),
          message: "OTP verified and passphrase unlocked (if enabled)",
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_unlock_passphrase",
    {
      description: "Unlock account passphrase (2FA) using JIOAICLOUD_PASSPHRASE.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const session = await unlockPassphrase(config);
        return text(publicSessionView(session));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_auth_status",
    {
      description: "Show whether a local JioAICloud session exists (no secrets).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return text(await authStatus(config));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_import_session",
    {
      description:
        "Import a browser userData JSON blob (from localStorage) to create a local session, then unlock with passphrase.",
      inputSchema: z.object({
        userDataJson: z
          .string()
          .describe("JSON string of JioAICloud userData from browser localStorage"),
      }),
    },
    async ({ userDataJson }) => {
      try {
        return text(await importSession(config, userDataJson));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_logout",
    {
      description: "Clear the local saved session.",
      inputSchema: z.object({}),
    },
    async () => text(logoutLocal(config))
  );

  server.registerTool(
    "jio_storage_usage",
    {
      description: "Get storage quota / usage for the logged-in account.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return text(await storageUsage(client, config));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_list_files",
    {
      description: "List files/folders under a folder (defaults to root).",
      inputSchema: z.object({
        folderKey: z.string().optional(),
        type: z.enum(["f", "w", ""]).optional().describe("f=files, w=folders"),
        limit: z.number().int().min(1).max(1000).optional(),
        nextLink: z.string().optional(),
        sort: z.string().optional(),
      }),
    },
    async (args) => {
      try {
        const page = await listFiles(client, config, args);
        return text({
          count: page.objects.length,
          nextLink: page.nextLink,
          files: page.objects.map(normalizeFile),
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_list_photos",
    {
      description: "List backed-up photos.",
      inputSchema: z.object({
        limit: z.number().int().optional(),
        nextLink: z.string().optional(),
        allPages: z.boolean().optional(),
      }),
    },
    async (args) => {
      try {
        return text(await listMedia(client, "photos", args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_list_videos",
    {
      description: "List backed-up videos.",
      inputSchema: z.object({
        limit: z.number().int().optional(),
        nextLink: z.string().optional(),
        allPages: z.boolean().optional(),
      }),
    },
    async (args) => {
      try {
        return text(await listMedia(client, "videos", args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_list_documents",
    {
      description: "List backed-up documents.",
      inputSchema: z.object({
        limit: z.number().int().optional(),
        nextLink: z.string().optional(),
        allPages: z.boolean().optional(),
      }),
    },
    async (args) => {
      try {
        return text(await listMedia(client, "documents", args));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_get_file",
    {
      description: "Get metadata for a single file by objectKey/id.",
      inputSchema: z.object({
        id: z.string().describe("objectKey"),
      }),
    },
    async ({ id }) => {
      try {
        return text(await getFile(client, id));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_search_files",
    {
      description: "Search files by keyword.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().optional(),
      }),
    },
    async ({ query, limit }) => {
      try {
        const page = await searchFiles(client, query, { limit });
        return text({
          count: page.objects.length,
          nextLink: page.nextLink,
          files: page.objects.map(normalizeFile),
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_backup_summary",
    {
      description:
        "Summarize photo/video/document/audio/other backup counts and bytes (first page sample per category).",
      inputSchema: z.object({
        sampleLimit: z.number().int().optional(),
      }),
    },
    async ({ sampleLimit }) => {
      try {
        return text(await backupSummary(client, config, { sampleLimit }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_find_duplicates",
    {
      description:
        "Find duplicate files among photos/videos/documents (or a custom list). Groups by checksum when available, else name+size.",
      inputSchema: z.object({
        category: z
          .enum(["photos", "videos", "documents", "audio", "others", "all"])
          .optional()
          .default("documents"),
        policy: z
          .enum(["newest", "oldest", "largest", "smallest"])
          .optional()
          .default("newest"),
        maxPages: z.number().int().min(1).max(200).optional().default(20),
        dateWindowMs: z.number().int().min(0).optional().default(0),
      }),
    },
    async ({ category, policy, maxPages, dateWindowMs }) => {
      try {
        const cats =
          category === "all"
            ? (["photos", "videos", "documents"] as const)
            : [category];
        const files = [];
        for (const cat of cats) {
          const objects = await collectAll(
            (nextLink) => listByMimeCategory(client, cat, { nextLink }),
            maxPages
          );
          files.push(...objects.map(normalizeFile));
        }
        lastDuplicateGroups = findDuplicates(files, { policy, dateWindowMs });
        return text({
          scanned: files.length,
          ...duplicateReport(lastDuplicateGroups),
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_duplicate_report",
    {
      description: "Return the last jio_find_duplicates report from this session.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!lastDuplicateGroups.length) {
        return text({
          message: "No duplicate results cached. Run jio_find_duplicates first.",
        });
      }
      return text(duplicateReport(lastDuplicateGroups));
    }
  );

  server.registerTool(
    "jio_delete_files",
    {
      description:
        "Move files to trash by objectKey ids. dry_run=true by default. Real delete requires dry_run=false and confirm=true.",
      inputSchema: z.object({
        ids: z.array(z.string()).min(1).max(MAX_DELETE_BATCH),
        dry_run: z.boolean().optional().default(true),
        confirm: z.boolean().optional().default(false),
      }),
    },
    async ({ ids, dry_run, confirm }) => {
      try {
        assertDeleteAllowed(dry_run, confirm, ids.length);
        if (dry_run) {
          return text({
            dry_run: true,
            wouldTrash: ids,
            count: ids.length,
          });
        }
        const result = await trashFiles(client, ids);
        return text({ dry_run: false, trashed: ids, result });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_delete_duplicates",
    {
      description:
        "Trash delete-candidates from the last jio_find_duplicates run. dry_run=true by default; real delete needs dry_run=false and confirm=true.",
      inputSchema: z.object({
        groupIds: z.array(z.string()).optional(),
        all: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true and groupIds omitted, delete all candidates"),
        dry_run: z.boolean().optional().default(true),
        confirm: z.boolean().optional().default(false),
      }),
    },
    async ({ groupIds, all, dry_run, confirm }) => {
      try {
        if (!lastDuplicateGroups.length) {
          throw new Error("No duplicate groups cached. Run jio_find_duplicates first.");
        }
        const ids = resolveDeleteIds(lastDuplicateGroups, { groupIds, all });
        if (!ids.length) {
          throw new Error(
            "No delete candidates resolved. Pass groupIds or all=true."
          );
        }
        assertDeleteAllowed(dry_run, confirm, ids.length);
        if (dry_run) {
          return text({
            dry_run: true,
            wouldTrash: ids,
            count: ids.length,
            reclaimableBytes: lastDuplicateGroups
              .filter((g) => !groupIds?.length || groupIds.includes(g.groupId))
              .reduce((s, g) => s + g.reclaimableBytes, 0),
          });
        }
        const result = await trashFiles(client, ids);
        return text({ dry_run: false, trashed: ids, result });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_download_file",
    {
      description: "Download a file by objectKey to the local downloads folder.",
      inputSchema: z.object({
        id: z.string(),
        destPath: z.string().optional(),
      }),
    },
    async ({ id, destPath }) => {
      try {
        return text(await downloadFile(client, config, id, destPath));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_export_inventory",
    {
      description:
        "Export an inventory of photos/videos/documents (or all) to JSON/CSV under downloads/.",
      inputSchema: z.object({
        category: z
          .enum(["photos", "videos", "documents", "audio", "others", "all"])
          .optional()
          .default("all"),
        format: z.enum(["json", "csv"]).optional().default("json"),
        maxPages: z.number().int().optional().default(20),
        filename: z.string().optional(),
      }),
    },
    async ({ category, format, maxPages, filename }) => {
      try {
        const cats =
          category === "all"
            ? (["photos", "videos", "documents", "audio", "others"] as const)
            : [category];
        const files = [];
        for (const cat of cats) {
          const objects = await collectAll(
            (nextLink) => listByMimeCategory(client, cat, { nextLink }),
            maxPages
          );
          files.push(...objects.map(normalizeFile));
        }
        return text(exportInventory(config, files, format, filename));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_list_albums",
    {
      description:
        "List albums. kind=folder lists folders under a parent (default root) — these are the album folders used for organizing media. kind=board lists native JioAICloud Albums.",
      inputSchema: z.object({
        kind: z.enum(["folder", "board"]).optional().default("folder"),
        parentId: z
          .string()
          .optional()
          .describe("Parent folder key when kind=folder (defaults to root)"),
        limit: z.number().int().min(1).max(1000).optional(),
        nextLink: z.string().optional(),
      }),
    },
    async ({ kind, parentId, limit, nextLink }) => {
      try {
        if (kind === "board") {
          return text(await listBoardAlbums(client));
        }
        return text(await listFolderAlbums(client, config, { parentId, limit, nextLink }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_create_album",
    {
      description:
        "Create an album. kind=folder creates a My Files folder (recommended for organizing photos/videos). kind=board creates a native JioAICloud Album; use jio_add_to_board to add existing Drive files.",
      inputSchema: z.object({
        name: z.string().min(1).max(100),
        kind: z.enum(["folder", "board"]).optional().default("folder"),
        parentId: z
          .string()
          .optional()
          .describe("Parent folder key for kind=folder (defaults to root)"),
        description: z
          .string()
          .optional()
          .describe("Optional description for kind=board"),
      }),
    },
    async ({ name, kind, parentId, description }) => {
      try {
        if (kind === "board") {
          return text(await createBoardAlbum(client, { name, description }));
        }
        return text(await createFolderAlbum(client, config, { name, parentId }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_rename_album",
    {
      description:
        "Rename a folder album by objectKey/id. parentId should be the current parent folder key when known.",
      inputSchema: z.object({
        id: z.string().describe("Album/folder objectKey"),
        name: z.string().min(1).max(100),
        parentId: z.string().optional(),
      }),
    },
    async ({ id, name, parentId }) => {
      try {
        return text(await renameFolderAlbum(client, config, { id, name, parentId }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_move_to_album",
    {
      description:
        "Move files or folders into a folder album by destination albumId (folder objectKey). Pass optional items[] with name/objectType/sourceName for best results. For native board albums, use jio_add_to_board instead.",
      inputSchema: z.object({
        albumId: z.string().describe("Destination folder album objectKey"),
        ids: z.array(z.string()).min(1).max(50),
        items: z
          .array(
            z.object({
              id: z.string(),
              name: z.string().optional(),
              objectType: z.string().optional(),
              sourceName: z.string().optional(),
              mimeType: z.string().optional(),
            })
          )
          .optional(),
      }),
    },
    async ({ albumId, ids, items }) => {
      try {
        return text(await moveToAlbum(client, config, { albumId, ids, items }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_add_to_board",
    {
      description:
        "Add existing Drive files into a native JioAICloud board album by boardKey. Files stay in My Files (link/copy into the board). Max 50 ids per call.",
      inputSchema: z.object({
        boardId: z.string().describe("Destination board album boardKey"),
        ids: z
          .array(z.string())
          .min(1)
          .max(50)
          .describe("Drive objectKey ids to add"),
      }),
    },
    async ({ boardId, ids }) => {
      try {
        return text(await addFilesToBoardAlbum(client, { boardId, ids }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "jio_delete_album",
    {
      description:
        "Move folder album(s) to Trash by objectKey ids. dry_run=true by default. Real delete requires dry_run=false and confirm=true. Native board album delete is not supported yet.",
      inputSchema: z.object({
        ids: z.array(z.string()).min(1).max(MAX_DELETE_BATCH),
        dry_run: z.boolean().optional().default(true),
        confirm: z.boolean().optional().default(false),
      }),
    },
    async ({ ids, dry_run, confirm }) => {
      try {
        return text(await deleteFolderAlbums(client, ids, { dry_run, confirm }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );
}
