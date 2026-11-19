"use strict";

/*
 * Letters PEOPLE: the Appraisal_Sheet rows of ONE cycle (and its location).
 *
 *   GET ?view=sheet&cycleId=<ROWID>&location=<name>[&after=<ROWID>]
 *     -> { cycle, location, rows:[...], next, done, cached }
 *   GET ?view=cycles
 *     -> { cycles:[ { id, name, location, status } ] }   (Active, not archived/hidden)
 *
 * Why it cannot time out
 *   1. The CYCLE narrows the read. Cycles are created one per location, so
 *      `appraisal_cycle_id = X` is already close to "this location's people".
 *      Appraisal_Sheet keeps every cycle ever generated, so it is never read whole.
 *      The location is then still checked on every row (against Employee_Master).
 *   2. Only the columns the letters use are selected (SHEET_COLUMNS). If the table
 *      does not have one of them, the read falls back to SELECT * once and
 *      remembers it.
 *   3. Employee_Master (name, e-mail, status) is read for the cycle's location only
 *      and kept for a minute.
 *   4. Unchanged-table cache: two cheap queries (row count + latest MODIFIEDTIME
 *      of this cycle's rows) tell whether anything changed since the last full
 *      read; if not, the saved rows are returned without reading the table.
 *   5. Every call works inside a time budget. When it is used up the call returns
 *      what it has with done:false and `next`; the browser asks again from
 *      `next`. One call never gets near Catalyst's ~30 s limit.
 *
 * Rows come back in the field names the Appraisal Sheet screen uses (empId,
 * newPBToBeOffered, hikeAmount ...), so letters-store.sheetRowsForLetters turns
 * them into letter people.
 */

const SHEET_TABLE = "Appraisal_Sheet";
const MASTER_TABLE = "Employee_Master";
const CYCLE_TABLE = "Appraisal_Cycle_Master";
const PAGE = 300; // ZCQL maximum rows per query
const SHEET_BUDGET_MS = 14000; // the whole request is cut off at 24 s (index.js)
const MASTER_BUDGET_MS = 10000;
const MASTER_CACHE_MS = 60 * 1000;
const SHEET_CACHE_MS = 2 * 60 * 1000;
const SHEET_CACHE_MAX = 20; // cycles kept per instance
const ID_RE = /^\d{1,30}$/;
const CYCLE_COLUMNS = ["appraisal_cycle_id", "cycle_id"];
const LOCATION_COLUMNS = ["location", "work_location"];
// Appraisal_Sheet columns the letters use. Change a name here if your table differs.
const SHEET_COLUMNS = [
  "emp_id",
  "current_annual_base_pay",
  "hike_amount",
  "hike_pct",
  "new_pb_to_be_offered",
  "new_pb_installment",
  "new_rb",
  "month_rb",
  "target_pb_next_year",
  "eligible_for_promotion",
  "new_title",
  "manager_rating",
  "comp_manager_rewards",
];

const isAll = (v) => ["", "all", "all locations", "alllocations"].includes(String(v ?? "").trim().toLowerCase());
const q = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/'/g, "''");
const flag = (v) => v === true || ["true", "1", "yes", "archived"].includes(String(v ?? "").trim().toLowerCase());

module.exports = function makeLettersSheet(h) {
  const { fail, text } = h;
  // Every Data Store call goes through the gate (limited at once, retried on a
  // 429, time-limited). Tests may omit it.
  const guarded = h.guarded || ((fn) => fn());
  const masterCache = new Map(); // location key -> { at, map }
  const sheetCache = new Map(); // cycleId|location -> { at, fingerprint, result }
  let knownCycleColumn = null; // the Appraisal_Sheet column that holds the cycle, once found
  let narrowOk = true; // false once SELECT <columns> was refused: use SELECT *

  const rowId = (r) => String((r && (r.ROWID ?? r.rowid)) ?? "");
  const pick = (r, ...names) => {
    for (const n of names) {
      const v = r[n];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  };
  const num = (v) => {
    const n = Number(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const unwrap = (item, table) => (item && (item[table] || Object.values(item)[0])) || {};

  async function run(app, sql) {
    return guarded(() => app.zcql().executeZCQLQuery(sql), "Reading the Appraisal Sheet");
  }

  async function page(app, table, where, last, select = "*") {
    const sql =
      `SELECT ${select} FROM ${table} WHERE ROWID > ${last}` + (where ? ` AND ${where}` : "") + ` ORDER BY ROWID ASC LIMIT ${PAGE}`;
    return ((await run(app, sql)) || []).map((i) => unwrap(i, table));
  }

  /* ---------- cycles (a handful of rows) ---------- */
  const shapeCycle = (row) => ({
    id: rowId(row),
    name: text(pick(row, "cycle_name", "name")),
    location: text(pick(row, "location", "cycle_location", "cycleLocation")),
    status: text(pick(row, "status", "cycle_status")),
    archived: flag(row.archived),
    hidden: flag(row.hidden),
  });

  async function readCycle(app, cycleId) {
    const result = await run(app, `SELECT * FROM ${CYCLE_TABLE} WHERE ROWID = ${cycleId} LIMIT 1`);
    if (!result || !result[0]) throw fail(404, "Appraisal cycle not found.");
    return shapeCycle(unwrap(result[0], CYCLE_TABLE));
  }

  // Active cycles that are not archived or hidden: what the Letters screen works on.
  async function loadCycles(app) {
    const rows = [];
    let last = "0";
    for (let guard = 0; guard < 20; guard += 1) {
      const p = await page(app, CYCLE_TABLE, "", last);
      rows.push(...p);
      if (p.length < PAGE) break;
      last = rowId(p[p.length - 1]);
      if (!last) break;
    }
    const cycles = rows
      .map(shapeCycle)
      .filter((c) => c.status.toLowerCase() === "active" && !c.archived && !c.hidden)
      .map(({ id, name, location, status }) => ({ id, name, location, status }));
    return { cycles };
  }

  /* ---------- Employee_Master of the location, by employee id ---------- */
  async function masterFor(app, location, deadline) {
    const key = isAll(location) ? "*" : location.toLowerCase();
    const hit = masterCache.get(key);
    if (hit && Date.now() - hit.at < MASTER_CACHE_MS) return hit.map;

    const readWith = async (where) => {
      const rows = [];
      let last = "0";
      for (let guard = 0; guard < 200; guard += 1) {
        if (Date.now() > deadline) throw fail(503, "Employee Master took too long to read. Try again.");
        const p = await page(app, MASTER_TABLE, where, last);
        rows.push(...p);
        if (p.length < PAGE) break;
        last = rowId(p[p.length - 1]);
        if (!last) break;
      }
      return rows;
    };

    let rows = null;
    if (key !== "*") {
      for (const col of LOCATION_COLUMNS) {
        try {
          rows = await readWith(`${col} = '${q(location)}'`);
          break;
        } catch (e) {
          if (e && e.status) throw e; // our own timeout error
          // that column does not exist on this table: try the next name
        }
      }
    }
    if (rows === null) rows = await readWith(""); // All Locations, or no location column

    const map = new Map();
    rows.forEach((r) => {
      const id = text(r.emp_id).toLowerCase();
      if (id) map.set(id, r);
    });
    masterCache.set(key, { at: Date.now(), map });
    return map;
  }

  const masterLocation = (m) => text(pick(m, "location", "work_location", "location_name"));

  /* ---------- unchanged-table check for one cycle ---------- */
  async function fingerprint(app, col, cycleId) {
    try {
      const where = `${col} = '${q(cycleId)}'`;
      // One after the other: this project's Catalyst limit is hit by parallel queries.
      const count = await run(app, `SELECT COUNT(ROWID) FROM ${SHEET_TABLE} WHERE ${where}`);
      const latest = await run(app, `SELECT ROWID, MODIFIEDTIME FROM ${SHEET_TABLE} WHERE ${where} ORDER BY MODIFIEDTIME DESC LIMIT 1`);
      return JSON.stringify([count, latest]);
    } catch (e) {
      return null; // no cache this time: read normally
    }
  }

  /* ---------- one chunk of sheet rows ---------- */
  async function loadSheet(app, params) {
    const cycleId = text(params.cycleId);
    if (!ID_RE.test(cycleId)) throw fail(400, "Appraisal cycle ID is not valid.");
    const after = text(params.after) || "0";
    if (!ID_RE.test(after)) throw fail(400, "The paging position is not valid.");

    const started = Date.now();
    const cycle = await readCycle(app, cycleId);
    const location = text(params.location) || cycle.location;
    const wantAll = isAll(location);
    const cacheKey = `${cycleId}|${location.toLowerCase()}`;

    const columns = knownCycleColumn ? [knownCycleColumn] : CYCLE_COLUMNS;
    let lastError = null;

    for (const col of columns) {
      try {
        const where = `${col} = '${q(cycleId)}'`;

        // Unchanged since the last full read? Return it without reading the table.
        const print = after === "0" ? await fingerprint(app, col, cycleId) : null;
        const hit = sheetCache.get(cacheKey);
        if (print && hit && hit.fingerprint === print && Date.now() - hit.at < SHEET_CACHE_MS) {
          return { ...hit.result, cached: true };
        }

        const master = await masterFor(app, location, started + MASTER_BUDGET_MS);
        const select = narrowOk ? `ROWID, ${SHEET_COLUMNS.join(", ")}` : "*";
        const rows = [];
        let last = after;
        let done = false;
        let p;
        try {
          p = await page(app, SHEET_TABLE, where, last, select);
        } catch (e) {
          if (!narrowOk) throw e;
          narrowOk = false; // a listed column does not exist: read every column from now on
          p = await page(app, SHEET_TABLE, where, last, "*");
        }
        knownCycleColumn = col;

        for (let guard = 0; guard < 100; guard += 1) {
          p.forEach((r) => {
            const id = text(r.emp_id);
            const m = master.get(id.toLowerCase());
            if (!wantAll) {
              // The person's own location decides (Employee_Master first, then the sheet row).
              const loc = (m ? masterLocation(m) : "") || text(pick(r, "location", "work_location"));
              if (loc.toLowerCase() !== location.toLowerCase()) return;
            }
            rows.push(shape(r, m));
          });
          if (p.length < PAGE) {
            done = true;
            break;
          }
          last = rowId(p[p.length - 1]);
          if (!last) {
            done = true;
            break;
          }
          if (Date.now() - started > SHEET_BUDGET_MS) break; // the browser asks again from `last`
          p = await page(app, SHEET_TABLE, where, last, select);
        }

        const result = {
          cycle: { id: cycle.id, name: cycle.name, location: cycle.location },
          location: wantAll ? "All" : location,
          rows,
          next: done ? null : last,
          done,
          cached: false,
        };
        // Remember a read that finished in this one call (so it is the whole cycle).
        if (done && after === "0" && print) {
          if (sheetCache.size >= SHEET_CACHE_MAX) sheetCache.delete(sheetCache.keys().next().value);
          sheetCache.set(cacheKey, { at: Date.now(), fingerprint: print, result });
        }
        return result;
      } catch (e) {
        if (e && e.status) throw e;
        lastError = e;
      }
    }
    throw fail(500, `The Appraisal Sheet could not be read: ${(lastError && lastError.message) || lastError}`);
  }

  /* Appraisal_Sheet row + Employee_Master row -> the field names of the Appraisal Sheet screen. */
  function shape(r, m) {
    const mm = m || {};
    return {
      id: text(r.emp_id),
      empId: text(r.emp_id),
      name: text(pick(mm, "emp_name", "name") || pick(r, "name", "emp_name")),
      email: text(pick(mm, "email_id", "email") || pick(r, "email_id", "email")),
      status: text(pick(mm, "emp_status", "status") || "Active"),
      location: masterLocation(mm) || text(pick(r, "location", "work_location")),
      department: text(pick(mm, "department") || pick(r, "department")),
      designation: text(pick(mm, "designation", "title") || pick(r, "designation", "title")),
      reportingManager: text(pick(mm, "repo_manager", "reporting_manager", "manager") || pick(r, "reporting_manager", "manager")),
      doj: text(pick(mm, "date_of_join", "joining_date", "Joining_date", "doj") || pick(r, "date_of_join", "joining_date")),
      currentAnnualBasePay: num(r.current_annual_base_pay),
      hikeAmount: num(r.hike_amount),
      hikePct: num(r.hike_pct),
      newPBToBeOffered: num(r.new_pb_to_be_offered),
      newPBInstallment: text(r.new_pb_installment),
      newRB: num(r.new_rb),
      monthRB: text(r.month_rb),
      targetPBNextYear: num(r.target_pb_next_year),
      eligibleForPromotion: text(r.eligible_for_promotion),
      newTitle: text(r.new_title),
      managerRating: pick(r, "manager_rating") === "" ? "" : String(r.manager_rating),
      compManagerRemarks: text(pick(r, "comp_manager_rewards", "comp_manager_remarks")),
    };
  }

  return { loadSheet, loadCycles, _internal: { shape } };
};
