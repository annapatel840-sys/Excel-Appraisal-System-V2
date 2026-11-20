/* Appraisal Sheet "Last Edited": remembers which employee(s) were edited last.

   - One inline edit (sheet or Detailed Screen)  -> that one employee.
   - One Bulk Edit apply (or restore)            -> every employee in that batch.
   Whichever happened last replaces the other, so the button always jumps to
   the most recent edit, whichever screen it came from.

   The latest edit is kept per location + cycle, in this browser right away,
   and - for a Tech-Ed login - also in the LastEdit_MyNotes table so it is
   still there after re-login or on another computer. */

import { fetchLastEditFromServer, saveLastEditToServer } from "./my-notes-api";

// v3 = one entry per location + cycle (v2 held a single employee for everything).
export const LAST_EDIT_STORAGE_KEY = "appraisal.lastEdit.v3";

let config = {
  enabled: false, // true for a Tech-Ed login: also save to / read from the backend
  getContext: () => ({ location: "", cycle: "" }),
};

export function configureLastEditSync(next) {
  config = { ...config, ...next };
}

const contextNow = () => {
  const ctx = (config.getContext && config.getContext()) || {};
  return { location: String(ctx.location || "").trim(), cycle: String(ctx.cycle || "").trim() };
};

const keyOf = ({ location, cycle }) =>
  `${(location || "All").toLowerCase()}::${(cycle || "").toLowerCase()}`;

const isBulkSource = (source) => String(source || "").trim().toLowerCase().startsWith("bulk");

const atMs = (record) => {
  const ms = Date.parse(record?.at || "");
  return Number.isFinite(ms) ? ms : 0;
};

/* ---------- this browser's copy ---------- */
const memory = new Map(); // still works when browser storage is unavailable

const readAll = () => {
  try {
    const raw = window.localStorage.getItem(LAST_EDIT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
};

export function readLastEdit(ctx = contextNow()) {
  const key = keyOf(ctx);
  const stored = readAll()[key] || memory.get(key) || null;
  return stored && Array.isArray(stored.empIds) && stored.empIds.length ? stored : null;
}

const writeLocal = (ctx, record) => {
  const key = keyOf(ctx);
  memory.set(key, record);
  try {
    const all = readAll();
    all[key] = record;
    window.localStorage.setItem(LAST_EDIT_STORAGE_KEY, JSON.stringify(all));
  } catch (_) {
    /* storage unavailable: the in-memory copy above still works */
  }
};

// The newer of two records (by time of the edit).
export const newestLastEdit = (a, b) => (!a ? b || null : !b ? a : atMs(b) > atMs(a) ? b : a);

/* ---------- backend copy (Tech-Ed only), saved a moment after the edit ---------- */
let timer = null;
let pending = null;
let chain = Promise.resolve();

function flushNow() {
  clearTimeout(timer);
  timer = null;
  const job = pending;
  pending = null;
  if (job) {
    const { ctx, record } = job;
    chain = chain
      .then(() =>
        saveLastEditToServer({
          location: ctx.location,
          cycle: ctx.cycle,
          source: record.source,
          batchId: record.batchId,
          empIds: record.empIds,
          merge: record.source === "BULK",
        }),
      )
      .catch((error) => {
        // The browser copy still works; the next edit tries the server again.
        console.warn("[last edit] could not save to the account:", error?.message || error);
      });
  }
  return chain;
}

// Called by the store with the audit entries of an edit it has just applied.
export function recordLastEdit(entries) {
  const list = (Array.isArray(entries) ? entries : []).filter((entry) => entry && entry.empId);
  if (!list.length) return;

  const ctx = contextNow();
  const last = list[list.length - 1];
  const at = last.at || new Date().toISOString();
  let record;

  if (isBulkSource(last.source)) {
    const batchId = String(last.batchId || "");
    const ids = new Set(
      list.filter((entry) => String(entry.batchId || "") === batchId).map((entry) => String(entry.empId).trim()),
    );
    // A Bulk Edit saves one field at a time: later steps of the same batch add to the list.
    const before = readLastEdit(ctx);
    if (batchId && before && before.source === "BULK" && before.batchId === batchId) {
      before.empIds.forEach((id) => ids.add(id));
    }
    record = { source: "BULK", batchId, empIds: [...ids], at };
  } else {
    record = { source: "SHEET", batchId: "", empIds: [String(last.empId).trim()], at };
  }

  writeLocal(ctx, record);

  if (config.enabled) {
    pending = { ctx, record };
    clearTimeout(timer);
    timer = setTimeout(flushNow, 400);
  }
}

// What the "Last Edited" button should jump to: the newest of this browser's
// copy and (for a Tech-Ed) the account copy.
export async function resolveLastEdit() {
  const ctx = contextNow();
  let local = readLastEdit(ctx);

  if (!config.enabled) return local;

  await flushNow(); // an edit made a moment ago is saved first

  try {
    const server = await fetchLastEditFromServer(ctx);
    if (server && Array.isArray(server.empIds) && server.empIds.length) {
      const asRecord = {
        source: server.source,
        batchId: server.batchId || "",
        empIds: server.empIds,
        at: server.editedAtMs ? new Date(server.editedAtMs).toISOString() : "",
      };
      const best = newestLastEdit(local, asRecord);
      if (best === asRecord) writeLocal(ctx, asRecord);
      return best;
    }
  } catch (error) {
    console.warn("[last edit] could not read from the account:", error?.message || error);
  }
  return local;
}