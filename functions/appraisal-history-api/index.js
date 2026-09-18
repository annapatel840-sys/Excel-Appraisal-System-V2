const catalyst = require("zcatalyst-sdk-node");

const PREVIOUS_APPRAISAL_TABLE_ID = "34995000000121471";

function setCorsHeaders(res) {
  // Do NOT set Access-Control-Allow-Origin here.
  // Catalyst automatically adds the allowed origin.
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization",
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

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
GET ALL PREVIOUS APPRAISAL RECORDS
============================================================ */

const getAllPreviousAppraisalRecords = async (table) => {
  let allRecords = [];
  let nextToken = undefined;
  let moreRecords = true;

  while (moreRecords) {
    const options = {
      maxRows: 200,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    const result = await table.getPagedRows(options);

    const rows = Array.isArray(result.data) ? result.data : [];

    allRecords = allRecords.concat(rows);

    moreRecords = result.more_records === true;
    nextToken = result.next_token;
  }

  return allRecords;
};

/* ============================================================
GET HISTORY
============================================================ */

const getHistory = async (table, empId) => {
  const allRecords = await getAllPreviousAppraisalRecords(table);

  return allRecords
    .filter((record) => String(record.emp_id || "").trim() === empId)
    .sort((a, b) =>
      String(b.appraisal_year || "").localeCompare(
        String(a.appraisal_year || ""),
      ),
    );
};

/* ============================================================
PATCH CURRENT-YEAR HISTORY
============================================================ */

const updateCurrentYearHistory = async (
  table,
  empId,
  appraisalYear,
  updates,
) => {
  const allRecords = await getAllPreviousAppraisalRecords(table);

  const record = allRecords.find(
    (item) =>
      String(item.emp_id || "").trim() === empId &&
      String(item.appraisal_year || "").trim() === appraisalYear,
  );

  if (!record) {
    throw new Error(
      `Previous_Appraisal record not found for employee ${empId} and appraisal year ${appraisalYear}.`,
    );
  }

  const allowedFields = [
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

  const updateData = {};

  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      updateData[field] = updates[field];
    }
  });

  if (!Object.keys(updateData).length) {
    throw new Error("No valid Previous_Appraisal fields were provided.");
  }

  updateData.ROWID = record.ROWID;

  const updatedRecord = await table.updateRow(updateData);

  return updatedRecord;
};

/* ============================================================
MAIN API
============================================================ */

module.exports = async (req, res) => {
  setCorsHeaders(res);

  /* ----------------------------------------------------------
  OPTIONS
  ---------------------------------------------------------- */

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  /* ----------------------------------------------------------
  INITIALIZE CATALYST
  ---------------------------------------------------------- */

  try {
    const app = catalyst.initialize(req);

    const table = app.datastore().table(PREVIOUS_APPRAISAL_TABLE_ID);

    const requestUrl = new URL(
      req.url,
      `https://${req.headers.host || "localhost"}`,
    );

    /* ========================================================
    GET
    ======================================================== */

    if (req.method === "GET") {
      const empId = String(requestUrl.searchParams.get("emp_id") || "").trim();

      if (!empId) {
        sendJson(res, 400, {
          success: false,
          message: "emp_id is required.",
        });
        return;
      }

      const history = await getHistory(table, empId);

      sendJson(res, 200, {
        success: true,
        emp_id: empId,
        count: history.length,
        data: history,
      });

      return;
    }

    /* ========================================================
    PATCH
    ======================================================== */

    if (req.method === "PATCH") {
      const body = await readRequestBody(req);

      const empId = String(body.emp_id || "").trim();

      const appraisalYear = String(body.appraisal_year || "").trim();

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

      const updates = {};

      const allowedFields = [
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

      allowedFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          updates[field] = body[field];
        }
      });

      if (!Object.keys(updates).length) {
        sendJson(res, 400, {
          success: false,
          message: "No valid Previous_Appraisal fields were provided.",
        });
        return;
      }

      console.log(
        "Updating Previous_Appraisal:",
        empId,
        appraisalYear,
        updates,
      );

      const updatedRecord = await updateCurrentYearHistory(
        table,
        empId,
        appraisalYear,
        updates,
      );

      sendJson(res, 200, {
        success: true,
        emp_id: empId,
        appraisal_year: appraisalYear,
        message: "Previous_Appraisal updated successfully.",
        data: updatedRecord,
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
    console.error("Appraisal history API error:", error);

    sendJson(res, 500, {
      success: false,
      message: error.message || "Failed to process appraisal history request.",
    });
  }
};
