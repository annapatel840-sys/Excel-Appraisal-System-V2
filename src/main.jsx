import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { startVersionWatch } from "./lib/app-version";
import "./styles.css";

// Right-click is turned off on every screen.
document.addEventListener("contextmenu", (event) => event.preventDefault());

// Slate caches index.html for a year; a new deploy is still picked up silently right after the app opens.
// The "new version available, please reload" popup is intentionally not shown.
startVersionWatch();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);