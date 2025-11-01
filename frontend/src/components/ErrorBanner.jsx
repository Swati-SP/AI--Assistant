import React from "react";

export default function ErrorBanner({ message, onRetry, disabled }) {
  if (!message) return null;

  return (
    <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-800 flex items-center justify-between gap-3">
      <span className="text-sm">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={disabled}
          className="text-xs px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 bg-white/80 dark:bg-gray-800/60 hover:bg-gray-50 disabled:opacity-50"
          aria-label="Retry last question"
          title="Retry last question"
        >
          Retry
        </button>
      )}
    </div>
  );
}
