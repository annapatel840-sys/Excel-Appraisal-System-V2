const catalyst = require("zcatalyst-sdk-node");

const PREVIOUS_APPRAISAL_TABLE_ID = "34995000000121471";

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
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

module.exports = async (req, res) => {
  setCorsHeaders(res);

  // ------------------------------------------------------------
  // OPTIONS
  // ------------------------------------------------------------

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // ------------------------------------------------------------
  // GET
  // ------------------------------------------------------------

  if (req.method !== "GET") {
    sendJson(res, 405, {
      success: false,
      message: "Only GET method is allowed.",
    });
    return;
  }

  try {
    const app = catalyst.initialize(req);

    const table = app.datastore().table(PREVIOUS_APPRAISAL_TABLE_ID);

    const requestUrl = new URL(
      req.url,
      `https://${req.headers.host || "localhost"}`,
    );

    const empId = String(requestUrl.searchParams.get("emp_id") || "").trim();

    // ----------------------------------------------------------
    // emp_id is required
    // ----------------------------------------------------------

    if (!empId) {
      sendJson(res, 400, {
        success: false,
        message: "emp_id is required.",
      });
      return;
    }

    // ----------------------------------------------------------
    // Get all Previous_Appraisal records
    // ----------------------------------------------------------

    let allRecords = [];
    let nextToken = undefined;
    let moreRecords = true;

    while (moreRecords) {
      const result = await table.getPagedRows({
        maxRows: 200,
        nextToken: nextToken,
      });

      const rows = result.data || [];

      allRecords = allRecords.concat(rows);

      moreRecords = result.more_records === true;
      nextToken = result.next_token;
    }

    // ----------------------------------------------------------
    // Find employee history
    // ----------------------------------------------------------

    const history = allRecords
      .filter((record) => String(record.emp_id || "").trim() === empId)
      .sort((a, b) =>
        String(b.appraisal_year || "").localeCompare(
          String(a.appraisal_year || ""),
        ),
      );

    // ----------------------------------------------------------
    // Response
    // ----------------------------------------------------------

    sendJson(res, 200, {
      success: true,
      emp_id: empId,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error("Appraisal history API error:", error);

    sendJson(res, 500, {
      success: false,
      message: error.message || "Failed to fetch appraisal history.",
    });
  }
};
