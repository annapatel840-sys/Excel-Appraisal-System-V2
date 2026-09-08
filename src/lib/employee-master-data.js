import { buildEmployees } from "./appraisal-data";

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

/*
 * ============================================================
 * SAME EMPLOYEE SOURCE AS APPRAISAL SHEET
 * ============================================================
 *
 * Appraisal Sheet already generates 250 employees through
 * buildEmployees(250).
 *
 * Employee Master derives its employee roster from the
 * same source so both screens always use the same employees
 * and employee IDs.
 */

const appraisalEmployees = buildEmployees(250);

/*
 * ============================================================
 * STATUS
 * ============================================================
 */

function normalizeStatus(status) {
  return status === "Inactive" ? "Inactive" : "Active";
}

/*
 * ============================================================
 * DATE OF JOINING
 * ============================================================
 *
 * If appraisal-data already contains DOJ, use it.
 *
 * If DOJ is missing, generate demo DOJ values so that all
 * 250 employees have Date of Joining data.
 */

function getEmployeeDate(employee, index) {
  if (employee.doj || employee.dateOfJoining || employee.joiningDate) {
    return employee.doj || employee.dateOfJoining || employee.joiningDate || "";
  }

  const year = 2017 + (index % 9);
  const month = (index % 12) + 1;
  const day = (index % 25) + 1;

  return `${year}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}`;
}

/*
 * ============================================================
 * EMAIL HELPER
 * ============================================================
 *
 * Creates a clean demo email from the manager's name.
 *
 * Example:
 * Ashok Kumar -> ashok.kumar@r2c.com
 */

function createDemoEmail(name, fallback) {
  const cleanName = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");

  return cleanName ? `${cleanName}@r2c.com` : fallback;
}

/*
 * ============================================================
 * ORGANIZATION
 * ============================================================
 */

function getOrganization(employee) {
  return employee.organization || employee.department || employee.orgtn || "";
}

/*
 * ============================================================
 * REPORTING MANAGER
 * ============================================================
 */

function getReportingManager(employee) {
  return employee.reportingManager || employee.manager || "";
}

/*
 * ============================================================
 * COMP MANAGER
 * ============================================================
 */

function getCompManager(employee) {
  return (
    employee.compManager || employee.reportingManager || employee.manager || ""
  );
}

/*
 * ============================================================
 * SUPER MANAGER
 * ============================================================
 */

function getSuperManager(employee) {
  return (
    employee.superManager ||
    employee.appraiserTechED ||
    employee.appraiser ||
    ""
  );
}

/*
 * ============================================================
 * APPRAISER
 * ============================================================
 */

function getAppraiser(employee) {
  return (
    employee.appraiser ||
    employee.appraiserTechED ||
    employee.superManager ||
    ""
  );
}

/*
 * ============================================================
 * MANAGER EMAIL
 * ============================================================
 *
 * Existing email is preserved.
 *
 * If missing, demo email is generated automatically.
 */

function getManagerMail(employee, index) {
  if (employee.managerMail || employee.managerEmail) {
    return employee.managerMail || employee.managerEmail;
  }

  return createDemoEmail(
    employee.reportingManager || employee.manager,
    `manager${(index % 10) + 1}@r2c.com`,
  );
}

/*
 * ============================================================
 * SUPER MANAGER EMAIL
 * ============================================================
 *
 * Existing email is preserved.
 *
 * If missing, demo email is generated automatically.
 */

function getSuperManagerMail(employee, index) {
  if (employee.superManagerMail || employee.superManagerEmail) {
    return employee.superManagerMail || employee.superManagerEmail;
  }

  return createDemoEmail(
    employee.superManager || employee.appraiserTechED || employee.appraiser,
    `supermanager${(index % 5) + 1}@r2c.com`,
  );
}

/*
 * ============================================================
 * TOTAL EXPERIENCE
 * ============================================================
 */

function getTotalExperience(employee) {
  return employee.totalExperience || employee.totalExp || "";
}

/*
 * ============================================================
 * INITIAL EMPLOYEE MASTER DATA
 * ============================================================
 *
 * Same 250 employees as Appraisal Sheet.
 *
 * Added demo data:
 *   - Date of Joining
 *   - Manager Email ID
 *   - Super Manager Email ID
 *
 * Existing values are always preserved when available.
 */

export const INITIAL_EMPLOYEES = appraisalEmployees.map((employee, index) => ({
  empId: String(employee.empId ?? ""),

  name: String(employee.name ?? ""),

  designation: String(employee.designation ?? ""),

  organization: String(getOrganization(employee)),

  /*
   * Date of Joining
   * Existing value if available,
   * otherwise generated demo value.
   */
  doj: String(getEmployeeDate(employee, index)),

  totalExp: String(getTotalExperience(employee)),

  reportingManager: String(getReportingManager(employee)),

  compManager: String(getCompManager(employee)),

  superManager: String(getSuperManager(employee)),

  appraiser: String(getAppraiser(employee)),

  /*
   * Manager Email ID
   * Existing value if available,
   * otherwise generated demo email.
   */
  managerMail: String(getManagerMail(employee, index)),

  /*
   * Super Manager Email ID
   * Existing value if available,
   * otherwise generated demo email.
   */
  superManagerMail: String(getSuperManagerMail(employee, index)),

  status: normalizeStatus(employee.status),

  /*
   * ========================================================
   * ELIGIBILITY
   * ========================================================
   *
   * Every employee starts as eligible.
   *
   * Employee Master controls this value.
   */
  eligible: "Yes",

  eligibleReason: "",

  manualOverride: false,
}));
