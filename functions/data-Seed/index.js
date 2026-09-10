const catalyst = require("zcatalyst-sdk-node");

const TABLE_ID = "34995000000121039";

module.exports = async (context, basicIO) => {
  try {
    const app = catalyst.initialize(context);
    const table = app.datastore().table(TABLE_ID);

    // Get all employees
    let allEmployees = [];
    let nextToken = null;

    do {
      const options = {
        maxRows: 200,
      };

      if (nextToken) {
        options.nextToken = nextToken;
      }

      const result = await table.getPagedRows(options);

      if (result && result.data) {
        allEmployees = allEmployees.concat(result.data);
      }

      nextToken = result && result.more_records ? result.next_token : null;
    } while (nextToken);

    if (allEmployees.length === 0) {
      basicIO.write(
        JSON.stringify({
          success: true,
          message: "No employees found",
          updated: 0,
        }),
      );

      return;
    }

    // Manager email mapping
    const managerEmails = {
      "Priya Nair": "priya.nair@race2cloud.com",
      "Vikram Iyer": "vikram.iyer@race2cloud.com",
      "Neha Gupta": "neha.gupta@race2cloud.com",
      "Arjun Mehta": "arjun.mehta@race2cloud.com",
      "Sunita Rao": "sunita.rao@race2cloud.com",
    };

    // Super manager email mapping
    const superManagerEmails = {
      "Priya Nair": "supermanager1@race2cloud.com",
      "Vikram Iyer": "supermanager2@race2cloud.com",
      "Neha Gupta": "supermanager3@race2cloud.com",
      "Arjun Mehta": "supermanager4@race2cloud.com",
      "Sunita Rao": "supermanager5@race2cloud.com",
    };

    let updated = 0;
    let failed = 0;
    const errors = [];

    // Update every employee
    for (const employee of allEmployees) {
      try {
        const empId = employee.emp_id;
        const manager = employee.manager;

        if (!empId) {
          failed++;

          errors.push({
            reason: "Missing emp_id",
          });

          continue;
        }

        // Generate temporary joining date
        const numberMatch = String(empId).match(/\d+/);

        const employeeNumber = numberMatch ? parseInt(numberMatch[0], 10) : 1;

        const year = 2021 + Math.floor((employeeNumber - 1) / 12);

        const month = ((employeeNumber - 1) % 12) + 1;

        const day = 10 + (employeeNumber % 15);

        const joiningDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        const managerEmail = managerEmails[manager] || "manager@race2cloud.com";

        const superManagerEmail =
          superManagerEmails[manager] || "supermanager@race2cloud.com";

        await table.updateRow({
          ROWID: employee.ROWID,
          joining_date: joiningDate,
          manager_email_id: managerEmail,
          super_manager_email_id: superManagerEmail,
        });

        updated++;
      } catch (error) {
        failed++;

        errors.push({
          emp_id: employee.emp_id,
          error: error.message,
        });
      }
    }

    basicIO.write(
      JSON.stringify({
        success: true,
        message: "Employee details populated successfully",
        totalEmployees: allEmployees.length,
        updated: updated,
        failed: failed,
        errors: errors,
      }),
    );
  } catch (error) {
    console.error("populate-employee-details error:", error);

    basicIO.write(
      JSON.stringify({
        success: false,
        message: "Failed to populate employee details",
        error: error.message,
      }),
    );
  }
};
