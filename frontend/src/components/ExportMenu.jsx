import React from "react";

export default function ExportMenu({ messages = [] }) {
  const isEmpty = !messages || messages.length === 0;

  const formatTime = (ts) =>
    new Date(ts).toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      year: "numeric",
      month: "short",
      day: "2-digit",
    });

  const handlePrintPDF = () => {
    if (isEmpty) {
      alert("No messages to export yet.");
      return;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>AI Assistant — Chat Export</title>
<style>
  :root { --bg:#ffffff; --fg:#0f172a; --muted:#64748b; --bot:#eef2ff; --user:#ede9fe; --border:#e5e7eb; }
  * { box-sizing: border-box; }
  body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: var(--bg); color: var(--fg); margin: 0; padding: 24px; }
  .wrap { max-width: 800px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 16px; }
  .meta { color: var(--muted); font-size: 12px; margin-bottom: 20px; }
  .msg { padding: 14px 16px; border: 1px solid var(--border); border-radius: 14px; margin: 12px 0; }
  .msg.user { background: var(--user); }
  .msg.assistant { background: var(--bot); }
  .role { font-weight: 600; margin-bottom: 6px; }
  .time { font-size: 11px; color: var(--muted); margin-top: 6px; }
  pre { background:#0b1020; color:#e5e7eb; padding:12px; border-radius:10px; overflow:auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  .sources { margin-top: 8px; padding-left: 16px; }
  .src { font-size: 13px; margin: 6px 0; }
  .src-title { font-weight: 600; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="no-print" style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px;">
      <h1>AI Assistant — Chat Export</h1>
      <button onclick="window.print()" style="padding:8px 12px; border:1px solid #d1d5db; border-radius:8px; background:#fff; cursor:pointer;">Print / Save PDF</button>
    </div>
    <div class="meta">Exported on ${new Date().toLocaleString()}</div>
    ${messages
      .map((m) => {
        const safe = (s) =>
          (s || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br/>");
        const body = safe(m.content);
        const srcs = Array.isArray(m.sources) && m.sources.length
          ? `<div class="sources">
               ${m.sources
                 .map(
                   (s) => `<div class="src">
                     <span class="src-title">${(s.title || "Source")
                       .toString()
                       .replace(/</g, "&lt;")
                       .replace(/>/g, "&gt;")}</span>
                     ${s.url ? ` — <a href="${s.url}" target="_blank" rel="noopener">link</a>` : ""}
                     ${s.text ? `<div>${safe(s.text)}</div>` : ""}
                   </div>`
                 )
                 .join("")}
             </div>`
          : "";
        return `<div class="msg ${m.role}">
                  <div class="role">${m.role === "user" ? "You" : "Assistant"}</div>
                  <div class="content">${body}</div>
                  ${srcs}
                  <div class="time">${formatTime(m.timestamp)}</div>
                </div>`;
      })
      .join("")}
  </div>
</body>
</html>`;

    const w = window.open("", "_blank");
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const handleDownloadJSON = () => {
    if (isEmpty) {
      alert("No messages to export yet.");
      return;
    }
    const blob = new Blob([JSON.stringify(messages, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `chat-export-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ✅ NEW: Export Markdown
  const handleDownloadMarkdown = () => {
    if (isEmpty) {
      alert("No messages to export yet.");
      return;
    }

    const esc = (s = "") =>
      s.replace(/```/g, "\\`\\`\\`"); // avoid breaking fenced blocks

    const md = [
      `# AI Assistant — Chat Export`,
      `*Exported:* ${new Date().toLocaleString()}`,
      ``,
      ...messages.flatMap((m) => {
        const header = `### ${m.role === "user" ? "You" : "Assistant"}  —  _${formatTime(m.timestamp)}_`;
        const body = m.role === "assistant"
          ? m.content || ""
          : `> ${m.content || ""}`; // quote user messages for readability

        const srcs = Array.isArray(m.sources) && m.sources.length
          ? [
              ``,
              `**Sources:**`,
              ...m.sources.map((s, i) => {
                const title = s.title || `Source ${i + 1}`;
                const link = s.url ? ` — [link](${s.url})` : "";
                const snippet = s.text ? `\n> ${esc(s.text).split("\n").join("\n> ")}` : "";
                return `- ${title}${link}${snippet}`;
              }),
            ]
          : [];

        // Wrap assistant code fences safely if present (we keep as-is)
        return [header, "", body, ...srcs, ""];
      }),
    ].join("\n");

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `chat-export-${ts}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handlePrintPDF}
        className="text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 hover:bg-gray-50"
        title="Open print dialog and save as PDF"
      >
        📄 Save PDF
      </button>
      <button
        onClick={handleDownloadMarkdown}
        className="text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 hover:bg-gray-50"
        title="Download conversation as Markdown"
      >
        📝 Markdown
      </button>
      <button
        onClick={handleDownloadJSON}
        className="text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 hover:bg-gray-50"
        title="Download raw JSON of conversation"
      >
        ⬇️ JSON
      </button>
    </div>
  );
}
