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
  const calculated = n(value(row, "calculated_budget") || value(row, "claculated_budget"));
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
    calculated_budget: n(value(row, "calculated_budget") || value(row, "claculated_budget")),
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
  const text = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  const pair = text.match(/^([a-z]*\d+)\s*-\s*(.+)$/i);
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

async function calculateBudgetBases(app, bundle) {
  const [payrollRows, cycleRows, appraisalRows, employeeMasterRows] = await Promise.all([
    readTableById(app, "74008000000035326"),
    readTableById(app, "74008000000034190"),
    getAllRows(app, "Appraisal_Sheet"),
    readTableById(app, "74008000000035727"),
  ]);

  const cycles = cycleRows.map((row) => {
    const id = idOf(row);
    const name = String(firstValue(row, ["cycle_name", "cycleName", "name", "appraisal_year"]) || id).trim();
    return {
      id,
      name,
      date: cycleDate(row),
      status: String(firstValue(row, ["status"]) || "Upcoming").toLowerCase(),
      archived: String(firstValue(row, ["archived"]) || "false").toLowerCase() === "true",
    };
  }).filter((row) => row.id && row.status !== "cancelled" && !row.archived)
    .sort((a, b) => (a.date || a.name).localeCompare(b.date || b.name));

  const cycleByAlias = new Map();
  cycles.forEach((cycle) => {
    [cycle.id, cycle.name].forEach((alias) => {
      const key = String(alias || "").trim().toLowerCase();
      if (key) cycleByAlias.set(key, cycle);
    });
  });
  const resolveCycle = (raw) => {
    const text = String(raw || "").trim().toLowerCase();
    return cycleByAlias.get(text) || null;
  };

  const employeeMasterByRef = new Map();
  employeeMasterRows.forEach((row) => {
    const businessId = String(firstValue(row, ["emp_id", "employee_id"]) || "").trim().toLowerCase();
    const rowId = idOf(row).toLowerCase();
    if (businessId) employeeMasterByRef.set(businessId, row);
    if (rowId) employeeMasterByRef.set(rowId, row);
  });

  // The payroll emp_id foreign key is Employee_Master.ROWID. Appraisal_Sheet
  // assignments may refer to either that ROWID or the human Employee ID.
  const assignments = new Map();
  appraisalRows.forEach((row) => {
    const employeeRef = String(firstValue(row, ["emp_id", "employee_id", "employee_master_id"]) || "").trim().toLowerCase();
    const masterEmployee = employeeMasterByRef.get(employeeRef) || {};
    const assignment = {
      techEd: String(firstValue(row, ["appraiser_tech_ed", "appraiser_tech_ed_id", "appraiser_teched", "tech_ed", "tech_ed_id"]) || "").trim(),
      compManager: String(firstValue(row, ["comp_manager", "comp_manager_id", "comp_manager_name", "comp_manager_emp_id"]) || "").trim(),
    };
    [
      employeeRef,
      idOf(masterEmployee).toLowerCase(),
      String(firstValue(masterEmployee, ["emp_id", "employee_id"]) || "").trim().toLowerCase(),
    ].filter(Boolean).forEach((key) => assignments.set(key, assignment));
  });

  const ownerLabels = new Map();
  const compLabels = new Map();
  assignments.forEach((assignment) => {
    const teKey = ownerKey(assignment.techEd);
    const cmKey = ownerKey(assignment.compManager);
    if (teKey && !ownerLabels.has(teKey)) ownerLabels.set(teKey, assignment.techEd);
    if (teKey && cmKey && !compLabels.has(teKey + "::" + cmKey)) {
      compLabels.set(teKey + "::" + cmKey, { techEdKey: teKey, compKey: cmKey, name: assignment.compManager });
    }
  });

  const distributionTable = app.datastore().table(TABLES.distribution);
  const compTable = app.datastore().table(TABLES.comp);
  const masterTable = app.datastore().table(TABLES.master);
  const [distributionColumns, compColumns, masterColumns] = await Promise.all([
    getColumnNames(distributionTable),
    getColumnNames(compTable),
    getColumnNames(masterTable),
  ]);
  const distributionCalculatedField = pickColumn(distributionColumns, ["calculated_budget", "claculated_budget"], "claculated_budget");
  const compCalculatedField = pickColumn(compColumns, ["calculated_budget", "claculated_budget"], "calculated_budget");
  const masterCalculatedField = pickColumn(masterColumns, ["calculated_budget"], "calculated_budget");
  const byTargetCycle = new Map();

  for (const master of bundle.master) {
    const targetRef = String(master.appraisal_cycle_id || "").trim();
    const targetCycle = resolveCycle(targetRef);
    if (!targetCycle) {
      byTargetCycle.set(targetRef, { orgBase: 0, techEd: new Map(), compManager: new Map(), sourceCycleId: "" });
      continue;
    }

    const targetIndex = cycles.findIndex((cycle) => cycle.id === targetCycle.id);
    const priorCycle = targetIndex > 0 ? cycles[targetIndex - 1] : null;
    const payrollHasCycle = (cycle) => cycle && payrollRows.some((row) => {
      const raw = firstValue(row, ["appraisal_cycle_name", "appraisal_cycle_id", "cycle_id"]);
      const resolved = resolveCycle(raw);
      return resolved ? resolved.id === cycle.id : String(raw || "").trim().toLowerCase() === cycle.name.toLowerCase();
    });

    // Prefer the previous cycle as required by the business rule. If that cycle
    // has no payroll rows (e.g. first-time setup), use the selected cycle's rows
    // rather than silently returning all-zero budgets.
    const sourceCycle = payrollHasCycle(priorCycle) ? priorCycle : (payrollHasCycle(targetCycle) ? targetCycle : priorCycle);
    const sourceCycleId = sourceCycle ? sourceCycle.id : "";
    const baseByEmp = new Map();

    payrollRows.forEach((row) => {
      const payrollCycleRaw = firstValue(row, ["appraisal_cycle_name", "appraisal_cycle_id", "cycle_id"]);
      const payrollCycle = resolveCycle(payrollCycleRaw);
      const cycleMatches = sourceCycle && (
        (payrollCycle && payrollCycle.id === sourceCycle.id) ||
        String(payrollCycleRaw || "").trim().toLowerCase() === sourceCycle.name.toLowerCase() ||
        String(payrollCycleRaw || "").trim() === sourceCycle.id
      );
      if (!cycleMatches) return;
      const empId = String(firstValue(row, ["emp_id", "employee_id"]) || "").trim().toLowerCase();
      if (!empId) return;
      const base =
        n(firstValue(row, ["current_annual_base_pay", "base_pay", "previous_base_pay"])) +
        n(firstValue(row, ["joining_bonus", "previous_joining_bonus"])) +
        n(firstValue(row, ["retention_bonus", "previous_retention_bonus"])) +
        n(firstValue(row, ["hike_amount", "hike_amt", "previous_hike_amount"])) +
        n(firstValue(row, ["performance_bonus", "total_pb", "previous_performance_bonus"]));
      // Avoid double-counting duplicate imports for the same employee/cycle.
      baseByEmp.set(empId, base);
    });

    let orgBase = 0;
    const techEdBases = new Map(Array.from(ownerLabels.keys(), (key) => [key, 0]));
    const compBases = new Map(Array.from(compLabels.keys(), (key) => [key, 0]));
    baseByEmp.forEach((base, empId) => {
      orgBase += base;
      const assignment = assignments.get(empId);
      if (!assignment) return;
      const teKey = ownerKey(assignment.techEd);
      const cmKey = ownerKey(assignment.compManager);
      if (teKey) techEdBases.set(teKey, (techEdBases.get(teKey) || 0) + base);
      if (teKey && cmKey) {
        const key = teKey + "::" + cmKey;
        compBases.set(key, (compBases.get(key) || 0) + base);
      }
    });

    byTargetCycle.set(targetRef, { orgBase, techEd: techEdBases, compManager: compBases, sourceCycleId });

    // Upsert one Tech-Ed row per assigned owner and target cycle. Keep saved
    // percentage/applied budget if a row already exists.
    for (const [teKey, owner] of ownerLabels) {
      let row = bundle.techEd.find((item) =>
        String(item.appraisal_cycle_id) === targetRef && ownerKey(item.appraiser_tech_ed_id) === teKey
      );
      if (!row) {
        const base = n(techEdBases.get(teKey));
        const created = await distributionTable.insertRow({
          appraisal_cycle_id: targetRef,
          appraiser_tech_ed_id: owner,
          percentage: 0,
          budget_base: base,
          [distributionCalculatedField]: 0,
          applied_budget: 0,
          total_utilization: 0,
        });
        row = mapDistribution(created);
        bundle.techEd.push(row);
      }
    }

    // Upsert each real Tech-Ed/Comp Manager relationship. New rows start at 0%;
    // allocation is an explicit decision, not an inherited duplicate percentage.
    for (const [pairKey, details] of compLabels) {
      const parent = bundle.techEd.find((item) =>
        String(item.appraisal_cycle_id) === targetRef && ownerKey(item.appraiser_tech_ed_id) === details.techEdKey
      );
      if (!parent) continue;
      let row = bundle.compManager.find((item) =>
        String(item.appraisal_cycle_id) === targetRef &&
        String(item.budget_distribution_id) === String(parent.id) &&
        ownerKey(item.comp_manager) === details.compKey
      );
      if (!row) {
        const base = n(compBases.get(pairKey));
        const created = await compTable.insertRow({
          appraisal_cycle_id: targetRef,
          budget_distribution_id: String(parent.id),
          comp_manager: details.name,
          percentage: 0,
          budget_base: base,
          [compCalculatedField]: 0,
          applied_budget: 0,
          total_utilization: 0,
        });
        row = mapComp(created);
        bundle.compManager.push(row);
      }
    }
  }

  // Persist Org Base/Original Budget. Do not touch Updated Budget here.
  bundle.master = await Promise.all(bundle.master.map(async (row) => {
    const bases = byTargetCycle.get(String(row.appraisal_cycle_id)) || {};
    const base = n(bases.orgBase) > 0 ? n(bases.orgBase) : n(row.org_budget_base);
    const pct = n(row.budget_percentage);
    const calculated = base > 0 ? base * pct / 100 : n(row.calculated_budget);
    if (row.id && (base !== n(row.org_budget_base) || calculated !== n(row.calculated_budget))) {
      await masterTable.updateRow({ ROWID: row.id, org_budget_base: base, [masterCalculatedField]: calculated });
    }
    return {
      ...row,
      appraisal_cycle_name: (cycles.find((cycle) => cycle.id === String(row.appraisal_cycle_id)) || {}).name || String(row.appraisal_cycle_id),
      org_budget_base: base,
      source_payroll_cycle_id: bases.sourceCycleId || "",
      calculated_budget: calculated,
    };
  }));

  bundle.techEd = await Promise.all(bundle.techEd.map(async (row) => {
    const bases = byTargetCycle.get(String(row.appraisal_cycle_id)) || {};
    const computedBase = n(bases.techEd && bases.techEd.get(ownerKey(row.appraiser_tech_ed_id)));
    const base = computedBase > 0 ? computedBase : n(row.budget_base);
    const pct = n(row.percentage);
    const calculated = base * pct / 100;
    if (row.id && (base !== n(row.budget_base) || calculated !== n(row.calculated_budget))) {
      await distributionTable.updateRow({ ROWID: row.id, budget_base: base, [distributionCalculatedField]: calculated });
    }
    return { ...row, budget_base: base, calculated_budget: calculated };
  }));

  bundle.compManager = await Promise.all(bundle.compManager.map(async (row) => {
    const parent = bundle.techEd.find((item) => String(item.id) === String(row.budget_distribution_id));
    const bases = byTargetCycle.get(String(row.appraisal_cycle_id)) || {};
    const key = ownerKey(parent && parent.appraiser_tech_ed_id) + "::" + ownerKey(row.comp_manager);
    const computedBase = n(bases.compManager && bases.compManager.get(key));
    const base = computedBase > 0 ? computedBase : n(row.budget_base);
    const pct = n(row.percentage);
    const calculated = base * pct / 100;
    if (row.id && (base !== n(row.budget_base) || calculated !== n(row.calculated_budget))) {
      await compTable.updateRow({ ROWID: row.id, budget_base: base, [compCalculatedField]: calculated });
    }
    return { ...row, budget_base: base, calculated_budget: calculated };
  }));

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
        calculatedBundle = await calculateBudgetBases(app, rawBundle);
      } catch (calculationError) {
        // Budget screens must remain available if optional historical payroll/cycle
        // data is unavailable; retain the persisted budget percentages and amounts.
        console.error("Budget base calculation skipped:", calculationError);
      }
      const bundle = filterOwn(calculatedBundle, a);
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
    const fields = [
      ...fieldsByResource[resource === "compmanager" ? "comp" : resource],
    ];
    if (resource === "distribution") {
      const columns = await getColumnNames(table);
      fields.push(pickColumn(columns, ["calculated_budget", "claculated_budget"], "claculated_budget"));
    }
    const update = { ROWID: id };
    fields.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(body, key))
        update[key] = body[key];
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
