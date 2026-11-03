/* ============================================================
   APPRAISAL SHEET SNAPSHOT

   The last Appraisal Sheet rows a user saw, kept in the browser
   (IndexedDB) so a refresh can show them at once while the fresh roster
   loads. One snapshot per signed-in user and View-as role. IndexedDB, not
   localStorage: a 2,000-row sheet is several MB, about the whole
   localStorage allowance. Every call fails quietly; the sheet then just
   waits for the network as before.
   ============================================================ */

const DB_NAME = "appraisal-sheet";
const STORE = "snapshots";

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
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

export const snapshotKey = (scope, viewAs) =>
  String(scope || "anonymous").trim().toLowerCase() + ":" + String(viewAs || "");

// { rows, counts, appraisalYear, savedAt } or null.
export function readSheetSnapshot(key) {
  return run("readonly", (store) => store.get(key))
    .then((value) => (value && Array.isArray(value.rows) ? value : null))
    .catch(() => null);
}

export function writeSheetSnapshot(key, snapshot) {
  return run("readwrite", (store) => store.put({ ...snapshot, savedAt: Date.now() }, key)).catch(() => {});
}

// On sign-out: salary data must not stay in the browser for the next user.

// Eligibility List snapshot uses the same IndexedDB store and is scoped to
// the signed-in user. The snapshot is display-only until the fresh API result
// arrives; Employee Master disables edits during that short refresh window.
export const eligibilitySnapshotKey = (scope) =>
  "eligibility:" + String(scope || "anonymous").trim().toLowerCase();

export function readEligibilitySnapshot(key) {
  return run("readonly", (store) => store.get(key))
    .then((value) =>
      value && Array.isArray(value.employees) && Array.isArray(value.masterEmployees)
        ? value
        : null,
    )
    .catch(() => null);
}

export function writeEligibilitySnapshot(key, snapshot) {
  return run("readwrite", (store) =>
    store.put({ ...snapshot, savedAt: Date.now() }, key),
  ).catch(() => {});
}

export function clearEligibilitySnapshot(key) {
  return run("readwrite", (store) => store.delete(key)).catch(() => {});
}

export function clearSheetSnapshots() {
  return run("readwrite", (store) => store.clear()).catch(() => {});
}
