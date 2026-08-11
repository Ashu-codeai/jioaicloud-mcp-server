import { MAX_DELETE_BATCH } from "../config.js";
import type { DuplicateGroup } from "./detect.js";

export function resolveDeleteIds(
  groups: DuplicateGroup[],
  opts: { groupIds?: string[]; all?: boolean } = {}
): string[] {
  let selected = groups;
  if (opts.groupIds?.length) {
    const set = new Set(opts.groupIds);
    selected = groups.filter((g) => set.has(g.groupId));
  } else if (!opts.all) {
    selected = [];
  }

  const ids: string[] = [];
  for (const g of selected) {
    for (const f of g.deleteCandidates) {
      if (f.id) ids.push(f.id);
    }
  }
  return [...new Set(ids)];
}

export function assertDeleteAllowed(
  dryRun: boolean,
  confirm: boolean,
  count: number
): void {
  if (count > MAX_DELETE_BATCH) {
    throw new Error(
      `Refusing to delete ${count} files in one call (max ${MAX_DELETE_BATCH}). Narrow groupIds or batch.`
    );
  }
  if (!dryRun && !confirm) {
    throw new Error(
      "Destructive delete requires dry_run=false AND confirm=true"
    );
  }
}
