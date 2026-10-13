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
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
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
  const calculated = n(value(row, "claculated_budget")); // column name is kept exactly as created in Data Store.
  const applied = n(value(row, "applied_budget"));
  const utilized = n(value(row, "total_utilization"));
  return {
    id: idOf(row),
    appraisal_cycle_id: String(value(row, "appraisal_cycle_id")),
    appraiser_tech_ed_id: String(value(row, "appraiser_tech_ed_id")),
    percentage: n(value(row, "percentage")),
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
    calculated_budget: n(value(row, "calculated_budget")),
    total_utilization: utilized,
    applied_budget: applied,
    budget_distribution_id: String(value(row, "budget_distribution_id")),
    appraisal_cycle_id: String(value(row, "appraisal_cycle_id")),
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
    .toLowerCase();
  if (!text || !a || !a.user) return false;
  const empId = String(a.user.empId || "")
    .trim()
    .toLowerCase();
  const email = String(a.user.email || "")
    .trim()
    .toLowerCase();
  const parts = text.match(/^(\S+)\s*-\s*(.+)$/);
  const ownerId = parts ? parts[1] : text;
  return Boolean(
    (empId && ownerId === empId) ||
    (email && text === email) ||
    getUserValues(a.user).some((v) => v === text || v === ownerId),
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
  // Read Appraisal_Sheet directly for the source-of-truth Tech-ED assignments.
  // Do not scan Employee_Master or budget distribution to discover Tech-ED names.
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
      const assignment = String(
        readField(row, [
          "appraiser_tech_ed",
          "appraiser_tech_ed_id",
          "appraiser_teched",
          "tech_ed",
          "tech_ed_id",
        ]) || "",
      ).trim();
      if (!assignment) return;
      // A cell may contain either "EMP005" or "EMP005 - Name".
      // Deduplicate by the employee ID so both representations count once.
      // Strip a prefix only when it looks like an employee ID (for example, EMP005 - Name).
      // Do not split ordinary Tech-ED names at the hyphen, or distinct owners collapse into one.
      const pair = assignment.match(/^([a-z]*\d+)\s*-/i);
      const key = String(pair ? pair[1] : assignment).trim().toLowerCase();
      if (!owners.has(key)) owners.set(key, { assignment });
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
          "appraiser_teched",
          "tech_ed",
          "tech_ed_id",
        ]) ||
        readField(master, [
          "appraiser_tech_ed",
          "appraiser_tech_ed_id",
          "appraiser_teched",
          "tech_ed",
          "tech_ed_id",
        ]);
      return {
        emp_id: id,
        name: String(
          readField(master, ["emp_name", "employee_name", "name"]) ||
            readField(row, ["emp_name", "employee_name", "name"]) ||
            id,
        ),
        appraiser_tech_ed: String(assignment).trim(),
        status: String(
          readField(master, ["emp_status", "status"]) ||
            readField(row, ["emp_status", "status"]) ||
            "",
        ),
      };
    })
    .filter((row) => row.emp_id);
}

function filterOwn(bundle, a) {
  if (!a || !a.enforced || (a.scope && a.scope.all)) return bundle;
  const techEd = bundle.techEd.filter((row) =>
    matchesOwner(row.appraiser_tech_ed_id, a),
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
  const text = String(raw || "").trim().toLowerCase().replace(/\\s+/g, " ");
  const pair = text.match(/^([a-z]*\\d+)\\s*-\\s*(.+)$/i);
  return pair ? pair[1].toLowerCase() : text;
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
  const match = String(raw || "").match(/^\\d{4}-\\d{2}-\\d{2}/);
  if (match) return match[0];
  const name = String(firstValue(row, ["cycle_name", "cycleName", "name", "appraisal_year"]) || "");
  const yearMatch = name.match(/(?:^|\\D)(20\\d{2}|\\d{2})(?:\\D|$)/);
  if (yearMatch) {
    const y = yearMatch[1].length === 2 ? 2000 + Number(yearMatch[1]) : Number(yearMatch[1]);
    const monthMatch = name.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const month = monthMatch ? months.indexOf(monthMatch[1].slice(0,3).toLowerCase()) + 1 : 1;
    return String(y).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-01";
  }
  return "";
}

async function calculateBudgetBases(app, bundle) {
  // Payroll rows are keyed to the employee and appraisal-cycle ROWIDs. Use the
  // table IDs here so the calculation does not depend on the physical table name.
  const [payrollRows, cycleRows, appraisalRows] = await Promise.all([
    readTableById(app, "74008000000035326"),
    readTableById(app, "74008000000034190"),
    getAllRows(app, "Appraisal_Sheet"),
  ]);

  const cycles = cycleRows.map((row) => ({
    id: idOf(row),
    date: cycleDate(row),
  })).filter((row) => row.id && row.date).sort((a, b) => a.date.localeCompare(b.date));

  const assignments = new Map();
  appraisalRows.forEach((row) => {
    const emp = String(firstValue(row, ["emp_id", "employee_id", "employee_master_id"]) || "").trim().toLowerCase();
    if (!emp) return;
    assignments.set(emp, {
      techEd: String(firstValue(row, ["appraiser_tech_ed", "appraiser_tech_ed_id", "appraiser_teched", "tech_ed", "tech_ed_id"]) || "").trim(),
      compManager: String(firstValue(row, ["comp_manager", "comp_manager_id", "comp_manager_name", "comp_manager_emp_id"]) || "").trim(),
    });
  });

  const byTargetCycle = new Map();
  bundle.master.forEach((master) => {
    const targetId = String(master.appraisal_cycle_id || "");
    const targetIndex = cycles.findIndex((cycle) => cycle.id === targetId);
    if (targetIndex < 0 || targetIndex === 0) {
      byTargetCycle.set(targetId, { orgBase: 0, techEd: new Map(), compManager: new Map(), sourceCycleId: "" });
      return;
    }
    const sourceCycleId = cycles[targetIndex - 1].id;
    const baseByEmp = new Map();
    payrollRows.forEach((row) => {
      if (String(firstValue(row, ["appraisal_cycle_name", "appraisal_cycle_id", "cycle_id"]) || "").trim() !== sourceCycleId) return;
      const empId = String(firstValue(row, ["emp_id", "employee_id"]) || "").trim().toLowerCase();
      if (!empId) return;
      const base = n(firstValue(row, ["current_annual_base_pay", "base_pay", "previous_base_pay"]))
        + n(firstValue(row, ["joining_bonus", "previous_joining_bonus"]))
        + n(firstValue(row, ["retention_bonus", "previous_retention_bonus"]))
        + n(firstValue(row, ["hike_amount", "hike_amt", "previous_hike_amount"]))
        + n(firstValue(row, ["performance_bonus", "total_pb", "previous_performance_bonus"]));
      baseByEmp.set(empId, base);
    });
    let orgBase = 0;
    const techEd = new Map();
    const compManager = new Map();
    baseByEmp.forEach((base, empId) => {
      orgBase += base;
      const assignment = assignments.get(empId);
      if (!assignment) return;
      const teKey = ownerKey(assignment.techEd);
      const cmKey = ownerKey(assignment.compManager);
      if (teKey) techEd.set(teKey, (techEd.get(teKey) || 0) + base);
      if (teKey && cmKey) compManager.set(teKey + "::" + cmKey, (compManager.get(teKey + "::" + cmKey) || 0) + base);
    });
    byTargetCycle.set(targetId, { orgBase, techEd, compManager, sourceCycleId });
  });

  bundle.master = bundle.master.map((row) => {
    const bases = byTargetCycle.get(String(row.appraisal_cycle_id)) || {};
    const base = n(bases.orgBase) || n(row.org_budget_base);
    const pct = n(row.budget_percentage);
    return { ...row, org_budget_base: base, source_payroll_cycle_id: bases.sourceCycleId || "", calculated_budget: base > 0 ? base * pct / 100 : n(row.calculated_budget) };
  });
  bundle.techEd = bundle.techEd.map((row) => {
    const bases = byTargetCycle.get(String(row.appraisal_cycle_id)) || {};
    const base = n(bases.techEd && bases.techEd.get(ownerKey(row.appraiser_tech_ed_id))) || n(row.budget_base);
    const pct = n(row.percentage);
    return { ...row, budget_base: base, calculated_budget: base > 0 ? base * pct / 100 : n(row.calculated_budget) };
  });
  bundle.compManager = bundle.compManager.map((row) => {
    const parent = bundle.techEd.find((item) => String(item.id) === String(row.budget_distribution_id));
    const bases = byTargetCycle.get(String(row.appraisal_cycle_id)) || {};
    const key = ownerKey(parent && parent.appraiser_tech_ed_id) + "::" + ownerKey(row.comp_manager);
    const base = n(bases.compManager && bases.compManager.get(key)) || n(row.budget_base);
    const pct = n(row.percentage);
    return { ...row, budget_base: base, calculated_budget: base > 0 ? base * pct / 100 : n(row.calculated_budget) };
  });
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
      const calculatedBundle = await calculateBudgetBases(app, rawBundle);\n      const bundle = filterOwn(calculatedBundle, a);
      return sendJson(res, 200, {
        success: true,
        data: bundle.techEd,
        master: bundle.master,
        techEd: bundle.techEd,
        compManager: bundle.compManager,
        techEdOwners,
        techEdCount: techEdOwners.length,
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
    const id = String(body.id || "").trim();
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

    if (a.enforced && !isAdminScope) {
      if (
        resource === "distribution" &&
        !matchesOwner(value(current, "appraiser_tech_ed_id"), a)
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
          !matchesOwner(value(parent, "appraiser_tech_ed_id"), a)
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
        "claculated_budget",
        "total_utilization",
        "applied_budget",
        "appraisal_cycle_id",
        "appraiser_tech_ed_id",
      ],
      comp: [
        "percentage",
        "budget_base",
        "calculated_budget",
        "total_utilization",
        "applied_budget",
        "comp_manager",
        "budget_distribution_id",
        "appraisal_cycle_id",
      ],
    };
    const fields =
      fieldsByResource[resource === "compmanager" ? "comp" : resource];
    const update = { ROWID: id };
    fields.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(body, key))
        update[key] = body[key];
      // Accept the correctly-spelled frontend name while writing the actual
      // Data Store column "claculated_budget".
      if (
        key === "claculated_budget" &&
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
