/* ============================================================
   Global location selection.

   One Location Master value (name or code) is shared by every screen.
   It is kept in localStorage so it survives
   navigation (pages are full loads) and reloads, and every mounted
   component is notified when it changes.

   The list of locations is never hard-coded. LocationMasterControl
   loads Location Master and registers it here (registerLocations),
   so a location added in Location Master works everywhere at once.
   ============================================================ */
import { useSyncExternalStore } from "react";
import { cycleNameLocation } from "./cycle-name";

export const ALL_LOCATIONS = "All";
const STORAGE_KEY = "appraisal.selectedLocation.v1";
const EVENT_NAME = "appraisal:location-changed";

const norm = (value) => String(value ?? "").trim().toLowerCase();

const readStored = () => {
  try {
    if (typeof window === "undefined") return ALL_LOCATIONS;
    return window.localStorage.getItem(STORAGE_KEY) || ALL_LOCATIONS;
  } catch (_) {
    return ALL_LOCATIONS;
  }
};

let selected = readStored();
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
  if (next === selected) return;
  selected = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch (_) {
    /* storage is optional */
  }
  emit();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }
}

// At sign-in the app opens on the user's own Employee Master location instead
// of All Locations. This happens once per browser session (tab) per user, so a
// location the user picks afterwards in the header is kept across page loads.
// Users not in Employee Master (no location) keep the current selection.
const HOME_APPLIED_KEY = "appraisal.homeLocationAppliedFor.v1";
export function applyHomeLocationOnSignIn(userKey, homeLocation) {
  const who = norm(userKey);
  const home = String(homeLocation ?? "").trim();
  if (!who || !home || typeof window === "undefined") return;
  let appliedFor = "";
  try {
    appliedFor = window.sessionStorage.getItem(HOME_APPLIED_KEY) || "";
  } catch (_) {
    appliedFor = "";
  }
  if (appliedFor === who) return;
  try {
    window.sessionStorage.setItem(HOME_APPLIED_KEY, who);
  } catch (_) {
    /* without storage this runs on every load; the location still follows the user */
  }
  setSelectedLocation(home);
}

// Sign-out: the next sign-in (same tab) opens on that user's own location again.
export function forgetHomeLocationApplied() {
  try {
    window.sessionStorage.removeItem(HOME_APPLIED_KEY);
  } catch (_) {
    /* storage is optional */
  }
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
  // Shared screen filters always resolve to an active Location Master value.
  if (
    registry.length &&
    (isAllLocations(selected) ||
      !registry.some((x) => norm(x.name) === norm(selected) || norm(x.code) === norm(selected)))
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
    if (event.key === STORAGE_KEY) {
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