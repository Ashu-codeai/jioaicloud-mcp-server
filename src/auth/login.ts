import {
  ENDPOINTS,
  PATHS,
  WEB_HEADERS,
  log,
  type AppConfig,
} from "../config.js";
import { buildEnc2FAHash, createDeviceKey } from "./crypto.js";
import {
  clearSession,
  loadSession,
  publicSessionView,
  saveSession,
  sessionFromLoginBody,
  type SessionData,
} from "./session.js";

function deviceInfo(deviceKey: string) {
  return {
    deviceKey,
    model: "browser",
    deviceName: "Web Device",
    platformType: "Windows",
    platformVersion: "10",
    type: "browser",
    isWebClient: true,
  };
}

async function securityPost(
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = `${ENDPOINTS.securityURL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...WEB_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

async function securityGet(
  path: string,
  headers: Record<string, string>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = `${ENDPOINTS.securityURL}${path}`;
  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

function authHeaders(session: SessionData, enc2FAHash?: string): Record<string, string> {
  const headers: Record<string, string> = {
    ...WEB_HEADERS,
    Authorization: `Basic ${Buffer.from(session.authToken.accessToken).toString("base64")}`,
    "X-User-Id": session.userId,
    "X-Device-Key": session.deviceKey,
  };
  if (enc2FAHash) headers["X-Enc-2FAHash"] = enc2FAHash;
  return headers;
}

function isTwoFAEnabled(session: SessionData): boolean {
  const v = session.isTwoFAEnabled;
  return v === true || v === 1 || v === "1" || v === "Y" || v === "y";
}

export async function sendOtp(config: AppConfig): Promise<Record<string, unknown>> {
  // Warm up same endpoints the web app hits before login
  try {
    await fetch(`${ENDPOINTS.nmsURL}${PATHS.ping}`, { headers: { ...WEB_HEADERS } });
    await fetch(`${ENDPOINTS.securityURL}/security/web/token`, {
      headers: { ...WEB_HEADERS },
    });
  } catch {
    /* non-fatal */
  }

  const { status, body } = await securityPost(PATHS.sendOtp, {
    mobileNumber: config.mobile,
  });
  if (status >= 400) {
    throw new Error(`sendOtp failed (${status}): ${JSON.stringify(body)}`);
  }
  return { ok: true, status, response: redact(body) };
}

export async function verifyOtpAndLogin(
  config: AppConfig,
  otp: string
): Promise<SessionData> {
  const deviceKey = createDeviceKey();
  // Match web client OTP payload: deviceInfo without deviceKey
  const { status, body } = await securityPost(PATHS.otpLogin, {
    mobileNumber: config.mobile,
    emailId: "",
    otp: otp.trim(),
    deviceType: "W",
    deviceInfo: {
      model: "browser",
      deviceName: "Web Device",
      platformType: "Windows",
      platformVersion: "10",
      type: "browser",
      isWebClient: true,
    },
    isStaySignIn: true,
  });

  if (status >= 400 || body.error) {
    throw new Error(`OTP login failed (${status}): ${JSON.stringify(body)}`);
  }

  // Prefer server-provided deviceKey when present
  const session = sessionFromLoginBody(
    body,
    String(body.deviceKey || deviceKey)
  );
  if (config.id) session.loginId = config.id;
  saveSession(config.sessionDir, session);

  if (isTwoFAEnabled(session) && session.encTwoFASessionKey) {
    await unlockPassphrase(config, session);
  } else {
    session.twoFAValidated = true;
    saveSession(config.sessionDir, session);
  }

  return loadSession(config.sessionDir)!;
}

export async function unlockPassphrase(
  config: AppConfig,
  existing?: SessionData | null
): Promise<SessionData> {
  const session = existing || loadSession(config.sessionDir);
  if (!session) {
    throw new Error("No session to unlock. Run jio_send_otp + jio_verify_otp first, or jio_import_session.");
  }
  if (!session.encTwoFASessionKey) {
    session.twoFAValidated = true;
    saveSession(config.sessionDir, session);
    return session;
  }

  const enc2FAHash = buildEnc2FAHash(
    session.userId,
    config.passphrase,
    session.encTwoFASessionKey
  );

  const { status, body } = await securityGet(
    PATHS.validate2fa,
    authHeaders(session, enc2FAHash)
  );

  if (status >= 400 || body.error) {
    throw new Error(
      `Passphrase unlock failed (${status}): ${JSON.stringify(body)}. Check JIOAICLOUD_PASSPHRASE.`
    );
  }

  session.twoFAValidated = true;
  saveSession(config.sessionDir, session);
  log("Passphrase 2FA validated");
  return session;
}

export async function refreshSession(config: AppConfig): Promise<SessionData> {
  const session = loadSession(config.sessionDir);
  if (!session?.authToken?.refreshToken) {
    throw new Error("No refreshable session");
  }

  const { status, body } = await securityPost(
    PATHS.refreshToken,
    {
      refreshToken: session.authToken.refreshToken,
      deviceType: "W",
    },
    authHeaders(session)
  );

  if (status >= 400 || body.error) {
    throw new Error(`Token refresh failed (${status}): ${JSON.stringify(body)}`);
  }

  if (body.accessToken) {
    session.authToken.accessToken = String(body.accessToken);
  }
  if (body.refreshToken) {
    session.authToken.refreshToken = String(body.refreshToken);
  }
  if (body.expiresIn !== undefined) {
    session.authToken.expiresIn = body.expiresIn as number | string;
  }
  if (body.encTwoFASessionKey) {
    session.encTwoFASessionKey = String(body.encTwoFASessionKey);
  }
  saveSession(config.sessionDir, session);
  return session;
}

/**
 * Primary login for Mobile + Passphrase.
 * Uses saved session when possible; optional JIOAICLOUD_OTP for first-time login.
 */
export async function login(config: AppConfig): Promise<Record<string, unknown>> {
  let session = loadSession(config.sessionDir);

  if (session) {
    try {
      session = await refreshSession(config);
    } catch (err) {
      log("Refresh failed, will try OTP if provided:", err);
      session = null;
    }
  }

  if (!session && config.otp) {
    session = await verifyOtpAndLogin(config, config.otp);
  }

  if (!session) {
    return {
      authenticated: false,
      needsOtp: true,
      message:
        "No valid session. JioAICloud requires a one-time OTP for the first login from this machine, then your passphrase unlocks the account. Call jio_send_otp, set JIOAICLOUD_OTP (or pass otp to jio_verify_otp), then jio_login again. Day-to-day use is Mobile + Passphrase via the saved session.",
      mobile: config.mobile,
      idConfigured: Boolean(config.id),
    };
  }

  if (isTwoFAEnabled(session) && !session.twoFAValidated) {
    session = await unlockPassphrase(config, session);
  } else if (session.encTwoFASessionKey && !session.twoFAValidated) {
    session = await unlockPassphrase(config, session);
  }

  return {
    ...publicSessionView(session),
    message: "Logged in successfully",
  };
}

export async function authStatus(config: AppConfig) {
  return publicSessionView(loadSession(config.sessionDir));
}

export async function importSession(
  config: AppConfig,
  userDataJson: string
): Promise<Record<string, unknown>> {
  const body = JSON.parse(userDataJson) as Record<string, unknown>;
  const deviceKey =
    String(body.deviceKey || "") || createDeviceKey();
  const session = sessionFromLoginBody(body, deviceKey);
  saveSession(config.sessionDir, session);
  if (session.encTwoFASessionKey) {
    await unlockPassphrase(config, session);
  }
  return publicSessionView(loadSession(config.sessionDir));
}

export function logoutLocal(config: AppConfig): Record<string, unknown> {
  clearSession(config.sessionDir);
  return { authenticated: false, message: "Local session cleared" };
}

function redact(body: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...body };
  for (const key of Object.keys(copy)) {
    if (/token|secret|password|passphrase/i.test(key)) {
      copy[key] = "[redacted]";
    }
  }
  return copy;
}

export function getActiveSession(config: AppConfig): SessionData {
  const session = loadSession(config.sessionDir);
  if (!session?.authToken?.accessToken) {
    throw new Error("Not authenticated. Call jio_login first.");
  }
  return session;
}

export { authHeaders };
