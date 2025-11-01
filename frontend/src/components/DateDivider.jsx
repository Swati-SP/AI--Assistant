import React from "react";

function formatDateLabel(ts) {
  const d = new Date(ts);
  const now = new Date();

  const startOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const dStart = startOf(d);
  const nowStart = startOf(now);

  const diffDays = Math.round((nowStart - dStart) / dayMs);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  // e.g., 21 Oct 2025
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DateDivider({ timestamp }) {
  return (
    <div className="my-3 flex items-center justify-center">
      <div className="px-3 py-1 text-xs rounded-full bg-gray-100 text-gray-600 border border-gray-200
                      dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">
        {formatDateLabel(timestamp)}
      </div>
    </div>
  );
}
