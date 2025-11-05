// src/api/aiClient.js
import { getCurrentSession } from "./authApi";

const API_URL =
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API_BASE ||
  "http://127.0.0.1:8000";

export async function askQuestion(query, history = []) {
  if (!query) throw new Error("Query is required");

  // ✅ Get token correctly
  const session = getCurrentSession();
  const token = session?.accessToken || session?.token || "";

  const res = await fetch(`${API_URL}/api/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}), // ✅ correct token header
    },
    body: JSON.stringify({ query, history }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(
      (data && typeof data === "object" && (data.detail || data.message)) ||
        text ||
        `HTTP ${res.status}`
    );
  }

  return data; // { answer, retrieved, debug }
}

export default askQuestion;
