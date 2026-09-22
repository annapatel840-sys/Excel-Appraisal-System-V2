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
const APPRAISAL_YEAR = "Apr-26";

const AppraisalContext = createContext(null);

let seq = 0;

const nextId = () => `a${Date.now()}-${seq++}`;

/* ============================================================
CATALYST API
============================================================ */

const EMPLOYEE_API_URL =
  "https://excelappraisal-904056216.development.catalystserverless.com/server/employee-api-v2/";

const AUDIT_API_URL =
  "https://excelappraisal-904056216.development.catalystserverless.com/server/appraisal-audit-api/";

const APPRAISAL_HISTORY_API_URL =
  "https://excelappraisal-904056216.development.catalystserverless.com/server/appraisal-history-api/";

/* ============================================================
EMPLOYEE SAVE QUEUE
============================================================ */

const employeeSaveQueues = new Map();

/* ============================================================
REACT → CATALYST EMPLOYEE FIELD MAPPING
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
REACT → PREVIOUS APPRAISAL FIELD MAPPING
============================================================ */

const REACT_TO_HISTORY_FIELD = {
  currentAnnualBasePay: "base_pay",

  targetPBAllocatedForMay: "allocated_pb",

  pbInstallment: "allocated_pb_installment",

  pbToBePaid: "performance_bonus",

  newPBInstallment: "performance_bonus_installment",

  newRB: "retention_bonus",

  totalOfPB: "total_pb",

  totalBonus: "total_bonus",

  hikeAmount: "hike_amount",

  hikePct: "hike_pct",

  eligibleForPromotion: "promotion",

  newTitle: "title",

  targetPBNextYear: "target_performance_bonus",

  rating: "rating",

  managerRating: "manager_rating",
};

/* ============================================================
NUMERIC FIELDS
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
  "rating",
]);

/* ============================================================
FIELD LABEL
============================================================ */

const labelOf = (key) => {
  const column = COLUMNS.find((item) => item.key === key);

  return column?.label || String(key);
};

/* ============================================================
VALUE NORMALIZATION
============================================================ */

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
HISTORY VALUE NORMALIZATION
============================================================ */

const normalizeHistoryValue = (key, value) => {
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
CATALYST EMPLOYEE → REACT EMPLOYEE
============================================================ */

const mapCatalystEmployee = (employee, index) => {
  const id =
    employee.ROWID ||
    employee.rowid ||
    employee.id ||
    employee.emp_id ||
    `employee-${index + 1}`;

  return {
    id: String(id),

    empId: String(employee.emp_id || ""),
    name: String(employee.name || ""),
    designation: String(employee.designation || ""),

    reportingManager: String(employee.reporting_manager || ""),
    compManager: String(employee.comp_manager || ""),
    appraiserTechED: String(employee.appraiser_tech_ed || ""),

    wissenExperience: Number(employee.wissen_experience || 0),
    totalExperience: Number(employee.total_experience || 0),

    lastAppraisalDate: String(employee.last_appraisal_date || ""),
    doj: String(employee.date_of_join || ""),

    rating:
      employee.rating !== null &&
      employee.rating !== undefined &&
      String(employee.rating).trim() !== ""
        ? Number(employee.rating)
        : "",

    managerRating: String(employee.manager_rating || ""),
    interviewCount: Number(employee.interview_count || 0),

    rrPercent: Number(employee.rr_percent || 0),
    grossMargin: Number(employee.gross_margin || 0),

    rbToBePaid: Number(employee.rb_to_be_paid || 0),
    monthRB: String(employee.month_rb || ""),

    pbToBePaid: Number(employee.pb_to_be_paid || 0),
    monthPB: String(employee.month_pb || ""),

    currentAnnualBasePay: Number(employee.current_annual_base_pay || 0),

    targetPBAllocatedForMay: Number(employee.target_pb_allocated_for_may || 0),

    allocatedPBAmount: Number(employee.allocated_pb_amount || 0),

    pbInstallment: String(employee.pb_installment || ""),

    newPBToBeOffered: Number(employee.new_pb_to_be_offered || 0),

    newPBInstallment: String(employee.new_pb_installment || ""),

    newRB: Number(employee.new_rb || 0),

    hikeAmount: Number(employee.hike_amount || 0),
    hikePct: Number(employee.hike_pct || 0),

    targetPBNextYear: Number(employee.target_pb_next_year || 0),

    eligibleForPromotion: String(employee.eligible_for_promotion || ""),

    newTitle: String(employee.new_title || ""),
    atRisk: String(employee.at_risk || ""),

    manager: String(employee.manager || ""),
    department: String(employee.department || ""),

    status: String(employee.status || "Active"),

    creatorId: employee.CREATORID || null,
    createdTime: employee.CREATEDTIME || null,
    modifiedTime: employee.MODIFIEDTIME || null,
  };
};

/* ============================================================
API RESPONSE PARSER
============================================================ */

const parseApiResponse = async (response, apiName) => {
  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(`${apiName} returned invalid JSON.`);
  }

  let payload = result;

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

/* ============================================================
FETCH EMPLOYEE PAGE
============================================================ */

const fetchEmployeePageFromCatalyst = async (
  page = 1,
  limit = 30,
  status = "",
  eligible = "",
) => {
  const url = new URL(EMPLOYEE_API_URL);

  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

  if (status) {
    url.searchParams.set("status", status);
  }

  if (eligible) {
    url.searchParams.set("eligible", eligible);
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

/* ============================================================
FETCH ALL EMPLOYEES
============================================================ */

const fetchAllEmployeesFromCatalyst = async (status = "", eligible = "") => {
  const firstPage = await fetchEmployeePageFromCatalyst(
    1,
    100,
    status,
    eligible,
  );

  const allEmployees = [...firstPage.data];

  const totalPages = Math.max(1, Number(firstPage.pagination?.totalPages || 1));

  if (totalPages > 1) {
    for (let page = 2; page <= totalPages; page += 1) {
      const result = await fetchEmployeePageFromCatalyst(
        page,
        100,
        status,
        eligible,
      );

      allEmployees.push(...result.data);
    }
  }

  return {
    employees: allEmployees,
    counts: firstPage.counts || {},
    pagination: firstPage.pagination || {},
  };
};

/* ============================================================
FETCH ONE EMPLOYEE (used only to REVERT on save failure)
============================================================ */

const fetchEmployeeByIdFromCatalyst = async (empId) => {
  const url = new URL(EMPLOYEE_API_URL);

  url.searchParams.set("emp_id", String(empId));
  url.searchParams.set("limit", "100");

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const payload = await parseApiResponse(response, "Employee API");

  const employees = Array.isArray(payload.data) ? payload.data : [];

  const employee = employees.find(
    (item) => String(item.emp_id || "").trim() === String(empId).trim(),
  );

  if (!employee) {
    throw new Error(`Employee ${empId} was not returned from the database.`);
  }

  return employee;
};

/* ============================================================
SAVE EMPLOYEE CHANGE
============================================================ */

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

/* ============================================================
SAVE PREVIOUS APPRAISAL CHANGE
============================================================ */

const savePreviousAppraisalChangeToCatalyst = async ({
  empId,
  key,
  newValue,
}) => {
  const historyField = REACT_TO_HISTORY_FIELD[key];

  if (!historyField) {
    return null;
  }

  const historyValue = normalizeHistoryValue(key, newValue);

  const response = await fetch(APPRAISAL_HISTORY_API_URL, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      emp_id: String(empId),
      appraisal_year: APPRAISAL_YEAR,
      [historyField]: historyValue,
    }),
  });

  const payload = await parseApiResponse(response, "Appraisal History API");

  return payload.data || null;
};

/* ============================================================
SAVE MULTIPLE PREVIOUS APPRAISAL CHANGES
============================================================ */

const savePreviousAppraisalChangesToCatalyst = async ({
  empId,
  fieldValues,
}) => {
  const historyPayload = {
    emp_id: String(empId),
    appraisal_year: APPRAISAL_YEAR,
  };

  let hasHistoryField = false;

  Object.entries(fieldValues).forEach(([key, value]) => {
    const historyField = REACT_TO_HISTORY_FIELD[key];

    if (!historyField) {
      return;
    }

    historyPayload[historyField] = normalizeHistoryValue(key, value);

    hasHistoryField = true;
  });

  if (!hasHistoryField) {
    return null;
  }

  const response = await fetch(APPRAISAL_HISTORY_API_URL, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(historyPayload),
  });

  const payload = await parseApiResponse(response, "Appraisal History API");

  return payload.data || null;
};

/* CREATE EMPLOYEE */
const createEmployeeInCatalyst = async (fieldValues) => {
  const payload = {};

  Object.entries(fieldValues).forEach(([key, value]) => {
    const catalystField = REACT_TO_CATALYST_FIELD[key];

    if (
      !catalystField ||
      value === "" ||
      value === null ||
      value === undefined
    ) {
      return;
    }

    payload[catalystField] = normalizeValueForCatalyst(key, value);
  });

  const response = await fetch(EMPLOYEE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await parseApiResponse(response, "Employee API");

  const record = Array.isArray(result.data) ? result.data[0] : result.data;

  // catalyst-shaped object so mapCatalystEmployee() can read it
  return { ...payload, ...(record || {}) };
};

/* ============================================================
EMPLOYEE SAVE QUEUE
============================================================ */

const queueEmployeeSave = (empId, saveFunction) => {
  const employeeKey = String(empId);

  const previousPromise =
    employeeSaveQueues.get(employeeKey) || Promise.resolve();

  const nextPromise = previousPromise.catch(() => {}).then(saveFunction);

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

/* ============================================================
AUDIT RESPONSE → REACT
============================================================ */

const mapAuditFromCatalyst = (record, index = 0) => {
  const row =
    record?.Appraisal_Audit || record?.appraisal_audit || record || {};

  const changedAt =
    row.changed_at ||
    row.changedAt ||
    row.at ||
    row.CREATEDTIME ||
    new Date().toISOString();

  return {
    id: String(
      row.ROWID || row.rowid || row.id || `audit-${Date.now()}-${index}`,
    ),

    at: changedAt,

    user: String(row.changed_by || row.changedBy || row.user || CURRENT_USER),

    empId: String(row.emp_id || row.empId || ""),

    employeeName: String(
      row.employee_name || row.employeeName || row.name || "",
    ),

    field: String(row.field_name || row.fieldName || row.field || ""),

    from: String(row.old_value || row.oldValue || row.from || ""),

    to: String(row.new_value || row.newValue || row.to || ""),

    source: String(row.source || "manual"),

    batchId: String(row.batch_id || row.batchId || ""),

    appraisalYear: String(
      row.appraisal_year || row.appraisalYear || APPRAISAL_YEAR,
    ),

    saved: true,
  };
};

/* ============================================================
FETCH AUDIT HISTORY FROM CATALYST
============================================================ */

const fetchAuditHistoryFromCatalyst = async (empId = "") => {
  const url = new URL(AUDIT_API_URL);

  url.searchParams.set("limit", "500");

  if (String(empId).trim()) {
    url.searchParams.set("emp_id", String(empId).trim());
  }

  url.searchParams.set("_ts", String(Date.now()));

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  const payload = await parseApiResponse(response, "Audit API");

  const records = Array.isArray(payload.data) ? payload.data : [];

  const mappedRecords = records
    .map((record, index) => mapAuditFromCatalyst(record, index))
    .filter((record) => record.empId && record.field);

  mappedRecords.sort((a, b) => {
    const aTime = new Date(a.at).getTime();
    const bTime = new Date(b.at).getTime();

    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return 0;
    }

    return bTime - aTime;
  });

  return mappedRecords;
};

/* ============================================================
CREATE AUDIT RECORDS IN CATALYST
============================================================ */

const createAuditRecordsInCatalyst = async (entries) => {
  if (!Array.isArray(entries) || !entries.length) {
    return [];
  }

  const payload = entries.map((entry) => ({
    emp_id: String(entry.empId || ""),

    employee_name: String(entry.employeeName || ""),

    field_name: String(entry.field || ""),

    old_value: String(entry.from || ""),

    new_value: String(entry.to || ""),

    changed_by: String(entry.user || CURRENT_USER),

    changed_at: entry.at || new Date().toISOString(),

    source: String(entry.source || "manual"),

    batch_id: String(entry.batchId || ""),

    appraisal_year: String(entry.appraisalYear || APPRAISAL_YEAR),
  }));

  const response = await fetch(AUDIT_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  let result = null;

  try {
    result = responseText ? JSON.parse(responseText) : null;
  } catch {
    result = null;
  }

  if (!response.ok) {
    throw new Error(
      result?.message ||
        result?.error ||
        responseText ||
        `Audit API failed with status ${response.status}`,
    );
  }

  if (!result?.success) {
    throw new Error(
      result?.message || result?.error || "Failed to create audit records.",
    );
  }

  const insertedRecords = Array.isArray(result.data) ? result.data : [];

  if (insertedRecords.length) {
    return insertedRecords.map((record, index) =>
      mapAuditFromCatalyst(record, index),
    );
  }

  return entries.map((entry, index) =>
    mapAuditFromCatalyst(
      {
        ...entry,
        emp_id: entry.empId,
        employee_name: entry.employeeName,
        field_name: entry.field,
        old_value: entry.from,
        new_value: entry.to,
        changed_by: entry.user,
        changed_at: entry.at,
        batch_id: entry.batchId,
        appraisal_year: entry.appraisalYear || APPRAISAL_YEAR,
      },
      index,
    ),
  );
};

/* ============================================================
PROVIDER
============================================================ */

export function AppraisalProvider({ children }) {
  const [rows, setRows] = useState([]);

  const [audit, setAudit] = useState([]);

  const [modified, setModified] = useState({});

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [employeeCounts, setEmployeeCounts] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  /* ==========================================================
  LOAD EMPLOYEES
  ========================================================== */

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await fetchAllEmployeesFromCatalyst("active", "eligible");

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

  /* ==========================================================
  INITIAL EMPLOYEE LOAD
  ========================================================== */

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const result = await fetchAllEmployeesFromCatalyst(
          "active",
          "eligible",
        );

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

  /* ==========================================================
  REFRESH AUDIT HISTORY
  ========================================================== */

  const refreshAuditHistory = useCallback(async (empId = "") => {
    try {
      const records = await fetchAuditHistoryFromCatalyst(empId);

      setAudit((previous) => {
        if (!String(empId).trim()) {
          const serverIds = new Set(records.map((item) => String(item.id)));

          const unsavedLocal = previous.filter(
            (item) => !item.saved && !serverIds.has(String(item.id)),
          );

          return [...records, ...unsavedLocal].sort(
            (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
          );
        }

        const otherEmployees = previous.filter(
          (item) => String(item.empId) !== String(empId),
        );

        const unsavedLocal = previous.filter(
          (item) => String(item.empId) === String(empId) && !item.saved,
        );

        return [...records, ...unsavedLocal, ...otherEmployees].sort(
          (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
        );
      });

      return records;
    } catch (err) {
      console.error("Failed to refresh audit history:", err);

      return [];
    }
  }, []);

  /* ==========================================================
  INITIAL AUDIT LOAD
  ========================================================== */

  useEffect(() => {
    let cancelled = false;

    const loadAudit = async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));

      if (cancelled) {
        return;
      }

      try {
        const records = await fetchAuditHistoryFromCatalyst();

        if (cancelled) {
          return;
        }

        setAudit((previous) => {
          const serverIds = new Set(records.map((item) => String(item.id)));

          const unsavedLocal = previous.filter(
            (item) => !item.saved && !serverIds.has(String(item.id)),
          );

          return [...records, ...unsavedLocal].sort(
            (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
          );
        });
      } catch (err) {
        console.error("Initial audit history load failed:", err);

        if (!cancelled) {
          setTimeout(async () => {
            if (cancelled) {
              return;
            }

            try {
              const retryRecords = await fetchAuditHistoryFromCatalyst();

              if (cancelled) {
                return;
              }

              setAudit((previous) => {
                const serverIds = new Set(
                  retryRecords.map((item) => String(item.id)),
                );

                const unsavedLocal = previous.filter(
                  (item) => !item.saved && !serverIds.has(String(item.id)),
                );

                return [...retryRecords, ...unsavedLocal].sort(
                  (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
                );
              });
            } catch (retryError) {
              console.error("Audit history retry failed:", retryError);
            }
          }, 1000);
        }
      }
    };

    loadAudit();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ==========================================================
  APPLY EDITS — SINGLE FIELD

  IMPORTANT:
  We no longer re-fetch the employee from Catalyst after a
  successful save. The optimistic value already applied to
  `rows` IS the value we just told the backend to store, so
  there is nothing more accurate to fetch. Re-fetching here
  used to race with the write and could silently revert a
  field to a stale value (this is what broke Hike Amount ->
  Hike % syncing) — and it added a full extra round trip to
  every single edit, making the grid feel slow.

  On FAILURE we still re-fetch, to resync the UI with whatever
  the database actually has.
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

        if (String(before || "") === String(next || "")) {
          return row;
        }

        const entry = {
          id: nextId(),
          at: new Date().toISOString(),
          user: CURRENT_USER,
          empId: row.empId,
          employeeName: row.name,
          field: labelOf(key),
          from: String(before || ""),
          to: String(next || ""),
          source: source || "Inline edit",
          ...(batchId ? { batchId } : {}),
          appraisalYear: APPRAISAL_YEAR,
          saved: false,
        };

        entries.push(entry);

        touched[`${row.id}:${key}`] = true;

        persistenceQueue.push({
          empId: row.empId,
          key,
          newValue: next,
          auditEntry: entry,
        });

        return {
          ...row,
          [key]: next,
        };
      }),
    );

    if (!entries.length) {
      return 0;
    }

    setAudit((prev) => [...entries.slice().reverse(), ...prev]);

    setModified((prev) => ({
      ...prev,
      ...touched,
    }));

    persistenceQueue.forEach(({ empId, key, newValue, auditEntry }) => {
      void queueEmployeeSave(empId, async () => {
        try {
          await saveEmployeeChangeToCatalyst({ empId, key, newValue });

          if (REACT_TO_HISTORY_FIELD[key]) {
            await savePreviousAppraisalChangeToCatalyst({
              empId,
              key,
              newValue,
            });
          }

          const insertedAudit = await createAuditRecordsInCatalyst([
            auditEntry,
          ]);

          if (insertedAudit.length) {
            setAudit((prev) =>
              prev.map((item) =>
                item.id === auditEntry.id ? insertedAudit[0] : item,
              ),
            );
          } else {
            setAudit((prev) =>
              prev.map((item) =>
                item.id === auditEntry.id
                  ? { ...item, to: String(newValue || ""), saved: true }
                  : item,
              ),
            );
          }
        } catch (saveError) {
          console.error(
            `Employee save/history/audit failed for ${empId} / ${key}:`,
            saveError,
          );

          try {
            const currentEmployee = await fetchEmployeeByIdFromCatalyst(empId);

            const currentReactEmployee = mapCatalystEmployee(
              currentEmployee,
              0,
            );

            setRows((prev) =>
              prev.map((row) =>
                String(row.empId) === String(empId)
                  ? { ...currentReactEmployee, id: row.id }
                  : row,
              ),
            );
          } catch (refreshError) {
            console.error(
              "Could not restore employee from database:",
              refreshError,
            );
          }

          setAudit((prev) => prev.filter((item) => item.id !== auditEntry.id));

          throw saveError;
        }
      }).catch(() => {});
    });

    return entries.length;
  }, []);

  /* ==========================================================
  APPLY LINKED FIELDS EDIT
  HIKE % ↔ HIKE AMOUNT

  Same principle as applyEdits: no re-fetch on success. Both
  fields are already saved atomically (one PATCH carries both),
  so both optimistic values are trusted as-is.
  ========================================================== */

  const applyLinkedFieldsEdit = useCallback(
    (id, fieldValues, source = "Inline edit") => {
      const entries = [];
      const touched = {};
      let targetRow = null;

      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== id) {
            return row;
          }

          targetRow = row;

          const nextRow = {
            ...row,
          };

          Object.entries(fieldValues).forEach(([key, next]) => {
            const before = row[key];

            if (String(before || "") === String(next || "")) {
              return;
            }

            const entry = {
              id: nextId(),
              at: new Date().toISOString(),
              user: CURRENT_USER,
              empId: row.empId,
              employeeName: row.name,
              field: labelOf(key),
              from: String(before || ""),
              to: String(next || ""),
              source,
              appraisalYear: APPRAISAL_YEAR,
              saved: false,
            };

            entries.push(entry);

            touched[`${row.id}:${key}`] = true;

            nextRow[key] = next;
          });

          return nextRow;
        }),
      );

      if (!entries.length || !targetRow) {
        return 0;
      }

      setAudit((prev) => [...entries.slice().reverse(), ...prev]);

      setModified((prev) => ({
        ...prev,
        ...touched,
      }));

      const empId = targetRow.empId;

      void queueEmployeeSave(empId, async () => {
        try {
          const catalystPayload = {};

          Object.entries(fieldValues).forEach(([key, next]) => {
            const catalystField = REACT_TO_CATALYST_FIELD[key];

            if (!catalystField) {
              throw new Error(`No Catalyst field mapping for: ${key}`);
            }

            catalystPayload[catalystField] = normalizeValueForCatalyst(
              key,
              next,
            );
          });

          const response = await fetch(EMPLOYEE_API_URL, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              emp_id: String(empId),
              ...catalystPayload,
            }),
          });

          await parseApiResponse(response, "Employee API");

          await savePreviousAppraisalChangesToCatalyst({
            empId,
            fieldValues,
          });

          const insertedAudit = await createAuditRecordsInCatalyst(entries);

          if (insertedAudit.length === entries.length) {
            setAudit((prev) =>
              prev.map((item) => {
                const entryIndex = entries.findIndex(
                  (entry) => entry.id === item.id,
                );

                if (entryIndex === -1) {
                  return item;
                }

                return {
                  ...item,
                  ...insertedAudit[entryIndex],
                  saved: true,
                };
              }),
            );
          } else {
            setAudit((prev) =>
              prev.map((item) =>
                entries.some((entry) => entry.id === item.id)
                  ? { ...item, saved: true }
                  : item,
              ),
            );
          }
        } catch (saveError) {
          console.error(
            `Linked employee/history/audit save failed for ${empId}:`,
            saveError,
          );

          try {
            const currentEmployee = await fetchEmployeeByIdFromCatalyst(empId);

            const currentReactEmployee = mapCatalystEmployee(
              currentEmployee,
              0,
            );

            setRows((prev) =>
              prev.map((row) =>
                String(row.empId) === String(empId)
                  ? { ...currentReactEmployee, id: row.id }
                  : row,
              ),
            );
          } catch (refreshError) {
            console.error(
              "Could not restore employee from database:",
              refreshError,
            );
          }

          setAudit((prev) =>
            prev.filter(
              (item) => !entries.some((entry) => entry.id === item.id),
            ),
          );

          throw saveError;
        }
      }).catch(() => {});

      return entries.length;
    },
    [],
  );

  /* ==========================================================
  SINGLE CELL UPDATE
  ========================================================== */

  const updateCell = useCallback(
    (id, key, value, source = "Inline edit") => {
      return applyEdits([id], key, () => value, source);
    },
    [applyEdits],
  );

  /* ==========================================================
  LINKED CELLS UPDATE
  ========================================================== */

  const updateLinkedCells = useCallback(
    (id, fieldValues, source = "Inline edit") => {
      return applyLinkedFieldsEdit(id, fieldValues, source);
    },
    [applyLinkedFieldsEdit],
  );

  /* ==========================================================
  BULK UPDATE
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

  /* ==========================================================
  UPDATE EMPLOYEE STATUS
  ========================================================== */

  const updateEmployeeStatus = useCallback(
    async (empId, status) => {
      const normalizedStatus =
        String(status).toLowerCase() === "inactive" ? "Inactive" : "Active";

      const currentEmployee = rows.find(
        (row) => String(row.empId) === String(empId),
      );

      const previousStatus = String(currentEmployee?.status || "");

      if (previousStatus === normalizedStatus) {
        return currentEmployee;
      }

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

      await parseApiResponse(response, "Employee API");

      if (normalizedStatus === "Inactive") {
        setRows((prev) =>
          prev.filter((row) => String(row.empId) !== String(empId)),
        );
      } else {
        setRows((prev) =>
          prev.map((row) =>
            String(row.empId) === String(empId)
              ? { ...row, status: normalizedStatus }
              : row,
          ),
        );
      }

      const wasActive = previousStatus.toLowerCase() === "active";

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

      const statusAudit = {
        id: nextId(),
        at: new Date().toISOString(),
        user: CURRENT_USER,
        empId: String(empId),
        employeeName: String(currentEmployee?.name || ""),
        field: labelOf("status"),
        from: previousStatus,
        to: normalizedStatus,
        source: "Status change",
        appraisalYear: APPRAISAL_YEAR,
        saved: false,
      };

      try {
        const insertedAudit = await createAuditRecordsInCatalyst([statusAudit]);

        setAudit((prev) => [
          insertedAudit.length
            ? insertedAudit[0]
            : { ...statusAudit, saved: true },
          ...prev,
        ]);
      } catch (auditError) {
        console.error("Status audit save failed:", auditError);

        setAudit((prev) => [{ ...statusAudit, saved: false }, ...prev]);
      }

      return currentEmployee;
    },
    [rows],
  );

  /* ==========================================================
  HISTORY FOR EMPLOYEE
  ========================================================== */

  const historyFor = useCallback(
    (empId) => {
      return audit
        .filter((item) => String(item.empId) === String(empId))
        .sort((a, b) => {
          const aTime = new Date(a.at).getTime();
          const bTime = new Date(b.at).getTime();

          if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
            return 0;
          }

          return bTime - aTime;
        });
    },
    [audit],
  );

  /* ==========================================================
  APPRAISAL HISTORY
  ========================================================== */

  const appraisalHistoryFor = useCallback((employee) => {
    if (!employee) {
      return [];
    }

    const possibleHistory =
      employee.history ||
      employee.appraisalHistory ||
      employee.appraisal_history ||
      employee.previousYears ||
      employee.previousYearHistory ||
      [];

    return Array.isArray(possibleHistory) ? possibleHistory : [];
  }, []);

  /* ==========================================================
  REFRESH EMPLOYEES
  ========================================================== */

  const refreshEmployees = useCallback(async () => {
    await loadEmployees();
  }, [loadEmployees]);

  const createEmployees = useCallback(async (employees) => {
    const created = [];
    const failed = [];

    for (const fieldValues of employees) {
      const empId = String(fieldValues.empId || "").trim();

      try {
        if (!empId) {
          throw new Error("Missing EMP ID.");
        }

        // don't duplicate someone who exists in the DB but isn't in the sheet
        let alreadyExists = false;

        try {
          await fetchEmployeeByIdFromCatalyst(empId);
          alreadyExists = true;
        } catch {
          alreadyExists = false;
        }

        if (alreadyExists) {
          throw new Error(
            "Already exists in the database (inactive or not eligible) — not created.",
          );
        }

        const record = await createEmployeeInCatalyst({
          status: "Active",
          ...fieldValues,
        });

        const employee = mapCatalystEmployee(record, 0);

        setRows((prev) => [...prev, employee]);

        setEmployeeCounts((prev) => ({
          ...prev,
          total: prev.total + 1,
          active: prev.active + 1,
        }));

        try {
          await savePreviousAppraisalChangesToCatalyst({ empId, fieldValues });
        } catch (historyError) {
          console.error("History save failed for new employee:", historyError);
        }

        const auditEntry = {
          id: nextId(),
          at: new Date().toISOString(),
          user: CURRENT_USER,
          empId,
          employeeName: employee.name,
          field: "Employee",
          from: "",
          to: "Created",
          source: "Import",
          appraisalYear: APPRAISAL_YEAR,
          saved: false,
        };

        try {
          const inserted = await createAuditRecordsInCatalyst([auditEntry]);

          setAudit((prev) => [
            inserted.length ? inserted[0] : { ...auditEntry, saved: true },
            ...prev,
          ]);
        } catch {
          setAudit((prev) => [auditEntry, ...prev]);
        }

        created.push(empId);
      } catch (err) {
        failed.push({
          empId,
          message: err?.message || "Failed to create employee.",
        });
      }
    }

    return { created, failed };
  }, []);

  /* ==========================================================
  CONTEXT VALUE
  ========================================================== */

  const value = useMemo(
    () => ({
      rows,
      audit,
      modified,
      loading,
      error,
      employeeCounts,
      updateCell,
      updateLinkedCells,
      bulkUpdate,
      updateEmployeeStatus,
      historyFor,
      appraisalHistoryFor,
      refreshEmployees,
      refreshAuditHistory,
    }),
    [
      rows,
      audit,
      modified,
      loading,
      error,
      employeeCounts,
      updateCell,
      updateLinkedCells,
      bulkUpdate,
      updateEmployeeStatus,
      historyFor,
      appraisalHistoryFor,
      refreshEmployees,
      refreshAuditHistory,
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
