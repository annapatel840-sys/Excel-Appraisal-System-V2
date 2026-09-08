// import { useEffect, useMemo, useRef, useState } from "react";
// import {
//   Download,
//   History,
//   Layers,
//   Menu,
//   RotateCcw,
//   Search,
//   X,
// } from "lucide-react";

// import { AppShell } from "@/components/appraisal/AppShell";
// import { AppraisalGrid } from "@/components/appraisal/AppraisalGrid";
// import { AuditPanel } from "@/components/appraisal/AuditTrail";
// import { BulkEditDialog } from "@/components/appraisal/BulkEditDialog";
// import { EmployeeDrawer } from "@/components/appraisal/EmployeeDrawer";

// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";

// import {
//   Sheet as UISheet,
//   SheetContent,
//   SheetHeader,
//   SheetTitle,
//   SheetTrigger,
// } from "@/components/ui/sheet";

// import { useAppraisal } from "@/lib/appraisal-store";

// import {
//   applyFilters,
//   describeFilter,
//   isEmptyFilter,
//   optionsFor as optionsForField,
// } from "@/lib/appraisal-filters";

// import { exportToExcel } from "@/lib/export-excel";

// export function SheetPage() {
//   const { rows, audit } = useAppraisal();

//   const [search, setSearch] = useState("");
//   const [filters, setFilters] = useState({});
//   const [selected, setSelected] = useState({});
//   const [bulkOpen, setBulkOpen] = useState(false);

//   const [drawerRowId, setDrawerRowId] = useState(null);

//   /* ============================================================
//      HISTORY TOGGLE
//      ============================================================ */

//   const [showHistory, setShowHistory] = useState(false);

//   /* ============================================================
//      MENU
//      ============================================================ */

//   const [menuOpen, setMenuOpen] = useState(false);
//   const menuRef = useRef(null);

//   /* ============================================================
//      CLOSE MENU WHEN CLICKING OUTSIDE
//      ============================================================ */

//   useEffect(() => {
//     const handleOutsideClick = (event) => {
//       if (menuRef.current && !menuRef.current.contains(event.target)) {
//         setMenuOpen(false);
//       }
//     };

//     document.addEventListener("mousedown", handleOutsideClick);

//     return () => {
//       document.removeEventListener("mousedown", handleOutsideClick);
//     };
//   }, []);

//   /*
//    * Store only the employee ID.
//    *
//    * This means when Hike % or Hike Amount changes,
//    * EmployeeDrawer receives the latest row from the store.
//    */

//   const drawerRow = useMemo(
//     () => rows.find((r) => r.id === drawerRowId) ?? null,
//     [rows, drawerRowId],
//   );

//   const filtered = useMemo(
//     () => applyFilters(rows, filters, search),
//     [rows, filters, search],
//   );

//   const setFilter = (key, f) =>
//     setFilters((prev) => {
//       const next = { ...prev };

//       if (!f || isEmptyFilter(f)) {
//         delete next[key];
//       } else {
//         next[key] = f;
//       }

//       return next;
//     });

//   const selectedIds = filtered.filter((r) => selected[r.id]).map((r) => r.id);

//   const activeFilters = Object.entries(filters);

//   /* ============================================================
//      HEADER SEARCH + ACTIONS
//      ============================================================ */

//   const headerActions = (
//     <div className="flex min-w-0 items-center gap-1.5">
//       {/* ========================================================
//           SHOW HISTORY
//           ======================================================== */}

//       <button
//         type="button"
//         onClick={() => setShowHistory((previous) => !previous)}
//         aria-pressed={showHistory}
//         aria-label="Show History"
//         className="flex shrink-0 items-center gap-2 border-0 bg-transparent p-0 outline-none"
//       >
//         <span className="text-[11px] font-medium text-[#334155]">
//           Show History
//         </span>

//         <span
//           className={`relative block h-[22px] w-[46px] rounded-full transition-colors duration-200 ${
//             showHistory ? "bg-[#39b878]" : "bg-[#647da0]"
//           }`}
//         >
//           <span
//             className="absolute top-[3px] left-[3px] h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform duration-200"
//             style={{
//               transform: showHistory ? "translateX(24px)" : "translateX(0)",
//             }}
//           />
//         </span>
//       </button>

//       {/* ========================================================
//           SEARCH
//           ======================================================== */}

//       <div className="relative w-[230px]">
//         <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />

//         <Input
//           value={search}
//           onChange={(e) => setSearch(e.target.value)}
//           placeholder="Search employee, ID, designation..."
//           className="h-7 border-border bg-background pl-7 text-[11px]"
//         />
//       </div>

//       {/* ========================================================
//           RESET
//           ======================================================== */}

//       <Button
//         variant="outline"
//         size="sm"
//         className="h-7 shrink-0 px-2 text-[10px]"
//         onClick={() => {
//           setFilters({});
//           setSearch("");
//         }}
//         disabled={activeFilters.length === 0 && !search}
//       >
//         <RotateCcw className="size-3" />
//         Reset
//       </Button>

//       {/* ========================================================
//           MENU
//           ======================================================== */}

//       <div ref={menuRef} className="relative">
//         {/* MENU BUTTON */}

//         <button
//           type="button"
//           onClick={() => setMenuOpen((previous) => !previous)}
//           aria-expanded={menuOpen}
//           aria-haspopup="menu"
//           className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[10px] font-medium text-foreground hover:bg-muted"
//         >
//           <Menu className="size-3.5" />
//           Menu
//         </button>

//         {/* MENU DROPDOWN */}

//         {menuOpen && (
//           <div
//             className="absolute top-full right-0 z-50 mt-1 w-[160px] overflow-hidden rounded-md border border-[#cbd5e1] bg-white shadow-lg"
//             role="menu"
//           >
//             {/* ==================================================
//                 BULK EDIT
//                 ================================================== */}

//             <button
//               type="button"
//               role="menuitem"
//               className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[#334155] hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-50"
//               onClick={() => {
//                 setMenuOpen(false);
//                 setBulkOpen(true);
//               }}
//               disabled={selectedIds.length === 0}
//             >
//               <Layers className="size-3.5" />

//               <span>Bulk Edit ({selectedIds.length})</span>
//             </button>

//             {/* ==================================================
//                 AUDIT
//                 ================================================== */}

//             <UISheet>
//               <SheetTrigger asChild>
//                 <button
//                   type="button"
//                   role="menuitem"
//                   className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[#334155] hover:bg-[#f1f5f9]"
//                   onClick={() => setMenuOpen(false)}
//                 >
//                   <History className="size-3.5" />

//                   <span>Audit ({audit.length})</span>
//                 </button>
//               </SheetTrigger>

//               <SheetContent className="w-full sm:max-w-xl">
//                 <SheetHeader>
//                   <SheetTitle>Compensation Audit Trail</SheetTitle>
//                 </SheetHeader>

//                 <div className="overflow-y-auto px-4 pb-6">
//                   <AuditPanel entries={audit} />
//                 </div>
//               </SheetContent>
//             </UISheet>

//             {/* ==================================================
//                 EXPORT
//                 ================================================== */}

//             <button
//               type="button"
//               role="menuitem"
//               className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[#334155] hover:bg-[#f1f5f9]"
//               onClick={() => {
//                 exportToExcel(filtered);
//                 setMenuOpen(false);
//               }}
//             >
//               <Download className="size-3.5" />

//               <span>Export</span>
//             </button>
//           </div>
//         )}
//       </div>
//     </div>
//   );

//   /* ============================================================
//      PAGE
//      ============================================================ */

//   return (
//     <>
//       <AppShell headerActions={headerActions}>
//         <div className="space-y-1.5">
//           {/* ======================================================
//               COMPACT PAGE HEADING
//               ====================================================== */}

//           <div className="flex items-center justify-between px-0.5">
//             <div>
//               <h2 className="text-lg font-semibold tracking-tight">
//                 Appraisal Sheet
//               </h2>
//             </div>

//             <div className="text-right text-[10px] text-muted-foreground">
//               <span className="num font-semibold text-foreground">
//                 {filtered.length}
//               </span>{" "}
//               / {rows.length}
//             </div>
//           </div>

//           {/* ======================================================
//               ACTIVE FILTERS
//               ====================================================== */}

//           {activeFilters.length > 0 && (
//             <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1">
//               {activeFilters.map(([key, f]) => (
//                 <button
//                   key={key}
//                   onClick={() => setFilter(key, undefined)}
//                   className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-medium text-primary hover:bg-primary/20"
//                 >
//                   {describeFilter(key, f)}

//                   <X className="size-2.5" />
//                 </button>
//               ))}
//             </div>
//           )}

//           {/* ======================================================
//               SELECTED EMPLOYEE DETAILS
//               ====================================================== */}

//           {drawerRow && (
//             <EmployeeDrawer
//               employee={drawerRow}
//               onOpenChange={(open) => {
//                 if (!open) {
//                   setDrawerRowId(null);
//                 }
//               }}
//             />
//           )}

//           {/* ======================================================
//               COMPACT GRID STATUS
//               ====================================================== */}

//           <div className="flex items-center justify-between px-0.5 text-[9px] text-muted-foreground">
//             <span>
//               Showing{" "}
//               <span className="num font-medium text-foreground">
//                 {filtered.length}
//               </span>{" "}
//               of {rows.length}
//             </span>

//             <span>Modified cells save automatically.</span>
//           </div>

//           {/* ======================================================
//               GRID
//               ====================================================== */}

//           <AppraisalGrid
//             rows={filtered}
//             filters={filters}
//             setFilter={setFilter}
//             optionsFor={(key) => optionsForField(key, rows)}
//             selected={selected}
//             toggleSelected={(id, on) =>
//               setSelected((prev) => {
//                 const next = { ...prev };

//                 if (on) {
//                   next[id] = true;
//                 } else {
//                   delete next[id];
//                 }

//                 return next;
//               })
//             }
//             toggleAll={(on) =>
//               setSelected(
//                 on ? Object.fromEntries(filtered.map((r) => [r.id, true])) : {},
//               )
//             }
//             onRowOpen={(employee) => setDrawerRowId(employee.id)}
//             showHistory={showHistory}
//             setShowHistory={setShowHistory}
//           />
//         </div>
//       </AppShell>

//       {/* ========================================================
//           BULK EDIT DIALOG
//           ======================================================== */}

//       <BulkEditDialog
//         open={bulkOpen}
//         onOpenChange={setBulkOpen}
//         ids={selectedIds}
//         onDone={() => setSelected({})}
//       />
//     </>
//   );
// }

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  History,
  Layers,
  Menu,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

import { AppShell } from "@/components/appraisal/AppShell";
import { AppraisalGrid } from "@/components/appraisal/AppraisalGrid";
import { AuditPanel } from "@/components/appraisal/AuditTrail";
import { BulkEditDialog } from "@/components/appraisal/BulkEditDialog";
import { EmployeeDrawer } from "@/components/appraisal/EmployeeDrawer";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Sheet as UISheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { useAppraisal } from "@/lib/appraisal-store";

import {
  applyFilters,
  describeFilter,
  isEmptyFilter,
  optionsFor as optionsForField,
} from "@/lib/appraisal-filters";

import { exportToExcel } from "@/lib/export-excel";

export function SheetPage() {
  const { rows, audit } = useAppraisal();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState({});
  const [bulkOpen, setBulkOpen] = useState(false);

  const [drawerRowId, setDrawerRowId] = useState(null);

  /* ============================================================
     HISTORY TOGGLE
     ============================================================ */

  const [showHistory, setShowHistory] = useState(false);

  /* ============================================================
     MENU
     ============================================================ */

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  /* ============================================================
     CLOSE MENU WHEN CLICKING OUTSIDE
     ============================================================ */

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  /*
   * Store only the employee ID.
   *
   * This means when Hike % or Hike Amount changes,
   * EmployeeDrawer receives the latest row from the store.
   */

  const drawerRow = useMemo(
    () => rows.find((r) => r.id === drawerRowId) ?? null,
    [rows, drawerRowId],
  );

  /* ============================================================
     ELIGIBILITY + SEARCH + FILTERS
     ============================================================ */

  const filtered = useMemo(() => {
    /*
     * Employee Master is the source of truth for eligibility.
     *
     * Employees marked "No" are hidden from the Appraisal Sheet.
     *
     * We DO NOT delete them from appraisal rows.
     * If they become eligible again, they can appear again.
     */
    const eligibleRows = rows.filter((row) => row.eligibility !== "No");

    return applyFilters(eligibleRows, filters, search);
  }, [rows, filters, search]);

  const setFilter = (key, f) =>
    setFilters((prev) => {
      const next = { ...prev };

      if (!f || isEmptyFilter(f)) {
        delete next[key];
      } else {
        next[key] = f;
      }

      return next;
    });

  const selectedIds = filtered.filter((r) => selected[r.id]).map((r) => r.id);

  const activeFilters = Object.entries(filters);

  /* ============================================================
     HEADER SEARCH + ACTIONS
     ============================================================ */

  const headerActions = (
    <div className="flex min-w-0 items-center gap-1.5">
      {/* ========================================================
          SHOW HISTORY
          ======================================================== */}

      <button
        type="button"
        onClick={() => setShowHistory((previous) => !previous)}
        aria-pressed={showHistory}
        aria-label="Show History"
        className="flex shrink-0 items-center gap-2 border-0 bg-transparent p-0 outline-none"
      >
        <span className="text-[11px] font-medium text-[#334155]">
          Show History
        </span>

        <span
          className={`relative block h-[22px] w-[46px] rounded-full transition-colors duration-200 ${
            showHistory ? "bg-[#39b878]" : "bg-[#647da0]"
          }`}
        >
          <span
            className="absolute top-[3px] left-[3px] h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform duration-200"
            style={{
              transform: showHistory ? "translateX(24px)" : "translateX(0)",
            }}
          />
        </span>
      </button>

      {/* ========================================================
          SEARCH
          ======================================================== */}

      <div className="relative w-[230px]">
        <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee, ID, designation..."
          className="h-7 border-border bg-background pl-7 text-[11px]"
        />
      </div>

      {/* ========================================================
          RESET
          ======================================================== */}

      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 px-2 text-[10px]"
        onClick={() => {
          setFilters({});
          setSearch("");
        }}
        disabled={activeFilters.length === 0 && !search}
      >
        <RotateCcw className="size-3" />
        Reset
      </Button>

      {/* ========================================================
          MENU
          ======================================================== */}

      <div ref={menuRef} className="relative">
        {/* MENU BUTTON */}

        <button
          type="button"
          onClick={() => setMenuOpen((previous) => !previous)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[10px] font-medium text-foreground hover:bg-muted"
        >
          <Menu className="size-3.5" />
          Menu
        </button>

        {/* MENU DROPDOWN */}

        {menuOpen && (
          <div
            className="absolute top-full right-0 z-50 mt-1 w-[160px] overflow-hidden rounded-md border border-[#cbd5e1] bg-white shadow-lg"
            role="menu"
          >
            {/* ==================================================
                BULK EDIT
                ================================================== */}

            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[#334155] hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                setMenuOpen(false);
                setBulkOpen(true);
              }}
              disabled={selectedIds.length === 0}
            >
              <Layers className="size-3.5" />

              <span>Bulk Edit ({selectedIds.length})</span>
            </button>

            {/* ==================================================
                AUDIT
                ================================================== */}

            <UISheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[#334155] hover:bg-[#f1f5f9]"
                  onClick={() => setMenuOpen(false)}
                >
                  <History className="size-3.5" />

                  <span>Audit ({audit.length})</span>
                </button>
              </SheetTrigger>

              <SheetContent className="w-full sm:max-w-xl">
                <SheetHeader>
                  <SheetTitle>Compensation Audit Trail</SheetTitle>
                </SheetHeader>

                <div className="overflow-y-auto px-4 pb-6">
                  <AuditPanel entries={audit} />
                </div>
              </SheetContent>
            </UISheet>

            {/* ==================================================
                EXPORT
                ================================================== */}

            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[#334155] hover:bg-[#f1f5f9]"
              onClick={() => {
                exportToExcel(filtered);
                setMenuOpen(false);
              }}
            >
              <Download className="size-3.5" />

              <span>Export</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  /* ============================================================
     PAGE
     ============================================================ */

  return (
    <>
      <AppShell headerActions={headerActions}>
        <div className="space-y-1.5">
          {/* ======================================================
              COMPACT PAGE HEADING
              ====================================================== */}

          <div className="flex items-center justify-between px-0.5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Appraisal Sheet
              </h2>
            </div>

            <div className="text-right text-[10px] text-muted-foreground">
              <span className="num font-semibold text-foreground">
                {filtered.length}
              </span>{" "}
              / {rows.length}
            </div>
          </div>

          {/* ======================================================
              ACTIVE FILTERS
              ====================================================== */}

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1">
              {activeFilters.map(([key, f]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key, undefined)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-medium text-primary hover:bg-primary/20"
                >
                  {describeFilter(key, f)}

                  <X className="size-2.5" />
                </button>
              ))}
            </div>
          )}

          {/* ======================================================
              SELECTED EMPLOYEE DETAILS
              ====================================================== */}

          {drawerRow && (
            <EmployeeDrawer
              employee={drawerRow}
              onOpenChange={(open) => {
                if (!open) {
                  setDrawerRowId(null);
                }
              }}
            />
          )}

          {/* ======================================================
              COMPACT GRID STATUS
              ====================================================== */}

          <div className="flex items-center justify-between px-0.5 text-[9px] text-muted-foreground">
            <span>
              Showing{" "}
              <span className="num font-medium text-foreground">
                {filtered.length}
              </span>{" "}
              of {rows.length}
            </span>

            <span>Modified cells save automatically.</span>
          </div>

          {/* ======================================================
              GRID
              ====================================================== */}

          <AppraisalGrid
            rows={filtered}
            filters={filters}
            setFilter={setFilter}
            optionsFor={(key) => optionsForField(key, rows)}
            selected={selected}
            toggleSelected={(id, on) =>
              setSelected((prev) => {
                const next = { ...prev };

                if (on) {
                  next[id] = true;
                } else {
                  delete next[id];
                }

                return next;
              })
            }
            toggleAll={(on) =>
              setSelected(
                on ? Object.fromEntries(filtered.map((r) => [r.id, true])) : {},
              )
            }
            onRowOpen={(employee) => setDrawerRowId(employee.id)}
            showHistory={showHistory}
            setShowHistory={setShowHistory}
          />
        </div>
      </AppShell>

      {/* ========================================================
          BULK EDIT DIALOG
          ======================================================== */}

      <BulkEditDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        ids={selectedIds}
        onDone={() => setSelected({})}
      />
    </>
  );
}
