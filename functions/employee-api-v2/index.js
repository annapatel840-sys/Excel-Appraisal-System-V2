// Import the Zoho Catalyst Node.js SDK.
const catalyst = require("zcatalyst-sdk-node");

// Store the Catalyst Data Store table ID in one place.
const EMPLOYEE_TABLE_ID = "34995000000121039";

// ------------------------------------------------------------
// CORS helper
// ------------------------------------------------------------
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization",
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

// ------------------------------------------------------------
// Send JSON response
// ------------------------------------------------------------
function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

// ------------------------------------------------------------
// Main Catalyst function
// ------------------------------------------------------------
module.exports = async (req, res) => {
  console.log("========================================");
  console.log("EMPLOYEE API REQUEST");
  console.log("METHOD:", req.method);
  console.log("URL:", req.url);
  console.log("========================================");

  // Always add CORS headers before doing anything else.
  setCorsHeaders(res);

  // ----------------------------------------------------------
  // CORS PREFLIGHT
  // ----------------------------------------------------------
  if (req.method === "OPTIONS") {
    console.log("OPTIONS preflight request received.");

    res.statusCode = 204;
    res.end();

    return;
  }

  try {
    // Initialize Catalyst.
    const app = catalyst.initialize(req);

    // Connect to employees Data Store table.
    const table = app.datastore().table(EMPLOYEE_TABLE_ID);

    // ==========================================================
    // GET EMPLOYEES
    // ==========================================================

    if (req.method === "GET") {
      // Parse query parameters directly from the request URL.
      const requestUrl = new URL(
        req.url,
        `https://${req.headers.host || "localhost"}`,
      );

      // Read requested page.
      const requestedPage = parseInt(
        requestUrl.searchParams.get("page") || "1",
        10,
      );

      // Read requested page size.
      const requestedLimit = parseInt(
        requestUrl.searchParams.get("limit") || "20",
        10,
      );

      // Keep page >= 1.
      const page = Math.max(1, requestedPage);

      // Keep limit between 1 and 100.
      const limit = Math.min(100, Math.max(1, requestedLimit));

      console.log("PAGE:", page);
      console.log("LIMIT:", limit);

      // --------------------------------------------------------
      // READ ALL EMPLOYEES
      // --------------------------------------------------------

      let allEmployees = [];
      let nextToken = undefined;
      let moreRecords = true;

      while (moreRecords) {
        const result = await table.getPagedRows({
          maxRows: 200,
          nextToken: nextToken,
        });

        const rows = result.data || [];

        allEmployees = allEmployees.concat(rows);

        moreRecords = result.more_records === true;
        nextToken = result.next_token;
      }

      console.log("TOTAL EMPLOYEES FROM DATA STORE:", allEmployees.length);

      // --------------------------------------------------------
      // COUNTS
      // --------------------------------------------------------

      const totalCount = allEmployees.length;

      const activeCount = allEmployees.filter(
        (employee) => String(employee.status || "").toLowerCase() === "active",
      ).length;

      const inactiveCount = allEmployees.filter(
        (employee) =>
          String(employee.status || "").toLowerCase() === "inactive",
      ).length;

      // --------------------------------------------------------
      // PAGINATION
      // --------------------------------------------------------

      const totalPages = Math.max(1, Math.ceil(totalCount / limit));

      const safePage = Math.min(page, totalPages);

      const startIndex = (safePage - 1) * limit;

      const endIndex = startIndex + limit;

      const pageEmployees = allEmployees.slice(startIndex, endIndex);

      console.log("START INDEX:", startIndex, "END INDEX:", endIndex);

      console.log("EMPLOYEES RETURNED:", pageEmployees.length);

      console.log(
        "EMPLOYEE IDS:",
        pageEmployees.map((employee) => employee.emp_id),
      );

      // --------------------------------------------------------
      // RESPONSE
      // --------------------------------------------------------

      sendJson(res, 200, {
        success: true,

        pagination: {
          page: safePage,
          limit: limit,
          totalCount: totalCount,
          totalPages: totalPages,
        },

        counts: {
          total: totalCount,
          active: activeCount,
          inactive: inactiveCount,
        },

        data: pageEmployees,
      });

      return;
    }

    // ==========================================================
    // UPDATE EMPLOYEE
    // ==========================================================

    if (req.method === "PUT") {
      let body = req.body;

      // Catalyst can provide the body as a string.
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch (error) {
          body = {};
        }
      }

      const empId = String(body?.emp_id || "").trim();

      // emp_id is mandatory.
      if (!empId) {
        sendJson(res, 400, {
          success: false,
          message: "emp_id is required.",
        });

        return;
      }

      // --------------------------------------------------------
      // ALLOWED FIELDS
      // --------------------------------------------------------

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
      ];

      const updateData = {
        emp_id: empId,
      };

      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          updateData[field] = body[field];
        }
      }

      // --------------------------------------------------------
      // FIND EMPLOYEE
      // --------------------------------------------------------

      let matchingEmployee = null;

      let nextToken = undefined;
      let moreRecords = true;

      while (moreRecords && !matchingEmployee) {
        const result = await table.getPagedRows({
          maxRows: 200,
          nextToken: nextToken,
        });

        const rows = result.data || [];

        matchingEmployee = rows.find(
          (employee) => String(employee.emp_id || "").trim() === empId,
        );

        moreRecords = result.more_records === true;

        nextToken = result.next_token;
      }

      // Employee not found.
      if (!matchingEmployee) {
        sendJson(res, 404, {
          success: false,
          message: `Employee ${empId} not found.`,
        });

        return;
      }

      // --------------------------------------------------------
      // ROW ID
      // --------------------------------------------------------

      const rowId = matchingEmployee.ROWID;

      if (!rowId) {
        throw new Error("Employee record does not contain a valid ROWID.");
      }

      // --------------------------------------------------------
      // UPDATE DATA STORE
      // --------------------------------------------------------

      await table.updateRow({
        ROWID: rowId,
        ...updateData,
      });

      // Create response object.
      const updatedEmployee = {
        ...matchingEmployee,
        ...updateData,
      };

      console.log("EMPLOYEE UPDATED:", empId);

      sendJson(res, 200, {
        success: true,
        message: "Employee updated successfully.",
        data: updatedEmployee,
      });

      return;
    }

    // ==========================================================
    // METHOD NOT ALLOWED
    // ==========================================================

    sendJson(res, 405, {
      success: false,
      message: `Method ${req.method} not allowed.`,
    });
  } catch (error) {
    console.error("Employee API Error:", error);

    sendJson(res, 500, {
      success: false,
      message: error?.message || "Failed to process employee request.",
    });
  }
};
