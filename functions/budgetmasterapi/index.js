"use strict";

const catalyst = require("zcatalyst-sdk-node");

const TABLE_ID = "71873000000030413";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(body));
}

function value(row, key) {
  if (row && row[key] !== undefined && row[key] !== null) return row[key];
  return "";
}

function mapRow(row) {
  var budget = Number(value(row, "budget_amount")) || 0;
  var additional = Number(value(row, "additional_budget")) || 0;
  var updated = budget + additional;
  var utilized = Number(value(row, "budget_utilized")) || 0;
  var remaining = value(row, "budget_remaining");

  return {
    id: String(value(row, "ROWID") || value(row, "rowid")),
    appraisal_cycle_id: String(value(row, "appraisal_cycle_id")),
    tech_ed_id: String(value(row, "tech_ed_id")),
    budget_percentage: Number(value(row, "budget_percentage")) || 0,
    budget_amount: budget,
    additional_budget: additional,
    budget_utilized: utilized,
    budget_remaining:
      remaining === "" ? updated - utilized : Number(remaining) || 0,
    status: String(value(row, "status")),
    updated_budget: updated,
  };
}

function getUserField(user, key) {
  if (user && user[key] !== undefined && user[key] !== null) {
    return String(user[key]).trim();
  }
  return "";
}

function getCurrentUserName(user) {
  var first = getUserField(user, "first_name");
  var last = getUserField(user, "last_name");
  var full = (first + " " + last).trim();

  return (
    getUserField(user, "display_name") ||
    getUserField(user, "name") ||
    full ||
    getUserField(user, "email") ||
    getUserField(user, "email_id")
  );
}

function getUserRole(user) {
  var role = "";

  if (user && user.role_details) {
    role = user.role_details.role_name || "";
  }

  if (!role && user) role = user.role_name || "";
  if (!role && user) role = user.role || "";

  return String(role).trim().toLowerCase();
}

function isHR(user) {
  var role = getUserRole(user);
  return role === "hr" || role.indexOf("hr") !== -1;
}

function getUserValues(user) {
  var values = [];
  var keys = [
    "user_id",
    "email",
    "email_id",
    "display_name",
    "name",
  ];

  keys.forEach(function (key) {
    var v = getUserField(user, key).toLowerCase();
    if (v) values.push(v);
  });

  var full = (
    getUserField(user, "first_name") +
    " " +
    getUserField(user, "last_name")
  ).trim().toLowerCase();

  if (full) values.push(full);

  return values;
}

function matchesUser(techEdId, user) {
  var owner = String(techEdId || "").trim().toLowerCase();
  if (!owner) return false;

  var values = getUserValues(user);

  for (var i = 0; i < values.length; i += 1) {
    if (
      owner === values[i] ||
      owner.indexOf(values[i]) !== -1 ||
      values[i].indexOf(owner) !== -1
    ) {
      return true;
    }
  }

  return false;
}

async function getCurrentUser(app) {
  var user = await app.userManagement().getCurrentUser();
  if (user && user.user_id) return user;
  return null;
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return {};
    }
  }

  return {};
}

module.exports = async function (req, res) {
  try {
    var method = String(req.method || "GET").toUpperCase();

    if (method === "OPTIONS") {
      return sendJson(res, 204, {});
    }

    var app = catalyst.initialize(req);

    if (method === "GET") {
      var table = app.datastore().table(TABLE_ID);
      var result = await table.getAllRows();
      var allRows = Array.isArray(result) ? result : [];

      return sendJson(res, 200, {
        success: true,
        data: allRows.map(mapRow),
        current_user: null,
      });
    }

    if (method === "PUT") {
      var putUser = await getCurrentUser(app);

      if (!putUser) {
        return sendJson(res, 401, {
          success: false,
          message: "Authentication is required.",
        });
      }

      if (!isHR(putUser)) {
        return sendJson(res, 403, {
          success: false,
          message: "Only HR can update Budget Master.",
        });
      }

      var body = parseBody(req);
      var id = String(body.id || "").trim();

      if (!id) {
        return sendJson(res, 400, {
          success: false,
          message: "Budget Master row id is required.",
        });
      }

      var allowed = [
        "budget_percentage",
        "budget_amount",
        "additional_budget",
        "budget_utilized",
        "status",
      ];

      var update = { ROWID: id };

      allowed.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
          update[key] = body[key];
        }
      });

      if (Object.keys(update).length === 1) {
        return sendJson(res, 400, {
          success: false,
          message: "No Budget Master fields were provided.",
        });
      }

      var putTable = app.datastore().table(TABLE_ID);
      var updated = await putTable.updateRow(update);

      return sendJson(res, 200, {
        success: true,
        data: mapRow(updated),
        changed_by:
          getUserField(putUser, "email") ||
          getUserField(putUser, "email_id") ||
          getUserField(putUser, "user_id"),
      });
    }

    return sendJson(res, 405, {
      success: false,
      message: "Method not allowed",
    });
  } catch (error) {
    console.error("budgetmasterapi:", error);

    return sendJson(res, 500, {
      success: false,
      message:
        error && error.message ? error.message : "Budget Master API failed.",
    });
  }
};
