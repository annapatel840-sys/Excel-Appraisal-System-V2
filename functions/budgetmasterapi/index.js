"use strict";

const catalyst = require("zcatalyst-sdk-node");

const TABLE_ID = "71873000000030413";

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function mapRow(row) {
  return {
    id: String(row.ROWID || ""),
    appraisal_cycle_id: String(row.appraisal_cycle_id || ""),
    tech_ed_id: String(row.tech_ed_id || ""),
    budget_percentage: Number(row.budget_percentage || 0),
    budget_amount: Number(row.budget_amount || 0),
    additional_budget: Number(row.additional_budget || 0),
    budget_utilized: Number(row.budget_utilized || 0),
    budget_remaining: Number(row.budget_remaining || 0),
    status: String(row.status || "")
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (req.method !== "GET") return send(res, 405, {
      success: false,
      message: "Method not allowed"
    });

    const app = catalyst.initialize(req);
    const user = await app.userManagement().getCurrentUser();

    if (!user || !user.user_id) {
      return send(res, 401, {
        success: false,
        message: "Authentication is required."
      });
    }

    const adminApp = catalyst.initialize(req, { scope: "admin" });
    const table = adminApp.datastore().table(TABLE_ID);
    const result = await table.getPagedRows({ maxRows: 300 });
    const data = Array.isArray(result.data) ? result.data.map(mapRow) : [];

    const params = new URL(req.url || "/", "http://localhost").searchParams;
    const cycle = String(params.get("appraisal_cycle_id") || "").trim();

    const filtered = cycle
      ? data.filter((row) => row.appraisal_cycle_id === cycle)
      : data;

    return send(res, 200, {
      success: true,
      data: filtered
    });
  } catch (error) {
    console.error("budgetmasterapi:", error);
    return send(res, 500, {
      success: false,
      message: error.message || "Budget Master API failed."
    });
  }
};
