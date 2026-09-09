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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  const [showHistory, setShowHistory] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const [auditOpen, setAuditOpen] = useState(false);

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

  const drawerRow = useMemo(
    () => rows.find((r) => r.id === drawerRowId) ?? null,
    [rows, drawerRowId],
  );

  const filtered = useMemo(() => {
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

  const headerActions = (
    <div className="flex min-w-0 items-center gap-1.5">
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

      <div className="relative w-[230px]">
        <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee, ID, designation..."
          className="h-7 border-border bg-background pl-7 text-[11px]"
        />
      </div>

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

      <div ref={menuRef} className="relative">
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

        {menuOpen && (
          <div
            className="absolute top-full right-0 z-50 mt-1 w-[160px] overflow-hidden rounded-md border border-[#cbd5e1] bg-white shadow-lg"
            role="menu"
          >
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

            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[#334155] hover:bg-[#f1f5f9]"
              onClick={() => {
                setMenuOpen(false);
                setAuditOpen(true);
              }}
            >
              <History className="size-3.5" />
              <span>Audit ({audit.length})</span>
            </button>

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

  return (
    <>
      <AppShell headerActions={headerActions}>
        <div className="space-y-1.5">
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
          AUDIT TRAIL CENTER POPUP
          ======================================================== */}

      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent
          className="flex max-h-[80vh] w-[90vw] max-w-3xl flex-col gap-0 overflow-hidden p-0"
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b border-[#e2e8f0] px-5 py-4">
            <DialogTitle className="text-sm font-semibold text-[#1e293b]">
              Compensation Audit Trail
            </DialogTitle>

            <p className="text-[10px] text-[#64748b]">
              {audit.length} changes recorded in this session
            </p>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            <AuditPanel entries={audit} />
          </div>
        </DialogContent>
      </Dialog>

      <BulkEditDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        ids={selectedIds}
        onDone={() => setSelected({})}
      />
    </>
  );
}
