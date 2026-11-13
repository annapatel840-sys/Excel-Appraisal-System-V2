// import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// import { Download, History, Menu, Plus, Search, Upload } from "lucide-react";

// import { ClientPager, DataGrid, useGridState, useGridView } from "./DataGrid";
// import { PanelTab, SidePanel } from "./SidePanel";
// import { AddEmployeeModal } from "./AddEmployeeModal";
// import { usePanel } from "./panelStore";
// import { fmtDoj } from "@/lib/employee-master-utils";
// import { LocationMasterControl } from "./LocationMasterControl";
// import "./employee-master-ui.css";

// const PAGE_SIZE = 20;

// /* optional data fields: changeTag = "New" | "Changed" | "Removed", inExceptionalCycle = true/false */
// const tagOf = (e) =>
//   e.changeTag || e.eligibilityTag || (e.manualOverride ? "Changed" : "");

// const eligibilityDecisionOf = (employee) => {
//   const raw = String(
//     employee?.eligibleStatus ??
//       employee?.rawEmployee?.eligibility_status ??
//       employee?.rawEmployee?.eligible_status ??
//       "",
//   )
//     .trim()
//     .toLowerCase()
//     .replace(/[ _-]+/g, "");
//   if (["eligible", "yes", "true", "1"].includes(raw)) return "Eligible";
//   if (["noteligible", "no", "false", "0", "ineligible"].includes(raw)) {
//     return "Not Eligible";
//   }
//   return "Pending";
// };

// const updatedOf = (e) =>
//   e.eligibilityUpdatedAt ||
//   e.rawEmployee?.eligible_updated_at ||
//   e.rawEmployee?.updated_at ||
//   e.rawEmployee?.modifiedtime ||
//   e.rawEmployee?.MODIFIEDTIME ||
//   "—";

// const DEFS = [
//   {
//     key: "employee",
//     label: "Employee",
//     w: 260,
//     get: (e) => `${e.empId} - ${e.name} · ${e.designation || ""}`,
//     render: (e) => (
//       <>
//         <div className="emx-e1">
//           {e.empId} - {e.name}
//         </div>
//         <div className="emx-e2">{e.designation || "—"}</div>
//       </>
//     ),
//   },
//   {
//     key: "location",
//     label: "Location",
//     w: 120,
//     get: (e) =>
//       e.location ||
//       e.rawEmployee?.location ||
//       e.rawEmployee?.work_location ||
//       "—",
//   },
//   {
//     key: "dept",
//     label: "Department",
//     w: 140,
//     get: (e) => e.organization || "—",
//   },
//   {
//     key: "doj",
//     label: "Date of Joining",
//     w: 115,
//     get: (e) => fmtDoj(e.doj) || "—",
//     sv: (e) => String(e.doj ?? ""),
//   },
//   {
//     key: "te",
//     label: "Tech-ED/BU Head Name",
//     w: 160,
//     get: (e) => e.appraiser || e.superManager || "—",
//   },
//   {
//     key: "status",
//     label: "Employee Status",
//     w: 125,
//     get: (e) => String(e.status || e.rawEmployee?.emp_status || "Active"),
//     render: (e) => {
//       const status = String(
//         e.status || e.rawEmployee?.emp_status || "Active",
//       ).trim();
//       const active = status.toLowerCase() === "active";
//       return (
//         <span className={`emx-tag ${active ? "ok" : "grey"}`}>
//           {active ? "Active" : "Inactive"}
//         </span>
//       );
//     },
//   },
//   {
//     key: "eligible",
//     label: "Eligibility",
//     w: 110,
//     get: (e) => eligibilityDecisionOf(e),
//     render: (e) => {
//       const decision = eligibilityDecisionOf(e);
//       return (
//         <span
//           className={`emx-tag ${decision === "Eligible" ? "ok" : decision === "Pending" ? "info" : "warn"}`}
//         >
//           {decision}
//         </span>
//       );
//     },
//   },
//   {
//     key: "reason",
//     label: "Reason",
//     w: 200,
//     get: (e) => e.eligibleReason || "—",
//   },
//   {
//     key: "by",
//     label: "Set By",
//     w: 100,
//     get: (e) => {
//       const source = String(
//         e.eligibilitySource || e.rawEmployee?.eligibility_source || "",
//       )
//         .trim()
//         .toLowerCase();
//       if (e.manualOverride || source === "manual") return "Manual";
//       if (source === "system") return "Initial";
//       return "Criteria";
//     },
//   },
//   {
//     key: "tag",
//     label: "Change Tag",
//     w: 200,
//     get: (e) =>
//       [tagOf(e), e.inExceptionalCycle ? "In open Exceptional cycle" : ""]
//         .filter(Boolean)
//         .join(" · ") || "—",
//     render: (e) => {
//       const tag = tagOf(e);
//       if (!tag && !e.inExceptionalCycle) return "—";
//       return (
//         <>
//           {tag && (
//             <span
//               className={`emx-tag ${tag === "New" ? "info" : tag === "Changed" ? "chg" : "grey"}`}
//             >
//               {tag}
//             </span>
//           )}{" "}
//           {e.inExceptionalCycle && (
//             <span className="emx-tag warn">In open Exceptional cycle</span>
//           )}
//         </>
//       );
//     },
//   },
//   { key: "upd", label: "Last Updated", w: 180, get: (e) => updatedOf(e) },
// ];

// function countBy(list, fn) {
//   const map = {};
//   list.forEach((item) => {
//     const k = fn(item);
//     map[k] = (map[k] || 0) + 1;
//   });
//   return Object.keys(map)
//     .sort((a, b) => map[b] - map[a])
//     .map((k) => [k, map[k]]);
// }

// export function EligibilityList({
//   employees,
//   search,
//   setSearch,
//   locationFilter = "All",
//   setLocationFilter,
//   onChangeEligibility, // (employeeOrArray) => open your EligibilityModal; arrays carry .preset = "Yes" | "No"
//   onDownloadTemplate,
//   onImport,
//   onExport,
//   onAuditHistory,
//   onAddEmployee, // ({ empId, eligible: "Yes", eligibleReason }) => Promise   -> shows "+ Add employee"
//   masterEmployees = [], // full Employee Master list, used by "+ Add employee" and the Statistics tab
//   auditEntries, // optional: [{ title, meta, detail }]
//   criteriaApplied = false,
//   onGenerateDelegation,
//   delegationGenerated = false,
// }) {
//   const fileInputRef = useRef(null);
//   const menuRef = useRef(null);

//   const grid = useGridState(DEFS);
//   const [panel, updatePanel] = usePanel("el");
//   const [menuOpen, setMenuOpen] = useState(false);
//   const [page, setPage] = useState(1);
//   const [selectedIds, setSelectedIds] = useState(new Set());
//   const [addOpen, setAddOpen] = useState(false);

//   const canEdit = Boolean(onChangeEligibility);

//   useEffect(() => {
//     const outside = (event) => {
//       if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
//     };
//     const esc = (event) => event.key === "Escape" && setMenuOpen(false);
//     document.addEventListener("mousedown", outside);
//     document.addEventListener("keydown", esc);
//     return () => {
//       document.removeEventListener("mousedown", outside);
//       document.removeEventListener("keydown", esc);
//     };
//   }, []);

//   const searchPre = useCallback(
//     (e) => {
//       const term = (search || "").trim().toLowerCase();
//       if (!term) return true;
//       return (
//         String(e.name ?? "")
//           .toLowerCase()
//           .includes(term) ||
//         String(e.empId ?? "")
//           .toLowerCase()
//           .includes(term)
//       );
//     },
//     [search],
//   );

//   const locationFilteredEmployees = useMemo(() => {
//     if (!locationFilter || locationFilter === "All") return employees;
//     return employees.filter((employee) => {
//       const employeeLocation = String(
//         employee.location ||
//           employee.rawEmployee?.location ||
//           employee.rawEmployee?.work_location ||
//           "",
//       ).trim();
//       return employeeLocation.toLowerCase() === locationFilter.toLowerCase();
//     });
//   }, [employees, locationFilter]);

//   const view = useGridView(locationFilteredEmployees, DEFS, grid, searchPre);

//   /* counts (Removed rows are not counted) */
//   const counted = useMemo(
//     () => locationFilteredEmployees.filter((e) => tagOf(e) !== "Removed"),
//     [locationFilteredEmployees],
//   );
//   const eligibleCount = counted.filter(
//     (e) => eligibilityDecisionOf(e) === "Eligible",
//   ).length;
//   const notEligibleCount = counted.filter(
//     (e) => eligibilityDecisionOf(e) === "Not Eligible",
//   ).length;
//   const pendingCount = counted.filter(
//     (e) => eligibilityDecisionOf(e) === "Pending",
//   ).length;

//   /* paging */
//   const pages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
//   const safePage = Math.min(page, pages);
//   useEffect(() => {
//     if (page > pages) setPage(pages);
//   }, [page, pages]);
//   useEffect(
//     () => setPage(1),
//     [grid.filters, grid.sort, search, locationFilter],
//   );

//   const pageRows = useMemo(
//     () => view.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
//     [view, safePage],
//   );
//   const from = view.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
//   const to = Math.min(view.length, safePage * PAGE_SIZE);

//   /* selection */
//   const selectable = useMemo(
//     () => view.filter((e) => tagOf(e) !== "Removed"),
//     [view],
//   );
//   const selectedRows = useMemo(
//     () =>
//       locationFilteredEmployees.filter(
//         (e) => selectedIds.has(e.empId) && tagOf(e) !== "Removed",
//       ),
//     [locationFilteredEmployees, selectedIds],
//   );
//   const viewSelected = selectable.filter((e) =>
//     selectedIds.has(e.empId),
//   ).length;
//   const allSelected =
//     selectable.length > 0 && viewSelected === selectable.length;

//   const toggleRow = (id) =>
//     setSelectedIds((current) => {
//       const next = new Set(current);
//       if (next.has(id)) next.delete(id);
//       else next.add(id);
//       return next;
//     });

//   const toggleAll = () =>
//     setSelectedIds((current) => {
//       const next = new Set(current);
//       selectable.forEach((e) =>
//         allSelected ? next.delete(e.empId) : next.add(e.empId),
//       );
//       return next;
//     });

//   const bulk = (preset) => {
//     if (!selectedRows.length) return;
//     onChangeEligibility(Object.assign([...selectedRows], { preset }));
//   };

//   const showSetEligible = selectedRows.some(
//     (e) => eligibilityDecisionOf(e) !== "Eligible",
//   );
//   const showSetNotEligible = selectedRows.some(
//     (e) => eligibilityDecisionOf(e) === "Eligible",
//   );

//   /* statistics tab */
//   const stats = useMemo(() => {
//     const notEl = counted.filter((e) => e.eligible !== "Yes");
//     const el = counted.filter((e) => e.eligible === "Yes");
//     const listed = new Set(employees.map((e) => e.empId));
//     const notInList = masterEmployees.filter(
//       (e) => e.status === "Active" && !listed.has(e.empId),
//     ).length;

//     return {
//       summary: [
//         ["In the list", counted.length],
//         ["Eligible", el.length],
//         ["Not Eligible", notEl.length],
//         ...(masterEmployees.length
//           ? [["Active in Employee Master, not in list", notInList]]
//           : []),
//         ["Set by hand", counted.filter((e) => e.manualOverride).length],
//         [
//           "In open Exceptional cycle",
//           counted.filter((e) => e.inExceptionalCycle).length,
//         ],
//       ],
//       sections: [
//         {
//           title: "Not Eligible, by Reason",
//           rows: countBy(
//             notEl,
//             (e) => e.eligibleReason || "Excluded by criteria",
//           ),
//         },
//         {
//           title: "Eligible, by Reason",
//           rows: countBy(
//             el,
//             (e) => e.eligibleReason || "Criteria (no exception)",
//           ),
//         },
//       ],
//     };
//   }, [counted, employees, masterEmployees]);

//   const listedIds = useMemo(
//     () => new Set(employees.map((e) => e.empId)),
//     [employees],
//   );

//   return (
//     <div className="em-eligibility-list">
//       {/* ================= HEADER ================= */}
//       <div className="em-eligibility-header">
//         <div className="em-eligibility-stats">
//           <div>
//             <strong>{counted.length}</strong>
//             <span>Total</span>
//           </div>
//           <div>
//             <strong>{eligibleCount}</strong>
//             <span>Eligible</span>
//           </div>
//           <div>
//             <strong>{notEligibleCount}</strong>
//             <span>Not Eligible</span>
//           </div>

//         </div>

//         <div className="em-eligibility-actions">
//           <div className="em-search">
//             <Search size={14} />
//             <input
//               value={search}
//               onChange={(event) => {
//                 setSearch(event.target.value);
//                 setMenuOpen(false);
//               }}
//               placeholder="Search name / ID"
//             />
//           </div>

//           <LocationMasterControl
//             value={locationFilter}
//             onChange={setLocationFilter}
//             ariaLabel="Filter Eligibility List by Location Master"
//           />

//           {onAddEmployee && canEdit && (
//             <button
//               type="button"
//               className="em-btn emx-dashed"
//               onClick={() => setAddOpen(true)}
//             >
//               <Plus size={14} /> Add an Employee
//             </button>
//           )}
//           <div className="em-eligibility-generate">
//             {criteriaApplied && onGenerateDelegation && (
//               <button
//                 type="button"
//                 className="em-btn em-btn-primary"
//                 disabled={delegationGenerated}
//                 onClick={onGenerateDelegation}
//               >
//                 {delegationGenerated ? "Delegation Generated" : "Generate Delegation"}
//               </button>
//             )}
//           </div>

//           <div
//             ref={menuRef}
//             className="em-menu-wrapper"
//             onMouseDown={(event) => event.stopPropagation()}
//           >
//             <button
//               type="button"
//               className="em-btn em-btn-primary"
//               aria-label="Menu"
//               aria-haspopup="menu"
//               aria-expanded={menuOpen}
//               onClick={() => setMenuOpen((current) => !current)}
//             >
//               <Menu size={14} /> Menu ▾
//             </button>

//             {menuOpen && (
//               <div
//                 className="em-menu-dropdown"
//                 role="menu"
//                 onMouseDown={(event) => event.stopPropagation()}
//               >
//                 <button
//                   type="button"
//                   role="menuitem"
//                   onClick={() => {
//                     setMenuOpen(false);
//                     onDownloadTemplate?.();
//                   }}
//                 >
//                   <Download size={14} /> Download Template
//                 </button>

//                 {onImport && (
//                   <button
//                     type="button"
//                     role="menuitem"
//                     onClick={() => {
//                       setMenuOpen(false);
//                       fileInputRef.current?.click();
//                     }}
//                   >
//                     <Upload size={14} /> Import Eligibility
//                   </button>
//                 )}

//                 <button
//                   type="button"
//                   role="menuitem"
//                   onClick={() => {
//                     setMenuOpen(false);
//                     onExport?.(view);
//                   }}
//                 >
//                   <Download size={14} /> Export to Excel
//                 </button>

//                 <button
//                   type="button"
//                   role="menuitem"
//                   onClick={() => {
//                     setMenuOpen(false);
//                     updatePanel({ open: true, tab: "aud" });
//                   }}
//                 >
//                   <History size={14} /> Audit Trail
//                 </button>
//               </div>
//             )}

//             <input
//               ref={fileInputRef}
//               type="file"
//               accept=".csv,.xlsx,.xls"
//               hidden
//               onChange={(event) => {
//                 const file = event.target.files?.[0];
//                 if (file) onImport?.(file);
//                 event.target.value = "";
//               }}
//             />
//           </div>
//         </div>
//       </div>

//       {/* ================= TABLE + PANEL ================= */}
//       <div className="emx-work">
//         <div className="emx-main">
//           {canEdit && selectedRows.length > 0 && (
//             <div className="emx-selbar">
//               <b>{selectedRows.length} selected</b>
//               {showSetEligible && (
//                 <button
//                   type="button"
//                   className="emx-mini"
//                   onClick={() => bulk("Yes")}
//                 >
//                   Set Eligible…
//                 </button>
//               )}
//               {showSetNotEligible && (
//                 <button
//                   type="button"
//                   className="emx-mini"
//                   onClick={() => bulk("No")}
//                 >
//                   Set Not Eligible…
//                 </button>
//               )}
//               <button
//                 type="button"
//                 className="emx-mini"
//                 onClick={() => setSelectedIds(new Set())}
//               >
//                 Clear selection
//               </button>
//             </div>
//           )}

//           <DataGrid
//             defs={DEFS}
//             grid={grid}
//             allRows={employees}
//             rows={pageRows}
//             rowKey={(e) => e.empId}
//             selectable={canEdit}
//             selected={selectedIds}
//             onToggleRow={toggleRow}
//             onToggleAll={toggleAll}
//             allSelected={allSelected}
//             someSelected={viewSelected > 0}
//             canSelectRow={(e) =>
//               tagOf(e) !== "Removed" &&
//               String(
//                 e.status || e.rawEmployee?.emp_status || "Active",
//               ).toLowerCase() === "active"
//             }
//             rowClass={(e) =>
//               tagOf(e) === "Removed" ||
//               String(
//                 e.status || e.rawEmployee?.emp_status || "Active",
//               ).toLowerCase() !== "active"
//                 ? "emx-dim"
//                 : ""
//             }
//             actionHeader={canEdit ? "Action" : null}
//             renderAction={(e) =>
//               tagOf(e) === "Removed" ||
//               String(
//                 e.status || e.rawEmployee?.emp_status || "Active",
//               ).toLowerCase() !== "active" ? (
//                 "—"
//               ) : (
//                 <button
//                   type="button"
//                   className="emx-mini"
//                   onClick={() => onChangeEligibility(e)}
//                 >
//                   {eligibilityDecisionOf(e) === "Eligible"
//                     ? "Set Not Eligible"
//                     : "Set Eligible"}
//                 </button>
//               )
//             }
//             emptyText="No eligibility records found."
//           />

//           <ClientPager
//             page={safePage}
//             pages={pages}
//             from={from}
//             to={to}
//             total={view.length}
//             allTotal={employees.length}
//             onPage={setPage}
//             grid={grid}
//           />
//         </div>

//         <SidePanel
//           open={panel.open}
//           title="Eligibility List"
//           tab={panel.tab}
//           onTab={(tab) => updatePanel({ tab })}
//           onClose={() => updatePanel({ open: false })}
//           defs={DEFS}
//           grid={grid}
//           stats={stats}
//           audit={auditEntries}
//           auditHint="Every manual change: user, date and time, employee, previous and new value."
//           onFullAudit={onAuditHistory}
//         />
//         <PanelTab
//           open={panel.open}
//           onOpen={() => updatePanel({ open: true })}
//         />
//       </div>

//       {addOpen && (
//         <AddEmployeeModal
//           masterEmployees={masterEmployees}
//           listedIds={listedIds}
//           onAdd={onAddEmployee}
//           onClose={() => setAddOpen(false)}
//         />
//       )}
//     </div>
//   );
// }

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, History, Info, Menu, Plus, Search, Upload } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClientPager, DataGrid, useGridState, useGridView } from "./DataGrid";
import { PanelTab, SidePanel } from "./SidePanel";
import { AddEmployeeModal } from "./AddEmployeeModal";
import { usePanel } from "./panelStore";
import { useScreenFields } from "@/lib/access-store";
import { fmtDoj } from "@/lib/employee-master-utils";
import { LocationMasterControl } from "./LocationMasterControl";
import { matchesLocation, isAllLocations } from "@/lib/location-store";
import { effectiveRow, isActiveStatus, isInactiveStatus } from "@/lib/eligibility-rules";
import "./employee-master-ui.css";

const PAGE_SIZE = 20;

/* optional data fields: changeTag = "New" | "Changed" | "Removed", inExceptionalCycle = true/false */
const tagOf = (e) =>
  e.changeTag || e.eligibilityTag || (e.manualOverride ? "Changed" : "");

const eligibilityDecisionOf = (employee) => {
  const raw = String(
    employee?.eligibleStatus ??
      employee?.rawEmployee?.eligibility_status ??
      employee?.rawEmployee?.eligible_status ??
      "",
  )
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, "");
  if (["eligible", "yes", "true", "1"].includes(raw)) return "Eligible";
  if (["noteligible", "no", "false", "0", "ineligible"].includes(raw)) {
    return "Not Eligible";
  }
  return "Pending";
};

// "i" button next to the Need Action metric: opens on hover (desktop) or tap.
function NeedActionInfo() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="About Need Action"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: 0,
            border: 0,
            background: "none",
            color: "#64748B",
            cursor: "pointer",
          }}
        >
          <Info size={11} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-56 p-2 text-xs"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(event) => event.stopPropagation()}
      >
        These employees' status needs attention.
      </PopoverContent>
    </Popover>
  );
}

// "Need Action": the employee's status in the Employee Master is not Active.
const needsAction = (e) => Boolean(e?._eff?.actionNeeded);

const updatedOf = (e) =>
  e.eligibilityUpdatedAt ||
  e.rawEmployee?.eligible_updated_at ||
  e.rawEmployee?.updated_at ||
  e.rawEmployee?.modifiedtime ||
  e.rawEmployee?.MODIFIEDTIME ||
  "—";

const DEFS = [
  {
    key: "employee",
    label: "Employee",
    w: 260,
    get: (e) => `${e.empId} - ${e.name} · ${e.designation || ""}`,
    render: (e) => (
      <>
        <div className="emx-e1">
          {e.empId} - {e.name}
        </div>
        <div className="emx-e2">{e.designation || "—"}</div>
      </>
    ),
  },
  {
    key: "location",
    label: "Location",
    w: 120,
    get: (e) =>
      e.location ||
      e.rawEmployee?.location ||
      e.rawEmployee?.work_location ||
      "—",
  },
  {
    key: "dept",
    label: "Department",
    w: 140,
    get: (e) => e.organization || "—",
  },
  {
    key: "doj",
    label: "Date of Joining",
    w: 115,
    get: (e) => fmtDoj(e.doj) || "—",
    sv: (e) => String(e.doj ?? ""),
  },
  {
    key: "te",
    label: "Tech-ED/BU Head Name",
    w: 160,
    get: (e) => e.appraiser || e.superManager || "—",
  },
  {
    key: "status",
    label: "Employee Status",
    w: 125,
    get: (e) => String(e.status || e.rawEmployee?.emp_status || "Active"),
    render: (e) => {
      const status = String(
        e.status || e.rawEmployee?.emp_status || "Active",
      ).trim();
      const active = status.toLowerCase() === "active";
      return (
        <span className={`emx-tag ${active ? "ok" : "grey"}`}>{status}</span>
      );
    },
  },
  {
    key: "eligible",
    label: "Eligibility",
    w: 110,
    get: (e) => e._eff?.decision ?? eligibilityDecisionOf(e),
    render: (e) => {
      const decision = e._eff?.decision ?? eligibilityDecisionOf(e);
      return (
        <span
          className={`emx-tag ${decision === "Eligible" ? "ok" : decision === "Pending" ? "info" : "warn"}`}
        >
          {decision}
        </span>
      );
    },
  },
  {
    key: "compManager",
    label: "Comp Manager",
    w: 150,
    get: (e) => e.compManager || e.rawEmployee?.comp_manager || "—",
  },
  {
    key: "nextStep",
    label: "Next Step",
    w: 190,
    get: (e) => e._eff?.nextLabel || "—",
    render: (e) =>
      e._eff?.nextLabel ? (
        <span
          className={`emx-tag ${e._eff.decisionNeeded || e._eff.nextStep === "Delegation" ? "warn" : "info"}`}
        >
          {e._eff.nextLabel}
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "reason",
    label: "Reason",
    w: 200,
    get: (e) => e._eff?.reason || e.eligibleReason || "—",
  },
  {
    key: "by",
    label: "Set By",
    w: 100,
    get: (e) => {
      if (e._eff?.setBy === "System") return "System";
      const source = String(
        e.eligibilitySource || e.rawEmployee?.eligibility_source || "",
      )
        .trim()
        .toLowerCase();
      if (e.manualOverride || source === "manual") return "Manual";
      if (source === "system") return "Initial";
      return "Criteria";
    },
  },
  {
    key: "tag",
    label: "Change Tag",
    w: 200,
    get: (e) =>
      [tagOf(e) || (e._eff?.changed ? "Changed" : ""), e.inExceptionalCycle ? "In open Exceptional cycle" : ""]
        .filter(Boolean)
        .join(" · ") || "—",
    render: (e) => {
      const tag = tagOf(e) || (e._eff?.changed ? "Changed" : "");
      if (!tag && !e.inExceptionalCycle) return "—";
      return (
        <>
          {tag && (
            <span
              className={`emx-tag ${tag === "New" ? "info" : tag === "Changed" ? "chg" : "grey"}`}
            >
              {tag}
            </span>
          )}{" "}
          {e.inExceptionalCycle && (
            <span className="emx-tag warn">In open Exceptional cycle</span>
          )}
        </>
      );
    },
  },
  { key: "upd", label: "Last Updated", w: 180, get: (e) => updatedOf(e) },
];

function countBy(list, fn) {
  const map = {};
  list.forEach((item) => {
    const k = fn(item);
    map[k] = (map[k] || 0) + 1;
  });
  return Object.keys(map)
    .sort((a, b) => map[b] - map[a])
    .map((k) => [k, map[k]]);
}

const TABS = [
  ["crit", "Eligibility Criteria"],
  ["list", "Eligibility List"],
  ["ne", "Not Eligible"],
  ["act", "Action needed"],
];

export function EligibilityList({
  employees: rawEmployees,
  search,
  setSearch,
  locationFilter = "All",
  setLocationFilter,
  onChangeEligibility, // (employeeOrArray) => open your EligibilityModal; arrays carry .preset = "Yes" | "No"
  onDownloadTemplate,
  onImport,
  onExport,
  onAuditHistory,
  onAddEmployee, // ({ empId, eligible: "Yes", eligibleReason }) => Promise   -> shows "+ Add employee"
  masterEmployees = [], // full Employee Master list, used by "+ Add employee" and the Statistics tab
  auditEntries, // optional: [{ title, meta, detail }]
  criteriaApplied = false,
  onGenerateDelegation,
  delegationGenerated = false,
  criteriaSlot, // ({ goList, currentCounts }) => element  (the Eligibility Criteria tab)
}) {
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  const grid = useGridState(DEFS);
  // Access → Fields → Eligibility List: Hidden columns are not shown, and the list cannot
  // be changed when Eligibility is Read only.
  const fieldAccess = useScreenFields("eligibility");
  const defs = useMemo(
    () => DEFS.filter((d) => !fieldAccess.hidden(d.label)),
    [fieldAccess],
  );
  const [panel, updatePanel] = usePanel("el");
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [delegationPrompt, setDelegationPrompt] = useState(null);
  // Tabs: crit | list (Eligible only) | ne (Not Eligible only) | act (pending step)
  const [tab, setTab] = useState(criteriaApplied ? "list" : "crit");
  const tabTouched = useRef(false);
  const pickTab = (next) => {
    tabTouched.current = true;
    setTab(next);
    setSelectedIds(new Set());
  };
  // Open on the list once it exists, on the criteria while nothing is generated.
  useEffect(() => {
    if (!tabTouched.current) setTab(criteriaApplied ? "list" : "crit");
  }, [criteriaApplied]);

  const canEdit = Boolean(onChangeEligibility) && fieldAccess.canEdit("Eligibility");

  // Rules 11-14: derive what each row shows (System-set Not Eligible, Action needed, next step)
  const employees = useMemo(
    () =>
      rawEmployees.map((e) => ({
        ...e,
        _eff: effectiveRow(e, { listGenerated: criteriaApplied, delegationGenerated }),
      })),
    [rawEmployees, criteriaApplied, delegationGenerated],
  );

  useEffect(() => {
    const outside = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const esc = (event) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const searchPre = useCallback(
    (e) => {
      if (tab === "list" && !e._eff.eligible) return false;
      if (tab === "ne" && e._eff.decision !== "Not Eligible") return false;
      if (tab === "act" && !e._eff.actionNeeded) return false;
      const term = (search || "").trim().toLowerCase();
      if (!term) return true;
      return (
        String(e.name ?? "").toLowerCase().includes(term) ||
        String(e.empId ?? "").toLowerCase().includes(term)
      );
    },
    [search, tab],
  );

  const locationFilteredEmployees = useMemo(() => {
    if (isAllLocations(locationFilter)) return employees;
    return employees.filter((employee) =>
      matchesLocation(
        employee.location ||
          employee.rawEmployee?.location ||
          employee.rawEmployee?.work_location ||
          "",
        locationFilter,
      ),
    );
  }, [employees, locationFilter]);

  const view = useGridView(locationFilteredEmployees, defs, grid, searchPre);

  /* counts (Removed rows are not counted) */
  const counted = useMemo(
    () => locationFilteredEmployees.filter((e) => tagOf(e) !== "Removed"),
    [locationFilteredEmployees],
  );
  const eligibleCount = counted.filter((e) => e._eff.eligible).length;
  const notEligibleCount = counted.filter((e) => e._eff.decision === "Not Eligible").length;
  const needActionCount = counted.filter(needsAction).length;
  const pendingDelegation = counted.filter((e) => e._eff.nextStep === "Delegation").length;
  const actionTabCount = needActionCount;

  /* paging */
  const pages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  useEffect(
    () => setPage(1),
    [grid.filters, grid.sort, search, locationFilter, tab],
  );

  const pageRows = useMemo(
    () => view.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [view, safePage],
  );
  const from = view.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(view.length, safePage * PAGE_SIZE);

  /* selection */
  const canSelect = (e) => tagOf(e) !== "Removed" && isActiveStatus(e);
  const selectable = useMemo(() => view.filter(canSelect), [view]);
  const selectedRows = useMemo(
    () =>
      locationFilteredEmployees.filter(
        (e) => selectedIds.has(e.empId) && tagOf(e) !== "Removed",
      ),
    [locationFilteredEmployees, selectedIds],
  );
  const viewSelected = selectable.filter((e) => selectedIds.has(e.empId)).length;
  const allSelected = selectable.length > 0 && viewSelected === selectable.length;

  const toggleRow = (id) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds((current) => {
      const next = new Set(current);
      selectable.forEach((e) => (allSelected ? next.delete(e.empId) : next.add(e.empId)));
      return next;
    });

  const bulk = (preset) => {
    if (!selectedRows.length) return;
    onChangeEligibility(Object.assign([...selectedRows], { preset }));
  };

  const showSetEligible = selectedRows.some((e) => !e._eff.eligible);
  const showSetNotEligible = selectedRows.some((e) => e._eff.eligible);

  /* statistics tab */
  const stats = useMemo(() => {
    const notEl = counted.filter((e) => !e._eff.eligible);
    const el = counted.filter((e) => e._eff.eligible);
    const listed = new Set(employees.map((e) => e.empId));
    const notInList = masterEmployees.filter(
      (e) => e.status === "Active" && !listed.has(e.empId),
    ).length;

    return {
      summary: [
        ["In the list", counted.length],
        ["Eligible", el.length],
        ["Not Eligible", notEl.length],
        ...(masterEmployees.length
          ? [["Active in Employee Master, not in list", notInList]]
          : []),
        ["Set by hand", counted.filter((e) => e.manualOverride).length],
        ["In open Exceptional cycle", counted.filter((e) => e.inExceptionalCycle).length],
      ],
      sections: [
        {
          title: "Not Eligible, by Reason",
          rows: countBy(notEl, (e) => e._eff.reason || "Excluded by criteria"),
        },
        {
          title: "Eligible, by Reason",
          rows: countBy(el, (e) => e._eff.reason || "Criteria (no exception)"),
        },
      ],
    };
  }, [counted, employees, masterEmployees]);

  const listedIds = useMemo(() => new Set(employees.map((e) => e.empId)), [employees]);

  // Rule 13: adding an employee prompts Generate Delegation
  const handleAdd = async (payload) => {
    const result = await onAddEmployee?.(payload);
    if (delegationGenerated && onGenerateDelegation) {
      const added = masterEmployees.find((m) => m.empId === payload?.empId);
      setDelegationPrompt(added?.name || payload?.empId || "The employee");
    }
    return result;
  };

  const rowIsOff = (e) => tagOf(e) === "Removed" || isInactiveStatus(e);

  const generateLabel = !delegationGenerated
    ? "Generate Delegation"
    : pendingDelegation
      ? `Generate Delegation (${pendingDelegation})`
      : "Delegation Generated";
  const generateDisabled = delegationGenerated && !pendingDelegation;

  const stat = (key, count, label, tabKey, extra) => (
    <div
      key={key}
      className={`em-stat-click${tab === tabKey ? " on" : ""}`}
      role="button"
      tabIndex={0}
      title={`Open ${label}`}
      onClick={() => pickTab(tabKey)}
      onKeyDown={(event) => event.key === "Enter" && pickTab(tabKey)}
    >
      <strong>{count}</strong>
      {extra || <span>{label}</span>}
    </div>
  );

  return (
    <div className="em-eligibility-list">
      {/* ================= HEADER ================= */}
      <div className="em-eligibility-header">
        <div className="em-eligibility-stats">
          {stat("total", counted.length, "Total", "list")}
          {stat("el", eligibleCount, "Eligible", "list")}
          {stat("ne", notEligibleCount, "Not Eligible", "ne")}
          {stat(
            "act",
            needActionCount,
            "Need Action",
            "act",
            <div style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <span>Need Action</span>
              <NeedActionInfo />
            </div>,
          )}
        </div>

        <div className="em-eligibility-actions">
          <div className="em-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setMenuOpen(false);
                if (tab === "crit") pickTab("list");
              }}
              placeholder="Search name / ID"
            />
          </div>

          <LocationMasterControl
            value={locationFilter}
            onChange={setLocationFilter}
            ariaLabel="Filter Eligibility List by Location Master"
          />

          {onAddEmployee && canEdit && (
            <button
              type="button"
              className="em-btn emx-dashed"
              disabled={!criteriaApplied}
              onClick={() => setAddOpen(true)}
            >
              <Plus size={14} /> Add an Employee
            </button>
          )}
          <div className="em-eligibility-generate">
            {criteriaApplied && onGenerateDelegation && (
              <button
                type="button"
                className="em-btn em-btn-primary"
                disabled={generateDisabled}
                onClick={onGenerateDelegation}
              >
                {generateLabel}
              </button>
            )}
          </div>

          <div
            ref={menuRef}
            className="em-menu-wrapper"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="em-btn em-btn-primary"
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <Menu size={14} /> Menu ▾
            </button>

            {menuOpen && (
              <div
                className="em-menu-dropdown"
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDownloadTemplate?.();
                  }}
                >
                  <Download size={14} /> Download Template
                </button>

                {onImport && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload size={14} /> Import Eligibility
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onExport?.(view);
                  }}
                >
                  <Download size={14} /> Export to Excel
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    updatePanel({ open: true, tab: "aud" });
                  }}
                >
                  <History size={14} /> Audit Trail
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport?.(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      {/* ================= TABS ================= */}
      <div className="elx-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "on" : ""}
            onClick={() => pickTab(key)}
          >
            {label}
            {key === "act" && actionTabCount > 0 ? ` (${actionTabCount})` : ""}
          </button>
        ))}
      </div>

      {/* ================= BODY + PANEL ================= */}
      <div className="emx-work">
        <div className="emx-main">
          {tab === "crit" ? (
            <div className="elx-crit-scroll">
              {criteriaSlot?.({
                goList: () => pickTab("list"),
                currentCounts: criteriaApplied
                  ? {
                      eligible: eligibleCount,
                      notEligible: notEligibleCount,
                      total: counted.length,
                    }
                  : null,
              })}
            </div>
          ) : !criteriaApplied ? (
            <div className="elx-empty">
              <b>No Eligibility List</b>
              The list has not been generated yet. Set the criteria on the Eligibility Criteria tab
              and press Apply Criteria.
            </div>
          ) : (
            <>
              {canEdit && selectedRows.length > 0 && (
                <div className="emx-selbar">
                  <b>{selectedRows.length} selected</b>
                  {showSetEligible && (
                    <button type="button" className="emx-mini" onClick={() => bulk("Yes")}>
                      Set Eligible…
                    </button>
                  )}
                  {showSetNotEligible && (
                    <button type="button" className="emx-mini" onClick={() => bulk("No")}>
                      Set Not Eligible…
                    </button>
                  )}
                  <button
                    type="button"
                    className="emx-mini"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear selection
                  </button>
                </div>
              )}

              <DataGrid
                defs={defs}
                grid={grid}
                allRows={employees}
                rows={pageRows}
                rowKey={(e) => e.empId}
                selectable={canEdit}
                selected={selectedIds}
                onToggleRow={toggleRow}
                onToggleAll={toggleAll}
                allSelected={allSelected}
                someSelected={viewSelected > 0}
                canSelectRow={canSelect}
                rowClass={(e) => (rowIsOff(e) ? "emx-dim" : "")}
                actionHeader={canEdit ? "Action" : null}
                renderAction={(e) =>
                  rowIsOff(e) ? (
                    "—"
                  ) : (
                    <button
                      type="button"
                      className="emx-mini"
                      onClick={() => onChangeEligibility(e)}
                    >
                      {e._eff.eligible ? "Set Not Eligible" : "Set Eligible"}
                    </button>
                  )
                }
                emptyText={
                  tab === "act"
                    ? "Nothing needs action."
                    : tab === "ne"
                      ? "No Not Eligible employees."
                      : "No eligibility records found."
                }
              />

              <ClientPager
                page={safePage}
                pages={pages}
                from={from}
                to={to}
                total={view.length}
                allTotal={employees.length}
                onPage={setPage}
                grid={grid}
              />
            </>
          )}
        </div>

        <SidePanel
          open={panel.open}
          title="Eligibility List"
          tab={panel.tab}
          onTab={(t) => updatePanel({ tab: t })}
          onClose={() => updatePanel({ open: false })}
          defs={defs}
          grid={grid}
          stats={stats}
          audit={auditEntries}
          auditHint="Latest Apply Criteria changes: who applied them, when, and what changed in the criteria."
          onFullAudit={onAuditHistory}
        />
        <PanelTab open={panel.open} onOpen={() => updatePanel({ open: true })} />
      </div>

      {addOpen && (
        <AddEmployeeModal
          masterEmployees={masterEmployees}
          listedIds={listedIds}
          onAdd={handleAdd}
          onClose={() => setAddOpen(false)}
        />
      )}

      {delegationPrompt && (
        <div
          className="em-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDelegationPrompt(null);
          }}
        >
          <div className="em-modal em-small-modal">
            <div className="em-modal-header">
              <div>
                <strong>Action needed</strong>
              </div>
            </div>
            <div className="em-modal-body">
              <b>{delegationPrompt}</b> is now Eligible.
              <div className="em-hint" style={{ marginTop: 8 }}>
                Next step: Generate Delegation. The employee stays in Action needed until the
                Delegation step and then the Appraisal Sheet step are done.
              </div>
            </div>
            <div className="em-modal-footer">
              <button
                type="button"
                className="em-btn em-btn-ghost"
                onClick={() => setDelegationPrompt(null)}
              >
                Later
              </button>
              <button
                type="button"
                className="em-btn em-btn-primary"
                onClick={() => {
                  setDelegationPrompt(null);
                  onGenerateDelegation?.();
                }}
              >
                Generate Delegation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}