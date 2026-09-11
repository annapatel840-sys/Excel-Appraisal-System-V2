const EMPLOYEE_API_URL =
  "https://excelappraisal-904056216.development.catalystserverless.com/server/employee-api-v2/";

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
  let days = referenceDate.getDate() - joining.getDate();

  if (days < 0) {
    months--;
  }

  if (months < 0) {
    years--;
  }

  const totalMonths = Math.max(0, years * 12 + months);

  return Number((totalMonths / 12).toFixed(1));
}

export function mapEmployeeFromApi(employee) {
  const joiningDate = employee?.Joining_date || employee?.joining_date || "";

  const reportingManager =
    employee?.reporting_manager || employee?.manager || "";

  const compManager = employee?.comp_manager || "";

  const appraiser = employee?.appraiser_tech_ed || "";

  return {
    empId: String(employee?.emp_id ?? ""),

    name: String(employee?.name ?? ""),

    designation: String(employee?.designation ?? ""),

    organization: String(employee?.department ?? employee?.organization ?? ""),

    doj: String(joiningDate),

    totalExp:
      employee?.total_experience !== undefined &&
      employee?.total_experience !== null
        ? Number(employee.total_experience)
        : calculateOrganizationExperience(joiningDate),

    reportingManager: String(reportingManager),

    compManager: String(compManager),

    superManager: String(appraiser),

    appraiser: String(appraiser),

    managerMail: String(employee?.manager_email_id || ""),

    superManagerMail: String(employee?.super_man_email_id || ""),

    status: normalizeStatus(employee?.status),

    eligible: "Yes",

    eligibleReason: "",

    manualOverride: false,

    catalystRowId: employee?.ROWID || "",

    rawEmployee: employee,
  };
}

export async function fetchEmployeeMasterEmployees({
  page = 1,
  limit = 20,
  search = "",
  status = "all",
} = {}) {
  const url = new URL(EMPLOYEE_API_URL);

  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));

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

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Employee API failed with status ${response.status}`);
  }

  const result = await response.json();

  if (!result?.success) {
    throw new Error(result?.message || "Failed to load employees.");
  }

  const employees = Array.isArray(result.data)
    ? result.data.map(mapEmployeeFromApi)
    : [];

  return {
    data: employees,

    pagination: {
      page: result?.pagination?.page ?? page,

      limit: result?.pagination?.limit ?? limit,

      totalCount: result?.pagination?.totalCount ?? employees.length,

      totalPages: result?.pagination?.totalPages ?? 1,
    },

    counts: {
      total:
        result?.counts?.total ??
        result?.pagination?.totalCount ??
        employees.length,

      active: result?.counts?.active ?? 0,

      inactive: result?.counts?.inactive ?? 0,
    },

    filters: {
      search: result?.filters?.search ?? normalizedSearch,

      status: result?.filters?.status ?? normalizedStatus,
    },
  };
}

export async function updateEmployeeMasterEmployee(empId, data = {}) {
  const normalizedEmpId = String(empId || "").trim();

  if (!normalizedEmpId) {
    throw new Error("Employee ID is required.");
  }

  const response = await fetch(EMPLOYEE_API_URL, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      emp_id: normalizedEmpId,
      ...data,
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.message ||
        `Employee update failed with status ${response.status}`,
    );
  }

  if (!result?.success) {
    throw new Error(result?.message || "Failed to update employee.");
  }

  return {
    ...result,
    data: result?.data ? mapEmployeeFromApi(result.data) : null,
  };
}

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
