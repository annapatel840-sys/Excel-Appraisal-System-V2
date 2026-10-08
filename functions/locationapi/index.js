"use strict";

const catalyst = require("zcatalyst-sdk-node");

const LOCATION_TABLE_ID = "74008000000022481";
const PAGE_SIZE = 200;

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });

  res.end(JSON.stringify(body));
}

async function getAllRows(table) {
  const rows = [];
  let nextToken = null;

  while (true) {
    const options = {
      maxRows: PAGE_SIZE,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    const result = await table.getPagedRows(options);

    if (Array.isArray(result?.data)) {
      rows.push(...result.data);
    }

    nextToken = result?.next_token || null;

    if (!result?.more_records || !nextToken) {
      break;
    }
  }

  return rows;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      return sendJson(res, 405, {
        success: false,
        message: "Only GET requests are allowed.",
      });
    }

    const app = catalyst.initialize(req, {
      scope: "admin",
    });

    const datastore = app.datastore();

    const locationTable = datastore.table(LOCATION_TABLE_ID);

    const rows = await getAllRows(locationTable);

    const locations = rows
      .map((row) => ({
        id: String(
          row.ROWID ||
          row.rowid ||
          row.id ||
          ""
        ),

        location_name: String(
          row.location_name || ""
        ).trim(),

        location_code: String(
          row.location_code || ""
        ).trim(),

        address: String(
          row.address || ""
        ).trim(),

        currency_code: String(
          row.currency_code || ""
        ).trim(),
      }))
      .filter((location) => location.location_code)
      .sort((a, b) =>
        a.location_name.localeCompare(
          b.location_name
        )
      );

    return sendJson(res, 200, {
      success: true,
      data: locations,
    });
  } catch (error) {
    console.error("locationapi error:", error);

    return sendJson(res, 500, {
      success: false,
      message:
        error?.message ||
        "Unable to load locations.",
    });
  }
};