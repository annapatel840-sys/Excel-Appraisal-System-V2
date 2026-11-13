"use strict";

/* ACCESS CONTROL: ./accessCore.js is a byte-for-byte copy of
   functions/accessapi/accessCore.js and MUST stay identical to it
   (every Catalyst function deploys separately). Edit the accessapi copy,
   then copy it here. See docs/ACCESS_SPEC.md. */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

/* CORS: Catalyst adds the CORS headers itself for the Authorized Domains
   (Authentication > Authorized Domains). Do not set them here: two
   Access-Control-Allow-Origin headers make the browser reject the response
   ("Failed to fetch"). */

const TABLES = {
  employees: "74008000000039094",
  employeeMaster: "74008000000035727",
  payroll: "74008000000035326",
  cycles: "74008000000034190",
  audit: "74008000000034940",
  feedback: "74008000000022041",
  eligibility: "74008000000057046",
  locations: "74008000000022481",
  delegation: "74008000000036124",
  previousDelegation: "74008000000096255",
};
const PAGE_SIZE = 200;

/* ---------- Appraisal cycles ---------- */
const CYCLE_TYPES = ["Annual", "Mid-Year", "Exceptional", "New Joiner"];
const CYCLE_PROCESSES = ["Annual", "Exceptional", "None"];
// Default process when a cycle has none stored (same defaults as HR Config).
const DEFAULT_CYCLE_PROCESS = { Annual: "Annual", "Mid-Year": "Annual", Exceptional: "Exceptional", "New Joiner": "None" };
// Status moves HR may make: activate, close, reopen.
const CYCLE_MOVES = { Upcoming: ["Active"], Active: ["Closed"], Closed: ["Active"] };
// Optional Appraisal_Cycle_Master columns. Values are saved only when the
// column exists, so the function works before and after they are added.
const OPTIONAL_CYCLE_COLUMNS = ["cycle_type", "process", "effective_date", "cancel_reason", "location"];
const BUSINESS_TZ = "Asia/Kolkata";

// A cycle belongs to one Location Master location, or to every location
// ("All"). Cycles saved before locations existed have no value and count as All.
const ALL_LOCATIONS = "All";
const cycleLocationKey = (cycle) => {
  const value = String((cycle && cycle.location) || "").trim();
  return !value || value.toLowerCase() === ALL_LOCATIONS.toLowerCase() || value.toLowerCase() === "all locations"
    ? ""
    : value.toLowerCase();
};
const employeeLocationKey = (master) =>
  String((master && (master.location || master.work_location)) || "").trim().toLowerCase();
// True when the employee belongs to the cycle's location (always true for an All cycle).
const inCycleLocation = (cycle, master) => {
  const key = cycleLocationKey(cycle);
  return !key || employeeLocationKey(master) === key;
};

// "YYYY-MM-DD HH:mm:ss" in the project's time zone (IST), not UTC.
function nowLocal(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
const todayLocal = () => nowLocal().slice(0, 10);

// A location cycle is named "<Location> - <Type> <Year>" ("Dubai - Annual 2027");
// org-wide cycles stay "<Type> <Year>". Same rule as src/lib/cycle-name.js.
function cycleNameWithoutLocation(name) {
  const text = String(name || "").trim();
  const match = text.match(/^(.+?)\s+-\s+(.+)$/);
  return match && /^(annual|mid-year|exceptional|new joiner)\b/i.test(match[2]) ? match[2] : text;
}
function cycleTypeOf(name) {
  const lower = cycleNameWithoutLocation(name).toLowerCase();
  return CYCLE_TYPES.find((type) => lower.startsWith(type.toLowerCase())) || "Annual";
}
const cycleProcessOf = (cycle) => cycle.process || DEFAULT_CYCLE_PROCESS[cycle.type || cycleTypeOf(cycle.name)] || "Annual";

let cycleColumnCache = { at: 0, names: null };
async function cycleColumns(table) {
  if (cycleColumnCache.names && Date.now() - cycleColumnCache.at < 5 * 60 * 1000) return cycleColumnCache.names;
  try {
    const columns = await table.getAllColumns();
    cycleColumnCache = { at: Date.now(), names: new Set(columns.map((c) => c.column_name)) };
  } catch (error) {
    console.error("Appraisal_Cycle_Master columns could not be read:", error && error.message);
    return new Set();
  }
  return cycleColumnCache.names;
}
function withOptionalColumns(columns, row, values) {
  OPTIONAL_CYCLE_COLUMNS.forEach((key) => {
    if (columns.has(key) && values[key] !== undefined) row[key] = values[key];
  });
  return row;
}
const MAX_UPLOAD_ROWS = 5000;

const SCHEMA_SYSTEM_COLUMNS = new Set(["ROWID", "CREATORID", "CREATEDTIME", "MODIFIEDTIME"]);

function schemaLabel(name) {
  return String(name || "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeSchemaTable(table) {
  const columns = Array.isArray(table?.column_details) ? table.column_details.filter((column) => !SCHEMA_SYSTEM_COLUMNS.has(String(column.column_name || "").toUpperCase())).sort((a, b) => Number(a.column_sequence || 0) - Number(b.column_sequence || 0)).map((column) => ({
    name: String(column.column_name || ""),
    label: schemaLabel(column.column_name),
    type: String(column.data_type || "varchar").toLowerCase(),
    mandatory: Boolean(column.is_mandatory),
    unique: Boolean(column.is_unique),
    maxLength: column.max_length == null ? null : Number(column.max_length),
    decimalDigits: column.decimal_digits == null ? null : Number(column.decimal_digits),
  })) : [];
  return { id: String(table.table_id || table.id || ""), name: String(table.table_name || table.name || ""), modifiedTime: table.modified_time || "", columns };
}

async function getProjectSchema(adminApp) {
  // Keep schema metadata stable even when a payroll column is blank in every row.
  // PayrollDataPage/UploadPage intentionally expose only pay entry/calculation fields.
  const tables = [
    { name: "Employees", id: TABLES.employees },
    { name: "Employee_Master", id: TABLES.employeeMaster },
    { name: "payroll", id: TABLES.payroll },
    { name: "Feedback_And_Rating", id: TABLES.feedback },
    { name: "Appraisal_Cycle", id: TABLES.cycles },
    { name: "Eligibility_List", id: TABLES.eligibility },
    { name: "Appraisal_Audit", id: TABLES.audit },
  ];
  const datastore = adminApp.datastore();
  const payrollColumns = [
    ["appraisal_year", "Cycle", "text"],
    ["emp_id", "Employee ID", "text"],
    ["hike_pct", "Hike %", "number"],
    ["total_bonus", "Total Bonus", "number"],
    ["total_pb", "Total PB", "number"],
    ["new_base_pay", "New Base Pay", "number"],
    ["total_ctc", "Total CTC", "number"],
    ["base_pay", "Current Annual Base Pay", "number"],
    ["joining_bonus", "Joining Bonus", "number"],
    ["target_pb", "Target PB Allocated for May", "number"],
    ["rb_paid", "RB to be Paid", "number"],
    ["pb_paid", "PB to be Paid", "number"],
    ["alloc_pb", "Allocated PB Amount", "number"],
    ["alloc_inst", "Inst. (Allocated PB)", "number"],
    ["new_pb", "New PB to be Offered", "number"],
    ["new_pb_inst", "Inst. (New PB)", "number"],
    ["new_rb", "New RB", "number"],
    ["hike_amt", "Hike Amount", "number"],
    ["target_pb_next_year", "Target PB for Next Year", "number"],
  ];

  return Promise.all(tables.map(async (meta) => {
    if (meta.name === "payroll") {
      return {
        id: String(meta.id),
        name: meta.name,
        columns: payrollColumns.map(([name, label, type]) => ({
          name, label, type, mandatory: name === "emp_id",
        })),
      };
    }
    const table = datastore.table(meta.id);
    const result = await table.getPagedRows({ maxRows: 1 });
    const row = Array.isArray(result?.data) && result.data.length ? result.data[0] : {};
    const columns = Object.keys(row)
      .filter((name) => !SCHEMA_SYSTEM_COLUMNS.has(String(name).toUpperCase()))
      .map((name) => {
        const value = row[name];
        let type = "text";
        if (typeof value === "number") type = "number";
        else if (typeof value === "boolean") type = "boolean";
        else if (value instanceof Date) type = "date";
        return { name, label: schemaLabel(name), type, mandatory: false };
      });
    return { id: String(meta.id), name: meta.name, columns };
  }));
}

class ApiError extends Error {
  constructor(message, status = 400, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const PAYROLL_FIELDS = {
  empName: "emp_name", fyYear: "fy_year", basePay: "current_annual_base_pay",
  joiningBonus: "joining_bonus", performanceBonus: "performance_bonus", retentionBonus: "retention_bonus",
  hikePct: "hike_pct", hikeAmt: "hike_amount", totalCtcRewards: "total_CTC_with_rewards",
  totalRewardHikeAmt: "total_rewards_hike_amount", totalRewardHikePct: "total_reward_hike_pct",
  totalBonus: "total_bonus", newBasePay: "new_base_pay",
  targetPbNextYear: "target_performance_bonus_for_next_year", targetPbCriteria: "target_pb_criteria",
  rbPaid: "rb_to_be_paid", rbMonth: "month_rb", pbPaid: "pb_to_be_paid", pbMonth: "month_pb",
  tbPaid: "tb_to_be_paid", tbMonth: "month_tb",
};
const NUMERIC_FIELDS = new Set([
  "basePay","joiningBonus","performanceBonus","retentionBonus","hikePct","hikeAmt",
  "totalCtcRewards","totalRewardHikeAmt","totalRewardHikePct",
  "totalBonus","newBasePay","rbPaid","pbPaid","tbPaid","targetPbNextYear",
]);
const MAX_TEXT_LENGTH = { empName: 100, fyYear: 20, rbMonth: 30, pbMonth: 30, tbMonth: 30, targetPbCriteria: 255 };

function sendJson(res, status, body, req = null) {
  const serialized = JSON.stringify(body);
  const wantsGzip = req &&
    String(getQuery(req).gz || "") === "1" &&
    /\bgzip\b/i.test(String(req.headers?.["accept-encoding"] || ""));
  if (wantsGzip && Buffer.byteLength(serialized) >= 32 * 1024) {
    const compressed = require("zlib").gzipSync(serialized, { level: 1 });
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      "Content-Length": compressed.length,
      "Vary": "Accept-Encoding",
    });
    return res.end(compressed);
  }
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(serialized);
}

/* ============================================================
   ACCESS CONTROL (docs/ACCESS_SPEC.md)

   session, cycles (GET)                      → any signed-in user with a role
   payroll / audit / history (GET)            → view on 'payroll'  (HR only)
   validate / commit / undo (POST)            → edit on 'payroll'  (HR only)
   cycles/<action>/<id> (POST)                → edit on 'cycleMaster' (HR only)
   Dry run (ACCESS_ENFORCE != 'true'): legacy role checks (isHR /
   canAccessPayroll / Tech-Ed read-only) apply; refusals only logged.
   Enforced: the access object replaces those legacy checks.
   ============================================================ */

async function checkAccess(req) {
  const userApp = catalyst.initialize(req);
  const adminApp = catalyst.initialize(req, { scope: "admin" });

  try {
    return await access.check(userApp, adminApp);
  } catch (error) {
    if (access.isEnforced()) throw error;
    // Dry run must never change legacy behaviour, even if access data is unreadable.
    console.log("ACCESS dry-run: access check failed:", error && error.message);
    return { dryRun: true, enforced: false, denied: error };
  }
}

function requirePayrollAccess(a, resource, method) {
  if (resource === "session") return;
  if ((resource === "cycles" || resource === "schema" || resource === "locations") && method === "GET") return;
  if (resource === "locations" && method === "POST") {
    access.requireScreen(a, "locationMaster", "edit");
    return;
  }
  if (resource.startsWith("cycles/")) {
    access.requireScreen(a, "cycleMaster", "edit");
    return;
  }
  if (resource === "feedback" && method === "GET") {
    // Employee Master is HR-only, but the Feedback panel on the Appraisal Sheet and
    // Detailed Screen is shown to every login that can open those screens (Tech ED,
    // Comp Manager). Allow the read for any of the three; routeRequest narrows the
    // rows to the caller's own team so non-HR logins never see anyone else's feedback.
    const open = ["employeeMaster", "appraisalSheet", "detailScreen"].some((key) => {
      const level = a && a.screens ? a.screens[key] : "none";
      return level === "view" || level === "edit";
    });
    if (open) return;
    access.requireScreen(a, "employeeMaster", "view");
    return;
  }
  if (["payroll", "audit", "history"].includes(resource) && method === "GET") {
    access.requireScreen(a, "payroll", "view");
    return;
  }
  if (resource === "eligibility" && method === "GET") {
    access.requireScreen(a, "employeeMaster", "view");
    return;
  }
  if (resource === "eligibility" && method === "POST") {
    access.requireScreen(a, "employeeMaster", "edit");
    return;
  }
  if (resource === "generate-sheet" && method === "POST") {
    if (a.role === "techEd") access.requireScreen(a, "delegation", "edit");
    else access.requireScreen(a, "cycleMaster", "edit");
    return;
  }
  // import: the Upload screen's Payroll / Review and Feedback upload.
  if (["validate", "commit", "undo", "import"].includes(resource) && method === "POST") {
    access.requireScreen(a, "payroll", "edit");
  }
}

// The Active cycle decides everyone's Delegation-based access.
async function bumpAccessVersion(req, a, why) {
  try {
    await access.bumpVersion(
      catalyst.initialize(req, { scope: "admin" }),
      (a && a.user && a.user.email) || "",
      why,
    );
  } catch (error) {
    console.error("ACCESS bumpVersion failed:", error && error.message);
  }
}

function getQuery(req) {
  const url = new URL(req.url || "/", "http://localhost");
  const query = Object.fromEntries(url.searchParams.entries());
  return { ...query, ...(req.queryParams || {}) };
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.reject(new ApiError("Invalid JSON request body."));
    }
  }

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 5_000_000) {
        reject(new ApiError("Request body exceeds the 5 MB limit.", 413));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new ApiError("Invalid JSON request body."));
      }
    });
    req.on("error", reject);
  });
}

function rowId(row) {
  return String(row.ROWID || row.rowid || "");
}

// Bound Data Store page reads across this warm function instance.
// Independent table scans can overlap, but only two Catalyst COMPONENT reads
// are allowed at once to avoid the concurrency errors seen with large bursts.
const DATASTORE_READ_CONCURRENCY = 2;
let activeDataStoreReads = 0;
const dataStoreReadWaiters = [];

async function acquireDataStoreRead() {
  if (activeDataStoreReads < DATASTORE_READ_CONCURRENCY) {
    activeDataStoreReads += 1;
    return;
  }
  await new Promise((resolve) => dataStoreReadWaiters.push(resolve));
}

function releaseDataStoreRead() {
  const next = dataStoreReadWaiters.shift();
  if (next) next();
  else activeDataStoreReads = Math.max(0, activeDataStoreReads - 1);
}

async function readDataStorePage(table, options, label) {
  await acquireDataStoreRead();
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await table.getPagedRows(options);
      } catch (error) {
        const status = Number(error && (error.statusCode || error.status || error.status_code));
        const code = String(error && error.code || "").toUpperCase();
        const message = String(error && error.message || "").toLowerCase();
        const transient = [408, 429, 500, 502, 503, 504].includes(status) ||
          ["TOO_MANY_REQUESTS", "COMPONENT", "ETIMEDOUT", "ECONNRESET"].includes(code) ||
          /concurrency limit|too many requests|temporarily unavailable|timed out/.test(message);
        if (!transient || attempt >= 3) throw error;
        const delay = 300 * (2 ** attempt) + Math.floor(Math.random() * 200);
        console.warn("Retrying transient Catalyst Data Store read:", label, "attempt", attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  } finally {
    releaseDataStoreRead();
  }
}

async function getAllRows(table) {
  const rows = [];
  let nextToken;
  let moreRecords = true;
  while (moreRecords) {
    const options = { maxRows: PAGE_SIZE };
    if (nextToken) options.nextToken = nextToken;
    const result = await readDataStorePage(table, options, "payrollcycleapi table page");
    rows.push(...(Array.isArray(result.data) ? result.data : []));
    nextToken = result.next_token || null;
    moreRecords = result.more_records === true && Boolean(nextToken);
  }
  return rows;
}

/* ============================================================
   FAST READS FOR THE READ-ONLY MASTER SCREENS
   (Payroll Master, Feedback & Rating Master - GET payroll / audit / feedback)

   Same approach as the Appraisal Sheet roster in employeesapi:
   1. Unchanged-table cache. Two cheap ZCQL queries (row count + latest
      MODIFIEDTIME) fingerprint a table; while the fingerprint is the same as
      at the cached read, the rows are reused instead of being read again. Any
      insert, update or delete by any function changes the fingerprint, so a
      screen always shows what a full read would. If the check fails for any
      reason the table is simply read as before.
   2. Parallel chunk read. A big table is read as several ZCQL
      "ORDER BY ROWID LIMIT offset, 300" queries together instead of 200-row
      pages one after another. The first chunk is compared with the paged
      reader's first page and the total must match the row count; if anything
      differs or fails, the table is read page by page exactly as before.
   Only GET handlers use this. Uploads, undo, generate and every other write
   path keep reading with getAllRows.
   ============================================================ */
const FAST_READ_TABLE_NAMES = {
  payroll: "Payroll_Data",
  audit: "Appraisal_Audit",
  feedback: "Feedback_And_Rating",
  employeeMaster: "Employee_Master",
  cycles: "Appraisal_Cycle_Master",
};
const FAST_READ_CACHE = new Map(); // table key -> { fingerprint, rows, at }
const FAST_READ_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const FAST_READ_CHUNK_ROWS = 300;
const FAST_READ_IN_FLIGHT = 4;
const FAST_READ_BAD_RETRY_MS = 10 * 60 * 1000;
const FAST_READ_VERDICT = new Map(); // table key -> { ok, at }

function makeReadLimiter(limit) {
  let active = 0;
  const waiting = [];
  return async function (task) {
    if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      const next = waiting.shift();
      if (next) next();
    }
  };
}
const fastReadLimiter = makeReadLimiter(FAST_READ_IN_FLIGHT);

function isTransientReadError(error) {
  const status = Number(error && (error.statusCode || error.status || error.status_code));
  const code = String((error && error.code) || "").toUpperCase();
  const message = String((error && error.message) || "").toLowerCase();
  return [408, 429, 500, 502, 503, 504].includes(status) ||
    ["TOO_MANY_REQUESTS", "COMPONENT", "ETIMEDOUT", "ECONNRESET"].includes(code) ||
    /concurrency limit|too many requests|temporarily unavailable|timed out/.test(message);
}

async function fastReadQuery(zcql, query, label) {
  return fastReadLimiter(async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await zcql.executeZCQLQuery(query);
      } catch (error) {
        if (!isTransientReadError(error) || attempt >= 3) throw error;
        const delay = 300 * (2 ** attempt) + Math.floor(Math.random() * 200);
        console.warn("Retrying transient Catalyst ZCQL read:", label, "attempt", attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  });
}

function unwrapZcqlRow(item, tableName) {
  if (item && item[tableName] && typeof item[tableName] === "object") return item[tableName];
  const first = item && Object.values(item)[0];
  return first && typeof first === "object" ? first : item;
}

function canonicalReadRowText(row) {
  const out = {};
  Object.keys(row || {}).sort().forEach((key) => {
    const value = row[key];
    out[key] = value === null || value === undefined
      ? ""
      : typeof value === "object" ? JSON.stringify(value) : String(value);
  });
  return JSON.stringify(out);
}

async function readTableFingerprint(zcql, tableName) {
  const [count, latest] = await Promise.all([
    fastReadQuery(zcql, "SELECT COUNT(ROWID) FROM " + tableName, tableName + " row count"),
    fastReadQuery(
      zcql,
      "SELECT ROWID, MODIFIEDTIME FROM " + tableName + " ORDER BY MODIFIEDTIME DESC LIMIT 1",
      tableName + " latest change",
    ),
  ]);
  const countCell = Object.values(
    Object.values((Array.isArray(count) ? count[0] : null) || {})[0] || {},
  )[0];
  return { total: Number(countCell), fingerprint: JSON.stringify([count, latest]) };
}

async function readChunksInParallel(tables, key, tableName, total) {
  const zcql = tables.zcql;
  const chunkCount = Math.ceil(total / FAST_READ_CHUNK_ROWS);
  const readChunk = async (index) => {
    const offset = index * FAST_READ_CHUNK_ROWS;
    const expected = Math.min(FAST_READ_CHUNK_ROWS, total - offset);
    const result = await fastReadQuery(
      zcql,
      "SELECT * FROM " + tableName + " ORDER BY ROWID LIMIT " + offset + ", " + FAST_READ_CHUNK_ROWS,
      tableName + " parallel chunk",
    );
    const rows = (Array.isArray(result) ? result : []).map((item) => unwrapZcqlRow(item, tableName));
    if (rows.length !== expected) {
      throw new Error(tableName + " chunk " + index + " returned " + rows.length + " of " + expected + " rows");
    }
    return rows;
  };
  // Identity check on the first chunk before the other chunks are spent.
  const [sample, firstChunk] = await Promise.all([
    readDataStorePage(tables[key], { maxRows: PAGE_SIZE }, "payrollcycleapi sample page"),
    readChunk(0),
  ]);
  const sampleRows = Array.isArray(sample && sample.data) ? sample.data : [];
  const sameAsPaged = sampleRows.length > 0 && sampleRows.every((row, index) =>
    firstChunk[index] && canonicalReadRowText(row) === canonicalReadRowText(firstChunk[index]));
  if (!sameAsPaged) {
    FAST_READ_VERDICT.set(key, { ok: false, at: Date.now() });
    console.warn("[payrollcycleapi] parallel read of " + tableName + " differs from the paged read; using the paged read.");
    return null;
  }
  const rest = await Promise.all(
    Array.from({ length: chunkCount - 1 }, (_, index) => readChunk(index + 1)),
  );
  const rows = [firstChunk, ...rest].flat();
  if (rows.length !== total) {
    throw new Error(tableName + " parallel read returned " + rows.length + " of " + total + " rows");
  }
  FAST_READ_VERDICT.set(key, { ok: true, at: Date.now() });
  return rows;
}

// Same rows as getAllRows(tables[key]); never throws where getAllRows would not.
async function readTableFast(tables, key) {
  const tableName = FAST_READ_TABLE_NAMES[key];
  if (!tableName || !tables.zcql || typeof tables.zcql.executeZCQLQuery !== "function") {
    return getAllRows(tables[key]);
  }
  let state = null;
  try {
    state = await readTableFingerprint(tables.zcql, tableName);
  } catch (error) {
    state = null;
  }
  if (!state) {
    FAST_READ_CACHE.delete(key);
    return getAllRows(tables[key]);
  }
  const hit = FAST_READ_CACHE.get(key);
  if (hit && hit.fingerprint === state.fingerprint && Date.now() - hit.at < FAST_READ_CACHE_MAX_AGE_MS) {
    return hit.rows.map((row) => ({ ...row }));
  }

  let rows = null;
  const verdict = FAST_READ_VERDICT.get(key);
  const parallelAllowed = !(verdict && !verdict.ok && Date.now() - verdict.at < FAST_READ_BAD_RETRY_MS);
  // A small table is quicker to read in one or two pages.
  if (parallelAllowed && Number.isFinite(state.total) && state.total > 2 * PAGE_SIZE) {
    try {
      rows = await readChunksInParallel(tables, key, tableName, state.total);
    } catch (error) {
      console.warn("[payrollcycleapi] parallel read of " + tableName + " failed; using the paged read:", (error && error.message) || error);
      rows = null;
    }
  }
  if (!rows) rows = await getAllRows(tables[key]);
  // The fingerprint was taken before the read, so a write during the read makes
  // the next request's fingerprint differ and the table is read again.
  FAST_READ_CACHE.set(key, {
    fingerprint: state.fingerprint,
    rows: rows.map((row) => ({ ...row })),
    at: Date.now(),
  });
  return rows;
}

// Appraisal_Audit rows of one source only (the feedback upload batches). The
// filter runs inside ZCQL so the whole audit table is not downloaded; any
// problem falls back to the full read the caller used before.
async function readAuditBySource(tables, source) {
  if (!tables.zcql || typeof tables.zcql.executeZCQLQuery !== "function" || !/^[A-Za-z0-9_]+$/.test(source)) {
    return (await getAllRows(tables.audit)).filter((row) => row.source === source);
  }
  try {
    const tableName = FAST_READ_TABLE_NAMES.audit;
    const rows = [];
    let last = "0";
    for (let guard = 0; guard < 5000; guard += 1) {
      const result = await fastReadQuery(
        tables.zcql,
        "SELECT * FROM " + tableName + " WHERE ROWID > " + last + " AND source = '" + source +
          "' ORDER BY ROWID ASC LIMIT " + FAST_READ_CHUNK_ROWS,
        tableName + " by source",
      );
      const page = (Array.isArray(result) ? result : []).map((item) => unwrapZcqlRow(item, tableName));
      rows.push(...page);
      if (page.length < FAST_READ_CHUNK_ROWS) break;
      last = rowId(page[page.length - 1]);
      if (!last) break;
    }
    return rows;
  } catch (error) {
    console.warn("[payrollcycleapi] audit read by source failed; using the full read:", (error && error.message) || error);
    return (await getAllRows(tables.audit)).filter((row) => row.source === source);
  }
}

// Catalyst ends a request after ~30 s (408) and the browser then sends the
// same POST again on its own, so a long upload ran several times at once and
// inserted its rows two or three times. Writes stop this long into a request;
// the caller reports what was not saved and the browser sends it again.
const WRITE_TIME_LIMIT_MS = 20000;

// Writes rows 100 per call instead of one call per row. A batch Catalyst
// rejects is written row by row, so one bad row doesn't fail the others.
// Returns one { ok, error, row } per input, in order; rows not attempted
// because the deadline passed come back as { ok: false, skipped: true }.
async function writeRowsInBatches(table, rows, kind, deadline) {
  const results = [];
  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows.slice(index, index + 100);
    if (deadline && Date.now() > deadline) {
      batch.forEach(() => results.push({ ok: false, skipped: true }));
      continue;
    }
    try {
      const saved = kind === "insert" ? await table.insertRows(batch) : await table.updateRows(batch);
      batch.forEach((_, i) => results.push({ ok: true, row: Array.isArray(saved) ? saved[i] : undefined }));
    } catch (batchError) {
      console.warn("Batch " + kind + " failed; writing the rows one by one:", batchError?.message || batchError);
      for (let rowIndex = 0; rowIndex < batch.length; rowIndex += 1) {
        if (deadline && Date.now() > deadline) {
          for (let skippedIndex = rowIndex; skippedIndex < batch.length; skippedIndex += 1) {
            results.push({ ok: false, skipped: true });
          }
          break;
        }
        try {
          const row = batch[rowIndex];
          const saved = kind === "insert" ? await table.insertRow(row) : await table.updateRow(row);
          results.push({ ok: true, row: saved });
        } catch (error) {
          results.push({ ok: false, error });
        }
      }
    }
  }
  return results;
}

const NOT_SAVED_TIME_LIMIT = "Not saved: the upload ran out of time. Upload this row again.";

// Without a cancel_reason column the reason is kept in the remarks.
function cancelReasonFromRemarks(row) {
  if (String(row.status || "") !== "Cancelled") return "";
  const match = String(row.remarks || "").match(/(?:^|\| )Cancelled: ([^|]*)$/);
  return match ? match[1].trim() : "";
}

function normalizeCycle(row) {
  const sourceRowId = row.ROWID ?? row.rowid ?? row.id ?? row.ID ?? "";
  const id = String(sourceRowId).trim();
  const name = String(
    row.cycle_name ||
      row.cycleName ||
      row.name ||
      row.appraisal_year ||
      row.appraisalYear ||
      "",
  ).trim();
  const rawStatus = String(row.status || "Upcoming").trim();
  const statusKey = rawStatus.toLowerCase();
  const status =
    statusKey === "active" ? "Active" :
    statusKey === "closed" ? "Closed" :
    statusKey === "upcoming" ? "Upcoming" :
    rawStatus;
  const isTruthyFlag = (value) =>
    [true, 1, "true", "1", "yes"].includes(
      typeof value === "string" ? value.trim().toLowerCase() : value,
    );
  return {
    id,
    sourceRowId,
    name,
    effective: row.effective_date || row.effectiveDate || "",
    start: row.start_date || row.startDate || "",
    end: row.end_date || row.endDate || "",
    status,
    remarks: row.remarks || "",
    changedBy: row.changed_by || "",
    changedAt: row.changed_at || "",
    archived: isTruthyFlag(row.archived),
    hidden: isTruthyFlag(row.hidden),
    type: row.cycle_type || "",
    process: row.process || "",
    cancelReason: row.cancel_reason || cancelReasonFromRemarks(row),
    // "" (saved before locations existed) is shown and treated as All Locations.
    location: String(row.location || "").trim() || ALL_LOCATIONS,
  };
}

function displayName(user) {
  return (
    user.display_name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.email_id ||
    ""
  );
}

function roleName(user) {
  return String(
    user.role_details?.role_name || user.role_name || "",
  ).trim().toLowerCase();
}

function isHR(user) {
  return roleName(user) === "hr";
}

function isTechEd(user) {
  return roleName(user).replace(/[^a-z0-9]/g, "").includes("teched");
}

function canAccessPayroll(user) {
  return isHR(user) || roleName(user) === "comp. manager" || isTechEd(user);
}

function getCurrentUserMatchValues(user) {
  const firstName = user?.first_name || "";
  const lastName = user?.last_name || "";
  return [
    user?.user_id,
    user?.email_id,
    user?.email,
    user?.display_name,
    user?.name,
    firstName,
    lastName,
    [firstName, lastName].filter(Boolean).join(" "),
  ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
}

function employeeBelongsToCurrentUser(employee, user) {
  const assigned = String(employee?.appraiser_tech_ed || "").trim().toLowerCase();
  if (!assigned) return false;

  if (getCurrentUserMatchValues(user).some((value) =>
    assigned === value || assigned.includes(value) || value.includes(assigned)
  )) {
    return true;
  }

  const firstName = String(user?.first_name || "").trim().toLowerCase();
  const lastName = String(user?.last_name || "").trim().toLowerCase();

  if (lastName && !assigned.includes(lastName)) return false;
  if (firstName && !assigned.includes(firstName)) return false;

  return Boolean(firstName || lastName);
}

function normalizeText(value, key) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value).trim();
  if (text.length > MAX_TEXT_LENGTH[key]) {
    throw new ApiError(`${key} exceeds ${MAX_TEXT_LENGTH[key]} characters.`);
  }
  return text;
}

function normalizeNumber(value, key) {
  if (value === undefined || value === null || value === "") return 0;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").replace(/[₹$%]/g, "").trim());
  // Payroll values can legitimately be negative (for example, a negative hike amount).
  // Validate numeric input and magnitude, not its sign.
  if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER) {
    throw new ApiError(`${key} must be a valid number.`);
  }
  return number;
}
function toPayrollRow(input, cycle, master, batchId, fileName) {
  const empId = String(input.empId || "").trim();
  if (!empId) throw new ApiError("Employee ID is required.");
  if (empId.length > 50) throw new ApiError("Employee ID must be 50 characters or fewer.");
  // These two payroll columns are BIGINT/foreign-key fields. Preserve the
  // native Catalyst ROWID value instead of converting it to a string.
  const employeeRowId = master?.ROWID ?? master?.rowid ?? "";
  const cycleRowId = cycle?.sourceRowId ?? cycle?.id ?? "";
  if (!employeeRowId) throw new ApiError(`Employee ${empId} has no valid Employee Master ROWID.`);
  if (!cycleRowId) throw new ApiError("The selected appraisal cycle has no valid ROWID.");
  // emp_id, emp_name and appraisal_cycle_name are BIGINT lookup/FK fields.
  // The Excel Employee ID is only the business key used to find the master row.
  const row = { emp_id: employeeRowId, emp_name: employeeRowId, appraisal_cycle_name: cycleRowId };
  Object.entries(PAYROLL_FIELDS).forEach(([key, column]) => {
    row[column] = NUMERIC_FIELDS.has(key) ? normalizeNumber(input[key], key) : normalizeText(input[key], key);
  });
  return row;
}

function auditDetails(row) {
  try {
    return row.details ? JSON.parse(row.details) : {};
  } catch {
    return {};
  }
}

async function writeAudit(auditTable, {
  actor,
  source,
  batchId = "",
  cycle,
  action,
  details,
  empId = "",
  employeeName = "",
  fieldName = "",
  oldValue = "",
  newValue = "",
}) {
  await auditTable.insertRow({
    emp_id: empId || "CYCLE",
    employee_name: employeeName || cycle?.name || "",
    field_name: fieldName || action,
    old_value: String(oldValue).slice(0, 50),
    new_value: String(newValue).slice(0, 50),
    changed_by: actor,
    changed_at: nowLocal(),
    source,
    batch_id: batchId || cycle?.id || "",
    appraisal_year: cycle?.name || "",
    details: JSON.stringify(details || {}),
  });
}

async function requireIdentity(req) {
  const userApp = catalyst.initialize(req);
  const user = await userApp.userManagement().getCurrentUser();
  if (!user || !user.user_id) return null;
  return {
    id: String(user.user_id),
    name: displayName(user),
    email: user.email_id || "",
    role: user.role_details?.role_name || user.role_name || "",
    user,
  };
}

async function requirePayrollTables(adminApp) {
  const datastore = adminApp.datastore();
  return {
    datastore,
    employees: datastore.table(TABLES.employees),
    employeeMaster: datastore.table(TABLES.employeeMaster),
    payroll: datastore.table(TABLES.payroll),
    cycles: datastore.table(TABLES.cycles),
    audit: datastore.table(TABLES.audit),
    feedback: datastore.table(TABLES.feedback),
    eligibility: datastore.table(TABLES.eligibility),
    locations: datastore.table(TABLES.locations),
    delegation: datastore.table(TABLES.delegation),
    previousDelegation: datastore.table(TABLES.previousDelegation),
    // Used only by the fast read-only GET paths (readTableFast); null when the
    // SDK instance has no ZCQL, in which case those reads use the paged reader.
    zcql: typeof adminApp.zcql === "function" ? adminApp.zcql() : null,
  };
}

// readBack (optional): receives the Employee_Master and Eligibility_List rows
// this sync read, plus whether it wrote anything, so a caller can reuse them
// instead of reading both tables again when nothing changed.
async function syncEligibilityRows(tables, cycle, actor = "", readBack = null) {
  if (!cycle?.id) throw new ApiError("Select an appraisal cycle before loading eligibility.", 400);

  const [masterRows, existingRows] = await Promise.all([
    getAllRows(tables.employeeMaster),
    getAllRows(tables.eligibility),
  ]);
  const cycleRows = existingRows.filter(
    (row) => String(row.appraisal_cycle_id || "") === String(cycle.id),
  );
  // Older versions seeded all active employees with System rows on first
  // page load. If this cycle has never had criteria applied, remove those
  // automatic placeholders while preserving explicit Manual rows.
  const criteriaAlreadyApplied = await eligibilityCriteriaWasApplied(tables, cycle.id, cycleRows);
  const unqualifiedSeedRows = criteriaAlreadyApplied ? [] : cycleRows.filter((row) =>
    String(row.eligibility_source || "").trim().toLowerCase() === "system",
  );
  const masterByRowId = new Map(
    masterRows.map((row) => [String(row.ROWID || row.rowid || ""), row]),
  );
  const masterByEmpId = new Map(
    masterRows
      .map((row) => [String(row.emp_id || "").trim().toLowerCase(), row])
      .filter(([empId]) => empId),
  );
  const existingByMasterId = new Map(
    cycleRows.map((row) => [String(row.employee_master_id || ""), row]),
  );
  const existingByEmpId = new Map(
    cycleRows.map((row) => [String(row.emp_id || "").trim().toLowerCase(), row]),
  );

  // Keep inactive employees already on this cycle's list so HR can see why
  // they no longer qualify. Truly orphaned rows and rows from other cycles
  // are still removed; inactive rows are retained and marked Not Eligible.
  let repairedReferences = 0;
  let inactiveMarked = 0;
  let rowsUpdated = 0;
  for (const row of cycleRows) {
    const linkedMasterId = String(row.employee_master_id || "");
    const empId = String(row.emp_id || "").trim().toLowerCase();
    const master = masterByRowId.get(linkedMasterId) || masterByEmpId.get(empId);
    if (!master) continue;
    const actualMasterId = String(master.ROWID || master.rowid || "");
    const inactive = String(master.emp_status || master.status || "Active").trim().toLowerCase() !== "active";
    const patch = { ROWID: rowId(row) };
    if (actualMasterId && linkedMasterId !== actualMasterId) {
      patch.employee_master_id = actualMasterId;
      patch.emp_id = String(master.emp_id || row.emp_id || "").trim();
      repairedReferences += 1;
    }
    if (inactive && eligibilityStatusOf(row) !== "Not Eligible") {
      patch.eligibility_status = "Not Eligible";
      patch.eligibility_reason = "Employee inactive";
      patch.eligibility_source = "System";
      patch.change_tag = "Changed";
      patch.evaluated_at = nowLocal();
      patch.updated_by = String(actor || "System").slice(0, 60);
      patch.eligibility_updated_at = nowLocal();
      inactiveMarked += 1;
    } else if (!inactive && eligibilityStatusOf(row) === "Pending") {
      // Repair legacy/partially-created rows: first-time status is Eligible,
      // never Pending. Apply Criteria will set the final decision afterward.
      patch.eligibility_status = "Eligible";
      patch.eligibility_reason = "";
      patch.eligibility_source = "System";
      patch.evaluated_at = nowLocal();
      patch.updated_by = String(actor || "System").slice(0, 60);
      patch.eligibility_updated_at = nowLocal();
    }
    if (Object.keys(patch).length > 1) {
      await tables.eligibility.updateRow(patch);
      rowsUpdated += 1;
    }
  }

  // The Eligibility List is cycle-specific. Remove only stale-cycle rows and
  // rows whose employee no longer exists in Employee_Master.
  const staleRows = existingRows.filter(
    (row) => String(row.appraisal_cycle_id || "") !== String(cycle.id),
  );
  const orphanRows = cycleRows.filter((row) => {
    const empId = String(row.emp_id || "").trim().toLowerCase();
    return !masterByRowId.has(String(row.employee_master_id || "")) && !masterByEmpId.has(empId);
  });
  const toDelete = [...staleRows, ...orphanRows, ...unqualifiedSeedRows];
  await deleteEligibilityRowsById(tables, toDelete.map((row) => rowId(row)));

  // Opening the Eligibility List must never pre-populate employees.
  // Only Apply Criteria or the explicit Add An Employee action may create
  // cycle rows. This sync is limited to repairing existing rows/references.

  if (readBack) {
    readBack.masterRows = masterRows;
    readBack.eligibilityRows = existingRows;
    readBack.changed = rowsUpdated > 0 || toDelete.length > 0;
    // Reuse the marker lookup already performed during this sync; the GET
    // route must not scan the full Appraisal_Audit table a second time.
    readBack.criteriaApplied = criteriaAlreadyApplied;
  }

  return {
    created: 0,
    removed: orphanRows.length,
    staleRemoved: staleRows.length,
    unqualifiedSeedRowsRemoved: unqualifiedSeedRows.length,
    repairedReferences,
    inactiveMarked,
    activeEmployees: masterRows.filter((row) =>
      String(row.emp_status || row.status || "Active").trim().toLowerCase() === "active"
    ).length,
  };
}

// Normalises a date to "yyyy-mm-dd" for the joining-date cutoff comparison.
function isoDateOf(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "Apply Criteria": evaluates the Active cycle's roster from Employee_Master.
// Every employee remains visible; each active non-manual row is updated to
// Eligible or Not Eligible. Manual decisions are preserved.
async function eligibilityCriteriaWasApplied(tables, cycleId, eligibilityRows = null) {
  // The audit marker survives closing/archiving, when Eligibility_List rows
  // are intentionally cleared. The row-source check also locks cycles where
  // Apply Criteria was completed before this marker was introduced.
  const [auditRows, rows] = await Promise.all([
    getAllRows(tables.audit),
    eligibilityRows ? Promise.resolve(eligibilityRows) : getAllRows(tables.eligibility),
  ]);
  const hasAuditMarker = auditRows.some((row) =>
    String(row.source || "").trim().toLowerCase() === "eligibility_criteria" &&
    String(row.batch_id || "") === String(cycleId),
  );
  const hasCriteriaRows = rows.some((row) =>
    String(row.appraisal_cycle_id || "") === String(cycleId) &&
    String(row.eligibility_source || "").trim().toLowerCase() === "criteria",
  );
  return hasAuditMarker || hasCriteriaRows;
}

/* ---------- Eligibility criteria: saved with every Apply Criteria ----------
 * The criteria of each Apply are stored in the details of the cycle's
 * "eligibility_criteria" audit row, so the last Apply is always what the screen
 * shows again (and what Edit Criteria starts from). Older rows without criteria
 * are ignored. */
const CRITERIA_LISTS = ["departments", "designations", "statuses", "excludedEmployees"];

function cleanCriteria(body) {
  const list = (value) => [...new Set(
    (Array.isArray(value) ? value : []).map((item) => String(item ?? "").trim()).filter(Boolean),
  )];
  const extra = (Array.isArray(body.extraParameters) ? body.extraParameters : [])
    .filter((p) => p && typeof p === "object" && p.field)
    .map((p) => ({
      id: String(p.id || "").slice(0, 60),
      master: String(p.master || "EM").slice(0, 10),
      field: String(p.field || "").slice(0, 80),
      label: String(p.label || "").slice(0, 80),
      type: ["list", "number", "date"].includes(p.type) ? p.type : "list",
      values: list(p.values),
      op: p.op === "before" ? "before" : "after",
      value: p.value == null ? "" : String(p.value).slice(0, 40),
    }));
  return {
    departments: list(body.departments),
    designations: list(body.designations),
    statuses: list(body.statuses),
    excludedEmployees: list(body.excludedEmployees),
    cutoffDate: isoDateOf(body.cutoffDate) || "",
    extraParameters: extra,
  };
}

// What changed between the previous Apply and this one (shown on the Audit tab).
function criteriaChanges(prev, next) {
  const changes = [];
  CRITERIA_LISTS.forEach((field) => {
    const before = (prev && prev[field]) || [];
    const after = next[field] || [];
    const added = after.filter((v) => !before.includes(v));
    const removed = before.filter((v) => !after.includes(v));
    if (added.length || removed.length) changes.push({ field, added, removed });
  });
  if (((prev && prev.cutoffDate) || "") !== (next.cutoffDate || "")) {
    changes.push({ field: "cutoffDate", from: (prev && prev.cutoffDate) || "", to: next.cutoffDate || "" });
  }
  const sig = (c) => JSON.stringify((c && c.extraParameters) || []);
  if (sig(prev) !== sig(next)) changes.push({ field: "extraParameters" });
  return changes;
}

// Latest criteria of this cycle + the history of every Apply. A cycle that has
// never been applied starts from the last criteria used by another cycle of the
// same location (cutoff date is per cycle, so it is not carried over).
async function readEligibilityCriteriaMeta(tables, cycle, auditRows = null) {
  const rows = auditRows || await getAllRows(tables.audit);
  const applies = rows
    .filter((row) => String(row.source || "").trim().toLowerCase() === "eligibility_criteria")
    .map((row) => ({ row, details: auditDetails(row) }))
    .filter(({ details }) => details && details.criteria);
  const sortByTime = (a, b) => String(a.row.changed_at || a.row.CREATEDTIME || "")
    .localeCompare(String(b.row.changed_at || b.row.CREATEDTIME || ""));
  const own = applies
    .filter(({ row }) => String(row.batch_id || "") === String(cycle.id))
    .sort(sortByTime);
  const criteriaHistory = own.map(({ row, details }, index) => ({
    at: row.changed_at || "",
    by: row.changed_by || "",
    first: index === 0,
    criteria: details.criteria,
    changes: Array.isArray(details.changes) ? details.changes : [],
  }));
  if (own.length) {
    return { criteria: own[own.length - 1].details.criteria, criteriaHistory, inherited: false };
  }
  const cycles = (await getAllRows(tables.cycles)).map(normalizeCycle);
  const sameLocation = new Set(
    cycles.filter((item) => cycleLocationKey(item) === cycleLocationKey(cycle)).map((item) => item.id),
  );
  const other = applies
    .filter(({ row }) => sameLocation.has(String(row.batch_id || "")) && String(row.batch_id || "") !== String(cycle.id))
    .sort(sortByTime);
  if (!other.length) return { criteria: null, criteriaHistory, inherited: false };
  return {
    criteria: { ...other[other.length - 1].details.criteria, cutoffDate: "" },
    criteriaHistory,
    inherited: true,
  };
}

// "Add parameter" rules: Employee Master column behind each field the screen offers.
const PARAM_COLUMN = {
  empType: ["emp_type"], organization: ["department", "organization"], band: ["band"],
  skillType: ["skill_type"], orgExp: ["wissen_experience", "org_experience"],
  exitDate: ["exit_date"], designationGroup: ["designation_group"],
  bandMaster: ["band"], skillMaster: ["skill_type"],
};
function paramValueOf(param, master) {
  const field = String(param.field || "");
  const columns = field.startsWith("raw:") ? [field.slice(4)] : (PARAM_COLUMN[field] || []);
  for (const column of columns) {
    const value = master[column];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}
// Same rule as failsParam() on the screen: true = the employee is left out.
function failsCriteriaParam(param, master) {
  const value = paramValueOf(param, master);
  if (param.type === "list") {
    const text = String(value ?? "").trim().toLowerCase();
    return Boolean(text) && (param.values || []).some((v) => String(v).trim().toLowerCase() === text);
  }
  if (param.value === "" || param.value == null || value === "" || value == null) return false;
  if (param.type === "number") return Number(value) < Number(param.value);
  const day = isoDateOf(value);
  const limit = isoDateOf(param.value);
  if (!day || !limit) return false;
  return param.op === "before" ? day <= limit : day > limit;
}

async function applyEligibilityCriteria(tables, body, actor) {
  const cycleId = String(body.cycleId || body.appraisal_cycle_id || "").trim();
  if (!cycleId) throw new ApiError("Appraisal cycle is required.", 400);

  const cycles = (await getAllRows(tables.cycles)).map(normalizeCycle);
  const cycle = cycles.find((item) => item.id === cycleId);
  if (!cycle) throw new ApiError("The selected appraisal cycle was not found.", 404);
  if (String(cycle.status || "").trim().toLowerCase() !== "active" || cycle.archived || cycle.hidden) {
    throw new ApiError("Eligibility can be changed only for the Active appraisal cycle.", 409);
  }
  // Apply Criteria can be run again for the Active cycle (Edit Criteria → Apply):
  // rows are re-evaluated against the new criteria and manual decisions are kept.

  // Ensure all active employees have an initial Eligible row and retain
  // existing inactive employees as visible Not Eligible rows.
  await syncEligibilityRows(tables, cycle, actor);

  const lowerList = (value) =>
    (Array.isArray(value) ? value : [])
      .map((item) => String(item ?? "").trim().toLowerCase())
      .filter(Boolean);
  const departments = lowerList(body.departments);
  const designations = lowerList(body.designations);
  const excludedEmployees = lowerList(body.excludedEmployees);
  const cutoff = isoDateOf(body.cutoffDate);
  const criteria = cleanCriteria(body);
  const statuses = lowerList(criteria.statuses);
  const extraParameters = criteria.extraParameters;

  const [masters, allEligibility] = await Promise.all([
    getAllRows(tables.employeeMaster),
    getAllRows(tables.eligibility),
  ]);
  const existingByMasterId = new Map(
    allEligibility
      .filter((row) => String(row.appraisal_cycle_id || "") === cycleId)
      .map((row) => [String(row.employee_master_id || ""), row]),
  );

  const now = nowLocal();
  const toInsert = [];
  const toUpdate = [];
  const added = [];
  const updated = [];
  const removedRows = [];
  let evaluated = 0;
  let excluded = 0;
  let manualKept = 0;

  for (const master of masters) {
    const masterId = String(master.ROWID || master.rowid || "");
    const empId = String(master.emp_id || "").trim();
    if (!masterId || !empId) continue;
    // A location cycle lists only that location's employees.
    if (!inCycleLocation(cycle, master)) continue;
    const existing = existingByMasterId.get(masterId);
    const active = String(master.emp_status || master.status || "Active").trim().toLowerCase() === "active";

    // Keep existing cycle rows for employees who became inactive after setup.
    if (!active) {
      if (existing && eligibilityStatusOf(existing) !== "Not Eligible") {
        toUpdate.push({
          ROWID: rowId(existing),
          eligibility_status: "Not Eligible",
          eligibility_reason: "Employee inactive",
          eligibility_source: "System",
          change_tag: "Changed",
          evaluated_at: now,
          updated_by: String(actor || "System").slice(0, 60),
          eligibility_updated_at: now,
        });
        updated.push({ empId, name: String(master.emp_name || master.name || ""), oldStatus: eligibilityStatusOf(existing), newStatus: "Not Eligible" });
      }
      continue;
    }

    evaluated += 1;
    if (existing && String(existing.eligibility_source || "").trim().toLowerCase() === "manual") {
      manualKept += 1;
      continue;
    }

    const reasons = [];
    if (departments.length && departments.includes(String(master.department || master.organization || "").trim().toLowerCase())) {
      reasons.push("Department excluded");
    }
    if (designations.length && designations.includes(String(master.designation || "").trim().toLowerCase())) {
      reasons.push("Designation excluded");
    }
    if (excludedEmployees.includes(empId.toLowerCase())) reasons.push("Employee excluded");
    if (statuses.length && statuses.includes(String(master.emp_status || master.status || "Active").trim().toLowerCase())) {
      reasons.push("Status excluded");
    }
    for (const param of extraParameters) {
      if (failsCriteriaParam(param, master)) {
        reasons.push(`${param.label || param.field} excluded`);
        break;
      }
    }
    if (cutoff) {
      const doj = isoDateOf(master.joining_date || master.date_of_join);
      if (!doj) reasons.push("Missing DOJ");
      else if (doj > cutoff) reasons.push("Joined after cutoff date");
    }

    const name = String(master.emp_name || master.name || "");
    const decision = reasons.length ? "Not Eligible" : "Eligible";
    if (reasons.length) {
      excluded += 1;
      // Employees who fail setup criteria must not be inserted into the
      // Eligibility List. Remove legacy/system/criteria rows for them, but
      // preserve deliberate manual inclusions.
      if (existing && String(existing.eligibility_source || "").trim().toLowerCase() !== "manual") {
        await deleteEligibilityRowsById(tables, [rowId(existing)]);
        existingByMasterId.delete(masterId);
        removedRows.push({ empId, name });
      }
      continue;
    }
    const values = {
      appraisal_cycle_id: cycleId,
      employee_master_id: masterId,
      emp_id: empId,
      eligibility_status: decision,
      eligibility_reason: reasons.join(", ").slice(0, 50),
      eligibility_source: "Criteria",
      change_tag: existing ? "Changed" : "New",
      evaluated_at: now,
      updated_by: String(actor || "System").slice(0, 60),
      eligibility_updated_at: now,
    };
    if (existing) {
      if (
        eligibilityStatusOf(existing) !== decision ||
        String(existing.eligibility_reason || "") !== values.eligibility_reason ||
        String(existing.eligibility_source || "").toLowerCase() !== "criteria"
      ) {
        toUpdate.push({ ROWID: rowId(existing), ...values });
        updated.push({ empId, name, oldStatus: eligibilityStatusOf(existing), newStatus: decision });
      }
    } else {
      toInsert.push(values);
      added.push({ empId, name });
    }
  }

  for (let index = 0; index < toUpdate.length; index += 1) {
    await tables.eligibility.updateRow(toUpdate[index]);
  }
  for (let index = 0; index < toInsert.length; index += 100) {
    await tables.eligibility.insertRows(toInsert.slice(index, index + 100));
  }
  // Persist a cycle-specific marker so the lock survives refreshes and
  // remains associated with this cycle after its eligibility rows are cleared.
  const previousCriteria = (await readEligibilityCriteriaMeta(tables, cycle).catch(() => null));
  const previousOwn = previousCriteria && !previousCriteria.inherited ? previousCriteria.criteria : null;
  const auditDetailsBase = {
    kind: "eligibility-criteria-applied",
    action: "Apply Criteria completed",
    cycleId,
    cycleName: cycle.name,
    evaluated,
    added: added.length,
    excluded,
    removed: removedRows.length,
  };
  try {
    await writeAudit(tables.audit, {
      actor,
      source: "eligibility_criteria",
      batchId: cycleId,
      cycle,
      action: "Apply Criteria completed",
      details: { ...auditDetailsBase, criteria, changes: criteriaChanges(previousOwn, criteria) },
    });
  } catch (criteriaSaveError) {
    // The rows are already written: never fail the Apply because the criteria
    // copy did not fit. Keep the lock marker without it.
    console.error("Could not store the applied criteria:", criteriaSaveError);
    await writeAudit(tables.audit, {
      actor,
      source: "eligibility_criteria",
      batchId: cycleId,
      cycle,
      action: "Apply Criteria completed",
      details: auditDetailsBase,
    });
  }
  return {
    cycleId,
    cycleName: cycle.name,
    criteriaApplied: true,
    evaluated,
    added: added.length,
    updated: updated.length,
    excluded,
    kept: Math.max(0, evaluated - added.length - updated.length - manualKept),
    manualKept,
    addedRows: added,
    updatedRows: updated,
    removed: removedRows.length,
    removedRows,
  };
}

async function deleteEligibilityRowsById(tables, ids) {
  const clean = ids.filter(Boolean);
  for (let index = 0; index < clean.length; index += 100) {
    await tables.eligibility.deleteRows(clean.slice(index, index + 100));
  }
  return clean.length;
}

// Eligibility_List is only kept while a cycle is Active. Closing (or
// cancelling) a cycle empties that cycle's rows.
async function clearEligibilityRows(tables, cycleId) {
  const rows = await getAllRows(tables.eligibility);
  const mine = rows.filter(
    (row) => String(row.appraisal_cycle_id || "") === String(cycleId),
  );
  return deleteEligibilityRowsById(
    tables,
    mine.map((row) => rowId(row)),
  );
}

function eligibilityStatusOf(row) {
  // Empty primary aliases must not mask a populated legacy field.
  const raw = String(
    [row?.eligibility_status, row?.eligible_status, row?.eligibility]
      .find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? "",
  ).trim().toLowerCase().replace(/[ _-]+/g, "");
  if (["eligible", "yes", "true", "1"].includes(raw)) return "Eligible";
  if (["noteligible", "no", "false", "0", "ineligible"].includes(raw)) return "Not Eligible";
  // An absent/unknown decision is not the same as an explicit Eligible choice.
  return "Pending";
}

function shapeEligibilityRow(row, master) {
  const eligibilityStatus = eligibilityStatusOf(row);
  return {
    ...master,
    ...row,
    emp_id: String(master.emp_id || row.emp_id || ""),
    empId: String(master.emp_id || row.emp_id || ""),
    name: String(master.emp_name || master.name || ""),
    designation: String(master.designation || ""),
    department: String(master.department || ""),
    organization: String(master.department || ""),
    doj: master.joining_date || master.date_of_join || "",
    joining_date: master.joining_date || "",
    status: String(master.emp_status || master.status || "Active"),
    eligibility_status: eligibilityStatus,
    eligible_status: eligibilityStatus,
    eligibleReason: String(row.eligibility_reason || ""),
    eligible_reason: String(row.eligibility_reason || ""),
    eligibilitySource: String(row.eligibility_source || "Criteria"),
    changeTag: String(row.change_tag || ""),
    eligibilityUpdatedAt: row.eligibility_updated_at || row.MODIFIEDTIME || "",
    manualOverride: String(row.eligibility_source || "").toLowerCase() === "manual",
    eligibilityRowId: rowId(row),
    employeeMasterRowId: String(master.ROWID || master.rowid || ""),
    appraisalCycleId: String(row.appraisal_cycle_id || ""),
  };
}

async function getEligibilityRows(tables, cycle, actor = "") {
  const synced = {};
  if (String(cycle.status || "").trim().toLowerCase() === "active" && !cycle.archived) {
    await syncEligibilityRows(tables, cycle, actor, synced);
  }
  // When the sync wrote nothing, the rows it read are still current.
  const [masterRows, eligibilityRows] = synced.masterRows && !synced.changed
    ? [synced.masterRows, synced.eligibilityRows]
    : await Promise.all([
      getAllRows(tables.employeeMaster),
      getAllRows(tables.eligibility),
    ]);
  const masterById = new Map(
    masterRows.map((row) => [String(row.ROWID || row.rowid || ""), row]),
  );
  const masterByEmpId = new Map(
    masterRows
      .map((row) => [String(row.emp_id || "").trim().toLowerCase(), row])
      .filter(([empId]) => empId),
  );
  const records = eligibilityRows
    .filter((row) => String(row.appraisal_cycle_id || "") === String(cycle.id))
    .map((row) => {
      const master = masterById.get(String(row.employee_master_id || "")) ||
        masterByEmpId.get(String(row.emp_id || "").trim().toLowerCase());
      return master ? shapeEligibilityRow(row, master) : null;
    })
    .filter(Boolean);
  return {
    records,
    masterRecords: masterRows,
    criteriaApplied: Boolean(synced.criteriaApplied),
  };
}

async function saveEligibilityRow(tables, body, actor) {
  const cycleId = String(body.cycleId || body.appraisal_cycle_id || "").trim();
  const empId = String(body.empId || body.emp_id || "").trim();
  if (!cycleId || !empId) throw new ApiError("Appraisal cycle and employee ID are required.", 400);

  const cycles = (await getAllRows(tables.cycles)).map(normalizeCycle);
  const cycle = cycles.find((item) => item.id === cycleId);
  if (!cycle) throw new ApiError("The selected appraisal cycle was not found.", 404);
  if (String(cycle.status || "").trim().toLowerCase() !== "active" || cycle.archived || cycle.hidden) {
    throw new ApiError("Eligibility can be changed only for the Active appraisal cycle.", 409);
  }

  const masters = await getAllRows(tables.employeeMaster);
  const master = masters.find((row) => String(row.emp_id || "").trim().toLowerCase() === empId.toLowerCase());
  if (!master) throw new ApiError(`Employee ${empId} was not found in Employee Master.`, 404);
  if (String(master.emp_status || master.status || "Active").trim().toLowerCase() !== "active") {
    throw new ApiError("Only Active employees can be saved in Eligibility List.", 409);
  }

  const masterId = String(master.ROWID || master.rowid || "");
  const rows = await getAllRows(tables.eligibility);
  const existing = rows.find((row) =>
    String(row.appraisal_cycle_id || "") === cycleId &&
    String(row.employee_master_id || "") === masterId
  );
  if (!existing && !inCycleLocation(cycle, master)) {
    throw new ApiError(`${empId} works in ${String(master.location || master.work_location || "another location").trim()}; this cycle is for ${cycle.location}.`, 409);
  }
  const rawEligible = String(body.eligible_status || body.eligible || "").trim().toLowerCase();
  const eligible = ["eligible", "yes", "true"].includes(rawEligible)
    ? "Eligible"
    : ["not eligible", "noteligible", "no", "false"].includes(rawEligible)
      ? "Not Eligible"
      : "";
  if (!eligible) throw new ApiError("Eligibility must be Eligible or Not Eligible.", 400);

  const source = String(body.source || body.eligibility_source || "Manual").trim().toLowerCase() === "criteria"
    ? "Criteria"
    : "Manual";
  const now = nowLocal();
  const row = {
    ...(existing ? { ROWID: rowId(existing) } : {}),
    appraisal_cycle_id: cycleId,
    employee_master_id: masterId,
    emp_id: empId,
    eligibility_status: eligible,
    eligibility_reason: String(body.reason || body.eligibility_reason || "").trim().slice(0, 50),
    eligibility_source: source,
    change_tag: existing ? "Changed" : "New",
    evaluated_at: now,
    updated_by: String(actor || "Unknown user").slice(0, 60),
    eligibility_updated_at: now,
  };
  const saved = existing
    ? await tables.eligibility.updateRow(row)
    : await tables.eligibility.insertRow(row);
  return shapeEligibilityRow({ ...row, ...(saved || {}) }, master);
}

async function saveEligibilityRowsBatch(tables, body, actor) {
  const cycleId = String(body.cycleId || body.appraisal_cycle_id || "").trim();
  const records = Array.isArray(body.records) ? body.records : [];
  if (!cycleId || !records.length) throw new ApiError("Appraisal cycle and eligibility records are required.", 400);

  const cycles = (await getAllRows(tables.cycles)).map(normalizeCycle);
  const cycle = cycles.find((item) => item.id === cycleId);
  if (!cycle) throw new ApiError("The selected appraisal cycle was not found.", 404);
  if (String(cycle.status || "").trim().toLowerCase() !== "active" || cycle.archived || cycle.hidden) {
    throw new ApiError("Eligibility can be changed only for the Active appraisal cycle.", 409);
  }

  const [masters, allEligibility] = await Promise.all([
    getAllRows(tables.employeeMaster),
    getAllRows(tables.eligibility),
  ]);
  const masterByEmpId = new Map(
    masters.map((row) => [String(row.emp_id || "").trim().toLowerCase(), row]),
  );
  const existingByMasterId = new Map(
    allEligibility
      .filter((row) => String(row.appraisal_cycle_id || "") === cycleId)
      .map((row) => [String(row.employee_master_id || ""), row]),
  );
  const results = new Array(records.length);
  const inserts = [];
  const updates = [];

  records.forEach((record, index) => {
    const empId = String(record.empId || record.emp_id || "").trim();
    try {
      if (!empId) throw new ApiError("Employee ID is required.", 400);
      const master = masterByEmpId.get(empId.toLowerCase());
      if (!master) throw new ApiError(`Employee ${empId} was not found in Employee Master.`, 404);
      if (String(master.emp_status || master.status || "Active").trim().toLowerCase() !== "active") {
        throw new ApiError("Only Active employees can be saved in Eligibility List.", 409);
      }
      if (
        !existingByMasterId.has(String(master.ROWID || master.rowid || "")) &&
        !inCycleLocation(cycle, master)
      ) {
        throw new ApiError(`${empId} works in ${String(master.location || master.work_location || "another location").trim()}; this cycle is for ${cycle.location}.`, 409);
      }
      const rawEligible = String(record.eligible_status || record.eligible || "").trim().toLowerCase();
      const eligible = ["eligible", "yes", "true"].includes(rawEligible)
        ? "Eligible"
        : ["not eligible", "noteligible", "no", "false"].includes(rawEligible)
          ? "Not Eligible"
          : "";
      if (!eligible) throw new ApiError("Eligibility must be Eligible or Not Eligible.", 400);

      const masterId = String(master.ROWID || master.rowid || "");
      const existing = existingByMasterId.get(masterId);
      const sourceValue = String(record.source || body.source || "Manual").trim().toLowerCase();
      const source = sourceValue === "criteria" ? "Criteria" : sourceValue === "system" ? "System" : "Manual";
      const now = nowLocal();
      const row = {
        ...(existing ? { ROWID: rowId(existing) } : {}),
        appraisal_cycle_id: cycleId,
        employee_master_id: masterId,
        emp_id: empId,
        eligibility_status: eligible,
        eligibility_reason: String(record.reason || record.eligibility_reason || "").trim().slice(0, 50),
        eligibility_source: source,
        change_tag: existing ? "Changed" : "New",
        evaluated_at: now,
        updated_by: String(actor || "Unknown user").slice(0, 60),
        eligibility_updated_at: now,
      };
      const item = { index, empId, master, row, existing };
      if (existing) updates.push(item);
      else inserts.push(item);
    } catch (error) {
      results[index] = { empId, ok: false, reason: error?.message || "Eligibility save failed." };
    }
  });

  const writeBatches = async (items, mode) => {
    // Eligibility updates are cycle-critical. Write each row individually so
    // a partially accepted Data Store batch cannot silently leave some rows
    // Pending while the UI believes the entire batch succeeded.
    for (const item of items) {
      try {
        const stored = mode === "update"
          ? await tables.eligibility.updateRow(item.row)
          : await tables.eligibility.insertRow(item.row);
        results[item.index] = {
          empId: item.empId,
          ok: true,
          data: shapeEligibilityRow({ ...item.row, ...(stored || {}) }, item.master),
        };
      } catch (error) {
        results[item.index] = {
          empId: item.empId,
          ok: false,
          reason: error?.message || "Eligibility save failed.",
        };
      }
    }
  };

  await writeBatches(inserts, "insert");
  await writeBatches(updates, "update");
  const rows = results.map((row, index) =>
    row || { empId: String(records[index]?.empId || records[index]?.emp_id || ""), ok: false, reason: "Eligibility record was not processed." },
  );
  const saved = rows.filter((row) => row.ok).length;
  return { cycleId, saved, failed: rows.length - saved, total: rows.length, rows };
}

function toCatalystDate(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return "";

  // Catalyst Date columns expect YYYY-MM-DD, not an empty string or timestamp.
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/);
  if (iso) return iso[1];

  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function normalizePersonKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Returns a function that turns any reference to an employee - Employee_Master
// ROWID, "EMP002 - Ashok Kumar", "EMP002", or a name / email - into their
// Employee ID ("EMP002"), or "" when it matches no one. A name or email only
// counts when exactly one employee has it, so an ambiguous name never picks
// the wrong person. The lookups are built once for a whole Generate run.
function employeeIdResolver(masterRows) {
  const byRowId = new Map();
  const byEmpId = new Map();
  const byOther = new Map();
  masterRows.forEach((row) => {
    const empId = String(row.emp_id || "").trim();
    if (!empId) return;
    const rowIdValue = String(row.ROWID || row.rowid || "");
    if (rowIdValue) byRowId.set(rowIdValue, empId);
    const idKey = normalizePersonKey(empId);
    if (!byEmpId.has(idKey)) byEmpId.set(idKey, empId);
    new Set([row.name, row.emp_name, row.full_name, row.email_id, row.email]
      .map(normalizePersonKey).filter(Boolean)).forEach((key) => {
      byOther.set(key, byOther.has(key) && byOther.get(key) !== empId ? null : empId);
    });
  });
  return (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    return byRowId.get(raw) ||
      byEmpId.get(normalizePersonKey(raw.split(/\s+-\s+/)[0])) ||
      byOther.get(normalizePersonKey(raw)) ||
      "";
  };
}

// STRICT version of employeeIdResolver, used for the Comp Manager. A person
// counts only when they really exist in Employee_Master:
//   - an Employee_Master ROWID or an Employee ID ("EMP002") that exists;
//   - "EMP002 - Ashok Kumar": the ID must exist AND the name must be the same
//     as that employee's name in Employee_Master (otherwise it is not them);
//   - a bare name / email that belongs to exactly one employee.
// Anything else returns "" (not assigned). Nothing is ever kept as free text.
function strictEmployeeIdResolver(masterRows) {
  const nameKey = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const byRowId = new Map();
  const byEmpId = new Map();
  const nameOfId = new Map();
  const byOther = new Map();
  masterRows.forEach((row) => {
    const empId = String(row.emp_id || "").trim();
    if (!empId) return;
    const rowIdValue = String(row.ROWID || row.rowid || "");
    if (rowIdValue) byRowId.set(rowIdValue, empId);
    const idKey = normalizePersonKey(empId);
    if (!byEmpId.has(idKey)) {
      byEmpId.set(idKey, empId);
      nameOfId.set(idKey, nameKey(row.emp_name || row.name || row.full_name));
    }
    new Set([row.name, row.emp_name, row.full_name, row.email_id, row.email]
      .map(nameKey).filter(Boolean)).forEach((key) => {
      byOther.set(key, byOther.has(key) && byOther.get(key) !== empId ? null : empId);
    });
  });
  return (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (byRowId.has(raw)) return byRowId.get(raw);
    const pair = raw.match(/^\s*(.+?)\s+-\s+(.+?)\s*$/);
    if (pair) {
      const idKey = normalizePersonKey(pair[1]);
      const id = byEmpId.get(idKey);
      const masterName = nameOfId.get(idKey);
      return id && masterName && nameKey(pair[2]) === masterName ? id : "";
    }
    return byEmpId.get(normalizePersonKey(raw)) || byOther.get(nameKey(raw)) || "";
  };
}

function resolveEmployeeReference(value, masterRows) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const exactRowId = masterRows.find((row) => String(row.ROWID || row.rowid || "") === raw);
  if (exactRowId) return String(exactRowId.ROWID || exactRowId.rowid);

  const key = normalizePersonKey(raw);
  // Delegation values are "EMP002 - Ashok Kumar": match the employee ID part.
  const empIdKey = normalizePersonKey(raw.split(/\s+-\s+/)[0]);
  const byEmpId = masterRows.find((row) => normalizePersonKey(row.emp_id) === empIdKey);
  if (byEmpId) return String(byEmpId.ROWID || byEmpId.rowid || "");
  const matched = masterRows.find((row) => {
    const candidates = [
      row.emp_id, row.employee_id, row.name, row.emp_name, row.full_name,
      row.email_id, row.email, row.appraiser_tech_ed,
    ];
    return candidates.some((candidate) => normalizePersonKey(candidate) === key);
  });
  return matched ? String(matched.ROWID || matched.rowid || "") : "";
}

/* ---------- Archive: Appraisal Sheet -> Payroll Data ----------
   Archiving a cycle moves its final Appraisal Sheet values into that cycle's
   Payroll_Data row per employee (upsert on employee + cycle), keeps a full
   copy of every sheet row in Appraisal_Audit (source "sheet_archive"), then
   removes the cycle's Appraisal_Sheet rows. The next cycle reads its previous
   values (PB / RB to be paid, target PB, previous CTC) from this payroll row.
   Nothing is removed unless every row was written to Payroll_Data first. */
const SHEET_ARCHIVE_SOURCE = "sheet_archive";
// ---- Hike % <-> Hike Amount (same rule as src/lib/hike-math.js) ----
function roundHikePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return (Math.sign(n) * Math.round(Number((Math.abs(n) * 100).toFixed(6)))) / 100;
}
function hikePctFromAmount(base, amount) {
  const b = Number(base) || 0;
  return b ? roundHikePct(((Number(amount) || 0) / b) * 100) : 0;
}
// Typed Hike %: amount = base x % / 100, rounded to the nearest 100 (half rounds up).
function hikeAmountFromPct(base, pct) {
  const hundreds = Number((((Number(base) || 0) * (Number(pct) || 0)) / 100 / 100).toFixed(8));
  return Math.round(hundreds) * 100;
}

const SHEET_ARCHIVE_MARK = "Appraisal Sheet moved to Payroll Data";

function sheetNumber(row, column) {
  const raw = row[column];
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const value = Number(String(raw).replace(/[₹,%\s]/g, ""));
  return Number.isFinite(value) ? value : null;
}

// Appraisal_Sheet columns -> Payroll_Data columns for one employee.
function payrollValuesFromSheet(row) {
  const base = sheetNumber(row, "current_annual_base_pay");
  const hikeAmount = sheetNumber(row, "hike_amount");
  const hikePct = sheetNumber(row, "hike_pct");
  const pb = sheetNumber(row, "allocated_pb_amount");
  const rb = sheetNumber(row, "new_rb");
  const joining = sheetNumber(row, "joining_bonus");
  const targetNext = sheetNumber(row, "target_pb_next_year");
  const criteria = String(row.target_PB_criteria ?? row.target_pb_criteria ?? "").trim();
  const values = {};
  if (base !== null) values.current_annual_base_pay = base;
  if (hikeAmount !== null) values.hike_amount = Math.round(hikeAmount);
  if (hikePct !== null) values.hike_pct = hikePct;
  const newBase = base !== null ? base + (hikeAmount || 0) : null;
  if (newBase !== null) values.new_base_pay = newBase;
  // PB / RB decided in this cycle are what the next cycle shows as "to be paid".
  if (pb !== null) {
    values.performance_bonus = Math.round(pb);
    values.pb_to_be_paid = pb;
  }
  if (rb !== null) {
    values.retention_bonus = Math.round(rb);
    values.rb_to_be_paid = rb;
  }
  if (joining !== null) values.joining_bonus = Math.round(joining);
  if (pb !== null || rb !== null || joining !== null) {
    values.total_bonus = Math.round((pb || 0) + (rb || 0) + (joining || 0));
  }
  if (newBase !== null) values.total_CTC_with_rewards = newBase + (pb || 0) + (rb || 0);
  if (targetNext !== null) values.target_performance_bonus_for_next_year = targetNext;
  if (criteria) values.target_pb_criteria = criteria.slice(0, 100);
  const name = String(row.name || "").trim();
  if (name) values.emp_name = name.slice(0, 100);
  return values;
}

// Copies a cycle's Delegation (Comp Manager / Appraiser Tech ED per employee)
// into Previous_Delegation, where the next cycle's Delegation screen reads its
// Previous columns. Upsert on employee + cycle, so archiving again or an
// earlier Historical Import never duplicates rows. Delegation is kept.
async function copyDelegationToHistory(tables, cycle, actor) {
  const ref = (value) => String(
    value && typeof value === "object" ? (value.ROWID ?? value.rowid ?? value.id ?? "") : (value ?? ""),
  ).trim();
  const cycleId = String(cycle.id);
  const [delegationRows, historyRows] = await Promise.all([
    getAllRows(tables.delegation),
    getAllRows(tables.previousDelegation),
  ]);
  // Newest Delegation row per employee wins when duplicates exist.
  const latest = new Map();
  delegationRows
    .filter((row) => ref(row.cycle_id) === cycleId && ref(row.emp_id))
    .sort((a, b) => String(a.MODIFIEDTIME || "").localeCompare(String(b.MODIFIEDTIME || "")))
    .forEach((row) => latest.set(ref(row.emp_id), row));
  if (!latest.size) return { copied: 0, inserted: 0, updated: 0 };

  const historyByMaster = new Map();
  historyRows
    .filter((row) => ref(row.cycle_id) === cycleId)
    .forEach((row) => historyByMaster.set(ref(row.emp_id), row));
  const now = nowLocal();
  const inserts = [];
  const updates = [];
  latest.forEach((row, masterId) => {
    const values = {
      cycle_id: cycleId,
      emp_id: masterId,
      comp_manager: String(row.comp_manager || "").trim().slice(0, 100),
      appraiser_tech_ed: String(row.appraiser_tech_ed || "").trim().slice(0, 100),
      updated_by: String(actor || "").slice(0, 100),
      updated_at: now,
    };
    const existing = historyByMaster.get(masterId);
    if (existing) updates.push({ ROWID: rowId(existing), ...values });
    else inserts.push(values);
  });
  for (let index = 0; index < updates.length; index += 100) {
    await tables.previousDelegation.updateRows(updates.slice(index, index + 100));
  }
  for (let index = 0; index < inserts.length; index += 100) {
    await tables.previousDelegation.insertRows(inserts.slice(index, index + 100));
  }
  return { copied: latest.size, inserted: inserts.length, updated: updates.length };
}

// beforeWrite (optional) runs once the sheet has passed its checks and
// before anything is written, so a failed check still changes nothing.
async function moveSheetToPayroll(tables, cycle, actor, beforeWrite = null) {
  const ref = (value) => String(
    value && typeof value === "object" ? (value.ROWID ?? value.rowid ?? value.id ?? "") : (value ?? ""),
  ).trim();
  const [sheetRows, payrollRows, masterRows] = await Promise.all([
    getAllRows(tables.employees),
    getAllRows(tables.payroll),
    getAllRows(tables.employeeMaster),
  ]);
  const cycleRows = sheetRows.filter((row) => ref(row.cycle_id) === String(cycle.id));
  if (!cycleRows.length) return { moved: 0, inserted: 0, updated: 0, removed: 0 };

  const masterIdByEmpId = new Map(masterRows.map((row) => [String(row.emp_id || "").trim().toLowerCase(), rowId(row)]));
  const payrollByMaster = new Map();
  payrollRows
    .filter((row) => ref(row.appraisal_cycle_name) === String(cycle.id))
    .forEach((row) => payrollByMaster.set(ref(row.emp_id), row));

  const missing = [];
  const inserts = [];
  const updates = [];
  const seen = new Set();
  for (const row of cycleRows) {
    const masterId = ref(row.emp_master_row_id) || masterIdByEmpId.get(String(row.emp_id || "").trim().toLowerCase()) || "";
    if (!masterId) {
      missing.push(String(row.emp_id || rowId(row)));
      continue;
    }
    // Duplicate sheet rows for one employee: the first one written wins.
    if (seen.has(masterId)) continue;
    seen.add(masterId);
    const values = { ...payrollValuesFromSheet(row), emp_id: masterId, appraisal_cycle_name: String(cycle.id) };
    const existing = payrollByMaster.get(masterId);
    if (existing) updates.push({ ROWID: rowId(existing), ...values });
    else inserts.push(values);
  }
  if (missing.length) {
    throw new ApiError(
      `Cannot archive ${cycle.name}: ${missing.length} Appraisal Sheet row(s) have no Employee Master record (${missing.slice(0, 10).join(", ")}). Nothing was changed.`,
      409,
    );
  }
  if (beforeWrite) await beforeWrite();

  // 1. Full copy of every sheet row, so nothing on the sheet is lost.
  const now = nowLocal();
  const snapshots = cycleRows.map((row) => ({
    emp_id: String(row.emp_id || "").slice(0, 10),
    employee_name: String(row.name || "").slice(0, 30),
    field_name: "Sheet archived",
    old_value: "",
    new_value: "",
    changed_by: String(actor || "").slice(0, 50),
    changed_at: now,
    source: SHEET_ARCHIVE_SOURCE,
    batch_id: String(cycle.id),
    appraisal_year: String(cycle.name || "").slice(0, 30),
    details: JSON.stringify({ kind: "sheet-archive", cycleId: cycle.id, cycleName: cycle.name, row }).slice(0, 10000),
  }));
  for (let index = 0; index < snapshots.length; index += 100) {
    await tables.audit.insertRows(snapshots.slice(index, index + 100));
  }

  // 2. Final values into Payroll_Data (upsert on employee + cycle).
  for (let index = 0; index < updates.length; index += 100) {
    await tables.payroll.updateRows(updates.slice(index, index + 100));
  }
  for (let index = 0; index < inserts.length; index += 100) {
    await tables.payroll.insertRows(inserts.slice(index, index + 100));
  }

  // 3. Remove the cycle's rows from the Appraisal Sheet.
  const ids = cycleRows.map(rowId).filter(Boolean);
  for (let index = 0; index < ids.length; index += 100) {
    await tables.employees.deleteRows(ids.slice(index, index + 100));
  }
  return { moved: cycleRows.length, inserted: inserts.length, updated: updates.length, removed: ids.length };
}

// Compare a value already stored on a sheet row with the value generation
// would write, ignoring type/format noise (number vs text, date vs date-time).
function sameSheetValue(stored, next) {
  const a = stored === undefined || stored === null ? "" : String(stored).trim();
  const b = next === undefined || next === null ? "" : String(next).trim();
  if (a === b) return true;
  if (a !== "" && b !== "" && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Number(a) === Number(b);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(a) && /^\d{4}-\d{2}-\d{2}/.test(b)) {
    return a.slice(0, 10) === b.slice(0, 10);
  }
  return false;
}

async function generateAppraisalSheet(tables, cycle, actor, writeDeadline = 0, options = {}) {
  if (!cycle?.id) throw new ApiError("Select an appraisal cycle before generating the sheet.", 400);
  if (String(cycle.status || "").trim().toLowerCase() !== "active" || cycle.archived || cycle.hidden) {
    throw new ApiError("Generate the Appraisal Sheet only for the Active appraisal cycle.", 409);
  }

  const eligibilityResult = await getEligibilityRows(tables, cycle, actor);
  const cycleEligibilityRows = eligibilityResult.records;
  // Only employees whose decision is still Pending should block generation.
  // Explicit Not Eligible decisions are valid and are intentionally excluded
  // from the generated sheet; legacy eligible_status/eligibility aliases are
  // normalized by eligibilityStatusOf() as well.
  const pendingRows = cycleEligibilityRows.filter(
    (row) => eligibilityStatusOf(row) === "Pending",
  );
  if (pendingRows.length) {
    const pendingIds = pendingRows
      .map((row) => String(row.empId || row.emp_id || "").trim())
      .filter(Boolean);
    const sample = pendingIds.length
      ? ` Pending employee IDs: ${pendingIds.slice(0, 20).join(", ")}${pendingIds.length > 20 ? ", ..." : ""}.`
      : "";
    throw new ApiError(
      `Apply eligibility criteria for this cycle before generating the Appraisal Sheet. ${pendingRows.length} active employee(s) still need evaluation.${sample}`,
      409,
    );
  }
  const eligibleRows = cycleEligibilityRows.filter(
    (row) => eligibilityStatusOf(row) === "Eligible",
  );
  if (!eligibleRows.length) {
    throw new ApiError("No eligible active employees were found for this cycle. Check the Eligibility List and criteria.", 409);
  }
  // Eligibility sync already loaded the complete Employee_Master roster.
  // The route also loaded the cycle master to resolve this cycle. Reuse both
  // snapshots instead of scanning those large tables a second time.
  const employeeMasterRows = Array.isArray(eligibilityResult.masterRecords)
    ? eligibilityResult.masterRecords
    : await getAllRows(tables.employeeMaster);
  const allCycles = Array.isArray(options.allCycles)
    ? options.allCycles
    : (await getAllRows(tables.cycles)).map(normalizeCycle);
  const [sheetRows, payrollRows, feedbackRows, delegationRows] = await Promise.all([
    getAllRows(tables.employees),
    getAllRows(tables.payroll),
    getAllRows(tables.feedback),
    getAllRows(tables.delegation),
  ]);
  const cycleKeys = new Set(
    [cycle.id, cycle.name]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const referenceText = (value) => {
    if (value && typeof value === "object") {
      return String(
        value.ROWID ?? value.rowid ?? value.id ?? value.ID ?? value.value ??
        value.emp_id ?? value.employee_id ?? value.cycle_name ?? value.appraisal_cycle_name ?? "",
      ).trim();
    }
    return String(value ?? "").trim();
  };
  // Catalyst field names can preserve Excel header casing (emp_ID,
  // CostCenter_Client). Match aliases case-insensitively.
  const fieldValue = (row, ...names) => {
    const keys = Object.keys(row || {});
    for (const name of names) {
      const actual = keys.find((key) => key.toLowerCase() === String(name).toLowerCase());
      if (actual !== undefined && row[actual] !== null && row[actual] !== undefined) {
        return row[actual];
      }
    }
    return undefined;
  };
  const payrollByMasterId = new Map();
  const payrollBaseSourceByMasterId = new Map();
  const normalizedCycles = allCycles;
  const cycleByReference = new Map();
  normalizedCycles.forEach((item) => {
    if (item.id) cycleByReference.set(item.id.toLowerCase(), item);
    if (item.name) cycleByReference.set(item.name.toLowerCase(), item);
  });
  const cycleYear = (item) => {
    const match = String(item?.name || "").match(/(?:19|20)\d{2}/);
    return match ? match[0] : "";
  };
  const isNewJoinerCycle = (item) => /new[\s_-]*joiners?/i.test(String(item?.name || ""));
  const isAnnualCycle = (item) => /\bannual\b/i.test(String(item?.name || ""));
  const isClosedCycle = (item) =>
    String(item?.status || "").toLowerCase() === "closed" || Boolean(item?.archived);
  const cycleOrder = (item) => {
    const date = String(item?.effective || item?.end || item?.start || "");
    const year = Number(cycleYear(item)) || 0;
    return [year, date];
  };
  const isBeforeCurrentCycle = (item) => {
    const [itemYear, itemDate] = cycleOrder(item);
    const [currentYear, currentDate] = cycleOrder(cycle);
    return itemYear < currentYear || (itemYear === currentYear && itemDate && currentDate && itemDate < currentDate);
  };
  const currentYear = cycleYear(cycle);
  const reuseExistingCycleData = options.reuseExistingCycleData === true;
  const canonicalCycleName = cycleNameWithoutLocation(cycle.name).trim().toLowerCase();
  const sourceCycle = cycleLocationKey(cycle)
    ? normalizedCycles.find((item) =>
        String(item.id) !== String(cycle.id) &&
        !cycleLocationKey(item) &&
        cycleNameWithoutLocation(item.name).trim().toLowerCase() === canonicalCycleName &&
        cycleYear(item) === currentYear &&
        cycleTypeOf(item.name) === cycleTypeOf(cycle.name)
      ) || null
    : null;
  const sourceCycleKeys = new Set(
    sourceCycle
      ? [sourceCycle.id, sourceCycle.sourceRowId, sourceCycle.name].map((value) => referenceText(value).toLowerCase()).filter(Boolean)
      : [],
  );
  const payrollRowsWithCycle = payrollRows.map((row) => {
    const rawCycle = referenceText(
      row.appraisal_cycle_name ?? row.appraisal_cycle_id ?? row.cycle_id ?? row.appraisal_year,
    );
    return { row, rawCycle, cycle: cycleByReference.get(rawCycle.toLowerCase()) || null };
  });

  // Do not generate a partial appraisal sheet. The required source uploads
  // must belong to this exact cycle; rows from another cycle cannot satisfy
  // the prerequisite just because they exist in the same Data Store tables.
  const currentCyclePayrollRows = payrollRowsWithCycle.filter(
    ({ cycle: rowCycle }) => rowCycle && (
      String(rowCycle.id) === String(cycle.id) ||
      (reuseExistingCycleData && sourceCycle && String(rowCycle.id) === String(sourceCycle.id))
    ),
  );
  const sourceHasPayroll = Boolean(sourceCycle && payrollRowsWithCycle.some(
    ({ cycle: rowCycle }) => rowCycle && String(rowCycle.id) === String(sourceCycle.id),
  ));
  if (!currentCyclePayrollRows.length) {
    if (!reuseExistingCycleData && sourceHasPayroll) {
      throw new ApiError(
        `Payroll data already exists for ${sourceCycle.name}. Confirm to reuse those existing records for ${cycle.name}; no payroll rows will be copied or inserted.`,
        409,
        "EXISTING_CYCLE_DATA_AVAILABLE",
      );
    }
    throw new ApiError(
      `Payroll data has not been uploaded for ${cycle.name}. Upload payroll data for this cycle before generating the Appraisal Sheet.`,
      409,
    );
  }

  const currentCycleFeedbackRows = feedbackRows.filter((row) => {
    const feedbackCycle = referenceText(
      fieldValue(row, "appraisal_cycle_name", "appraisal_cycle_id", "cycle_id", "cycle_name", "appraisal_year"),
    ).toLowerCase();
    const acceptedCycleKeys = [cycle.id, cycle.sourceRowId, cycle.name]
      .map((value) => referenceText(value).toLowerCase()).filter(Boolean);
    if (reuseExistingCycleData) acceptedCycleKeys.push(...sourceCycleKeys);
    return acceptedCycleKeys.includes(feedbackCycle);
  });
  const hasFeedback = currentCycleFeedbackRows.some((row) =>
    ["manager_feedback", "client_manager_feedback", "client_feedback"].some((field) => {
      const value = fieldValue(row, field);
      return value !== undefined && value !== null && String(value).trim() !== "";
    }),
  );
  const hasRating = currentCycleFeedbackRows.some((row) =>
    ["manager_rating", "client_rating"].some((field) => {
      const value = fieldValue(row, field);
      return value !== undefined && value !== null && String(value).trim() !== "";
    }),
  );
  if (!currentCycleFeedbackRows.length || !hasFeedback || !hasRating) {
    const sourceFeedbackRows = sourceCycle ? feedbackRows.filter((row) =>
      sourceCycleKeys.has(referenceText(fieldValue(row, "appraisal_cycle_name", "appraisal_cycle_id", "cycle_id", "cycle_name", "appraisal_year")).toLowerCase())
    ) : [];
    const sourceHasFeedback = sourceFeedbackRows.some((row) =>
      ["manager_feedback", "client_manager_feedback", "client_feedback"].some((field) => {
        const value = fieldValue(row, field);
        return value !== undefined && value !== null && String(value).trim() !== "";
      })
    );
    const sourceHasRating = sourceFeedbackRows.some((row) =>
      ["manager_rating", "client_rating"].some((field) => {
        const value = fieldValue(row, field);
        return value !== undefined && value !== null && String(value).trim() !== "";
      })
    );
    if (!reuseExistingCycleData && sourceCycle && sourceHasPayroll && sourceFeedbackRows.length && sourceHasFeedback && sourceHasRating) {
      throw new ApiError(
        `Existing payroll, feedback and rating data were found for ${sourceCycle.name}. Confirm to reuse them for ${cycle.name}; no duplicate rows will be created.`,
        409,
        "EXISTING_CYCLE_DATA_AVAILABLE",
      );
    }
    const missing = [
      !currentCycleFeedbackRows.length ? "Feedback and Rating upload" : "",
      !hasFeedback ? "feedback values" : "",
      !hasRating ? "rating values" : "",
    ].filter(Boolean).join(" and ");
    throw new ApiError(
      `${missing} is required for ${cycle.name}. Upload the cycle's Feedback and Rating data before generating the Appraisal Sheet.`,
      409,
    );
  }
  payrollRowsWithCycle.forEach(({ row, rawCycle }) => {
    const masterId = referenceText(row.emp_id ?? row.employee_master_id);
    if (masterId && (cycleKeys.has(rawCycle.toLowerCase()) || (reuseExistingCycleData && sourceCycleKeys.has(rawCycle.toLowerCase())))) {
      payrollByMasterId.set(masterId, row);
    }
  });
  // Current Annual Base Pay must come from the selected prior cycle's NEW
  // base pay, not the current cycle's current_annual_base_pay/base_pay.
  // A same-year closed New Joiner payroll row takes priority per employee;
  // all other employees use their latest closed Annual payroll row.
  const masterIdToEmpId = new Map(
    employeeMasterRows.map((row) => [
      referenceText(row.ROWID ?? row.rowid ?? row.id),
      String(fieldValue(row, "emp_id", "employee_id", "emp_code") || "").trim().toLowerCase(),
    ]).filter(([id]) => id),
  );
  // Resolve payroll references in O(1). Repeated Array.find() calls here
  // made generation quadratic for large payroll and Employee_Master tables.
  const employeeMasterByBusinessId = new Map(
    employeeMasterRows.map((row) => [
      String(fieldValue(row, "emp_id", "employee_id", "emp_code") || "").trim().toLowerCase(),
      row,
    ]).filter(([id]) => id),
  );
  const basePayrollCandidatesByEmployee = new Map();
  payrollRowsWithCycle.forEach(({ row, cycle: sourceCycle }) => {
    if (!sourceCycle || !isClosedCycle(sourceCycle)) return;
    const sourceYear = cycleYear(sourceCycle);
    const masterId = referenceText(row.emp_id ?? row.employee_master_id);
    const directMaster = employeeMasterByBusinessId.get(masterId.toLowerCase());
    const empId = masterIdToEmpId.get(masterId) ||
      String(fieldValue(directMaster || {}, "emp_id", "employee_id", "emp_code") || "").trim().toLowerCase() ||
      String(fieldValue(row, "employee_code", "emp_code") || "").trim().toLowerCase();
    if (!empId) return;
    const sameYearNewJoiner = isNewJoinerCycle(sourceCycle) && sourceYear && sourceYear === currentYear;
    const priorAnnual = isAnnualCycle(sourceCycle) && isBeforeCurrentCycle(sourceCycle);
    if (!sameYearNewJoiner && !priorAnnual) return;
    const candidate = { row, cycle: sourceCycle, sameYearNewJoiner, rowTime: String(row.MODIFIEDTIME || row.CREATEDTIME || row.ROWID || "") };
    const list = basePayrollCandidatesByEmployee.get(empId) || [];
    list.push(candidate);
    basePayrollCandidatesByEmployee.set(empId, list);
  });
  basePayrollCandidatesByEmployee.forEach((candidates, empId) => {
    const compareNewest = (a, b) => {
      const ay = Number(cycleYear(a.cycle)) || 0;
      const by = Number(cycleYear(b.cycle)) || 0;
      const ad = String(a.cycle.effective || a.cycle.end || a.cycle.start || "");
      const bd = String(b.cycle.effective || b.cycle.end || b.cycle.start || "");
      return by - ay || bd.localeCompare(ad) || b.rowTime.localeCompare(a.rowTime, undefined, { numeric: true });
    };
    const sameYearNewJoiner = candidates.filter((item) => item.sameYearNewJoiner).sort(compareNewest)[0];
    const latestAnnual = candidates.filter((item) => isAnnualCycle(item.cycle) && isBeforeCurrentCycle(item.cycle)).sort(compareNewest)[0];
    const selected = sameYearNewJoiner || latestAnnual;
    if (!selected) return;
    const sourceMasterId = referenceText(selected.row.emp_id ?? selected.row.employee_master_id);
    if (sourceMasterId) payrollBaseSourceByMasterId.set(sourceMasterId, selected.row);
    // Also index by actual Employee_Master ROWID when payroll emp_id stores
    // the business employee ID instead of a lookup reference.
    const master = employeeMasterByBusinessId.get(empId);
    const actualMasterId = referenceText(master?.ROWID ?? master?.rowid ?? master?.id);
    if (actualMasterId) payrollBaseSourceByMasterId.set(actualMasterId, selected.row);
  });

  // Feedback_And_Rating stores emp_ID and appraisal_cycle_name as Employee_Master
  // and Appraisal_Cycle_Master ROWIDs. Resolve both keys so generation reads only
  // the feedback uploaded for this exact cycle, not a previous/closed cycle.
  const feedbackByMasterId = new Map();
  const feedbackByEmpId = new Map();
  const employeeMasterById = new Map(
    employeeMasterRows.map((row) => [
      referenceText(row.ROWID ?? row.rowid ?? row.id),
      row,
    ]).filter(([id]) => id),
  );
  const employeeMasterByEmpId = new Map(
    employeeMasterRows.map((row) => [
      String(fieldValue(row, "emp_id", "employee_id", "emp_code") || "").trim().toLowerCase(),
      row,
    ]).filter(([id]) => id),
  );
  const feedbackCycleKeys = new Set(
    [cycle.id, cycle.sourceRowId, cycle.name, ...(reuseExistingCycleData ? [...sourceCycleKeys] : [])]
      .map((value) => referenceText(value).toLowerCase())
      .filter(Boolean),
  );
  const feedbackRowTime = (row) => String(
    fieldValue(row, "MODIFIEDTIME", "CREATEDTIME", "ROWID") || "",
  );
  feedbackRows.forEach((row) => {
    const rawEmployee = referenceText(fieldValue(
      row, "emp_ID", "emp_id", "employee_master_id", "employee_master_row_id", "employee_id", "emp_code",
    ));
    const feedbackCycle = referenceText(fieldValue(
      row, "appraisal_cycle_name", "appraisal_cycle_id", "cycle_id", "cycle_name", "appraisal_year",
    )).toLowerCase();
    if (!rawEmployee || !feedbackCycleKeys.has(feedbackCycle)) return;

    // emp_ID is a lookup to Employee_Master.ROWID in current uploads, but
    // older records may contain the employee's business ID instead.
    const master = employeeMasterById.get(rawEmployee) ||
      employeeMasterByEmpId.get(rawEmployee.toLowerCase());
    const masterId = master
      ? referenceText(master.ROWID ?? master.rowid ?? master.id)
      : rawEmployee;
    const empId = master
      ? String(fieldValue(master, "emp_id", "employee_id", "emp_code") || "").trim().toLowerCase()
      : rawEmployee.toLowerCase();

    const previousMaster = feedbackByMasterId.get(masterId);
    if (!previousMaster ||
        feedbackRowTime(row).localeCompare(feedbackRowTime(previousMaster), undefined, { numeric: true }) >= 0) {
      feedbackByMasterId.set(masterId, row);
    }
    const previousEmp = feedbackByEmpId.get(empId);
    if (empId && (!previousEmp ||
        feedbackRowTime(row).localeCompare(feedbackRowTime(previousEmp), undefined, { numeric: true }) >= 0)) {
      feedbackByEmpId.set(empId, row);
    }
  });
  // Saved Delegation values are applied only inside this explicit generation flow.
  const delegationByEmployee = new Map();
  delegationRows
    .filter((row) => String(row.cycle_id || "") === String(cycle.id))
    .forEach((row) => {
      const key = String(row.emp_id || "").trim();
      if (key) delegationByEmployee.set(key, row);
    });

  const byKey = new Map();
  sheetRows.forEach((row) => {
    const rowCycle = String(row.cycle_id || "");
    const rowMaster = String(row.emp_master_row_id || "");
    const rowEmpId = String(row.emp_id || "").trim().toLowerCase();
    if (rowCycle === String(cycle.id)) {
      if (rowMaster) byKey.set(`master:${rowMaster}`, row);
      if (rowEmpId) byKey.set(`emp:${rowEmpId}`, row);
    }
  });

  // Appraisal_Sheet schemas can differ between deployed Catalyst projects.
  // Resolve real columns once and never send optional payroll fields that do
  // not exist in this table (for example performance_bonus or
  // total_reward_hike_pct). Core fields remain explicit below.
  let appraisalSheetColumns = null;
  let appraisalSheetColumnByLower = null;
  try {
    const actualColumns = await tables.employees.getAllColumns();
    appraisalSheetColumns = new Set(
      (actualColumns || []).map((column) => String(column.column_name || "").trim()).filter(Boolean),
    );
    appraisalSheetColumnByLower = new Map(
      [...appraisalSheetColumns].map((name) => [name.toLowerCase(), name]),
    );
  } catch (error) {
    console.warn("Could not inspect Appraisal_Sheet columns; using standard generation mapping:", error?.message || error);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const sheetInserts = [];
  const sheetUpdates = [];
  const compManagerEmployeeId = strictEmployeeIdResolver(employeeMasterRows);
  // Employees whose Comp Manager ended up blank (reported back to Delegation).
  const compManagerMissing = [];
  // Did this cycle already have an Appraisal Sheet before this run?
  const alreadyGenerated = sheetRows.some((row) => String(row.cycle_id || "") === String(cycle.id));
  const eligibleMasterIds = new Set(
    eligibleRows.map((employee) => String(employee.employeeMasterRowId || "")).filter(Boolean),
  );
  const eligibleEmpIds = new Set(
    eligibleRows.map((employee) => String(employee.empId || "").trim().toLowerCase()).filter(Boolean),
  );

  for (const employee of eligibleRows) {
    const masterId = String(employee.employeeMasterRowId || "");
    const empId = String(employee.empId || "").trim();
    const existing = byKey.get(`master:${masterId}`) || byKey.get(`emp:${empId.toLowerCase()}`);
    const savedDelegation = delegationByEmployee.get(masterId) || delegationByEmployee.get(empId);
    const delegatedAppraiser = String(savedDelegation?.appraiser_tech_ed || "").trim();
    const delegatedCompManager = String(savedDelegation?.comp_manager || "").trim();
    const payload = {
      ...(existing ? { ROWID: rowId(existing) } : {}),
      emp_id: empId,
      name: String(employee.name || ""),
      designation: String(employee.designation || ""),
      department: String(employee.department || ""),
      emp_master_row_id: masterId,
      cycle_id: String(cycle.id),
      status: "Active",
      eligible_status: "Eligible",
    };

    // Feedback_And_Rating is the source of the three client columns. Refresh
    // them from the current cycle's uploaded data whenever the sheet is generated.
    const feedback = feedbackByMasterId.get(masterId) ||
      feedbackByEmpId.get(empId.toLowerCase());
    if (feedback) {
      const feedbackFieldMap = [
        {
          destinationAliases: ["manager_rating", "managerRating"],
          sourceAliases: ["manager_rating", "managerRating"],
        },
        {
          destinationAliases: ["rr_percent", "rr", "revenue_released"],
          sourceAliases: ["rr_percent", "revenue_released", "rr"],
        },
        {
          destinationAliases: ["gross_margin", "grossMargin"],
          sourceAliases: ["gross_margin", "grossMargin"],
        },
        {
          destinationAliases: ["CostCenter_Client", "cost_center_client", "costcenter_client"],
          sourceAliases: ["CostCenter_Client", "cost_center_client", "costcenter_client"],
        },
        {
          destinationAliases: ["client_manager_feedback", "clientManagerFeedback"],
          sourceAliases: ["client_manager_feedback", "clientManagerFeedback"],
        },
        {
          destinationAliases: ["client_rating", "clientRating"],
          sourceAliases: ["client_rating", "clientRating"],
        },
      ];
      feedbackFieldMap.forEach(({ destinationAliases, sourceAliases }) => {
        const destination = appraisalSheetColumnByLower
          ? destinationAliases.map((name) => appraisalSheetColumnByLower.get(name.toLowerCase())).find(Boolean)
          : destinationAliases[0];
        if (appraisalSheetColumns && !destination) return;
        const value = sourceAliases
          .map((name) => fieldValue(feedback, name))
          .find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim() !== "");
        if (value !== undefined) payload[destination || destinationAliases[0]] = value;
      });

      // Feedback table versions differ: RR may be stored as revenue_released,
      // while YoE ratio is calculated from Employee_Master if no uploaded
      // yoe_ratio column exists in the feedback table.
      const yoeDestination = appraisalSheetColumnByLower
        ? ["yoe_ratio", "yoeRatio"].map((name) => appraisalSheetColumnByLower.get(name.toLowerCase())).find(Boolean)
        : "yoe_ratio";
      if (yoeDestination && (!appraisalSheetColumns || appraisalSheetColumns.has(yoeDestination))) {
        const uploadedYoE = fieldValue(feedback, "yoe_ratio", "yoeRatio");
        const basePay = Number(fieldValue(employeeMasterById.get(masterId), "current_annual_base_pay", "base_pay", "current_salary")) || 0;
        const experience = Number(fieldValue(employeeMasterById.get(masterId), "total_experience", "total_exp", "experience")) || 0;
        const yoe = uploadedYoE !== undefined
          ? uploadedYoE
          : basePay > 0 && experience > 0
            ? Math.round((basePay / 100000 / experience) * 100) / 100
            : undefined;
        if (yoe !== undefined && yoe !== null && String(yoe).trim() !== "") payload[yoeDestination] = yoe;
      }
    }

    // Payroll_Data is the source for payroll-derived appraisal fields. Only
    // copy non-empty values and only these source-owned columns: a rerun must
    // not reset editable appraisal inputs already saved on Appraisal_Sheet.
    const payroll = payrollByMasterId.get(masterId);
    const previousPayrollBaseSource = payrollBaseSourceByMasterId.get(masterId) ||
      payrollBaseSourceByMasterId.get(String(employee.empId || "").trim());
    const previousNewBasePay = previousPayrollBaseSource
      ? fieldValue(previousPayrollBaseSource, "new_base_pay", "newBasePay")
      : undefined;
    if (previousNewBasePay !== undefined && previousNewBasePay !== null && String(previousNewBasePay).trim() !== "" &&
        (!appraisalSheetColumns || appraisalSheetColumns.has("current_annual_base_pay"))) {
      // This source-owned field must override stale values on an existing sheet
      // row as well as seed a new row.
      payload.current_annual_base_pay = previousNewBasePay;
    }
    if (payroll) {
      const payrollFieldMap = {
        current_annual_base_pay: ["current_annual_base_pay", "base_pay"],
        joining_bonus: ["joining_bonus"],
        performance_bonus: ["performance_bonus"],
        retention_bonus: ["retention_bonus"],
        hike_pct: ["hike_pct"],
        hike_amount: ["hike_amount"],
        total_ctc_with_rewards: ["total_CTC_with_rewards", "total_ctc_with_rewards", "total_ctc"],
        total_rewards_hike_amount: ["total_rewards_hike_amount"],
        total_bonus: ["total_bonus"],
        new_base_pay: ["new_base_pay"],
        target_pb_allocated_for_may: ["target_performance_bonus_for_next_year", "target_performance_bonus_next_year"],
        target_pb_criteria: ["target_pb_criteria", "target_performance_bonus_criteria"],
      };
      Object.entries(payrollFieldMap).forEach(([sheetField, payrollFields]) => {
        // The destination column must exist in the live Appraisal_Sheet schema.
        // Missing optional columns are skipped; they must not fail generation.
        if (appraisalSheetColumns && !appraisalSheetColumns.has(sheetField)) return;
        const value = payrollFields
          .map((field) => payroll[field])
          .find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim() !== "");
        if (value === undefined) return;
        // Current Annual Base Pay is governed by the selected prior-cycle
        // new_base_pay above. Do not let current-cycle payroll overwrite it.
        if (sheetField === "current_annual_base_pay") return;
        // Other existing Appraisal Sheet inputs remain authoritative after generation.
        const existingValue = existing?.[sheetField];
        if (
          !existing ||
          existingValue === undefined ||
          existingValue === null ||
          String(existingValue).trim() === ""
        ) {
          payload[sheetField] = value;
        }
      });
    }

    const joiningDate = toCatalystDate(
      employee.joining_date || employee.date_of_join || employee.date_of_joining || employee.doj,
    );
    // Don't send "" to Catalyst Date columns; it rejects empty strings as invalid dates.
    // Omitting an absent/invalid optional date also preserves the existing value on updates.
    if (joiningDate && (!appraisalSheetColumns || appraisalSheetColumns.has("joining_date"))) {
      payload.joining_date = joiningDate;
    }
    // Appraisal_Sheet.appraiser_tech_ed is a bigint lookup/reference, not a display name.
    // Resolve imported names/employee IDs to the matching Employee_Master ROWID.
    const appraiserReference = resolveEmployeeReference(
      delegatedAppraiser || employee.appraiser_tech_ed,
      employeeMasterRows,
    );
    if (
      appraiserReference &&
      /^\d+$/.test(appraiserReference) &&
      (!appraisalSheetColumns || appraisalSheetColumns.has("appraiser_tech_ed"))
    ) {
      payload.appraiser_tech_ed = appraiserReference;
    }
    // Appraisal_Sheet.comp_manager is text holding the Employee ID ("EMP001").
    // It is only ever a person who exists in Employee_Master with a matching
    // name; anything else is left blank (never kept as free text).
    // Order: the Delegation assignment, then what the sheet already holds,
    // then the usual defaults (Employee Master / previous cycle), and finally
    // the Appraiser Tech-ED of this sheet row. If none of them is a real
    // employee the Comp Manager stays blank and Delegation asks for one.
    const previousPayrollCompManager = previousPayrollBaseSource
      ? String(fieldValue(
          previousPayrollBaseSource,
          "Comp_Manager", "comp_manager", "comp_manager_name", "compManager",
          "compensation_manager",
        ) ?? "").trim()
      : "";
    const storedCompManager = String(existing?.comp_manager || "").trim();
    const delegatedId = compManagerEmployeeId(delegatedCompManager);
    const storedId = compManagerEmployeeId(storedCompManager);
    const defaultId =
      compManagerEmployeeId(String(employee.comp_manager ?? "").trim()) ||
      compManagerEmployeeId(previousPayrollCompManager) ||
      compManagerEmployeeId(appraiserReference) ||
      compManagerEmployeeId(delegatedAppraiser) ||
      compManagerEmployeeId(String(employee.appraiser_tech_ed ?? "").trim());
    const finalCompManager = delegatedId || storedId || defaultId || "";
    if (!appraisalSheetColumns || appraisalSheetColumns.has("comp_manager")) {
      // Write when it differs (this also blanks an old free-text value).
      if (finalCompManager !== storedCompManager && (finalCompManager || storedCompManager)) {
        payload.comp_manager = finalCompManager.slice(0, 30);
      }
    }
    if (!finalCompManager) compManagerMissing.push(empId);
    if (existing) {
      // Only touch rows where something differs from what is already stored.
      const differs = Object.keys(payload).some(
        (key) => key !== "ROWID" && !sameSheetValue(existing[key], payload[key]),
      );
      if (differs) {
        sheetUpdates.push(payload);
      } else {
        unchanged += 1;
      }
    } else {
      sheetInserts.push(payload);
    }
  }

  // Written 100 rows per call (one call per employee took ~80 ms each, so a
  // 2,000-employee sheet ran past Catalyst's request limit and the browser's
  // automatic resend generated it again). Rows left at writeDeadline are
  // reported as remaining; the next Generate adds them, as a rerun only writes
  // what is missing or different.
  let remaining = 0;
  for (const [list, kind] of [[sheetUpdates, "update"], [sheetInserts, "insert"]]) {
    const outcomes = await writeRowsInBatches(tables.employees, list, kind, writeDeadline);
    outcomes.forEach((outcome) => {
      if (outcome.ok) {
        if (kind === "insert") created += 1; else updated += 1;
      } else if (outcome.skipped) {
        remaining += 1;
      } else {
        throw outcome.error;
      }
    });
  }

  // Appraisal_Sheet must be an exact projection of this cycle's
  // Eligibility_List. Remove stale rows when an employee is no longer
  // present as Eligible, without touching rows from other cycles.
  const eligibleSheetRowsToRemove = sheetRows.filter((row) => {
    if (String(row.cycle_id || "") !== String(cycle.id)) return false;
    const rowMasterId = String(row.emp_master_row_id || "").trim();
    const rowEmpId = String(row.emp_id || "").trim().toLowerCase();
    const isStillEligible = (rowMasterId && eligibleMasterIds.has(rowMasterId)) ||
      (rowEmpId && eligibleEmpIds.has(rowEmpId));
    return !isStillEligible;
  });
  const staleSheetRowIds = eligibleSheetRowsToRemove.map((row) => rowId(row)).filter(Boolean);
  for (let index = 0; index < staleSheetRowIds.length; index += 100) {
    await tables.employees.deleteRows(staleSheetRowIds.slice(index, index + 100));
  }

  const upToDate = created === 0 && updated === 0 && staleSheetRowIds.length === 0 && remaining === 0;
  // A run that changed nothing is not worth an audit entry.
  if (!upToDate || !alreadyGenerated) {
    await writeAudit(tables.audit, {
      actor,
      source: "cycle",
      cycle,
      action: alreadyGenerated ? "Appraisal Sheet updated" : "Appraisal Sheet generated",
      details: {
        kind: "cycle",
        action: alreadyGenerated ? "Appraisal Sheet updated" : "Appraisal Sheet generated",
        message: `Added ${created} new and updated ${updated} existing Appraisal Sheet rows from Eligibility List (${unchanged} already up to date).`,
        cycleName: cycle.name,
        created,
        updated,
        unchanged,
        removedStaleRows: staleSheetRowIds.length,
        eligible: eligibleRows.length,
        ...(remaining ? { remaining } : {}),
      },
    });
  }
  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    created,
    updated,
    unchanged,
    removedStaleRows: staleSheetRowIds.length,
    eligible: eligibleRows.length,
    // Employees left without a Comp Manager (not set, or not found in
    // Employee Master). Delegation shows an alert asking HR to set them.
    compManagerMissing: compManagerMissing.length,
    compManagerMissingIds: compManagerMissing.slice(0, 50),
    alreadyGenerated,
    upToDate: alreadyGenerated && upToDate,
    // Rows not written before the time limit: Generate again to add them.
    remaining,
    partial: remaining > 0,
  };
}

function mapPayroll(row, cycleByName, cycleById, employeeById = new Map()) {
  const cycleKey = String(row.appraisal_cycle_name || "").trim();
  // Legacy payroll rows may store either the cycle name or Appraisal_Cycle_Master ROWID.
  // Resolve by name first, then by ROWID, and normalize the displayed value back to the cycle name.
  const cycle = cycleByName.get(cycleKey.toLowerCase()) || cycleById.get(cycleKey);
  const employee = employeeById.get(String(row.emp_id || "").trim().toLowerCase());
  const businessEmpId = employee?.emp_id ?? "";
  const employeeName = employee?.emp_name || employee?.name || "";
  const num = (key) => row[key] === undefined || row[key] === null || row[key] === "" ? 0 : Number(row[key]) || 0;
  const text = (key) => row[key] === undefined || row[key] === null ? "" : String(row[key]);
  return {
    ...row, id: rowId(row),
    // Payroll stores the Employee Master ROWID as the foreign key. Expose
    // the human/business Employee ID to the UI instead of the internal ROWID.
    emp_id: businessEmpId || text("emp_id"),
    emp_name: employeeName || text("emp_name"),
    appraisal_cycle_name: cycle?.name || text("appraisal_cycle_name"),
    empId: businessEmpId || text("emp_id"), empName: employeeName || text("emp_name"),
    appraisalCycleName: cycle?.name || text("appraisal_cycle_name"),
    effectiveDate: cycle?.effective || "",
    fyYear: text("fy_year"),
    basePay: num("current_annual_base_pay"), joiningBonus: num("joining_bonus"),
    performanceBonus: num("performance_bonus"), retentionBonus: num("retention_bonus"),
    hikePct: num("hike_pct"), hikeAmt: num("hike_amount"),
    totalCtcRewards: num("total_CTC_with_rewards"), totalRewardHikeAmt: num("total_rewards_hike_amount"),
    totalRewardHikePct: num("total_reward_hike_pct"),
    totalBonus: num("total_bonus"), newBasePay: num("new_base_pay"), rbPaid: num("rb_to_be_paid"),
    rbMonth: text("month_rb"), pbPaid: num("pb_to_be_paid"), pbMonth: text("month_pb"),
    tbPaid: num("tb_to_be_paid"), tbMonth: text("month_tb"), cycleId: cycle?.id || "", createdTime: text("CREATEDTIME"),
    targetPbNextYear: num("target_performance_bonus_for_next_year"), targetPbCriteria: text("target_pb_criteria"),
  };
}

async function validateUpload(tables, body) {
  const selectedCycleId = String(body.cycleId || "").trim();
  const sourceBatch = String(body.batchId || "").trim();
  const sourceFile = String(body.fileName || "");
  const records = body.records;
  if (!selectedCycleId) throw new ApiError("An appraisal cycle is required.");
  if (!sourceBatch || sourceBatch.length > 80) throw new ApiError("A valid upload batch ID is required.");
  if (!Array.isArray(records) || records.length === 0 || records.length > MAX_UPLOAD_ROWS) {
    throw new ApiError(`Upload must contain between 1 and ${MAX_UPLOAD_ROWS} rows.`);
  }
  if (sourceFile.length > 255) throw new ApiError("The file name exceeds 255 characters.");

  const [cycleRows, masterRows, payrollRows] = await Promise.all([
    getAllRows(tables.cycles),
    getAllRows(tables.employeeMaster),
    getAllRows(tables.payroll),
  ]);
  const cycles = cycleRows.map(normalizeCycle);
  const selectedCycle = cycles.find((item) => item.id === selectedCycleId);
  if (!selectedCycle) throw new ApiError("The selected appraisal cycle no longer exists.", 404);

  const cycleById = new Map(cycles.map((item) => [item.id, item]));
  const cycleByName = new Map(cycles.map((item) => [item.name.toLowerCase(), item]));
  const masterByEmpId = new Map();
  masterRows.forEach((row) => {
    const key = String(row.emp_id || "").trim().toLowerCase();
    if (key) masterByEmpId.set(key, row);
  });

  const existingByKey = new Map();
  const masterRowIdByEmpId = new Map(
    masterRows
      .map((row) => [
        String(row.emp_id || "").trim().toLowerCase(),
        String(row.ROWID ?? row.rowid ?? "").trim(),
      ])
      .filter(([empId, rowIdValue]) => empId && rowIdValue),
  );
  const employeeKey = (value) => {
    const raw = String(value ?? "").trim().toLowerCase();
    return masterRowIdByEmpId.get(raw) || raw;
  };
  payrollRows.forEach((row) => {
    const key = `${employeeKey(row.emp_id)}|${String(row.appraisal_cycle_name || "")}`;
    existingByKey.set(key, row);
  });

  const seen = new Set();
  const validated = records.map((record, index) => {
    const input = record && typeof record === "object" && !Array.isArray(record) ? record : {};
    const rowNumber = Number(input.row) || index + 2;
    const empId = String(input.empId || "").trim();
    const requestedCycle = String(input.appraisalCycleName || "").trim();
    const rowCycle = requestedCycle
      ? (cycleById.get(requestedCycle) || cycleByName.get(requestedCycle.toLowerCase()) || null)
      : selectedCycle;
    const errors = [];

    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push("Row data must be an object.");
    }
    if (!empId) {
      errors.push("Employee ID is required.");
    } else if (!masterByEmpId.has(empId.toLowerCase())) {
      errors.push("Employee ID not found in Employee Master.");
    }
    if (requestedCycle && !rowCycle) {
      errors.push(`Appraisal Cycle Name "${requestedCycle}" was not found. Create this cycle before uploading payroll.`);
    }

    const master = masterByEmpId.get(empId.toLowerCase());
    const masterRowId = String(master?.ROWID ?? master?.rowid ?? "").trim();
    const key = `${masterRowId || empId.toLowerCase()}|${rowCycle?.id || ""}`;
    if (seen.has(key)) errors.push("Duplicate Employee ID within this file for the same appraisal cycle.");
    seen.add(key);

    let payrollRow;
    try {
      if (!rowCycle) throw new ApiError("A valid appraisal cycle is required.");
      payrollRow = toPayrollRow(
        input,
        rowCycle,
        master,
        sourceBatch,
        sourceFile,
      );
    } catch (error) {
      errors.push(error.message);
    }

    return {
      row: rowNumber,
      ok: errors.length === 0,
      reason: errors.join(" "),
      badFields: errors.length
        ? Array.from(new Set(errors.flatMap((message) => {
            if (message.startsWith("Employee ID") || message.startsWith("Duplicate Employee ID")) return ["empId"];
            if (message.startsWith("Appraisal Cycle Name")) return ["appraisalCycleName"];
            return Object.keys(PAYROLL_FIELDS).filter((field) =>
              message.startsWith(`${field} `) || message.startsWith(`${field} exceeds`),
            );
          })))
        : [],
      payrollRow,
      operation: existingByKey.has(key) ? "update" : "insert",
      cycleId: rowCycle?.id || "",
      cycleName: rowCycle?.name || "",
    };
  });
  // The rows read here are passed on so commit doesn't read them again.
  return { cycle: selectedCycle, rows: validated, masterRows, payrollRows };
}
async function getImportColumnSet(table) {
  const result = await table.getPagedRows({ maxRows: 1 });
  const row = Array.isArray(result?.data) && result.data.length ? result.data[0] : {};
  return new Set(Object.keys(row).filter((name) => !SCHEMA_SYSTEM_COLUMNS.has(String(name).toUpperCase())));
}

const IMPORT_FIELD_MAP = {
  fb: {
    empId: "emp_ID",
    empName: "emp_name",
    designation: "designation",
    lastAppraisal: "last_appraisal_date",
    revenueReleased: "revenue_released",
    rrPercent: "revenue_released", // the screen's RR% is stored in revenue_released
    grossMargin: "gross_margin",
    managerFeedback: "manager_feedback",
    managerRating: "manager_rating",
    clientManager: "client_manager_feedback",
    clientFeedback: "client_feedback",
    clientRating: "client_rating",
    interviewCount: "interview_count",
    atRisk: "at_risk",
    department: "Department",
    band: "Band",
    effectiveDate: "Effective_Date",
    costCenterClient: "CostCenter_Client",
    clientManagerName: "Client_Manager",
    compManagerName: "Comp_Manager",
    techEd: "Tech_ED",
    promo: "eligible_for_promotion",
    newTitle: "new_title",
    remarks: "remarks",
    fyYear: "fy_year",
    appraisalCycleName: "appraisal_cycle_name",
  },
  sheet: {
    empId: "emp_id",
    newRB: "retention_bonus",
    rbMonth: "rb_month",
    newPB: "performance_bonus",
    pbMonth: "pb_month",
    newPBInst: "performance_bonus_installment",
    hikeAmt: "hike_amount",
    hikePct: "hike_pct",
    tpbNext: "target_performance_bonus",
    promo: "promotion",
    newTitle: "title",
    remarks: "remarks",
    criteria: "target_pb_criteria",
  },
};

const IMPORT_NUMERIC_FIELDS = new Set([
  "rrPercent", "revenueReleased", "grossMargin", "managerRating", "interviewCount",
  "newRB", "newPB", "newPBInst", "hikeAmt", "hikePct", "tpbNext",
]);

function normalizeImportValue(key, value) {
  if (value === undefined || value === null || value === "") return "";
  if (IMPORT_NUMERIC_FIELDS.has(key)) {
    const number = Number(String(value).replace(/,/g, "").replace(/[%$]/g, "").trim());
    if (!Number.isFinite(number) || number < 0) {
      throw new ApiError(key + " must be a non-negative number.");
    }
    return number;
  }
  return String(value).trim();
}

// options.onlyEmpIds (lower-case Employee IDs): refresh only these employees'
// sheet rows - the ones an upload changed - instead of every row of the cycle.
// options.deadline: stop writing then; the rest is refreshed by the next
// upload or Generate.
async function syncFeedbackToAppraisalSheet(tables, cycle, actor = "", uploadedValuesByEmpId = new Map(), options = {}) {
  if (!cycle?.id) return { updated: 0, matched: 0, skipped: 0 };

  const [feedbackRows, masterRows, sheetRows, sheetColumnsRaw] = await Promise.all([
    getAllRows(tables.feedback),
    getAllRows(tables.employeeMaster),
    getAllRows(tables.employees),
    tables.employees.getAllColumns(),
  ]);
  const sheetColumns = new Map(
    (sheetColumnsRaw || [])
      .map((column) => String(column.column_name || "").trim())
      .filter(Boolean)
      .map((name) => [name.toLowerCase(), name]),
  );
  const valueOf = (row, ...aliases) => {
    if (!row) return undefined;
    const keys = Object.keys(row);
    for (const alias of aliases) {
      const actual = keys.find((key) => key.toLowerCase() === String(alias).toLowerCase());
      if (actual !== undefined && row[actual] !== null && row[actual] !== undefined && String(row[actual]).trim() !== "") {
        return row[actual];
      }
    }
    return undefined;
  };
  // Catalyst lookup columns can arrive as objects instead of plain ROWID
  // strings. Unwrap them before matching employee and cycle records; String(obj)
  // becomes "[object Object]" and silently prevents all three fields syncing.
  const referenceText = (value) => {
    if (value && typeof value === "object") {
      return String(
        value.ROWID ?? value.rowid ?? value.id ?? value.ID ?? value.value ??
        value.emp_id ?? value.employee_id ?? value.cycle_name ?? value.appraisal_cycle_name ?? "",
      ).trim();
    }
    return String(value ?? "").trim();
  };
  const idOf = (row) => referenceText(row?.ROWID ?? row?.rowid ?? row?.id ?? row?.ID ?? "");
  const cycleIds = new Set(
    [cycle.id, cycle.sourceRowId, cycle.name]
      .map((value) => referenceText(value).toLowerCase())
      .filter(Boolean),
  );
  const masterByRowId = new Map(masterRows.map((row) => [idOf(row), row]).filter(([id]) => id));
  const masterByEmpId = new Map(
    masterRows.map((row) => [String(valueOf(row, "emp_id", "employee_id", "emp_code") || "").trim().toLowerCase(), row])
      .filter(([id]) => id),
  );
  const feedbackByMasterId = new Map();
  const feedbackByEmpId = new Map();
  const feedbackTime = (row) => String(valueOf(row, "MODIFIEDTIME", "CREATEDTIME", "ROWID") || "");
  feedbackRows.forEach((row) => {
    const feedbackCycleId = referenceText(
      valueOf(row, "appraisal_cycle_name", "appraisal_cycle_id", "cycle_id", "cycle_name", "appraisal_year"),
    );
    if (!cycleIds.has(feedbackCycleId.toLowerCase())) return;
    const rawEmployee = referenceText(
      valueOf(row, "emp_ID", "emp_id", "employee_master_row_id", "employee_id", "emp_code"),
    );
    if (!rawEmployee) return;
    const master = masterByRowId.get(rawEmployee) || masterByEmpId.get(rawEmployee.toLowerCase());
    const masterId = master ? idOf(master) : rawEmployee;
    const empId = String(valueOf(master, "emp_id", "employee_id", "emp_code") || rawEmployee).trim().toLowerCase();
    const previousMaster = feedbackByMasterId.get(masterId);
    if (!previousMaster || feedbackTime(row).localeCompare(feedbackTime(previousMaster), undefined, { numeric: true }) >= 0) {
      feedbackByMasterId.set(masterId, row);
    }
    const previousEmp = feedbackByEmpId.get(empId);
    if (empId && (!previousEmp || feedbackTime(row).localeCompare(feedbackTime(previousEmp), undefined, { numeric: true }) >= 0)) {
      feedbackByEmpId.set(empId, row);
    }
  });

  const sourceMappings = [
    { destination: ["manager_rating"], source: ["manager_rating"] },
    { destination: ["rr_percent", "rr", "revenue_released"], source: ["rr_percent", "revenue_released", "rr"] },
    { destination: ["gross_margin"], source: ["gross_margin"] },
    { destination: ["yoe_ratio"], source: ["yoe_ratio"] },
    { destination: ["CostCenter_Client", "cost_center_client", "costcenter_client"], source: ["CostCenter_Client", "cost_center_client", "costcenter_client"] },
    { destination: ["client_manager_feedback", "clientManagerFeedback"], source: ["client_manager_feedback", "clientManagerFeedback"] },
    { destination: ["client_rating", "clientRating"], source: ["client_rating", "clientRating"] },
  ];
  let updated = 0;
  let matched = 0;
  let skipped = 0;
  const pendingUpdates = [];
  for (const sheetRow of sheetRows) {
    const sheetCycleId = referenceText(valueOf(sheetRow, "cycle_id", "appraisal_cycle_id", "appraisal_cycle_name"));
    if (!cycleIds.has(sheetCycleId.toLowerCase())) continue;
    const masterId = referenceText(valueOf(sheetRow, "emp_master_row_id", "employee_master_id"));
    const empId = referenceText(valueOf(sheetRow, "emp_id", "employee_id")).toLowerCase();
    if (options.onlyEmpIds && !options.onlyEmpIds.has(empId)) continue;
    const master = masterByRowId.get(masterId) || masterByEmpId.get(empId);
    const resolvedMasterId = master ? idOf(master) : masterId;
    const feedback = feedbackByMasterId.get(resolvedMasterId) || feedbackByEmpId.get(empId);
    if (!feedback) continue;
    matched += 1;
    const uploaded = uploadedValuesByEmpId.get(empId) || {};
    const payload = { ROWID: idOf(sheetRow) };
    for (const mapping of sourceMappings) {
      const destination = mapping.destination
        .map((name) => sheetColumns.get(name.toLowerCase()))
        .find(Boolean);
      if (!destination) continue;
      let value;
      if (mapping.destination.some((name) => ["rr_percent", "rr"].includes(name.toLowerCase())) &&
          uploaded.rrPercent !== undefined && uploaded.rrPercent !== null && String(uploaded.rrPercent).trim() !== "") {
        value = uploaded.rrPercent;
      } else if (mapping.destination.some((name) => name.toLowerCase() === "yoe_ratio") &&
          uploaded.yoeRatio !== undefined && uploaded.yoeRatio !== null && String(uploaded.yoeRatio).trim() !== "") {
        value = uploaded.yoeRatio;
      } else {
        value = mapping.source
          .map((name) => valueOf(feedback, name))
          .find((candidate) => candidate !== undefined);
      }
      if (value === undefined && mapping.destination.some((name) => name.toLowerCase() === "yoe_ratio")) {
        const basePay = Number(valueOf(master, "current_annual_base_pay", "base_pay", "current_salary")) || 0;
        const experience = Number(valueOf(master, "total_experience", "total_exp", "experience")) || 0;
        if (basePay > 0 && experience > 0) value = Math.round((basePay / 100000 / experience) * 100) / 100;
      }
      // A value already stored is not written again: a feedback upload used
      // to rewrite every sheet row of the cycle, one call per row.
      if (value !== undefined && value !== null && String(value).trim() !== "" &&
          !sameSheetValue(sheetRow[destination], value)) payload[destination] = value;
    }
    if (Object.keys(payload).length === 1) {
      skipped += 1;
      continue;
    }
    pendingUpdates.push(payload);
  }
  const outcomes = await writeRowsInBatches(tables.employees, pendingUpdates, "update", options.deadline);
  const notRefreshed = outcomes.filter((outcome) => outcome.skipped).length;
  outcomes.forEach((outcome) => {
    if (outcome.ok) updated += 1;
    else if (!outcome.skipped) console.error("Appraisal Sheet feedback refresh failed:", outcome.error?.message || outcome.error);
  });

  if (updated > 0) {
    await writeAudit(tables.audit, {
      actor: actor || "System",
      source: "feedback_upload",
      cycle,
      action: "Appraisal Sheet feedback refreshed",
      details: {
        kind: "upload",
        action: "Appraisal Sheet feedback refreshed",
        message: `Refreshed feedback/rating fields for ${updated} existing Appraisal Sheet row(s).`,
        cycleId: cycle.id,
        cycleName: cycle.name,
        updated,
        matched,
        skipped,
      },
    });
  }
  return { updated, matched, skipped, ...(notRefreshed ? { notRefreshed } : {}) };
}

async function importRows(tables, body, actor = "", writeDeadline = 0) {
  const screen = String(body.screen || "").trim().toLowerCase();
  if (!["fb", "sheet"].includes(screen)) throw new ApiError("Unsupported upload type.");
  let cycleId = String(body.cycleId || "").trim();
  const cycleRows = await getAllRows(tables.cycles);
  const normalizedCycles = cycleRows.map(normalizeCycle);
  let cycle = cycleId
    ? normalizedCycles.find((item) => item.id === cycleId)
    : null;

  // Feedback uploads may carry the cycle name from the CSV instead of the
  // selected ROWID. Resolve that name to the Appraisal Cycle ROWID.
  if (screen === "fb" && !cycle) {
    const requestedCycleName = String(
      body.appraisalCycleName || body.cycleName || cycleId || ""
    ).trim().toLowerCase();
    if (requestedCycleName) {
      cycle = normalizedCycles.find(
        (item) =>
          String(item.name || "").trim().toLowerCase() === requestedCycleName ||
          String(item.id || "").trim().toLowerCase() === requestedCycleName
      ) || null;
      if (cycle) cycleId = cycle.id;
    }
  }
  if (screen === "sheet" && !cycle) {
    throw new ApiError("The selected appraisal cycle no longer exists.", 404);
  }
  if (cycle?.archived) throw new ApiError("The selected cycle is archived.", 409);
  if (
    ["fb", "sheet"].includes(screen) &&
    (!cycle || String(cycle.status || "").trim().toLowerCase() !== "active")
  ) {
    throw new ApiError(
      screen === "fb"
        ? "Feedback & Rating uploads are allowed only for the Active appraisal cycle."
        : "Appraisal Sheet uploads are allowed only for the Active appraisal cycle.",
      409,
    );
  }

  const targetTable = screen === "fb" ? tables.feedback : tables.payroll;
  // Read the real schema even when Feedback_And_Rating is empty. This table
  // uses mixed-case names such as Department and CostCenter_Client.
  const columns = screen === "fb"
    ? await (async () => {
        try {
          const actual = await targetTable.getAllColumns();
          const names = (actual || []).map((column) => String(column.column_name || "").trim()).filter(Boolean);
          if (names.length) return new Set(names);
        } catch (error) {
          console.warn("Could not inspect Feedback_And_Rating columns:", error?.message || error);
        }
        return new Set([
          "emp_ID", "emp_name", "designation", "last_appraisal_date",
          "revenue_released", "gross_margin", "manager_feedback", "manager_rating",
          "client_manager_feedback", "client_feedback", "client_rating", "interview_count",
          "at_risk", "eligible_for_promotion", "new_title", "remarks", "fy_year",
          "appraisal_cycle_name", "Department", "Band", "Effective_Date",
          "CostCenter_Client", "Client_Manager", "Comp_Manager", "Tech_ED", "Upload_Batch",
        ]);
      })()
    : await getImportColumnSet(targetTable);
  const columnByLower = new Map([...columns].map((name) => [String(name).toLowerCase(), name]));
  const fieldMap = IMPORT_FIELD_MAP[screen];
  const records = Array.isArray(body.records) ? body.records : [];
  if (!records.length || records.length > MAX_UPLOAD_ROWS) throw new ApiError("Upload must contain between 1 and " + MAX_UPLOAD_ROWS + " rows.");

  const employeeRows = await getAllRows(tables.employeeMaster);
  const employeeIds = new Set(employeeRows.map((row) => String(row.emp_id || "").trim().toLowerCase()).filter(Boolean));
  const existingRows = await getAllRows(targetTable);
  const storedReference = (value) => {
    if (value && typeof value === "object") {
      return String(value.ROWID ?? value.rowid ?? value.id ?? value.ID ?? value.value ?? "").trim();
    }
    return String(value ?? "").trim();
  };
  // Looked up once per row below; each map keeps the first match, as the
  // per-row searches over the whole table did.
  const masterByEmpId = new Map();
  employeeRows.forEach((row) => {
    const key = String(row.emp_id || "").trim().toLowerCase();
    if (!masterByEmpId.has(key)) masterByEmpId.set(key, row);
  });
  const feedbackByKey = new Map();
  if (screen === "fb") {
    existingRows.forEach((row) => {
      const key = storedReference(row.emp_ID ?? row.emp_id ?? "") + "|" + storedReference(row.appraisal_cycle_name);
      if (!feedbackByKey.has(key)) feedbackByKey.set(key, row);
    });
  }
  // One Feedback row per employee and cycle: a second row for the same pair in
  // one upload used to be inserted as a duplicate.
  const seenInUpload = new Set();

  let succeeded = 0;
  let failed = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let firstEffective = "";
  const rows = [];
  const pendingWrites = [];

  for (const input of records) {
    const rowNumber = Number(input?.row) || rows.length + 2;
    const empId = String(input?.empId || "").trim();
    const errors = [];
    if (!empId) errors.push("Employee ID is required.");
    else if (!employeeIds.has(empId.toLowerCase())) errors.push("Employee ID not found in Employee Master.");

    // Feedback files can contain historical records for different cycles in
    // the same upload. Resolve the cycle from each row's business name/ID,
    // rather than trusting the selected UI cycle ROWID.
    const requestedRowCycle = String(input?.appraisalCycleName || "").trim();
    const rowCycle = screen === "fb"
      ? (normalizedCycles.find((item) =>
          String(item.id || "").trim() === requestedRowCycle ||
          String(item.name || "").trim().toLowerCase() === requestedRowCycle.toLowerCase()
        ) || cycle)
      : cycle;

    const payload = {};
    const master = screen === "fb" ? masterByEmpId.get(empId.toLowerCase()) : null;
    if (screen === "fb" && !master) errors.push("Employee ID not found in Employee Master.");
    if (!errors.length) {
      for (const [key, column] of Object.entries(fieldMap)) {
        if (input[key] === undefined) continue;
        const actualColumn = columnByLower.get(String(column).toLowerCase()) ||
          (key === "rrPercent" ? columnByLower.get("rr_percent") || columnByLower.get("revenue_released") : null);
        if (!actualColumn) {
          // YoE ratio is calculated from Employee_Master in deployments where
          // Feedback_And_Rating has no yoe_ratio column. Keep the uploaded
          // value in the sync payload for Appraisal_Sheet, but don't reject
          // an otherwise valid feedback row for this optional derived field.
          if (screen === "fb" && ["yoeRatio", "rrPercent"].includes(key)) continue;
          if (key !== "empId") errors.push("Database column " + column + " is not available for this upload.");
          continue;
        }
        try {
          // Excel serial dates are not valid Catalyst date values. Skip an
          // invalid last-appraisal value instead of rejecting the whole row.
          if (
            screen === "fb" &&
            (key === "lastAppraisal" || key === "effectiveDate") &&
            (
              typeof input[key] === "number" ||
              !/^\d{4}-\d{2}-\d{2}$/.test(String(input[key]).trim())
            )
          ) {
            continue;
          }
          payload[actualColumn] = normalizeImportValue(key, input[key]);
        } catch (error) {
          errors.push(error.message);
        }
      }
      if (screen === "fb") {
        // Feedback foreign-key columns require native Catalyst ROWID values.
        // Do not stringify the BIGINT ROWIDs before insert/update.
        const masterRowId = master?.ROWID ?? master?.rowid ?? "";
        if (!masterRowId) {
          errors.push("Employee Master ROWID is missing for " + empId + ".");
        }
        if (columns.has("emp_ID")) payload.emp_ID = masterRowId;
        if (columns.has("emp_name")) payload.emp_name = masterRowId;
        // designation is a plain text column: keep the uploaded text, else use the master's.
        if (columns.has("designation") && !payload.designation && master?.designation) payload.designation = String(master.designation);
        if (columns.has("Upload_Batch")) payload.Upload_Batch = String(body.batchId || "").slice(0, 80);
        if (!rowCycle) {
          errors.push(
            requestedRowCycle
              ? `Appraisal Cycle Name "${requestedRowCycle}" was not found.`
              : "Appraisal Cycle is required for Feedback & Rating upload."
          );
        } else if (columns.has("appraisal_cycle_name")) {
          const cycleRowId = rowCycle.sourceRowId ?? rowCycle.id ?? "";
          if (!cycleRowId) {
            errors.push("A valid Appraisal Cycle ROWID is required for Feedback & Rating upload.");
          } else {
            payload.appraisal_cycle_name = cycleRowId;
          }
        }
      } else if (columns.has("emp_id")) payload.emp_id = empId;
      if (screen === "sheet") {
        if (columns.has("appraisal_year")) payload.appraisal_year = cycle.name;
        if (columns.has("appraisal_cycle_name")) payload.appraisal_cycle_name = cycle.id;
        if (columns.has("total_pb")) payload.total_pb = (Number(payload.performance_bonus) || 0) + (Number(input.allocatedPBAmount) || 0);
        if (columns.has("total_bonus")) payload.total_bonus = (Number(payload.total_pb) || 0) + (Number(payload.retention_bonus) || 0);
        if (columns.has("hike_pct") && columns.has("hike_amount") && (payload.hike_amount !== undefined || payload.hike_pct !== undefined)) {
          // Hike % <-> Hike Amount: only the field that was supplied drives the other.
          //  - amount supplied (alone, or with a %): the amount is kept exactly;
          //    the % is worked out from it, rounded to 2 decimals.
          //  - only a % supplied: the % is rounded to 2 decimals and the amount is
          //    base x % / 100 rounded to the nearest 100 (half rounds up).
          // The amount is never rebuilt from a stored or rounded %.
          const master = employeeRows.find((row) => String(row.emp_id || "").trim().toLowerCase() === empId.toLowerCase());
          const base = Number(master?.current_salary || master?.base_pay || 0);
          const hasAmount = payload.hike_amount !== undefined && payload.hike_amount !== "";
          if (hasAmount) {
            payload.hike_pct = base > 0 ? hikePctFromAmount(base, payload.hike_amount) : Number(payload.hike_pct || 0);
          } else if (payload.hike_pct !== undefined && payload.hike_pct !== "" && base > 0) {
            payload.hike_pct = roundHikePct(payload.hike_pct);
            payload.hike_amount = hikeAmountFromPct(base, payload.hike_pct);
          }
        }
        if (columns.has("new_ctc") && (payload.hike_amount !== undefined || payload.total_bonus !== undefined)) {
          const master = employeeRows.find((row) => String(row.emp_id || "").trim().toLowerCase() === empId.toLowerCase());
          const base = Number(master?.current_salary || master?.base_pay || 0);
          payload.new_ctc = base + (Number(payload.hike_amount) || 0) + (Number(payload.total_bonus) || 0);
        }
      }
    }

    if (errors.length) {
      failed += 1;
      rows.push({ row: rowNumber, ok: false, reason: errors.join(" "), badFields: [] });
      continue;
    }

    let existing;
    if (screen === "fb") {
      const targetCycleId = String(rowCycle?.id || rowCycle?.sourceRowId || cycleId || "").trim();
      const key = String(master ? rowId(master) : "").trim() + "|" + targetCycleId;
      if (seenInUpload.has(key)) {
        failed += 1;
        rows.push({ row: rowNumber, ok: false, reason: "Duplicate Employee ID within this file for the same appraisal cycle.", badFields: ["empId"] });
        continue;
      }
      seenInUpload.add(key);
      existing = feedbackByKey.get(key);
    } else {
      existing = existingRows.find((row) => {
        const storedEmpKey = storedReference(row.emp_ID ?? row.emp_id ?? "");
        if (storedEmpKey.toLowerCase() !== empId.toLowerCase()) return false;
        if (screen !== "sheet") return true;
        return !columns.has("appraisal_year") || String(row.appraisal_year || "").trim() === cycle.name;
      });
    }

    const entry = { row: rowNumber, ok: false, reason: "", badFields: [] };
    rows.push(entry);
    pendingWrites.push({
      entry, empId, payload,
      kind: existing ? "update" : "insert",
      data: existing ? { ROWID: rowId(existing), ...payload } : payload,
    });
  }

  for (const kind of ["update", "insert"]) {
    const list = pendingWrites.filter((write) => write.kind === kind);
    const outcomes = await writeRowsInBatches(targetTable, list.map((write) => write.data), kind, writeDeadline);
    outcomes.forEach((outcome, index) => {
      const { entry, empId, payload } = list[index];
      if (outcome.ok) {
        entry.ok = true;
        succeeded += 1;
        if (kind === "insert") insertedCount += 1; else updatedCount += 1;
        if (!firstEffective && payload.Effective_Date) firstEffective = String(payload.Effective_Date);
        return;
      }
      failed += 1;
      entry.reason = outcome.skipped
        ? NOT_SAVED_TIME_LIMIT
        : outcome.error?.message || "Feedback & Rating row could not be saved.";
      if (!outcome.skipped) console.error("Import row failed:", { screen, row: entry.row, empId, reason: entry.reason });
    });
  }

  let appraisalSheetSync = null;
  if (screen === "fb" && succeeded > 0 && cycle) {
    try {
      // Uploading feedback after sheet generation must update the already
      // generated rows immediately; generation is not required to be repeated.
      const uploadedValuesByEmpId = new Map();
      const successfulUploadRows = new Set(
        rows.filter((row) => row.ok).map((row) => Number(row.row)),
      );
      for (const input of records) {
        if (!successfulUploadRows.has(Number(input?.row))) continue;
        const rowCycleName = String(input?.appraisalCycleName || "").trim().toLowerCase();
        // A file may contain rows for multiple cycles. Only override the
        // current sheet with uploaded RR/YoE values belonging to this cycle.
        if (
          rowCycleName &&
          rowCycleName !== String(cycle.id || "").trim().toLowerCase() &&
          rowCycleName !== String(cycle.name || "").trim().toLowerCase()
        ) continue;
        const empId = String(input?.empId || "").trim().toLowerCase();
        if (empId) uploadedValuesByEmpId.set(empId, input);
      }
      appraisalSheetSync = await syncFeedbackToAppraisalSheet(
        tables,
        cycle,
        actor,
        uploadedValuesByEmpId,
        // Only the employees this upload saved for the cycle. Other sheet rows
        // keep their values (they used to be rewritten from Feedback too).
        { onlyEmpIds: new Set(uploadedValuesByEmpId.keys()), deadline: writeDeadline },
      );
    } catch (syncError) {
      console.error("Feedback upload succeeded but Appraisal Sheet sync failed:", syncError?.message || syncError);
      appraisalSheetSync = {
        updated: 0,
        error: syncError?.message || "Appraisal Sheet synchronization failed.",
      };
    }
  }

  if (screen === "fb" && succeeded > 0) {
    try {
      await writeAudit(tables.audit, {
        actor: actor || "System",
        source: "feedback_upload",
        batchId: String(body.batchId || ""),
        cycle: { id: String(body.batchId || ""), name: cycle?.name || "" },
        action: "Feedback upload",
        details: {
          kind: "upload",
          action: "Feedback upload",
          message: "Feedback & Rating file uploaded.",
          fileName: String(body.fileName || ""),
          cycleId: String(cycle?.id || cycleId || ""),
          cycleName: cycle?.name || "",
          effectiveDate: firstEffective,
          total: records.length,
          succeeded,
          failed,
          inserted: insertedCount,
          updated: updatedCount,
        },
      });
    } catch (auditError) {
      console.error("Feedback upload audit failed:", auditError && auditError.message);
    }
  }

  return {
    succeeded,
    failed,
    total: records.length,
    batchId: String(body.batchId || ""),
    rows,
    ...(appraisalSheetSync ? { appraisalSheetSync } : {}),
  };
}

/* ---------- Feedback & Rating screen ---------- */
const fbText = (v) => (v === undefined || v === null ? "" : String(v).trim());
const fbNum = (v) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/,/g, "").replace(/[%₹$]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const fbDate = (v) => {
  const s = fbText(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
};

// Case-insensitive column lookup (the table mixes emp_ID, Department, Tech_ED ...)
function fbCol(row, ...names) {
  if (!row) return undefined;
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (key !== undefined && row[key] !== null && row[key] !== undefined && row[key] !== "") return row[key];
  }
  return undefined;
}

function shapeFeedbackCycle(cycle) {
  return {
    id: cycle.id,
    name: cycle.name,
    type: cycle.type || cycleTypeOf(cycle.name),
    status: cycle.archived ? "Archived" : cycle.status || "Upcoming",
    effective: fbDate(cycle.effective || cycle.start),
  };
}

function shapeFeedbackRow(row, masterByRowId, masterByEmpId, cycleById) {
  const empKey = fbText(fbCol(row, "emp_ID"));
  const master = masterByRowId.get(empKey) || masterByEmpId.get(empKey.toLowerCase()) || {};
  const cycleId = fbText(fbCol(row, "appraisal_cycle_name"));
  const cycle = cycleById.get(cycleId);
  const yesNo = fbText(fbCol(row, "at_risk")).toLowerCase();

  const basePay = fbNum(fbCol(master, "current_annual_base_pay", "base_pay", "current_salary"));
  const experience = fbNum(fbCol(master, "total_experience", "total_exp", "experience"));
  const yoe = basePay > 0 && experience > 0 ? Math.round((basePay / 100000 / experience) * 100) / 100 : 0;

  return {
    rowId: rowId(row),
    cid: cycleId,
    id: fbText(master.emp_id) || empKey,
    name: fbText(master.emp_name || master.name),
    desig: fbText(fbCol(row, "designation")) || fbText(master.designation),
    dept: fbText(fbCol(row, "Department")) || fbText(master.department),
    band: fbText(fbCol(row, "Band")) || fbText(master.band),
    eff: fbDate(fbCol(row, "Effective_Date")) || (cycle ? cycle.effective : ""),
    mr: fbNum(fbCol(row, "manager_rating")),
    mf: fbText(fbCol(row, "manager_feedback")),
    rr: fbNum(fbCol(row, "revenue_released", "rr_percent")),
    yoe,
    ic: fbNum(fbCol(row, "interview_count")),
    gm: fbNum(fbCol(row, "gross_margin")),
    client: fbText(fbCol(row, "CostCenter_Client")),
    cm: fbText(fbCol(row, "Client_Manager")),
    cmf: fbText(fbCol(row, "client_manager_feedback")),
    cr: fbNum(fbCol(row, "client_rating")),
    cf: fbText(fbCol(row, "client_feedback")),
    risk: ["yes", "y", "true", "1"].includes(yesNo) ? "Yes" : "No",
    ccm: fbText(fbCol(row, "Comp_Manager")) || fbText(master.comp_manager),
    te: fbText(fbCol(row, "Tech_ED")) || fbText(master.appraiser_tech_ed),
    batch: fbText(fbCol(row, "Upload_Batch")),
  };
}

function shapeFeedbackBatches(auditRows) {
  return auditRows
    .filter((row) => row.source === "feedback_upload")
    .map((row) => {
      const d = auditDetails(row);
      return {
        id: fbText(row.batch_id),
        cid: fbText(d.cycleId),
        file: fbText(d.fileName),
        by: fbText(row.changed_by),
        at: fbText(row.changed_at || row.CREATEDTIME),
        rows: Number(d.total) || 0,
        nw: Number(d.inserted) || 0,
        rep: Number(d.updated) || 0,
        eff: fbDate(d.effectiveDate),
      };
    })
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

async function getFeedbackData(tables, query, includeBatches = true) {
  // The independent tables are read together (bounded by the shared read
  // limits) through the unchanged-table cache instead of one after another.
  // Upload batches only need the feedback_upload audit rows, so those are
  // filtered inside ZCQL rather than downloading the whole audit table.
  const [feedbackRows, cycleRows, masterRows, auditRows] = await Promise.all([
    readTableFast(tables, "feedback"),
    readTableFast(tables, "cycles"),
    readTableFast(tables, "employeeMaster"),
    includeBatches ? readAuditBySource(tables, "feedback_upload") : Promise.resolve([]),
  ]);

  const masterByRowId = new Map();
  const masterByEmpId = new Map();
  (feedbackRows.length ? masterRows : []).forEach((row) => {
    if (rowId(row)) masterByRowId.set(rowId(row), row);
    const business = fbText(row.emp_id).toLowerCase();
    if (business) masterByEmpId.set(business, row);
  });
  const cycles = cycleRows.map(normalizeCycle).filter((c) => c.status !== "Cancelled").map(shapeFeedbackCycle);
  const cycleById = new Map(cycles.map((c) => [c.id, c]));
  const onlyCycle = fbText(query.cycleId || query.cycle_id);
  const rows = feedbackRows
    .map((row) => shapeFeedbackRow(row, masterByRowId, masterByEmpId, cycleById))
    .filter((row) => row.cid && (!onlyCycle || row.cid === onlyCycle));

  // Upload-batch history is only returned to HR/global-scope users.
  // Team-scoped Appraisal Sheet / Detailed Screen reads do not need Audit rows.
  const batches = shapeFeedbackBatches(auditRows).filter((b) => !onlyCycle || b.cid === onlyCycle);
  return { cycles, rows, batches };
}

async function routeRequest(req, res, identity, resource, a) {
  const writeDeadline = Date.now() + WRITE_TIME_LIMIT_MS;
  const enforced = Boolean(a && a.enforced);
  access.guard(a, () => requirePayrollAccess(a, resource, req.method));

  const isCycleWrite = resource.startsWith("cycles/") && req.method !== "GET";
  if (!enforced && isCycleWrite && !isHR(identity.user)) {
    return sendJson(res, 403, { success: false, message: "HR role is required to administer appraisal cycles." });
  }
  if (resource === "session") {
    return sendJson(res, 200, { success: true, data: { id: identity.id, name: identity.name, email: identity.email, role: identity.role } });
  }
  const techEdUser = !enforced && isTechEd(identity.user);

  if (
    !enforced &&
    !canAccessPayroll(identity.user) &&
    !resource.startsWith("cycles")
  ) {
    return sendJson(res, 403, { success: false, message: "HR, Comp. Manager, or Tech-Ed role is required for payroll access." });
  }

  if (techEdUser && req.method !== "GET" && resource !== "session") {
    return sendJson(res, 403, { success: false, message: "Tech-Ed users have read-only payroll access." });
  }

  const adminApp = catalyst.initialize(req, { scope: "admin" });
  const tables = await requirePayrollTables(adminApp);
  const query = getQuery(req);
  const actor = identity.name || identity.email;

  if (resource === "schema" && req.method === "GET") {
    const schema = await getProjectSchema(adminApp);
    return sendJson(res, 200, { success: true, data: schema });
  }

  if (resource === "cycles" && req.method === "GET") {
    const cycles = (await getAllRows(tables.cycles)).map(normalizeCycle);
    return sendJson(res, 200, { success: true, data: cycles });
  }

  if (resource === "eligibility" && req.method === "GET") {
    const queryCycleId = String(query.cycleId || query.cycle_id || "").trim();
    const cycles = (await getAllRows(tables.cycles)).map(normalizeCycle);
    const isAvailableActiveCycle = (item) =>
      String(item.status || "").trim().toLowerCase() === "active" &&
      ![true, 1, "true", "1", "yes"].includes(
        typeof item.archived === "string" ? item.archived.trim().toLowerCase() : item.archived,
      ) &&
      ![true, 1, "true", "1", "yes"].includes(
        typeof item.hidden === "string" ? item.hidden.trim().toLowerCase() : item.hidden,
      );
    // Location-wise cycles can be Active together. When the caller supplies
    // a cycle ID, resolve that exact Active cycle instead of whichever one
    // happens to appear first in Cycle Master.
    const cycle = queryCycleId
      ? cycles.find((item) => item.id === queryCycleId && isAvailableActiveCycle(item)) || null
      : cycles.find(isAvailableActiveCycle) || null;
    const activeCycle = cycle || cycles.find(isAvailableActiveCycle) || null;
    // ?count=1: read-only status for Cycle Master, without the sync below
    // (which writes). criteriaApplied is what "generated" means: the list is
    // created by Apply Criteria, which is allowed once per cycle.
    if (["1", "true"].includes(String(query.count || "").trim().toLowerCase())) {
      if (!cycle) {
        return sendJson(res, 200, { success: true, data: { cycleId: "", total: 0, criteriaApplied: false } });
      }
      const cycleRows = (await getAllRows(tables.eligibility)).filter(
        (row) => String(row.appraisal_cycle_id || "") === String(cycle.id),
      );
      const criteriaApplied = await eligibilityCriteriaWasApplied(tables, cycle.id, cycleRows);
      return sendJson(res, 200, {
        success: true,
        data: { cycleId: cycle.id, total: cycleRows.length, criteriaApplied },
      });
    }
    if (!cycle) {
      return sendJson(res, 200, {
        success: true,
        data: [],
        meta: {
          cycleId: "",
          cycleName: "",
          message: activeCycle
            ? "Eligibility data is available only for the Active appraisal cycle."
            : "No active appraisal cycle is available.",
        },
      });
    }
    const data = await getEligibilityRows(tables, cycle, actor);
    const criteriaMeta = await readEligibilityCriteriaMeta(tables, cycle).catch((error) => {
      console.error("Could not read the saved criteria:", error);
      return { criteria: null, criteriaHistory: [] };
    });
    return sendJson(res, 200, {
      success: true,
      data: {
        records: data.records,
        masterRecords: data.masterRecords,
        meta: {
          cycleId: cycle.id,
          cycleName: cycle.name,
          total: data.records.length,
          criteriaApplied: data.criteriaApplied,
          criteria: criteriaMeta.criteria,
          criteriaHistory: criteriaMeta.criteriaHistory,
        },
      },
    }, req);
  }

  if (resource === "eligibility" && req.method === "POST") {
    const body = await readBody(req);
    // Access -> Fields -> Eligibility List: every change here changes Eligibility; a reason
    // also needs the Reason field.
    {
      const withReason = (item) => Boolean(item && (item.reason || item.eligibility_reason || item.eligibleReason || item.eligible_reason));
      const labels = ["Eligibility"];
      if (withReason(body) || (Array.isArray(body.records) && body.records.some(withReason))) labels.push("Reason");
      access.guard(a, () => access.requireEditFields(a, "eligibility", labels));
    }
    if (String(body.action || "").trim().toLowerCase() === "reset-criteria") {
      const cycleId = String(body.cycleId || body.appraisal_cycle_id || "").trim();
      if (!cycleId) throw new ApiError("Appraisal cycle is required.", 400);
      const cycles = (await getAllRows(tables.cycles)).map(normalizeCycle);
      const cycle = cycles.find((item) => item.id === cycleId);
      if (!cycle) throw new ApiError("The selected appraisal cycle was not found.", 404);
      if (String(cycle.status || "").trim().toLowerCase() !== "active" || cycle.archived || cycle.hidden) {
        throw new ApiError("Eligibility can be regenerated only for the Active appraisal cycle.", 409);
      }
      const eligibilityRows = await getAllRows(tables.eligibility);
      const cycleRows = eligibilityRows.filter((row) => String(row.appraisal_cycle_id || "") === cycleId);
      const removed = await deleteEligibilityRowsById(tables, cycleRows.map(rowId));
      const auditRows = await getAllRows(tables.audit);
      const markerRows = auditRows.filter((row) =>
        String(row.source || "").trim().toLowerCase() === "eligibility_criteria" &&
        String(row.batch_id || "") === cycleId
      );
      for (let index = 0; index < markerRows.length; index += 100) {
        await tables.audit.deleteRows(markerRows.slice(index, index + 100).map(rowId));
      }
      return sendJson(res, 200, { success: true, data: { cycleId, removed, criteriaApplied: false } });
    }
    if (String(body.action || "").trim().toLowerCase() === "apply-criteria") {
      const result = await applyEligibilityCriteria(tables, body, actor);
      return sendJson(res, 200, { success: true, data: result });
    }
    if (Array.isArray(body.records)) {
      const result = await saveEligibilityRowsBatch(tables, body, actor);
      return sendJson(res, 200, { success: true, data: result });
    }
    const saved = await saveEligibilityRow(tables, body, actor);
    return sendJson(res, 200, { success: true, data: saved });
  }

  if (resource === "generate-sheet" && req.method === "POST") {
    const body = await readBody(req);
    const cycleId = String(body.cycleId || body.cycle_id || "").trim();
    if (!cycleId) throw new ApiError("Appraisal cycle ID is required.", 400);
    const cycles = (await getAllRows(tables.cycles)).map(normalizeCycle);
    const cycle = cycles.find((item) => item.id === cycleId);
    if (!cycle) throw new ApiError("The selected appraisal cycle was not found.", 404);
    const result = await generateAppraisalSheet(tables, cycle, actor, writeDeadline, {
      reuseExistingCycleData: body.reuseExistingCycleData === true,
      allCycles: cycles,
    });
    return sendJson(res, 200, { success: true, data: result });
  }

  if (resource === "locations" && req.method === "GET") {
    const rows = await getAllRows(tables.locations);
    const locations = rows
      .map((row) => ({
        id: String(row.ROWID || row.rowid || row.id || ""),
        location_name: String(row.location_name || "").trim(),
        location_code: String(row.location_code || "").trim(),
        address: String(row.address || "").trim(),
        currency_code: String(row.currency_code || "").trim(),
        status: String(row.status || "Active").trim() || "Active",
      }))
      .filter((location) => location.location_code)
      .sort((a, b) => a.location_name.localeCompare(b.location_name));
    return sendJson(res, 200, { success: true, data: locations });
  }

  if (resource === "locations" && req.method === "POST") {
    const body = await readBody(req);
    const locationId = String(body.id || "").trim();
    const locationName = String(body.location_name || "").trim();
    const locationCode = String(body.location_code || "").trim().toUpperCase();
    const address = String(body.address || "").trim();
    const currencyCode = String(body.currency_code || "").trim().toUpperCase();
    if (!locationName || !locationCode) {
      return sendJson(res, 400, { success: false, message: "Location Name and Location Code are required." });
    }
    const rows = await getAllRows(tables.locations);
    const duplicate = rows.find((row) => {
      const rowId = String(row.ROWID || row.rowid || row.id || "");
      if (locationId && rowId === locationId) return false;
      return String(row.location_code || "").trim().toLowerCase() === locationCode.toLowerCase() ||
        String(row.location_name || "").trim().toLowerCase() === locationName.toLowerCase();
    });
    if (duplicate) return sendJson(res, 409, { success: false, message: "A location with this name or code already exists." });
    const status = String(body.status || "Active").trim().toLowerCase() === "inactive" ? "Inactive" : "Active";
    const payload = { location_name: locationName, location_code: locationCode, address, currency_code: currencyCode, status };
    {
      // Access -> Fields -> Location Master: only changed fields need Edit.
      const labels = { location_name: "Location Name", location_code: "Location Code", address: "Address", currency_code: "Currency Code", status: "Status" };
      const prior = locationId
        ? rows.find((row) => String(row.ROWID || row.rowid || row.id || "") === locationId)
        : null;
      const changed = Object.keys(labels)
        .filter((key) => (prior
          ? String(prior[key] ?? "").trim() !== String(payload[key] ?? "").trim()
          : String(payload[key] ?? "").trim() !== ""))
        .map((key) => labels[key]);
      access.guard(a, () => access.requireEditFields(a, "locationMaster", changed));
    }
    if (locationId) {
      const existing = rows.find((row) => String(row.ROWID || row.rowid || row.id || "") === locationId);
      if (!existing) return sendJson(res, 404, { success: false, message: "Location not found." });
      await tables.locations.updateRow({ ROWID: locationId, ...payload });
      return sendJson(res, 200, { success: true, data: { id: locationId, ...payload } });
    }
    const inserted = await tables.locations.insertRow(payload);
    return sendJson(res, 201, { success: true, data: { id: String(inserted?.ROWID || inserted?.rowid || inserted?.id || ""), ...payload } });
  }

  if (resource === "feedback" && req.method === "GET") {
    const data = await getFeedbackData(tables, query, Boolean(a && a.scope && a.scope.all));
    // HR (scope.all) gets everything. Any other login (Tech ED / Comp Manager) only
    // gets the feedback of the employees in their own team, and no upload-batch
    // history (that belongs to the HR-only Feedback & Rating Master screen).
    if (a && a.scope && !a.scope.all) {
      return sendJson(res, 200, {
        success: true,
        data: {
          cycles: data.cycles,
          rows: data.rows.filter((row) => access.inScope(a, row.id)),
          batches: [],
        },
      }, req);
    }
    return sendJson(res, 200, { success: true, data }, req);
  }

  if (resource === "audit" && req.method === "GET") {
    // Historical Import keeps its undo data in the audit table; it is internal.
    const [allAuditRows, cycleRowsForAudit] = await Promise.all([
      readTableFast(tables, "audit"),
      readTableFast(tables, "cycles"),
    ]);
    const auditRows = allAuditRows
      .filter((row) => row.source !== "historical_import_undo" && row.source !== SHEET_ARCHIVE_SOURCE);
    const cycles = cycleRowsForAudit.map(normalizeCycle);
    const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle]));
    const entries = auditRows.map((row) => {
      const details = auditDetails(row);
      const cycle = cycleById.get(String(row.batch_id || ""));
      return {
        id: rowId(row),
        cycleId: row.source === "cycle" ? String(row.batch_id || "") : "",
        time: row.changed_at || row.CREATEDTIME || "",
        user: row.changed_by || "",
        empId: row.emp_id || "",
        empName: row.employee_name || "",
        cycle: details.cycleName || cycle?.name || row.appraisal_year || "",
        field: details.action || row.field_name || "",
        oldVal: row.old_value || "",
        newVal: row.new_value || "",
        details: details.message || details.details || "",
        remarks: typeof details.newRemarks === "string" ? details.newRemarks : "",
        source: row.source || "",
        batchId: row.batch_id || "",
        kind: details.kind || "payroll",
      };
    }).sort((a, b) => String(b.time).localeCompare(String(a.time)));
    return sendJson(res, 200, { success: true, data: entries }, req);
  }

  if (resource === "history" && req.method === "GET") {
    const auditRows = await getAllRows(tables.audit);
    const batches = auditRows
      .filter((row) => row.source === "payroll_upload")
      .map((row) => {
        const details = auditDetails(row);
        return {
          batchId: row.batch_id || "",
          file: details.fileName || "",
          uploaded: row.changed_at || row.CREATEDTIME || "",
          succeeded: Number(details.succeeded) || 0,
          failed: Number(details.failed) || 0,
          updated: details.updated == null || !Number.isFinite(Number(details.updated))
            ? null
            : Number(details.updated),
          cycle: details.cycleName || "",
        };
      })
      .sort((a, b) => String(b.uploaded).localeCompare(String(a.uploaded)))
      // A large file is committed in parts under one batch ID, each with its
      // own audit entry: show it as one upload with the counts added up.
      .reduce((list, entry) => {
        const same = entry.batchId && list.find((item) => item.batchId === entry.batchId);
        if (!same) return [...list, entry];
        same.succeeded += entry.succeeded;
        same.failed += entry.failed;
        if (same.updated !== null || entry.updated !== null) same.updated = (same.updated || 0) + (entry.updated || 0);
        return list;
      }, []);
    const undoneBatchIds = new Set(
      auditRows
        .filter((row) => row.source === "payroll_undo")
        .map((row) => String(row.batch_id || "")),
    );
    batches.forEach((batch) => {
      batch.undone = undoneBatchIds.has(batch.batchId);
      batch.undoable = batch.succeeded > 0 && batch.updated === 0 && !batch.undone;
    });
    return sendJson(res, 200, { success: true, data: batches });
  }

  if (resource === "payroll" && req.method === "GET") {
    const [rows, cycles, masterRows] = await Promise.all([
      readTableFast(tables, "payroll"),
      readTableFast(tables, "cycles"),
      readTableFast(tables, "employeeMaster"),
    ]);

    const normalizedCycles = cycles.map((row) => normalizeCycle(row));
    const cycleByName = new Map(
      normalizedCycles
        .filter((cycle) => cycle.name)
        .map((cycle) => [cycle.name.trim().toLowerCase(), cycle]),
    );
    const cycleById = new Map(
      normalizedCycles
        .filter((cycle) => cycle.id)
        .map((cycle) => [String(cycle.id).trim(), cycle]),
    );
    const employeeById = new Map();
  masterRows.forEach((row) => {
    const businessEmpId = String(row.emp_id || "").trim().toLowerCase();
    const masterRowId = String(row.ROWID ?? row.rowid ?? "").trim().toLowerCase();
    if (businessEmpId) employeeById.set(businessEmpId, row);
    if (masterRowId) employeeById.set(masterRowId, row);
  });
    const assignedEmpIds = techEdUser
      ? new Set(
          masterRows
            .filter((employee) => employeeBelongsToCurrentUser(employee, identity.user))
            .map((employee) => String(employee.emp_id || "").trim().toLowerCase())
            .filter(Boolean),
        )
      : null;

    const visibleRows = enforced
      ? rows.filter((row) => access.inScope(a, row))
      : assignedEmpIds
        ? rows.filter((row) => assignedEmpIds.has(String(row.emp_id || "").trim().toLowerCase()))
        : rows;

    return sendJson(res, 200, {
      success: true,
      data: visibleRows.map((row) => mapPayroll(row, cycleByName, cycleById, employeeById)),
    }, req);
  }

  if (resource === "validate" && req.method === "POST") {
    const body = await readBody(req);
    // The table rows validateUpload passes on to commit are not sent back.
    const { masterRows: _masterRows, payrollRows: _payrollRows, ...result } = await validateUpload(tables, body);
    return sendJson(res, 200, { success: true, data: result });
  }

  if (resource === "commit" && req.method === "POST") {
    const body = await readBody(req);
    const result = await validateUpload(tables, body);
    const batchId = String(body.batchId || "").trim();
    // Commit is intentionally retry-safe. If the browser retries the same batch
    // after a timeout, update/insert the same Employee + Cycle rows instead of
    // returning 409 and making a successful upload look like it did nothing.
    const valid = result.rows.filter((row) => row.ok);
    const masterRows = result.masterRows;
    const masterByEmpId = new Map(masterRows.map((row) => [String(row.emp_id || "").trim().toLowerCase(), row]));
    const masterByRowId = new Map(masterRows.map((row) => [String(row.ROWID ?? row.rowid ?? "").trim(), row]));
    const existingByKey = new Map(result.payrollRows.map((row) => [
      `${String(row.emp_id || "").trim()}|${String(row.appraisal_cycle_name || "").trim()}`,
      row,
    ]));

    const inserts = [];
    const updates = [];
    for (const item of valid) {
      const payrollRow = item.payrollRow;
      const master = masterByEmpId.get(String(item.empId || payrollRow.emp_id || "").trim().toLowerCase()) ||
        masterByRowId.get(String(payrollRow.emp_id).trim());
      if (!master) throw new ApiError(`Employee ${item.empId || payrollRow.emp_id} was removed during validation. Re-validate the file.`, 409);
      const masterRowId = String(master.ROWID ?? master.rowid ?? "").trim();
      const cycleRowId = String(payrollRow.appraisal_cycle_name ?? "").trim();
      const existing = existingByKey.get(`${masterRowId}|${cycleRowId}`);
      if (existing) updates.push({ item, row: { ROWID: rowId(existing), ...payrollRow } });
      else inserts.push({ item, row: payrollRow });
    }

    let succeeded = 0;
    let inserted = 0;
    let updated = 0;
    let notSaved = 0;
    for (const [list, kind] of [[updates, "update"], [inserts, "insert"]]) {
      const outcomes = await writeRowsInBatches(tables.payroll, list.map((entry) => entry.row), kind, writeDeadline);
      outcomes.forEach((outcome, index) => {
        const { item } = list[index];
        if (outcome.ok) {
          succeeded += 1;
          if (kind === "insert") inserted += 1; else updated += 1;
          return;
        }
        if (outcome.skipped) notSaved += 1;
        item.ok = false;
        item.reason = outcome.skipped
          ? NOT_SAVED_TIME_LIMIT
          : outcome.error?.message || "Payroll row could not be saved.";
        item.badFields = [];
      });
    }

    await writeAudit(tables.audit, {
      actor,
      source: "payroll_upload",
      batchId,
      cycle: result.cycle,
      action: "Payroll upload",
      details: {
        kind: "upload",
        action: "Payroll upload",
        message: "Payroll file upload committed.",
        fileName: String(body.fileName || ""),
        cycleName: result.cycle.name,
        succeeded,
        inserted,
        updated,
        failed: result.rows.filter((row) => !row.ok).length,
      },
    });
    return sendJson(res, 200, {
      success: true,
      data: { succeeded, failed: result.rows.filter((row) => !row.ok).length, notSaved, total: result.rows.length, batchId: body.batchId, rows: result.rows },
    });
  }

  if (resource === "import" && req.method === "POST") {
    const body = await readBody(req);
    const result = await importRows(tables, body, actor, writeDeadline);
    return sendJson(res, 200, { success: true, data: result });
  }

  if (resource === "undo" && req.method === "POST") {
    const body = await readBody(req);
    const batchId = String(body.batchId || "").trim();
    if (!batchId || batchId.length > 80) {
      throw new ApiError("A valid upload batch ID is required.");
    }
    const auditRows = await getAllRows(tables.audit);
    const upload = auditRows.find((row) =>
      row.source === "payroll_upload" && String(row.batch_id || "") === batchId,
    );
    if (!upload) throw new ApiError("Upload batch not found.", 404);
    if (auditRows.some((row) =>
      row.source === "payroll_undo" && String(row.batch_id || "") === batchId,
    )) {
      throw new ApiError("This upload batch has already been undone.", 409);
    }

    const details = auditDetails(upload);
    const succeeded = Number(details.succeeded) || 0;
    if (succeeded === 0 || Number(details.updated) !== 0) {
      throw new ApiError("Only batches that inserted new payroll records can be undone. Batches that updated existing records are not reversible.", 409);
    }
    const batchRows = (await getAllRows(tables.payroll)).filter(
      (row) => String(row.source_batch || "") === batchId,
    );
    if (batchRows.length !== succeeded) {
      throw new ApiError("The batch no longer owns all of its inserted payroll rows, so it cannot be safely undone.", 409);
    }
    for (let index = 0; index < batchRows.length; index += 200) {
      await tables.payroll.deleteRows(batchRows.slice(index, index + 200).map(rowId));
    }
    await writeAudit(tables.audit, {
      actor,
      source: "payroll_undo",
      batchId,
      cycle: { id: batchId, name: details.cycleName || "" },
      action: "Payroll undo",
      details: {
        kind: "undo",
        action: "Payroll undo",
        message: `Undo removed ${batchRows.length} payroll rows.`,
        batchId,
        deleted: batchRows.length,
      },
    });
    return sendJson(res, 200, { success: true, data: { batchId, deleted: batchRows.length } });
  }

  if (resource.startsWith("cycles/") && req.method === "POST") {
    if (!enforced && !isHR(identity.user)) {
      return sendJson(res, 403, { success: false, message: "HR role is required to administer appraisal cycles." });
    }
    const [, action, id] = resource.split("/");
    const body = await readBody(req);
    const cycleRows = await getAllRows(tables.cycles);
    const cycles = cycleRows.map(normalizeCycle);
    const existing = cycles.find((cycle) => cycle.id === id);
    const validDate = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    const now = nowLocal();
    const columns = await cycleColumns(tables.cycles);

    // The location the cycle is for: "All", or a Location Master location
    // (matched by name or code, saved as its name). Undefined = not sent.
    let requestedLocation;
    let locationError = "";
    if (body.location !== undefined) {
      const raw = String(body.location ?? "").trim();
      if (!raw) {
        locationError = "Select the location this appraisal cycle is for.";
      } else if (["all", "all locations"].includes(raw.toLowerCase())) {
        requestedLocation = ALL_LOCATIONS;
      } else {
        const locationRows = await getAllRows(tables.locations);
        const match = locationRows.find((row) =>
          String(row.location_name || "").trim().toLowerCase() === raw.toLowerCase() ||
          String(row.location_code || "").trim().toLowerCase() === raw.toLowerCase());
        if (!match) locationError = `"${raw}" is not a location in Location Master.`;
        else if (String(match.status || "Active").trim().toLowerCase() === "inactive") locationError = `${String(match.location_name).trim()} is inactive in Location Master.`;
        else requestedLocation = String(match.location_name || "").trim();
      }
    }
    if (body.location !== undefined && !locationError && !columns.has("location")) {
      locationError = "Appraisal_Cycle_Master has no location column yet, so the location cannot be saved.";
    }

    // Cycle fields from the screen. Cycles on "No process" need only the
    // effective date; the others need start < end (effective defaults to start).
    const readCycleFields = (fallback = {}) => {
      const name = String(body.name ?? fallback.name ?? "").trim();
      const type = String(body.type ?? (fallback.type || cycleTypeOf(name))).trim();
      const process = String(body.process ?? (fallback.process || DEFAULT_CYCLE_PROCESS[type] || "Annual")).trim();
      const start = String(body.start ?? fallback.start ?? "").trim();
      const end = String(body.end ?? fallback.end ?? "").trim();
      const effective = String(body.effective ?? (fallback.effective || start)).trim();
      let error = "";
      if (!name || name.length > 100) error = "Provide a cycle name (up to 100 characters).";
      else if (!CYCLE_TYPES.includes(type)) error = `Cycle type must be one of: ${CYCLE_TYPES.join(", ")}.`;
      else if (!CYCLE_PROCESSES.includes(process)) error = "Process must be Annual, Exceptional or None.";
      else if (process === "None") {
        if (!validDate(effective)) error = "The effective date is required (YYYY-MM-DD).";
        else if ((start || end) && !(validDate(start) && validDate(end) && end > start)) error = "If you give start and close dates, both must be valid and close must be after start.";
      } else if (!(validDate(start) && validDate(end) && end > start)) error = "Provide valid start and close dates; close must be after start.";
      else if (effective && !validDate(effective)) error = "The effective date must be a valid date (YYYY-MM-DD).";
      if (!error && locationError) error = locationError;
      const location = requestedLocation !== undefined ? requestedLocation : (fallback.location || ALL_LOCATIONS);
      return { name, type, process, start: start || null, end: end || null, effective: effective || start, location, error };
    };
    const optionalValues = (fields) => ({ cycle_type: fields.type, process: fields.process, effective_date: fields.effective || null, location: fields.location });
    // Until effective_date exists, a "No process" cycle keeps its effective
    // date in start_date (the screen shows start as the effective date).
    const storedStart = (fields) => fields.start || (!columns.has("effective_date") && fields.process === "None" ? fields.effective : null);
    const appendRemark = (current, entry) => (current ? `${current} | ${entry}` : entry);
    // Active cycles are independent by location. "All" (Global) is its
    // own cycle scope; it does not block a country-specific cycle.
    const otherActiveCycle = (id) => {
      const target = cycles.find((cycle) => cycle.id === id);
      if (!target) return null;
      const targetLocation = cycleLocationKey(target);
      return cycles.find((cycle) => {
        if (cycle.status !== "Active" || cycle.id === id || cycle.archived) {
          return false;
        }
        const otherLocation = cycleLocationKey(cycle);
        // The existing org-wide cycle is the source/configuration cycle for
        // its location children. Permit that parent and its matching location
        // cycles to remain Active together; unrelated global cycles still
        // block activation, and two cycles for the same location still clash.
        if (!targetLocation || !otherLocation) {
          const sameSourceCycle =
            cycleNameWithoutLocation(target.name).trim().toLowerCase() ===
              cycleNameWithoutLocation(cycle.name).trim().toLowerCase() &&
            cycleYear(target) === cycleYear(cycle) &&
            cycleTypeOf(target.name) === cycleTypeOf(cycle.name);
          return !sameSourceCycle;
        }
        return otherLocation === targetLocation;
      });
    };

    // Access -> Fields -> Appraisal Cycle Master: create / update need Edit on the fields they set
    // (an update only on the ones that changed).
    if (action === "create" || action === "update") {
      const sent = readCycleFields(existing || {});
      const labelled = [
        ["Cycle Name", sent.name, existing && existing.name],
        ["Cycle Type", sent.type, existing && existing.type],
        ["Process", sent.process, existing && existing.process],
        ["Start Date", sent.start, existing && existing.start],
        ["Close Date", sent.end, existing && existing.end],
        ["Effective Date", sent.effective, existing && existing.effective],
      ];
      const changed = labelled
        .filter(([, now, before]) => (existing ? String(now ?? "") !== String(before ?? "") : String(now ?? "") !== ""))
        .map(([label]) => label);
      if (body.remarks !== undefined && String(body.remarks || "").trim() !== "") changed.push("Remarks");
      access.guard(a, () => access.requireEditFields(a, "cycleMaster", changed));
    }

    if (action === "create") {
      // The screen always sends a location; older callers that do not are All Locations.
      const fields = readCycleFields();
      const remarks = String(body.remarks || "").trim();
      if (fields.error || remarks.length > 10000) {
        return sendJson(res, 400, { success: false, message: fields.error || "Remarks cannot exceed 10,000 characters." });
      }
      // cycle_name is unique in the Data Store, cancelled cycles included.
      const same = cycles.find((cycle) => cycle.name.toLowerCase() === fields.name.toLowerCase());
      if (same) {
        return sendJson(res, 409, { success: false, message: same.status === "Cancelled" ? `"${same.name}" was used by a cancelled cycle. Choose another name.` : "An appraisal cycle with that name already exists." });
      }
      // A past cycle holds previous-year data loaded through Historical Import.
      // It is saved directly as Closed and archived: no process step runs and
      // it never becomes the Active cycle.
      const past = body.past === true;
      if (past) {
        const lastDay = fields.end || fields.effective || fields.start;
        if (!lastDay || lastDay >= todayLocal()) {
          return sendJson(res, 400, { success: false, message: "A past cycle must have ended before today." });
        }
      }
      const pastNote = "Past cycle (history import only)";
      const row = withOptionalColumns(columns, {
        cycle_name: fields.name, start_date: storedStart(fields), end_date: fields.end, status: past ? "Closed" : "Upcoming",
        remarks: past ? (remarks ? `${pastNote} | ${remarks}` : pastNote) : remarks,
        changed_by: actor, changed_at: now, archived: past,
      }, optionalValues(fields));
      const created = await tables.cycles.insertRow(row);
      const cycle = normalizeCycle({ ...row, ...created });
      const message = past
        ? `Past cycle created as Closed and archived (${fields.type}) for Historical Import.`
        : `Cycle created as Upcoming (${fields.type}, ${fields.process === "None" ? "no process" : fields.process + " process"}, ${fields.location === ALL_LOCATIONS ? "all locations" : fields.location}).`;
      await writeAudit(tables.audit, { actor, source: "cycle", cycle, action: past ? "Created past cycle" : "Created cycle", details: { kind: "cycle", action: past ? "Created past cycle" : "Created cycle", message, cycleName: cycle.name, newRemarks: cycle.remarks } });
      return sendJson(res, 201, { success: true, data: cycle });
    }

    if (!existing || !id) return sendJson(res, 404, { success: false, message: "Appraisal cycle not found." });
    if (existing.status === "Cancelled" && action !== "remarks") {
      return sendJson(res, 409, { success: false, message: "This cycle was cancelled and can no longer be changed." });
    }

    if (action === "update") {
      if (existing.archived) return sendJson(res, 409, { success: false, message: "Archived cycles are read-only." });
      const fields = readCycleFields({ ...existing, type: existing.type || cycleTypeOf(existing.name), process: cycleProcessOf(existing) });
      if (fields.error) return sendJson(res, 400, { success: false, message: fields.error });
      if (cycles.some((cycle) => cycle.id !== id && cycle.name.toLowerCase() === fields.name.toLowerCase())) {
        return sendJson(res, 409, { success: false, message: "An appraisal cycle with that name already exists." });
      }
      // The process is fixed once the cycle has been activated.
      if (existing.status !== "Upcoming" && fields.process !== cycleProcessOf(existing)) {
        return sendJson(res, 409, { success: false, message: "The process can only be changed while the cycle is Upcoming." });
      }
      // The location decides who is on the cycle's Eligibility List, so it is
      // fixed once the cycle has been activated.
      if (existing.status !== "Upcoming" && cycleLocationKey(fields) !== cycleLocationKey(existing)) {
        return sendJson(res, 409, { success: false, message: "The location can only be changed while the cycle is Upcoming." });
      }
      const row = withOptionalColumns(columns, {
        ROWID: id, cycle_name: fields.name, start_date: storedStart(fields), end_date: fields.end, changed_by: actor, changed_at: now,
      }, optionalValues(fields));
      await tables.cycles.updateRow(row);
      const updated = { ...existing, name: fields.name, start: storedStart(fields) || "", end: fields.end || "", changedBy: actor, changedAt: now };
      if (columns.has("cycle_type")) updated.type = fields.type;
      if (columns.has("process")) updated.process = fields.process;
      if (columns.has("effective_date")) updated.effective = fields.effective || "";
      if (columns.has("location")) updated.location = fields.location;
      const before = { name: existing.name, type: existing.type, process: existing.process, effective: existing.effective, start: existing.start, end: existing.end, location: existing.location };
      const after = { name: updated.name, type: updated.type, process: updated.process, effective: updated.effective, start: updated.start, end: updated.end, location: updated.location };
      const changed = Object.keys(before).filter((key) => String(before[key] || "") !== String(after[key] || ""));
      const describe = (v) => changed.map((key) => `${key} ${v[key] || "—"}`).join(", ");
      await writeAudit(tables.audit, {
        actor, source: "cycle", cycle: updated, action: "Cycle edited",
        oldValue: describe(before), newValue: describe(after),
        details: { kind: "cycle", action: "Cycle edited", message: changed.length ? `Changed: ${changed.map((key) => `${key} ${before[key] || "—"} → ${after[key] || "—"}`).join("; ")}.` : "No values changed.", cycleName: updated.name, before, after },
      });
      return sendJson(res, 200, { success: true, data: updated });
    }

    if (action === "remarks") {
      // Remarks are a running log: a new remark is added, nothing is overwritten.
      const remark = String(body.remark ?? body.remarks ?? "").trim();
      if (!remark) return sendJson(res, 400, { success: false, message: "Enter a remark." });
      const remarks = appendRemark(existing.remarks, remark);
      if (remarks.length > 10000) return sendJson(res, 400, { success: false, message: "Remarks exceed 10,000 characters." });
      await tables.cycles.updateRow({ ROWID: id, remarks, changed_by: actor, changed_at: now });
      const updated = { ...existing, remarks, changedBy: actor, changedAt: now };
      await writeAudit(tables.audit, { actor, source: "cycle", cycle: updated, action: "Remarks changed", details: { kind: "cycle", action: "Remarks changed", message: "Remark added.", cycleName: updated.name, newRemarks: remark } });
      return sendJson(res, 200, { success: true, data: updated });
    }

    if (action === "status") {
      const status = String(body.status || "");
      const remark = String(body.remark || "").trim();
      if (!["Upcoming", "Active", "Closed"].includes(status)) return sendJson(res, 400, { success: false, message: "Status must be Upcoming, Active, or Closed." });
      if (existing.archived) return sendJson(res, 409, { success: false, message: "Archived cycles are read-only. Unarchive the cycle first." });
      if (!(CYCLE_MOVES[existing.status] || []).includes(status)) {
        return sendJson(res, 409, { success: false, message: `A cycle cannot move from ${existing.status} to ${status}.` });
      }
      const otherActive = otherActiveCycle(id);
      if (status === "Active" && otherActive) {
        return sendJson(res, 409, { success: false, message: `Close or archive "${otherActive.name}" first. Only one cycle can be Active at a time.` });
      }
      const verb = existing.status === "Closed" ? "Reopen" : status === "Active" ? "Activate" : "Close";
      const remarks = remark ? appendRemark(existing.remarks, `${verb}: ${remark}`) : existing.remarks;
      if (remarks.length > 10000) return sendJson(res, 400, { success: false, message: "Remarks exceed 10,000 characters." });
      const row = { ROWID: id, status, changed_by: actor, changed_at: now };
      if (remark) row.remarks = remarks;
      // The process is locked at activation: store the one in use.
      if (status === "Active" && !existing.process) withOptionalColumns(columns, row, { process: cycleProcessOf(existing) });
      await tables.cycles.updateRow(row);
      await bumpAccessVersion(req, a, "Cycle status changed: " + existing.name);
      const updated = { ...existing, status, remarks, changedBy: actor, changedAt: now };
      let eligibilitySync = null;
      let eligibilityCleared = null;
      if (status === "Active") {
        eligibilitySync = await syncEligibilityRows(tables, updated, actor);
      } else if (status === "Closed") {
        eligibilityCleared = await clearEligibilityRows(tables, id);
      }
      await writeAudit(tables.audit, { actor, source: "cycle", cycle: updated, action: "Status changed", details: { kind: "cycle", action: "Status changed", message: `Cycle status changed from ${existing.status} to ${status}.`, cycleName: updated.name, ...(eligibilitySync ? { eligibilityCreated: eligibilitySync.created, inactiveRemoved: eligibilitySync.removed } : {}), ...(eligibilityCleared !== null ? { eligibilityCleared } : {}), ...(remark ? { newRemarks: `${verb}: ${remark}` } : {}) } });
      return sendJson(res, 200, { success: true, data: { ...updated, eligibilitySync, eligibilityCleared } });
    }

    if (action === "archive") {
      if (typeof body.archived !== "boolean") return sendJson(res, 400, { success: false, message: "Archived must be true or false." });
      const archived = body.archived;
      const remark = String(body.remark || "").trim();
      if (archived && existing.status !== "Closed") return sendJson(res, 409, { success: false, message: "Close the cycle before archiving it." });
      if (!archived && String(existing.remarks || "").includes(SHEET_ARCHIVE_MARK)) {
        return sendJson(res, 409, { success: false, message: `${existing.name}'s Appraisal Sheet was moved to Payroll Data when it was archived, so it cannot be unarchived.` });
      }
      const otherActive = otherActiveCycle(id);
      if (!archived && existing.status === "Active" && otherActive) {
        return sendJson(res, 409, { success: false, message: `Close or archive "${otherActive.name}" before unarchiving this active cycle.` });
      }
      let remarks = remark ? appendRemark(existing.remarks, `${archived ? "Archive" : "Unarchive"}: ${remark}`) : existing.remarks;
      if (remarks.length > 10000) return sendJson(res, 400, { success: false, message: "Remarks exceed 10,000 characters." });
      // Archive copies the cycle's Delegation into Previous_Delegation and
      // moves its Appraisal Sheet into Payroll Data before the cycle is
      // flagged; if either fails the cycle stays Closed. The copy runs after
      // the sheet's checks and before the move, and is an upsert, so a retry
      // after a failed move is safe.
      let delegationCopied = null;
      const copyDelegation = async () => {
        delegationCopied = await copyDelegationToHistory(tables, existing, actor);
      };
      const moved = archived ? await moveSheetToPayroll(tables, existing, actor, copyDelegation) : null;
      // A cycle with no sheet rows skips the move, so copy here.
      if (archived && !delegationCopied) await copyDelegation();
      if (moved && moved.moved) remarks = appendRemark(remarks, `${SHEET_ARCHIVE_MARK} (${moved.moved} row(s))`);
      const row = { ROWID: id, archived, changed_by: actor, changed_at: now };
      if (remark || (moved && moved.moved)) row.remarks = remarks;
      await tables.cycles.updateRow(row);
      const updated = { ...existing, archived, remarks, changedBy: actor, changedAt: now };
      const archiveMessage = (moved && moved.moved
        ? `Cycle archived. ${moved.moved} Appraisal Sheet row(s) moved to Payroll Data (${moved.inserted} added, ${moved.updated} updated) and removed from the Appraisal Sheet.`
        : archived ? "Cycle archived." : "Cycle unarchived.") +
        (delegationCopied && delegationCopied.copied
          ? ` ${delegationCopied.copied} Delegation row(s) saved to Previous Delegation.`
          : "");
      await writeAudit(tables.audit, { actor, source: "cycle", cycle: updated, action: archived ? "Cycle archived" : "Cycle unarchived", details: { kind: "cycle", action: archived ? "Cycle archived" : "Cycle unarchived", message: archiveMessage, cycleName: updated.name, ...(moved ? { sheetMoved: moved } : {}), ...(delegationCopied ? { delegationCopied } : {}), ...(remark ? { newRemarks: `${archived ? "Archive" : "Unarchive"}: ${remark}` } : {}) } });
      return sendJson(res, 200, { success: true, data: { ...updated, sheetMoved: moved, delegationCopied } });
    }

    if (action === "cancel") {
      const reason = String(body.reason || "").trim();
      if (!reason || reason.length > 1000) return sendJson(res, 400, { success: false, message: "Give a reason for cancelling (up to 1,000 characters)." });
      if (existing.archived || !["Upcoming", "Active"].includes(existing.status)) {
        return sendJson(res, 409, { success: false, message: "Only Upcoming or Active cycles can be cancelled." });
      }
      const remarks = appendRemark(existing.remarks, `Cancelled: ${reason.replace(/\|/g, "/")}`);
      if (remarks.length > 10000) return sendJson(res, 400, { success: false, message: "Remarks exceed 10,000 characters." });
      const row = withOptionalColumns(columns, { ROWID: id, status: "Cancelled", remarks, changed_by: actor, changed_at: now }, { cancel_reason: reason });
      await tables.cycles.updateRow(row);
      if (existing.status === "Active") {
        await clearEligibilityRows(tables, id);
        await bumpAccessVersion(req, a, "Active cycle cancelled: " + existing.name);
      }
      const updated = { ...existing, status: "Cancelled", remarks, cancelReason: reason, changedBy: actor, changedAt: now };
      await writeAudit(tables.audit, { actor, source: "cycle", cycle: updated, action: "Cycle cancelled", oldValue: existing.status, newValue: "Cancelled", details: { kind: "cycle", action: "Cycle cancelled", message: `Cycle cancelled (was ${existing.status}). Reason: ${reason}`, cycleName: updated.name, newRemarks: `Cancelled: ${reason}` } });
      return sendJson(res, 200, { success: true, data: updated });
    }

    if (action === "delete") {
      // Compare dates in IST (the business time zone), not UTC.
      if (existing.start && todayLocal() >= existing.start) {
        return sendJson(res, 409, { success: false, message: "A cycle can only be deleted before its start date." });
      }
      if (existing.status !== "Upcoming") return sendJson(res, 409, { success: false, message: "Only Upcoming cycles can be deleted." });
      const relatedPayroll = (await getAllRows(tables.payroll)).some((row) => String(row.appraisal_cycle_name || "") === id);
      if (relatedPayroll) return sendJson(res, 409, { success: false, message: "Cycles with payroll records cannot be deleted." });
      await tables.cycles.deleteRow(id);
      await writeAudit(tables.audit, { actor, source: "cycle", cycle: existing, action: "Cycle deleted", details: { kind: "cycle", action: "Cycle deleted", message: "Cycle deleted before its start date.", cycleName: existing.name } });
      return sendJson(res, 200, { success: true, data: { id } });
    }
  }

  return sendJson(res, 404, { success: false, message: "The requested payroll/cycle operation was not found." });
}

module.exports = async function payrollCycleApi(req, res) {
  // A preflight that reaches the function is answered before any auth.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  try {
    const resource = String(getQuery(req).resource || "");
    const method = String(req.method || "GET").toUpperCase();
    // These GET endpoints are deliberately readable by any authenticated app
    // user (see requirePayrollAccess). Do not run delegation-based access checks
    // before them: a valid Tech-Ed session with no current delegation must still
    // be able to load the active cycle used to resolve its own budget.
    const cycleMetadataRead =
      method === "GET" &&
      (resource === "schema" || resource === "cycles" || resource === "locations");
    const publicSessionRead = resource === "session";
    const a = cycleMetadataRead || publicSessionRead
      ? { dryRun: true, enforced: false, scope: { all: false } }
      : await checkAccess(req);

    const identity = await requireIdentity(req);
    if (!identity) return sendJson(res, 401, { success: false, message: "Sign in with a Catalyst app user account to continue." });

    // `return await` so errors thrown inside routeRequest reach the catch below
    // (a bare `return routeRequest(...)` left them as unhandled rejections).
    if (resource === "session") return await routeRequest(req, res, identity, resource, a);
    if (resource === "schema" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "cycles" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "eligibility" && (req.method === "GET" || req.method === "POST")) return await routeRequest(req, res, identity, resource, a);
    if (resource === "generate-sheet" && req.method === "POST") return await routeRequest(req, res, identity, resource, a);
    if (resource === "locations" && (req.method === "GET" || req.method === "POST")) return await routeRequest(req, res, identity, resource, a);
    if (resource === "feedback" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "audit" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "history" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "payroll" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "validate" && req.method === "POST") return await routeRequest(req, res, identity, resource, a);
    if (resource === "commit" && req.method === "POST") return await routeRequest(req, res, identity, resource, a);
    if (resource === "undo" && req.method === "POST") return await routeRequest(req, res, identity, resource, a);
    if (resource === "import" && req.method === "POST") return await routeRequest(req, res, identity, resource, a);
    if (resource.startsWith("cycles/") && req.method === "POST") return await routeRequest(req, res, identity, resource, a);
    return sendJson(res, 404, { success: false, message: "The requested operation was not found." });
  } catch (error) {
    if (error instanceof access.HttpError) {
      return sendJson(res, error.status || 403, { success: false, message: error.message, enforced: true });
    }
    console.error(JSON.stringify({
      function: "payrollcycleapi",
      error: error.message,
      stack: error.stack,
    }));
    const status = error instanceof ApiError ? error.status : 500;
    return sendJson(res, status, {
      success: false,
      message: error.message || "Payroll service failed.",
      ...(error.code ? { code: error.code } : {}),
    });
  }
};

module.exports._internals = {
  mapPayroll,
  normalizeCycle,
  toPayrollRow,
  validateUpload,
};