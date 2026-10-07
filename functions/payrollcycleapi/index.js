"use strict";

/* ACCESS CONTROL: ./accessCore.js is a byte-for-byte copy of
   functions/accessapi/accessCore.js and MUST stay identical to it
   (every Catalyst function deploys separately). Edit the accessapi copy,
   then copy it here. See docs/ACCESS_SPEC.md. */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

const TABLES = {
  employees: "74008000000039094",
  employeeMaster: "74008000000035727",
  payroll: "74008000000035326",
  cycles: "74008000000034190",
  audit: "74008000000034940",
};
const PAGE_SIZE = 200;
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
    { name: "Appraisal_Cycle", id: TABLES.cycles },
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
  empName: "emp_name",
  designation: "designation",
  compManager: "comp_manager",
  superManager: "super_manager",
  managerMail: "manager_mail",
  superManagerMail: "super_manager_mail",
  appraiser: "appraiser",
  basePay: "base_pay",
  targetPB: "target_pb",
  rbPaid: "rb_paid",
  joiningBonus: "joining_bonus",
  rbMonth: "rb_month",
  pbPaid: "pb_paid",
  pbMonth: "pb_month",
  allocPB: "alloc_pb",
  allocInst: "alloc_inst",
  newPB: "new_pb",
  newPBInst: "new_pb_inst",
  newRB: "new_rb",
  hikeAmt: "hike_amt",
  tpbNext: "target_pb_next_year",
  totalPB: "total_pb",
  totalBonus: "total_bonus",
  hikePct: "hike_pct",
  newBasePay: "new_base_pay",
  totalCtc: "total_ctc",
  promo: "promo",
  newTitle: "new_title",
  remarks: "remarks",
};
const NUMERIC_FIELDS = new Set([
  "basePay",
  "targetPB",
  "rbPaid",
  "joiningBonus",
  "pbPaid",
  "allocPB",
  "allocInst",
  "newPB",
  "newPBInst",
  "newRB",
  "hikeAmt",
  "tpbNext",
  "totalPB",
  "totalBonus",
  "hikePct",
  "newBasePay",
  "totalCtc",
]);
const MAX_TEXT_LENGTH = {
  empName: 100,
  designation: 100,
  compManager: 100,
  superManager: 100,
  managerMail: 255,
  superManagerMail: 255,
  appraiser: 100,
  rbMonth: 20,
  pbMonth: 20,
  promo: 20,
  newTitle: 100,
  remarks: 10000,
};

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
  if ((resource === "cycles" || resource === "schema") && method === "GET") return;
  if (resource.startsWith("cycles/")) {
    access.requireScreen(a, "cycleMaster", "edit");
    return;
  }
  if (["payroll", "audit", "history"].includes(resource) && method === "GET") {
    access.requireScreen(a, "payroll", "view");
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

function normalizeCycle(row) {
  const id = rowId(row) || String(row.id || row.ID || "").trim();
  const name = String(
    row.cycle_name ||
      row.cycleName ||
      row.name ||
      row.appraisal_year ||
      row.appraisalYear ||
      "",
  ).trim();
  return {
    id,
    name,
    start: row.start_date || row.startDate || "",
    end: row.end_date || row.endDate || "",
    status: row.status || "Upcoming",
    remarks: row.remarks || "",
    changedBy: row.changed_by || "",
    changedAt: row.changed_at || "",
    archived: row.archived === true || row.archived === "true",
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

function normalizeMoney(value, key) {
  if (value === undefined || value === null || value === "") return 0;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").replace(/[₹$]/g, "").trim());
  if (!Number.isFinite(number) || number < 0 || number > Number.MAX_SAFE_INTEGER) {
    throw new ApiError(`${key} must be a non-negative number.`);
  }
  return Math.round(number);
}

function toPayrollRow(input, cycleId, batchId, fileName) {
  const empId = String(input.empId || "").trim();
  if (!empId) throw new ApiError("Employee ID is required.");
  if (empId.length > 50) throw new ApiError("Employee ID must be 50 characters or fewer.");

  const row = {
    emp_id: empId,
    appraisal_cycle_id: cycleId,
    source_batch: batchId,
    source_file: fileName,
  };
  Object.entries(PAYROLL_FIELDS).forEach(([key, column]) => {
    if (NUMERIC_FIELDS.has(key)) {
      row[column] = normalizeMoney(input[key], key);
    } else {
      row[column] = normalizeText(input[key], key);
    }
  });

  // Calculated values are accepted from corrected historical files when
  // supplied. Blank calculated cells are derived from the entry values.
  if (input.totalPB === undefined || input.totalPB === null || String(input.totalPB).trim() === "")
    row.total_pb = row.alloc_pb + row.new_pb;
  if (input.totalBonus === undefined || input.totalBonus === null || String(input.totalBonus).trim() === "")
    row.total_bonus = row.total_pb + row.new_rb;
  if (input.hikePct === undefined || input.hikePct === null || String(input.hikePct).trim() === "")
    row.hike_pct = row.base_pay > 0 ? Number(((row.hike_amt / row.base_pay) * 100).toFixed(4)) : 0;
  if (input.newBasePay === undefined || input.newBasePay === null || String(input.newBasePay).trim() === "")
    row.new_base_pay = row.base_pay + row.hike_amt;
  if (input.totalCtc === undefined || input.totalCtc === null || String(input.totalCtc).trim() === "")
    row.total_ctc = row.new_base_pay + row.total_bonus;
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
    changed_at: new Date().toISOString().replace("T", " ").slice(0, 19),
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
  };
}

function mapPayroll(row, cycleById) {
  const cycleId = String(row.appraisal_cycle_id || row.appraisalCycleId || row.cycle_id || row.cycleId || "").trim();
  const cycle = cycleById.get(cycleId);
  const num = (...keys) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== "") return Number(row[key]) || 0;
    }
    return 0;
  };
  const text = (...keys) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null) return String(row[key]);
    }
    return "";
  };
  const basePay = num("base_pay", "current_annual_base_pay");
  const hikeAmt = num("hike_amt", "hike_amount");
  const totalBonus = num("total_bonus");
  return {
    ...row,
    id: rowId(row),
    empId: text("emp_id"),
    appraisalYear: text("appraisal_year", "APPRAISAL_YEAR") || cycle?.name || "",
    cycle: text("appraisal_year", "APPRAISAL_YEAR") || cycle?.name || "",
    basePay,
    allocatedPb: num("allocated_pb", "alloc_pb"),
    allocatedPbInstallment: num("allocated_pb_installment", "alloc_inst"),
    performanceBonus: num("performance_bonus", "new_pb"),
    performanceBonusInstallment: num("performance_bonus_installment", "new_pb_inst"),
    retentionBonus: num("retention_bonus", "new_rb"),
    totalPB: num("total_pb"),
    joiningBonus: num("joining_bonus"),
    totalBonus,
    hikeAmt,
    hikePct: num("hike_pct"),
    promo: text("promotion", "promo"),
    newTitle: text("title", "new_title"),
    targetPerformanceBonus: num("target_performance_bonus", "target_pb_next_year"),
    newCtc: num("new_ctc", "total_ctc") || basePay + hikeAmt + totalBonus,
    managerRating: text("manager_rating"),
    rating: text("rating"),
    empName: text("emp_name"),
    designation: text("designation"),
    compManager: text("comp_manager"),
    superManager: text("super_manager"),
    managerMail: text("manager_mail"),
    batch: text("source_batch"),
    cycleId,
    sourceFile: text("source_file"),
    createdTime: text("CREATEDTIME"),
  };
}

async function validateUpload(tables, body) {
  const cycleId = String(body.cycleId || "");
  const sourceBatch = String(body.batchId || "").trim();
  const sourceFile = String(body.fileName || "");
  const records = body.records;
  if (!cycleId) throw new ApiError("An appraisal cycle is required.");
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
  const cycle = cycleRows.map(normalizeCycle).find((item) => item.id === cycleId);
  if (!cycle) throw new ApiError("The selected appraisal cycle no longer exists.", 404);
  if (cycle.archived) throw new ApiError("Payroll cannot be uploaded to an archived cycle.", 409);

  const masterByEmpId = new Map();
  masterRows.forEach((row) => {
    const key = String(row.emp_id || "").trim().toLowerCase();
    if (key) masterByEmpId.set(key, row);
  });
  const existingByKey = new Map();
  payrollRows.forEach((row) => {
    const key = `${String(row.emp_id || "").trim().toLowerCase()}|${String(row.appraisal_cycle_id || "")}`;
    existingByKey.set(key, row);
  });
  const seen = new Set();
  const validated = records.map((record, index) => {
    const input = record && typeof record === "object" && !Array.isArray(record) ? record : {};
    const rowNumber = Number(input.row) || index + 2;
    const empId = String(input.empId || "").trim();
    const errors = [];
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push("Row data must be an object.");
    }
    const key = `${empId.toLowerCase()}|${cycleId}`;
    if (!empId) errors.push("Employee ID is required.");
    else if (!masterByEmpId.has(empId.toLowerCase())) errors.push("Employee ID not found in Employee Master.");
    if (seen.has(key)) errors.push("Duplicate Employee ID within this file for the selected cycle.");
    seen.add(key);

    let payrollRow;
    try {
      payrollRow = toPayrollRow(input, cycleId, sourceBatch, sourceFile);
    } catch (error) {
      errors.push(error.message);
    }
    if (cycle.status === "Closed" && !existingByKey.has(key)) {
      errors.push("New payroll rows cannot be added to a closed cycle.");
    }
    return {
      row: rowNumber,
      ok: errors.length === 0,
      reason: errors.join(" "),
      badFields: errors.length
        ? Array.from(new Set(errors.flatMap((message) => {
            if (message.startsWith("Employee ID") || message.startsWith("Duplicate Employee ID")) return ["empId"];
            return Object.keys(PAYROLL_FIELDS).filter((field) =>
              message.startsWith(`${field} `) || message.startsWith(`${field} exceeds`),
            );
          })))
        : [],
      payrollRow,
      operation: existingByKey.has(key) ? "update" : "insert",
    };
  });
  return { cycle, rows: validated };
}

async function getImportColumnSet(table) {
  const result = await table.getPagedRows({ maxRows: 1 });
  const row = Array.isArray(result?.data) && result.data.length ? result.data[0] : {};
  return new Set(Object.keys(row).filter((name) => !SCHEMA_SYSTEM_COLUMNS.has(String(name).toUpperCase())));
}

const IMPORT_FIELD_MAP = {
  fb: {
    empId: "emp_id",
    managerRating: "manager_rating",
    managerFeedback: "manager_feedback",
    rrPercent: "rr_percent",
    interviewCount: "interview_count",
    grossMargin: "gross_margin",
    costCenter: "cost_center_client",
    clientManager: "client_manager",
    clientRating: "client_rating",
    clientFeedback: "client_feedback",
    atRisk: "at_risk",
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
  "rrPercent", "interviewCount", "grossMargin", "clientRating",
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

async function importRows(tables, body) {
  const screen = String(body.screen || "").trim().toLowerCase();
  if (!["fb", "sheet"].includes(screen)) throw new ApiError("Unsupported upload type.");
  const cycleId = String(body.cycleId || "").trim();
  const cycleRows = await getAllRows(tables.cycles);
  const cycle = cycleId
    ? cycleRows.map(normalizeCycle).find((item) => item.id === cycleId)
    : null;
  if (screen === "sheet" && !cycle) {
    throw new ApiError("The selected appraisal cycle no longer exists.", 404);
  }
  if (cycle?.archived) throw new ApiError("The selected cycle is archived.", 409);

  const targetTable = screen === "fb" ? tables.employees : tables.payroll;
  const columns = await getImportColumnSet(targetTable);
  const fieldMap = IMPORT_FIELD_MAP[screen];
  const records = Array.isArray(body.records) ? body.records : [];
  if (!records.length || records.length > MAX_UPLOAD_ROWS) throw new ApiError("Upload must contain between 1 and " + MAX_UPLOAD_ROWS + " rows.");

  const employeeRows = await getAllRows(tables.employeeMaster);
  const employeeIds = new Set(employeeRows.map((row) => String(row.emp_id || "").trim().toLowerCase()).filter(Boolean));
  const existingRows = await getAllRows(targetTable);

  let succeeded = 0;
  let failed = 0;
  const rows = [];

  for (const input of records) {
    const rowNumber = Number(input?.row) || rows.length + 2;
    const empId = String(input?.empId || "").trim();
    const errors = [];
    if (!empId) errors.push("Employee ID is required.");
    else if (!employeeIds.has(empId.toLowerCase())) errors.push("Employee ID not found in Employee Master.");

    const payload = {};
    if (!errors.length) {
      for (const [key, column] of Object.entries(fieldMap)) {
        if (input[key] === undefined) continue;
        if (!columns.has(column)) {
          if (key !== "empId") errors.push("Database column " + column + " is not available for this upload.");
          continue;
        }
        try {
          payload[column] = normalizeImportValue(key, input[key]);
        } catch (error) {
          errors.push(error.message);
        }
      }
      if (columns.has("emp_id")) payload.emp_id = empId;
      if (screen === "sheet") {
        if (columns.has("appraisal_year")) payload.appraisal_year = cycle.name;
        if (columns.has("appraisal_cycle_id")) payload.appraisal_cycle_id = cycle.id;
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

    const existing = existingRows.find((row) => {
      const sameEmp = String(row.emp_id || "").trim().toLowerCase() === empId.toLowerCase();
      if (!sameEmp) return false;
      if (screen !== "sheet") return true;
      return !columns.has("appraisal_year") || String(row.appraisal_year || "").trim() === cycle.name;
    });

    if (existing) {
      await targetTable.updateRow({ ROWID: rowId(existing), ...payload });
    } else {
      await targetTable.insertRow(payload);
    }
    succeeded += 1;
    rows.push({ row: rowNumber, ok: true, reason: "", badFields: [] });
  }

  return { succeeded, failed, total: records.length, batchId: String(body.batchId || ""), rows };
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

    const cycleById = new Map(cycles.map((row) => [rowId(row), normalizeCycle(row)]));
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
      data: visibleRows.map((row) => mapPayroll(row, cycleById)),
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
    const auditRows = await getAllRows(tables.audit);
    if (auditRows.some((row) => String(row.batch_id || "") === batchId)) {
      throw new ApiError("This batch ID has already been used. Revalidate the file to create a new batch.", 409);
    }
    const valid = result.rows.filter((row) => row.ok);
    const rejected = result.rows.filter((row) => !row.ok);
    const masterRows = await getAllRows(tables.employeeMaster);
    const masterByEmpId = new Map(masterRows.map((row) => [String(row.emp_id || "").trim().toLowerCase(), row]));
    const existingRows = await getAllRows(tables.payroll);
    const existingByKey = new Map(existingRows.map((row) => [
      `${String(row.emp_id || "").trim().toLowerCase()}|${String(row.appraisal_cycle_id || "")}`,
      row,
    ]));

    let succeeded = 0;
    let inserted = 0;
    let updated = 0;
    for (const item of valid) {
      const payrollRow = item.payrollRow;
      const master = masterByEmpId.get(String(payrollRow.emp_id).toLowerCase());
      if (!master) throw new ApiError(`Employee ${payrollRow.emp_id} was removed during validation. Re-validate the file.`, 409);
      const key = `${String(payrollRow.emp_id).toLowerCase()}|${String(payrollRow.appraisal_cycle_id)}`;
      const existing = existingByKey.get(key);
      if (existing) {
        await tables.payroll.updateRow({ ROWID: rowId(existing), ...payrollRow });
        updated += 1;
      } else {
        await tables.payroll.insertRow(payrollRow);
        inserted += 1;
      }
      succeeded += 1;
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
        failed: rejected.length,
      },
    });
    return sendJson(res, 200, {
      success: true,
      data: { succeeded, failed: rejected.length, total: result.rows.length, batchId: body.batchId, rows: result.rows },
    });
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
    const validDates = (start, end) => validDate(start) && validDate(end) && end > start;
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    if (action === "create") {
      const name = String(body.name || "").trim();
      const start = String(body.start || "");
      const end = String(body.end || "");
      const remarks = String(body.remarks || "").trim();
      if (!name || name.length > 100 || remarks.length > 10000 || !validDates(start, end)) {
        return sendJson(res, 400, { success: false, message: "Provide a cycle name (up to 100 characters), remarks (up to 10,000 characters), and valid start/end dates; end date must be after start date." });
      }
      if (cycles.some((cycle) => cycle.name.toLowerCase() === name.toLowerCase())) {
        return sendJson(res, 409, { success: false, message: "An appraisal cycle with that name already exists." });
      }
      const created = await tables.cycles.insertRow({
        cycle_name: name,
        start_date: start,
        end_date: end,
        status: "Upcoming",
        remarks,
        changed_by: actor,
        changed_at: now,
        archived: false,
      });
      const cycle = normalizeCycle({ ...created, cycle_name: name, start_date: start, end_date: end, status: "Upcoming", remarks, changed_by: actor, changed_at: now, archived: false });
      await writeAudit(tables.audit, { actor, source: "cycle", cycle, action: "Created cycle", details: { kind: "cycle", action: "Created cycle", message: "Cycle created as Upcoming.", cycleName: cycle.name, newRemarks: cycle.remarks } });
      return sendJson(res, 201, { success: true, data: cycle });
    }

    if (!existing || !id) return sendJson(res, 404, { success: false, message: "Appraisal cycle not found." });

    if (action === "update") {
      const name = String(body.name || "").trim();
      const start = String(body.start || "");
      const end = String(body.end || "");
      if (!name || name.length > 100 || !validDates(start, end)) {
        return sendJson(res, 400, { success: false, message: "Provide a cycle name (up to 100 characters) and valid start/end dates; end date must be after start date." });
      }
      if (cycles.some((cycle) => cycle.id !== id && cycle.name.toLowerCase() === name.toLowerCase())) {
        return sendJson(res, 409, { success: false, message: "An appraisal cycle with that name already exists." });
      }
      await tables.cycles.updateRow({ ROWID: id, cycle_name: name, start_date: start, end_date: end, changed_by: actor, changed_at: now });
      const updated = { ...existing, name, start, end, changedBy: actor, changedAt: now };
      await writeAudit(tables.audit, { actor, source: "cycle", cycle: updated, action: "Cycle edited", details: { kind: "cycle", action: "Cycle edited", message: "Cycle name or dates updated.", cycleName: name } });
      return sendJson(res, 200, { success: true, data: updated });
    }

    if (action === "remarks") {
      const remarks = String(body.remarks || "");
      if (remarks.length > 10000) return sendJson(res, 400, { success: false, message: "Remarks exceed 10,000 characters." });
      await tables.cycles.updateRow({ ROWID: id, remarks, changed_by: actor, changed_at: now });
      const updated = { ...existing, remarks, changedBy: actor, changedAt: now };
      await writeAudit(tables.audit, { actor, source: "cycle", cycle: updated, action: "Remarks changed", details: { kind: "cycle", action: "Remarks changed", message: "Cycle remarks updated.", cycleName: updated.name, newRemarks: remarks } });
      return sendJson(res, 200, { success: true, data: updated });
    }

    if (action === "status") {
      const status = String(body.status || "");
      if (!["Upcoming", "Active", "Closed"].includes(status)) return sendJson(res, 400, { success: false, message: "Status must be Upcoming, Active, or Closed." });
      if (existing.archived && status === "Active") return sendJson(res, 409, { success: false, message: "Unarchive the cycle before activating it." });
      const otherActive = cycles.find((cycle) =>
        cycle.status === "Active" && cycle.id !== id && !cycle.archived,
      );
      if (status === "Active" && otherActive) {
        return sendJson(res, 409, { success: false, message: `Archive "${otherActive.name}" before activating another cycle.` });
      }
      await tables.cycles.updateRow({ ROWID: id, status, changed_by: actor, changed_at: now });
      if (status !== existing.status) await bumpAccessVersion(req, a, "Cycle status changed: " + existing.name);
      const updated = { ...existing, status, changedBy: actor, changedAt: now };
      await writeAudit(tables.audit, { actor, source: "cycle", cycle: updated, action: "Status changed", details: { kind: "cycle", action: "Status changed", message: `Cycle status changed from ${existing.status} to ${status}.`, cycleName: updated.name } });
      return sendJson(res, 200, { success: true, data: updated });
    }

    if (action === "archive") {
      if (typeof body.archived !== "boolean") return sendJson(res, 400, { success: false, message: "Archived must be true or false." });
      const archived = body.archived;
      const otherActive = cycles.find((cycle) => cycle.status === "Active" && cycle.id !== id && !cycle.archived);
      if (!archived && existing.status === "Active" && otherActive) {
        return sendJson(res, 409, { success: false, message: `Archive "${otherActive.name}" before unarchiving this active cycle.` });
      }
      await tables.cycles.updateRow({ ROWID: id, archived, changed_by: actor, changed_at: now });
      const updated = { ...existing, archived, changedBy: actor, changedAt: now };
      await writeAudit(tables.audit, { actor, source: "cycle", cycle: updated, action: archived ? "Cycle archived" : "Cycle unarchived", details: { kind: "cycle", action: archived ? "Cycle archived" : "Cycle unarchived", message: archived ? "Cycle archived." : "Cycle unarchived.", cycleName: updated.name } });
      return sendJson(res, 200, { success: true, data: updated });
    }

    if (action === "delete") {
      if (new Date().toISOString().slice(0, 10) >= existing.start) {
        return sendJson(res, 409, { success: false, message: "A cycle can only be deleted before its start date." });
      }
      const relatedPayroll = (await getAllRows(tables.payroll)).some((row) => String(row.appraisal_cycle_id || "") === id);
      if (relatedPayroll) return sendJson(res, 409, { success: false, message: "Cycles with payroll records cannot be deleted." });
      await tables.cycles.deleteRow(id);
      if (existing.status === "Active") await bumpAccessVersion(req, a, "Active cycle deleted: " + existing.name);
      await writeAudit(tables.audit, { actor, source: "cycle", cycle: existing, action: "Cycle deleted", details: { kind: "cycle", action: "Cycle deleted", message: "Cycle deleted before its start date.", cycleName: existing.name } });
      return sendJson(res, 200, { success: true, data: { id } });
    }
  }

  return sendJson(res, 404, { success: false, message: "The requested payroll/cycle operation was not found." });
}

module.exports = async function payrollCycleApi(req, res) {
  try {
    // Access first: enforced → 401/403 (via catch); dry run → never refuses.
    const a = await checkAccess(req);

    const identity = await requireIdentity(req);
    if (!identity) return sendJson(res, 401, { success: false, message: "Sign in with a Catalyst app user account to continue." });

    // `return await` so errors thrown inside routeRequest reach the catch below
    // (a bare `return routeRequest(...)` left them as unhandled rejections).
    const resource = String(getQuery(req).resource || "");
    if (resource === "session") return await routeRequest(req, res, identity, resource, a);
    if (resource === "schema" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "cycles" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "audit" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "history" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "payroll" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "validate" && req.method === "POST") return await routeRequest(req, res, identity, resource, a);
    if (resource === "commit" && req.method === "POST") return await routeRequest(req, res, identity, resource, a);
    if (resource === "undo" && req.method === "POST") return await routeRequest(req, res, identity, resource, a);
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
