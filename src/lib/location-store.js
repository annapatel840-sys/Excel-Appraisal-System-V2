/* ============================================================
   Signed-in user's location selection.

   One Location Master value (name or code) is shared by every screen for the
   current user. It is persisted per account in localStorage and every mounted
   component is notified when it changes.

   The list of locations is never hard-coded. LocationMasterControl
   loads Location Master and registers it here (registerLocations),
   so a location added in Location Master works everywhere at once.
   ============================================================ */
import { useSyncExternalStore } from "react";
import { cycleNameLocation } from "./cycle-name";

export const ALL_LOCATIONS = "All";
const STORAGE_KEY_PREFIX = "appraisal.selectedLocation.v2:";
const EVENT_NAME = "appraisal:location-changed";

const norm = (value) => String(value ?? "").trim().toLowerCase();

const storageKeyForUser = (userKey) =>
  STORAGE_KEY_PREFIX + encodeURIComponent(norm(userKey) || "anonymous");

const readStored = (userKey) => {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(storageKeyForUser(userKey));
  } catch (_) {
    return null;
  }
};

let activeUserKey = "";
let selected = ALL_LOCATIONS;
// Location Master rows registered by the dropdown: [{ name, code }]
let registry = [];
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export const isAllLocations = (value) => {
  const v = norm(value);
  return !v || v === "all" || v === "all locations";
};

export function getSelectedLocation() {
  return selected;
}

export function setSelectedLocation(value) {
  const next = isAllLocations(value) ? ALL_LOCATIONS : String(value).trim();
  const key = storageKeyForUser(activeUserKey);
  if (next === selected) {
    try {
      window.localStorage.setItem(key, next);
    } catch (_) {
      /* storage is optional */
    }
    return;
  }
  selected = next;
  try {
    window.localStorage.setItem(key, next);
  } catch (_) {
    /* storage is optional */
  }
  emit();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }
}

// Location selection is persisted per signed-in account so one user's choice
// cannot change another user's view in the same browser.
export function applyHomeLocationOnSignIn(userKey, homeLocation) {
  const who = norm(userKey);
  const home = String(homeLocation ?? "").trim();
  if (!who) return;
  activeUserKey = who;
  selected = readStored(who) || home || ALL_LOCATIONS;
  try {
    window.localStorage.setItem(storageKeyForUser(who), selected);
  } catch (_) {
    /* storage is optional */
  }
  emit();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: selected }));
  }
}

// The next authenticated session selects its own saved location namespace.
export function forgetHomeLocationApplied() {
  activeUserKey = "";
}

// Called with the rows from Location Master (any casing of the field names).
export function registerLocations(list) {
  registry = (Array.isArray(list) ? list : [])
    .map((x) => ({
      name: String(x?.location_name ?? x?.name ?? "").trim(),
      code: String(x?.location_code ?? x?.code ?? "").trim(),
    }))
    .filter((x) => x.name || x.code);
  const firstLocation = registry[0]?.name || registry[0]?.code || "";
  // All remains a valid filter; only reset selections removed from Location Master.
  if (
    registry.length &&
    !isAllLocations(selected) &&
    !registry.some(
      (x) => norm(x.name) === norm(selected) || norm(x.code) === norm(selected),
    )
  ) {
    setSelectedLocation(firstLocation);
    return;
  }
  emit();
}

// Every spelling (name and code) that identifies the selected Location Master row.
function selectedAliases(sel) {
  const key = norm(sel);
  const hit = registry.find((x) => norm(x.name) === key || norm(x.code) === key);
  return new Set([key, norm(hit?.name), norm(hit?.code)].filter(Boolean));
}

// True when an employee's Employee Master location is in the selected location.
export function matchesLocation(employeeLocation, sel = selected) {
  if (isAllLocations(sel)) return true;
  const loc = norm(employeeLocation);
  if (!loc) return false;
  return selectedAliases(sel).has(loc);
}

export function locationOfRow(row) {
  return row?.location ?? row?.work_location ?? row?.workLocation ?? "";
}

export function cycleLocationOf(cycle) {
  const explicitLocation = String(
    cycle?.location ?? cycle?.cycle_location ?? cycle?.cycleLocation ?? "",
  ).trim();
  return (
    explicitLocation ||
    cycleNameLocation(
      cycle?.name ??
        cycle?.cycle_name ??
        cycle?.appraisal_cycle_name ??
        cycle?.appraisal_year ??
        "",
    )
  );
}

export function matchesCycleLocation(cycle, sel = selected) {
  const cycleLocation = cycleLocationOf(cycle);
  return isAllLocations(sel)
    ? isAllLocations(cycleLocation)
    : matchesLocation(cycleLocation, sel);
}

export function filterByLocation(list, sel = selected, getter = locationOfRow) {
  if (!Array.isArray(list) || isAllLocations(sel)) return list;
  const aliases = selectedAliases(sel);
  return list.filter((row) => aliases.has(norm(getter(row))));
}

const subscribe = (fn) => {
  listeners.add(fn);
  const onStorage = (event) => {
    if (event.key === storageKeyForUser(activeUserKey)) {
      selected = event.newValue || ALL_LOCATIONS;
      fn();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
};

// [selectedLocation, setSelectedLocation]. Re-renders on change, including
// when Location Master finishes loading (so alias matching refreshes).
const getSnapshot = () => selected;
export function useSelectedLocation() {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => ALL_LOCATIONS);
  return [value, setSelectedLocation];
}