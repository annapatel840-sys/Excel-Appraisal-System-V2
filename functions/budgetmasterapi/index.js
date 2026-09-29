"use strict";

const catalyst = require("zcatalyst-sdk-node");

const TABLE_ID = "71873000000030413";

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(body));
}

function mapRow(row) {
  const budget = Number(row.budget_amount || 0);
  const additional = Number(row.additional_budget || 0);
  const updated = budget + additional;
  const utilized = Number(row.budget_utilized || 0);

  return {
    id: String(row.ROWID || row.rowid || ""),
    appraisal_cycle_id: String(row.appraisal_cycle_id || ""),
    tech_ed_id: String(row.tech_ed_id || ""),
    budget_percentage: Number(row.budget_percentage || 0),
    budget_amount: budget,
    additional_budget: additional,
    budget_utilized: utilized,
    budget_remaining:
      row.budget_remaining !== undefined && row.budget_remaining !== null
        ? Number(row.budget_remaining)
        : updated - utilized,
    status: String(row.status || ""),
    updated_budget: updated,
  };
}

function getUserValues(user) {
  const first = String(user?.first_name || "").trim();
  const last = String(user?.last_name || "").trim();
  const full = [first, last].filter(Boolean).join(" ");

  return [
    user?.user_id,
    user?.email,
    user?.email_id,
    user?.display_name,
    user?.name,
    full,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

function matchesUser(techEdId, user) {
  const owner = String(techEdId || "").trim().toLowerCase();
  if (!owner) return false;

  return getUserValues(user).some(
    (value) => owner === value || owner.includes(value) || value.includes(owner),
  );
}

function isHR(user) {
  const role = String(
    user?.role_details?.role_name || user?.role_name || user?.role || "",
  )
    .trim()
    .toLowerCase();

  return role === "hr" || role.includes("hr");
}

async function getCurrentUser(app) {
  try {
    const user = await app.userManagement().getCurrentUser();
    if (user?.user_id) return user;
  } catch (error) {
    console.warn("Budget Master current-user lookup failed:", error?.message);
  }
  return null;
}

module.exports = async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      return send(res, 204, {});
    }

    const app = catalyst.initialize(req);

    if (req.method === "GET") {
      const user = await getCurrentUser(app);
      const table = app.datastore().table(TABLE_ID);
      if (!user) {
        return send(res, 401, {
          success: false,
          message: "Authentication is required.",
        });
      }

      const result = await Promise.race([table.getPagedRows({ maxRows: 200 }), new Promise((_, reject) => setTimeout(() => reject(new Error("Budget Master Data Store request timed out.")), 15000))]);
      const allRows = Array.isArray(result?.data) ? result.data : [];

      const activeRows = allRows.filter(
        (row) =>
          !String(row.status || "").trim() ||
          String(row.status).trim().toLowerCase() === "active",
      );

      const rows = isHR(user)
        ? activeRows
        : activeRows.filter((row) => matchesUser(row.tech_ed_id, user));

      return send(res, 200, {
        success: true,
        data: rows.map(mapRow),
        current_user: {
          id: String(user.user_id || ""),
          name: String(
            user.display_name ||
              user.name ||
              [user.first_name, user.last_name].filter(Boolean).join(" ") ||
              user.email ||
              "",
          ),
          email: String(user.email || user.email_id || ""),
          role: String(
            user?.role_details?.role_name || user?.role_name || user?.role || "",
          ),
        },
      });
    }

    if (req.method === "PUT") {
      const user = await getCurrentUser(app);
      const table = app.datastore().table(TABLE_ID);
      if (!user) {
        return send(res, 401, {
          success: false,
          message: "Authentication is required.",
        });
      }

      if (!isHR(user)) {
        return send(res, 403, {
          success: false,
          message: "Only HR can update Budget Master.",
        });
      }

      const body = req.body || {};
      const id = String(body.id || "").trim();

      if (!id) {
        return send(res, 400, {
          success: false,
          message: "Budget Master row id is required.",
        });
      }

      const allowed = [
        "budget_percentage",
        "budget_amount",
        "additional_budget",
        "budget_utilized",
        "status",
      ];

      const update = { ROWID: id };

      allowed.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          update[key] = body[key];
        }
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
        changed_by: String(user.email || user.email_id || user.user_id || ""),
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
      message: error?.message || "Budget Master API failed.",
    });
  }
};
