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
   CATALYST FIELD MAPPING
   ============================================================ */

const REACT_TO_CATALYST_FIELD = {
  empId: "emp_id",
  name: "name",
  designation: "designation",
  reportingManager: "reporting_manager",
  compManager: "comp_manager",
  appraiserTechED: "appraiser_tech_ed",

  wissenExperience: "wissen_experience",
  totalExperience: "total_experience",

  lastAppraisalDate: "last_appraisal_date",
  managerRating: "manager_rating",
  interviewCount: "interview_count",
  rrPercent: "rr_percent",
  grossMargin: "gross_margin",

  rbToBePaid: "rb_to_be_paid",
  monthRB: "month_rb",

  pbToBePaid: "pb_to_be_paid",
  monthPB: "month_pb",

  currentAnnualBasePay: "current_annual_base_pay",

  targetPBAllocatedForMay: "target_pb_allocated_for_may",
  allocatedPBAmount: "allocated_pb_amount",

  pbInstallment: "pb_installment",

  newPBToBeOffered: "new_pb_to_be_offered",
  newPBInstallment: "new_pb_installment",

  newRB: "new_rb",

  hikeAmount: "hike_amount",
  hikePct: "hike_pct",

  targetPBNextYear: "target_pb_next_year",

  eligibleForPromotion: "eligible_for_promotion",
  newTitle: "new_title",

  atRisk: "at_risk",

  manager: "manager",
  department: "department",
  status: "status",
};

/* ============================================================
   VALUE NORMALIZATION
   ============================================================ */

const NUMERIC_FIELDS = new Set([
  "wissenExperience",
  "totalExperience",
  "interviewCount",
  "rrPercent",
  "grossMargin",
  "rbToBePaid",
  "pbToBePaid",
  "currentAnnualBasePay",
  "targetPBAllocatedForMay",
  "allocatedPBAmount",
  "newPBToBeOffered",
  "newRB",
  "hikeAmount",
  "hikePct",
  "targetPBNextYear",
]);

const normalizeValueForCatalyst = (key, value) => {
  if (value === "" || value === null || value === undefined) {
    return value;
  }

  if (NUMERIC_FIELDS.has(key)) {
    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  return value;
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

    manager: String(employee.manager ?? ""),

    department: String(employee.department ?? ""),

    status: String(employee.status ?? "Active"),

    creatorId: employee.CREATORID ?? null,

    createdTime: employee.CREATEDTIME ?? null,

    modifiedTime: employee.MODIFIEDTIME ?? null,
  };
};

/* ============================================================
   FETCH ONE PAGE FROM CATALYST
   ============================================================ */

const fetchEmployeePageFromCatalyst = async (page = 1, limit = 100) => {
  const url = new URL(EMPLOYEE_API_URL);

  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Employee API failed with status ${response.status}`);
  }

  const result = await response.json();

  let payload = result;

  if (typeof result?.output === "string") {
    try {
      payload = JSON.parse(result.output);
    } catch {
      throw new Error("Employee API returned invalid JSON output.");
    }
  }

  if (!payload?.success) {
    throw new Error(
      payload?.message || "Employee API returned an unsuccessful response.",
    );
  }

  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    pagination: payload.pagination || {},
    counts: payload.counts || {},
  };
};

/* ============================================================
   FETCH ALL EMPLOYEES
   ============================================================ */

const fetchEmployeesFromCatalyst = async () => {
  const allEmployees = [];

  let page = 1;
  const limit = 100;

  let totalPages = 1;

  do {
    const result = await fetchEmployeePageFromCatalyst(page, limit);

    allEmployees.push(...result.data);

    totalPages = Math.max(1, Number(result.pagination?.totalPages || 1));

    page += 1;
  } while (page <= totalPages);

  return allEmployees.map(mapCatalystEmployee);
};

/* ============================================================
   UPDATE ONE EMPLOYEE IN CATALYST
   ============================================================ */

const updateEmployeeInCatalyst = async (empId, key, value) => {
  const catalystField = REACT_TO_CATALYST_FIELD[key];

  if (!catalystField) {
    console.warn(`No Catalyst field mapping found for React field: ${key}`);

    return;
  }

  const catalystValue = normalizeValueForCatalyst(key, value);

  const response = await fetch(EMPLOYEE_API_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      emp_id: String(empId),
      [catalystField]: catalystValue,
    }),
  });

  if (!response.ok) {
    let message = `Employee update failed with status ${response.status}`;

    try {
      const result = await response.json();

      message = result?.message || message;
    } catch {
      // Ignore JSON parsing error.
    }

    throw new Error(message);
  }

  const result = await response.json();

  if (!result?.success) {
    throw new Error(result?.message || `Failed to update employee ${empId}.`);
  }

  return result.data;
};

/* ============================================================
   PERSIST MULTIPLE FIELD CHANGES
   ============================================================ */

const persistEmployeeChanges = async (empId, changes) => {
  const entries = Object.entries(changes);

  if (!entries.length) {
    return;
  }

  for (const [key, value] of entries) {
    try {
      await updateEmployeeInCatalyst(empId, key, value);
    } catch (error) {
      console.error(`Failed to save ${key} for employee ${empId}:`, error);
    }
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
  const [rows, setRows] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  /* ==========================================================
     LOAD REAL EMPLOYEES FROM CATALYST
     ========================================================== */

  useEffect(() => {
    let cancelled = false;

    const loadEmployees = async () => {
      try {
        setLoading(true);
        setError("");

        const employees = await fetchEmployeesFromCatalyst();

        if (cancelled) {
          return;
        }

        if (!employees.length) {
          setRows([]);

          setError("No employees found in Catalyst Data Store.");

          return;
        }

        const syncedEmployees = syncEligibility(employees);

        setRows(syncedEmployees);
      } catch (err) {
        console.error("Failed to load employees:", err);

        if (cancelled) {
          return;
        }

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

  /* ==========================================================
     AUDIT
     ========================================================== */

  const [audit, setAudit] = useState(() => {
    try {
      const saved = localStorage.getItem(APPRAISAL_AUDIT_STORAGE_KEY);

      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [modified, setModified] = useState({});

  /* ==========================================================
     SAVE AUDIT
     ========================================================== */

  useEffect(() => {
    try {
      localStorage.setItem(APPRAISAL_AUDIT_STORAGE_KEY, JSON.stringify(audit));
    } catch {
      // Ignore localStorage errors.
    }
  }, [audit]);

  /* ==========================================================
     EMPLOYEE MASTER ELIGIBILITY CHANGE
     ========================================================== */

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

  /* ==========================================================
     APPLY EDITS
     ========================================================== */

  const applyEdits = useCallback((ids, key, compute, source, batchId) => {
    const entries = [];
    const touched = {};

    const persistenceQueue = [];

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

        persistenceQueue.push({
          empId: row.empId,
          key,
          value: next,
        });

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

      /*
       * Persist after local state is updated.
       *
       * The UI remains immediate while Catalyst
       * is updated in the background.
       */
      void Promise.all(
        persistenceQueue.map(({ empId, key, value }) =>
          updateEmployeeInCatalyst(empId, key, value).catch((error) => {
            console.error(`Catalyst save failed for ${empId} / ${key}:`, error);
          }),
        ),
      );
    }

    return entries.length;
  }, []);

  /* ==========================================================
     INLINE EDIT
     ========================================================== */

  const updateCell = useCallback(
    (id, key, value, source = "Inline edit") => {
      return applyEdits([id], key, () => value, source);
    },
    [applyEdits],
  );

  /* ==========================================================
     BULK EDIT
     ========================================================== */

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

  /* ==========================================================
     AUDIT / EDIT HISTORY
     ========================================================== */

  const historyFor = useCallback(
    (empId) => {
      return audit
        .filter((item) => String(item.empId) === String(empId))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    },
    [audit],
  );

  /* ==========================================================
     EMPLOYEE APPRAISAL HISTORY
     ========================================================== */

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

  /* ==========================================================
     CONTEXT
     ========================================================== */

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
