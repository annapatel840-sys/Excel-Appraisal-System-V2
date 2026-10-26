"use strict";

/* ACCESS CONTROL: ./accessCore.js must be a byte-for-byte copy of
   functions/accessapi/accessCore.js (every Catalyst function deploys
   separately). Copy it here after every change to the accessapi copy. */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

/* CORS: Catalyst adds the CORS headers itself (Authentication > Authorized
   Domains). Do not set Access-Control-Allow-Origin here. */

/* Data Store table IDs (same IDs the payroll function uses). */
const TABLES = {
  feedback: "74008000000022041",       // Feedback_And_Rating
  employeeMaster: "74008000000035727", // Employee_Master
  cycles: "74008000000034190",         // Appraisal_Cycle_Master
  audit: "74008000000034940",          // Appraisal_Audit
};
const PAGE_SIZE = 200;
const CYCLE_TYPES = ["Annual", "Mid-Year", "Exceptional", "New Joiner"];

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function getQuery(req) {
  const url = new URL(req.url || "/", "http://localhost");
  const query = Object.fromEntries(url.searchParams.entries());
  return { ...query, ...(req.queryParams || {}) };
}

/* Catalyst returns at most 200 rows per call, so read page by page. */
async function getAllRows(table) {
  const rows = [];
  let nextToken;
  let more = true;
  while (more) {
    const options = { maxRows: PAGE_SIZE };
    if (nextToken) options.nextToken = nextToken;
    const result = await table.getPagedRows(options);
    rows.push(...(Array.isArray(result.data) ? result.data : []));
    nextToken = result.next_token || null;
    more = result.more_records === true && Boolean(nextToken);
  }
  return rows;
}

const rowId = (row) => String((row && (row.ROWID ?? row.rowid)) ?? "").trim();
const text = (v) => (v === undefined || v === null ? "" : String(v).trim());
const num = (v) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/,/g, "").replace(/[%₹$]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const isoDate = (v) => {
  const s = text(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
};

/* ---------------- legacy role checks (used only while ACCESS_ENFORCE != true) ---------------- */
const roleName = (user) => String(user?.role_details?.role_name || user?.role_name || "").trim().toLowerCase();
const isHR = (user) => roleName(user) === "hr";

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

async function requireIdentity(req) {
  const user = await catalyst.initialize(req).userManagement().getCurrentUser();
  if (!user || !user.user_id) return null;
  return {
    id: String(user.user_id),
    name: user.display_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email_id || "",
    email: user.email_id || "",
    user,
  };
}

/* ---------------- shaping data for the Feedback & Rating Master screen ---------------- */

function cycleTypeOf(name) {
  const lower = String(name || "").toLowerCase();
  return CYCLE_TYPES.find((t) => lower.startsWith(t.toLowerCase())) || "Annual";
}

function shapeCycle(row) {
  const archived = row.archived === true || row.archived === "true";
  const name = text(row.cycle_name || row.appraisal_year);
  return {
    id: rowId(row),
    name,
    type: text(row.cycle_type) || cycleTypeOf(name),
    status: archived ? "Archived" : text(row.status) || "Upcoming",
    effective: isoDate(row.effective_date || row.start_date),
  };
}

/* Case-insensitive column lookup: the Data Store mixes styles
   (emp_ID, Department, CostCenter_Client, Tech_ED ...), so match by lower-case name. */
function col(row, ...names) {
  if (!row) return undefined;
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (key !== undefined && row[key] !== null && row[key] !== undefined && row[key] !== "") return row[key];
  }
  return undefined;
}

/* One Feedback_And_Rating row -> the row shape the UI documents:
   { cid, id, name, desig, dept, band, eff, mr, mf, rr, yoe, ic, gm,
     client, cm, cr, cf, risk, ccm, te, batch }
   emp_ID / emp_name / appraisal_cycle_name are foreign-key columns, so they hold
   ROWIDs; we translate them back to readable values.
   The feedback table has no RR% or YoE columns, so they come from Employee_Master:
   RR% as stored there, YoE Ratio = base pay in lakhs / total experience. */
function shapeFeedback(row, masterByRowId, masterByEmpId, cycleById) {
  const empKey = text(col(row, "emp_ID"));
  const master = masterByRowId.get(empKey) || masterByEmpId.get(empKey.toLowerCase()) || {};
  const cycleId = text(col(row, "appraisal_cycle_name"));
  const cycle = cycleById.get(cycleId);
  const yesNo = text(col(row, "at_risk")).toLowerCase();

  const basePay = num(col(master, "current_annual_base_pay", "base_pay", "current_salary"));
  const experience = num(col(master, "total_experience", "total_exp", "experience"));
  const yoe = basePay > 0 && experience > 0 ? Math.round((basePay / 100000 / experience) * 100) / 100 : 0;

  return {
    rowId: rowId(row),
    cid: cycleId,
    id: text(master.emp_id) || empKey,
    name: text(master.emp_name || master.name),
    desig: text(col(row, "designation")) || text(master.designation),
    dept: text(col(row, "Department")) || text(master.department),
    band: text(col(row, "Band")) || text(master.band),
    eff: isoDate(col(row, "Effective_Date")) || (cycle ? cycle.effective : ""),
    mr: num(col(row, "manager_rating")),
    mf: text(col(row, "manager_feedback")),
    rr: num(col(master, "rr_percent", "rr")),
    yoe,
    ic: num(col(row, "interview_count")),
    gm: num(col(row, "gross_margin")),
    client: text(col(row, "CostCenter_Client")),
    cm: text(col(row, "Client_Manager")),
    cmf: text(col(row, "client_manager_feedback")),
    cr: num(col(row, "client_rating")),
    cf: text(col(row, "client_feedback")),
    risk: ["yes", "y", "true", "1"].includes(yesNo) ? "Yes" : "No",
    ccm: text(col(row, "Comp_Manager")) || text(master.comp_manager),
    te: text(col(row, "Tech_ED")) || text(master.appraiser_tech_ed),
    batch: text(col(row, "Upload_Batch")),
  };
}

function auditDetails(row) {
  try {
    return row.details ? JSON.parse(row.details) : {};
  } catch {
    return {};
  }
}

/* Upload history (the "Uploads" tab of the right panel). It is built from the
   Appraisal_Audit rows whose source = "feedback_upload" (see README step 5). */
function shapeBatches(auditRows) {
  return auditRows
    .filter((row) => row.source === "feedback_upload")
    .map((row) => {
      const d = auditDetails(row);
      return {
        id: text(row.batch_id),
        cid: text(d.cycleId),
        file: text(d.fileName),
        by: text(row.changed_by),
        at: text(row.changed_at || row.CREATEDTIME),
        rows: Number(d.total) || 0,
        nw: Number(d.inserted) || 0,
        rep: Number(d.updated) || 0,
        eff: isoDate(d.effectiveDate),
      };
    })
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/* ---------------- routes ---------------- */

async function getFeedbackData(adminApp, query) {
  const datastore = adminApp.datastore();
  const [feedbackRows, masterRows, cycleRows, auditRows] = await Promise.all([
    getAllRows(datastore.table(TABLES.feedback)),
    getAllRows(datastore.table(TABLES.employeeMaster)),
    getAllRows(datastore.table(TABLES.cycles)),
    getAllRows(datastore.table(TABLES.audit)),
  ]);

  const masterByRowId = new Map();
  const masterByEmpId = new Map();
  masterRows.forEach((row) => {
    if (rowId(row)) masterByRowId.set(rowId(row), row);
    const business = text(row.emp_id).toLowerCase();
    if (business) masterByEmpId.set(business, row);
  });

  const cycles = cycleRows
    .filter((row) => text(row.status) !== "Cancelled")
    .map(shapeCycle);
  const cycleById = new Map(cycles.map((c) => [c.id, c]));

  // Optional filter: ?cycleId=<ROWID> returns just that cycle's rows.
  const onlyCycle = text(query.cycleId || query.cycle_id);
  const rows = feedbackRows
    .map((row) => shapeFeedback(row, masterByRowId, masterByEmpId, cycleById))
    .filter((row) => row.cid && (!onlyCycle || row.cid === onlyCycle));

  const batches = shapeBatches(auditRows).filter((b) => !onlyCycle || b.cid === onlyCycle);
  return { cycles, rows, batches };
}

async function routeRequest(req, res, identity, resource, a) {
  const enforced = Boolean(a && a.enforced);

  // The Feedback & Rating tab belongs to the HR Operations "employeeMaster"
  // screen (see HR_TAB_SCREENS in src/lib/access-store.jsx). View is enough.
  access.guard(a, () => access.requireScreen(a, "employeeMaster", "view"));
  if (!enforced && !isHR(identity.user)) {
    return sendJson(res, 403, { success: false, message: "HR role is required for Feedback & Rating." });
  }

  const adminApp = catalyst.initialize(req, { scope: "admin" });

  if (resource === "feedback" && req.method === "GET") {
    const data = await getFeedbackData(adminApp, getQuery(req));
    return sendJson(res, 200, { success: true, data });
  }

  return sendJson(res, 404, { success: false, message: "The requested operation was not found." });
}

module.exports = async function feedbackRatingApi(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  try {
    const resource = String(getQuery(req).resource || "");
    const a = await checkAccess(req);
    const identity = await requireIdentity(req);
    if (!identity) {
      return sendJson(res, 401, { success: false, message: "Sign in with a Catalyst app user account to continue." });
    }
    return await routeRequest(req, res, identity, resource, a);
  } catch (error) {
    if (error instanceof access.HttpError) {
      return sendJson(res, error.status || 403, { success: false, message: error.message, enforced: true });
    }
    console.error(JSON.stringify({ function: "feedbackratingapi", error: error.message, stack: error.stack }));
    const status = error instanceof ApiError ? error.status : 500;
    return sendJson(res, status, { success: false, message: error.message || "Feedback & Rating service failed." });
  }
};

module.exports._internals = { shapeFeedback, shapeCycle, shapeBatches };