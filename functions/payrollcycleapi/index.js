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
  feedback: "74008000000022041",
  locations: "74008000000022481",
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
    { name: "Feedback_And_Rating", id: TABLES.feedback },
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
  empName: "emp_name", fyYear: "fy_year", basePay: "current_annual_base_pay",
  joiningBonus: "joining_bonus", performanceBonus: "performance_bonus", retentionBonus: "retention_bonus",
  hikePct: "hike_pct", hikeAmt: "hike_amount", totalCtcRewards: "total_CTC_with_rewards",
  totalRewardHikeAmt: "total_rewards_hike_amount", totalRewardHikePct: "total_reward_hike_pct",
  targetPerformanceAgreed: "target_performance_agreed", totalBonus: "total_bonus", newBasePay: "new_base_pay",
  rbPaid: "rb_to_be_paid", rbMonth: "month_rb", pbPaid: "pb_to_be_paid", pbMonth: "month_pb",
  tbPaid: "tb_to_be_paid", tbMonth: "month_tb",
};
const NUMERIC_FIELDS = new Set([
  "basePay","joiningBonus","performanceBonus","retentionBonus","hikePct","hikeAmt",
  "totalCtcRewards","totalRewardHikeAmt","totalRewardHikePct","targetPerformanceAgreed",
  "totalBonus","newBasePay","rbPaid","pbPaid","tbPaid",
]);
const MAX_TEXT_LENGTH = { empName: 100, fyYear: 20, rbMonth: 30, pbMonth: 30, tbMonth: 30 };

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
  return {
    id,
    sourceRowId,
    name,
    effective: row.effective_date || row.effectiveDate || "",
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

function normalizeNumber(value, key) {
  if (value === undefined || value === null || value === "") return 0;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").replace(/[₹$%]/g, "").trim());
  if (!Number.isFinite(number) || number < 0 || number > Number.MAX_SAFE_INTEGER) throw new ApiError(`${key} must be a non-negative number.`);
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
    feedback: datastore.table(TABLES.feedback),
    locations: datastore.table(TABLES.locations),
  };
}

function mapPayroll(row, cycleById, employeeById = new Map()) {
  const cycleId = String(row.appraisal_cycle_name || "").trim();
  const cycle = cycleById.get(cycleId);
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
    appraisalCycleName: cycle?.name || text("appraisal_cycle_name"), fyYear: text("fy_year"),
    basePay: num("current_annual_base_pay"), joiningBonus: num("joining_bonus"),
    performanceBonus: num("performance_bonus"), retentionBonus: num("retention_bonus"),
    hikePct: num("hike_pct"), hikeAmt: num("hike_amount"),
    totalCtcRewards: num("total_CTC_with_rewards"), totalRewardHikeAmt: num("total_rewards_hike_amount"),
    totalRewardHikePct: num("total_reward_hike_pct"), targetPerformanceAgreed: num("target_performance_agreed"),
    totalBonus: num("total_bonus"), newBasePay: num("new_base_pay"), rbPaid: num("rb_to_be_paid"),
    rbMonth: text("month_rb"), pbPaid: num("pb_to_be_paid"), pbMonth: text("month_pb"),
    tbPaid: num("tb_to_be_paid"), tbMonth: text("month_tb"), cycleId, createdTime: text("CREATEDTIME"),
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
    grossMargin: "gross_margin",
    managerFeedback: "manager_feedback",
    managerRating: "manager_rating",
    clientManager: "client_manager_feedback",
    clientFeedback: "client_feedback",
    clientRating: "client_rating",
    interviewCount: "interview_count",
    atRisk: "at_risk",
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

async function importRows(tables, body) {
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

  const targetTable = screen === "fb" ? tables.feedback : tables.payroll;
  // Feedback & Rating may be empty before the first upload, so do not infer
  // its schema from the first row. Use the exact database columns instead.
  const columns = screen === "fb"
    ? new Set([
        "emp_ID", "emp_name", "designation", "last_appraisal_date",
        "revenue_released", "gross_margin", "manager_feedback", "manager_rating",
        "client_manager_feedback", "client_feedback", "client_rating", "interview_count",
        "at_risk", "eligible_for_promotion", "new_title", "remarks", "fy_year",
        "appraisal_cycle_name",
      ])
    : await getImportColumnSet(targetTable);
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
        if (!columns.has(column)) {
          if (key !== "empId") errors.push("Database column " + column + " is not available for this upload.");
          continue;
        }
        try {
          // Excel serial dates are not valid Catalyst date values. Skip an
          // invalid last-appraisal value instead of rejecting the whole row.
          if (
            screen === "fb" &&
            key === "lastAppraisal" &&
            (
              typeof input[key] === "number" ||
              !/^\d{4}-\d{2}-\d{2}$/.test(String(input[key]).trim())
            )
          ) {
            continue;
          }
          payload[column] = normalizeImportValue(key, input[key]);
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
        if (columns.has("designation")) payload.designation = masterRowId;
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

    const existing = existingRows.find((row) => {
      const storedEmp = row.emp_ID ?? row.emp_id ?? "";
      const sameEmp = screen === "fb"
        ? String(storedEmp || "").trim() === String(master ? rowId(master) : "").trim()
        : String(storedEmp || "").trim().toLowerCase() === empId.toLowerCase();
      if (!sameEmp) return false;
      if (screen === "fb") {
        const storedCycle = String(row.appraisal_cycle_name || "").trim();
        const targetCycleId = String(rowCycle?.id || rowCycle?.sourceRowId || cycleId || "").trim();
        return storedCycle === targetCycleId;
      }
      if (screen !== "sheet") return true;
      return !columns.has("appraisal_year") || String(row.appraisal_year || "").trim() === cycle.name;
    });

    try {
      if (existing) {
        await targetTable.updateRow({ ROWID: rowId(existing), ...payload });
      } else {
        await targetTable.insertRow(payload);
      }
      succeeded += 1;
      rows.push({ row: rowNumber, ok: true, reason: "", badFields: [] });
    } catch (error) {
      failed += 1;
      const reason = error?.message || "Feedback & Rating row could not be saved.";
      console.error("Import row failed:", { screen, row: rowNumber, empId, reason });
      rows.push({ row: rowNumber, ok: false, reason, badFields: [] });
    }
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
    !resource.startsWith("cycles") &&
    resource !== "locations"
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

  if (resource === "locations" && req.method === "GET") {
    const rows = await getAllRows(tables.locations);
    const locations = rows
      .map((row) => ({
        id: String(row.ROWID || row.rowid || row.id || ""),
        location_name: String(row.location_name || "").trim(),
        location_code: String(row.location_code || "").trim(),
        address: String(row.address || "").trim(),
        currency_code: String(row.currency_code || "").trim(),
      }))
      .filter((location) => location.location_code)
      .sort((a, b) => a.location_name.localeCompare(b.location_name));
    return sendJson(res, 200, { success: true, data: locations });
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
      data: visibleRows.map((row) => mapPayroll(row, cycleById, employeeById)),
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
    const result = await importRows(tables, body);
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
    const validDates = (start, end) => validDate(start) && validDate(end) && end > start;
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    if (action === "create") {
      const name = String(body.name || "").trim();
      const effective = String(body.effective || "");
      const start = String(body.start || "");
      const end = String(body.end || "");
      const remarks = String(body.remarks || "").trim();
      if (!name || name.length > 100 || remarks.length > 10000 || !validDate(effective) || !validDates(start, end)) {
        return sendJson(res, 400, { success: false, message: "Provide a cycle name (up to 100 characters), remarks (up to 10,000 characters), and valid effective/start/end dates; end date must be after start date." });
      }
      if (cycles.some((cycle) => cycle.name.toLowerCase() === name.toLowerCase())) {
        return sendJson(res, 409, { success: false, message: "An appraisal cycle with that name already exists." });
      }
      const created = await tables.cycles.insertRow({
        cycle_name: name,
        effective_date: effective,
        start_date: start,
        end_date: end,
        status: "Upcoming",
        remarks,
        changed_by: actor,
        changed_at: now,
        archived: false,
      });
      const cycle = normalizeCycle({ ...created, cycle_name: name, effective_date: effective, start_date: start, end_date: end, status: "Upcoming", remarks, changed_by: actor, changed_at: now, archived: false });
      await writeAudit(tables.audit, { actor, source: "cycle", cycle, action: "Created cycle", details: { kind: "cycle", action: "Created cycle", message: "Cycle created as Upcoming.", cycleName: cycle.name, newRemarks: cycle.remarks } });
      return sendJson(res, 201, { success: true, data: cycle });
    }

    if (!existing || !id) return sendJson(res, 404, { success: false, message: "Appraisal cycle not found." });

    if (action === "update") {
      const name = String(body.name || "").trim();
      const effective = String(body.effective || "");
      const start = String(body.start || "");
      const end = String(body.end || "");
      if (!name || name.length > 100 || !validDate(effective) || !validDates(start, end)) {
        return sendJson(res, 400, { success: false, message: "Provide a cycle name (up to 100 characters) and valid start/end dates; end date must be after start date." });
      }
      if (cycles.some((cycle) => cycle.id !== id && cycle.name.toLowerCase() === name.toLowerCase())) {
        return sendJson(res, 409, { success: false, message: "An appraisal cycle with that name already exists." });
      }
      await tables.cycles.updateRow({ ROWID: id, cycle_name: name, effective_date: effective, start_date: start, end_date: end, changed_by: actor, changed_at: now });
      const updated = { ...existing, name, effective, start, end, changedBy: actor, changedAt: now };
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
      const relatedPayroll = (await getAllRows(tables.payroll)).some((row) => String(row.appraisal_cycle_name || "") === id);
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
    // Location Master is reference data needed by the Cycle Master dropdown.
    // Keep the endpoint authenticated through requireIdentity, but do not require
    // Compensation access-role resolution for this read-only lookup.
    const resource = String(getQuery(req).resource || "");

    // Session is the bootstrap endpoint used immediately after Catalyst login.
    // Do not resolve screen/action permissions before returning the signed-in
    // user, otherwise a valid Tech-Ed user with incomplete access mappings can
    // be blocked with 403 before the app can even finish authentication.
    const identity = await requireIdentity(req);
    if (!identity) return sendJson(res, 401, { success: false, message: "Sign in with a Catalyst app user account to continue." });

    const a = resource === "session"
      ? { enforced: false, dryRun: true }
      : resource === "locations" && req.method === "GET"
        ? { enforced: false, dryRun: true }
        : await checkAccess(req);

    // `return await` so errors thrown inside routeRequest reach the catch below
    // (a bare `return routeRequest(...)` left them as unhandled rejections).
    if (resource === "session") return await routeRequest(req, res, identity, resource, a);
    if (resource === "schema" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "cycles" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
    if (resource === "locations" && req.method === "GET") return await routeRequest(req, res, identity, resource, a);
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
