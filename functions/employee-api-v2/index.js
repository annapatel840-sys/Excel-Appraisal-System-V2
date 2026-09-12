const catalyst = require("zcatalyst-sdk-node");

const EMPLOYEES_TABLE_ID = "34995000000121039";

const DATASTORE_PAGE_SIZE = 200;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const ALLOWED_FIELDS = [
  "emp_id",
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

const SEARCH_FIELDS = [
  "emp_id",
  "name",
  "designation",
  "department",
  "reporting_manager",
  "comp_manager",
  "appraiser_tech_ed",
  "manager",
  "manager_email_id",
  "super_man_email_id",
];

/* ============================================================
   CORS
   ============================================================ */

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, X-Requested-With",
  );

  res.setHeader("Access-Control-Max-Age", "86400");

  res.setHeader("Vary", "Origin");
}

/* ============================================================
   JSON RESPONSE
   ============================================================ */

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);

  res.statusCode = statusCode;

  res.setHeader("Content-Type", "application/json");

  res.end(JSON.stringify(payload));
}

/* ============================================================
   REQUEST URL
   ============================================================ */

function getRequestUrl(req) {
  return new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
}

/* ============================================================
   NORMALIZE STATUS
   ============================================================ */

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "inactive"
    ? "Inactive"
    : "Active";
}

/* ============================================================
   NORMALIZE LIMIT
   ============================================================ */

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

/* ============================================================
   NORMALIZE PAGE
   ============================================================ */

function normalizePage(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

/* ============================================================
   SEARCH
   ============================================================ */

function matchesSearch(record, search) {
  const normalizedSearch = String(search || "")
    .trim()
    .toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return SEARCH_FIELDS.some((field) =>
    String(record[field] ?? "")
      .toLowerCase()
      .includes(normalizedSearch),
  );
}

/* ============================================================
   GET ALL EMPLOYEES FROM DATA STORE
   ============================================================ */

async function getAllEmployees(table) {
  const records = [];

  let nextToken;
  let moreRecords = true;

  while (moreRecords) {
    const options = {
      maxRows: DATASTORE_PAGE_SIZE,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    const result = await table.getPagedRows(options);

    const rows = Array.isArray(result?.data) ? result.data : [];

    records.push(...rows);

    moreRecords = result?.more_records === true;

    nextToken = result?.next_token;
  }

  return records;
}

/* ============================================================
   COUNTS
   ============================================================ */

function buildCounts(records) {
  let active = 0;
  let inactive = 0;

  records.forEach((record) => {
    if (normalizeStatus(record.status) === "Inactive") {
      inactive++;
    } else {
      active++;
    }
  });

  return {
    total: records.length,
    active,
    inactive,
  };
}

/* ============================================================
   GET EMPLOYEES
   ============================================================ */

async function handleGet(req, res, table) {
  const requestUrl = getRequestUrl(req);

  const page = normalizePage(requestUrl.searchParams.get("page"));

  const limit = normalizeLimit(requestUrl.searchParams.get("limit"));

  const search = String(requestUrl.searchParams.get("search") || "").trim();

  const status = String(requestUrl.searchParams.get("status") || "all")
    .trim()
    .toLowerCase();

  const empId = String(requestUrl.searchParams.get("emp_id") || "").trim();

  /* ----------------------------------------------------------
     Fetch employees
     ---------------------------------------------------------- */

  const allRecords = await getAllEmployees(table);

  /* ----------------------------------------------------------
     Fetch one employee by EMP ID
     ---------------------------------------------------------- */

  if (empId) {
    const employee = allRecords.find(
      (record) =>
        String(record.emp_id || "")
          .trim()
          .toLowerCase() === empId.toLowerCase(),
    );

    if (!employee) {
      sendJson(res, 404, {
        success: false,
        message: `Employee ${empId} not found.`,
      });

      return;
    }

    sendJson(res, 200, {
      success: true,
      data: employee,
    });

    return;
  }

  /* ----------------------------------------------------------
     Overall counts
     ---------------------------------------------------------- */

  const counts = buildCounts(allRecords);

  /* ----------------------------------------------------------
     Status filtering
     ---------------------------------------------------------- */

  let filteredRecords = allRecords;

  if (status && status !== "all") {
    const requestedStatus = status === "inactive" ? "Inactive" : "Active";

    filteredRecords = filteredRecords.filter(
      (record) => normalizeStatus(record.status) === requestedStatus,
    );
  }

  /* ----------------------------------------------------------
     Search filtering
     ---------------------------------------------------------- */

  if (search) {
    filteredRecords = filteredRecords.filter((record) =>
      matchesSearch(record, search),
    );
  }

  /* ----------------------------------------------------------
     Pagination
     ---------------------------------------------------------- */

  const totalCount = filteredRecords.length;

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const safePage = Math.min(page, totalPages);

  const startIndex = (safePage - 1) * limit;

  const pageData = filteredRecords.slice(startIndex, startIndex + limit);

  /* ----------------------------------------------------------
     Response
     ---------------------------------------------------------- */

  sendJson(res, 200, {
    success: true,

    data: pageData,

    pagination: {
      page: safePage,
      limit,
      totalCount,
      totalPages,
    },

    counts,

    filters: {
      search,
      status,
    },
  });
}

/* ============================================================
   MAIN HANDLER
   ============================================================ */

module.exports = async (req, res) => {
  try {
    setCorsHeaders(res);

    /* --------------------------------------------------------
       OPTIONS - CORS PREFLIGHT
       -------------------------------------------------------- */

    if (String(req.method || "").toUpperCase() === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    /* --------------------------------------------------------
       GET ONLY
       -------------------------------------------------------- */

    if (String(req.method || "").toUpperCase() !== "GET") {
      sendJson(res, 405, {
        success: false,
        message: "Method Not Allowed. Use GET.",
      });

      return;
    }

    /* --------------------------------------------------------
       Catalyst initialization
       -------------------------------------------------------- */

    const app = catalyst.initialize(req);

    const datastore = app.datastore();

    const table = datastore.table(EMPLOYEES_TABLE_ID);

    /* --------------------------------------------------------
       GET
       -------------------------------------------------------- */

    await handleGet(req, res, table);
  } catch (error) {
    console.error("employee-api-v2 error:", error);

    sendJson(res, 500, {
      success: false,
      message: error?.message || "Internal Server Error",
    });
  }
};
