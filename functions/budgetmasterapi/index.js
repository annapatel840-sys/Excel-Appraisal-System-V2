"use strict";

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

// These IDs are the Data Store table IDs from Catalyst Console → Data Store.
const TABLES = {
  master: "74008000000034565", // Budget_Master
  distribution: "74008000000033809", // Budget_Distribution
  comp: "74008000000023149", // Budget_Distribution_Comp
  payroll: "74008000000035326", // Payroll_Data
  cycles: "74008000000034190", // Appraisal_Cycle_Master
};

// CORS headers come from Catalyst (Authorized Domains); setting them here too
// gives the browser two Access-Control-Allow-Origin values and it rejects the response.
function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function value(row, key) {
  return row && row[key] !== undefined && row[key] !== null ? row[key] : "";
}

function n(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  // Catalyst imports can return Indian-grouped values such as "12,34,567.50".
  // Number("12,34,567.50") is NaN, which previously silently became zero.
  let text = String(v).trim();
  const negative = /^\(.*\)$/.test(text);
  // "1.25 L" / "1.25 Lakh" = 1,25,000; "2 Cr" / "2 Crore" = 2,00,00,000.
  const unit = text.match(/(lakhs?|lacs?|l|crores?|cr)\.?\s*\)?$/i);
  const scale = !unit ? 1 : /^c/i.test(unit[1]) ? 1e7 : 1e5;
  if (unit) text = text.slice(0, unit.index);
  text = text.replace(/[₹,\s]/g, "").replace(/^(?:INR|Rs\.?)/i, "").replace(/[^0-9.+-]/g, "");
  const parsed = Number(text) * scale;
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -Math.abs(parsed) : parsed;
}

function idOf(row) {
  return String(value(row, "ROWID") || value(row, "rowid") || "");
}

function mapMaster(row) {
  const calculated = n(value(row, "calculated_budget"));
  const applied = n(value(row, "applied_budget"));
  const utilized = n(value(row, "budget_utilized"));
  return {
    id: idOf(row),
    appraisal_cycle_id: String(value(row, "appraisal_cycle_id")),
    budget_percentage: n(value(row, "budget_percentage")),
    budget_percentage_is_set: value(row, "budget_percentage") !== "" && value(row, "budget_percentage") !== null && value(row, "budget_percentage") !== undefined,
    org_budget_base: n(value(row, "org_budget_base")),
    budget_utilized: utilized,
    calculated_budget: calculated,
    applied_budget: applied,
    budget_remaining: applied - utilized,
    utilization_percentage: applied > 0 ? (utilized / applied) * 100 : 0,

    // Compatibility aliases for existing budget screens. These fields are
    // not stored in Budget_Master; they are derived or kept in browser state.
    budget_amount: calculated,
    additional_budget: 0,
    updated_budget: applied,
    status: "Active",
    tech_ed_id: "",
  };
}

function mapDistribution(row) {
  const calculated = n(value(row, "calculated_budget") || value(row, "claculated_budget"));
  const applied = n(value(row, "applied_budget"));
  const utilized = n(value(row, "total_utilization"));
  return {
    id: idOf(row),
    appraisal_cycle_id: String(value(row, "appraisal_cycle_id")),
    appraiser_tech_ed_id: String(value(row, "appraiser_tech_ed_id")),
    percentage: value(row, "percentage") === "" || value(row, "percentage") === null || value(row, "percentage") === undefined
      ? null
      : n(value(row, "percentage")),
    budget_base: n(value(row, "budget_base")),
    original_budget_base: n(value(row, "original_budget_base")),
    original_base: n(value(row, "original_base")),
    current_budget_base: n(value(row, "current_budget_base")),
    current_base: n(value(row, "current_base")),
    original_headcount: value(row, "original_headcount"),
    allocation_headcount: value(row, "allocation_headcount"),
    current_headcount: value(row, "current_headcount"),
    headcount: value(row, "headcount"),
    calculated_budget: calculated,
    total_utilization: utilized,
    applied_budget: applied,
    utilization_percentage: applied > 0 ? (utilized / applied) * 100 : 0,
  };
}

function mapComp(row) {
  const applied = n(value(row, "applied_budget"));
  const utilized = n(value(row, "total_utilization"));
  return {
    id: idOf(row),
    comp_manager: String(value(row, "comp_manager")),
    percentage: n(value(row, "percentage")),
    budget_base: n(value(row, "budget_base")),
    calculated_budget: n(value(row, "calculated_budget") || value(row, "claculated_budget")),
    total_utilization: utilized,
    applied_budget: applied,
    budget_distribution_id: String(value(row, "budget_distribution_id")),
    appraisal_cycle_id: String(value(row, "appraisal_cycle_id")),
    original_budget_base: n(value(row, "original_budget_base") || value(row, "original_base")),
    current_budget_base: n(value(row, "current_budget_base") || value(row, "current_base")),
    original_headcount: n(value(row, "original_headcount") || value(row, "allocation_headcount")),
    current_headcount: n(value(row, "current_headcount") || value(row, "headcount")),
    utilization_percentage: applied > 0 ? (utilized / applied) * 100 : 0,
  };
}

function getUserField(user, key) {
  if (user && user[key] !== undefined && user[key] !== null)
    return String(user[key]).trim();
  return "";
}

function getUserRole(user) {
  let role = "";
  if (user && user.role_details) role = user.role_details.role_name || "";
  if (!role && user) role = user.role_name || "";
  if (!role && user) role = user.role || "";
  return String(role).trim().toLowerCase();
}

function isHR(user) {
  const role = getUserRole(user);
  return role === "hr" || role.indexOf("hr") !== -1;
}

function getUserValues(user) {
  const values = [];
  ["user_id", "email", "email_id", "display_name", "name"].forEach((key) => {
    const v = getUserField(user, key).toLowerCase();
    if (v) values.push(v);
  });
  const full = (
    getUserField(user, "first_name") +
    " " +
    getUserField(user, "last_name")
  )
    .trim()
    .toLowerCase();
  if (full) values.push(full);
  return values;
}

function matchesOwner(owner, a) {
  const text = String(owner || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!text || !a || !a.user) return false;
  const empId = String(a.user.empId || "")
    .trim()
    .toLowerCase();
  const email = String(a.user.email || "")
    .trim()
    .toLowerCase();

  // Appraiser values use "Employee ID - Full Name". Employee IDs may
  // themselves contain hyphens (e.g. WIS-1234), so split only on the
  // spaced separator, never on a hyphen inside the ID.
  const parts = text.split(/\s+-\s+/);
  const ownerId = parts.length > 1 ? parts[0].trim() : text;
  const ownerName = parts.length > 1 ? parts.slice(1).join(" - ").trim() : "";
  const userValues = getUserValues(a.user).map((value) =>
    String(value || "").trim().toLowerCase().replace(/\s+/g, " "),
  );
  return Boolean(
    (empId && (ownerId === empId || text === empId)) ||
    (email && (text === email || ownerId === email)) ||
    userValues.some((value) =>
      value === text || value === ownerId || (ownerName && value === ownerName),
    ),
  );
}

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

function requireBudgetScreen(a, level) {
  access.guard(a, function () {
    const keys = ["budgetAllocation", "budgetDistribution"];
    let ok = false;
    keys.some((key) => {
      try {
        access.requireScreen(a, key, level);
        ok = true;
        return true;
      } catch (error) {
        if (error instanceof access.HttpError) return false;
        throw error;
      }
    });
    if (!ok)
      throw new access.HttpError(
        403,
        "You do not have access to this budget screen.",
      );
  });
}

async function getAllRows(app, tableName) {
  const rows = [];
  const zcql = app.zcql();
  let last = "0";

  // Budget tables are small today, but keep the read paged so this remains safe
  // when the cycle history grows. ZCQL avoids the Data Store getPagedRows
  // request hanging on this Advanced I/O endpoint.
  for (let guard = 0; guard < 10000; guard += 1) {
    const query =
      "SELECT * FROM " +
      tableName +
      " WHERE ROWID > " +
      last +
      " ORDER BY ROWID ASC LIMIT 300";
    const result = await zcql.executeZCQLQuery(query);
    const page = (result || []).map(
      (item) => (item && (item[tableName] || Object.values(item)[0])) || {},
    );

    rows.push(...page);

    if (page.length < 300) break;

    let max = last;
    for (const row of page) {
      const id = String(row.ROWID || "");
      try {
        if (BigInt(id) > BigInt(max)) max = id;
      } catch (_) {}
    }
    if (max === last) break;
    last = max;
  }

  return rows;
}

function parseJson(text) {
  if (!String(text || "").trim()) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return {};
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === "object")
    return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(parseJson(req.body));
  if (typeof req.on !== "function" || req.readableEnded)
    return Promise.resolve({});
  return new Promise((resolve, reject) => {
    let text = "";
    req.on("data", (chunk) => {
      text += chunk.toString();
    });
    req.on("end", () => resolve(parseJson(text)));
    req.on("error", reject);
  });
}

function sendAccessError(res, error) {
  return sendJson(res, error.status || 403, {
    success: false,
    message: error.message,
    enforced: true,
  });
}

async function readBundle(app) {
  const [masterRows, distributionRows, compRows] = await Promise.all([
    getAllRows(app, "Budget_Master"),
    getAllRows(app, "Budget_Distribution"),
    getAllRows(app, "Budget_Distribution_Comp"),
  ]);

  return {
    master: masterRows.map(mapMaster),
    techEd: distributionRows.map(mapDistribution),
    compManager: compRows.map(mapComp),
  };
}

async function readTableById(app, tableId) {
  const table = app.datastore().table(tableId);
  const rows = [];
  let nextToken = null;
  for (let guard = 0; guard < 10000; guard += 1) {
    const options = { maxRows: 200 };
    if (nextToken) options.nextToken = nextToken;
    const page = await table.getPagedRows(options);
    rows.push(...(Array.isArray(page && page.data) ? page.data : []));
    if (!(page && page.more_records === true) || !page.next_token) break;
    nextToken = page.next_token;
  }
  return rows;
}

function normalizedIdentity(raw) {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object") {
    for (const key of ["emp_id", "employee_id", "ROWID", "rowid", "id", "value", "name"]) {
      if (raw[key] !== undefined && raw[key] !== null) {
        const found = normalizedIdentity(raw[key]);
        if (found) return found;
      }
    }
    return "";
  }
  return String(raw).trim().split(/\s+-\s+/)[0].trim().toLowerCase();
}

function cycleNameOf(cycle) {
  return String(firstValue(cycle, ["cycle_name", "cycleName", "name", "appraisal_year", "appraisalYear"]) || "").trim();
}

function cycleIdOf(cycle) {
  return String(firstValue(cycle, ["ROWID", "rowid", "id", "ID"]) || "").trim();
}

function cycleRank(cycle) {
  const dateValue = firstValue(cycle, ["start_date", "startDate", "effective_date", "effectiveDate"]);
  if (dateValue) {
    const timestamp = Date.parse(String(dateValue));
    if (Number.isFinite(timestamp)) return timestamp;
  }
  const name = cycleNameOf(cycle);
  const monthYear = name.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s,]*(\d{2,4})\b/i);
  if (monthYear) {
    const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(monthYear[1].slice(0,3).toLowerCase());
    let year = Number(monthYear[2]);
    if (year < 100) year += 2000;
    return new Date(year, month, 1).getTime();
  }
  const yearMatch = name.match(/(?:19|20)\d{2}/);
  return yearMatch ? new Date(Number(yearMatch[0]), 0, 1).getTime() : 0;
}

function cycleReference(raw) {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object") {
    return String(raw.ROWID ?? raw.rowid ?? raw.id ?? raw.ID ?? raw.value ?? raw.appraisal_cycle_name ?? raw.cycle_name ?? "").trim();
  }
  return String(raw).trim();
}

function currentCtc(row) {
  const stored = firstValue(row, [
    "total_ctc_with_rewards", "total_CTC_with_rewards", "total_ctc", "new_ctc", "newCTC",
    "totalCTCWithRewards", "total_ctc_with_rewards_current",
  ]);
  if (stored !== "" && stored !== null && stored !== undefined) return n(stored);
  // The current Appraisal Sheet computes Total CTC with Rewards as next-year
  // base salary plus total bonus: (current base + hike) + (allocated PB + new PB + new RB).
  return n(firstValue(row, ["current_annual_base_pay", "currentAnnualBasePay", "current_base_pay", "base_pay"])) +
    n(firstValue(row, ["hike_amount", "hikeAmount", "current_hike_amount"])) +
    n(firstValue(row, ["allocated_pb_amount", "allocatedPBAmount", "target_pb_allocated_for_may", "targetPBAllocatedForMay"])) +
    n(firstValue(row, ["new_pb_to_be_offered", "newPBToBeOffered", "current_performance_bonus"])) +
    n(firstValue(row, ["new_rb", "newRB", "current_retention_bonus"]));
}

function previousCtc(record) {
  return n(firstValue(record, [
    "total_CTC_with_rewards", "total_ctc_with_rewards", "new_ctc", "newCTC",
    "total_ctc", "totalCTCWithRewards",
  ]));
}

function readField(row, candidates) {
  if (!row) return "";
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    if (
      row[candidate] !== undefined &&
      row[candidate] !== null &&
      String(row[candidate]).trim()
    ) {
      return row[candidate];
    }
    const key = keys.find(
      (item) => item.toLowerCase() === candidate.toLowerCase(),
    );
    if (
      key &&
      row[key] !== undefined &&
      row[key] !== null &&
      String(row[key]).trim()
    ) {
      return row[key];
    }
  }
  return "";
}

async function readTechEdOwners(app) {
  // Appraisal_Sheet's Tech-Ed foreign key stores Employee_Master.ROWID.
  // Resolve it to the stable Employee ID + name for display and roster deduplication.
  const [employeeRows, unused] = await Promise.all([
    getAllRows(app, "Employee_Master"),
    Promise.resolve([]),
  ]);
  const employeeByRowId = new Map(employeeRows.map((employee) => [
    idOf(employee),
    {
      row_id: idOf(employee),
      employee_id: String(readField(employee, ["emp_id", "employee_id"]) || "").trim(),
      name: String(readField(employee, ["emp_name", "employee_name", "name"]) || "").trim(),
      email: String(readField(employee, ["email_id", "email", "work_email"]) || "").trim().toLowerCase(),
    },
  ]));
  const zcql = app.zcql();
  const owners = new Map();
  let last = "0";
  for (let guard = 0; guard < 10000; guard += 1) {
    // Read all columns because Appraisal_Sheet schemas may use a legacy alias
    // for the Tech-ED assignment. readField below handles those column names.
    const query =
      "SELECT * FROM Appraisal_Sheet " +
      "WHERE ROWID > " + last + " ORDER BY ROWID ASC LIMIT 300";
    const result = await zcql.executeZCQLQuery(query);
    const rows = (result || []).map(
      (item) => (item && (item.Appraisal_Sheet || Object.values(item)[0])) || {},
    );
    if (!rows.length) break;
    let max = last;
    rows.forEach((row) => {
      const rowId = String(row.ROWID || "");
      try { if (BigInt(rowId) > BigInt(max)) max = rowId; } catch (_) {}
      const rawAssignment = String(
        readField(row, [
          "appraiser_tech_ed",
          "appraiser_tech_ed_id",
          "appraiser_tech_ed1",
          "appraiser_teched",
          "tech_ed",
          "tech_ed_id",
        ]) || "",
      ).trim();
      if (!rawAssignment) return;

      const employee = employeeByRowId.get(rawAssignment);
      const assignment = employee
        ? (employee.employee_id && employee.name
            ? employee.employee_id + " - " + employee.name
            : employee.employee_id || employee.name || rawAssignment)
        : rawAssignment;
      const key = employee
        ? (employee.employee_id || employee.row_id).toLowerCase()
        : rawAssignment.toLowerCase();
      if (!owners.has(key)) {
        owners.set(key, {
          assignment,
          row_id: employee ? employee.row_id : "",
          employee_id: employee ? employee.employee_id : "",
          name: employee ? employee.name : "",
          email: employee ? employee.email : "",
        });
      }
    });
    if (rows.length < 300 || max === last) break;
    last = max;
  }
  return Array.from(owners.values());
}

async function readEmployeeRoster(app) {
  // Use the API's ZCQL paging helper rather than Data Store getPagedRows.
  // getPagedRows across both full employee tables was causing the endpoint
  // to exceed Catalyst's execution timeout.
  const [appraisalRows, masterRows] = await Promise.all([
    getAllRows(app, "Appraisal_Sheet"),
    getAllRows(app, "Employee_Master"),
  ]);
  const masterById = new Map(
    masterRows.map((row) => [
      String(readField(row, ["emp_id", "employee_id"]))
        .trim()
        .toLowerCase(),
      row,
    ]),
  );
  const masterByRowId = new Map(masterRows.map((row) => [idOf(row), row]));
  const formatTechEdAssignment = (raw) => {
    const assignment = String(raw || "").trim();
    if (!assignment) return "";
    const linked = masterByRowId.get(assignment);
    if (!linked) return assignment;
    const linkedId = String(readField(linked, ["emp_id", "employee_id"]) || "").trim();
    const linkedName = String(readField(linked, ["emp_name", "employee_name", "name"]) || "").trim();
    return linkedId && linkedName ? linkedId + " - " + linkedName : linkedId || linkedName || assignment;
  };
  const appraisalById = new Map(
    appraisalRows.map((row) => [
      String(readField(row, ["emp_id", "employee_id"]))
        .trim()
        .toLowerCase(),
      row,
    ]),
  );
  const allIds = new Set([...masterById.keys(), ...appraisalById.keys()]);
  return Array.from(allIds)
    .map((key) => {
      const row = appraisalById.get(key) || {};
      const master = masterById.get(key) || {};
      const id = String(
        readField(row, ["emp_id", "employee_id"]) ||
          readField(master, ["emp_id", "employee_id"]),
      ).trim();
      const assignment =
        readField(row, [
          "appraiser_tech_ed",
          "appraiser_tech_ed_id",
          "appraiser_tech_ed1",
          "appraiser_teched",
          "tech_ed",
          "tech_ed_id",
        ]) ||
        readField(master, [
          "appraiser_tech_ed",
          "appraiser_tech_ed_id",
          "appraiser_tech_ed1",
          "appraiser_teched",
          "tech_ed",
          "tech_ed_id",
        ]);
      const managerRaw = String(readField(row, ["comp_manager", "comp_manager_id", "comp_manager_name", "director"]) || readField(master, ["comp_manager", "comp_manager_id", "comp_manager_name", "director"]) || "").trim();
      const managerKey = managerRaw.split(/\s+-\s+/)[0].trim().toLowerCase();
      const managerRow = masterById.get(managerKey) || masterByRowId.get(managerKey) ||
        masterByRowId.get(managerRaw) || masterById.get(managerRaw.toLowerCase());
      const managerId = managerRow ? String(readField(managerRow, ["emp_id", "employee_id"]) || "").trim() : "";
      const managerName = managerRow ? String(readField(managerRow, ["emp_name", "employee_name", "name"]) || "").trim() : "";
      const displayManager = managerId && managerName ? managerId + " - " + managerName : managerName || managerRaw;
      const employeeStatus = String(readField(master, ["emp_status", "status"]) || readField(row, ["emp_status", "status"]) || "").trim();
      const rawEligibility = String(
        readField(master, ["eligible_status", "eligibility_status", "eligibility", "eligible"]) ||
        readField(row, ["eligible_status", "eligibility_status", "eligibility", "eligible"]) || ""
      ).trim().toLowerCase().replace(/[ _-]+/g, "");
      // Preserve an explicit Eligible/Not Eligible decision. On older Employee_Master
      // schemas with no eligibility field, use the established Active fallback.
      const eligibleStatus = ["eligible", "yes", "true", "1"].includes(rawEligibility)
        ? "eligible"
        : ["noteligible", "no", "false", "0", "ineligible"].includes(rawEligibility)
          ? "not eligible"
          : normalizeStatus(employeeStatus) === "Active" ? "eligible" : "not eligible";
      return {
        row_id: idOf(master),
        emp_id: id,
        name: String(
          readField(master, ["emp_name", "employee_name", "name"]) ||
            readField(row, ["emp_name", "employee_name", "name"]) ||
            id,
        ),
        appraiser_tech_ed: formatTechEdAssignment(assignment),
        comp_manager: managerRaw,
        comp_manager_display: displayManager,
        // Return appraisal amounts with the roster so utilization does not depend
        // on a separate employee endpoint's view or field projection.
        hike_amount: Number(readField(row, ["hike_amount", "hikeAmount", "current_hike_amount"]) || 0),
        new_pb_to_be_offered: Number(readField(row, ["new_pb_to_be_offered", "newPBToBeOffered", "performance_bonus", "current_performance_bonus"]) || 0),
        new_rb: Number(readField(row, ["new_rb", "newRB", "retention_bonus", "current_retention_bonus"]) || 0),
        joining_bonus: Number(readField(row, ["joining_bonus", "joiningBonus", "current_joining_bonus"]) || 0),
        pb_to_be_paid: Number(readField(row, ["pb_to_be_paid", "previous_year_performance_bonus", "previous_year_pb", "previous_pb"]) || 0),
        rb_to_be_paid: Number(readField(row, ["rb_to_be_paid", "previous_year_retention_bonus", "previous_year_rb", "previous_rb"]) || 0),
        previous_year_joining_bonus: Number(readField(row, ["previous_year_joining_bonus", "previous_year_jb", "previous_joining_bonus"]) || 0),
        appraiser_tech_ed_row_id: String(readField(row, ["appraiser_tech_ed1", "appraiser_tech_ed_row_id"]) || "").trim(),
        status: employeeStatus,
        eligible_status: eligibleStatus,
      };
    })
    .filter((row) => row.emp_id);
}

function matchesTechEdOwner(owner, a, techEdOwners = []) {
  if (matchesOwner(owner, a)) return true;
  const key = ownerKey(owner);
  if (!key) return false;
  // Budget_Distribution may store Employee_Master.ROWID, Employee ID, or
  // the display assignment. Resolve all three aliases to the same Tech-Ed.
  return techEdOwners.some((item) => {
    const aliases = [
      item.employee_id,
      item.row_id,
      item.ROWID,
      item.assignment,
      item.name,
      item.email,
      item.email_id,
    ].map((value) => ownerKey(value)).filter(Boolean);
    return aliases.includes(key) && matchesOwner(item.assignment, a);
  });
}

function filterOwn(bundle, a, techEdOwners = []) {
  if (!a || !a.enforced || (a.scope && a.scope.all)) return bundle;
  const techEd = bundle.techEd.filter((row) =>
    matchesTechEdOwner(row.appraiser_tech_ed_id, a, techEdOwners),
  );
  const allowedDistributionIds = new Set(techEd.map((row) => row.id));
  const compManager = bundle.compManager.filter((row) =>
    allowedDistributionIds.has(String(row.budget_distribution_id)),
  );
  // Budget_Master is org-level and has no owner column, so a non-HR user gets
  // only the master row for the cycle represented by their Tech-Ed allocation.
  const cycleIds = new Set(techEd.map((row) => row.appraisal_cycle_id));
  const master = bundle.master.filter((row) =>
    cycleIds.has(row.appraisal_cycle_id),
  );
  const employeeRoster = (bundle.employeeRoster || []).filter((employee) =>
    matchesTechEdOwner(employee.appraiser_tech_ed, a, techEdOwners),
  );
  return { master, techEd, compManager, employeeRoster };
}


function ownerKey(raw) {
  const text = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  const parts = text.split(/\s+-\s+/);
  return (parts.length > 1 ? parts[0] : text).trim();
}

function firstValue(row, names) {
  for (const name of names) {
    const hit = Object.keys(row || {}).find((key) => key.toLowerCase() === name.toLowerCase());
    if (hit && row[hit] !== null && row[hit] !== undefined && String(row[hit]).trim() !== "") return row[hit];
  }
  return "";
}

function firstNonZeroValue(row, names) {
  for (const name of names) {
    const hit = Object.keys(row || {}).find((key) => key.toLowerCase() === name.toLowerCase());
    if (!hit || row[hit] === null || row[hit] === undefined || String(row[hit]).trim() === "") continue;
    const parsed = n(row[hit]);
    if (parsed !== 0) return row[hit];
  }
  return firstValue(row, names);
}

function cycleDate(row) {
  const raw = firstValue(row, ["effective_date", "effectiveDate", "start_date", "startDate"]);
  const match = String(raw || "").match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const name = String(firstValue(row, ["cycle_name", "cycleName", "name", "appraisal_year"]) || "");
  const yearMatch = name.match(/(?:^|\D)(20\d{2}|\d{2})(?:\D|$)/);
  if (yearMatch) {
    const y = yearMatch[1].length === 2 ? 2000 + Number(yearMatch[1]) : Number(yearMatch[1]);
    const monthMatch = name.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const month = monthMatch ? months.indexOf(monthMatch[1].slice(0,3).toLowerCase()) + 1 : 1;
    return String(y).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-01";
  }
  return "";
}

async function getColumnNames(table) {
  try {
    const columns = await table.getAllColumns();
    return new Set((columns || []).map((column) => String(column.column_name || column.name || "").trim()).filter(Boolean));
  } catch (_) {
    return null;
  }
}

function pickColumn(columns, candidates, fallback) {
  if (!columns) return fallback;
  return candidates.find((name) => columns.has(name)) || fallback;
}

async function calculateBudgetBases(app, bundle, techEdOwners = []) {
  // Appraisal_Sheet is the source of truth for employee base, allocated PB,
  // Tech-ED and Comp Manager assignments. Do not depend on Payroll_Data cycle
  // foreign keys: those IDs are not the budget calculation source.
  const [appraisalRows, masterEmployeeRows, payrollRows, cycleRows] = await Promise.all([
    getAllRows(app, "Appraisal_Sheet"),
    getAllRows(app, "Employee_Master").catch(() => []),
    readTableById(app, TABLES.payroll).catch((error) => {
      console.error("Could not read Payroll_Data for prior-cycle CTC:", error && error.message);
      return [];
    }),
    readTableById(app, TABLES.cycles).catch((error) => {
      console.error("Could not read Appraisal_Cycle_Master:", error && error.message);
      return [];
    }),
  ]);
  if (!appraisalRows.length) {
    throw new Error("Appraisal_Sheet returned no rows; cannot calculate budget bases.");
  }
  // Same rule as employeesapi: Appraisal_Sheet first, Employee_Master as the
  // fallback (Comp Manager = director when the sheet has no comp_manager).
  const masterByEmployee = new Map();
  const masterByRowId = new Map();
  const masterByName = new Map();
  masterEmployeeRows.forEach((row) => {
    const empId = String(firstValue(row, ["emp_id", "empId", "employee_id"]) || "").trim();
    const name = String(firstValue(row, ["emp_name", "employee_name", "name"]) || "").trim();
    const rowId = idOf(row);
    if (empId) masterByEmployee.set(empId.toLowerCase(), row);
    if (rowId) masterByRowId.set(rowId, row);
    if (name) masterByName.set(name.toLowerCase(), row);
  });
  // Appraisal_Sheet assignment columns can contain Employee_Master.ROWID
  // foreign keys. Budget_Distribution stores stable business employee IDs.
  const resolvePersonId = (raw) => {
    const text = String(raw || "").trim();
    if (!text) return "";
    const split = text.split(/\s+-\s+/);
    if (split.length > 1) return split[0].trim();
    const person = masterByRowId.get(text) || masterByEmployee.get(text.toLowerCase()) || masterByName.get(text.toLowerCase());
    return person
      ? String(firstValue(person, ["emp_id", "empId", "employee_id"]) || idOf(person) || text).trim()
      : text;
  };

  const cycleById = new Map(cycleRows.map((cycle) => [cycleIdOf(cycle), cycle]).filter(([id]) => id));
  const cycleByName = new Map(cycleRows.map((cycle) => [cycleNameOf(cycle).toLowerCase(), cycle]).filter(([name]) => name));
  const employeeKeyFor = (raw) => {
    const identity = normalizedIdentity(raw);
    if (!identity) return "";
    const master = masterByRowId.get(identity) || masterByEmployee.get(identity) || masterByName.get(identity);
    return String(master ? firstValue(master, ["emp_id", "empId", "employee_id"]) || idOf(master) : identity).trim().toLowerCase();
  };
  const cycleReferenceForRow = (row) => cycleReference(firstValue(row, ["appraisal_cycle_name", "appraisalCycleName", "cycle_name", "cycle_id"]));
  const currentCycleFor = (cycleId) => cycleById.get(String(cycleId)) || cycleByName.get(String(cycleId).toLowerCase()) || null;
  const previousCycleFor = (cycleId) => {
    const current = currentCycleFor(cycleId);
    const currentRank = current ? cycleRank(current) : cycleRank({ cycle_name: cycleId });
    const earlier = cycleRows
      .filter((cycle) => cycleRank(cycle) > 0 && currentRank > 0 && cycleRank(cycle) < currentRank)
      .sort((a, b) => cycleRank(b) - cycleRank(a));
    return earlier[0] || null;
  };
  const historyRowsByCycleAndEmployee = new Map();
  payrollRows.forEach((historyRow) => {
    const employeeKey = employeeKeyFor(firstValue(historyRow, ["emp_id", "employee_id", "empId"]));
    const cycleRef = cycleReferenceForRow(historyRow);
    const referencedCycle = cycleById.get(cycleRef) || cycleByName.get(cycleRef.toLowerCase());
    const cycleKey = referencedCycle ? (cycleIdOf(referencedCycle) || cycleNameOf(referencedCycle).toLowerCase()) : cycleRef.toLowerCase();
    if (!employeeKey || !cycleKey) return;
    const key = cycleKey + "::" + employeeKey;
    const previous = historyRowsByCycleAndEmployee.get(key);
    const rowTime = String(historyRow.MODIFIEDTIME || historyRow.CREATEDTIME || historyRow.ROWID || "");
    const previousTime = previous ? String(previous.MODIFIEDTIME || previous.CREATEDTIME || previous.ROWID || "") : "";
    if (!previous || rowTime.localeCompare(previousTime, undefined, { numeric: true }) >= 0) historyRowsByCycleAndEmployee.set(key, historyRow);
  });

  const appraisalByEmployee = new Map();
  appraisalRows.forEach((row) => {
    const rawEmployeeId = String(firstValue(row, ["emp_id", "empId", "employee_id", "employeeId", "employee_id_text"]) || idOf(row)).trim();
    const employeeId = employeeKeyFor(rawEmployeeId);
    if (!employeeId) return;
    const rawTechEd = String(firstValue(row, [
      "appraiser_tech_ed", "appraiser_tech_ed_id", "appraiser_tech_ed1", "appraiser_teched", "appraiserTechED", "appraiserTechEd", "tech_ed", "tech_ed_id", "techED", "techEd",
    ]) || "").trim();
    const techEd = resolvePersonId(rawTechEd);
    const masterRow = masterByEmployee.get(employeeId) || {};
    const rawCompManager = String(firstValue(row, [
      "comp_manager", "comp_manager_id", "comp_manager_name", "comp_manager_emp_id", "compManager", "compManagerId",
    ]) || firstValue(masterRow, ["comp_manager", "director"]) || "").trim();
    // Keep the original value for budget aggregation/matching; display label is separate.
    const compManager = rawCompManager;
    const managerLookup = rawCompManager.split(/\s+-\s+/)[0].trim();
    const managerRow = masterByRowId.get(rawCompManager) ||
      masterByEmployee.get(managerLookup.toLowerCase()) ||
      masterByRowId.get(managerLookup) ||
      masterByName.get(rawCompManager.toLowerCase());
    const managerId = String(managerRow ? firstValue(managerRow, ["emp_id", "empId", "employee_id"]) : "").trim();
    const managerName = String(managerRow ? firstValue(managerRow, ["emp_name", "employee_name", "name"]) : "").trim();
    const compManagerDisplay = managerId && managerName
      ? managerId + " - " + managerName
      : managerName || rawCompManager;
    const activeCycleRow = cycleRows.find((cycle) => String(cycle.status || "").trim().toLowerCase() === "active" && cycle.archived !== true && cycle.archived !== "true") ||
      cycleRows.slice().sort((a, b) => cycleRank(b) - cycleRank(a))[0] || null;
    const currentCycleId = cycleIdOf(activeCycleRow) || String(bundle.master[0]?.appraisal_cycle_id || "");
    const previousCycle = previousCycleFor(currentCycleId);
    const previousCycleId = previousCycle ? (cycleIdOf(previousCycle) || cycleNameOf(previousCycle).toLowerCase()) : "";
    const historyKey = previousCycleId + "::" + employeeId;
    const previousRecord = previousCycle ? historyRowsByCycleAndEmployee.get(historyKey) || historyRowsByCycleAndEmployee.get(cycleNameOf(previousCycle).toLowerCase() + "::" + employeeId) : null;
    const currentCtcValue = currentCtc(row);
    const previousAppraisalCtc = previousRecord ? previousCtc(previousRecord) : currentCtcValue;
    const currentCycle = currentCycleFor(currentCycleId);
    const currentCycleName = cycleNameOf(currentCycle) || currentCycleId;
    const currentYearFull = currentCycleName.match(/(?:19|20)\d{2}/);
    const currentYearShort = currentCycleName.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-\s]*(\d{2})/i);
    const currentYear = currentYearFull ? currentYearFull[0] : currentYearShort ? "20" + currentYearShort[1] : currentCycleName;
    const lastAppraisalLabel = previousRecord ? cycleNameOf(previousCycle) : "New - " + currentYear;
    const basePay = n(firstValue(row, [
      "previous_year_base_pay", "previousYearBasePay", "last_year_base_pay", "lastYearBasePay",
      "previous_annual_base_pay", "previousAnnualBasePay",
      "current_annual_base_pay", "currentAnnualBasePay", "current_base_pay", "currentBasePay", "base_pay", "basePay", "annual_base_pay", "annualBasePay",
    ]));
    const allocatedPB = n(firstValue(row, [
      "allocated_pb_amount", "allocatedPBAmount", "pb_to_be_paid", "pbToBePaid", "target_pb_allocated_for_may", "targetPBAllocatedForMay", "allocated_pb", "allocatedPB", "total_pb", "totalPB",
    ]));
    const rawEligibility = String(
      firstValue(masterRow, ["eligibility", "eligible_status", "eligibility_status", "eligible"]) ||
      firstValue(row, ["eligibility", "eligible_status", "eligibility_status", "eligible"]) ||
      "",
    ).trim().toLowerCase().replace(/[ _-]+/g, "");
    const rawStatus = String(
      firstValue(masterRow, ["emp_status", "status", "employee_status"]) ||
      firstValue(row, ["emp_status", "status", "employee_status"]) ||
      "",
    ).trim().toLowerCase();
    const explicitEligible = ["eligible", "yes", "true", "1"].includes(rawEligibility);
    const explicitNotEligible = ["noteligible", "no", "false", "0", "ineligible"].includes(rawEligibility);
    const eligible = rawStatus === "active" &&
      (explicitNotEligible ? false : explicitEligible || !rawEligibility);
    const amount = (aliases) => n(firstNonZeroValue(row, aliases));
    const currentHike = amount(["hike_amount", "hikeAmount", "current_hike_amount"]);
    const previousHike = amount(["previous_year_hike_amount", "previousYearHikeAmount", "previous_hike_amount", "last_year_hike_amount"]);
    const currentPerformance = amount(["new_pb_to_be_offered", "newPBToBeOffered", "current_performance_bonus", "performance_bonus_current_year", "target_pb_allocated_for_may", "targetPBAllocatedForMay", "allocated_pb_amount", "allocatedPBAmount", "target_pb_next_year", "targetPBNextYear"]);
    const currentRetention = amount(["new_rb", "newRB", "current_retention_bonus", "retention_bonus_current_year"]);
    const currentJoining = amount(["joining_bonus", "joiningBonus", "current_joining_bonus"]);
    const previousPerformance = amount(["previous_year_performance_bonus", "previous_year_pb", "previous_pb", "pb_to_be_paid", "pbToBePaid"]);
    const previousRetention = amount(["previous_year_retention_bonus", "previous_year_rb", "previous_rb", "rb_to_be_paid", "rbToBePaid"]);
    const previousJoining = amount(["previous_year_joining_bonus", "previous_year_jb", "previous_joining_bonus", "joining_bonus_previous_year"]);
    const lastYearExpenses = basePay + previousHike + previousPerformance + previousRetention + previousJoining;
    const personName = String(firstValue(masterRow, ["emp_name", "employee_name", "name"]) || firstValue(row, ["name", "emp_name", "employee_name"]) || employeeId).trim();
    // Keep one current Appraisal_Sheet row per employee and include only the
    // fields the Tech-Ed budget page needs; this avoids a second full table scan
    // and avoids relying on employee-screen field permissions for money fields.
    appraisalByEmployee.set(employeeId, {
      employeeId,
      emp_id: String(firstValue(row, ["emp_id", "empId", "employee_id"]) || firstValue(masterRow, ["emp_id", "employee_id"]) || employeeId).trim(),
      name: personName,
      techEd,
      appraiser_tech_ed: techEd,
      appraiser_tech_ed_appraisal_sheet: techEd,
      compManager,
      comp_manager: rawCompManager,
      comp_manager_display: compManagerDisplay,
      eligible,
      status: rawStatus,
      eligible_status: eligible ? "eligible" : "not eligible",
      base: previousAppraisalCtc,
      previous_appraisal_total_ctc_with_rewards: previousAppraisalCtc,
      Previous_Appraisal_total_CTC_with_rewards: previousAppraisalCtc,
      last_appraisal_date: lastAppraisalLabel,
      last_appraisal_cycle_name: lastAppraisalLabel,
      hike_amount: currentHike,
      new_pb_to_be_offered: currentPerformance,
      current_performance_bonus: currentPerformance,
      target_pb_allocated_for_may: amount(["target_pb_allocated_for_may", "targetPBAllocatedForMay"]),
      allocated_pb_amount: amount(["allocated_pb_amount", "allocatedPBAmount"]),
      target_pb_next_year: amount(["target_pb_next_year", "targetPBNextYear"]),
      new_rb: currentRetention,
      joining_bonus: currentJoining,
      pb_to_be_paid: previousPerformance,
      previous_year_performance_bonus: previousPerformance,
      rb_to_be_paid: previousRetention,
      previous_year_retention_bonus: previousRetention,
      previous_year_joining_bonus: previousJoining,
      utilized_amount: currentHike + currentPerformance + currentRetention + currentJoining
        - previousPerformance - previousRetention - previousJoining,
    });
  });
  const employees = Array.from(appraisalByEmployee.values());
  bundle.employeeRoster = employees.map((employee) => ({
    emp_id: employee.emp_id,
    name: employee.name,
    appraiser_tech_ed: employee.appraiser_tech_ed,
    appraiser_tech_ed_appraisal_sheet: employee.appraiser_tech_ed_appraisal_sheet,
    comp_manager: employee.comp_manager,
    comp_manager_display: employee.comp_manager_display,
    status: employee.status,
    eligible_status: employee.eligible_status,
    budget_base: employee.base,
    previous_appraisal_total_ctc_with_rewards: employee.previous_appraisal_total_ctc_with_rewards,
    Previous_Appraisal_total_CTC_with_rewards: employee.Previous_Appraisal_total_CTC_with_rewards,
    last_appraisal_date: employee.last_appraisal_date,
    last_appraisal_cycle_name: employee.last_appraisal_cycle_name,
    hike_amount: employee.hike_amount,
    new_pb_to_be_offered: employee.new_pb_to_be_offered,
    current_performance_bonus: employee.current_performance_bonus,
    target_pb_allocated_for_may: employee.target_pb_allocated_for_may,
    allocated_pb_amount: employee.allocated_pb_amount,
    target_pb_next_year: employee.target_pb_next_year,
    new_rb: employee.new_rb,
    joining_bonus: employee.joining_bonus,
    pb_to_be_paid: employee.pb_to_be_paid,
    previous_year_performance_bonus: employee.previous_year_performance_bonus,
    rb_to_be_paid: employee.rb_to_be_paid,
    previous_year_retention_bonus: employee.previous_year_retention_bonus,
    previous_year_joining_bonus: employee.previous_year_joining_bonus,
    utilized_amount: employee.utilized_amount,
  }));
  const withBase = employees.filter((employee) => employee.base > 0).length;
  const withTechEd = employees.filter((employee) => employee.techEd).length;
  bundle.diagnostics = {
    appraisalRows: appraisalRows.length,
    employees: employees.length,
    employeesWithBase: withBase,
    employeesWithTechEd: withTechEd,
    budgetMasterCycles: bundle.master.filter((m) => String(m.appraisal_cycle_id || "").trim()).length,
    baseColumns: "Payroll_Data.total_CTC_with_rewards from the immediately previous appraisal cycle; current total_ctc_with_rewards for employees not present in that cycle",
  };
  if (!bundle.diagnostics.budgetMasterCycles) {
    bundle.diagnostics.warning = "No Budget_Master row has an appraisal cycle, so no budget base was calculated. Add a Budget_Master row for the cycle (appraisal_cycle_id) first.";
  } else if (!withBase) {
    bundle.diagnostics.warning = `None of the ${employees.length} employees in Appraisal_Sheet has Current Annual Base Pay or Allocated PB Amount, so the budget base is 0. Fill these columns (or re-upload the Appraisal Sheet).`;
  } else if (withBase < employees.length) {
    bundle.diagnostics.warning = `${employees.length - withBase} of ${employees.length} employees have no Current Annual Base Pay / Allocated PB Amount and add 0 to the budget base.`;
  }
  if (!withTechEd) {
    bundle.diagnostics.warning = (bundle.diagnostics.warning ? bundle.diagnostics.warning + " " : "") + "No employee in Appraisal_Sheet has an Appraiser Tech-ED, so no Tech-ED gets a base.";
  }

  const techLabels = new Map();
  const compLabels = new Map();
  employees.forEach((employee) => {
    const techKey = ownerKey(employee.techEd);
    const compKey = ownerKey(employee.compManager);
    if (techKey && !techLabels.has(techKey)) techLabels.set(techKey, employee.techEd);
    if (techKey && compKey && !compLabels.has(techKey + "::" + compKey)) {
      compLabels.set(techKey + "::" + compKey, {
        techEdKey: techKey,
        compKey,
        techEdName: employee.techEd,
        name: employee.compManager,
      });
    }
  });

  // Keep stable Employee IDs in varchar allocation columns. Display labels
  // (Employee ID - Name) are resolved by the frontend from Employee_Master.
  // Build an alias index so legacy ROWID-backed allocation rows match the same
  // canonical employee ID and do not create a second allocation for that person.
  const techAliasToKey = new Map();
  techEdOwners.forEach((item) => {
    const key = String(item.employee_id || ownerKey(item.assignment) || "").trim().toLowerCase();
    if (key && !techLabels.has(key)) techLabels.set(key, String(item.employee_id || item.assignment || key).trim());
    [item.employee_id, item.row_id, item.ROWID, item.assignment, item.name].filter(Boolean).forEach((alias) => {
      techAliasToKey.set(ownerKey(alias), key);
    });
  });
  const canonicalTechKey = (raw) => {
    const key = ownerKey(raw);
    return techAliasToKey.get(key) || key;
  };

  const distributionTable = app.datastore().table(TABLES.distribution);
  const compTable = app.datastore().table(TABLES.comp);
  const masterTable = app.datastore().table(TABLES.master);
  const [distributionColumns, compColumns, masterColumns] = await Promise.all([
    getColumnNames(distributionTable),
    getColumnNames(compTable),
    getColumnNames(masterTable),
  ]);
  const distCalcField = pickColumn(distributionColumns, ["calculated_budget", "claculated_budget"], "claculated_budget");
  const compCalcField = pickColumn(compColumns, ["calculated_budget", "claculated_budget"], "calculated_budget");
  const masterCalcField = pickColumn(masterColumns, ["calculated_budget"], "calculated_budget");

  const persistOptional = async (table, rowId, columns, candidates, val) => {
    if (!rowId || !columns) return;
    const field = candidates.find((candidate) => columns.has(candidate));
    if (!field) return;
    await table.updateRow({ ROWID: rowId, [field]: val });
  };

  // Appraisal_Sheet is the current appraisal roster. If a future schema adds
  // an appraisal-cycle field, cycle scoping can be applied without relying on
  // unrelated Payroll_Data foreign keys. For now each saved budget cycle uses
  // this sheet's employee assignments and pay/PB values.
  for (const master of bundle.master) {
    const cycleId = String(master.appraisal_cycle_id || "").trim();
    if (!cycleId) continue;
    const orgBase = employees.reduce((sum, employee) => sum + employee.base, 0);
    const techBases = new Map(Array.from(techLabels.keys(), (key) => [key, { base: 0, count: 0 }]));
    const compBases = new Map(Array.from(compLabels.keys(), (key) => [key, { base: 0, count: 0 }]));

    employees.forEach((employee) => {
      const techKey = ownerKey(employee.techEd);
      const compKey = ownerKey(employee.compManager);
      if (techKey) {
        const tech = techBases.get(techKey) || { base: 0, count: 0 };
        tech.base += employee.base;
        if (employee.eligible) tech.count += 1;
        techBases.set(techKey, tech);
      }
      if (techKey && compKey) {
        const key = techKey + "::" + compKey;
        const comp = compBases.get(key) || { base: 0, count: 0 };
        comp.base += employee.base;
        if (employee.eligible) comp.count += 1;
        compBases.set(key, comp);
      }
    });

    // Upsert missing Tech-ED owners for this appraisal cycle.
    for (const [techKey, ownerName] of techLabels) {
      let row = bundle.techEd.find((item) =>
        String(item.appraisal_cycle_id) === cycleId &&
        canonicalTechKey(item.appraiser_tech_ed_id) === techKey
      );
      if (!row) {
        const created = await distributionTable.insertRow({
          appraisal_cycle_id: cycleId,
          appraiser_tech_ed_id: String(ownerName || techKey).slice(0, 20),
          percentage: null,
          budget_base: 0,
          [distCalcField]: 0,
          applied_budget: 0,
          total_utilization: 0,
        });
        row = mapDistribution(created);
        bundle.techEd.push(row);
      }
      const stats = techBases.get(techKey) || { base: 0, count: 0 };
      const rawPct = row.percentage === null || row.percentage === undefined || row.percentage === "" ? null : n(row.percentage);
      const orgPct = n(master.budget_percentage);
      const orgPctSet = Boolean(master.budget_percentage_is_set);
      const effectivePct = rawPct === null ? orgPct : rawPct;
      const savedOriginalBase = n(row.original_budget_base || row.original_base || row.budget_base);
      const savedOriginalBudget = n(row.calculated_budget);
      const savedBaseMatches = savedOriginalBase > 0 && Math.abs(savedOriginalBase - stats.base) < 0.5;
      const hasOriginalSnapshot = savedOriginalBudget > 0 && savedBaseMatches;
      const originalBase = hasOriginalSnapshot ? savedOriginalBase : stats.base;
      const canCreateOriginal = rawPct !== null || orgPctSet;
      const originalBudget = hasOriginalSnapshot
        ? savedOriginalBudget
        : (canCreateOriginal ? (stats.base * (1 + effectivePct / 100)) : 0);
      const updatedBudget = (rawPct !== null || orgPctSet) ? stats.base * (1 + effectivePct / 100) : 0;

      const update = {
        ROWID: row.id,
        budget_base: stats.base,
        [distCalcField]: originalBudget,
        applied_budget: updatedBudget,
      };
      // Capture the initial Tech-Ed percentage only after HR has set the Org %.
      // Once the original budget is saved, later percentage edits affect only applied_budget.
      if (rawPct === null && orgPctSet) update.percentage = effectivePct;
      if (distributionColumns) {
        const originalBaseField = ["original_budget_base", "original_base"].find((key) => distributionColumns.has(key));
        const originalCountField = ["original_headcount", "allocation_headcount"].find((key) => distributionColumns.has(key));
        const currentCountField = ["current_headcount", "headcount"].find((key) => distributionColumns.has(key));
        const currentBaseField = ["current_budget_base", "current_base"].find((key) => distributionColumns.has(key));
        const overrideField = ["override_percentage", "allocation_percentage"].find((key) => distributionColumns.has(key));
        if (originalBaseField) update[originalBaseField] = originalBase;
        if (originalCountField && !(n(row[originalCountField]) > 0)) update[originalCountField] = stats.count;
        if (currentCountField) update[currentCountField] = stats.count;
        if (currentBaseField) update[currentBaseField] = stats.base;
        if (overrideField && rawPct === null) update[overrideField] = effectivePct;
      }
      await distributionTable.updateRow(update);
      Object.assign(row, {
        budget_base: stats.base,
        percentage: rawPct === null && !orgPctSet ? null : effectivePct,
        override_percentage: rawPct === null && !orgPctSet ? null : (rawPct === null ? effectivePct : rawPct),
        calculated_budget: originalBudget,
        applied_budget: updatedBudget,
        effective_percentage: effectivePct,
        current_headcount: stats.count,
        original_headcount: n(row.original_headcount) || stats.count,
      });
    }

    // Upsert Comp Manager owners under their matching Tech-ED parent.
    for (const [pairKey, details] of compLabels) {
      const parent = bundle.techEd.find((item) =>
        String(item.appraisal_cycle_id) === cycleId &&
        ownerKey(item.appraiser_tech_ed_id) === details.techEdKey
      );
      if (!parent) continue;
      let row = bundle.compManager.find((item) =>
        String(item.appraisal_cycle_id) === cycleId &&
        String(item.budget_distribution_id) === String(parent.id) &&
        ownerKey(item.comp_manager) === details.compKey
      );
      if (!row) {
        const created = await compTable.insertRow({
          appraisal_cycle_id: cycleId,
          budget_distribution_id: String(parent.id),
          comp_manager: String(details.compKey || details.name).slice(0, 30),
          // A new Comp Manager inherits the Tech-Ed's effective percentage,
          // giving the assigned team an initial base-proportional allocation.
          percentage: n(parent.effective_percentage ?? parent.percentage ?? master.budget_percentage),
          budget_base: 0,
          [compCalcField]: 0,
          applied_budget: 0,
          total_utilization: 0,
        });
        row = mapComp(created);
        bundle.compManager.push(row);
      }
      const stats = compBases.get(pairKey) || { base: 0, count: 0 };
      const pct = n(row.percentage);
      const originalBase = n(row.original_budget_base || row.original_base || row.budget_base) || stats.base;
      const originalBudget = n(row.calculated_budget) || (originalBase * (1 + pct / 100));
      const updatedBudget = stats.base * (1 + pct / 100);
      const update = {
        ROWID: row.id,
        budget_base: stats.base,
        [compCalcField]: originalBudget,
        applied_budget: updatedBudget,
      };
      if (compColumns) {
        const originalBaseField = ["original_budget_base", "original_base"].find((key) => compColumns.has(key));
        const originalCountField = ["original_headcount", "allocation_headcount"].find((key) => compColumns.has(key));
        const currentCountField = ["current_headcount", "headcount"].find((key) => compColumns.has(key));
        const currentBaseField = ["current_budget_base", "current_base"].find((key) => compColumns.has(key));
        if (originalBaseField) update[originalBaseField] = originalBase;
        if (originalCountField && !(n(row[originalCountField]) > 0)) update[originalCountField] = stats.count;
        if (currentCountField) update[currentCountField] = stats.count;
        if (currentBaseField) update[currentBaseField] = stats.base;
      }
      await compTable.updateRow(update);
      Object.assign(row, {
        budget_base: stats.base,
        calculated_budget: originalBudget,
        applied_budget: updatedBudget,
        current_headcount: stats.count,
        original_headcount: n(row.original_headcount) || stats.count,
      });
    }

    // Org totals are the roll-up of the Tech-ED allocations. Preserve the
    // original budget once captured; refresh the current/applied total each read.
    const cycleTech = bundle.techEd.filter((row) => String(row.appraisal_cycle_id) === cycleId);
    const previousOrgBase = n(master.org_budget_base);
    const previousOrgOriginal = n(master.calculated_budget);
    const orgPct = n(master.budget_percentage);
    const orgPctSet = Boolean(master.budget_percentage_is_set);
    // A snapshot is valid only when it was calculated from the current source base.
    // >= (rather than >) is intentional: a legitimate initial 0% budget equals its base.
    const hasOrgOriginalSnapshot = previousOrgOriginal > 0 && previousOrgBase > 0 &&
      Math.abs(previousOrgBase - orgBase) < 0.5;
    const orgOriginalBase = orgBase;
    const orgOriginal = hasOrgOriginalSnapshot
      ? previousOrgOriginal
      : (orgPctSet ? (orgOriginalBase * (1 + orgPct / 100)) : 0);
    const orgUpdated = orgPctSet ? orgBase * (1 + orgPct / 100) : 0;
    const orgFields = {
      ROWID: master.id,
      org_budget_base: orgOriginalBase,
      [masterCalcField]: orgOriginal,
      applied_budget: orgUpdated,
    };
    if (masterColumns) {
      const originalBaseField = ["original_budget_base", "original_base"].find((key) => masterColumns.has(key));
      const currentBaseField = ["current_budget_base", "current_base"].find((key) => masterColumns.has(key));
      const originalCountField = ["original_headcount", "allocation_headcount"].find((key) => masterColumns.has(key));
      const currentCountField = ["current_headcount", "headcount"].find((key) => masterColumns.has(key));
      if (originalBaseField) orgFields[originalBaseField] = orgOriginalBase;
      if (currentBaseField) orgFields[currentBaseField] = orgBase;
      if (originalCountField && !(n(master[originalCountField]) > 0)) orgFields[originalCountField] = employees.filter((employee) => employee.eligible).length;
      if (currentCountField) orgFields[currentCountField] = employees.filter((employee) => employee.eligible).length;
    }
    await masterTable.updateRow(orgFields);
    Object.assign(master, {
      org_budget_base: orgOriginalBase,
      calculated_budget: orgOriginal,
      applied_budget: orgUpdated,
      current_budget_base: orgBase,
      current_headcount: employees.filter((employee) => employee.eligible).length,
    });
  }

  return bundle;
}

module.exports = async function (req, res) {
  try {
    const method = String(req.method || "GET").toUpperCase();
    if (method === "OPTIONS") return sendJson(res, 200, { success: true });

    const a = await checkAccess(req);
    requireBudgetScreen(a, method === "GET" ? "view" : "edit");

    // Budget tables are accessed server-side after accessCore has already authorized
    // the signed-in user. Use the admin-scoped Catalyst app here so Data Store
    // App User table permissions cannot turn an authorized budget request into
    // a 500 error.
    const app = catalyst.initialize(req, { scope: "admin" });

    if (method === "GET") {
      // Keep this endpoint limited to the three budget tables. The frontend
      // already loads the full employee roster through employeesapi; scanning
      // both employee tables again here caused Catalyst's execution timeout.
      const [rawBundle, techEdOwners] = await Promise.all([
        readBundle(app),
        readTechEdOwners(app),
      ]);
      let calculatedBundle = rawBundle;
      try {
        calculatedBundle = await calculateBudgetBases(app, rawBundle, techEdOwners);
      } catch (calculationError) {
        // Never report a successful zero-budget response when source calculations
        // failed. Return the actionable source/schema error to the frontend.
        console.error("Budget base calculation failed:", calculationError);
        return sendJson(res, 500, {
          success: false,
          message: "Could not calculate budget from Appraisal_Sheet: " +
            String(calculationError && calculationError.message || calculationError),
        });
      }
      const bundle = filterOwn(calculatedBundle, a, techEdOwners);
      return sendJson(res, 200, {
        success: true,
        data: bundle.techEd,
        master: bundle.master,
        techEd: bundle.techEd,
        compManager: bundle.compManager,
        techEdOwners,
        employeeRoster: bundle.employeeRoster || [],
        techEdCount: techEdOwners.length,
        diagnostics: calculatedBundle.diagnostics || null,
        more_records: false,
        next_token: null,
      });
    }

    if (method !== "PUT") {
      return sendJson(res, 405, {
        success: false,
        message: "Method not allowed",
      });
    }

    const body = await parseBody(req);
    const resource = String(body.resource || "master").toLowerCase();
    let id = String(body.id || "").trim();

    // Upsert cycle-scoped allocations using the actual foreign-key ROWIDs.
    // Budget_Master.appraisal_cycle_id and both cycle/parent columns are Data Store
    // foreign keys; the Tech-ED/Comp Manager varchar columns store business IDs.
    if (!id && resource === "master" && String(body.appraisal_cycle_id || "").trim()) {
      if (a.enforced && !Boolean(a.scope && a.scope.all) && !isHR(a.user)) {
        throw new access.HttpError(403, "Only HR can update Budget Master.");
      }
      if (!a.enforced) {
        const currentUser = await app.userManagement().getCurrentUser();
        if (!currentUser || !isHR(currentUser)) {
          return sendJson(res, 403, { success: false, message: "Only HR can update Budget Master." });
        }
      }
      const cycleId = String(body.appraisal_cycle_id).trim();
      const existing = (await getAllRows(app, "Budget_Master")).find(
        (row) => String(value(row, "appraisal_cycle_id")) === cycleId,
      );
      if (existing) {
        id = idOf(existing);
      } else {
        const masterTable = app.datastore().table(TABLES.master);
        const created = await masterTable.insertRow({
          appraisal_cycle_id: cycleId,
          budget_percentage: n(body.budget_percentage),
          budget_utilized: n(body.budget_utilized),
          org_budget_base: n(body.org_budget_base),
          calculated_budget: n(body.calculated_budget),
          applied_budget: n(body.applied_budget),
        });
        id = idOf(created);
      }
    }

    if (!id && resource === "distribution" && String(body.appraisal_cycle_id || "").trim() && String(body.appraiser_tech_ed_id || "").trim()) {
      const cycleId = String(body.appraisal_cycle_id).trim();
      const techEdId = String(body.appraiser_tech_ed_id).trim().split(/\s+-\s+/)[0].slice(0, 20);
      if (a.enforced && !Boolean(a.scope && a.scope.all) && !matchesTechEdOwner(techEdId, a, await readTechEdOwners(app))) {
        throw new access.HttpError(403, "You can only configure your own Tech-Ed budget.");
      }
      access.guard(a, () => access.requireAction(a, "changeBudgetConfig"));
      const existing = (await getAllRows(app, "Budget_Distribution")).find((row) =>
        String(value(row, "appraisal_cycle_id")) === cycleId &&
        ownerKey(value(row, "appraiser_tech_ed_id")) === ownerKey(techEdId),
      );
      if (existing) {
        id = idOf(existing);
      } else {
        const distTable = app.datastore().table(TABLES.distribution);
        const calcField = pickColumn(await getColumnNames(distTable), ["calculated_budget", "claculated_budget"], "claculated_budget");
        const created = await distTable.insertRow({
          appraisal_cycle_id: cycleId,
          appraiser_tech_ed_id: techEdId,
          percentage: body.percentage === "" || body.percentage === undefined ? null : n(body.percentage),
          budget_base: n(body.budget_base),
          [calcField]: n(body.calculated_budget),
          applied_budget: n(body.applied_budget),
          total_utilization: n(body.total_utilization),
        });
        id = idOf(created);
      }
    }

    // A Comp Manager in the Tech-ED's team may have no Budget_Distribution_Comp
    // row yet: create it under the parent allocation, then update it below.
    if (!id && (resource === "comp" || resource === "compmanager") && body.budget_distribution_id && String(body.comp_manager || "").trim()) {
      const parentId = String(body.budget_distribution_id).trim();
      const compName = String(body.comp_manager).trim();
      const parent = (await getAllRows(app, "Budget_Distribution")).find((row) => idOf(row) === parentId);
      if (!parent) {
        return sendJson(res, 400, { success: false, message: "The parent Tech-Ed budget allocation was not found." });
      }
      const adminScope = Boolean(a && a.scope && a.scope.all);
      if (a.enforced && !adminScope && !matchesTechEdOwner(value(parent, "appraiser_tech_ed_id"), a, await readTechEdOwners(app))) {
        throw new access.HttpError(403, "You can only update Comp Manager budgets under your Tech-Ed.");
      }
      const existingComp = (await getAllRows(app, "Budget_Distribution_Comp")).find((row) =>
        String(value(row, "budget_distribution_id")) === parentId && ownerKey(value(row, "comp_manager")) === ownerKey(compName),
      );
      if (existingComp) {
        id = idOf(existingComp);
      } else {
        const compTable = app.datastore().table(TABLES.comp);
        const calcField = pickColumn(await getColumnNames(compTable), ["calculated_budget", "claculated_budget"], "calculated_budget");
        const created = await compTable.insertRow({
          appraisal_cycle_id: String(value(parent, "appraisal_cycle_id")),
          budget_distribution_id: parentId,
          comp_manager: compName,
          percentage: 0,
          budget_base: n(body.budget_base),
          [calcField]: 0,
          applied_budget: 0,
          total_utilization: 0,
        });
        id = idOf(created);
      }
    }
    if (!id)
      return sendJson(res, 400, {
        success: false,
        message: "Budget row id is required.",
      });

    const tables = {
      master: { table: TABLES.master, mapper: mapMaster },
      distribution: { table: TABLES.distribution, mapper: mapDistribution },
      comp: { table: TABLES.comp, mapper: mapComp },
      compmanager: { table: TABLES.comp, mapper: mapComp },
    };
    const target = tables[resource];
    if (!target)
      return sendJson(res, 400, {
        success: false,
        message: "Invalid budget resource.",
      });

    const isAdminScope = Boolean(a && a.scope && a.scope.all);
    if (!a.enforced) {
      const user = await app.userManagement().getCurrentUser();
      if (!user)
        return sendJson(res, 401, {
          success: false,
          message: "Authentication is required.",
        });
      if (!isHR(user) && resource === "master") {
        return sendJson(res, 403, {
          success: false,
          message: "Only HR can update Budget Master.",
        });
      }
    }

    const table = app.datastore().table(target.table);
    const currentRows = await getAllRows(
      app,
      Object.keys(TABLES).find((key) => TABLES[key] === target.table) ===
        "master"
        ? "Budget_Master"
        : Object.keys(TABLES).find((key) => TABLES[key] === target.table) ===
            "distribution"
          ? "Budget_Distribution"
          : "Budget_Distribution_Comp",
    );
    const current = currentRows.find((row) => idOf(row) === id);
    if (!current)
      return sendJson(res, 404, {
        success: false,
        message: "Budget row not found.",
      });

    if (resource === "comp" || resource === "compmanager") {
      const requestedPercentage = Object.prototype.hasOwnProperty.call(body, "percentage")
        ? Number(body.percentage)
        : n(value(current, "percentage"));
      if (!Number.isFinite(requestedPercentage) || requestedPercentage < 0 || requestedPercentage > 100) {
        return sendJson(res, 400, {
          success: false,
          message: "Comp Manager allotment percentage must be between 0 and 100.",
        });
      }

      const parentId = String(value(current, "budget_distribution_id") || "");
      const parentRows = await getAllRows(app, "Budget_Distribution");
      const parent = parentRows.find((row) => idOf(row) === parentId);
      if (!parent) {
        return sendJson(res, 400, {
          success: false,
          message: "The parent Tech-Ed budget allocation was not found.",
        });
      }

      const requestedApplied = Object.prototype.hasOwnProperty.call(body, "applied_budget")
        ? n(body.applied_budget)
        : n(body.budget_base ?? value(current, "budget_base")) * requestedPercentage / 100;
      const siblings = await getAllRows(app, "Budget_Distribution_Comp");
      const totalAfter = siblings
        .filter((row) => String(value(row, "budget_distribution_id") || "") === parentId && idOf(row) !== id)
        .reduce((sum, row) => sum + n(value(row, "applied_budget")), 0) + requestedApplied;
      const parentBudget = n(value(parent, "applied_budget"));
      if (totalAfter > parentBudget + 0.5) {
        return sendJson(res, 400, {
          success: false,
          message: "Allocation blocked: Comp Manager budgets would total " +
            totalAfter.toFixed(2) + ", exceeding the Tech-Ed's available budget of " +
            parentBudget.toFixed(2) + ". Reduce one or more Comp Manager percentages.",
        });
      }
    }

    if (a.enforced && !isAdminScope) {
      if (
        resource === "distribution" &&
        !matchesTechEdOwner(value(current, "appraiser_tech_ed_id"), a, await readTechEdOwners(app))
      ) {
        throw new access.HttpError(
          403,
          "You can only update your own Tech-Ed budget.",
        );
      }
      if (resource === "comp" || resource === "compmanager") {
        const parentId = String(value(current, "budget_distribution_id") || "");
        const parents = await getAllRows(app, "Budget_Distribution");
        const parent = parents.find((row) => idOf(row) === parentId);
        if (
          !parent ||
          !matchesTechEdOwner(value(parent, "appraiser_tech_ed_id"), a, await readTechEdOwners(app))
        ) {
          throw new access.HttpError(
            403,
            "You can only update Comp Manager budgets under your Tech-Ed.",
          );
        }
      }
      if (resource === "master" && !isHR(a.user)) {
        throw new access.HttpError(403, "Only HR can update Budget Master.");
      }
    }

    const fieldsByResource = {
      master: [
        "budget_percentage",
        "org_budget_base",
        "budget_utilized",
        "calculated_budget",
        "applied_budget",
      ],
      distribution: [
        "percentage",
        "budget_base",
        "total_utilization",
        "applied_budget",
        "appraisal_cycle_id",
        "appraiser_tech_ed_id",
      ],
      comp: [
        "percentage",
        "budget_base",
        "total_utilization",
        "applied_budget",
        "comp_manager",
        "budget_distribution_id",
        "appraisal_cycle_id",
      ],
    };
    const fields = [
      ...fieldsByResource[resource === "compmanager" ? "comp" : resource],
    ];
    if (resource === "distribution" || resource === "comp" || resource === "compmanager") {
      const columns = await getColumnNames(table);
      const fallback = resource === "distribution" ? "claculated_budget" : "calculated_budget";
      fields.push(pickColumn(columns, ["calculated_budget", "claculated_budget"], fallback));
    }
    const update = { ROWID: id };
    fields.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        update[key] = body[key];
        // Store the stable business employee ID in the varchar Tech-Ed field,
        // even when the UI submits the friendly "Employee ID - Name" label.
        if (resource === "distribution" && key === "appraiser_tech_ed_id") {
          update[key] = String(body[key] || "").trim().split(/\s+-\s+/)[0].slice(0, 20);
        }
      }
      // Frontend uses calculated_budget. Persist to whichever calculated
      // amount column actually exists in this Data Store table.
      if (
        (key === "claculated_budget" || key === "calculated_budget") &&
        Object.prototype.hasOwnProperty.call(body, "calculated_budget")
      ) {
        update[key] = body.calculated_budget;
      }
    });

    const changed = Object.keys(update).filter((key) => key !== "ROWID");
    if (!changed.length)
      return sendJson(res, 400, {
        success: false,
        message: "No budget fields were provided.",
      });

    access.guard(a, function () {
      if (
        resource === "master" ||
        resource === "distribution" ||
        resource === "comp" ||
        resource === "compmanager"
      ) {
        if (
          changed.some((key) =>
            [
              "budget_percentage",
              "org_budget_base",
              "budget_base",
              "percentage",
              "calculated_budget",
              "claculated_budget",
              "applied_budget",
            ].includes(key),
          )
        ) {
          try {
            access.requireAction(a, "changeBudgetConfig");
          } catch (e) {
            if (!(e instanceof access.HttpError)) throw e;
          }
        }
        if (
          changed.some((key) =>
            ["budget_utilized", "total_utilization"].includes(key),
          )
        ) {
          try {
            access.requireAction(a, "allotNextLevel");
          } catch (e) {
            if (!(e instanceof access.HttpError)) throw e;
          }
        }
      }
    });

    const updated = await table.updateRow(update);
    return sendJson(res, 200, {
      success: true,
      resource,
      data: target.mapper(updated),
    });
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);
    console.error("budgetmasterapi:", error);
    return sendJson(res, 500, {
      success: false,
      message: error && error.message ? error.message : "Budget API failed.",
    });
  }
};
