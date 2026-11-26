import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { catalystFetch, catalystFunctionUrl } from "./catalyst-api";
import { useCatalystSignOut, useCatalystUser } from "./catalyst-auth";
import { useCurrentCycleInfo } from "./current-cycle";
import { isAllLocations, matchesLocation, useSelectedLocation } from "./location-store";

// Per-user access rules from accessapi /me (see docs/ACCESS_SPEC.md).
// Fallback: whenever /me is unavailable (not deployed, 404, network error,
// ok:false while not enforced) every helper answers permissively, so the app
// behaves exactly as it did before access control existed.

const CACHE_KEY = "access-me-cache-v1";
const LEVEL_RANK = { none: 0, view: 1, edit: 2 };

// Cycle locks (Appraisal Cycle Master):
//  - "Close For Tech-ED": Tech-ED AND Comp Manager logins get read access only (every Edit screen
//    becomes View, no edit actions) until the cycle is reopened for correction. HR can still edit.
//  - "Close Cycle" (status Closed): EVERY role, HR included, is read-only. Only the screens in
//    CYCLE_CLOSED_KEEP_SCREENS stay usable, so HR can still Reopen / Archive the cycle and
//    still Send the letters (letters are made when the cycle closes and are sent after it).
const TECHED_LOCK_KEEP_SCREENS = new Set(["settings"]); // personal preferences, not cycle data
const CYCLE_CLOSED_KEEP_SCREENS = new Set(["settings", "cycleMaster", "access", "letters"]); // preferences + cycle controls + letters
const TECHED_LOCK_BLOCKED_ACTIONS = new Set([
  "bulkEdit",
  "allotNextLevel",
  "importAppraisal",
  "changeBudgetConfig",
  "delegateRequest",
]);
const compactRole = (role) => String(role || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const isTechEdRole = (role) => compactRole(role).includes("teched");
const isCompManagerRole = (role) => {
  const r = compactRole(role);
  return r.includes("compmgr") || r.includes("compmanager") || r.includes("compensationmanager");
};

// HR Operations tabs (EmployeeMaster ?tab=...) → screen key.
export const HR_TAB_SCREENS = {
  roster: "employeeMaster",
  eligibility: "employeeMaster",
  "appraisal-cycle": "cycleMaster",
  "location-master": "locationMaster",
  "payroll-data": "payroll",
  "feedback-rating": "feedbackRatingMaster",
  "hr-dashboard": "hrDashboard",
  "historical-import": "historicalImport",
  "payroll-upload": "payroll",
  "team-changes": "teamChanges",
  "change-mismatch": "changeMismatch",
  "budget-master": "budgetAllocation",
  "budget-distribution": "budgetDistribution",
  "designation-master": "designationMaster",
  delegation: "delegation",
  letters: "letters",
  access: "access",
};

// Screen names the app asks for that the server's access catalogue does not define yet.
// Until the server lists them, they follow an existing screen with the same audience, so the
// tab/route is not treated as "no access" for everyone. A key the server DOES list always wins.
//   - the five HR Operations tabs are HR-only, like Employee Master
//   - Bulk Edit follows the Appraisal Sheet (the Apply button is still gated by the "bulkEdit" action)
export const SCREEN_FALLBACK = {
  hrDashboard: "employeeMaster",
  historicalImport: "employeeMaster",
  changeMismatch: "employeeMaster",
  locationMaster: "employeeMaster",
  designationMaster: "employeeMaster",
  letters: "employeeMaster",
  feedbackRatingMaster: "payroll",
  bulkEditScreen: "appraisalSheet",
};

export function resolveScreenLevel(screens, key) {
  let level = screens ? screens[key] : undefined;
  if (LEVEL_RANK[level] === undefined && SCREEN_FALLBACK[key]) level = screens?.[SCREEN_FALLBACK[key]];
  return LEVEL_RANK[level] !== undefined ? level : "none";
}

// Top-level routes → screen key (the HR Operations page is decided per tab).
export const PATH_SCREENS = {
  "/": "dashboard",
  "/sheet": "appraisalSheet",
  "/detail-screen": "detailScreen",
  "/budget-master": "budgetAllocation",
  "/budget-distribution": "budgetDistribution",
  "/settings": "settings",
  "/bulk-edit": "bulkEditScreen",
};

const AccessContext = createContext(null);

// Fields of the HR Operations / master screens (Access → Fields tab, one group per screen).
// Key = <screen>_<label in lower case with _>, the same rule as functions/*/accessCore.js.
const fieldSlug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
export const screenFieldKey = (screen, label) => `${screen}_${fieldSlug(label)}`;

function readCache(cacheId) {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || "null");
    return cached && cached.id === cacheId ? cached : null;
  } catch {
    return null;
  }
}

function writeCache(cacheId, version, me) {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ id: cacheId, version, me }));
  } catch {
    // Storage full / blocked: just skip caching.
  }
}

async function getJson(path) {
  const response = await catalystFetch(catalystFunctionUrl("accessapi") + path);
  if (!response.ok) {
    throw new Error(`Access service returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function loadMe(cacheId) {
  let version = null;
  try {
    const v = await getJson("version");
    if (v?.ok) version = v.version ?? null;
  } catch {
    version = null;
  }
  if (version !== null) {
    const cached = readCache(cacheId);
    if (cached && String(cached.version) === String(version) && cached.me?.ok) {
      return cached.me;
    }
  }
  const me = await getJson("me");
  if (me?.ok === true && version !== null) writeCache(cacheId, version, me);
  return me;
}

export function AccessProvider({ children }) {
  const user = useCatalystUser();
  const cacheId = String(user?.email || user?.email_id || user?.user_id || "me").toLowerCase();
  const [state, setState] = useState({ loading: true, me: null, error: "" });
  const [nonce, setNonce] = useState(0);
  const [selectedLocation] = useSelectedLocation();
  const { info: cycleInfo } = useCurrentCycleInfo();
  const cycleTechEdClosed = cycleInfo?.techEdClosed === true;
  const cycleClosed = String(cycleInfo?.status || "").trim().toLowerCase() === "closed";

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true }));
    loadMe(cacheId)
      .then((me) => {
        if (active) setState({ loading: false, me: me || null, error: me?.ok ? "" : me?.error || "" });
      })
      .catch((error) => {
        if (active) setState({ loading: false, me: null, error: error?.message || String(error) });
      });
    return () => {
      active = false;
    };
  }, [cacheId, nonce]);

  const reload = useCallback(() => {
    try {
      window.sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // ignore
    }
    setNonce((n) => n + 1);
  }, []);

  const value = useMemo(() => {
    const me = state.me;
    const ok = me?.ok === true;
    const enforced = me?.enforced === true;
    // Screens tab (Access) can set a screen level for one System Location. It applies when the
    // top-bar Location is that location; other locations keep the role's normal level.
    const screens = { ...((ok && me.screens) || {}) };
    if (ok && me.locationScreens) {
      Object.keys(me.locationScreens).forEach((loc) => {
        if (selectedLocation && !isAllLocations(selectedLocation) && matchesLocation(loc, selectedLocation)) {
          Object.assign(screens, me.locationScreens[loc]);
        }
      });
    }
    const actions = (ok && me.actions) || {};
    const fields = (ok && me.fields) || {};
    const roleName = me?.role || me?.roleLabel;
    // Cycle closed for Tech-ED + a Tech-ED or Comp Manager login = read-only (HR can still edit).
    const techEdLocked =
      ok && cycleTechEdClosed && (isTechEdRole(roleName) || isCompManagerRole(roleName));
    // Cycle Closed = read-only for everyone, HR included (until HR reopens it).
    const cycleLocked = ok && cycleClosed;
    const anyLocked = techEdLocked || cycleLocked;

    const screenLevel = (key) => {
      if (!ok) return "edit";
      const level = resolveScreenLevel(screens, key);
      if (level !== "edit") return level;
      if (cycleLocked && !CYCLE_CLOSED_KEEP_SCREENS.has(key)) return "view";
      if (techEdLocked && !TECHED_LOCK_KEEP_SCREENS.has(key)) return "view";
      return level;
    };
    const canScreen = (key, level = "view") =>
      LEVEL_RANK[screenLevel(key)] >= (LEVEL_RANK[level] ?? 1);
    const canAction = (key) =>
      !ok ? true : actions[key] === true && !(anyLocked && TECHED_LOCK_BLOCKED_ACTIONS.has(key));
    const fieldLimit = (key) => {
      if (!ok) return "edit";
      const limit = fields[key];
      if (limit === "read" || limit === "hidden") return limit;
      // Letters stay editable after the cycle closes (Send, Remarks); only the Tech-ED lock applies.
      const lockedHere = techEdLocked || (cycleLocked && !String(key).startsWith("letters_"));
      return lockedHere ? "read" : "edit";
    };

    return {
      loading: state.loading,
      ready: !state.loading,
      enforced,
      ok,
      error: state.error,
      denied: !state.loading && !ok && enforced,
      techEdLocked,
      cycleLocked,
      role: ok ? me.role || "" : "",
      roleLabel: ok ? me.roleLabel || me.role || "" : "",
      user: ok ? me.user || null : null,
      scope: ok ? me.scope || null : null,
      canScreen,
      screenLevel,
      canAction,
      fieldLimit,
      canEditField: (key) => fieldLimit(key) === "edit",
      isHidden: (key) => fieldLimit(key) === "hidden",
      // Limit of one field of a screen: "edit" | "read" | "hidden" (see screenFieldKey).
      screenFieldLimit: (screen, label) => fieldLimit(screenFieldKey(screen, label)),
      reload,
    };
  }, [state, reload, selectedLocation, cycleTechEdClosed, cycleClosed]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

const PERMISSIVE = {
  loading: false,
  ready: true,
  enforced: false,
  ok: false,
  error: "",
  denied: false,
  techEdLocked: false,
  role: "",
  roleLabel: "",
  user: null,
  scope: null,
  canScreen: () => true,
  screenLevel: () => "edit",
  canAction: () => true,
  fieldLimit: () => "edit",
  canEditField: () => true,
  isHidden: () => false,
  screenFieldLimit: () => "edit",
  reload: () => {},
};

// Outside a provider (or before it exists) everything is allowed.
export function useAccess() {
  return useContext(AccessContext) || PERMISSIVE;
}

// Field limits of one screen: const f = useScreenFields("locationMaster");
//   f.canEdit("Location Name")  → the input can be changed
//   f.hidden("Address")         → do not show it at all
//   f.limit("Address")          → "edit" | "read" | "hidden"
export function useScreenFields(screen) {
  const access = useAccess();
  return useMemo(() => {
    const limit = (label) => access.screenFieldLimit(screen, label);
    return {
      limit,
      canEdit: (label) => limit(label) === "edit",
      hidden: (label) => limit(label) === "hidden",
      // Props for an <input>/<select>: read-only fields cannot be changed.
      lock: (label) => (limit(label) === "edit" ? {} : { disabled: true, title: "You can view this field but not change it." }),
    };
  }, [access, screen]);
}

export function NoAccessPage({ message }) {
  const signOut = useCatalystSignOut();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-lg border border-red-200 bg-white p-5 text-sm shadow-sm">
        <p className="font-semibold text-red-700">No access</p>
        <p className="mt-2 break-words text-muted-foreground">
          {message || "You do not have access to this application. Contact HR if you think this is wrong."}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            Retry
          </button>
          {signOut && (
            <button
              type="button"
              onClick={signOut}
              className="rounded-md bg-[#173b63] px-3 py-1.5 text-xs font-medium text-white"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </main>
  );
}