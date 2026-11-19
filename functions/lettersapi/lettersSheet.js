"use strict";

/*
 * Letters PEOPLE: the Appraisal_Sheet rows of ONE cycle (and its location).
 *
 *   GET ?view=sheet&cycleId=<ROWID>&location=<n>&page=1&limit=5000
 *     -> { cycle, location, data:[...], pagination:{ page, limit, totalCount, totalPages, returnedCount } }
 *     or { pending:true, progress:{...} } while the tables are still being read
 *        (the browser asks again after a moment; nothing is read twice)
 *   GET ?view=cycles
 *     -> { cycles:[ { id, name, location, status } ] }   (Active, not archived/hidden)
 *
 * How the big table is read (the same way employeesapi reads it, which is known to work)
 *   1. Appraisal_Sheet and Employee_Master are read WHOLE with the Data Store's
 *      paged read (getPagedRows, 200 rows per page, next-page token). No WHERE on
 *      an unindexed column, no per-cycle guessing: that was a full table scan per
 *      query, repeated for every probe and every 300 rows.
 *   2. The rows are filtered by cycle and location IN MEMORY (instant), and only the
 *      columns letters need are kept, so even a very large table stays small.
 *   3. Each table is remembered for 5 minutes. Before reusing it, two cheap queries
 *      (row count + latest MODIFIEDTIME) prove it is unchanged, exactly like
 *      employeesapi's cachedTableRead; a changed table is read again.
 *   4. The read RESUMES. A call works inside a time budget; when it is used up the
 *      pages already read are kept (with the next-page token) and the call answers
 *      { pending:true }. The next call continues from that page instead of starting
 *      again, so a big table finishes after a few short calls instead of one call
 *      that Catalyst kills at ~30 s.
 *   5. When the browser has gone away (cancelled / closed) the read stops at the
 *      next page, so abandoned requests no longer hold the Data Store slots.
 *
 * Rows come back in the field names the Appraisal Sheet screen uses (empId,
 * newPBToBeOffered, hikeAmount ...), so letters-store.sheetRowsForLetters turns
 * them into letter people.
 */

const SHEET_TABLE = "Appraisal_Sheet";
const MASTER_TABLE = "Employee_Master";
const CYCLE_TABLE = "Appraisal_Cycle_Master";
const PAGE = 300; // ZCQL maximum rows per query (cycles only: a handful of rows)
const PAGE_ROWS = 200; // Data Store paged read, same as employeesapi (DATASTORE_PAGE_SIZE)
const PAGE_TIMEOUT_MS = 12000; // one page of a table
const REQUEST_BUDGET_MS = 17000; // the whole request is cut off at 24 s (index.js)
const FRESH_MS = 20 * 1000; // a table read this recently is reused without any check
const TABLE_CACHE_MS = 5 * 60 * 1000; // an unchanged table is reused this long (like employeesapi)
const DEFAULT_LIMIT = 20; // same as employeesapi
const MAX_LIMIT = 5000; // same as employeesapi
const ID_RE = /^\d{1,30}$/;

// Only these columns are kept in memory (what letters and shape() need).
const SHEET_KEYS = [
  "current_annual_base_pay", "hike_amount", "hike_pct", "new_pb_to_be_offered", "new_pb_installment",
  "new_rb", "month_rb", "target_pb_next_year", "eligible_for_promotion", "new_title", "manager_rating",
  "comp_manager_rewards", "comp_manager_remarks", "name", "emp_name", "email_id", "email", "department",
  "designation", "title", "reporting_manager", "manager", "location", "work_location", "date_of_join", "joining_date",
];
const MASTER_KEYS = [
  "emp_name", "name", "email_id", "email", "emp_status", "status", "location", "work_location", "location_name",
  "department", "designation", "title", "repo_manager", "reporting_manager", "manager",
  "date_of_join", "joining_date", "Joining_date", "doj",
];

const isAll = (v) => ["", "all", "all locations", "alllocations"].includes(String(v ?? "").trim().toLowerCase());
const flag = (v) => v === true || ["true", "1", "yes", "archived"].includes(String(v ?? "").trim().toLowerCase());

module.exports = function makeLettersSheet(h) {
  const { fail, text } = h;
  // Every Data Store call goes through the gate (limited at once, retried on a
  // 429, time-limited). Tests may omit it.
  const guarded = h.guarded || ((fn) => fn());
  const tables = new Map(); // table name -> { fp, rows, token, done, at, chain }

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

  /* ---------- whole-table paged read, remembered, resumable ---------- */
  const projectSheet = (r) => {
    const o = { ROWID: rowId(r), cyc: lookupText(r.cycle_id ?? r.appraisal_cycle_id), emp_id: lookupText(r.emp_id) };
    SHEET_KEYS.forEach((k) => {
      if (r[k] !== undefined && r[k] !== null) o[k] = r[k];
    });
    return o;
  };
  const projectMaster = (r) => {
    const o = { ROWID: rowId(r), emp_id: lookupText(r.emp_id) };
    MASTER_KEYS.forEach((k) => {
      if (r[k] !== undefined && r[k] !== null) o[k] = r[k];
    });
    return o;
  };

  // Row count + latest change: tells whether the table is unchanged (employeesapi: tableFingerprint).
  async function fingerprint(app, name) {
    try {
      const count = await run(app, `SELECT COUNT(ROWID) FROM ${name}`, `Counting ${name}`);
      const latest = await run(app, `SELECT ROWID, MODIFIEDTIME FROM ${name} ORDER BY MODIFIEDTIME DESC LIMIT 1`, `Checking ${name}`);
      return JSON.stringify([count, latest]);
    } catch (e) {
      return null; // cannot tell: the table is simply read again
    }
  }

  const pendingError = (name, e) => Object.assign(new Error(`${name} is still being read.`), { pending: true, table: name, rowsRead: e.rows.length });

  async function readTable(app, name, project, ctx) {
    let e = tables.get(name);
    if (!e) {
      e = { fp: null, rows: [], token: null, done: false, at: 0, chain: Promise.resolve() };
      tables.set(name, e);
    }
    // One request at a time per table, so two requests never resume the same read together.
    const turn = e.chain.then(() => work(app, name, project, ctx, e));
    e.chain = turn.catch(() => {});
    return turn;
  }

  async function work(app, name, project, ctx, e) {
    if (e.done && Date.now() - e.at < FRESH_MS) return e.rows;
    if (ctx.isCancelled()) throw pendingError(name, e);
    const fp = await fingerprint(app, name);
    if (e.done && fp && fp === e.fp && Date.now() - e.at < TABLE_CACHE_MS) {
      e.at = Date.now();
      return e.rows;
    }
    // Resume a half-read table only when it provably has not changed since; otherwise start again.
    if (e.done || !fp || fp !== e.fp) {
      e.rows = [];
      e.token = null;
      e.done = false;
    }
    e.fp = fp;
    const table = app.datastore().table(name);
    while (!e.done) {
      if (ctx.isCancelled() || Date.now() > ctx.deadline) throw pendingError(name, e);
      const options = { maxRows: PAGE_ROWS };
      if (e.token) options.nextToken = e.token;
      const result = await guarded(() => table.getPagedRows(options), `Reading ${name}`, PAGE_TIMEOUT_MS);
      const data = Array.isArray(result && result.data) ? result.data : [];
      // getPagedRows gives flat rows (employeesapi reads them that way); a wrapped { Table: {...} } row is accepted too.
      data.forEach((r) => e.rows.push(project(r && r[name] && typeof r[name] === "object" ? r[name] : r || {})));
      e.token = (result && result.next_token) || null;
      if (!(result && result.more_records === true) || !e.token) {
        e.done = true;
        e.at = Date.now();
      }
    }
    return e.rows;
  }

  // How many of the values letters are made from are filled in on this Appraisal_Sheet row.
  const VALUE_KEYS = [
    "current_annual_base_pay", "hike_amount", "hike_pct", "new_pb_to_be_offered", "new_pb_installment",
    "new_rb", "month_rb", "target_pb_next_year", "new_title", "manager_rating", "comp_manager_rewards", "comp_manager_remarks",
  ];
  const valueScore = (r) =>
    VALUE_KEYS.reduce((n, k) => {
      const v = r[k];
      if (v === undefined || v === null) return n;
      const t = String(v).trim();
      return t === "" || (/^-?[\d,.]+$/.test(t) && Number(t.replace(/,/g, "")) === 0) ? n : n + 1;
    }, 0);

  const masterLocation = (m) => text(pick(m, "location", "work_location", "location_name"));

  /* Same contract as employeesapi: page + limit in, { data, pagination } out. */
  async function loadSheet(app, params) {
    const cycleId = text(params.cycleId);
    if (!ID_RE.test(cycleId)) throw fail(400, "Appraisal cycle ID is not valid.");
    const requestedPage = positiveInteger(params.page, 1);
    const limit = Math.min(positiveInteger(params.limit, DEFAULT_LIMIT), MAX_LIMIT);

    const started = Date.now();
    const ctx = { deadline: started + REQUEST_BUDGET_MS, isCancelled: params.isCancelled || (() => false) };
    const cycle = await readCycle(app, cycleId);
    const location = text(params.location) || cycle.location;
    const wantAll = isAll(location);

    // One table at a time: this project allows two Data Store calls at once, and reading both
    // big tables together took both slots, so every other request (login check, templates,
    // letters state) waited behind this one and timed out. One slot stays free this way.
    const settle = (p) => p.then((value) => ({ status: "fulfilled", value }), (reason) => ({ status: "rejected", reason }));
    const masterRes = await settle(readTable(app, MASTER_TABLE, projectMaster, ctx));
    const sheetRes =
      masterRes.status === "fulfilled"
        ? await settle(readTable(app, SHEET_TABLE, projectSheet, ctx))
        : { status: "rejected", reason: Object.assign(new Error("Appraisal_Sheet has not been started yet."), { pending: true, rowsRead: (tables.get(SHEET_TABLE) || { rows: [] }).rows.length }) };
    const bad = [masterRes, sheetRes].find((r) => r.status === "rejected" && !(r.reason && r.reason.pending));
    if (bad) {
      const e = bad.reason || {};
      throw fail(e.status || (e.timeout ? 504 : 500), `The Appraisal Sheet could not be read: ${e.message || e}`);
    }
    if (masterRes.status === "rejected" || sheetRes.status === "rejected") {
      const prog = (res, name) => (res.status === "rejected" ? res.reason.rowsRead : (tables.get(name) || { rows: [] }).rows.length);
      return {
        pending: true,
        cycle: { id: cycle.id, name: cycle.name, location: cycle.location },
        progress: { employeeMaster: prog(masterRes, MASTER_TABLE), appraisalSheet: prog(sheetRes, SHEET_TABLE) },
      };
    }

    console.log("lettersapi sheet: cycle", cycleId, location, "- Employee_Master rows", masterRes.value.length, ", Appraisal_Sheet rows", sheetRes.value.length, ", read in", Date.now() - started, "ms");

    // Employee_Master by the employee ID and by the Catalyst ROWID, like employeesapi's
    // buildEmployeeMasterMap: Appraisal_Sheet.emp_id may hold either.
    const master = new Map();
    masterRes.value.forEach((r) => {
      const id = text(r.emp_id).toLowerCase();
      const rid = rowId(r).toLowerCase();
      if (id) master.set(id, r);
      if (rid) master.set(rid, r);
    });

    // This cycle's rows only, then the location (the person's own location decides).
    // An employee can have more than one Appraisal_Sheet row in a cycle (a generated row that
    // was never filled in next to the real one). Only ONE row per employee is used: the one
    // that holds values; a row with no values at all is never used for a letter.
    const best = new Map(); // employee key -> { r, m, score }
    sheetRes.value.forEach((r) => {
      if (r.cyc !== cycleId) return;
      const m = master.get(lookupText(r.emp_id).toLowerCase());
      if (!wantAll) {
        const loc = (m ? masterLocation(m) : "") || text(pick(r, "location", "work_location"));
        if (loc.toLowerCase() !== location.toLowerCase()) return;
      }
      const key = (text(m && m.emp_id) || lookupText(r.emp_id)).toLowerCase();
      const score = valueScore(r);
      const had = best.get(key);
      // more filled values wins; on a tie the newer row (higher ROWID) wins
      if (!had || score > had.score || (score === had.score && Number(rowId(r)) > Number(rowId(had.r)))) best.set(key, { r, m, score });
    });
    const rows = [];
    let emptyDropped = 0;
    best.forEach(({ r, m, score }) => {
      if (score === 0) {
        emptyDropped += 1;
        return;
      }
      rows.push(shape(r, m));
    });

    console.log("lettersapi sheet: cycle", cycleId, location, "->", rows.length, "people,", emptyDropped, "empty duplicate rows ignored, total", Date.now() - started, "ms");

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
      emptyRowsIgnored: emptyDropped,
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

  return { loadSheet, loadCycles, _internal: { shape, tables } };
};