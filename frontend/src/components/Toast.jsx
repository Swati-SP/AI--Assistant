import React, { useEffect, useState } from "react";

// Call this from anywhere to show a toast
export function showToast(message, timeout = 2000) {
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, timeout } }));
}

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const { message, timeout = 2000 } = e.detail || {};
      const id = `${Date.now()}_${Math.random()}`;
      setItems((q) => [...q, { id, message }]);
      setTimeout(() => setItems((q) => q.filter((t) => t.id !== id)), timeout);
    };
    window.addEventListener("app:toast", onToast);
    return () => window.removeEventListener("app:toast", onToast);
  }, []);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 space-y-2">
      {items.map((t) => (
        <div
          key={t.id}
          className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm shadow-lg
                     dark:bg-gray-800"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
