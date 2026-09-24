// "use strict";

// const catalyst = require("zcatalyst-sdk-node");

// const PREVIOUS_APPRAISAL_TABLE_ID = "71873000000020833";

// const DATASTORE_PAGE_SIZE = 200;

// /* ============================================================
// CORS
// ============================================================ */

// function setCorsHeaders(res) {
//   // DO NOT set Access-Control-Allow-Origin.
//   // Catalyst automatically handles the allowed origin.

//   res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");

//   res.setHeader(
//     "Access-Control-Allow-Headers",
//     "Content-Type, Accept, Authorization, X-Requested-With",
//   );

//   res.setHeader("Access-Control-Max-Age", "86400");
// }

// /* ============================================================
// SEND JSON
// ============================================================ */

// function sendJson(res, statusCode, payload) {
//   res.statusCode = statusCode;
//   res.setHeader("Content-Type", "application/json");
//   res.end(JSON.stringify(payload));
// }

// /* ============================================================
// READ REQUEST BODY
// ============================================================ */

// const readRequestBody = async (req) => {
//   if (req.body && typeof req.body === "object") {
//     return req.body;
//   }

//   return new Promise((resolve, reject) => {
//     let body = "";

//     req.on("data", (chunk) => {
//       body += chunk;
//     });

//     req.on("end", () => {
//       if (!body) {
//         resolve({});
//         return;
//       }

//       try {
//         resolve(JSON.parse(body));
//       } catch (error) {
//         reject(new Error("Invalid JSON request body."));
//       }
//     });

//     req.on("error", reject);
//   });
// };

// /* ============================================================
// ALLOWED HISTORY FIELDS
// ============================================================ */

// const ALLOWED_FIELDS = [
//   "base_pay",
//   "allocated_pb",
//   "allocated_pb_installment",
//   "performance_bonus",
//   "performance_bonus_installment",
//   "retention_bonus",
//   "total_pb",
//   "total_bonus",
//   "hike_amount",
//   "hike_pct",
//   "promotion",
//   "title",
//   "target_performance_bonus",
//   "new_ctc",
//   "manager_rating",
//   "rating",
// ];

// /* ============================================================
// GET ALL PREVIOUS APPRAISAL RECORDS
// ============================================================ */

// const getAllPreviousAppraisalRecords = async (table) => {
//   let allRecords = [];
//   let nextToken = undefined;

//   while (true) {
//     const options = {
//       maxRows: DATASTORE_PAGE_SIZE,
//     };

//     if (nextToken) {
//       options.nextToken = nextToken;
//     }

//     console.log("Previous_Appraisal getPagedRows:", options);

//     const result = await table.getPagedRows(options);

//     const rows = Array.isArray(result?.data) ? result.data : [];

//     console.log(
//       "Previous_Appraisal page received:",
//       rows.length,
//       "more_records:",
//       result?.more_records,
//     );

//     allRecords = allRecords.concat(rows);

//     if (result?.more_records !== true) {
//       break;
//     }

//     nextToken = result?.next_token;

//     if (!nextToken) {
//       console.warn(
//         "Previous_Appraisal says more_records=true but no next_token was returned.",
//       );
//       break;
//     }
//   }

//   console.log("Previous_Appraisal total records fetched:", allRecords.length);

//   return allRecords;
// };

// /* ============================================================
// GET HISTORY FOR EMPLOYEE
// ============================================================ */

// const getHistory = async (table, empId) => {
//   const allRecords = await getAllPreviousAppraisalRecords(table);

//   const history = allRecords
//     .filter((record) => String(record.emp_id || "").trim() === empId)
//     .sort((a, b) =>
//       String(b.appraisal_year || "").localeCompare(
//         String(a.appraisal_year || ""),
//       ),
//     );

//   console.log("History records for", empId, ":", history.length);

//   return history;
// };

// /* ============================================================
// BUILD UPDATE DATA
// ============================================================ */

// const buildUpdateData = (body) => {
//   const updateData = {};

//   ALLOWED_FIELDS.forEach((field) => {
//     if (Object.prototype.hasOwnProperty.call(body, field)) {
//       updateData[field] = body[field];
//     }
//   });

//   return updateData;
// };

// /* ============================================================
// FIND CURRENT YEAR RECORD
// ============================================================ */

// const findHistoryRecord = async (table, empId, appraisalYear) => {
//   const allRecords = await getAllPreviousAppraisalRecords(table);

//   return allRecords.find(
//     (item) =>
//       String(item.emp_id || "").trim() === empId &&
//       String(item.appraisal_year || "").trim() === appraisalYear,
//   );
// };

// /* ============================================================
// UPDATE EXISTING HISTORY
// ============================================================ */

// const updateExistingHistory = async (table, record, updateData) => {
//   const payload = {
//     ...updateData,
//     ROWID: record.ROWID,
//   };

//   console.log("Previous_Appraisal updateRow payload:", JSON.stringify(payload));

//   const result = await table.updateRow(payload);

//   console.log("Previous_Appraisal updateRow result:", JSON.stringify(result));

//   return result;
// };

// /* ============================================================
// CREATE HISTORY RECORD IF MISSING
// ============================================================ */

// const createHistoryRecord = async (table, empId, appraisalYear, updateData) => {
//   const payload = {
//     emp_id: empId,
//     appraisal_year: appraisalYear,
//     ...updateData,
//   };

//   console.log(
//     "Previous_Appraisal insertRows payload:",
//     JSON.stringify(payload),
//   );

//   const result = await table.insertRows([payload]);

//   console.log("Previous_Appraisal insertRows result:", JSON.stringify(result));

//   return Array.isArray(result) ? result[0] : result;
// };

// /* ============================================================
// MAIN API
// ============================================================ */

// module.exports = async (req, res) => {
//   setCorsHeaders(res);

//   console.log("================================================");
//   console.log("APPRAISAL HISTORY API REQUEST");
//   console.log("METHOD:", req.method);
//   console.log("URL:", req.url);
//   console.log("TABLE ID:", PREVIOUS_APPRAISAL_TABLE_ID);
//   console.log("================================================");

//   /* ----------------------------------------------------------
//   OPTIONS
//   ---------------------------------------------------------- */

//   if (req.method === "OPTIONS") {
//     res.statusCode = 204;
//     res.end();
//     return;
//   }

//   try {
//     /* --------------------------------------------------------
//     INITIALIZE CATALYST
//     -------------------------------------------------------- */

//     const app = catalyst.initialize(req);

//     const datastore = app.datastore();

//     const table = datastore.table(PREVIOUS_APPRAISAL_TABLE_ID);

//     const requestUrl = new URL(
//       req.url,
//       `https://${req.headers.host || "localhost"}`,
//     );

//     /* ========================================================
//     GET
//     ======================================================== */

//     if (req.method === "GET") {
//       const empId = String(requestUrl.searchParams.get("emp_id") || "").trim();

//       console.log("GET emp_id:", empId);

//       if (!empId) {
//         sendJson(res, 400, {
//           success: false,
//           message: "emp_id is required.",
//         });
//         return;
//       }

//       const history = await getHistory(table, empId);

//       sendJson(res, 200, {
//         success: true,
//         emp_id: empId,
//         count: history.length,
//         data: history,
//       });

//       return;
//     }

//     /* ========================================================
//     PATCH
//     ======================================================== */

//     if (req.method === "PATCH") {
//       const body = await readRequestBody(req);

//       console.log("PATCH BODY:", JSON.stringify(body));

//       const empId = String(body.emp_id || "").trim();

//       const appraisalYear = String(body.appraisal_year || "").trim();

//       console.log("PATCH emp_id:", empId);
//       console.log("PATCH appraisal_year:", appraisalYear);

//       if (!empId) {
//         sendJson(res, 400, {
//           success: false,
//           message: "emp_id is required.",
//         });
//         return;
//       }

//       if (!appraisalYear) {
//         sendJson(res, 400, {
//           success: false,
//           message: "appraisal_year is required.",
//         });
//         return;
//       }

//       /* ------------------------------------------------------
//       ONLY ALLOW 2025 AND 2026 HISTORY
//       ------------------------------------------------------ */

//       const normalizedYear = appraisalYear.toLowerCase().trim();

//       const is2025 =
//         normalizedYear.includes("2025") || normalizedYear.includes("apr-25");

//       const is2026 =
//         normalizedYear.includes("2026") || normalizedYear.includes("apr-26");

//       if (!is2025 && !is2026) {
//         sendJson(res, 400, {
//           success: false,
//           message: "Only 2025 and 2026 appraisal history can be updated.",
//         });
//         return;
//       }

//       /* ------------------------------------------------------
//       BUILD UPDATE DATA
//       ------------------------------------------------------ */

//       const updateData = buildUpdateData(body);

//       console.log("VALID HISTORY UPDATE DATA:", JSON.stringify(updateData));

//       if (!Object.keys(updateData).length) {
//         sendJson(res, 400, {
//           success: false,
//           message: "No valid Previous_Appraisal fields were provided.",
//         });
//         return;
//       }

//       /* ------------------------------------------------------
//       FIND EXISTING RECORD
//       ------------------------------------------------------ */

//       console.log("Searching Previous_Appraisal for:", empId, appraisalYear);

//       const existingRecord = await findHistoryRecord(
//         table,
//         empId,
//         appraisalYear,
//       );

//       /* ------------------------------------------------------
//       UPDATE EXISTING RECORD
//       ------------------------------------------------------ */

//       if (existingRecord) {
//         console.log(
//           "Existing Previous_Appraisal record found:",
//           existingRecord.ROWID,
//         );

//         const updatedRecord = await updateExistingHistory(
//           table,
//           existingRecord,
//           updateData,
//         );

//         sendJson(res, 200, {
//           success: true,
//           action: "updated",
//           emp_id: empId,
//           appraisal_year: appraisalYear,
//           message: "Previous_Appraisal updated successfully.",
//           data: updatedRecord,
//         });

//         return;
//       }

//       /* ------------------------------------------------------
//       CREATE RECORD IF IT DOES NOT EXIST
//       ------------------------------------------------------ */

//       console.log("No Previous_Appraisal record found.");

//       console.log("Creating new history record for:", empId, appraisalYear);

//       const createdRecord = await createHistoryRecord(
//         table,
//         empId,
//         appraisalYear,
//         updateData,
//       );

//       sendJson(res, 200, {
//         success: true,
//         action: "created",
//         emp_id: empId,
//         appraisal_year: appraisalYear,
//         message: "Previous_Appraisal history created successfully.",
//         data: createdRecord,
//       });

//       return;
//     }

//     /* ========================================================
//     OTHER METHODS
//     ======================================================== */

//     sendJson(res, 405, {
//       success: false,
//       message: "Only GET, PATCH and OPTIONS methods are allowed.",
//     });
//   } catch (error) {
//     console.error("================================================");

//     console.error("APPRAISAL HISTORY API ERROR");

//     console.error("MESSAGE:", error?.message);

//     console.error("STACK:", error?.stack);

//     console.error(
//       "FULL ERROR:",
//       JSON.stringify(error, Object.getOwnPropertyNames(error)),
//     );

//     console.error("================================================");

//     sendJson(res, 500, {
//       success: false,
//       message: error?.message || "Failed to process appraisal history request.",
//     });
//   }
// };

"use strict";

const catalyst = require("zcatalyst-sdk-node");
const { authenticate, canAccessEmployee } = require("./auth");

const PREVIOUS_APPRAISAL_TABLE_ID = "71873000000020833";

const DATASTORE_PAGE_SIZE = 200;

/* ============================================================
CORS
============================================================ */

function setCorsHeaders(res) {
  // DO NOT set Access-Control-Allow-Origin.
  // Catalyst automatically handles the allowed origin.

  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, X-Requested-With",
  );

  res.setHeader("Access-Control-Max-Age", "86400");
}

/* ============================================================
SEND JSON
============================================================ */

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/* ============================================================
READ REQUEST BODY
============================================================ */

const readRequestBody = async (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON request body."));
      }
    });

    req.on("error", reject);
  });
};

/* ============================================================
ALLOWED HISTORY FIELDS
============================================================ */

const ALLOWED_FIELDS = [
  "base_pay",
  "allocated_pb",
  "allocated_pb_installment",
  "performance_bonus",
  "performance_bonus_installment",
  "retention_bonus",
  "total_pb",
  "total_bonus",
  "hike_amount",
  "hike_pct",
  "promotion",
  "title",
  "target_performance_bonus",
  "new_ctc",
  "manager_rating",
  "rating",
];

/* ============================================================
GET ALL PREVIOUS APPRAISAL RECORDS
============================================================ */

const getAllPreviousAppraisalRecords = async (table) => {
  let allRecords = [];
  let nextToken = undefined;

  while (true) {
    const options = {
      maxRows: DATASTORE_PAGE_SIZE,
    };

    if (nextToken) {
      options.nextToken = nextToken;
    }

    console.log("Previous_Appraisal getPagedRows:", options);

    const result = await table.getPagedRows(options);

    const rows = Array.isArray(result?.data) ? result.data : [];

    console.log(
      "Previous_Appraisal page received:",
      rows.length,
      "more_records:",
      result?.more_records,
    );

    allRecords = allRecords.concat(rows);

    if (result?.more_records !== true) {
      break;
    }

    nextToken = result?.next_token;

    if (!nextToken) {
      console.warn(
        "Previous_Appraisal says more_records=true but no next_token was returned.",
      );
      break;
    }
  }

  console.log("Previous_Appraisal total records fetched:", allRecords.length);

  return allRecords;
};

/* ============================================================
GET HISTORY FOR EMPLOYEE
============================================================ */

const getHistory = async (table, empId) => {
  const allRecords = await getAllPreviousAppraisalRecords(table);

  const history = allRecords
    .filter((record) => String(record.emp_id || "").trim() === empId)
    .sort((a, b) =>
      String(b.appraisal_year || "").localeCompare(
        String(a.appraisal_year || ""),
      ),
    );

  console.log("History records for", empId, ":", history.length);

  return history;
};

/* ============================================================
BUILD UPDATE DATA
============================================================ */

const buildUpdateData = (body) => {
  const updateData = {};

  ALLOWED_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      updateData[field] = body[field];
    }
  });

  return updateData;
};

/* ============================================================
FIND CURRENT YEAR RECORD
============================================================ */

const findHistoryRecord = async (table, empId, appraisalYear) => {
  const allRecords = await getAllPreviousAppraisalRecords(table);

  return allRecords.find(
    (item) =>
      String(item.emp_id || "").trim() === empId &&
      String(item.appraisal_year || "").trim() === appraisalYear,
  );
};

/* ============================================================
UPDATE EXISTING HISTORY
============================================================ */

const updateExistingHistory = async (table, record, updateData) => {
  const payload = {
    ...updateData,
    ROWID: record.ROWID,
  };

  console.log("Previous_Appraisal updateRow payload:", JSON.stringify(payload));

  const result = await table.updateRow(payload);

  console.log("Previous_Appraisal updateRow result:", JSON.stringify(result));

  return result;
};

/* ============================================================
CREATE HISTORY RECORD IF MISSING
============================================================ */

const createHistoryRecord = async (table, empId, appraisalYear, updateData) => {
  const payload = {
    emp_id: empId,
    appraisal_year: appraisalYear,
    ...updateData,
  };

  console.log(
    "Previous_Appraisal insertRows payload:",
    JSON.stringify(payload),
  );

  const result = await table.insertRows([payload]);

  console.log("Previous_Appraisal insertRows result:", JSON.stringify(result));

  return Array.isArray(result) ? result[0] : result;
};

/* ============================================================
MAIN API
============================================================ */

module.exports = async (req, res) => {
  setCorsHeaders(res);

  console.log("================================================");
  console.log("APPRAISAL HISTORY API REQUEST");
  console.log("METHOD:", req.method);
  console.log("URL:", req.url);
  console.log("TABLE ID:", PREVIOUS_APPRAISAL_TABLE_ID);
  console.log("================================================");

  /* ----------------------------------------------------------
  OPTIONS
  ---------------------------------------------------------- */

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    /* --------------------------------------------------------
    AUTHENTICATE (401 / 403 are sent by authenticate itself)
    -------------------------------------------------------- */

    const user = await authenticate(req, res);

    if (!user) {
      return;
    }

    /* --------------------------------------------------------
    INITIALIZE CATALYST
    -------------------------------------------------------- */

    const app = catalyst.initialize(req);

    const datastore = app.datastore();

    const table = datastore.table(PREVIOUS_APPRAISAL_TABLE_ID);

    const requestUrl = new URL(
      req.url,
      `https://${req.headers.host || "localhost"}`,
    );

    /* ========================================================
    GET
    ======================================================== */

    if (req.method === "GET") {
      const empId = String(requestUrl.searchParams.get("emp_id") || "").trim();

      console.log("GET emp_id:", empId);

      if (!empId) {
        sendJson(res, 400, {
          success: false,
          message: "emp_id is required.",
        });
        return;
      }

      if (!(await canAccessEmployee(app, user, empId))) {
        sendJson(res, 403, {
          success: false,
          message: "You do not have access to employee " + empId + ".",
        });
        return;
      }

      const history = await getHistory(table, empId);

      sendJson(res, 200, {
        success: true,
        emp_id: empId,
        count: history.length,
        data: history,
      });

      return;
    }

    /* ========================================================
    PATCH
    ======================================================== */

    if (req.method === "PATCH") {
      const body = await readRequestBody(req);

      console.log("PATCH BODY:", JSON.stringify(body));

      const empId = String(body.emp_id || "").trim();

      const appraisalYear = String(body.appraisal_year || "").trim();

      console.log("PATCH emp_id:", empId);
      console.log("PATCH appraisal_year:", appraisalYear);

      if (!empId) {
        sendJson(res, 400, {
          success: false,
          message: "emp_id is required.",
        });
        return;
      }

      if (!appraisalYear) {
        sendJson(res, 400, {
          success: false,
          message: "appraisal_year is required.",
        });
        return;
      }

      if (!(await canAccessEmployee(app, user, empId))) {
        sendJson(res, 403, {
          success: false,
          message: "You do not have access to employee " + empId + ".",
        });
        return;
      }

      /* ------------------------------------------------------
      ONLY ALLOW 2025 AND 2026 HISTORY
      ------------------------------------------------------ */

      const normalizedYear = appraisalYear.toLowerCase().trim();

      const is2025 =
        normalizedYear.includes("2025") || normalizedYear.includes("apr-25");

      const is2026 =
        normalizedYear.includes("2026") || normalizedYear.includes("apr-26");

      if (!is2025 && !is2026) {
        sendJson(res, 400, {
          success: false,
          message: "Only 2025 and 2026 appraisal history can be updated.",
        });
        return;
      }

      /* ------------------------------------------------------
      BUILD UPDATE DATA
      ------------------------------------------------------ */

      const updateData = buildUpdateData(body);

      console.log("VALID HISTORY UPDATE DATA:", JSON.stringify(updateData));

      if (!Object.keys(updateData).length) {
        sendJson(res, 400, {
          success: false,
          message: "No valid Previous_Appraisal fields were provided.",
        });
        return;
      }

      /* ------------------------------------------------------
      FIND EXISTING RECORD
      ------------------------------------------------------ */

      console.log("Searching Previous_Appraisal for:", empId, appraisalYear);

      const existingRecord = await findHistoryRecord(
        table,
        empId,
        appraisalYear,
      );

      /* ------------------------------------------------------
      UPDATE EXISTING RECORD
      ------------------------------------------------------ */

      if (existingRecord) {
        console.log(
          "Existing Previous_Appraisal record found:",
          existingRecord.ROWID,
        );

        const updatedRecord = await updateExistingHistory(
          table,
          existingRecord,
          updateData,
        );

        sendJson(res, 200, {
          success: true,
          action: "updated",
          emp_id: empId,
          appraisal_year: appraisalYear,
          message: "Previous_Appraisal updated successfully.",
          data: updatedRecord,
        });

        return;
      }

      /* ------------------------------------------------------
      CREATE RECORD IF IT DOES NOT EXIST
      ------------------------------------------------------ */

      console.log("No Previous_Appraisal record found.");

      console.log("Creating new history record for:", empId, appraisalYear);

      const createdRecord = await createHistoryRecord(
        table,
        empId,
        appraisalYear,
        updateData,
      );

      sendJson(res, 200, {
        success: true,
        action: "created",
        emp_id: empId,
        appraisal_year: appraisalYear,
        message: "Previous_Appraisal history created successfully.",
        data: createdRecord,
      });

      return;
    }

    /* ========================================================
    OTHER METHODS
    ======================================================== */

    sendJson(res, 405, {
      success: false,
      message: "Only GET, PATCH and OPTIONS methods are allowed.",
    });
  } catch (error) {
    console.error("================================================");

    console.error("APPRAISAL HISTORY API ERROR");

    console.error("MESSAGE:", error?.message);

    console.error("STACK:", error?.stack);

    console.error(
      "FULL ERROR:",
      JSON.stringify(error, Object.getOwnPropertyNames(error)),
    );

    console.error("================================================");

    sendJson(res, 500, {
      success: false,
      message: error?.message || "Failed to process appraisal history request.",
    });
  }
};
