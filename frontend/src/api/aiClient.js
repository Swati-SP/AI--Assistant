// src/api/aiClient.js

// ✅ Backend base URL only (no /api/ask here)
const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

/**
 * Ask a question to the backend RAG model.
 * @param {string} query - User's input question
 * @param {object} options - Optional config (e.g., timeout, history)
 * @param {Array} [options.history=[]] - Optional conversation history array
 * @returns {Promise<object>} - JSON { answer: "...", retrieved: [...], debug: {...} }
 */
async function askQuestion(query, { timeout = 30000, history = [] } = {}) {
  if (!query) throw new Error("Query text is required.");

  // Abort after timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    // ✅ Send both `query` and `history` to the backend
    const response = await fetch(`${API_URL}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        history, // 🧠 send conversation history for contextual chat
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`API ${response.status}: ${errorText}`);
    }

    // Parse backend JSON result
    const data = await response.json();
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Request timed out");
    throw error;
  }
}

// Export both named and default for flexibility
export { askQuestion };
export default askQuestion;
