// src/utils/chatStore.js
// Simple per-user chat storage in localStorage

const KEY = (userId) => `chats_${userId}`;

function read(userId) {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return { sessions: [], currentId: null };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.sessions)) return { sessions: [], currentId: null };
    return data;
  } catch {
    return { sessions: [], currentId: null };
  }
}

function write(userId, data) {
  localStorage.setItem(KEY(userId), JSON.stringify(data));
}

function newSession(title = "New chat") {
  const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  const now = Date.now();
  return { id, title, createdAt: now, updatedAt: now, messages: [] };
}

export function loadAll(userId) {
  return read(userId);
}

export function createSession(userId, title = "New chat") {
  const data = read(userId);
  const session = newSession(title);
  data.sessions.unshift(session); // newest on top
  data.currentId = session.id;
  write(userId, data);
  return { ...data };
}

export function setCurrent(userId, id) {
  const data = read(userId);
  if (data.sessions.find((s) => s.id === id)) {
    data.currentId = id;
    write(userId, data);
  }
  return { ...data };
}

export function renameSession(userId, id, title) {
  const data = read(userId);
  const s = data.sessions.find((x) => x.id === id);
  if (s) {
    s.title = title.trim() || s.title;
    s.updatedAt = Date.now();
    write(userId, data);
  }
  return { ...data };
}

export function deleteSession(userId, id) {
  const data = read(userId);
  const idx = data.sessions.findIndex((x) => x.id === id);
  if (idx >= 0) {
    data.sessions.splice(idx, 1);
    // adjust currentId
    if (data.currentId === id) {
      data.currentId = data.sessions.length ? data.sessions[0].id : null;
    }
    write(userId, data);
  }
  return { ...data };
}

export function upsertMessage(userId, sessionId, message) {
  const data = read(userId);
  const s = data.sessions.find((x) => x.id === sessionId);
  if (!s) return { ...data };
  s.messages.push(message);
  s.updatedAt = Date.now();
  write(userId, data);
  return { ...data };
}

export function replaceMessages(userId, sessionId, messages) {
  const data = read(userId);
  const s = data.sessions.find((x) => x.id === sessionId);
  if (!s) return { ...data };
  s.messages = messages;
  s.updatedAt = Date.now();
  write(userId, data);
  return { ...data };
}

// Helpers to get the active session + messages
export function getCurrentSession(userId) {
  const data = read(userId);
  const s = data.sessions.find((x) => x.id === data.currentId) || null;
  return s;
}
