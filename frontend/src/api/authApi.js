// src/api/authApi.js
import { post } from "./http";

// Toggle mock mode: set true to use frontend-only auth (localStorage).
// Set false to call real backend endpoints (/api/auth/*).
const USE_MOCK = true;

const LS_SESSION = "session_v1";
const LS_USERS = "users_v1";

/* ----------------- small helpers ----------------- */
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

function b64url(s) {
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function makeFakeJwt({ sub, ttlSeconds = 3600 }) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub, iat: now, exp: now + ttlSeconds }));
  return `${header}.${payload}.`; // unsigned mock token
}

/* ----------------- session helpers ----------------- */
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

/* ----------------- mock user store ----------------- */
function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(LS_USERS)) || [];
  } catch {
    return [];
  }
}
function writeUsers(users) {
  localStorage.setItem(LS_USERS, JSON.stringify(users));
}

/* ----------------- Signup ----------------- */
export async function signup({ name, email, password }) {
  if (USE_MOCK) {
    await delay(300);
    const users = readUsers();
    const exists = users.some((u) => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      const err = new Error("Email already registered");
      err.code = "EMAIL_EXISTS";
      throw err;
    }
    const id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
    const user = { id, name: name.trim(), email: email.trim(), password, createdAt: Date.now() };
    users.push(user);
    writeUsers(users);

    const accessToken = makeFakeJwt({ sub: id, ttlSeconds: 3600 });
    const refreshToken = "mock_refresh_" + id;
    const session = { accessToken, refreshToken, user: { id, name: user.name, email: user.email } };
    setSession(session);
    return session;
  }

  // Real backend flow (expects your backend to implement /api/auth/signup)
  const data = await post("/api/auth/signup", { name, email, password });
  const session = {
    accessToken: data.accessToken || data.token,
    refreshToken: data.refreshToken,
    user: data.user,
  };
  setSession(session);
  return session;
}

/* ----------------- Login ----------------- */
export async function login({ email, password }) {
  if (USE_MOCK) {
    await delay(200);
    const users = readUsers();
    const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!u || u.password !== password) {
      const err = new Error("Invalid email or password");
      err.code = "BAD_CREDENTIALS";
      throw err;
    }
    const accessToken = makeFakeJwt({ sub: u.id, ttlSeconds: 3600 });
    const refreshToken = "mock_refresh_" + u.id;
    const session = { accessToken, refreshToken, user: { id: u.id, name: u.name, email: u.email } };
    setSession(session);
    return session;
  }

  const data = await post("/api/auth/login", { email, password });
  const session = {
    accessToken: data.accessToken || data.token,
    refreshToken: data.refreshToken,
    user: data.user,
  };
  setSession(session);
  return session;
}

/* ----------------- Logout ----------------- */
export async function logout() {
  if (USE_MOCK) {
    // clear local session (ignore server)
    await clearSession();
    return;
  }

  try {
    await post("/api/auth/logout", {});
  } catch {
    // ignore errors on logout
  }
  await clearSession();
}

/* ----------------- Refresh token ----------------- */
export async function refreshAccessToken() {
  if (USE_MOCK) {
    // In mock mode simply issue a new access token (keep same refresh token)
    const sess = getCurrentSession();
    if (!sess?.refreshToken) throw new Error("No refresh token available (mock)");
    // extract sub from old token if possible (best-effort), else use a timestamp id
    let sub = String(Date.now());
    try {
      const payload = sess.accessToken?.split?.(".")[1];
      if (payload) {
        const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
        if (json?.sub) sub = json.sub;
      }
    } catch {}
    const newAccess = makeFakeJwt({ sub, ttlSeconds: 3600 });
    const updated = { ...sess, accessToken: newAccess };
    setSession(updated);
    return updated;
  }

  // Real backend refresh
  const sess = getCurrentSession();
  if (!sess?.refreshToken) throw new Error("No refresh token available");
  const data = await post("/api/auth/refresh", { refreshToken: sess.refreshToken });
  if (!data?.accessToken) throw new Error("Refresh failed");
  const updated = { ...sess, accessToken: data.accessToken, refreshToken: data.refreshToken || sess.refreshToken, user: data.user || sess.user };
  setSession(updated);
  return updated;
}
