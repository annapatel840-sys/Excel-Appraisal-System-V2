import { catalystFetch, catalystFunctionUrl, onCatalystWrite } from "./catalyst-api";
import { getSelectedLocation } from "./location-store";

/* ============================================================
   DELEGATION ROSTER: SHARED REQUEST, EARLY START, SAVED COPY

   The Delegation screen needs employeesapi?view=delegation, which reads about
   seven Data Store tables on the server. That is the slow part, so this module
   does for Delegation what the Appraisal Sheet and the Eligibility List already
   do (employee-roster.js, roster-snapshot.js, employee-master-data.js):

   1. One shared request. The sign-in prefetch, the screen's own load and any
      remount share a request that is in flight, or one that finished less than
      SHARE_WINDOW_MS ago, instead of asking the server twice.
   2. An early start. App.jsx starts the request as soon as sign-in is
      confirmed when the browser lands on the Delegation tab, before the
      session, access rules and the screen itself have loaded.
   3. A saved copy. The last roster the signed-in user saw is kept in
      IndexedDB (same database and store as the Appraisal Sheet snapshot, so
      the existing sign-out clean-up removes it too). The screen shows it at
      once, read-only, while the fresh roster loads, then swaps it for the
      fresh one.

   The request URL, the pages, the order of the rows and what the screen does
   with them are exactly what DelegationScreen did before. Any save (any
   non-GET request sent through catalystFetch) and the app's update events
   throw away the shared request AND the saved copy, so a read after a change
   always goes to the server.
   ============================================================ */

const EMPLOYEE_API_URL = catalystFunctionUrl("employeesapi");
// employeesapi MAX_LIMIT: a roster of up to 5,000 rows comes back in one request.
const ROSTER_PAGE_LIMIT = 5000;
// A request started this long ago (still running or finished) is shared.
const SHARE_WINDOW_MS = 15000;
// A background prefetch (below) is read before anyone opens the screen, so it
// is allowed to be a little older when the screen finally asks for it.
const PREFETCH_SHARE_WINDOW_MS = 90000;

let inFlight = null; // { startedAt, promise, windowMs, locationKey }
// Bumped on every invalidation: a roster fetched before a change must not be
// saved as the "last seen" copy after it.
let generation = 0;

export const delegationGeneration = () => generation;

export function invalidateDelegationRoster() {
  generation += 1;
  inFlight = null;
  void clearDelegationSnapshots();
}

onCatalystWrite(invalidateDelegationRoster);
if (typeof window !== "undefined") {
  [
    "appraisal:cycle-updated",
    "appraisal:payroll-data-updated",
    "appraisal:feedback-data-updated",
    "appraisal:budget-data-updated",
    "appraisal:employee-master-updated",
  ].forEach((eventName) => window.addEventListener(eventName, invalidateDelegationRoster));
}

async function fetchRosterPage(pageNo, fallbackMessage, location) {
  const response = await catalystFetch(
    EMPLOYEE_API_URL + "?page=" + pageNo + "&limit=" + ROSTER_PAGE_LIMIT + "&view=delegation&gz=1&location=" + encodeURIComponent(location || "All"),
    { method: "GET", cache: "no-store" },
  );
  const payload = await response.json();
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || fallbackMessage);
  }
  return payload;
}

// Page 1, then any remaining pages together (a roster over 5,000 rows).
// Resolves to every raw row, in the order employeesapi returned them.
async function loadRosterRows(location) {
  const first = await fetchRosterPage(1, "Unable to load appraisal employees.", location);
  const all = Array.isArray(first.data) ? [...first.data] : [];
  const totalPages = Math.max(1, Number(first.pagination?.totalPages || 1));
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      fetchRosterPage(index + 2, "Unable to load the remaining delegation employees.", location),
    ),
  );
  rest.forEach((payload) => {
    if (Array.isArray(payload.data)) all.push(...payload.data);
  });
  return all;
}

/* Raw Delegation roster rows. `fresh: true` skips a shared copy (used for the
   screen's explicit reloads). The rows are read-only for callers: the screen
   maps them into its own objects. */
export function fetchDelegationRoster({ fresh = false, prefetch = false, location = getSelectedLocation() } = {}) {
  const locationKey = String(location || "All").trim().toLowerCase();
  if (!fresh && inFlight && inFlight.locationKey === locationKey && Date.now() - inFlight.startedAt <= inFlight.windowMs) {
    return inFlight.promise;
  }
  const entry = {
    startedAt: Date.now(),
    promise: null,
    windowMs: prefetch ? PREFETCH_SHARE_WINDOW_MS : SHARE_WINDOW_MS,
    locationKey,
  };
  entry.promise = loadRosterRows(location).catch((error) => {
    // A failed load is never shared; the next caller tries again.
    if (inFlight === entry) inFlight = null;
    throw error;
  });
  inFlight = entry;
  return entry.promise;
}

// Starts the roster request early; the screen's own load then joins it.
export function prefetchDelegationRoster() {
  fetchDelegationRoster({ prefetch: true }).catch(() => {
    /* the screen's own load reports the error */
  });
}

/* Warm-up for users who can open Delegation but did not land on it. The
   Appraisal Sheet is quick because its roster is requested before the screen
   is opened; this does the same for Delegation. It waits a moment, and for
   any Appraisal roster request already running (`waitFor`), so it never
   competes with the screen the user actually opened. Once per page load; a
   save or update event discards the result like any other shared request. */
let warmUpScheduled = false;
export function scheduleDelegationPrefetch(waitFor) {
  if (warmUpScheduled || typeof window === "undefined") return;
  warmUpScheduled = true;
  window.setTimeout(() => {
    Promise.resolve(typeof waitFor === "function" ? waitFor() : undefined)
      .catch(() => {})
      .then(() => {
        if (!inFlight) prefetchDelegationRoster();
      });
  }, 0);
}

/* ------------------------------------------------------------ saved copy */
// Same database and store as roster-snapshot.js, so clearSheetSnapshots()
// (run on sign-out) also removes this copy.
const DB_NAME = "appraisal-sheet";
const STORE = "snapshots";
const KEY_PREFIX = "delegation:";

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

function run(mode, action) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request ? request.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

// One saved copy per signed-in user (a Tech-ED's roster differs from HR's).
export const delegationSnapshotKey = (scope, location = getSelectedLocation()) =>
  KEY_PREFIX + String(scope || "").trim().toLowerCase() + "::" + String(location || "All").trim().toLowerCase();

// { rows, cycleId, cycleName, savedAt } or null. Every call fails quietly.
export function readDelegationSnapshot(key) {
  if (key === KEY_PREFIX) return Promise.resolve(null);
  return run("readonly", (store) => store.get(key))
    .then((value) =>
      value && Array.isArray(value.rows) && value.rows.length && value.cycleId ? value : null,
    )
    .catch(() => null);
}

// `startedGeneration`: delegationGeneration() from before the roster was
// fetched. A change since then means these rows may already be out of date.
export function writeDelegationSnapshot(key, snapshot, startedGeneration) {
  if (key === KEY_PREFIX || startedGeneration !== generation) return Promise.resolve();
  return run("readwrite", (store) => store.put({ ...snapshot, savedAt: Date.now() }, key)).catch(() => {});
}

function clearDelegationSnapshots() {
  return run("readwrite", (store) => store.delete(IDBKeyRange.bound(KEY_PREFIX, KEY_PREFIX + "￿"))).catch(
    () => {},
  );
}