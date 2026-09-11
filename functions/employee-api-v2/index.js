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

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, X-Requested-With",
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);

  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");

  res.end(JSON.stringify(payload));
}

function getRequestUrl(req) {
  return new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase() === "inactive"
    ? "Inactive"
    : "Active";
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function normalizePage(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

function getAllowedPayload(payload) {
  const result = {};

  ALLOWED_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) {
      result[field] = payload[field];
    }
  });

  return result;
}

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

function buildCounts(records) {
  let active = 0;
  let inactive = 0;

  records.forEach((record) => {
    if (normalizeStatus(record.status) === "Inactive") {
      inactive += 1;
    } else {
      active += 1;
    }
  });

  return {
    total: records.length,
    active,
    inactive,
  };
}

async function findEmployee(table, empId) {
  const records = await getAllEmployees(table);

  const normalizedEmpId = String(empId || "")
    .trim()
    .toLowerCase();

  return (
    records.find(
      (record) =>
        String(record.emp_id || "")
          .trim()
          .toLowerCase() === normalizedEmpId,
    ) || null
  );
}

async function handleGet(req, res, table) {
  const requestUrl = getRequestUrl(req);

  const page = normalizePage(requestUrl.searchParams.get("page"));

  const limit = normalizeLimit(requestUrl.searchParams.get("limit"));

  const search = String(requestUrl.searchParams.get("search") || "").trim();

  const status = String(requestUrl.searchParams.get("status") || "all")
    .trim()
    .toLowerCase();

  const empId = String(requestUrl.searchParams.get("emp_id") || "").trim();

  const allRecords = await getAllEmployees(table);

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

  const counts = buildCounts(allRecords);

  let filteredRecords = allRecords;

  if (status && status !== "all") {
    const requestedStatus = status === "inactive" ? "Inactive" : "Active";

    filteredRecords = filteredRecords.filter(
      (record) => normalizeStatus(record.status) === requestedStatus,
    );
  }

  if (search) {
    filteredRecords = filteredRecords.filter((record) =>
      matchesSearch(record, search),
    );
  }

  const totalCount = filteredRecords.length;

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const safePage = Math.min(page, totalPages);

  const startIndex = (safePage - 1) * limit;

  const pageData = filteredRecords.slice(startIndex, startIndex + limit);

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

async function handleUpdate(req, res, table) {
  const payload = req.body || {};

  const empId = String(payload.emp_id || "").trim();

  if (!empId) {
    sendJson(res, 400, {
      success: false,
      message: "emp_id is required.",
    });

    return;
  }

  const existingEmployee = await findEmployee(table, empId);

  if (!existingEmployee) {
    sendJson(res, 404, {
      success: false,
      message: `Employee ${empId} not found.`,
    });

    return;
  }

  const updateData = getAllowedPayload(payload);

  delete updateData.emp_id;

  if (updateData.status !== undefined) {
    updateData.status = normalizeStatus(updateData.status);
  }

  if (Object.keys(updateData).length === 0) {
    sendJson(res, 400, {
      success: false,
      message: "No valid employee fields were provided for update.",
    });

    return;
  }

  const updatedEmployee = await table.updateRow({
    ...existingEmployee,
    ...updateData,
  });

  sendJson(res, 200, {
    success: true,
    message: "Employee updated successfully.",
    data: updatedEmployee,
  });
}

async function handleDelete(req, res, table) {
  const requestUrl = getRequestUrl(req);

  const empId = String(requestUrl.searchParams.get("emp_id") || "").trim();

  if (!empId) {
    sendJson(res, 400, {
      success: false,
      message: "emp_id is required.",
    });

    return;
  }

  const existingEmployee = await findEmployee(table, empId);

  if (!existingEmployee) {
    sendJson(res, 404, {
      success: false,
      message: `Employee ${empId} not found.`,
    });

    return;
  }

  const updatedEmployee = await table.updateRow({
    ...existingEmployee,
    status: "Inactive",
  });

  sendJson(res, 200, {
    success: true,
    message: "Employee deactivated successfully.",
    data: updatedEmployee,
  });
}

module.exports = async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const app = catalyst.initialize(req);

    const table = app.datastore().table(EMPLOYEES_TABLE_ID);

    if (req.method === "GET") {
      await handleGet(req, res, table);
      return;
    }

    if (
      req.method === "PATCH" ||
      req.method === "PUT" ||
      req.method === "POST"
    ) {
      await handleUpdate(req, res, table);
      return;
    }

    if (req.method === "DELETE") {
      await handleDelete(req, res, table);
      return;
    }

    sendJson(res, 405, {
      success: false,
      message: `Method ${req.method} is not allowed.`,
    });
  } catch (error) {
    console.error("Employee API error:", error);

    sendJson(res, 500, {
      success: false,
      message: error?.message || "Employee API failed.",
    });
  }
};
