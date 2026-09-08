// import { useEffect, useMemo, useRef, useState } from "react";
// import { CheckCircle2, AlertCircle } from "lucide-react";

// import { AppShell } from "@/components/appraisal/AppShell";

// import { FIELD_DEFS, INITIAL_EMPLOYEES } from "@/lib/employee-master-data";

// import {
//   findFieldForHeader,
//   normalizeEligibleValue,
//   parseCsv,
//   csvRowsToObjects,
// } from "@/lib/employee-master-utils";

// import {
//   downloadRosterTemplate,
//   downloadRosterData,
//   downloadEligibilityTemplate,
//   exportEligibilityData,
// } from "@/lib/employee-master-export";

// import { EmployeeMasterToolbar } from "@/components/employee-master/EmployeeMasterToolbar";
// import { EmployeeRosterTable } from "@/components/employee-master/EmployeeRosterTable";
// import { EligibilityCriteria } from "@/components/employee-master/EligibilityCriteria";
// import { EligibilityList } from "@/components/employee-master/EligibilityList";
// import { EligibilityModal } from "@/components/employee-master/EligibilityModal";
// import { ImportPreviewModal } from "@/components/employee-master/ImportPreviewModal";

// import "@/styles/employee-master.css";

// const EMPLOYEE_MASTER_STORAGE_KEY = "employee-master-employees";
// const EMPLOYEE_MASTER_EVENT = "employee-master-updated";

// /*
//  * IMPORTANT:
//  * Version increased from 3 -> 4 so the new demo
//  * Date of Joining and Email data from
//  * employee-master-data.js gets loaded.
//  */
// const EMPLOYEE_MASTER_DATA_VERSION = 4;
// const EMPLOYEE_MASTER_VERSION_KEY = "employee-master-data-version";

// function buildFreshEmployees() {
//   return INITIAL_EMPLOYEES.map((employee) => ({
//     ...employee,
//   }));
// }

// function loadEmployees() {
//   try {
//     const stored = localStorage.getItem(EMPLOYEE_MASTER_STORAGE_KEY);
//     const storedVersion = Number(
//       localStorage.getItem(EMPLOYEE_MASTER_VERSION_KEY) || "0",
//     );

//     if (storedVersion < EMPLOYEE_MASTER_DATA_VERSION) {
//       if (stored) {
//         const oldEmployees = JSON.parse(stored);

//         if (Array.isArray(oldEmployees)) {
//           const oldById = new Map(
//             oldEmployees
//               .filter((employee) => employee?.empId)
//               .map((employee) => [String(employee.empId), employee]),
//           );

//           const migrated = buildFreshEmployees().map((employee) => {
//             const oldEmployee = oldById.get(String(employee.empId));

//             if (!oldEmployee) {
//               return employee;
//             }

//             return {
//               ...employee,
//               eligible: oldEmployee.eligible === "No" ? "No" : "Yes",
//               eligibleReason: oldEmployee.eligibleReason || "",
//               manualOverride: Boolean(oldEmployee.manualOverride),

//               /*
//                * Keep the new eligibility-driven status rule.
//                */
//               status:
//                 oldEmployee.eligible === "No"
//                   ? "Inactive"
//                   : oldEmployee.status || employee.status || "Active",
//             };
//           });

//           localStorage.setItem(
//             EMPLOYEE_MASTER_STORAGE_KEY,
//             JSON.stringify(migrated),
//           );

//           localStorage.setItem(
//             EMPLOYEE_MASTER_VERSION_KEY,
//             String(EMPLOYEE_MASTER_DATA_VERSION),
//           );

//           return migrated;
//         }
//       }

//       const fresh = buildFreshEmployees();

//       localStorage.setItem(EMPLOYEE_MASTER_STORAGE_KEY, JSON.stringify(fresh));

//       localStorage.setItem(
//         EMPLOYEE_MASTER_VERSION_KEY,
//         String(EMPLOYEE_MASTER_DATA_VERSION),
//       );

//       return fresh;
//     }

//     if (stored) {
//       const parsed = JSON.parse(stored);

//       if (Array.isArray(parsed) && parsed.length > 0) {
//         if (parsed.length === INITIAL_EMPLOYEES.length) {
//           return parsed;
//         }
//       }
//     }
//   } catch {
//     // Ignore invalid localStorage and use fresh data.
//   }

//   const fresh = buildFreshEmployees();

//   try {
//     localStorage.setItem(EMPLOYEE_MASTER_STORAGE_KEY, JSON.stringify(fresh));

//     localStorage.setItem(
//       EMPLOYEE_MASTER_VERSION_KEY,
//       String(EMPLOYEE_MASTER_DATA_VERSION),
//     );
//   } catch {
//     // Ignore localStorage errors.
//   }

//   return fresh;
// }

// function saveEmployees(employees) {
//   try {
//     localStorage.setItem(
//       EMPLOYEE_MASTER_STORAGE_KEY,
//       JSON.stringify(employees),
//     );

//     localStorage.setItem(
//       EMPLOYEE_MASTER_VERSION_KEY,
//       String(EMPLOYEE_MASTER_DATA_VERSION),
//     );

//     window.dispatchEvent(
//       new CustomEvent(EMPLOYEE_MASTER_EVENT, {
//         detail: employees,
//       }),
//     );
//   } catch {
//     // Ignore localStorage errors.
//   }
// }

// export function EmployeeMaster() {
//   const [employees, setEmployees] = useState(loadEmployees);

//   const [activeTab, setActiveTab] = useState("roster");
//   const [search, setSearch] = useState("");
//   const [statusFilter, setStatusFilter] = useState("All");

//   const [rosterFilters, setRosterFilters] = useState({});

//   const [eligibilitySearch, setEligibilitySearch] = useState("");
//   const [eligibilityFilters, setEligibilityFilters] = useState({});

//   const [excludedEmployees, setExcludedEmployees] = useState([]);

//   const [banner, setBanner] = useState(null);

//   const [eligibilityEmployee, setEligibilityEmployee] = useState(null);

//   const [previewOpen, setPreviewOpen] = useState(false);
//   const [previewChanges, setPreviewChanges] = useState([]);
//   const [pendingImportType, setPendingImportType] = useState(null);

//   const fileInputRef = useRef(null);

//   useEffect(() => {
//     saveEmployees(employees);
//   }, [employees]);

//   const total = employees.length;

//   const active = employees.filter(
//     (employee) => employee.status === "Active",
//   ).length;

//   const inactive = total - active;

//   const filteredRosterEmployees = useMemo(() => {
//     const term = search.trim().toLowerCase();

//     return employees.filter((employee) => {
//       if (statusFilter !== "All" && employee.status !== statusFilter) {
//         return false;
//       }

//       if (!term) {
//         return true;
//       }

//       return (
//         String(employee.name ?? "")
//           .toLowerCase()
//           .includes(term) ||
//         String(employee.empId ?? "")
//           .toLowerCase()
//           .includes(term) ||
//         String(employee.organization ?? "")
//           .toLowerCase()
//           .includes(term)
//       );
//     });
//   }, [employees, search, statusFilter]);

//   const showBanner = (title, body, error = false) => {
//     setBanner({ title, body, error });
//   };

//   const readFile = async (file) => {
//     const extension = file.name.split(".").pop()?.toLowerCase();

//     if (extension === "csv") {
//       const text = await file.text();
//       return csvRowsToObjects(parseCsv(text));
//     }

//     const XLSX = await import("xlsx");
//     const buffer = await file.arrayBuffer();
//     const workbook = XLSX.read(buffer, { type: "array" });
//     const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

//     return XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
//   };

//   const buildRosterImportChanges = (rows) => {
//     const changes = [];

//     rows.forEach((row) => {
//       const mapped = {};

//       Object.entries(row).forEach(([header, value]) => {
//         const field = findFieldForHeader(header);

//         if (field) {
//           mapped[field.key] = String(value ?? "").trim();
//         }
//       });

//       if (!mapped.empId) return;

//       const existing = employees.find(
//         (employee) =>
//           String(employee.empId ?? "").toLowerCase() ===
//           mapped.empId.toLowerCase(),
//       );

//       const fields = {};

//       FIELD_DEFS.forEach((field) => {
//         if (
//           field.key === "empId" ||
//           mapped[field.key] === undefined ||
//           mapped[field.key] === ""
//         ) {
//           return;
//         }

//         if (
//           !existing ||
//           String(existing[field.key] ?? "") !== mapped[field.key]
//         ) {
//           fields[field.key] = mapped[field.key];
//         }
//       });

//       if (!existing || Object.keys(fields).length > 0) {
//         changes.push({
//           empId: mapped.empId,
//           name: mapped.name || existing?.name || "",
//           fields,
//           isNew: !existing,
//         });
//       }
//     });

//     return changes;
//   };

//   const buildEligibilityImportChanges = (rows) => {
//     const changes = [];

//     rows.forEach((row) => {
//       const empId = String(
//         row["Emp ID"] ?? row["Employee ID"] ?? row.EmpID ?? "",
//       ).trim();

//       if (!empId) return;

//       const eligible = normalizeEligibleValue(
//         row.Eligible ?? row.Eligibility ?? row.Status,
//       );

//       if (!eligible) return;

//       const reason = String(
//         row.Reason ?? row["Eligible Reason"] ?? row.Remarks ?? "",
//       ).trim();

//       const employee = employees.find(
//         (item) =>
//           String(item.empId ?? "").toLowerCase() === empId.toLowerCase(),
//       );

//       if (!employee) return;

//       const nextReason = reason !== "" ? reason : employee.eligibleReason || "";

//       if (
//         employee.eligible !== eligible ||
//         employee.eligibleReason !== nextReason
//       ) {
//         changes.push({
//           empId: employee.empId,
//           name: employee.name,
//           fields: {
//             Eligible: eligible,
//             Reason: nextReason,
//           },
//         });
//       }
//     });

//     return changes;
//   };

//   const handleRosterFile = async (file) => {
//     try {
//       const rows = await readFile(file);
//       const changes = buildRosterImportChanges(rows);

//       setPendingImportType("roster");
//       setPreviewChanges(changes);
//       setPreviewOpen(true);
//     } catch (error) {
//       showBanner(
//         "Import failed",
//         error.message || "Unable to read the file.",
//         true,
//       );
//     }
//   };

//   const handleEligibilityFile = async (file) => {
//     try {
//       const rows = await readFile(file);
//       const changes = buildEligibilityImportChanges(rows);

//       setPendingImportType("eligibility");
//       setPreviewChanges(changes);
//       setPreviewOpen(true);
//     } catch (error) {
//       showBanner(
//         "Import failed",
//         error.message || "Unable to read the file.",
//         true,
//       );
//     }
//   };

//   const confirmImport = () => {
//     if (pendingImportType === "eligibility") {
//       setEmployees((current) =>
//         current.map((employee) => {
//           const change = previewChanges.find(
//             (item) => item.empId === employee.empId,
//           );

//           if (!change) return employee;

//           const nextEligible = change.fields.Eligible === "Yes" ? "Yes" : "No";

//           return {
//             ...employee,

//             eligible: nextEligible,

//             eligibleReason:
//               change.fields.Reason || employee.eligibleReason || "",

//             manualOverride: true,

//             /*
//              * Eligibility controls Active/Inactive status.
//              */
//             status: nextEligible === "Yes" ? "Active" : "Inactive",
//           };
//         }),
//       );

//       showBanner(
//         "Eligibility imported",
//         `${previewChanges.length} employee record(s) updated.`,
//       );
//     } else {
//       setEmployees((current) => {
//         const next = [...current];

//         previewChanges.forEach((change) => {
//           const index = next.findIndex(
//             (employee) =>
//               String(employee.empId).toLowerCase() ===
//               String(change.empId).toLowerCase(),
//           );

//           if (index === -1) {
//             next.push({
//               empId: change.empId,
//               name: change.name || "",
//               designation: change.fields.designation || "",
//               organization: change.fields.organization || "",
//               doj: change.fields.doj || "",
//               totalExp: change.fields.totalExp || "",
//               reportingManager: change.fields.reportingManager || "",
//               compManager: change.fields.compManager || "",
//               superManager: change.fields.superManager || "",
//               appraiser: change.fields.appraiser || "",
//               managerMail: change.fields.managerMail || "",
//               superManagerMail: change.fields.superManagerMail || "",
//               status: change.fields.status || "Active",
//               eligible: "Yes",
//               eligibleReason: "",
//               manualOverride: false,
//             });

//             return;
//           }

//           next[index] = {
//             ...next[index],
//             ...change.fields,
//           };
//         });

//         return next;
//       });

//       showBanner(
//         "Employee data imported",
//         `${previewChanges.length} employee record(s) updated.`,
//       );
//     }

//     setPreviewOpen(false);
//     setPreviewChanges([]);
//     setPendingImportType(null);
//   };

//   const applyEligibilityCriteria = ({
//     departments,
//     designations,
//     excludedEmployees: excluded,
//     cutoffDate,
//   }) => {
//     let evaluated = 0;

//     setEmployees((current) =>
//       current.map((employee) => {
//         if (employee.status !== "Active" || employee.manualOverride) {
//           return employee;
//         }

//         evaluated += 1;

//         const reasons = [];

//         if (departments.length && departments.includes(employee.organization)) {
//           reasons.push("Department excluded");
//         }

//         if (
//           designations.length &&
//           designations.includes(employee.designation)
//         ) {
//           reasons.push("Designation excluded");
//         }

//         if (excluded.includes(employee.empId)) {
//           reasons.push("Employee excluded");
//         }

//         if (cutoffDate && employee.doj > cutoffDate) {
//           reasons.push("Joined after cutoff date");
//         }

//         if (reasons.length > 0) {
//           return {
//             ...employee,
//             eligible: "No",
//             eligibleReason: reasons.join(", "),

//             /*
//              * Not Eligible = Inactive
//              */
//             status: "Inactive",
//           };
//         }

//         return {
//           ...employee,
//           eligible: "Yes",
//           eligibleReason: "",

//           /*
//            * Eligible = Active
//            */
//           status: "Active",
//         };
//       }),
//     );

//     showBanner(
//       "Criteria applied",
//       `${evaluated} active employee(s) evaluated. Manual overrides were left unchanged.`,
//     );
//   };

//   const saveEligibility = ({ empId, eligible, eligibleReason }) => {
//     const nextStatus = eligible === "Yes" ? "Active" : "Inactive";

//     setEmployees((current) =>
//       current.map((employee) =>
//         String(employee.empId) === String(empId)
//           ? {
//               ...employee,

//               eligible,

//               eligibleReason: eligibleReason || "",

//               manualOverride: true,

//               /*
//                * Main requirement:
//                * Eligible     -> Active
//                * Not Eligible -> Inactive
//                */
//               status: nextStatus,
//             }
//           : employee,
//       ),
//     );

//     setEligibilityEmployee(null);

//     showBanner(
//       "Eligibility updated",
//       `${empId} is now ${
//         eligible === "Yes" ? "Eligible / Active" : "Not Eligible / Inactive"
//       }.`,
//     );
//   };

//   return (
//     <AppShell>
//       <div className="employee-master-page">
//         <div className="em-page-heading">
//           <div>
//             <h2>Employee Master</h2>
//             <p>Roster of record — independent of any appraisal cycle</p>
//           </div>

//           <div className="em-page-stats">
//             <div>
//               <span>Total</span>
//               <strong>{total}</strong>
//             </div>

//             <div>
//               <span>Active</span>
//               <strong className="active">{active}</strong>
//             </div>

//             <div>
//               <span>Inactive</span>
//               <strong className="inactive">{inactive}</strong>
//             </div>
//           </div>
//         </div>

//         <div className="em-tabs">
//           <button
//             type="button"
//             className={activeTab === "roster" ? "active" : ""}
//             onClick={() => setActiveTab("roster")}
//           >
//             Employee Master
//           </button>

//           <button
//             type="button"
//             className={activeTab === "eligibility" ? "active" : ""}
//             onClick={() => setActiveTab("eligibility")}
//           >
//             Eligibility List
//           </button>
//         </div>

//         {banner && (
//           <div className={`em-banner ${banner.error ? "error" : ""}`}>
//             <div>
//               {banner.error ? (
//                 <AlertCircle size={17} />
//               ) : (
//                 <CheckCircle2 size={17} />
//               )}
//             </div>

//             <div>
//               <strong>{banner.title}</strong>
//               <span>{banner.body}</span>
//             </div>

//             <button type="button" onClick={() => setBanner(null)}>
//               ×
//             </button>
//           </div>
//         )}

//         {activeTab === "roster" && (
//           <div className="em-tab-content">
//             <EmployeeMasterToolbar
//               search={search}
//               setSearch={setSearch}
//               statusFilter={statusFilter}
//               setStatusFilter={setStatusFilter}
//               onDownloadTemplate={downloadRosterTemplate}
//               onUpload={() => fileInputRef.current?.click()}
//               onDownloadData={() => downloadRosterData(filteredRosterEmployees)}
//             />

//             <input
//               ref={fileInputRef}
//               type="file"
//               accept=".csv,.xlsx,.xls"
//               hidden
//               onChange={(event) => {
//                 const file = event.target.files?.[0];

//                 if (file) {
//                   handleRosterFile(file);
//                 }

//                 event.target.value = "";
//               }}
//             />

//             <EmployeeRosterTable
//               rows={filteredRosterEmployees}
//               filters={rosterFilters}
//               setFilters={setRosterFilters}
//             />

//             <div className="em-footer-note">
//               Employee Master is the roster of record. Appraisal-cycle data
//               should reference these employees.
//             </div>
//           </div>
//         )}

//         {activeTab === "eligibility" && (
//           <div className="em-tab-content">
//             <div className="em-eligibility-layout">
//               <EligibilityCriteria
//                 employees={employees}
//                 excludedEmployees={excludedEmployees}
//                 setExcludedEmployees={setExcludedEmployees}
//                 onApply={applyEligibilityCriteria}
//               />

//               <EligibilityList
//                 employees={employees}
//                 search={eligibilitySearch}
//                 setSearch={setEligibilitySearch}
//                 filters={eligibilityFilters}
//                 setFilters={setEligibilityFilters}
//                 onChangeEligibility={setEligibilityEmployee}
//                 onDownloadTemplate={downloadEligibilityTemplate}
//                 onImport={handleEligibilityFile}
//                 onExport={exportEligibilityData}
//               />
//             </div>
//           </div>
//         )}

//         <EligibilityModal
//           employee={eligibilityEmployee}
//           onClose={() => setEligibilityEmployee(null)}
//           onSave={saveEligibility}
//         />

//         <ImportPreviewModal
//           open={previewOpen}
//           title={
//             pendingImportType === "eligibility"
//               ? "Eligibility Import Preview"
//               : "Employee Import Preview"
//           }
//           changes={previewChanges}
//           onCancel={() => {
//             setPreviewOpen(false);
//             setPreviewChanges([]);
//             setPendingImportType(null);
//           }}
//           onConfirm={confirmImport}
//         />
//       </div>
//     </AppShell>
//   );
// }

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

import { AppShell } from "@/components/appraisal/AppShell";

import { FIELD_DEFS, INITIAL_EMPLOYEES } from "@/lib/employee-master-data";

import {
  findFieldForHeader,
  normalizeEligibleValue,
  parseCsv,
  csvRowsToObjects,
} from "@/lib/employee-master-utils";

import {
  downloadRosterTemplate,
  downloadRosterData,
  downloadEligibilityTemplate,
  exportEligibilityData,
} from "@/lib/employee-master-export";

import { EmployeeMasterToolbar } from "@/components/employee-master/EmployeeMasterToolbar";
import { EmployeeRosterTable } from "@/components/employee-master/EmployeeRosterTable";
import { EligibilityCriteria } from "@/components/employee-master/EligibilityCriteria";
import { EligibilityList } from "@/components/employee-master/EligibilityList";
import { EligibilityModal } from "@/components/employee-master/EligibilityModal";
import { ImportPreviewModal } from "@/components/employee-master/ImportPreviewModal";

import "@/styles/employee-master.css";

const EMPLOYEE_MASTER_STORAGE_KEY = "employee-master-employees";
const EMPLOYEE_MASTER_EVENT = "employee-master-updated";

/*
 * Version increased so old localStorage data can be migrated
 * while still preserving employee eligibility information.
 */
const EMPLOYEE_MASTER_DATA_VERSION = 5;
const EMPLOYEE_MASTER_VERSION_KEY = "employee-master-data-version";

function buildFreshEmployees() {
  return INITIAL_EMPLOYEES.map((employee) => ({
    ...employee,
  }));
}

/* ============================================================
   IMPORT FIX:
   Normalize employee IDs before comparing them.
   ============================================================ */
function normalizeEmpId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/* ============================================================
   IMPORT FIX:
   Normalize headers so these all work:
   Emp ID
   Employee ID
   EmpID
   EmployeeID
   ============================================================ */
function normalizeImportHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s._/-]+/g, "")
    .replace(/[()]/g, "");
}

/* ============================================================
   IMPORT FIX:
   Find Employee ID regardless of exact header spelling.
   ============================================================ */
function getImportedEmpId(row) {
  const directHeaders = [
    "Emp ID",
    "Employee ID",
    "EmpID",
    "EmployeeID",
    "EMP ID",
    "EMPLOYEE ID",
    "EMPID",
  ];

  for (const header of directHeaders) {
    if (row[header] !== undefined && row[header] !== null) {
      const value = String(row[header]).trim();

      if (value) {
        return value;
      }
    }
  }

  for (const [header, value] of Object.entries(row)) {
    const normalized = normalizeImportHeader(header);

    if (normalized === "empid" || normalized === "employeeid") {
      const result = String(value ?? "").trim();

      if (result) {
        return result;
      }
    }
  }

  return "";
}

function loadEmployees() {
  try {
    const stored = localStorage.getItem(EMPLOYEE_MASTER_STORAGE_KEY);

    const storedVersion = Number(
      localStorage.getItem(EMPLOYEE_MASTER_VERSION_KEY) || "0",
    );

    /*
     * ========================================================
     * IMPORTANT IMPORT FIX
     *
     * Previously the application only returned localStorage
     * when the stored employee count was exactly 250.
     *
     * Therefore imported records could be saved but were
     * discarded on refresh.
     *
     * Now ANY valid stored employee array is accepted.
     * ========================================================
     */

    if (stored) {
      const parsed = JSON.parse(stored);

      if (Array.isArray(parsed) && parsed.length > 0) {
        /*
         * Normalize old records so missing properties do not
         * break Employee Master components.
         */
        const normalizedEmployees = parsed.map((employee) => ({
          ...employee,

          empId: String(employee?.empId ?? ""),

          name: String(employee?.name ?? ""),

          designation: String(employee?.designation ?? ""),

          organization: String(employee?.organization ?? ""),

          doj: String(employee?.doj ?? ""),

          totalExp: String(employee?.totalExp ?? ""),

          reportingManager: String(employee?.reportingManager ?? ""),

          compManager: String(employee?.compManager ?? ""),

          superManager: String(employee?.superManager ?? ""),

          appraiser: String(employee?.appraiser ?? ""),

          managerMail: String(employee?.managerMail ?? ""),

          superManagerMail: String(employee?.superManagerMail ?? ""),

          status: employee?.status === "Inactive" ? "Inactive" : "Active",

          eligible: employee?.eligible === "No" ? "No" : "Yes",

          eligibleReason: String(employee?.eligibleReason ?? ""),

          manualOverride: Boolean(employee?.manualOverride),
        }));

        /*
         * Update storage to the current version without
         * replacing imported employees with the demo 250.
         */
        try {
          localStorage.setItem(
            EMPLOYEE_MASTER_STORAGE_KEY,
            JSON.stringify(normalizedEmployees),
          );

          localStorage.setItem(
            EMPLOYEE_MASTER_VERSION_KEY,
            String(EMPLOYEE_MASTER_DATA_VERSION),
          );
        } catch {
          // Ignore localStorage errors.
        }

        return normalizedEmployees;
      }
    }

    /*
     * No valid stored data exists.
     * Start with the original 250 employees.
     */
    const fresh = buildFreshEmployees();

    localStorage.setItem(EMPLOYEE_MASTER_STORAGE_KEY, JSON.stringify(fresh));

    localStorage.setItem(
      EMPLOYEE_MASTER_VERSION_KEY,
      String(EMPLOYEE_MASTER_DATA_VERSION),
    );

    return fresh;
  } catch {
    /*
     * If localStorage is invalid, use fresh 250 employees.
     */
  }

  const fresh = buildFreshEmployees();

  try {
    localStorage.setItem(EMPLOYEE_MASTER_STORAGE_KEY, JSON.stringify(fresh));

    localStorage.setItem(
      EMPLOYEE_MASTER_VERSION_KEY,
      String(EMPLOYEE_MASTER_DATA_VERSION),
    );
  } catch {
    // Ignore localStorage errors.
  }

  return fresh;
}

function saveEmployees(employees) {
  try {
    localStorage.setItem(
      EMPLOYEE_MASTER_STORAGE_KEY,
      JSON.stringify(employees),
    );

    localStorage.setItem(
      EMPLOYEE_MASTER_VERSION_KEY,
      String(EMPLOYEE_MASTER_DATA_VERSION),
    );

    window.dispatchEvent(
      new CustomEvent(EMPLOYEE_MASTER_EVENT, {
        detail: employees,
      }),
    );
  } catch {
    // Ignore localStorage errors.
  }
}

export function EmployeeMaster() {
  const [employees, setEmployees] = useState(loadEmployees);

  const [activeTab, setActiveTab] = useState("roster");

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState("All");

  const [rosterFilters, setRosterFilters] = useState({});

  const [eligibilitySearch, setEligibilitySearch] = useState("");

  const [eligibilityFilters, setEligibilityFilters] = useState({});

  const [excludedEmployees, setExcludedEmployees] = useState([]);

  const [banner, setBanner] = useState(null);

  const [eligibilityEmployee, setEligibilityEmployee] = useState(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  const [previewChanges, setPreviewChanges] = useState([]);

  const [pendingImportType, setPendingImportType] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    saveEmployees(employees);
  }, [employees]);

  const total = employees.length;

  const active = employees.filter(
    (employee) => employee.status === "Active",
  ).length;

  const inactive = total - active;

  const filteredRosterEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();

    return employees.filter((employee) => {
      if (statusFilter !== "All" && employee.status !== statusFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        String(employee.name ?? "")
          .toLowerCase()
          .includes(term) ||
        String(employee.empId ?? "")
          .toLowerCase()
          .includes(term) ||
        String(employee.organization ?? "")
          .toLowerCase()
          .includes(term)
      );
    });
  }, [employees, search, statusFilter]);

  const showBanner = (title, body, error = false) => {
    setBanner({
      title,
      body,
      error,
    });
  };

  /* ============================================================
     READ CSV / XLSX
     ============================================================ */
  const readFile = async (file) => {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "csv") {
      const text = await file.text();

      return csvRowsToObjects(parseCsv(text));
    }

    if (extension === "xlsx" || extension === "xls") {
      const XLSX = await import("xlsx");

      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
      });

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!firstSheet) {
        throw new Error("No worksheet found in the file.");
      }

      return XLSX.utils.sheet_to_json(firstSheet, {
        defval: "",
        raw: false,
      });
    }

    throw new Error(
      "Unsupported file format. Please upload CSV or Excel file.",
    );
  };

  /* ============================================================
     ROSTER IMPORT
     ============================================================ */
  const buildRosterImportChanges = (rows) => {
    const changes = [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return changes;
    }

    rows.forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }

      const mapped = {};

      /*
       * Map every supported import header.
       */
      Object.entries(row).forEach(([header, value]) => {
        const field = findFieldForHeader(header);

        if (field) {
          mapped[field.key] = String(value ?? "").trim();
        }
      });

      /*
       * ======================================================
       * IMPORTANT:
       * Get Employee ID independently because Excel/CSV
       * headers can vary.
       * ======================================================
       */
      const importedEmpId = getImportedEmpId(row);

      if (importedEmpId) {
        mapped.empId = importedEmpId;
      }

      /*
       * Employee ID is mandatory for matching/updating.
       */
      if (!mapped.empId) {
        return;
      }

      const normalizedImportedId = normalizeEmpId(mapped.empId);

      const existing = employees.find(
        (employee) => normalizeEmpId(employee.empId) === normalizedImportedId,
      );

      const fields = {};

      /*
       * Compare every Employee Master field.
       */
      FIELD_DEFS.forEach((field) => {
        /*
         * Never change Employee ID.
         */
        if (field.key === "empId") {
          return;
        }

        /*
         * Header was not present in import.
         */
        if (mapped[field.key] === undefined) {
          return;
        }

        const importedValue = String(mapped[field.key] ?? "").trim();

        /*
         * Empty import cells should not erase existing
         * employee information.
         */
        if (importedValue === "") {
          return;
        }

        const existingValue = String(existing?.[field.key] ?? "").trim();

        if (!existing || existingValue !== importedValue) {
          fields[field.key] = importedValue;
        }
      });

      /*
       * NEW EMPLOYEE
       */
      if (!existing) {
        changes.push({
          empId: mapped.empId,
          name: mapped.name || "",
          fields,
          isNew: true,
        });

        return;
      }

      /*
       * EXISTING EMPLOYEE
       */
      if (Object.keys(fields).length > 0) {
        changes.push({
          empId: existing.empId,
          name: mapped.name || existing.name || "",
          fields,
          isNew: false,
        });
      }
    });

    return changes;
  };

  /* ============================================================
     ELIGIBILITY IMPORT
     ============================================================ */
  const buildEligibilityImportChanges = (rows) => {
    const changes = [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return changes;
    }

    rows.forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }

      const empId = getImportedEmpId(row);

      if (!empId) {
        return;
      }

      let eligibleValue = "";

      Object.entries(row).forEach(([header, value]) => {
        const normalized = normalizeImportHeader(header);

        if (
          normalized === "eligible" ||
          normalized === "eligibility" ||
          normalized === "status"
        ) {
          eligibleValue = String(value ?? "").trim();
        }
      });

      if (!eligibleValue) {
        return;
      }

      const eligible = normalizeEligibleValue(eligibleValue);

      if (!eligible) {
        return;
      }

      let reason = "";

      Object.entries(row).forEach(([header, value]) => {
        const normalized = normalizeImportHeader(header);

        if (
          normalized === "reason" ||
          normalized === "eligiblereason" ||
          normalized === "remarks"
        ) {
          reason = String(value ?? "").trim();
        }
      });

      const employee = employees.find(
        (item) => normalizeEmpId(item.empId) === normalizeEmpId(empId),
      );

      if (!employee) {
        return;
      }

      const nextReason = reason !== "" ? reason : employee.eligibleReason || "";

      if (
        employee.eligible !== eligible ||
        employee.eligibleReason !== nextReason
      ) {
        changes.push({
          empId: employee.empId,
          name: employee.name,
          fields: {
            Eligible: eligible,
            Reason: nextReason,
          },
        });
      }
    });

    return changes;
  };

  /* ============================================================
     HANDLE ROSTER FILE
     ============================================================ */
  const handleRosterFile = async (file) => {
    try {
      const rows = await readFile(file);

      const changes = buildRosterImportChanges(rows);

      setPendingImportType("roster");

      setPreviewChanges(changes);

      setPreviewOpen(true);
    } catch (error) {
      showBanner(
        "Import failed",
        error.message || "Unable to read the file.",
        true,
      );
    }
  };

  /* ============================================================
     HANDLE ELIGIBILITY FILE
     ============================================================ */
  const handleEligibilityFile = async (file) => {
    try {
      const rows = await readFile(file);

      const changes = buildEligibilityImportChanges(rows);

      setPendingImportType("eligibility");

      setPreviewChanges(changes);

      setPreviewOpen(true);
    } catch (error) {
      showBanner(
        "Import failed",
        error.message || "Unable to read the file.",
        true,
      );
    }
  };

  /* ============================================================
     CONFIRM IMPORT
     ============================================================ */
  const confirmImport = () => {
    /* ==========================================================
       ELIGIBILITY IMPORT
       ========================================================== */
    if (pendingImportType === "eligibility") {
      setEmployees((current) => {
        /*
         * Map changes by normalized Employee ID.
         */
        const changeMap = new Map(
          previewChanges.map((change) => [
            normalizeEmpId(change.empId),
            change,
          ]),
        );

        return current.map((employee) => {
          const change = changeMap.get(normalizeEmpId(employee.empId));

          if (!change) {
            return employee;
          }

          const nextEligible = change.fields.Eligible === "Yes" ? "Yes" : "No";

          return {
            ...employee,

            eligible: nextEligible,

            eligibleReason:
              change.fields.Reason || employee.eligibleReason || "",

            manualOverride: true,

            status: nextEligible === "Yes" ? "Active" : "Inactive",
          };
        });
      });

      showBanner(
        "Eligibility imported",
        `${previewChanges.length} employee record(s) updated.`,
      );
    } else {

    /* ==========================================================
       ROSTER IMPORT
       ========================================================== */
      setEmployees((current) => {
        const next = [...current];

        /*
         * Keep a map of existing Employee IDs.
         */
        const indexByEmpId = new Map();

        next.forEach((employee, index) => {
          const key = normalizeEmpId(employee.empId);

          if (key) {
            indexByEmpId.set(key, index);
          }
        });

        /*
         * Apply every previewed import change.
         */
        previewChanges.forEach((change) => {
          const key = normalizeEmpId(change.empId);

          if (!key) {
            return;
          }

          const existingIndex = indexByEmpId.get(key);

          /* ----------------------------------------------
                 NEW EMPLOYEE
                 ---------------------------------------------- */
          if (existingIndex === undefined) {
            const newEmployee = {
              empId: String(change.empId ?? "").trim(),

              name: change.fields?.name || change.name || "",

              designation: change.fields?.designation || "",

              organization: change.fields?.organization || "",

              doj: change.fields?.doj || "",

              totalExp: change.fields?.totalExp || "",

              reportingManager: change.fields?.reportingManager || "",

              compManager: change.fields?.compManager || "",

              superManager: change.fields?.superManager || "",

              appraiser: change.fields?.appraiser || "",

              managerMail: change.fields?.managerMail || "",

              superManagerMail: change.fields?.superManagerMail || "",

              status:
                change.fields?.status === "Inactive" ? "Inactive" : "Active",

              eligible: "Yes",

              eligibleReason: "",

              manualOverride: false,
            };

            next.push(newEmployee);

            indexByEmpId.set(key, next.length - 1);

            return;
          }

          /* ----------------------------------------------
                 EXISTING EMPLOYEE
                 ---------------------------------------------- */
          const updatedEmployee = {
            ...next[existingIndex],
          };

          Object.entries(change.fields || {}).forEach(([field, value]) => {
            /*
             * Only update actual Employee Master fields.
             */
            const isSupportedField = FIELD_DEFS.some(
              (definition) => definition.key === field,
            );

            if (isSupportedField) {
              updatedEmployee[field] = String(value ?? "").trim();
            }
          });

          next[existingIndex] = updatedEmployee;
        });

        return next;
      });

      showBanner(
        "Employee data imported",
        `${previewChanges.length} employee record(s) updated.`,
      );
    }

    setPreviewOpen(false);
    setPreviewChanges([]);
    setPendingImportType(null);
  };

  /* ============================================================
     ELIGIBILITY CRITERIA
     ============================================================ */
  const applyEligibilityCriteria = ({
    departments,
    designations,
    excludedEmployees: excluded,
    cutoffDate,
  }) => {
    let evaluated = 0;

    setEmployees((current) =>
      current.map((employee) => {
        if (employee.status !== "Active" || employee.manualOverride) {
          return employee;
        }

        evaluated += 1;

        const reasons = [];

        if (departments.length && departments.includes(employee.organization)) {
          reasons.push("Department excluded");
        }

        if (
          designations.length &&
          designations.includes(employee.designation)
        ) {
          reasons.push("Designation excluded");
        }

        if (excluded.includes(employee.empId)) {
          reasons.push("Employee excluded");
        }

        if (cutoffDate && employee.doj > cutoffDate) {
          reasons.push("Joined after cutoff date");
        }

        if (reasons.length > 0) {
          return {
            ...employee,
            eligible: "No",
            eligibleReason: reasons.join(", "),
            status: "Inactive",
          };
        }

        return {
          ...employee,
          eligible: "Yes",
          eligibleReason: "",
          status: "Active",
        };
      }),
    );

    showBanner(
      "Criteria applied",
      `${evaluated} active employee(s) evaluated. Manual overrides were left unchanged.`,
    );
  };

  /* ============================================================
     SAVE INDIVIDUAL ELIGIBILITY
     ============================================================ */
  const saveEligibility = ({ empId, eligible, eligibleReason }) => {
    const nextStatus = eligible === "Yes" ? "Active" : "Inactive";

    setEmployees((current) =>
      current.map((employee) =>
        normalizeEmpId(employee.empId) === normalizeEmpId(empId)
          ? {
              ...employee,

              eligible,

              eligibleReason: eligibleReason || "",

              manualOverride: true,

              status: nextStatus,
            }
          : employee,
      ),
    );

    setEligibilityEmployee(null);

    showBanner(
      "Eligibility updated",
      `${empId} is now ${
        eligible === "Yes" ? "Eligible / Active" : "Not Eligible / Inactive"
      }.`,
    );
  };

  return (
    <AppShell>
      <div className="employee-master-page">
        <div className="em-page-heading">
          <div>
            <h2>Employee Master</h2>

            <p>Roster of record — independent of any appraisal cycle</p>
          </div>

          <div className="em-page-stats">
            <div>
              <span>Total</span>
              <strong>{total}</strong>
            </div>

            <div>
              <span>Active</span>
              <strong className="active">{active}</strong>
            </div>

            <div>
              <span>Inactive</span>
              <strong className="inactive">{inactive}</strong>
            </div>
          </div>
        </div>

        <div className="em-tabs">
          <button
            type="button"
            className={activeTab === "roster" ? "active" : ""}
            onClick={() => setActiveTab("roster")}
          >
            Employee Master
          </button>

          <button
            type="button"
            className={activeTab === "eligibility" ? "active" : ""}
            onClick={() => setActiveTab("eligibility")}
          >
            Eligibility List
          </button>
        </div>

        {banner && (
          <div className={`em-banner ${banner.error ? "error" : ""}`}>
            <div>
              {banner.error ? (
                <AlertCircle size={17} />
              ) : (
                <CheckCircle2 size={17} />
              )}
            </div>

            <div>
              <strong>{banner.title}</strong>

              <span>{banner.body}</span>
            </div>

            <button type="button" onClick={() => setBanner(null)}>
              ×
            </button>
          </div>
        )}

        {activeTab === "roster" && (
          <div className="em-tab-content">
            <EmployeeMasterToolbar
              search={search}
              setSearch={setSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onDownloadTemplate={downloadRosterTemplate}
              onUpload={() => fileInputRef.current?.click()}
              onDownloadData={() => downloadRosterData(filteredRosterEmployees)}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  handleRosterFile(file);
                }

                /*
                 * Allows the same file to be selected again.
                 */
                event.target.value = "";
              }}
            />

            <EmployeeRosterTable
              rows={filteredRosterEmployees}
              filters={rosterFilters}
              setFilters={setRosterFilters}
            />

            <div className="em-footer-note">
              Employee Master is the roster of record. Appraisal-cycle data
              should reference these employees.
            </div>
          </div>
        )}

        {activeTab === "eligibility" && (
          <div className="em-tab-content">
            <div className="em-eligibility-layout">
              <EligibilityCriteria
                employees={employees}
                excludedEmployees={excludedEmployees}
                setExcludedEmployees={setExcludedEmployees}
                onApply={applyEligibilityCriteria}
              />

              <EligibilityList
                employees={employees}
                search={eligibilitySearch}
                setSearch={setEligibilitySearch}
                filters={eligibilityFilters}
                setFilters={setEligibilityFilters}
                onChangeEligibility={setEligibilityEmployee}
                onDownloadTemplate={downloadEligibilityTemplate}
                onImport={handleEligibilityFile}
                onExport={exportEligibilityData}
              />
            </div>
          </div>
        )}

        <EligibilityModal
          employee={eligibilityEmployee}
          onClose={() => setEligibilityEmployee(null)}
          onSave={saveEligibility}
        />

        <ImportPreviewModal
          open={previewOpen}
          title={
            pendingImportType === "eligibility"
              ? "Eligibility Import Preview"
              : "Employee Import Preview"
          }
          changes={previewChanges}
          onCancel={() => {
            setPreviewOpen(false);

            setPreviewChanges([]);

            setPendingImportType(null);
          }}
          onConfirm={confirmImport}
        />
      </div>
    </AppShell>
  );
}
