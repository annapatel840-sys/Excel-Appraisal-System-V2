"use strict";

/* ACCESS CONTROL: ./accessCore.js is a byte-for-byte copy of
   functions/accessapi/accessCore.js and MUST stay identical to it
   (every Catalyst function deploys separately). Edit the accessapi copy,
   then copy it here. See docs/ACCESS_SPEC.md. */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

/* ============================================================
   CORS
   Catalyst adds the CORS headers itself for the Authorized Domains
   (Authentication > Authorized Domains). Do not set them here: two
   Access-Control-Allow-Origin headers make the browser reject the
   response ("Failed to fetch").
   ============================================================ */

/* ============================================================
   CONSTANTS
   ============================================================ */
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

const SCHEMA_SYSTEM_COLUMNS = new Set([
  "ROWID",
  "CREATORID",
  "CREATEDTIME",
  "MODIFIEDTIME",
]);

function schemaLabel(name) {
  return String(name || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeSchemaTable(table) {
  const columns = Array.isArray(table?.column_details)
    ? table.column_details
        .filter(
          (column) =>
            !SCHEMA_SYSTEM_COLUMNS.has(
              String(column.column_name || "").toUpperCase(),
            ),
        )
        .sort(
          (a, b) =>
            Number(a.column_sequence || 0) - Number(b.column_sequence || 0),
        )
        .map((column) => ({
          name: String(column.column_name || ""),
          label: schemaLabel(column.column_name),
          type: String(column.data_type || "varchar").toLowerCase(),
          mandatory: Boolean(column.is_mandatory),
          unique: Boolean(column.is_unique),
          maxLength:
            column.max_length == null ? null : Number(column.max_length),
          decimalDigits:
            column.decimal_digits == null
              ? null
              : Number(column.decimal_digits),
        }))
    : [];
  return {
    id: String(table.table_id || table.id || ""),
    name: String(table.table_name || table.name || ""),
    modifiedTime: table.modified_time || "",
    columns,
  };
}

async function getProjectSchema(adminApp) {
  // NOTE: payrollColumns below must match the real payroll table columns.
  // It differs from PAYROLL_FIELDS (e.g. current_annual_base_pay vs base_pay) -
  // verify against your datastore and update whichever list is stale.
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

  return Promise.all(
    tables.map(async (meta) => {
      if (meta.name === "payroll") {
        return {
          id: String(meta.id),
          name: meta.name,
          columns: payrollColumns.map(([name, label, type]) => ({
            name,
            label,
            type,
            mandatory: name === "emp_id",
          })),
        };
      }
      const table = datastore.table(meta.id);
      const result = await table.getPagedRows({ maxRows: 1 });
      const row =
        Array.isArray(result?.data) && result.data.length ? result.data[0] : {};
      const columns = Object.keys(row)
        .filter(
          (name) => !SCHEMA_SYSTEM_COLUMNS.has(String(name).toUpperCase()),
        )
        .map((name) => {
          const value = row[name];
          let type = "text";
          if (typeof value === "number") type = "number";
          else if (typeof value === "boolean") type = "boolean";
          else if (value instanceof Date) type = "date";
          return { name, label: schemaLabel(name), type, mandatory: false };
        });
      return { id: String(meta.id), name: meta.name, columns };
    }),
  );
}

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const PAYROLL_FIELDS = {
  empName: "emp_name",
  fyYear: "fy_year",
  basePay: "current_annual_base_pay",
  joiningBonus: "joining_bonus",
  performanceBonus: "performance_bonus",
  retentionBonus: "retention_bonus",
  hikePct: "hike_pct",
  hikeAmt: "hike_amount",
  totalCtcRewards: "total_CTC_with_rewards",
  totalRewardHikeAmt: "total_rewards_hike_amount",
  totalRewardHikePct: "total_reward_hike_pct",
  targetPerformanceAgreed: "target_performance_agreed",
  totalBonus: "total_bonus",
  newBasePay: "new_base_pay",
  rbPaid: "rb_to_be_paid",
  rbMonth: "month_rb",
  pbPaid: "pb_to_be_paid",
  pbMonth: "month_pb",
  tbPaid: "tb_to_be_paid",
  tbMonth: "month_tb",
};
const NUMERIC_FIELDS = new Set([
  "basePay",
  "joiningBonus",
  "performanceBonus",
  "retentionBonus",
  "hikePct",
  "hikeAmt",
  "totalCtcRewards",
  "totalRewardHikeAmt",
  "totalRewardHikePct",
  "targetPerformanceAgreed",
  "totalBonus",
  "newBasePay",
  "rbPaid",
  "pbPaid",
  "tbPaid",
]);
const MAX_TEXT_LENGTH = {
  empName: 100,
  fyYear: 20,
  rbMonth: 30,
  pbMonth: 30,
  tbMonth: 30,
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/* ============================================================
   ACCESS CONTROL (docs/ACCESS_SPEC.md)

   session, cycles (GET)                      -> any signed-in user with a role
   payroll / audit / history (GET)            -> view on 'payroll'  (HR only)
   validate / commit / undo (POST)            -> edit on 'payroll'  (HR only)
   cycles/<action>/<id> (POST)                -> edit on 'cycleMaster' (HR only)
   Dry run (ACCESS_ENFORCE != 'true'): legacy role checks apply; refusals only logged.
   Enforced: the access object replaces those legacy checks.
   ============================================================ */

async function checkAccess(req) {
  const userApp = catalyst.initialize(req);
  const adminApp = catalyst.initialize(req, { scope: "admin" });

  try {
    return await access.check(userApp, adminApp);
  } catch (error) {
    if (access.isEnforced()) throw error;
    console.log("ACCESS dry-run: access check failed:", error && error.message);
    return { dryRun: true, enforced: false, denied: error };
  }
}

function requirePayrollAccess(a, resource, method) {
  if (resource === "session") return;
  if (
    (resource === "cycles" ||
      resource === "schema" ||
      resource === "locations") &&
    method === "GET"
  )
    return;
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

/* ============================================================
   REQUEST HELPERS
   ============================================================ */
function getQuery(req) {
  const url = new URL(req.url || "/", "http://localhost");
  const query = Object.fromEntries(url.searchParams.entries());
  return { ...query, ...(req.queryParams || {}) };
}

function readBody(req) {
  if (req.body && typeof req.body === "object")
    return Promise.resolve(req.body);
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

/* ============================================================
   USER / ROLE HELPERS
   ============================================================ */
function displayName(user) {
  return (
    user.display_name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.email_id ||
    ""
  );
}

function roleName(user) {
  return String(user.role_details?.role_name || user.role_name || "")
    .trim()
    .toLowerCase();
}

function isHR(user) {
  return roleName(user) === "hr";
}

function isTechEd(user) {
  return roleName(user)
    .replace(/[^a-z0-9]/g, "")
    .includes("teched");
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
    [firstName, lastName].filter(Boolean).join(" "),
  ]
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

// FIX: previously used substring matching (assigned.includes(value) / value.includes(assigned)),
// which let short names like "an" match "Anand". Now: exact match, or both first and last name
// present as whole words.
function employeeBelongsToCurrentUser(employee, user) {
  const assigned = String(employee?.appraiser_tech_ed || "")
    .trim()
    .toLowerCase();
  if (!assigned) return false;

  if (getCurrentUserMatchValues(user).some((value) => assigned === value))
    return true;

  const firstName = String(user?.first_name || "")
    .trim()
    .toLowerCase();
  const lastName = String(user?.last_name || "")
    .trim()
    .toLowerCase();
  if (!firstName || !lastName) return false;

  const words = new Set(assigned.split(/[^a-z0-9]+/).filter(Boolean));
  return words.has(firstName) && words.has(lastName);
}

/* ============================================================
   NORMALIZERS / PAYROLL ROW BUILDERS
   ============================================================ */
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
  const number =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/,/g, "").replace(/[₹$%]/g, "").trim());
  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number > Number.MAX_SAFE_INTEGER
  ) {
    throw new ApiError(`${key} must be a non-negative number.`);
  }
  return number;
}

function toPayrollRow(input, cycle, master) {
  const empId = String(input.empId || "").trim();
  if (!empId) throw new ApiError("Employee ID is required.");
  if (empId.length > 50)
    throw new ApiError("Employee ID must be 50 characters or fewer.");
  // emp_id, emp_name and appraisal_cycle_name are BIGINT lookup/FK fields.
  // Preserve the native Catalyst ROWID values; the Excel Employee ID is only
  // the business key used to find the master row.
  const employeeRowId = master?.ROWID ?? master?.rowid ?? "";
  const cycleRowId = cycle?.sourceRowId ?? cycle?.id ?? "";
  if (!employeeRowId)
    throw new ApiError(`Employee ${empId} has no valid Employee Master ROWID.`);
  if (!cycleRowId)
    throw new ApiError("The selected appraisal cycle has no valid ROWID.");
  const row = {
    emp_id: employeeRowId,
    emp_name: employeeRowId,
    appraisal_cycle_name: cycleRowId,
  };
  Object.entries(PAYROLL_FIELDS).forEach(([key, column]) => {
    // emp_name is a FK (set above); don't overwrite it with free text
    if (column === "emp_name") return;
    row[column] = NUMERIC_FIELDS.has(key)
      ? normalizeNumber(input[key], key)
      : normalizeText(input[key], key);
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

async function writeAudit(
  auditTable,
  {
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
  },
) {
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
  const employee = employeeById.get(
    String(row.emp_id || "")
      .trim()
      .toLowerCase(),
  );
  const businessEmpId = employee?.emp_id ?? "";
  const employeeName = employee?.emp_name || employee?.name || "";
  const num = (key) =>
    row[key] === undefined || row[key] === null || row[key] === ""
      ? 0
      : Number(row[key]) || 0;
  const text = (key) =>
    row[key] === undefined || row[key] === null ? "" : String(row[key]);
  return {
    ...row,
    id: rowId(row),
    // Payroll stores the Employee Master ROWID as the FK. Expose the
    // business Employee ID to the UI instead of the internal ROWID.
    emp_id: businessEmpId || text("emp_id"),
    emp_name: employeeName || text("emp_name"),
    appraisal_cycle_name: cycle?.name || text("appraisal_cycle_name"),
    empId: businessEmpId || text("emp_id"),
    empName: employeeName || text("emp_name"),
    appraisalCycleName: cycle?.name || text("appraisal_cycle_name"),
    fyYear: text("fy_year"),
    basePay: num("current_annual_base_pay"),
    joiningBonus: num("joining_bonus"),
    performanceBonus: num("performance_bonus"),
    retentionBonus: num("retention_bonus"),
    hikePct: num("hike_pct"),
    hikeAmt: num("hike_amount"),
    totalCtcRewards: num("total_CTC_with_rewards"),
    totalRewardHikeAmt: num("total_rewards_hike_amount"),
    totalRewardHikePct: num("total_reward_hike_pct"),
    targetPerformanceAgreed: num("target_performance_agreed"),
    totalBonus: num("total_bonus"),
    newBasePay: num("new_base_pay"),
    rbPaid: num("rb_to_be_paid"),
    rbMonth: text("month_rb"),
    pbPaid: num("pb_to_be_paid"),
    pbMonth: text("month_pb"),
    tbPaid: num("tb_to_be_paid"),
    tbMonth: text("month_tb"),
    cycleId,
    createdTime: text("CREATEDTIME"),
  };
}

/* ============================================================
   VALIDATE UPLOAD (payroll)
   ============================================================ */
async function validateUpload(tables, body) {
  const selectedCycleId = String(body.cycleId || "").trim();
  const sourceBatch = String(body.batchId || "").trim();
  const sourceFile = String(body.fileName || "");
  const records = body.records;
  if (!selectedCycleId) throw new ApiError("An appraisal cycle is required.");
  if (!sourceBatch || sourceBatch.length > 80)
    throw new ApiError("A valid upload batch ID is required.");
  if (
    !Array.isArray(records) ||
    records.length === 0 ||
    records.length > MAX_UPLOAD_ROWS
  ) {
    throw new ApiError(
      `Upload must contain between 1 and ${MAX_UPLOAD_ROWS} rows.`,
    );
  }
  if (sourceFile.length > 255)
    throw new ApiError("The file name exceeds 255 characters.");

  const [cycleRows, masterRows, payrollRows] = await Promise.all([
    getAllRows(tables.cycles),
    getAllRows(tables.employeeMaster),
    getAllRows(tables.payroll),
  ]);
  const cycles = cycleRows.map(normalizeCycle);
  const selectedCycle = cycles.find((item) => item.id === selectedCycleId);
  if (!selectedCycle)
    throw new ApiError("The selected appraisal cycle no longer exists.", 404);

  const cycleById = new Map(cycles.map((item) => [item.id, item]));
  const cycleByName = new Map(
    cycles.map((item) => [item.name.toLowerCase(), item]),
  );
  const masterByEmpId = new Map();
  masterRows.forEach((row) => {
    const key = String(row.emp_id || "")
      .trim()
      .toLowerCase();
    if (key) masterByEmpId.set(key, row);
  });

  const existingByKey = new Map();
  const masterRowIdByEmpId = new Map(
    masterRows
      .map((row) => [
        String(row.emp_id || "")
          .trim()
          .toLowerCase(),
        String(row.ROWID ?? row.rowid ?? "").trim(),
      ])
      .filter(([empId, rowIdValue]) => empId && rowIdValue),
  );
  const employeeKey = (value) => {
    const raw = String(value ?? "")
      .trim()
      .toLowerCase();
    return masterRowIdByEmpId.get(raw) || raw;
  };
  payrollRows.forEach((row) => {
    const key = `${employeeKey(row.emp_id)}|${String(row.appraisal_cycle_name || "")}`;
    existingByKey.set(key, row);
  });

  const seen = new Set();
  const validated = records.map((record, index) => {
    const input =
      record && typeof record === "object" && !Array.isArray(record)
        ? record
        : {};
    const rowNumber = Number(input.row) || index + 2;
    const empId = String(input.empId || "").trim();
    const requestedCycle = String(input.appraisalCycleName || "").trim();
    const rowCycle = requestedCycle
      ? cycleById.get(requestedCycle) ||
        cycleByName.get(requestedCycle.toLowerCase()) ||
        null
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
      errors.push(
        `Appraisal Cycle Name "${requestedCycle}" was not found. Create this cycle before uploading payroll.`,
      );
    }

    const master = masterByEmpId.get(empId.toLowerCase());
    const masterRowId = String(master?.ROWID ?? master?.rowid ?? "").trim();
    const key = `${masterRowId || empId.toLowerCase()}|${rowCycle?.id || ""}`;
    if (seen.has(key))
      errors.push(
        "Duplicate Employee ID within this file for the same appraisal cycle.",
      );
    seen.add(key);

    let payrollRow;
    try {
      if (!rowCycle) throw new ApiError("A valid appraisal cycle is required.");
      payrollRow = toPayrollRow(input, rowCycle, master);
    } catch (error) {
      errors.push(error.message);
    }

    return {
      row: rowNumber,
      ok: errors.length === 0,
      reason: errors.join(" "),
      badFields: errors.length
        ? Array.from(
            new Set(
              errors.flatMap((message) => {
                if (
                  message.startsWith("Employee ID") ||
                  message.startsWith("Duplicate Employee ID")
                )
                  return ["empId"];
                if (message.startsWith("Appraisal Cycle Name"))
                  return ["appraisalCycleName"];
                return Object.keys(PAYROLL_FIELDS).filter(
                  (field) =>
                    message.startsWith(`${field} `) ||
                    message.startsWith(`${field} exceeds`),
                );
              }),
            ),
          )
        : [],
      payrollRow,
      operation: existingByKey.has(key) ? "update" : "insert",
      cycleId: rowCycle?.id || "",
      cycleName: rowCycle?.name || "",
    };
  });
  return { cycle: selectedCycle, rows: validated };
}

/* ============================================================
   IMPORT (feedback + sheet)
   ============================================================ */
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
  "rrPercent",
  "revenueReleased",
  "grossMargin",
  "managerRating",
  "interviewCount",
  "newRB",
  "newPB",
  "newPBInst",
  "hikeAmt",
  "hikePct",
  "tpbNext",
]);

const FEEDBACK_COLUMNS = new Set([
  "emp_ID",
  "emp_name",
  "designation",
  "last_appraisal_date",
  "revenue_released",
  "gross_margin",
  "manager_feedback",
  "manager_rating",
  "client_manager_feedback",
  "client_feedback",
  "client_rating",
  "interview_count",
  "at_risk",
  "eligible_for_promotion",
  "new_title",
  "remarks",
  "fy_year",
  "appraisal_cycle_name",
]);

// FIX: if the table is empty, getPagedRows returns no row and the old code produced an
// empty set, so every column failed with "Database column X is not available".
// Now we fall back to the columns this importer knows about.
async function getImportColumnSet(table, fallbackColumns = []) {
  const result = await table.getPagedRows({ maxRows: 1 });
  const row =
    Array.isArray(result?.data) && result.data.length ? result.data[0] : {};
  const found = Object.keys(row).filter(
    (name) => !SCHEMA_SYSTEM_COLUMNS.has(String(name).toUpperCase()),
  );
  if (found.length) return new Set(found);
  return new Set(fallbackColumns);
}

function normalizeImportValue(key, value) {
  if (value === undefined || value === null || value === "") return "";
  if (IMPORT_NUMERIC_FIELDS.has(key)) {
    const number = Number(
      String(value).replace(/,/g, "").replace(/[%$]/g, "").trim(),
    );
    if (!Number.isFinite(number) || number < 0) {
      throw new ApiError(key + " must be a non-negative number.");
    }
    return number;
  }
  return String(value).trim();
}

async function importRows(tables, body) {
  const screen = String(body.screen || "")
    .trim()
    .toLowerCase();
  if (!["fb", "sheet"].includes(screen))
    throw new ApiError("Unsupported upload type.");
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
      body.appraisalCycleName || body.cycleName || cycleId || "",
    )
      .trim()
      .toLowerCase();
    if (requestedCycleName) {
      cycle =
        normalizedCycles.find(
          (item) =>
            String(item.name || "")
              .trim()
              .toLowerCase() === requestedCycleName ||
            String(item.id || "")
              .trim()
              .toLowerCase() === requestedCycleName,
        ) || null;
      if (cycle) cycleId = cycle.id;
    }
  }
  if (screen === "sheet" && !cycle) {
    throw new ApiError("The selected appraisal cycle no longer exists.", 404);
  }
  if (cycle?.archived)
    throw new ApiError("The selected cycle is archived.", 409);

  const targetTable = screen === "fb" ? tables.feedback : tables.payroll;
  const sheetFallbackColumns = [
    ...Object.values(IMPORT_FIELD_MAP.sheet),
    "appraisal_year",
    "appraisal_cycle_name",
    "total_pb",
    "total_bonus",
    "new_ctc",
  ];
  const columns =
    screen === "fb"
      ? FEEDBACK_COLUMNS
      : await getImportColumnSet(targetTable, sheetFallbackColumns);
  const fieldMap = IMPORT_FIELD_MAP[screen];
  const records = Array.isArray(body.records) ? body.records : [];
  if (!records.length || records.length > MAX_UPLOAD_ROWS) {
    throw new ApiError(
      "Upload must contain between 1 and " + MAX_UPLOAD_ROWS + " rows.",
    );
  }

  const employeeRows = await getAllRows(tables.employeeMaster);
  // FIX: O(1) lookup instead of employeeRows.find() inside the per-row loop.
  const masterByEmpId = new Map();
  employeeRows.forEach((row) => {
    const key = String(row.emp_id || "")
      .trim()
      .toLowerCase();
    if (key) masterByEmpId.set(key, row);
  });
  const existingRows = await getAllRows(targetTable);

  let succeeded = 0;
  let failed = 0;
  const rows = [];

  for (const input of records) {
    const rowNumber = Number(input?.row) || rows.length + 2;
    const empId = String(input?.empId || "").trim();
    const errors = [];
    const master = empId ? masterByEmpId.get(empId.toLowerCase()) : undefined;
    const masterRowId = master?.ROWID ?? master?.rowid ?? "";

    if (!empId) errors.push("Employee ID is required.");
    else if (!master) errors.push("Employee ID not found in Employee Master.");

    // Feedback files can contain historical records for different cycles in
    // the same upload. Resolve the cycle from each row's business name/ID.
    const requestedRowCycle = String(input?.appraisalCycleName || "").trim();
    const rowCycle =
      screen === "fb"
        ? normalizedCycles.find(
            (item) =>
              String(item.id || "").trim() === requestedRowCycle ||
              String(item.name || "")
                .trim()
                .toLowerCase() === requestedRowCycle.toLowerCase(),
          ) || cycle
        : cycle;

    const payload = {};
    if (!errors.length) {
      for (const [key, column] of Object.entries(fieldMap)) {
        if (input[key] === undefined) continue;
        if (!columns.has(column)) {
          if (key !== "empId")
            errors.push(
              "Database column " +
                column +
                " is not available for this upload.",
            );
          continue;
        }
        try {
          // Excel serial dates are not valid Catalyst date values. Skip an
          // invalid last-appraisal value instead of rejecting the whole row.
          if (
            screen === "fb" &&
            key === "lastAppraisal" &&
            (typeof input[key] === "number" ||
              !/^\d{4}-\d{2}-\d{2}$/.test(String(input[key]).trim()))
          ) {
            continue;
          }
          payload[column] = normalizeImportValue(key, input[key]);
        } catch (error) {
          errors.push(error.message);
        }
      }

      if (screen === "fb") {
        // Feedback FK columns require native Catalyst ROWID values (BIGINT).
        if (!masterRowId)
          errors.push("Employee Master ROWID is missing for " + empId + ".");
        if (columns.has("emp_ID")) payload.emp_ID = masterRowId;
        if (columns.has("emp_name")) payload.emp_name = masterRowId;
        if (columns.has("designation")) payload.designation = masterRowId;
        if (!rowCycle) {
          errors.push(
            requestedRowCycle
              ? `Appraisal Cycle Name "${requestedRowCycle}" was not found.`
              : "Appraisal Cycle is required for Feedback & Rating upload.",
          );
        } else if (columns.has("appraisal_cycle_name")) {
          const cycleRowId = rowCycle.sourceRowId ?? rowCycle.id ?? "";
          if (!cycleRowId) {
            errors.push(
              "A valid Appraisal Cycle ROWID is required for Feedback & Rating upload.",
            );
          } else {
            payload.appraisal_cycle_name = cycleRowId;
          }
        }
      } else if (columns.has("emp_id")) {
        // FIX: payroll.emp_id is a BIGINT FK to Employee Master ROWID (see toPayrollRow).
        // The old code wrote the business ID string here.
        if (!masterRowId)
          errors.push("Employee Master ROWID is missing for " + empId + ".");
        payload.emp_id = masterRowId;
      }

      if (screen === "sheet") {
        if (columns.has("appraisal_year")) payload.appraisal_year = cycle.name;
        // FIX: use the native ROWID value, consistent with toPayrollRow.
        if (columns.has("appraisal_cycle_name"))
          payload.appraisal_cycle_name = cycle.sourceRowId ?? cycle.id;
        if (columns.has("total_pb")) {
          payload.total_pb =
            (Number(payload.performance_bonus) || 0) +
            (Number(input.allocatedPBAmount) || 0);
        }
        if (columns.has("total_bonus")) {
          payload.total_bonus =
            (Number(payload.total_pb) || 0) +
            (Number(payload.retention_bonus) || 0);
        }
        const base = Number(master?.current_salary || master?.base_pay || 0);
        if (columns.has("hike_pct") && payload.hike_amount !== undefined) {
          payload.hike_pct =
            base > 0
              ? Number(
                  (((Number(payload.hike_amount) || 0) / base) * 100).toFixed(
                    4,
                  ),
                )
              : Number(payload.hike_pct || 0);
        }
        if (
          columns.has("new_ctc") &&
          (payload.hike_amount !== undefined ||
            payload.total_bonus !== undefined)
        ) {
          payload.new_ctc =
            base +
            (Number(payload.hike_amount) || 0) +
            (Number(payload.total_bonus) || 0);
        }
      }
    }

    if (errors.length) {
      failed += 1;
      rows.push({
        row: rowNumber,
        ok: false,
        reason: errors.join(" "),
        badFields: [],
      });
      continue;
    }

    const masterRowIdStr = String(masterRowId).trim();
    const existing = existingRows.find((row) => {
      // Both feedback.emp_ID and payroll.emp_id hold the Employee Master ROWID.
      const storedEmp = String(row.emp_ID ?? row.emp_id ?? "").trim();
      if (storedEmp !== masterRowIdStr) return false;
      if (screen === "fb") {
        const storedCycle = String(row.appraisal_cycle_name || "").trim();
        const targetCycleId = String(
          rowCycle?.id || rowCycle?.sourceRowId || cycleId || "",
        ).trim();
        return storedCycle === targetCycleId;
      }
      // sheet: match on cycle (ROWID) and, if present, appraisal_year
      const storedCycle = String(row.appraisal_cycle_name || "").trim();
      if (storedCycle && storedCycle !== String(cycle.id).trim()) return false;
      return (
        !columns.has("appraisal_year") ||
        String(row.appraisal_year || "").trim() === cycle.name
      );
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
      const reason = error?.message || "Row could not be saved.";
      console.error("Import row failed:", {
        screen,
        row: rowNumber,
        empId,
        reason,
      });
      rows.push({ row: rowNumber, ok: false, reason, badFields: [] });
    }
  }

  return {
    succeeded,
    failed,
    total: records.length,
    batchId: String(body.batchId || ""),
    rows,
  };
}

/* ============================================================
   ROUTER
   ============================================================ */
async function routeRequest(req, res, identity, resource, a) {
  const enforced = Boolean(a && a.enforced);
  access.guard(a, () => requirePayrollAccess(a, resource, req.method));

  const isCycleWrite = resource.startsWith("cycles/") && req.method !== "GET";
  if (!enforced && isCycleWrite && !isHR(identity.user)) {
    return sendJson(res, 403, {
      success: false,
      message: "HR role is required to administer appraisal cycles.",
    });
  }
  if (resource === "session") {
    return sendJson(res, 200, {
      success: true,
      data: {
        id: identity.id,
        name: identity.name,
        email: identity.email,
        role: identity.role,
      },
    });
  }
  const techEdUser = !enforced && isTechEd(identity.user);

  if (
    !enforced &&
    !canAccessPayroll(identity.user) &&
    !resource.startsWith("cycles") &&
    resource !== "locations"
  ) {
    return sendJson(res, 403, {
      success: false,
      message:
        "HR, Comp. Manager, or Tech-Ed role is required for payroll access.",
    });
  }

  if (techEdUser && req.method !== "GET") {
    return sendJson(res, 403, {
      success: false,
      message: "Tech-Ed users have read-only payroll access.",
    });
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

  /* ============================================================
     >>> PASTE YOUR REMAINING ROUTES HERE <<<
     From your original file, copy everything starting at:
         if (resource === "audit" && req.method === "GET") {
     through the end of routeRequest (audit, history, payroll GET,
     validate, commit, undo, cycles/<action>/<id>, importRows calls...)
     but NOT the final closing "}" of routeRequest or module.exports.
     ============================================================ */

  return sendJson(res, 404, {
    success: false,
    message: "Unknown resource: " + resource,
  });
}

/* ============================================================
   ENTRY POINT
   ============================================================ */
const mainHandler = async (req, res) => {
  const a = await checkAccess(req);
  const identity = await requireIdentity(req);
  if (!identity) {
    return sendJson(res, 401, {
      success: false,
      message: "Authentication required.",
    });
  }
  const query = getQuery(req);
  const resource = String(query.resource || "").replace(/^\/+|\/+$/g, "");
  return routeRequest(req, res, identity, resource, a);
};

module.exports = async (req, res) => {
  // Answer a preflight that reaches the function before any auth / Catalyst calls.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    return await mainHandler(req, res);
  } catch (error) {
    console.error("Unhandled error:", error && error.message);
    if (!res.headersSent) {
      return sendJson(res, (error && error.status) || 500, {
        success: false,
        message: (error && error.message) || "Internal server error.",
      });
    }
  }
};
