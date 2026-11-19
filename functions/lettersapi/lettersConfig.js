"use strict";

/*
 * Letter RULES and Letter FIELDS on the server.
 *
 * Rules decide which letter an employee gets; fields are the Appraisal Sheet
 * columns the rules (and the {{tags}} of a letter) can use. Both are kept
 * together because a rule's conditions point at field ids. They used to live
 * only in the browser (and in the code as a built-in sample), so a rule added
 * on one computer was missing on the next. Now one JSON object holds them for
 * everybody until somebody edits or deletes them:
 *
 *     config/letters-config.json   in the bucket  <LETTERS_BUCKET_PREFIX>-config
 *                                  (override the whole name with LETTERS_CONFIG_BUCKET)
 *
 * Rules are not tied to a location (the template a rule names is), so this is
 * one bucket for the whole organisation, created by hand in the console like
 * the per-location template buckets.
 *
 *   GET  ?view=config
 *        -> { exists, rev, rules, fields, audit, savedBy, savedAt }
 *           exists:false = nothing has been stored yet (rules/fields are empty)
 *   POST { action: "saveConfig", baseRev, rules, fields, audit }
 *        -> { rev, savedBy, savedAt }
 *           409 when somebody saved a newer copy first (baseRev is not the stored rev)
 *           `audit` = the NEW audit lines of this save; they are kept with the config
 *           (newest first, last MAX_AUDIT lines) so every computer shows the same history.
 */

const KEY = "config/letters-config.json";
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const NOT_FOUND = /not\s*found|no\s*such|404|does not exist/i;
const MAX_RULES = 500;
const MAX_FIELDS = 200;
const MAX_AUDIT = 1000;
const MAX_BYTES = 3 * 1024 * 1024;
const YES_NO = new Set(["Any", "Yes", "No"]);

module.exports = function makeLettersConfig(h) {
  const { configBucket, putObject, getObjectBuffer, fail, text } = h;
  const clip = (v, n) => String(v == null ? "" : v).slice(0, n);

  /* ---------- cleaning: keep only the known keys, in the right types ---------- */

  function cleanRule(r) {
    if (!r || typeof r !== "object") throw fail(400, "A rule is not valid.");
    const id = text(r.id);
    if (!ID_RE.test(id)) throw fail(400, "A rule has an id that is not valid.");
    const cond = {};
    if (r.cond && typeof r.cond === "object") {
      Object.keys(r.cond).forEach((k) => {
        if (!ID_RE.test(k)) return;
        const v = text(r.cond[k]);
        if (YES_NO.has(v)) cond[k] = v;
      });
    }
    const prio = Number(r.prio);
    return {
      id,
      name: clip(text(r.name), 150),
      family: clip(text(r.family), 60),
      cycle: clip(text(r.cycle) || "Any", 60),
      org: clip(text(r.org) || "Any", 100),
      cond,
      type: clip(text(r.type), 100),
      tpl: clip(text(r.tpl), 60),
      prio: Number.isFinite(prio) ? Math.round(prio) : 9,
      active: r.active === true,
    };
  }

  function cleanField(f) {
    if (!f || typeof f !== "object") throw fail(400, "A field is not valid.");
    const id = text(f.id);
    if (!ID_RE.test(id)) throw fail(400, "A field has an id that is not valid.");
    return {
      id,
      label: clip(text(f.label), 100),
      col: clip(text(f.col), 80),
      rules: f.rules === true,
      tag: f.tag === true,
      tagName: clip(text(f.tagName), 100),
      show: f.show === true,
    };
  }

  function cleanAudit(a) {
    if (!a || typeof a !== "object") return null;
    return {
      id: clip(text(a.id), 60),
      when: clip(text(a.when), 40),
      scope: clip(text(a.scope), 30),
      ref: clip(text(a.ref), 60),
      action: clip(text(a.action), 100),
      by: clip(text(a.by), 150),
      reason: clip(text(a.reason), 500),
      detail: clip(text(a.detail), 2000),
      tpl: clip(text(a.tpl), 30),
    };
  }

  function uniqueIds(list, what) {
    const seen = new Set();
    list.forEach((x) => {
      if (seen.has(x.id)) throw fail(400, `The ${what} id "${x.id}" is used twice.`);
      seen.add(x.id);
    });
  }

  /* ---------- read ---------- */

  async function readRaw(app) {
    let buf;
    try {
      buf = await getObjectBuffer(app, configBucket(), KEY);
    } catch (e) {
      // Nothing stored yet (or the bucket is not created yet: saving then says so clearly).
      if (NOT_FOUND.test(String((e && e.message) || ""))) return null;
      throw fail(503, `The letter rules could not be read from the server. (${String((e && e.message) || e).slice(0, 200)})`);
    }
    try {
      return JSON.parse(buf.toString("utf8"));
    } catch (e) {
      throw fail(500, "The stored letter rules are not valid JSON. Nothing was changed.");
    }
  }

  async function loadConfig(app) {
    const j = await readRaw(app);
    if (!j) return { exists: false, rev: 0, rules: [], fields: [], audit: [], savedBy: "", savedAt: "" };
    return {
      exists: true,
      rev: Number(j.rev) || 0,
      rules: Array.isArray(j.rules) ? j.rules : [],
      fields: Array.isArray(j.fields) ? j.fields : [],
      audit: Array.isArray(j.audit) ? j.audit : [],
      savedBy: text(j.savedBy),
      savedAt: text(j.savedAt),
    };
  }

  /* ---------- write ---------- */

  async function saveConfig(app, actor, payload) {
    if (!Array.isArray(payload.rules) || !Array.isArray(payload.fields)) {
      throw fail(400, "The rules and fields were not sent correctly.");
    }
    if (payload.rules.length > MAX_RULES) throw fail(400, `At most ${MAX_RULES} rules can be stored.`);
    if (payload.fields.length > MAX_FIELDS) throw fail(400, `At most ${MAX_FIELDS} fields can be stored.`);

    const rules = payload.rules.map(cleanRule);
    const fields = payload.fields.map(cleanField);
    uniqueIds(rules, "rule");
    uniqueIds(fields, "field");
    const newAudit = (Array.isArray(payload.audit) ? payload.audit : []).slice(0, 20).map(cleanAudit).filter(Boolean);

    const baseRev = Number(payload.baseRev) || 0;
    const cur = await readRaw(app); // a read failure other than "not found" stops here: nothing is overwritten
    const curRev = cur ? Number(cur.rev) || 0 : 0;
    if (curRev !== baseRev) {
      throw fail(409, "Someone else saved the letter rules first. Your screen now shows their version; make your change again.");
    }

    const oldAudit = cur && Array.isArray(cur.audit) ? cur.audit : [];
    const rev = curRev + 1;
    const savedAt = new Date().toISOString();
    const body = JSON.stringify({
      v: 1,
      rev,
      rules,
      fields,
      audit: newAudit.concat(oldAudit).slice(0, MAX_AUDIT),
      savedBy: actor,
      savedAt,
    });
    if (Buffer.byteLength(body) > MAX_BYTES) throw fail(413, "The letter rules are too large to store.");
    await putObject(app, configBucket(), KEY, Buffer.from(body, "utf8"), "application/json");
    return { rev, savedBy: actor, savedAt };
  }

  return { loadConfig, saveConfig };
};