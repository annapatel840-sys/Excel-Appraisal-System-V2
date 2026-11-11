import { useMemo, useSyncExternalStore } from "react";
import * as core from "./letters-core";

/*
 * Letters store.
 *
 * DEMO MODE: the Letters screen and the Letters step of the Appraisal Cycle
 * screen share one in-memory state (see letters-core.js), saved in this
 * browser (localStorage) so it survives a page reload. Nothing is emailed and
 * nothing is written to the Data Store.
 *
 * Going live: keep the action names below and replace their bodies with calls
 * to the Letters Catalyst function (read, save, generate, send). The screens
 * only talk to this file, so they do not change. See docs/LETTERS.md.
 */

export const LETTERS_DEMO = true;

const STORE_KEY = "letters_demo_v1";

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

function persist() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, S }));
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

/* ---------------- reading (React) ---------------- */

// The state object plus a counter that changes on every update, for use in
// useMemo dependency lists (the state object itself is edited in place).
export function useLetters() {
  const v = useSyncExternalStore(subscribe, getVersion);
  return { S, version: v };
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
export async function generateLettersForCycle(cycle, actor) {
  return run(actor, (st) => {
    core.bindAnnualCycle(st, cycle);
    const result = core.generateLetters(st, String(cycle.id));
    core.audit(st, "Cycle", String(cycle.id), "Letters generated", "", `${result.created} new, ${result.regenerated} regenerated, ${result.kept} unchanged`);
    return result;
  });
}

export const reviewLetters = (ids, actor) => run(actor, (st) => core.markReviewed(st, ids));
export const sendLetters = (ids, actor) => run(actor, (st) => core.sendLetters(st, ids));
export const moreOnLetters = (action, ids, reason, actor) => run(actor, (st) => core.moreAction(st, action, ids, reason));
export const sendTestLetter = (id, actor) => run(actor, (st) => core.testSend(st, core.lOf(st, id)));
export const saveRemark = (id, value, actor) => run(actor, (st) => core.setRemark(st, id, value));
export const saveRules = (draft, reason, actor) => run(actor, (st) => core.saveRules(st, draft, reason));
export const saveFields = (draft, reason, actor) => run(actor, (st) => core.saveFields(st, draft, reason));
export const saveTemplate = (id, draft, reason, actor) => run(actor, (st) => core.saveTemplate(st, id, draft, reason));
export const createTemplate = (draft, reason, actor) => run(actor, (st) => core.createTemplate(st, draft, reason));

// Demo helpers (shown only while LETTERS_DEMO is true).
export const loadSampleLetters = (actor) => run(actor, (st) => core.loadSampleLetters(st));
export function resetSampleData() {
  S = core.createState();
  commit();
}
