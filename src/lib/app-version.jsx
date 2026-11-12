import { useEffect, useState } from "react";

/*
 * Slate serves index.html with "Cache-Control: max-age=31536000", so a browser
 * keeps running the version it loaded first until the user hard-refreshes.
 * Each build writes /version.json and bakes the same id into the bundle
 * (see vite.config.js). This compares them:
 *   - right after the app opens, before the user has typed or clicked, a newer
 *     deploy reloads the page once (a reload always re-checks index.html);
 *   - later (every few minutes and when the tab is shown again) it only shows
 *     a "Reload" bar, so nothing being edited is lost.
 */
const BUILD_ID = typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "";
const CHECK_EVERY_MS = 5 * 60 * 1000;
const AUTO_RELOAD_WINDOW_MS = 15 * 1000;
const RELOADED_FOR_KEY = "appVersion.reloadedFor";
const NEW_VERSION_EVENT = "app:new-version";

let userHasInteracted = false;
let newVersionSeen = "";

async function fetchDeployedBuildId() {
  // Static files on Slate reject query strings, so bypass the cache with
  // cache: "no-store" instead of a ?ts= parameter.
  const response = await fetch("/version.json", { cache: "no-store" });
  if (!response.ok) return "";
  const body = await response.json().catch(() => null);
  return String(body?.build || "");
}

function readReloadedFor() {
  try {
    return window.sessionStorage.getItem(RELOADED_FOR_KEY) || "";
  } catch {
    return "";
  }
}

function writeReloadedFor(build) {
  try {
    window.sessionStorage.setItem(RELOADED_FOR_KEY, build);
  } catch {
    // Without storage, skip the automatic reload (no loop guard); the bar still shows.
  }
}

async function checkForNewVersion({ mayAutoReload }) {
  if (!BUILD_ID) return;
  let deployed = "";
  try {
    deployed = await fetchDeployedBuildId();
  } catch {
    return;
  }
  if (!deployed || deployed === BUILD_ID) return;

  const canStore = (() => {
    try {
      return Boolean(window.sessionStorage);
    } catch {
      return false;
    }
  })();
  // Reload at most once per deployed version, so a stale CDN copy can never loop.
  if (mayAutoReload && !userHasInteracted && canStore && readReloadedFor() !== deployed) {
    writeReloadedFor(deployed);
    window.location.reload();
    return;
  }
  if (newVersionSeen !== deployed) {
    newVersionSeen = deployed;
    window.dispatchEvent(new CustomEvent(NEW_VERSION_EVENT, { detail: deployed }));
  }
}

export function startVersionWatch() {
  if (typeof window === "undefined" || !BUILD_ID) return;
  const startedAt = Date.now();
  const markInteracted = () => {
    userHasInteracted = true;
  };
  window.addEventListener("keydown", markInteracted, { once: true, capture: true });
  window.addEventListener("pointerdown", markInteracted, { once: true, capture: true });

  checkForNewVersion({ mayAutoReload: true });
  window.setInterval(() => checkForNewVersion({ mayAutoReload: false }), CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkForNewVersion({ mayAutoReload: Date.now() - startedAt < AUTO_RELOAD_WINDOW_MS });
    }
  });
}

export function NewVersionBanner() {
  const [available, setAvailable] = useState(Boolean(newVersionSeen));
  useEffect(() => {
    const onNew = () => setAvailable(true);
    window.addEventListener(NEW_VERSION_EVENT, onNew);
    return () => window.removeEventListener(NEW_VERSION_EVENT, onNew);
  }, []);
  if (!available) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 16,
        transform: "translateX(-50%)",
        zIndex: 5000,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: "#173b63",
        color: "#fff",
        fontSize: 13,
        boxShadow: "0 6px 20px rgba(0,0,0,.25)",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span>A new version of the app is available. Save your work, then reload.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          border: 0,
          borderRadius: 6,
          padding: "6px 12px",
          background: "#fff",
          color: "#173b63",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Reload
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setAvailable(false)}
        style={{ border: 0, background: "transparent", color: "#fff", cursor: "pointer", fontSize: 16 }}
      >
        ×
      </button>
    </div>
  );
}
