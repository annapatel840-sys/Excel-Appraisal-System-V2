import { jsx as _jsx } from "react/jsx-runtime";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { COLUMNS, normalizeManagerRating } from "./appraisal-data";
import { loadFeedbackRating } from "./feedback-rating-api";
import { catalystFetch, catalystFunctionUrl } from "./catalyst-api";
import { useCatalystUser } from "./catalyst-auth";
import { getViewAsSelected, useViewAs } from "./view-as-store";
import { invalidatePayrollCycleReads, payrollCycleRequest } from "./payroll-cycle-api";
import { fetchAppraisalRoster, invalidateEmployeeRoster, isActiveEligible } from "./employee-roster";

const CURRENT_USER = "Unknown user";
// Set from Appraisal_Cycle_Master before loading or saving current-cycle data.
let APPRAISAL_YEAR = "";
const AUDIT_LOCAL_STORAGE_KEY = "appraisal.auditTrail.v1";
const AUDIT_LOCAL_STORAGE_LIMIT = 5000;

const readLocalAuditTrail = () => {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(AUDIT_LOCAL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && entry.empId && entry.field).slice(0, AUDIT_LOCAL_STORAGE_LIMIT)
      : [];
  } catch (_) {
    return [];
  }
};

// The most recent edit is remembered in browser storage the moment it is made,
// so the Appraisal Sheet's "Last Edited" button works after a refresh/re-login.
export const LAST_EDIT_STORAGE_KEY = "appraisal.lastEdit.v2";
const rememberLastEdit = (entry) => {
  try {
    if (typeof window === "undefined" || !entry?.empId) return;
    window.localStorage.setItem(
      LAST_EDIT_STORAGE_KEY,
      JSON.stringify({
        empId: String(entry.empId).trim(),
        at: entry.at || new Date().toISOString(),
      }),
    );
  } catch (_) {
    /* storage unavailable */
  }
};

const currentCycleAudit = (entries) => {
  if (!APPRAISAL_YEAR) return [];
  return (Array.isArray(entries) ? entries : []).filter((entry) =>
    String(entry?.appraisalYear || entry?.cycleName || entry?.cycle || "").trim() === APPRAISAL_YEAR
  );
};

const writeLocalAuditTrail = (entries) => {
  try {
    if (typeof window === "undefined") return;
    const safeEntries = (Array.isArray(entries) ? entries : []).slice(0, AUDIT_LOCAL_STORAGE_LIMIT);
    window.localStorage.setItem(AUDIT_LOCAL_STORAGE_KEY, JSON.stringify(safeEntries));
  } catch (error) {
    // Keep the in-memory audit trail alive if browser storage is disabled/full.
    console.warn("Could not persist the appraisal audit trail in localStorage:", error);
  }
};

const mergeAuditEntries = (serverEntries, localEntries) => {
  const merged = new Map();
  // Add local-only records first, then let the server's canonical record
  // replace it when the same ID exists.
  [...(localEntries || []), ...(serverEntries || [])].forEach((entry) => {
    if (!entry || !entry.id) return;
    const id = String(entry.id);
    if (!merged.has(id)) merged.set(id, entry);
    else merged.set(id, { ...merged.get(id), ...entry });
  });
  return Array.from(merged.values()).sort((a, b) => {
    const at = new Date(a.at).getTime();
    const bt = new Date(b.at).getTime();
    return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
  }).slice(0, AUDIT_LOCAL_STORAGE_LIMIT);
};

// CHANGED: grid edits no longer write to Payroll_Data (history). The current
// cycle row in the History panel is computed live from the sheet, and writing
// with the hardcoded "Apr-26" label created a duplicate history row.
// Set to true to turn history writes back on.
const WRITE_CURRENT_CYCLE_HISTORY = false;

const AppraisalContext = createContext(null);

let seq = 0;

const nextId = () => `a${Date.now()}-${seq++}`;

/* ============================================================
CATALYST API
============================================================ */

/* Client Rating is a numeric decimal field only.
   Client feedback is stored separately and must not be appended to this value. */
function formatClientRating(rating) {
  if (rating === null || rating === undefined || String(rating).trim() === "") return "";
  const n = Number(rating);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "";
}

/* Current-cycle Feedback_And_Rating data per employee (table 74008000000022041),
   from the existing loadFeedbackRating() call. Returns
     { ratings: Map(empId -> manager rating 1-5),
       client:  Map(empId -> { costCenterClient, clientManager, clientRating }) }
   or null if the table is unavailable (the sheet then loads without it).
     costCenterClient = CostCenter_Client
     clientManager    = client_manager_feedback
     clientRating     = numeric client_rating only */
async function loadCurrentCycleFeedback() {
  try {
    const data = await loadFeedbackRating();
    const cycles = data?.cycles || [];
    // Feedback ratings are current working data only for the Active cycle.
    // Closed/archived cycles remain historical inputs, never a current fallback.
    const current = cycles.find((c) =>
      String(c.status ?? "").trim().toLowerCase() === "active" &&
      !["true", "1", "yes"].includes(String(c.archived ?? "").trim().toLowerCase())
    );
    const ratings = new Map();
    const client = new Map();
    if (!current) return { ratings, client };
    (data?.rows || []).forEach((row) => {
      if (String(row.cid) !== String(current.id)) return;
      const key = String(row.id || "").trim().toLowerCase();
      if (!key) return;

      const rating = normalizeManagerRating(row.mr);
      if (rating) ratings.set(key, rating);

      const next = {
        costCenterClient: String(row.client ?? "").trim(),
        clientManager: String(row.cmf ?? "").trim(),
        clientRating: formatClientRating(row.cr),
      };
      if (next.costCenterClient || next.clientManager || next.clientRating) {
        client.set(key, next);
      }
    });
    return { ratings, client };
  } catch (error) {
    console.warn("Could not load Feedback_And_Rating data:", error);
    return null;
  }
}

const EMPLOYEE_API_URL = catalystFunctionUrl("employeesapi");
const AUDIT_API_URL = catalystFunctionUrl("appraisalauditapi");
const APPRAISAL_HISTORY_API_URL = catalystFunctionUrl("appraisalhistoryapi");
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
  targetPBCriteria: "target_PB_criteria",
  // compManagerRewards: "comp_manager_rewards",
  // CHANGED: the grid column key is compManagerRemarks; it is stored in the
  // comp_manager_rewards column (the one employeesapi ALLOWED_FIELDS lists).
  // If your Data Store column has a different name, change it here AND in
  // employeesapi ALLOWED_FIELDS.
  compManagerRemarks: "comp_manager_remarks",

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

  targetPBNextYear: "target_performance_agreed",

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
    compManagerDisplay: String(employee.comp_manager_display || employee.comp_manager_name || employee.comp_manager || ""),
    // appraiser_tech_ed1 is a lookup FK in some API responses; prefer the
    // resolved Appraisal Sheet assignment so the grid shows Employee ID - Name.
    // Never show a bare Employee_Master ROWID (e.g. 74008000000027046) as the name.
    appraiserTechED: [
      employee.appraiser_tech_ed_appraisal_sheet,
      employee.appraiser_tech_ed,
    ].map((v) => String(v || "").trim()).find((v) => v && !/^[0-9]{6,}$/.test(v)) || "",

    wissenExperience: Number(employee.wissen_experience || 0),
    totalExperience: Number(employee.total_experience || 0),

    // The "Last Appraisal" column is a date field, never the archived cycle name.
    lastAppraisalDate: String(employee.last_appraisal_date || employee.lastAppraisalDate || ""),
    previousAppraisalTotalCtcWithRewards: Number(employee.previous_appraisal_total_ctc_with_rewards ?? employee.Previous_Appraisal_total_CTC_with_rewards ?? 0),
    doj: String(employee.date_of_join || ""),

    rating:
      employee.rating !== null &&
      employee.rating !== undefined &&
      String(employee.rating).trim() !== ""
        ? Number(employee.rating)
        : "",

    managerRating: normalizeManagerRating(employee.manager_rating),
    interviewCount: Number(employee.interview_count || 0),

    rrPercent: Number(employee.rr_percent ?? employee.revenue_released ?? employee.rr ?? 0),
    grossMargin: Number(employee.gross_margin ?? employee.grossMargin ?? 0),
    yoeRatio: employee.yoe_ratio ?? employee.yoeRatio ?? "",

    // Feedback_And_Rating values are stored with database field names, while
    // the grid columns use camelCase keys. Map the source fields explicitly so
    // populated backend values are actually rendered in the Appraisal Sheet.
    costCenterClient: String(
      employee.CostCenter_Client ??
        employee.cost_center_client ??
        employee.costcenter_client ??
        employee.costCenterClient ??
        "",
    ),
    clientManager: String(
      employee.client_manager_feedback ??
        employee.clientManagerFeedback ??
        employee.clientManager ??
        "",
    ),
    clientRating: String(
      employee.client_rating ??
        employee.clientRating ??
        "",
    ),

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
    joiningBonus: Number(employee.joining_bonus || 0),

    hikeAmount: Number(employee.hike_amount || 0),
    hikePct: Number(employee.hike_pct || 0),

    targetPBNextYear: Number(employee.target_pb_next_year || 0),

    eligibleForPromotion: String(employee.eligible_for_promotion || ""),

    newTitle: String(employee.new_title || ""),
    atRisk: String(employee.at_risk || ""),

    // CHANGED: these two grid columns were never read back from the API.
    targetPBCriteria: String(employee.target_PB_criteria || ""),
    // Previous-year criteria for the "Set Target Criteria" column. Uses a
    // dedicated field when the API sends one, otherwise the value as loaded.
    setTargetCriteria: String(
      employee.previous_target_pb_criteria ??
        employee.target_pb_criteria ??
        employee.current_target_pb_criteria ??
        employee.target_PB_criteria ??
        "",
    ),
    compManagerRemarks: String(
      employee.comp_manager_rewards || employee.comp_manager_remarks || "",
    ),

    manager: String(employee.manager || ""),
    department: String(employee.department || ""),

    status: String(employee.status || "Active"),

    eligibility: String(employee.eligible_status || ""),

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
  // Re-read cycle-specific payroll history after a payroll upload instead of
  // allowing an intermediary/browser cache to reuse the previous appraisal row.
  url.searchParams.set("_ts", String(Date.now()));

  const viewAs = getViewAsSelected();
  if (viewAs) url.searchParams.set("viewAs", viewAs);

  if (status) {
    url.searchParams.set("status", status);
  }

  if (eligible) {
    url.searchParams.set("eligible", eligible);
  }

  const response = await catalystFetch(url.toString(), {
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
FETCH ONE EMPLOYEE (used to REVERT on save failure and to
check for an existing employee before create)

The Employee API ignores `emp_id` as a filter, but `search`
matches emp_id substrings, so search and page through the
results until an exact emp_id match is found.
============================================================ */

const fetchEmployeeByIdFromCatalyst = async (empId) => {
  const targetId = String(empId).trim();

  let page = 1;
  let totalPages = 1;

  do {
    const url = new URL(EMPLOYEE_API_URL);

    url.searchParams.set("search", targetId);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", "100");

    const response = await catalystFetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const payload = await parseApiResponse(response, "Employee API");

    const employees = Array.isArray(payload.data) ? payload.data : [];

    const employee = employees.find(
      (item) => String(item.emp_id || "").trim() === targetId,
    );

    if (employee) {
      return employee;
    }

    totalPages = Math.max(1, Number(payload.pagination?.totalPages || 1));
    page += 1;
  } while (page <= totalPages);

  throw new Error(`Employee ${empId} was not returned from the database.`);
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

  const response = await catalystFetch(EMPLOYEE_API_URL, {
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
  if (!WRITE_CURRENT_CYCLE_HISTORY) {
    return null;
  }

  const historyField = REACT_TO_HISTORY_FIELD[key];

  if (!historyField) {
    return null;
  }

  const historyValue = normalizeHistoryValue(key, newValue);

  const response = await catalystFetch(APPRAISAL_HISTORY_API_URL, {
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
  if (!WRITE_CURRENT_CYCLE_HISTORY) {
    return null;
  }

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

  const response = await catalystFetch(APPRAISAL_HISTORY_API_URL, {
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

  const response = await catalystFetch(EMPLOYEE_API_URL, {
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

  // Store the exact promise we compare against, and swallow its rejection
  // here so the queue tail never surfaces as an unhandled rejection.
  const tail = nextPromise.catch(() => {});

  employeeSaveQueues.set(employeeKey, tail);

  tail.then(() => {
    if (employeeSaveQueues.get(employeeKey) === tail) {
      employeeSaveQueues.delete(employeeKey);
    }
  });

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

    // Missing cycle metadata must remain missing; do not relabel old audit
    // entries as belonging to whichever cycle happens to be Active today.
    appraisalYear: String(row.appraisal_year || row.appraisalYear || ""),

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

  const response = await catalystFetch(url.toString(), {
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

  const response = await catalystFetch(AUDIT_API_URL, {
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
PENDING (UNSAVED) CELL TRACKING
============================================================ */

const markPendingCells = (pending, empId, keys) => {
  keys.forEach((key) => {
    const cellKey = `${empId}:${key}`;

    pending.set(cellKey, (pending.get(cellKey) || 0) + 1);
  });
};

const clearPendingCells = (pending, empId, keys) => {
  keys.forEach((key) => {
    const cellKey = `${empId}:${key}`;
    const count = (pending.get(cellKey) || 0) - 1;

    if (count > 0) {
      pending.set(cellKey, count);
    } else {
      pending.delete(cellKey);
    }
  });
};

// Keep the local value of every cell that still has a save in flight.
const mergePendingCells = (freshRows, currentRows, pending) => {
  if (!pending.size) {
    return freshRows;
  }

  const pendingByEmp = new Map();

  pending.forEach((_, cellKey) => {
    const splitAt = cellKey.lastIndexOf(":");
    const empId = cellKey.slice(0, splitAt);
    const keys = pendingByEmp.get(empId) || [];

    keys.push(cellKey.slice(splitAt + 1));
    pendingByEmp.set(empId, keys);
  });

  const currentByEmp = new Map(
    currentRows.map((row) => [String(row.empId), row]),
  );

  return freshRows.map((row) => {
    const keys = pendingByEmp.get(String(row.empId));
    const current = currentByEmp.get(String(row.empId));

    if (!keys || !current) {
      return row;
    }

    const merged = { ...row };

    keys.forEach((key) => {
      merged[key] = current[key];
    });

    return merged;
  });
};

/* ============================================================
HIKE % ↔ HIKE AMOUNT (same maths as the grid's inline edits)
============================================================ */

const linkedHikeValues = (row, key, value) => {
  if (value === "" || value === null || value === undefined) {
    return { hikeAmount: "", hikePct: "" };
  }

  const basePay = Number(row.currentAnnualBasePay || 0);

  if (key === "hikePct") {
    const pct = Number(value) || 0;

    return { hikePct: pct, hikeAmount: Math.round(basePay * (pct / 100)) };
  }

  const amount = Number(value) || 0;

  const pct = basePay ? Number(((amount / basePay) * 100).toFixed(2)) : 0;

  return { hikeAmount: amount, hikePct: pct };
};

/* ============================================================
PROVIDER
============================================================ */

export function AppraisalProvider({ children }) {
  const authenticatedUser = useCatalystUser();
  const currentUserName =
    authenticatedUser?.name || authenticatedUser?.email || CURRENT_USER;

    const { effectiveId: viewAsId } = useViewAs();

  // HR users have universal appraisal visibility:
  // no status/eligibility restriction is applied to their employee data.
  const isHRUser =
    String(authenticatedUser?.role || "")
      .trim()
      .toLowerCase() === "hr";

  const [rows, setRows] = useState([]);

  /*
  rowsRef always holds the latest rows. Every row mutation goes
  through updateRows(), which computes the next array from the
  ref synchronously, so several edits in one event handler
  (import loop, paste, column bulk edit) each see the previous
  edit and each get their own audit/persistence entries.
  */
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const updateRows = useCallback((updater) => {
    const next = updater(rowsRef.current);
    rowsRef.current = next;
    setRows(next);
    return next;
  }, []);

  // `${empId}:${field}` -> number of saves still in flight.
  const pendingCellsRef = useRef(new Map());

  const loadSeqRef = useRef(0);

  // The provider wraps every screen, but only screens that read appraisal
  // data (useAppraisal) need it. Nothing loads until the first such screen
  // mounts; screens that only call refreshEmployees (useAppraisalRefresh)
  // do not trigger a load.
  const [dataWanted, setDataWanted] = useState(false);
  const dataWantedRef = useRef(false);
  const requestData = useCallback(() => {
    if (dataWantedRef.current) return;
    dataWantedRef.current = true;
    setDataWanted(true);
  }, []);

  const [audit, setAudit] = useState(() => readLocalAuditTrail());

  // Browser-local fallback makes the audit trail survive refreshes even when
  // appraisalauditapi or its backing table is unavailable. Remote records are
  // merged with these entries instead of erasing locally retained history.
  useEffect(() => {
    writeLocalAuditTrail(audit);
  }, [audit]);

  const [modifiedLive, setModified] = useState({});

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  // Last save failure, for the UI to show. Cleared by clearSaveError().
  const [saveError, setSaveError] = useState("");

  const clearSaveError = useCallback(() => setSaveError(""), []);

  const [employeeCounts, setEmployeeCounts] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  /* ==========================================================
  LOAD EMPLOYEES

  Each load gets a sequence number; only the latest one may
  apply its result. On error the existing rows are kept. Cells
  with a save still in flight keep their local (optimistic)
  value instead of the server copy.
  ========================================================== */

  const loadEmployees = useCallback(async () => {
    const requestId = ++loadSeqRef.current;

    try {
      setLoading(true);
      setError("");

      // The cycle list, the roster and Feedback are independent requests, so
      // they run together. No Active cycle means the working Appraisal Sheet
      // and its local audit trail are empty; archived payroll/history stay
      // stored and are not used as a fallback for current-cycle data.
      // Only active-cycle employees explicitly marked Eligible appear here.
      // Employee Master and Payroll remain separate persistent data sources.
      // The full roster request is shared with the Budget store; the same
      // status=active / eligible=eligible rule employeesapi applies is applied
      // here (counts are the unfiltered scope counts either way).
      // Manager Rating comes from the Feedback_And_Rating table (current
      // cycle). If that table cannot be read, the sheet still loads.
      const [cycles, roster, feedback] = await Promise.all([
        payrollCycleRequest("cycles"),
        fetchAppraisalRoster({ viewAs: getViewAsSelected() }),
        loadCurrentCycleFeedback(),
      ]);

      if (requestId !== loadSeqRef.current) {
        return;
      }

      const activeCycle = (Array.isArray(cycles) ? cycles : []).find((cycle) => {
        const status = String(cycle?.status ?? cycle?.cycle_status ?? "").trim().toLowerCase();
        const archived = [true, 1, "true", "1", "yes"].includes(
          typeof cycle?.archived === "string" ? cycle.archived.trim().toLowerCase() : cycle?.archived,
        );
        return status === "active" && !archived && !cycle?.hidden;
      });
      APPRAISAL_YEAR = String(activeCycle?.name || activeCycle?.cycle_name || activeCycle?.appraisal_year || "").trim();
      if (!activeCycle || !APPRAISAL_YEAR) {
        updateRows(() => []);
        setEmployeeCounts({ total: 0, active: 0, inactive: 0 });
        setAudit([]);
        setError("No active appraisal cycle. The current Appraisal Sheet is empty.");
        return;
      }
      setAudit((previous) => currentCycleAudit(previous));

      const result = {
        employees: roster.employees.filter(isActiveEligible),
        counts: roster.counts,
        pagination: roster.pagination,
      };
      const ratingByEmp = feedback ? feedback.ratings : null;

      const employees = mergePendingCells(
        result.employees.map(mapCatalystEmployee).map((employee) => ({
          ...employee,
          managerRating: ratingByEmp
            ? ratingByEmp.get(String(employee.empId).trim().toLowerCase()) || ""
            : employee.managerRating,
          // Cost Center/Client, Client Manager Feedback and Client Rating come
          // from Feedback_And_Rating (CostCenter_Client, client_manager_feedback,
          // numeric client_rating only). Empty when the employee has no row.
          ...(feedback
            ? {
                costCenterClient: "",
                clientManager: "",
                clientRating: "",
                ...(feedback.client.get(String(employee.empId).trim().toLowerCase()) || {}),
              }
            : {}),
        })),
        rowsRef.current,
        pendingCellsRef.current,
      );

      updateRows(() => employees);

      setEmployeeCounts({
        total: Number(result.counts?.total || 0),
        active: Number(result.counts?.active || 0),
        inactive: Number(result.counts?.inactive || 0),
      });

      if (!employees.length) {
        setError(
          isHRUser
            ? "No employees found in Catalyst Data Store."
            : "No active employees found in Catalyst Data Store.",
        );
      }
    } catch (err) {
      if (requestId !== loadSeqRef.current) {
        return;
      }

      console.error("Failed to load employees:", err);

      setError(err?.message || "Failed to load employees from Catalyst.");
    } finally {
      if (requestId === loadSeqRef.current) {
        setLoading(false);
      }
    }
  // }, [isHRUser, updateRows]);
  }, [isHRUser, updateRows, viewAsId]);

  /* ==========================================================
  INITIAL EMPLOYEE LOAD
  ========================================================== */

  useEffect(() => {
    if (!dataWanted) return undefined;
    loadEmployees();

    return () => {
      // Invalidate the in-flight load.
      loadSeqRef.current += 1;
    };
  }, [loadEmployees, dataWanted]);

  useEffect(() => {
    // Before any screen has asked for appraisal data there is nothing to
    // refresh; the first load reads current data anyway.
    const refreshAfterPayrollChange = async () => {
      if (!dataWantedRef.current) return;
      await loadEmployees();
      await refreshAuditHistory();
    };
    const refreshAfterFeedbackChange = async () => {
      if (!dataWantedRef.current) return;
      await loadEmployees();
      await refreshAuditHistory();
    };
    const refreshAfterCycleChange = async () => {
      if (!dataWantedRef.current) return;
      // Clear the prior cycle synchronously before querying the new status.
      APPRAISAL_YEAR = "";
      updateRows(() => []);
      setEmployeeCounts({ total: 0, active: 0, inactive: 0 });
      setAudit([]);
      await loadEmployees();
      await refreshAuditHistory();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("appraisal:payroll-data-updated", refreshAfterPayrollChange);
      window.addEventListener("appraisal:feedback-data-updated", refreshAfterFeedbackChange);
      window.addEventListener("appraisal:cycle-updated", refreshAfterCycleChange);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("appraisal:payroll-data-updated", refreshAfterPayrollChange);
        window.removeEventListener("appraisal:feedback-data-updated", refreshAfterFeedbackChange);
        window.removeEventListener("appraisal:cycle-updated", refreshAfterCycleChange);
      }
    };
  // refreshAuditHistory is a stable useCallback; it is initialized before effects run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadEmployees]);



  /* ==========================================================
  REFRESH AUDIT HISTORY
  ========================================================== */

  const refreshAuditHistory = useCallback(async (empId = "") => {
    try {
      const records = currentCycleAudit(await fetchAuditHistoryFromCatalyst(empId));

      setAudit((previous) => {
        const currentPrevious = currentCycleAudit(previous);
        if (!String(empId).trim()) {
          return mergeAuditEntries(records, currentPrevious);
        }

        const otherEmployees = currentPrevious.filter(
          (item) => String(item.empId) !== String(empId),
        );
        return mergeAuditEntries(records, [
          ...otherEmployees,
          ...currentPrevious.filter((item) => String(item.empId) === String(empId)),
        ]);
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
    if (!dataWanted) return undefined;
    let cancelled = false;

    const loadAudit = async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));

      if (cancelled) {
        return;
      }

      try {
        const cycles = await payrollCycleRequest("cycles");
        const activeCycle = (Array.isArray(cycles) ? cycles : []).find((cycle) => {
          const status = String(cycle?.status ?? cycle?.cycle_status ?? "").trim().toLowerCase();
          const archived = [true, 1, "true", "1", "yes"].includes(
            typeof cycle?.archived === "string" ? cycle.archived.trim().toLowerCase() : cycle?.archived,
          );
          return status === "active" && !archived && !cycle?.hidden;
        });
        APPRAISAL_YEAR = String(activeCycle?.name || activeCycle?.cycle_name || activeCycle?.appraisal_year || "").trim();
        if (!APPRAISAL_YEAR) {
          if (!cancelled) setAudit([]);
          return;
        }
        const records = await fetchAuditHistoryFromCatalyst();

        if (cancelled) {
          return;
        }

        setAudit((previous) => {
          return mergeAuditEntries(currentCycleAudit(records), currentCycleAudit(previous));
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
                return mergeAuditEntries(currentCycleAudit(retryRecords), currentCycleAudit(previous));
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
  }, [dataWanted]);

  /* ==========================================================
  REJECT FIELDS WITH NO DATABASE COLUMN

  Some UI fields have no column in the Employee API yet. Reject
  those edits up front with a visible error instead of applying
  them optimistically and silently reverting after the save throws.
  ========================================================== */

  const rejectUnmappedFields = useCallback((keys) => {
    const unmapped = keys.filter((key) => !REACT_TO_CATALYST_FIELD[key]);

    if (!unmapped.length) {
      return false;
    }

    const message = `${unmapped
      .map(labelOf)
      .join(", ")} cannot be saved yet: there is no matching database column.`;

    console.error(message);

    setSaveError(message);

    return true;
  }, []);

  /* ==========================================================
  SAVE FAILURE HANDLING

  - Employee PATCH failed: restore the failed fields from the
    database (unless a newer save for that cell is in flight)
    and drop the optimistic audit entries.
  - Employee PATCH succeeded but history/audit failed: the value
    IS stored, so keep the audit entries and flag them unsaved.
  Either way the failure is surfaced through `saveError`.
  ========================================================== */

  const handleSaveFailure = useCallback(
    async ({ empId, keys, auditEntries, employeeSaved, failure }) => {
      const reason = failure?.message || "Unknown error.";
      const fields = keys.map(labelOf).join(", ");
      const entryIds = new Set(auditEntries.map((entry) => entry.id));

      if (employeeSaved) {
        console.error(
          `History/audit save failed for ${empId} (${fields}):`,
          failure,
        );

        setAudit((prev) =>
          prev.map((item) =>
            entryIds.has(item.id)
              ? { ...item, saved: false, saveFailed: true, saveError: reason }
              : item,
          ),
        );

        setSaveError(
          `${fields} for ${empId} was saved, but its history/audit record failed: ${reason}`,
        );

        return;
      }

      console.error(`Employee save failed for ${empId} (${fields}):`, failure);

      setAudit((prev) => prev.filter((item) => !entryIds.has(item.id)));

      // Only restore cells that have no newer save still in flight.
      const restoreKeys = keys.filter(
        (key) => (pendingCellsRef.current.get(`${empId}:${key}`) || 0) <= 1,
      );

      try {
        const currentEmployee = mapCatalystEmployee(
          await fetchEmployeeByIdFromCatalyst(empId),
          0,
        );

        updateRows((prev) =>
          prev.map((row) => {
            if (String(row.empId) !== String(empId)) {
              return row;
            }

            const restored = { ...row };

            restoreKeys.forEach((key) => {
              restored[key] = currentEmployee[key];
            });

            return restored;
          }),
        );

        setSaveError(
          `Could not save ${fields} for ${empId}: ${reason} The stored value was restored.`,
        );
      } catch (refreshError) {
        console.error("Could not restore employee from database:", refreshError);

        setSaveError(
          `Could not save ${fields} for ${empId}: ${reason} Reload to see the stored value.`,
        );
      }
    },
    [updateRows],
  );

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

  Next rows / audit entries are computed synchronously from
  rowsRef (not inside a React state updater), so consecutive
  calls in the same tick compose and all of them persist.
  ========================================================== */

  const applyEdits = useCallback((ids, key, compute, source, batchId) => {
    if (rejectUnmappedFields([key])) {
      return 0;
    }

    const entries = [];
    const touched = {};
    const persistenceQueue = [];

    const nextRows = rowsRef.current.map((row) => {
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
        user: currentUserName,
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
    });

    if (!entries.length) {
      return 0;
    }

    updateRows(() => nextRows);

    rememberLastEdit(entries[entries.length - 1]);
    setAudit((prev) => [...entries.slice().reverse(), ...prev]);

    setModified((prev) => ({
      ...prev,
      ...touched,
    }));

    persistenceQueue.forEach(({ empId, key, newValue, auditEntry }) => {
      markPendingCells(pendingCellsRef.current, empId, [key]);

      void queueEmployeeSave(empId, async () => {
        let employeeSaved = false;

        try {
          await saveEmployeeChangeToCatalyst({ empId, key, newValue });

          employeeSaved = true;

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
        } catch (failure) {
          await handleSaveFailure({
            empId,
            keys: [key],
            auditEntries: [auditEntry],
            employeeSaved,
            failure,
          });
        } finally {
          clearPendingCells(pendingCellsRef.current, empId, [key]);
        }
      });
    });

    return entries.length;
  }, [currentUserName, rejectUnmappedFields, updateRows, handleSaveFailure]);

  /* ==========================================================
  APPLY LINKED FIELDS EDIT
  HIKE % ↔ HIKE AMOUNT

  Same principle as applyEdits: no re-fetch on success. Both
  fields are already saved atomically (one PATCH carries both),
  so both optimistic values are trusted as-is.
  ========================================================== */

  const applyLinkedFieldsEdit = useCallback(
    (id, fieldValues, source = "Inline edit", batchId) => {
      if (rejectUnmappedFields(Object.keys(fieldValues))) {
        return 0;
      }

      const entries = [];
      const touched = {};
      let targetRow = null;

      const nextRows = rowsRef.current.map((row) => {
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
            user: currentUserName,
            empId: row.empId,
            employeeName: row.name,
            field: labelOf(key),
            from: String(before || ""),
            to: String(next || ""),
            source,
            ...(batchId ? { batchId } : {}),
            appraisalYear: APPRAISAL_YEAR,
            saved: false,
          };

          entries.push(entry);

          touched[`${row.id}:${key}`] = true;

          nextRow[key] = next;
        });

        return nextRow;
      });

      if (!entries.length || !targetRow) {
        return 0;
      }

      updateRows(() => nextRows);

      rememberLastEdit(entries[entries.length - 1]);
      setAudit((prev) => [...entries.slice().reverse(), ...prev]);

      setModified((prev) => ({
        ...prev,
        ...touched,
      }));

      const empId = targetRow.empId;
      const keys = Object.keys(fieldValues);

      markPendingCells(pendingCellsRef.current, empId, keys);

      void queueEmployeeSave(empId, async () => {
        let employeeSaved = false;

        try {
          const catalystPayload = {};

          Object.entries(fieldValues).forEach(([key, next]) => {
            catalystPayload[REACT_TO_CATALYST_FIELD[key]] =
              normalizeValueForCatalyst(key, next);
          });

          const response = await catalystFetch(EMPLOYEE_API_URL, {
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

          employeeSaved = true;

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
        } catch (failure) {
          await handleSaveFailure({
            empId,
            keys,
            auditEntries: entries,
            employeeSaved,
            failure,
          });
        } finally {
          clearPendingCells(pendingCellsRef.current, empId, keys);
        }
      });

      return entries.length;
    },
    [currentUserName, rejectUnmappedFields, updateRows, handleSaveFailure],
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

  Hike Amount / Hike % go through the same linked calculation
  as inline edits so the other field is recalculated too.
  ========================================================== */

  const bulkUpdate = useCallback(
    (ids, key, mode, value) => {
      const batchId = nextId();

      const computeNext = (row, roundValue) => {
        if (mode === "set") {
          return value;
        }

        const current = Number(row[key]) || 0;

        const numericValue = Number(value) || 0;

        if (mode === "increaseAmount") {
          return roundValue(current + numericValue);
        }

        return roundValue(current * (1 + numericValue / 100));
      };

      if (key === "hikeAmount" || key === "hikePct") {
        // Percentages keep 2 decimals; amounts are whole numbers.
        const roundValue =
          key === "hikePct"
            ? (number) => Number(number.toFixed(2))
            : Math.round;

        let changedRows = 0;

        rowsRef.current
          .filter((row) => ids.includes(row.id))
          .forEach((row) => {
            const changed = applyLinkedFieldsEdit(
              row.id,
              linkedHikeValues(row, key, computeNext(row, roundValue)),
              "Bulk edit",
              batchId,
            );

            if (changed) {
              changedRows += 1;
            }
          });

        return changedRows;
      }

      return applyEdits(
        ids,
        key,
        (row) => computeNext(row, Math.round),
        "Bulk edit",
        batchId,
      );
    },
    [applyEdits, applyLinkedFieldsEdit],
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

      const response = await catalystFetch(EMPLOYEE_API_URL, {
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
        updateRows((prev) =>
          prev.filter((row) => String(row.empId) !== String(empId)),
        );
      } else {
        updateRows((prev) =>
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
        user: currentUserName,
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
    [rows, currentUserName, updateRows],
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

  // An explicit refresh always reads from the server, never a shared copy.
  // Before any screen has loaded appraisal data there is nothing to refresh.
  const refreshEmployees = useCallback(async () => {
    if (!dataWantedRef.current) return;
    invalidateEmployeeRoster();
    invalidatePayrollCycleReads();
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

        updateRows((prev) => [...prev, employee]);

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
          user: currentUserName,
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
  }, [currentUserName, updateRows]);

  /* ==========================================================
  CONTEXT VALUE
  ========================================================== */

  // Yellow "edited" cells = edited this session + everything already in this
  // cycle's audit trail, so they survive a refresh or a fresh login.
  const modified = useMemo(() => {
    const rowIdByEmp = new Map();
    rows.forEach((row) => {
      const emp = String(row.empId || "").trim();
      if (emp) rowIdByEmp.set(emp, row.id);
    });

    const keyByName = new Map();
    COLUMNS.forEach((column) => {
      if (!column.editable || column.computed) return;
      keyByName.set(String(column.key).trim().toLowerCase(), column.key);
      keyByName.set(String(labelOf(column.key)).trim().toLowerCase(), column.key);
    });

    // Audit entries saved before the column renames carry the old labels.
    [
      ["pb to be paid", "pbToBePaid"],
      ["rb to be paid", "rbToBePaid"],
      ["performance bonus (pb)", "allocatedPBAmount"],
      ["retention bonus (rb)", "newRB"],
    ].forEach(([name, key]) => keyByName.set(name, key));

    const fromAudit = {};
    (Array.isArray(audit) ? audit : []).forEach((entry) => {
      const rowId = rowIdByEmp.get(String(entry?.empId || "").trim());
      const key = keyByName.get(String(entry?.field || "").trim().toLowerCase());
      if (rowId !== undefined && key) fromAudit[`${rowId}:${key}`] = true;
    });

    return { ...fromAudit, ...modifiedLive };
  }, [audit, rows, modifiedLive]);

  const value = useMemo(
    () => ({
      rows,
      audit,
      modified,
      loading,
      error,
      saveError,
      clearSaveError,
      employeeCounts,
      updateCell,
      updateLinkedCells,
      bulkUpdate,
      updateEmployeeStatus,
      historyFor,
      appraisalHistoryFor,
      refreshEmployees,
      refreshAuditHistory,
      requestData,
    }),
    [
      rows,
      audit,
      modified,
      loading,
      error,
      saveError,
      clearSaveError,
      employeeCounts,
      updateCell,
      updateLinkedCells,
      bulkUpdate,
      updateEmployeeStatus,
      historyFor,
      appraisalHistoryFor,
      refreshEmployees,
      refreshAuditHistory,
      requestData,
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

// Reading appraisal data starts the provider's load (once).
export function useAppraisal() {
  const ctx = useContext(AppraisalContext);
  const requestData = ctx?.requestData;

  useEffect(() => {
    if (requestData) requestData();
  }, [requestData]);

  if (!ctx) {
    throw new Error("useAppraisal must be used inside AppraisalProvider");
  }

  return ctx;
}

// For screens that only refresh appraisal data after their own saves:
// returns refreshEmployees without starting a load.
export function useAppraisalRefresh() {
  const ctx = useContext(AppraisalContext);

  if (!ctx) {
    throw new Error("useAppraisalRefresh must be used inside AppraisalProvider");
  }

  return { refreshEmployees: ctx.refreshEmployees };
}