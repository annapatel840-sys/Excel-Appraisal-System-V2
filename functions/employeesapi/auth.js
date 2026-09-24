"use strict";

/* ============================================================
   AUTH + ROLE PERMISSIONS (shared file)

   IMPORTANT: this exact file must exist in every function folder:
     functions/employeesapi/auth.js
     functions/appraisalhistoryapi/auth.js
     functions/appraisalauditapi/auth.js
     functions/employeemasterapi/auth.js
   (each function is deployed on its own, so they cannot share a
   file outside their folder — copy it, do not edit copies separately)
   ============================================================ */

const catalyst = require("zcatalyst-sdk-node");

const EMPLOYEES_TABLE_ID = "71873000000020001";

/* Role names must match Catalyst -> Authentication -> Roles EXACTLY */
const ROLES = {
  TECH_ED: "Tech-Ed",
  HR: "HR",
  ORG: "Org",
  COMP_MANAGER: "Comp. Manager",
};

const ALL_PAGES = ["/", "/sheet", "/detail-screen", "/employee-master"];

/* TEMPORARY: HR / Org / Comp. Manager keep today's behaviour (full
   access) until we define their rules in the next step. */
const FULL_ACCESS = {
  scope: "all",
  pages: ALL_PAGES,
  employeeMasterTabs: [
    "roster",
    "eligibility",
    "appraisal-cycle",
    "payroll-data",
    "payroll-upload",
  ],
  canImport: true,
  canChangeStatus: true,
  canChangeEligibility: true,
  lockedFields: [],
};

const PERMISSIONS = {
  [ROLES.TECH_ED]: {
    // only employees whose appraiser_tech_ed equals the logged-in user
    scope: "own",
    pages: ALL_PAGES,
    // Employee Master page: only the roster + payroll data tabs
    employeeMasterTabs: ["roster", "payroll-data"],
    canImport: false,
    canChangeStatus: false,
    canChangeEligibility: false,
    // these fields cannot be changed by a Tech-Ed (backend enforced)
    lockedFields: ["appraiser_tech_ed", "status", "eligible_status"],
  },
  [ROLES.HR]: FULL_ACCESS,
  [ROLES.ORG]: FULL_ACCESS,
  [ROLES.COMP_MANAGER]: FULL_ACCESS,
  // "App User" and any other role: no entry = no access
};

/* "Prabhu Prasad Parida" and "Prabhuprasad Parida" -> same key */
function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/* ------------------------------------------------------------
   Who is calling? (works because the frontend sends the token
   from catalyst.auth.generateAuthToken() in the Authorization
   header, and catalyst.initialize(req) reads it)
   ------------------------------------------------------------ */
async function getUser(req) {
  const app = catalyst.initialize(req);
  const u = await app.userManagement().getCurrentUser();

  if (!u) {
    throw new Error("No logged-in user.");
  }

  const role = (u.role_details && u.role_details.role_name) || "";
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();

  return {
    id: String(u.user_id || ""),
    email: String(u.email_id || "").toLowerCase(),
    name: name,
    nameKey: norm(name),
    role: role,
    permissions: PERMISSIONS[role] || null,
  };
}

/* Call right after the OPTIONS check. Returns the user, or sends
   401/403 itself and returns null (caller must just `return`). */
async function authenticate(req, res) {
  let user;

  try {
    user = await getUser(req);
  } catch (error) {
    console.error("AUTH FAILED:", error && error.message);

    sendJson(res, 401, {
      success: false,
      code: "UNAUTHENTICATED",
      message: "Please log in.",
    });

    return null;
  }

  if (!user.permissions) {
    sendJson(res, 403, {
      success: false,
      code: "NO_ROLE_ACCESS",
      message:
        'Your role "' +
        (user.role || "none") +
        '" does not have access to this application.',
    });

    return null;
  }

  req.user = user;

  return user;
}

/* ------------------------------------------------------------
   Data scope
   ------------------------------------------------------------ */
function canSeeEmployee(user, employeeRow) {
  const p = user && user.permissions;

  if (!p) return false;
  if (p.scope === "all") return true;

  return (
    user.nameKey !== "" &&
    norm(employeeRow && employeeRow.appraiser_tech_ed) === user.nameKey
  );
}

function scopeEmployees(user, rows) {
  return (rows || []).filter(function (row) {
    return canSeeEmployee(user, row);
  });
}

/* Returns null when the user may see everyone, otherwise a Set of
   lower-cased emp_ids the user may see. */
async function getAllowedEmpIds(app, user) {
  if (user.permissions.scope === "all") return null;

  const rows = await app.datastore().table(EMPLOYEES_TABLE_ID).getAllRows();

  const ids = new Set();

  (rows || []).forEach(function (row) {
    if (canSeeEmployee(user, row)) {
      ids.add(
        String(row.emp_id || "")
          .trim()
          .toLowerCase(),
      );
    }
  });

  return ids;
}

async function canAccessEmployee(app, user, empId) {
  const allowed = await getAllowedEmpIds(app, user);

  if (allowed === null) return true;

  return allowed.has(
    String(empId || "")
      .trim()
      .toLowerCase(),
  );
}

module.exports = {
  ROLES,
  norm,
  sendJson,
  authenticate,
  canSeeEmployee,
  scopeEmployees,
  getAllowedEmpIds,
  canAccessEmployee,
};
