import { useSyncExternalStore } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";

// "View as": lets an HR login preview the top menu the way Tech-ED or
// Comp Manager users see it. It only changes what the UI shows. What data a
// login can read or save is still decided by the backend for the real login.

export const VIEW_AS_ROLES = [
  { id: "hr", label: "HR" },
  { id: "teched", label: "Tech-ED" },
  { id: "compmanager", label: "Comp Manager" },
];

const STORAGE_KEY = "appraisal-view-as-role";
const listeners = new Set();

function readSaved() {
  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY) || "";
    return VIEW_AS_ROLES.some((role) => role.id === saved) ? saved : "";
  } catch {
    return "";
  }
}

let selected = typeof window === "undefined" ? "" : readSaved();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function writeSelected(id) {
  selected = id || "";
  try {
    if (selected) window.sessionStorage.setItem(STORAGE_KEY, selected);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable: the choice just lasts until reload
  }
  listeners.forEach((listener) => listener());
}

// Maps whatever the session calls the role to one of the three ids above.
export function roleIdOf(rawRole) {
  const role = String(rawRole || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (
    role === "hr" ||
    role === "humanresources" ||
    role === "hroperation" ||
    role === "hroperations" ||
    role === "appadministrator"
  )
    return "hr";
  if (role.includes("teched")) return "teched";
  if (role.includes("compmanager")) return "compmanager";
  return "";
}

export const roleLabelOf = (id) =>
  VIEW_AS_ROLES.find((role) => role.id === id)?.label || "";

export function useViewAs() {
  const user = useCatalystUser();
  const chosen = useSyncExternalStore(
    subscribe,
    () => selected,
    () => "",
  );

  const actualId = roleIdOf(user?.role);
  // Only HR logins get the switcher.
  const canSwitch = actualId === "hr";
  const effectiveId = canSwitch && chosen ? chosen : actualId;
  const preview = canSwitch && effectiveId !== actualId;

  return {
    actualId,
    effectiveId,
    canSwitch,
    preview,
    setViewAs: (id) => writeSelected(id === actualId ? "" : id),
  };
}