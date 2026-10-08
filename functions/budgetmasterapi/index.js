"use strict";

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

// These IDs are the Data Store table IDs from Catalyst Console → Data Store.
const TABLES = {
  master: "74008000000034565",       // Budget_Master
  distribution: "74008000000033809", // Budget_Distribution
  comp: "74008000000023149",         // Budget_Distribution_Comp
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  });
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
    calculated_budget: n(value(row, "calculated_budget")),
    total_utilization: utilized,
    applied_budget: applied,
    budget_distribution_id: String(value(row, "budget_distribution_id")),
    appraisal_cycle_id: String(value(row, "appraisal_cycle_id")),
    utilization_percentage: applied > 0 ? (utilized / applied) * 100 : 0,
  };
}

function getUserField(user, key) {
  if (user && user[key] !== undefined && user[key] !== null) return String(user[key]).trim();
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
  const full = (getUserField(user, "first_name") + " " + getUserField(user, "last_name")).trim().toLowerCase();
  if (full) values.push(full);
  return values;
}

function matchesOwner(owner, a) {
  const text = String(owner || "").trim().toLowerCase();
  if (!text || !a || !a.user) return false;
  const empId = String(a.user.empId || "").trim().toLowerCase();
  const email = String(a.user.email || "").trim().toLowerCase();
  const parts = text.match(/^(\S+)\s*-\s*(.+)$/);
  const ownerId = parts ? parts[1] : text;
  return Boolean((empId && ownerId === empId) || (email && text === email) ||
    getUserValues(a.user).some((v) => v === text || v === ownerId));
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
    if (!ok) throw new access.HttpError(403, "You do not have access to this budget screen.");
  });
}

async function getAllRows(table) {
  const rows = [];
  let token = null;
  for (let guard = 0; guard < 1000; guard += 1) {
    const opts = { maxRows: 200 };
    if (token) opts.nextToken = token;
    const page = await table.getPagedRows(opts);
    rows.push(...(page && Array.isArray(page.data) ? page.data : []));
    token = page && page.next_token ? page.next_token : null;
    if (!(page && page.more_records === true && token)) break;
  }
  return rows;
}

function parseJson(text) {
  if (!String(text || "").trim()) return {};
  try { return JSON.parse(text); } catch (_) { return {}; }
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(parseJson(req.body));
  if (typeof req.on !== "function" || req.readableEnded) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    let text = "";
    req.on("data", (chunk) => { text += chunk.toString(); });
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
    getAllRows(app.datastore().table(TABLES.master)),
    getAllRows(app.datastore().table(TABLES.distribution)),
    getAllRows(app.datastore().table(TABLES.comp)),
  ]);

  return {
    master: masterRows.map(mapMaster),
    techEd: distributionRows.map(mapDistribution),
    compManager: compRows.map(mapComp),
  };
}

function filterOwn(bundle, a) {
  if (!a || !a.enforced || (a.scope && a.scope.all)) return bundle;
  const techEd = bundle.techEd.filter((row) => matchesOwner(row.appraiser_tech_ed_id, a));
  const allowedDistributionIds = new Set(techEd.map((row) => row.id));
  const compManager = bundle.compManager.filter((row) =>
    allowedDistributionIds.has(String(row.budget_distribution_id)),
  );
  // Budget_Master is org-level and has no owner column, so a non-HR user gets
  // only the master row for the cycle represented by their Tech-Ed allocation.
  const cycleIds = new Set(techEd.map((row) => row.appraisal_cycle_id));
  const master = bundle.master.filter((row) => cycleIds.has(row.appraisal_cycle_id));
  return { master, techEd, compManager };
}

module.exports = async function (req, res) {
  try {
    const method = String(req.method || "GET").toUpperCase();
    if (method === "OPTIONS") return sendJson(res, 200, { success: true });

    const a = await checkAccess(req);
    requireBudgetScreen(a, method === "GET" ? "view" : "edit");

    const app = catalyst.initialize(req);

    if (method === "GET") {
      const bundle = filterOwn(await readBundle(app), a);
      // data remains an array for the existing screens; the new relational
      // collections are exposed beside it for screens that need each level.
      return sendJson(res, 200, {
        success: true,
        data: bundle.techEd,
        master: bundle.master,
        techEd: bundle.techEd,
        compManager: bundle.compManager,
        more_records: false,
        next_token: null,
      });
    }

    if (method !== "PUT") {
      return sendJson(res, 405, { success: false, message: "Method not allowed" });
    }

    const body = await parseBody(req);
    const resource = String(body.resource || "master").toLowerCase();
    const id = String(body.id || "").trim();
    if (!id) return sendJson(res, 400, { success: false, message: "Budget row id is required." });

    const tables = {
      master: { table: TABLES.master, mapper: mapMaster },
      distribution: { table: TABLES.distribution, mapper: mapDistribution },
      comp: { table: TABLES.comp, mapper: mapComp },
      compmanager: { table: TABLES.comp, mapper: mapComp },
    };
    const target = tables[resource];
    if (!target) return sendJson(res, 400, { success: false, message: "Invalid budget resource." });

    const isAdminScope = Boolean(a && a.scope && a.scope.all);
    if (!a.enforced) {
      const user = await app.userManagement().getCurrentUser();
      if (!user) return sendJson(res, 401, { success: false, message: "Authentication is required." });
      if (!isHR(user) && resource === "master") {
        return sendJson(res, 403, { success: false, message: "Only HR can update Budget Master." });
      }
    }

    const table = app.datastore().table(target.table);
    const currentRows = await getAllRows(table);
    const current = currentRows.find((row) => idOf(row) === id);
    if (!current) return sendJson(res, 404, { success: false, message: "Budget row not found." });

    if (a.enforced && !isAdminScope) {
      if (resource === "distribution" && !matchesOwner(value(current, "appraiser_tech_ed_id"), a)) {
        throw new access.HttpError(403, "You can only update your own Tech-Ed budget.");
      }
      if (resource === "comp" || resource === "compmanager") {
        const parentId = String(value(current, "budget_distribution_id") || "");
        const parents = await getAllRows(app.datastore().table(TABLES.distribution));
        const parent = parents.find((row) => idOf(row) === parentId);
        if (!parent || !matchesOwner(value(parent, "appraiser_tech_ed_id"), a)) {
          throw new access.HttpError(403, "You can only update Comp Manager budgets under your Tech-Ed.");
        }
      }
      if (resource === "master" && !isHR(a.user)) {
        throw new access.HttpError(403, "Only HR can update Budget Master.");
      }
    }

    const fieldsByResource = {
      master: ["budget_percentage", "budget_utilized", "calculated_budget", "applied_budget"],
      distribution: ["percentage", "claculated_budget", "total_utilization", "applied_budget", "appraisal_cycle_id", "appraiser_tech_ed_id"],
      comp: ["percentage", "calculated_budget", "total_utilization", "applied_budget", "comp_manager", "budget_distribution_id", "appraisal_cycle_id"],
    };
    const fields = fieldsByResource[resource === "compmanager" ? "comp" : resource];
    const update = { ROWID: id };
    fields.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(body, key)) update[key] = body[key];
      // Accept the correctly-spelled frontend name while writing the actual
      // Data Store column "claculated_budget".
      if (key === "claculated_budget" && Object.prototype.hasOwnProperty.call(body, "calculated_budget")) {
        update[key] = body.calculated_budget;
      }
    });

    const changed = Object.keys(update).filter((key) => key !== "ROWID");
    if (!changed.length) return sendJson(res, 400, { success: false, message: "No budget fields were provided." });

    access.guard(a, function () {
      if (resource === "master" || resource === "distribution" || resource === "comp" || resource === "compmanager") {
        if (changed.some((key) => ["budget_percentage", "percentage", "calculated_budget", "claculated_budget", "applied_budget"].includes(key))) {
          try { access.requireAction(a, "changeBudgetConfig"); } catch (e) {
            if (!(e instanceof access.HttpError)) throw e;
          }
        }
        if (changed.some((key) => ["budget_utilized", "total_utilization"].includes(key))) {
          try { access.requireAction(a, "allotNextLevel"); } catch (e) {
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
