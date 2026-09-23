"use strict";

const catalyst = require("zcatalyst-sdk-node");

const AUDIT_TABLE_ID = "71873000000021235";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

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

  var url = String(req.url || "");
  var queryIndex = url.indexOf("?");

  if (queryIndex === -1) {
    return {};
  }

  var queryString = url.substring(queryIndex + 1);
  var params = new URLSearchParams(queryString);
  var result = {};

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
    var body = "";

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
  var number = Number(value);

  if (!isFinite(number)) {
    return fallback;
  }

  number = Math.floor(number);

  if (number < 1) {
    return 1;
  }

  return number;
}

/* ============================================================
   DATETIME
   ============================================================ */

function formatDateTime(date) {
  var year = date.getFullYear();

  var month = String(date.getMonth() + 1).padStart(2, "0");

  var day = String(date.getDate()).padStart(2, "0");

  var hours = String(date.getHours()).padStart(2, "0");

  var minutes = String(date.getMinutes()).padStart(2, "0");

  var seconds = String(date.getSeconds()).padStart(2, "0");

  return (
    year + "-" + month + "-" + day + " " + hours + ":" + minutes + ":" + seconds
  );
}

function normalizeDateTime(value) {
  if (!value) {
    return formatDateTime(new Date());
  }

  var date = new Date(value);

  if (isNaN(date.getTime())) {
    throw new Error("Invalid changed_at datetime: " + String(value));
  }

  return formatDateTime(date);
}

/* ============================================================
   NORMALIZE AUDIT RESPONSE
   ============================================================ */

function normalizeAuditResponse(row) {
  if (!row) {
    row = {};
  }

  return {
    ROWID: row.ROWID || row.rowid || "",

    emp_id: row.emp_id || "",

    employee_name: row.employee_name || "",

    field_name: row.field_name || "",

    old_value: row.old_value || "",

    new_value: row.new_value || "",

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
  var row = item || {};

  var empId = row.emp_id || row.empId || "";

  var employeeName = row.employee_name || row.employeeName || row.name || "";

  var fieldName = row.field_name || row.fieldName || row.field || "";

  var oldValue = row.old_value || row.oldValue || row.from || "";

  var newValue = row.new_value || row.newValue || row.to || "";

  var changedBy = row.changed_by || row.changedBy || row.user || "";

  var changedAt = row.changed_at || row.changedAt || row.at || "";

  var source = row.source || "manual";

  var batchId = row.batch_id || row.batchId || "";

  var appraisalYear = row.appraisal_year || row.appraisalYear || "Apr-26";

  return {
    emp_id: String(empId).trim(),

    employee_name: String(employeeName).trim(),

    field_name: String(fieldName).trim(),

    old_value: String(oldValue),

    new_value: String(newValue),

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
  var appInstance = catalyst.initialize(req);

  var datastore = appInstance.datastore();

  var table = datastore.table(AUDIT_TABLE_ID);

  var params = getQueryParams(req);

  var empId = String(params.emp_id || params.empId || "").trim();

  var appraisalYear = String(
    params.appraisal_year || params.appraisalYear || "",
  ).trim();

  var requestedLimit = getPositiveInteger(params.limit, DEFAULT_LIMIT);

  var limit = Math.min(requestedLimit, MAX_LIMIT);

  console.log("AUDIT GET STARTED");

  console.log("AUDIT TABLE:", AUDIT_TABLE_ID);

  console.log("AUDIT EMP ID:", empId || "ALL");

  console.log("AUDIT YEAR:", appraisalYear || "ALL");

  console.log("AUDIT LIMIT:", limit);

  /* ----------------------------------------------------------
     GET ALL AUDIT ROWS FROM DATA STORE
     ---------------------------------------------------------- */

  var allRows = await table.getAllRows();

  if (!Array.isArray(allRows)) {
    allRows = [];
  }

  console.log("AUDIT TOTAL ROWS:", allRows.length);

  /* ----------------------------------------------------------
     FILTER
     ---------------------------------------------------------- */

  var filteredRows = allRows.filter(function (row) {
    if (empId) {
      var rowEmpId = String(row.emp_id || "").trim();

      if (rowEmpId !== empId) {
        return false;
      }
    }

    if (appraisalYear) {
      var rowYear = String(row.appraisal_year || "").trim();

      if (rowYear !== appraisalYear) {
        return false;
      }
    }

    return true;
  });

  /* ----------------------------------------------------------
     SORT NEWEST FIRST
     ---------------------------------------------------------- */

  filteredRows.sort(function (a, b) {
    var dateA = new Date(a.changed_at || a.CREATEDTIME || 0).getTime();

    var dateB = new Date(b.changed_at || b.CREATEDTIME || 0).getTime();

    if (isNaN(dateA)) {
      dateA = 0;
    }

    if (isNaN(dateB)) {
      dateB = 0;
    }

    return dateB - dateA;
  });

  /* ----------------------------------------------------------
     LIMIT
     ---------------------------------------------------------- */

  var limitedRows = filteredRows.slice(0, limit);

  /* ----------------------------------------------------------
     NORMALIZE
     ---------------------------------------------------------- */

  var data = limitedRows.map(function (row) {
    return normalizeAuditResponse(row);
  });

  console.log("AUDIT FILTERED ROWS:", filteredRows.length);

  console.log("AUDIT RETURNED ROWS:", data.length);

  sendJson(res, 200, {
    success: true,
    count: data.length,
    data: data,
  });
}

/* ============================================================
   CREATE AUDIT RECORDS
   ============================================================ */

async function createAuditRecords(req, res) {
  var appInstance = catalyst.initialize(req);

  var datastore = appInstance.datastore();

  var body = await readBody(req);

  console.log("AUDIT POST BODY:", JSON.stringify(body));

  var incoming;

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

  var rowsToInsert = [];
  var skipped = [];

  incoming.forEach(function (item, index) {
    try {
      var audit = normalizeAuditPayload(item);

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

        changed_by: audit.changed_by,

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

  console.log("AUDIT INSERT ROWS:", JSON.stringify(rowsToInsert));

  var table = datastore.table(AUDIT_TABLE_ID);

  var insertedRows = await table.insertRows(rowsToInsert);

  console.log("AUDIT INSERT RESULT:", JSON.stringify(insertedRows));

  if (!Array.isArray(insertedRows)) {
    insertedRows = [];
  }

  var data = insertedRows.map(function (row) {
    return normalizeAuditResponse(row);
  });

  sendJson(res, 200, {
    success: true,

    message: data.length + " audit record(s) created successfully.",

    count: data.length,

    data: data,

    skipped: skipped.length,

    skippedRecords: skipped,
  });
}

/* ============================================================
   MAIN FUNCTION
   ============================================================ */

module.exports = async function (req, res) {
  var method = String(req.method || "GET").toUpperCase();

  console.log("==============================================");

  console.log("APPRAISAL AUDIT API");

  console.log("METHOD:", method);

  console.log("URL:", req.url);

  console.log("==============================================");

  try {
    if (method === "OPTIONS") {
      sendJson(res, 200, {
        success: true,
      });

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
