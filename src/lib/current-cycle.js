import { useEffect, useSyncExternalStore } from "react";

import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

// The top-bar label must represent an Active cycle only. Closed and
// archived cycles remain available in cycle history, but are never a fallback.
// When no Active cycle exists, the global header intentionally shows no label.

const STALE_MS = 60_000;
const listeners = new Set();
let currentName = "";
let fetchedAt = 0;
let inflight = null;

const isTruthyFlag = (value) =>
  value === true || value === 1 ||
  ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());

const isActiveCycle = (cycle) =>
  String(cycle?.status ?? cycle?.cycle_status ?? "").trim().toLowerCase() === "active" &&
  !isTruthyFlag(cycle?.archived) &&
  !isTruthyFlag(cycle?.hidden);

function load() {
  if (inflight) return inflight;
  inflight = payrollCycleRequest("cycles")
    .then((data) => {
      const list = Array.isArray(data) ? data : [];
      const picked = list.find(isActiveCycle);
      // Never fall back to a closed or archived cycle.
      currentName = String(
        picked?.name || picked?.cycle_name || picked?.appraisal_cycle_name || "",
      ).trim();
      listeners.forEach((listener) => listener());
    })
    .catch(() => {
      // Don't retain a stale closed-cycle label if refresh fails.
      currentName = "";
      listeners.forEach((listener) => listener());
    })
    .finally(() => {
      fetchedAt = Date.now();
      inflight = null;
    });
  return inflight;
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useCurrentCycleName() {
  const name = useSyncExternalStore(
    subscribe,
    () => currentName,
    () => "",
  );
  useEffect(() => {
    if (Date.now() - fetchedAt > STALE_MS) load();
    if (typeof window === "undefined") return undefined;
    const refresh = () => {
      currentName = "";
      listeners.forEach((listener) => listener());
      load();
    };
    window.addEventListener("appraisal:cycle-updated", refresh);
    return () => window.removeEventListener("appraisal:cycle-updated", refresh);
  }, []);
  return name;
}