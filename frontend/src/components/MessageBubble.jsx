import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { showToast } from "./Toast"; // ✅ use toast instead of alert

const BotAvatar = () => (
  <div className="h-9 w-9 rounded-full bg-indigo-600/90 text-white grid place-items-center shadow">
    🤖
  </div>
);
const UserAvatar = () => (
  <div className="h-9 w-9 rounded-full bg-violet-500/90 text-white grid place-items-center shadow">
    👤
  </div>
);

export default function MessageBubble({ role, text, timestamp }) {
  const isUser = role === "user";

  // Custom link renderer: open in new tab safely
  const Link = (props) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="underline decoration-indigo-400 hover:decoration-indigo-600 dark:decoration-indigo-500"
    />
  );

  // Custom code renderer with copy button
  const CodeBlock = ({ inline, className, children, ...props }) => {
    const code = String(children || "");
    if (inline) {
      return (
        <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[0.95em]">
          {code}
        </code>
      );
    }

    const copy = async () => {
      try {
        await navigator.clipboard.writeText(code);
        showToast("Code copied!"); // ✅ toast
      } catch {
        /* no-op */
      }
    };

    return (
      <div className="relative group">
        <pre className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900">
          <code className={className} {...props}>
            {code}
          </code>
        </pre>
        <button
          onClick={copy}
          aria-label="Copy code block"
          title="Copy code"
          className="absolute top-2 right-2 text-xs px-2 py-1 rounded border bg-white dark:bg-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hidden group-hover:block"
        >
          Copy
        </button>
      </div>
    );
  };

  return (
    <div
      className={`w-full flex items-start gap-3 ${
        isUser ? "justify-end" : "justify-start"
      } mb-3 animate-fadeInUp`}
    >
      {!isUser && <BotAvatar />}

      <div
        className={`max-w-[85%] rounded-3xl px-4 py-3 shadow-lg border
        backdrop-blur bg-white/70 dark:bg-gray-900/60
        ${isUser ? "border-violet-200 dark:border-violet-700" : "border-gray-200 dark:border-gray-700"}`}
      >
        <div
          className={`whitespace-pre-wrap break-words leading-relaxed text-gray-900 dark:text-gray-100 prose prose-sm max-w-none
            prose-headings:mt-2 prose-p:my-2 prose-li:my-0 dark:prose-invert
            prose-code:before:content-[''] prose-code:after:content-['']`}
        >
          {isUser ? (
            <div>{text}</div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ code: CodeBlock, a: Link }}
            >
              {text || ""}
            </ReactMarkdown>
          )}
        </div>

        <div
          className="text-[11px] mt-1 text-gray-500 dark:text-gray-400"
          title={new Date(timestamp).toLocaleString()} // small tooltip
        >
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      </div>

      {isUser && <UserAvatar />}
    </div>
  );
}
