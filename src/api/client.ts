import { ENDPOINTS, WEB_HEADERS, log, type AppConfig } from "../config.js";
import { authHeaders, getActiveSession, refreshSession } from "../auth/login.js";
import type { SessionData } from "../auth/session.js";

export class JioApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = "JioApiError";
  }
}

export class JioClient {
  constructor(private config: AppConfig) {}

  nmsBase(session: SessionData): string {
    // Default JAWS; JMNG users get redirected via nextLink / dcGroupCode in practice
    if (session.dcGroupCode === "JMNG") return "https://jmng1-api.jioaicloud.com";
    if (session.dcGroupCode === "JMNG2") return "https://jmng2-api.jioaicloud.com";
    return ENDPOINTS.nmsURL;
  }

  async request<T = Record<string, unknown>>(
    method: string,
    url: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      retryOnAuth?: boolean;
    } = {}
  ): Promise<T> {
    const retryOnAuth = options.retryOnAuth !== false;
    let session = getActiveSession(this.config);
    const headers = {
      ...authHeaders(session),
      ...(options.headers || {}),
    };

    const init: RequestInit = {
      method,
      headers,
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    let res = await fetch(url, init);
    if ((res.status === 401 || res.status === 403) && retryOnAuth) {
      log("Auth error, refreshing session and retrying once");
      try {
        session = await refreshSession(this.config);
        const retryHeaders = {
          ...authHeaders(session),
          ...(options.headers || {}),
        };
        res = await fetch(url, { ...init, headers: retryHeaders });
      } catch (err) {
        log("Refresh during retry failed:", err);
      }
    }

    const text = await res.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }

    if (!res.ok) {
      throw new JioApiError(
        `HTTP ${res.status} for ${method} ${url}`,
        res.status,
        parsed
      );
    }
    return parsed as T;
  }

  async nmsGet<T = Record<string, unknown>>(pathAndQuery: string): Promise<T> {
    const session = getActiveSession(this.config);
    const url = pathAndQuery.startsWith("http")
      ? pathAndQuery
      : `${this.nmsBase(session)}${pathAndQuery}`;
    return this.request<T>("GET", url);
  }

  async nmsPut<T = Record<string, unknown>>(
    path: string,
    body: unknown
  ): Promise<T> {
    const session = getActiveSession(this.config);
    const url = path.startsWith("http") ? path : `${this.nmsBase(session)}${path}`;
    return this.request<T>("PUT", url, { body });
  }

  async nmsPost<T = Record<string, unknown>>(
    path: string,
    body: unknown
  ): Promise<T> {
    const session = getActiveSession(this.config);
    const url = path.startsWith("http") ? path : `${this.nmsBase(session)}${path}`;
    return this.request<T>("POST", url, { body });
  }

  async securityGet<T = Record<string, unknown>>(path: string): Promise<T> {
    return this.request<T>("GET", `${ENDPOINTS.securityURL}${path}`);
  }

  async boardGet<T = Record<string, unknown>>(pathAndQuery: string): Promise<T> {
    const url = pathAndQuery.startsWith("http")
      ? pathAndQuery
      : `${ENDPOINTS.boardURL}${pathAndQuery}`;
    return this.request<T>("GET", url);
  }

  async boardPost<T = Record<string, unknown>>(
    path: string,
    body: unknown
  ): Promise<T> {
    const url = path.startsWith("http") ? path : `${ENDPOINTS.boardURL}${path}`;
    return this.request<T>("POST", url, { body });
  }
}
