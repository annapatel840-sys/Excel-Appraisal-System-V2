// // import { useEffect, useMemo } from "react";
// // import { ChevronLeft, ChevronRight } from "lucide-react";

// // import { ColumnFilter } from "./ColumnFilter";
// // import { calcOrgExperience, fmtDoj } from "@/lib/employee-master-utils";

// // const COLUMNS = [
// //   {
// //     key: "name",
// //     label: "Employee",
// //     type: "text",
// //     get: (employee) => `${employee.name} ${employee.empId}`,
// //   },
// //   {
// //     key: "status",
// //     label: "Status",
// //     type: "select",
// //     get: (employee) => employee.status || "",
// //   },
// //   {
// //     key: "designation",
// //     label: "Designation",
// //     type: "select",
// //     get: (employee) => employee.designation || "",
// //   },
// //   {
// //     key: "organization",
// //     label: "Organization",
// //     type: "select",
// //     get: (employee) => employee.organization || "",
// //   },
// //   {
// //     key: "doj",
// //     label: "Date of Joining",
// //     type: "text",
// //     get: (employee) => fmtDoj(employee.doj),
// //   },
// //   {
// //     key: "orgExp",
// //     label: "Org. Exp (as on 1 Jan)",
// //     type: "text",
// //     get: (employee) => calcOrgExperience(employee.doj),
// //   },
// //   {
// //     key: "totalExp",
// //     label: "Total Exp (as on 1 Jan)",
// //     type: "text",
// //     get: (employee) => employee.totalExp || "",
// //   },
// //   {
// //     key: "reportingManager",
// //     label: "Reporting Manager",
// //     type: "select",
// //     get: (employee) => employee.reportingManager || "",
// //   },
// //   {
// //     key: "compManager",
// //     label: "Comp. Manager",
// //     type: "select",
// //     get: (employee) => employee.compManager || "",
// //   },
// //   {
// //     key: "superManager",
// //     label: "Super Manager",
// //     type: "select",
// //     get: (employee) => employee.superManager || "",
// //   },
// //   {
// //     key: "appraiser",
// //     label: "Appraiser / Super Manager",
// //     type: "select",
// //     get: (employee) => employee.appraiser || "",
// //   },
// //   {
// //     key: "managerMail",
// //     label: "Manager Email ID",
// //     type: "text",
// //     get: (employee) => employee.managerMail || "",
// //   },
// //   {
// //     key: "superManagerMail",
// //     label: "Super Manager Email ID",
// //     type: "text",
// //     get: (employee) => employee.superManagerMail || "",
// //   },
// // ];

// // const PAGE_SIZE = 20;

// // export function EmployeeRosterTable({
// //   rows,
// //   filters,
// //   setFilters,
// //   currentPage = 1,
// //   setCurrentPage,
// //   totalPages = 1,
// //   totalCount = 0,
// //   loading = false,
// //   onToggleStatus,
// //   onBulkStatusChange,
// //   statusUpdatingIds = new Set(),
// //   bulkStatusUpdating = false,
// // }) {
// //   const filteredRows = useMemo(() => {
// //     return rows.filter((employee) =>
// //       COLUMNS.every((column) => {
// //         const filter = filters[column.key];

// //         if (!filter) {
// //           return true;
// //         }

// //         const rawValue = column.get?.(employee) ?? "";
// //         const value = String(rawValue).toLowerCase();

// //         if (filter.type === "text") {
// //           return value.includes(String(filter.term || "").toLowerCase());
// //         }

// //         return filter.values.has(rawValue);
// //       }),
// //     );
// //   }, [rows, filters]);

// //   const safePage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));

// //   useEffect(() => {
// //     if (currentPage !== safePage && setCurrentPage) {
// //       setCurrentPage(safePage);
// //     }
// //   }, [currentPage, safePage, setCurrentPage]);

// //   const startRecord = totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;

// //   const endRecord =
// //     totalCount === 0 ? 0 : Math.min(safePage * PAGE_SIZE, totalCount);

// //   const goToPage = (page) => {
// //     if (!setCurrentPage) {
// //       return;
// //     }

// //     const nextPage = Math.min(Math.max(1, page), Math.max(1, totalPages));

// //     if (nextPage !== safePage) {
// //       setCurrentPage(nextPage);
// //     }
// //   };

// //   const handleBulkStatus = async (status) => {
// //     if (!onBulkStatusChange || !filteredRows.length) {
// //       return;
// //     }

// //     await onBulkStatusChange(status, filteredRows);
// //   };

// //   return (
// //     <div className="em-roster-container">
// //       <div className="em-grid-wrap">
// //         <table className="em-table">
// //           <thead>
// //             <tr>
// //               {COLUMNS.map((column) => (
// //                 <th key={column.key}>
// //                   <div className="em-th-inner">
// //                     <span>{column.label}</span>

// //                     <ColumnFilter
// //                       column={column}
// //                       rows={rows}
// //                       value={filters[column.key]}
// //                       onChange={(value) =>
// //                         setFilters((current) => {
// //                           const next = {
// //                             ...current,
// //                           };

// //                           if (!value) {
// //                             delete next[column.key];
// //                           } else {
// //                             next[column.key] = value;
// //                           }

// //                           return next;
// //                         })
// //                       }
// //                     />
// //                   </div>
// //                 </th>
// //               ))}

// //               {/* ACTION HEADER */}
// //               <th
// //                 className="em-action-header"
// //                 style={{
// //                   minWidth: "155px",
// //                   width: "155px",
// //                   padding: "8px 10px",
// //                   borderLeft: "1px solid rgba(0,0,0,0.08)",
// //                   borderRight: "1px solid rgba(0,0,0,0.08)",
// //                   whiteSpace: "nowrap",
// //                   verticalAlign: "middle",
// //                 }}
// //               >
// //                 <div
// //                   style={{
// //                     display: "flex",
// //                     flexDirection: "column",
// //                     alignItems: "center",
// //                     justifyContent: "center",
// //                     gap: "7px",
// //                     width: "100%",
// //                   }}
// //                 >
// //                   <span
// //                     style={{
// //                       fontWeight: 600,
// //                       fontSize: "13px",
// //                       lineHeight: "16px",
// //                     }}
// //                   >
// //                     Action
// //                   </span>

// //                   <div
// //                     style={{
// //                       display: "flex",
// //                       alignItems: "center",
// //                       justifyContent: "center",
// //                       gap: "5px",
// //                       width: "100%",
// //                     }}
// //                   >
// //                     <button
// //                       type="button"
// //                       disabled={
// //                         loading ||
// //                         bulkStatusUpdating ||
// //                         filteredRows.length === 0
// //                       }
// //                       onClick={() => handleBulkStatus("Active")}
// //                       title="Set Active for employees on the current page"
// //                       style={{
// //                         border: "1px solid #cbd5e1",
// //                         borderRadius: "5px",
// //                         background: "#ffffff",
// //                         color: "#166534",
// //                         padding: "4px 7px",
// //                         fontSize: "11px",
// //                         fontWeight: 600,
// //                         lineHeight: "14px",
// //                         cursor:
// //                           loading ||
// //                           bulkStatusUpdating ||
// //                           filteredRows.length === 0
// //                             ? "not-allowed"
// //                             : "pointer",
// //                         opacity:
// //                           loading ||
// //                           bulkStatusUpdating ||
// //                           filteredRows.length === 0
// //                             ? 0.5
// //                             : 1,
// //                       }}
// //                     >
// //                       Active
// //                     </button>

// //                     <button
// //                       type="button"
// //                       disabled={
// //                         loading ||
// //                         bulkStatusUpdating ||
// //                         filteredRows.length === 0
// //                       }
// //                       onClick={() => handleBulkStatus("Inactive")}
// //                       title="Set Inactive for employees on the current page"
// //                       style={{
// //                         border: "1px solid #cbd5e1",
// //                         borderRadius: "5px",
// //                         background: "#ffffff",
// //                         color: "#991b1b",
// //                         padding: "4px 7px",
// //                         fontSize: "11px",
// //                         fontWeight: 600,
// //                         lineHeight: "14px",
// //                         cursor:
// //                           loading ||
// //                           bulkStatusUpdating ||
// //                           filteredRows.length === 0
// //                             ? "not-allowed"
// //                             : "pointer",
// //                         opacity:
// //                           loading ||
// //                           bulkStatusUpdating ||
// //                           filteredRows.length === 0
// //                             ? 0.5
// //                             : 1,
// //                       }}
// //                     >
// //                       Inactive
// //                     </button>
// //                   </div>
// //                 </div>
// //               </th>
// //             </tr>
// //           </thead>

// //           <tbody>
// //             {loading ? (
// //               <tr>
// //                 <td colSpan={COLUMNS.length + 1} className="em-empty">
// //                   Loading employees...
// //                 </td>
// //               </tr>
// //             ) : (
// //               filteredRows.map((employee) => {
// //                 const employeeId = String(employee.empId || "").trim();
// //                 const isUpdating =
// //                   statusUpdatingIds instanceof Set &&
// //                   statusUpdatingIds.has(employeeId);

// //                 const isActive =
// //                   String(employee.status || "")
// //                     .trim()
// //                     .toLowerCase() === "active";

// //                 return (
// //                   <tr
// //                     key={employee.empId}
// //                     className={isActive ? "" : "inactive-row"}
// //                   >
// //                     <td>
// //                       <div className="em-name-cell">
// //                         <strong>{employee.name}</strong>
// //                         <span>{employee.empId}</span>
// //                       </div>
// //                     </td>

// //                     <td>
// //                       <span
// //                         className={`em-status ${
// //                           isActive ? "active" : "inactive"
// //                         }`}
// //                       >
// //                         {employee.status}
// //                       </span>
// //                     </td>

// //                     <td>{employee.designation}</td>
// //                     <td>{employee.organization}</td>
// //                     <td>{fmtDoj(employee.doj)}</td>

// //                     <td className="em-calc-cell">
// //                       {calcOrgExperience(employee.doj)}
// //                     </td>

// //                     <td>{employee.totalExp}</td>
// //                     <td>{employee.reportingManager}</td>
// //                     <td>{employee.compManager}</td>
// //                     <td>{employee.superManager}</td>
// //                     <td>{employee.appraiser}</td>
// //                     <td>{employee.managerMail}</td>
// //                     <td>{employee.superManagerMail}</td>

// //                     {/* ACTION CELL */}
// //                     <td
// //                       className="em-action-cell"
// //                       style={{
// //                         background: "inherit",
// //                         padding: "8px 10px",
// //                         textAlign: "center",
// //                         verticalAlign: "middle",
// //                         borderLeft: "1px solid rgba(0,0,0,0.08)",
// //                         borderRight: "1px solid rgba(0,0,0,0.08)",
// //                         whiteSpace: "nowrap",
// //                       }}
// //                     >
// //                       <button
// //                         type="button"
// //                         disabled={
// //                           loading ||
// //                           bulkStatusUpdating ||
// //                           isUpdating ||
// //                           !onToggleStatus
// //                         }
// //                         onClick={() =>
// //                           onToggleStatus && onToggleStatus(employee)
// //                         }
// //                         style={{
// //                           minWidth: "105px",
// //                           height: "30px",
// //                           padding: "5px 9px",
// //                           borderRadius: "5px",
// //                           border: "1px solid #cbd5e1",
// //                           background: "#ffffff",
// //                           color: isActive ? "#991b1b" : "#166534",
// //                           fontSize: "11px",
// //                           fontWeight: 600,
// //                           lineHeight: "16px",
// //                           cursor:
// //                             loading ||
// //                             bulkStatusUpdating ||
// //                             isUpdating ||
// //                             !onToggleStatus
// //                               ? "not-allowed"
// //                               : "pointer",
// //                           opacity:
// //                             loading || bulkStatusUpdating || isUpdating
// //                               ? 0.55
// //                               : 1,
// //                           boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// //                         }}
// //                       >
// //                         {isUpdating
// //                           ? "Saving..."
// //                           : isActive
// //                             ? "Set Inactive"
// //                             : "Set Active"}
// //                       </button>
// //                     </td>
// //                   </tr>
// //                 );
// //               })
// //             )}

// //             {!loading && !filteredRows.length && (
// //               <tr>
// //                 <td colSpan={COLUMNS.length + 1} className="em-empty">
// //                   No employees found.
// //                 </td>
// //               </tr>
// //             )}
// //           </tbody>
// //         </table>
// //       </div>

// //       <div className="em-pagination">
// //         <div className="em-pagination-info">
// //           Showing{" "}
// //           <strong>
// //             {startRecord}-{endRecord}
// //           </strong>{" "}
// //           of <strong>{totalCount}</strong> employees
// //         </div>

// //         <div className="em-pagination-controls">
// //           <button
// //             type="button"
// //             disabled={safePage <= 1 || loading}
// //             onClick={() => goToPage(safePage - 1)}
// //             aria-label="Previous page"
// //           >
// //             <ChevronLeft size={14} />
// //           </button>

// //           {Array.from(
// //             { length: Math.max(1, totalPages) },
// //             (_, index) => index + 1,
// //           ).map((page) => (
// //             <button
// //               key={page}
// //               type="button"
// //               className={page === safePage ? "active" : ""}
// //               disabled={loading}
// //               onClick={() => goToPage(page)}
// //             >
// //               {page}
// //             </button>
// //           ))}

// //           <button
// //             type="button"
// //             disabled={safePage >= totalPages || loading}
// //             onClick={() => goToPage(safePage + 1)}
// //             aria-label="Next page"
// //           >
// //             <ChevronRight size={14} />
// //           </button>
// //         </div>
// //       </div>
// //     </div>
// //   );
// // }

// import { useEffect, useMemo, useState } from "react";
// import { ChevronLeft, ChevronRight } from "lucide-react";

// import { ColumnFilter } from "./ColumnFilter";
// import { calcOrgExperience, fmtDoj } from "@/lib/employee-master-utils";

// const COLUMNS = [
//   {
//     key: "name",
//     label: "Employee",
//     type: "text",
//     get: (employee) => `${employee.name} ${employee.empId}`,
//   },
//   {
//     key: "status",
//     label: "Status",
//     type: "select",
//     get: (employee) => employee.status || "",
//   },
//   {
//     key: "designation",
//     label: "Designation",
//     type: "select",
//     get: (employee) => employee.designation || "",
//   },
//   {
//     key: "organization",
//     label: "Organization",
//     type: "select",
//     get: (employee) => employee.organization || "",
//   },
//   {
//     key: "doj",
//     label: "Date of Joining",
//     type: "text",
//     get: (employee) => fmtDoj(employee.doj),
//   },
//   {
//     key: "orgExp",
//     label: "Org. Exp (as on 1 Jan)",
//     type: "text",
//     get: (employee) => calcOrgExperience(employee.doj),
//   },
//   {
//     key: "totalExp",
//     label: "Total Exp (as on 1 Jan)",
//     type: "text",
//     get: (employee) => employee.totalExp || "",
//   },
//   {
//     key: "reportingManager",
//     label: "Reporting Manager",
//     type: "select",
//     get: (employee) => employee.reportingManager || "",
//   },
//   {
//     key: "compManager",
//     label: "Comp. Manager",
//     type: "select",
//     get: (employee) => employee.compManager || "",
//   },
//   {
//     key: "superManager",
//     label: "Super Manager",
//     type: "select",
//     get: (employee) => employee.superManager || "",
//   },
//   {
//     key: "appraiser",
//     label: "Appraiser / Super Manager",
//     type: "select",
//     get: (employee) => employee.appraiser || "",
//   },
//   {
//     key: "managerMail",
//     label: "Manager Email ID",
//     type: "text",
//     get: (employee) => employee.managerMail || "",
//   },
//   {
//     key: "superManagerMail",
//     label: "Super Manager Email ID",
//     type: "text",
//     get: (employee) => employee.superManagerMail || "",
//   },
// ];

// const PAGE_SIZE = 20;

// export function EmployeeRosterTable({
//   rows,
//   filters,
//   setFilters,
//   currentPage = 1,
//   setCurrentPage,
//   totalPages = 1,
//   totalCount = 0,
//   loading = false,
//   onToggleStatus,
//   onBulkStatusChange,
//   statusUpdatingIds = new Set(),
//   bulkStatusUpdating = false,
// }) {
//   const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(new Set());

//   const filteredRows = useMemo(() => {
//     return rows.filter((employee) =>
//       COLUMNS.every((column) => {
//         const filter = filters[column.key];

//         if (!filter) {
//           return true;
//         }

//         const rawValue = column.get?.(employee) ?? "";
//         const value = String(rawValue).toLowerCase();

//         if (filter.type === "text") {
//           return value.includes(String(filter.term || "").toLowerCase());
//         }

//         return filter.values.has(rawValue);
//       }),
//     );
//   }, [rows, filters]);

//   const safePage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));

//   useEffect(() => {
//     if (currentPage !== safePage && setCurrentPage) {
//       setCurrentPage(safePage);
//     }
//   }, [currentPage, safePage, setCurrentPage]);

//   /*
//    * Remove selected employees that are no longer present
//    * on the current page.
//    */
//   useEffect(() => {
//     const visibleIds = new Set(
//       rows.map((employee) => String(employee.empId || "").trim()),
//     );

//     setSelectedEmployeeIds((current) => {
//       const next = new Set([...current].filter((id) => visibleIds.has(id)));

//       if (next.size === current.size) {
//         return current;
//       }

//       return next;
//     });
//   }, [rows]);

//   const visibleEmployeeIds = filteredRows.map((employee) =>
//     String(employee.empId || "").trim(),
//   );

//   const selectedVisibleCount = visibleEmployeeIds.filter((id) =>
//     selectedEmployeeIds.has(id),
//   ).length;

//   const allVisibleSelected =
//     filteredRows.length > 0 && selectedVisibleCount === filteredRows.length;

//   const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

//   const startRecord = totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;

//   const endRecord =
//     totalCount === 0 ? 0 : Math.min(safePage * PAGE_SIZE, totalCount);

//   const goToPage = (page) => {
//     if (!setCurrentPage) {
//       return;
//     }

//     const nextPage = Math.min(Math.max(1, page), Math.max(1, totalPages));

//     if (nextPage !== safePage) {
//       setCurrentPage(nextPage);
//     }
//   };

//   const toggleEmployeeSelection = (employeeId) => {
//     const normalizedId = String(employeeId || "").trim();

//     if (!normalizedId) {
//       return;
//     }

//     setSelectedEmployeeIds((current) => {
//       const next = new Set(current);

//       if (next.has(normalizedId)) {
//         next.delete(normalizedId);
//       } else {
//         next.add(normalizedId);
//       }

//       return next;
//     });
//   };

//   const toggleSelectAll = () => {
//     if (!filteredRows.length) {
//       return;
//     }

//     setSelectedEmployeeIds((current) => {
//       const next = new Set(current);

//       if (allVisibleSelected) {
//         visibleEmployeeIds.forEach((id) => {
//           next.delete(id);
//         });
//       } else {
//         visibleEmployeeIds.forEach((id) => {
//           next.add(id);
//         });
//       }

//       return next;
//     });
//   };

//   const handleBulkStatus = async (status) => {
//     if (!onBulkStatusChange) {
//       return;
//     }

//     const selectedEmployees = filteredRows.filter((employee) =>
//       selectedEmployeeIds.has(String(employee.empId || "").trim()),
//     );

//     if (!selectedEmployees.length) {
//       return;
//     }

//     await onBulkStatusChange(status, selectedEmployees);

//     /*
//      * Clear selection after successful/attempted bulk operation.
//      */
//     setSelectedEmployeeIds(new Set());
//   };

//   return (
//     <div className="em-roster-container">
//       <div className="em-grid-wrap">
//         <table className="em-table">
//           <thead>
//             <tr>
//               {COLUMNS.map((column) => (
//                 <th key={column.key}>
//                   <div className="em-th-inner">
//                     <span>{column.label}</span>

//                     <ColumnFilter
//                       column={column}
//                       rows={rows}
//                       value={filters[column.key]}
//                       onChange={(value) =>
//                         setFilters((current) => {
//                           const next = {
//                             ...current,
//                           };

//                           if (!value) {
//                             delete next[column.key];
//                           } else {
//                             next[column.key] = value;
//                           }

//                           return next;
//                         })
//                       }
//                     />
//                   </div>
//                 </th>
//               ))}

//               {/* ACTION HEADER */}
//               <th
//                 className="em-action-header"
//                 style={{
//                   minWidth: "190px",
//                   width: "190px",
//                   padding: "8px 10px",
//                   borderLeft: "1px solid rgba(0,0,0,0.08)",
//                   borderRight: "1px solid rgba(0,0,0,0.08)",
//                   whiteSpace: "nowrap",
//                   verticalAlign: "middle",
//                 }}
//               >
//                 <div
//                   style={{
//                     display: "flex",
//                     flexDirection: "column",
//                     alignItems: "center",
//                     justifyContent: "center",
//                     gap: "7px",
//                     width: "100%",
//                   }}
//                 >
//                   <span
//                     style={{
//                       fontWeight: 600,
//                       fontSize: "13px",
//                       lineHeight: "16px",
//                     }}
//                   >
//                     Action
//                   </span>

//                   <div
//                     style={{
//                       display: "flex",
//                       alignItems: "center",
//                       justifyContent: "center",
//                       gap: "6px",
//                       width: "100%",
//                     }}
//                   >
//                     {/* SELECT ALL */}
//                     <label
//                       title="Select all employees on the current page"
//                       style={{
//                         display: "flex",
//                         alignItems: "center",
//                         gap: "4px",
//                         fontSize: "10px",
//                         fontWeight: 500,
//                         cursor:
//                           loading || bulkStatusUpdating || !filteredRows.length
//                             ? "not-allowed"
//                             : "pointer",
//                         userSelect: "none",
//                       }}
//                     >
//                       <input
//                         type="checkbox"
//                         checked={allVisibleSelected}
//                         ref={(element) => {
//                           if (element) {
//                             element.indeterminate = someVisibleSelected;
//                           }
//                         }}
//                         disabled={
//                           loading || bulkStatusUpdating || !filteredRows.length
//                         }
//                         onChange={toggleSelectAll}
//                         style={{
//                           width: "14px",
//                           height: "14px",
//                           margin: 0,
//                           cursor:
//                             loading ||
//                             bulkStatusUpdating ||
//                             !filteredRows.length
//                               ? "not-allowed"
//                               : "pointer",
//                         }}
//                       />

//                       <span>Select All</span>
//                     </label>

//                     {/* ACTIVE */}
//                     <button
//                       type="button"
//                       disabled={
//                         loading ||
//                         bulkStatusUpdating ||
//                         selectedVisibleCount === 0
//                       }
//                       onClick={() => handleBulkStatus("Active")}
//                       title="Set selected employees to Active"
//                       style={{
//                         border: "1px solid #cbd5e1",
//                         borderRadius: "5px",
//                         background: "#ffffff",
//                         color: "inherit",
//                         padding: "4px 7px",
//                         fontSize: "11px",
//                         fontWeight: 600,
//                         lineHeight: "14px",
//                         cursor:
//                           loading ||
//                           bulkStatusUpdating ||
//                           selectedVisibleCount === 0
//                             ? "not-allowed"
//                             : "pointer",
//                         opacity:
//                           loading ||
//                           bulkStatusUpdating ||
//                           selectedVisibleCount === 0
//                             ? 0.5
//                             : 1,
//                       }}
//                     >
//                       Active
//                     </button>

//                     {/* INACTIVE */}
//                     <button
//                       type="button"
//                       disabled={
//                         loading ||
//                         bulkStatusUpdating ||
//                         selectedVisibleCount === 0
//                       }
//                       onClick={() => handleBulkStatus("Inactive")}
//                       title="Set selected employees to Inactive"
//                       style={{
//                         border: "1px solid #cbd5e1",
//                         borderRadius: "5px",
//                         background: "#ffffff",
//                         color: "inherit",
//                         padding: "4px 7px",
//                         fontSize: "11px",
//                         fontWeight: 600,
//                         lineHeight: "14px",
//                         cursor:
//                           loading ||
//                           bulkStatusUpdating ||
//                           selectedVisibleCount === 0
//                             ? "not-allowed"
//                             : "pointer",
//                         opacity:
//                           loading ||
//                           bulkStatusUpdating ||
//                           selectedVisibleCount === 0
//                             ? 0.5
//                             : 1,
//                       }}
//                     >
//                       Inactive
//                     </button>
//                   </div>

//                   {selectedVisibleCount > 0 && (
//                     <span
//                       style={{
//                         fontSize: "10px",
//                         opacity: 0.65,
//                         lineHeight: "12px",
//                       }}
//                     >
//                       {selectedVisibleCount} selected
//                     </span>
//                   )}
//                 </div>
//               </th>
//             </tr>
//           </thead>

//           <tbody>
//             {loading ? (
//               <tr>
//                 <td colSpan={COLUMNS.length + 1} className="em-empty">
//                   Loading employees...
//                 </td>
//               </tr>
//             ) : (
//               filteredRows.map((employee) => {
//                 const employeeId = String(employee.empId || "").trim();

//                 const isSelected = selectedEmployeeIds.has(employeeId);

//                 const isUpdating =
//                   statusUpdatingIds instanceof Set &&
//                   statusUpdatingIds.has(employeeId);

//                 const isActive =
//                   String(employee.status || "")
//                     .trim()
//                     .toLowerCase() === "active";

//                 return (
//                   <tr
//                     key={employee.empId}
//                     className={isActive ? "" : "inactive-row"}
//                   >
//                     <td>
//                       <div className="em-name-cell">
//                         <strong>{employee.name}</strong>
//                         <span>{employee.empId}</span>
//                       </div>
//                     </td>

//                     <td>
//                       <span
//                         className={`em-status ${
//                           isActive ? "active" : "inactive"
//                         }`}
//                       >
//                         {employee.status}
//                       </span>
//                     </td>

//                     <td>{employee.designation}</td>
//                     <td>{employee.organization}</td>
//                     <td>{fmtDoj(employee.doj)}</td>

//                     <td className="em-calc-cell">
//                       {calcOrgExperience(employee.doj)}
//                     </td>

//                     <td>{employee.totalExp}</td>
//                     <td>{employee.reportingManager}</td>
//                     <td>{employee.compManager}</td>
//                     <td>{employee.superManager}</td>
//                     <td>{employee.appraiser}</td>
//                     <td>{employee.managerMail}</td>
//                     <td>{employee.superManagerMail}</td>

//                     {/* ACTION CELL */}
//                     <td
//                       className="em-action-cell"
//                       style={{
//                         padding: "8px 10px",
//                         textAlign: "center",
//                         verticalAlign: "middle",
//                         borderLeft: "1px solid rgba(0,0,0,0.08)",
//                         borderRight: "1px solid rgba(0,0,0,0.08)",
//                         whiteSpace: "nowrap",
//                       }}
//                     >
//                       <div
//                         style={{
//                           display: "flex",
//                           alignItems: "center",
//                           justifyContent: "center",
//                           gap: "7px",
//                         }}
//                       >
//                         {/* ROW CHECKBOX */}
//                         <input
//                           type="checkbox"
//                           checked={isSelected}
//                           disabled={
//                             loading ||
//                             bulkStatusUpdating ||
//                             isUpdating ||
//                             !employeeId
//                           }
//                           onChange={() => toggleEmployeeSelection(employeeId)}
//                           aria-label={`Select ${employee.name}`}
//                           style={{
//                             width: "14px",
//                             height: "14px",
//                             margin: 0,
//                             cursor:
//                               loading || bulkStatusUpdating || isUpdating
//                                 ? "not-allowed"
//                                 : "pointer",
//                           }}
//                         />

//                         {/* ROW STATUS ACTION */}
//                         <button
//                           type="button"
//                           disabled={
//                             loading ||
//                             bulkStatusUpdating ||
//                             isUpdating ||
//                             !onToggleStatus
//                           }
//                           onClick={() =>
//                             onToggleStatus && onToggleStatus(employee)
//                           }
//                           style={{
//                             minWidth: "105px",
//                             height: "30px",
//                             padding: "5px 9px",
//                             borderRadius: "5px",
//                             border: "1px solid #cbd5e1",
//                             background: "#ffffff",
//                             color: "inherit",
//                             fontSize: "11px",
//                             fontWeight: 600,
//                             lineHeight: "16px",
//                             cursor:
//                               loading ||
//                               bulkStatusUpdating ||
//                               isUpdating ||
//                               !onToggleStatus
//                                 ? "not-allowed"
//                                 : "pointer",
//                             opacity:
//                               loading || bulkStatusUpdating || isUpdating
//                                 ? 0.55
//                                 : 1,
//                             boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
//                           }}
//                         >
//                           {isUpdating
//                             ? "Saving..."
//                             : isActive
//                               ? "Set Inactive"
//                               : "Set Active"}
//                         </button>
//                       </div>
//                     </td>
//                   </tr>
//                 );
//               })
//             )}

//             {!loading && !filteredRows.length && (
//               <tr>
//                 <td colSpan={COLUMNS.length + 1} className="em-empty">
//                   No employees found.
//                 </td>
//               </tr>
//             )}
//           </tbody>
//         </table>
//       </div>

//       <div className="em-pagination">
//         <div className="em-pagination-info">
//           Showing{" "}
//           <strong>
//             {startRecord}-{endRecord}
//           </strong>{" "}
//           of <strong>{totalCount}</strong> employees
//         </div>

//         <div className="em-pagination-controls">
//           <button
//             type="button"
//             disabled={safePage <= 1 || loading}
//             onClick={() => goToPage(safePage - 1)}
//             aria-label="Previous page"
//           >
//             <ChevronLeft size={14} />
//           </button>

//           {Array.from(
//             {
//               length: Math.max(1, totalPages),
//             },
//             (_, index) => index + 1,
//           ).map((page) => (
//             <button
//               key={page}
//               type="button"
//               className={page === safePage ? "active" : ""}
//               disabled={loading}
//               onClick={() => goToPage(page)}
//             >
//               {page}
//             </button>
//           ))}

//           <button
//             type="button"
//             disabled={safePage >= totalPages || loading}
//             onClick={() => goToPage(safePage + 1)}
//             aria-label="Next page"
//           >
//             <ChevronRight size={14} />
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }
import { useEffect, useMemo, useState } from "react";

const COLUMNS = [
  { key: "status", label: "Status" },
  { key: "designation", label: "Designation" },
  { key: "organization", label: "Organization" },
  { key: "doj", label: "Date of Joining" },
  { key: "orgExp", label: "Org Exp" },
  { key: "totalExp", label: "Total Exp" },
  { key: "reportingManager", label: "Reporting Manager" },
  { key: "compManager", label: "Comp Manager" },
  { key: "superManager", label: "Super Manager" },
  { key: "managerMail", label: "Manager Email" },
  { key: "superManagerMail", label: "Super Manager Email" },
];

function getEmployeeId(employee) {
  return String(
    employee?.empId ??
      employee?.employeeId ??
      employee?.EMP_ID ??
      employee?.["EMP ID"] ??
      "",
  ).trim();
}

function getEmployeeName(employee) {
  return (
    employee?.empName ??
    employee?.employeeName ??
    employee?.name ??
    employee?.EMP_NAME ??
    employee?.["EMP Name"] ??
    "-"
  );
}

function getValue(employee, key) {
  let value = employee?.[key];

  if (key === "orgExp") {
    value =
      employee?.orgExp ??
      employee?.wissen_experience ??
      employee?.wissenExperience ??
      "";
  }

  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return value;
}

function normalizeStatus(status) {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

function StatusBadge({ status }) {
  const isActive = normalizeStatus(status) === "active";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "68px",
        padding: "3px 9px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        backgroundColor: isActive ? "#dcfce7" : "#fee2e2",
        color: isActive ? "#15803d" : "#dc2626",
        border: `1px solid ${isActive ? "#86efac" : "#fca5a5"}`,
      }}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export function EmployeeRosterTable({
  rows = [],
  filters = {},
  setFilters,
  currentPage = 1,
  setCurrentPage,
  totalPages = 1,
  totalCount = 0,
  onToggleStatus,
  onBulkStatusChange,
  statusUpdatingIds = new Set(),
  bulkStatusUpdating = false,
}) {
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(new Set());

  /*
   * Existing filtering behaviour.
   * Only the displayed rows on the current page are filtered.
   */
  const filteredRows = useMemo(() => {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.filter((employee) => {
      return COLUMNS.every((column) => {
        const filterValue = String(filters?.[column.key] ?? "")
          .trim()
          .toLowerCase();

        if (!filterValue) {
          return true;
        }

        const employeeValue = String(getValue(employee, column.key))
          .trim()
          .toLowerCase();

        return employeeValue.includes(filterValue);
      });
    });
  }, [rows, filters]);

  /*
   * Keep selection only for employees currently visible.
   */
  useEffect(() => {
    const visibleIds = new Set(
      filteredRows.map((employee) => getEmployeeId(employee)).filter(Boolean),
    );

    setSelectedEmployeeIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));

      if (next.size === current.size) {
        return current;
      }

      return next;
    });
  }, [filteredRows]);

  const visibleEmployeeIds = useMemo(() => {
    return filteredRows
      .map((employee) => getEmployeeId(employee))
      .filter(Boolean);
  }, [filteredRows]);

  const allVisibleSelected =
    visibleEmployeeIds.length > 0 &&
    visibleEmployeeIds.every((id) => selectedEmployeeIds.has(id));

  const someVisibleSelected = visibleEmployeeIds.some((id) =>
    selectedEmployeeIds.has(id),
  );

  /*
   * Select / unselect one employee.
   */
  const toggleEmployeeSelection = (employeeId) => {
    const normalizedId = String(employeeId ?? "").trim();

    if (!normalizedId) {
      return;
    }

    setSelectedEmployeeIds((current) => {
      const next = new Set(current);

      if (next.has(normalizedId)) {
        next.delete(normalizedId);
      } else {
        next.add(normalizedId);
      }

      return next;
    });
  };

  /*
   * Select / unselect all employees currently visible
   * on this page.
   */
  const toggleSelectAll = () => {
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        visibleEmployeeIds.forEach((id) => {
          next.delete(id);
        });
      } else {
        visibleEmployeeIds.forEach((id) => {
          next.add(id);
        });
      }

      return next;
    });
  };

  /*
   * Bulk Active / Inactive.
   */
  const handleBulkStatus = async (status) => {
    const selectedEmployees = filteredRows.filter((employee) =>
      selectedEmployeeIds.has(getEmployeeId(employee)),
    );

    if (selectedEmployees.length === 0) {
      return;
    }

    await onBulkStatusChange?.(status, selectedEmployees);

    setSelectedEmployeeIds(new Set());
  };

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) {
      return;
    }

    setCurrentPage?.(page);
  };

  return (
    <div
      style={{
        width: "100%",
        overflowX: "auto",
      }}
    >
      <table
        className="em-table"
        style={{
          width: "100%",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr>
            {/* =====================================================
                SELECTION COLUMN
            ====================================================== */}
            <th
              style={{
                whiteSpace: "nowrap",
                width: "105px",
                minWidth: "105px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(element) => {
                    if (element) {
                      element.indeterminate =
                        !allVisibleSelected && someVisibleSelected;
                    }
                  }}
                  onChange={toggleSelectAll}
                  disabled={filteredRows.length === 0 || bulkStatusUpdating}
                  title="Select all"
                  style={{
                    width: "15px",
                    height: "15px",
                    cursor:
                      filteredRows.length === 0 || bulkStatusUpdating
                        ? "not-allowed"
                        : "pointer",
                  }}
                />

                <span>Select</span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  marginTop: "5px",
                }}
              >
                <button
                  type="button"
                  onClick={() => handleBulkStatus("Active")}
                  disabled={!someVisibleSelected || bulkStatusUpdating}
                  style={{
                    border: "1px solid #86efac",
                    backgroundColor: "#dcfce7",
                    color: "#15803d",
                    borderRadius: "4px",
                    padding: "2px 5px",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor:
                      !someVisibleSelected || bulkStatusUpdating
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      !someVisibleSelected || bulkStatusUpdating ? 0.5 : 1,
                  }}
                  title="Set selected employees Active"
                >
                  Active
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkStatus("Inactive")}
                  disabled={!someVisibleSelected || bulkStatusUpdating}
                  style={{
                    border: "1px solid #fca5a5",
                    backgroundColor: "#fee2e2",
                    color: "#dc2626",
                    borderRadius: "4px",
                    padding: "2px 5px",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor:
                      !someVisibleSelected || bulkStatusUpdating
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      !someVisibleSelected || bulkStatusUpdating ? 0.5 : 1,
                  }}
                  title="Set selected employees Inactive"
                >
                  Inactive
                </button>
              </div>
            </th>

            {/* =====================================================
                EMPLOYEE COLUMN
                EMP ID + NAME remain together.
            ====================================================== */}
            <th
              style={{
                whiteSpace: "nowrap",
                minWidth: "180px",
              }}
            >
              Employee
            </th>

            {/* =====================================================
                EXISTING COLUMNS
            ====================================================== */}
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                style={{
                  whiteSpace: "nowrap",
                }}
              >
                {column.label}
              </th>
            ))}

            {/* =====================================================
                ACTION COLUMN
                ALWAYS LAST.
            ====================================================== */}
            <th
              style={{
                whiteSpace: "nowrap",
                minWidth: "115px",
              }}
            >
              Action
            </th>
          </tr>
        </thead>

        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td
                colSpan={COLUMNS.length + 2}
                style={{
                  textAlign: "center",
                  padding: "24px",
                }}
              >
                No employees found.
              </td>
            </tr>
          ) : (
            filteredRows.map((employee) => {
              const employeeId = getEmployeeId(employee);
              const employeeName = getEmployeeName(employee);

              const status = String(employee?.status ?? "Inactive").trim();

              const isActive = normalizeStatus(status) === "active";

              const isSelected = selectedEmployeeIds.has(employeeId);

              const isUpdating =
                statusUpdatingIds?.has?.(employeeId) || bulkStatusUpdating;

              return (
                <tr key={employeeId || employeeName}>
                  {/* =================================================
                      SELECTION CELL
                  ================================================== */}
                  <td
                    style={{
                      width: "105px",
                      minWidth: "105px",
                      textAlign: "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleEmployeeSelection(employeeId)}
                      disabled={bulkStatusUpdating}
                      title={`Select ${employeeName}`}
                      style={{
                        width: "15px",
                        height: "15px",
                        cursor: bulkStatusUpdating ? "not-allowed" : "pointer",
                      }}
                    />
                  </td>

                  {/* =================================================
                      EMPLOYEE CELL
                      EMP ID + NAME
                  ================================================== */}
                  <td
                    style={{
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                        }}
                      >
                        {employeeName}
                      </span>

                      <span
                        style={{
                          fontSize: "11px",
                          color: "#6b7280",
                        }}
                      >
                        {employeeId || "-"}
                      </span>
                    </div>
                  </td>

                  {/* =================================================
                      EXISTING COLUMNS
                  ================================================== */}
                  {COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      style={{
                        whiteSpace: "nowrap",
                      }}
                    >
                      {column.key === "status" ? (
                        <StatusBadge status={status} />
                      ) : (
                        getValue(employee, column.key)
                      )}
                    </td>
                  ))}

                  {/* =================================================
                      ACTION - LAST COLUMN
                      NO CHECKBOX HERE.
                  ================================================== */}
                  <td>
                    <button
                      type="button"
                      onClick={() => onToggleStatus?.(employee)}
                      disabled={isUpdating}
                      style={{
                        border: `1px solid ${isActive ? "#fca5a5" : "#86efac"}`,
                        backgroundColor: isActive ? "#fee2e2" : "#dcfce7",
                        color: isActive ? "#dc2626" : "#15803d",
                        borderRadius: "5px",
                        padding: "5px 9px",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: isUpdating ? "not-allowed" : "pointer",
                        opacity: isUpdating ? 0.6 : 1,
                        minWidth: "85px",
                      }}
                    >
                      {isUpdating
                        ? "Saving..."
                        : isActive
                          ? "Set Inactive"
                          : "Set Active"}
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* ===========================================================
          PAGINATION
      ============================================================ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 0",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            color: "#6b7280",
          }}
        >
          {totalCount > 0
            ? `Showing page ${currentPage} of ${totalPages} • ${totalCount} employees`
            : "No employees"}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <button
            type="button"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1 || bulkStatusUpdating}
            style={{
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              borderRadius: "4px",
              padding: "5px 10px",
              cursor:
                currentPage <= 1 || bulkStatusUpdating
                  ? "not-allowed"
                  : "pointer",
              opacity: currentPage <= 1 || bulkStatusUpdating ? 0.5 : 1,
            }}
          >
            Previous
          </button>

          <span
            style={{
              fontSize: "12px",
              color: "#374151",
              minWidth: "55px",
              textAlign: "center",
            }}
          >
            {currentPage} / {totalPages}
          </span>

          <button
            type="button"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || bulkStatusUpdating}
            style={{
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              borderRadius: "4px",
              padding: "5px 10px",
              cursor:
                currentPage >= totalPages || bulkStatusUpdating
                  ? "not-allowed"
                  : "pointer",
              opacity:
                currentPage >= totalPages || bulkStatusUpdating ? 0.5 : 1,
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default EmployeeRosterTable;
