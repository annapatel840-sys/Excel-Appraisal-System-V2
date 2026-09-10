// import { jsx as _jsx } from "react/jsx-runtime";
// import {
//   createContext,
//   useCallback,
//   useContext,
//   useMemo,
//   useState,
//   useEffect,
// } from "react";

// import { buildEmployees, COLUMNS } from "./appraisal-data";

// const CURRENT_USER = "Ashok Kumar (HR Ops)";

// const AppraisalContext = createContext(null);

// const labelOf = (key) =>
//   COLUMNS.find((c) => c.key === key)?.label ?? String(key);

// let seq = 0;

// const nextId = () => `a${Date.now()}-${seq++}`;

// /* ============================================================
//    STORAGE
//    ============================================================ */

// const EMPLOYEE_MASTER_STORAGE_KEY = "employee-master-employees";
// const EMPLOYEE_MASTER_EVENT = "employee-master-updated";
// const APPRAISAL_ROWS_STORAGE_KEY = "employee-appraisal-rows";
// const APPRAISAL_AUDIT_STORAGE_KEY = "employee-appraisal-audit";

// /* ============================================================
//    EMPLOYEE MASTER
//    ============================================================ */

// const getEmployeeMasterMap = () => {
//   try {
//     const saved = localStorage.getItem(EMPLOYEE_MASTER_STORAGE_KEY);

//     if (!saved) return null;

//     const employees = JSON.parse(saved);

//     if (!Array.isArray(employees)) return null;

//     return new Map(
//       employees
//         .filter((employee) => employee?.empId)
//         .map((employee) => [String(employee.empId), employee]),
//     );
//   } catch {
//     return null;
//   }
// };

// /* ============================================================
//    ELIGIBILITY SYNC
//    ============================================================ */

// const syncEligibility = (rows) => {
//   const employeeMap = getEmployeeMasterMap();

//   if (!employeeMap) {
//     return rows;
//   }

//   return rows.map((row) => {
//     const employee = employeeMap.get(String(row.empId));

//     if (!employee) {
//       return row;
//     }

//     const isNotEligible = employee.eligible === "No";

//     return {
//       ...row,
//       eligibility: isNotEligible ? "No" : "Yes",
//       eligibleReason: employee.eligibleReason || "",
//       manualEligibilityOverride: Boolean(employee.manualOverride),
//     };
//   });
// };

// /* ============================================================
//    PROVIDER
//    ============================================================ */

// export function AppraisalProvider({ children }) {
//   const [rows, setRows] = useState(() => {
//     try {
//       const saved = localStorage.getItem(APPRAISAL_ROWS_STORAGE_KEY);

//       if (saved) {
//         const parsed = JSON.parse(saved);

//         if (
//           Array.isArray(parsed) &&
//           parsed.length > 0 &&
//           parsed[0].currentAnnualBasePay !== undefined
//         ) {
//           return syncEligibility(parsed);
//         }
//       }

//       return syncEligibility(buildEmployees(250));
//     } catch {
//       return syncEligibility(buildEmployees(250));
//     }
//   });

//   const [audit, setAudit] = useState(() => {
//     try {
//       const saved = localStorage.getItem(APPRAISAL_AUDIT_STORAGE_KEY);

//       return saved ? JSON.parse(saved) : [];
//     } catch {
//       return [];
//     }
//   });

//   const [modified, setModified] = useState({});

//   /* ============================================================
//      SAVE ROWS
//      ============================================================ */

//   useEffect(() => {
//     localStorage.setItem(APPRAISAL_ROWS_STORAGE_KEY, JSON.stringify(rows));
//   }, [rows]);

//   /* ============================================================
//      SAVE AUDIT
//      ============================================================ */

//   useEffect(() => {
//     localStorage.setItem(APPRAISAL_AUDIT_STORAGE_KEY, JSON.stringify(audit));
//   }, [audit]);

//   /* ============================================================
//      EMPLOYEE MASTER ELIGIBILITY CHANGE
//      ============================================================ */

//   useEffect(() => {
//     const refreshEligibility = () => {
//       setRows((previousRows) => {
//         const syncedRows = syncEligibility(previousRows);

//         const changed = syncedRows.some(
//           (row, index) =>
//             row.eligibility !== previousRows[index]?.eligibility ||
//             row.eligibleReason !== previousRows[index]?.eligibleReason ||
//             row.manualEligibilityOverride !==
//               previousRows[index]?.manualEligibilityOverride,
//         );

//         return changed ? syncedRows : previousRows;
//       });
//     };

//     window.addEventListener(EMPLOYEE_MASTER_EVENT, refreshEligibility);

//     const handleStorageChange = (event) => {
//       if (event.key === EMPLOYEE_MASTER_STORAGE_KEY) {
//         refreshEligibility();
//       }
//     };

//     window.addEventListener("storage", handleStorageChange);

//     refreshEligibility();

//     return () => {
//       window.removeEventListener(EMPLOYEE_MASTER_EVENT, refreshEligibility);

//       window.removeEventListener("storage", handleStorageChange);
//     };
//   }, []);

//   /* ============================================================
//      EDIT LOGIC
//      ============================================================ */

//   const applyEdits = useCallback((ids, key, compute, source, batchId) => {
//     const entries = [];
//     const touched = {};

//     setRows((prev) =>
//       prev.map((row) => {
//         if (!ids.includes(row.id)) {
//           return row;
//         }

//         const next = compute(row);
//         const before = row[key];

//         if (String(before) === String(next)) {
//           return row;
//         }

//         entries.push({
//           id: nextId(),
//           at: new Date().toISOString(),
//           user: CURRENT_USER,
//           empId: row.empId,
//           employeeName: row.name,
//           field: labelOf(key),
//           from: String(before ?? ""),
//           to: String(next ?? ""),
//           source,
//           ...(batchId ? { batchId } : {}),
//         });

//         touched[`${row.id}:${key}`] = true;

//         return {
//           ...row,
//           [key]: next,
//         };
//       }),
//     );

//     if (entries.length) {
//       setAudit((prev) => [...entries.reverse(), ...prev]);

//       setModified((prev) => ({
//         ...prev,
//         ...touched,
//       }));
//     }

//     return entries.length;
//   }, []);

//   /* ============================================================
//      INLINE EDIT
//      ============================================================ */

//   const updateCell = useCallback(
//     (id, key, value, source = "Inline edit") => {
//       applyEdits([id], key, () => value, source);
//     },
//     [applyEdits],
//   );

//   /* ============================================================
//      BULK EDIT
//      ============================================================ */

//   const bulkUpdate = useCallback(
//     (ids, key, mode, value) => {
//       const batchId = nextId();

//       return applyEdits(
//         ids,
//         key,
//         (row) => {
//           if (mode === "set") {
//             return value;
//           }

//           const current = Number(row[key]) || 0;
//           const v = Number(value) || 0;

//           return mode === "increaseAmount"
//             ? Math.round(current + v)
//             : Math.round(current * (1 + v / 100));
//         },
//         "Bulk edit",
//         batchId,
//       );
//     },
//     [applyEdits],
//   );

//   /* ============================================================
//      AUDIT / EDIT HISTORY
//      ============================================================ */

//   const historyFor = useCallback(
//     (empId) => {
//       return audit
//         .filter((item) => String(item.empId) === String(empId))
//         .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
//     },
//     [audit],
//   );

//   /* ============================================================
//      EMPLOYEE APPRAISAL HISTORY
//      *
//      * IMPORTANT:
//      * This returns year-wise appraisal history stored on the
//      * employee row.
//      *
//      * It does NOT replace it with current-year data.
//      * ============================================================ */

//   const appraisalHistoryFor = useCallback((employee) => {
//     if (!employee) {
//       return [];
//     }

//     const possibleHistory =
//       employee.history ??
//       employee.appraisalHistory ??
//       employee.appraisal_history ??
//       employee.previousYears ??
//       employee.previousYearHistory ??
//       [];

//     if (Array.isArray(possibleHistory)) {
//       return possibleHistory;
//     }

//     return [];
//   }, []);

//   /* ============================================================
//      CONTEXT
//      ============================================================ */

//   const value = useMemo(
//     () => ({
//       rows,
//       audit,
//       modified,

//       updateCell,
//       bulkUpdate,

//       /*
//        * Edit/audit history.
//        */
//       historyFor,

//       /*
//        * Actual previous appraisal-year history.
//        */
//       appraisalHistoryFor,
//     }),
//     [
//       rows,
//       audit,
//       modified,
//       updateCell,
//       bulkUpdate,
//       historyFor,
//       appraisalHistoryFor,
//     ],
//   );

//   return _jsx(AppraisalContext.Provider, {
//     value,
//     children,
//   });
// }

// /* ============================================================
//    HOOK
//    ============================================================ */

// export function useAppraisal() {
//   const ctx = useContext(AppraisalContext);

//   if (!ctx) {
//     throw new Error("useAppraisal must be used inside AppraisalProvider");
//   }

//   return ctx;
// }

import { jsx as _jsx } from "react/jsx-runtime";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";

import { COLUMNS } from "./appraisal-data";

const CURRENT_USER = "Ashok Kumar (HR Ops)";

const AppraisalContext = createContext(null);

const labelOf = (key) =>
  COLUMNS.find((c) => c.key === key)?.label ?? String(key);

let seq = 0;

const nextId = () => `a${Date.now()}-${seq++}`;

/* ============================================================
   CATALYST API
   ============================================================ */

const EMPLOYEE_API_URL =
  "https://excelappraisal-904056216.development.catalystserverless.com/server/employee-api-v2/";
/* ============================================================
   STORAGE
   ============================================================ */

const EMPLOYEE_MASTER_STORAGE_KEY = "employee-master-employees";
const EMPLOYEE_MASTER_EVENT = "employee-master-updated";
const APPRAISAL_ROWS_STORAGE_KEY = "employee-appraisal-rows";
const APPRAISAL_AUDIT_STORAGE_KEY = "employee-appraisal-audit";

/* ============================================================
   EMPLOYEE MASTER
   ============================================================ */

const getEmployeeMasterMap = () => {
  try {
    const saved = localStorage.getItem(EMPLOYEE_MASTER_STORAGE_KEY);

    if (!saved) return null;

    const employees = JSON.parse(saved);

    if (!Array.isArray(employees)) return null;

    return new Map(
      employees
        .filter((employee) => employee?.empId)
        .map((employee) => [String(employee.empId), employee]),
    );
  } catch {
    return null;
  }
};

/* ============================================================
   CATALYST DATA → REACT DATA
   ============================================================ */

const mapCatalystEmployee = (employee, index) => {
  const id =
    employee.ROWID ??
    employee.rowid ??
    employee.id ??
    employee.emp_id ??
    `employee-${index + 1}`;

  return {
    id: String(id),

    empId: String(employee.emp_id ?? ""),

    name: String(employee.name ?? ""),

    designation: String(employee.designation ?? ""),

    reportingManager: String(employee.reporting_manager ?? ""),

    compManager: String(employee.comp_manager ?? ""),

    appraiserTechED: String(employee.appraiser_tech_ed ?? ""),

    wissenExperience: Number(employee.wissen_experience ?? 0),

    totalExperience: Number(employee.total_experience ?? 0),

    lastAppraisalDate: String(employee.last_appraisal_date ?? ""),

    managerRating: String(employee.manager_rating ?? ""),

    interviewCount: Number(employee.interview_count ?? 0),

    rrPercent: Number(employee.rr_percent ?? 0),

    grossMargin: Number(employee.gross_margin ?? 0),

    rbToBePaid: Number(employee.rb_to_be_paid ?? 0),

    monthRB: String(employee.month_rb ?? ""),

    pbToBePaid: Number(employee.pb_to_be_paid ?? 0),

    monthPB: String(employee.month_pb ?? ""),

    currentAnnualBasePay: Number(employee.current_annual_base_pay ?? 0),

    targetPBAllocatedForMay: Number(employee.target_pb_allocated_for_may ?? 0),

    allocatedPBAmount: Number(employee.allocated_pb_amount ?? 0),

    pbInstallment: String(employee.pb_installment ?? ""),

    newPBToBeOffered: Number(employee.new_pb_to_be_offered ?? 0),

    newPBInstallment: String(employee.new_pb_installment ?? ""),

    newRB: Number(employee.new_rb ?? 0),

    hikeAmount: Number(employee.hike_amount ?? 0),

    hikePct: Number(employee.hike_pct ?? 0),

    targetPBNextYear: Number(employee.target_pb_next_year ?? 0),

    eligibleForPromotion: String(employee.eligible_for_promotion ?? ""),

    newTitle: String(employee.new_title ?? ""),

    atRisk: String(employee.at_risk ?? ""),

    /* Existing fields used by older parts of the application */

    manager: String(employee.manager ?? ""),

    department: String(employee.department ?? ""),

    status: String(employee.status ?? "Active"),

    /* Keep these available if another component expects them */

    creatorId: employee.CREATORID ?? null,

    createdTime: employee.CREATEDTIME ?? null,

    modifiedTime: employee.MODIFIEDTIME ?? null,
  };
};

/* ============================================================
   FETCH EMPLOYEES FROM CATALYST
   ============================================================ */

const fetchEmployeesFromCatalyst = async () => {
  const response = await fetch(EMPLOYEE_API_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Employee API failed with status ${response.status}`);
  }

  const result = await response.json();

  /*
   * Catalyst Basic I/O normally returns:
   *
   * {
   *   output: "{\"success\":true,\"count\":30,\"data\":[...]}"
   * }
   *
   * But we also support a direct JSON response.
   */

  let payload = result;

  if (typeof result?.output === "string") {
    payload = JSON.parse(result.output);
  }

  if (!payload?.success) {
    throw new Error(
      payload?.message || "Employee API returned an unsuccessful response",
    );
  }

  const employees = Array.isArray(payload.data) ? payload.data : [];

  return employees.map(mapCatalystEmployee);
};

/* ============================================================
   ELIGIBILITY SYNC
   ============================================================ */

const syncEligibility = (rows) => {
  const employeeMap = getEmployeeMasterMap();

  if (!employeeMap) {
    return rows;
  }

  return rows.map((row) => {
    const employee = employeeMap.get(String(row.empId));

    if (!employee) {
      return row;
    }

    const isNotEligible = employee.eligible === "No";

    return {
      ...row,
      eligibility: isNotEligible ? "No" : "Yes",
      eligibleReason: employee.eligibleReason || "",
      manualEligibilityOverride: Boolean(employee.manualOverride),
    };
  });
};

/* ============================================================
   PROVIDER
   ============================================================ */

export function AppraisalProvider({ children }) {
  const [rows, setRows] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  /* ============================================================
     LOAD REAL EMPLOYEES FROM CATALYST
     ============================================================ */

  useEffect(() => {
    let cancelled = false;

    const loadEmployees = async () => {
      try {
        setLoading(true);
        setError("");

        const employees = await fetchEmployeesFromCatalyst();

        if (cancelled) return;

        if (!employees.length) {
          setRows([]);
          setError("No employees found in Catalyst Data Store.");
          return;
        }

        const syncedEmployees = syncEligibility(employees);

        setRows(syncedEmployees);
      } catch (err) {
        console.error("Failed to load employees:", err);

        if (cancelled) return;

        setRows([]);

        setError(err?.message || "Failed to load employees from Catalyst.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadEmployees();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ============================================================
     AUDIT
     ============================================================ */

  const [audit, setAudit] = useState(() => {
    try {
      const saved = localStorage.getItem(APPRAISAL_AUDIT_STORAGE_KEY);

      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [modified, setModified] = useState({});

  /* ============================================================
     SAVE ROWS
     ============================================================

     IMPORTANT:
     Employee rows are now coming from Catalyst.

     We intentionally DO NOT save the complete employee list
     back to localStorage as the source of truth.
     ============================================================ */

  /* ============================================================
     SAVE AUDIT
     ============================================================ */

  useEffect(() => {
    try {
      localStorage.setItem(APPRAISAL_AUDIT_STORAGE_KEY, JSON.stringify(audit));
    } catch {
      // Ignore localStorage errors
    }
  }, [audit]);

  /* ============================================================
     EMPLOYEE MASTER ELIGIBILITY CHANGE
     ============================================================ */

  useEffect(() => {
    const refreshEligibility = () => {
      setRows((previousRows) => {
        const syncedRows = syncEligibility(previousRows);

        const changed = syncedRows.some(
          (row, index) =>
            row.eligibility !== previousRows[index]?.eligibility ||
            row.eligibleReason !== previousRows[index]?.eligibleReason ||
            row.manualEligibilityOverride !==
              previousRows[index]?.manualEligibilityOverride,
        );

        return changed ? syncedRows : previousRows;
      });
    };

    window.addEventListener(EMPLOYEE_MASTER_EVENT, refreshEligibility);

    const handleStorageChange = (event) => {
      if (event.key === EMPLOYEE_MASTER_STORAGE_KEY) {
        refreshEligibility();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    refreshEligibility();

    return () => {
      window.removeEventListener(EMPLOYEE_MASTER_EVENT, refreshEligibility);

      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  /* ============================================================
     EDIT LOGIC
     ============================================================ */

  const applyEdits = useCallback((ids, key, compute, source, batchId) => {
    const entries = [];
    const touched = {};

    setRows((prev) =>
      prev.map((row) => {
        if (!ids.includes(row.id)) {
          return row;
        }

        const next = compute(row);
        const before = row[key];

        if (String(before) === String(next)) {
          return row;
        }

        entries.push({
          id: nextId(),
          at: new Date().toISOString(),
          user: CURRENT_USER,
          empId: row.empId,
          employeeName: row.name,
          field: labelOf(key),
          from: String(before ?? ""),
          to: String(next ?? ""),
          source,
          ...(batchId ? { batchId } : {}),
        });

        touched[`${row.id}:${key}`] = true;

        return {
          ...row,
          [key]: next,
        };
      }),
    );

    if (entries.length) {
      setAudit((prev) => [...entries.reverse(), ...prev]);

      setModified((prev) => ({
        ...prev,
        ...touched,
      }));
    }

    return entries.length;
  }, []);

  /* ============================================================
     INLINE EDIT
     ============================================================ */

  const updateCell = useCallback(
    (id, key, value, source = "Inline edit") => {
      applyEdits([id], key, () => value, source);
    },
    [applyEdits],
  );

  /* ============================================================
     BULK EDIT
     ============================================================ */

  const bulkUpdate = useCallback(
    (ids, key, mode, value) => {
      const batchId = nextId();

      return applyEdits(
        ids,
        key,
        (row) => {
          if (mode === "set") {
            return value;
          }

          const current = Number(row[key]) || 0;
          const v = Number(value) || 0;

          return mode === "increaseAmount"
            ? Math.round(current + v)
            : Math.round(current * (1 + v / 100));
        },
        "Bulk edit",
        batchId,
      );
    },
    [applyEdits],
  );

  /* ============================================================
     AUDIT / EDIT HISTORY
     ============================================================ */

  const historyFor = useCallback(
    (empId) => {
      return audit
        .filter((item) => String(item.empId) === String(empId))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    },
    [audit],
  );

  /* ============================================================
     EMPLOYEE APPRAISAL HISTORY
     ============================================================ */

  const appraisalHistoryFor = useCallback((employee) => {
    if (!employee) {
      return [];
    }

    const possibleHistory =
      employee.history ??
      employee.appraisalHistory ??
      employee.appraisal_history ??
      employee.previousYears ??
      employee.previousYearHistory ??
      [];

    if (Array.isArray(possibleHistory)) {
      return possibleHistory;
    }

    return [];
  }, []);

  /* ============================================================
     CONTEXT
     ============================================================ */

  const value = useMemo(
    () => ({
      rows,
      audit,
      modified,

      loading,
      error,

      updateCell,
      bulkUpdate,

      historyFor,

      appraisalHistoryFor,
    }),
    [
      rows,
      audit,
      modified,
      loading,
      error,
      updateCell,
      bulkUpdate,
      historyFor,
      appraisalHistoryFor,
    ],
  );

  return _jsx(AppraisalContext.Provider, {
    value,
    children,
  });
}

/* ============================================================
   HOOK
   ============================================================ */

export function useAppraisal() {
  const ctx = useContext(AppraisalContext);

  if (!ctx) {
    throw new Error("useAppraisal must be used inside AppraisalProvider");
  }

  return ctx;
}
