import React, { useState } from "react";
import { askQuestion } from "../api/aiClient";

export default function ChatBox() {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const query = text.trim();
    if (!query || loading) return;

    // Add the user’s message to the chat
    const newMessages = [...messages, { role: "user", text: query }];
    setMessages(newMessages);
    setText("");
    setLoading(true);

    try {
      // 🧠 Build history for contextual chat
      const history = newMessages.map((msg) => ({
        role: msg.role,
        text: msg.text,
      }));

      // 🚀 Call backend with query + history
      const data = await askQuestion(query, { history });

      // Parse returned answer: split off any appended Sources block
      const fullAnswer = data.answer || "(No response received)";
      const parts = fullAnswer.split(/\n{1,2}Sources:\s*\n/i);
      const mainAnswer = parts[0].trim();

      // Use structured retrieved metadata (fallback to empty array)
      const retrieved = data.retrieved || [];

      // Append the assistant’s response with structured sources
      setMessages([
        ...newMessages,
        { role: "assistant", text: mainAnswer, retrieved },
      ]);
    } catch (error) {
      console.error("Error:", error);
      setMessages([
        ...newMessages,
        { role: "assistant", text: "⚠️ Error: " + error.message, retrieved: [] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full">
      {/* Chat message area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 rounded-lg">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-xl max-w-[80%] ${
              msg.role === "user"
                ? "ml-auto bg-indigo-100 text-gray-900"
                : "mr-auto bg-white border border-gray-300"
            }`}
          >
            {msg.text}

            {/* Render sources only for assistant messages that include retrieved metadata */}
            {msg.role === "assistant" && msg.retrieved && msg.retrieved.length > 0 && (
              <div className="mt-2 text-sm text-gray-600">
                <strong>Sources:</strong>
                <ul className="list-disc pl-5 mt-1">
                  {msg.retrieved.map((r, idx) => (
                    <li key={idx} className="mt-1">
                      [{idx + 1}] {r.doc_id} —{" "}
                      {((r.text || "").replace(/\s+/g, " ").slice(0, 160) || "").trim()}
                      {(r.text || "").length > 160 ? "..." : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="w-full flex items-end gap-3 mt-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask me something…"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="flex-grow resize-none p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="shrink-0 bg-indigo-600 text-white px-5 py-3 rounded-xl hover:bg-indigo-700 disabled:bg-gray-400 transition-all"
          aria-label="Send message"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </div>
    </div>
  );
}
