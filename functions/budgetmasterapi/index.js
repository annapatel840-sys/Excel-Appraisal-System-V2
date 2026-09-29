"use strict";

const catalyst = require("zcatalyst-sdk-node");

const TABLE_ID = "71873000000030413";

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function mapRow(row) {
  const budget = Number(row.budget_amount || 0);
  const additional = Number(row.additional_budget || 0);
  const updated = budget + additional;
  const utilized = Number(row.budget_utilized || 0);

  return {
    id: String(row.ROWID || ""),
    appraisal_cycle_id: String(row.appraisal_cycle_id || ""),
    tech_ed_id: String(row.tech_ed_id || ""),
    budget_percentage: Number(row.budget_percentage || 0),
    budget_amount: budget,
    additional_budget: additional,
    budget_utilized: utilized,
    budget_remaining: updated - utilized,
    status: String(row.status || ""),
    updated_budget: updated,
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});

    if (req.method === "GET") {
      return send(res, 200, {
        success: true,
        diagnostic: true,
        data: [],
        message: "budgetmasterapi route and function execution are working; Data Store access is the next diagnostic step.",
      });
    }

    return send(res, 405, {
      success: false,
      message: "Method not allowed",
    });
  } catch (error) {
    console.error("budgetmasterapi:", error);

    return send(res, 500, {
      success: false,
      message: error.message || "Budget Master API failed.",
    });
  }
};
