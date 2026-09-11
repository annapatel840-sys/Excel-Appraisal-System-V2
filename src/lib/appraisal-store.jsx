import { jsx as _jsx } from "react/jsx-runtime";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { COLUMNS } from "./appraisal-data";

const CURRENT_USER = "Ashok Kumar (HR Ops)";

const AppraisalContext = createContext(null);

let seq = 0;

const nextId = () => `a${Date.now()}-${seq++}`;

const EMPLOYEE_API_URL =
  "https://excelappraisal-904056216.development.catalystserverless.com/server/employee-api-v2/";

/*
 * IMPORTANT:
 *
 * appraisal-history-api is NOT used here for saving changes.
 *
 * AppraisalGrid uses appraisal-history-api separately to FETCH
 * previous appraisal history for the History panel.
 */

/*
 * Each employee gets its own save queue.
 *
 * This prevents two quick edits on the same employee from
 * running PATCH requests at the same time and causing one
 * update
 * to overwrite another.
 */
const employeeSaveQueues = new Map();

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

const labelOf = (key) =>
  COLUMNS.find((column) => column.key === key)?.label ?? String(key);

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

const parseApiResponse = async (response, apiName) => {
  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(`${apiName} returned invalid JSON.`);
  }

  let payload = result;

  /*
   * Catalyst may return:
   *
   * {
   *   output: "{\"success\":true,...}"
   * }
   *
   * So unwrap output when required.
   */
  if (typeof result?.output === "string") {
    try {
      payload = JSON.parse(result.output);
    } catch {
      throw new Error(`${apiName} returned invalid JSON output.`);
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.message || `${apiName} failed with status ${response.status}.`,
    );
  }

  if (!payload?.success) {
    throw new Error(
      payload?.message || `${apiName} returned an unsuccessful response.`,
    );
  }

  return payload;
};

/*
 * ------------------------------------------------------------
 * GET EMPLOYEE PAGE
 * ------------------------------------------------------------
 */

const fetchEmployeePageFromCatalyst = async (
  page = 1,
  limit = 30,
  status = "",
) => {
  const url = new URL(EMPLOYEE_API_URL);

  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

  if (status) {
    url.searchParams.set("status", status);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const payload = await parseApiResponse(response, "Employee API");

  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    pagination: payload.pagination || {},
    counts: payload.counts || {},
  };
};

/*
 * ------------------------------------------------------------
 * GET ALL EMPLOYEES
 * ------------------------------------------------------------
 *
 * Used by the Appraisal Sheet.
 *
 * Employee Master will use server-side pagination separately.
 */

const fetchAllEmployeesFromCatalyst = async (status = "") => {
  const firstPage = await fetchEmployeePageFromCatalyst(1, 100, status);

  const allEmployees = [...firstPage.data];

  const totalPages = Math.max(1, Number(firstPage.pagination?.totalPages || 1));

  if (totalPages > 1) {
    for (let page = 2; page <= totalPages; page += 1) {
      const result = await fetchEmployeePageFromCatalyst(page, 100, status);

      allEmployees.push(...result.data);
    }
  }

  return {
    employees: allEmployees,
    counts: firstPage.counts || {},
    pagination: firstPage.pagination || {},
  };
};

/*
 * ------------------------------------------------------------
 * GET ONE EMPLOYEE
 * ------------------------------------------------------------
 *
 * This is important for saving edits.
 *
 * Flow:
 *
 * PATCH employee
 *      ↓
 * GET employee again
 *      ↓
 * database becomes source of truth
 *      ↓
 * update React row
 */

const fetchEmployeeByIdFromCatalyst = async (empId) => {
  const url = new URL(EMPLOYEE_API_URL);

  url.searchParams.set("emp_id", String(empId));

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const payload = await parseApiResponse(response, "Employee API");

  if (!payload.data) {
    throw new Error(`Employee ${empId} was not returned from the database.`);
  }

  return payload.data;
};

/*
 * ------------------------------------------------------------
 * PATCH EMPLOYEE
 * ------------------------------------------------------------
 */

const saveEmployeeChangeToCatalyst = async ({ empId, key, newValue }) => {
  const catalystField = REACT_TO_CATALYST_FIELD[key];

  if (!catalystField) {
    throw new Error(`No Catalyst field mapping found for React field: ${key}`);
  }

  const catalystValue = normalizeValueForCatalyst(key, newValue);

  const response = await fetch(EMPLOYEE_API_URL, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      emp_id: String(empId),
      [catalystField]: catalystValue,
    }),
  });

  const payload = await parseApiResponse(response, "Employee API");

  return payload.data;
};

/*
 * ------------------------------------------------------------
 * EMPLOYEE SAVE QUEUE
 * ------------------------------------------------------------
 *
 * Same employee:
 *
 * Edit 1
 *   ↓
 * PATCH
 *   ↓
 * GET
 *   ↓
 * Edit 2
 *   ↓
 * PATCH
 *   ↓
 * GET
 *
 * Different employees can still save independently.
 */

const queueEmployeeSave = (empId, saveFunction) => {
  const employeeKey = String(empId);

  const previousPromise =
    employeeSaveQueues.get(employeeKey) || Promise.resolve();

  const nextPromise = previousPromise
    .catch(() => {
      /*
       * Allow the next edit to continue even if the
       * previous edit failed.
       */
    })
    .then(saveFunction);

  employeeSaveQueues.set(
    employeeKey,
    nextPromise.finally(() => {
      if (employeeSaveQueues.get(employeeKey) === nextPromise) {
        employeeSaveQueues.delete(employeeKey);
      }
    }),
  );

  return nextPromise;
};

export function AppraisalProvider({ children }) {
  const [rows, setRows] = useState([]);

  /*
   * Local audit entries for the current application session.
   *
   * IMPORTANT:
   * This is NOT the appraisal history API.
   *
   * A dedicated database audit table/API will be added
   * separately in the next step.
   */
  const [audit, setAudit] = useState([]);

  const [modified, setModified] = useState({});

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [employeeCounts, setEmployeeCounts] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  /*
   * ----------------------------------------------------------
   * LOAD ACTIVE EMPLOYEES
   * ----------------------------------------------------------
   *
   * Used by Appraisal Sheet.
   */

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await fetchAllEmployeesFromCatalyst("active");

      const employees = result.employees.map(mapCatalystEmployee);

      setRows(employees);

      setEmployeeCounts({
        total: Number(result.counts?.total || 0),
        active: Number(result.counts?.active || 0),
        inactive: Number(result.counts?.inactive || 0),
      });

      if (!employees.length) {
        setError("No active employees found in Catalyst Data Store.");
      }
    } catch (err) {
      console.error("Failed to load employees:", err);

      setRows([]);

      setError(err?.message || "Failed to load employees from Catalyst.");
    } finally {
      setLoading(false);
    }
  }, []);

  /*
   * ----------------------------------------------------------
   * INITIAL LOAD
   * ----------------------------------------------------------
   *
   * NO appraisal-history-api call here.
   */

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const result = await fetchAllEmployeesFromCatalyst("active");

        if (cancelled) {
          return;
        }

        const employees = result.employees.map(mapCatalystEmployee);

        setRows(employees);

        setEmployeeCounts({
          total: Number(result.counts?.total || 0),
          active: Number(result.counts?.active || 0),
          inactive: Number(result.counts?.inactive || 0),
        });

        if (!employees.length) {
          setError("No active employees found in Catalyst Data Store.");
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error("Failed to load employees:", err);

        setRows([]);

        setError(err?.message || "Failed to load employees from Catalyst.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * ----------------------------------------------------------
   * APPLY EDITS
   * ----------------------------------------------------------
   *
   * 1. Update UI immediately.
   * 2. PATCH database.
   * 3. GET employee again.
   * 4. Replace UI row with fresh database row.
   *
   * appraisal-history-api is NOT called here.
   */

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

        /*
         * Do nothing when value did not actually change.
         */
        if (String(before ?? "") === String(next ?? "")) {
          return row;
        }

        const entry = {
          id: nextId(),
          at: new Date().toISOString(),
          user: CURRENT_USER,
          empId: row.empId,
          employeeName: row.name,
          field: labelOf(key),
          from: String(before ?? ""),
          to: String(next ?? ""),
          source: source || "Inline edit",
          ...(batchId ? { batchId } : {}),
        };

        entries.push(entry);

        touched[`${row.id}:${key}`] = true;

        persistenceQueue.push({
          empId: row.empId,
          employeeName: row.name,
          key,
          oldValue: before,
          newValue: next,
          source,
          batchId,
        });

        /*
         * Optimistic UI update.
         */
        return {
          ...row,
          [key]: next,
        };
      }),
    );

    if (!entries.length) {
      return 0;
    }

    /*
     * Keep local audit immediately.
     *
     * This will later be replaced/extended with the
     * dedicated database audit API.
     */
    setAudit((prev) => [...entries.slice().reverse(), ...prev]);

    setModified((prev) => ({
      ...prev,
      ...touched,
    }));

    /*
     * Persist every changed field.
     */
    persistenceQueue.forEach(
      ({ empId, employeeName, key, oldValue, newValue, source, batchId }) => {
        void queueEmployeeSave(empId, async () => {
          try {
            console.log("Saving employee change:", empId, key, newValue);

            /*
             * STEP 1:
             * Update Employee Data Store.
             */
            await saveEmployeeChangeToCatalyst({
              empId,
              key,
              newValue,
            });

            console.log("PATCH successful:", empId, key);

            /*
             * STEP 2:
             * Get the employee again from the database.
             */
            const freshEmployee = await fetchEmployeeByIdFromCatalyst(empId);

            /*
             * Convert Catalyst row to React row.
             */
            const freshReactEmployee = mapCatalystEmployee(freshEmployee, 0);

            /*
             * STEP 3:
             * Database is now the source of truth.
             *
             * Replace the complete employee row.
             */
            setRows((prev) =>
              prev.map((row) =>
                String(row.empId) === String(empId)
                  ? {
                      ...freshReactEmployee,
                      id: row.id,
                    }
                  : row,
              ),
            );

            /*
             * Update local audit "to" value using
             * the value that actually exists in DB.
             */
            const actualCatalystField = REACT_TO_CATALYST_FIELD[key];

            const actualReactValue = freshReactEmployee[key];

            setAudit((prev) =>
              prev.map((item) => {
                if (
                  item.empId === empId &&
                  item.field === labelOf(key) &&
                  item.to === String(newValue ?? "") &&
                  item.from === String(oldValue ?? "")
                ) {
                  return {
                    ...item,
                    to: String(actualReactValue ?? ""),
                    saved: true,
                  };
                }

                return item;
              }),
            );

            console.log(
              "Database refresh successful:",
              empId,
              actualCatalystField,
              actualReactValue,
            );

            return freshReactEmployee;
          } catch (saveError) {
            console.error(
              `Employee save failed for ${empId} / ${key}:`,
              saveError,
            );

            /*
             * If PATCH or GET fails, fetch the current
             * database value and restore the UI.
             */
            try {
              const currentEmployee =
                await fetchEmployeeByIdFromCatalyst(empId);

              const currentReactEmployee = mapCatalystEmployee(
                currentEmployee,
                0,
              );

              setRows((prev) =>
                prev.map((row) =>
                  String(row.empId) === String(empId)
                    ? {
                        ...currentReactEmployee,
                        id: row.id,
                      }
                    : row,
                ),
              );
            } catch (refreshError) {
              console.error(
                "Could not restore employee from database:",
                refreshError,
              );
            }

            /*
             * Remove the local audit entry because
             * the database update did not succeed.
             */
            setAudit((prev) =>
              prev.filter(
                (item) =>
                  !(
                    item.empId === empId &&
                    item.field === labelOf(key) &&
                    item.to === String(newValue ?? "") &&
                    item.from === String(oldValue ?? "")
                  ),
              ),
            );

            throw saveError;
          }
        }).catch(() => {
          /*
           * Error has already been handled above.
           *
           * We intentionally do not throw into React
           * because this is a background persistence
           * operation.
           */
        });
      },
    );

    return entries.length;
  }, []);

  /*
   * ----------------------------------------------------------
   * SINGLE CELL UPDATE
   * ----------------------------------------------------------
   */

  const updateCell = useCallback(
    (id, key, value, source = "Inline edit") => {
      return applyEdits([id], key, () => value, source);
    },
    [applyEdits],
  );

  /*
   * ----------------------------------------------------------
   * BULK UPDATE
   * ----------------------------------------------------------
   */

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

          const numericValue = Number(value) || 0;

          if (mode === "increaseAmount") {
            return Math.round(current + numericValue);
          }

          return Math.round(current * (1 + numericValue / 100));
        },
        "Bulk edit",
        batchId,
      );
    },
    [applyEdits],
  );

  /*
   * ----------------------------------------------------------
   * UPDATE EMPLOYEE STATUS
   * ----------------------------------------------------------
   *
   * Used by Eligibility List.
   *
   * This does NOT change the eligibility logic.
   */

  const updateEmployeeStatus = useCallback(
    async (empId, status) => {
      const normalizedStatus =
        String(status).toLowerCase() === "inactive" ? "Inactive" : "Active";

      const currentEmployee = rows.find(
        (row) => String(row.empId) === String(empId),
      );

      const wasActive =
        String(currentEmployee?.status || "").toLowerCase() === "active";

      /*
       * Update database.
       */
      const response = await fetch(EMPLOYEE_API_URL, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          emp_id: String(empId),
          status: normalizedStatus,
        }),
      });

      const payload = await parseApiResponse(response, "Employee API");

      /*
       * Get fresh database record after update.
       */
      let freshEmployee = payload.data;

      try {
        freshEmployee = await fetchEmployeeByIdFromCatalyst(empId);
      } catch (refreshError) {
        console.warn(
          "Could not refresh employee after status update:",
          refreshError,
        );
      }

      const freshReactEmployee = mapCatalystEmployee(freshEmployee, 0);

      /*
       * Appraisal Sheet contains only active employees.
       */
      if (normalizedStatus === "Inactive") {
        setRows((prev) =>
          prev.filter((row) => String(row.empId) !== String(empId)),
        );
      } else {
        setRows((prev) =>
          prev.map((row) =>
            String(row.empId) === String(empId)
              ? {
                  ...freshReactEmployee,
                  id: row.id,
                }
              : row,
          ),
        );
      }

      /*
       * Update global counts.
       */
      setEmployeeCounts((prev) => {
        if (wasActive && normalizedStatus === "Inactive") {
          return {
            ...prev,
            active: Math.max(0, prev.active - 1),
            inactive: prev.inactive + 1,
          };
        }

        if (!wasActive && normalizedStatus === "Active") {
          return {
            ...prev,
            active: prev.active + 1,
            inactive: Math.max(0, prev.inactive - 1),
          };
        }

        return prev;
      });

      return freshEmployee;
    },
    [rows],
  );

  /*
   * ----------------------------------------------------------
   * LOCAL CHANGE HISTORY
   * ----------------------------------------------------------
   *
   * This is only the current-session local audit.
   *
   * It is NOT appraisal-history-api.
   *
   * Database audit storage will be implemented separately.
   */

  const historyFor = useCallback(
    (empId) => {
      return audit
        .filter((item) => String(item.empId) === String(empId))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    },
    [audit],
  );

  /*
   * ----------------------------------------------------------
   * PREVIOUS-YEAR APPRAISAL HISTORY
   * ----------------------------------------------------------
   *
   * AppraisalGrid handles the actual API request:
   *
   * GET /appraisal-history-api/?emp_id=...
   *
   * We do NOT fetch or save that data here.
   */

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

    return Array.isArray(possibleHistory) ? possibleHistory : [];
  }, []);

  /*
   * ----------------------------------------------------------
   * REFRESH EMPLOYEES
   * ----------------------------------------------------------
   */

  const refreshEmployees = useCallback(async () => {
    await loadEmployees();
  }, [loadEmployees]);

  /*
   * ----------------------------------------------------------
   * CONTEXT VALUE
   * ----------------------------------------------------------
   */

  const value = useMemo(
    () => ({
      rows,
      audit,
      modified,

      loading,
      error,

      employeeCounts,

      updateCell,
      bulkUpdate,
      updateEmployeeStatus,

      historyFor,
      appraisalHistoryFor,

      refreshEmployees,
    }),
    [
      rows,
      audit,
      modified,
      loading,
      error,
      employeeCounts,
      updateCell,
      bulkUpdate,
      updateEmployeeStatus,
      historyFor,
      appraisalHistoryFor,
      refreshEmployees,
    ],
  );

  return _jsx(AppraisalContext.Provider, {
    value,
    children,
  });
}

export function useAppraisal() {
  const ctx = useContext(AppraisalContext);

  if (!ctx) {
    throw new Error("useAppraisal must be used inside AppraisalProvider");
  }

  return ctx;
}
