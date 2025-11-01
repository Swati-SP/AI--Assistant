// src/api/docsApi.js
// Handles document upload and summarization using FastAPI backend.

import { getCurrentSession } from "./authApi";

/* ✅ Detect API base URL automatically (supports Vite & CRA builds) */
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) ||
  "http://127.0.0.1:8000";

/**
 * 🧠 Build Authorization header if user is logged in
 */
function authHeader() {
  const sess = getCurrentSession();
  return sess?.accessToken ? { Authorization: `Bearer ${sess.accessToken}` } : {};
}

/**
 * 📤 Upload one or multiple documents to the backend
 * @param {File[]} files - Array of File objects from file input
 * @param {(progress:number, file:File)=>void} [onProgress] - optional progress callback
 * @returns {Promise<{uploaded: Array<{filename:string, size:number}>}>}
 */
export async function uploadDocuments(files = [], onProgress) {
  if (!files?.length) throw new Error("No files selected for upload.");

  const form = new FormData();
  for (const file of files) {
    form.append("files", file, file.name);
  }

  const url = `${API_BASE}/api/docs/upload`;
  console.log("📤 Uploading to:", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      // ⚠️ Do NOT manually set Content-Type — browser will handle it
      ...authHeader(),
    },
    body: form,
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg =
      text ||
      (res.status === 401
        ? "Unauthorized. Please log in again."
        : `Upload failed (HTTP ${res.status})`);
    console.error("❌ Upload error:", msg);
    throw new Error(msg);
  }

  const data = await res.json().catch(() => ({}));
  console.log("✅ Upload response:", data);

  // Ensure consistent structure
  if (!data?.uploaded) {
    const uploaded = files.map((f) => ({
      filename: f.name,
      size: f.size,
    }));
    return { uploaded };
  }

  return data;
}

/**
 * 🧾 Summarize uploaded files by filename using backend summarize endpoint
 * Backend: POST /api/docs/summarize
 * Request body: ["file1.txt", "file2.pdf"]
 * Response: { summaries: [{ filename, summary }] }
 *
 * @param {string[]} filenames
 * @returns {Promise<{summaries: Array<{filename:string, summary:string}>}>}
 */
export async function summarizeFiles(filenames = []) {
  if (!Array.isArray(filenames) || filenames.length === 0) {
    throw new Error("No filenames provided for summarizeFiles.");
  }

  const url = `${API_BASE}/api/docs/summarize`;
  console.log("🧾 Summarizing files:", filenames);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
    },
    body: JSON.stringify(filenames),
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg =
      text ||
      (res.status === 401
        ? "Unauthorized. Please log in again."
        : `Summarize failed (HTTP ${res.status})`);
    console.error("❌ Summarization error:", msg);
    throw new Error(msg);
  }

  const data = await res.json().catch(() => ({}));
  console.log("✅ Summarization response:", data);

  // Ensure consistent return structure
  if (!data?.summaries) {
    return { summaries: [] };
  }
  return data;
}
