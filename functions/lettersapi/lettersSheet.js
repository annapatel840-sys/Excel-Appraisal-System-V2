"use strict";

/*
 * Letters PEOPLE: the Appraisal_Sheet rows of ONE cycle (and its location).
 *
 *   GET ?view=sheet&cycleId=<ROWID>&location=<name>&page=1&limit=5000
 *     -> { cycle, location, data:[...], pagination:{ page, limit, totalCount, totalPages, returnedCount } }
 *     (page / limit work exactly as in employeesapi)
 *   GET ?view=cycles
 *     -> { cycles:[ { id, name, location, status } ] }   (Active, not archived/hidden)
 *
 * Why it cannot time out
 *   1. The CYCLE narrows the read. Cycles are created one per location, so
 *      `appraisal_cycle_id = X` is already close to "this location's people".
 *      Appraisal_Sheet keeps every cycle ever generated, so it is never read whole.
 *      The location is then still checked on every row (against Employee_Master).
 *   2. cycle_id is a LOOKUP (bigint) column, so the cycle is compared as a number
 *      first and as quoted text second: the same two forms payrollcycleapi uses in
 *      its sheet-status read. The form that works is remembered.
 *   3. Employee_Master (name, e-mail, status) is read for the cycle's location only
 *      and kept for a minute.
 *   4. Every call works inside a time budget. When it is used up the call returns
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
const DEFAULT_LIMIT = 20; // same as employeesapi
const MAX_LIMIT = 5000; // same as employeesapi
const SHEET_BUDGET_MS = 14000; // the whole request is cut off at 24 s (index.js)
const MASTER_BUDGET_MS = 10000;
const MASTER_CACHE_MS = 60 * 1000;
const ID_RE = /^\d{1,30}$/;
const CYCLE_COLUMNS = ["cycle_id", "appraisal_cycle_id"]; // cycle_id first, as in payrollcycleapi / employeesapi
const LOCATION_COLUMNS = ["location", "work_location"];

const isAll = (v) => ["", "all", "all locations", "alllocations"].includes(String(v ?? "").trim().toLowerCase());
const q = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/'/g, "''");
const flag = (v) => v === true || ["true", "1", "yes", "archived"].includes(String(v ?? "").trim().toLowerCase());

module.exports = function makeLettersSheet(h) {
  const { fail, text } = h;
  // Every Data Store call goes through the gate (limited at once, retried on a
  // 429, time-limited). Tests may omit it.
  const guarded = h.guarded || ((fn) => fn());
  const masterCache = new Map(); // location key -> { at, map }
  let knownWhere = null; // { col, quoted } that worked for Appraisal_Sheet

  const positiveInteger = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
  };
  const rowId = (r) => String((r && (r.ROWID ?? r.rowid)) ?? "");
  const pick = (r, ...names) => {
    for (const n of names) {
      const v = r[n];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  };
  // A lookup column can come back as a ROWID or as an object.
  const lookupText = (v) => {
    if (v == null) return "";
    if (typeof v === "object") return lookupText(v.ROWID ?? v.rowid ?? v.emp_id ?? v.id ?? v.value ?? v.name ?? "");
    return String(v).trim();
  };
  const num = (v) => {
    const n = Number(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const unwrap = (item, table) => (item && (item[table] || Object.values(item)[0])) || {};

  async function run(app, sql, label = "Reading the Appraisal Sheet") {
    return guarded(() => app.zcql().executeZCQLQuery(sql), label);
  }

  async function page(app, table, where, last, select = "*") {
    const sql =
      `SELECT ${select} FROM ${table} WHERE ROWID > ${last}` + (where ? ` AND ${where}` : "") + ` ORDER BY ROWID ASC LIMIT ${PAGE}`;
    return ((await run(app, sql, `Reading ${table} (from row ${last})`)) || []).map((i) => unwrap(i, table));
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
    const result = await run(app, `SELECT * FROM ${CYCLE_TABLE} WHERE ROWID = ${cycleId} LIMIT 1`, "Reading the appraisal cycle");
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

    // Indexed by the employee ID and by the Catalyst ROWID, like employeesapi's
    // buildEmployeeMasterMap: Appraisal_Sheet.emp_id may hold either.
    const map = new Map();
    rows.forEach((r) => {
      const id = text(r.emp_id).toLowerCase();
      const rid = rowId(r).toLowerCase();
      if (id) map.set(id, r);
      if (rid) map.set(rid, r);
    });
    masterCache.set(key, { at: Date.now(), map });
    return map;
  }

  const masterLocation = (m) => text(pick(m, "location", "work_location", "location_name"));

  /* ---------- one chunk of sheet rows ---------- */
  // WHERE for one cycle on Appraisal_Sheet. cycle_id is a lookup (bigint) column on
  // this project, so the number form goes first and the quoted form second.
  function cycleWheres(cycleId) {
    const cols = knownWhere ? [knownWhere.col] : CYCLE_COLUMNS;
    const out = [];
    cols.forEach((col) => {
      const forms = knownWhere ? [knownWhere.quoted] : [false, true];
      forms.forEach((quoted) => out.push({ col, quoted, sql: `${col} = ${quoted ? `'${q(cycleId)}'` : cycleId}` }));
    });
    return out;
  }

  /* Same contract as employeesapi: page + limit in, { data, pagination } out. */
  async function loadSheet(app, params) {
    const cycleId = text(params.cycleId);
    if (!ID_RE.test(cycleId)) throw fail(400, "Appraisal cycle ID is not valid.");
    const requestedPage = positiveInteger(params.page, 1);
    const limit = Math.min(positiveInteger(params.limit, DEFAULT_LIMIT), MAX_LIMIT);

    const started = Date.now();
    const cycle = await readCycle(app, cycleId);
    const location = text(params.location) || cycle.location;
    const wantAll = isAll(location);
    const master = await masterFor(app, location, started + MASTER_BUDGET_MS);

    // This cycle's rows only (never the whole table), 300 at a time by ROWID.
    const rows = [];
    let last = "0";
    let where = null;
    let page1 = null;
    let lastError = null;
    let answered = false; // some form of the query ran (even with no rows)
    for (const w of cycleWheres(cycleId)) {
      try {
        const p = await page(app, SHEET_TABLE, w.sql, "0");
        answered = true;
        if (!p.length && !knownWhere) continue; // this column or form matched nothing: try the next
        where = w;
        page1 = p;
        break;
      } catch (e) {
        if (e && (e.status || e.timeout)) throw fail(e.status || 504, `The Appraisal Sheet read stopped: ${e.message}`);
        lastError = e; // this column does not exist, or it is the other type: try the next
      }
    }
    if (!where && !answered && lastError) throw fail(500, `The Appraisal Sheet could not be read: ${(lastError && lastError.message) || lastError}`);
    if (where) {
      knownWhere = { col: where.col, quoted: where.quoted };
      let p = page1;
      for (let guard = 0; guard < 200; guard += 1) {
        p.forEach((r) => {
          const empRef = lookupText(r.emp_id);
          const m = master.get(empRef.toLowerCase());
          if (!wantAll) {
            // The person's own location decides (Employee_Master first, then the sheet row).
            const loc = (m ? masterLocation(m) : "") || text(pick(r, "location", "work_location"));
            if (loc.toLowerCase() !== location.toLowerCase()) return;
          }
          rows.push(shape(r, m));
        });
        if (p.length < PAGE) break;
        last = rowId(p[p.length - 1]);
        if (!last) break;
        if (Date.now() - started > SHEET_BUDGET_MS) {
          throw fail(504, "The Appraisal Sheet took too long to read. Please try again.");
        }
        p = await page(app, SHEET_TABLE, where.sql, last);
      }
    }

    // Pagination, as in employeesapi.
    const totalCount = rows.length;
    const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / limit);
    const safePage = Math.min(requestedPage, totalPages);
    const offset = (safePage - 1) * limit;
    const data = rows.slice(offset, offset + limit);
    return {
      cycle: { id: cycle.id, name: cycle.name, location: cycle.location },
      location: wantAll ? "All" : location,
      data,
      pagination: { page: safePage, limit, totalCount, totalPages, returnedCount: data.length },
    };
  }

  /* Appraisal_Sheet row + Employee_Master row -> the field names of the Appraisal Sheet screen. */
  function shape(r, m) {
    const mm = m || {};
    const empId = text(mm.emp_id) || lookupText(r.emp_id);
    return {
      id: empId,
      empId,
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
