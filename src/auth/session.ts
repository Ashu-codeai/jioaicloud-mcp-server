import fs from "node:fs";
import path from "node:path";
import { log } from "../config.js";

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number | string;
}

export interface SessionData {
  userId: string;
  deviceKey: string;
  loginId?: string;
  mobileNumber?: string;
  emailId?: string;
  firstName?: string;
  lastName?: string;
  rootFolderKey?: string;
  dcGroupCode?: string;
  authToken: AuthToken;
  encTwoFASessionKey?: string;
  isTwoFAEnabled?: boolean | string | number;
  twoFAValidated?: boolean;
  quota?: {
    totalAllocatedQuota?: number | string;
    totalUsedQuota?: number | string;
    [key: string]: unknown;
  };
  raw?: Record<string, unknown>;
  savedAt: string;
}

function sessionPath(sessionDir: string): string {
  return path.join(sessionDir, "session.json");
}

export function loadSession(sessionDir: string): SessionData | null {
  const file = sessionPath(sessionDir);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as SessionData;
    if (!data?.authToken?.accessToken || !data.userId || !data.deviceKey) {
      return null;
    }
    return data;
  } catch (err) {
    log("Failed to read session:", err);
    return null;
  }
}

export function saveSession(sessionDir: string, session: SessionData): void {
  fs.mkdirSync(sessionDir, { recursive: true });
  const file = sessionPath(sessionDir);
  const toSave = { ...session, savedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(toSave, null, 2), { mode: 0o600 });
}

export function clearSession(sessionDir: string): void {
  const file = sessionPath(sessionDir);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function sessionFromLoginBody(
  body: Record<string, unknown>,
  deviceKey: string
): SessionData {
  const authToken = body.authToken as AuthToken;
  if (!authToken?.accessToken) {
    throw new Error("Login response missing authToken.accessToken");
  }
  return {
    userId: String(body.userId || ""),
    deviceKey: deviceKey || String((body.deviceKey as string) || ""),
    loginId: body.loginId as string | undefined,
    mobileNumber: body.mobileNumber as string | undefined,
    emailId: body.emailId as string | undefined,
    firstName: body.firstName as string | undefined,
    lastName: body.lastName as string | undefined,
    rootFolderKey: body.rootFolderKey as string | undefined,
    dcGroupCode: body.dcGroupCode as string | undefined,
    authToken,
    encTwoFASessionKey: body.encTwoFASessionKey as string | undefined,
    isTwoFAEnabled: body.isTwoFAEnabled as boolean | string | number | undefined,
    twoFAValidated: false,
    quota: body.quota as SessionData["quota"],
    raw: body,
    savedAt: new Date().toISOString(),
  };
}

export function publicSessionView(session: SessionData | null) {
  if (!session) {
    return { authenticated: false };
  }
  return {
    authenticated: true,
    userId: session.userId,
    loginId: session.loginId,
    mobileNumber: session.mobileNumber,
    emailId: session.emailId,
    firstName: session.firstName,
    lastName: session.lastName,
    rootFolderKey: session.rootFolderKey,
    dcGroupCode: session.dcGroupCode,
    twoFAValidated: Boolean(session.twoFAValidated),
    isTwoFAEnabled: session.isTwoFAEnabled,
    savedAt: session.savedAt,
  };
}
