import { useEffect, useSyncExternalStore } from "react";

import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { matchesCycleLocation, useSelectedLocation } from "@/lib/location-store";

// The header cycle label follows the system location. Keep the latest Closed
// cycle visible until Archive; another location's cycle is never a fallback.

const STALE_MS = 60_000;
const listeners = new Set();
const cycleNames = new Map();
// The picked Active or latest non-archived Closed cycle per location.
const cycleInfos = new Map();
const fetchedAt = new Map();
const inflight = new Map();

const isTruthyFlag = (value) =>
  value === true ||
  value === 1 ||
  ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());

const isActiveCycle = (cycle) =>
  String(cycle?.status ?? cycle?.cycle_status ?? "").trim().toLowerCase() === "active" &&
  !isTruthyFlag(cycle?.archived) &&
  !isTruthyFlag(cycle?.hidden);

const locationKey = (value) => {
  const location = String(value || "All").trim();
  return location.toLowerCase();
};

function matchesSelectedLocation(cycle, selectedLocation) {
  return matchesCycleLocation(cycle, selectedLocation);
}

function load(selectedLocation) {
  const key = locationKey(selectedLocation);
  if (inflight.has(key)) return inflight.get(key);
  const promise = payrollCycleRequest("cycles")
    .then((data) => {
      const list = Array.isArray(data) ? data : [];
      const matchingCycles = list.filter((cycle) => {
        const status = String(cycle?.status ?? cycle?.cycle_status ?? "").trim().toLowerCase();
        return ["active", "closed"].includes(status) &&
          !isTruthyFlag(cycle?.archived) &&
          !isTruthyFlag(cycle?.hidden) &&
          matchesSelectedLocation(cycle, selectedLocation);
      });
      const picked =
        matchingCycles.find(isActiveCycle) ||
        matchingCycles
          .filter((cycle) => String(cycle?.status ?? cycle?.cycle_status ?? "").trim().toLowerCase() === "closed")
          .sort((a, b) =>
            String(b?.end ?? b?.end_date ?? b?.close_date ?? b?.start_date ?? "")
              .localeCompare(String(a?.end ?? a?.end_date ?? a?.close_date ?? a?.start_date ?? "")),
          )[0] ||
        null;
      cycleNames.set(
        key,
        String(picked?.name || picked?.cycle_name || picked?.appraisal_cycle_name || "").trim(),
      );
      cycleInfos.set(
        key,
        picked
          ? {
              status: String(picked.status ?? picked.cycle_status ?? "Active").trim(),
              start: String(picked.start ?? picked.start_date ?? "").trim(),
              end: String(picked.end ?? picked.end_date ?? picked.close_date ?? "").trim(),
              effective: String(picked.effective ?? picked.effective_date ?? "").trim(),
            }
          : null,
      );
      listeners.forEach((listener) => listener());
    })
    .catch(() => {
      cycleNames.set(key, "");
      cycleInfos.set(key, null);
      listeners.forEach((listener) => listener());
    })
    .finally(() => {
      fetchedAt.set(key, Date.now());
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useCurrentCycleName() {
  const [selectedLocation] = useSelectedLocation();
  const key = locationKey(selectedLocation);
  const name = useSyncExternalStore(
    subscribe,
    () => cycleNames.get(key) || "",
    () => "",
  );
  useEffect(() => {
    if (Date.now() - (fetchedAt.get(key) || 0) > STALE_MS) load(selectedLocation);
    if (typeof window === "undefined") return undefined;
    const refresh = () => {
      fetchedAt.delete(key);
      cycleNames.set(key, "");
      cycleInfos.delete(key);
      listeners.forEach((listener) => listener());
      load(selectedLocation);
    };
    window.addEventListener("appraisal:cycle-updated", refresh);
    return () => window.removeEventListener("appraisal:cycle-updated", refresh);
  }, [key, selectedLocation]);
  return name;
}

// Name plus the Active cycle's status and dates, for the Overview title.
export function useCurrentCycleInfo() {
  const name = useCurrentCycleName();
  const [selectedLocation] = useSelectedLocation();
  const key = locationKey(selectedLocation);
  const info = useSyncExternalStore(
    subscribe,
    () => cycleInfos.get(key) || null,
    () => null,
  );
  return { name, info };
}