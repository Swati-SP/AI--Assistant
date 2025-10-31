// src/api/authApi.js
import { post } from "./http";

const LS_SESSION = "session_v1";

/**
 * Session helpers
 */
export function getCurrentSession() {
  try {
    return JSON.parse(localStorage.getItem(LS_SESSION));
  } catch {
    return null;
  }
}

export function setSession(sess) {
  // sess should be { accessToken, refreshToken, user }
  localStorage.setItem(LS_SESSION, JSON.stringify(sess));
}

export async function clearSession() {
  localStorage.removeItem(LS_SESSION);
}

/**
 * Signup (real backend)
 * expects: { name, email, password }
 * backend returns: { accessToken, refreshToken, user }
 */
export async function signup({ name, email, password }) {
  const data = await post("/api/auth/signup", { name, email, password });
  const session = {
    accessToken: data.accessToken || data.token,
    refreshToken: data.refreshToken,
    user: data.user,
  };
  setSession(session);
  return session;
}

/**
 * Login (real backend)
 * expects: { email, password }
 */
export async function login({ email, password }) {
  const data = await post("/api/auth/login", { email, password });
  const session = {
    accessToken: data.accessToken || data.token,
    refreshToken: data.refreshToken,
    user: data.user,
  };
  setSession(session);
  return session;
}

/**
 * Logout
 * Attempts to call server logout (if implemented), then clears local session.
 */
export async function logout() {
  try {
    // try server-side logout if endpoint exists
    await post("/api/auth/logout", {});
  } catch (err) {
    // ignore server errors during logout
  }
  await clearSession();
}

/**
 * Refresh access token using refresh token.
 * This function will call backend refresh endpoint and update stored session
 * (backend should validate refresh token and return a new accessToken).
 */
export async function refreshAccessToken() {
  const sess = getCurrentSession();
  if (!sess?.refreshToken) throw new Error("No refresh token available");

  const data = await post("/api/auth/refresh", { refreshToken: sess.refreshToken });
  if (!data?.accessToken) throw new Error("Refresh failed");

  const updated = {
    ...sess,
    accessToken: data.accessToken,
  };
  setSession(updated);
  return updated;
}
