import { authFetch } from "@/lib/catalyst-auth";

const EMPLOYEE_API_URL =
  "https://appraisalperformancehike-60088966704.development.catalystserverless.in/server/employeesapi/";
export const EXPERIENCE_REF_DATE = new Date(2026, 0, 1);
export const APPRAISAL_YEAR = "Apr-26";

export const FIELD_DEFS = [
  {
    key: "name",
    label: "Employee Name",
    uploadHeaders: ["Employee Name", "Name"],
  },
  {
    key: "empId",
    label: "Emp ID",
    uploadHeaders: ["Emp ID", "Employee ID", "EmpID"],
  },
  {
    key: "designation",
    label: "Designation",
    uploadHeaders: ["Designation"],
  },
  {
    key: "organization",
    label: "Organization",
    uploadHeaders: ["Organization", "Orgtn", "Department"],
  },
  {
    key: "doj",
    label: "Date of Joining",
    uploadHeaders: ["Date of Joining", "DOJ"],
  },
  {
    key: "orgExp",
    label: "Organization Experience",
    uploadHeaders: ["Organization Experience", "Org Exp", "wissen_experience"],
  },
  {
    key: "totalExp",
    label: "Total Experience (as on 1 Jan)",
    uploadHeaders: ["Total Experience as on 1st Jan", "Total Experience"],
  },
  {
    key: "reportingManager",
    label: "Reporting Manager",
    uploadHeaders: ["Reporting Manager"],
  },
  {
    key: "compManager",
    label: "Comp. Manager",
    uploadHeaders: ["Comp. Manager", "Comp Manager"],
  },
  {
    key: "superManager",
    label: "Super Manager",
    uploadHeaders: ["Super manager name", "Super Manager"],
  },
  {
    key: "appraiser",
    label: "Appraiser / Super Manager",
    uploadHeaders: [
      "Appraiser Super manager nam Name",
      "Appraiser / Super Manager",
      "Appraiser",
    ],
  },
  {
    key: "managerMail",
    label: "Manager Email ID",
    uploadHeaders: ["Manager Mail", "Manager Email ID"],
  },
  {
    key: "superManagerMail",
    label: "Super Manager Email ID",
    uploadHeaders: ["Super Manager Mail", "Super Manager Email ID"],
  },
  {
    key: "status",
    label: "Status",
    uploadHeaders: ["Status", "Active/Inactive"],
  },
];

function normalizeStatus(status) {
  return String(status || "").toLowerCase() === "inactive"
    ? "Inactive"
    : "Active";
}

function normalizeEligibility(value) {
  const eligibility = String(value || "")
    .trim()
    .toLowerCase();

  if (
    eligibility === "eligible" ||
    eligibility === "yes" ||
    eligibility === "true"
  ) {
    return "Yes";
  }

  if (
    eligibility === "not eligible" ||
    eligibility === "noteligible" ||
    eligibility === "no" ||
    eligibility === "false"
  ) {
    return "No";
  }

  return "";
}

function calculateOrganizationExperience(joiningDate) {
  if (!joiningDate) {
    return "";
  }

  const joining = new Date(joiningDate);

  if (Number.isNaN(joining.getTime())) {
    return "";
  }

  const referenceDate = EXPERIENCE_REF_DATE;

  let years = referenceDate.getFullYear() - joining.getFullYear();
  let months = referenceDate.getMonth() - joining.getMonth();
  const days = referenceDate.getDate() - joining.getDate();

  if (days < 0) {
    months--;
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  const totalMonths = Math.max(0, years * 12 + months);

  return Number((totalMonths / 12).toFixed(1));
}

function unwrapEmployee(employee) {
  if (
    employee &&
    typeof employee === "object" &&
    employee.Employees &&
    typeof employee.Employees === "object"
  ) {
    return employee.Employees;
  }

  return employee || {};
}

export function mapEmployeeFromApi(employee) {
  const row = unwrapEmployee(employee);

  const joiningDate =
    row.Joining_date ||
    row.joining_date ||
    row.doj ||
    row.date_of_joining ||
    row.dateOfJoining ||
    row.joiningDate ||
    "";

  const reportingManager =
    row.reporting_manager || row.reportingManager || row.manager || "";

  const compManager = row.comp_manager || row.compManager || "";

  const superManager =
    row.super_manager ||
    row.superManager ||
    row.appraiser_tech_ed ||
    row.appraiserTechED ||
    "";

  const appraiser =
    row.appraiser ||
    row.appraiser_tech_ed ||
    row.appraiserTechED ||
    row.super_manager ||
    row.superManager ||
    "";

  /*
   * ============================================================
   * ORGANIZATION EXPERIENCE
   * ============================================================
   *
   * This value comes directly from:
   *
   * Employees.wissen_experience
   */

  const organizationExperience =
    row.wissen_experience !== undefined &&
    row.wissen_experience !== null &&
    row.wissen_experience !== ""
      ? row.wissen_experience
      : row.wissenExperience !== undefined &&
          row.wissenExperience !== null &&
          row.wissenExperience !== ""
        ? row.wissenExperience
        : row.orgExp !== undefined && row.orgExp !== null && row.orgExp !== ""
          ? row.orgExp
          : "";

  /*
   * ============================================================
   * ELIGIBILITY
   * ============================================================
   *
   * Source of truth:
   *
   * Employees.eligible_status
   *
   * The existing UI uses employee.eligible as Yes / No,
   * so we keep that frontend property for compatibility.
   */

  const eligibilityValue =
    row.eligible_status !== undefined &&
    row.eligible_status !== null &&
    row.eligible_status !== ""
      ? row.eligible_status
      : row.eligible;

  const mappedEligibility = normalizeEligibility(eligibilityValue);

  return {
    empId: String(
      row.emp_id !== undefined && row.emp_id !== null
        ? row.emp_id
        : row.empId || "",
    ).trim(),

    name: String(row.name || "").trim(),

    designation: String(row.designation || "").trim(),

    organization: String(
      row.organization || row.department || row.orgtn || "",
    ).trim(),

    doj: String(joiningDate).trim(),

    /*
     * Organization Experience
     *
     * Directly from Data Store:
     * wissen_experience
     */
    orgExp:
      organizationExperience !== "" &&
      organizationExperience !== null &&
      organizationExperience !== undefined
        ? Number(organizationExperience)
        : "",

    totalExp:
      row.total_experience !== undefined &&
      row.total_experience !== null &&
      row.total_experience !== ""
        ? Number(row.total_experience)
        : calculateOrganizationExperience(joiningDate),

    reportingManager: String(reportingManager).trim(),

    compManager: String(compManager).trim(),

    superManager: String(superManager).trim(),

    appraiser: String(appraiser).trim(),

    managerMail: String(
      row.manager_email_id ||
        row.manager_mail ||
        row.managerMail ||
        row.manager_email ||
        row.managerEmail ||
        "",
    ).trim(),

    superManagerMail: String(
      row.super_man_email_id ||
        row.super_manager_mail ||
        row.superManagerMail ||
        row.super_manager_email ||
        row.superManagerEmail ||
        "",
    ).trim(),

    status: normalizeStatus(row.status),

    /*
     * Eligibility comes from Employees.eligible_status.
     *
     * Existing UI continues to use:
     * Yes = Eligible
     * No = Not Eligible
     */
    eligible: mappedEligibility || "No",

    /*
     * Keep the actual Data Store value available.
     */
    eligibleStatus: String(
      row.eligible_status !== undefined && row.eligible_status !== null
        ? row.eligible_status
        : "",
    ).trim(),

    eligibleReason: String(
      row.eligibleReason || row.eligible_reason || "",
    ).trim(),

    manualOverride: Boolean(row.manualOverride || row.manual_override || false),

    catalystRowId: String(row.ROWID || row.rowid || ""),

    /*
     * Keep original Catalyst row available.
     */
    rawEmployee: row,
  };
}

/* ============================================================
   FETCH EMPLOYEE MASTER EMPLOYEES
   ============================================================ */

export async function fetchEmployeeMasterEmployees({
  page = 1,
  limit = 20,
  search = "",
  status = "all",
} = {}) {
  const url = new URL(EMPLOYEE_API_URL);

  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("view", "master");

  const normalizedSearch = String(search || "").trim();

  const normalizedStatus = String(status || "all")
    .trim()
    .toLowerCase();

  if (normalizedSearch) {
    url.searchParams.set("search", normalizedSearch);
  }

  if (normalizedStatus && normalizedStatus !== "all") {
    url.searchParams.set("status", normalizedStatus);
  }

  const response = await authFetch(url.toString(), {
    method: "GET",

    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Employee API failed with status ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || "Failed to load employees.");
  }

  const employees = Array.isArray(result.data)
    ? result.data.map(mapEmployeeFromApi)
    : [];

  return {
    data: employees,

    pagination: {
      page:
        result.pagination && result.pagination.page !== undefined
          ? result.pagination.page
          : page,

      limit:
        result.pagination && result.pagination.limit !== undefined
          ? result.pagination.limit
          : limit,

      totalCount:
        result.pagination && result.pagination.totalCount !== undefined
          ? result.pagination.totalCount
          : employees.length,

      totalPages:
        result.pagination && result.pagination.totalPages !== undefined
          ? result.pagination.totalPages
          : 1,
    },

    counts: {
      total:
        result.counts && result.counts.total !== undefined
          ? result.counts.total
          : result.pagination && result.pagination.totalCount !== undefined
            ? result.pagination.totalCount
            : employees.length,

      active:
        result.counts && result.counts.active !== undefined
          ? result.counts.active
          : 0,

      inactive:
        result.counts && result.counts.inactive !== undefined
          ? result.counts.inactive
          : 0,
    },

    filters: {
      search:
        result.filters && result.filters.search !== undefined
          ? result.filters.search
          : normalizedSearch,

      status:
        result.filters && result.filters.status !== undefined
          ? result.filters.status
          : normalizedStatus,
    },
  };
}

/* ============================================================
   FETCH ELIGIBILITY LIST
   ============================================================
 *
 * Source:
 * Employees Data Store
 *
 * Backend view:
 * ?view=eligibility
 *
 * This returns ALL employees:
 * Eligible + Not Eligible
 * Active + Inactive
 */

export async function fetchEligibilityEmployees({
  page = 1,
  limit = 20,
  search = "",
} = {}) {
  const url = new URL(EMPLOYEE_API_URL);

  url.searchParams.set("view", "eligibility");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

  const normalizedSearch = String(search || "").trim();

  if (normalizedSearch) {
    url.searchParams.set("search", normalizedSearch);
  }

  const response = await authFetch(url.toString(), {
    method: "GET",

    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Eligibility Employee API failed with status ${response.status}`,
    );
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(
      result.message || "Failed to load Eligibility List employees.",
    );
  }

  const employees = Array.isArray(result.data)
    ? result.data.map(mapEmployeeFromApi)
    : [];

  return {
    data: employees,

    pagination: {
      page:
        result.pagination && result.pagination.page !== undefined
          ? result.pagination.page
          : page,

      limit:
        result.pagination && result.pagination.limit !== undefined
          ? result.pagination.limit
          : limit,

      totalCount:
        result.pagination && result.pagination.totalCount !== undefined
          ? result.pagination.totalCount
          : employees.length,

      totalPages:
        result.pagination && result.pagination.totalPages !== undefined
          ? result.pagination.totalPages
          : 1,

      returnedCount:
        result.pagination && result.pagination.returnedCount !== undefined
          ? result.pagination.returnedCount
          : employees.length,
    },

    counts: {
      total:
        result.counts && result.counts.total !== undefined
          ? result.counts.total
          : 0,

      active:
        result.counts && result.counts.active !== undefined
          ? result.counts.active
          : 0,

      inactive:
        result.counts && result.counts.inactive !== undefined
          ? result.counts.inactive
          : 0,
    },
  };
}

/* ============================================================
   UPDATE EMPLOYEE
   ============================================================
 *
 * Used by Employee Master for Active / Inactive updates.
 *
 * IMPORTANT:
 * This function does NOT modify eligibility.
 */

export async function updateEmployeeMasterEmployee(empId, data = {}) {
  const normalizedEmpId = String(empId || "").trim();

  if (!normalizedEmpId) {
    throw new Error("Employee ID is required.");
  }

  const payload = {
    emp_id: normalizedEmpId,
    ...data,
  };

  if (payload.status !== undefined) {
    const normalizedStatus = String(payload.status || "").trim();

    if (normalizedStatus !== "Active" && normalizedStatus !== "Inactive") {
      throw new Error("Status must be Active or Inactive.");
    }

    payload.status = normalizedStatus;
  }

  console.log("[Employee Master] Updating employee:", payload);

  const response = await authFetch(EMPLOYEE_API_URL, {
    method: "PUT",

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

  console.log("[Employee Master] Update response:", response.status, result);

  if (!response.ok) {
    throw new Error(
      (result && result.message) ||
        (result && result.error) ||
        responseText ||
        `Employee update failed with status ${response.status}`,
    );
  }

  if (!result || !result.success) {
    throw new Error(
      (result && result.message) ||
        (result && result.error) ||
        "Failed to update employee.",
    );
  }

  return {
    ...result,

    data: result.data ? mapEmployeeFromApi(result.data) : null,
  };
}

/* ============================================================
   UPDATE EMPLOYEE ELIGIBILITY
   ============================================================
 *
 * Source of truth:
 * Employees.eligible_status
 *
 * Yes -> Eligible
 * No  -> Not Eligible
 */

export async function updateEmployeeEligibility(
  empId,
  eligible,
  eligibleReason = "",
) {
  const normalizedEmpId = String(empId || "").trim();

  if (!normalizedEmpId) {
    throw new Error("Employee ID is required.");
  }

  const normalizedEligible = String(eligible || "")
    .trim()
    .toLowerCase();

  let eligibleStatus = "";

  if (normalizedEligible === "yes" || normalizedEligible === "eligible") {
    eligibleStatus = "Eligible";
  } else if (
    normalizedEligible === "no" ||
    normalizedEligible === "not eligible" ||
    normalizedEligible === "noteligible"
  ) {
    eligibleStatus = "Not Eligible";
  } else {
    throw new Error("Eligibility must be Eligible or Not Eligible.");
  }

  const payload = {
    emp_id: normalizedEmpId,
    eligible_status: eligibleStatus,
  };

  console.log("[Eligibility List] Updating eligibility:", payload);

  const response = await authFetch(EMPLOYEE_API_URL, {
    method: "PATCH",

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

  console.log("[Eligibility List] Update response:", response.status, result);

  if (!response.ok) {
    throw new Error(
      (result && result.message) ||
        (result && result.error) ||
        responseText ||
        `Eligibility update failed with status ${response.status}`,
    );
  }

  if (!result || !result.success) {
    throw new Error(
      (result && result.message) ||
        (result && result.error) ||
        "Failed to update employee eligibility.",
    );
  }

  return {
    ...result,

    data: result.data ? mapEmployeeFromApi(result.data) : null,

    eligibleStatus: eligibleStatus,

    eligibleReason: String(eligibleReason || "").trim(),
  };
}

/* ============================================================
   CREATE / IMPORT EMPLOYEES
   ============================================================ */

export async function createEmployeeMasterEmployees(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("No employee records to import.");
  }

  const response = await authFetch(EMPLOYEE_API_URL, {
    method: "POST",

    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      employees: records,
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      (result && result.message) ||
        `Employee import failed with status ${response.status}`,
    );
  }

  if (!result || !result.success) {
    throw new Error(
      (result && result.message) || "Failed to import employees.",
    );
  }

  return result;
}

/* ============================================================
   FETCH ALL EMPLOYEE MASTER EMPLOYEES
   ============================================================ */

export async function fetchAllEmployeeMasterEmployees() {
  const firstPage = await fetchEmployeeMasterEmployees({
    page: 1,
    limit: 100,
  });

  const allEmployees = [...firstPage.data];

  const totalPages = firstPage.pagination.totalPages;

  for (let page = 2; page <= totalPages; page++) {
    const result = await fetchEmployeeMasterEmployees({
      page,
      limit: 100,
    });

    allEmployees.push(...result.data);
  }

  return allEmployees;
}

export const INITIAL_EMPLOYEES = [];
