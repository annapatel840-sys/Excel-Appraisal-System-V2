import { useMemo, useSyncExternalStore } from "react";
import * as core from "./letters-core";
import * as api from "./letters-api";

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
function forStorage() {
  return {
    ...S,
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
}

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

function setSync(next) {
  sync = next;
  version += 1;
  listeners.forEach((l) => l());
}

// Load the templates held on the server into the state. Call it when the
// Letters screen opens; {force:true} is the Retry button.
export function syncTemplates({ force = false } = {}) {
  if (!api.TEMPLATES_ON_SERVER) return Promise.resolve();
  if (syncing && !force) return syncing;
  setSync({ status: "loading", message: "" });
  syncing = api
    .loadServerTemplates()
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

/* ---------------- reading (React) ---------------- */

// The state object plus a counter that changes on every update, for use in
// useMemo dependency lists (the state object itself is edited in place).
export function useLetters() {
  const v = useSyncExternalStore(subscribe, getVersion);
  return { S, version: v, sync };
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

export async function generateLettersForCycle(cycle, actor, sheetRows) {
  return run(actor, (st) => {
    core.bindAnnualCycle(st, cycle);
    if (Array.isArray(sheetRows)) {
      const id = String(cycle.id);
      st.sheet = st.sheet.filter((r) => r.cycle !== id).concat(sheetRows.map((r) => ({ ...r, cycle: id })));
    }
    const result = core.generateLetters(st, String(cycle.id));
    // Why people got no letter: no Letter Rule matched their numbers, or the
    // rule's template has no active version for their location.
    const mine = st.sheet.filter((r) => r.cycle === String(cycle.id) && r.status === "Active");
    result.people = mine.length;
    result.noRule = 0;
    result.noTemplate = 0;
    mine.forEach((r) => {
      const rules = core.pick(st, r);
      if (!rules.length) result.noRule += 1;
      else if (rules.every((rule) => !core.resolveTemplate(st, rule.tpl, r))) result.noTemplate += 1;
    });
    core.audit(st, "Cycle", String(cycle.id), "Letters generated", "", `${result.created} new, ${result.regenerated} regenerated, ${result.kept} unchanged`);
    return result;
  });
}

export const reviewLetters = (ids, actor) => run(actor, (st) => core.markReviewed(st, ids));
export const previewLetter = (id, actor) => run(actor, (st) => core.reviewOnPreview(st, id));
export const sendLetters = (ids, actor) => run(actor, (st) => core.sendLetters(st, ids));
export const moreOnLetters = (action, ids, reason, actor) => run(actor, (st) => core.moreAction(st, action, ids, reason));
export const sendTestLetter = (id, actor) => run(actor, (st) => core.testSend(st, core.lOf(st, id)));
export const sendTestTemplate = (id, empName, version, actor) =>
  run(actor, (st) => {
    const t = core.tplOf(st, id);
    core.audit(st, "Templates", id, "Test sent", "", `To ${t.sg.from} with the data of ${empName} (${version})`, "v" + t.ver);
    return t.sg.from;
  });
export const saveRemark = (id, value, actor) => run(actor, (st) => core.setRemark(st, id, value));
export const saveRules = (draft, reason, actor) => run(actor, (st) => core.saveRules(st, draft, reason));
export const saveFields = (draft, reason, actor) => run(actor, (st) => core.saveFields(st, draft, reason));

// Demo helpers (shown only while LETTERS_DEMO is true).
export const loadSampleLetters = (actor) => run(actor, (st) => core.loadSampleLetters(st));
export function resetSampleData() {
  S = core.createState();
  commit();
  syncTemplates({ force: true }); // templates on the server come straight back
}
