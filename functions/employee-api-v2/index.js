const catalyst = require("zcatalyst-sdk-node");

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  // Handle browser preflight request
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const app = catalyst.initialize(req);

    const table = app.datastore().table("34995000000121039");

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

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");

    res.end(
      JSON.stringify({
        success: true,
        count: allEmployees.length,
        data: allEmployees,
      }),
    );
  } catch (error) {
    console.error("Employee API Error:", error);

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");

    res.end(
      JSON.stringify({
        success: false,
        message: error?.message || "Failed to fetch employees",
      }),
    );
  }
};
