import { useMemo, useSyncExternalStore } from "react";
import * as core from "./letters-core";
import * as api from "./letters-api";
import * as stateSync from "./letters-state-sync";

/*
 * Letters store.
 *
 * DEMO MODE: the Letters screen and the Letters step of the Appraisal Cycle
 * screen share one in-memory state (see letters-core.js), saved in this
 * browser (localStorage) so it survives a page reload. Nothing is emailed and
 * nothing is written to the Data Store.
 *
 * TEMPLATES are the exception: they are stored on the server (letters-api.js ->
 * functions/lettersapi) and loaded into this state by syncTemplates().
 * So are the Letter RULES and Letter FIELDS: they are stored once on the server
 * (syncConfig / saveRules / saveFields below) and stay until somebody edits or
 * deletes them. Whatever this browser holds is only a cache; the server copy wins.
 *
 * Going live: keep the action names below and replace their bodies with calls
 * to the Letters Catalyst function (read, save, generate, send). The screens
 * only talk to this file, so they do not change. See docs/LETTERS.md.
 */

export const LETTERS_DEMO = true;

const STORE_KEY = "letters_demo_v2";

function loadSaved() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const s = saved && saved.v === 1 ? saved.S : null;
    const ok =
      s &&
      ["cycles", "sheet", "letters", "audit", "rules", "fields", "tpls"].every((k) => Array.isArray(s[k])) &&
      s.sign &&
      s.generated;
    return ok ? s : null;
  } catch {
    return null;
  }
}

let S = loadSaved() || core.createState();
let version = 0;
const listeners = new Set();

// Logos and signatures of server templates are big and come back from the
// server on every load, so they are not kept in this browser copy.
// The people, letters and audit lines of real cycles live on the server
// (Appraisal_Sheet and the Stratus state file), so they are not copied into this
// browser: a stale copy here was shown instead of the table's data.
function forStorage() {
  const real = new Set(S.cycles.filter((c) => !c.sample).map((c) => c.id));
  const refs = new Set(S.letters.filter((l) => real.has(l.cycle)).map((l) => l.id));
  real.forEach((id) => refs.add(id));
  return {
    ...S,
    sheet: S.sheet.filter((r) => !real.has(r.cycle)),
    letters: S.letters.filter((l) => !real.has(l.cycle)),
    audit: S.audit.filter((a) => !refs.has(a.ref)),
    cycles: S.cycles.filter((c) => c.sample),
    generated: Object.fromEntries(Object.entries(S.generated || {}).filter(([id]) => !real.has(id))),
    tpls: S.tpls.map((t) =>
      t.fromServer && t.sg ? { ...t, sg: { ...t.sg, logoData: "", sigData: "" } } : t,
    ),
  };
}

function persist() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, S: forStorage() }));
  } catch {
    /* private window / quota: the demo simply will not survive a reload */
  }
}

function commit() {
  version += 1;
  persist();
  listeners.forEach((l) => l());
  stateSync.notifyChanged(); // changed cycles are saved to the server
}

// The sync module edits S in place and only needs the screens told.
stateSync.attach({
  getS: () => S,
  touch: () => {
    version += 1;
    persist();
    listeners.forEach((l) => l());
  },
});
export const syncLetterState = stateSync.syncLetterState;
export const syncLettersForLocation = stateSync.syncForLocation;

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;

/* Run one change against the state, as `actor`, and tell the screens. */
function run(actor, fn) {
  S.actor = actor || "HR";
  S.t = null;
  try {
    return fn(S);
  } finally {
    commit();
  }
}

/* ---------------- templates on the server ---------------- */

// { status: "idle" | "loading" | "ok" | "error", message }
let sync = { status: "idle", message: "" };
let syncing = null;
let syncingFor = "";

function setSync(next) {
  sync = next;
  version += 1;
  listeners.forEach((l) => l());
}

// Load the templates held on the server into the state. Call it when the
// Letters screen opens; {force:true} is the Retry button.
export function syncTemplates({ force = false, location } = {}) {
  if (!api.TEMPLATES_ON_SERVER) return Promise.resolve();
  const warm = api.warmUp();
  const loc = !location || /^all( locations)?$/i.test(String(location).trim()) ? "" : String(location).trim();
  if (syncing && !force && syncingFor === loc) return syncing;
  syncingFor = loc;
  setSync({ status: "loading", message: "" });
  syncing = warm
    .then(() => api.loadServerTemplates(loc))
    .then(({ templates, problems }) => {
      run("HR", (st) => core.applyServerTemplates(st, templates));
      if (problems.length) setSync({ status: "error", message: problems.map((x) => x.message).join(" ") });
      else setSync({ status: "ok", message: "" });
    })
    .catch((error) => setSync({ status: "error", message: error?.message || "The templates could not be loaded." }))
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

/* Publish a template: the server first (Word file, content, index row), then
   the screen's own state. If the server refuses, nothing changes here and the
   error reaches the editor. `draft.docx` is the File picked with Import from Word. */
export async function publishTemplate(id, draft, reason, actor) {
  const existing = id ? core.tplOf(S, id) : null;
  const tplId = id || core.newTemplateId();
  let meta = null;
  if (api.TEMPLATES_ON_SERVER) {
    const saved = await api.saveServerTemplate({
      template: {
        id: tplId,
        name: draft.name,
        family: draft.family,
        location: draft.location || "",
        font: draft.font,
        fsize: draft.fsize,
        lh: draft.lh,
        html: draft.html,
        body: draft.body,
        sg: draft.sg,
      },
      baseVer: existing ? existing.ver : 0,
      note: reason,
      docxFile: draft.docx || null,
    });
    meta = { ver: saved.ver, by: saved.by, on: saved.on, file: saved.file, hist: saved.hist, hasDocx: saved.hasDocx, active: saved.active, fromServer: true };
  }
  return run(actor, (st) => {
    core.publishTemplate(st, tplId, draft, reason, meta);
    return core.tplOf(st, tplId);
  });
}

export async function setTemplateActive(id, active, actor) {
  const t = core.tplOf(S, id);
  // A built-in sample that was never published to the server is switched here only.
  if (api.TEMPLATES_ON_SERVER && t && t.fromServer) await api.setServerTemplateActive(id, active);
  return run(actor, (st) => core.setTemplateActive(st, id, active));
}

/* ---------------- rules + fields on the server ---------------- */

// { status: "idle" | "loading" | "ok" | "error", message, location, exists, rev, fieldsExists, fieldsRev }
//   Rules are kept per location: `location` is the one loaded, exists = the server holds saved rules for it,
//   rev = their revision (used to spot a clash). Fields are shared: fieldsExists / fieldsRev.
let config = { status: "idle", message: "", location: "", exists: false, rev: 0, fieldsExists: false, fieldsRev: 0 };
let configSyncing = null;
let configSyncingFor = "";
let configFor = ""; // the location asked for last
const locOf = (location) => (!location || /^all( locations)?$/i.test(String(location).trim()) ? "" : String(location).trim());

function setConfig(next) {
  config = { ...config, ...next };
  version += 1;
  listeners.forEach((l) => l());
}

// Load the rules of one location (and the shared fields) held on the server into the state.
// Call it when the Letters screen opens or the location changes; {force:true} is the Retry button
// (it reloads the location asked for last). No location = every location's rules, to look at.
export function syncConfig({ force = false, location } = {}) {
  if (!api.CONFIG_ON_SERVER) return Promise.resolve();
  const loc = location === undefined ? configFor : locOf(location);
  if (configSyncing && !force && configSyncingFor === loc) return configSyncing;
  configFor = loc;
  configSyncingFor = loc;
  setConfig({ status: "loading", message: "", location: loc });
  const p = api
    .loadServerConfig(loc)
    .then((cfg) => {
      // The rules of THIS location replace this location's rules only; the others stay as they are.
      run("HR", (st) => core.applyServerConfig(st, cfg, loc));
      if (configFor === loc) {
        setConfig({ status: "ok", message: "", location: loc, exists: !!cfg.exists, rev: Number(cfg.rev) || 0, fieldsExists: !!cfg.fieldsExists, fieldsRev: Number(cfg.fieldsRev) || 0 });
      }
    })
    .catch((error) => {
      if (configFor === loc) setConfig({ status: "error", message: error?.message || "The letter rules could not be loaded." });
    })
    .finally(() => {
      if (configSyncing === p) configSyncing = null;
    });
  configSyncing = p;
  return p;
}

// Ask the server to keep the rules of ONE location. Throws (nothing changes here) when it refuses.
async function pushRules({ location, rules, entry, baseRev }) {
  try {
    const saved = await api.saveServerRules({ location, rules, baseRev: baseRev ?? config.rev, audit: entry ? [entry] : [] });
    if (config.location === location) setConfig({ status: "ok", message: "", exists: true, rev: Number(saved.rev) || 0 });
  } catch (error) {
    // Somebody saved first: show their version, then tell the person.
    if (error && error.status === 409) await syncConfig({ force: true, location });
    throw error;
  }
}

// Ask the server to keep the fields (the same for every location).
async function pushFields({ fields, entry, baseRev }) {
  try {
    const saved = await api.saveServerFields({ fields, baseRev: baseRev ?? config.fieldsRev, audit: entry ? [entry] : [] });
    setConfig({ status: "ok", message: "", fieldsExists: true, fieldsRev: Number(saved.rev) || 0 });
  } catch (error) {
    if (error && error.status === 409) await syncConfig({ force: true });
    throw error;
  }
}

/* Save the Letter Rules. `baseRev` = the revision the edit started from (config.rev when the
   person pressed Edit), so a change somebody else saved meanwhile is noticed, not overwritten.
   Server first: if it refuses, the screen keeps the old rules and the error reaches the tab. */
export async function saveRules(draft, reason, actor, baseRev, location) {
  S.actor = actor || "HR";
  const loc = locOf(location);
  if (api.CONFIG_ON_SERVER && !loc) throw new Error("Choose a location in the top bar first. Letter rules are kept for one location at a time.");
  const plan = core.planRulesSave(S, draft, reason, loc);
  if (!plan.count) return 0;
  if (api.CONFIG_ON_SERVER) await pushRules({ location: loc, rules: draft, entry: plan.entry, baseRev });
  return run(actor, (st) => core.saveRules(st, draft, reason, plan, loc));
}

export async function saveFields(draft, reason, actor, baseRev) {
  S.actor = actor || "HR";
  const plan = core.planFieldsSave(S, draft, reason);
  if (!plan.count) return 0;
  if (api.CONFIG_ON_SERVER) await pushFields({ fields: draft, entry: plan.entry, baseRev });
  return run(actor, (st) => core.saveFields(st, draft, reason, plan));
}

// First time only: no fields are stored on the server yet, so this screen shows what this
// browser holds. This stores them, and from then on the server copy is the one everybody sees.
export async function saveCurrentFieldsToServer(actor) {
  S.actor = actor || "HR";
  const entry = core.mkAudit(S, "Fields", "", "Fields saved", "", `Stored ${S.fields.length} field${S.fields.length === 1 ? "" : "s"} on the server`);
  await pushFields({ fields: S.fields, entry, baseRev: config.fieldsRev });
  run(actor, (st) => st.audit.unshift(entry));
}

/* ---------------- reading (React) ---------------- */

// The state object plus a counter that changes on every update, for use in
// useMemo dependency lists (the state object itself is edited in place).
export function useLetters() {
  const v = useSyncExternalStore(subscribe, getVersion);
  return { S, version: v, sync, config };
}

// { [cycleId]: { gen, toSend, sent, dropped, outOfDate, missing, total } }
// for the Letters step of the Appraisal Cycle screen.
export function useLettersStats() {
  const v = useSyncExternalStore(subscribe, getVersion);
  return useMemo(() => {
    const out = {};
    S.cycles.forEach((c) => {
      out[c.id] = core.lettersStats(S, c.id);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
}

/* ---------------- actions ---------------- */

// Appraisal Cycle screen -> Letters step -> Generate / Regenerate.
// cycle = { id, name, effective, start } from the Appraisal Cycle Master.
// sheetRows (optional) = the Appraisal Sheet rows the screen already holds in
// the browser. When given they replace the demo people for this cycle, so
// nothing has to be read from the Appraisal_Sheet table on the server.
export function sheetRowsForLetters(rows, cycleId, location) {
  const want = String(location || "").trim().toLowerCase();
  const all = !want || want === "all";
  const num = (v) => Number(v || 0);
  return (Array.isArray(rows) ? rows : [])
    .filter((e) => e && (all || String(e.location || "").trim().toLowerCase() === want))
    .map((e) => {
      const pb = num(e.newPBToBeOffered);
      const base = num(e.currentAnnualBasePay);
      const hike = num(e.hikeAmount);
      const promo = /^y/i.test(String(e.eligibleForPromotion || ""));
      return {
        id: String(e.empId || e.id),
        name: e.name || "",
        tech: e.reportingManager || e.manager || "",
        org: "Wissen India",
        cycle: String(cycleId),
        status: /^inactive|resign|exit/i.test(String(e.status || "")) ? "Inactive" : "Active",
        email: e.email || "",
        v: {
          promo: promo ? "Yes" : "No",
          basePay: base,
          newBase: base + hike,
          hikeAmt: hike,
          hikePct: num(e.hikePct),
          newPB: pb,
          newRB: num(e.newRB),
          tpbNext: num(e.targetPBNextYear),
          newTitle: e.newTitle || "",
          designation: e.designation || "",
          effDate: "",
          pbInst: e.newPBInstallment || "",
          band: "",
          rating: e.managerRating === undefined || e.managerRating === null ? "" : String(e.managerRating),
          compRemarks: e.compManagerRemarks || "",
          pbMonths: [],
          rbMonth: e.monthRB || "",
          tpbMonth: "",
          emLocation: e.location || "",
          emDoj: e.doj || "",
          emGrade: "",
          emManager: e.reportingManager || "",
          emDept: e.department || "",
        },
      };
    });
}

// True when letters could be made for this cycle's location: at least one Active template for it
// (or one for every location). Without a template the heavy Appraisal Sheet read is pointless.
export function hasActiveTemplateFor(location) {
  const all = !location || /^all( locations)?$/i.test(String(location).trim());
  return S.tpls.some((t) => (!api.TEMPLATES_ON_SERVER || t.fromServer) && t.active !== false && (all || !t.location || /^all/i.test(String(t.location)) || String(t.location).trim().toLowerCase() === String(location).trim().toLowerCase()));
}

export async function generateLettersForCycle(cycle, actor, sheetRows) {
  // Letters need a template: check the location's templates first (a small, cached read) so a
  // location without templates does not start the heavy Appraisal Sheet read at all.
  if (api.TEMPLATES_ON_SERVER) {
    await syncTemplates({ location: cycle.location });
    if (sync.status === "error") throw new Error(`The letter templates could not be loaded: ${sync.message}`);
    if (!hasActiveTemplateFor(cycle.location)) {
      throw new Error(
        `There is no active letter template for ${cycle.location || "this location"} yet. Import the templates in Letters > Templates; letters are then made the next time this cycle is opened.`,
      );
    }
  }
  // The letters follow the Letter Rules stored on the server, never an old copy from this browser.
  if (api.CONFIG_ON_SERVER) {
    await syncConfig({ force: true, location: cycle.location });
    if (config.status === "error") throw new Error(`The letter rules could not be loaded: ${config.message}`);
  }
  // Make sure this cycle's saved copy is loaded first, so Generate adds to it.
  // Do not let a slow read of the saved copy hold Generate back: wait for it at most 4 s.
  await Promise.race([
    stateSync.syncLetterState({ cycles: [{ id: cycle.id, location: cycle.location }] }),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
  // The people always come from the Appraisal_Sheet table (this cycle, this
  // location), never from what this browser happens to hold. Rows passed in by
  // a caller are used as given.
  if (!Array.isArray(sheetRows)) {
    const loaded = await api.loadServerSheet(cycle.id, cycle.location);
    sheetRows = sheetRowsForLetters(loaded.rows, cycle.id, cycle.location);
    if (!sheetRows.length) {
      throw new Error(
        `No Appraisal Sheet rows were found for ${cycle.location || "this cycle"} in ${cycle.name || "this cycle"}. Generate the Appraisal Sheet first.`,
      );
    }
  }
  const result = run(actor, (st) => {
    const cy = core.bindAnnualCycle(st, cycle);
    if (cycle.location && !/^all/i.test(String(cycle.location))) cy.loc = cycle.location;
    if (Array.isArray(sheetRows)) {
      const id = String(cycle.id);
      st.sheet = st.sheet.filter((r) => r.cycle !== id).concat(sheetRows.map((r) => ({ ...r, cycle: id })));
    }
    const out = core.generateLetters(st, String(cycle.id));
    // Why people got no letter: no Letter Rule matched their numbers, or the
    // rule's template has no active version for their location.
    const mine = st.sheet.filter((r) => r.cycle === String(cycle.id) && r.status === "Active");
    out.people = mine.length;
    out.noRule = 0;
    out.noTemplate = 0;
    mine.forEach((r) => {
      const rules = core.pick(st, r);
      if (!rules.length) out.noRule += 1;
      else if (rules.every((rule) => !core.resolveTemplate(st, rule.tpl, r))) out.noTemplate += 1;
    });
    core.audit(st, "Cycle", String(cycle.id), "Letters generated", "", `${out.created} new, ${out.regenerated} regenerated, ${out.kept} unchanged`);
    return out;
  });
  // Stored on the server so every computer sees them.
  // ...and a slow save must not hold the result back either: wait at most 12 s.
  const saveState = await Promise.race([
    stateSync.flush(),
    new Promise((resolve) => setTimeout(() => resolve({ ok: false, message: "the server did not confirm the save in time" }), 12000)),
  ]);
  result.saved = saveState.ok;
  result.saveError = saveState.ok ? "" : saveState.message;
  return result;
}

// Archiving a cycle clears its letters: the people, letters and audit lines are removed from
// the screen state and the stored copy is deleted on the server.
export async function clearLettersForCycle(cycle, actor) {
  const id = String(cycle.id);
  run(actor, (st) => {
    const refs = new Set(st.letters.filter((l) => l.cycle === id).map((l) => l.id));
    refs.add(id);
    st.letters = st.letters.filter((l) => l.cycle !== id);
    st.sheet = st.sheet.filter((r) => r.cycle !== id);
    st.audit = st.audit.filter((a) => !refs.has(a.ref));
    delete st.generated[id];
    st.cycles = st.cycles.filter((c) => c.id !== id);
  });
  await stateSync.forgetCycle({ id, location: cycle.location });
}

export const reviewLetters = (ids, actor) => run(actor, (st) => core.markReviewed(st, ids));
export const previewLetter = (id, actor) => run(actor, (st) => core.reviewOnPreview(st, id));
export const sendLetters = (ids, actor) => run(actor, (st) => core.sendLetters(st, ids));
// The Send button on the Letters screen: Ready -> Delivered (no mail yet).
export const markLettersSent = (ids, actor) => run(actor, (st) => core.markSent(st, ids));
/* Really e-mail letters. `mails` = [{ id, to, subject, html }] built by the screen (it holds the
   merged letter). One at a time, so one bad address never stops the rest and nobody is mailed twice.
   Returns { sent, failed, errors:[message] }. */
export async function emailLetters(mails, actor) {
  const out = { sent: 0, failed: 0, errors: [] };
  for (const m of mails) {
    const cur = S.letters.find((x) => x.id === m.id);
    if (!cur || !core.UNSENT_STATUSES.includes(cur.status)) continue; // already sent meanwhile
    try {
      const res = await api.sendServerLetter({ letterId: m.id, to: m.to, subject: m.subject, html: m.html });
      run(actor, (st) => core.recordMailResult(st, m.id, true, "", res.from));
      out.sent += 1;
    } catch (e) {
      const msg = e?.message || "The email could not be sent.";
      run(actor, (st) => core.recordMailResult(st, m.id, false, msg));
      out.failed += 1;
      out.errors.push(msg);
    }
  }
  return out;
}
export const moreOnLetters = (action, ids, reason, actor) => run(actor, (st) => core.moreAction(st, action, ids, reason));
export const sendTestLetter = (id, actor) => run(actor, (st) => core.testSend(st, core.lOf(st, id)));
export const sendTestTemplate = (id, empName, version, actor) =>
  run(actor, (st) => {
    const t = core.tplOf(st, id);
    core.audit(st, "Templates", id, "Test sent", "", `To ${t.sg.from} with the data of ${empName} (${version})`, "v" + t.ver);
    return t.sg.from;
  });
export const saveRemark = (id, value, actor) => run(actor, (st) => core.setRemark(st, id, value));

// Demo helpers (shown only while LETTERS_DEMO is true).
export const loadSampleLetters = (actor) => run(actor, (st) => core.loadSampleLetters(st));
export function resetSampleData() {
  S = core.createState();
  commit();
  syncTemplates({ force: true }); // templates on the server come straight back
  syncConfig({ force: true }); // ...and so do the rules and fields
}