// import { jsx as _jsx } from "react/jsx-runtime";
// import { createContext, useCallback, useContext, useMemo, useState, useEffect } from "react";
// import { buildEmployees, COLUMNS, } from "./appraisal-data";
// const CURRENT_USER = "Ashok Kumar (HR Ops)";
// const AppraisalContext = createContext(null);
// const labelOf = (key) => COLUMNS.find((c) => c.key === key)?.label ?? String(key);
// let seq = 0;
// const nextId = () => `a${Date.now()}-${seq++}`;
// export function AppraisalProvider({ children }) {
//     const [rows, setRows] = useState(() => {
//         try {
//             const saved = localStorage.getItem("employee-appraisal-rows");

//             if (saved) {
//                 const parsed = JSON.parse(saved);

//                 // If the browser contains data from the previous
//                 // column structure, regenerate the demo rows so the
//                 // new appraisal columns are populated.
//                 if (
//                     Array.isArray(parsed) &&
//                     parsed.length > 0 &&
//                     parsed[0].currentAnnualBasePay !== undefined
//                 ) {
//                     return parsed;
//                 }
//             }

//             return buildEmployees(250);
//         }
//         catch {
//             return buildEmployees(250);
//         }
//     });
//     const [audit, setAudit] = useState(() => {
//         try {
//             const saved = localStorage.getItem("employee-appraisal-audit");
//             return saved ? JSON.parse(saved) : [];
//         }
//         catch {
//             return [];
//         }
//     });
//     const [modified, setModified] = useState({});
//     useEffect(() => {
//         localStorage.setItem("employee-appraisal-rows", JSON.stringify(rows));
//     }, [rows]);
//     useEffect(() => {
//         localStorage.setItem("employee-appraisal-audit", JSON.stringify(audit));
//     }, [audit]);
//     const applyEdits = useCallback((ids, key, compute, source, batchId) => {
//         const entries = [];
//         const touched = {};
//         setRows((prev) => prev.map((row) => {
//             if (!ids.includes(row.id))
//                 return row;
//             const next = compute(row);
//             const before = row[key];
//             if (String(before) === String(next))
//                 return row;
//             entries.push({
//                 id: nextId(),
//                 at: new Date().toISOString(),
//                 user: CURRENT_USER,
//                 empId: row.empId,
//                 employeeName: row.name,
//                 field: labelOf(key),
//                 from: String(before),
//                 to: String(next),
//                 source,
//                 ...(batchId ? { batchId } : {}),
//             });
//             touched[`${row.id}:${key}`] = true;
//             return { ...row, [key]: next };
//         }));
//         if (entries.length) {
//             setAudit((prev) => [...entries.reverse(), ...prev]);
//             setModified((prev) => ({ ...prev, ...touched }));
//         }
//         return entries.length;
//     }, []);
//     const updateCell = useCallback((id, key, value, source = "Inline edit") => {
//         applyEdits([id], key, () => value, source);
//     }, [applyEdits]);
//     const bulkUpdate = useCallback((ids, key, mode, value) => {
//         const batchId = nextId();
//         return applyEdits(ids, key, (row) => {
//             if (mode === "set")
//                 return value;
//             const current = Number(row[key]) || 0;
//             const v = Number(value) || 0;
//             return mode === "increaseAmount"
//                 ? Math.round(current + v)
//                 : Math.round(current * (1 + v / 100));
//         }, "Bulk edit", batchId);
//     }, [applyEdits]);
//     const historyFor = useCallback((empId) => audit.filter((a) => a.empId === empId), [audit]);
//     const value = useMemo(() => ({ rows, audit, modified, updateCell, bulkUpdate, historyFor }), [rows, audit, modified, updateCell, bulkUpdate, historyFor]);
//     return _jsx(AppraisalContext.Provider, { value: value, children: children });
// }
// export function useAppraisal() {
//     const ctx = useContext(AppraisalContext);
//     if (!ctx)
//         throw new Error("useAppraisal must be used inside AppraisalProvider");
//     return ctx;
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

import { buildEmployees, COLUMNS } from "./appraisal-data";

const CURRENT_USER = "Ashok Kumar (HR Ops)";

const AppraisalContext = createContext(null);

const labelOf = (key) =>
  COLUMNS.find((c) => c.key === key)?.label ?? String(key);

let seq = 0;

const nextId = () => `a${Date.now()}-${seq++}`;

/* ============================================================
   EMPLOYEE MASTER STORAGE
   ============================================================ */

const EMPLOYEE_MASTER_STORAGE_KEY = "employee-master-employees";
const EMPLOYEE_MASTER_EVENT = "employee-master-updated";

/* ============================================================
   READ EMPLOYEE MASTER
   ============================================================ */

const getEmployeeMasterMap = () => {
  try {
    const saved = localStorage.getItem(EMPLOYEE_MASTER_STORAGE_KEY);

    if (!saved) {
      return null;
    }

    const employees = JSON.parse(saved);

    if (!Array.isArray(employees)) {
      return null;
    }

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
   SYNC ELIGIBILITY
   ============================================================ */

const syncEligibility = (rows) => {
  const employeeMap = getEmployeeMasterMap();

  /*
   * If Employee Master has not been created/saved yet,
   * don't modify the existing appraisal rows.
   */
  if (!employeeMap) {
    return rows;
  }

  return rows.map((row) => {
    const employee = employeeMap.get(String(row.empId));

    /*
     * If there is no matching Employee Master record,
     * leave the appraisal row exactly as it is.
     */
    if (!employee) {
      return row;
    }

    const isNotEligible = employee.eligible === "No";

    return {
      ...row,

      /*
       * Employee Master is the source of truth.
       */
      eligibility: isNotEligible ? "No" : "Yes",

      /*
       * Keep the reason available for future use/UI.
       */
      eligibleReason: employee.eligibleReason || "",

      /*
       * Keep track of whether eligibility was manually overridden.
       */
      manualEligibilityOverride: Boolean(employee.manualOverride),
    };
  });
};

/* ============================================================
   APPRAISAL PROVIDER
   ============================================================ */

export function AppraisalProvider({ children }) {
  const [rows, setRows] = useState(() => {
    try {
      const saved = localStorage.getItem("employee-appraisal-rows");

      if (saved) {
        const parsed = JSON.parse(saved);

        /*
         * If the browser contains data from the previous
         * column structure, regenerate the demo rows so the
         * new appraisal columns are populated.
         */
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed[0].currentAnnualBasePay !== undefined
        ) {
          /*
           * IMPORTANT:
           * Keep the existing appraisal data.
           * Only synchronize eligibility.
           */
          return syncEligibility(parsed);
        }
      }

      /*
       * First-time initialization.
       */
      return syncEligibility(buildEmployees(250));
    } catch {
      return syncEligibility(buildEmployees(250));
    }
  });

  const [audit, setAudit] = useState(() => {
    try {
      const saved = localStorage.getItem("employee-appraisal-audit");

      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [modified, setModified] = useState({});

  /* ============================================================
     SAVE APPRAISAL ROWS
     ============================================================ */

  useEffect(() => {
    localStorage.setItem("employee-appraisal-rows", JSON.stringify(rows));
  }, [rows]);

  /* ============================================================
     SAVE AUDIT
     ============================================================ */

  useEffect(() => {
    localStorage.setItem("employee-appraisal-audit", JSON.stringify(audit));
  }, [audit]);

  /* ============================================================
     EMPLOYEE MASTER ELIGIBILITY CHANGE
     ============================================================ */

  useEffect(() => {
    const refreshEligibility = () => {
      setRows((previousRows) => {
        const syncedRows = syncEligibility(previousRows);

        /*
         * Avoid unnecessary state updates.
         */
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

    /*
     * EmployeeMaster.jsx dispatches this event after
     * saving eligibility changes.
     */
    window.addEventListener(EMPLOYEE_MASTER_EVENT, refreshEligibility);

    /*
     * Also support changes coming from another browser tab.
     */
    const handleStorageChange = (event) => {
      if (event.key === EMPLOYEE_MASTER_STORAGE_KEY) {
        refreshEligibility();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    /*
     * Initial synchronization after provider mounts.
     */
    refreshEligibility();

    return () => {
      window.removeEventListener(EMPLOYEE_MASTER_EVENT, refreshEligibility);

      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  /* ============================================================
     EXISTING EDIT LOGIC
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
          from: String(before),
          to: String(next),
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
     HISTORY
     ============================================================ */

  const historyFor = useCallback(
    (empId) => audit.filter((a) => a.empId === empId),
    [audit],
  );

  /* ============================================================
     CONTEXT VALUE
     ============================================================ */

  const value = useMemo(
    () => ({
      rows,
      audit,
      modified,
      updateCell,
      bulkUpdate,
      historyFor,
    }),
    [rows, audit, modified, updateCell, bulkUpdate, historyFor],
  );

  return _jsx(AppraisalContext.Provider, {
    value: value,
    children: children,
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
