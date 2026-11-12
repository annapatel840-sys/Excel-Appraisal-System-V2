// import { useEffect, useMemo, useRef, useState } from "react";
// import { CheckCircle2, AlertCircle, X, History } from "lucide-react";

// import { AppShell } from "@/components/appraisal/AppShell";
// import { useCatalystUser } from "@/lib/catalyst-auth";
// import { catalystFetch, catalystFunctionUrl, onCatalystWrite } from "@/lib/catalyst-api";
// import { generateAppraisalSheet, payrollCycleRequest } from "@/lib/payroll-cycle-api";
// import { useAppraisalRefresh } from "@/lib/appraisal-store";
// import { HrConfigPage } from "@/components/employee-master/HrConfigPage";
// import { LocationMasterControl } from "@/components/employee-master/LocationMasterControl";
// import { DesignationMasterPage } from "@/components/employee-master/DesignationMasterPage";
// import {
//   FIELD_DEFS,
//   fetchEmployeeMasterEmployees,
//   fetchAllEmployeeMasterEmployees,
//   fetchEligibilityEmployees,
//   prefetchEligibilityEmployees,
//   updateEmployeeMasterEmployee,
//   updateEmployeeMasterRecord,
//   updateEmployeeEligibility,
//   updateEligibilityRecords,
//   applyEligibilityCriteriaToCycle,
//   createEmployeeMasterEmployees,
// } from "@/lib/employee-master-data";

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
// import { AppraisalCycleMasterPage } from "@/components/employee-master/AppraisalCycleMasterPage";
// import { PayrollDataPage } from "@/components/employee-master/PayrollDataPage";
// import { HistoricalImportPage } from "@/components/employee-master/HistoricalImportPage";
// import { FeedbackRatingMasterContainer } from "@/components/employee-master/FeedbackRatingMasterContainer";
// import { UploadPage } from "@/components/employee-master/UploadPage";
// import { TeamChangesPage } from "@/components/employee-master/TeamChangesPage";
// import { ChangeListMismatchPage } from "@/components/employee-master/ChangeListMismatchPage";
// import { BudgetMasterPage } from "@/components/employee-master/BudgetMasterPage";
// import { BudgetDistributionPage } from "@/components/employee-master/BudgetDistributionPage";
// import DelegationScreen from "@/components/employee-master/DelegationScreen";
// import AccessPage from "@/components/employee-master/AccessPage";
// import { HrDashboardPage } from "@/components/employee-master/HrDashboardPage";
// import { HrOperationsNav } from "@/components/employee-master/HrOperationsNav";
// import { ProcessingOverlay } from "@/components/ui/processing-overlay";
// import { HR_TAB_SCREENS, useAccess } from "@/lib/access-store";
// import { eligibilitySnapshotKey, readEligibilitySnapshot, writeEligibilitySnapshot, clearEligibilitySnapshot } from "@/lib/roster-snapshot";

// import "@/styles/employee-master.css";

// const PAGE_SIZE = 20;
// const KNOWN_TABS = [
//   "roster",
//   "payroll-data",
//   "payroll-upload",
//   "eligibility",
//   "delegation",
//   "feedback-rating",
//   "team-changes",
//   "historical-import",
// ];

// const ROSTER_FIELD_TO_CATALYST = {
//   name: "name",
//   designation: "designation",
//   organization: "department",
//   doj: "joining_date",
//   orgExp: "wissen_experience",
//   totalExp: "total_experience",
//   reportingManager: "reporting_manager",
//   compManager: "comp_manager",
//   // Only the Appraiser / Tech-ED column feeds appraiser_tech_ed. The
//   // "Super Manager" name column has no backend field and is not imported.
//   appraiser: "appraiser_tech_ed",
//   managerMail: "manager_email_id",
//   superManagerMail: "super_man_email_id",
//   status: "status",
// };

// /* ============================================================
//    HELPERS
//    ============================================================ */

// function normalizeEmpId(value) {
//   return String(value || "")
//     .trim()
//     .toLowerCase();
// }

// function normalizeImportHeader(value) {
//   return String(value || "")
//     .trim()
//     .toLowerCase()
//     .replace(/[\s._/-]+/g, "")
//     .replace(/[()]/g, "");
// }

// function getImportedEmpId(row) {
//   const directHeaders = [
//     "Emp ID",
//     "Employee ID",
//     "EmpID",
//     "EmployeeID",
//     "EMP ID",
//     "EMPLOYEE ID",
//     "EMPID",
//   ];

//   for (const header of directHeaders) {
//     if (row[header] !== undefined && row[header] !== null) {
//       const value = String(row[header]).trim();

//       if (value) {
//         return value;
//       }
//     }
//   }

//   for (const [header, value] of Object.entries(row)) {
//     const normalized = normalizeImportHeader(header);

//     if (normalized === "empid" || normalized === "employeeid") {
//       const result = String(value || "").trim();

//       if (result) {
//         return result;
//       }
//     }
//   }

//   return "";
// }

// /*
//  * Normalise a date value to "yyyy-mm-dd" so it can be compared with the
//  * <input type="date"> cutoff. Accepts ISO strings, dd-mm-yyyy / dd/mm/yyyy
//  * and anything Date can parse. Returns "" when the value is not a date.
//  */
// function toIsoDate(value) {
//   const text = String(value ?? "").trim();

//   if (!text) {
//     return "";
//   }

//   const pad = (number) => String(number).padStart(2, "0");

//   const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

//   if (iso) {
//     return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
//   }

//   const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

//   if (dmy) {
//     return `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;
//   }

//   const date = new Date(text);

//   if (Number.isNaN(date.getTime())) {
//     return "";
//   }

//   return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
//     date.getDate(),
//   )}`;
// }

// /* Canonical appraiser format, e.g. "EMP0051 - Ashok Kumar". */
// function isCanonicalPersonValue(value) {
//   return /^\s*[A-Za-z]*\d+\s+-\s+\S/.test(String(value || ""));
// }

// /* ============================================================
//    AUDIT PERSISTENCE (shared Appraisal_Audit table)
//    ============================================================ */

// const AUDIT_API_URL = catalystFunctionUrl("appraisalauditapi");

// const AUDIT_SOURCE_STATUS = "Employee Master - Status";
// const AUDIT_SOURCE_ELIGIBILITY = "Employee Master - Eligibility";

// function formatAuditTime(value) {
//   const date = new Date(value);

//   if (Number.isNaN(date.getTime())) {
//     return String(value || "");
//   }

//   return date.toLocaleString("en-IN", {
//     dateStyle: "medium",
//     timeStyle: "medium",
//   });
// }

// async function postAuditEntries(entries) {
//   if (!entries.length) {
//     return;
//   }

//   const response = await catalystFetch(AUDIT_API_URL, {
//     method: "POST",
//     headers: {
//       Accept: "application/json",
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify(
//       entries.map((entry) => ({
//         emp_id: entry.empId,
//         employee_name: entry.employeeName,
//         field_name: entry.fieldName,
//         old_value: entry.oldValue,
//         new_value: entry.newValue,
//         changed_by: entry.changedBy,
//         changed_at: entry.changedAtIso,
//         source: entry.source,
//         appraisal_year: entry.appraisalYear || "",
//       })),
//     ),
//   });

//   const result = await response.json().catch(() => null);

//   if (!response.ok || !result?.success) {
//     throw new Error(
//       result?.message || `Audit API failed with status ${response.status}`,
//     );
//   }
// }

// async function fetchAuditEntries(source, cycleName = "") {
//   const url = new URL(AUDIT_API_URL);

//   url.searchParams.set("limit", "500");
//   url.searchParams.set("_ts", String(Date.now()));

//   const response = await catalystFetch(url.toString(), {
//     method: "GET",
//     cache: "no-store",
//     headers: { Accept: "application/json" },
//   });

//   const result = await response.json().catch(() => null);

//   if (!response.ok || !result?.success) {
//     throw new Error(
//       result?.message || `Audit API failed with status ${response.status}`,
//     );
//   }

//   return (Array.isArray(result.data) ? result.data : [])
//     .map((record) => record?.Appraisal_Audit || record || {})
//     .filter((row) => String(row.source || "") === source)
//     .map((row, index) => ({
//       id: String(row.ROWID || row.id || `audit-${index}`),
//       empId: String(row.emp_id || ""),
//       employeeName: String(row.employee_name || ""),
//       fieldName: String(row.field_name || ""),
//       oldValue: String(row.old_value || ""),
//       newValue: String(row.new_value || ""),
//       changedAt: formatAuditTime(row.changed_at || row.CREATEDTIME),
//       appraisalYear: String(row.appraisal_year || row.appraisalYear || ""),
//     }))
//     .filter((entry) =>
//       source !== AUDIT_SOURCE_ELIGIBILITY ||
//       (Boolean(cycleName) && entry.appraisalYear === cycleName)
//     );
// }

// /* ============================================================
//    AUDIT PANEL
//    ============================================================ */

// function AuditHistoryPanel({ open, title, description, entries, onClose }) {
//   if (!open) {
//     return null;
//   }

//   return (
//     <div
//       style={{
//         position: "fixed",
//         inset: 0,
//         zIndex: 9999,
//         background: "rgba(15, 23, 42, 0.35)",
//         display: "flex",
//         alignItems: "center",
//         justifyContent: "center",
//         padding: "24px",
//       }}
//       onMouseDown={onClose}
//     >
//       <div
//         style={{
//           width: "min(1100px, 95vw)",
//           maxHeight: "85vh",
//           background: "#fff",
//           borderRadius: "10px",
//           boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
//           display: "flex",
//           flexDirection: "column",
//           overflow: "hidden",
//         }}
//         onMouseDown={(event) => event.stopPropagation()}
//       >
//         {/* HEADER */}
//         <div
//           style={{
//             display: "flex",
//             alignItems: "center",
//             justifyContent: "space-between",
//             padding: "18px 20px",
//             borderBottom: "1px solid #e5e7eb",
//           }}
//         >
//           <div>
//             <div
//               style={{
//                 display: "flex",
//                 alignItems: "center",
//                 gap: "8px",
//               }}
//             >
//               <History size={18} />

//               <h2
//                 style={{
//                   margin: 0,
//                   fontSize: "18px",
//                   fontWeight: 700,
//                 }}
//               >
//                 {title}
//               </h2>
//             </div>

//             <p
//               style={{
//                 margin: "4px 0 0",
//                 fontSize: "12px",
//                 color: "#64748b",
//               }}
//             >
//               {description}
//             </p>
//           </div>

//           <button
//             type="button"
//             onClick={onClose}
//             aria-label="Close"
//             style={{
//               width: "32px",
//               height: "32px",
//               border: 0,
//               background: "transparent",
//               cursor: "pointer",
//               display: "flex",
//               alignItems: "center",
//               justifyContent: "center",
//             }}
//           >
//             <X size={18} />
//           </button>
//         </div>

//         {/* COUNT */}
//         <div
//           style={{
//             padding: "10px 20px",
//             borderBottom: "1px solid #e5e7eb",
//             fontSize: "12px",
//             color: "#64748b",
//           }}
//         >
//           {entries.length} change{entries.length === 1 ? "" : "s"} recorded
//         </div>

//         {/* TABLE */}
//         <div
//           style={{
//             flex: 1,
//             overflow: "auto",
//           }}
//         >
//           <table
//             style={{
//               width: "100%",
//               borderCollapse: "collapse",
//               fontSize: "12px",
//             }}
//           >
//             <thead>
//               <tr>
//                 <th
//                   style={{
//                     position: "sticky",
//                     top: 0,
//                     background: "#f8fafc",
//                     padding: "10px 12px",
//                     textAlign: "left",
//                     borderBottom: "1px solid #e2e8f0",
//                     whiteSpace: "nowrap",
//                   }}
//                 >
//                   Employee ID
//                 </th>

//                 <th
//                   style={{
//                     position: "sticky",
//                     top: 0,
//                     background: "#f8fafc",
//                     padding: "10px 12px",
//                     textAlign: "left",
//                     borderBottom: "1px solid #e2e8f0",
//                     whiteSpace: "nowrap",
//                   }}
//                 >
//                   Employee Name
//                 </th>

//                 <th
//                   style={{
//                     position: "sticky",
//                     top: 0,
//                     background: "#f8fafc",
//                     padding: "10px 12px",
//                     textAlign: "left",
//                     borderBottom: "1px solid #e2e8f0",
//                     whiteSpace: "nowrap",
//                   }}
//                 >
//                   Field
//                 </th>

//                 <th
//                   style={{
//                     position: "sticky",
//                     top: 0,
//                     background: "#f8fafc",
//                     padding: "10px 12px",
//                     textAlign: "left",
//                     borderBottom: "1px solid #e2e8f0",
//                     whiteSpace: "nowrap",
//                   }}
//                 >
//                   Old Value
//                 </th>

//                 <th
//                   style={{
//                     position: "sticky",
//                     top: 0,
//                     background: "#f8fafc",
//                     padding: "10px 12px",
//                     textAlign: "left",
//                     borderBottom: "1px solid #e2e8f0",
//                     whiteSpace: "nowrap",
//                   }}
//                 >
//                   New Value
//                 </th>

//                 <th
//                   style={{
//                     position: "sticky",
//                     top: 0,
//                     background: "#f8fafc",
//                     padding: "10px 12px",
//                     textAlign: "left",
//                     borderBottom: "1px solid #e2e8f0",
//                     whiteSpace: "nowrap",
//                   }}
//                 >
//                   Changed At
//                 </th>
//               </tr>
//             </thead>

//             <tbody>
//               {entries.map((entry) => (
//                 <tr key={entry.id}>
//                   <td
//                     style={{
//                       padding: "10px 12px",
//                       borderBottom: "1px solid #f1f5f9",
//                       whiteSpace: "nowrap",
//                     }}
//                   >
//                     {entry.empId}
//                   </td>

//                   <td
//                     style={{
//                       padding: "10px 12px",
//                       borderBottom: "1px solid #f1f5f9",
//                       whiteSpace: "nowrap",
//                     }}
//                   >
//                     {entry.employeeName}
//                   </td>

//                   <td
//                     style={{
//                       padding: "10px 12px",
//                       borderBottom: "1px solid #f1f5f9",
//                       whiteSpace: "nowrap",
//                     }}
//                   >
//                     {entry.fieldName}
//                   </td>

//                   <td
//                     style={{
//                       padding: "10px 12px",
//                       borderBottom: "1px solid #f1f5f9",
//                       whiteSpace: "nowrap",
//                     }}
//                   >
//                     {entry.oldValue || "—"}
//                   </td>

//                   <td
//                     style={{
//                       padding: "10px 12px",
//                       borderBottom: "1px solid #f1f5f9",
//                       whiteSpace: "nowrap",
//                       fontWeight: 600,
//                     }}
//                   >
//                     {entry.newValue || "—"}
//                   </td>

//                   <td
//                     style={{
//                       padding: "10px 12px",
//                       borderBottom: "1px solid #f1f5f9",
//                       whiteSpace: "nowrap",
//                     }}
//                   >
//                     {entry.changedAt}
//                   </td>
//                 </tr>
//               ))}

//               {entries.length === 0 && (
//                 <tr>
//                   <td
//                     colSpan={6}
//                     style={{
//                       padding: "40px 20px",
//                       textAlign: "center",
//                       color: "#94a3b8",
//                     }}
//                   >
//                     No audit history available.
//                   </td>
//                 </tr>
//               )}
//             </tbody>
//           </table>
//         </div>

//         {/* FOOTER */}
//         <div
//           style={{
//             display: "flex",
//             justifyContent: "flex-end",
//             padding: "12px 20px",
//             borderTop: "1px solid #e5e7eb",
//           }}
//         >
//           <button
//             type="button"
//             className="em-btn em-btn-secondary"
//             onClick={onClose}
//           >
//             Close
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }

// /* ============================================================
//    COMPONENT
//    ============================================================ */

// export function EmployeeMaster() {
//   const catalystUser = useCatalystUser();
//   const { refreshEmployees } = useAppraisalRefresh();
//   const role = String(catalystUser?.role || "")
//     .trim()
//     .toLowerCase()
//     .replace(/[^a-z0-9]/g, "");
//   const isTechEd = role.includes("teched");
//   // UI gating only (the backend enforces authorization). Roster/status and
//   // eligibility writes are for HR and App Administrator; others read only.
//   const access = useAccess();
//   const isRoleHR = role === "hr" || role === "appadministrator";
//   // With access rules (/me ok) a 'view' level makes the screen read-only.
//   const canEditEmployees =
//     isRoleHR && access.canScreen("employeeMaster", "edit");
//   // Mirrors payrollcycleapi: payroll upload is allowed for HR and Comp. Manager.
//   // Edit rights on the screens that have their own Access level. With access
//   // rules, "view" makes the screen read-only; without them HR edits.
//   const canEditScreen = (key) =>
//     access.ok ? access.canScreen(key, "edit") : isRoleHR;
//   const canUploadPayroll = role === "hr" || role === "compmanager";
//   // Mirrors payrollcycleapi canAccessPayroll (HR, Comp. Manager, Tech-Ed).
//   const canViewPayroll = canUploadPayroll || isTechEd;
//   // Which HR Operations tabs to show: access rules when /me answered,
//   // otherwise the role-based rules used before access control.
//   const isTabVisible = (tab) => {
//     // Tech-Ed may open the existing Delegation screen without exposing the
//     // other HR Operations tabs. DelegationScreen still applies action-level
//     // permissions and routes Tech-Ed changes through HR approval.
//     if (tab === "delegation" && isTechEd) return true;
//     // Without access rules these HR Operations screens are HR only. With
//     // access rules each has its own screen (None / View / Edit), below.
//     if (
//       !access.ok &&
//       ["historical-import", "hr-dashboard", "change-mismatch"].includes(tab)
//     ) {
//       return isRoleHR;
//     }
//     if (access.ok) {
//       if (tab === "payroll-upload") return access.canScreen("payroll", "edit");
//       return access.canScreen(HR_TAB_SCREENS[tab] || "employeeMaster");
//     }
//     if (tab === "location-master") return isRoleHR;
//     // Without a loaded access matrix, Tech-Ed must still see only Delegation
//     // inside Employee Master—not the roster or eligibility tabs.
//     if (isTechEd) return tab === "delegation";
//     if (tab === "roster" || tab === "eligibility") return true;
//     if (tab === "payroll-data") return canViewPayroll;
//     if (tab === "payroll-upload") return canUploadPayroll;
//     if (tab === "access") return isRoleHR;
//     return !isTechEd;
//   };
//   const [allEmployees, setAllEmployees] = useState([]);

//   const [eligibilityEmployees, setEligibilityEmployees] = useState([]);
//   const [eligibilityCycleId, setEligibilityCycleId] = useState("");
//   const [eligibilityCriteriaApplied, setEligibilityCriteriaApplied] = useState(false);
//   const [delegationGenerated, setDelegationGenerated] = useState(false);
//   const [eligibilityResetConfirm, setEligibilityResetConfirm] = useState(false);
//   const [eligibilityBusy, setEligibilityBusy] = useState(false);
//   // Full Employee Master (all pages). The Eligibility List starts empty for a
//   // cycle, so the criteria panel and "Add An Employee" read from this list.
//   const [eligibilityMasterEmployees, setEligibilityMasterEmployees] = useState([]);
//   const [eligibilityShowingSnapshot, setEligibilityShowingSnapshot] = useState(false);

//   const [eligibilityLoading, setEligibilityLoading] = useState(false);

//   const [loading, setLoading] = useState(true);

//   const [statusActionLoading, setStatusActionLoading] = useState(false);

//   const initialTab = new URLSearchParams(window.location.search).get("tab");
//   const allowedTabs = new Set(
//     [
//       "hr-dashboard",
//       "roster",
//       "eligibility",
//       "appraisal-cycle",
//       "location-master",
//       "payroll-data",
//       "feedback-rating",
//       "payroll-upload",
//       "team-changes",
//       "change-mismatch",
//       "budget-master",
//       "budget-distribution",
//       "delegation",
//       "historical-import",
//       "access",
//       "designation-master",
//     ].filter(isTabVisible),
//   );
//   // HR Operations opens on the HR Dashboard (when the user may see it).
//   const defaultTab = allowedTabs.has("hr-dashboard")
//     ? "hr-dashboard"
//     : allowedTabs.has("access")
//     ? "access"
//     : allowedTabs.has("roster") || !allowedTabs.size
//       ? "roster"
//       : [...allowedTabs][0];
//   const [activeTab, setActiveTab] = useState(
//     isTechEd && !access.ok && initialTab !== "delegation"
//       ? "roster"
//       : allowedTabs.has(initialTab)
//         ? initialTab
//         : defaultTab,
//   );
//   const [uploadScreen, setUploadScreen] = useState("");
//   const [uploadCycleId, setUploadCycleId] = useState("");

//   useEffect(() => {
//     if (activeTab !== "payroll-upload") {
//       setUploadScreen("");
//       setUploadCycleId("");
//     }
//   }, [activeTab]);

//   // Every tab change is a history entry (?tab=...), so Back retraces the exact
//   // order visited: e.g. Dashboard -> Access -> Budget Master  =>  Back: Access -> Dashboard.
//   const goToTab = (tab) => {
//     if (tab === "eligibility" || tab === "change-mismatch") {
//       // Start the shared read at click time; the tab effect joins this request.
//       void prefetchEligibilityEmployees();
//     }
//     const current = new URLSearchParams(window.location.search).get("tab");
//     if (window.location.pathname === "/employee-master" && current !== tab) {
//       window.history.pushState({}, "", `/employee-master?tab=${tab}`);
//     }
//     setActiveTab(tab);
//   };

//   // Landing on HR Operations without ?tab= (default = Access): record it in the
//   // current history entry so it is a real step that Back returns to.
//   useEffect(() => {
//     if (window.location.pathname !== "/employee-master") return;
//     const current = new URLSearchParams(window.location.search).get("tab");
//     if (!current) {
//       window.history.replaceState({}, "", `/employee-master?tab=${activeTab}`);
//     }
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   const [search, setSearch] = useState("");

//   const [statusFilter, setStatusFilter] = useState("All");
//   const [locationFilter, setLocationFilter] = useState("All");

//   const [rosterFilters, setRosterFilters] = useState({});

//   const [eligibilitySearch, setEligibilitySearch] = useState("");

//   const [eligibilityLocationFilter, setEligibilityLocationFilter] = useState("All");

//   const [eligibilityFilters, setEligibilityFilters] = useState({});

//   const [excludedEmployees, setExcludedEmployees] = useState([]);

//   const [banner, setBanner] = useState(null);

//   const [eligibilityEmployee, setEligibilityEmployee] = useState(null);

//   const [previewOpen, setPreviewOpen] = useState(false);

//   const [previewChanges, setPreviewChanges] = useState([]);

//   const [pendingImportType, setPendingImportType] = useState(null);

//   const [previewWarnings, setPreviewWarnings] = useState([]);

//   const [importPreparing, setImportPreparing] = useState(false);

//   const [importSubmitting, setImportSubmitting] = useState(false);

//   const importSubmittingRef = useRef(false);

//   const [eligibilityReloadKey, setEligibilityReloadKey] = useState(0);

//   const fileInputRef = useRef(null);

//   const [currentPage, setCurrentPage] = useState(1);

//   const [rosterPagination, setRosterPagination] = useState({
//     page: 1,
//     limit: PAGE_SIZE,
//     totalCount: 0,
//     totalPages: 1,
//   });

//   const [rosterCounts, setRosterCounts] = useState({
//     total: 0,
//     active: 0,
//     inactive: 0,
//   });

//   const [refreshKey, setRefreshKey] = useState(0);

//   useEffect(() => {
//     const onPopState = () => {
//       const tab = new URLSearchParams(window.location.search).get("tab");

//       if (isTechEd && !access.ok && tab !== "delegation") {
//         setActiveTab("roster");
//         return;
//       }

//       setActiveTab(allowedTabs.has(tab) ? tab : defaultTab);
//     };

//     window.addEventListener("popstate", onPopState);

//     return () => {
//       window.removeEventListener("popstate", onPopState);
//     };
//   }, [isTechEd, access.ok, defaultTab]);

//   const eligibilityLoadedKeyRef = useRef(null);
//   const eligibilityFreshAppliedRef = useRef(false);
//   const eligibilityCacheScope = String(catalystUser?.email || catalystUser?.id || catalystUser?.user_id || "anonymous").trim().toLowerCase();
//   const eligibilityCacheKey = eligibilitySnapshotKey(eligibilityCacheScope);
//   const [currentAppraisalCycleName, setCurrentAppraisalCycleName] = useState("");

//   useEffect(() => {
//     // The Eligibility API response includes the authoritative Active cycle.
//     // Avoid a second cycles request when Employee Master opens.
//     const onCycleChange = () => {
//       setCurrentAppraisalCycleName("");
//       setEligibilityReloadKey((value) => value + 1);
//       setRefreshKey((value) => value + 1);
//     };
//     window.addEventListener("appraisal:cycle-updated", onCycleChange);
//     return () => window.removeEventListener("appraisal:cycle-updated", onCycleChange);
//   }, []);

//   useEffect(() => {
//     eligibilityFreshAppliedRef.current = false;
//     setEligibilityShowingSnapshot(false);
//   }, [eligibilityCacheKey]);

//   useEffect(() => onCatalystWrite(() => {
//     // Any successful write makes the saved Eligibility List stale. The next
//     // successful refresh writes a new snapshot.
//     void clearEligibilitySnapshot(eligibilityCacheKey);
//   }), [eligibilityCacheKey]);

//   // Restore the last Eligibility List immediately from IndexedDB. The fresh
//   // Catalyst response below always replaces this display-only snapshot.
//   useEffect(() => {
//     if (!eligibilityCacheScope || eligibilityFreshAppliedRef.current) return undefined;
//     let cancelled = false;
//     readEligibilitySnapshot(eligibilityCacheKey).then((snapshot) => {
//       if (cancelled || !snapshot || eligibilityFreshAppliedRef.current) return;
//       setEligibilityEmployees(snapshot.employees);
//       setEligibilityMasterEmployees(snapshot.masterEmployees);
//       setEligibilityCycleId(String(snapshot.cycleId || ""));
//       setCurrentAppraisalCycleName(String(snapshot.cycleName || ""));
//       setEligibilityCriteriaApplied(Boolean(snapshot.criteriaApplied));
//       setEligibilityShowingSnapshot(true);
//     });
//     return () => { cancelled = true; };
//   }, [eligibilityCacheKey, eligibilityCacheScope]);

//   useEffect(() => {
//     // Eligibility decisions and their audit trail belong to one cycle. Keep
//     // Employee Master status history separate because it is global master data.
//     setEligibilityAudit([]);
//     setRemoteEligibilityAudit(null);
//     setEligibilityAuditOpen(false);
//   }, [currentAppraisalCycleName]);

//   /* ============================================================
//      SEPARATE AUDIT STATES
//      ============================================================ */

//   const [employeeMasterAudit, setEmployeeMasterAudit] = useState([]);

//   const [eligibilityAudit, setEligibilityAudit] = useState([]);

//   const [employeeMasterAuditOpen, setEmployeeMasterAuditOpen] = useState(false);

//   const [eligibilityAuditOpen, setEligibilityAuditOpen] = useState(false);

//   /* ============================================================
//      AUDIT HELPERS
//      ============================================================ */

//   /*
//    * Entries are shown immediately and also saved to the shared
//    * Appraisal_Audit table (appraisalauditapi) so they survive a reload.
//    * Entries whose save failed stay visible for this session only and are
//    * flagged "(not saved)".
//    */
//   const [remoteEmployeeMasterAudit, setRemoteEmployeeMasterAudit] =
//     useState(null);

//   const [remoteEligibilityAudit, setRemoteEligibilityAudit] = useState(null);

//   const [auditLoadError, setAuditLoadError] = useState("");

//   const auditUserName = String(
//     catalystUser?.name || catalystUser?.email || "Unknown user",
//   );

//   const recordAudit = (setLocal, source, entry) => {
//     const now = new Date();

//     const fullEntry = {
//       id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`,
//       ...entry,
//       appraisalYear: source === AUDIT_SOURCE_ELIGIBILITY ? currentAppraisalCycleName : "",
//       changedBy: auditUserName,
//       changedAtIso: now.toISOString(),
//       changedAt: formatAuditTime(now),
//       source,
//       saved: true,
//     };

//     setLocal((current) => [fullEntry, ...current]);

//     postAuditEntries([fullEntry]).catch((error) => {
//       console.error("Audit save failed:", error);

//       setLocal((current) =>
//         current.map((item) =>
//           item.id === fullEntry.id
//             ? {
//                 ...item,
//                 saved: false,
//                 newValue: `${item.newValue} (not saved)`,
//               }
//             : item,
//         ),
//       );
//     });
//   };

//   const addEmployeeMasterAudit = ({
//     empId,
//     employeeName,
//     oldValue,
//     newValue,
//     fieldName = "Status",
//   }) => {
//     const oldText = String(oldValue ?? "").trim();
//     const newText = String(newValue ?? "").trim();

//     if (oldText === newText) {
//       return;
//     }

//     recordAudit(setEmployeeMasterAudit, AUDIT_SOURCE_STATUS, {
//       empId: String(empId || "").trim(),
//       employeeName: String(employeeName || "").trim(),
//       fieldName,
//       oldValue: oldText,
//       newValue: newText,
//     });
//   };

//   const addEligibilityAudit = ({ empId, employeeName, oldValue, newValue }) => {
//     const oldText = String(oldValue ?? "").trim();
//     const newText = String(newValue ?? "").trim();

//     if (oldText === newText) {
//       return;
//     }

//     recordAudit(setEligibilityAudit, AUDIT_SOURCE_ELIGIBILITY, {
//       empId: String(empId || "").trim(),
//       employeeName: String(employeeName || "").trim(),
//       fieldName: "Eligibility",
//       oldValue:
//         oldText === "Yes"
//           ? "Eligible"
//           : oldText === "No"
//             ? "Not Eligible"
//             : oldText,
//       newValue:
//         newText === "Yes"
//           ? "Eligible"
//           : newText === "No"
//             ? "Not Eligible"
//             : newText,
//     });
//   };

//   const openAuditHistory = async (kind) => {
//     const isStatus = kind === "status";

//     if (isStatus) {
//       setEmployeeMasterAuditOpen(true);
//     } else {
//       setEligibilityAuditOpen(true);
//     }

//     setAuditLoadError("");

//     try {
//       const entries = await fetchAuditEntries(
//         isStatus ? AUDIT_SOURCE_STATUS : AUDIT_SOURCE_ELIGIBILITY,
//         isStatus ? "" : currentAppraisalCycleName,
//       );

//       if (isStatus) {
//         setRemoteEmployeeMasterAudit(entries);
//       } else {
//         setRemoteEligibilityAudit(entries);
//       }
//     } catch (error) {
//       setAuditLoadError(
//         `Saved history could not be loaded (${
//           error?.message || "unknown error"
//         }). Showing this session's changes only.`,
//       );
//     }
//   };

//   // Saved history from the server plus any local entries that failed to save.
//   const mergeAuditEntries = (remote, local) =>
//     remote === null
//       ? local
//       : [...local.filter((entry) => entry.saved === false), ...remote];

//   const showBanner = (title, body, error = false) => {
//     setBanner({ title, body, error });
//   };

//   /* ============================================================
//      LOAD ONLY CURRENT ROSTER PAGE
//      ============================================================ */

//   useEffect(() => {
//     // EmployeeMaster is exposed to non-HR users only as the Delegation
//     // screen. Never request the HR-only Employee Master roster for non-HR
//     // roles, regardless of initial-tab timing or query-string navigation.
//     if (!isRoleHR) {
//       setAllEmployees([]);
//       setRosterPagination({
//         page: 1,
//         limit: PAGE_SIZE,
//         totalCount: 0,
//         totalPages: 1,
//       });
//       setRosterCounts({ total: 0, active: 0, inactive: 0 });
//       setLoading(false);
//       return undefined;
//     }

//     let cancelled = false;

//     const load = async () => {
//       try {
//         setLoading(true);

//         const result = await fetchEmployeeMasterEmployees({
//           page: currentPage,
//           limit: PAGE_SIZE,
//           search,
//           status:
//             statusFilter === "All"
//               ? "all"
//               : String(statusFilter || "").toLowerCase(),
//           location: locationFilter === "All" ? "" : locationFilter,
//         });

//         if (cancelled) {
//           return;
//         }

//         const employees = Array.isArray(result?.data) ? result.data : [];

//         setAllEmployees(employees);

//         setRosterPagination({
//           page:
//             result?.pagination?.page !== undefined
//               ? Number(result.pagination.page)
//               : currentPage,
//           limit:
//             result?.pagination?.limit !== undefined
//               ? Number(result.pagination.limit)
//               : PAGE_SIZE,
//           totalCount:
//             result?.pagination?.totalCount !== undefined
//               ? Number(result.pagination.totalCount)
//               : employees.length,
//           totalPages:
//             result?.pagination?.totalPages !== undefined
//               ? Number(result.pagination.totalPages)
//               : 1,
//         });

//         setRosterCounts({
//           total:
//             result?.counts?.total !== undefined
//               ? Number(result.counts.total)
//               : employees.length,
//           active:
//             result?.counts?.active !== undefined
//               ? Number(result.counts.active)
//               : 0,
//           inactive:
//             result?.counts?.inactive !== undefined
//               ? Number(result.counts.inactive)
//               : 0,
//         });
//       } catch (error) {
//         if (cancelled) {
//           return;
//         }

//         setAllEmployees([]);

//         setRosterPagination({
//           page: 1,
//           limit: PAGE_SIZE,
//           totalCount: 0,
//           totalPages: 1,
//         });

//         setRosterCounts({
//           total: 0,
//           active: 0,
//           inactive: 0,
//         });

//         showBanner(
//           "Employee data failed to load",
//           error?.message || "Unable to load employee data from Catalyst.",
//           true,
//         );
//       } finally {
//         if (!cancelled) {
//           setLoading(false);
//         }
//       }
//     };

//     load();

//     return () => {
//       cancelled = true;
//     };
//   }, [currentPage, search, statusFilter, locationFilter, refreshKey, isRoleHR]);

//   /* ============================================================
//      RESET PAGE WHEN SEARCH / STATUS FILTER CHANGES
//      ============================================================ */

//   useEffect(() => {
//     setCurrentPage(1);
//   }, [search, statusFilter, locationFilter]);

//   // Deep link from the Detail Screen's "View all changes" link.
//   useEffect(() => {
//     const tab = new URLSearchParams(window.location.search).get("tab");
//     if (tab === "teamChanges" && isTabVisible("team-changes"))
//       setActiveTab("team-changes");
//     if (tab === "budget-master" && isTabVisible("budget-master"))
//       setActiveTab("budget-master");
//   }, []);

//   /* ============================================================
//      COUNTS
//      ============================================================ */

//   const counts = useMemo(() => {
//     return {
//       total: rosterCounts.total,
//       active: rosterCounts.active,
//       inactive: rosterCounts.inactive,
//     };
//   }, [rosterCounts]);

//   /* ============================================================
//      CURRENT PAGE ROSTER FILTERS
//      ============================================================ */

//   const filteredRosterEmployees = useMemo(() => {
//     return allEmployees.filter((employee) => {
//       return Object.entries(rosterFilters).every(([field, filter]) => {
//         if (!filter) {
//           return true;
//         }

//         if (typeof filter === "string" && filter.trim() === "") {
//           return true;
//         }

//         const value = String(employee?.[field] || "").toLowerCase();

//         if (typeof filter === "string") {
//           return value.includes(filter.toLowerCase());
//         }

//         if (typeof filter === "object" && filter.value) {
//           return value.includes(String(filter.value).toLowerCase());
//         }

//         return true;
//       });
//     });
//   }, [allEmployees, rosterFilters]);

//   const rosterTotalPages = Math.max(1, rosterPagination.totalPages);

//   const rosterSafePage = Math.min(currentPage, rosterTotalPages);

//   /* ============================================================
//      LOAD ELIGIBILITY LIST
//      ============================================================ */

//   useEffect(() => {
//     // Change List & Mismatch compares against this same list, so it reuses
//     // this load (same fetch, same cache).
//     if (activeTab !== "eligibility" && activeTab !== "change-mismatch") {
//       return;
//     }

//     if (eligibilityLoadedKeyRef.current === "loaded") {
//       return;
//     }

//     eligibilityLoadedKeyRef.current = "loaded";

//     let cancelled = false;
//     let finished = false;

//     const loadEligibilityEmployees = async () => {
//       try {
//         setEligibilityLoading(true);

//         // Keep the authoritative Active cycle ID returned by the API. Do not
//         // rely on each mapped employee row to carry a correctly shaped FK.
//         // The eligibility API already returns the complete cycle roster in one
//         // response. Use a large client-side page size so we do not repeat the
//         // same full Catalyst table scan once for every 100 employees.
//         const firstPage = await fetchEligibilityEmployees({
//           page: 1,
//           limit: 100000,
//           search: "",
//         });
//         if (cancelled) return;

//         const loadedCycleId = String(firstPage?.cycle?.cycleId || "").trim();
//         eligibilityFreshAppliedRef.current = true;
//         setEligibilityShowingSnapshot(false);
//         setCurrentAppraisalCycleName(String(firstPage?.cycle?.cycleName || "").trim());
//         setEligibilityCycleId(loadedCycleId);
//         setEligibilityCriteriaApplied(Boolean(firstPage?.cycle?.criteriaApplied));
//         const freshEligibilityEmployees = Array.isArray(firstPage?.data) ? firstPage.data : [];
//         const freshEligibilityMasterEmployees = Array.isArray(firstPage?.masterEmployees) ? firstPage.masterEmployees : [];
//         setEligibilityEmployees(freshEligibilityEmployees);
//         setEligibilityMasterEmployees(freshEligibilityMasterEmployees);
//         void writeEligibilitySnapshot(eligibilityCacheKey, {
//           employees: freshEligibilityEmployees,
//           masterEmployees: freshEligibilityMasterEmployees,
//           cycleId: loadedCycleId,
//           cycleName: String(firstPage?.cycle?.cycleName || "").trim(),
//           criteriaApplied: Boolean(firstPage?.cycle?.criteriaApplied),
//         });

//         finished = true;
//       } catch (error) {
//         if (cancelled) {
//           return;
//         }

//         // If the network refresh fails, keep the last saved snapshot visible
//         // (read-only) rather than replacing useful rows with an empty screen.
//         if (!eligibilityShowingSnapshot) {
//           setEligibilityEmployees([]);
//           setEligibilityMasterEmployees([]);
//           setEligibilityCycleId("");
//         }

//         eligibilityLoadedKeyRef.current = null;

//         showBanner(
//           "Eligibility data failed to load",
//           error?.message ||
//             "Unable to load employees for the Eligibility List.",
//           true,
//         );
//       } finally {
//         if (!cancelled) {
//           setEligibilityLoading(false);
//         }
//       }
//     };

//     loadEligibilityEmployees();

//     return () => {
//       cancelled = true;
//       // Allow a retry if this load was interrupted before it finished.
//       if (!finished && eligibilityLoadedKeyRef.current === "loaded") {
//         eligibilityLoadedKeyRef.current = null;
//       }
//     };
//   }, [activeTab, eligibilityReloadKey]);

//   // Force the Eligibility List to reload from Catalyst on its next view.
//   const invalidateEligibilityList = () => {
//     eligibilityLoadedKeyRef.current = null;
//     eligibilityFreshAppliedRef.current = false;
//     setEligibilityShowingSnapshot(false);
//     void clearEligibilitySnapshot(eligibilityCacheKey);
//     setEligibilityCycleId("");
//     setEligibilityCriteriaApplied(false);
//     setEligibilityReloadKey((value) => value + 1);
//   };

//   // A cycle can be created/closed while HR Operations remains mounted. Clear
//   // the retained ID and reload so eligibility writes cannot target an old cycle.
//   useEffect(() => {
//     const onCycleUpdated = () => {
//       eligibilityLoadedKeyRef.current = null;
//       eligibilityFreshAppliedRef.current = false;
//       setEligibilityShowingSnapshot(false);
//       void clearEligibilitySnapshot(eligibilityCacheKey);
//       setEligibilityCycleId("");
//       setEligibilityCriteriaApplied(false);
//       setDelegationGenerated(false);
//       setEligibilityEmployees([]);
//       setEligibilityReloadKey((value) => value + 1);
//     };
//     window.addEventListener("appraisal:cycle-updated", onCycleUpdated);
//     return () => window.removeEventListener("appraisal:cycle-updated", onCycleUpdated);
//   }, [eligibilityCacheKey]);

//   /* ============================================================
//      FILE READING
//      ============================================================ */

//   const readFile = async (file) => {
//     const extension = file.name.split(".").pop()?.toLowerCase();

//     if (extension === "csv") {
//       const text = await file.text();

//       return csvRowsToObjects(parseCsv(text));
//     }

//     if (extension === "xlsx" || extension === "xls") {
//       const XLSX = await import("xlsx");

//       const buffer = await file.arrayBuffer();

//       const workbook = XLSX.read(buffer, { type: "array" });

//       const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

//       if (!firstSheet) {
//         throw new Error("No worksheet found in the file.");
//       }

//       return XLSX.utils.sheet_to_json(firstSheet, {
//         defval: "",
//         raw: false,
//       });
//     }

//     throw new Error(
//       "Unsupported file format. Please upload CSV or Excel file.",
//     );
//   };

//   /* ============================================================
//      ROSTER IMPORT CHANGES
//      ============================================================ */

//   /*
//    * existingEmployees must be the COMPLETE employee list (not the current
//    * roster page), otherwise existing employees are treated as new.
//    * Returns { changes, warnings }. Each change carries a readable
//    * field-level diff list for the preview.
//    */
//   const buildRosterImportChanges = (rows, existingEmployees) => {
//     const changes = [];
//     const warnings = [];

//     if (!Array.isArray(rows) || rows.length === 0) {
//       return { changes, warnings };
//     }

//     const existingById = new Map(
//       existingEmployees.map((employee) => [
//         normalizeEmpId(employee.empId),
//         employee,
//       ]),
//     );

//     const employeesByName = new Map();

//     existingEmployees.forEach((employee) => {
//       const key = String(employee.name || "")
//         .trim()
//         .toLowerCase();

//       if (!key) {
//         return;
//       }

//       employeesByName.set(key, [...(employeesByName.get(key) || []), employee]);
//     });

//     /* De-duplicate by normalized emp_id; the last row in the file wins. */
//     const mappedById = new Map();
//     const duplicateIds = new Set();
//     let missingIdCount = 0;

//     rows.forEach((row) => {
//       if (!row || typeof row !== "object") {
//         return;
//       }

//       const mapped = {};

//       Object.entries(row).forEach(([header, value]) => {
//         const field = findFieldForHeader(header);

//         if (field) {
//           mapped[field.key] = String(value ?? "").trim();
//         }
//       });

//       const importedEmpId = getImportedEmpId(row);

//       if (importedEmpId) {
//         mapped.empId = importedEmpId;
//       }

//       if (!mapped.empId) {
//         if (Object.values(mapped).some((value) => value !== "")) {
//           missingIdCount += 1;
//         }

//         return;
//       }

//       const key = normalizeEmpId(mapped.empId);

//       if (mappedById.has(key)) {
//         duplicateIds.add(mapped.empId);
//       }

//       mappedById.set(key, mapped);
//     });

//     if (duplicateIds.size > 0) {
//       warnings.push(
//         `Duplicate Emp IDs in file (last row used): ${[...duplicateIds].join(
//           ", ",
//         )}`,
//       );
//     }

//     if (missingIdCount > 0) {
//       warnings.push(`${missingIdCount} row(s) without an Emp ID were skipped.`);
//     }

//     const unresolvedAppraisers = [];

//     mappedById.forEach((mapped, key) => {
//       const existing = existingById.get(key);

//       /* Bare appraiser names are resolved to "EMPxxxx - Name". */
//       if (mapped.appraiser && !isCanonicalPersonValue(mapped.appraiser)) {
//         const matches =
//           employeesByName.get(mapped.appraiser.toLowerCase()) || [];

//         if (matches.length === 1) {
//           mapped.appraiser = `${matches[0].empId} - ${matches[0].name}`;
//         } else {
//           unresolvedAppraisers.push(
//             `${mapped.empId} ("${mapped.appraiser}"${
//               matches.length > 1 ? `, ${matches.length} matches` : ", no match"
//             })`,
//           );

//           delete mapped.appraiser;
//         }
//       }

//       const fields = {};
//       const diffs = [];

//       FIELD_DEFS.forEach((field) => {
//         if (field.key === "empId") {
//           return;
//         }

//         /* Only fields the backend can store are imported / previewed. */
//         if (!ROSTER_FIELD_TO_CATALYST[field.key]) {
//           return;
//         }

//         if (mapped[field.key] === undefined) {
//           return;
//         }

//         let importedValue = String(mapped[field.key] || "").trim();

//         if (importedValue === "") {
//           return;
//         }

//         if (field.key === "status") {
//           const lower = importedValue.toLowerCase();

//           if (lower === "active" || lower === "inactive") {
//             importedValue = lower === "active" ? "Active" : "Inactive";
//           }
//         }

//         const existingValue = String(existing?.[field.key] ?? "").trim();

//         if (!existing || existingValue !== importedValue) {
//           fields[field.key] = importedValue;

//           diffs.push({
//             field: field.label,
//             from: existing ? existingValue : "",
//             to: importedValue,
//           });
//         }
//       });

//       if (!existing) {
//         changes.push({
//           empId: mapped.empId,
//           name: mapped.name || "",
//           fields,
//           diffs,
//           isNew: true,
//         });

//         return;
//       }

//       if (Object.keys(fields).length > 0) {
//         changes.push({
//           empId: existing.empId,
//           name: mapped.name || existing.name || "",
//           fields,
//           diffs,
//           isNew: false,
//           previousStatus: existing.status,
//         });
//       }
//     });

//     if (unresolvedAppraisers.length > 0) {
//       warnings.push(
//         `Appraiser / Tech-ED not updated (name must match exactly one employee, or use "EMPxxxx - Name"): ${unresolvedAppraisers.join(
//           "; ",
//         )}`,
//       );
//     }

//     return { changes, warnings };
//   };

//   /* ============================================================
//      ELIGIBILITY IMPORT CHANGES
//      ============================================================ */

//   const buildEligibilityImportChanges = (rows, sourceEmployees) => {
//     const changes = [];

//     if (!Array.isArray(rows) || rows.length === 0) {
//       return changes;
//     }

//     rows.forEach((row) => {
//       if (!row || typeof row !== "object") {
//         return;
//       }

//       const empId = getImportedEmpId(row);

//       if (!empId) {
//         return;
//       }

//       let eligibleValue = "";

//       Object.entries(row).forEach(([header, value]) => {
//         const normalized = normalizeImportHeader(header);

//         if (normalized === "eligible" || normalized === "eligibility") {
//           eligibleValue = String(value || "").trim();
//         }
//       });

//       if (!eligibleValue) {
//         return;
//       }

//       const eligible = normalizeEligibleValue(eligibleValue);

//       if (!eligible) {
//         return;
//       }

//       let reason = "";

//       Object.entries(row).forEach(([header, value]) => {
//         const normalized = normalizeImportHeader(header);

//         if (
//           normalized === "reason" ||
//           normalized === "eligiblereason" ||
//           normalized === "remarks"
//         ) {
//           reason = String(value || "").trim();
//         }
//       });

//       const employee = sourceEmployees.find(
//         (item) => normalizeEmpId(item.empId) === normalizeEmpId(empId),
//       );

//       if (!employee) {
//         return;
//       }

//       const nextReason = reason !== "" ? reason : employee.eligibleReason || "";

//       // Only eligible_status is stored in Catalyst; a reason-only
//       // difference is not a change that can be saved.
//       if (employee.eligible !== eligible) {
//         const label = (value) =>
//           value === "Yes" ? "Eligible" : "Not Eligible";

//         changes.push({
//           empId: employee.empId,
//           name: employee.name,
//           fields: {
//             Eligible: eligible,
//             Reason: nextReason,
//           },
//           diffs: [
//             {
//               field: "Eligibility",
//               from: label(employee.eligible),
//               to: label(eligible),
//             },
//           ],
//         });
//       }
//     });

//     return changes;
//   };

//   /* ============================================================
//      FILE HANDLERS
//      ============================================================ */

//   const handleRosterFile = async (file) => {
//     if (!canEditEmployees || importPreparing) {
//       return;
//     }

//     try {
//       setImportPreparing(true);

//       const rows = await readFile(file);

//       // Compare against the complete employee list, not the current page.
//       const fullEmployees = await fetchAllEmployeeMasterEmployees();

//       const { changes, warnings } = buildRosterImportChanges(
//         rows,
//         fullEmployees,
//       );

//       setPendingImportType("roster");
//       setPreviewChanges(changes);
//       setPreviewWarnings(warnings);
//       setPreviewOpen(true);
//     } catch (error) {
//       showBanner(
//         "Import failed",
//         error?.message || "Unable to read the file.",
//         true,
//       );
//     } finally {
//       setImportPreparing(false);
//     }
//   };

//   const handleEligibilityFile = async (file) => {
//     if (!canEditEmployees) {
//       return;
//     }

//     try {
//       let sourceEmployees = eligibilityEmployees;

//       if (sourceEmployees.length === 0) {
//         setEligibilityLoading(true);

//         const firstPage = await fetchEligibilityEmployees({
//           page: 1,
//           limit: 100,
//           search: "",
//         });

//         sourceEmployees = Array.isArray(firstPage?.data) ? firstPage.data : [];

//         const totalPages = Number(firstPage?.pagination?.totalPages) || 1;

//         for (let page = 2; page <= totalPages; page += 1) {
//           const result = await fetchEligibilityEmployees({
//             page,
//             limit: 100,
//             search: "",
//           });

//           sourceEmployees = sourceEmployees.concat(
//             Array.isArray(result?.data) ? result.data : [],
//           );
//         }

//         setEligibilityEmployees(sourceEmployees);
//         eligibilityLoadedKeyRef.current = "loaded";
//         setEligibilityLoading(false);
//       }

//       const rows = await readFile(file);

//       const changes = buildEligibilityImportChanges(rows, sourceEmployees);

//       setPendingImportType("eligibility");
//       setPreviewChanges(changes);
//       setPreviewWarnings([
//         "Eligibility reasons are shown for reference only and are not saved (no backend column).",
//       ]);
//       setPreviewOpen(true);
//     } catch (error) {
//       setEligibilityLoading(false);

//       showBanner(
//         "Import failed",
//         error?.message || "Unable to read the file.",
//         true,
//       );
//     }
//   };

//   /* ============================================================
//      STATUS PERSISTENCE
//      ============================================================ */

//   const persistStatusChange = async (empId, nextStatus) => {
//     const normalizedStatus = String(nextStatus || "").trim();

//     if (normalizedStatus !== "Active" && normalizedStatus !== "Inactive") {
//       throw new Error("Invalid employee status.");
//     }

//     return updateEmployeeMasterEmployee(empId, {
//       status: normalizedStatus,
//     });
//   };

//   /* ============================================================
//      LOCAL STATUS UPDATE
//      ============================================================ */

//   const applyLocalStatusChanges = (successfulChanges) => {
//     const statusMap = new Map(
//       successfulChanges.map((change) => [
//         normalizeEmpId(change.empId),
//         change.status,
//       ]),
//     );

//     const updateEmployee = (employee) => {
//       const nextStatus = statusMap.get(normalizeEmpId(employee.empId));

//       if (!nextStatus) {
//         return employee;
//       }

//       return {
//         ...employee,
//         status: nextStatus,
//       };
//     };

//     setAllEmployees((current) => current.map(updateEmployee));

//     setEligibilityEmployees((current) => current.map(updateEmployee));

//     setRosterCounts((current) => {
//       let activeDelta = 0;

//       successfulChanges.forEach((change) => {
//         const previous = allEmployees.find(
//           (employee) =>
//             normalizeEmpId(employee.empId) === normalizeEmpId(change.empId),
//         );

//         if (!previous) {
//           return;
//         }

//         if (previous.status === "Active" && change.status === "Inactive") {
//           activeDelta -= 1;
//         }

//         if (previous.status === "Inactive" && change.status === "Active") {
//           activeDelta += 1;
//         }
//       });

//       return {
//         ...current,
//         active: current.active + activeDelta,
//         inactive: current.inactive - activeDelta,
//       };
//     });

//     invalidateEligibilityList();
//   };

//   /* ============================================================
//      INDIVIDUAL ACTIVE / INACTIVE
//      ============================================================ */

//   const toggleEmployeeStatus = async (employee) => {
//     if (!canEditEmployees || !employee?.empId) {
//       return;
//     }

//     const oldStatus = employee.status;

//     const nextStatus = employee.status === "Active" ? "Inactive" : "Active";

//     try {
//       setStatusActionLoading(true);

//       await persistStatusChange(employee.empId, nextStatus);

//       addEmployeeMasterAudit({
//         empId: employee.empId,
//         employeeName: employee.name,
//         oldValue: oldStatus,
//         newValue: nextStatus,
//       });

//       applyLocalStatusChanges([
//         {
//           empId: employee.empId,
//           status: nextStatus,
//         },
//       ]);

//       showBanner(
//         "Status updated",
//         `${employee.empId} is now ${nextStatus}. Saved to Catalyst.`,
//       );
//     } catch (error) {
//       showBanner(
//         "Status update failed",
//         error?.message || "Unable to save employee status to Catalyst.",
//         true,
//       );
//     } finally {
//       setStatusActionLoading(false);
//     }
//   };

//   /* ============================================================
//      BULK ACTIVE / INACTIVE
//      ============================================================ */

//   const bulkUpdateEmployeeStatus = async (nextStatus, selectedEmployees) => {
//     if (!canEditEmployees) {
//       return;
//     }

//     if (!Array.isArray(selectedEmployees) || selectedEmployees.length === 0) {
//       showBanner(
//         "No employees selected",
//         "Please select at least one employee before using Active or Inactive.",
//         true,
//       );
//       return;
//     }

//     const normalizedStatus = String(nextStatus || "").trim();

//     if (normalizedStatus !== "Active" && normalizedStatus !== "Inactive") {
//       return;
//     }

//     const uniqueEmployees = Array.from(
//       new Map(
//         selectedEmployees
//           .filter((employee) => employee?.empId)
//           .map((employee) => [normalizeEmpId(employee.empId), employee]),
//       ).values(),
//     );

//     const employeesToUpdate = uniqueEmployees.filter(
//       (employee) => employee.status !== normalizedStatus,
//     );

//     if (employeesToUpdate.length === 0) {
//       showBanner(
//         "No status changes needed",
//         `All selected employees are already ${normalizedStatus}.`,
//       );
//       return;
//     }

//     try {
//       setStatusActionLoading(true);

//       const results = await Promise.allSettled(
//         employeesToUpdate.map(async (employee) => {
//           const oldStatus = employee.status;

//           await persistStatusChange(employee.empId, normalizedStatus);

//           return {
//             empId: employee.empId,
//             employeeName: employee.name,
//             oldStatus,
//             status: normalizedStatus,
//           };
//         }),
//       );

//       const successfulChanges = [];
//       let failedCount = 0;

//       results.forEach((result) => {
//         if (result.status === "fulfilled") {
//           successfulChanges.push(result.value);

//           addEmployeeMasterAudit({
//             empId: result.value.empId,
//             employeeName: result.value.employeeName,
//             oldValue: result.value.oldStatus,
//             newValue: result.value.status,
//           });
//         } else {
//           failedCount += 1;

//           console.error("Bulk status update failed:", result.reason);
//         }
//       });

//       if (successfulChanges.length > 0) {
//         applyLocalStatusChanges(successfulChanges);
//       }

//       if (failedCount > 0) {
//         showBanner(
//           "Bulk status partially completed",
//           `${successfulChanges.length} employee(s) updated to ${normalizedStatus}. ${failedCount} employee(s) failed.`,
//           true,
//         );
//       } else {
//         showBanner(
//           "Bulk status updated",
//           `${successfulChanges.length} employee(s) are now ${normalizedStatus}. Changes saved to Catalyst.`,
//         );
//       }
//     } catch (error) {
//       showBanner(
//         "Bulk status update failed",
//         error?.message || "Unable to update employee status.",
//         true,
//       );
//     } finally {
//       setStatusActionLoading(false);
//     }
//   };

//   /* ============================================================
//      BULK EMPLOYEE MASTER FIELD CHANGE
//      ============================================================ */

//   const bulkUpdateEmployeeField = async ({ field, value, remark = "" }, selectedEmployees) => {
//     if (!canEditEmployees) return;
//     const fieldMap = {
//       name: { column: "emp_name", label: "Employee Name" },
//       designation: { column: "designation", label: "Designation" },
//       dept: { column: "department", label: "Department" },
//       reportingManager: { column: "repo_manager", label: "Reporting Manager" },
//       director: { column: "director", label: "Director" },
//       appraiser: { column: "appraiser_tech_ed", label: "Appraiser Tech-ED" },
//       type: { column: "emp_type", label: "Employee Type" },
//       email: { column: "email_id", label: "Email ID" },
//       doj: { column: "date_of_join", label: "Date of Joining" },
//       location: { column: "location", label: "Location" },
//       costCenter: { column: "cost_center", label: "Cost Center" },
//       orgExp: { column: "wissen_experience", label: "Wissen Experience" },
//       totalExp: { column: "total_experience", label: "Total Experience" },
//       currentSalary: { column: "current_salary", label: "Current Salary" },
//       lastAppraisal: { column: "last_appraisal_month_year", label: "Last Appraisal Month/Year" },
//     };
//     const definition = field === "status"
//       ? { column: "emp_status", label: "Employee Status" }
//       : fieldMap[field];
//     if (!definition) {
//       showBanner("Unsupported field", "This field is not available in Employee Master.", true);
//       return;
//     }
//     const nextValue = String(value ?? "").trim();
//     if (!nextValue) {
//       showBanner("Value required", "Enter a value before applying the change.", true);
//       return;
//     }
//     if (field === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextValue)) {
//       showBanner("Invalid email", "Enter a valid email address.", true);
//       return;
//     }
//     if (["orgExp", "totalExp", "currentSalary"].includes(field) &&
//         (!Number.isFinite(Number(nextValue.replace(/[₹,%\s]/g, ""))) || Number(nextValue.replace(/[₹,%\s]/g, "")) < 0)) {
//       showBanner("Invalid number", `${definition.label} must be a valid non-negative number.`, true);
//       return;
//     }
//     const uniqueEmployees = Array.from(new Map(
//       (Array.isArray(selectedEmployees) ? selectedEmployees : [])
//         .filter((employee) => employee?.empId)
//         .map((employee) => [normalizeEmpId(employee.empId), employee]),
//     ).values());
//     if (!uniqueEmployees.length) return;
//     if (["name", "email", "doj"].includes(field) && uniqueEmployees.length > 1) {
//       showBanner("Select one employee", `${definition.label} can only be changed for one employee at a time.`, true);
//       return;
//     }
//     const oldValueFor = (employee) => field === "status" ? employee.status : ({
//       name: employee.name,
//       designation: employee.designation,
//       dept: employee.organization,
//       reportingManager: employee.reportingManager,
//       director: employee.compManager,
//       appraiser: employee.appraiser,
//       type: employee.rawEmployee?.emp_type,
//       email: employee.rawEmployee?.email_id || employee.managerMail,
//       doj: employee.doj,
//       location: employee.location,
//       costCenter: employee.rawEmployee?.cost_center,
//       orgExp: employee.orgExp,
//       totalExp: employee.totalExp,
//       currentSalary: employee.rawEmployee?.current_salary,
//       lastAppraisal: employee.lastAppraisal,
//     })[field];
//     const employeesToUpdate = uniqueEmployees.filter(
//       (employee) => String(oldValueFor(employee) ?? "").trim() !== nextValue,
//     );
//     if (!employeesToUpdate.length) {
//       showBanner("No changes needed", "All selected employees already have this value.");
//       return;
//     }
//     try {
//       setStatusActionLoading(true);
//       const results = await Promise.allSettled(employeesToUpdate.map(async (employee) => {
//         if (field === "status") {
//           await persistStatusChange(employee.empId, nextValue);
//         } else {
//           await updateEmployeeMasterRecord(employee.empId, {
//             [definition.column]: field === "doj" ? toIsoDate(nextValue) : nextValue,
//           });
//         }
//         return { employee, oldValue: String(oldValueFor(employee) ?? ""), newValue: nextValue };
//       }));
//       const succeeded = [];
//       let failed = 0;
//       results.forEach((result) => {
//         if (result.status !== "fulfilled") {
//           failed += 1;
//           console.error("Employee Master field change failed:", result.reason);
//           return;
//         }
//         const { employee, oldValue, newValue } = result.value;
//         succeeded.push({ empId: employee.empId, status: field === "status" ? newValue : undefined });
//         addEmployeeMasterAudit({
//           empId: employee.empId,
//           employeeName: employee.name,
//           oldValue,
//           newValue,
//           fieldName: definition.label,
//         });
//       });
//       if (field === "status" && succeeded.length) {
//         applyLocalStatusChanges(succeeded);
//       } else if (succeeded.length) {
//         setRefreshKey((current) => current + 1);
//         refreshEmployees();
//       }
//       if (failed) {
//         showBanner("Change partially completed", `${succeeded.length} employee(s) updated. ${failed} failed. Check the error details and retry failed employees.`, true);
//       } else {
//         showBanner("Employee Master updated", `${definition.label} changed for ${succeeded.length} employee(s). Changes saved to Employee_Master.${remark ? ` Remark: ${remark}` : ""}`);
//       }
//     } catch (error) {
//       showBanner("Employee Master change failed", error?.message || "Unable to update selected employees.", true);
//     } finally {
//       setStatusActionLoading(false);
//     }
//   };

//   /* ============================================================
//      LOCAL ELIGIBILITY UPDATE
//      ============================================================ */

//   /*
//    * manual = true only for genuine manual edits (modal / file import).
//    * Criteria-driven changes must not set manualOverride, otherwise the
//    * next Apply Criteria skips those rows.
//    */
//   const applyLocalEligibilityChanges = (
//     successfulChanges,
//     { manual = false } = {},
//   ) => {
//     const changeMap = new Map(
//       successfulChanges.map((change) => [normalizeEmpId(change.empId), change]),
//     );

//     const updateEmployee = (employee) => {
//       const change = changeMap.get(normalizeEmpId(employee.empId));

//       if (!change) {
//         return employee;
//       }

//       const nextEligible = change.fields?.Eligible === "Yes" ? "Yes" : "No";

//       return {
//         ...employee,
//         eligible: nextEligible,
//         eligibleStatus: nextEligible === "Yes" ? "Eligible" : "Not Eligible",
//         eligibleReason: manual
//           ? change.fields?.Reason || employee.eligibleReason || ""
//           : change.fields?.Reason || "",
//         manualOverride: manual ? true : Boolean(employee.manualOverride),
//         status: employee.status,
//       };
//     };

//     setEligibilityEmployees((current) => current.map(updateEmployee));

//     setAllEmployees((current) => current.map(updateEmployee));
//   };

//   /* ============================================================
//      SAVE ELIGIBILITY TO CATALYST
//      ============================================================ */

//   const persistEligibilityChange = async (change, source = "Manual") => {
//     const eligible = change.fields?.Eligible === "Yes" ? "Yes" : "No";
//     const eligibleReason = change.fields?.Reason || "";

//     // Eligibility decisions are cycle-scoped in Eligibility_List. Resolve the
//     // cycle from the loaded row rather than sending a cycle-less update (which
//     // the backend correctly rejects and leaves every employee Pending).
//     const employee = eligibilityEmployees.find(
//       (item) => normalizeEmpId(item.empId) === normalizeEmpId(change.empId),
//     );
//     const cycleId = String(
//       eligibilityCycleId ||
//       employee?.appraisalCycleId ||
//       employee?.rawEmployee?.appraisal_cycle_id ||
//       employee?.rawEmployee?.appraisalCycleId ||
//       "",
//     ).trim();
//     if (!cycleId) {
//       throw new Error(
//         `Could not identify the active appraisal cycle for ${change.empId}. Refresh the Eligibility List and try again.`,
//       );
//     }

//     await updateEmployeeEligibility(
//       change.empId,
//       eligible,
//       eligibleReason,
//       cycleId,
//       source,
//     );

//     return {
//       empId: change.empId,
//       name: change.name,
//       fields: {
//         Eligible: eligible,
//         Reason: eligibleReason,
//       },
//     };
//   };

//   /* ============================================================
//      CONFIRM IMPORT
//      ============================================================ */

//   const closePreview = () => {
//     setPreviewOpen(false);
//     setPreviewChanges([]);
//     setPreviewWarnings([]);
//     setPendingImportType(null);
//   };

//   /* In-flight guard: prevents double POSTs from repeated clicks. */
//   const confirmImport = async () => {
//     if (importSubmittingRef.current || !canEditEmployees) {
//       return;
//     }

//     importSubmittingRef.current = true;
//     setImportSubmitting(true);

//     try {
//       await runConfirmImport();
//     } finally {
//       importSubmittingRef.current = false;
//       setImportSubmitting(false);
//     }
//   };

//   const runConfirmImport = async () => {
//     if (previewChanges.length === 0) {
//       closePreview();

//       showBanner("Nothing to import", "No changes were found in the file.");

//       return;
//     }

//     if (pendingImportType === "eligibility") {
//       try {
//         const results = await Promise.allSettled(
//           previewChanges.map(async (change) => {
//             const oldEmployee = eligibilityEmployees.find(
//               (employee) =>
//                 normalizeEmpId(employee.empId) === normalizeEmpId(change.empId),
//             );

//             const oldEligible = oldEmployee?.eligible;

//             const result = await persistEligibilityChange(change);

//             return {
//               ...result,
//               oldEligible,
//             };
//           }),
//         );

//         const successfulChanges = [];
//         let failedCount = 0;

//         results.forEach((result) => {
//           if (result.status === "fulfilled") {
//             successfulChanges.push(result.value);

//             addEligibilityAudit({
//               empId: result.value.empId,
//               employeeName: result.value.name,
//               oldValue: result.value.oldEligible,
//               newValue: result.value.fields?.Eligible,
//             });
//           } else {
//             failedCount += 1;

//             console.error("Eligibility import update failed:", result.reason);
//           }
//         });

//         if (successfulChanges.length > 0) {
//           applyLocalEligibilityChanges(successfulChanges, { manual: true });
//         }

//         closePreview();

//         if (failedCount > 0) {
//           showBanner(
//             "Eligibility import partially completed",
//             `${successfulChanges.length} updated in Catalyst. ${failedCount} record(s) failed.`,
//             true,
//           );
//         } else {
//           showBanner(
//             "Eligibility imported",
//             `${successfulChanges.length} employee record(s) updated in Employees table. Active/Inactive status was not changed.`,
//           );
//         }
//       } catch (error) {
//         showBanner(
//           "Eligibility import failed",
//           error?.message || "Unable to update eligibility.",
//           true,
//         );
//       }

//       return;
//     }

//     /* ==========================================================
//        ROSTER IMPORT
//        ========================================================== */

//     try {
//       const records = previewChanges.map((change) => {
//         const payload = {
//           emp_id: change.empId,
//         };

//         Object.entries(change.fields || {}).forEach(([key, value]) => {
//           const catalystField = ROSTER_FIELD_TO_CATALYST[key];

//           if (catalystField) {
//             payload[catalystField] = value;
//           }
//         });

//         // Status is sent only when the file has a Status value. New rows
//         // default to Active on the backend; existing rows keep their status.

//         return payload;
//       });

//       const result = await createEmployeeMasterEmployees(records);

//       /* Log status changes from roster import only when the
//          employee already existed and its status was changed. */
//       previewChanges.forEach((change) => {
//         if (change.isNew) {
//           return;
//         }

//         const importedStatus = change.fields?.status;

//         if (!importedStatus) {
//           return;
//         }

//         if (
//           !change.previousStatus ||
//           change.previousStatus === importedStatus
//         ) {
//           return;
//         }

//         addEmployeeMasterAudit({
//           empId: change.empId,
//           employeeName: change.name,
//           oldValue: change.previousStatus,
//           newValue: importedStatus,
//         });
//       });

//       closePreview();

//       setRefreshKey((value) => value + 1);

//       invalidateEligibilityList();

//       const created = result?.data?.created || 0;
//       const updated = result?.data?.updated || 0;
//       const skipped = result?.data?.skipped || 0;

//       showBanner(
//         "Employee import completed",
//         `${created} created, ${updated} updated${
//           skipped ? `, ${skipped} skipped` : ""
//         } in Catalyst.`,
//       );
//     } catch (error) {
//       showBanner(
//         "Employee import failed",
//         error?.message || "Unable to import employees to Catalyst.",
//         true,
//       );
//     }
//   };

//   /* ============================================================
//      ELIGIBILITY CRITERIA
//      ============================================================ */

//   const applyEligibilityCriteria = async ({
//     departments,
//     designations,
//     excludedEmployees: excluded,
//     cutoffDate,
//     replaceCriteria = false,
//   }) => {
//     if (!canEditEmployees) {
//       return;
//     }

//     try {
//       if (!eligibilityCycleId) {
//         throw new Error(
//           "The active appraisal cycle ID is missing. Reload the Eligibility List before applying criteria.",
//         );
//       }

//       // The backend evaluates the Employee Master against the criteria and
//       // adds only the employees who pass to this cycle's Eligibility List.
//       // Employees excluded by the criteria are left out of the list.
//       const result = await applyEligibilityCriteriaToCycle(eligibilityCycleId, {
//         departments,
//         designations,
//         excludedEmployees: excluded,
//         cutoffDate: toIsoDate(cutoffDate),
//         replaceCriteria,
//       });

//       (result?.addedRows || []).forEach((row) =>
//         addEligibilityAudit({
//           empId: row.empId,
//           employeeName: row.name,
//           oldValue: "Not in list",
//           newValue: "Eligible",
//         }),
//       );
//       (result?.removedRows || []).forEach((row) =>
//         addEligibilityAudit({
//           empId: row.empId,
//           employeeName: row.name,
//           oldValue: "Eligible",
//           newValue: "Removed by criteria",
//         }),
//       );

//       setEligibilityCriteriaApplied(true);
//       // Backend writes have completed. Retry the read so the new rows render
//       // immediately, without requiring a browser refresh.
//       try {
//         await reloadEligibilityRows();
//       } catch (refreshError) {
//         console.error("Eligibility saved; first list refresh failed:", refreshError);
//         await new Promise((resolve) => setTimeout(resolve, 400));
//         try {
//           await reloadEligibilityRows();
//         } catch (retryError) {
//           console.error("Eligibility list refresh retry failed:", retryError);
//         }
//       }
//       showBanner(
//         "Criteria applied",
//         `${result?.evaluated ?? 0} employee(s) evaluated: ${result?.added ?? 0} added, ${result?.updated ?? 0} updated, and ${result?.excluded ?? 0} excluded by the criteria. Existing manual decisions were preserved.`,
//       );
//       return true;
//     } catch (error) {
//       // A network/response error can happen after Catalyst has committed the
//       // writes. Re-read the authoritative cycle before showing a failure.
//       try {
//         const recovered = await fetchEligibilityEmployees({
//           page: 1,
//           limit: 100000,
//           search: "",
//           cycleId: eligibilityCycleId,
//         });
//         if (!replaceCriteria && recovered?.cycle?.criteriaApplied) {
//           setEligibilityEmployees(Array.isArray(recovered.data) ? recovered.data : []);
//           setEligibilityCriteriaApplied(true);
//           showBanner(
//             "Criteria applied",
//             "The eligibility list was saved successfully and has been loaded on screen.",
//           );
//           return true;
//         }
//       } catch (recoveryError) {
//         console.error("Unable to verify eligibility after apply response error:", recoveryError);
//       }
//       showBanner(
//         "Criteria update failed",
//         error?.message || "Unable to apply eligibility criteria.",
//         true,
//       );
//       return false;
//     }
//   };

//   // Re-read the active cycle's Eligibility List from Catalyst.
//   const reloadEligibilityRows = async () => {
//     const reloaded = await fetchEligibilityEmployees({
//       page: 1,
//       limit: 100000,
//       search: "",
//       cycleId: eligibilityCycleId,
//     });
//     const employees = Array.isArray(reloaded?.data) ? reloaded.data : [];
//     const criteriaApplied = Boolean(reloaded?.cycle?.criteriaApplied);
//     setEligibilityEmployees(employees);
//     setEligibilityCriteriaApplied(criteriaApplied);
//     setEligibilityShowingSnapshot(false);
//     eligibilityFreshAppliedRef.current = true;
//     void writeEligibilitySnapshot(eligibilityCacheKey, {
//       employees,
//       masterEmployees: eligibilityMasterEmployees,
//       cycleId: eligibilityCycleId,
//       cycleName: String(reloaded?.cycle?.cycleName || currentAppraisalCycleName || ""),
//       criteriaApplied,
//     });
//   };

//   // Used by Change List & Mismatch to stay current without a page refresh:
//   // quietly re-reads the Eligibility List and the full Employee Master.
//   const refreshChangeListData = async () => {
//     if (!eligibilityCycleId || eligibilityLoading) return;
//     const [reloaded, masters] = await Promise.all([
//       fetchEligibilityEmployees({
//         page: 1,
//         limit: 100000,
//         search: "",
//         cycleId: eligibilityCycleId,
//       }),
//       fetchAllEmployeeMasterEmployees(),
//     ]);
//     const employees = Array.isArray(reloaded?.data) ? reloaded.data : [];
//     const masterEmployees = Array.isArray(masters) ? masters : [];
//     const criteriaApplied = Boolean(reloaded?.cycle?.criteriaApplied);
//     setEligibilityEmployees(employees);
//     setEligibilityCriteriaApplied(criteriaApplied);
//     setEligibilityMasterEmployees(masterEmployees);
//     setEligibilityShowingSnapshot(false);
//     eligibilityFreshAppliedRef.current = true;
//     void writeEligibilitySnapshot(eligibilityCacheKey, {
//       employees,
//       masterEmployees,
//       cycleId: eligibilityCycleId,
//       cycleName: String(reloaded?.cycle?.cycleName || currentAppraisalCycleName || ""),
//       criteriaApplied,
//     });
//   };

//   const regenerateEligibility = () => {
//     if (!canEditEmployees || !eligibilityCycleId) return;
//     setEligibilityResetConfirm(true);
//   };

//   const confirmEditRegenerateEligibility = async () => {
//     setEligibilityResetConfirm(false);
//     setEligibilityBusy(true);
//     try {
//       const result = await payrollCycleRequest("eligibility", {
//         method: "POST",
//         body: { action: "reset-criteria", cycleId: eligibilityCycleId },
//       });
//       setEligibilityEmployees([]);
//       setEligibilityCriteriaApplied(false);
//       setDelegationGenerated(false);
//       setBanner(null);
//       showBanner(
//         "Eligibility list cleared",
//         "The current cycle's generated eligibility records were removed. Update the criteria and select Apply Criteria again."
//       );
//       window.dispatchEvent(new CustomEvent("appraisal:eligibility-reset", {
//         detail: { cycleId: eligibilityCycleId, removed: result?.removed || 0 }
//       }));
//     } catch (error) {
//       showBanner("Unable to reset eligibility", error?.message || "Please try again.", true);
//     } finally {
//       setEligibilityBusy(false);
//     }
//   };

//   const generateDelegationFromEligibility = async () => {
//     if (!canEditEmployees || !eligibilityCycleId || !eligibilityCriteriaApplied) return;
//     setEligibilityBusy(true);
//     try {
//       const response = await catalystFetch(
//         catalystFunctionUrl("accessapi") + "delegation/fill",
//         {
//           method: "POST",
//           headers: { "Content-Type": "application/json", Accept: "application/json" },
//           body: JSON.stringify({ cycleId: eligibilityCycleId, replace: true }),
//         }
//       );
//       const payload = await response.json().catch(() => ({}));
//       if (!response.ok || payload.ok === false || payload.success === false) {
//         throw new Error(payload.error || payload.message || "Delegation generation failed.");
//       }
//       setDelegationGenerated(true);
//       window.dispatchEvent(new CustomEvent("appraisal:delegation-generated", {
//         detail: { cycleId: eligibilityCycleId }
//       }));
//       goToTab("delegation");
//     } catch (error) {
//       showBanner("Delegation generation failed", error?.message || "Please try again.", true);
//     } finally {
//       setEligibilityBusy(false);
//     }
//   };

//   /* ============================================================
//      ADD AN EMPLOYEE (manual inclusion in the Eligibility List)
//      ============================================================ */

//   const addEmployeeToEligibility = async ({ empId, eligibleReason }) => {
//     if (!canEditEmployees) {
//       throw new Error("You do not have permission to change the Eligibility List.");
//     }
//     if (!eligibilityCycleId) {
//       throw new Error(
//         "Could not identify the active appraisal cycle. Refresh the Eligibility List and try again.",
//       );
//     }

//     const master = eligibilityMasterEmployees.find(
//       (employee) => normalizeEmpId(employee.empId) === normalizeEmpId(empId),
//     );

//     await updateEmployeeEligibility(
//       empId,
//       "Yes",
//       eligibleReason || "",
//       eligibilityCycleId,
//       "Manual",
//     );

//     addEligibilityAudit({
//       empId,
//       employeeName: master?.name || "",
//       oldValue: "Not in list",
//       newValue: "Eligible",
//     });

//     try {
//       await reloadEligibilityRows();
//     } catch (reloadError) {
//       console.error("Eligibility reload after add failed:", reloadError);
//     }

//     showBanner(
//       "Employee added",
//       `${empId} was added to the Eligibility List as Eligible.`,
//     );
//   };

//   /* ============================================================
//      SAVE INDIVIDUAL ELIGIBILITY
//      ============================================================ */

//   const saveEligibility = async ({ empId, eligible, eligibleReason }) => {
//     if (!canEditEmployees) {
//       return;
//     }

//     try {
//       const normalizedEligible = eligible === "Yes" ? "Yes" : "No";

//       const existingEmployee = eligibilityEmployees.find(
//         (employee) => normalizeEmpId(employee.empId) === normalizeEmpId(empId),
//       );

//       const oldEligible = existingEmployee?.eligible;

//       const selectedEligibilityCycleId = String(
//         eligibilityCycleId ||
//         existingEmployee?.appraisalCycleId ||
//         existingEmployee?.rawEmployee?.appraisal_cycle_id ||
//         existingEmployee?.rawEmployee?.appraisalCycleId ||
//         "",
//       ).trim();
//       if (!selectedEligibilityCycleId) {
//         throw new Error("Could not identify the selected appraisal cycle. Refresh the Eligibility List and try again.");
//       }

//       await updateEmployeeEligibility(
//         empId,
//         normalizedEligible,
//         eligibleReason || "",
//         selectedEligibilityCycleId,
//       );

//       addEligibilityAudit({
//         empId,
//         employeeName: existingEmployee?.name || "",
//         oldValue: oldEligible,
//         newValue: normalizedEligible,
//       });

//       applyLocalEligibilityChanges(
//         [
//           {
//             empId,
//             fields: {
//               Eligible: normalizedEligible,
//               Reason: eligibleReason || "",
//             },
//           },
//         ],
//         { manual: true },
//       );

//       setEligibilityEmployee(null);

//       showBanner(
//         "Eligibility updated",
//         `${empId} is now ${
//           normalizedEligible === "Yes" ? "Eligible" : "Not Eligible"
//         }. Saved to Employees table. Active/Inactive status was not changed.`,
//       );
//     } catch (error) {
//       showBanner(
//         "Eligibility update failed",
//         error?.message || "Unable to save eligibility to Catalyst.",
//         true,
//       );
//     }
//   };

//   /* ============================================================
//      RENDER
//      ============================================================ */

//   return (
//     <AppShell>
//       <div className="employee-master-page">
//         {/* ======================================================
//             TABS
//             ====================================================== */}

//         {!isTechEd && (
//           <HrOperationsNav
//             activeTab={activeTab}
//             isTabVisible={isTabVisible}
//             onSelect={goToTab}
//           />
//         )}

//         {/* ======================================================
//             BANNER
//             ====================================================== */}

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

//         {/* ======================================================
//             EMPLOYEE MASTER TAB
//             ====================================================== */}

//         {isTabVisible("roster") && activeTab === "roster" && (
//           <div className="em-tab-content">
//             <EmployeeMasterToolbar
//               search={search}
//               setSearch={setSearch}
//               statusFilter={statusFilter}
//               setStatusFilter={setStatusFilter}
//               locationFilter={locationFilter}
//               setLocationFilter={setLocationFilter}
//               onDownloadTemplate={downloadRosterTemplate}
//               onUpload={
//                 canEditEmployees && !importPreparing
//                   ? () => fileInputRef.current?.click()
//                   : undefined
//               }
//               onDownloadData={() => downloadRosterData(filteredRosterEmployees)}
//               onAuditHistory={
//                 access.canAction("viewAudit")
//                   ? () => openAuditHistory("status")
//                   : undefined
//               }
//             />

//             {importPreparing && (
//               <div className="em-empty">
//                 Reading file and loading all employees for comparison...
//               </div>
//             )}

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

//             {loading ? (
//               <div className="em-empty">Loading employees...</div>
//             ) : (
//               <EmployeeRosterTable
//                 rows={filteredRosterEmployees}
//                 filters={rosterFilters}
//                 setFilters={setRosterFilters}
//                 currentPage={rosterSafePage}
//                 setCurrentPage={setCurrentPage}
//                 totalPages={rosterTotalPages}
//                 totalCount={rosterPagination.totalCount}
//                 onToggleStatus={toggleEmployeeStatus}
//                 onBulkStatusChange={bulkUpdateEmployeeStatus}
//                 onBulkFieldChange={bulkUpdateEmployeeField}
//                 bulkStatusUpdating={statusActionLoading}
//                 canEdit={canEditEmployees}
//               />
//             )}
//           </div>
//         )}

//         {/* ======================================================
//             ELIGIBILITY TAB
//             ====================================================== */}

//         {isTabVisible("eligibility") && activeTab === "eligibility" && (
//           <div className="em-tab-content">
//             {eligibilityLoading && !eligibilityShowingSnapshot ? (
//               <div className="em-empty">
//                 Loading all employees for Eligibility List...
//               </div>
//             ) : (
//               <div
//                 className="em-eligibility-layout"
//                 style={
//                   canEditEmployees
//                     ? undefined
//                     : { gridTemplateColumns: "minmax(0, 1fr)" }
//                 }
//               >
//                 {canEditEmployees && (
//                   <EligibilityCriteria
//                     employees={
//                       eligibilityMasterEmployees.length
//                         ? eligibilityMasterEmployees
//                         : eligibilityEmployees
//                     }
//                     excludedEmployees={excludedEmployees}
//                     setExcludedEmployees={setExcludedEmployees}
//                     onApply={applyEligibilityCriteria}
//                     onRegenerate={regenerateEligibility}
//                     onGenerateDelegation={eligibilityShowingSnapshot ? undefined : generateDelegationFromEligibility}
//                     criteriaApplied={eligibilityCriteriaApplied}
//                     delegationGenerated={delegationGenerated}
//                     readOnly={!eligibilityCycleId || eligibilityShowingSnapshot}
//                   />
//                 )}

//                 <EligibilityList
//                   employees={eligibilityEmployees}
//                   search={eligibilitySearch}
//                   setSearch={setEligibilitySearch}
//                   locationFilter={eligibilityLocationFilter}
//                   setLocationFilter={setEligibilityLocationFilter}
//                   filters={eligibilityFilters}
//                   setFilters={setEligibilityFilters}
//                   onChangeEligibility={
//                     canEditEmployees && !eligibilityShowingSnapshot ? setEligibilityEmployee : undefined
//                   }
//                   onAddEmployee={
//                     canEditEmployees && !eligibilityShowingSnapshot ? addEmployeeToEligibility : undefined
//                   }
//                   masterEmployees={eligibilityMasterEmployees}
//                   onDownloadTemplate={downloadEligibilityTemplate}
//                   onImport={
//                     canEditEmployees && !eligibilityShowingSnapshot ? handleEligibilityFile : undefined
//                   }
//                   onExport={exportEligibilityData}
//                   onAuditHistory={
//                     access.canAction("viewAudit")
//                       ? () => openAuditHistory("eligibility")
//                       : undefined
//                   }
//                   criteriaApplied={eligibilityCriteriaApplied}
//                   onGenerateDelegation={eligibilityShowingSnapshot ? undefined : generateDelegationFromEligibility}
//                   delegationGenerated={delegationGenerated}
//                 />
//               </div>
//             )}
//           </div>
//         )}

//         {/* ======================================================
//             APPRAISAL CYCLE MASTER
//             NO AUDIT HISTORY HERE
//             ====================================================== */}

//         {isTabVisible("appraisal-cycle") && activeTab === "appraisal-cycle" && (
//           <div className="em-tab-content">
//             <HrConfigPage
//               canEdit={isRoleHR}
//               renderCycleScreen={(defaultProcess) => (
//                 <AppraisalCycleMasterPage
//                   defaultProcess={defaultProcess}
//                   cycleStats={null}
//                   onGenerateSheet={async (cycle) => {
//                     const result = await generateAppraisalSheet(cycle.id);
//                     await refreshEmployees();
//                     return result;
//                   }}
//                   canNavigate={(tab) =>
//                     tab === "appraisal-sheet"
//                       ? access.canScreen("appraisalSheet")
//                       : KNOWN_TABS.includes(tab) && isTabVisible(tab)
//                   }
//                   onNavigate={(tab, requestedUploadScreen, cycle) => {
//                     if (tab === "appraisal-sheet") {
//                       window.location.assign("/sheet");
//                       return;
//                     }
//                     if (tab === "payroll-upload") {
//                       setUploadScreen(requestedUploadScreen || "");
//                       setUploadCycleId(String(cycle?.id || ""));
//                     }
//                     if (KNOWN_TABS.includes(tab) && isTabVisible(tab)) {
//                       goToTab(tab);
//                       return;
//                     }
//                     showBanner(
//                       "Not connected",
//                       "That screen is not available here yet.",
//                       true,
//                     );
//                   }}
//                 />
//               )}
//             />
//           </div>
//         )}

//         {isTabVisible("location-master") && activeTab === "location-master" && (
//           <div className="em-tab-content">
//             <LocationMasterControl managerOnly readOnly={!canEditScreen("locationMaster")} />
//           </div>
//         )}

//         {/* ======================================================
//             PAYROLL DATA
//             ====================================================== */}

//         {isTabVisible("payroll-data") && activeTab === "payroll-data" && (
//           <div className="em-tab-content">
//             <PayrollDataPage />
//           </div>
//         )}

//         {/* ======================================================
//             HISTORICAL IMPORT (HR only)
//             ====================================================== */}

//         {isTabVisible("historical-import") && activeTab === "historical-import" && (
//           <div className="em-tab-content">
//             <HistoricalImportPage readOnly={!canEditScreen("historicalImport")} />
//           </div>
//         )}

//         {/* ======================================================
//             Feedback rating
//             ====================================================== */}

//         {isTabVisible("feedback-rating") && activeTab === "feedback-rating" && (
//           <div className="em-tab-content">
//             <FeedbackRatingMasterContainer />
//           </div>
//         )}

//         {/* ======================================================
//             PAYROLL UPLOAD
//             ====================================================== */}

//         {isTabVisible("payroll-upload") && activeTab === "payroll-upload" && (
//           <div
//             className="em-tab-content"
//             style={{
//               height: "calc(100vh - 140px)",
//               overflowY: "auto",
//               overflowX: "hidden",
//             }}
//           >
//             <UploadPage key={`${uploadCycleId}:${uploadScreen}`} initialCycleId={uploadCycleId} initialScreen={uploadScreen} />
//           </div>
//         )}
//         {isTabVisible("team-changes") && activeTab === "team-changes" && (
//           <TeamChangesPage />
//         )}
//         {isTabVisible("change-mismatch") && activeTab === "change-mismatch" && (
//           <div className="em-tab-content">
//             <ChangeListMismatchPage
//               employees={eligibilityMasterEmployees}
//               eligibilityEmployees={eligibilityEmployees}
//               canEdit={canEditEmployees && canEditScreen("changeMismatch")}
//               onNavigate={goToTab}
//               onRefresh={refreshChangeListData}
//             />
//           </div>
//         )}
//         {isTabVisible("budget-master") && activeTab === "budget-master" && (
//           <div
//             className="em-tab-content"
//             style={{
//               height: "calc(100vh - 140px)",
//               overflowY: "auto",
//               overflowX: "hidden",
//             }}
//           >
//             <BudgetMasterPage />
//           </div>
//         )}

//         {isTabVisible("budget-distribution") &&
//           activeTab === "budget-distribution" && (
//             <div
//               className="em-tab-content"
//               style={{
//                 height: "calc(100vh - 140px)",
//                 overflowY: "auto",
//                 overflowX: "hidden",
//               }}
//             >
//               <BudgetDistributionPage />
//             </div>
//           )}
//         {isTabVisible("delegation") && activeTab === "delegation" && (
//           <div
//             className="em-tab-content"
//             style={{
//               height: "calc(100vh - 140px)",
//               overflowY: "auto",
//               overflowX: "hidden",
//             }}
//           >
//             <DelegationScreen showRoleSwitch={false} />
//           </div>
//         )}
//         {isTabVisible("hr-dashboard") && activeTab === "hr-dashboard" && (
//           <div className="em-tab-content">
//             <HrDashboardPage />
//           </div>
//         )}
//         {isTabVisible("access") && activeTab === "access" && (
//           <div className="em-tab-content">
//             <AccessPage />
//           </div>
//         )}
//         {isTabVisible("designation-master") &&
//           activeTab === "designation-master" && (
//           <div className="em-tab-content">
//           <DesignationMasterPage readOnly={!canEditScreen("designationMaster")} />
//           </div>
//         )}

//         {/* ======================================================
//             ELIGIBILITY MODAL
//             ====================================================== */}

//         <EligibilityModal
//           employee={eligibilityEmployee}
//           onClose={() => setEligibilityEmployee(null)}
//           onSave={saveEligibility}
//         />

//         {/* ======================================================
//             IMPORT PREVIEW
//             ====================================================== */}

//         <ImportPreviewModal
//           open={previewOpen}
//           title={
//             pendingImportType === "eligibility"
//               ? "Eligibility Import Preview"
//               : "Employee Import Preview"
//           }
//           changes={previewChanges}
//           warnings={previewWarnings}
//           submitting={importSubmitting}
//           onCancel={closePreview}
//           onConfirm={confirmImport}
//         />

//         {/* ======================================================
//             EMPLOYEE MASTER AUDIT HISTORY
//             ====================================================== */}

//         <ProcessingOverlay open={eligibilityBusy} />
//         {eligibilityResetConfirm && (
//           <div
//             role="presentation"
//             onMouseDown={(event) => {
//               if (event.target === event.currentTarget) setEligibilityResetConfirm(false);
//             }}
//             style={{
//               position: "fixed", inset: 0, zIndex: 10000,
//               background: "rgba(15, 23, 42, 0.45)",
//               display: "flex", alignItems: "center", justifyContent: "center",
//               padding: 20,
//             }}
//           >
//             <section
//               role="dialog"
//               aria-modal="true"
//               aria-labelledby="eligibility-reset-title"
//               style={{
//                 width: "min(480px, 100%)", background: "#fff", borderRadius: 12,
//                 padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
//               }}
//             >
//               <h2 id="eligibility-reset-title" style={{ margin: "0 0 10px", fontSize: 18 }}>
//                 Regenerate Eligibility List
//               </h2>
//               <p style={{ margin: "0 0 22px", color: "#475569", lineHeight: 1.5 }}>
//                 This permanently clears the generated Eligibility List for the active cycle. Your current criteria selections remain available. You can then apply criteria again to generate a fresh list.
//               </p>
//               <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
//                 <button type="button" className="em-btn" onClick={() => setEligibilityResetConfirm(false)}>
//                   Cancel
//                 </button>
//                 <button type="button" className="em-btn em-btn-primary" onClick={confirmEditRegenerateEligibility}>
//                   Clear List &amp; Regenerate
//                 </button>
//               </div>
//             </section>
//           </div>
//         )}

//         <AuditHistoryPanel
//           open={employeeMasterAuditOpen}
//           title="Employee Master Audit History"
//           description={
//             auditLoadError ||
//             "Active / Inactive status changes only (saved to the Appraisal audit log)."
//           }
//           entries={mergeAuditEntries(
//             remoteEmployeeMasterAudit,
//             employeeMasterAudit,
//           )}
//           onClose={() => setEmployeeMasterAuditOpen(false)}
//         />

//         {/* ======================================================
//             ELIGIBILITY AUDIT HISTORY
//             ====================================================== */}

//         <AuditHistoryPanel
//           open={eligibilityAuditOpen}
//           title="Eligibility Audit History"
//           description={
//             auditLoadError ||
//             "Eligible / Not Eligible changes only (saved to the Appraisal audit log)."
//           }
//           entries={mergeAuditEntries(remoteEligibilityAudit, eligibilityAudit)}
//           onClose={() => setEligibilityAuditOpen(false)}
//         />
//       </div>
//     </AppShell>
//   );
// }

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, X, History } from "lucide-react";

import { AppShell } from "@/components/appraisal/AppShell";
import { useCatalystUser } from "@/lib/catalyst-auth";
import {
  catalystFetch,
  catalystFunctionUrl,
  onCatalystWrite,
} from "@/lib/catalyst-api";
import {
  generateAppraisalSheet,
  payrollCycleRequest,
} from "@/lib/payroll-cycle-api";
import { useAppraisalRefresh } from "@/lib/appraisal-store";
import { HrConfigPage } from "@/components/employee-master/HrConfigPage";
import { LocationMasterControl } from "@/components/employee-master/LocationMasterControl";
import { useSelectedLocation } from "@/lib/location-store";
import { DesignationMasterPage } from "@/components/employee-master/DesignationMasterPage";
import {
  FIELD_DEFS,
  fetchEmployeeMasterEmployees,
  fetchAllEmployeeMasterEmployees,
  fetchEligibilityEmployees,
  prefetchEligibilityEmployees,
  updateEmployeeMasterEmployee,
  updateEmployeeMasterRecord,
  updateEmployeeEligibility,
  updateEligibilityRecords,
  applyEligibilityCriteriaToCycle,
  createEmployeeMasterEmployees,
} from "@/lib/employee-master-data";

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
import { AppraisalCycleMasterPage } from "@/components/employee-master/AppraisalCycleMasterPage";
import { PayrollDataPage } from "@/components/employee-master/PayrollDataPage";
import { HistoricalImportPage } from "@/components/employee-master/HistoricalImportPage";
import { FeedbackRatingMasterContainer } from "@/components/employee-master/FeedbackRatingMasterContainer";
import { UploadPage } from "@/components/employee-master/UploadPage";
import { TeamChangesPage } from "@/components/employee-master/TeamChangesPage";
import { ChangeListMismatchPage } from "@/components/employee-master/ChangeListMismatchPage";
import { BudgetMasterPage } from "@/components/employee-master/BudgetMasterPage";
import { BudgetDistributionPage } from "@/components/employee-master/BudgetDistributionPage";
import DelegationScreen from "@/components/employee-master/DelegationScreen";
import { LettersPage } from "@/components/employee-master/LettersPage";
import AccessPage from "@/components/employee-master/AccessPage";
import { HrDashboardPage } from "@/components/employee-master/HrDashboardPage";
import { HrOperationsNav } from "@/components/employee-master/HrOperationsNav";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { HR_TAB_SCREENS, useAccess } from "@/lib/access-store";
import {
  eligibilitySnapshotKey,
  readEligibilitySnapshot,
  writeEligibilitySnapshot,
  clearEligibilitySnapshot,
} from "@/lib/roster-snapshot";

import "@/styles/employee-master.css";

const PAGE_SIZE = 20;
const KNOWN_TABS = [
  "roster",
  "payroll-data",
  "payroll-upload",
  "eligibility",
  "delegation",
  "letters",
  "feedback-rating",
  "team-changes",
  "historical-import",
];

const ROSTER_FIELD_TO_CATALYST = {
  name: "name",
  designation: "designation",
  organization: "department",
  doj: "joining_date",
  orgExp: "wissen_experience",
  totalExp: "total_experience",
  reportingManager: "reporting_manager",
  compManager: "comp_manager",
  // Only the Appraiser / Tech-ED column feeds appraiser_tech_ed. The
  // "Super Manager" name column has no backend field and is not imported.
  appraiser: "appraiser_tech_ed",
  managerMail: "manager_email_id",
  superManagerMail: "super_man_email_id",
  status: "status",
};

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeEmpId(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeImportHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s._/-]+/g, "")
    .replace(/[()]/g, "");
}

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
      const result = String(value || "").trim();

      if (result) {
        return result;
      }
    }
  }

  return "";
}

/*
 * Normalise a date value to "yyyy-mm-dd" so it can be compared with the
 * <input type="date"> cutoff. Accepts ISO strings, dd-mm-yyyy / dd/mm/yyyy
 * and anything Date can parse. Returns "" when the value is not a date.
 */
function toIsoDate(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  const pad = (number) => String(number).padStart(2, "0");

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (iso) {
    return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  }

  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

  if (dmy) {
    return `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

/* Canonical appraiser format, e.g. "EMP0051 - Ashok Kumar". */
function isCanonicalPersonValue(value) {
  return /^\s*[A-Za-z]*\d+\s+-\s+\S/.test(String(value || ""));
}

/* ============================================================
   AUDIT PERSISTENCE (shared Appraisal_Audit table)
   ============================================================ */

const AUDIT_API_URL = catalystFunctionUrl("appraisalauditapi");

const AUDIT_SOURCE_STATUS = "Employee Master - Status";
const AUDIT_SOURCE_ELIGIBILITY = "Employee Master - Eligibility";

function formatAuditTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

async function postAuditEntries(entries) {
  if (!entries.length) {
    return;
  }

  const response = await catalystFetch(AUDIT_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      entries.map((entry) => ({
        emp_id: entry.empId,
        employee_name: entry.employeeName,
        field_name: entry.fieldName,
        old_value: entry.oldValue,
        new_value: entry.newValue,
        changed_by: entry.changedBy,
        changed_at: entry.changedAtIso,
        source: entry.source,
        appraisal_year: entry.appraisalYear || "",
      })),
    ),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.message || `Audit API failed with status ${response.status}`,
    );
  }
}

async function fetchAuditEntries(source, cycleName = "") {
  const url = new URL(AUDIT_API_URL);

  url.searchParams.set("limit", "500");
  url.searchParams.set("_ts", String(Date.now()));

  const response = await catalystFetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.message || `Audit API failed with status ${response.status}`,
    );
  }

  return (Array.isArray(result.data) ? result.data : [])
    .map((record) => record?.Appraisal_Audit || record || {})
    .filter((row) => String(row.source || "") === source)
    .map((row, index) => ({
      id: String(row.ROWID || row.id || `audit-${index}`),
      empId: String(row.emp_id || ""),
      employeeName: String(row.employee_name || ""),
      fieldName: String(row.field_name || ""),
      oldValue: String(row.old_value || ""),
      newValue: String(row.new_value || ""),
      changedAt: formatAuditTime(row.changed_at || row.CREATEDTIME),
      appraisalYear: String(row.appraisal_year || row.appraisalYear || ""),
    }))
    .filter(
      (entry) =>
        source !== AUDIT_SOURCE_ELIGIBILITY ||
        (Boolean(cycleName) && entry.appraisalYear === cycleName),
    );
}

/* ============================================================
   AUDIT PANEL
   ============================================================ */

function AuditHistoryPanel({ open, title, description, entries, onClose }) {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: "min(1100px, 95vw)",
          maxHeight: "85vh",
          background: "#fff",
          borderRadius: "10px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <History size={18} />

              <h2
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 700,
                }}
              >
                {title}
              </h2>
            </div>

            <p
              style={{
                margin: "4px 0 0",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: "32px",
              height: "32px",
              border: 0,
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* COUNT */}
        <div
          style={{
            padding: "10px 20px",
            borderBottom: "1px solid #e5e7eb",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          {entries.length} change{entries.length === 1 ? "" : "s"} recorded
        </div>

        {/* TABLE */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  Employee ID
                </th>

                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  Employee Name
                </th>

                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  Field
                </th>

                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  Old Value
                </th>

                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  New Value
                </th>

                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#f8fafc",
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: "1px solid #e2e8f0",
                    whiteSpace: "nowrap",
                  }}
                >
                  Changed At
                </th>
              </tr>
            </thead>

            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.empId}
                  </td>

                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.employeeName}
                  </td>

                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.fieldName}
                  </td>

                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.oldValue || "—"}
                  </td>

                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                    }}
                  >
                    {entry.newValue || "—"}
                  </td>

                  <td
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.changedAt}
                  </td>
                </tr>
              ))}

              {entries.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "40px 20px",
                      textAlign: "center",
                      color: "#94a3b8",
                    }}
                  >
                    No audit history available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 20px",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <button
            type="button"
            className="em-btn em-btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   COMPONENT
   ============================================================ */

export function EmployeeMaster() {
  const catalystUser = useCatalystUser();
  const { refreshEmployees } = useAppraisalRefresh();
  const role = String(catalystUser?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  // UI gating only (the backend enforces authorization). Roster/status and
  // eligibility writes are for HR and App Administrator; others read only.
  const access = useAccess();
  const isRoleHR = role === "hr" || role === "appadministrator";
  // With access rules (/me ok) a 'view' level makes the screen read-only.
  const canEditEmployees =
    isRoleHR && access.canScreen("employeeMaster", "edit");
  // Mirrors payrollcycleapi: payroll upload is allowed for HR and Comp. Manager.
  // Edit rights on the screens that have their own Access level. With access
  // rules, "view" makes the screen read-only; without them HR edits.
  const canEditScreen = (key) =>
    access.ok ? access.canScreen(key, "edit") : isRoleHR;
  const canUploadPayroll = role === "hr" || role === "compmanager";
  // Mirrors payrollcycleapi canAccessPayroll (HR, Comp. Manager, Tech-Ed).
  const canViewPayroll = canUploadPayroll || isTechEd;
  // Which HR Operations tabs to show: access rules when /me answered,
  // otherwise the role-based rules used before access control.
  const isTabVisible = (tab) => {
    // Tech-Ed may open the existing Delegation screen without exposing the
    // other HR Operations tabs. DelegationScreen still applies action-level
    // permissions and routes Tech-Ed changes through HR approval.
    if (tab === "delegation" && isTechEd) return true;
    // Without access rules these HR Operations screens are HR only. With
    // access rules each has its own screen (None / View / Edit), below.
    if (
      !access.ok &&
      ["historical-import", "hr-dashboard", "change-mismatch", "letters"].includes(
        tab,
      )
    ) {
      return isRoleHR;
    }
    if (access.ok) {
      if (tab === "payroll-upload") return access.canScreen("payroll", "edit");
      return access.canScreen(HR_TAB_SCREENS[tab] || "employeeMaster");
    }
    if (tab === "location-master") return isRoleHR;
    // Without a loaded access matrix, Tech-Ed must still see only Delegation
    // inside Employee Master—not the roster or eligibility tabs.
    if (isTechEd) return tab === "delegation";
    if (tab === "roster" || tab === "eligibility") return true;
    if (tab === "payroll-data") return canViewPayroll;
    if (tab === "payroll-upload") return canUploadPayroll;
    if (tab === "access") return isRoleHR;
    return !isTechEd;
  };
  const [allEmployees, setAllEmployees] = useState([]);

  const [eligibilityEmployees, setEligibilityEmployees] = useState([]);
  const [eligibilityCycleId, setEligibilityCycleId] = useState("");
  const [eligibilityCriteriaApplied, setEligibilityCriteriaApplied] =
    useState(false);
  const [delegationGenerated, setDelegationGenerated] = useState(false);
  // Criteria saved by the last Apply Criteria + one history entry per Apply
  // (both come from the server, so they survive a reload).
  const [eligibilitySavedCriteria, setEligibilitySavedCriteria] = useState(null);
  const [eligibilityCriteriaHistory, setEligibilityCriteriaHistory] = useState([]);
  const [eligibilityBusy, setEligibilityBusy] = useState(false);
  // Full Employee Master (all pages). The Eligibility List starts empty for a
  // cycle, so the criteria panel and "Add An Employee" read from this list.
  const [eligibilityMasterEmployees, setEligibilityMasterEmployees] = useState(
    [],
  );
  const [eligibilityShowingSnapshot, setEligibilityShowingSnapshot] =
    useState(false);

  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  const [loading, setLoading] = useState(true);

  const [statusActionLoading, setStatusActionLoading] = useState(false);

  const initialTab = new URLSearchParams(window.location.search).get("tab");
  const allowedTabs = new Set(
    [
      "hr-dashboard",
      "roster",
      "eligibility",
      "appraisal-cycle",
      "location-master",
      "payroll-data",
      "feedback-rating",
      "payroll-upload",
      "team-changes",
      "change-mismatch",
      "budget-master",
      "budget-distribution",
      "delegation",
      "letters",
      "historical-import",
      "access",
      "designation-master",
    ].filter(isTabVisible),
  );
  // HR Operations opens on the HR Dashboard (when the user may see it).
  const defaultTab = allowedTabs.has("hr-dashboard")
    ? "hr-dashboard"
    : allowedTabs.has("access")
      ? "access"
      : allowedTabs.has("roster") || !allowedTabs.size
        ? "roster"
        : [...allowedTabs][0];
  const [activeTab, setActiveTab] = useState(
    isTechEd && !access.ok && initialTab !== "delegation"
      ? "roster"
      : allowedTabs.has(initialTab)
        ? initialTab
        : defaultTab,
  );
  const [uploadScreen, setUploadScreen] = useState("");
  const [uploadCycleId, setUploadCycleId] = useState("");

  useEffect(() => {
    if (activeTab !== "payroll-upload") {
      setUploadScreen("");
      setUploadCycleId("");
    }
  }, [activeTab]);

  // Every tab change is a history entry (?tab=...), so Back retraces the exact
  // order visited: e.g. Dashboard -> Access -> Budget Master  =>  Back: Access -> Dashboard.
  const goToTab = (tab) => {
    if (tab === "eligibility" || tab === "change-mismatch") {
      // Start the shared read at click time; the tab effect joins this request.
      void prefetchEligibilityEmployees();
    }
    const current = new URLSearchParams(window.location.search).get("tab");
    if (window.location.pathname === "/employee-master" && current !== tab) {
      window.history.pushState({}, "", `/employee-master?tab=${tab}`);
    }
    setActiveTab(tab);
  };

  // Landing on HR Operations without ?tab= (default = Access): record it in the
  // current history entry so it is a real step that Back returns to.
  useEffect(() => {
    if (window.location.pathname !== "/employee-master") return;
    const current = new URLSearchParams(window.location.search).get("tab");
    if (!current) {
      window.history.replaceState({}, "", `/employee-master?tab=${activeTab}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState("All");
  // One location shared by every screen (see location-store.js).
  const [locationFilter, setLocationFilter] = useSelectedLocation();

  const [rosterFilters, setRosterFilters] = useState({});

  const [eligibilitySearch, setEligibilitySearch] = useState("");

  const eligibilityLocationFilter = locationFilter;
  const setEligibilityLocationFilter = setLocationFilter;

  const [eligibilityFilters, setEligibilityFilters] = useState({});

  const [excludedEmployees, setExcludedEmployees] = useState([]);

  const [banner, setBanner] = useState(null);

  const [eligibilityEmployee, setEligibilityEmployee] = useState(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  const [previewChanges, setPreviewChanges] = useState([]);

  const [pendingImportType, setPendingImportType] = useState(null);

  const [previewWarnings, setPreviewWarnings] = useState([]);

  const [importPreparing, setImportPreparing] = useState(false);

  const [importSubmitting, setImportSubmitting] = useState(false);

  const importSubmittingRef = useRef(false);

  const [eligibilityReloadKey, setEligibilityReloadKey] = useState(0);

  const fileInputRef = useRef(null);

  const [currentPage, setCurrentPage] = useState(1);

  const [rosterPagination, setRosterPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    totalCount: 0,
    totalPages: 1,
  });

  const [rosterCounts, setRosterCounts] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const onPopState = () => {
      const tab = new URLSearchParams(window.location.search).get("tab");

      if (isTechEd && !access.ok && tab !== "delegation") {
        setActiveTab("roster");
        return;
      }

      setActiveTab(allowedTabs.has(tab) ? tab : defaultTab);
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [isTechEd, access.ok, defaultTab]);

  const eligibilityLoadedKeyRef = useRef(null);
  const eligibilityFreshAppliedRef = useRef(false);
  const eligibilityCacheScope = String(
    catalystUser?.email ||
      catalystUser?.id ||
      catalystUser?.user_id ||
      "anonymous",
  )
    .trim()
    .toLowerCase();
  const eligibilityCacheKey = eligibilitySnapshotKey(eligibilityCacheScope);
  const [currentAppraisalCycleName, setCurrentAppraisalCycleName] =
    useState("");

  useEffect(() => {
    // The Eligibility API response includes the authoritative Active cycle.
    // Avoid a second cycles request when Employee Master opens.
    const onCycleChange = () => {
      setCurrentAppraisalCycleName("");
      setEligibilityReloadKey((value) => value + 1);
      setRefreshKey((value) => value + 1);
    };
    window.addEventListener("appraisal:cycle-updated", onCycleChange);
    return () =>
      window.removeEventListener("appraisal:cycle-updated", onCycleChange);
  }, []);

  useEffect(() => {
    eligibilityFreshAppliedRef.current = false;
    setEligibilityShowingSnapshot(false);
  }, [eligibilityCacheKey]);

  useEffect(
    () =>
      onCatalystWrite(() => {
        // Any successful write makes the saved Eligibility List stale. The next
        // successful refresh writes a new snapshot.
        void clearEligibilitySnapshot(eligibilityCacheKey);
      }),
    [eligibilityCacheKey],
  );

  // Restore the last Eligibility List immediately from IndexedDB. The fresh
  // Catalyst response below always replaces this display-only snapshot.
  useEffect(() => {
    if (!eligibilityCacheScope || eligibilityFreshAppliedRef.current)
      return undefined;
    let cancelled = false;
    readEligibilitySnapshot(eligibilityCacheKey).then((snapshot) => {
      if (cancelled || !snapshot || eligibilityFreshAppliedRef.current) return;
      setEligibilityEmployees(snapshot.employees);
      setEligibilityMasterEmployees(snapshot.masterEmployees);
      setEligibilityCycleId(String(snapshot.cycleId || ""));
      setCurrentAppraisalCycleName(String(snapshot.cycleName || ""));
      setEligibilityCriteriaApplied(Boolean(snapshot.criteriaApplied));
      setEligibilityShowingSnapshot(true);
    });
    return () => {
      cancelled = true;
    };
  }, [eligibilityCacheKey, eligibilityCacheScope]);

  useEffect(() => {
    // Eligibility decisions and their audit trail belong to one cycle. Keep
    // Employee Master status history separate because it is global master data.
    setEligibilityAudit([]);
    setRemoteEligibilityAudit(null);
    setEligibilityAuditOpen(false);
  }, [currentAppraisalCycleName]);

  /* ============================================================
     SEPARATE AUDIT STATES
     ============================================================ */

  const [employeeMasterAudit, setEmployeeMasterAudit] = useState([]);

  const [eligibilityAudit, setEligibilityAudit] = useState([]);

  const [employeeMasterAuditOpen, setEmployeeMasterAuditOpen] = useState(false);

  const [eligibilityAuditOpen, setEligibilityAuditOpen] = useState(false);

  /* ============================================================
     AUDIT HELPERS
     ============================================================ */

  /*
   * Entries are shown immediately and also saved to the shared
   * Appraisal_Audit table (appraisalauditapi) so they survive a reload.
   * Entries whose save failed stay visible for this session only and are
   * flagged "(not saved)".
   */
  const [remoteEmployeeMasterAudit, setRemoteEmployeeMasterAudit] =
    useState(null);

  const [remoteEligibilityAudit, setRemoteEligibilityAudit] = useState(null);

  const [auditLoadError, setAuditLoadError] = useState("");

  const auditUserName = String(
    catalystUser?.name || catalystUser?.email || "Unknown user",
  );

  const recordAudit = (setLocal, source, entry) => {
    const now = new Date();

    const fullEntry = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`,
      ...entry,
      appraisalYear:
        source === AUDIT_SOURCE_ELIGIBILITY ? currentAppraisalCycleName : "",
      changedBy: auditUserName,
      changedAtIso: now.toISOString(),
      changedAt: formatAuditTime(now),
      source,
      saved: true,
    };

    setLocal((current) => [fullEntry, ...current]);

    postAuditEntries([fullEntry]).catch((error) => {
      console.error("Audit save failed:", error);

      setLocal((current) =>
        current.map((item) =>
          item.id === fullEntry.id
            ? {
                ...item,
                saved: false,
                newValue: `${item.newValue} (not saved)`,
              }
            : item,
        ),
      );
    });
  };

  const addEmployeeMasterAudit = ({
    empId,
    employeeName,
    oldValue,
    newValue,
    fieldName = "Status",
  }) => {
    const oldText = String(oldValue ?? "").trim();
    const newText = String(newValue ?? "").trim();

    if (oldText === newText) {
      return;
    }

    recordAudit(setEmployeeMasterAudit, AUDIT_SOURCE_STATUS, {
      empId: String(empId || "").trim(),
      employeeName: String(employeeName || "").trim(),
      fieldName,
      oldValue: oldText,
      newValue: newText,
    });
  };

  const addEligibilityAudit = ({ empId, employeeName, oldValue, newValue }) => {
    const oldText = String(oldValue ?? "").trim();
    const newText = String(newValue ?? "").trim();

    if (oldText === newText) {
      return;
    }

    recordAudit(setEligibilityAudit, AUDIT_SOURCE_ELIGIBILITY, {
      empId: String(empId || "").trim(),
      employeeName: String(employeeName || "").trim(),
      fieldName: "Eligibility",
      oldValue:
        oldText === "Yes"
          ? "Eligible"
          : oldText === "No"
            ? "Not Eligible"
            : oldText,
      newValue:
        newText === "Yes"
          ? "Eligible"
          : newText === "No"
            ? "Not Eligible"
            : newText,
    });
  };

  const openAuditHistory = async (kind) => {
    const isStatus = kind === "status";

    if (isStatus) {
      setEmployeeMasterAuditOpen(true);
    } else {
      setEligibilityAuditOpen(true);
    }

    setAuditLoadError("");

    try {
      const entries = await fetchAuditEntries(
        isStatus ? AUDIT_SOURCE_STATUS : AUDIT_SOURCE_ELIGIBILITY,
        isStatus ? "" : currentAppraisalCycleName,
      );

      if (isStatus) {
        setRemoteEmployeeMasterAudit(entries);
      } else {
        setRemoteEligibilityAudit(entries);
      }
    } catch (error) {
      setAuditLoadError(
        `Saved history could not be loaded (${
          error?.message || "unknown error"
        }). Showing this session's changes only.`,
      );
    }
  };

  // Saved history from the server plus any local entries that failed to save.
  const mergeAuditEntries = (remote, local) =>
    remote === null
      ? local
      : [...local.filter((entry) => entry.saved === false), ...remote];

  const showBanner = (title, body, error = false) => {
    setBanner({ title, body, error });
  };

  /* ============================================================
     LOAD ONLY CURRENT ROSTER PAGE
     ============================================================ */

  useEffect(() => {
    // EmployeeMaster is exposed to non-HR users only as the Delegation
    // screen. Never request the HR-only Employee Master roster for non-HR
    // roles, regardless of initial-tab timing or query-string navigation.
    if (!isRoleHR) {
      setAllEmployees([]);
      setRosterPagination({
        page: 1,
        limit: PAGE_SIZE,
        totalCount: 0,
        totalPages: 1,
      });
      setRosterCounts({ total: 0, active: 0, inactive: 0 });
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const result = await fetchEmployeeMasterEmployees({
          page: currentPage,
          limit: PAGE_SIZE,
          search,
          status:
            statusFilter === "All"
              ? "all"
              : String(statusFilter || "").toLowerCase(),
          location: locationFilter === "All" ? "" : locationFilter,
        });

        if (cancelled) {
          return;
        }

        const employees = Array.isArray(result?.data) ? result.data : [];

        setAllEmployees(employees);

        setRosterPagination({
          page:
            result?.pagination?.page !== undefined
              ? Number(result.pagination.page)
              : currentPage,
          limit:
            result?.pagination?.limit !== undefined
              ? Number(result.pagination.limit)
              : PAGE_SIZE,
          totalCount:
            result?.pagination?.totalCount !== undefined
              ? Number(result.pagination.totalCount)
              : employees.length,
          totalPages:
            result?.pagination?.totalPages !== undefined
              ? Number(result.pagination.totalPages)
              : 1,
        });

        setRosterCounts({
          total:
            result?.counts?.total !== undefined
              ? Number(result.counts.total)
              : employees.length,
          active:
            result?.counts?.active !== undefined
              ? Number(result.counts.active)
              : 0,
          inactive:
            result?.counts?.inactive !== undefined
              ? Number(result.counts.inactive)
              : 0,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setAllEmployees([]);

        setRosterPagination({
          page: 1,
          limit: PAGE_SIZE,
          totalCount: 0,
          totalPages: 1,
        });

        setRosterCounts({
          total: 0,
          active: 0,
          inactive: 0,
        });

        showBanner(
          "Employee data failed to load",
          error?.message || "Unable to load employee data from Catalyst.",
          true,
        );
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
  }, [currentPage, search, statusFilter, locationFilter, refreshKey, isRoleHR]);

  /* ============================================================
     RESET PAGE WHEN SEARCH / STATUS FILTER CHANGES
     ============================================================ */

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, locationFilter]);

  // Deep link from the Detail Screen's "View all changes" link.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "teamChanges" && isTabVisible("team-changes"))
      setActiveTab("team-changes");
    if (tab === "budget-master" && isTabVisible("budget-master"))
      setActiveTab("budget-master");
  }, []);

  /* ============================================================
     COUNTS
     ============================================================ */

  const counts = useMemo(() => {
    return {
      total: rosterCounts.total,
      active: rosterCounts.active,
      inactive: rosterCounts.inactive,
    };
  }, [rosterCounts]);

  /* ============================================================
     CURRENT PAGE ROSTER FILTERS
     ============================================================ */

  const filteredRosterEmployees = useMemo(() => {
    return allEmployees.filter((employee) => {
      return Object.entries(rosterFilters).every(([field, filter]) => {
        if (!filter) {
          return true;
        }

        if (typeof filter === "string" && filter.trim() === "") {
          return true;
        }

        const value = String(employee?.[field] || "").toLowerCase();

        if (typeof filter === "string") {
          return value.includes(filter.toLowerCase());
        }

        if (typeof filter === "object" && filter.value) {
          return value.includes(String(filter.value).toLowerCase());
        }

        return true;
      });
    });
  }, [allEmployees, rosterFilters]);

  const rosterTotalPages = Math.max(1, rosterPagination.totalPages);

  const rosterSafePage = Math.min(currentPage, rosterTotalPages);

  /* ============================================================
     LOAD ELIGIBILITY LIST
     ============================================================ */

  useEffect(() => {
    // Change List & Mismatch compares against this same list, so it reuses
    // this load (same fetch, same cache).
    if (activeTab !== "eligibility" && activeTab !== "change-mismatch") {
      return;
    }

    if (eligibilityLoadedKeyRef.current === "loaded") {
      return;
    }

    eligibilityLoadedKeyRef.current = "loaded";

    let cancelled = false;
    let finished = false;

    const loadEligibilityEmployees = async () => {
      try {
        setEligibilityLoading(true);

        // Keep the authoritative Active cycle ID returned by the API. Do not
        // rely on each mapped employee row to carry a correctly shaped FK.
        // The eligibility API already returns the complete cycle roster in one
        // response. Use a large client-side page size so we do not repeat the
        // same full Catalyst table scan once for every 100 employees.
        const firstPage = await fetchEligibilityEmployees({
          page: 1,
          limit: 100000,
          search: "",
        });
        if (cancelled) return;

        const loadedCycleId = String(firstPage?.cycle?.cycleId || "").trim();
        eligibilityFreshAppliedRef.current = true;
        setEligibilityShowingSnapshot(false);
        setCurrentAppraisalCycleName(
          String(firstPage?.cycle?.cycleName || "").trim(),
        );
        setEligibilityCycleId(loadedCycleId);
        setEligibilityCriteriaApplied(
          Boolean(firstPage?.cycle?.criteriaApplied),
        );
        applyCriteriaMeta(firstPage?.cycle);
        const freshEligibilityEmployees = Array.isArray(firstPage?.data)
          ? firstPage.data
          : [];
        const freshEligibilityMasterEmployees = Array.isArray(
          firstPage?.masterEmployees,
        )
          ? firstPage.masterEmployees
          : [];
        setEligibilityEmployees(freshEligibilityEmployees);
        setEligibilityMasterEmployees(freshEligibilityMasterEmployees);
        void writeEligibilitySnapshot(eligibilityCacheKey, {
          employees: freshEligibilityEmployees,
          masterEmployees: freshEligibilityMasterEmployees,
          cycleId: loadedCycleId,
          cycleName: String(firstPage?.cycle?.cycleName || "").trim(),
          criteriaApplied: Boolean(firstPage?.cycle?.criteriaApplied),
        });

        finished = true;
      } catch (error) {
        if (cancelled) {
          return;
        }

        // If the network refresh fails, keep the last saved snapshot visible
        // (read-only) rather than replacing useful rows with an empty screen.
        if (!eligibilityShowingSnapshot) {
          setEligibilityEmployees([]);
          setEligibilityMasterEmployees([]);
          setEligibilityCycleId("");
        }

        eligibilityLoadedKeyRef.current = null;

        showBanner(
          "Eligibility data failed to load",
          error?.message ||
            "Unable to load employees for the Eligibility List.",
          true,
        );
      } finally {
        if (!cancelled) {
          setEligibilityLoading(false);
        }
      }
    };

    loadEligibilityEmployees();

    return () => {
      cancelled = true;
      // Allow a retry if this load was interrupted before it finished.
      if (!finished && eligibilityLoadedKeyRef.current === "loaded") {
        eligibilityLoadedKeyRef.current = null;
      }
    };
  }, [activeTab, eligibilityReloadKey]);

  // Keep the saved criteria + their history (from the server) in state.
  const applyCriteriaMeta = (cycleMeta) => {
    setEligibilitySavedCriteria(cycleMeta?.criteria || null);
    setEligibilityCriteriaHistory(
      Array.isArray(cycleMeta?.criteriaHistory) ? cycleMeta.criteriaHistory : [],
    );
  };

  // One Audit-tab entry per Apply Criteria: who, when and what changed.
  const eligibilityCriteriaAuditEntries = useMemo(() => {
    const nameOf = (empId) => {
      const found = [...eligibilityMasterEmployees, ...eligibilityEmployees].find(
        (item) => normalizeEmpId(item.empId) === normalizeEmpId(empId),
      );
      return found?.name ? `${found.name} (${empId})` : empId;
    };
    const listText = (items, mapper = (v) => v) => items.map(mapper).join(", ");
    return eligibilityCriteriaHistory.map((entry) => {
      const stamp = entry.at ? formatAuditTime(String(entry.at).replace(" ", "T")) : "";
      const lines = [];
      if (entry.first) {
        const c = entry.criteria || {};
        if (c.departments?.length) lines.push(`Departments excluded: ${listText(c.departments)}`);
        if (c.designations?.length) lines.push(`Designations excluded: ${listText(c.designations)}`);
        if (c.excludedEmployees?.length)
          lines.push(`Employees excluded: ${listText(c.excludedEmployees, nameOf)}`);
        if (c.cutoffDate) lines.push(`Joining date cutoff: ${c.cutoffDate}`);
        if (!lines.length) lines.push("No exclusions selected.");
      } else if (!entry.changes?.length) {
        lines.push("No change to the criteria.");
      } else {
        entry.changes.forEach((change) => {
          if (change.field === "cutoffDate") {
            lines.push(
              `Joining date cutoff: ${change.from || "none"} → ${change.to || "none"}`,
            );
            return;
          }
          const mapper = change.field === "excludedEmployees" ? nameOf : (v) => v;
          if (change.added?.length)
            lines.push(`${change.label} excluded: + ${listText(change.added, mapper)}`);
          if (change.removed?.length)
            lines.push(`${change.label} no longer excluded: − ${listText(change.removed, mapper)}`);
        });
      }
      return {
        title: entry.first ? "Criteria applied" : "Criteria changed",
        meta: `${entry.by || "Unknown user"} · ${stamp}`,
        lines,
      };
    });
  }, [eligibilityCriteriaHistory, eligibilityMasterEmployees, eligibilityEmployees]);

  // Force the Eligibility List to reload from Catalyst on its next view.
  const invalidateEligibilityList = () => {
    eligibilityLoadedKeyRef.current = null;
    eligibilityFreshAppliedRef.current = false;
    setEligibilityShowingSnapshot(false);
    void clearEligibilitySnapshot(eligibilityCacheKey);
    setEligibilityCycleId("");
    setEligibilityCriteriaApplied(false);
    setEligibilityReloadKey((value) => value + 1);
  };

  // A cycle can be created/closed while HR Operations remains mounted. Clear
  // the retained ID and reload so eligibility writes cannot target an old cycle.
  useEffect(() => {
    const onCycleUpdated = () => {
      eligibilityLoadedKeyRef.current = null;
      eligibilityFreshAppliedRef.current = false;
      setEligibilityShowingSnapshot(false);
      void clearEligibilitySnapshot(eligibilityCacheKey);
      setEligibilityCycleId("");
      setEligibilityCriteriaApplied(false);
      setDelegationGenerated(false);
      setEligibilityEmployees([]);
      setEligibilityReloadKey((value) => value + 1);
    };
    window.addEventListener("appraisal:cycle-updated", onCycleUpdated);
    return () =>
      window.removeEventListener("appraisal:cycle-updated", onCycleUpdated);
  }, [eligibilityCacheKey]);

  /* ============================================================
     FILE READING
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

      const workbook = XLSX.read(buffer, { type: "array" });

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
     ROSTER IMPORT CHANGES
     ============================================================ */

  /*
   * existingEmployees must be the COMPLETE employee list (not the current
   * roster page), otherwise existing employees are treated as new.
   * Returns { changes, warnings }. Each change carries a readable
   * field-level diff list for the preview.
   */
  const buildRosterImportChanges = (rows, existingEmployees) => {
    const changes = [];
    const warnings = [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return { changes, warnings };
    }

    const existingById = new Map(
      existingEmployees.map((employee) => [
        normalizeEmpId(employee.empId),
        employee,
      ]),
    );

    const employeesByName = new Map();

    existingEmployees.forEach((employee) => {
      const key = String(employee.name || "")
        .trim()
        .toLowerCase();

      if (!key) {
        return;
      }

      employeesByName.set(key, [...(employeesByName.get(key) || []), employee]);
    });

    /* De-duplicate by normalized emp_id; the last row in the file wins. */
    const mappedById = new Map();
    const duplicateIds = new Set();
    let missingIdCount = 0;

    rows.forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }

      const mapped = {};

      Object.entries(row).forEach(([header, value]) => {
        const field = findFieldForHeader(header);

        if (field) {
          mapped[field.key] = String(value ?? "").trim();
        }
      });

      const importedEmpId = getImportedEmpId(row);

      if (importedEmpId) {
        mapped.empId = importedEmpId;
      }

      if (!mapped.empId) {
        if (Object.values(mapped).some((value) => value !== "")) {
          missingIdCount += 1;
        }

        return;
      }

      const key = normalizeEmpId(mapped.empId);

      if (mappedById.has(key)) {
        duplicateIds.add(mapped.empId);
      }

      mappedById.set(key, mapped);
    });

    if (duplicateIds.size > 0) {
      warnings.push(
        `Duplicate Emp IDs in file (last row used): ${[...duplicateIds].join(
          ", ",
        )}`,
      );
    }

    if (missingIdCount > 0) {
      warnings.push(`${missingIdCount} row(s) without an Emp ID were skipped.`);
    }

    const unresolvedAppraisers = [];

    mappedById.forEach((mapped, key) => {
      const existing = existingById.get(key);

      /* Bare appraiser names are resolved to "EMPxxxx - Name". */
      if (mapped.appraiser && !isCanonicalPersonValue(mapped.appraiser)) {
        const matches =
          employeesByName.get(mapped.appraiser.toLowerCase()) || [];

        if (matches.length === 1) {
          mapped.appraiser = `${matches[0].empId} - ${matches[0].name}`;
        } else {
          unresolvedAppraisers.push(
            `${mapped.empId} ("${mapped.appraiser}"${
              matches.length > 1 ? `, ${matches.length} matches` : ", no match"
            })`,
          );

          delete mapped.appraiser;
        }
      }

      const fields = {};
      const diffs = [];

      FIELD_DEFS.forEach((field) => {
        if (field.key === "empId") {
          return;
        }

        /* Only fields the backend can store are imported / previewed. */
        if (!ROSTER_FIELD_TO_CATALYST[field.key]) {
          return;
        }

        if (mapped[field.key] === undefined) {
          return;
        }

        let importedValue = String(mapped[field.key] || "").trim();

        if (importedValue === "") {
          return;
        }

        if (field.key === "status") {
          const lower = importedValue.toLowerCase();

          if (lower === "active" || lower === "inactive") {
            importedValue = lower === "active" ? "Active" : "Inactive";
          }
        }

        const existingValue = String(existing?.[field.key] ?? "").trim();

        if (!existing || existingValue !== importedValue) {
          fields[field.key] = importedValue;

          diffs.push({
            field: field.label,
            from: existing ? existingValue : "",
            to: importedValue,
          });
        }
      });

      if (!existing) {
        changes.push({
          empId: mapped.empId,
          name: mapped.name || "",
          fields,
          diffs,
          isNew: true,
        });

        return;
      }

      if (Object.keys(fields).length > 0) {
        changes.push({
          empId: existing.empId,
          name: mapped.name || existing.name || "",
          fields,
          diffs,
          isNew: false,
          previousStatus: existing.status,
        });
      }
    });

    if (unresolvedAppraisers.length > 0) {
      warnings.push(
        `Appraiser / Tech-ED not updated (name must match exactly one employee, or use "EMPxxxx - Name"): ${unresolvedAppraisers.join(
          "; ",
        )}`,
      );
    }

    return { changes, warnings };
  };

  /* ============================================================
     ELIGIBILITY IMPORT CHANGES
     ============================================================ */

  const buildEligibilityImportChanges = (rows, sourceEmployees) => {
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

        if (normalized === "eligible" || normalized === "eligibility") {
          eligibleValue = String(value || "").trim();
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
          reason = String(value || "").trim();
        }
      });

      const employee = sourceEmployees.find(
        (item) => normalizeEmpId(item.empId) === normalizeEmpId(empId),
      );

      if (!employee) {
        return;
      }

      const nextReason = reason !== "" ? reason : employee.eligibleReason || "";

      // Only eligible_status is stored in Catalyst; a reason-only
      // difference is not a change that can be saved.
      if (employee.eligible !== eligible) {
        const label = (value) =>
          value === "Yes" ? "Eligible" : "Not Eligible";

        changes.push({
          empId: employee.empId,
          name: employee.name,
          fields: {
            Eligible: eligible,
            Reason: nextReason,
          },
          diffs: [
            {
              field: "Eligibility",
              from: label(employee.eligible),
              to: label(eligible),
            },
          ],
        });
      }
    });

    return changes;
  };

  /* ============================================================
     FILE HANDLERS
     ============================================================ */

  const handleRosterFile = async (file) => {
    if (!canEditEmployees || importPreparing) {
      return;
    }

    try {
      setImportPreparing(true);

      const rows = await readFile(file);

      // Compare against the complete employee list, not the current page.
      const fullEmployees = await fetchAllEmployeeMasterEmployees();

      const { changes, warnings } = buildRosterImportChanges(
        rows,
        fullEmployees,
      );

      setPendingImportType("roster");
      setPreviewChanges(changes);
      setPreviewWarnings(warnings);
      setPreviewOpen(true);
    } catch (error) {
      showBanner(
        "Import failed",
        error?.message || "Unable to read the file.",
        true,
      );
    } finally {
      setImportPreparing(false);
    }
  };

  const handleEligibilityFile = async (file) => {
    if (!canEditEmployees) {
      return;
    }

    try {
      let sourceEmployees = eligibilityEmployees;

      if (sourceEmployees.length === 0) {
        setEligibilityLoading(true);

        const firstPage = await fetchEligibilityEmployees({
          page: 1,
          limit: 100,
          search: "",
        });

        sourceEmployees = Array.isArray(firstPage?.data) ? firstPage.data : [];

        const totalPages = Number(firstPage?.pagination?.totalPages) || 1;

        for (let page = 2; page <= totalPages; page += 1) {
          const result = await fetchEligibilityEmployees({
            page,
            limit: 100,
            search: "",
          });

          sourceEmployees = sourceEmployees.concat(
            Array.isArray(result?.data) ? result.data : [],
          );
        }

        setEligibilityEmployees(sourceEmployees);
        eligibilityLoadedKeyRef.current = "loaded";
        setEligibilityLoading(false);
      }

      const rows = await readFile(file);

      const changes = buildEligibilityImportChanges(rows, sourceEmployees);

      setPendingImportType("eligibility");
      setPreviewChanges(changes);
      setPreviewWarnings([
        "Eligibility reasons are shown for reference only and are not saved (no backend column).",
      ]);
      setPreviewOpen(true);
    } catch (error) {
      setEligibilityLoading(false);

      showBanner(
        "Import failed",
        error?.message || "Unable to read the file.",
        true,
      );
    }
  };

  /* ============================================================
     STATUS PERSISTENCE
     ============================================================ */

  const persistStatusChange = async (empId, nextStatus) => {
    const normalizedStatus = String(nextStatus || "").trim();

    if (normalizedStatus !== "Active" && normalizedStatus !== "Inactive") {
      throw new Error("Invalid employee status.");
    }

    return updateEmployeeMasterEmployee(empId, {
      status: normalizedStatus,
    });
  };

  /* ============================================================
     LOCAL STATUS UPDATE
     ============================================================ */

  const applyLocalStatusChanges = (successfulChanges) => {
    const statusMap = new Map(
      successfulChanges.map((change) => [
        normalizeEmpId(change.empId),
        change.status,
      ]),
    );

    const updateEmployee = (employee) => {
      const nextStatus = statusMap.get(normalizeEmpId(employee.empId));

      if (!nextStatus) {
        return employee;
      }

      return {
        ...employee,
        status: nextStatus,
      };
    };

    setAllEmployees((current) => current.map(updateEmployee));

    setEligibilityEmployees((current) => current.map(updateEmployee));

    setRosterCounts((current) => {
      let activeDelta = 0;

      successfulChanges.forEach((change) => {
        const previous = allEmployees.find(
          (employee) =>
            normalizeEmpId(employee.empId) === normalizeEmpId(change.empId),
        );

        if (!previous) {
          return;
        }

        if (previous.status === "Active" && change.status === "Inactive") {
          activeDelta -= 1;
        }

        if (previous.status === "Inactive" && change.status === "Active") {
          activeDelta += 1;
        }
      });

      return {
        ...current,
        active: current.active + activeDelta,
        inactive: current.inactive - activeDelta,
      };
    });

    invalidateEligibilityList();
  };

  /* ============================================================
     INDIVIDUAL ACTIVE / INACTIVE
     ============================================================ */

  const toggleEmployeeStatus = async (employee) => {
    if (!canEditEmployees || !employee?.empId) {
      return;
    }

    const oldStatus = employee.status;

    const nextStatus = employee.status === "Active" ? "Inactive" : "Active";

    try {
      setStatusActionLoading(true);

      await persistStatusChange(employee.empId, nextStatus);

      addEmployeeMasterAudit({
        empId: employee.empId,
        employeeName: employee.name,
        oldValue: oldStatus,
        newValue: nextStatus,
      });

      applyLocalStatusChanges([
        {
          empId: employee.empId,
          status: nextStatus,
        },
      ]);

      showBanner(
        "Status updated",
        `${employee.empId} is now ${nextStatus}. Saved to Catalyst.`,
      );
    } catch (error) {
      showBanner(
        "Status update failed",
        error?.message || "Unable to save employee status to Catalyst.",
        true,
      );
    } finally {
      setStatusActionLoading(false);
    }
  };

  /* ============================================================
     BULK ACTIVE / INACTIVE
     ============================================================ */

  const bulkUpdateEmployeeStatus = async (nextStatus, selectedEmployees) => {
    if (!canEditEmployees) {
      return;
    }

    if (!Array.isArray(selectedEmployees) || selectedEmployees.length === 0) {
      showBanner(
        "No employees selected",
        "Please select at least one employee before using Active or Inactive.",
        true,
      );
      return;
    }

    const normalizedStatus = String(nextStatus || "").trim();

    if (normalizedStatus !== "Active" && normalizedStatus !== "Inactive") {
      return;
    }

    const uniqueEmployees = Array.from(
      new Map(
        selectedEmployees
          .filter((employee) => employee?.empId)
          .map((employee) => [normalizeEmpId(employee.empId), employee]),
      ).values(),
    );

    const employeesToUpdate = uniqueEmployees.filter(
      (employee) => employee.status !== normalizedStatus,
    );

    if (employeesToUpdate.length === 0) {
      showBanner(
        "No status changes needed",
        `All selected employees are already ${normalizedStatus}.`,
      );
      return;
    }

    try {
      setStatusActionLoading(true);

      const results = await Promise.allSettled(
        employeesToUpdate.map(async (employee) => {
          const oldStatus = employee.status;

          await persistStatusChange(employee.empId, normalizedStatus);

          return {
            empId: employee.empId,
            employeeName: employee.name,
            oldStatus,
            status: normalizedStatus,
          };
        }),
      );

      const successfulChanges = [];
      let failedCount = 0;

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successfulChanges.push(result.value);

          addEmployeeMasterAudit({
            empId: result.value.empId,
            employeeName: result.value.employeeName,
            oldValue: result.value.oldStatus,
            newValue: result.value.status,
          });
        } else {
          failedCount += 1;

          console.error("Bulk status update failed:", result.reason);
        }
      });

      if (successfulChanges.length > 0) {
        applyLocalStatusChanges(successfulChanges);
      }

      if (failedCount > 0) {
        showBanner(
          "Bulk status partially completed",
          `${successfulChanges.length} employee(s) updated to ${normalizedStatus}. ${failedCount} employee(s) failed.`,
          true,
        );
      } else {
        showBanner(
          "Bulk status updated",
          `${successfulChanges.length} employee(s) are now ${normalizedStatus}. Changes saved to Catalyst.`,
        );
      }
    } catch (error) {
      showBanner(
        "Bulk status update failed",
        error?.message || "Unable to update employee status.",
        true,
      );
    } finally {
      setStatusActionLoading(false);
    }
  };

  /* ============================================================
     BULK EMPLOYEE MASTER FIELD CHANGE
     ============================================================ */

  const bulkUpdateEmployeeField = async (
    { field, value, remark = "" },
    selectedEmployees,
  ) => {
    if (!canEditEmployees) return;
    const fieldMap = {
      name: { column: "emp_name", label: "Employee Name" },
      designation: { column: "designation", label: "Designation" },
      dept: { column: "department", label: "Department" },
      reportingManager: { column: "repo_manager", label: "Reporting Manager" },
      director: { column: "director", label: "Director" },
      appraiser: { column: "appraiser_tech_ed", label: "Appraiser Tech-ED" },
      type: { column: "emp_type", label: "Employee Type" },
      email: { column: "email_id", label: "Email ID" },
      doj: { column: "date_of_join", label: "Date of Joining" },
      location: { column: "location", label: "Location" },
      costCenter: { column: "cost_center", label: "Cost Center" },
      orgExp: { column: "wissen_experience", label: "Wissen Experience" },
      totalExp: { column: "total_experience", label: "Total Experience" },
      currentSalary: { column: "current_salary", label: "Current Salary" },
      lastAppraisal: {
        column: "last_appraisal_month_year",
        label: "Last Appraisal Month/Year",
      },
    };
    const definition =
      field === "status"
        ? { column: "emp_status", label: "Employee Status" }
        : fieldMap[field];
    if (!definition) {
      showBanner(
        "Unsupported field",
        "This field is not available in Employee Master.",
        true,
      );
      return;
    }
    const nextValue = String(value ?? "").trim();
    if (!nextValue) {
      showBanner(
        "Value required",
        "Enter a value before applying the change.",
        true,
      );
      return;
    }
    if (field === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextValue)) {
      showBanner("Invalid email", "Enter a valid email address.", true);
      return;
    }
    if (
      ["orgExp", "totalExp", "currentSalary"].includes(field) &&
      (!Number.isFinite(Number(nextValue.replace(/[₹,%\s]/g, ""))) ||
        Number(nextValue.replace(/[₹,%\s]/g, "")) < 0)
    ) {
      showBanner(
        "Invalid number",
        `${definition.label} must be a valid non-negative number.`,
        true,
      );
      return;
    }
    const uniqueEmployees = Array.from(
      new Map(
        (Array.isArray(selectedEmployees) ? selectedEmployees : [])
          .filter((employee) => employee?.empId)
          .map((employee) => [normalizeEmpId(employee.empId), employee]),
      ).values(),
    );
    if (!uniqueEmployees.length) return;
    if (
      ["name", "email", "doj"].includes(field) &&
      uniqueEmployees.length > 1
    ) {
      showBanner(
        "Select one employee",
        `${definition.label} can only be changed for one employee at a time.`,
        true,
      );
      return;
    }
    const oldValueFor = (employee) =>
      field === "status"
        ? employee.status
        : {
            name: employee.name,
            designation: employee.designation,
            dept: employee.organization,
            reportingManager: employee.reportingManager,
            director: employee.compManager,
            appraiser: employee.appraiser,
            type: employee.rawEmployee?.emp_type,
            email: employee.rawEmployee?.email_id || employee.managerMail,
            doj: employee.doj,
            location: employee.location,
            costCenter: employee.rawEmployee?.cost_center,
            orgExp: employee.orgExp,
            totalExp: employee.totalExp,
            currentSalary: employee.rawEmployee?.current_salary,
            lastAppraisal: employee.lastAppraisal,
          }[field];
    const employeesToUpdate = uniqueEmployees.filter(
      (employee) => String(oldValueFor(employee) ?? "").trim() !== nextValue,
    );
    if (!employeesToUpdate.length) {
      showBanner(
        "No changes needed",
        "All selected employees already have this value.",
      );
      return;
    }
    try {
      setStatusActionLoading(true);
      const results = await Promise.allSettled(
        employeesToUpdate.map(async (employee) => {
          if (field === "status") {
            await persistStatusChange(employee.empId, nextValue);
          } else {
            await updateEmployeeMasterRecord(employee.empId, {
              [definition.column]:
                field === "doj" ? toIsoDate(nextValue) : nextValue,
            });
          }
          return {
            employee,
            oldValue: String(oldValueFor(employee) ?? ""),
            newValue: nextValue,
          };
        }),
      );
      const succeeded = [];
      let failed = 0;
      results.forEach((result) => {
        if (result.status !== "fulfilled") {
          failed += 1;
          console.error("Employee Master field change failed:", result.reason);
          return;
        }
        const { employee, oldValue, newValue } = result.value;
        succeeded.push({
          empId: employee.empId,
          status: field === "status" ? newValue : undefined,
        });
        addEmployeeMasterAudit({
          empId: employee.empId,
          employeeName: employee.name,
          oldValue,
          newValue,
          fieldName: definition.label,
        });
      });
      if (field === "status" && succeeded.length) {
        applyLocalStatusChanges(succeeded);
      } else if (succeeded.length) {
        setRefreshKey((current) => current + 1);
        refreshEmployees();
      }
      if (failed) {
        showBanner(
          "Change partially completed",
          `${succeeded.length} employee(s) updated. ${failed} failed. Check the error details and retry failed employees.`,
          true,
        );
      } else {
        showBanner(
          "Employee Master updated",
          `${definition.label} changed for ${succeeded.length} employee(s). Changes saved to Employee_Master.${remark ? ` Remark: ${remark}` : ""}`,
        );
      }
    } catch (error) {
      showBanner(
        "Employee Master change failed",
        error?.message || "Unable to update selected employees.",
        true,
      );
    } finally {
      setStatusActionLoading(false);
    }
  };

  /* ============================================================
     LOCAL ELIGIBILITY UPDATE
     ============================================================ */

  /*
   * manual = true only for genuine manual edits (modal / file import).
   * Criteria-driven changes must not set manualOverride, otherwise the
   * next Apply Criteria skips those rows.
   */
  const applyLocalEligibilityChanges = (
    successfulChanges,
    { manual = false } = {},
  ) => {
    const changeMap = new Map(
      successfulChanges.map((change) => [normalizeEmpId(change.empId), change]),
    );

    const updateEmployee = (employee) => {
      const change = changeMap.get(normalizeEmpId(employee.empId));

      if (!change) {
        return employee;
      }

      const nextEligible = change.fields?.Eligible === "Yes" ? "Yes" : "No";

      return {
        ...employee,
        eligible: nextEligible,
        eligibleStatus: nextEligible === "Yes" ? "Eligible" : "Not Eligible",
        eligibleReason: manual
          ? change.fields?.Reason || employee.eligibleReason || ""
          : change.fields?.Reason || "",
        manualOverride: manual ? true : Boolean(employee.manualOverride),
        status: employee.status,
      };
    };

    setEligibilityEmployees((current) => current.map(updateEmployee));

    setAllEmployees((current) => current.map(updateEmployee));
  };

  /* ============================================================
     SAVE ELIGIBILITY TO CATALYST
     ============================================================ */

  const persistEligibilityChange = async (change, source = "Manual") => {
    const eligible = change.fields?.Eligible === "Yes" ? "Yes" : "No";
    const eligibleReason = change.fields?.Reason || "";

    // Eligibility decisions are cycle-scoped in Eligibility_List. Resolve the
    // cycle from the loaded row rather than sending a cycle-less update (which
    // the backend correctly rejects and leaves every employee Pending).
    const employee = eligibilityEmployees.find(
      (item) => normalizeEmpId(item.empId) === normalizeEmpId(change.empId),
    );
    const cycleId = String(
      eligibilityCycleId ||
        employee?.appraisalCycleId ||
        employee?.rawEmployee?.appraisal_cycle_id ||
        employee?.rawEmployee?.appraisalCycleId ||
        "",
    ).trim();
    if (!cycleId) {
      throw new Error(
        `Could not identify the active appraisal cycle for ${change.empId}. Refresh the Eligibility List and try again.`,
      );
    }

    await updateEmployeeEligibility(
      change.empId,
      eligible,
      eligibleReason,
      cycleId,
      source,
    );

    return {
      empId: change.empId,
      name: change.name,
      fields: {
        Eligible: eligible,
        Reason: eligibleReason,
      },
    };
  };

  /* ============================================================
     CONFIRM IMPORT
     ============================================================ */

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewChanges([]);
    setPreviewWarnings([]);
    setPendingImportType(null);
  };

  /* In-flight guard: prevents double POSTs from repeated clicks. */
  const confirmImport = async () => {
    if (importSubmittingRef.current || !canEditEmployees) {
      return;
    }

    importSubmittingRef.current = true;
    setImportSubmitting(true);

    try {
      await runConfirmImport();
    } finally {
      importSubmittingRef.current = false;
      setImportSubmitting(false);
    }
  };

  const runConfirmImport = async () => {
    if (previewChanges.length === 0) {
      closePreview();

      showBanner("Nothing to import", "No changes were found in the file.");

      return;
    }

    if (pendingImportType === "eligibility") {
      try {
        const results = await Promise.allSettled(
          previewChanges.map(async (change) => {
            const oldEmployee = eligibilityEmployees.find(
              (employee) =>
                normalizeEmpId(employee.empId) === normalizeEmpId(change.empId),
            );

            const oldEligible = oldEmployee?.eligible;

            const result = await persistEligibilityChange(change);

            return {
              ...result,
              oldEligible,
            };
          }),
        );

        const successfulChanges = [];
        let failedCount = 0;

        results.forEach((result) => {
          if (result.status === "fulfilled") {
            successfulChanges.push(result.value);

            addEligibilityAudit({
              empId: result.value.empId,
              employeeName: result.value.name,
              oldValue: result.value.oldEligible,
              newValue: result.value.fields?.Eligible,
            });
          } else {
            failedCount += 1;

            console.error("Eligibility import update failed:", result.reason);
          }
        });

        if (successfulChanges.length > 0) {
          applyLocalEligibilityChanges(successfulChanges, { manual: true });
        }

        closePreview();

        if (failedCount > 0) {
          showBanner(
            "Eligibility import partially completed",
            `${successfulChanges.length} updated in Catalyst. ${failedCount} record(s) failed.`,
            true,
          );
        } else {
          showBanner(
            "Eligibility imported",
            `${successfulChanges.length} employee record(s) updated in Employees table. Active/Inactive status was not changed.`,
          );
        }
      } catch (error) {
        showBanner(
          "Eligibility import failed",
          error?.message || "Unable to update eligibility.",
          true,
        );
      }

      return;
    }

    /* ==========================================================
       ROSTER IMPORT
       ========================================================== */

    try {
      const records = previewChanges.map((change) => {
        const payload = {
          emp_id: change.empId,
        };

        Object.entries(change.fields || {}).forEach(([key, value]) => {
          const catalystField = ROSTER_FIELD_TO_CATALYST[key];

          if (catalystField) {
            payload[catalystField] = value;
          }
        });

        // Status is sent only when the file has a Status value. New rows
        // default to Active on the backend; existing rows keep their status.

        return payload;
      });

      const result = await createEmployeeMasterEmployees(records);

      /* Log status changes from roster import only when the
         employee already existed and its status was changed. */
      previewChanges.forEach((change) => {
        if (change.isNew) {
          return;
        }

        const importedStatus = change.fields?.status;

        if (!importedStatus) {
          return;
        }

        if (
          !change.previousStatus ||
          change.previousStatus === importedStatus
        ) {
          return;
        }

        addEmployeeMasterAudit({
          empId: change.empId,
          employeeName: change.name,
          oldValue: change.previousStatus,
          newValue: importedStatus,
        });
      });

      closePreview();

      setRefreshKey((value) => value + 1);

      invalidateEligibilityList();

      const created = result?.data?.created || 0;
      const updated = result?.data?.updated || 0;
      const skipped = result?.data?.skipped || 0;

      showBanner(
        "Employee import completed",
        `${created} created, ${updated} updated${
          skipped ? `, ${skipped} skipped` : ""
        } in Catalyst.`,
      );
    } catch (error) {
      showBanner(
        "Employee import failed",
        error?.message || "Unable to import employees to Catalyst.",
        true,
      );
    }
  };

  /* ============================================================
     ELIGIBILITY CRITERIA
     ============================================================ */

  const applyEligibilityCriteria = async ({
    departments,
    designations,
    excludedEmployees: excluded,
    cutoffDate,
    replaceCriteria = false,
  }) => {
    if (!canEditEmployees) {
      return;
    }

    // Full-screen loading screen (logo + percentage) while criteria are applied
    // and the list is reloaded.
    setEligibilityBusy(true);
    try {
      if (!eligibilityCycleId) {
        throw new Error(
          "The active appraisal cycle ID is missing. Reload the Eligibility List before applying criteria.",
        );
      }

      // The backend evaluates the Employee Master against the criteria and
      // adds only the employees who pass to this cycle's Eligibility List.
      // Employees excluded by the criteria are left out of the list.
      const result = await applyEligibilityCriteriaToCycle(eligibilityCycleId, {
        departments,
        designations,
        excludedEmployees: excluded,
        cutoffDate: toIsoDate(cutoffDate),
        replaceCriteria,
      });

      (result?.addedRows || []).forEach((row) =>
        addEligibilityAudit({
          empId: row.empId,
          employeeName: row.name,
          oldValue: "Not in list",
          newValue: "Eligible",
        }),
      );
      (result?.removedRows || []).forEach((row) =>
        addEligibilityAudit({
          empId: row.empId,
          employeeName: row.name,
          oldValue: "Eligible",
          newValue: "Removed by criteria",
        }),
      );

      setEligibilityCriteriaApplied(true);
      // Backend writes have completed. Retry the read so the new rows render
      // immediately, without requiring a browser refresh.
      try {
        await reloadEligibilityRows();
      } catch (refreshError) {
        console.error(
          "Eligibility saved; first list refresh failed:",
          refreshError,
        );
        await new Promise((resolve) => setTimeout(resolve, 400));
        try {
          await reloadEligibilityRows();
        } catch (retryError) {
          console.error("Eligibility list refresh retry failed:", retryError);
        }
      }
      showBanner(
        "Criteria applied",
        `${result?.evaluated ?? 0} employee(s) evaluated: ${result?.added ?? 0} added, ${result?.updated ?? 0} updated, and ${result?.excluded ?? 0} excluded by the criteria. Existing manual decisions were preserved.`,
      );
      return true;
    } catch (error) {
      // A network/response error can happen after Catalyst has committed the
      // writes. Re-read the authoritative cycle before showing a failure.
      try {
        const recovered = await fetchEligibilityEmployees({
          page: 1,
          limit: 100000,
          search: "",
          cycleId: eligibilityCycleId,
        });
        if (!replaceCriteria && recovered?.cycle?.criteriaApplied) {
          setEligibilityEmployees(
            Array.isArray(recovered.data) ? recovered.data : [],
          );
          setEligibilityCriteriaApplied(true);
          applyCriteriaMeta(recovered?.cycle);
          showBanner(
            "Criteria applied",
            "The eligibility list was saved successfully and has been loaded on screen.",
          );
          return true;
        }
      } catch (recoveryError) {
        console.error(
          "Unable to verify eligibility after apply response error:",
          recoveryError,
        );
      }
      showBanner(
        "Criteria update failed",
        error?.message || "Unable to apply eligibility criteria.",
        true,
      );
      return false;
    } finally {
      setEligibilityBusy(false);
    }
  };

  // Re-read the active cycle's Eligibility List from Catalyst.
  const reloadEligibilityRows = async () => {
    const reloaded = await fetchEligibilityEmployees({
      page: 1,
      limit: 100000,
      search: "",
      cycleId: eligibilityCycleId,
    });
    const employees = Array.isArray(reloaded?.data) ? reloaded.data : [];
    const criteriaApplied = Boolean(reloaded?.cycle?.criteriaApplied);
    setEligibilityEmployees(employees);
    setEligibilityCriteriaApplied(criteriaApplied);
    applyCriteriaMeta(reloaded?.cycle);
    setEligibilityShowingSnapshot(false);
    eligibilityFreshAppliedRef.current = true;
    void writeEligibilitySnapshot(eligibilityCacheKey, {
      employees,
      masterEmployees: eligibilityMasterEmployees,
      cycleId: eligibilityCycleId,
      cycleName: String(
        reloaded?.cycle?.cycleName || currentAppraisalCycleName || "",
      ),
      criteriaApplied,
    });
  };

  // Used by Change List & Mismatch to stay current without a page refresh:
  // quietly re-reads the Eligibility List and the full Employee Master.
  const refreshChangeListData = async () => {
    if (!eligibilityCycleId || eligibilityLoading) return;
    const [reloaded, masters] = await Promise.all([
      fetchEligibilityEmployees({
        page: 1,
        limit: 100000,
        search: "",
        cycleId: eligibilityCycleId,
      }),
      fetchAllEmployeeMasterEmployees(),
    ]);
    const employees = Array.isArray(reloaded?.data) ? reloaded.data : [];
    const masterEmployees = Array.isArray(masters) ? masters : [];
    const criteriaApplied = Boolean(reloaded?.cycle?.criteriaApplied);
    setEligibilityEmployees(employees);
    setEligibilityCriteriaApplied(criteriaApplied);
    applyCriteriaMeta(reloaded?.cycle);
    setEligibilityMasterEmployees(masterEmployees);
    setEligibilityShowingSnapshot(false);
    eligibilityFreshAppliedRef.current = true;
    void writeEligibilitySnapshot(eligibilityCacheKey, {
      employees,
      masterEmployees,
      cycleId: eligibilityCycleId,
      cycleName: String(
        reloaded?.cycle?.cycleName || currentAppraisalCycleName || "",
      ),
      criteriaApplied,
    });
  };

  const generateDelegationFromEligibility = async () => {
    if (!canEditEmployees || !eligibilityCycleId || !eligibilityCriteriaApplied)
      return;
    setEligibilityBusy(true);
    try {
      const response = await catalystFetch(
        catalystFunctionUrl("accessapi") + "delegation/fill",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ cycleId: eligibilityCycleId, replace: true }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false || payload.success === false) {
        throw new Error(
          payload.error || payload.message || "Delegation generation failed.",
        );
      }
      setDelegationGenerated(true);
      window.dispatchEvent(
        new CustomEvent("appraisal:delegation-generated", {
          detail: { cycleId: eligibilityCycleId },
        }),
      );
      goToTab("delegation");
    } catch (error) {
      showBanner(
        "Delegation generation failed",
        error?.message || "Please try again.",
        true,
      );
    } finally {
      setEligibilityBusy(false);
    }
  };

  /* ============================================================
     ADD AN EMPLOYEE (manual inclusion in the Eligibility List)
     ============================================================ */

  const addEmployeeToEligibility = async ({ empId, eligibleReason }) => {
    if (!canEditEmployees) {
      throw new Error(
        "You do not have permission to change the Eligibility List.",
      );
    }
    if (!eligibilityCycleId) {
      throw new Error(
        "Could not identify the active appraisal cycle. Refresh the Eligibility List and try again.",
      );
    }

    const master = eligibilityMasterEmployees.find(
      (employee) => normalizeEmpId(employee.empId) === normalizeEmpId(empId),
    );

    await updateEmployeeEligibility(
      empId,
      "Yes",
      eligibleReason || "",
      eligibilityCycleId,
      "Manual",
    );

    addEligibilityAudit({
      empId,
      employeeName: master?.name || "",
      oldValue: "Not in list",
      newValue: "Eligible",
    });

    try {
      await reloadEligibilityRows();
    } catch (reloadError) {
      console.error("Eligibility reload after add failed:", reloadError);
    }

    showBanner(
      "Employee added",
      `${empId} was added to the Eligibility List as Eligible.`,
    );
  };

  /* ============================================================
     SAVE INDIVIDUAL ELIGIBILITY
     ============================================================ */

  const saveEligibility = async ({ empId, eligible, eligibleReason }) => {
    if (!canEditEmployees) {
      return;
    }

    try {
      const normalizedEligible = eligible === "Yes" ? "Yes" : "No";

      const existingEmployee = eligibilityEmployees.find(
        (employee) => normalizeEmpId(employee.empId) === normalizeEmpId(empId),
      );

      const oldEligible = existingEmployee?.eligible;

      const selectedEligibilityCycleId = String(
        eligibilityCycleId ||
          existingEmployee?.appraisalCycleId ||
          existingEmployee?.rawEmployee?.appraisal_cycle_id ||
          existingEmployee?.rawEmployee?.appraisalCycleId ||
          "",
      ).trim();
      if (!selectedEligibilityCycleId) {
        throw new Error(
          "Could not identify the selected appraisal cycle. Refresh the Eligibility List and try again.",
        );
      }

      await updateEmployeeEligibility(
        empId,
        normalizedEligible,
        eligibleReason || "",
        selectedEligibilityCycleId,
      );

      addEligibilityAudit({
        empId,
        employeeName: existingEmployee?.name || "",
        oldValue: oldEligible,
        newValue: normalizedEligible,
      });

      applyLocalEligibilityChanges(
        [
          {
            empId,
            fields: {
              Eligible: normalizedEligible,
              Reason: eligibleReason || "",
            },
          },
        ],
        { manual: true },
      );

      setEligibilityEmployee(null);

      showBanner(
        "Eligibility updated",
        `${empId} is now ${
          normalizedEligible === "Yes" ? "Eligible" : "Not Eligible"
        }. Saved to Employees table. Active/Inactive status was not changed.`,
      );
    } catch (error) {
      showBanner(
        "Eligibility update failed",
        error?.message || "Unable to save eligibility to Catalyst.",
        true,
      );
    }
  };

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <AppShell>
      <div className="employee-master-page">
        {/* ======================================================
            TABS
            ====================================================== */}

        {!isTechEd && (
          <HrOperationsNav
            activeTab={activeTab}
            isTabVisible={isTabVisible}
            onSelect={goToTab}
          />
        )}

        {/* ======================================================
            BANNER
            ====================================================== */}

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

        {/* ======================================================
            EMPLOYEE MASTER TAB
            ====================================================== */}

        {isTabVisible("roster") && activeTab === "roster" && (
          <div className="em-tab-content">
            <EmployeeMasterToolbar
              search={search}
              setSearch={setSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              locationFilter={locationFilter}
              setLocationFilter={setLocationFilter}
              onDownloadTemplate={downloadRosterTemplate}
              onUpload={
                canEditEmployees && !importPreparing
                  ? () => fileInputRef.current?.click()
                  : undefined
              }
              onDownloadData={() => downloadRosterData(filteredRosterEmployees)}
              onAuditHistory={
                access.canAction("viewAudit")
                  ? () => openAuditHistory("status")
                  : undefined
              }
            />

            {importPreparing && (
              <div className="em-empty">
                Reading file and loading all employees for comparison...
              </div>
            )}

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

                event.target.value = "";
              }}
            />

            {loading ? (
              <div className="em-empty">Loading employees...</div>
            ) : (
              <EmployeeRosterTable
                rows={filteredRosterEmployees}
                filters={rosterFilters}
                setFilters={setRosterFilters}
                currentPage={rosterSafePage}
                setCurrentPage={setCurrentPage}
                totalPages={rosterTotalPages}
                totalCount={rosterPagination.totalCount}
                onToggleStatus={toggleEmployeeStatus}
                onBulkStatusChange={bulkUpdateEmployeeStatus}
                onBulkFieldChange={bulkUpdateEmployeeField}
                bulkStatusUpdating={statusActionLoading}
                canEdit={canEditEmployees}
              />
            )}
          </div>
        )}

        {/* ======================================================
            ELIGIBILITY TAB
            ====================================================== */}

        {isTabVisible("eligibility") && activeTab === "eligibility" && (
          <div className="em-tab-content">
            {eligibilityLoading && !eligibilityShowingSnapshot ? (
              <div className="em-empty">
                Loading all employees for Eligibility List...
              </div>
            ) : (
              <div
                className="em-eligibility-layout"
                style={
                  canEditEmployees
                    ? undefined
                    : { gridTemplateColumns: "minmax(0, 1fr)" }
                }
              >
                {canEditEmployees && (
                  <EligibilityCriteria
                    employees={
                      eligibilityMasterEmployees.length
                        ? eligibilityMasterEmployees
                        : eligibilityEmployees
                    }
                    excludedEmployees={excludedEmployees}
                    setExcludedEmployees={setExcludedEmployees}
                    onApply={applyEligibilityCriteria}
                    savedCriteria={eligibilitySavedCriteria}
                    onGenerateDelegation={
                      eligibilityShowingSnapshot
                        ? undefined
                        : generateDelegationFromEligibility
                    }
                    criteriaApplied={eligibilityCriteriaApplied}
                    delegationGenerated={delegationGenerated}
                    readOnly={!eligibilityCycleId || eligibilityShowingSnapshot}
                  />
                )}

                <EligibilityList
                  employees={eligibilityEmployees}
                  search={eligibilitySearch}
                  setSearch={setEligibilitySearch}
                  locationFilter={eligibilityLocationFilter}
                  setLocationFilter={setEligibilityLocationFilter}
                  filters={eligibilityFilters}
                  setFilters={setEligibilityFilters}
                  onChangeEligibility={
                    canEditEmployees && !eligibilityShowingSnapshot
                      ? setEligibilityEmployee
                      : undefined
                  }
                  onAddEmployee={
                    canEditEmployees && !eligibilityShowingSnapshot
                      ? addEmployeeToEligibility
                      : undefined
                  }
                  masterEmployees={eligibilityMasterEmployees}
                  onDownloadTemplate={downloadEligibilityTemplate}
                  onImport={
                    canEditEmployees && !eligibilityShowingSnapshot
                      ? handleEligibilityFile
                      : undefined
                  }
                  onExport={exportEligibilityData}
                  onAuditHistory={
                    access.canAction("viewAudit")
                      ? () => openAuditHistory("eligibility")
                      : undefined
                  }
                  criteriaApplied={eligibilityCriteriaApplied}
                  auditEntries={eligibilityCriteriaAuditEntries}
                  onGenerateDelegation={
                    eligibilityShowingSnapshot
                      ? undefined
                      : generateDelegationFromEligibility
                  }
                  delegationGenerated={delegationGenerated}
                />
              </div>
            )}
          </div>
        )}

        {/* ======================================================
            APPRAISAL CYCLE MASTER
            NO AUDIT HISTORY HERE
            ====================================================== */}

        {isTabVisible("appraisal-cycle") && activeTab === "appraisal-cycle" && (
          <div className="em-tab-content">
            <HrConfigPage
              canEdit={isRoleHR}
              renderCycleScreen={(defaultProcess) => (
                <AppraisalCycleMasterPage
                  defaultProcess={defaultProcess}
                  cycleStats={null}
                  onGenerateSheet={async (cycle) => {
                    const result = await generateAppraisalSheet(cycle.id);
                    await refreshEmployees();
                    return result;
                  }}
                  canNavigate={(tab) =>
                    tab === "appraisal-sheet"
                      ? access.canScreen("appraisalSheet")
                      : KNOWN_TABS.includes(tab) && isTabVisible(tab)
                  }
                  onNavigate={(tab, requestedUploadScreen, cycle) => {
                    if (tab === "appraisal-sheet") {
                      window.location.assign("/sheet");
                      return;
                    }
                    if (tab === "payroll-upload") {
                      setUploadScreen(requestedUploadScreen || "");
                      setUploadCycleId(String(cycle?.id || ""));
                    }
                    if (KNOWN_TABS.includes(tab) && isTabVisible(tab)) {
                      goToTab(tab);
                      return;
                    }
                    showBanner(
                      "Not connected",
                      "That screen is not available here yet.",
                      true,
                    );
                  }}
                />
              )}
            />
          </div>
        )}

        {isTabVisible("location-master") && activeTab === "location-master" && (
          <div className="em-tab-content">
            <LocationMasterControl
              managerOnly
              readOnly={!canEditScreen("locationMaster")}
            />
          </div>
        )}

        {/* ======================================================
            PAYROLL DATA
            ====================================================== */}

        {isTabVisible("payroll-data") && activeTab === "payroll-data" && (
          <div className="em-tab-content">
            <PayrollDataPage />
          </div>
        )}

        {/* ======================================================
            HISTORICAL IMPORT (HR only)
            ====================================================== */}

        {isTabVisible("historical-import") &&
          activeTab === "historical-import" && (
            <div className="em-tab-content">
              <HistoricalImportPage
                readOnly={!canEditScreen("historicalImport")}
              />
            </div>
          )}

        {/* ======================================================
            Feedback rating
            ====================================================== */}

        {isTabVisible("feedback-rating") && activeTab === "feedback-rating" && (
          <div className="em-tab-content">
            <FeedbackRatingMasterContainer />
          </div>
        )}

        {/* ======================================================
            PAYROLL UPLOAD
            ====================================================== */}

        {isTabVisible("payroll-upload") && activeTab === "payroll-upload" && (
          <div
            className="em-tab-content"
            style={{
              height: "calc(100vh - 140px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <UploadPage
              key={`${uploadCycleId}:${uploadScreen}`}
              initialCycleId={uploadCycleId}
              initialScreen={uploadScreen}
            />
          </div>
        )}
        {isTabVisible("team-changes") && activeTab === "team-changes" && (
          <TeamChangesPage />
        )}
        {isTabVisible("change-mismatch") && activeTab === "change-mismatch" && (
          <div className="em-tab-content">
            <ChangeListMismatchPage
              employees={eligibilityMasterEmployees}
              eligibilityEmployees={eligibilityEmployees}
              canEdit={canEditEmployees && canEditScreen("changeMismatch")}
              onNavigate={goToTab}
              onRefresh={refreshChangeListData}
            />
          </div>
        )}
        {isTabVisible("budget-master") && activeTab === "budget-master" && (
          <div
            className="em-tab-content"
            style={{
              height: "calc(100vh - 140px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <BudgetMasterPage />
          </div>
        )}

        {isTabVisible("budget-distribution") &&
          activeTab === "budget-distribution" && (
            <div
              className="em-tab-content"
              style={{
                height: "calc(100vh - 140px)",
                overflowY: "auto",
                overflowX: "hidden",
              }}
            >
              <BudgetDistributionPage />
            </div>
          )}
        {isTabVisible("delegation") && activeTab === "delegation" && (
          <div
            className="em-tab-content"
            style={{
              height: "calc(100vh - 140px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <DelegationScreen showRoleSwitch={false} />
          </div>
        )}
        {isTabVisible("letters") && activeTab === "letters" && (
          <div
            className="em-tab-content"
            style={{
              height: "calc(100vh - 140px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            <LettersPage
              canEdit={canEditScreen("letters")}
              onNavigate={goToTab}
            />
          </div>
        )}
        {isTabVisible("hr-dashboard") && activeTab === "hr-dashboard" && (
          <div className="em-tab-content">
            <HrDashboardPage />
          </div>
        )}
        {isTabVisible("access") && activeTab === "access" && (
          <div className="em-tab-content">
            <AccessPage />
          </div>
        )}
        {isTabVisible("designation-master") &&
          activeTab === "designation-master" && (
            <div className="em-tab-content">
              <DesignationMasterPage
                readOnly={!canEditScreen("designationMaster")}
              />
            </div>
          )}

        {/* ======================================================
            ELIGIBILITY MODAL
            ====================================================== */}

        <EligibilityModal
          employee={eligibilityEmployee}
          onClose={() => setEligibilityEmployee(null)}
          onSave={saveEligibility}
        />

        {/* ======================================================
            IMPORT PREVIEW
            ====================================================== */}

        <ImportPreviewModal
          open={previewOpen}
          title={
            pendingImportType === "eligibility"
              ? "Eligibility Import Preview"
              : "Employee Import Preview"
          }
          changes={previewChanges}
          warnings={previewWarnings}
          submitting={importSubmitting}
          onCancel={closePreview}
          onConfirm={confirmImport}
        />

        {/* ======================================================
            EMPLOYEE MASTER AUDIT HISTORY
            ====================================================== */}

        <ProcessingOverlay open={eligibilityBusy} />
        <AuditHistoryPanel
          open={employeeMasterAuditOpen}
          title="Employee Master Audit History"
          description={
            auditLoadError ||
            "Active / Inactive status changes only (saved to the Appraisal audit log)."
          }
          entries={mergeAuditEntries(
            remoteEmployeeMasterAudit,
            employeeMasterAudit,
          )}
          onClose={() => setEmployeeMasterAuditOpen(false)}
        />

        {/* ======================================================
            ELIGIBILITY AUDIT HISTORY
            ====================================================== */}

        <AuditHistoryPanel
          open={eligibilityAuditOpen}
          title="Eligibility Audit History"
          description={
            auditLoadError ||
            "Eligible / Not Eligible changes only (saved to the Appraisal audit log)."
          }
          entries={mergeAuditEntries(remoteEligibilityAudit, eligibilityAudit)}
          onClose={() => setEligibilityAuditOpen(false)}
        />
      </div>
    </AppShell>
  );
}