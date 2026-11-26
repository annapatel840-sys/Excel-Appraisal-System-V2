/* ============================================================
   Signed-in user's Cycle type selection (Annual / Mid-Year / Exceptional /
   New Joiner), chosen in the top bar beside Location.

   Together with the selected Location it decides WHICH appraisal cycle the
   Dashboard, Appraisal Sheet, Bulk Edit and Budget Distribution show: the
   cycle of that location AND that type. It only filters what is shown.

   Every mounted component is notified when it changes. The choice is not
   remembered: every fresh load / sign-in starts at the default, Annual (like
   the home location), and picking another location also resets it to Annual.
   ============================================================ */
import { useSyncExternalStore } from "react";
import { cycleNameWithoutLocation } from "./cycle-name";

// Same list (and spelling) as Appraisal Cycle Master.
export const CYCLE_TYPES = ["Annual", "Mid-Year", "Exceptional", "New Joiner"];
export const DEFAULT_CYCLE_TYPE = "Annual";
const EVENT_NAME = "appraisal:cycle-type-changed";

const norm = (value) => String(value ?? "").trim().toLowerCase();

// "exceptional", "Exceptional " ... -> "Exceptional"; anything unknown -> "".
export const canonicalCycleType = (value) =>
  CYCLE_TYPES.find((type) => norm(type) === norm(value)) || "";

let selected = DEFAULT_CYCLE_TYPE;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function getSelectedCycleType() {
  return selected;
}

export function setSelectedCycleType(value) {
  const next = canonicalCycleType(value) || DEFAULT_CYCLE_TYPE;
  if (next === selected) return;
  selected = next;
  emit();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }
}

// The type of one Appraisal_Cycle_Master row: its Cycle Type column, else the
// type its name starts with ("Dubai - Exceptional 2027" -> Exceptional), else Annual.
export function cycleTypeOfCycle(cycle) {
  const explicit = canonicalCycleType(cycle?.type ?? cycle?.cycle_type ?? cycle?.cycleType);
  if (explicit) return explicit;
  const name = cycleNameWithoutLocation(
    cycle?.name ?? cycle?.cycle_name ?? cycle?.appraisal_cycle_name ?? cycle?.appraisal_year ?? "",
  ).toLowerCase();
  return CYCLE_TYPES.find((type) => name.startsWith(type.toLowerCase())) || DEFAULT_CYCLE_TYPE;
}

export function matchesCycleType(cycle, sel = selected) {
  return cycleTypeOfCycle(cycle) === (canonicalCycleType(sel) || DEFAULT_CYCLE_TYPE);
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// [selectedCycleType, setSelectedCycleType]. Re-renders on change.
const getSnapshot = () => selected;
export function useSelectedCycleType() {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_CYCLE_TYPE);
  return [value, setSelectedCycleType];
}
