import { useMemo, useState } from "react";
import { Download, History, Layers, RotateCcw, Search, X } from "lucide-react";

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

  /*
   * IMPORTANT:
   *
   * Store only the employee ID.
   *
   * This means when Hike % or Hike Amount changes,
   * EmployeeDrawer receives the latest row from the store.
   */
  const drawerRow = useMemo(
    () => rows.find((r) => r.id === drawerRowId) ?? null,
    [rows, drawerRowId],
  );

  const filtered = useMemo(
    () => applyFilters(rows, filters, search),
    [rows, filters, search],
  );

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

  /*
   * Header search + actions
   */
  const headerActions = (
    <div className="flex min-w-0 items-center gap-1.5">
      {/* Search */}
      <div className="relative w-[230px]">
        <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee, ID, department..."
          className="h-7 border-border bg-background pl-7 text-[11px]"
        />
      </div>

      {/* Reset */}
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

      {/* Bulk Edit */}
      <Button
        size="sm"
        className="h-7 shrink-0 px-2 text-[10px]"
        onClick={() => setBulkOpen(true)}
        disabled={selectedIds.length === 0}
      >
        <Layers className="size-3" />
        Bulk ({selectedIds.length})
      </Button>

      {/* Audit */}
      <UISheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 px-2 text-[10px]"
          >
            <History className="size-3" />
            Audit ({audit.length})
          </Button>
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

      {/* Export */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 px-2 text-[10px]"
        onClick={() => exportToExcel(filtered)}
      >
        <Download className="size-3" />
        Export
      </Button>
    </div>
  );

  return (
    <>
      <AppShell headerActions={headerActions}>
        <div className="space-y-1.5">
          {/* Compact page heading */}
          <div className="flex items-center justify-between px-0.5">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Appraisal Sheet
              </h2>

              <p className="text-[10px] text-muted-foreground">
                Click an employee for details · Double-click editable cells to
                edit
              </p>
            </div>

            <div className="text-right text-[10px] text-muted-foreground">
              <span className="num font-semibold text-foreground">
                {filtered.length}
              </span>{" "}
              / {rows.length}
            </div>
          </div>

          {/* Active filters */}
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

          {/* Selected employee details */}
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

          {/* Compact grid status */}
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

          {/* Grid */}
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
          />
        </div>
      </AppShell>

      <BulkEditDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        ids={selectedIds}
        onDone={() => setSelected({})}
      />
    </>
  );
}
