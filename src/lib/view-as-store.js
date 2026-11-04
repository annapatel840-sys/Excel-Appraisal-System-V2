import { useSyncExternalStore } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";

// "View as": lets an HR login preview the top menu as HR, Tech-ED or Comp
// Manager, and lets a Tech-ED login preview it as Tech-ED or Comp Manager. It only changes what the UI shows. What data a
// login can read or save is still decided by the backend for the real login.

export const VIEW_AS_ROLES = [
  { id: "hr", label: "HR" },
  { id: "teched", label: "Tech-ED" },
  { id: "compmanager", label: "Comp Manager" },
];

// Which roles each real login may switch between (Comp Managers get none).
const SWITCHABLE_ROLES = {
  hr: ["hr", "teched", "compmanager"],
  teched: ["teched", "compmanager"],
};

export const viewAsRolesFor = (actualId) =>
  VIEW_AS_ROLES.filter((role) => (SWITCHABLE_ROLES[actualId] || []).includes(role.id));

const STORAGE_KEY = "appraisal-view-as-role";
const COMP_MANAGER_STORAGE_KEY = "appraisal-view-as-manager";
const listeners = new Set();
const compManagerListeners = new Set();

function readSelectedCompManager() {
  try {
    return typeof window === "undefined"
      ? ""
      : String(window.sessionStorage.getItem(COMP_MANAGER_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

let selectedCompManager = readSelectedCompManager();

function subscribeCompManager(listener) {
  compManagerListeners.add(listener);
  return () => compManagerListeners.delete(listener);
}

export function setSelectedCompManager(value) {
  selectedCompManager = String(value || "").trim();
  try {
    if (selectedCompManager) window.sessionStorage.setItem(COMP_MANAGER_STORAGE_KEY, selectedCompManager);
    else window.sessionStorage.removeItem(COMP_MANAGER_STORAGE_KEY);
  } catch {
    // The selection still works for the current page session.
  }
  compManagerListeners.forEach((listener) => listener());
}

export function useSelectedCompManager() {
  const value = useSyncExternalStore(
    subscribeCompManager,
    () => selectedCompManager,
    () => "",
  );
  return { selectedCompManager: value, setSelectedCompManager };
}

export function normalizeManagerIdentity(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function managerIdentityMatches(value, selected) {
  const parts = (input) => {
    const normalized = normalizeManagerIdentity(input);
    if (!normalized) return [];
    const split = normalized.split(/\s+-\s+/);
    return split.length > 1 ? [normalized, ...split] : [normalized];
  };
  const left = parts(value);
  const right = new Set(parts(selected));
  return left.some((part) => right.has(part));
}

export function currentUserMatchesManager(value, user, employeeRows = []) {
  const aliases = [
    user?.name, user?.display_name, user?.displayName,
    user?.first_name, user?.last_name,
    [user?.first_name, user?.last_name].filter(Boolean).join(" "),
    user?.email, user?.email_id, user?.user_id, user?.userId,
    user?.empId, user?.emp_id, user?.employeeId, user?.employee_id,
  ].filter(Boolean);
  const normalizedAliases = new Set(aliases.map(normalizeManagerIdentity));
  const linkedEmployee = employeeRows.find((employee) =>
    [
      employee?.empId, employee?.emp_id, employee?.employee_id, employee?.employeeId,
      employee?.name, employee?.emp_name, employee?.employee_name,
      employee?.email, employee?.email_id, employee?.emailId,
    ].filter(Boolean).some((alias) => normalizedAliases.has(normalizeManagerIdentity(alias)))
  );
  if (linkedEmployee) {
    aliases.push(
      linkedEmployee.empId, linkedEmployee.emp_id, linkedEmployee.employee_id,
      linkedEmployee.employeeId, linkedEmployee.name, linkedEmployee.emp_name,
      linkedEmployee.employee_name,
    );
  }
  return aliases.some((alias) => managerIdentityMatches(value, alias));
}

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
  // HR and Tech-ED logins get the switcher; HR sees 3 options, Tech-ED sees 2.
  const availableRoles = viewAsRolesFor(actualId);
  const canSwitch = availableRoles.length > 0;
  const chosenIsAllowed = availableRoles.some((role) => role.id === chosen);
  const effectiveId = canSwitch && chosen && chosenIsAllowed ? chosen : actualId;
  const preview = canSwitch && effectiveId !== actualId;

  return {
    actualId,
    effectiveId,
    canSwitch,
    availableRoles,
    preview,
    setViewAs: (id) => writeSelected(id === actualId ? "" : id),
  };
}
export const getViewAsSelected = () => selected;
