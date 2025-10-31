// frontend/src/api/aiClient.js
const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

export async function askQuestion(query) {
  const res = await fetch(`${API_URL}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }), // <-- matches your tested payload
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}
