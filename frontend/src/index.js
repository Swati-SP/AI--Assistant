import React from "react";
import "./index.css";

import { createRoot } from "react-dom/client";
import App from "./App";

window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("root");
  if (!container) {
    console.error("❌ Mount point #root not found in DOM");
  } else {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("✅ React app mounted successfully");
  }
});
