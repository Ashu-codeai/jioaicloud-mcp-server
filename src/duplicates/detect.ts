import type { NormalizedFile } from "../api/files.js";

export type KeepPolicy = "newest" | "oldest" | "largest" | "smallest";

export interface DuplicateGroup {
  groupId: string;
  key: string;
  reason: "checksum" | "name_size" | "name_size_date";
  keep: NormalizedFile;
  deleteCandidates: NormalizedFile[];
  reclaimableBytes: number;
}

function toTime(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  const d = Date.parse(String(value));
  return Number.isFinite(d) ? d : 0;
}

function pickKeep(files: NormalizedFile[], policy: KeepPolicy): NormalizedFile {
  const sorted = [...files];
  switch (policy) {
    case "oldest":
      sorted.sort((a, b) => toTime(a.modifiedDate || a.createdDate) - toTime(b.modifiedDate || b.createdDate));
      break;
    case "largest":
      sorted.sort((a, b) => b.size - a.size);
      break;
    case "smallest":
      sorted.sort((a, b) => a.size - b.size);
      break;
    case "newest":
    default:
      sorted.sort((a, b) => toTime(b.modifiedDate || b.createdDate) - toTime(a.modifiedDate || a.createdDate));
      break;
  }
  return sorted[0];
}

export function findDuplicates(
  files: NormalizedFile[],
  opts: {
    policy?: KeepPolicy;
    dateWindowMs?: number;
  } = {}
): DuplicateGroup[] {
  const policy = opts.policy || "newest";
  const dateWindowMs = opts.dateWindowMs ?? 0;
  const groups: DuplicateGroup[] = [];

  const byChecksum = new Map<string, NormalizedFile[]>();
  const noChecksum: NormalizedFile[] = [];

  for (const file of files) {
    if (!file.id) continue;
    if (file.checksum) {
      const key = `checksum:${file.checksum}`;
      const list = byChecksum.get(key) || [];
      list.push(file);
      byChecksum.set(key, list);
    } else {
      noChecksum.push(file);
    }
  }

  let groupCounter = 0;
  for (const [key, list] of byChecksum) {
    if (list.length < 2) continue;
    const keep = pickKeep(list, policy);
    const deleteCandidates = list.filter((f) => f.id !== keep.id);
    groups.push({
      groupId: `g${++groupCounter}`,
      key,
      reason: "checksum",
      keep,
      deleteCandidates,
      reclaimableBytes: deleteCandidates.reduce((s, f) => s + f.size, 0),
    });
  }

  const byNameSize = new Map<string, NormalizedFile[]>();
  for (const file of noChecksum) {
    const key = `name_size:${file.name.toLowerCase()}|${file.size}`;
    const list = byNameSize.get(key) || [];
    list.push(file);
    byNameSize.set(key, list);
  }

  for (const [key, list] of byNameSize) {
    if (list.length < 2) continue;

    let clusters: NormalizedFile[][] = [list];
    if (dateWindowMs > 0) {
      clusters = [];
      const remaining = [...list].sort(
        (a, b) =>
          toTime(a.modifiedDate || a.createdDate) -
          toTime(b.modifiedDate || b.createdDate)
      );
      while (remaining.length) {
        const seed = remaining.shift()!;
        const cluster = [seed];
        for (let i = remaining.length - 1; i >= 0; i--) {
          const tSeed = toTime(seed.modifiedDate || seed.createdDate);
          const tOther = toTime(
            remaining[i].modifiedDate || remaining[i].createdDate
          );
          if (Math.abs(tSeed - tOther) <= dateWindowMs) {
            cluster.push(remaining[i]);
            remaining.splice(i, 1);
          }
        }
        clusters.push(cluster);
      }
    }

    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const keep = pickKeep(cluster, policy);
      const deleteCandidates = cluster.filter((f) => f.id !== keep.id);
      groups.push({
        groupId: `g${++groupCounter}`,
        key,
        reason: dateWindowMs > 0 ? "name_size_date" : "name_size",
        keep,
        deleteCandidates,
        reclaimableBytes: deleteCandidates.reduce((s, f) => s + f.size, 0),
      });
    }
  }

  return groups;
}

export function duplicateReport(groups: DuplicateGroup[]) {
  const reclaimableBytes = groups.reduce((s, g) => s + g.reclaimableBytes, 0);
  const deleteCount = groups.reduce((s, g) => s + g.deleteCandidates.length, 0);
  return {
    groupCount: groups.length,
    deleteCandidateCount: deleteCount,
    reclaimableBytes,
    reclaimableMB: Math.round((reclaimableBytes / (1024 * 1024)) * 100) / 100,
    groups: groups.map((g) => ({
      groupId: g.groupId,
      reason: g.reason,
      keepId: g.keep.id,
      keepName: g.keep.name,
      deleteIds: g.deleteCandidates.map((d) => d.id),
      deleteNames: g.deleteCandidates.map((d) => d.name),
      reclaimableBytes: g.reclaimableBytes,
    })),
  };
}
