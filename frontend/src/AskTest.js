// frontend/src/AskTest.js
import React, { useState } from "react";
import { askQuestion } from "./api/aiClient";

export default function AskTest() {
  const [q, setQ] = useState("");
  const [resp, setResp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setErr(null); setResp(null);
    try {
      const data = await askQuestion(q);
      setResp(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>AI Assistant Test</h1>
      <form onSubmit={handleSubmit}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask something…"
          style={{ width: 320 }}
        />
        <button type="submit" disabled={loading || !q.trim()}>
          {loading ? "Asking…" : "Ask"}
        </button>
      </form>

      {err && <p style={{ color: "red" }}>{err}</p>}

      {resp && (
        <section style={{ marginTop: 24 }}>
          <h2>Answer</h2>
          <div style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>
            {resp.answer}
          </div>

          <h3>Sources</h3>
          <ul>
            {Array.isArray(resp.sources) && resp.sources.map((s, i) => (
              <li key={i}>
                {s.doc_id} — score: {Number(s.score).toFixed(3)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
