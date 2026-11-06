import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import logo from "@/assets/wissen-logo.png";

/**
 * Full-screen loading screen: logo, a percentage bar and a wait message.
 *   open      show / hide
 *   progress  0-100 when the real progress is known; leave null and the bar
 *             climbs on its own (never past 95%) until the work finishes and
 *             `open` goes back to false.
 */
export function ProcessingOverlay({
  open,
  progress = null,
  message = "Please wait while this is under process",
}) {
  const [auto, setAuto] = useState(0);

  useEffect(() => {
    if (!open) {
      setAuto(0);
      return undefined;
    }
    const timer = setInterval(() => {
      setAuto((value) => value + (95 - value) * 0.05);
    }, 400);
    return () => clearInterval(timer);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const known = typeof progress === "number" && Number.isFinite(progress);
  const pct = Math.max(0, Math.min(100, Math.round(known ? progress : auto)));

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={message}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(2px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 24,
        textAlign: "center",
      }}
    >
      <img src={logo} alt="Wissen" style={{ height: 56, width: "auto" }} />
      <div style={{ width: "min(360px, 80vw)" }}>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          style={{
            height: 10,
            borderRadius: 999,
            background: "#E2E8F0",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: pct + "%",
              height: "100%",
              borderRadius: 999,
              background: "#1D4ED8",
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
          {pct}%
        </div>
      </div>
      <div style={{ fontSize: 14, color: "#475569" }}>{message}</div>
    </div>,
    document.body,
  );
}

export default ProcessingOverlay;