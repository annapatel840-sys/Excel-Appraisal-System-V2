import { createRoot } from "react-dom/client";
import { X } from "lucide-react";

/**
 * In-app replacement for window.alert().
 * White card, Manrope font and the appraisal sheet's navy text colour,
 * with a cross (X) at the top-right corner to close.
 * Usage: showNotice("Message here");
 */
const FONT = '"Manrope", "Segoe UI", system-ui, sans-serif';
const INK = "#102a43";

let host = null;
let root = null;

function close() {
  if (root) root.unmount();
  if (host) host.remove();
  root = null;
  host = null;
  document.removeEventListener("keydown", onKey, true);
}

function onKey(e) {
  if (e.key === "Escape" || e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}

function Notice({ message }) {
  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 72,
        background: "rgba(16, 42, 67, 0.18)",
        fontFamily: FONT,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        style={{
          position: "relative",
          width: "min(440px, calc(100vw - 32px))",
          background: "#ffffff",
          color: INK,
          fontFamily: FONT,
          border: "1px solid #d1d5db",
          borderRadius: 10,
          boxShadow: "0 12px 32px rgba(16, 42, 67, 0.18)",
          padding: "16px 44px 16px 18px",
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.5,
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            border: 0,
            borderRadius: 6,
            background: "transparent",
            color: INK,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          <X size={16} strokeWidth={2.5} />
        </button>
        {message}
      </div>
    </div>
  );
}

export function showNotice(message) {
  if (typeof document === "undefined") return;
  close();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(<Notice message={String(message ?? "")} />);
  document.addEventListener("keydown", onKey, true);
}
