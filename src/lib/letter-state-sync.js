import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { cycleLocationOf, isAllLocations, matchesLocation } from "@/lib/location-store";

/*
 * Keeps the Letters data (people, letters, statuses, audit lines, "generated")
 * on the server, so every computer sees the same letters.
 *
 * - syncLetterState()  loads the saved cycles of a location into the screen
 *                      state (call it when a Letters / Cycle screen opens).
 * - notifyChanged()    called by the store after every change; the cycles that
 *                      changed are saved one second later (one JSON object per
 *                      cycle, in the Stratus bucket of its location).
 * - flush()            saves now and says whether it worked (used by Generate).
 *
 * The Appraisal_Sheet table is never read: the browser sends the people it
 * already holds. Server side: functions/lettersapi/lettersState.js.
 * Set VITE_LETTERS_STATE_ON_SERVER=false to keep the old browser-only demo.
 */

export const STATE_ON_SERVER = import.meta.env.VITE_LETTERS_STATE_ON_SERVER !== "false";

const API_URL = catalystFunctionUrl("lettersapi");
const SAVE_DELAY_MS = 1000;
const SYNC_EVERY_MS = 15000;
const FAIL_BACKOFF_MS = 60000;
const LOAD_TIMEOUT_MS = 25000;

let host = null; // { getS, touch }
const saved = new Map(); // cycleId -> { hash, rev }
let timer = null;
let saving = null;
let synced = false;

export function attach(h) {
  host = h;
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error("The letters server did not answer in time.")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function request({ method = "GET", body, params } = {}) {
  const url = new URL(API_URL);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await catalystFetch(url.toString(), {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) {
    const error = new Error(result?.message || `Letters request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result.data;
}

/* What is stored for one cycle. */
function collect(S, cy) {
  const id = cy.id;
  const sheet = S.sheet.filter((r) => r.cycle === id);
  const letters = S.letters.filter((l) => l.cycle === id);
  const refs = new Set(letters.map((l) => l.id));
  refs.add(id);
  const audit = S.audit.filter((a) => refs.has(a.ref));
  const loc = cy.loc || (sheet[0] && sheet[0].v && sheet[0].v.emLocation) || "";
  return {
    location: loc,
    state: { cycle: { id, name: cy.name, type: cy.type, fy: cy.fy, loc }, generated: !!S.generated[id], sheet, letters, audit },
  };
}

const shareable = (S) => S.cycles.filter((c) => !c.sample);

async function saveNow() {
  if (!STATE_ON_SERVER || !host) return { ok: true };
  if (saving) await saving.catch(() => {});
  await Promise.allSettled([...inflight.values()]);
  const S = host.getS();
  const run = (async () => {
    let conflict = false;
    for (const cy of shareable(S)) {
      const { location, state } = collect(S, cy);
      if (!state.generated && !state.letters.length) continue; // nothing worth storing yet
      const hash = JSON.stringify(state);
      const known = saved.get(cy.id);
      if (known && known.hash === hash) continue;
      try {
        const out = await request({
          method: "POST",
          body: { action: "saveState", cycleId: cy.id, location, baseRev: known ? known.rev : 0, state },
        });
        saved.set(cy.id, { hash, rev: out.rev });
      } catch (error) {
        if (error.status === 409) conflict = true;
        else throw error;
      }
    }
    if (conflict) {
      await syncLetterState({ force: true });
      throw new Error("Someone else saved the letters for this cycle first. Their version has been loaded; do your change again.");
    }
    return { ok: true };
  })();
  saving = run;
  try {
    return await run;
  } finally {
    saving = null;
  }
}

/* The cycle was archived: forget its saved copy here and delete it on the server.
   The caller has already removed the cycle from the screen state, so nothing saves it again. */
export async function forgetCycle({ id, location }) {
  const cycleId = String(id);
  if (!STATE_ON_SERVER) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (saving) await saving.catch(() => {});
  await Promise.allSettled([...inflight.values()]);
  saved.delete(cycleId);
  await request({ method: "POST", body: { action: "clearState", cycleId, location: location || "" } });
}

/* The store calls this after every change. */
export function notifyChanged() {
  if (!STATE_ON_SERVER || !host || !synced) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    saveNow().catch((error) => console.warn("Letters were not saved to the server:", error?.message || error));
  }, SAVE_DELAY_MS);
}

/* Save now. Resolves { ok:true } or { ok:false, message }. */
export async function flush() {
  if (!STATE_ON_SERVER) return { ok: true, local: true };
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await Promise.allSettled([...inflight.values()]);
  try {
    synced = true; // a save is being asked for explicitly
    return await saveNow();
  } catch (error) {
    return { ok: false, message: error?.message || "The letters could not be saved to the server." };
  }
}

/* Put the saved copy of the given cycles into the screen state.
   cycles = [{ id, location }]. Only these cycles are asked for: one small file
   each, nothing is scanned. A request already running for the same cycles is
   shared; a failed one is not repeated for a minute. */
const inflight = new Map(); // key -> promise
const lastDone = new Map(); // key -> { at, ok }

const isAll = (v) => ["", "all", "all locations", "alllocations"].includes(String(v ?? "").trim().toLowerCase());

export function syncLetterState({ cycles = [], force = false } = {}) {
  if (!STATE_ON_SERVER || !host) return Promise.resolve();
  const wanted = cycles
    .map((c) => ({ id: String(c && c.id ? c.id : "").trim(), location: String((c && c.location) || "").trim() }))
    .filter((c) => c.id && !isAll(c.location))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!wanted.length) return Promise.resolve();
  const key = wanted.map((c) => c.id).join(",");
  if (inflight.has(key)) return inflight.get(key);
  const prev = lastDone.get(key);
  if (!force && prev && Date.now() - prev.at < (prev.ok ? SYNC_EVERY_MS : FAIL_BACKOFF_MS)) return Promise.resolve();
  const promise = withTimeout(request({ params: { view: "state", cycles: JSON.stringify(wanted) } }), LOAD_TIMEOUT_MS)
    .then((data) => {
      const S = host.getS();
      (data.cycles || []).forEach((c) => {
        const id = String(c.cycleId);
        // Keep local edits not yet saved: only replace when nothing is pending.
        const mine = S.cycles.find((x) => x.id === id);
        if (mine && saved.has(id)) {
          const now = JSON.stringify(collect(S, mine).state);
          if (now !== saved.get(id).hash && !force) return;
        }
        const oldIds = new Set(S.letters.filter((l) => l.cycle === id).map((l) => l.id));
        oldIds.add(id);
        const meta = c.cycle || {};
        S.cycles = S.cycles.filter((x) => x.id !== id);
        S.cycles.unshift({ id, name: meta.name || "", type: meta.type || "Annual", fy: meta.fy || "", sample: false, loc: c.location });
        S.sheet = S.sheet.filter((r) => r.cycle !== id).concat(c.sheet || []);
        S.letters = S.letters.filter((l) => l.cycle !== id).concat(c.letters || []);
        S.audit = S.audit.filter((a) => !oldIds.has(a.ref)).concat(c.audit || []);
        S.generated[id] = !!c.generated;
        const merged = S.cycles.find((x) => x.id === id);
        saved.set(id, { hash: JSON.stringify(collect(S, merged).state), rev: Number(c.rev) || 0 });
      });
      synced = true;
      lastDone.set(key, { at: Date.now(), ok: true });
      host.touch();
    })
    .catch((error) => {
      lastDone.set(key, { at: Date.now(), ok: false });
      console.warn("Letters could not be loaded from the server:", error?.message || error);
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/* The Letters screen: the Active and Closed cycles of the location chosen in the
   top bar (every location's when All Locations is chosen). Letters are made when a
   cycle is closed, so a Closed cycle must be loaded too. Archived ones stay out. */
export async function syncForLocation(selectedLocation, { force = false } = {}) {
  if (!STATE_ON_SERVER || !host) return;
  let list = [];
  try {
    const data = await payrollCycleRequest("cycles");
    list = Array.isArray(data) ? data : [];
  } catch {
    return;
  }
  const flag = (v) => v === true || ["true", "1", "yes"].includes(String(v ?? "").trim().toLowerCase());
  const cycles = list
    .filter((c) => ["active", "closed"].includes(String(c?.status ?? c?.cycle_status ?? "").trim().toLowerCase()) && !flag(c?.archived) && !flag(c?.hidden))
    .filter((c) => !isAll(cycleLocationOf(c)))
    .filter((c) => isAllLocations(selectedLocation) || matchesLocation(cycleLocationOf(c), selectedLocation))
    .map((c) => ({ id: c.id ?? c.ROWID, location: cycleLocationOf(c) }));
  await syncLetterState({ cycles, force });
}