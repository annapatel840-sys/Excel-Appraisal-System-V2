"use strict";

/* ============================================================
   HISTORICAL IMPORT API (HR only)

   Loads previous-year data directly into storage for a past appraisal
   cycle (Closed or archived). No appraisal process runs: no Eligibility,
   Delegation, Appraisal Sheet, budget or letters.

     GET  ?resource=schema    field definitions for both file types
     GET  ?resource=cycles    past cycles (Closed / archived) to import into
     GET  ?resource=history   imports, newest first
     POST ?resource=validate  { type, cycleId, records }       check a file
     POST ?resource=commit    { type, cycleId, batchId, fileName, records,
                                chunkIndex, chunkCount }       import a chunk
     POST ?resource=undo      { batchId }                       undo an import

   type: "payroll"  -> Payroll_Data
         "feedback" -> Feedback_And_Rating
   A row that already exists for the same employee and cycle is replaced.
   Employees missing from Employee Master are added there as Inactive.
   Undo restores replaced rows and removes inserted rows; employees added
   as Inactive are kept (deleting them would cascade to other tables).
   ============================================================ */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

const TABLES = {
  employeeMaster: "74008000000035727",
  payroll: "74008000000035326",
  feedback: "74008000000022041",
  cycles: "74008000000034190",
  audit: "74008000000034940",
};
const PAGE_SIZE = 200;
const MAX_FILE_ROWS = 5000;
const MAX_CHUNK_ROWS = 250;
const WRITE_BATCH = 100;
const UNDO_DETAILS_LIMIT = 9000;
const BUSINESS_TZ = "Asia/Kolkata";

const SOURCE = {
  summary: "historical_import",
  undoData: "historical_import_undo",
  undone: "historical_import_undone",
};

/* ---------- File definitions ----------
   key: record key sent by the screen; label: template header;
   column: Data Store column; kind: text | number | int | date | check */
const FILE_TYPES = {
  payroll: {
    label: "Payroll",
    table: "payroll",
    empColumn: "emp_id",
    cycleColumn: "appraisal_cycle_name",
    fields: [
      { key: "empId", label: "Employee ID", required: true },
      { key: "empName", label: "Employee Name", column: "emp_name", kind: "text", max: 100 },
      { key: "appraisalCycleName", label: "Appraisal Cycle Name", kind: "check" },
      { key: "fyYear", label: "FY Year", column: "fy_year", kind: "text", max: 20 },
      { key: "basePay", label: "Current Annual Base Pay", column: "current_annual_base_pay", kind: "number" },
      { key: "joiningBonus", label: "Joining Bonus", column: "joining_bonus", kind: "int" },
      { key: "performanceBonus", label: "Performance Bonus", column: "performance_bonus", kind: "int" },
      { key: "retentionBonus", label: "Retention Bonus", column: "retention_bonus", kind: "int" },
      { key: "hikePct", label: "Hike%", column: "hike_pct", kind: "number", aliases: ["Hike %", "Hike Percent"] },
      { key: "hikeAmt", label: "Hike Amount", column: "hike_amount", kind: "int" },
      { key: "totalCtcRewards", label: "Total CTC with Rewards", column: "total_CTC_with_rewards", kind: "number" },
      { key: "totalRewardHikeAmt", label: "Total Reward Hike Amount", column: "total_rewards_hike_amount", kind: "numtext", max: 10 },
      { key: "totalRewardHikePct", label: "Total Reward Hike%", column: "total_reward_hike_pct", kind: "numtext", max: 10, aliases: ["Total Reward Hike %"] },
      { key: "targetPbNextYear", label: "Target Performance Bonus for Next Year", column: "target_performance_bonus_for_next_year", kind: "number", aliases: ["Target PB for Next Year"] },
      { key: "targetPbCriteria", label: "Target PB Criteria", column: "target_pb_criteria", kind: "text", max: 100 },
      { key: "totalBonus", label: "Total Bonus", column: "total_bonus", kind: "int" },
      { key: "newBasePay", label: "New Base Pay", column: "new_base_pay", kind: "number" },
      { key: "rbPaid", label: "RB to be paid", column: "rb_to_be_paid", kind: "number" },
      { key: "rbMonth", label: "Month(RB)", column: "month_rb", kind: "text", max: 30, aliases: ["Month (RB)"] },
      { key: "pbPaid", label: "PB to be paid", column: "pb_to_be_paid", kind: "number" },
      { key: "pbMonth", label: "Month(PB)", column: "month_pb", kind: "text", aliases: ["Month (PB)"] },
      { key: "tbPaid", label: "TB to be paid", column: "tb_to_be_paid", kind: "number" },
      { key: "tbMonth", label: "Month(TB)", column: "month_tb", kind: "text", aliases: ["Month (TB)"] },
    ],
  },
  feedback: {
    label: "Review and Feedback",
    table: "feedback",
    empColumn: "emp_ID",
    // emp_name is also a lookup to Employee_Master.
    empLookupColumns: ["emp_ID", "emp_name"],
    cycleColumn: "appraisal_cycle_name",
    batchColumn: "Upload_Batch",
    fields: [
      { key: "empId", label: "Employee ID", required: true },
      { key: "empName", label: "Employee Name", kind: "master" },
      { key: "designation", label: "Designation", column: "designation", kind: "text" },
      { key: "department", label: "Department", column: "Department", kind: "text", max: 30 },
      { key: "band", label: "Band", column: "Band", kind: "text" },
      { key: "fyYear", label: "FY Year", column: "fy_year", kind: "int" },
      { key: "lastAppraisal", label: "Last Appraisal Date", column: "last_appraisal_date", kind: "date" },
      { key: "grossMargin", label: "Gross Margin", column: "gross_margin", kind: "number" },
      { key: "managerFeedback", label: "Manager Feedback", column: "manager_feedback", kind: "text" },
      { key: "managerRating", label: "Manager Rating", column: "manager_rating", kind: "number" },
      { key: "rrPercent", label: "RR%", column: "revenue_released", kind: "number", aliases: ["RR %", "RR Percent", "Revenue Released"] },
      { key: "costCenterClient", label: "Cost Center/Client", column: "CostCenter_Client", kind: "text", aliases: ["Cost Center", "Client", "Cost Centre/Client"] },
      { key: "clientManagerName", label: "Client Manager", column: "Client_Manager", kind: "text", aliases: ["Client Manager Name"] },
      { key: "clientManagerFeedback", label: "Client Manager Feedback", column: "client_manager_feedback", kind: "text" },
      { key: "clientFeedback", label: "Client Feedback", column: "client_feedback", kind: "text" },
      { key: "clientRating", label: "Client Rating", column: "client_rating", kind: "text" },
      { key: "interviewCount", label: "Interview Count", column: "interview_count", kind: "int" },
      { key: "atRisk", label: "At Risk", column: "at_risk", kind: "text" },
      { key: "newTitle", label: "New Title", column: "new_title", kind: "text" },
      { key: "eligibleForPromotion", label: "Eligible for Promotion", column: "eligible_for_promotion", kind: "text" },
      { key: "techEd", label: "Tech ED", column: "Tech_ED", kind: "text", aliases: ["Appraiser / Tech ED", "Tech-ED"] },
      { key: "compManager", label: "Comp Manager", column: "Comp_Manager", kind: "text", aliases: ["Comp. Manager"] },
      { key: "remarks", label: "Remarks", column: "remarks", kind: "text" },
    ],
  },
};

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/* ---------- Helpers ---------- */

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function getQuery(req) {
  const url = new URL(req.url || "/", "http://localhost");
  return { ...Object.fromEntries(url.searchParams.entries()), ...(req.queryParams || {}) };
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
      if (body.length > 6_000_000) {
        reject(new ApiError("Request body exceeds the 6 MB limit.", 413));
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

function nowLocal(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function rowId(row) {
  return String((row && (row.ROWID ?? row.rowid)) || "").trim();
}

const norm = (value) => String(value ?? "").trim().toLowerCase();

// Lookup columns may come back as a ROWID string or an object holding it.
function refId(value) {
  if (value && typeof value === "object") {
    return String(value.ROWID ?? value.rowid ?? value.id ?? value.value ?? "").trim();
  }
  return String(value ?? "").trim();
}

async function getAllRows(table) {
  const rows = [];
  let nextToken;
  let moreRecords = true;
  while (moreRecords) {
    const options = { maxRows: PAGE_SIZE };
    if (nextToken) options.nextToken = nextToken;
    const result = await table.getPagedRows(options);
    rows.push(...(Array.isArray(result.data) ? result.data : []));
    nextToken = result.next_token || null;
    moreRecords = result.more_records === true && Boolean(nextToken);
  }
  return rows;
}

const isTruthy = (value) =>
  [true, 1, "true", "1", "yes"].includes(typeof value === "string" ? value.trim().toLowerCase() : value);

function normalizeCycle(row) {
  const rawStatus = String(row.status || "Upcoming").trim();
  const key = rawStatus.toLowerCase();
  return {
    id: rowId(row),
    name: String(row.cycle_name || "").trim(),
    status: key === "active" ? "Active" : key === "closed" ? "Closed" : key === "upcoming" ? "Upcoming" : rawStatus,
    archived: isTruthy(row.archived),
    effective: String(row.effective_date || row.start_date || "").slice(0, 10),
    start: String(row.start_date || "").slice(0, 10),
    end: String(row.end_date || "").slice(0, 10),
    past: /past cycle/i.test(String(row.remarks || "")),
  };
}

// Only finished cycles take historical data; the current process owns the rest.
function isPastCycle(cycle) {
  if (!cycle || cycle.status === "Cancelled") return false;
  return cycle.archived || cycle.status === "Closed";
}

async function findPastCycle(tables, cycleId) {
  const id = String(cycleId || "").trim();
  if (!id) throw new ApiError("Select an appraisal cycle.");
  const cycle = (await getAllRows(tables.cycles)).map(normalizeCycle).find((c) => c.id === id);
  if (!cycle) throw new ApiError("The selected appraisal cycle was not found.", 404);
  if (!isPastCycle(cycle)) {
    throw new ApiError(
      `${cycle.name} is ${cycle.status}. Historical import is only for Closed or archived cycles; the current cycle follows the normal process.`,
      409,
    );
  }
  return cycle;
}

function fileType(type) {
  const def = FILE_TYPES[String(type || "")];
  if (!def) throw new ApiError('Type must be "payroll" or "feedback".');
  return def;
}

/* ---------- Value parsing ---------- */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function isoDate(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD-Mon-YYYY or an Excel serial.
function parseDate(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0 || value >= 2958466) return "";
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = text.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return isoDate(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  if (/^\d+(\.\d+)?$/.test(text)) return parseDate(Number(text));
  return "";
}

function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const text = String(value ?? "").replace(/[₹,%\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return NaN;
  return Number(text);
}

const isBlank = (value) => value === undefined || value === null || String(value).trim() === "";

/* Turns one file record into column values. Returns { values, errors, warnings }.
   Fields present in the file with a blank cell are cleared (null) so the row is
   replaced by what the file says; fields absent from the file are left alone. */
function convertRecord(def, record, cycle) {
  const values = {};
  const errors = [];
  const warnings = [];
  for (const field of def.fields) {
    if (!field.column && field.kind !== "check") continue;
    if (!Object.prototype.hasOwnProperty.call(record, field.key)) continue;
    const raw = record[field.key];
    if (field.kind === "check") {
      if (!isBlank(raw) && norm(raw) !== norm(cycle.name) && String(raw).trim() !== cycle.id) {
        errors.push(`${field.label} "${raw}" does not match the selected cycle ${cycle.name}.`);
      }
      continue;
    }
    if (isBlank(raw)) {
      values[field.column] = null;
      continue;
    }
    if (field.kind === "number" || field.kind === "int" || field.kind === "numtext") {
      const number = parseNumber(raw);
      if (Number.isNaN(number)) {
        errors.push(`${field.label} "${raw}" is not a number.`);
        continue;
      }
      if (field.kind === "int") {
        if (!Number.isInteger(number)) warnings.push(`${field.label} ${number} rounded to ${Math.round(number)}.`);
        values[field.column] = Math.round(number);
      } else if (field.kind === "numtext") {
        const text = String(number);
        if (field.max && text.length > field.max) errors.push(`${field.label} is longer than ${field.max} characters.`);
        else values[field.column] = text;
      } else {
        values[field.column] = number;
      }
      continue;
    }
    if (field.kind === "date") {
      const date = parseDate(raw);
      if (!date) errors.push(`${field.label} "${raw}" is not a valid date.`);
      else values[field.column] = date;
      continue;
    }
    const text = String(raw).trim();
    if (field.max && text.length > field.max) {
      errors.push(`${field.label} is longer than ${field.max} characters.`);
      continue;
    }
    values[field.column] = text;
  }
  return { values, errors, warnings };
}

/* ---------- Validation (shared by validate and commit) ---------- */

async function loadContext(tables, def, cycle) {
  const [masterRows, targetRows] = await Promise.all([
    getAllRows(tables.employeeMaster),
    getAllRows(tables[def.table]),
  ]);
  const masterByEmpId = new Map();
  masterRows.forEach((row) => {
    const key = norm(row.emp_id);
    if (key) masterByEmpId.set(key, row);
  });
  const masterEmpIdByRowId = new Map(masterRows.map((row) => [rowId(row), norm(row.emp_id)]));
  // Existing rows of this cycle, by employee. The newest row wins when
  // older duplicates exist.
  const existingByEmpId = new Map();
  targetRows
    .filter((row) => refId(row[def.cycleColumn]) === cycle.id)
    .sort((a, b) => String(a.MODIFIEDTIME || "").localeCompare(String(b.MODIFIEDTIME || "")))
    .forEach((row) => {
      const empKey = masterEmpIdByRowId.get(refId(row[def.empColumn]));
      if (!empKey) return;
      const list = existingByEmpId.get(empKey) || [];
      list.push(row);
      existingByEmpId.set(empKey, list);
    });
  return { masterByEmpId, existingByEmpId };
}

function checkRecords(def, records, cycle, context) {
  const seen = new Map();
  return records.map((record, index) => {
    const rowNumber = Number(record?.row) || index + 2;
    const empId = String(record?.empId ?? "").trim();
    const name = String(record?.empName ?? "").trim();
    const result = { row: rowNumber, empId, name, status: "error", errors: [], warnings: [] };
    if (!empId) {
      result.errors.push("Employee ID is required.");
      return result;
    }
    const key = norm(empId);
    if (seen.has(key)) {
      result.errors.push(`Employee ${empId} appears more than once in this file (row ${seen.get(key)}).`);
      return result;
    }
    seen.set(key, rowNumber);
    const converted = convertRecord(def, record, cycle);
    result.errors.push(...converted.errors);
    result.warnings.push(...converted.warnings);
    const master = context.masterByEmpId.get(key);
    if (!master) {
      if (empId.length > 10) result.errors.push("Employee ID is longer than 10 characters.");
      else result.warnings.push("Not in Employee Master; will be added as Inactive.");
      result.newEmployee = true;
    } else if (!result.name) {
      result.name = String(master.emp_name || "");
    }
    const existing = context.existingByEmpId.get(key) || [];
    if (existing.length > 1) result.warnings.push(`${existing.length} rows exist for this cycle; the latest is replaced.`);
    if (result.errors.length) return result;
    result.status = existing.length ? "update" : "new";
    result.values = converted.values;
    return result;
  });
}

function summarize(rows) {
  return {
    total: rows.length,
    new: rows.filter((r) => r.status === "new").length,
    update: rows.filter((r) => r.status === "update").length,
    error: rows.filter((r) => r.status === "error").length,
    warning: rows.filter((r) => r.status !== "error" && r.warnings.length).length,
    newEmployees: rows.filter((r) => r.status !== "error" && r.newEmployee).length,
  };
}

function readRecords(body, limit) {
  const records = body.records;
  if (!Array.isArray(records) || records.length === 0) throw new ApiError("The file has no data rows.");
  if (records.length > limit) throw new ApiError(`Send at most ${limit} rows at a time.`);
  return records;
}

/* ---------- Audit ---------- */

async function insertAuditRows(tables, rows) {
  for (let index = 0; index < rows.length; index += WRITE_BATCH) {
    await tables.audit.insertRows(rows.slice(index, index + WRITE_BATCH));
  }
}

function auditRow({ actor, source, batchId, cycle, empId = "IMPORT", employeeName = "", fieldName, details }) {
  return {
    emp_id: String(empId).slice(0, 10),
    employee_name: String(employeeName).slice(0, 30),
    field_name: String(fieldName).slice(0, 20),
    old_value: "",
    new_value: "",
    changed_by: String(actor || "").slice(0, 50),
    changed_at: nowLocal(),
    source,
    batch_id: batchId,
    appraisal_year: String(cycle?.name || "").slice(0, 30),
    details: JSON.stringify(details),
  };
}

// Packs undo information into as few audit rows as fit the details column.
function packUndo(type, cycleId, inserted, previous) {
  const packs = [];
  let current = { type, cycleId, ins: [], upd: [] };
  const size = (pack) => JSON.stringify(pack).length;
  const push = (listName, item) => {
    current[listName].push(item);
    if (size(current) > UNDO_DETAILS_LIMIT) {
      current[listName].pop();
      packs.push(current);
      current = { type, cycleId, ins: [], upd: [] };
      current[listName].push(item);
    }
  };
  inserted.forEach((id) => push("ins", id));
  previous.forEach((row) => push("upd", row));
  if (current.ins.length || current.upd.length) packs.push(current);
  return packs;
}

function parseDetails(row) {
  try {
    return JSON.parse(row.details || "{}") || {};
  } catch {
    return {};
  }
}

/* ---------- Actions ---------- */

async function commitChunk(tables, body, actor) {
  const def = fileType(body.type);
  const cycle = await findPastCycle(tables, body.cycleId);
  const batchId = String(body.batchId || "").trim();
  if (!/^[A-Za-z0-9_-]{6,30}$/.test(batchId)) throw new ApiError("A valid import batch ID is required.");
  const records = readRecords(body, MAX_CHUNK_ROWS);
  const auditRows = await getAllRows(tables.audit);
  if (auditRows.some((row) => row.source === SOURCE.undone && row.batch_id === batchId)) {
    throw new ApiError("This import was undone; start a new import.", 409);
  }
  const otherBatch = auditRows.find((row) => row.source === SOURCE.summary && row.batch_id === batchId &&
    (parseDetails(row).type !== String(body.type) || parseDetails(row).cycleId !== cycle.id));
  if (otherBatch) throw new ApiError("This batch ID belongs to another import.", 409);

  const context = await loadContext(tables, def, cycle);
  const checked = checkRecords(def, records, cycle, context);
  const good = checked.filter((r) => r.status !== "error");

  // 1. Employees missing from Employee Master are added as Inactive.
  const toCreate = good.filter((r) => r.newEmployee);
  for (let index = 0; index < toCreate.length; index += WRITE_BATCH) {
    const slice = toCreate.slice(index, index + WRITE_BATCH);
    const created = await tables.employeeMaster.insertRows(slice.map((r) => ({
      emp_id: r.empId,
      emp_name: String(r.name || r.empId).slice(0, 30),
      emp_status: "Inactive",
    })));
    slice.forEach((r, i) => context.masterByEmpId.set(norm(r.empId), created[i] || {}));
  }

  // 2. Build inserts and replacements.
  const inserts = [];
  const updates = [];
  const previous = [];
  for (const r of good) {
    const master = context.masterByEmpId.get(norm(r.empId));
    const masterId = rowId(master);
    if (!masterId) {
      r.status = "error";
      r.errors.push("Employee Master row could not be created.");
      continue;
    }
    const values = { ...r.values };
    (def.empLookupColumns || [def.empColumn]).forEach((column) => { values[column] = masterId; });
    values[def.cycleColumn] = cycle.id;
    if (def.batchColumn) values[def.batchColumn] = batchId;
    if (def.table === "feedback" && cycle.effective && parseDate(cycle.effective)) {
      values.Effective_Date = parseDate(cycle.effective);
    }
    const existing = (context.existingByEmpId.get(norm(r.empId)) || []).slice(-1)[0];
    if (existing) {
      const before = { ROWID: rowId(existing) };
      Object.keys(values).forEach((column) => {
        const old = existing[column];
        before[column] = old === undefined ? null : old && typeof old === "object" ? refId(old) : old;
      });
      previous.push(before);
      updates.push({ ROWID: rowId(existing), ...values });
    } else {
      inserts.push(values);
    }
  }

  // 3. Write in batches; each batch records its own undo data right away.
  const table = tables[def.table];
  let inserted = 0;
  let updated = 0;
  for (let index = 0; index < inserts.length; index += WRITE_BATCH) {
    const created = await table.insertRows(inserts.slice(index, index + WRITE_BATCH));
    const ids = (created || []).map(rowId).filter(Boolean);
    inserted += ids.length;
    const packs = packUndo(body.type, cycle.id, ids, []);
    await insertAuditRows(tables, packs.map((details) => auditRow({
      actor, source: SOURCE.undoData, batchId, cycle, fieldName: "Undo data", details,
    })));
  }
  for (let index = 0; index < updates.length; index += WRITE_BATCH) {
    const packs = packUndo(body.type, cycle.id, [], previous.slice(index, index + WRITE_BATCH));
    await insertAuditRows(tables, packs.map((details) => auditRow({
      actor, source: SOURCE.undoData, batchId, cycle, fieldName: "Undo data", details,
    })));
    await table.updateRows(updates.slice(index, index + WRITE_BATCH));
    updated += Math.min(WRITE_BATCH, updates.length - index);
  }

  const skipped = checked.filter((r) => r.status === "error").length;
  const chunkIndex = Number(body.chunkIndex) || 0;
  const chunkCount = Number(body.chunkCount) || 1;
  await insertAuditRows(tables, [auditRow({
    actor,
    source: SOURCE.summary,
    batchId,
    cycle,
    employeeName: String(body.fileName || "").slice(0, 30),
    fieldName: `Historical ${def.table}`,
    details: {
      kind: "historical-import",
      action: `Historical ${def.label} import`,
      type: String(body.type),
      cycleId: cycle.id,
      cycleName: cycle.name,
      fileName: String(body.fileName || "").slice(0, 200),
      chunkIndex,
      chunkCount,
      inserted,
      updated,
      createdEmployees: toCreate.length,
      skipped,
      message: `${def.label} for ${cycle.name}: ${inserted} added, ${updated} replaced, ${toCreate.length} employee(s) added as Inactive, ${skipped} skipped.`,
    },
  })]);

  return {
    batchId,
    cycleId: cycle.id,
    cycleName: cycle.name,
    inserted,
    updated,
    createdEmployees: toCreate.length,
    skipped,
    errors: checked.filter((r) => r.status === "error").map((r) => ({ row: r.row, empId: r.empId, errors: r.errors })),
  };
}

function rowSeq(row) {
  try {
    return BigInt(rowId(row) || "0");
  } catch {
    return 0n;
  }
}

function groupHistory(auditRows) {
  const batches = new Map();
  auditRows.forEach((row) => {
    if (![SOURCE.summary, SOURCE.undone].includes(row.source)) return;
    const id = String(row.batch_id || "");
    const details = parseDetails(row);
    const batch = batches.get(id) || {
      batchId: id, type: "", cycleId: "", cycleName: "", fileName: "", by: "", at: "",
      inserted: 0, updated: 0, createdEmployees: 0, skipped: 0, chunks: 0, chunkCount: 0,
      undone: false, undoneAt: "", undoneBy: "",
    };
    if (row.source === SOURCE.undone) {
      batch.undone = true;
      batch.undoneAt = row.changed_at || "";
      batch.undoneBy = row.changed_by || "";
    } else {
      batch.type = details.type || batch.type;
      batch.cycleId = details.cycleId || batch.cycleId;
      batch.cycleName = details.cycleName || batch.cycleName;
      batch.fileName = details.fileName || batch.fileName;
      batch.by = batch.by || row.changed_by || "";
      const at = String(row.changed_at || row.CREATEDTIME || "");
      if (!batch.at || at < batch.at) batch.at = at;
      batch.lastAt = !batch.lastAt || at > batch.lastAt ? at : batch.lastAt;
      // Audit ROWIDs only grow, so they order imports even within one second.
      const seq = rowSeq(row);
      if (batch.lastSeq === undefined || seq > batch.lastSeq) batch.lastSeq = seq;
      if (batch.firstSeq === undefined || seq < batch.firstSeq) batch.firstSeq = seq;
      batch.inserted += Number(details.inserted) || 0;
      batch.updated += Number(details.updated) || 0;
      batch.createdEmployees += Number(details.createdEmployees) || 0;
      batch.skipped += Number(details.skipped) || 0;
      batch.chunks += 1;
      batch.chunkCount = Math.max(batch.chunkCount, Number(details.chunkCount) || 1);
    }
    batches.set(id, batch);
  });
  return [...batches.values()]
    .filter((b) => b.type)
    .sort((a, b) => (b.firstSeq > a.firstSeq ? 1 : b.firstSeq < a.firstSeq ? -1 : 0));
}

async function undoBatch(tables, body, actor) {
  const batchId = String(body.batchId || "").trim();
  if (!batchId) throw new ApiError("Choose an import to undo.");
  const auditRows = await getAllRows(tables.audit);
  const history = groupHistory(auditRows);
  const batch = history.find((b) => b.batchId === batchId);
  if (!batch) throw new ApiError("Import not found.", 404);
  if (batch.undone) throw new ApiError("This import has already been undone.", 409);
  // Undo restores values as they were before this import, so a later import
  // of the same data for the same cycle must be undone first.
  const later = history.find((b) => b.batchId !== batchId && !b.undone && b.type === batch.type &&
    b.cycleId === batch.cycleId && b.firstSeq > batch.lastSeq);
  if (later) {
    throw new ApiError(`A later ${FILE_TYPES[batch.type]?.label || batch.type} import for ${batch.cycleName} exists (${later.at}). Undo that one first.`, 409);
  }
  const def = fileType(batch.type);
  const table = tables[def.table];
  const packs = auditRows
    .filter((row) => row.source === SOURCE.undoData && row.batch_id === batchId)
    .map(parseDetails);
  const insertedIds = packs.flatMap((p) => p.ins || []);
  const previousRows = packs.flatMap((p) => p.upd || []);
  for (let index = 0; index < previousRows.length; index += WRITE_BATCH) {
    await table.updateRows(previousRows.slice(index, index + WRITE_BATCH));
  }
  const existingIds = new Set((await getAllRows(table)).map(rowId));
  const toDelete = insertedIds.filter((id) => existingIds.has(String(id)));
  for (let index = 0; index < toDelete.length; index += WRITE_BATCH) {
    await table.deleteRows(toDelete.slice(index, index + WRITE_BATCH));
  }
  const cycle = { id: batch.cycleId, name: batch.cycleName };
  await insertAuditRows(tables, [auditRow({
    actor,
    source: SOURCE.undone,
    batchId,
    cycle,
    employeeName: String(batch.fileName || "").slice(0, 30),
    fieldName: "Historical undo",
    details: {
      kind: "historical-import",
      action: "Historical import undone",
      type: batch.type,
      cycleId: batch.cycleId,
      cycleName: batch.cycleName,
      deleted: toDelete.length,
      restored: previousRows.length,
      message: `Undo removed ${toDelete.length} row(s) and restored ${previousRows.length} replaced row(s).`,
    },
  })]);
  return { batchId, deleted: toDelete.length, restored: previousRows.length };
}

/* ---------- Access ---------- */

function roleName(user) {
  return String(user?.role_details?.role_name || user?.role_name || "").trim().toLowerCase();
}

// HR only, whether access rules are enforced or not.
async function requireHR(req) {
  const userApp = catalyst.initialize(req);
  const user = await userApp.userManagement().getCurrentUser();
  if (!user || !user.user_id) throw new ApiError("Sign in to continue.", 401);
  const actor = user.display_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email_id || "";
  if (access.isEnforced()) {
    const a = await access.check(userApp, catalyst.initialize(req, { scope: "admin" }));
    // Only the HR role: other roles that see everyone (e.g. Org) are refused.
    if (a && a.role === "hr") return actor;
    throw new ApiError("Historical import is available to HR only.", 403);
  }
  const role = roleName(user).replace(/[^a-z0-9]/g, "");
  if (role === "hr" || role === "appadministrator") return actor;
  throw new ApiError("Historical import is available to HR only.", 403);
}

/* ---------- Handler ---------- */

module.exports = async function historicalImportApi(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  try {
    const actor = await requireHR(req);
    const resource = String(getQuery(req).resource || "");
    const method = String(req.method || "GET").toUpperCase();
    const datastore = catalyst.initialize(req, { scope: "admin" }).datastore();
    const tables = Object.fromEntries(Object.entries(TABLES).map(([key, id]) => [key, datastore.table(id)]));

    if (resource === "schema" && method === "GET") {
      const data = Object.fromEntries(Object.entries(FILE_TYPES).map(([key, def]) => [key, {
        label: def.label,
        fields: def.fields.map(({ key: k, label, required, aliases }) => ({ key: k, label, required: !!required, aliases: aliases || [] })),
      }]));
      return sendJson(res, 200, { success: true, data: { types: data, maxRows: MAX_FILE_ROWS, chunkRows: MAX_CHUNK_ROWS } });
    }
    if (resource === "cycles" && method === "GET") {
      const cycles = (await getAllRows(tables.cycles)).map(normalizeCycle).filter(isPastCycle)
        .sort((a, b) => String(b.effective || b.start).localeCompare(String(a.effective || a.start)));
      return sendJson(res, 200, { success: true, data: cycles });
    }
    if (resource === "history" && method === "GET") {
      const history = groupHistory(await getAllRows(tables.audit))
        .map(({ firstSeq, lastSeq, ...rest }) => rest);
      return sendJson(res, 200, { success: true, data: history });
    }
    if (resource === "validate" && method === "POST") {
      const body = await readBody(req);
      const def = fileType(body.type);
      const cycle = await findPastCycle(tables, body.cycleId);
      const records = readRecords(body, MAX_FILE_ROWS);
      const rows = checkRecords(def, records, cycle, await loadContext(tables, def, cycle))
        .map(({ values, ...rest }) => rest);
      return sendJson(res, 200, { success: true, data: { cycleId: cycle.id, cycleName: cycle.name, summary: summarize(rows), rows } });
    }
    if (resource === "commit" && method === "POST") {
      return sendJson(res, 200, { success: true, data: await commitChunk(tables, await readBody(req), actor) });
    }
    if (resource === "undo" && method === "POST") {
      return sendJson(res, 200, { success: true, data: await undoBatch(tables, await readBody(req), actor) });
    }
    return sendJson(res, 404, { success: false, message: "The requested operation was not found." });
  } catch (error) {
    if (error instanceof access.HttpError) {
      return sendJson(res, error.status || 403, { success: false, message: error.message });
    }
    const status = error instanceof ApiError ? error.status : 500;
    if (status >= 500) {
      console.error(JSON.stringify({ function: "historicalimportapi", error: error.message, stack: error.stack }));
    }
    return sendJson(res, status, { success: false, message: error.message || "Historical import failed." });
  }
};

module.exports._internals = { FILE_TYPES, parseDate, parseNumber, convertRecord, packUndo, groupHistory, isPastCycle };
