"use strict";

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

// These IDs are the Data Store table IDs from Catalyst Console → Data Store.
const TABLES = {
  master: "74008000000034565", // Budget_Master
  distribution: "74008000000033809", // Budget_Distribution
  comp: "74008000000023149", // Budget_Distribution_Comp
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
      return {
        row_id: idOf(master),
        emp_id: id,
        name: String(
          readField(master, ["emp_name", "employee_name", "name"]) ||
            readField(row, ["emp_name", "employee_name", "name"]) ||
            id,
        ),
        appraiser_tech_ed: formatTechEdAssignment(assignment),
        status: String(
          readField(master, ["emp_status", "status"]) ||
            readField(row, ["emp_status", "status"]) ||
            "",
        ),
      };
    })
    .filter((row) => row.emp_id);
}

function matchesTechEdOwner(owner, a, techEdOwners = []) {
  if (matchesOwner(owner, a)) return true;
  const key = ownerKey(owner);
  if (!key) return false;
  return techEdOwners.some((item) => {
    const employeeId = String(item.employee_id || "").trim();
    return employeeId && ownerKey(employeeId) === key && matchesOwner(item.assignment, a);
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
  return { master, techEd, compManager };
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
  const [appraisalRows, masterEmployeeRows] = await Promise.all([
    getAllRows(app, "Appraisal_Sheet"),
    getAllRows(app, "Employee_Master").catch(() => []),
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

  const appraisalByEmployee = new Map();
  appraisalRows.forEach((row) => {
    const employeeId = String(firstValue(row, ["emp_id", "empId", "employee_id", "employeeId", "employee_id_text"]) || idOf(row)).trim().toLowerCase();
    if (!employeeId) return;
    const rawTechEd = String(firstValue(row, [
      "appraiser_tech_ed", "appraiser_tech_ed_id", "appraiser_tech_ed1", "appraiser_teched", "appraiserTechED", "appraiserTechEd", "tech_ed", "tech_ed_id", "techED", "techEd",
    ]) || "").trim();
    const techEd = resolvePersonId(rawTechEd);
    const masterRow = masterByEmployee.get(employeeId) || {};
    const rawCompManager = String(firstValue(row, [
      "comp_manager", "comp_manager_id", "comp_manager_name", "comp_manager_emp_id", "compManager", "compManagerId",
    ]) || firstValue(masterRow, ["comp_manager", "director"]) || "").trim();
    const compManager = rawCompManager;
    const basePay = n(firstValue(row, [
      "current_annual_base_pay", "currentAnnualBasePay", "current_base_pay", "currentBasePay", "base_pay", "basePay", "annual_base_pay", "annualBasePay",
    ]));
    const allocatedPB = n(firstValue(row, [
      "allocated_pb_amount", "allocatedPBAmount", "pb_to_be_paid", "pbToBePaid", "target_pb_allocated_for_may", "targetPBAllocatedForMay", "allocated_pb", "allocatedPB", "total_pb", "totalPB",
    ]));
    // Appraisal_Sheet can contain repeated employee records during imports.
    // Keep one record per employee so the same salary is never summed twice.
    appraisalByEmployee.set(employeeId, {
      employeeId,
      techEd,
      compManager,
      base: basePay + allocatedPB,
    });
  });
  const employees = Array.from(appraisalByEmployee.values());
  const withBase = employees.filter((employee) => employee.base > 0).length;
  const withTechEd = employees.filter((employee) => employee.techEd).length;
  bundle.diagnostics = {
    appraisalRows: appraisalRows.length,
    employees: employees.length,
    employeesWithBase: withBase,
    employeesWithTechEd: withTechEd,
    budgetMasterCycles: bundle.master.filter((m) => String(m.appraisal_cycle_id || "").trim()).length,
    baseColumns: "current_annual_base_pay + allocated_pb_amount",
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
  techEdOwners.forEach((item) => {
    const key = String(item.employee_id || ownerKey(item.assignment) || "").trim();
    if (key && !techLabels.has(key.toLowerCase())) techLabels.set(key.toLowerCase(), key);
  });

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
        tech.count += 1;
        techBases.set(techKey, tech);
      }
      if (techKey && compKey) {
        const key = techKey + "::" + compKey;
        const comp = compBases.get(key) || { base: 0, count: 0 };
        comp.base += employee.base;
        comp.count += 1;
        compBases.set(key, comp);
      }
    });

    // Upsert missing Tech-ED owners for this appraisal cycle.
    for (const [techKey, ownerName] of techLabels) {
      let row = bundle.techEd.find((item) =>
        String(item.appraisal_cycle_id) === cycleId &&
        ownerKey(item.appraiser_tech_ed_id) === techKey
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
      const effectivePct = rawPct === null || rawPct === orgPct ? orgPct : rawPct;
      const originalBase = n(row.original_budget_base || row.original_base || row.budget_base) || stats.base;
      const originalBudget = n(row.calculated_budget) || (originalBase * orgPct / 100);
      const updatedBudget = stats.base * effectivePct / 100;

      const update = {
        ROWID: row.id,
        budget_base: stats.base,
        [distCalcField]: originalBudget,
        applied_budget: updatedBudget,
      };
      // A Tech-ED at the Org % inherits the default. Store null in the
      // override field so future Org % changes flow through automatically.
      if (rawPct === null || rawPct === orgPct) update.percentage = null;
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
        if (overrideField && (rawPct === null || rawPct === orgPct)) update[overrideField] = null;
      }
      await distributionTable.updateRow(update);
      Object.assign(row, {
        budget_base: stats.base,
        percentage: effectivePct,
        override_percentage: rawPct === null || rawPct === orgPct ? null : rawPct,
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
      const originalBudget = n(row.calculated_budget) || (originalBase * pct / 100);
      const updatedBudget = stats.base * pct / 100;
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
    const orgOriginal = cycleTech.reduce((sum, row) => sum + n(row.calculated_budget), 0);
    const orgUpdated = cycleTech.reduce((sum, row) => sum + n(row.applied_budget), 0);
    const previousOrgBase = n(master.org_budget_base);
    const orgOriginalBase = previousOrgBase || orgBase;
    const orgFields = {
      ROWID: master.id,
      org_budget_base: orgOriginalBase,
      [masterCalcField]: orgOriginal || (orgOriginalBase * n(master.budget_percentage) / 100),
      applied_budget: orgUpdated || (orgBase * n(master.budget_percentage) / 100),
    };
    if (masterColumns) {
      const originalBaseField = ["original_budget_base", "original_base"].find((key) => masterColumns.has(key));
      const currentBaseField = ["current_budget_base", "current_base"].find((key) => masterColumns.has(key));
      const originalCountField = ["original_headcount", "allocation_headcount"].find((key) => masterColumns.has(key));
      const currentCountField = ["current_headcount", "headcount"].find((key) => masterColumns.has(key));
      if (originalBaseField) orgFields[originalBaseField] = orgOriginalBase;
      if (currentBaseField) orgFields[currentBaseField] = orgBase;
      if (originalCountField && !(n(master[originalCountField]) > 0)) orgFields[originalCountField] = employees.length;
      if (currentCountField) orgFields[currentCountField] = employees.length;
    }
    await masterTable.updateRow(orgFields);
    Object.assign(master, {
      org_budget_base: orgOriginalBase,
      calculated_budget: orgOriginal || (orgOriginalBase * n(master.budget_percentage) / 100),
      applied_budget: orgUpdated || (orgBase * n(master.budget_percentage) / 100),
      current_budget_base: orgBase,
      current_headcount: employees.length,
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
