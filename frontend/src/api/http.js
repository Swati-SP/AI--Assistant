// src/api/http.js
import { getCurrentSession, setSession, logout } from "./authApi";

/**
 * Resolve API base URL (Vite + CRA) → ALWAYS `${BASE}${path}`
 */
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) ||
  "http://127.0.0.1:8000";

export function apiBase() {
  // remove trailing slashes
  return String(API_BASE).replace(/\/+$/, "");
}

function makeUrl(path = "") {
  // ensure single slash between base and path
  const p = String(path).startsWith("/") ? path : `/${path}`;
  return `${apiBase()}${p}`;
}

/**
 * Authorization header from current session
 * – tolerate either `accessToken` or `token`
 */
function authHeader() {
  const session = getCurrentSession();
  const token = session?.accessToken || session?.token || null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Safe response handler (works for JSON or text)
 */
async function handle(res) {
  const text = await res.text(); // read safely even if not JSON
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && (data.detail || data.message)) ||
      (typeof data === "string" && data) ||
      `HTTP Error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/**
 * Low-level fetch wrapper – returns raw Response (no throwing)
 */
async function doFetch(url, options = {}) {
  const res = await fetch(url, options);
  // We DON'T throw here; callers decide. But we still parse a best-effort body.
  const text = await res.text().catch(() => null);
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { res, data };
}

/**
 * Token refresh (single-flight)
 * NOTE: your OpenAPI didn’t list /api/auth/refresh; using /auth/refresh instead.
 * If your backend has no refresh route, this will gracefully fail and trigger logout.
 */
let refreshing = false;

async function tryRefresh() {
  if (refreshing) return false;
  refreshing = true;

  const session = getCurrentSession();
  const refreshToken = session?.refreshToken;
  if (!refreshToken) {
    refreshing = false;
    return false;
  }

  try {
    const { res, data } = await doFetch(makeUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      credentials: "include",
    });

    refreshing = false;

    // Accept either {accessToken} or {token}
    const newAccess = data && typeof data === "object"
      ? data.accessToken || data.token
      : null;

    if (!res.ok || !newAccess) return false;

    const newSession = {
      ...session,
      accessToken: newAccess,
      refreshToken: (data && data.refreshToken) || session.refreshToken,
      user: (data && data.user) || session.user,
      token: undefined, // normalize to accessToken
    };
    setSession(newSession);
    return true;
  } catch {
    refreshing = false;
    return false;
  }
}

/**
 * POST helper
 * - Builds URL as `${API_BASE}${path}`
 * - Adds auth header
 * - Refreshes on 401 once (if refresh route exists)
 * - Uses safe handle() for robust error text/JSON
 */
export async function post(path, body, opts = {}) {
  const url = path.startsWith("http") ? path : makeUrl(path);

  const baseHeaders = {
    "Content-Type": "application/json",
    ...authHeader(),
    ...(opts.headers || {}),
  };

  // First attempt
  let res = await fetch(url, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(body ?? {}),
    credentials: "include",
  });

  // If unauthorized → try refresh once
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const retryHeaders = { ...baseHeaders, ...authHeader() };
      res = await fetch(url, {
        method: "POST",
        headers: retryHeaders,
        body: JSON.stringify(body ?? {}),
        credentials: "include",
      });
    } else {
      await logout();
      // Let handle() convert any body to a readable error
    }
  }

  return handle(res);
}

/**
 * GET helper
 */
export async function get(path, opts = {}) {
  const url = path.startsWith("http") ? path : makeUrl(path);
  const headers = { ...authHeader(), ...(opts.headers || {}) };

  const res = await fetch(url, {
    method: "GET",
    headers,
    credentials: "include",
  });

  return handle(res);
}
