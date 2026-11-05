import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  GraduationCap,
  History,
  Search,
  Upload,
  X,
} from "lucide-react";

import { AppShell } from "@/components/appraisal/AppShell";
import { AppraisalGrid, isCampusHire } from "@/components/appraisal/AppraisalGrid";
import { AuditPanel } from "@/components/appraisal/AuditTrail";
import {
  BudgetStatsBar,
  resolveBudgetAllocated,
  sumBudgetConsumed,
  sumTargetPB,
} from "@/components/appraisal/BudgetStatsBar";
import { useAppraisalImport } from "@/components/appraisal/ImportAppraisalButton"; // <-- update path if your file is named differently

import { Input } from "@/components/ui/input";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { cn } from "@/lib/utils";
import { showNotice } from "@/lib/show-notice";
import { useAppraisal, LAST_EDIT_STORAGE_KEY } from "@/lib/appraisal-store";
import { useBudget } from "@/lib/budget-store";
import { useDistributionBudget } from "@/lib/distribution-budget";
import { useNotices } from "@/lib/notices";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useViewAs, currentUserMatchesManager } from "@/lib/view-as-store";

import {
  applyFilters,
  describeFilter,
  isEmptyFilter,
  optionsFor as optionsForField,
  fieldByKey,
} from "@/lib/appraisal-filters";

import { exportToExcel } from "@/lib/export-excel";
import { manualEditedEmpIds } from "@/lib/dashboard-overview";
import { useAccess } from "@/lib/access-store";
import { useSettings } from "@/lib/settings-store";
import { NotificationBell } from "@/components/appraisal/NotificationBell";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";


// ============================================================
// PAGE
// ============================================================

export function SheetPage() {
  const {
    rows,
    audit,
    error: loadError,
    saveError,
    clearSaveError,
    showingSaved,
  } = useAppraisal();
  const {
    totals: budgetMasterTotals,
    loading: budgetLoading,
    error: budgetError,
  } = useBudget();
  const { openImportPicker, importUi } = useAppraisalImport();
  const catalystUser = useCatalystUser();
  const { effectiveId, actualId } = useViewAs();

  const isCompManagerPreview = effectiveId === "compmanager" && actualId === "teched";
  const role = String(catalystUser?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  const isHR = role.includes("hr");
  // Access rules (permissive when accessapi is unavailable).
  const access = useAccess();
  const { settings } = useSettings();
  const sheetEditable = access.canScreen("appraisalSheet", "edit");
  const canImport = sheetEditable && access.canAction("importAppraisal");
  const canExport = access.canAction("exportGrid");
  const canViewAudit = access.canAction("viewAudit");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState({});

  // History starts hidden; the user turns it on with the toggle when needed.
  const [showHistory, setShowHistory] = useState(false);
  const [showEditedOnly, setShowEditedOnly] = useState(false);
  // Campus Hire toggle: off = everyone; on = only employees whose Source of
  // Hire is Campus Hire. Off by default.
  const [campusOnly, setCampusOnly] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const [auditOpen, setAuditOpen] = useState(false);
  const [lastEditedTarget, setLastEditedTarget] = useState("");
  const { notices: dynamicNotices, dismiss: dismissNotice } = useNotices();

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

  // Sequential by Employee ID (EMP001, EMP002, ... EMP010).
  const appraisalRows = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            String(row.status || "").trim().toLowerCase() === "active" &&
            String(row.eligibility || "").trim().toLowerCase() === "eligible" &&
            (!isCompManagerPreview ||
              currentUserMatchesManager(row.compManagerDisplay || row.compManager, catalystUser, rows)),
        )
        .sort((a, b) =>
          String(a.empId || "").localeCompare(String(b.empId || ""), undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        ),
    [rows, isCompManagerPreview, catalystUser],
  );

  const editedEmployeeIds = useMemo(
    () =>
      // Same rule as the Dashboard: employees edited by hand on the Appraisal
      // Sheet or the Detailed Screen (the store already limits the audit list
      // to the active cycle; bulk edits / imports are not counted).
      manualEditedEmpIds(audit),
    [audit],
  );

  const filtered = useMemo(() => {
    const baseRows = showEditedOnly
      ? appraisalRows.filter((row) =>
          editedEmployeeIds.has(String(row.empId || "").trim()),
        )
      : appraisalRows;

    const scoped = campusOnly ? baseRows.filter(isCampusHire) : baseRows;

    return applyFilters(scoped, filters, search);
  }, [appraisalRows, editedEmployeeIds, filters, search, showEditedOnly, campusOnly]);

  const setFilter = (key, f) =>
    setFilters((prev) => {
      const next = { ...prev };

      if (!f) {
        delete next[key];
      } else {
        next[key] = f;
      }

      return next;
    });


  const activeFilters = Object.entries(filters).filter(
    ([, filter]) => !isEmptyFilter(filter),
  );

  const editedCount = useMemo(
    () =>
      appraisalRows.filter((row) =>
        editedEmployeeIds.has(String(row.empId || "").trim()),
      ).length,
    [appraisalRows, editedEmployeeIds],
  );

  // The newest edit is remembered in browser storage by the store at the
  // moment it is made, so this keeps working after a refresh or re-login.
  // It is re-read whenever the audit list changes.
  const auditLastEntry =
    // The audit list is already limited to the active cycle by the store.
    audit.find((entry) => String(entry.empId || "").trim()) || null;
  const storedLastEdit = useMemo(() => {
    try {
      const raw = window.localStorage.getItem(LAST_EDIT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.empId ? parsed : null;
    } catch (_) {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit]);
  const lastEditedEntry = storedLastEdit || auditLastEntry;
  const lastEditedRow = lastEditedEntry
    ? rows.find(
        (row) => String(row.empId).trim() === String(lastEditedEntry.empId).trim(),
      )
    : null;

  // ============================================================
  // BUDGET NUMBERS
  // Consumed = the three totals in the grid's last (Total) row added
  // together: Performance Bonus (PB) + Retention Bonus (RB) + Hike Amount.
  // It sums the same rows the grid shows, so it always matches that row.
  // Utilisation = Consumed as a percentage of Budget Allocated.
  // ============================================================

  // The four budget figures are fixed: they always describe ALL employees in
  // scope and never change with the grid's column filters, search or
  // "edited only" toggle.
  const budgetRowsForStats = appraisalRows;
  const budgetConsumed = useMemo(() => sumBudgetConsumed(budgetRowsForStats), [budgetRowsForStats]);
  const budgetTargetPB = useMemo(() => sumTargetPB(budgetRowsForStats), [budgetRowsForStats]);

  // Tech-Ed / Comp Manager: Budget Allocated = Budget Distribution's
  // "Updated Budget". HR keeps the organisation Budget Master figure.
  const distributionBudget = useDistributionBudget();
  const { allocated: budgetAllocated, isEstimate: budgetIsEstimate } =
    distributionBudget.applies
      ? { allocated: distributionBudget.updatedBudget, isEstimate: false }
      : resolveBudgetAllocated({
          totals: budgetMasterTotals,
          loading: budgetLoading,
          error: budgetError,
        });

  // The three budget values now sit beside the budget notice (see below),
  // no longer in the top nav.
  const budgetVertical = settings.menuPosition === "left";

  // Notification bell (top bar): live notices (budget change, bulk edit,
  // data upload, employee status change) + the edited count.
  const notificationItems = dynamicNotices.map((notice) => ({
    key: notice.key,
    tag: notice.tag,
    text: notice.text,
    sub: notice.sub,
    actions: [
      ...(notice.kind === "budget"
        ? [
            {
              // Same in-app navigation the Detailed Screen's "View budget" uses.
              label: "View budget",
              onClick: () => {
                window.history.pushState({}, "", "/budget-distribution");
                window.dispatchEvent(new PopStateEvent("popstate"));
              },
            },
          ]
        : []),
    ],
  }));
  if (appraisalRows.length > 0) {
    const allEdited = editedCount >= appraisalRows.length;
    notificationItems.push({
      key: "edited",
      tag: "Edited",
      text: allEdited
        ? `All ${appraisalRows.length} employees edited ✓`
        : `${editedCount} of ${appraisalRows.length} employees edited`,
      sub: allEdited
        ? ""
        : `${appraisalRows.length - editedCount} still to do`,
      actions: [
        {
          label: showEditedOnly ? "Show all ›" : "Show edited ›",
          onClick: () => {
            // Turning "edited only" on also clears the search and column
            // filters, so the rows shown always match the count in this
            // notification (otherwise a leftover filter hides some of them).
            if (!showEditedOnly) setFilters({});
            setShowEditedOnly((previous) => !previous);
            setSearch("");
          },
        },
      ],
    });
  }

  return (
    <>
      <AppShell notifications={<NotificationBell items={notificationItems} />}>
        <div className={cn("flex min-h-0 flex-1 flex-col gap-2 bg-[#f3f4f6]", budgetVertical && "pl-1 pr-0 pt-0")}>
          {(saveError || loadError) && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
            >
              <span>{saveError || loadError}</span>
              {saveError && (
                <button
                  type="button"
                  onClick={clearSaveError}
                  className="shrink-0 text-xs font-medium underline"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}

          {showingSaved && !loadError && (
            <div
              role="status"
              className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] text-blue-800"
            >
              Showing the sheet as you last saw it while the latest data loads. Editing is available once it has loaded.
            </div>
          )}

          {/* TOOLBAR: search on the left, budget figures in the middle; History, Last Edited and Menu on the right */}

          <div className="flex items-center gap-2 rounded-md border border-[#d9dee7] bg-white px-3 py-2">
            <div className="relative w-[240px] shrink-0">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee name / ID / designation"
                className="h-9 border-[#cbd3df] bg-background pl-8 text-[13px]"
              />
            </div>

            <BudgetStatsBar
              className="mx-2 flex-1 border-0 bg-transparent py-0"
              allocated={budgetAllocated}
              consumed={budgetConsumed}
              targetPB={budgetTargetPB}
              isEstimate={budgetIsEstimate}
            />

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setCampusOnly((previous) => !previous)}
                aria-pressed={campusOnly}
                aria-label="Campus Hire"
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#17365d] bg-white px-3 text-[12px] font-medium text-[#17365d] hover:bg-[#f1f5f9]"
              >
                <GraduationCap className="size-3.5" />
                <span>Campus Hire</span>
                <span
                  className={cn(
                    "relative block h-[16px] w-[30px] rounded-full transition-colors duration-200",
                    campusOnly ? "bg-[#3fae6a]" : "bg-[#5c7396]",
                  )}
                >
                  <span
                    className="absolute top-[2px] left-[2px] h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-transform duration-200"
                    style={{
                      transform: campusOnly
                        ? "translateX(14px)"
                        : "translateX(0)",
                    }}
                  />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowHistory((previous) => !previous)}
                aria-pressed={showHistory}
                aria-label="History"
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#17365d] bg-white px-3 text-[12px] font-medium text-[#17365d] hover:bg-[#f1f5f9]"
              >
                <History className="size-3.5" />
                <span>History</span>
                <span
                  className={cn(
                    "relative block h-[16px] w-[30px] rounded-full transition-colors duration-200",
                    showHistory ? "bg-[#3fae6a]" : "bg-[#5c7396]",
                  )}
                >
                  <span
                    className="absolute top-[2px] left-[2px] h-[12px] w-[12px] rounded-full bg-white shadow-sm transition-transform duration-200"
                    style={{
                      transform: showHistory
                        ? "translateX(14px)"
                        : "translateX(0)",
                    }}
                  />
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!lastEditedRow) {
                    return;
                  }
                  setFilters({});
                  setSearch("");
                  setCampusOnly(false);
                  setLastEditedTarget(String(lastEditedRow.empId).trim());
                }}
                className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#17365d] bg-white px-3 text-[12px] font-medium text-[#17365d] hover:bg-[#f1f5f9]"
                title={lastEditedRow ? "Go to the last edited employee" : "No edits recorded"}
              >
                <span>↪ Last Edited</span>
              </button>
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((previous) => !previous)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#17365d] bg-[#17365d] px-4 text-[13px] font-semibold text-white hover:bg-[#123056]"
                >
                  Menu
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      menuOpen && "rotate-180",
                    )}
                  />
                </button>

                {menuOpen && (
                  <div
                    className="absolute top-full right-0 z-50 mt-1.5 w-[200px] overflow-hidden rounded-md border border-[#cbd5e1] bg-white shadow-lg"
                    role="menu"
                  >
                    {canViewAudit && (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-[#334155] hover:bg-[#f1f5f9]"
                        onClick={() => {
                          setMenuOpen(false);
                          setAuditOpen(true);
                        }}
                      >
                        <History className="size-4" />
                        <span>Audit ({audit.length})</span>
                      </button>
                    )}
                    {canImport && (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-[#334155] hover:bg-[#f1f5f9]"
                        onClick={() => {
                          setMenuOpen(false);
                          openImportPicker();
                        }}
                      >
                        <Upload className="size-4" />
                        <span>Import</span>
                      </button>
                    )}

                    {canExport && (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-[#334155] hover:bg-[#f1f5f9]"
                        onClick={() => {
                          // Export only the ticked rows; if none are ticked
                          // (or all are), export everything currently shown.
                          const ticked = filtered.filter((r) => selected[r.id]);
                          exportToExcel(ticked.length ? ticked : filtered, undefined, {
                            isHidden: access.isHidden,
                          }).catch((error) => {
                            console.error("Excel export failed:", error);
                            showNotice(
                              "Excel export failed: " +
                                (error?.message || "unknown error"),
                            );
                          });
                          setMenuOpen(false);
                        }}
                      >
                        <Download className="size-4" />
                        <span>Export</span>
                      </button>
                    )}
                    {!canViewAudit && !canImport && !canExport && (
                      <div className="px-3 py-2.5 text-[12px] text-slate-400">
                        No actions available
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-0.5">
              {activeFilters.map(([key, f]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key, undefined)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                >
                  {describeFilter(key, f)}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}

          {showEditedOnly && (
            <div className="flex flex-wrap items-center gap-1.5 px-0.5">
              <button
                type="button"
                onClick={() => setShowEditedOnly(false)}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
              >
                Edited employees: {editedCount}
                <X className="size-3" />
              </button>
            </div>
          )}

          <AppraisalGrid
            verticalLayout={budgetVertical}
            rows={filtered}
            filters={filters}
            setFilter={setFilter}
            optionsFor={(key) => optionsForField(key, rows)}
            valuesFor={(key) => {
              const field = fieldByKey(key);
              return field ? appraisalRows.map((row) => field.get(row)) : [];
            }}
            onClearAll={() => {
              setFilters({});
              setSearch("");
              setShowEditedOnly(false);
            }}
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
            toggleAll={(on, ids) =>
              // Only the rows the grid is showing (current page); other
              // pages keep their selections.
              setSelected((prev) => {
                const next = { ...prev };

                ids.forEach((id) => {
                  if (on) {
                    next[id] = true;
                  } else {
                    delete next[id];
                  }
                });

                return next;
              })
            }
            showHistory={showHistory}
            setShowHistory={setShowHistory}
            focusEmployeeId={lastEditedTarget}
            onFocusEmployeeHandled={() => setLastEditedTarget("")}
            isTechEd={isTechEd}
            isHR={isHR}
            onRequest={async (request) => {
              const isScreenRequest = request.type === "screen";
              try {
                const response = await catalystFetch(catalystFunctionUrl("accessapi") + "delegation/requests", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Accept: "application/json" },
                  body: JSON.stringify({
                    action: "submit",
                    requestType: isScreenRequest ? "screen" : "delegation",
                    empId: request.employee?.empId || request.employee?.id || "",
                    empName: request.employee?.name || "",
                    field: isScreenRequest ? "screen" :
                      request.field === "compManager" ? "comp" :
                      request.field === "appraiserTechED" ? "app" : request.field,
                    oldId: request.oldId || "",
                    newId: request.newId || "",
                    reason: request.reason || (isScreenRequest ? "Screen access requested from Appraisal Sheet" : "Requested from Appraisal Sheet"),
                    byName: catalystUser?.name || catalystUser?.email || "Application user",
                  }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to send request.");
                showNotice(isScreenRequest ? "Screen request sent to HR for approval." : "Delegation request sent to HR for approval.");
              } catch (error) {
                showNotice(error?.message || "Unable to send request to HR.");
              }
            }}
          />
        </div>
      </AppShell>

      <Dialog open={auditOpen && canViewAudit} onOpenChange={setAuditOpen}>
        <DialogContent
          className="flex max-h-[80vh] w-[90vw] max-w-3xl flex-col gap-0 overflow-hidden p-0"
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b border-[#e2e8f0] px-5 py-4">
            <DialogTitle className="text-sm font-semibold text-[#1e293b]">
              Compensation Audit Trail
            </DialogTitle>

            <p className="text-[11px] text-[#64748b]">
              {audit.length} changes recorded in this session
            </p>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            <AuditPanel entries={audit} />
          </div>
        </DialogContent>
      </Dialog>

      {importUi}
    </>
  );
}