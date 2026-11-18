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
 *   GET  ?view=state&cycles=[{"id":"<cycleId>","location":"<name>"}]  -> { cycles: [ { cycleId, rev, ... } ] }
 *   POST { action: "saveState", cycleId, location, baseRev, state }
 *        -> { rev }   (409 when someone else saved a newer copy first)
 */

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_STATE_BYTES = 11 * 1024 * 1024;
const MAX_CYCLES = 40;
const NOT_FOUND = /not\s*found|no\s*such|404|does not exist/i;
const key = (cycleId) => `state/${cycleId}.json`;

module.exports = function makeLettersState(h) {
  const { locationMap, putObject, getObjectBuffer, fail, text } = h;

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

  // cycles = [{ id, location }]: exactly the cycles the screen needs. Nothing
  // is scanned: Location_Master (a handful of rows) gives the bucket, then one
  // object read per cycle. Appraisal_Sheet and Appraisal_Cycle_Master are not read.
  async function loadState(app, cycles) {
    const asked = (Array.isArray(cycles) ? cycles : []).slice(0, MAX_CYCLES);
    if (!asked.length) return { cycles: [], problems: [] };
    const locations = await locationMap(app);
    const todo = [];
    asked.forEach((c) => {
      const id = text(c && c.id);
      const entry = locations.get(text(c && c.location).toLowerCase());
      if (ID_RE.test(id) && entry) todo.push({ cycleId: id, loc: entry.name, bucket: entry.bucket });
    });
    const out = [];
    const problems = [];
    for (let i = 0; i < todo.length; i += 6) {
      await Promise.all(
        todo.slice(i, i + 6).map(async (t) => {
          const got = await readState(app, t.bucket, t.cycleId);
          if (got.data) out.push({ ...got.data, cycleId: t.cycleId, location: t.loc });
          else if (got.error && !NOT_FOUND.test(String(got.error.message || ""))) {
            problems.push({ cycleId: t.cycleId, message: String(got.error.message || got.error) });
          }
        }),
      );
    }
    return { cycles: out, problems };
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
