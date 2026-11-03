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
   - The app starts the request as soon as the user is signed in
     (prefetchAppraisalRoster), before the screens have rendered; the
     sheet's own load then shares it.
   - Other large reads on the sheet (Feedback, Budget) wait for the roster
     to arrive (appraisalRosterSettled) so they do not compete with it.
   ============================================================ */

// Match the backend MAX_LIMIT so an HR roster is returned in one request.
export const ROSTER_LIMIT = 5000;
// A request started this long ago (still running or finished) is shared.
const SHARE_WINDOW_MS = 15000;
// Older builds kept a raw roster copy in localStorage; it is removed on sight.
const LEGACY_CACHE_PREFIX = "appraisal.roster.snapshot.v1:";
// Callers waiting for the roster stop waiting after this long.
const SETTLE_WAIT_MS = 30000;

const inFlight = new Map(); // viewAs -> { startedAt, promise, settled }

function removeLegacyCache() {
  try {
    if (typeof window === "undefined") return;
    Object.keys(window.localStorage).forEach((key) => {
      if (key.startsWith(LEGACY_CACHE_PREFIX)) window.localStorage.removeItem(key);
    });
  } catch (_) {
    /* local cache is optional */
  }
}
removeLegacyCache();

export function invalidateEmployeeRoster() {
  inFlight.clear();
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
  // Ask employeesapi to gzip the (several MB) response.
  url.searchParams.set("gz", "1");
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

async function loadRoster(viewAs) {
  const first = await fetchRosterPage(1, viewAs);
  const totalPages = Math.max(1, Number(first.pagination.totalPages || 1));
  const rest = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) => fetchRosterPage(index + 2, viewAs)),
      )
    : [];
  return {
    employees: [first, ...rest].flatMap((page) => page.data),
    counts: first.counts,
    pagination: first.pagination,
    activeCycle: first.activeCycle,
  };
}

/* Full Appraisal-view roster: { employees, counts, pagination }.
   viewAs: the HR role preview, if any (a preview gets its own request).
   cacheScope is accepted for older callers; one page belongs to one user. */
// Each caller gets its own copy of the shared result.
const copyOf = (roster) => JSON.parse(JSON.stringify(roster));

export function fetchAppraisalRoster({ viewAs = "" } = {}) {
  const key = String(viewAs || "");
  const shared = inFlight.get(key);
  if (shared && Date.now() - shared.startedAt <= SHARE_WINDOW_MS) return shared.promise.then(copyOf);
  const entry = { startedAt: Date.now(), promise: null, settled: false };
  entry.promise = loadRoster(key).then(
    (roster) => {
      entry.settled = true;
      return roster;
    },
    (error) => {
      entry.settled = true;
      // A failed load is never shared; the next caller tries again.
      if (inFlight.get(key) === entry) inFlight.delete(key);
      throw error;
    },
  );
  inFlight.set(key, entry);
  return entry.promise.then(copyOf);
}

// Starts the roster request early; the screens that need it share it.
export function prefetchAppraisalRoster({ viewAs = "" } = {}) {
  fetchAppraisalRoster({ viewAs }).catch(() => {
    /* the screen's own load reports the error */
  });
}

// Resolves once no roster request is running (at once if none is), never rejects.
export function appraisalRosterSettled() {
  const running = Array.from(inFlight.values()).filter((entry) => !entry.settled);
  if (!running.length) return Promise.resolve();
  const timeout = new Promise((resolve) => setTimeout(resolve, SETTLE_WAIT_MS));
  return Promise.race([
    Promise.all(running.map((entry) => entry.promise.catch(() => {}))),
    timeout,
  ]).then(() => {});
}

// Same rule as employeesapi's status=active & eligible=eligible filters.
export function isActiveEligible(employee) {
  return (
    String(employee?.status || "").trim().toLowerCase() === "active" &&
    String(employee?.eligible_status || "").trim().toLowerCase() === "eligible"
  );
}
