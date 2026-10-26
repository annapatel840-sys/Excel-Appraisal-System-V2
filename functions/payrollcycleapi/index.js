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
const OPTIONAL_CYCLE_COLUMNS = ["cycle_type", "process", "effective_date", "cancel_reason"];
const BUSINESS_TZ = "Asia/Kolkata";

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

function cycleTypeOf(name) {
  const lower = String(name || "").toLowerCase();
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
  constructor(message, status = 400) {
    super(message);
    this.status = status;
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

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
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
  if (resource.startsWith("cycles/") || (resource === "locations" && method === "POST")) {
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
  if (["eligibility", "generate-sheet"].includes(resource) && method === "POST") {
    access.requireScreen(a, resource === "eligibility" ? "employeeMaster" : "cycleMaster", "edit");
    return;
  }
  if (["validate", "commit", "undo"].includes(resource) && method === "POST") {
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
  };
}

async function syncEligibilityRows(tables, cycle, actor = "") {
  if (!cycle?.id) throw new ApiError("Select an appraisal cycle before loading eligibility.", 400);

  const [masterRows, existingRows] = await Promise.all([
    getAllRows(tables.employeeMaster),
    getAllRows(tables.eligibility),
  ]);
  const cycleRows = existingRows.filter(
    (row) => String(row.appraisal_cycle_id || "") === String(cycle.id),
  );
  const activeMasters = masterRows.filter((row) =>
    String(row.emp_status || row.status || "Active").trim().toLowerCase() === "active"
  );
  const activeByRowId = new Map(
    activeMasters.map((row) => [String(row.ROWID || row.rowid || ""), row]),
  );
  const existingByMasterId = new Map(
    cycleRows.map((row) => [String(row.employee_master_id || ""), row]),
  );
  const inactiveRows = cycleRows.filter(
    (row) => !activeByRowId.has(String(row.employee_master_id || "")),
  );
  // Eligibility_List only ever holds the Active cycle. Rows left behind by any
  // other cycle (e.g. closed before this clean-up existed) are stale and would
  // collide on the unique emp_id column, so remove them before inserting.
  const staleRows = existingRows.filter(
    (row) => String(row.appraisal_cycle_id || "") !== String(cycle.id),
  );
  const toDelete = [...inactiveRows, ...staleRows];
  await deleteEligibilityRowsById(
    tables,
    toDelete.map((row) => rowId(row)),
  );

  const rowsToInsert = [];
  const now = nowLocal();
  for (const employee of activeMasters) {
    const masterId = String(employee.ROWID || employee.rowid || "");
    const empId = String(employee.emp_id || "").trim();
    if (!masterId || !empId) continue;
    if (existingByMasterId.has(masterId)) continue;

    rowsToInsert.push({
      appraisal_cycle_id: String(cycle.id),
      employee_master_id: masterId,
      emp_id: empId,
      eligibility_status: "Pending",
      eligibility_reason: "Awaiting criteria",
      eligibility_source: "System",
      change_tag: "New",
      evaluated_at: now,
      updated_by: String(actor || "System").slice(0, 60),
      eligibility_updated_at: now,
    });
  }
  for (let index = 0; index < rowsToInsert.length; index += 100) {
    await tables.eligibility.insertRows(rowsToInsert.slice(index, index + 100));
  }
  return { created: rowsToInsert.length, removed: inactiveRows.length, staleRemoved: staleRows.length, activeEmployees: activeMasters.length };
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
  if (String(cycle.status || "").trim().toLowerCase() === "active" && !cycle.archived) {
    await syncEligibilityRows(tables, cycle, actor);
  }
  const [masterRows, eligibilityRows] = await Promise.all([
    getAllRows(tables.employeeMaster),
    getAllRows(tables.eligibility),
  ]);
  const masterById = new Map(
    masterRows.map((row) => [String(row.ROWID || row.rowid || ""), row]),
  );
  return eligibilityRows
    .filter((row) => String(row.appraisal_cycle_id || "") === String(cycle.id))
    .map((row) => {
      const master = masterById.get(String(row.employee_master_id || ""));
      return master ? shapeEligibilityRow(row, master) : null;
    })
    .filter(Boolean);
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

async function generateAppraisalSheet(tables, cycle, actor) {
  if (!cycle?.id) throw new ApiError("Select an appraisal cycle before generating the sheet.", 400);
  if (String(cycle.status || "").trim().toLowerCase() !== "active" || cycle.archived || cycle.hidden) {
    throw new ApiError("Generate the Appraisal Sheet only for the Active appraisal cycle.", 409);
  }

  const cycleEligibilityRows = await getEligibilityRows(tables, cycle, actor);
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
  const [sheetRows, employeeMasterRows, payrollRows, feedbackRows] = await Promise.all([
    getAllRows(tables.employees),
    getAllRows(tables.employeeMaster),
    getAllRows(tables.payroll),
    getAllRows(tables.feedback),
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
  payrollRows.forEach((row) => {
    const masterId = referenceText(row.emp_id ?? row.employee_master_id);
    const payrollCycle = referenceText(
      row.appraisal_cycle_name ?? row.appraisal_cycle_id ?? row.cycle_id ?? row.appraisal_year,
    ).toLowerCase();
    if (masterId && cycleKeys.has(payrollCycle)) {
      payrollByMasterId.set(masterId, row);
    }
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
    [cycle.id, cycle.sourceRowId, cycle.name]
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
  for (const employee of eligibleRows) {
    const masterId = String(employee.employeeMasterRowId || "");
    const empId = String(employee.empId || "").trim();
    const existing = byKey.get(`master:${masterId}`) || byKey.get(`emp:${empId.toLowerCase()}`);
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
        // Existing Appraisal Sheet input is authoritative after generation.
        // Seed new rows from payroll, and fill only blank values on reruns.
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
      employee.appraiser_tech_ed,
      employeeMasterRows,
    );
    if (
      appraiserReference &&
      /^\d+$/.test(appraiserReference) &&
      (!appraisalSheetColumns || appraisalSheetColumns.has("appraiser_tech_ed"))
    ) {
      payload.appraiser_tech_ed = appraiserReference;
    }
    // Appraisal_Sheet.comp_manager is text ("EMP001 - Name"), set from the
    // Delegation value on Employee_Master; by default the Tech-ED is the Comp
    // Manager. A rerun keeps a Comp Manager already saved on the sheet.
    const compManagerText = String(employee.comp_manager ?? "").trim() ||
      String(employee.appraiser_tech_ed ?? "").trim();
    if (
      compManagerText &&
      !/^\d+$/.test(compManagerText) &&
      (!existing || !String(existing.comp_manager || "").trim()) &&
      (!appraisalSheetColumns || appraisalSheetColumns.has("comp_manager"))
    ) payload.comp_manager = compManagerText.slice(0, 30);
    if (existing) {
      await tables.employees.updateRow(payload);
      updated += 1;
    } else {
      await tables.employees.insertRow(payload);
      created += 1;
    }
  }

  await writeAudit(tables.audit, {
    actor,
    source: "cycle",
    cycle,
    action: "Appraisal Sheet generated",
    details: {
      kind: "cycle",
      action: "Appraisal Sheet generated",
      message: `Generated ${created} new and refreshed ${updated} existing Appraisal Sheet rows from Eligibility List.`,
      cycleName: cycle.name,
      created,
      updated,
      eligible: eligibleRows.length,
    },
  });
  return { cycleId: cycle.id, cycleName: cycle.name, created, updated, eligible: eligibleRows.length };
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
  return { cycle: selectedCycle, rows: validated };
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

async function syncFeedbackToAppraisalSheet(tables, cycle, actor = "", uploadedValuesByEmpId = new Map()) {
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
      .map((value) => referenceText(value))
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
    if (!cycleIds.has(feedbackCycleId) && !cycleIds.has(feedbackCycleId.toLowerCase())) return;
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
  for (const sheetRow of sheetRows) {
    const sheetCycleId = referenceText(valueOf(sheetRow, "cycle_id", "appraisal_cycle_id", "appraisal_cycle_name"));
    if (sheetCycleId !== referenceText(cycle.id) && sheetCycleId !== referenceText(cycle.sourceRowId)) continue;
    const masterId = referenceText(valueOf(sheetRow, "emp_master_row_id", "employee_master_id"));
    const empId = referenceText(valueOf(sheetRow, "emp_id", "employee_id")).toLowerCase();
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
      if (value !== undefined && value !== null && String(value).trim() !== "") payload[destination] = value;
    }
    if (Object.keys(payload).length === 1) {
      skipped += 1;
      continue;
    }
    await tables.employees.updateRow(payload);
    updated += 1;
  }

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
  return { updated, matched, skipped };
}

async function importRows(tables, body, actor = "") {
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

  let succeeded = 0;
  let failed = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let firstEffective = "";
  const rows = [];

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
    const master = screen === "fb"
      ? employeeRows.find((row) => String(row.emp_id || "").trim().toLowerCase() === empId.toLowerCase())
      : null;
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
        if (columns.has("hike_pct") && payload.hike_amount !== undefined) {
          const master = employeeRows.find((row) => String(row.emp_id || "").trim().toLowerCase() === empId.toLowerCase());
          const base = Number(master?.current_salary || master?.base_pay || 0);
          payload.hike_pct = base > 0 ? Number(((Number(payload.hike_amount) || 0) / base * 100).toFixed(4)) : Number(payload.hike_pct || 0);
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

    const storedReference = (value) => {
      if (value && typeof value === "object") {
        return String(value.ROWID ?? value.rowid ?? value.id ?? value.ID ?? value.value ?? "").trim();
      }
      return String(value ?? "").trim();
    };
    const existing = existingRows.find((row) => {
      const storedEmp = row.emp_ID ?? row.emp_id ?? "";
      const storedEmpKey = storedReference(storedEmp);
      const sameEmp = screen === "fb"
        ? storedEmpKey === String(master ? rowId(master) : "").trim()
        : storedEmpKey.toLowerCase() === empId.toLowerCase();
      if (!sameEmp) return false;
      if (screen === "fb") {
        const storedCycle = storedReference(row.appraisal_cycle_name);
        const targetCycleId = String(rowCycle?.id || rowCycle?.sourceRowId || cycleId || "").trim();
        return storedCycle === targetCycleId;
      }
      if (screen !== "sheet") return true;
      return !columns.has("appraisal_year") || String(row.appraisal_year || "").trim() === cycle.name;
    });

    try {
      if (existing) {
        await targetTable.updateRow({ ROWID: rowId(existing), ...payload });
        updatedCount += 1;
      } else {
        await targetTable.insertRow(payload);
        insertedCount += 1;
      }
      succeeded += 1;
      if (!firstEffective && payload.Effective_Date) firstEffective = String(payload.Effective_Date);
      rows.push({ row: rowNumber, ok: true, reason: "", badFields: [] });
    } catch (error) {
      failed += 1;
      const reason = error?.message || "Feedback & Rating row could not be saved.";
      console.error("Import row failed:", { screen, row: rowNumber, empId, reason });
      rows.push({ row: rowNumber, ok: false, reason, badFields: [] });
    }
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

async function getFeedbackData(tables, query) {
  const [feedbackRows, masterRows, cycleRows, auditRows] = await Promise.all([
    getAllRows(tables.feedback),
    getAllRows(tables.employeeMaster),
    getAllRows(tables.cycles),
    getAllRows(tables.audit),
  ]);
  const masterByRowId = new Map();
  const masterByEmpId = new Map();
  masterRows.forEach((row) => {
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
  const batches = shapeFeedbackBatches(auditRows).filter((b) => !onlyCycle || b.cid === onlyCycle);
  return { cycles, rows, batches };
}

async function routeRequest(req, res, identity, resource, a) {
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
    const activeCycle = cycles.find((item) =>
      String(item.status || "").trim().toLowerCase() === "active" &&
      ![true, 1, "true", "1", "yes"].includes(
        typeof item.archived === "string" ? item.archived.trim().toLowerCase() : item.archived,
      ) &&
      ![true, 1, "true", "1", "yes"].includes(
        typeof item.hidden === "string" ? item.hidden.trim().toLowerCase() : item.hidden,
      )
    );
    // Explicit old cycle IDs must not bypass the Active-cycle boundary.
    const cycle = activeCycle && (!queryCycleId || queryCycleId === activeCycle.id)
      ? activeCycle
      : null;
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
    return sendJson(res, 200, {
      success: true,
      data: {
        records: data,
        meta: { cycleId: cycle.id, cycleName: cycle.name, total: data.length },
      },
    });
  }

  if (resource === "eligibility" && req.method === "POST") {
    const body = await readBody(req);
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
    const result = await generateAppraisalSheet(tables, cycle, actor);
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
    const data = await getFeedbackData(tables, query);
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
      });
    }
    return sendJson(res, 200, { success: true, data });
  }

  if (resource === "audit" && req.method === "GET") {
    const auditRows = await getAllRows(tables.audit);
    const cycles = (await getAllRows(tables.cycles)).map(normalizeCycle);
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
    return sendJson(res, 200, { success: true, data: entries });
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
      .sort((a, b) => String(b.uploaded).localeCompare(String(a.uploaded)));
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
      getAllRows(tables.payroll),
      getAllRows(tables.cycles),
      getAllRows(tables.employeeMaster),
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
    });
  }

  if (resource === "validate" && req.method === "POST") {
    const body = await readBody(req);
    const result = await validateUpload(tables, body);
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
    const rejected = result.rows.filter((row) => !row.ok);
    const masterRows = await getAllRows(tables.employeeMaster);
    const masterByEmpId = new Map(masterRows.map((row) => [String(row.emp_id || "").trim().toLowerCase(), row]));
    const existingRows = await getAllRows(tables.payroll);
    const existingByKey = new Map(existingRows.map((row) => [
      `${String(row.emp_id || "").trim()}|${String(row.appraisal_cycle_name || "").trim()}`,
      row,
    ]));

    let succeeded = 0;
    let inserted = 0;
    let updated = 0;
    for (const item of valid) {
      const payrollRow = item.payrollRow;
      const master = masterByEmpId.get(String(item.empId || payrollRow.emp_id || "").trim().toLowerCase()) || masterRows.find(
        (row) => String(row.ROWID ?? row.rowid ?? "").trim() === String(payrollRow.emp_id).trim(),
      );
      if (!master) throw new ApiError(`Employee ${item.empId || payrollRow.emp_id} was removed during validation. Re-validate the file.`, 409);
      const masterRowId = String(master.ROWID ?? master.rowid ?? "").trim();
      const cycleRowId = String(payrollRow.appraisal_cycle_name ?? "").trim();
      const key = `${masterRowId}|${cycleRowId}`;
      const existing = existingByKey.get(key);
      try {
        if (existing) {
          await tables.payroll.updateRow({ ROWID: rowId(existing), ...payrollRow });
          updated += 1;
        } else {
          await tables.payroll.insertRow(payrollRow);
          inserted += 1;
        }
        succeeded += 1;
      } catch (error) {
        const reason = error?.message || "Payroll row could not be saved.";
        item.ok = false;
        item.reason = reason;
        item.badFields = [];
      }
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
      data: { succeeded, failed: result.rows.filter((row) => !row.ok).length, total: result.rows.length, batchId: body.batchId, rows: result.rows },
    });
  }

  if (resource === "import" && req.method === "POST") {
    const body = await readBody(req);
    const result = await importRows(tables, body, actor);
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
      return { name, type, process, start: start || null, end: end || null, effective: effective || start, error };
    };
    const optionalValues = (fields) => ({ cycle_type: fields.type, process: fields.process, effective_date: fields.effective || null });
    // Until effective_date exists, a "No process" cycle keeps its effective
    // date in start_date (the screen shows start as the effective date).
    const storedStart = (fields) => fields.start || (!columns.has("effective_date") && fields.process === "None" ? fields.effective : null);
    const appendRemark = (current, entry) => (current ? `${current} | ${entry}` : entry);
    // Only one cycle may be Active: access scoping follows the Active cycle.
    const otherActiveCycle = (id) => cycles.find((cycle) => cycle.status === "Active" && cycle.id !== id && !cycle.archived);

    if (action === "create") {
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
      const row = withOptionalColumns(columns, {
        cycle_name: fields.name, start_date: storedStart(fields), end_date: fields.end, status: "Upcoming",
        remarks, changed_by: actor, changed_at: now, archived: false,
      }, optionalValues(fields));
      const created = await tables.cycles.insertRow(row);
      const cycle = normalizeCycle({ ...row, ...created });
      await writeAudit(tables.audit, { actor, source: "cycle", cycle, action: "Created cycle", details: { kind: "cycle", action: "Created cycle", message: `Cycle created as Upcoming (${fields.type}, ${fields.process === "None" ? "no process" : fields.process + " process"}).`, cycleName: cycle.name, newRemarks: cycle.remarks } });
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
      const row = withOptionalColumns(columns, {
        ROWID: id, cycle_name: fields.name, start_date: storedStart(fields), end_date: fields.end, changed_by: actor, changed_at: now,
      }, optionalValues(fields));
      await tables.cycles.updateRow(row);
      const updated = { ...existing, name: fields.name, start: storedStart(fields) || "", end: fields.end || "", changedBy: actor, changedAt: now };
      if (columns.has("cycle_type")) updated.type = fields.type;
      if (columns.has("process")) updated.process = fields.process;
      if (columns.has("effective_date")) updated.effective = fields.effective || "";
      const before = { name: existing.name, type: existing.type, process: existing.process, effective: existing.effective, start: existing.start, end: existing.end };
      const after = { name: updated.name, type: updated.type, process: updated.process, effective: updated.effective, start: updated.start, end: updated.end };
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
      const otherActive = otherActiveCycle(id);
      if (!archived && existing.status === "Active" && otherActive) {
        return sendJson(res, 409, { success: false, message: `Close or archive "${otherActive.name}" before unarchiving this active cycle.` });
      }
      const remarks = remark ? appendRemark(existing.remarks, `${archived ? "Archive" : "Unarchive"}: ${remark}`) : existing.remarks;
      if (remarks.length > 10000) return sendJson(res, 400, { success: false, message: "Remarks exceed 10,000 characters." });
      const row = { ROWID: id, archived, changed_by: actor, changed_at: now };
      if (remark) row.remarks = remarks;
      await tables.cycles.updateRow(row);
      const updated = { ...existing, archived, remarks, changedBy: actor, changedAt: now };
      await writeAudit(tables.audit, { actor, source: "cycle", cycle: updated, action: archived ? "Cycle archived" : "Cycle unarchived", details: { kind: "cycle", action: archived ? "Cycle archived" : "Cycle unarchived", message: archived ? "Cycle archived." : "Cycle unarchived.", cycleName: updated.name, ...(remark ? { newRemarks: `${archived ? "Archive" : "Unarchive"}: ${remark}` } : {}) } });
      return sendJson(res, 200, { success: true, data: updated });
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
    return sendJson(res, status, { success: false, message: error.message || "Payroll service failed." });
  }
};

module.exports._internals = {
  mapPayroll,
  normalizeCycle,
  toPayrollRow,
  validateUpload,
};