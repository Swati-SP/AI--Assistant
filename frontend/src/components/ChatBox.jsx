import React, { useState } from "react";

export default function ChatBox({ onSend, loading }) {
  const [text, setText] = useState("");

  const handleSend = () => {
    const q = text.trim();
    if (!q || loading) return;
    onSend(q);
    setText("");
  };

  return (
    <div className="w-full flex items-end gap-3">
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
  );
}
