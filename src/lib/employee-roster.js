import { catalystFetch, catalystFunctionUrl, onCatalystWrite } from "./catalyst-api";

/* ============================================================
   SHARED APPRAISAL ROSTER

   The Appraisal Sheet store and the Budget store both load the full
   Appraisal-view roster from employeesapi (every status, every
   eligibility). Each request makes the backend read about eight tables,
   so callers that ask at the same time share one request instead of
   fetching the same list twice.

   - One request returns up to ROSTER_LIMIT rows (employeesapi MAX_LIMIT);
     any further pages are fetched in parallel, not one after another.
   - A request in flight, or a result under SHARE_WINDOW_MS old, is shared.
     Any save sent through catalystFetch and the app's update events cancel
     sharing, so a reload after a save always reads fresh data.
   ============================================================ */

export const ROSTER_LIMIT = 1000;
// A request started this long ago (still running or finished) is shared.
const SHARE_WINDOW_MS = 15000;
const ROSTER_CACHE_PREFIX = "appraisal.roster.snapshot.v1:";

const cacheKeyFor = (viewAs, cacheScope) =>
  ROSTER_CACHE_PREFIX + encodeURIComponent(String(cacheScope || "anonymous").toLowerCase()) + ":" + encodeURIComponent(String(viewAs || ""));

export function readCachedAppraisalRoster({ viewAs = "", cacheScope = "" } = {}) {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(cacheKeyFor(viewAs, cacheScope));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    return cached && Array.isArray(cached.employees) ? cached : null;
  } catch (_) {
    return null;
  }
}

const saveCachedAppraisalRoster = (roster, viewAs, cacheScope) => {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(cacheKeyFor(viewAs, cacheScope), JSON.stringify({
      ...roster,
      cachedAt: Date.now(),
    }));
  } catch (error) {
    console.warn("Could not cache the Appraisal Sheet roster:", error);
  }
};

const inFlight = new Map(); // key -> { startedAt, promise }

export function invalidateEmployeeRoster() {
  inFlight.clear();
  try {
    if (typeof window === "undefined") return;
    Object.keys(window.localStorage).forEach((key) => {
      if (key.startsWith(ROSTER_CACHE_PREFIX)) window.localStorage.removeItem(key);
    });
  } catch (_) {
    /* local cache is optional */
  }
}

onCatalystWrite(invalidateEmployeeRoster);
if (typeof window !== "undefined") {
  [
    "appraisal:cycle-updated",
    "appraisal:payroll-data-updated",
    "appraisal:feedback-data-updated",
    "appraisal:budget-data-updated",
  ].forEach((eventName) => window.addEventListener(eventName, invalidateEmployeeRoster));
}

async function fetchRosterPage(page, viewAs) {
  const url = new URL(catalystFunctionUrl("employeesapi"));
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(ROSTER_LIMIT));
  url.searchParams.set("view", "appraisal");
  url.searchParams.set("status", "all");
  url.searchParams.set("eligible", "all");
  if (viewAs) url.searchParams.set("viewAs", viewAs);
  url.searchParams.set("_ts", String(Date.now()));
  const response = await catalystFetch(url.toString(), {
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  let json = {};
  try {
    json = await response.json();
  } catch (_) {
    json = {};
  }
  if (!response.ok || (json && json.success === false)) {
    const error = new Error(
      (json && json.message) || `Failed to load employees (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return {
    data: Array.isArray(json && json.data) ? json.data : [],
    pagination: (json && json.pagination) || {},
    counts: (json && json.counts) || {},
    activeCycle: (json && json.activeCycle) || null,
  };
}

async function loadRoster(viewAs, cacheScope) {
  const first = await fetchRosterPage(1, viewAs);
  const totalPages = Math.max(1, Number(first.pagination.totalPages || 1));
  const rest = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) => fetchRosterPage(index + 2, viewAs)),
      )
    : [];
  const roster = {
    employees: [first, ...rest].flatMap((page) => page.data),
    counts: first.counts,
    pagination: first.pagination,
    activeCycle: first.activeCycle,
  };
  saveCachedAppraisalRoster(roster, viewAs, cacheScope);
  return roster;
}

/* Full Appraisal-view roster: { employees, counts, pagination }.
   viewAs: the HR role preview, if any (a preview gets its own request). */
// Each caller gets its own copy of the shared result.
const copyOf = (roster) => JSON.parse(JSON.stringify(roster));

export function fetchAppraisalRoster({ viewAs = "", cacheScope = "" } = {}) {
  const key = String(viewAs || "") + "::" + String(cacheScope || "anonymous").toLowerCase();
  const shared = inFlight.get(key);
  if (shared && Date.now() - shared.startedAt <= SHARE_WINDOW_MS) return shared.promise.then(copyOf);
  const entry = { startedAt: Date.now(), promise: null };
  entry.promise = loadRoster(String(viewAs || ""), cacheScope).catch((error) => {
    // A failed load is never shared; the next caller tries again.
    if (inFlight.get(key) === entry) inFlight.delete(key);
    throw error;
  });
  inFlight.set(key, entry);
  return entry.promise.then(copyOf);
}

// Same rule as employeesapi's status=active & eligible=eligible filters.
export function isActiveEligible(employee) {
  return (
    String(employee?.status || "").trim().toLowerCase() === "active" &&
    String(employee?.eligible_status || "").trim().toLowerCase() === "eligible"
  );
}
