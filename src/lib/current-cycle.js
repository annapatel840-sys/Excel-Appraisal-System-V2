import { useEffect, useSyncExternalStore } from "react";

import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { matchesCycleLocation, useSelectedLocation } from "@/lib/location-store";

// The header cycle label follows the system location. A location with no
// Active cycle intentionally has no label; another location's cycle is never
// used as a fallback.

const STALE_MS = 60_000;
const listeners = new Set();
const cycleNames = new Map();
// The picked Active cycle, or latest non-archived Closed cycle when none is Active, per location.
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
      const matchesAvailableCycle = (cycle) => {
        const status = String(cycle?.status ?? cycle?.cycle_status ?? "").trim().toLowerCase();
        return ["active", "closed"].includes(status) &&
          !isTruthyFlag(cycle?.archived) &&
          !isTruthyFlag(cycle?.hidden) &&
          matchesSelectedLocation(cycle, selectedLocation);
      };
      // Active cycle first: one set up for exactly this location beats a
      // location-less one; Annual beats other processes; then the later start
      // date. Only when no cycle is Active is the latest Closed one used.
      const want = locationKey(selectedLocation);
      const locOf = (c) => String(c?.location ?? c?.cycle_location ?? "").trim().toLowerCase();
      const startOf = (c) => {
        const t = Date.parse(c?.start_date ?? c?.startDate ?? c?.start ?? "");
        return Number.isFinite(t) ? t : 0;
      };
      const annual = (c) =>
        /^annual$/i.test(String(c?.process ?? c?.cycle_process ?? "")) || /^annual$/i.test(String(c?.type ?? c?.cycle_type ?? ""))
          ? 0
          : 1;
      const picked =
        list
          .filter((cycle) => isActiveCycle(cycle) && matchesSelectedLocation(cycle, selectedLocation))
          .sort(
            (a, b) =>
              (locOf(a) === want ? 0 : 1) - (locOf(b) === want ? 0 : 1) ||
              annual(a) - annual(b) ||
              startOf(b) - startOf(a),
          )[0] ||
        list.filter(matchesAvailableCycle)
          .sort((a, b) => String(b?.end ?? b?.end_date ?? b?.effective_date ?? b?.start_date ?? "")
            .localeCompare(String(a?.end ?? a?.end_date ?? a?.effective_date ?? a?.start_date ?? "")))[0] ||
        null;
      cycleInfos.set(key, picked);
      cycleNames.set(
        key,
        String(picked?.name || picked?.cycle_name || picked?.appraisal_cycle_name || "").trim(),
      );
      listeners.forEach((listener) => listener());
    })
    .catch(() => {
      cycleNames.set(key, "");
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
      listeners.forEach((listener) => listener());
      load(selectedLocation);
    };
    window.addEventListener("appraisal:cycle-updated", refresh);
    return () => window.removeEventListener("appraisal:cycle-updated", refresh);
  }, [key, selectedLocation]);
  return name;
}