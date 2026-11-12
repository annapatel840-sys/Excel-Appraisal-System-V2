import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { NewVersionBanner, startVersionWatch } from "./lib/app-version";
import "./styles.css";

// Right-click is turned off on every screen.
document.addEventListener("contextmenu", (event) => event.preventDefault());

// Slate caches index.html for a year; pick up new deploys without a hard refresh.
startVersionWatch();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <NewVersionBanner />
  </React.StrictMode>,
);