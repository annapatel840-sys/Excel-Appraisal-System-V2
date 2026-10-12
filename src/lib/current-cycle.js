import { useEffect, useSyncExternalStore } from "react";

import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

// Name of the current appraisal cycle (from Appraisal Cycle Master) for the
// top bar. It reads the same "cycles" list the other screens already use and
// picks the current one the way Bulk Edit does: the active cycle, otherwise
// the first one that is not archived. The result is shared across pages and
// refreshed in the background when it is more than a minute old.

const STALE_MS = 60_000;
const listeners = new Set();
let currentName = "";
let fetchedAt = 0;
let inflight = null;

const isActiveCycle = (cycle) =>
  String(cycle?.status || "").trim().toLowerCase() === "active" &&
  !cycle?.archived &&
  !cycle?.hidden;

function load() {
  if (inflight) return inflight;
  inflight = payrollCycleRequest("cycles")
    .then((data) => {
      const list = Array.isArray(data) ? data : [];
      const picked =
        list.find(isActiveCycle) || list.find((cycle) => !cycle?.archived) || list[0];
      currentName = String(picked?.name || "").trim();
      listeners.forEach((listener) => listener());
    })
    .catch(() => {
      // keep whatever name we already have; the top bar just shows no cycle
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
  }, []);
  return name;
}