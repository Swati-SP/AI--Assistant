import React, { useEffect, useState } from "react";

export default function SettingsBar({ onModeChange }) {
  const [mockMode, setMockMode] = useState(
    localStorage.getItem("mockMode") === "true"
  );

  useEffect(() => {
    localStorage.setItem("mockMode", mockMode ? "true" : "false");
    onModeChange?.(mockMode);
  }, [mockMode, onModeChange]);

  return (
    <div className="flex items-center justify-between mb-4 p-3 border rounded-xl bg-gray-50">
      <div className="text-sm text-gray-700">
        API Mode:{" "}
        <span className={`font-medium ${mockMode ? "text-orange-600" : "text-green-700"}`}>
          {mockMode ? "Mock" : "Real"}
        </span>
      </div>
      <label className="inline-flex items-center gap-2 cursor-pointer">
        <span className="text-sm text-gray-600">Mock</span>
        <input
          type="checkbox"
          className="sr-only"
          checked={mockMode}
          onChange={(e) => setMockMode(e.target.checked)}
        />
        <div
          className={`w-12 h-6 rounded-full transition
            ${mockMode ? "bg-orange-500" : "bg-green-600"}`}
        >
          <div
            className={`h-6 w-6 bg-white rounded-full shadow transform transition
              ${mockMode ? "translate-x-6" : "translate-x-0"}`}
          />
        </div>
        <span className="text-sm text-gray-600">Real</span>
      </label>
    </div>
  );
}
