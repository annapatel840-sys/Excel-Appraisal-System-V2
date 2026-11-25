"use strict";

/*
 * Letter RULES and Letter FIELDS on the server.
 *
 * Rules decide which letter an employee gets; fields are the Appraisal Sheet
 * columns the rules (and the {{tags}} of a letter) can use.
 *
 *   RULES are kept PER LOCATION, in that location's own bucket (the same bucket that holds its
 *   templates, so no extra bucket is needed):
 *        <LETTERS_BUCKET_PREFIX>-<location code>/config/letters-rules.json
 *   A rule can only use a template of its own location, and a location with no rules file has no
 *   rules. (Before this, one shared list served every location, so a rule made for one location
 *   kept pointing at that location's template when another location was opened.)
 *
 *   FIELDS are the same for every location, so they stay in one shared file:
 *        <LETTERS_BUCKET_PREFIX>-config/config/letters-config.json
 *   (override the bucket name with LETTERS_CONFIG_BUCKET). That file still holds the OLD shared rules;
 *   they are never changed any more and are only used once, to start a location that has no rules
 *   file yet: the old rules whose template is stored in that location's bucket are shown for it
 *   until its first save.
 *
 *   GET  ?view=config[&location=India]
 *        -> { exists, rev, fieldsExists, fieldsRev, rules, fields, audit, location }
 *           rules carry `location`. With a location: that location's rules, rev = their revision.
 *           Without (All locations): every location's rules, read-only (rev 0).
 *   POST { action: "saveRules",  location, baseRev, rules, audit }   -> { rev, savedBy, savedAt }
 *   POST { action: "saveFields", baseRev, fields, audit }            -> { rev, savedBy, savedAt }
 *           409 when somebody saved a newer copy first (baseRev is not the stored rev).
 *           `audit` = the NEW audit lines of this save; they are kept with the file
 *           (newest first, last MAX_AUDIT lines) so every computer shows the same history.
 */

const KEY = "config/letters-config.json"; // shared: fields (+ the old shared rules)
const RULES_KEY = "config/letters-rules.json"; // inside each location's bucket
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const NOT_FOUND = /not\s*found|no\s*such|404|does not exist/i;
const MAX_RULES = 500;
const MAX_FIELDS = 200;
const MAX_AUDIT = 1000;
const MAX_BYTES = 3 * 1024 * 1024;
const YES_NO = new Set(["Any", "Yes", "No"]);

module.exports = function makeLettersConfig(h) {
  const { configBucket, putObject, getObjectBuffer, fail, text, findLocation, locationList, readIndex } = h;
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
      location: clip(text(r.location), 100),
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

  // One JSON object from a bucket: null when it is not there (yet).
  async function readJson(app, bucket, key, what) {
    let buf;
    try {
      buf = await getObjectBuffer(app, bucket, key);
    } catch (e) {
      // Nothing stored yet (or the bucket is not created yet: saving then says so clearly).
      if (NOT_FOUND.test(String((e && e.message) || ""))) return null;
      throw fail(503, `The letter ${what} could not be read from the server. (${String((e && e.message) || e).slice(0, 200)})`);
    }
    try {
      return JSON.parse(buf.toString("utf8"));
    } catch (e) {
      throw fail(500, `The stored letter ${what} are not valid JSON. Nothing was changed.`);
    }
  }
  const readShared = (app) => readJson(app, configBucket(), KEY, "fields");
  const readRulesFile = (app, loc) => readJson(app, loc.bucket, RULES_KEY, `rules of ${loc.name}`);

  const stamp = (rules, loc) => (Array.isArray(rules) ? rules : []).map((r) => ({ ...r, location: loc.name }));

  // The rules of ONE location: its own file, or - until its first save - the old shared rules
  // whose template is stored in this location's bucket.
  async function rulesOf(app, loc, shared) {
    const raw = await readRulesFile(app, loc);
    if (raw) return { exists: true, rev: Number(raw.rev) || 0, rules: stamp(raw.rules, loc), audit: Array.isArray(raw.audit) ? raw.audit : [], savedBy: text(raw.savedBy), savedAt: text(raw.savedAt) };
    const old = shared && Array.isArray(shared.rules) ? shared.rules : [];
    let rules = [];
    if (old.length) {
      const have = new Set((await readIndex(app, loc.bucket)).templates.map((t) => text(t.tpl_id)));
      rules = stamp(old.filter((r) => r && have.has(text(r.tpl))), loc);
    }
    return { exists: false, rev: 0, rules, audit: [], savedBy: "", savedAt: "" };
  }

  async function loadConfig(app, location) {
    const shared = await readShared(app);
    const want = text(location);
    const all = !want || /^all( locations)?$/i.test(want);
    const fields = shared && Array.isArray(shared.fields) ? shared.fields : [];
    const sharedAudit = shared && Array.isArray(shared.audit) ? shared.audit : [];
    const out = {
      fieldsExists: !!shared,
      fieldsRev: shared ? Number(shared.rev) || 0 : 0,
      fields,
      location: "",
      exists: false,
      rev: 0,
      rules: [],
      audit: sharedAudit,
      savedBy: shared ? text(shared.savedBy) : "",
      savedAt: shared ? text(shared.savedAt) : "",
    };
    if (all) {
      // Every location's rules, to look at only (they are edited one location at a time).
      const parts = [];
      const locs = await locationList(app);
      for (let i = 0; i < locs.length; i += 2) {
        parts.push(...(await Promise.all(locs.slice(i, i + 2).map((loc) => rulesOf(app, loc, shared)))));
      }
      out.rules = parts.flatMap((p) => p.rules);
      out.exists = parts.some((p) => p.exists);
      out.audit = parts.flatMap((p) => p.audit).concat(sharedAudit).slice(0, MAX_AUDIT);
      return out;
    }
    const loc = await findLocation(app, want);
    if (!loc) throw fail(400, `"${want}" is not an active location in Location Master.`);
    const mine = await rulesOf(app, loc, shared);
    return { ...out, location: loc.name, exists: mine.exists, rev: mine.rev, rules: mine.rules, audit: mine.audit.concat(sharedAudit).slice(0, MAX_AUDIT), savedBy: mine.savedBy || out.savedBy, savedAt: mine.savedAt || out.savedAt };
  }

  /* ---------- write ---------- */

  const cleanNewAudit = (list) => (Array.isArray(list) ? list : []).slice(0, 20).map(cleanAudit).filter(Boolean);

  // Rules of ONE location, stored in that location's own bucket.
  async function saveRules(app, actor, payload) {
    if (!Array.isArray(payload.rules)) throw fail(400, "The rules were not sent correctly.");
    if (payload.rules.length > MAX_RULES) throw fail(400, `At most ${MAX_RULES} rules can be stored.`);
    const want = text(payload.location);
    const loc = want && !/^all( locations)?$/i.test(want) ? await findLocation(app, want) : null;
    if (!loc) throw fail(400, want ? `"${want}" is not an active location in Location Master.` : "Choose a location: the rules are kept for one location at a time.");

    const rules = payload.rules.map(cleanRule).map((r) => ({ ...r, location: loc.name }));
    uniqueIds(rules, "rule");
    // A rule may only use a template stored for THIS location.
    const named = rules.filter((r) => r.tpl);
    if (named.length) {
      const have = new Set((await readIndex(app, loc.bucket)).templates.map((t) => text(t.tpl_id)));
      const wrong = named.find((r) => !have.has(r.tpl));
      if (wrong) throw fail(400, `The rule "${wrong.name || wrong.id}" uses a template that is not stored for ${loc.name}. Import the template for ${loc.name} in Letters > Templates, then choose it.`);
    }
    const newAudit = cleanNewAudit(payload.audit);

    const cur = await readRulesFile(app, loc); // a read failure other than "not found" stops here: nothing is overwritten
    const curRev = cur ? Number(cur.rev) || 0 : 0;
    if (curRev !== (Number(payload.baseRev) || 0)) {
      throw fail(409, `Someone else saved the letter rules of ${loc.name} first. Your screen now shows their version; make your change again.`);
    }
    const oldAudit = cur && Array.isArray(cur.audit) ? cur.audit : [];
    const rev = curRev + 1;
    const savedAt = new Date().toISOString();
    const body = JSON.stringify({ v: 2, location: loc.name, rev, rules, audit: newAudit.concat(oldAudit).slice(0, MAX_AUDIT), savedBy: actor, savedAt });
    if (Buffer.byteLength(body) > MAX_BYTES) throw fail(413, "The letter rules are too large to store.");
    await putObject(app, loc.bucket, RULES_KEY, Buffer.from(body, "utf8"), "application/json");
    return { rev, location: loc.name, savedBy: actor, savedAt };
  }

  // Fields are the same for every location: one shared file. The old shared rules in it are kept as they are.
  async function saveFields(app, actor, payload) {
    if (!Array.isArray(payload.fields)) throw fail(400, "The fields were not sent correctly.");
    if (payload.fields.length > MAX_FIELDS) throw fail(400, `At most ${MAX_FIELDS} fields can be stored.`);
    const fields = payload.fields.map(cleanField);
    uniqueIds(fields, "field");
    const newAudit = cleanNewAudit(payload.audit);

    const cur = await readShared(app);
    const curRev = cur ? Number(cur.rev) || 0 : 0;
    if (curRev !== (Number(payload.baseRev) || 0)) {
      throw fail(409, "Someone else saved the letter fields first. Your screen now shows their version; make your change again.");
    }
    const oldAudit = cur && Array.isArray(cur.audit) ? cur.audit : [];
    const rev = curRev + 1;
    const savedAt = new Date().toISOString();
    const body = JSON.stringify({
      v: 1,
      rev,
      rules: cur && Array.isArray(cur.rules) ? cur.rules : [], // old shared rules, kept only to start locations that have no rules file yet
      fields,
      audit: newAudit.concat(oldAudit).slice(0, MAX_AUDIT),
      savedBy: actor,
      savedAt,
    });
    if (Buffer.byteLength(body) > MAX_BYTES) throw fail(413, "The letter fields are too large to store.");
    await putObject(app, configBucket(), KEY, Buffer.from(body, "utf8"), "application/json");
    return { rev, savedBy: actor, savedAt };
  }

  return { loadConfig, saveRules, saveFields };
};