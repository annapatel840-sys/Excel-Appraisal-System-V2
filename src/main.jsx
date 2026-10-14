import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Right-click is turned off on every screen.
document.addEventListener("contextmenu", (event) => event.preventDefault());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);