import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

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

let host = null; // { getS, touch }
const saved = new Map(); // cycleId -> { hash, rev }
let timer = null;
let saving = null;
let syncing = null;
let synced = false;
let lastSync = { key: "", at: 0 };

export function attach(h) {
  host = h;
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
  if (syncing) await syncing.catch(() => {});
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
  if (syncing) await syncing.catch(() => {});
  try {
    synced = true; // a save is being asked for explicitly
    return await saveNow();
  } catch (error) {
    return { ok: false, message: error?.message || "The letters could not be saved to the server." };
  }
}

/* Put the cycles saved on the server into the screen state. */
export function syncLetterState({ location = "All", force = false } = {}) {
  if (!STATE_ON_SERVER || !host) return Promise.resolve();
  const key = String(location || "All").trim().toLowerCase();
  if (syncing) return syncing;
  if (!force && lastSync.key === key && Date.now() - lastSync.at < SYNC_EVERY_MS) return Promise.resolve();
  syncing = request({ params: { view: "state", location: location || "All" } })
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
      lastSync = { key, at: Date.now() };
      host.touch();
    })
    .catch((error) => {
      console.warn("Letters could not be loaded from the server:", error?.message || error);
    })
    .finally(() => {
      syncing = null;
    });
  return syncing;
}