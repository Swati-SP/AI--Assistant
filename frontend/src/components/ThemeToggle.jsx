import React, { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(
    localStorage.getItem("theme") === "dark" ||
    (localStorage.getItem("theme") === null &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  );

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <span className="text-sm text-gray-600 dark:text-gray-300">Light</span>
      <button
        onClick={() => setDark(!dark)}
        className={`relative w-14 h-7 rounded-full transition
          ${dark ? "bg-indigo-600" : "bg-gray-300"}`}
        aria-label="Toggle dark mode"
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition
            ${dark ? "left-7" : "left-0.5"}`}
        />
      </button>
      <span className="text-sm text-gray-600 dark:text-gray-300">Dark</span>
    </label>
  );
}
