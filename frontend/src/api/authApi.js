// src/api/authApi.js
import { post } from "./http";

// Toggle mock mode (Vite + CRA support)
const USE_MOCK =
  String(
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_USE_MOCK_AUTH) ??
      process.env.REACT_APP_USE_MOCK_AUTH ??
      "false"
  ) === "true";

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
  return `${header}.${payload}.`;
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
  localStorage.setItem(LS_SESSION, JSON.stringify(sess));
}
export async function clearSession() {
  localStorage.removeItem(LS_SESSION);
}
export function getAccessToken() {
  return getCurrentSession()?.accessToken || null;
}
export function authHeader() {
  const t = getAccessToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* ----------------- mock mode user store ----------------- */
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
    if (exists) throw new Error("Email already registered");
    const id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
    const user = { id, name: name.trim(), email: email.trim(), password, createdAt: Date.now() };
    users.push(user);
    writeUsers(users);

    const accessToken = makeFakeJwt({ sub: id, ttlSeconds: 3600 });
    const session = { accessToken, user: { id, name: user.name, email: user.email } };
    setSession(session);
    return session;
  }

  // Real backend returns { token }
  const data = await post("/auth/signup", { name, email, password });
  const token = data.token;
  if (!token) throw new Error("Signup failed: no token returned");

  // ✅ Assign email as user.id (required for chat system)
  const session = {
    accessToken: token,
    user: { id: email, name, email },
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
    if (!u || u.password !== password) throw new Error("Invalid email or password");
    const accessToken = makeFakeJwt({ sub: u.id, ttlSeconds: 3600 });
    const session = { accessToken, user: { id: u.id, name: u.name, email: u.email } };
    setSession(session);
    return session;
  }

  // Real backend returns { token }
  const data = await post("/auth/login", { email, password });
  const token = data.token;
  if (!token) throw new Error("Login failed: no token returned");

  // ✅ Assign email as user.id (needed to load chat sessions)
  const session = {
    accessToken: token,
    user: { id: email, email, name: data.name || "" },
  };
  setSession(session);
  return session;
}

/* ----------------- Logout ----------------- */
export async function logout() {
  await clearSession();
}

/* ----------------- Refresh (no-op) ----------------- */
export async function refreshAccessToken() {
  const sess = getCurrentSession();
  if (!sess?.accessToken) throw new Error("No session");
  return sess;
}
