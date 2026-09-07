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
    uploadHeaders: ["Organization", "Orgtn"],
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

const firstNames = [
  "Rohan",
  "Anita",
  "Rahul",
  "Priya",
  "Amit",
  "Neha",
  "Vikram",
  "Sneha",
  "Arjun",
  "Pooja",
  "Karan",
  "Meera",
];

const lastNames = [
  "Kapoor",
  "Rao",
  "Sharma",
  "Patel",
  "Mehta",
  "Das",
  "Singh",
  "Gupta",
  "Nair",
  "Verma",
  "Mishra",
  "Joshi",
];

const designations = [
  "Senior Manager",
  "Manager",
  "Senior Associate",
  "Associate",
  "Lead",
  "Assistant Manager",
];

const managers = [
  "Anita Sharma",
  "Rohan Kapoor",
  "Raj Mehta",
  "Vikram Singh",
  "Priya Das",
];

const organizations = [
  "Technology",
  "Operations",
  "Finance",
  "Human Resources",
  "Sales",
  "Marketing",
];

const baseEmployees = [
  {
    empId: "EMP00125",
    name: "Rohan Kapoor",
    designation: "Senior Manager",
    organization: "Technology",
    doj: "2019-03-12",
    totalExp: "10 yrs 2 mo",
    reportingManager: "Anita Sharma",
    compManager: "Anita Sharma",
    superManager: "Raj Mehta",
    appraiser: "Raj Mehta",
    managerMail: "manager@company.com",
    superManagerMail: "raj.mehta@company.com",
    status: "Active",
  },
  {
    empId: "EMP00146",
    name: "Anita Rao",
    designation: "Manager",
    organization: "Technology",
    doj: "2020-07-04",
    totalExp: "7 yrs 8 mo",
    reportingManager: "Rohan Kapoor",
    compManager: "Rohan Kapoor",
    superManager: "Raj Mehta",
    appraiser: "Raj Mehta",
    managerMail: "rohan@company.com",
    superManagerMail: "raj.mehta@company.com",
    status: "Active",
  },
];

for (let i = 0; i < 98; i += 1) {
  const first = firstNames[i % firstNames.length];
  const last = lastNames[(i * 3) % lastNames.length];

  const year = 2017 + (i % 8);
  const month = String((i % 12) + 1).padStart(2, "0");
  const day = String((i % 27) + 1).padStart(2, "0");

  const manager = managers[i % managers.length];
  const organization = organizations[i % organizations.length];

  baseEmployees.push({
    empId: `EMP${String(200 + i).padStart(3, "0")}`,
    name: `${first} ${last}`,
    designation: designations[i % designations.length],
    organization,
    doj: `${year}-${month}-${day}`,
    totalExp: `${3 + (i % 9)} yrs ${(i * 2) % 12} mo`,
    reportingManager: manager,
    compManager: manager,
    superManager: "Raj Mehta",
    appraiser: "Raj Mehta",
    managerMail: `${manager.toLowerCase().replaceAll(" ", ".")}@company.com`,
    superManagerMail: "raj.mehta@company.com",
    status: i % 11 === 0 ? "Inactive" : "Active",
  });
}

export const INITIAL_EMPLOYEES = baseEmployees.map((employee) => ({
  ...employee,
  eligible: "Yes",
  eligibleReason: "",
  manualOverride: false,
}));
