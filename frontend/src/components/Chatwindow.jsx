// src/components/ChatWindow.jsx
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatWindow({
  messages = [],
  loading = false,
  onSuggest = () => {},
}) {
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, loading]);

  const showWelcome = !loading && messages.length === 0;

  return (
    <div
      ref={listRef}
      className="h-[60vh] overflow-y-auto p-4 rounded-3xl bg-white/70 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800"
    >
      {showWelcome ? (
        <WelcomePanel onSuggest={onSuggest} />
      ) : (
        <>
          {messages.map((msg, index) => {
            const fromUser = msg.role === "user";
            return (
              <div
                key={index}
                className={`mb-4 flex ${fromUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-2xl ${
                    fromUser
                      ? "bg-indigo-500 text-white"
                      : "bg-gray-100 dark:bg-gray-800/80 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>

                  <p className="text-[10px] opacity-60 mt-1">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ""}
                  </p>

                  {msg.sources && msg.sources.length > 0 && !fromUser && (
                    <div className="mt-2 text-[11px] opacity-80">
                      <b>Sources:</b>
                      <ul className="list-disc ml-4">
                        {msg.sources.slice(0, 4).map((src, i) => (
                          <li key={i}>
                            {src.title ?? `Source ${i + 1}`}
                            {src.url ? (
                              <a
                                href={src.url}
                                className="ml-2 underline text-xs"
                                target="_blank"
                                rel="noreferrer"
                              >
                                (link)
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Assistant is typing…</span>
              <span className="h-2 w-2 rounded-full bg-gray-500 animate-pulse" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------ Welcome Panel ------------------------ */
function WelcomePanel({ onSuggest }) {
  const suggestions = [
    "How to apply for leave?",
    "What is the reimbursement process?",
    "Share the WFH policy summary.",
    "Whom to contact for IT issues?",
    "List company holidays this year.",
    "How to update bank details in HRMS?",
  ];

  return (
    <div className="w-full">
      <div className="mx-auto max-w-3xl">
        <div className="text-center mb-4">
          <h2 className="text-xl font-semibold">Welcome 👋</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Ask about HR, IT, or Finance. Try one of these:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suggestions.map((q) => (
            <button
              key={q}
              onClick={() => onSuggest(q)}
              className="text-left rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 hover:bg-gray-50 dark:hover:bg-gray-800/70 transition px-4 py-3 shadow-sm"
            >
              • {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
