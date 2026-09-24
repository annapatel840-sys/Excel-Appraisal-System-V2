// "use strict";

// const catalyst = require("zcatalyst-sdk-node");

// const AUDIT_TABLE_ID = "71873000000021235";

// const DEFAULT_LIMIT = 100;
// const MAX_LIMIT = 500;
// const DATASTORE_PAGE_SIZE = 200;

// /* ============================================================
//    SEND JSON RESPONSE
//    ============================================================ */

// function sendJson(res, statusCode, body) {
//   res.writeHead(statusCode, {
//     "Content-Type": "application/json",
//     "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
//     "Access-Control-Allow-Headers":
//       "Content-Type, Authorization, X-Requested-With",
//   });

//   res.end(JSON.stringify(body));
// }

// /* ============================================================
//    GET QUERY PARAMETERS
//    ============================================================ */

// function getQueryParams(req) {
//   if (req.queryParams) {
//     return req.queryParams;
//   }

//   const url = String(req.url || "");
//   const queryIndex = url.indexOf("?");

//   if (queryIndex === -1) {
//     return {};
//   }

//   const queryString = url.substring(queryIndex + 1);
//   const params = new URLSearchParams(queryString);
//   const result = {};

//   params.forEach(function (value, key) {
//     result[key] = value;
//   });

//   return result;
// }

// /* ============================================================
//    READ REQUEST BODY
//    ============================================================ */

// function readBody(req) {
//   return new Promise(function (resolve, reject) {
//     let body = "";

//     req.on("data", function (chunk) {
//       body += chunk;
//     });

//     req.on("end", function () {
//       if (!body.trim()) {
//         resolve({});
//         return;
//       }

//       try {
//         resolve(JSON.parse(body));
//       } catch (error) {
//         reject(new Error("Invalid JSON request body."));
//       }
//     });

//     req.on("error", function (error) {
//       reject(error);
//     });
//   });
// }

// /* ============================================================
//    INTEGER HELPER
//    ============================================================ */

// function getPositiveInteger(value, fallback) {
//   const number = Number(value);

//   if (!isFinite(number)) {
//     return fallback;
//   }

//   const integer = Math.floor(number);

//   if (integer < 1) {
//     return 1;
//   }

//   return integer;
// }

// /* ============================================================
//    DATETIME
//    ============================================================ */

// function formatDateTime(date) {
//   const year = date.getFullYear();
//   const month = String(date.getMonth() + 1).padStart(2, "0");
//   const day = String(date.getDate()).padStart(2, "0");
//   const hours = String(date.getHours()).padStart(2, "0");
//   const minutes = String(date.getMinutes()).padStart(2, "0");
//   const seconds = String(date.getSeconds()).padStart(2, "0");

//   return (
//     year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds
//   );
// }

// function normalizeDateTime(value) {
//   if (!value) {
//     return formatDateTime(new Date());
//   }

//   const date = new Date(value);

//   if (isNaN(date.getTime())) {
//     throw new Error("Invalid changed_at datetime: " + String(value));
//   }

//   return formatDateTime(date);
// }

// /* ============================================================
//    NORMALIZE AUDIT RESPONSE
//    ============================================================ */

// function normalizeAuditResponse(row) {
//   row = row || {};

//   return {
//     ROWID: row.ROWID || row.rowid || "",

//     emp_id: row.emp_id || "",

//     employee_name: row.employee_name || "",

//     field_name: row.field_name || "",

//     old_value:
//       row.old_value !== undefined && row.old_value !== null
//         ? String(row.old_value)
//         : "",

//     new_value:
//       row.new_value !== undefined && row.new_value !== null
//         ? String(row.new_value)
//         : "",

//     changed_by: row.changed_by || "",

//     changed_at: row.changed_at || "",

//     source: row.source || "",

//     batch_id: row.batch_id || "",

//     appraisal_year: row.appraisal_year || "",

//     CREATEDTIME: row.CREATEDTIME || "",

//     MODIFIEDTIME: row.MODIFIEDTIME || "",
//   };
// }

// /* ============================================================
//    NORMALIZE AUDIT INPUT
//    ============================================================ */

// function normalizeAuditPayload(item) {
//   const row = item || {};

//   const empId = row.emp_id || row.empId || "";

//   const employeeName = row.employee_name || row.employeeName || row.name || "";

//   const fieldName = row.field_name || row.fieldName || row.field || "";

//   const oldValue =
//     row.old_value !== undefined
//       ? row.old_value
//       : row.oldValue !== undefined
//         ? row.oldValue
//         : row.from !== undefined
//           ? row.from
//           : "";

//   const newValue =
//     row.new_value !== undefined
//       ? row.new_value
//       : row.newValue !== undefined
//         ? row.newValue
//         : row.to !== undefined
//           ? row.to
//           : "";

//   const changedBy = row.changed_by || row.changedBy || row.user || "system";

//   const changedAt = row.changed_at || row.changedAt || row.at || "";

//   const source = row.source || "manual";

//   const batchId = row.batch_id || row.batchId || "";

//   const appraisalYear = row.appraisal_year || row.appraisalYear || "Apr-26";

//   return {
//     emp_id: String(empId).trim(),

//     employee_name: String(employeeName).trim(),

//     field_name: String(fieldName).trim(),

//     old_value:
//       oldValue === null || oldValue === undefined ? "" : String(oldValue),

//     new_value:
//       newValue === null || newValue === undefined ? "" : String(newValue),

//     changed_by: String(changedBy).trim(),

//     changed_at: normalizeDateTime(changedAt),

//     source: String(source).trim(),

//     batch_id: String(batchId).trim(),

//     appraisal_year: String(appraisalYear).trim(),
//   };
// }

// /* ============================================================
//    GET AUDIT HISTORY
//    ============================================================ */

// async function getAuditHistory(req, res) {
//   const appInstance = catalyst.initialize(req);

//   const datastore = appInstance.datastore();

//   const table = datastore.table(AUDIT_TABLE_ID);

//   const params = getQueryParams(req);

//   const empId = String(params.emp_id || params.empId || "").trim();

//   const appraisalYear = String(
//     params.appraisal_year || params.appraisalYear || "",
//   ).trim();

//   const requestedLimit = getPositiveInteger(params.limit, DEFAULT_LIMIT);

//   const limit = Math.min(requestedLimit, MAX_LIMIT);

//   console.log("==============================================");
//   console.log("AUDIT GET");
//   console.log("TABLE:", AUDIT_TABLE_ID);
//   console.log("EMP ID:", empId || "ALL");
//   console.log("YEAR:", appraisalYear || "ALL");
//   console.log("LIMIT:", limit);
//   console.log("==============================================");

//   /*
//    * Fetch enough pages so filtering happens against
//    * the complete available audit history.
//    */

//   let allRows = [];
//   let nextToken = null;

//   while (true) {
//     const options = {
//       maxRows: DATASTORE_PAGE_SIZE,
//     };

//     if (nextToken) {
//       options.nextToken = nextToken;
//     }

//     const result = await table.getPagedRows(options);

//     const pageRows = Array.isArray(result.data) ? result.data : [];

//     allRows = allRows.concat(pageRows);

//     console.log(
//       "AUDIT PAGE FETCHED:",
//       pageRows.length,
//       "TOTAL:",
//       allRows.length,
//     );

//     if (result.more_records !== true || !result.next_token) {
//       break;
//     }

//     nextToken = result.next_token;
//   }

//   console.log("AUDIT TOTAL DATASTORE ROWS:", allRows.length);

//   /* ==========================================================
//      FILTER
//      ========================================================== */

//   let filteredRows = allRows.filter(function (row) {
//     if (empId) {
//       const rowEmpId = String(row.emp_id || "").trim();

//       if (rowEmpId.toLowerCase() !== empId.toLowerCase()) {
//         return false;
//       }
//     }

//     if (appraisalYear) {
//       const rowYear = String(row.appraisal_year || "").trim();

//       if (rowYear.toLowerCase() !== appraisalYear.toLowerCase()) {
//         return false;
//       }
//     }

//     return true;
//   });

//   /* ==========================================================
//      SORT NEWEST FIRST
//      ========================================================== */

//   filteredRows.sort(function (a, b) {
//     const dateA = new Date(a.changed_at || a.CREATEDTIME || 0).getTime();

//     const dateB = new Date(b.changed_at || b.CREATEDTIME || 0).getTime();

//     return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
//   });

//   /* ==========================================================
//      LIMIT AFTER FILTERING
//      ========================================================== */

//   const limitedRows = filteredRows.slice(0, limit);

//   const data = limitedRows.map(function (row) {
//     return normalizeAuditResponse(row);
//   });

//   console.log("AUDIT MATCHING ROWS:", filteredRows.length);

//   console.log("AUDIT RETURNING ROWS:", data.length);

//   sendJson(res, 200, {
//     success: true,
//     count: data.length,
//     total: filteredRows.length,
//     data: data,
//   });
// }

// /* ============================================================
//    CREATE AUDIT RECORDS
//    ============================================================ */

// async function createAuditRecords(req, res) {
//   const appInstance = catalyst.initialize(req);

//   const datastore = appInstance.datastore();

//   const body = await readBody(req);

//   console.log("==============================================");
//   console.log("AUDIT POST RECEIVED");
//   console.log("BODY:", JSON.stringify(body));
//   console.log("TABLE:", AUDIT_TABLE_ID);
//   console.log("==============================================");

//   let incoming;

//   if (Array.isArray(body)) {
//     incoming = body;
//   } else if (Array.isArray(body.data)) {
//     incoming = body.data;
//   } else if (Array.isArray(body.rows)) {
//     incoming = body.rows;
//   } else if (Array.isArray(body.audits)) {
//     incoming = body.audits;
//   } else {
//     incoming = [body];
//   }

//   if (!incoming.length) {
//     sendJson(res, 400, {
//       success: false,
//       message: "No audit records were provided.",
//     });

//     return;
//   }

//   console.log("AUDIT INCOMING COUNT:", incoming.length);

//   const rowsToInsert = [];
//   const skipped = [];

//   incoming.forEach(function (item, index) {
//     try {
//       const audit = normalizeAuditPayload(item);

//       if (!audit.emp_id) {
//         skipped.push({
//           index: index,
//           reason: "emp_id is required.",
//         });

//         return;
//       }

//       if (!audit.field_name) {
//         skipped.push({
//           index: index,
//           emp_id: audit.emp_id,
//           reason: "field_name is required.",
//         });

//         return;
//       }

//       rowsToInsert.push({
//         emp_id: audit.emp_id,

//         employee_name: audit.employee_name,

//         field_name: audit.field_name,

//         old_value: audit.old_value,

//         new_value: audit.new_value,

//         changed_by: audit.changed_by,

//         changed_at: audit.changed_at,

//         source: audit.source,

//         batch_id: audit.batch_id,

//         appraisal_year: audit.appraisal_year,
//       });
//     } catch (error) {
//       skipped.push({
//         index: index,
//         reason: error.message || "Invalid audit record.",
//       });
//     }
//   });

//   if (!rowsToInsert.length) {
//     sendJson(res, 400, {
//       success: false,
//       message: "No valid audit records were provided.",
//       skipped: skipped,
//     });

//     return;
//   }

//   console.log("AUDIT VALID ROW COUNT:", rowsToInsert.length);

//   console.log("AUDIT INSERT PAYLOAD:", JSON.stringify(rowsToInsert));

//   const table = datastore.table(AUDIT_TABLE_ID);

//   try {
//     const insertedRows = await table.insertRows(rowsToInsert);

//     console.log("AUDIT INSERT RESULT:", JSON.stringify(insertedRows));

//     const insertedArray = Array.isArray(insertedRows) ? insertedRows : [];

//     const data = insertedArray.map(function (row) {
//       return normalizeAuditResponse(row);
//     });

//     console.log("AUDIT INSERTED COUNT:", data.length);

//     sendJson(res, 200, {
//       success: true,

//       message: data.length + " audit record(s) created successfully.",

//       count: data.length,

//       data: data,

//       skipped: skipped.length,

//       skippedRecords: skipped,
//     });
//   } catch (error) {
//     console.error("AUDIT DATASTORE INSERT ERROR:", error);

//     sendJson(res, 500, {
//       success: false,

//       message: "Failed to insert audit records into Data Store.",

//       error: error.message || String(error),

//       skipped: skipped.length,

//       skippedRecords: skipped,
//     });
//   }
// }

// /* ============================================================
//    MAIN FUNCTION
//    ============================================================ */

// module.exports = async function (req, res) {
//   const method = String(req.method || "GET").toUpperCase();

//   console.log("==============================================");
//   console.log("APPRAISAL AUDIT API");
//   console.log("METHOD:", method);
//   console.log("URL:", req.url);
//   console.log("TABLE:", AUDIT_TABLE_ID);
//   console.log("==============================================");

//   try {
//     if (method === "OPTIONS") {
//       sendJson(res, 200, {
//         success: true,
//       });

//       return;
//     }

//     if (method === "GET") {
//       await getAuditHistory(req, res);

//       return;
//     }

//     if (method === "POST") {
//       await createAuditRecords(req, res);

//       return;
//     }

//     sendJson(res, 405, {
//       success: false,

//       message: "Method " + method + " not allowed.",
//     });
//   } catch (error) {
//     console.error("APPRAISAL AUDIT API ERROR:", error);

//     sendJson(res, 500, {
//       success: false,

//       message: error.message || "Internal server error.",

//       error: error.stack || String(error),
//     });
//   }
// };

"use strict";

const catalyst = require("zcatalyst-sdk-node");
const { authenticate, getAllowedEmpIds } = require("./auth");

const AUDIT_TABLE_ID = "71873000000021235";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DATASTORE_PAGE_SIZE = 200;

/* ============================================================
   SEND JSON RESPONSE
   ============================================================ */

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
  });

  res.end(JSON.stringify(body));
}

/* ============================================================
   GET QUERY PARAMETERS
   ============================================================ */

function getQueryParams(req) {
  if (req.queryParams) {
    return req.queryParams;
  }

  const url = String(req.url || "");
  const queryIndex = url.indexOf("?");

  if (queryIndex === -1) {
    return {};
  }

  const queryString = url.substring(queryIndex + 1);
  const params = new URLSearchParams(queryString);
  const result = {};

  params.forEach(function (value, key) {
    result[key] = value;
  });

  return result;
}

/* ============================================================
   READ REQUEST BODY
   ============================================================ */

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let body = "";

    req.on("data", function (chunk) {
      body += chunk;
    });

    req.on("end", function () {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON request body."));
      }
    });

    req.on("error", function (error) {
      reject(error);
    });
  });
}

/* ============================================================
   INTEGER HELPER
   ============================================================ */

function getPositiveInteger(value, fallback) {
  const number = Number(value);

  if (!isFinite(number)) {
    return fallback;
  }

  const integer = Math.floor(number);

  if (integer < 1) {
    return 1;
  }

  return integer;
}

/* ============================================================
   DATETIME
   ============================================================ */

function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return (
    year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds
  );
}

function normalizeDateTime(value) {
  if (!value) {
    return formatDateTime(new Date());
  }

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    throw new Error("Invalid changed_at datetime: " + String(value));
  }

  return formatDateTime(date);
}

/* ============================================================
   NORMALIZE AUDIT RESPONSE
   ============================================================ */

function normalizeAuditResponse(row) {
  row = row || {};

  return {
    ROWID: row.ROWID || row.rowid || "",

    emp_id: row.emp_id || "",

    employee_name: row.employee_name || "",

    field_name: row.field_name || "",

    old_value:
      row.old_value !== undefined && row.old_value !== null
        ? String(row.old_value)
        : "",

    new_value:
      row.new_value !== undefined && row.new_value !== null
        ? String(row.new_value)
        : "",

    changed_by: row.changed_by || "",

    changed_at: row.changed_at || "",

    source: row.source || "",

    batch_id: row.batch_id || "",

    appraisal_year: row.appraisal_year || "",

    CREATEDTIME: row.CREATEDTIME || "",

    MODIFIEDTIME: row.MODIFIEDTIME || "",
  };
}

/* ============================================================
   NORMALIZE AUDIT INPUT
   ============================================================ */

function normalizeAuditPayload(item) {
  const row = item || {};

  const empId = row.emp_id || row.empId || "";

  const employeeName = row.employee_name || row.employeeName || row.name || "";

  const fieldName = row.field_name || row.fieldName || row.field || "";

  const oldValue =
    row.old_value !== undefined
      ? row.old_value
      : row.oldValue !== undefined
        ? row.oldValue
        : row.from !== undefined
          ? row.from
          : "";

  const newValue =
    row.new_value !== undefined
      ? row.new_value
      : row.newValue !== undefined
        ? row.newValue
        : row.to !== undefined
          ? row.to
          : "";

  const changedBy = row.changed_by || row.changedBy || row.user || "system";

  const changedAt = row.changed_at || row.changedAt || row.at || "";

  const source = row.source || "manual";

  const batchId = row.batch_id || row.batchId || "";

  const appraisalYear = row.appraisal_year || row.appraisalYear || "Apr-26";

  return {
    emp_id: String(empId).trim(),

    employee_name: String(employeeName).trim(),

    field_name: String(fieldName).trim(),

    old_value:
      oldValue === null || oldValue === undefined ? "" : String(oldValue),

    new_value:
      newValue === null || newValue === undefined ? "" : String(newValue),

    changed_by: String(changedBy).trim(),

    changed_at: normalizeDateTime(changedAt),

    source: String(source).trim(),

    batch_id: String(batchId).trim(),

    appraisal_year: String(appraisalYear).trim(),
  };
}

/* ============================================================
   GET AUDIT HISTORY
   ============================================================ */

async function getAuditHistory(req, res) {
  const appInstance = catalyst.initialize(req);

  const datastore = appInstance.datastore();

  const table = datastore.table(AUDIT_TABLE_ID);

  const params = getQueryParams(req);

  const empId = String(params.emp_id || params.empId || "").trim();

  const appraisalYear = String(
    params.appraisal_year || params.appraisalYear || "",
  ).trim();

  const requestedLimit = getPositiveInteger(params.limit, DEFAULT_LIMIT);

  const limit = Math.min(requestedLimit, MAX_LIMIT);

  console.log("==============================================");
  console.log("AUDIT GET");
  console.log("TABLE:", AUDIT_TABLE_ID);
  console.log("EMP ID:", empId || "ALL");
  console.log("YEAR:", appraisalYear || "ALL");
  console.log("LIMIT:", limit);
  console.log("==============================================");

  /*
   * Fetch enough pages so filtering happens against
   * the complete available audit history.
   */

  let allRows = [];
  let nextToken = null;

  while (true) {
    const options = {
      maxRows: DATASTORE_PAGE_SIZE,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    const result = await table.getPagedRows(options);

    const pageRows = Array.isArray(result.data) ? result.data : [];

    allRows = allRows.concat(pageRows);

    console.log(
      "AUDIT PAGE FETCHED:",
      pageRows.length,
      "TOTAL:",
      allRows.length,
    );

    if (result.more_records !== true || !result.next_token) {
      break;
    }

    nextToken = result.next_token;
  }

  console.log("AUDIT TOTAL DATASTORE ROWS:", allRows.length);

  /* ==========================================================
     FILTER
     ========================================================== */

  let filteredRows = allRows.filter(function (row) {
    if (empId) {
      const rowEmpId = String(row.emp_id || "").trim();

      if (rowEmpId.toLowerCase() !== empId.toLowerCase()) {
        return false;
      }
    }

    if (appraisalYear) {
      const rowYear = String(row.appraisal_year || "").trim();

      if (rowYear.toLowerCase() !== appraisalYear.toLowerCase()) {
        return false;
      }
    }

    return true;
  });

  /* ==========================================================
     ROLE SCOPE (Tech-Ed sees audit rows of their employees only)
     ========================================================== */

  const allowedEmpIds = await getAllowedEmpIds(appInstance, req.user);

  if (allowedEmpIds) {
    filteredRows = filteredRows.filter(function (row) {
      return allowedEmpIds.has(
        String(row.emp_id || "")
          .trim()
          .toLowerCase(),
      );
    });
  }

  /* ==========================================================
     SORT NEWEST FIRST
     ========================================================== */

  filteredRows.sort(function (a, b) {
    const dateA = new Date(a.changed_at || a.CREATEDTIME || 0).getTime();

    const dateB = new Date(b.changed_at || b.CREATEDTIME || 0).getTime();

    return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
  });

  /* ==========================================================
     LIMIT AFTER FILTERING
     ========================================================== */

  const limitedRows = filteredRows.slice(0, limit);

  const data = limitedRows.map(function (row) {
    return normalizeAuditResponse(row);
  });

  console.log("AUDIT MATCHING ROWS:", filteredRows.length);

  console.log("AUDIT RETURNING ROWS:", data.length);

  sendJson(res, 200, {
    success: true,
    count: data.length,
    total: filteredRows.length,
    data: data,
  });
}

/* ============================================================
   CREATE AUDIT RECORDS
   ============================================================ */

async function createAuditRecords(req, res) {
  const appInstance = catalyst.initialize(req);

  const datastore = appInstance.datastore();

  const body = await readBody(req);

  console.log("==============================================");
  console.log("AUDIT POST RECEIVED");
  console.log("BODY:", JSON.stringify(body));
  console.log("TABLE:", AUDIT_TABLE_ID);
  console.log("==============================================");

  let incoming;

  if (Array.isArray(body)) {
    incoming = body;
  } else if (Array.isArray(body.data)) {
    incoming = body.data;
  } else if (Array.isArray(body.rows)) {
    incoming = body.rows;
  } else if (Array.isArray(body.audits)) {
    incoming = body.audits;
  } else {
    incoming = [body];
  }

  if (!incoming.length) {
    sendJson(res, 400, {
      success: false,
      message: "No audit records were provided.",
    });

    return;
  }

  console.log("AUDIT INCOMING COUNT:", incoming.length);

  /* ==========================================================
     ROLE SCOPE: every audit row must belong to an employee the
     user may access. changed_by is always the real logged-in user.
     ========================================================== */

  const allowedEmpIds = await getAllowedEmpIds(appInstance, req.user);

  if (allowedEmpIds) {
    const blocked = incoming.some(function (item) {
      const id = String((item && (item.emp_id || item.empId)) || "")
        .trim()
        .toLowerCase();

      return !allowedEmpIds.has(id);
    });

    if (blocked) {
      sendJson(res, 403, {
        success: false,
        message:
          "One or more audit records belong to employees you cannot access.",
      });

      return;
    }
  }

  const rowsToInsert = [];
  const skipped = [];

  incoming.forEach(function (item, index) {
    try {
      const audit = normalizeAuditPayload(item);

      if (!audit.emp_id) {
        skipped.push({
          index: index,
          reason: "emp_id is required.",
        });

        return;
      }

      if (!audit.field_name) {
        skipped.push({
          index: index,
          emp_id: audit.emp_id,
          reason: "field_name is required.",
        });

        return;
      }

      rowsToInsert.push({
        emp_id: audit.emp_id,

        employee_name: audit.employee_name,

        field_name: audit.field_name,

        old_value: audit.old_value,

        new_value: audit.new_value,

        changed_by: req.user.name || audit.changed_by,

        changed_at: audit.changed_at,

        source: audit.source,

        batch_id: audit.batch_id,

        appraisal_year: audit.appraisal_year,
      });
    } catch (error) {
      skipped.push({
        index: index,
        reason: error.message || "Invalid audit record.",
      });
    }
  });

  if (!rowsToInsert.length) {
    sendJson(res, 400, {
      success: false,
      message: "No valid audit records were provided.",
      skipped: skipped,
    });

    return;
  }

  console.log("AUDIT VALID ROW COUNT:", rowsToInsert.length);

  console.log("AUDIT INSERT PAYLOAD:", JSON.stringify(rowsToInsert));

  const table = datastore.table(AUDIT_TABLE_ID);

  try {
    const insertedRows = await table.insertRows(rowsToInsert);

    console.log("AUDIT INSERT RESULT:", JSON.stringify(insertedRows));

    const insertedArray = Array.isArray(insertedRows) ? insertedRows : [];

    const data = insertedArray.map(function (row) {
      return normalizeAuditResponse(row);
    });

    console.log("AUDIT INSERTED COUNT:", data.length);

    sendJson(res, 200, {
      success: true,

      message: data.length + " audit record(s) created successfully.",

      count: data.length,

      data: data,

      skipped: skipped.length,

      skippedRecords: skipped,
    });
  } catch (error) {
    console.error("AUDIT DATASTORE INSERT ERROR:", error);

    sendJson(res, 500, {
      success: false,

      message: "Failed to insert audit records into Data Store.",

      error: error.message || String(error),

      skipped: skipped.length,

      skippedRecords: skipped,
    });
  }
}

/* ============================================================
   MAIN FUNCTION
   ============================================================ */

module.exports = async function (req, res) {
  const method = String(req.method || "GET").toUpperCase();

  console.log("==============================================");
  console.log("APPRAISAL AUDIT API");
  console.log("METHOD:", method);
  console.log("URL:", req.url);
  console.log("TABLE:", AUDIT_TABLE_ID);
  console.log("==============================================");

  try {
    if (method === "OPTIONS") {
      sendJson(res, 200, {
        success: true,
      });

      return;
    }

    const user = await authenticate(req, res);

    if (!user) {
      return;
    }

    if (method === "GET") {
      await getAuditHistory(req, res);

      return;
    }

    if (method === "POST") {
      await createAuditRecords(req, res);

      return;
    }

    sendJson(res, 405, {
      success: false,

      message: "Method " + method + " not allowed.",
    });
  } catch (error) {
    console.error("APPRAISAL AUDIT API ERROR:", error);

    sendJson(res, 500, {
      success: false,

      message: error.message || "Internal server error.",

      error: error.stack || String(error),
    });
  }
};
