import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// quiet:true is required — dotenv tips on stdout break MCP JSON-RPC.
dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

export const APP_VERSION = "3.0.0";

/** Public client headers embedded in the JioAICloud web app. */
export const WEB_HEADERS = {
  "X-Api-Key": "c153b48e-d8a1-48a0-a40d-293f1dc5be0e",
  "X-App-Secret": "ODc0MDE2M2EtNGY0MC00YmU2LTgwZDUtYjNlZjIxZGRkZjlj",
  "X-Client-Details": `clientType:WEB; appVersion:${APP_VERSION}`,
  "Content-Type": "application/json; charset=UTF-8",
  Accept: "application/json; charset=UTF-8",
  "X-Device-Type": "W",
} as const;

export const ENDPOINTS = {
  securityURL: "https://api.jioaicloud.com",
  nmsURL: "https://jaws-api.jioaicloud.com",
  downloadURL: "https://jaws-dl.jioaicloud.com",
  aseURL: "https://jaws-api.jioaicloud.com",
  boardURL: "https://boards.jioaicloud.com",
} as const;

export const PATHS = {
  sendOtp: "/account/login/otp/send",
  otpLogin: "/account/otp/login",
  refreshToken: "/account/token/refresh",
  logout: "/security/users/logout",
  userDetails: "/security/users",
  validate2fa: "/2fa/validation",
  nmsMetadata: "/nms/metadata",
  defaultView: "/defaultview/myfiles/v1",
  mimeTypeFilter: "/mimetype/myfiles/v1",
  trash: "/trash",
  deleteForever: "/delete",
  searchKeyword: "/ase/search/keyword",
  ping: "/nms/ping",
  createFolder: "/nms/folders",
  albumsList: "/boards/sync/initial",
  albumDetails: "/boards",
  /** POST body: { objects: [{ objectKey }] } */
  boardAddition: (boardKey: string) => `/boards/${boardKey}/addition`,
} as const;

export const PAGE_LIMIT = 100;
export const MAX_DELETE_BATCH = 50;

export interface AppConfig {
  id: string;
  mobile: string;
  passphrase: string;
  otp?: string;
  sessionDir: string;
  downloadDir: string;
  projectRoot: string;
}

/** Normalize to JioAICloud web format: +91XXXXXXXXXX (13 chars). */
export function normalizeMobile(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, "").trim();
  if (/^\+91\d{10}$/.test(cleaned)) return cleaned;
  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  throw new Error(
    `Invalid JIOAICLOUD_MOBILE "${raw}". Use 10-digit Indian mobile, or +91XXXXXXXXXX.`
  );
}

export function loadConfig(): AppConfig {
  const mobileRaw = (process.env.JIOAICLOUD_MOBILE || "").trim();
  const passphrase = (process.env.JIOAICLOUD_PASSPHRASE || "").trim();
  const id = (process.env.JIOAICLOUD_ID || "").trim();
  const otp = (process.env.JIOAICLOUD_OTP || "").trim() || undefined;

  if (!mobileRaw) {
    throw new Error(
      "Missing JIOAICLOUD_MOBILE. Copy .env.example to .env and fill credentials."
    );
  }
  if (!passphrase) {
    throw new Error(
      "Missing JIOAICLOUD_PASSPHRASE. Copy .env.example to .env and fill credentials."
    );
  }

  const mobile = normalizeMobile(mobileRaw);

  return {
    id,
    mobile,
    passphrase,
    otp,
    sessionDir:
      process.env.JIOAICLOUD_SESSION_DIR ||
      path.join(projectRoot, ".session"),
    downloadDir:
      process.env.JIOAICLOUD_DOWNLOAD_DIR ||
      path.join(projectRoot, "downloads"),
    projectRoot,
  };
}

export function log(...args: unknown[]): void {
  console.error("[jioaicloud-mcp]", ...args);
}
