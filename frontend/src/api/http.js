// src/api/http.js
import { getCurrentSession, setSession, logout } from "./authApi";

/**
 * Resolve API base URL
 * Supports both Vite (VITE_API_BASE) and CRA (REACT_APP_API_URL)
 */
const base =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) ||
  "http://127.0.0.1:8000";

export function apiBase() {
  return base.replace(/\/+$/, ""); // remove trailing slashes
}

/**
 * Create Authorization header if token exists
 */
function authHeader() {
  const session = getCurrentSession();
  const token = session?.accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Safe fetch wrapper (handles JSON parsing)
 */
async function doFetch(url, options = {}, parseJson = true) {
  const res = await fetch(url, options);
  let data = null;

  if (parseJson) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  return { res, data };
}

/**
 * Try to refresh the access token using stored refresh token
 * Returns true if refresh succeeded and session updated
 */
let refreshing = false;

async function tryRefresh() {
  if (refreshing) return false; // prevent simultaneous refresh calls
  refreshing = true;

  const session = getCurrentSession();
  const refreshToken = session?.refreshToken;
  if (!refreshToken) {
    refreshing = false;
    return false;
  }

  try {
    const { res, data } = await doFetch(`${apiBase()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      credentials: "include",
    });

    refreshing = false;

    if (!res.ok || !data?.accessToken) return false;

    const newSession = {
      ...session,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || session.refreshToken,
      user: data.user || session.user,
    };

    setSession(newSession);
    return true;
  } catch {
    refreshing = false;
    return false;
  }
}

/**
 * Unified POST request wrapper
 *  - Adds Authorization header automatically
 *  - Handles token refresh on 401
 */
export async function post(path, body, opts = {}) {
  const url = path.startsWith("http") ? path : `${apiBase()}${path}`;
  let headers = {
    "Content-Type": "application/json",
    ...authHeader(),
    ...(opts.headers || {}),
  };

  // First request attempt
  let { res, data } = await doFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
    credentials: "include",
  });

  // If unauthorized → try refresh once
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers = { ...headers, ...authHeader() };
      ({ res, data } = await doFetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
        credentials: "include",
      }));
    } else {
      await logout();
      throw new Error("Session expired. Please log in again.");
    }
  }

  // If still not OK → throw
  if (!res.ok) {
    const msg =
      data?.detail ||
      data?.message ||
      (typeof data === "string" ? data : null) ||
      `HTTP Error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/**
 * Simple GET helper (optional)
 */
export async function get(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${apiBase()}${path}`;
  const headers = {
    ...authHeader(),
    ...(opts.headers || {}),
  };
  const { res, data } = await doFetch(url, {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const msg =
      data?.detail ||
      data?.message ||
      (typeof data === "string" ? data : null) ||
      `HTTP Error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
