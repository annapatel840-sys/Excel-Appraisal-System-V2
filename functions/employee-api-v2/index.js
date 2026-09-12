"use strict";

const express = require("express");
const catalyst = require("zcatalyst-sdk-node");

const app = express();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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
  res.status(statusCode).json(body);
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
    return "active";
  }

  if (status === "inactive") {
    return "inactive";
  }

  return "";
}

/* ============================================================
   GET ALL EMPLOYEES
   ============================================================ */

async function getAllEmployees(zcql) {
  const query = `
    SELECT *
    FROM employees
    ORDER BY emp_id
  `;

  const result = await zcql.executeZCQLQuery(query);

  console.log("RAW EMPLOYEE RESULT:", JSON.stringify(result));

  return (result || []).map(function (item) {
    return item.Employees || item.employees || item;
  });
}

/* ============================================================
   FILTER EMPLOYEES
   ============================================================ */

function filterEmployees(employees, search, status) {
  let filtered = employees;

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

  if (status) {
    filtered = filtered.filter(function (employee) {
      return (
        String(employee.status || "")
          .trim()
          .toLowerCase() === status
      );
    });
  }

  return filtered;
}

/* ============================================================
   GET EMPLOYEES
   ============================================================ */

async function getEmployees(req, res) {
  const appInstance = catalyst.initialize(req);

  const zcql = appInstance.zcql();

  const params = getQueryParams(req);

  const requestedPage = getPositiveInteger(params.page, 1);

  const requestedLimit = getPositiveInteger(params.limit, DEFAULT_LIMIT);

  const limit = Math.min(requestedLimit, MAX_LIMIT);

  const search = String(params.search || "").trim();

  const status = normalizeStatus(params.status);

  const allEmployees = await getAllEmployees(zcql);

  /* ==========================================================
     GLOBAL COUNTS
     ========================================================== */

  const totalCount = allEmployees.length;

  const activeCount = allEmployees.filter(function (employee) {
    return (
      String(employee.status || "")
        .trim()
        .toLowerCase() === "active"
    );
  }).length;

  const inactiveCount = allEmployees.filter(function (employee) {
    return (
      String(employee.status || "")
        .trim()
        .toLowerCase() === "inactive"
    );
  }).length;

  /* ==========================================================
     APPLY FILTERS
     ========================================================== */

  const filteredEmployees = filterEmployees(allEmployees, search, status);

  const filteredCount = filteredEmployees.length;

  /* ==========================================================
     TOTAL PAGES
     ========================================================== */

  const totalPages = filteredCount === 0 ? 1 : Math.ceil(filteredCount / limit);

  const safePage = Math.min(requestedPage, totalPages);

  /* ==========================================================
     PAGE SLICE
     ========================================================== */

  const offset = (safePage - 1) * limit;

  const data = filteredEmployees.slice(offset, offset + limit);

  /* ==========================================================
     RESPONSE
     ========================================================== */

  sendJson(res, 200, {
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
      total: totalCount,
      active: activeCount,
      inactive: inactiveCount,
    },

    filters: {
      search: search,
      status: status || "All",
    },
  });
}

/* ============================================================
   UPDATE EMPLOYEE
   ============================================================ */

async function updateEmployee(req, res) {
  const appInstance = catalyst.initialize(req);

  const datastore = appInstance.datastore();

  /*
   * Express has already parsed JSON.
   */

  console.log("REQ BODY:", JSON.stringify(req.body || {}));

  console.log("REQ QUERY:", JSON.stringify(req.query || {}));

  const body = req.body || {};

  console.log("UPDATE EMPLOYEE REQUEST:", JSON.stringify(body));

  /* ==========================================================
     EMPLOYEE ID
     ========================================================== */

  const empId = String(body.emp_id || body.empId || "").trim();

  if (!empId) {
    sendJson(res, 400, {
      success: false,
      message: "emp_id is required.",
    });

    return;
  }

  /* ==========================================================
     ALLOWED FIELDS
     ========================================================== */

  const allowedFields = [
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
    "Joining_date",
    "manager_email_id",
    "super_man_email_id",
  ];

  /* ==========================================================
     BUILD UPDATE DATA
     ========================================================== */

  const updateData = {};

  allowedFields.forEach(function (field) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updateData[field] = body[field];
    }
  });

  if (Object.keys(updateData).length === 0) {
    sendJson(res, 400, {
      success: false,
      message: "No valid employee fields were provided.",
    });

    return;
  }

  /* ==========================================================
     FIND EMPLOYEE
     ========================================================== */

  const table = datastore.table("employees");

  const rows = await table.getAllRows();

  const existingRow = (rows || []).find(function (row) {
    return String(row.emp_id || "").trim() === empId;
  });

  if (!existingRow) {
    sendJson(res, 404, {
      success: false,
      message: "Employee " + empId + " not found.",
    });

    return;
  }

  /* ==========================================================
     ROW ID
     ========================================================== */

  const rowId = existingRow.ROWID || existingRow.rowid;

  if (!rowId) {
    throw new Error("Employee ROWID not found.");
  }

  /* ==========================================================
     UPDATE ROW
     ========================================================== */

  const updateRow = {
    ROWID: rowId,
    ...updateData,
  };

  console.log("UPDATE EMPLOYEE ROW:", JSON.stringify(updateRow));

  await table.updateRow(updateRow);

  /* ==========================================================
     SUCCESS RESPONSE
     ========================================================== */

  sendJson(res, 200, {
    success: true,
    message: "Employee updated successfully.",
    data: {
      emp_id: empId,
      ...updateData,
    },
  });
}

/* ============================================================
   EXPRESS ROUTES
   ============================================================ */

/* GET */

app.get("/", async function (req, res) {
  try {
    await getEmployees(req, res);
  } catch (error) {
    console.error("employee-api-v2 GET ERROR:", error);

    sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
});

/* PUT */

/* PUT */

app.put("/", async function (req, res) {
  try {
    await updateEmployee(req, res);
  } catch (error) {
    console.error("employee-api-v2 PUT ERROR:", error);

    sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
});

/* PATCH */

app.patch("/", async function (req, res) {
  try {
    await updateEmployee(req, res);
  } catch (error) {
    console.error("employee-api-v2 PATCH ERROR:", error);

    sendJson(res, 500, {
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
  sendJson(res, 405, {
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
