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
  const [rows, setRows] = useState(() => {
    try {
      const saved = localStorage.getItem(APPRAISAL_ROWS_STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved);

        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed[0].currentAnnualBasePay !== undefined
        ) {
          return syncEligibility(parsed);
        }
      }

      return syncEligibility(buildEmployees(250));
    } catch {
      return syncEligibility(buildEmployees(250));
    }
  });

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
     ============================================================ */

  useEffect(() => {
    localStorage.setItem(APPRAISAL_ROWS_STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  /* ============================================================
     SAVE AUDIT
     ============================================================ */

  useEffect(() => {
    localStorage.setItem(APPRAISAL_AUDIT_STORAGE_KEY, JSON.stringify(audit));
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
     *
     * IMPORTANT:
     * This returns year-wise appraisal history stored on the
     * employee row.
     *
     * It does NOT replace it with current-year data.
     * ============================================================ */

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

      updateCell,
      bulkUpdate,

      /*
       * Edit/audit history.
       */
      historyFor,

      /*
       * Actual previous appraisal-year history.
       */
      appraisalHistoryFor,
    }),
    [
      rows,
      audit,
      modified,
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
