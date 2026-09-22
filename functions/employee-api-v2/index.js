"use strict";

const express = require("express");
const catalyst = require("zcatalyst-sdk-node");

const app = express();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const EMPLOYEES_TABLE_ID = "34995000000121039";
const EMPLOYEE_MASTER_TABLE_ID = "34995000000136129";

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
    return "Active";
  }

  if (status === "inactive") {
    return "Inactive";
  }

  return "";
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

    /*
     * Organization Experience comes directly from
     * Employees.wissen_experience.
     */
    wissen_experience: wissenExperience,

    /*
     * Frontend-friendly alias.
     */
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

  /* Organization Experience */
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
  "rating",
  "eligible_status",
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
   GET ALL EMPLOYEES
   ============================================================ */

async function getAllEmployees(zcql) {
  const query = `
    SELECT *
    FROM employees
    ORDER BY CREATEDTIME
  `;

  const result = await zcql.executeZCQLQuery(query);

  return (result || []).map(function (item) {
    const employee = item.Employees || item.employees || item;

    return normalizeEmployeeResponse(employee);
  });
}

/* ============================================================
   GET ALL EMPLOYEE MASTER RECORDS
   ============================================================ */

async function getAllEmployeeMaster(datastore) {
  const table = datastore.table(EMPLOYEE_MASTER_TABLE_ID);

  let allRows = [];
  let nextToken;
  let moreRecords = true;

  while (moreRecords) {
    const options = {
      maxRows: 200,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    const result = await table.getPagedRows(options);

    allRows = allRows.concat(result.data || []);

    moreRecords = result.more_records === true;
    nextToken = result.next_token;
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

    if (!empId) {
      return;
    }

    map.set(empId, row);
  });

  return map;
}

/* ============================================================
   CHECK APPRAISAL SHEET ELIGIBILITY
 *
 * Employee must satisfy BOTH:
 *
 * 1. Employee_Master.emp_status = Active
 * 2. Employees.eligible_status = Eligible
 *
 * Employee_Master does NOT contain eligibility.
 * Employees does NOT get eligibility changed here.
 * ============================================================ */

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

  return masterStatus === "Active" && eligibility === "eligible";
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
) {
  let filtered = employees;

  /*
   * ==========================================================
   * APPRAISAL SHEET BASE FILTER
   *
   * Normal/default view:
   *
   * Employee_Master Active
   * AND
   * Employees Eligible
   *
   * Eligibility view:
   *
   * ALL Employees
   *
   * This allows HR to see both Eligible and Not Eligible
   * employees in the Eligibility List.
   * ==========================================================
   */

  if (view !== "eligibility" && view !== "master") {
    filtered = filtered.filter(function (employee) {
      return isAppraisalEligible(employee, employeeMasterMap);
    });
  }

  /*
   * ==========================================================
   * SEARCH
   * ==========================================================
   */

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

  /*
   * ==========================================================
   * STATUS FILTER
   *
   * Employees.status is synchronized from Employee_Master.
   * ==========================================================
   */

  if (status) {
    filtered = filtered.filter(function (employee) {
      return (
        String(employee.status || "")
          .trim()
          .toLowerCase() === status.toLowerCase()
      );
    });
  }

  /*
   * ==========================================================
   * ELIGIBILITY FILTER
   *
   * Strictly uses Employees.eligible_status.
   * ==========================================================
   */

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
  const appInstance = catalyst.initialize(req);

  const zcql = appInstance.zcql();

  const datastore = appInstance.datastore();

  const params = getQueryParams(req);

  const requestedPage = getPositiveInteger(params.page, 1);

  const requestedLimit = getPositiveInteger(params.limit, DEFAULT_LIMIT);

  const limit = Math.min(requestedLimit, MAX_LIMIT);

  const search = String(params.search || "").trim();

  const status = String(params.status || "")
    .trim()
    .toLowerCase();

  const eligibleParam = String(params.eligible || "")
    .trim()
    .toLowerCase();

  /*
   * ==========================================================
   * VIEW
   *
   * Normal/default:
   * Appraisal Sheet behavior
   *
   * eligibility:
   * All Employees for Eligibility List
   * ==========================================================
   */

  const view = String(params.view || "")
    .trim()
    .toLowerCase();

  /*
   * ==========================================================
   * GET EMPLOYEES DATA
   * ==========================================================
   */

  const allEmployees = await getAllEmployees(zcql);

  /*
   * ==========================================================
   * GET EMPLOYEE MASTER DATA
   * ==========================================================
   */

  const employeeMasterRows = await getAllEmployeeMaster(datastore);

  const employeeMasterMap = buildEmployeeMasterMap(employeeMasterRows);
  /* NEW: attach DOJ from Employee_Master (source of truth) */
  allEmployees.forEach(function (employee) {
    const empId = String(employee.emp_id || "")
      .trim()
      .toLowerCase();
    const master = employeeMasterMap.get(empId);
    employee.date_of_join = master ? master.date_of_join || "" : "";
  });

  /*
   * ==========================================================
   * COUNTS
   *
   * Counts remain based on the complete Employees dataset.
   * ==========================================================
   */

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

  /*
   * ==========================================================
   * FILTER
   * ==========================================================
   */

  const filteredEmployees = filterEmployees(
    allEmployees,
    employeeMasterMap,
    search,
    status === "all" ? "" : status,
    eligibleParam === "all" ? "" : eligibleParam,
    view,
  );

  const filteredCount = filteredEmployees.length;

  /*
   * ==========================================================
   * PAGINATION
   * ==========================================================
   */

  const totalPages = filteredCount === 0 ? 1 : Math.ceil(filteredCount / limit);

  const safePage = Math.min(requestedPage, totalPages);

  const offset = (safePage - 1) * limit;

  const data = filteredEmployees
    .slice(offset, offset + limit)
    .map(function (employee) {
      return normalizeEmployeeResponse(employee);
    });

  /*
   * ==========================================================
   * RESPONSE
   * ==========================================================
   */

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

  const existingRows = await table.getAllRows();

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

  let insertedRows = [];

  if (rowsToInsert.length) {
    insertedRows = await table.insertRows(rowsToInsert);
  }

  let updatedRows = [];

  if (rowsToUpdate.length) {
    updatedRows = await table.updateRows(rowsToUpdate);
  }

  sendJson(res, 200, {
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

  console.log("==============================================");
  console.log("EMPLOYEE UPDATE REQUEST");
  console.log("METHOD:", req.method);
  console.log("BODY:", JSON.stringify(body));
  console.log("==============================================");

  /* ==========================================================
     EMPLOYEE ID
     ========================================================== */

  const empId = String(body.emp_id || body.empId || "").trim();

  if (!empId) {
    return sendJson(res, 400, {
      success: false,
      message: "emp_id is required.",
    });
  }

  /* ==========================================================
     FIND EMPLOYEE IN EMPLOYEES TABLE
     ========================================================== */

  const employeeTable = datastore.table(EMPLOYEES_TABLE_ID);

  const employeeRows = await employeeTable.getAllRows();

  const existingEmployeeRow = (employeeRows || []).find(function (row) {
    return (
      String(row.emp_id || "")
        .trim()
        .toLowerCase() === empId.toLowerCase()
    );
  });

  if (!existingEmployeeRow) {
    console.log("EMPLOYEE NOT FOUND:", empId);

    return sendJson(res, 404, {
      success: false,
      message: "Employee " + empId + " not found.",
    });
  }

  const employeeRowId = existingEmployeeRow.ROWID || existingEmployeeRow.rowid;

  if (!employeeRowId) {
    throw new Error("Employee ROWID not found for " + empId);
  }

  /* ==========================================================
     STATUS UPDATE
     
     IMPORTANT:
     
     Employee_Master.emp_status is the source of truth.
     
     When status changes:
     
     1. Update Employee_Master.emp_status
     2. Update Employees.status
     
     Both tables stay synchronized.
     ========================================================== */

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const normalizedStatus = normalizeStatus(body.status);

    if (!normalizedStatus) {
      return sendJson(res, 400, {
        success: false,
        message: 'status must be either "Active" or "Inactive".',
      });
    }

    console.log("STATUS UPDATE:", empId, "TO:", normalizedStatus);

    /* ========================================================
       FIND EMPLOYEE MASTER RECORD
       ======================================================== */

    const employeeMasterTable = datastore.table(EMPLOYEE_MASTER_TABLE_ID);

    const employeeMasterRows = await employeeMasterTable.getAllRows();

    const existingMasterRow = (employeeMasterRows || []).find(function (row) {
      return (
        String(row.emp_id || "")
          .trim()
          .toLowerCase() === empId.toLowerCase()
      );
    });

    if (!existingMasterRow) {
      console.log("EMPLOYEE MASTER RECORD NOT FOUND:", empId);

      return sendJson(res, 404, {
        success: false,
        message: "Employee Master record not found for employee " + empId + ".",
      });
    }

    const masterRowId = existingMasterRow.ROWID || existingMasterRow.rowid;

    if (!masterRowId) {
      throw new Error("Employee Master ROWID not found for " + empId);
    }

    /* ========================================================
       UPDATE EMPLOYEE MASTER STATUS
       ======================================================== */

    const masterUpdateRow = {
      ROWID: masterRowId,
      emp_status: normalizedStatus,
    };

    console.log(
      "EMPLOYEE MASTER STATUS UPDATE:",
      JSON.stringify(masterUpdateRow),
    );

    const masterUpdateResult =
      await employeeMasterTable.updateRow(masterUpdateRow);

    console.log(
      "EMPLOYEE MASTER UPDATE RESULT:",
      JSON.stringify(masterUpdateResult),
    );

    /* ========================================================
       UPDATE EMPLOYEES STATUS
       ======================================================== */

    const employeeUpdateRow = {
      ROWID: employeeRowId,
      status: normalizedStatus,
    };

    console.log("EMPLOYEES STATUS UPDATE:", JSON.stringify(employeeUpdateRow));

    const employeeUpdateResult =
      await employeeTable.updateRow(employeeUpdateRow);

    console.log(
      "EMPLOYEES UPDATE RESULT:",
      JSON.stringify(employeeUpdateResult),
    );

    /* ========================================================
       VERIFY EMPLOYEE MASTER
       ======================================================== */

    const verifyMasterRows = await employeeMasterTable.getAllRows();

    const verifiedMasterRow = (verifyMasterRows || []).find(function (row) {
      return (
        String(row.emp_id || "")
          .trim()
          .toLowerCase() === empId.toLowerCase()
      );
    });

    const verifiedMasterStatus = normalizeStatus(
      verifiedMasterRow && verifiedMasterRow.emp_status,
    );

    console.log("VERIFIED EMPLOYEE MASTER:", JSON.stringify(verifiedMasterRow));

    if (verifiedMasterStatus !== normalizedStatus) {
      return sendJson(res, 500, {
        success: false,
        message: "Employee Master status update verification failed.",
        data: {
          emp_id: empId,
          requestedStatus: normalizedStatus,
          actualMasterStatus:
            verifiedMasterRow && verifiedMasterRow.emp_status !== undefined
              ? verifiedMasterRow.emp_status
              : null,
        },
      });
    }

    /* ========================================================
       VERIFY EMPLOYEES
       ======================================================== */

    const verifyEmployeeRows = await employeeTable.getAllRows();

    const verifiedEmployeeRow = (verifyEmployeeRows || []).find(function (row) {
      return (
        String(row.emp_id || "")
          .trim()
          .toLowerCase() === empId.toLowerCase()
      );
    });

    const verifiedEmployeeStatus = normalizeStatus(
      verifiedEmployeeRow && verifiedEmployeeRow.status,
    );

    console.log("VERIFIED EMPLOYEE:", JSON.stringify(verifiedEmployeeRow));

    if (verifiedEmployeeStatus !== normalizedStatus) {
      return sendJson(res, 500, {
        success: false,
        message: "Employees status update verification failed.",
        data: {
          emp_id: empId,
          requestedStatus: normalizedStatus,
          actualEmployeeStatus:
            verifiedEmployeeRow && verifiedEmployeeRow.status !== undefined
              ? verifiedEmployeeRow.status
              : null,
        },
      });
    }

    /* ========================================================
       SUCCESS
       ======================================================== */

    return sendJson(res, 200, {
      success: true,
      message:
        "Employee status updated successfully in Employee Master and Employees.",
      data: normalizeEmployeeResponse(verifiedEmployeeRow),
      employeeMaster: {
        emp_id: empId,
        emp_status: verifiedMasterStatus,
      },
    });
  }

  /* ==========================================================
     GENERIC EMPLOYEE UPDATE
     ========================================================== */

  const updateData = pickAllowedFields(body);

  if (Object.keys(updateData).length === 0) {
    return sendJson(res, 400, {
      success: false,
      message: "No valid employee fields were provided.",
    });
  }

  const updateRow = {
    ROWID: employeeRowId,
    ...updateData,
  };

  console.log("GENERIC EMPLOYEE UPDATE:", JSON.stringify(updateRow));

  const updateResult = await employeeTable.updateRow(updateRow);

  console.log("GENERIC UPDATE RESULT:", JSON.stringify(updateResult));

  sendJson(res, 200, {
    success: true,
    message: "Employee updated successfully.",
    data: normalizeEmployeeResponse({
      emp_id: empId,
      ...updateData,
    }),
  });
}

/* ============================================================
   EXPRESS ROUTES
   ============================================================ */

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

app.post("/", async function (req, res) {
  try {
    await createEmployees(req, res);
  } catch (error) {
    console.error("employee-api-v2 POST ERROR:", error);

    sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Internal server error.",
    });
  }
});

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
