const catalyst = require("zcatalyst-sdk-node");

module.exports = async (context, basicIO) => {
  try {
    // Allow React frontend to call this function
    basicIO.addResponseHeader("Access-Control-Allow-Origin", "*");

    basicIO.addResponseHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS",
    );

    basicIO.addResponseHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept",
    );

    const app = catalyst.initialize(context);

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

      context.log(
        "Fetched " + rows.length + " records. Total: " + allEmployees.length,
      );
    }

    basicIO.write(
      JSON.stringify({
        success: true,
        count: allEmployees.length,
        data: allEmployees,
      }),
    );
  } catch (error) {
    context.log("Employee API Error: " + error.message);

    basicIO.setStatus(500);

    basicIO.write(
      JSON.stringify({
        success: false,
        message: error.message,
      }),
    );
  }

  context.close();
};
