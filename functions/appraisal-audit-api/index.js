"use strict";

const catalyst = require("zcatalyst-sdk-node");

const AUDIT_TABLE_ID = "34995000000121862";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/* ============================================================
   RESPONSE
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
   QUERY PARAMETERS
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

  const queryString = url.slice(queryIndex + 1);

  const params = new URLSearchParams(queryString);

  const result = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

/* ============================================================
   REQUEST BODY
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

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(1, Math.floor(number));
}

/* ============================================================
   CATALYST DATETIME
   ============================================================ */

function normalizeDateTime(value) {
  /*
   * Catalyst Data Store datetime columns expect:
   *
   * YYYY-MM-DD HH:mm:ss
   *
   * Example:
   * 2026-09-17 10:00:00
   */

  if (!value) {
    const now = new Date();

    return formatDateTime(now);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid changed_at datetime: " + String(value));
  }

  return formatDateTime(date);
}

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

/* ============================================================
   NORMALIZE AUDIT RESPONSE
   ============================================================ */

function normalizeAuditResponse(row) {
  const audit = row || {};

  return {
    ROWID: audit.ROWID ?? audit.rowid ?? "",

    emp_id: audit.emp_id ?? "",

    employee_name: audit.employee_name ?? "",

    field_name: audit.field_name ?? "",

    old_value: audit.old_value ?? "",

    new_value: audit.new_value ?? "",

    changed_by: audit.changed_by ?? "",

    changed_at: audit.changed_at ?? "",

    source: audit.source ?? "",

    batch_id: audit.batch_id ?? "",

    appraisal_year: audit.appraisal_year ?? "",

    CREATEDTIME: audit.CREATEDTIME ?? "",

    MODIFIEDTIME: audit.MODIFIEDTIME ?? "",
  };
}

/* ============================================================
   NORMALIZE AUDIT INPUT
   ============================================================ */

function normalizeAuditPayload(item) {
  const row = item || {};

  return {
    emp_id: String(row.emp_id ?? row.empId ?? "").trim(),

    employee_name: String(
      row.employee_name ?? row.employeeName ?? row.name ?? "",
    ).trim(),

    field_name: String(
      row.field_name ?? row.fieldName ?? row.field ?? "",
    ).trim(),

    old_value: String(row.old_value ?? row.oldValue ?? row.from ?? ""),

    new_value: String(row.new_value ?? row.newValue ?? row.to ?? ""),

    changed_by: String(
      row.changed_by ?? row.changedBy ?? row.user ?? "",
    ).trim(),

    changed_at: normalizeDateTime(
      row.changed_at ?? row.changedAt ?? row.at ?? new Date(),
    ),

    source: String(row.source ?? "manual").trim(),

    batch_id: String(row.batch_id ?? row.batchId ?? "").trim(),

    appraisal_year: String(
      row.appraisal_year ?? row.appraisalYear ?? "Apr-26",
    ).trim(),
  };
}

/* ============================================================
   GET AUDIT HISTORY
   ============================================================ */

async function getAuditHistory(req, res) {
  const appInstance = catalyst.initialize(req);

  const zcql = appInstance.zcql();

  const params = getQueryParams(req);

  const empId = String(params.emp_id ?? params.empId ?? "").trim();

  const appraisalYear = String(
    params.appraisal_year ?? params.appraisalYear ?? "",
  ).trim();

  const requestedLimit = getPositiveInteger(params.limit, DEFAULT_LIMIT);

  const limit = Math.min(requestedLimit, MAX_LIMIT);

  let query = `
    SELECT *
    FROM Appraisal_Audit
  `;

  const conditions = [];

  if (empId) {
    conditions.push("emp_id = '" + empId.replace(/'/g, "''") + "'");
  }

  if (appraisalYear) {
    conditions.push(
      "appraisal_year = '" + appraisalYear.replace(/'/g, "''") + "'",
    );
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY changed_at DESC LIMIT " + limit;

  console.log("AUDIT GET QUERY:", query);

  const result = await zcql.executeZCQLQuery(query);

  const data = (result || []).map(function (item) {
    const row = item?.Appraisal_Audit ?? item?.appraisal_audit ?? item;

    return normalizeAuditResponse(row);
  });

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
  const appInstance = catalyst.initialize(req);

  const datastore = appInstance.datastore();

  const body = await readBody(req);

  console.log("==============================================");

  console.log("AUDIT POST REQUEST");

  console.log("METHOD:", req.method);

  console.log("BODY:", JSON.stringify(body));

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

        changed_by: audit.changed_by,

        changed_at: audit.changed_at,

        source: audit.source,

        batch_id: audit.batch_id,

        appraisal_year: audit.appraisal_year,
      });
    } catch (error) {
      skipped.push({
        index: index,

        reason: error?.message || "Invalid audit record.",
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

  const table = datastore.table(AUDIT_TABLE_ID);

  const insertedRows = await table.insertRows(rowsToInsert);

  console.log("AUDIT INSERT RESULT:", JSON.stringify(insertedRows));

  const data = (insertedRows || []).map(function (row) {
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
   MAIN CATALYST ENTRY
   ============================================================ */

module.exports = async function (req, res) {
  const method = String(req.method || "GET").toUpperCase();

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

      message: error?.message || "Internal server error.",

      error: error?.stack || String(error),
    });
  }
};
