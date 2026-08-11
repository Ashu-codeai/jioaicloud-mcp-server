import { PATHS } from "../config.js";
import type { JioClient } from "./client.js";
import { getActiveSession } from "../auth/login.js";
import type { AppConfig } from "../config.js";

export async function storageUsage(client: JioClient, config: AppConfig) {
  const session = getActiveSession(config);
  const fromSession = session.quota || {};

  let live: Record<string, unknown> = {};
  try {
    live = await client.securityGet<Record<string, unknown>>(PATHS.userDetails);
  } catch {
    /* fall back to session quota */
  }

  const quota = (live.quota as Record<string, unknown>) || fromSession;
  const allocated = Number(
    quota.totalAllocatedQuota ?? quota.allocated ?? 0
  );
  const used = Number(quota.totalUsedQuota ?? quota.used ?? 0);

  return {
    userId: session.userId,
    totalAllocatedBytes: allocated,
    totalUsedBytes: used,
    freeBytes: allocated > used ? allocated - used : null,
    percentUsed:
      allocated > 0 ? Math.round((used / allocated) * 10000) / 100 : null,
    quota,
    profile: {
      firstName: live.firstName || session.firstName,
      lastName: live.lastName || session.lastName,
      mobileNumber: live.mobileNumber || session.mobileNumber,
      emailId: live.emailId || session.emailId,
    },
  };
}
