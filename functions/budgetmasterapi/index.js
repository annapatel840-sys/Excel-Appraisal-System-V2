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

async function getUser(app) {
  const user = await app.userManagement().getCurrentUser();
  if (!user || !user.user_id) throw new Error("Authentication is required.");
  return user;
}

module.exports = async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});
    const app = catalyst.initialize(req);
    const user = await getUser(app);
    const adminApp = catalyst.initialize(req, { scope: "admin" });
    const table = adminApp.datastore().table(TABLE_ID);

    if (req.method === "GET") {
      const result = await table.getPagedRows({ maxRows: 300 });
      return send(res, 200, {
        success: true,
        data: (result.data || []).map(mapRow),
        current_user: {
          id: String(user.user_id || ""),
          name: String(
            user.first_name
              ? `${user.first_name} ${user.last_name || ""}`.trim()
              : user.email || "",
          ),
          email: String(user.email || ""),
        },
      });
    }

    if (req.method === "PUT") {
      const body = req.body || {};
      const id = String(body.id || "").trim();
      if (!id)
        return send(res, 400, {
          success: false,
          message: "Budget Master row id is required.",
        });

      const allowed = [
        "budget_percentage",
        "budget_amount",
        "additional_budget",
        "budget_utilized",
        "status",
      ];
      const update = { ROWID: id };
      allowed.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(body, key))
          update[key] = body[key];
      });

      if (Object.keys(update).length === 1) {
        return send(res, 400, {
          success: false,
          message: "No Budget Master fields were provided.",
        });
      }

      const updated = await table.updateRow(update);
      return send(res, 200, {
        success: true,
        data: mapRow(updated),
        changed_by: String(user.email || user.user_id || ""),
      });
    }

    return send(res, 405, { success: false, message: "Method not allowed" });
  } catch (error) {
    console.error("budgetmasterapi:", error);
    return send(
      res,
      error.message === "Authentication is required." ? 401 : 500,
      {
        success: false,
        message: error.message || "Budget Master API failed.",
      },
    );
  }
};
