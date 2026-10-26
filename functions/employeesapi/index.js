"use strict";

/* ACCESS CONTROL: ./accessCore.js is a byte-for-byte copy of
   functions/accessapi/accessCore.js and MUST stay identical to it
   (every Catalyst function deploys separately). Edit the accessapi copy,
   then copy it here. See docs/ACCESS_SPEC.md. */

const express = require("express");
const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

const app = express();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DATASTORE_PAGE_SIZE = 200;

const EMPLOYEES_TABLE_ID = "74008000000039094";
const EMPLOYEE_MASTER_TABLE_ID = "74008000000035727";
const PAYROLL_DATA_TABLE_ID = "74008000000035326";
const FEEDBACK_RATING_TABLE_ID = "74008000000022041";
const APPRAISAL_CYCLE_TABLE_ID = "74008000000034190";
const ELIGIBILITY_TABLE_ID = "74008000000057046";

/* ============================================================
   EXPRESS JSON BODY PARSER
   ============================================================ */

app.use(express.json());

/* ============================================================
   CORS
   ============================================================ */

const corsHeaders = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With",
};

app.use(function (req, res, next) {
  Object.entries(corsHeaders).forEach(function ([key, value]) {
    res.setHeader(key, value);
  });

  next();
});

/* ============================================================
   JSON RESPONSE
   ============================================================ */

function sendJson(res, statusCode, body) {
  return res.status(statusCode).json(body);
}

/* ============================================================
   OPTIONS / PREFLIGHT
   ============================================================ */

app.use(function (req, res, next) {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, {
      success: true,
    });
  }

  next();
});

/* ============================================================
   ACCESS CONTROL (docs/ACCESS_SPEC.md)

   Dry run (ACCESS_ENFORCE != 'true'): the legacy behaviour below is kept
   unchanged; refusals are only logged ("ACCESS dry-run: would deny ...").
   Enforced: the access object is the single source of truth (the legacy
   isHRUser / employeeBelongsToCurrentUser scoping is not used).
   ============================================================ */

// Screens whose pages read Appraisal_Sheet rows through this function.
const READ_SCREENS = [
  "dashboard",
  "appraisalSheet",
  "detailScreen",
  "budgetAllocation",
  "budgetDistribution",
  "teamChanges",
  "delegation",
  "employeeMaster",
];
const EDIT_SCREENS = ["appraisalSheet", "detailScreen"];

// Field kind (input / pair / master / upload / calc) by field key.
const FIELD_KIND = Object.fromEntries(
  access.START_CATALOG.filter(function (c) {
    return c.type === "field";
  }).map(function (c) {
    return [c.key, c.kind];
  }),
);

// Appraisal Sheet input columns that must remain editable by assigned Tech-Ed
// and Comp Manager users even when an older deployed access catalogue has not
// yet learned their field-key mapping. Screen permission and employee scope
// are still enforced before any update.
const APPRAISAL_INPUT_COLUMNS = new Set([
  "allocated_pb_amount",
  "pb_installment",
  "new_pb_to_be_offered",
  "new_pb_installment",
  "new_rb",
  "hike_amount",
  "hike_pct",
  "target_pb_next_year",
  "target_PB_criteria",
  "comp_manager_remarks",
  "eligible_for_promotion",
  "new_title",
  "at_risk",
]);

// Columns whose change alters the hierarchy / identity used by access.
const HIERARCHY_COLUMNS = new Set([
  "status",
  "eligible_status",
  "reporting_manager",
  "manager",
  "comp_manager",
  "appraiser_tech_ed",
  "manager_email_id",
  "super_man_email_id",
  "name",
  "designation",
]);

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

function requireAnyScreen(a, keys, level) {
  const ok = keys.some(function (key) {
    try {
      access.requireScreen(a, key, level);
      return true;
    } catch (error) {
      if (error instanceof access.HttpError) return false;
      throw error;
    }
  });

  if (!ok) {
    throw new access.HttpError(403, "You do not have access to this screen.");
  }
}

// owned: emp_ids (lower-case) the signed-in Tech-ED owns by Employee_Master
// ROWID (see techEdOwnedEmpIds) — the same rule the list (GET) uses, so a
// Tech-ED can save every row they can see even without Delegation rows.
function requireInScope(a, empIds, owned) {
  const outside = empIds.filter(function (empId) {
    if (owned && owned.has(String(empId || "").trim().toLowerCase())) return false;
    return !access.inScope(a, empId);
  });

  if (outside.length) {
    throw new access.HttpError(
      403,
      "You do not have access to employee(s): " + outside.join(", ") + ".",
    );
  }
}

/*
 * Appraisal_Sheet columns a user may change:
 *   - input / pair fields  → the field must be 'edit' for the user;
 *   - master / upload fields and every non-field column (status,
 *     eligible_status, manager_email_id, department, joining_date…)
 *     → HR master data: edit on the employeeMaster screen.
 */
function isMasterColumn(column) {
  const key = access.fieldOfColumn(column);
  // Known appraisal input columns are not Employee_Master fields. This
  // fallback is important during a staged deployment when employeesapi and
  // accessCore may not yet have the same field catalogue version.
  if (!key) return !APPRAISAL_INPUT_COLUMNS.has(column);
  const kind = FIELD_KIND[key];
  return kind === "master" || kind === "upload";
}

function requireEditableColumns(a, columns) {
  const masterColumns = columns.filter(isMasterColumn);
  const fieldColumns = columns.filter(function (c) {
    return !isMasterColumn(c);
  });

  if (masterColumns.length) {
    try {
      access.requireScreen(a, "employeeMaster", "edit");
    } catch (error) {
      if (!(error instanceof access.HttpError)) throw error;
      throw new access.HttpError(
        403,
        "Only HR (Employee Master edit) can change: " +
          masterColumns.join(", ") +
          ".",
      );
    }
  }

  access.requireEditColumns(a, fieldColumns);
}

// Hidden columns removed; orgExp mirrors wissen_experience so it goes too.
function shapeEmployee(a, row) {
  const out = access.shapeRowByColumns(a, row);

  if (a.fields && a.fields.wissenExperience === "hidden") {
    delete out.orgExp;
    delete out.wissen_experience;
  }

  return out;
}

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

function sendAccessError(res, error) {
  return sendJson(res, error.status || 403, {
    success: false,
    message: error.message,
    enforced: true,
  });
}

app.use(async function (req, res, next) {
  try {
    req.access = await checkAccess(req);
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);

    console.error("employeesapi ACCESS ERROR:", error);
    return sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }

  next();
});

/* ============================================================
   HELPERS
   ============================================================ */

function getQueryParams(req) {
  return req.queryParams || req.query || {};
}

function getPositiveInteger(value, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(1, Math.floor(number));
}

function normalizeStatus(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase();

  if (status === "active") {
    return "Active";
  }

  if (status === "inactive") {
    return "Inactive";
  }

  return "";
}

/* ============================================================
   HR UNIVERSAL ACCESS
   HR users are not restricted by appraisal status/eligibility.
   ============================================================ */

function isHRUser(user) {
  const role = String(user?.role_details?.role_name || user?.role_name || "")
    .trim()
    .toLowerCase();

  return role === "hr";
}

/* ============================================================
   TECHED ACCESS
   Non-HR users see only employees assigned to them in
   Employees.appraiser_tech_ed.
   The assignment may contain EMP ID + name, so compare against
   the signed-in user's id, email, and display/name variants.
   ============================================================ */

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getCurrentUserMatchValues(user) {
  const firstName = user?.first_name || "";
  const lastName = user?.last_name || "";

  return [
    user?.user_id,
    user?.empId,
    user?.email_id,
    user?.email,
    user?.display_name,
    user?.name,
    firstName,
    lastName,
    [firstName, lastName].filter(Boolean).join(" "),
  ]
    .map(normalizeText)
    .filter(Boolean);
}

// ROWID of the Active, non-archived appraisal cycle ("" when none).
async function activeCycleRowId(datastore) {
  const cycles = await readAllDataStoreRows(datastore.table(APPRAISAL_CYCLE_TABLE_ID)).catch(function () { return []; });
  const active = cycles.find(function (cycle) {
    const status = String(cycle?.status ?? cycle?.cycle_status ?? "").trim().toLowerCase();
    const archived = ["true", "1", "yes"].includes(String(cycle?.archived ?? "").trim().toLowerCase());
    return status === "active" && !archived;
  });
  return active ? String(active.ROWID ?? active.rowid ?? "").trim() : "";
}

// Employee_Master ROWID for a Delegation value: a ROWID, an employee ID, or
// "EMP002 - Ashok Kumar".
function masterRowIdFor(value, masterRows) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const rowIdOf = function (row) { return String(row.ROWID || row.rowid || "").trim(); };
  const exact = (masterRows || []).find(function (row) { return rowIdOf(row) === raw; });
  if (exact) return rowIdOf(exact);
  const empId = raw.split(/\s+-\s+/)[0].trim().toLowerCase();
  const byEmpId = (masterRows || []).find(function (row) {
    return String(row.emp_id || "").trim().toLowerCase() === empId;
  });
  return byEmpId ? rowIdOf(byEmpId) : "";
}

async function techEdOwnedEmpIds(datastore, a) {
  const owned = new Set();
  if (!a || !a.enforced || (a.scope && a.scope.all) || a.role !== "techEd") return owned;
  const [appraisalRows, masterRows] = await Promise.all([
    getAllEmployees(datastore),
    getAllEmployeeMaster(datastore),
  ]);
  const masterMap = buildEmployeeMasterMap(masterRows);
  const myRowId = currentUserMasterRowId(a.user, masterRows);
  mergeEmployeeMasterIntoAppraisal(appraisalRows, masterMap).forEach(function (employee) {
    if (employeeBelongsToCurrentUser(employee, a.user, myRowId)) {
      owned.add(String(employee.emp_id || "").trim().toLowerCase());
    }
  });
  return owned;
}

/* Tech-ED ownership by Employee_Master ROWID.
   Appraisal_Sheet.appraiser_tech_ed1 (lookup) stores the Tech-ED's
   Employee_Master ROWID. Older rows hold "EMPxxxx - Name" text, which is
   resolved to the same ROWID through the employee ID. */
function techEdOwnerRowId(row, master, employeeMasterMap) {
  const candidates = [
    row.appraiser_tech_ed1,
    row.appraiser_tech_ed,
    master.appraiser_tech_ed1,
    master.appraiser_tech_ed,
  ]
    .map(function (value) {
      return String(value || "").trim();
    })
    .filter(Boolean);
  for (const value of candidates) {
    if (/^[0-9]+$/.test(value)) return value; // already an Employee_Master ROWID
    const empId = value
      .split(/\s+-\s+/)[0]
      .trim()
      .toLowerCase();
    const owner = employeeMasterMap.get(empId);
    const ownerRowId = owner && String(owner.ROWID || owner.rowid || "").trim();
    if (ownerRowId) return ownerRowId;
  }
  return "";
}

// The signed-in user's Employee_Master ROWID (matched by email, else employee ID).
function currentUserMasterRowId(user, employeeMasterRows) {
  if (!user) return "";
  const emails = [user.email_id, user.email]
    .map(function (v) {
      return String(v || "")
        .trim()
        .toLowerCase();
    })
    .filter(Boolean);
  const empId = String(user.empId || user.emp_id || "")
    .trim()
    .toLowerCase();
  const me = (employeeMasterRows || []).find(function (row) {
    const rowEmail = String(row.email_id || row.email || "")
      .trim()
      .toLowerCase();
    const rowEmpId = String(row.emp_id || "")
      .trim()
      .toLowerCase();
    return (
      (rowEmail && emails.includes(rowEmail)) || (empId && rowEmpId === empId)
    );
  });
  return me ? String(me.ROWID || me.rowid || "").trim() : "";
}

function employeeBelongsToCurrentUser(employee, user, myRowId) {
  // Row ID comparison is exact and decides whenever both IDs are known.
  const ownerRowId = String(
    employee?.appraiser_tech_ed_owner_row_id || "",
  ).trim();
  if (myRowId && ownerRowId) return ownerRowId === String(myRowId);
  if (/^[0-9]+$/.test(String(employee?.appraiser_tech_ed_row_id || "").trim()))
    return false;

  // Legacy text assignment ("EMPxxxx - Name") with no resolvable row ID.
  const assignedRaw = String(employee?.appraiser_tech_ed || "").trim();
  if (!assignedRaw) return false;

  const assigned = normalizeText(assignedRaw);

  // Direct dynamic matches: user id, email, or complete profile value.
  if (
    getCurrentUserMatchValues(user).some(function (value) {
      return (
        value &&
        (assigned === value ||
          assigned.includes(value) ||
          value.includes(assigned))
      );
    })
  ) {
    return true;
  }

  // Dynamic name match. Catalyst user profiles commonly provide first_name
  // and last_name separately, while the employee assignment can contain
  // "EMPxxxx - First Last". Match the user's name tokens without hardcoding
  // any employee ID or person.
  const firstName = normalizeText(user?.first_name);
  const lastName = normalizeText(user?.last_name);

  if (lastName && !assigned.includes(lastName)) {
    return false;
  }

  if (firstName) {
    const firstNameParts = String(user?.first_name || "")
      .trim()
      .split(/[^A-Za-z0-9]+/)
      .map(normalizeText)
      .filter(Boolean);

    const firstPartMatches = firstNameParts.some(function (part) {
      return part.length >= 3 && assigned.includes(part);
    });

    if (!firstPartMatches) {
      return false;
    }
  }

  return Boolean(lastName || firstName);
}

/* ============================================================
   EMPLOYEE RESPONSE NORMALIZATION
   ============================================================ */

function normalizeEmployeeResponse(employee) {
  const row = employee || {};

  const wissenExperience =
    row.wissen_experience !== undefined && row.wissen_experience !== null
      ? row.wissen_experience
      : row.wissenExperience !== undefined && row.wissenExperience !== null
        ? row.wissenExperience
        : "";

  const orgExp =
    row.orgExp !== undefined && row.orgExp !== null
      ? row.orgExp
      : wissenExperience;

  return {
    ...row,

    wissen_experience: wissenExperience,

    orgExp: orgExp,
  };
}

/* ============================================================
   ALLOWED FIELDS
   ============================================================ */

const ALLOWED_FIELDS = [
  "name",
  "designation",
  "reporting_manager",
  "comp_manager",
  "appraiser_tech_ed",
  "department",
  "manager",
  "status",
  "wissen_experience",
  "total_experience",
  "last_appraisal_date",
  "manager_rating",
  "interview_count",
  "rr_percent",
  "gross_margin",
  "rb_to_be_paid",
  "month_rb",
  "pb_to_be_paid",
  "month_pb",
  "current_annual_base_pay",
  "target_pb_allocated_for_may",
  "allocated_pb_amount",
  "pb_installment",
  "new_pb_to_be_offered",
  "new_pb_installment",
  "new_rb",
  "hike_amount",
  "hike_pct",
  "target_pb_next_year",
  "eligible_for_promotion",
  "new_title",
  "at_risk",
  "joining_date",
  "manager_email_id",
  "super_man_email_id",
  "rating",
  "eligible_status",
  "joining_bonus",
  "target_PB_criteria",
  "comp_manager_remarks",
];

function pickAllowedFields(body) {
  const data = {};

  ALLOWED_FIELDS.forEach(function (field) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      data[field] = body[field];
    }
  });

  return data;
}

/* ============================================================
   GET ALL EMPLOYEES USING DATASTORE PAGINATION
   ============================================================ */

async function getAllEmployees(datastore) {
  const table = datastore.table(EMPLOYEES_TABLE_ID);

  let allRows = [];
  let nextToken = null;
  let moreRecords = true;

  while (moreRecords) {
    const options = {
      maxRows: DATASTORE_PAGE_SIZE,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    const result = await table.getPagedRows(options);

    const pageRows = Array.isArray(result.data) ? result.data : [];

    allRows = allRows.concat(
      pageRows.map(function (employee) {
        return normalizeEmployeeResponse(employee);
      }),
    );

    moreRecords = result.more_records === true;
    nextToken = result.next_token || null;

    if (!nextToken) {
      moreRecords = false;
    }
  }

  return allRows;
}

/* ============================================================
   GET ALL EMPLOYEE MASTER RECORDS USING DATASTORE PAGINATION
   ============================================================ */

async function getAllEmployeeMaster(datastore) {
  const table = datastore.table(EMPLOYEE_MASTER_TABLE_ID);

  let allRows = [];
  let nextToken = null;
  let moreRecords = true;

  while (moreRecords) {
    const options = {
      maxRows: DATASTORE_PAGE_SIZE,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    const result = await table.getPagedRows(options);

    const pageRows = Array.isArray(result.data) ? result.data : [];

    allRows = allRows.concat(pageRows);

    moreRecords = result.more_records === true;
    nextToken = result.next_token || null;

    if (!nextToken) {
      moreRecords = false;
    }
  }

  return allRows;
}

/* ============================================================
   BUILD EMPLOYEE MASTER MAP
   ============================================================ */

function buildEmployeeMasterMap(masterRows) {
  const map = new Map();

  (masterRows || []).forEach(function (row) {
    const empId = String(row.emp_id || "")
      .trim()
      .toLowerCase();
    const rowId = String(row.ROWID || row.rowid || row.id || "").trim();

    // Index by both the stable employee ID and Catalyst Row ID. The new
    // Appraisal_Sheet.appraiser_tech_ed1 lookup stores Employee_Master.ROWID.
    if (empId) map.set(empId, row);
    if (rowId) map.set(rowId, row);
  });

  return map;
}

/* ============================================================
   APPRAISAL_SHEET + EMPLOYEE_MASTER → APPRAISAL API SHAPE

   The new Data Store schema deliberately keeps employee master data
   separate from appraisal values. The UI still consumes one employee
   object, so join the two tables here instead of duplicating columns.
   ============================================================ */


async function readAllDataStoreRows(table) {
  const rows = [];
  let nextToken = null;
  for (let guard = 0; guard < 10000; guard += 1) {
    const options = { maxRows: DATASTORE_PAGE_SIZE };
    if (nextToken) options.nextToken = nextToken;
    const page = await table.getPagedRows(options);
    rows.push(...(Array.isArray(page?.data) ? page.data : []));
    if (page?.more_records !== true || !page?.next_token) break;
    nextToken = page.next_token;
  }
  return rows;
}

function historyReference(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return String(value.ROWID ?? value.rowid ?? value.id ?? value.ID ?? value.value ?? value.appraisal_cycle_name ?? value.cycle_name ?? "").trim();
  return String(value).trim();
}

function historyCycleName(cycle) {
  return String(cycle?.cycle_name ?? cycle?.cycleName ?? cycle?.name ?? cycle?.appraisal_year ?? cycle?.appraisalYear ?? "").trim();
}

function historyCycleRank(cycle) {
  const date = cycle?.start_date ?? cycle?.effective_date ?? cycle?.startDate ?? "";
  if (date) {
    const timestamp = Date.parse(String(date));
    if (Number.isFinite(timestamp)) return timestamp;
  }
  const name = historyCycleName(cycle);
  const monthYear = name.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s,]*(\d{2,4})\b/i);
  if (monthYear) {
    const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(monthYear[1].slice(0,3).toLowerCase());
    let year = Number(monthYear[2]);
    if (year < 100) year += 2000;
    return new Date(year, month, 1).getTime();
  }
  const year = name.match(/(?:19|20)\d{2}/);
  return year ? new Date(Number(year[0]), 0, 1).getTime() : 0;
}

function rowEmployeeKey(raw, employeeMasterMap) {
  const identity = historyReference(raw).split(/\s+-\s+/)[0].trim();
  if (!identity) return "";
  const master = employeeMasterMap.get(identity) || employeeMasterMap.get(identity.toLowerCase());
  return String(master?.emp_id || identity).trim().toLowerCase();
}

function ctcFromComponents(row) {
  const fields = [
    "current_annual_base_pay", "currentAnnualBasePay", "current_base_pay", "base_pay", "basePay",
    "hike_amount", "hikeAmount", "current_hike_amount",
    "allocated_pb_amount", "allocatedPBAmount", "allocated_pb", "allocatedPB", "target_pb_allocated_for_may",
    "new_pb_to_be_offered", "newPBToBeOffered", "performance_bonus", "total_pb",
    "new_rb", "newRB", "retention_bonus",
  ];
  const hasComponents = fields.some((key) => row?.[key] !== undefined && row?.[key] !== null && String(row[key]).trim() !== "");
  if (!hasComponents) return null;
  const num = (value) => {
    const parsed = Number(String(value ?? 0).replace(/[₹,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const base = num(row?.current_annual_base_pay ?? row?.currentAnnualBasePay ?? row?.current_base_pay ?? row?.base_pay ?? row?.basePay);
  const hike = num(row?.hike_amount ?? row?.hikeAmount ?? row?.current_hike_amount);
  const storedTotalPb = row?.total_pb ?? row?.totalPB;
  const pb = storedTotalPb !== undefined && storedTotalPb !== null && String(storedTotalPb).trim() !== ""
    ? num(storedTotalPb)
    : num(row?.allocated_pb_amount ?? row?.allocatedPBAmount ?? row?.allocated_pb ?? row?.target_pb_allocated_for_may) +
      num(row?.new_pb_to_be_offered ?? row?.newPBToBeOffered ?? row?.performance_bonus);
  const retention = num(row?.new_rb ?? row?.newRB ?? row?.retention_bonus);
  return base + hike + pb + retention;
}

function currentTotalCtc(row) {
  const stored = row?.total_ctc_with_rewards ?? row?.total_CTC_with_rewards ?? row?.totalCTCWithRewards ?? row?.total_ctc ?? row?.new_ctc;
  if (stored !== undefined && stored !== null && String(stored).trim() !== "") {
    const parsed = Number(String(stored).replace(/[₹,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  // Same formula as Total CTC with Rewards in the appraisal grid.
  return ctcFromComponents(row) ?? 0;
}

async function enrichPreviousAppraisalValues(datastore, employees, employeeMasterMap) {
  const [payrollRows, cycleRows, eligibilityRows, feedbackRows] = await Promise.all([
    readAllDataStoreRows(datastore.table(PAYROLL_DATA_TABLE_ID)),
    readAllDataStoreRows(datastore.table(APPRAISAL_CYCLE_TABLE_ID)),
    readAllDataStoreRows(datastore.table(ELIGIBILITY_TABLE_ID)).catch(() => []),
    readAllDataStoreRows(datastore.table(FEEDBACK_RATING_TABLE_ID)).catch(() => []),
  ]);
  const cycleIdOf = (cycle) => String(cycle?.ROWID ?? cycle?.rowid ?? cycle?.id ?? cycle?.ID ?? "").trim();
  const cycleStatusOf = (cycle) => String(cycle?.status ?? cycle?.cycle_status ?? cycle?.appraisal_status ?? "").trim().toLowerCase();
  const cycleById = new Map(cycleRows.map((cycle) => [cycleIdOf(cycle), cycle]).filter(([id]) => id));
  const cycleByName = new Map(cycleRows.map((cycle) => [historyCycleName(cycle).toLowerCase(), cycle]).filter(([name]) => name));
  const currentCycle = cycleRows.find((cycle) => cycleStatusOf(cycle) === "active" && cycle.archived !== true && cycle.archived !== "true") ||
    cycleRows.slice().sort((a, b) => historyCycleRank(b) - historyCycleRank(a))[0] || null;
  const currentCycleId = currentCycle ? cycleIdOf(currentCycle) : "";
  const eligibilityByEmployee = new Map();
  eligibilityRows.forEach((record) => {
    // Lookup columns may be returned as foreign-key objects, not plain strings.
    const rawCycle = historyReference(record?.appraisal_cycle_id ?? record?.cycle_id ?? record?.cycleId);
    const referencedCycle = cycleById.get(rawCycle) || cycleByName.get(rawCycle.toLowerCase());
    const cycleAliases = [
      rawCycle,
      referencedCycle ? cycleIdOf(referencedCycle) : "",
      referencedCycle ? historyCycleName(referencedCycle) : "",
    ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
    if (!cycleAliases.includes(String(currentCycleId).toLowerCase())) return;
    const masterId = historyReference(record?.employee_master_id ?? record?.employee_master_row_id).toLowerCase();
    const empId = rowEmployeeKey(record?.emp_id ?? record?.employee_id ?? record?.emp_code, employeeMasterMap);
    const status = String(record?.eligibility_status ?? record?.eligible_status ?? "").trim().toLowerCase().replace(/[ _-]+/g, "");
    if (!status) return;
    // Only an explicit Eligible decision should enter the Appraisal Sheet.
    // Pending / Awaiting criteria must not fall back to a stale Employee_Master value.
    const normalized = ["eligible", "yes", "true", "1"].includes(status) ? "eligible" : "not eligible";
    if (masterId) eligibilityByEmployee.set("row:" + masterId, { status: normalized, record });
    if (empId) eligibilityByEmployee.set("emp:" + empId, { status: normalized, record });
  });
  const currentRank = currentCycle ? historyCycleRank(currentCycle) : 0;
  const currentCycleName = currentCycle ? historyCycleName(currentCycle) : "";
  const currentFeedbackByEmployee = new Map();
  const feedbackFirstNonEmpty = (record, keys) => {
    for (const key of keys) {
      const actual = Object.keys(record || {}).find(
        (column) => column.toLowerCase() === key.toLowerCase(),
      );
      if (actual !== undefined && record[actual] !== null &&
          record[actual] !== undefined && String(record[actual]).trim() !== "") {
        return record[actual];
      }
    }
    return "";
  };
  feedbackRows.forEach((record) => {
    const empRaw = feedbackFirstNonEmpty(record, ["emp_ID", "emp_id", "employee_id", "emp_code"]);
    const empKey = rowEmployeeKey(empRaw, employeeMasterMap);
    const rawCycle = historyReference(feedbackFirstNonEmpty(record, [
      "appraisal_cycle_name", "appraisal_cycle_id", "cycle_id", "cycle_name",
    ]));
    const cycle = cycleById.get(rawCycle) || cycleByName.get(rawCycle.toLowerCase());
    if (!empKey || !cycle || cycleIdOf(cycle) !== currentCycleId) return;
    const rowTime = String(record.MODIFIEDTIME || record.CREATEDTIME || record.ROWID || "");
    const existing = currentFeedbackByEmployee.get(empKey);
    if (!existing || rowTime.localeCompare(existing.rowTime, undefined, { numeric: true }) > 0) {
      currentFeedbackByEmployee.set(empKey, { row: record, rowTime });
    }
  });
  const yearMatch = currentCycleName.match(/(?:19|20)\d{2}/);
  const shortYearMatch = currentCycleName.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-\s]*(\d{2})/i);
  const currentYear = yearMatch ? yearMatch[0] : shortYearMatch ? "20" + shortYearMatch[1] : currentCycleName || String(new Date().getFullYear());

  const firstNonEmpty = (row, keys) => {
    for (const key of keys) {
      const actual = Object.keys(row || {}).find(
        (column) => column.toLowerCase() === key.toLowerCase(),
      );
      if (actual === undefined) continue;
      const value = row[actual];
      if (value !== undefined && value !== null && String(historyReference(value)).trim() !== "") return value;
    }
    return "";
  };
  const historyByEmployee = new Map();
  const currentPayrollByEmployee = new Map();
  payrollRows.forEach((record) => {
    const empRaw = firstNonEmpty(record, ["emp_id", "employee_id", "emp_code", "empId"]);
    const empKey = rowEmployeeKey(empRaw, employeeMasterMap);
    const rawCycle = historyReference(firstNonEmpty(record, [
      "appraisal_cycle_name", "appraisal_cycle_id", "appraisalCycleId", "cycle_id",
      "appraisalCycleName", "cycle_name",
    ]));
    if (!empKey || !rawCycle) return;
    const cycle = cycleById.get(rawCycle) || cycleByName.get(rawCycle.toLowerCase());
    if (!cycle) return;
    // Current-cycle payroll owns target PB allocation and target criteria.
    // Archived payroll is used only for previous-appraisal values and paid bonuses.
    if (cycleIdOf(cycle) === currentCycleId) {
      const rowTime = String(record.MODIFIEDTIME || record.CREATEDTIME || record.ROWID || "");
      const current = currentPayrollByEmployee.get(empKey);
      if (
        !current ||
        rowTime.localeCompare(current.rowTime, undefined, { numeric: true }) > 0
      ) currentPayrollByEmployee.set(empKey, { row: record, rowTime });
      return;
    }
    const rank = historyCycleRank(cycle);
    // The previous appraisal source is the most recent closed/archived cycle
    // before the current cycle. Some completed cycles are marked "Closed"
    // rather than setting archived=true, so accept both lifecycle conventions.
    const priorStatus = cycleStatusOf(cycle);
    const archived = cycle?.archived === true ||
      ["true", "1", "yes"].includes(String(cycle?.archived ?? "").trim().toLowerCase()) ||
      ["archived", "closed", "complete", "completed"].includes(priorStatus);
    if (!archived || (currentRank > 0 && rank >= currentRank)) return;
    const storedValue = firstNonEmpty(record, [
      "total_ctc_with_rewards", "total_CTC_with_rewards", "totalCTCWithRewards",
      "total_ctc", "new_ctc", "newCTC",
    ]);
    const parsedRaw = storedValue !== ""
      ? Number(String(storedValue).replace(/[₹,\s]/g, ""))
      : ctcFromComponents(record);
    const parsedValue = Number.isFinite(parsedRaw) ? parsedRaw : null;
    const rowTime = String(record.MODIFIEDTIME || record.CREATEDTIME || record.ROWID || "");
    const item = { cycle, rank, value: parsedValue, row: record, rowTime };
    const current = historyByEmployee.get(empKey);
    // Pick the newest employee record in the newest archived cycle, even if
    // its CTC is blank: bonus and effective-date fields still come from this row.
    if (
      !current ||
      item.rank > current.rank ||
      (item.rank === current.rank && item.rowTime.localeCompare(current.rowTime, undefined, { numeric: true }) > 0)
    ) historyByEmployee.set(empKey, item);
  });

  const appraisalTable = datastore.table(EMPLOYEES_TABLE_ID);
  const updatedEmployees = (employees || []).map((employee) => {
    const empRaw = firstNonEmpty(employee, ["emp_id", "employee_id", "emp_code", "empId"]);
    const empKey = rowEmployeeKey(empRaw, employeeMasterMap);
    const prior = empKey ? historyByEmployee.get(empKey) : null;
    const currentPayroll = empKey ? currentPayrollByEmployee.get(empKey)?.row : null;
    const currentFeedback = empKey ? currentFeedbackByEmployee.get(empKey)?.row : null;
    const feedbackValue = (...keys) => {
      for (const key of keys) {
        const actual = Object.keys(currentFeedback || {}).find(
          (column) => column.toLowerCase() === key.toLowerCase(),
        );
        if (actual !== undefined && currentFeedback[actual] !== null &&
            currentFeedback[actual] !== undefined && String(currentFeedback[actual]).trim() !== "") {
          return currentFeedback[actual];
        }
      }
      return undefined;
    };
    const previousCtc = prior && prior.value !== null ? prior.value : currentTotalCtc(employee);
    const previousCycleName = prior ? historyCycleName(prior.cycle) : "";
    const label = prior ? previousCycleName : "New - " + currentYear;
    // Prefer the prior archived cycle's effective date. During a first
    // cycle (e.g. New Joiner), fall back to the uploaded Employee_Master date
    // rather than erasing a valid source value when no archived cycle exists.
    const lastArchivedEffectiveDate = prior
      ? String(prior.cycle?.effective_date ?? prior.cycle?.effectiveDate ?? prior.cycle?.start_date ?? "").trim()
      : String(employee.last_appraisal_date ?? employee.lastAppraisalDate ?? "").trim();
    const payrollAmount = (value) => {
      const parsed = Number(String(value ?? 0).replace(/[₹,\s]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const payrollPreviousPB = prior ? payrollAmount(firstNonEmpty(prior.row, [
      "pb_to_be_paid", "performance_bonus", "previous_year_performance_bonus", "previous_year_pb", "previous_pb",
    ])) : 0;
    const payrollPreviousRB = prior ? payrollAmount(firstNonEmpty(prior.row, [
      "rb_to_be_paid", "retention_bonus", "previous_year_retention_bonus", "previous_year_rb", "previous_rb",
    ])) : 0;
    const payrollPreviousPBMonth = prior ? String(firstNonEmpty(prior.row, [
      "month_pb", "pb_month", "performance_bonus_month", "month_of_pb",
    ]) ?? "").trim() : "";
    const payrollPreviousRBMonth = prior ? String(firstNonEmpty(prior.row, [
      "month_rb", "rb_month", "retention_bonus_month", "month_of_rb",
    ]) ?? "").trim() : "";
    const feedbackRRRaw = feedbackValue("revenue_released", "rr_percent", "rr");
    const feedbackRRNumber = feedbackRRRaw === undefined
      ? undefined
      : Number(String(feedbackRRRaw).replace(/[₹,%\s,]/g, ""));
    const currentTargetPB = currentPayroll
      ? firstNonEmpty(currentPayroll, [
          "target_performance_bonus_for_next_year", "target_performance_bonus_next_year",
        ])
      : "";
    const targetPBForNextYear = currentTargetPB !== ""
      ? payrollAmount(currentTargetPB)
      : payrollAmount(employee.target_pb_allocated_for_may ?? employee.target_pb_allocated ?? 0);
    const currentTargetPBCriteria = currentPayroll
      ? String(firstNonEmpty(currentPayroll, [
          "target_pb_criteria", "target_PB_criteria", "target_performance_bonus_criteria",
        ]) ?? "").trim()
      : String(employee.target_pb_criteria ?? employee.target_PB_criteria ?? "").trim();
    const master = empKey ? employeeMasterMap.get(empKey) : null;
    const masterId = String(master?.ROWID ?? master?.rowid ?? master?.id ?? "").trim().toLowerCase();
    const cycleEligibility = (masterId ? eligibilityByEmployee.get("row:" + masterId) : null) ||
      (empKey ? eligibilityByEmployee.get("emp:" + empKey) : null);
    return {
      ...employee,
      ...(cycleEligibility ? {
        eligible_status: cycleEligibility.status,
        eligibility_reason: String(cycleEligibility.record?.eligibility_reason || ""),
        eligibleReason: String(cycleEligibility.record?.eligibility_reason || ""),
        eligibility_source: String(cycleEligibility.record?.eligibility_source || ""),
        eligibility_updated_at: String(cycleEligibility.record?.eligibility_updated_at || ""),
      } : {}),
      previous_appraisal_total_ctc_with_rewards: previousCtc,
      Previous_Appraisal_total_CTC_with_rewards: previousCtc,
      previousAppraisalTotalCtcWithRewards: previousCtc,
      // The date column is sourced from the archived cycle's effective_date,
      // never from stale demo values or the cycle-name label.
      // Do not substitute a cycle name into the date field.
      last_appraisal_date: lastArchivedEffectiveDate,
      lastAppraisalDate: lastArchivedEffectiveDate,
      last_appraisal_cycle_name: label,
      // Feedback & Rating is optional during the first cycle. Populate these
      // fields from the current cycle when uploaded; otherwise retain any
      // explicitly stored Appraisal_Sheet value (or leave blank/zero).
      manager_rating: feedbackValue("manager_rating") ?? employee.manager_rating ?? "",
      interview_count: feedbackValue("interview_count", "interviewCount") ?? employee.interview_count ?? "",
      // RR% is sourced from Feedback_And_Rating.revenue_released for the
      // current cycle. Employee_Master RR% remains a fallback for older rows
      // or when feedback has not yet been uploaded for this cycle.
      rr_percent: feedbackRRNumber !== undefined && Number.isFinite(feedbackRRNumber)
        ? feedbackRRNumber
        : (employee.rr_percent ?? employee.RR_percent ?? ""),
      gross_margin: feedbackValue("gross_margin") ?? employee.gross_margin ?? "",
      pb_to_be_paid: payrollPreviousPB,
      rb_to_be_paid: payrollPreviousRB,
      month_pb: payrollPreviousPBMonth,
      month_rb: payrollPreviousRBMonth,
      target_pb_allocated_for_may: targetPBForNextYear,
      target_pb_allocated: targetPBForNextYear,
      previous_target_pb_criteria: currentTargetPBCriteria,
      target_pb_criteria: currentTargetPBCriteria,
    };
  });

  // Persist the lookup-derived date and target PB into the current Appraisal_Sheet
  // row so newly generated cycles replace stale demo values in the table itself.
  // The removed pb_to_be_paid/rb_to_be_paid columns are intentionally not written.
  await Promise.all(updatedEmployees.map(async (employee) => {
    const rowId = String(employee.ROWID ?? employee.rowid ?? "").trim();
    if (!rowId) return;
    const desiredDate = employee.last_appraisal_date;
    const desiredTargetPB = employee.target_pb_allocated_for_may;
    const sourceRow = employees.find((row) =>
      String(row.ROWID ?? row.rowid ?? "") === rowId
    );
    const existingDate = String(sourceRow?.last_appraisal_date ?? "").trim();
    const existingTargetPB = Number(sourceRow?.target_pb_allocated_for_may || 0);
    if (existingDate === String(desiredDate ?? "").trim() &&
        existingTargetPB === Number(desiredTargetPB || 0)) return;
    try {
      await appraisalTable.updateRow({
        ROWID: rowId,
        last_appraisal_date: desiredDate,
        target_pb_allocated_for_may: desiredTargetPB,
      });
    } catch (error) {
      console.error("Could not persist archived-cycle appraisal lookup for row", rowId, error?.message || error);
    }
  }));
  return updatedEmployees;
}

function mergeEmployeeMasterIntoAppraisal(appraisalRows, employeeMasterMap) {
  return (appraisalRows || []).map(function (row) {
    const empId = String(row.emp_id || "").trim();
    const master = employeeMasterMap.get(empId.toLowerCase()) || {};
    // Employee_Master uploads can retain Excel/header casing. Resolve aliases
    // case-insensitively so valid source data is not lost due to header casing.
    const masterValue = (...names) => {
      const keys = Object.keys(master);
      for (const name of names) {
        const actual = keys.find((key) => key.toLowerCase() === String(name).toLowerCase());
        if (actual !== undefined && master[actual] !== null && master[actual] !== undefined &&
            String(master[actual]).trim() !== "") return master[actual];
      }
      return "";
    };

    const active = normalizeStatus(masterValue("emp_status", "status") || "Active");

    return {
      ...row,

      name: String(masterValue("emp_name", "name") || row.name || ""),
      designation: String(
        masterValue("designation", "title") || row.designation || row.title || "",
      ),
      // Expose Employee_Master-only fields on the merged roster response too.
      // Employee Master UI reads these from the Employees API's rawEmployee.
      email_id: String(masterValue("email_id", "email") || row.email_id || ""),
      last_appraisal_month_year: String(
        masterValue("last_appraisal_month_year") || row.last_appraisal_month_year || "",
      ),
      last_appraisal_date: String(
        masterValue("last_appraisal_date", "last_appraisal", "last_appraisal_effective_date") ||
        row.last_appraisal_date || "",
      ),
      reporting_manager: String(
        masterValue("repo_manager", "reporting_manager", "manager") || row.reporting_manager || "",
      ),
      // Keep the stored Comp Manager key intact for existing matching/writes,
      // and expose a separate resolved label for display in budget screens.
      comp_manager: String(row.comp_manager || masterValue("comp_manager", "comp_manager_name", "director") || ""),
      comp_manager_display: (() => {
        const raw = String(row.comp_manager || masterValue("comp_manager", "comp_manager_name", "director") || "").trim();
        if (!raw) return "";
        const key = raw.split(/\s+-\s+/)[0].trim();
        const manager =
          employeeMasterMap.get(raw) ||
          employeeMasterMap.get(raw.toLowerCase()) ||
          employeeMasterMap.get(key) ||
          employeeMasterMap.get(key.toLowerCase());
        if (!manager) return raw;
        const id = String(manager.emp_id || "").trim();
        const name = String(manager.emp_name || manager.name || "").trim();
        return id && name ? id + " - " + name : name || raw;
      })(),
      // appraiser_tech_ed1 is a lookup to Employee_Master.ROWID. Resolve it
      // to the actual Tech-Ed employee identity so the grid displays ID - Name
      // and the backend's Tech-Ed access filter can match the signed-in user.
      // Separate Appraisal_Sheet assignment for budget headcounts. Do not
      // fall back to Employee_Master assignment: that can add an employee to
      // a Tech-Ed count when the current appraisal row is unassigned/different.
      // Keep the real Employee_Master ROWID for identity/authorization matching.
      // The UI must use the resolved label below, never this raw foreign key.
      appraiser_tech_ed_row_id: String(row.appraiser_tech_ed1 || "").trim(),
      // Tech-ED owner as Employee_Master ROWID (lookup value, or resolved from
      // legacy "EMPxxxx - Name" text). Used for Tech-ED access by row ID.
      appraiser_tech_ed_owner_row_id: techEdOwnerRowId(
        row,
        master,
        employeeMasterMap,
      ),
      appraiser_tech_ed_appraisal_sheet: (() => {
        const techEdLookupId = String(
          row.appraiser_tech_ed1 || row.appraiser_tech_ed || "",
        ).trim();
        const techEdEmployee = techEdLookupId
          ? employeeMasterMap.get(techEdLookupId) ||
            employeeMasterMap.get(techEdLookupId.toLowerCase())
          : null;
        if (techEdEmployee) {
          const techEdEmpId = String(techEdEmployee.emp_id || "").trim();
          const techEdName = String(
            techEdEmployee.emp_name || techEdEmployee.name || "",
          ).trim();
          return techEdEmpId && techEdName
            ? techEdEmpId + " - " + techEdName
            : techEdName || techEdEmpId || "";
        }
        return techEdLookupId && !/^[0-9]+$/.test(techEdLookupId)
          ? techEdLookupId
          : "";
      })(),
      appraiser_tech_ed: (() => {
        const techEdLookupId = String(
          row.appraiser_tech_ed1 ||
            row.appraiser_tech_ed ||
            master.appraiser_tech_ed1 ||
            master.appraiser_tech_ed ||
            "",
        ).trim();
        const techEdEmployee = techEdLookupId
          ? employeeMasterMap.get(techEdLookupId) ||
            employeeMasterMap.get(techEdLookupId.toLowerCase())
          : null;
        if (techEdEmployee) {
          const techEdEmpId = String(techEdEmployee.emp_id || "").trim();
          const techEdName = String(
            techEdEmployee.emp_name || techEdEmployee.name || "",
          ).trim();
          return techEdEmpId && techEdName
            ? techEdEmpId + " - " + techEdName
            : techEdName || techEdEmpId || techEdLookupId;
        }
        // Preserve legacy text assignments, but don't show a numeric FK as a name.
        const legacy = String(
          row.appraiser_tech_ed || master.appraiser_tech_ed || "",
        ).trim();
        if (legacy && !/^[0-9]+$/.test(legacy)) return legacy;
        return "";
      })(),
      department: String(master.department || row.department || ""),
      location: String(
        masterValue("location", "work_location") ||
          row.location ||
          row.work_location ||
          "",
      ),
      wissen_experience: Number(
        masterValue("wissen_experience", "wissen_exp", "org_experience", "orgExp") || row.wissen_experience || 0,
      ),
      total_experience: Number(
        masterValue("total_experience", "total_exp", "experience") || row.total_experience || 0,
      ),
      joining_date: String(masterValue("date_of_join", "joining_date", "joining_date") || row.joining_date || ""),
      rr_percent: Number(masterValue("rr_percent", "rr_percent", "rr") || row.rr_percent || 0),
      status: active,

      // Employee_Master is the eligibility source of truth. Preserve an
      // explicit master decision first, then the Appraisal_Sheet legacy value.
      // Never derive eligibility from Active/Inactive status.
      eligible_status: (() => {
        const rawEligibility = String(
          [
            master.eligibility,
            master.eligible_status,
            master.eligibility_status,
            master.eligible,
            row.eligible_status,
            row.eligibility,
            row.eligibility_status,
            row.eligible,
          ].find(
            (value) =>
              value !== null &&
              value !== undefined &&
              String(value).trim() !== "",
          ) || "",
        )
          .trim()
          .toLowerCase()
          .replace(/[ _-]+/g, "");
        if (["eligible", "yes", "true", "1"].includes(rawEligibility))
          return "eligible";
        if (
          ["noteligible", "no", "false", "0", "ineligible"].includes(
            rawEligibility,
          )
        )
          return "not eligible";
        return "not eligible";
      })(),

      // Appraisal_Sheet is the source of truth for the current Apr-26 grid.
      // Do NOT map these fields from Payroll_Data aliases such as base_pay.
      current_annual_base_pay: Number(row.current_annual_base_pay || 0),
      target_pb_allocated_for_may: Number(row.target_pb_allocated_for_may || 0),
      allocated_pb_amount: Number(row.allocated_pb_amount || 0),
      pb_installment: String(row.pb_installment ?? ""),
      pb_to_be_paid: Number(row.pb_to_be_paid || 0),
      rb_to_be_paid: Number(row.rb_to_be_paid || 0),
      previous_year_performance_bonus: Number(
        row.previous_year_performance_bonus ||
          row.previous_year_pb ||
          row.previous_pb ||
          0,
      ),
      previous_year_retention_bonus: Number(
        row.previous_year_retention_bonus ||
          row.previous_year_rb ||
          row.previous_rb ||
          0,
      ),
      previous_year_joining_bonus: Number(
        row.previous_year_joining_bonus ||
          row.previous_year_jb ||
          row.previous_joining_bonus ||
          0,
      ),
      new_pb_to_be_offered: Number(row.new_pb_to_be_offered || 0),
      new_pb_installment: String(row.new_pb_installment ?? ""),
      new_rb: Number(row.new_rb || 0),
      hike_amount: Number(row.hike_amount || 0),
      hike_pct: Number(row.hike_pct || 0),
      target_pb_next_year: Number(row.target_pb_next_year || 0),
      eligible_for_promotion: String(row.eligible_for_promotion || "No"),
      new_title: String(row.new_title || ""),
      at_risk: String(row.at_risk || ""),
      manager_rating: String(row.manager_rating || ""),
      rating: Number(row.rating || 0),
      joining_bonus: Number(row.joining_bonus || 0),
      target_PB_criteria: String(
        row.target_PB_criteria ?? row.target_pb_criteria ?? row.target_performance_bonus_criteria ?? "",
      ),
      comp_manager_remarks: String(row.comp_manager_remarks || ""),
    };
  });
}

/* ============================================================
   CHECK APPRAISAL SHEET ELIGIBILITY
   ============================================================ */

function isAppraisalEligible(employee, employeeMasterMap) {
  const empId = String(employee.emp_id || "")
    .trim()
    .toLowerCase();

  if (!empId) {
    return false;
  }

  const master = employeeMasterMap.get(empId);

  if (!master) {
    return false;
  }

  const masterStatus = normalizeStatus(master.emp_status);

  const eligibility = String(employee.eligible_status || "")
    .trim()
    .toLowerCase();

  // Current Employee_Master schema has no eligible_status column. When it is
  // absent, Active in Employee_Master is the eligibility source of truth.
  const effectiveEligibility =
    eligibility || (masterStatus === "Active" ? "eligible" : "not eligible");

  return masterStatus === "Active" && effectiveEligibility === "eligible";
}

/* ============================================================
   FILTER EMPLOYEES
   ============================================================ */

function filterEmployees(
  employees,
  employeeMasterMap,
  search,
  status,
  eligible,
  view,
  location,
) {
  let filtered = employees;

  /*
   * NORMAL APPRAISAL VIEW
   *
   * Employee_Master = Active
   * AND
   * Employees = Eligible
   *
   * Eligibility view and Master view show all employees.
   */

  if (view !== "eligibility" && view !== "master") {
    filtered = filtered.filter(function (employee) {
      return isAppraisalEligible(employee, employeeMasterMap);
    });
  }

  /* ==========================================================
     SEARCH
     ========================================================== */

  if (search) {
    const searchValue = search.toLowerCase();

    filtered = filtered.filter(function (employee) {
      const empId = String(employee.emp_id || "").toLowerCase();

      const name = String(employee.name || "").toLowerCase();

      const designation = String(employee.designation || "").toLowerCase();

      const organization = String(
        employee.department || employee.organization || "",
      ).toLowerCase();

      return (
        empId.includes(searchValue) ||
        name.includes(searchValue) ||
        designation.includes(searchValue) ||
        organization.includes(searchValue)
      );
    });
  }

  /* ==========================================================
     STATUS FILTER
     ========================================================== */

  if (status) {
    filtered = filtered.filter(function (employee) {
      return (
        String(employee.status || "")
          .trim()
          .toLowerCase() === status.toLowerCase()
      );
    });
  }

  /* ==========================================================
     LOCATION FILTER
     ========================================================== */

  if (location) {
    const locationValue = String(location).trim().toLowerCase();
    filtered = filtered.filter(function (employee) {
      return (
        String(employee.location || employee.work_location || "")
          .trim()
          .toLowerCase() === locationValue
      );
    });
  }

  /* ==========================================================
     ELIGIBILITY FILTER
     ========================================================== */

  if (eligible) {
    filtered = filtered.filter(function (employee) {
      const value = String(employee.eligible_status || "")
        .trim()
        .toLowerCase();

      if (eligible === "eligible") {
        return value === "eligible";
      }

      if (eligible === "not eligible") {
        return value === "not eligible";
      }

      if (eligible === "noteligible") {
        return value === "noteligible";
      }

      return true;
    });
  }

  return filtered;
}

/* ============================================================
   GET EMPLOYEES
   ============================================================ */

async function getEmployees(req, res) {
  // Use the server-side admin scope for Data Store reads. The request still
  // passes through accessCore below, which enforces role, screen, row-scope,
  // and hidden-field rules before the response is returned. Using the signed-in
  // user's Data Store scope here can fail with Catalyst's generic
  // "No privileges to perform this action" after sheet generation.
  const appInstance = catalyst.initialize(req);
  const adminInstance = catalyst.initialize(req, { scope: "admin" });
  const datastore = adminInstance.datastore();

  const a = req.access;
  const enforced = Boolean(a && a.enforced);
  const params = getQueryParams(req);

  const requestedView = String(params.view || "")
    .trim()
    .toLowerCase();
  const requestedEmpIds = String(params.emp_id || params.empId || "")
    .split(",")
    .map(function (value) {
      return value.trim();
    })
    .filter(Boolean);

  const requestedOwned = requestedEmpIds.length ? await techEdOwnedEmpIds(datastore, a) : null;
  access.guard(a, function () {
    requireAnyScreen(a, READ_SCREENS, "view");
    // Roster / eligibility views list every employee — HR Operations only.
    if (requestedView === "master" || requestedView === "eligibility") {
      access.requireScreen(a, "employeeMaster", "view");
    }
    requireInScope(a, requestedEmpIds, requestedOwned);
  });

  let currentUser = null;
  let hrUser = false;

  if (!enforced) {
    try {
      currentUser = await appInstance.userManagement().getCurrentUser();
    } catch (error) {
      console.warn(
        "Unable to resolve current Catalyst user for role filtering:",
        error?.message,
      );
    }

    if (!currentUser || !currentUser.user_id) {
      return sendJson(res, 401, {
        success: false,
        message: "Authentication is required.",
      });
    }

    hrUser = isHRUser(currentUser);
  } else {
    hrUser = Boolean(a.scope && a.scope.all);
  }

  const requestedPage = getPositiveInteger(params.page, 1);

  const requestedLimit = getPositiveInteger(params.limit, DEFAULT_LIMIT);

  const limit = Math.min(requestedLimit, MAX_LIMIT);

  const search = String(params.search || "").trim();

  const status = String(params.status || "")
    .trim()
    .toLowerCase();

  const location = String(params.location || "").trim();

  const eligibleParam = String(params.eligible || "")
    .trim()
    .toLowerCase();

  const view = String(params.view || "")
    .trim()
    .toLowerCase();

  /* ==========================================================
     LOAD EMPLOYEES
     ========================================================== */

  let appraisalRows = await getAllEmployees(datastore);

  // Appraisal view must be isolated to the one active cycle. Appraisal_Sheet
  // intentionally retains archived cycles, so returning every row here makes
  // old employees leak into a newly generated sheet. Master/eligibility views
  // remain full-roster views and are not cycle-filtered.
  if (requestedView !== "master" && requestedView !== "eligibility") {
    const [cycleRows, cycleEligibilityRows] = await Promise.all([
      readAllDataStoreRows(datastore.table(APPRAISAL_CYCLE_TABLE_ID)),
      readAllDataStoreRows(datastore.table(ELIGIBILITY_TABLE_ID)).catch(() => []),
    ]);
    const activeCycle = cycleRows.find((cycle) => {
      const status = String(
        cycle?.status ?? cycle?.cycle_status ?? cycle?.appraisal_status ?? "",
      ).trim().toLowerCase();
      const archived = ["true", "1", "yes"].includes(
        String(cycle?.archived ?? "").trim().toLowerCase(),
      );
      return status === "active" && !archived;
    });
    if (activeCycle) {
      const activeCycleId = String(
        activeCycle.ROWID ?? activeCycle.rowid ?? activeCycle.id ?? activeCycle.ID ?? "",
      ).trim();
      const activeCycleName = historyCycleName(activeCycle).toLowerCase();
      const eligibleMasterIds = new Set();
      const eligibleEmployeeIds = new Set();
      const eligibleRecords = [];

      cycleEligibilityRows.forEach((record) => {
        const rawCycle = historyReference(
          record?.appraisal_cycle_id ?? record?.cycle_id ?? record?.cycleId,
        );
        const recordCycle = cycleRows.find((candidate) => {
          const candidateId = String(
            candidate.ROWID ?? candidate.rowid ?? candidate.id ?? candidate.ID ?? "",
          ).trim();
          return candidateId === rawCycle ||
            historyCycleName(candidate).toLowerCase() === rawCycle.toLowerCase();
        });
        const belongsToActiveCycle = rawCycle === activeCycleId ||
          (!!activeCycleName && rawCycle.toLowerCase() === activeCycleName) ||
          (!!recordCycle && String(
            recordCycle.ROWID ?? recordCycle.rowid ?? recordCycle.id ?? recordCycle.ID ?? "",
          ).trim() === activeCycleId);
        const eligibilityStatus = String(
          record?.eligibility_status ?? record?.eligible_status ?? "",
        ).trim().toLowerCase().replace(/[ _-]+/g, "");
        if (!belongsToActiveCycle || !["eligible", "yes", "true", "1"].includes(eligibilityStatus)) return;

        const masterId = historyReference(
          record?.employee_master_id ?? record?.employee_master_row_id,
        ).toLowerCase();
        const empId = String(record?.emp_id ?? record?.employee_id ?? record?.emp_code ?? "")
          .trim().toLowerCase();
        if (masterId) eligibleMasterIds.add(masterId);
        if (empId) eligibleEmployeeIds.add(empId);
        eligibleRecords.push({ masterId: masterId, empId: empId });
      });

      appraisalRows = appraisalRows.filter((row) => {
        const rowCycle = historyReference(
          row?.cycle_id ?? row?.appraisal_cycle_id ?? row?.appraisalCycleId,
        );
        const belongsToActiveCycle = rowCycle === activeCycleId ||
          (!!activeCycleName && rowCycle.toLowerCase() === activeCycleName);
        if (!belongsToActiveCycle) return false;
        const masterId = historyReference(
          row?.emp_master_row_id ?? row?.employee_master_id,
        ).toLowerCase();
        const empId = String(row?.emp_id ?? row?.employee_id ?? "").trim().toLowerCase();
        return (masterId && eligibleMasterIds.has(masterId)) ||
          (empId && eligibleEmployeeIds.has(empId));
      });

      // Delegation runs before Generate Appraisal Sheet. Eligible employees
      // without a sheet row yet are listed from Employee_Master (Tech-ED and
      // Comp Manager come from there; Generate copies them into the sheet).
      if (requestedView === "delegation") {
        const onSheet = new Set();
        appraisalRows.forEach(function (row) {
          const masterId = historyReference(row?.emp_master_row_id).toLowerCase();
          const empId = String(row?.emp_id || "").trim().toLowerCase();
          if (masterId) onSheet.add("row:" + masterId);
          if (empId) onSheet.add("emp:" + empId);
        });
        const masterForEligibility = await getAllEmployeeMaster(datastore);
        const masterByRowId = new Map(masterForEligibility.map(function (row) {
          return [String(row.ROWID || row.rowid || "").trim().toLowerCase(), row];
        }));
        eligibleRecords.forEach(function (record) {
          const master = (record.masterId && masterByRowId.get(record.masterId)) ||
            masterForEligibility.find(function (row) {
              return String(row.emp_id || "").trim().toLowerCase() === record.empId;
            });
          if (!master) return;
          const masterId = String(master.ROWID || master.rowid || "").trim();
          const empId = String(master.emp_id || "").trim();
          if (onSheet.has("row:" + masterId.toLowerCase()) || onSheet.has("emp:" + empId.toLowerCase())) return;
          onSheet.add("row:" + masterId.toLowerCase());
          onSheet.add("emp:" + empId.toLowerCase());
          appraisalRows.push({
            emp_id: empId,
            emp_master_row_id: masterId,
            cycle_id: activeCycleId,
            eligible_status: "Eligible",
            status: "Active",
            sheet_generated: false,
          });
        });
      }
    }
  }

  /* ==========================================================
     LOAD EMPLOYEE MASTER
     ========================================================== */

  const employeeMasterRows = await getAllEmployeeMaster(datastore);

  const employeeMasterMap = buildEmployeeMasterMap(employeeMasterRows);

  // Join the current Appraisal_Sheet schema with Employee_Master so the
  // frontend receives one dynamic, consistent employee object.
  const mergedEmployees = mergeEmployeeMasterIntoAppraisal(
    appraisalRows,
    employeeMasterMap,
  );
  const historyDatastore = catalyst.initialize(req, { scope: "admin" }).datastore();
  const allEmployees = await enrichPreviousAppraisalValues(
    historyDatastore,
    mergedEmployees,
    employeeMasterMap,
  );

  /* ==========================================================
     DOJ SOURCE
     
     Employees.joining_date is the source of truth.
     ========================================================== */

  allEmployees.forEach(function (employee) {
    employee.date_of_join =
      employee.Joining_date || employee.joining_date || "";
  });

  /* ==========================================================
     COUNTS
     ========================================================== */

  /* ==========================================================
     FILTER
     ========================================================== */

  /*
   * Scope by the signed-in user's access first.
   * HR sees all employees; non-HR users see only their assigned employees.
   * Counts must use this same scoped set so the dashboard reflects the
   * current user's visible Employee Master records, not the whole table.
   */
  // Enforced: access scope (Delegation of the Active cycle) + hidden columns
  // removed BEFORE counting / searching / paginating.
  // Signed-in user's Employee_Master ROWID: a Tech-ED sees the employees
  // whose Appraiser Tech-ED lookup points to this row.
  const myMasterRowId = currentUserMasterRowId(
    enforced ? a.user : currentUser,
    employeeMasterRows,
  );

  const viewAsParam = String(params.viewAs || "").trim().toLowerCase();
  const asCompMgr = enforced && viewAsParam === "compmanager" && (a.role === "hr" || a.role === "techEd");
  const myEmpIdLower = String((a.user && a.user.empId) || "").trim().toLowerCase();


  const scopedEmployees = enforced
    ? allEmployees
        // Tech-Ed roster ownership is maintained in Employee_Master.appraiser_tech_ed
        // (for example, "EMP002 - Ashok Kumar"). Use that assignment as the source
        // of truth for the Tech-Ed's visible employees instead of requiring a
        // separate Delegation row to duplicate the same assignment.
        .filter(function (employee) {

          if (asCompMgr) {
            const compMgrId = String(employee.comp_manager || "").split("-")[0].trim().toLowerCase();
            return !!myEmpIdLower && compMgrId === myEmpIdLower;
          }



          if (a.scope && a.scope.all) return true;
          if (a.role === "techEd") {
            return employeeBelongsToCurrentUser(
              employee,
              a.user,
              myMasterRowId,
            );
          }
          return access.inScope(a, employee);
        })
        .map(function (employee) {
          return shapeEmployee(a, employee);
        })
    : hrUser
      ? allEmployees
      : allEmployees.filter(function (employee) {
          return employeeBelongsToCurrentUser(
            employee,
            currentUser,
            myMasterRowId,
          );
        });

  const scopedTotalCount = scopedEmployees.length;
  const scopedActiveCount = scopedEmployees.filter(function (employee) {
    return (
      String(employee.status || "")
        .trim()
        .toLowerCase() === "active"
    );
  }).length;
  const scopedInactiveCount = scopedEmployees.filter(function (employee) {
    return (
      String(employee.status || "")
        .trim()
        .toLowerCase() === "inactive"
    );
  }).length;

  const filteredEmployees = filterEmployees(
    scopedEmployees,
    employeeMasterMap,
    search,
    status === "all" ? "" : status,
    eligibleParam === "all" ? "" : eligibleParam,
    view,
    location,
  );

  const userScopedEmployees = filteredEmployees;

  const filteredCount = userScopedEmployees.length;

  /* ==========================================================
     PAGINATION
     ========================================================== */

  const totalPages = filteredCount === 0 ? 1 : Math.ceil(filteredCount / limit);

  const safePage = Math.min(requestedPage, totalPages);

  const offset = (safePage - 1) * limit;

  const data = userScopedEmployees
    .slice(offset, offset + limit)
    .map(function (employee) {
      const normalized = normalizeEmployeeResponse(employee);
      return enforced ? shapeEmployee(a, normalized) : normalized;
    });

  /* ==========================================================
     RESPONSE
     ========================================================== */

  return sendJson(res, 200, {
    success: true,

    data: data,

    pagination: {
      page: safePage,
      limit: limit,
      totalCount: filteredCount,
      totalPages: totalPages,
      returnedCount: data.length,
    },

    counts: {
      total: scopedTotalCount,
      active: scopedActiveCount,
      inactive: scopedInactiveCount,
    },

    filters: {
      search: search,
      status: status || "all",
      eligible: eligibleParam || "all",
      view: view || "appraisal",
    },
  });
}

/* ============================================================
   CREATE / IMPORT EMPLOYEES
   ============================================================ */

async function createEmployees(req, res) {
  const appInstance = catalyst.initialize(req);

  const datastore = appInstance.datastore();

  const body = req.body || {};

  const incoming = Array.isArray(body.employees)
    ? body.employees
    : Array.isArray(body)
      ? body
      : [body];

  if (!incoming.length) {
    return sendJson(res, 400, {
      success: false,
      message: "No employee records were provided.",
    });
  }

  const table = datastore.table(EMPLOYEES_TABLE_ID);
  const masterTable = datastore.table(EMPLOYEE_MASTER_TABLE_ID);

  const [existingRows, masterRows] = await Promise.all([
    table.getAllRows(),
    masterTable.getAllRows(),
  ]);
  const masterByEmpId = new Map();
  (masterRows || []).forEach(function (row) {
    const key = String(row.emp_id || "")
      .trim()
      .toLowerCase();
    const rowId = row.ROWID || row.rowid;
    if (key && rowId) masterByEmpId.set(key, String(rowId));
  });

  const existingByEmpId = new Map();

  (existingRows || []).forEach(function (row) {
    const key = String(row.emp_id || "")
      .trim()
      .toLowerCase();

    if (key) {
      existingByEmpId.set(key, row);
    }
  });

  const rowsToInsert = [];
  const rowsToUpdate = [];
  const skipped = [];

  incoming.forEach(function (item) {
    const record = item || {};

    const empId = String(record.emp_id || record.empId || "").trim();

    if (!empId) {
      skipped.push({
        emp_id: "",
        reason: "emp_id is missing.",
      });

      return;
    }

    const data = pickAllowedFields(record);
    const masterRowId = masterByEmpId.get(empId.toLowerCase());
    if (masterRowId) data.emp_master_row_id = masterRowId;

    if (data.status !== undefined) {
      const normalizedStatus = normalizeStatus(data.status);

      if (normalizedStatus) {
        data.status = normalizedStatus;
      }
    }

    const existing = existingByEmpId.get(empId.toLowerCase());

    if (existing) {
      const rowId = existing.ROWID || existing.rowid;

      if (!rowId) {
        skipped.push({
          emp_id: empId,
          reason: "Existing row has no ROWID.",
        });

        return;
      }

      rowsToUpdate.push({
        ROWID: rowId,
        ...data,
      });

      return;
    }

    rowsToInsert.push({
      emp_id: empId,
      status: data.status || "Active",
      ...data,
    });
  });

  /* ==========================================================
     ACCESS (checked before anything is written)
     - only appraisal input columns of existing employees
       → importAppraisal + appraisalSheet edit + rows in scope
         + every column editable;
     - roster / master columns or new employees → employeeMaster edit.
     ========================================================== */

  const a = req.access;
  const touchedColumns = new Set();
  const touchedEmpIds = [];

  incoming.forEach(function (item) {
    const record = item || {};
    const empId = String(record.emp_id || record.empId || "").trim();
    if (!empId) return;
    touchedEmpIds.push(empId);
    Object.keys(pickAllowedFields(record)).forEach(function (column) {
      touchedColumns.add(column);
    });
  });

  const columns = Array.from(touchedColumns);
  const masterImport = rowsToInsert.length > 0 || columns.some(isMasterColumn);

  const importOwned = await techEdOwnedEmpIds(datastore, a);
  access.guard(a, function () {
    if (masterImport) {
      access.requireScreen(a, "employeeMaster", "edit");
      return;
    }
    access.requireAction(a, "importAppraisal");
    access.requireScreen(a, "appraisalSheet", "edit");
    requireInScope(a, touchedEmpIds, importOwned);
    requireEditableColumns(a, columns);
  });

  let insertedRows = [];

  if (rowsToInsert.length) {
    insertedRows = await table.insertRows(rowsToInsert);
  }

  let updatedRows = [];

  if (rowsToUpdate.length) {
    updatedRows = await table.updateRows(rowsToUpdate);
  }

  if (
    rowsToInsert.length ||
    columns.some(function (column) {
      return HIERARCHY_COLUMNS.has(column);
    })
  ) {
    await bumpAccessVersion(req, a, "employeesapi import changed the roster");
  }

  return sendJson(res, 200, {
    success: true,

    message:
      "Employee import completed. " +
      rowsToInsert.length +
      " created, " +
      rowsToUpdate.length +
      " updated.",

    data: {
      created: rowsToInsert.length,

      updated: rowsToUpdate.length,

      skipped: skipped.length,

      skippedRecords: skipped,

      insertedRows: insertedRows,

      updatedRows: updatedRows,
    },
  });
}

/* ============================================================
   UPDATE EMPLOYEE
   ============================================================ */

async function updateEmployee(req, res) {
  const appInstance = catalyst.initialize(req);
  const datastore = appInstance.datastore();
  const body = req.body || {};

  const empId = String(body.emp_id || body.empId || "").trim();
  if (!empId) {
    return sendJson(res, 400, {
      success: false,
      message: "emp_id is required.",
    });
  }

  const a = req.access;
  const changedColumns = Object.keys(pickAllowedFields(body));

  // Delegation assignments are changed only from the Delegation screen.
  // Screen-level edit permission is the authorization source here. Requiring
  // the separate delegateApprove action as well caused HR saves to fail when
  // the action matrix was not seeded or had a stale value.
  const isDelegationAssignmentChange =
    changedColumns.length > 0 &&
    changedColumns.every(function (column) {
      return column === "comp_manager" || column === "appraiser_tech_ed";
    });

  const editOwned = await techEdOwnedEmpIds(datastore, a);
  access.guard(a, function () {
    if (isDelegationAssignmentChange) {
      // HR administrators manage delegation for the whole organization. Their
      // authorization must not depend on employee hierarchy scope or a stale
      // per-screen matrix entry. Non-HR users still need delegation edit access
      // and must remain within their assigned employee scope.
      if (a.role !== "hr") {
        access.requireScreen(a, "delegation", "edit");
        requireInScope(a, [empId], editOwned);
      }
    } else {
      requireAnyScreen(a, EDIT_SCREENS, "edit");
      requireEditableColumns(a, changedColumns);
      requireInScope(a, [empId], editOwned);
    }
  });

  const appraisalTable = datastore.table(EMPLOYEES_TABLE_ID);
  const masterTable = datastore.table(EMPLOYEE_MASTER_TABLE_ID);

  const [appraisalRows, masterRows] = await Promise.all([
    appraisalTable.getAllRows(),
    masterTable.getAllRows(),
  ]);

  // Appraisal_Sheet keeps rows of earlier cycles: edit the Active cycle's row.
  // With an Active cycle and no row for it, the sheet is not generated yet.
  const currentCycleId = await activeCycleRowId(datastore);
  const appraisalRow = (appraisalRows || []).find(function (row) {
    if (String(row.emp_id || "").trim().toLowerCase() !== empId.toLowerCase()) return false;
    return !currentCycleId || String(row.cycle_id || "").trim() === currentCycleId;
  });
  const masterRow = (masterRows || []).find(function (row) {
    return (
      String(row.emp_id || "")
        .trim()
        .toLowerCase() === empId.toLowerCase()
    );
  });

  // Before Generate Appraisal Sheet, Delegation (Tech-ED / Comp Manager) is
  // saved on Employee_Master; Generate copies it into the sheet.
  const beforeGenerate = !appraisalRow && isDelegationAssignmentChange && !!masterRow;
  if (!appraisalRow && !beforeGenerate) {
    return sendJson(res, 404, {
      success: false,
      message: "Appraisal record " + empId + " not found.",
    });
  }
  if (!masterRow) {
    return sendJson(res, 404, {
      success: false,
      message: "Employee Master record " + empId + " not found.",
    });
  }

  const masterFieldMap = {
    name: "emp_name",
    designation: "designation",
    reporting_manager: "repo_manager",
    appraiser_tech_ed: "appraiser_tech_ed",
    department: "department",
    wissen_experience: "wissen_experience",
    total_experience: "total_experience",
    joining_date: "date_of_join",
  };

  // Every other editable field is an Appraisal_Sheet column of the same name
  // (the names GET reads back). Payroll-style names such as base_pay do not
  // exist on Appraisal_Sheet.
  const appraisalFieldMap = {};
  ALLOWED_FIELDS.forEach(function (field) {
    if (field !== "status" && !masterFieldMap[field])
      appraisalFieldMap[field] = field;
  });

  const masterUpdate = { ROWID: masterRow.ROWID };
  const appraisalUpdate = { ROWID: appraisalRow ? appraisalRow.ROWID : "" };

  changedColumns.forEach(function (column) {
    const value = body[column];

    if (column === "status") {
      const normalizedStatus = normalizeStatus(value);
      if (!normalizedStatus) {
        throw new access.HttpError(
          400,
          'status must be either "Active" or "Inactive".',
        );
      }
      masterUpdate.emp_status = normalizedStatus;
      return;
    }

    if (column === "comp_manager" && !appraisalRow) {
      masterUpdate.comp_manager = value;
      return;
    }

    const masterColumn = masterFieldMap[column];
    if (masterColumn) {
      masterUpdate[masterColumn] = value;
      // Appraisal_Sheet.appraiser_tech_ed is a lookup to Employee_Master;
      // keep the generated sheet row on the same Tech-ED.
      if (column === "appraiser_tech_ed" && appraisalRow) {
        const techEdRowId = masterRowIdFor(value, masterRows);
        if (!techEdRowId && String(value || "").trim()) {
          throw new access.HttpError(422, "Tech-ED " + value + " was not found in Employee Master.");
        }
        appraisalUpdate.appraiser_tech_ed = techEdRowId || null;
      }
      return;
    }

    const appraisalColumn = appraisalFieldMap[column];
    if (appraisalColumn) {
      appraisalUpdate[appraisalColumn] = value;
    }
  });

  const masterChanged = Object.keys(masterUpdate).length > 1;
  const appraisalChanged = Object.keys(appraisalUpdate).length > 1;

  if (!masterChanged && !appraisalChanged) {
    return sendJson(res, 400, {
      success: false,
      message: "No fields from the current Data Store schema can be updated.",
    });
  }

  let updatedMaster = masterRow;
  let updatedAppraisal = appraisalRow;

  if (masterChanged) {
    updatedMaster = await masterTable.updateRow(masterUpdate);
  }

  if (appraisalChanged) {
    updatedAppraisal = await appraisalTable.updateRow(appraisalUpdate);
  }

  const merged = mergeEmployeeMasterIntoAppraisal(
    [updatedAppraisal || {
      emp_id: empId,
      emp_master_row_id: String(masterRow.ROWID || ""),
      eligible_status: "Eligible",
      sheet_generated: false,
    }],
    new Map([[empId.toLowerCase(), updatedMaster]]),
  )[0];

  if (
    changedColumns.some(function (column) {
      return HIERARCHY_COLUMNS.has(column) || column === "status";
    })
  ) {
    await bumpAccessVersion(
      req,
      a,
      "Employee hierarchy/status changed: " + empId,
    );
  }

  return sendJson(res, 200, {
    success: true,
    message: "Employee updated successfully.",
    data: a && a.enforced ? shapeEmployee(a, merged) : merged,
  });
}

/* ============================================================
   GET
   ============================================================ */

app.get("/", async function (req, res) {
  try {
    await getEmployees(req, res);
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);

    console.error("employeesapi GET ERROR:", error);

    return sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
});

/* ============================================================
   POST
   ============================================================ */

app.post("/", async function (req, res) {
  try {
    await createEmployees(req, res);
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);

    console.error("employeesapi POST ERROR:", error);

    return sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
});

/* ============================================================
   PUT
   ============================================================ */

app.put("/", async function (req, res) {
  try {
    await updateEmployee(req, res);
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);

    console.error("employeesapi PUT ERROR:", error);

    return sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
});

/* ============================================================
   PATCH
   ============================================================ */

app.patch("/", async function (req, res) {
  try {
    await updateEmployee(req, res);
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);

    console.error("employeesapi PATCH ERROR:", error);

    return sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
});

/* ============================================================
   METHOD NOT ALLOWED
   ============================================================ */

app.use(function (req, res) {
  return sendJson(res, 405, {
    success: false,
    message: "Method " + req.method + " not allowed.",
  });
});

/* ============================================================
   CATALYST ADVANCED I/O ENTRY
   ============================================================ */

module.exports = function (req, res) {
  app(req, res);
};