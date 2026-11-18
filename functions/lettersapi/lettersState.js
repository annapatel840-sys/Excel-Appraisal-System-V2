"use strict";

/*
 * Letters STATE on the server: the people (sheet rows), the letters, their
 * status, audit lines and the "generated" mark of one appraisal cycle.
 *
 * Why: the Letters screen used to keep all of this in the browser only, so a
 * second computer saw nothing. Now one JSON object per cycle lives in the
 * Stratus bucket of the cycle's location:
 *
 *     state/<cycleId>.json
 *
 * Reading a cycle is ONE object read; the Appraisal_Sheet table is never read
 * here (the browser sends the people it already has when HR presses Generate),
 * so nothing can time out on a big table.
 *
 *   GET  ?view=state&location=<name|All>   -> { cycles: [ { cycleId, rev, ... } ] }
 *   POST { action: "saveState", cycleId, location, baseRev, state }
 *        -> { rev }   (409 when someone else saved a newer copy first)
 */

const CYCLE_TABLE = "Appraisal_Cycle_Master";
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_STATE_BYTES = 11 * 1024 * 1024;
const ALL = new Set(["", "all", "all locations", "alllocations"]);
const key = (cycleId) => `state/${cycleId}.json`;
const flag = (v) => ["true", "1", "yes"].includes(String(v ?? "").trim().toLowerCase());

module.exports = function makeLettersState(h) {
  const { readAll, locationMap, putObject, getObjectBuffer, fail, text, rowId } = h;

  async function readState(app, bucket, cycleId) {
    let buf;
    try {
      buf = await getObjectBuffer(app, bucket, key(cycleId));
    } catch (e) {
      return { missing: true, error: e };
    }
    try {
      return { data: JSON.parse(buf.toString("utf8")) };
    } catch (e) {
      return { missing: true, error: e };
    }
  }

  async function loadState(app, location) {
    const want = text(location).toLowerCase();
    const [cycleRows, locations] = await Promise.all([readAll(app, CYCLE_TABLE), locationMap(app)]);
    const todo = [];
    cycleRows.forEach((r) => {
      if (flag(r.archived) || flag(r.hidden)) return;
      const loc = text(r.location ?? r.cycle_location ?? r.cycleLocation);
      if (ALL.has(loc.toLowerCase())) return; // state needs a location bucket
      if (!ALL.has(want) && loc.toLowerCase() !== want) return;
      const entry = locations.get(loc.toLowerCase());
      if (!entry) return;
      todo.push({ cycleId: rowId(r), loc: entry.name, bucket: entry.bucket });
    });
    const cycles = [];
    const problems = [];
    for (let i = 0; i < todo.length; i += 8) {
      const part = await Promise.all(
        todo.slice(i, i + 8).map(async (t) => {
          const got = await readState(app, t.bucket, t.cycleId);
          if (got.data) cycles.push({ ...got.data, cycleId: t.cycleId, location: t.loc });
          else if (got.error && !/not\s*found|no\s*such|404|does not exist/i.test(String(got.error.message || ""))) {
            problems.push({ cycleId: t.cycleId, message: String(got.error.message || got.error) });
          }
        }),
      );
      void part;
    }
    return { cycles, problems };
  }

  async function saveState(app, actor, payload) {
    const cycleId = text(payload.cycleId);
    if (!ID_RE.test(cycleId)) throw fail(400, "Appraisal cycle ID is not valid.");
    const entry = locationMap ? (await locationMap(app)).get(text(payload.location).toLowerCase()) : null;
    if (!entry) {
      throw fail(400, `"${text(payload.location) || "No location"}" is not an active location in Location_Master, so the letters cannot be stored.`);
    }
    const state = payload.state;
    if (!state || typeof state !== "object" || !Array.isArray(state.letters) || !Array.isArray(state.sheet)) {
      throw fail(400, "The letters data is not valid.");
    }
    const baseRev = Number(payload.baseRev) || 0;
    const cur = await readState(app, entry.bucket, cycleId);
    if (cur.data) {
      if (Number(cur.data.rev) !== baseRev) {
        throw fail(409, "Someone else saved the letters for this cycle first. Reload the Letters screen to see their changes.");
      }
    } else if (baseRev > 0 && cur.error && !/not\s*found|no\s*such|404|does not exist/i.test(String(cur.error.message || ""))) {
      throw fail(503, "The saved letters could not be read, so nothing was overwritten. Try again.");
    }
    const rev = (cur.data ? Number(cur.data.rev) || 0 : 0) + 1;
    const body = JSON.stringify({
      v: 1,
      rev,
      cycle: state.cycle || null,
      generated: !!state.generated,
      sheet: state.sheet,
      letters: state.letters,
      audit: Array.isArray(state.audit) ? state.audit : [],
      savedBy: actor,
      savedAt: new Date().toISOString(),
    });
    if (Buffer.byteLength(body) > MAX_STATE_BYTES) {
      throw fail(413, "The letters of this cycle are too large to store in one piece.");
    }
    await putObject(app, entry.bucket, key(cycleId), Buffer.from(body, "utf8"), "application/json");
    return { rev };
  }

  return { loadState, saveState };
};