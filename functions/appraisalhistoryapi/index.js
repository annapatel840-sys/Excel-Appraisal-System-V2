"use strict";

/* ACCESS CONTROL: ./accessCore.js is a byte-for-byte copy of
   functions/accessapi/accessCore.js and MUST stay identical to it
   (every Catalyst function deploys separately). Edit the accessapi copy,
   then copy it here. See docs/ACCESS_SPEC.md. */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

const PAYROLL_DATA_TABLE_ID = "74008000000035326";
const APPRAISAL_CYCLE_TABLE_ID = "74008000000034190";

/*
 * CHANGED: name of the parent (employee) table that Payroll_Data.emp_id
 * points to. Used only to translate "EMP001" -> that row's ROWID, because a
 * foreign-key column stores the ROWID and not the text id.
 * If your table is named differently, change it here. If the lookup fails
 * for any reason, the function falls back to plain emp_id matching.
 */
const EMPLOYEE_TABLE_CANDIDATES = [
  process.env.EMPLOYEE_TABLE_NAME || "Employee_Master",
  "Employee_Master",
  "Employee",
  "Employees",
  "Employee_Details",
  "Employee_Data",
].filter((name, index, list) => name && list.indexOf(name) === index);

// Text columns on the employee table that may hold "EMP001".
const EMPLOYEE_ID_COLUMNS = ["emp_id", "employee_id", "emp_code"];

const DATASTORE_PAGE_SIZE = 200;

/* ============================================================
CORS
============================================================ */

function setCorsHeaders(res) {
  // DO NOT set Access-Control-Allow-Origin.
  // Catalyst automatically handles the allowed origin.

  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, X-Requested-With",
  );

  res.setHeader("Access-Control-Max-Age", "86400");
}

/* ============================================================
SEND JSON
============================================================ */

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/* ============================================================
READ REQUEST BODY
============================================================ */

const readRequestBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON request body."));
      }
    });

    req.on("error", reject);
  });
};

/* ============================================================
ALLOWED HISTORY FIELDS
============================================================ */

const ALLOWED_FIELDS = [
  "base_pay",
  "allocated_pb",
  "allocated_pb_installment",
  "performance_bonus",
  "performance_bonus_installment",
  "retention_bonus",
  "total_pb",
  "total_bonus",
  "hike_amount",
  "hike_pct",
  "promotion",
  "title",
  "target_performance_bonus",
  "new_ctc",
  "manager_rating",
  "rating",
];

/* ============================================================
ACCESS CONTROL (docs/ACCESS_SPEC.md)

GET   ?emp_id → view on appraisalSheet / detailScreen / dashboard, emp_id
               in scope; enforced: history columns of hidden fields removed.
PATCH        → edit on appraisalSheet / detailScreen, emp_id in scope and
               every changed history column editable (see HISTORY_FIELDS).
Dry run (ACCESS_ENFORCE != 'true'): legacy behaviour, refusals only logged.
============================================================ */

const READ_SCREENS = ["appraisalSheet", "detailScreen", "dashboard"];
const EDIT_SCREENS = ["appraisalSheet", "detailScreen"];

/*
 * Payroll_Data (history) column → Appraisal grid field whose access limit
 * applies. Same mapping the frontend uses to write history
 * (src/lib/appraisal-store.jsx REACT_TO_HISTORY_FIELD, and DetailScreen's
 * HISTORY_FIELD for new_ctc). Columns not listed (e.g. rating) only need
 * appraisalSheet edit.
 */
const HISTORY_FIELDS = {
  base_pay: "currentAnnualBasePay",
  allocated_pb: "targetPBAllocatedForMay",
  allocated_pb_installment: "pbInstallment",
  performance_bonus: "pbToBePaid",
  performance_bonus_installment: "newPBInstallment",
  retention_bonus: "newRB",
  total_pb: "totalOfPB",
  total_bonus: "totalBonus",
  hike_amount: "hikeAmount",
  hike_pct: "hikePct",
  promotion: "eligibleForPromotion",
  title: "newTitle",
  target_performance_bonus: "targetPBNextYear",
  new_ctc: "totalCTCWithRewards",
  manager_rating: "managerRating",
};

const FIELD_KIND = Object.fromEntries(
  access.START_CATALOG.filter((c) => c.type === "field").map((c) => [
    c.key,
    c.kind,
  ]),
);

async function checkAccess(req) {
  const userApp = catalyst.initialize(req);
  const adminApp = catalyst.initialize(req, { scope: "admin" });

  try {
    return await access.check(userApp, adminApp);
  } catch (error) {
    if (access.isEnforced()) throw error;
    // Dry run must never change legacy behaviour, even if access data is unreadable.
    console.log("ACCESS dry-run: access check failed:", error && error.message);
    return { dryRun: true, enforced: false, denied: error };
  }
}

function requireAnyScreen(a, keys, level) {
  const ok = keys.some((key) => {
    try {
      access.requireScreen(a, key, level);
      return true;
    } catch (error) {
      if (error instanceof access.HttpError) return false;
      throw error;
    }
  });

  if (!ok) {
    throw new access.HttpError(403, "You do not have access to this screen.");
  }
}

function requireInScope(a, empId, allowOwnRead = false) {
  const requestedId = String(empId || "").trim().toUpperCase();
  const signedInId = String(a?.user?.empId || "").trim().toUpperCase();

  // A Tech-Ed user may read their own historical appraisal record, even though
  // the team scope intentionally excludes the manager's own employee row.
  // This exception is for GET only; PATCH still requires normal team scope.
  if (allowOwnRead && requestedId && signedInId && requestedId === signedInId) {
    return;
  }

  if (!access.inScope(a, empId)) {
    throw new access.HttpError(
      403,
      "You do not have access to employee " + empId + ".",
    );
  }
}

/*
 * input / pair field → must be 'edit';
 * calc field (derived totals written with their inputs) → not hidden;
 * master / upload field → HR master data (employeeMaster edit);
 * unmapped column → appraisalSheet edit.
 */
function requireEditableHistoryColumns(a, columns) {
  const bad = [];
  let needsMaster = false;
  let needsSheet = false;

  columns.forEach((column) => {
    const key = HISTORY_FIELDS[column];

    if (!key) {
      needsSheet = true;
      return;
    }

    const kind = FIELD_KIND[key];
    const limit = a.fields && a.fields[key];

    if (kind === "calc") {
      if (limit === "hidden") bad.push(column);
      return;
    }

    if (kind === "master" || kind === "upload") {
      needsMaster = true;
      if (limit === "hidden") bad.push(column);
      return;
    }

    if (limit !== "edit") bad.push(column);
  });

  if (bad.length) {
    throw new access.HttpError(403, "You cannot edit: " + bad.join(", ") + ".");
  }

  if (needsSheet) access.requireScreen(a, "appraisalSheet", "edit");

  if (needsMaster) {
    try {
      access.requireScreen(a, "employeeMaster", "edit");
    } catch (error) {
      if (!(error instanceof access.HttpError)) throw error;
      throw new access.HttpError(
        403,
        "Only HR (Employee Master edit) can change: " +
          columns
            .filter((c) => {
              const kind = FIELD_KIND[HISTORY_FIELDS[c]];
              return kind === "master" || kind === "upload";
            })
            .join(", ") +
          ".",
      );
    }
  }
}

function shapeHistoryRow(a, row) {
  const out = {};

  Object.keys(row).forEach((column) => {
    const key = HISTORY_FIELDS[column];
    if (key && a.fields && a.fields[key] === "hidden") return;
    out[column] = row[column];
  });

  return out;
}

/* ============================================================
GET ALL PREVIOUS APPRAISAL RECORDS
============================================================ */

const getAllRowsFromTable = async (table) => {
  const allRows = [];
  let nextToken;
  while (true) {
    const options = { maxRows: DATASTORE_PAGE_SIZE };
    if (nextToken) options.nextToken = nextToken;
    const result = await table.getPagedRows(options);
    const rows = Array.isArray(result?.data) ? result.data : [];
    allRows.push(...rows);
    if (result?.more_records !== true || !result?.next_token) break;
    nextToken = result.next_token;
  }
  return allRows;
};

const cycleLookupId = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    return String(value.ROWID ?? value.rowid ?? value.id ?? value.value ?? "").trim();
  }
  return String(value).trim();
};

const withAppraisalCycleNames = async (app, records) => {
  try {
    const cycleTable = app.datastore().table(APPRAISAL_CYCLE_TABLE_ID);
    const cycleRows = await getAllRowsFromTable(cycleTable);
    const cycleNames = new Map();
    cycleRows.forEach((cycle) => {
      const id = cycleLookupId(cycle.ROWID ?? cycle.rowid ?? cycle.id);
      const name = String(
        cycle.cycle_name ?? cycle.cycleName ?? cycle.name ??
        cycle.appraisal_year ?? cycle.appraisalYear ?? ""
      ).trim();
      if (id && name) cycleNames.set(id, name);
    });

    return records.map((record) => {
      const raw = record.appraisal_cycle_name ?? record.appraisalCycleName ?? record.cycle_name;
      const id = cycleLookupId(raw);
      const resolvedName = cycleNames.get(id);
      return {
        ...record,
        appraisal_cycle_name: resolvedName || (typeof raw === "string" && !/^\\d+$/.test(raw) ? raw : ""),
      };
    });
  } catch (error) {
    console.error("Could not resolve appraisal cycle names:", error?.message || error);
    return records;
  }
};

const getAllPreviousAppraisalRecords = async (table) => {
  let allRecords = [];
  let nextToken = undefined;

  while (true) {
    const options = {
      maxRows: DATASTORE_PAGE_SIZE,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    console.log("Payroll_Data getPagedRows:", options);

    const result = await table.getPagedRows(options);

    const rows = Array.isArray(result?.data) ? result.data : [];

    console.log(
      "Payroll_Data page received:",
      rows.length,
      "more_records:",
      result?.more_records,
    );

    allRecords = allRecords.concat(rows);

    if (result?.more_records !== true) {
      break;
    }

    nextToken = result?.next_token;

    if (!nextToken) {
      console.warn(
        "Payroll_Data says more_records=true but no next_token was returned.",
      );
      break;
    }
  }

  console.log("Payroll_Data total records fetched:", allRecords.length);

  return allRecords;
};

/* ============================================================
GET HISTORY FOR EMPLOYEE
============================================================ */

// History imports may store either the bare employee ID (EMP001) or the
// display value ("EMP001 - Employee Name"). Match on the stable ID portion.
const normalizeHistoryEmpId = (value) =>
  String(value == null ? "" : value)
    .trim()
    .split(/\s+-\s+/, 1)[0]
    .trim()
    .toUpperCase();

// Catalyst foreign-key values can be returned as a ROWID string/number or
// as an object containing the referenced row. Normalize all supported shapes.
const historyEmployeeKeys = (value) => {
  const keys = new Set();
  const add = (candidate) => {
    if (candidate === null || candidate === undefined || candidate === "") return;
    if (typeof candidate === "string" || typeof candidate === "number") {
      const key = normalizeHistoryEmpId(candidate);
      if (key) keys.add(key);
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(add);
      return;
    }
    if (typeof candidate === "object") {
      ["ROWID", "rowid", "emp_id", "employee_id", "id", "value"].forEach((key) => {
        if (candidate[key] !== undefined) add(candidate[key]);
      });
    }
  };
  add(value);
  return keys;
};

/*
 * CHANGED (new): Payroll_Data.emp_id is a foreign key, so the stored value may
 * be the parent row's ROWID instead of "EMP001". Build the set of values that
 * identify this employee: the text id, plus the parent ROWID when it can be
 * looked up. Never throws — falls back to the text id alone.
 */
// Remembers which employee table/column worked so later calls try it first.
let knownEmployeeSource = null;
let employeeLookup = { table: "", column: "", error: "" };

const resolveEmpKeys = async (app, empId) => {
  const keys = new Set([normalizeHistoryEmpId(empId)]);

  const safeId = String(empId || "")
    .trim()
    .split(/\s+-\s+/, 1)[0]
    .trim()
    .replace(/'/g, "''");

  const attempts = [];

  if (knownEmployeeSource) attempts.push(knownEmployeeSource);

  EMPLOYEE_TABLE_CANDIDATES.forEach((table) => {
    EMPLOYEE_ID_COLUMNS.forEach((column) => {
      attempts.push({ table, column });
    });
  });

  const errors = [];
  employeeLookup = { table: "", column: "", error: "" };

  for (const attempt of attempts) {
    try {
      const result = await app
        .zcql()
        .executeZCQLQuery(
          "SELECT ROWID FROM " +
            attempt.table +
            " WHERE " +
            attempt.column +
            " = '" +
            safeId +
            "'",
        );

      const list = Array.isArray(result) ? result : [];

      list.forEach((item) => {
        const row =
          (item && item[attempt.table]) ||
          (item && Object.values(item)[0]) ||
          {};

        if (row.ROWID) {
          keys.add(normalizeHistoryEmpId(row.ROWID));
        }
      });

      if (list.length) {
        // Keep ROWIDs from every matching employee table. Payroll_Data.emp_id
        // may reference Employees or Employee_Master depending on how the FK
        // was configured; stopping at the first match can hide valid history.
        knownEmployeeSource = attempt;
        employeeLookup = {
          table: employeeLookup.table
            ? employeeLookup.table + ", " + attempt.table
            : attempt.table,
          column: employeeLookup.column
            ? employeeLookup.column + ", " + attempt.column
            : attempt.column,
          error: "",
        };
      }
    } catch (error) {
      errors.push(
        attempt.table +
          "." +
          attempt.column +
          ": " +
          String((error && error.message) || error).slice(0, 80),
      );
    }
  }

  if (!employeeLookup.table) {
    employeeLookup.error =
      errors.slice(0, 6).join(" | ") || "no employee row matched " + safeId;
    console.warn("Employee ROWID lookup failed:", employeeLookup.error);
  }

  console.log(
    "History emp keys for",
    empId,
    ":",
    Array.from(keys),
    "via",
    employeeLookup.table || "(text id only)",
  );

  return keys;
};

/*
 * CHANGED (new): older payroll rows may only have the original Payroll_Data
 * column names. Fill the names the grid reads from them when the history
 * columns are empty. Existing values are never overwritten.
 */
const withHistoryAliases = (record) => {
  const pick = (primary, fallback) =>
    record[primary] !== undefined &&
    record[primary] !== null &&
    record[primary] !== ""
      ? record[primary]
      : record[fallback];

  return {
    ...record,
    appraisal_year: pick("appraisal_year", "fy_year"),
    base_pay: pick("base_pay", "current_annual_base_pay"),
    new_ctc: pick("new_ctc", "total_CTC_with_rewards"),
    target_performance_bonus: pick("target_performance_bonus", "target_performance_agreed"),
    new_base_pay: record.new_base_pay,
    joining_bonus: record.joining_bonus,
    performance_bonus: record.performance_bonus,
    retention_bonus: record.retention_bonus,
    total_bonus: record.total_bonus,
    hike_amount: record.hike_amount,
    hike_pct: record.hike_pct,
  };
};

const countBy = (records, fn) => {
  const counts = {};

  records.forEach((record) => {
    const value = fn(record);
    const key = String(value === null || value === undefined ? "" : value);
    counts[key] = (counts[key] || 0) + 1;
  });

  return counts;
};

/*
 * `diag` (optional object) is filled with what the table really contains, so
 * a missing-history problem can be read straight from the normal response
 * (meta field, HR / dry-run only). Safe to delete once history works.
 */
const getHistory = async (app, table, empId, diag) => {
  const allRecords = await getAllPreviousAppraisalRecords(table);
  const wantedKeys = await resolveEmpKeys(app, empId);

  const history = allRecords
    .filter((record) => {
      const recordKeys = historyEmployeeKeys(record.emp_id);
      return Array.from(recordKeys).some((key) => wantedKeys.has(key));
    })
    .map(withHistoryAliases)
    .sort((a, b) => {
      const yearOrder = (value) => {
        const year = String(value || "").trim();
        const fiscal = year.match(/(\d{4})\s*[-/–]\s*(\d{2,4})/);
        if (fiscal) return Number(fiscal[2].length === 2 ? `20${fiscal[2]}` : fiscal[2]);
        const full = year.match(/(?:19|20)\d{2}/);
        if (full) return Number(full[0]);
        const short = year.match(/(?:Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb|Mar)[-\s](\d{2})/i);
        return short ? Number(`20${short[1]}`) : 0;
      };
      return yearOrder(b.appraisal_year) - yearOrder(a.appraisal_year) ||
        String(b.appraisal_year || "").localeCompare(String(a.appraisal_year || ""));
    });

  console.log("History records for", empId, ":", history.length);

  if (diag) {
    diag.keysTriedForMatching = Array.from(wantedKeys);
    diag.employeeLookup = employeeLookup;
    diag.totalRowsInPayrollData = allRecords.length;
    diag.matchedRows = history.length;
    diag.matchedYears = history.map((r) => r.appraisal_year);
    diag.columnsInFirstRow = allRecords[0] ? Object.keys(allRecords[0]) : [];
    diag.rowsPerEmpIdValue = Object.fromEntries(
      Object.entries(countBy(allRecords, (r) => r.emp_id)).slice(0, 40),
    );
    diag.rowsPerAppraisalYear = countBy(allRecords, (r) => r.appraisal_year);
    diag.rowsPerFyYear = countBy(allRecords, (r) => r.fy_year);
  }

  return history;
};

/* ============================================================
BUILD UPDATE DATA
============================================================ */

const buildUpdateData = (body) => {
  const updateData = {};

  ALLOWED_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updateData[field] = body[field];
    }
  });

  return updateData;
};

/* ============================================================
FIND CURRENT YEAR RECORD
============================================================ */

const findHistoryRecord = async (app, table, empId, appraisalYear) => {
  const allRecords = await getAllPreviousAppraisalRecords(table);

  // CHANGED: match on the same employee keys as GET (text id or ROWID).
  const wantedKeys = await resolveEmpKeys(app, empId);

  return allRecords.find(
    (item) =>
      wantedKeys.has(normalizeHistoryEmpId(item.emp_id)) &&
      String(item.appraisal_year || item.fy_year || "").trim() ===
        appraisalYear,
  );
};

/* ============================================================
UPDATE EXISTING HISTORY
============================================================ */

const updateExistingHistory = async (table, record, updateData) => {
  const payload = {
    ...updateData,
    ROWID: record.ROWID,
  };

  console.log("Payroll_Data updateRow payload:", JSON.stringify(payload));

  const result = await table.updateRow(payload);

  console.log("Payroll_Data updateRow result:", JSON.stringify(result));

  return result;
};

/* ============================================================
CREATE HISTORY RECORD IF MISSING
============================================================ */

const createHistoryRecord = async (table, empId, appraisalYear, updateData) => {
  const payload = {
    emp_id: empId,
    appraisal_year: appraisalYear,
    ...updateData,
  };

  console.log(
    "Payroll_Data insertRows payload:",
    JSON.stringify(payload),
  );

  const result = await table.insertRows([payload]);

  console.log("Payroll_Data insertRows result:", JSON.stringify(result));

  return Array.isArray(result) ? result[0] : result;
};

/* ============================================================
MAIN API
============================================================ */

module.exports = async (req, res) => {
  setCorsHeaders(res);

  console.log("================================================");
  console.log("APPRAISAL HISTORY API REQUEST");
  console.log("METHOD:", req.method);
  console.log("URL:", req.url);
  console.log("TABLE ID:", PAYROLL_DATA_TABLE_ID);
  console.log("================================================");

  /* ----------------------------------------------------------
  OPTIONS
  ---------------------------------------------------------- */

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    /* --------------------------------------------------------
    ACCESS (enforced → 401/403; dry run → never refuses)
    -------------------------------------------------------- */

    const a = await checkAccess(req);

    /* --------------------------------------------------------
    INITIALIZE CATALYST
    -------------------------------------------------------- */

    const app = catalyst.initialize(req);

    const datastore = app.datastore();

    const table = datastore.table(PAYROLL_DATA_TABLE_ID);

    const requestUrl = new URL(
      req.url,
      `https://${req.headers.host || "localhost"}`,
    );

    /* ========================================================
    GET
    ======================================================== */

    if (req.method === "GET") {
      const empId = String(requestUrl.searchParams.get("emp_id") || "").trim();

      console.log("GET emp_id:", empId);

      access.guard(a, () => requireAnyScreen(a, READ_SCREENS, "view"));

      if (!empId) {
        sendJson(res, 400, {
          success: false,
          message: "emp_id is required.",
        });
        return;
      }

      access.guard(a, () => requireInScope(a, empId, true));

      // HR / dry-run only: include what the table contains (see getHistory).
      const diag = !a.enforced || a.role === "hr" ? {} : null;

      const history = await getHistory(app, table, empId, diag);
      const namedHistory = await withAppraisalCycleNames(app, history);

      const data = a.enforced
        ? namedHistory.map((row) => shapeHistoryRow(a, row))
        : namedHistory;

      sendJson(res, 200, {
        success: true,
        emp_id: empId,
        count: data.length,
        data: data,
        ...(diag ? { meta: diag } : {}),
      });

      return;
    }

    /* ========================================================
    PATCH
    ======================================================== */

    if (req.method === "PATCH") {
      access.guard(a, () => requireAnyScreen(a, EDIT_SCREENS, "edit"));

      const body = await readRequestBody(req);

      console.log("PATCH BODY:", JSON.stringify(body));

      const empId = String(body.emp_id || "").trim();

      const appraisalYear = String(body.appraisal_year || "").trim();

      console.log("PATCH emp_id:", empId);
      console.log("PATCH appraisal_year:", appraisalYear);

      if (!empId) {
        sendJson(res, 400, {
          success: false,
          message: "emp_id is required.",
        });
        return;
      }

      if (!appraisalYear) {
        sendJson(res, 400, {
          success: false,
          message: "appraisal_year is required.",
        });
        return;
      }

      /* ------------------------------------------------------
      ONLY ALLOW 2025 AND 2026 HISTORY
      ------------------------------------------------------ */

      const normalizedYear = appraisalYear.toLowerCase().trim();

      const is2025 =
        normalizedYear.includes("2025") || normalizedYear.includes("apr-25");

      const is2026 =
        normalizedYear.includes("2026") || normalizedYear.includes("apr-26");

      if (!is2025 && !is2026) {
        sendJson(res, 400, {
          success: false,
          message: "Only 2025 and 2026 appraisal history can be updated.",
        });
        return;
      }

      /* ------------------------------------------------------
      BUILD UPDATE DATA
      ------------------------------------------------------ */

      const updateData = buildUpdateData(body);

      console.log("VALID HISTORY UPDATE DATA:", JSON.stringify(updateData));

      if (!Object.keys(updateData).length) {
        sendJson(res, 400, {
          success: false,
          message: "No valid Payroll_Data fields were provided.",
        });
        return;
      }

      access.guard(a, () => {
        requireInScope(a, empId);
        requireEditableHistoryColumns(a, Object.keys(updateData));
      });

      /* ------------------------------------------------------
      FIND EXISTING RECORD
      ------------------------------------------------------ */

      console.log("Searching Payroll_Data for:", empId, appraisalYear);

      const existingRecord = await findHistoryRecord(
        app,
        table,
        empId,
        appraisalYear,
      );

      /* ------------------------------------------------------
      UPDATE EXISTING RECORD
      ------------------------------------------------------ */

      if (existingRecord) {
        console.log(
          "Existing Payroll_Data record found:",
          existingRecord.ROWID,
        );

        const updatedRecord = await updateExistingHistory(
          table,
          existingRecord,
          updateData,
        );

        sendJson(res, 200, {
          success: true,
          action: "updated",
          emp_id: empId,
          appraisal_year: appraisalYear,
          message: "Payroll_Data updated successfully.",
          data: updatedRecord,
        });

        return;
      }

      /* ------------------------------------------------------
      CREATE RECORD IF IT DOES NOT EXIST
      ------------------------------------------------------ */

      console.log("No Payroll_Data record found.");

      console.log("Creating new history record for:", empId, appraisalYear);

      const createdRecord = await createHistoryRecord(
        table,
        empId,
        appraisalYear,
        updateData,
      );

      sendJson(res, 200, {
        success: true,
        action: "created",
        emp_id: empId,
        appraisal_year: appraisalYear,
        message: "Payroll_Data history created successfully.",
        data: createdRecord,
      });

      return;
    }

    /* ========================================================
    OTHER METHODS
    ======================================================== */

    sendJson(res, 405, {
      success: false,
      message: "Only GET, PATCH and OPTIONS methods are allowed.",
    });
  } catch (error) {
    if (error instanceof access.HttpError) {
      sendJson(res, error.status || 403, {
        success: false,
        message: error.message,
        enforced: true,
      });
      return;
    }

    console.error("================================================");

    console.error("APPRAISAL HISTORY API ERROR");

    console.error("MESSAGE:", error?.message);

    console.error("STACK:", error?.stack);

    console.error(
      "FULL ERROR:",
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
    );

    console.error("================================================");

    sendJson(res, 500, {
      success: false,
      message: error?.message || "Failed to process appraisal history request.",
    });
  }
};