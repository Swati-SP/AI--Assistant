import React, { useMemo } from "react";

function buildTerms(query = "") {
  // basic tokenizer + stopword filter
  const stop = new Set([
    "the","a","an","and","or","to","for","in","on","of","is","are","was","were",
    "how","what","when","where","who","which","with","by","at","from","it","this",
    "that","these","those","i","we","you","they","me","my","our","your","their",
  ]);
  return (query || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(w => w && !stop.has(w) && w.length >= 3);
}

function highlight(text = "", terms = []) {
  if (!text || terms.length === 0) return text;
  // Escape regex specials
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b(${terms.map(esc).join("|")})\\b`, "gi");
  return text.replace(regex, (m) => `<mark class="bg-yellow-200 dark:bg-yellow-600/40 rounded px-0.5">${m}</mark>`);
}

export default function SourceCard({ title, text, url, highlightQuery }) {
  const terms = useMemo(() => buildTerms(highlightQuery), [highlightQuery]);

  const safeTitle = useMemo(() => {
    const t = title || "Source";
    return highlight(t, terms);
  }, [title, terms]);

  const safeText = useMemo(() => {
    const t = text || "";
    return highlight(t, terms);
  }, [text, terms]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60 backdrop-blur p-3">
      <div className="flex items-center justify-between">
        <div
          className="font-medium text-gray-800 dark:text-gray-100"
          dangerouslySetInnerHTML={{ __html: safeTitle }}
        />
        <div className="flex items-center gap-2">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-2 py-1 rounded border bg-white dark:bg-gray-800 dark:text-gray-200 hover:bg-gray-50"
            >
              Open
            </a>
          )}
        </div>
      </div>

      {safeText && (
        <p
          className="mt-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: safeText }}
        />
      )}
    </div>
  );
}
