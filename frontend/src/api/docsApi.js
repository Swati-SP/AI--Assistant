// src/api/docsApi.js
// Upload documents securely using JWT (no mock mode)

import { getCurrentSession } from "./authApi";

// ✅ Detect API base URL (Vite or CRA compatible)
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) ||
  "http://127.0.0.1:8000";

/**
 * Build Authorization header if logged in
 */
function authHeader() {
  const sess = getCurrentSession();
  return sess?.accessToken ? { Authorization: `Bearer ${sess.accessToken}` } : {};
}

/**
 * Upload multiple documents (real backend only)
 * @param {File[]} files - Array of files from input
 * @param {(progress:number, file:File)=>void} [onProgress] - optional callback for progress %
 * @returns {Promise<{uploaded: Array<{id:string, filename:string, size:number}>}>}
 */
export async function uploadDocuments(files = [], onProgress) {
  if (!files.length) {
    throw new Error("No files selected for upload.");
  }

  // Create FormData for multipart/form-data upload
  const form = new FormData();
  for (const file of files) {
    form.append("files", file, file.name);
  }

  // POST to backend — adjust endpoint if your backend differs
  const url = `${API_BASE}/api/docs/upload`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      // ❗️Don't set Content-Type manually — browser does it automatically for FormData
      ...authHeader(),
    },
    body: form,
    credentials: "include", // allows cookies (if backend uses them)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const errMsg =
      text ||
      (res.status === 401
        ? "Unauthorized. Please log in again."
        : `Upload failed (HTTP ${res.status})`);
    throw new Error(errMsg);
  }

  // Parse response (expected: { uploaded: [{ id, filename, size }] })
  const data = await res.json().catch(() => ({}));

  // Fallback shape if backend doesn’t return uploaded list
  if (!data?.uploaded) {
    const uploaded = files.map((f) => ({
      id: `${f.name}-${Date.now()}`,
      filename: f.name,
      size: f.size,
    }));
    return { uploaded };
  }

  return data;
}
