// "use strict";

// const express = require("express");
// const catalyst = require("zcatalyst-sdk-node");

// const app = express();

// const DEFAULT_LIMIT = 20;
// const MAX_LIMIT = 100;

// /* ============================================================
//    EXPRESS JSON BODY PARSER
//    ============================================================ */

// app.use(express.json());

// /* ============================================================
//    CORS
//    ============================================================ */

// const corsHeaders = {
//   "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
//   "Access-Control-Allow-Headers":
//     "Content-Type, Authorization, X-Requested-With",
// };

// app.use(function (req, res, next) {
//   Object.entries(corsHeaders).forEach(function ([key, value]) {
//     res.setHeader(key, value);
//   });

//   next();
// });

// /* ============================================================
//    JSON RESPONSE
//    ============================================================ */

// function sendJson(res, statusCode, body) {
//   res.status(statusCode).json(body);
// }

// /* ============================================================
//    OPTIONS / PREFLIGHT
//    ============================================================ */

// app.use(function (req, res, next) {
//   if (req.method === "OPTIONS") {
//     return sendJson(res, 200, {
//       success: true,
//     });
//   }

//   next();
// });

// /* ============================================================
//    HELPERS
//    ============================================================ */

// function getQueryParams(req) {
//   return req.queryParams || req.query || {};
// }

// function getPositiveInteger(value, fallback) {
//   const number = Number(value);

//   if (!Number.isFinite(number)) {
//     return fallback;
//   }

//   return Math.max(1, Math.floor(number));
// }

// function normalizeStatus(value) {
//   const status = String(value || "")
//     .trim()
//     .toLowerCase();

//   if (status === "active") {
//     return "Active";
//   }

//   if (status === "inactive") {
//     return "Inactive";
//   }

//   return "";
// }

// /* ============================================================
//    ALLOWED FIELDS
//    ============================================================ */

// const ALLOWED_FIELDS = [
//   "name",
//   "designation",
//   "reporting_manager",
//   "comp_manager",
//   "appraiser_tech_ed",
//   "department",
//   "manager",
//   "status",
//   "wissen_experience",
//   "total_experience",
//   "last_appraisal_date",
//   "manager_rating",
//   "interview_count",
//   "rr_percent",
//   "gross_margin",
//   "rb_to_be_paid",
//   "month_rb",
//   "pb_to_be_paid",
//   "month_pb",
//   "current_annual_base_pay",
//   "target_pb_allocated_for_may",
//   "allocated_pb_amount",
//   "pb_installment",
//   "new_pb_to_be_offered",
//   "new_pb_installment",
//   "new_rb",
//   "hike_amount",
//   "hike_pct",
//   "target_pb_next_year",
//   "eligible_for_promotion",
//   "new_title",
//   "at_risk",
//   "Joining_date",
//   "manager_email_id",
//   "super_man_email_id",
// ];

// function pickAllowedFields(body) {
//   const data = {};

//   ALLOWED_FIELDS.forEach(function (field) {
//     if (Object.prototype.hasOwnProperty.call(body, field)) {
//       data[field] = body[field];
//     }
//   });

//   return data;
// }

// /* ============================================================
//    GET ALL EMPLOYEES
//    ============================================================ */

// async function getAllEmployees(zcql) {
//   const query = `
//     SELECT *
//     FROM employees
//     ORDER BY emp_id
//   `;

//   const result = await zcql.executeZCQLQuery(query);

//   return (result || []).map(function (item) {
//     return item.Employees || item.employees || item;
//   });
// }

// /* ============================================================
//    FILTER EMPLOYEES
//    ============================================================ */

// function filterEmployees(employees, search, status) {
//   let filtered = employees;

//   if (search) {
//     const searchValue = search.toLowerCase();

//     filtered = filtered.filter(function (employee) {
//       const empId = String(employee.emp_id || "").toLowerCase();

//       const name = String(employee.name || "").toLowerCase();

//       const designation = String(employee.designation || "").toLowerCase();

//       const organization = String(
//         employee.department || employee.organization || "",
//       ).toLowerCase();

//       return (
//         empId.includes(searchValue) ||
//         name.includes(searchValue) ||
//         designation.includes(searchValue) ||
//         organization.includes(searchValue)
//       );
//     });
//   }

//   if (status) {
//     filtered = filtered.filter(function (employee) {
//       return (
//         String(employee.status || "")
//           .trim()
//           .toLowerCase() === status.toLowerCase()
//       );
//     });
//   }

//   return filtered;
// }

// /* ============================================================
//    GET EMPLOYEES
//    ============================================================ */

// async function getEmployees(req, res) {
//   const appInstance = catalyst.initialize(req);

//   const zcql = appInstance.zcql();

//   const params = getQueryParams(req);

//   const requestedPage = getPositiveInteger(params.page, 1);

//   const requestedLimit = getPositiveInteger(params.limit, DEFAULT_LIMIT);

//   const limit = Math.min(requestedLimit, MAX_LIMIT);

//   const search = String(params.search || "").trim();

//   const status = String(params.status || "")
//     .trim()
//     .toLowerCase();

//   const allEmployees = await getAllEmployees(zcql);

//   const totalCount = allEmployees.length;

//   const activeCount = allEmployees.filter(function (employee) {
//     return (
//       String(employee.status || "")
//         .trim()
//         .toLowerCase() === "active"
//     );
//   }).length;

//   const inactiveCount = allEmployees.filter(function (employee) {
//     return (
//       String(employee.status || "")
//         .trim()
//         .toLowerCase() === "inactive"
//     );
//   }).length;

//   const filteredEmployees = filterEmployees(
//     allEmployees,
//     search,
//     status === "all" ? "" : status,
//   );

//   const filteredCount = filteredEmployees.length;

//   const totalPages = filteredCount === 0 ? 1 : Math.ceil(filteredCount / limit);

//   const safePage = Math.min(requestedPage, totalPages);

//   const offset = (safePage - 1) * limit;

//   const data = filteredEmployees.slice(offset, offset + limit);

//   sendJson(res, 200, {
//     success: true,

//     data: data,

//     pagination: {
//       page: safePage,
//       limit: limit,
//       totalCount: filteredCount,
//       totalPages: totalPages,
//       returnedCount: data.length,
//     },

//     counts: {
//       total: totalCount,
//       active: activeCount,
//       inactive: inactiveCount,
//     },

//     filters: {
//       search: search,
//       status: status || "all",
//     },
//   });
// }

// /* ============================================================
//    CREATE / IMPORT EMPLOYEES
//    ============================================================ */

// async function createEmployees(req, res) {
//   const appInstance = catalyst.initialize(req);

//   const datastore = appInstance.datastore();

//   const body = req.body || {};

//   const incoming = Array.isArray(body.employees)
//     ? body.employees
//     : Array.isArray(body)
//       ? body
//       : [body];

//   if (!incoming.length) {
//     return sendJson(res, 400, {
//       success: false,
//       message: "No employee records were provided.",
//     });
//   }

//   const table = datastore.table("employees");

//   const existingRows = await table.getAllRows();

//   const existingByEmpId = new Map();

//   (existingRows || []).forEach(function (row) {
//     const key = String(row.emp_id || "")
//       .trim()
//       .toLowerCase();

//     if (key) {
//       existingByEmpId.set(key, row);
//     }
//   });

//   const rowsToInsert = [];
//   const rowsToUpdate = [];
//   const skipped = [];

//   incoming.forEach(function (item) {
//     const record = item || {};

//     const empId = String(record.emp_id || record.empId || "").trim();

//     if (!empId) {
//       skipped.push({
//         emp_id: "",
//         reason: "emp_id is missing.",
//       });

//       return;
//     }

//     const data = pickAllowedFields(record);

//     if (data.status !== undefined) {
//       const normalizedStatus = normalizeStatus(data.status);

//       if (normalizedStatus) {
//         data.status = normalizedStatus;
//       }
//     }

//     const existing = existingByEmpId.get(empId.toLowerCase());

//     if (existing) {
//       const rowId = existing.ROWID || existing.rowid;

//       if (!rowId) {
//         skipped.push({
//           emp_id: empId,
//           reason: "Existing row has no ROWID.",
//         });

//         return;
//       }

//       rowsToUpdate.push({
//         ROWID: rowId,
//         ...data,
//       });

//       return;
//     }

//     rowsToInsert.push({
//       emp_id: empId,
//       status: data.status || "Active",
//       ...data,
//     });
//   });

//   let insertedRows = [];

//   if (rowsToInsert.length) {
//     insertedRows = await table.insertRows(rowsToInsert);
//   }

//   let updatedRows = [];

//   if (rowsToUpdate.length) {
//     updatedRows = await table.updateRows(rowsToUpdate);
//   }

//   sendJson(res, 200, {
//     success: true,
//     message:
//       "Employee import completed. " +
//       rowsToInsert.length +
//       " created, " +
//       rowsToUpdate.length +
//       " updated.",
//     data: {
//       created: rowsToInsert.length,
//       updated: rowsToUpdate.length,
//       skipped: skipped.length,
//       skippedRecords: skipped,
//       insertedRows: insertedRows,
//       updatedRows: updatedRows,
//     },
//   });
// }

// /* ============================================================
//    UPDATE EMPLOYEE
//    ============================================================ */

// async function updateEmployee(req, res) {
//   const appInstance = catalyst.initialize(req);

//   const datastore = appInstance.datastore();

//   const body = req.body || {};

//   console.log("==============================================");
//   console.log("EMPLOYEE UPDATE REQUEST");
//   console.log("METHOD:", req.method);
//   console.log("BODY:", JSON.stringify(body));
//   console.log("==============================================");

//   /* ==========================================================
//      EMPLOYEE ID
//      ========================================================== */

//   const empId = String(body.emp_id || body.empId || "").trim();

//   if (!empId) {
//     return sendJson(res, 400, {
//       success: false,
//       message: "emp_id is required.",
//     });
//   }

//   /* ==========================================================
//      FIND EMPLOYEE
//      ========================================================== */

//   const table = datastore.table("employees");

//   const rows = await table.getAllRows();

//   const existingRow = (rows || []).find(function (row) {
//     return (
//       String(row.emp_id || "")
//         .trim()
//         .toLowerCase() === empId.toLowerCase()
//     );
//   });

//   if (!existingRow) {
//     console.log("EMPLOYEE NOT FOUND:", empId);

//     return sendJson(res, 404, {
//       success: false,
//       message: "Employee " + empId + " not found.",
//     });
//   }

//   const rowId = existingRow.ROWID || existingRow.rowid;

//   if (!rowId) {
//     throw new Error("Employee ROWID not found for " + empId);
//   }

//   /* ==========================================================
//      STATUS UPDATE

//      Active/Inactive is completely independent from eligibility.
//      ========================================================== */

//   if (Object.prototype.hasOwnProperty.call(body, "status")) {
//     const normalizedStatus = normalizeStatus(body.status);

//     if (!normalizedStatus) {
//       return sendJson(res, 400, {
//         success: false,
//         message: 'status must be either "Active" or "Inactive".',
//       });
//     }

//     console.log(
//       "STATUS UPDATE:",
//       empId,
//       "FROM:",
//       existingRow.status,
//       "TO:",
//       normalizedStatus,
//     );

//     const statusUpdateRow = {
//       ROWID: rowId,
//       status: normalizedStatus,
//     };

//     console.log("CATALYST STATUS UPDATE ROW:", JSON.stringify(statusUpdateRow));

//     const updateResult = await table.updateRow(statusUpdateRow);

//     console.log("CATALYST STATUS UPDATE RESULT:", JSON.stringify(updateResult));

//     /* ========================================================
//        READ THE ROW AGAIN AFTER UPDATE
//        ======================================================== */

//     const verifyRows = await table.getAllRows();

//     const verifiedRow = (verifyRows || []).find(function (row) {
//       return (
//         String(row.emp_id || "")
//           .trim()
//           .toLowerCase() === empId.toLowerCase()
//       );
//     });

//     console.log("VERIFIED EMPLOYEE:", JSON.stringify(verifiedRow));

//     const verifiedStatus = normalizeStatus(verifiedRow?.status);

//     if (verifiedStatus !== normalizedStatus) {
//       return sendJson(res, 500, {
//         success: false,
//         message: "Catalyst update completed but status verification failed.",
//         data: {
//           emp_id: empId,
//           requestedStatus: normalizedStatus,
//           actualStatus: verifiedRow?.status ?? null,
//         },
//       });
//     }

//     return sendJson(res, 200, {
//       success: true,
//       message: "Employee status updated successfully.",
//       data: verifiedRow,
//     });
//   }

//   /* ==========================================================
//      GENERIC EMPLOYEE UPDATE
//      ========================================================== */

//   const updateData = pickAllowedFields(body);

//   if (Object.keys(updateData).length === 0) {
//     return sendJson(res, 400, {
//       success: false,
//       message: "No valid employee fields were provided.",
//     });
//   }

//   const updateRow = {
//     ROWID: rowId,
//     ...updateData,
//   };

//   console.log("GENERIC EMPLOYEE UPDATE:", JSON.stringify(updateRow));

//   const updateResult = await table.updateRow(updateRow);

//   console.log("GENERIC UPDATE RESULT:", JSON.stringify(updateResult));

//   sendJson(res, 200, {
//     success: true,
//     message: "Employee updated successfully.",
//     data: {
//       emp_id: empId,
//       ...updateData,
//     },
//   });
// }

// /* ============================================================
//    EXPRESS ROUTES
//    ============================================================ */

// app.get("/", async function (req, res) {
//   try {
//     await getEmployees(req, res);
//   } catch (error) {
//     console.error("employee-api-v2 GET ERROR:", error);

//     sendJson(res, 500, {
//       success: false,
//       message: error?.message || "Internal server error.",
//     });
//   }
// });

// app.post("/", async function (req, res) {
//   try {
//     await createEmployees(req, res);
//   } catch (error) {
//     console.error("employee-api-v2 POST ERROR:", error);

//     sendJson(res, 500, {
//       success: false,
//       message: error?.message || "Internal server error.",
//     });
//   }
// });

// app.put("/", async function (req, res) {
//   try {
//     await updateEmployee(req, res);
//   } catch (error) {
//     console.error("employee-api-v2 PUT ERROR:", error);

//     sendJson(res, 500, {
//       success: false,
//       message: error?.message || "Internal server error.",
//     });
//   }
// });

// app.patch("/", async function (req, res) {
//   try {
//     await updateEmployee(req, res);
//   } catch (error) {
//     console.error("employee-api-v2 PATCH ERROR:", error);

//     sendJson(res, 500, {
//       success: false,
//       message: error?.message || "Internal server error.",
//     });
//   }
// });

// /* ============================================================
//    METHOD NOT ALLOWED
//    ============================================================ */

// app.use(function (req, res) {
//   sendJson(res, 405, {
//     success: false,
//     message: "Method " + req.method + " not allowed.",
//   });
// });

// /* ============================================================
//    CATALYST ADVANCED I/O ENTRY
//    ============================================================ */

// module.exports = function (req, res) {
//   app(req, res);
// };

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

  return {
    ...row,

    /*
     * IMPORTANT:
     * Organization Experience comes directly from the
     * Catalyst Data Store field "wissen_experience".
     *
     * No calculation from Joining_date is performed.
     */
    wissen_experience: row.wissen_experience ?? row.wissenExperience ?? "",

    /*
     * Keep a frontend-friendly alias as well.
     */
    orgExp: row.wissen_experience ?? row.wissenExperience ?? row.orgExp ?? "",
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
    ORDER BY emp_id
  `;

  const result = await zcql.executeZCQLQuery(query);

  return (result || []).map(function (item) {
    const employee = item.Employees || item.employees || item;

    return normalizeEmployeeResponse(employee);
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
          .toLowerCase() === status.toLowerCase()
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

  const status = String(params.status || "")
    .trim()
    .toLowerCase();

  const allEmployees = await getAllEmployees(zcql);

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

  const filteredEmployees = filterEmployees(
    allEmployees,
    search,
    status === "all" ? "" : status,
  );

  const filteredCount = filteredEmployees.length;

  const totalPages = filteredCount === 0 ? 1 : Math.ceil(filteredCount / limit);

  const safePage = Math.min(requestedPage, totalPages);

  const offset = (safePage - 1) * limit;

  const data = filteredEmployees
    .slice(offset, offset + limit)
    .map(function (employee) {
      return normalizeEmployeeResponse(employee);
    });

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

  const table = datastore.table("employees");

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
     FIND EMPLOYEE
     ========================================================== */

  const table = datastore.table("employees");

  const rows = await table.getAllRows();

  const existingRow = (rows || []).find(function (row) {
    return (
      String(row.emp_id || "")
        .trim()
        .toLowerCase() === empId.toLowerCase()
    );
  });

  if (!existingRow) {
    console.log("EMPLOYEE NOT FOUND:", empId);

    return sendJson(res, 404, {
      success: false,
      message: "Employee " + empId + " not found.",
    });
  }

  const rowId = existingRow.ROWID || existingRow.rowid;

  if (!rowId) {
    throw new Error("Employee ROWID not found for " + empId);
  }

  /* ==========================================================
     STATUS UPDATE

     Active/Inactive is completely independent from eligibility.
     ========================================================== */

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const normalizedStatus = normalizeStatus(body.status);

    if (!normalizedStatus) {
      return sendJson(res, 400, {
        success: false,
        message: 'status must be either "Active" or "Inactive".',
      });
    }

    console.log(
      "STATUS UPDATE:",
      empId,
      "FROM:",
      existingRow.status,
      "TO:",
      normalizedStatus,
    );

    const statusUpdateRow = {
      ROWID: rowId,
      status: normalizedStatus,
    };

    console.log("CATALYST STATUS UPDATE ROW:", JSON.stringify(statusUpdateRow));

    const updateResult = await table.updateRow(statusUpdateRow);

    console.log("CATALYST STATUS UPDATE RESULT:", JSON.stringify(updateResult));

    /* ========================================================
       READ THE ROW AGAIN AFTER UPDATE
       ======================================================== */

    const verifyRows = await table.getAllRows();

    const verifiedRow = (verifyRows || []).find(function (row) {
      return (
        String(row.emp_id || "")
          .trim()
          .toLowerCase() === empId.toLowerCase()
      );
    });

    console.log("VERIFIED EMPLOYEE:", JSON.stringify(verifiedRow));

    const verifiedStatus = normalizeStatus(verifiedRow?.status);

    if (verifiedStatus !== normalizedStatus) {
      return sendJson(res, 500, {
        success: false,
        message: "Catalyst update completed but status verification failed.",
        data: {
          emp_id: empId,
          requestedStatus: normalizedStatus,
          actualStatus: verifiedRow?.status ?? null,
        },
      });
    }

    return sendJson(res, 200, {
      success: true,
      message: "Employee status updated successfully.",
      data: normalizeEmployeeResponse(verifiedRow),
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
    ROWID: rowId,
    ...updateData,
  };

  console.log("GENERIC EMPLOYEE UPDATE:", JSON.stringify(updateRow));

  const updateResult = await table.updateRow(updateRow);

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
      message: error?.message || "Internal server error.",
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
      message: error?.message || "Internal server error.",
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
      message: error?.message || "Internal server error.",
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
      message: error?.message || "Internal server error.",
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
