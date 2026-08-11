import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AppConfig } from "../config.js";
import { ENDPOINTS } from "../config.js";
import type { JioClient } from "../api/client.js";
import { getActiveSession } from "../auth/login.js";
import { authHeaders } from "../auth/login.js";
import type { NormalizedFile } from "../api/files.js";

export async function downloadFile(
  client: JioClient,
  config: AppConfig,
  objectKey: string,
  destPath?: string
): Promise<Record<string, unknown>> {
  const session = getActiveSession(config);
  fs.mkdirSync(config.downloadDir, { recursive: true });

  // Prefer NMS download endpoint patterns used by web client
  const candidates = [
    `${client.nmsBase(session)}/download/${encodeURIComponent(objectKey)}`,
    `${ENDPOINTS.downloadURL}/download/${encodeURIComponent(objectKey)}`,
    `${client.nmsBase(session)}/nms/metadata/download/${encodeURIComponent(objectKey)}`,
  ];

  let lastError: unknown;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: authHeaders(session) });
      if (!res.ok) {
        lastError = `HTTP ${res.status} for ${url}`;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const disposition = res.headers.get("content-disposition") || "";
      const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(disposition);
      const filename =
        (match && decodeURIComponent(match[1])) ||
        `${objectKey}.bin`;
      const out =
        destPath ||
        path.join(config.downloadDir, path.basename(filename));
      fs.writeFileSync(out, buf);
      const sha256 = createHash("sha256").update(buf).digest("hex");
      return {
        ok: true,
        objectKey,
        path: out,
        bytes: buf.length,
        sha256,
        sourceUrl: url,
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Download failed for ${objectKey}: ${String(lastError)}`);
}

export function exportInventory(
  config: AppConfig,
  files: NormalizedFile[],
  format: "json" | "csv" = "json",
  filename?: string
): Record<string, unknown> {
  fs.mkdirSync(config.downloadDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = filename || `inventory-${stamp}`;
  const outPath = path.join(
    config.downloadDir,
    format === "csv" ? `${base}.csv` : `${base}.json`
  );

  if (format === "csv") {
    const header = [
      "id",
      "name",
      "parentId",
      "mimeType",
      "size",
      "createdDate",
      "modifiedDate",
      "checksum",
      "path",
    ];
    const rows = files.map((f) =>
      header
        .map((h) => {
          const v = String((f as Record<string, unknown>)[h] ?? "");
          return `"${v.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    fs.writeFileSync(outPath, [header.join(","), ...rows].join("\n"), "utf8");
  } else {
    fs.writeFileSync(outPath, JSON.stringify(files, null, 2), "utf8");
  }

  return {
    ok: true,
    path: outPath,
    count: files.length,
    format,
  };
}
