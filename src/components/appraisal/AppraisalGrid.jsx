import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ColumnFilter } from "./ColumnFilter";
import { COLUMNS, formatValue } from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";

// ============================================================
// EDITABLE COLUMNS
// ============================================================

const editableCols = COLUMNS.filter((c) => c.editable === true);
const editableIndex = new Map(editableCols.map((c, i) => [c.key, i]));

// ============================================================
// COMPACT COLUMN WIDTHS
// ============================================================

const COMPACT_WIDTHS = {
  empId: 72,
  name: 145,

  designation: 105,
  reportingManager: 105,
  compManager: 95,
  appraiserTechED: 90,

  wissenExperience: 65,
  totalExperience: 65,
  lastAppraisalDate: 95,
  managerRating: 125,
  interviewCount: 65,
  rrPercent: 58,
  grossMargin: 70,

  rbToBePaid: 100,
  monthRB: 60,
  pbToBePaid: 100,
  monthPB: 60,

  currentAnnualBasePay: 125,
  targetPBAllocatedForMay: 125,
  allocatedPBAmount: 115,

  pbInstallment: 58,

  newPBToBeOffered: 115,
  newPBInstallment: 58,

  totalOfPB: 105,
  newRB: 95,
  totalBonus: 115,

  hikeAmount: 105,
  hikePct: 58,

  totalCTCWithRewards: 125,
  totalBonusHikeAmount: 120,
  totalBonusHikePct: 85,

  totalRewardsHikeAmount: 125,
  totalRewardsHikePct: 85,

  newBaseSalary: 120,
  targetPBNextYear: 120,

  eligibleForPromotion: 105,
  newTitle: 105,

  atRisk: 130,
};

// ============================================================
// STICKY COLUMN WIDTHS
// ============================================================

const SELECT_COL_WIDTH = 30;

const EMP_ID_WIDTH = COMPACT_WIDTHS.empId;
const EMP_NAME_WIDTH = COMPACT_WIDTHS.name;

const EMP_ID_LEFT = SELECT_COL_WIDTH;
const EMP_NAME_LEFT = SELECT_COL_WIDTH + EMP_ID_WIDTH;

// ============================================================
// HELPERS
// ============================================================

const widthOf = (column) =>
  COMPACT_WIDTHS[column.key] ?? Math.min(column.width ?? 120, 120);

const isNumericType = (type) =>
  type === "currency" ||
  type === "number" ||
  type === "decimal" ||
  type === "percent";

// ============================================================
// APPRAISAL GRID
// ============================================================

export function AppraisalGrid({
  rows,
  filters,
  setFilter,
  optionsFor,
  selected,
  toggleSelected,
  toggleAll,
  onRowOpen,
}) {
  const { updateCell, modified } = useAppraisal();

  const cellRefs = useRef({});
  const clickTimerRef = useRef(null);

  const [active, setActive] = useState(null);
  const [saving, setSaving] = useState({});

  // ==========================================================
  // CLEANUP CLICK TIMER
  // ==========================================================

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
    };
  }, []);

  // ==========================================================
  // FOCUS CELL
  // ==========================================================

  const focusCell = useCallback((r, c) => {
    const el = cellRefs.current[`${r}:${c}`];

    if (!el) {
      return;
    }

    el.focus();

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select();
    }
  }, []);

  // ==========================================================
  // SAVE INDICATOR
  // ==========================================================

  const flashSaved = useCallback((key) => {
    setSaving((previous) => ({
      ...previous,
      [key]: Date.now(),
    }));

    setTimeout(() => {
      setSaving((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }, 1200);
  }, []);

  // ==========================================================
  // VALUE CONVERSION
  // ==========================================================

  const convertValue = (col, raw) => {
    if (isNumericType(col.type)) {
      if (raw === "") {
        return "";
      }

      const number = Number(raw);

      return Number.isFinite(number) ? number : 0;
    }

    return raw;
  };

  // ==========================================================
  // HIKE PERCENTAGE
  // ==========================================================

  const updateHikePct = useCallback(
    (row, raw) => {
      if (raw === "") {
        updateCell(row.id, "hikePct", "");
        updateCell(row.id, "hikeAmount", "");

        flashSaved(`${row.id}:hikePct`);
        flashSaved(`${row.id}:hikeAmount`);

        return;
      }

      const basePay = Number(row.currentAnnualBasePay || 0);
      const hikePctValue = Number(raw) || 0;

      const newHikeAmount = Math.round(basePay * (hikePctValue / 100));

      updateCell(row.id, "hikePct", hikePctValue);
      updateCell(row.id, "hikeAmount", newHikeAmount);

      flashSaved(`${row.id}:hikePct`);
      flashSaved(`${row.id}:hikeAmount`);
    },
    [updateCell, flashSaved],
  );

  // ==========================================================
  // HIKE AMOUNT
  // ==========================================================

  const updateHikeAmount = useCallback(
    (row, raw) => {
      if (raw === "") {
        updateCell(row.id, "hikeAmount", "");
        updateCell(row.id, "hikePct", "");

        flashSaved(`${row.id}:hikeAmount`);
        flashSaved(`${row.id}:hikePct`);

        return;
      }

      const basePay = Number(row.currentAnnualBasePay || 0);
      const hikeAmountValue = Number(raw) || 0;

      const newHikePct = basePay
        ? Number(((hikeAmountValue / basePay) * 100).toFixed(1))
        : 0;

      updateCell(row.id, "hikeAmount", hikeAmountValue);
      updateCell(row.id, "hikePct", newHikePct);

      flashSaved(`${row.id}:hikeAmount`);
      flashSaved(`${row.id}:hikePct`);
    },
    [updateCell, flashSaved],
  );

  // ==========================================================
  // NORMAL CELL COMMIT
  // ==========================================================

  const commit = useCallback(
    (row, col, raw) => {
      if (col.key === "hikePct") {
        updateHikePct(row, raw);
        return;
      }

      if (col.key === "hikeAmount") {
        updateHikeAmount(row, raw);
        return;
      }

      const value = convertValue(col, raw);

      if (String(row[col.key] ?? "") === String(value)) {
        return;
      }

      updateCell(row.id, col.key, value);

      flashSaved(`${row.id}:${col.key}`);
    },
    [updateCell, flashSaved, updateHikePct, updateHikeAmount],
  );

  // ==========================================================
  // KEYBOARD NAVIGATION
  // ==========================================================

  const onKeyDown = (e, r, c) => {
    const maxRow = rows.length - 1;
    const maxCol = editableCols.length - 1;
    const target = e.target;

    const atStart =
      !("selectionStart" in target) || target.selectionStart === 0;

    const atEnd =
      !("selectionEnd" in target) ||
      target.selectionEnd === (target.value?.length ?? 0);

    if (e.key === "Enter") {
      if (target instanceof HTMLTextAreaElement && !e.shiftKey) {
        return;
      }

      e.preventDefault();

      focusCell(e.shiftKey ? Math.max(0, r - 1) : Math.min(maxRow, r + 1), c);

      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(Math.min(maxRow, r + 1), c);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(Math.max(0, r - 1), c);
      return;
    }

    if (e.key === "ArrowRight" && atEnd) {
      if (c < maxCol) {
        e.preventDefault();
        focusCell(r, c + 1);
      }

      return;
    }

    if (e.key === "ArrowLeft" && atStart) {
      if (c > 0) {
        e.preventDefault();
        focusCell(r, c - 1);
      }

      return;
    }

    if (e.key === "Escape") {
      target.blur();
    }
  };

  // ==========================================================
  // SINGLE CLICK / DOUBLE CLICK
  // ==========================================================

  const handleCellClick = useCallback(
    (row, isEditable) => {
      // Read-only cells open details immediately.
      if (!isEditable) {
        onRowOpen(row);
        return;
      }

      // Editable cells wait briefly so a double-click can
      // enter edit mode instead of opening the drawer.
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }

      clickTimerRef.current = setTimeout(() => {
        onRowOpen(row);
        clickTimerRef.current = null;
      }, 220);
    },
    [onRowOpen],
  );

  // ==========================================================
  // EDITABLE DOUBLE CLICK
  // ==========================================================

  const handleEditableDoubleClick = useCallback(
    (event, rowIndex, editableColumnIndex) => {
      event.stopPropagation();

      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      const element = cellRefs.current[`${rowIndex}:${editableColumnIndex}`];

      if (!element) {
        return;
      }

      element.focus();

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        element.select();
      }
    },
    [],
  );

  // ==========================================================
  // SELECTION
  // ==========================================================

  const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);

  // ==========================================================
  // HEADERS
  // ==========================================================

  const headers = useMemo(
    () =>
      COLUMNS.map((c) => ({
        key: c.key,
        label: c.label,
        width: widthOf(c),
      })),
    [],
  );

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div
      className={cn(
        "relative isolate overflow-auto",
        "rounded-md border border-border bg-card",
      )}
      style={{
        height: "calc(100vh - 140px)",
        minHeight: 0,
      }}
    >
      <table
        className={cn(
          "relative w-max",
          "border-separate border-spacing-0",
          "text-[10px]",
        )}
        style={{
          tableLayout: "fixed",
        }}
      >
        {/* ====================================================
            HEADER
        ==================================================== */}

        <thead>
          <tr>
            {/* =================================================
                STICKY SELECTION HEADER
            ================================================= */}

            <th
              className={cn(
                "sticky top-0 left-0",
                "z-[500]",
                "border-r border-b border-grid-line",
                "bg-grid-header",
                "px-0.5 py-1",
              )}
              style={{
                position: "sticky",
                top: 0,
                left: 0,
                width: SELECT_COL_WIDTH,
                minWidth: SELECT_COL_WIDTH,
                maxWidth: SELECT_COL_WIDTH,
                boxSizing: "border-box",
              }}
            >
              <div className="flex items-center justify-center pl-1">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(value) => toggleAll(!!value)}
                  aria-label="Select all"
                />
              </div>
            </th>

            {/* =================================================
                COLUMN HEADERS
            ================================================= */}

            {headers.map((header, index) => {
              const isEmpId = index === 0;
              const isEmployeeName = index === 1;
              const isSticky = isEmpId || isEmployeeName;

              const stickyLeft = isEmpId
                ? EMP_ID_LEFT
                : isEmployeeName
                  ? EMP_NAME_LEFT
                  : undefined;

              return (
                <th
                  key={header.key}
                  className={cn(
                    "sticky top-0",
                    isSticky
                      ? "z-[500] bg-grid-header"
                      : "z-[400] bg-grid-header",
                    "border-r border-b border-grid-line",
                    "px-1 py-1",
                    "text-left text-[8px]",
                    "font-semibold uppercase",
                    "tracking-wide text-muted-foreground",
                  )}
                  style={{
                    position: "sticky",
                    top: 0,
                    left: stickyLeft,
                    width: header.width,
                    minWidth: header.width,
                    maxWidth: header.width,
                    boxSizing: "border-box",
                  }}
                >
                  <div className="flex min-w-0 items-center justify-between gap-0.5">
                    <span className="truncate" title={header.label}>
                      {header.label}
                    </span>

                    <ColumnFilter
                      columnKey={header.key}
                      filter={filters[header.key]}
                      options={optionsFor(header.key)}
                      onChange={(filter) => setFilter(header.key, filter)}
                    />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        {/* ====================================================
            BODY
        ==================================================== */}

        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id} className="group">
              {/* =================================================
                  STICKY SELECTION COLUMN
              ================================================= */}

              <td
                className={cn(
                  "sticky left-0",
                  "z-[300]",
                  "border-r border-b border-grid-line",
                  "!bg-card",
                  "px-0 py-0 align-middle",
                )}
                style={{
                  position: "sticky",
                  left: 0,
                  width: SELECT_COL_WIDTH,
                  minWidth: SELECT_COL_WIDTH,
                  maxWidth: SELECT_COL_WIDTH,
                  boxSizing: "border-box",
                  backgroundColor: "hsl(var(--card))",
                }}
                onClick={() => onRowOpen(row)}
              >
                <div className="flex items-center justify-center pl-1">
                  <Checkbox
                    checked={!!selected[row.id]}
                    onCheckedChange={(value) => toggleSelected(row.id, !!value)}
                    aria-label={`Select ${row.name}`}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>
              </td>

              {/* =================================================
                  ALL DATA COLUMNS
              ================================================= */}

              {COLUMNS.map((col, columnIndex) => {
                const cellKey = `${row.id}:${col.key}`;

                const isModified = !!modified[cellKey];

                const editableColumnIndex = editableIndex.get(col.key);

                const isActive =
                  active === `${rowIndex}:${editableColumnIndex}`;

                const isSticky = columnIndex === 0 || columnIndex === 1;

                const stickyLeft =
                  columnIndex === 0
                    ? EMP_ID_LEFT
                    : columnIndex === 1
                      ? EMP_NAME_LEFT
                      : undefined;

                const columnWidth = widthOf(col);

                const isNewTitleDisabled =
                  col.key === "newTitle" && row.eligibleForPromotion !== "Yes";

                // ==================================================
                // IMPORTANT:
                // NO SPECIAL AT-RISK LOGIC.
                //
                // Every textarea behaves exactly the same way.
                // COLUMNS controls whether it is editable.
                // ==================================================

                const isTextarea = col.type === "textarea";

                const isEditable = col.editable === true;

                return (
                  <td
                    key={col.key}
                    className={cn(
                      "border-r border-b border-grid-line",
                      "px-0 py-0 align-middle",
                      "overflow-hidden",

                      "relative z-0 bg-transparent",

                      !isSticky && isModified && "bg-cell-modified/70",

                      !isSticky && "group-hover:bg-accent/40",

                      isActive && "ring-2 ring-primary ring-inset",

                      isNewTitleDisabled && "bg-muted/20",
                    )}
                    style={{
                      position: "relative",
                      width: columnWidth,
                      minWidth: columnWidth,
                      maxWidth: columnWidth,
                      boxSizing: "border-box",
                    }}
                    onClick={() => handleCellClick(row, isEditable)}
                  >
                    <div
                      className={cn(
                        "relative h-full min-h-6",
                        isSticky && "sticky z-[300] !bg-card",
                      )}
                      style={{
                        ...(isSticky
                          ? {
                              left: stickyLeft,
                              width: columnWidth,
                              minWidth: columnWidth,
                              maxWidth: columnWidth,
                              boxSizing: "border-box",
                              backgroundColor: "hsl(var(--card))",
                            }
                          : {}),
                      }}
                    >
                      {/* =================================================
                        COMPUTED FIELD
                    ================================================= */}

                      {col.computed ? (
                        <div
                          className={cn(
                            "w-full truncate",
                            "px-1 py-1",
                            "text-right text-[9px]",
                            "font-medium",
                            "font-sans",
                            isModified
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                          title="Calculated automatically"
                        >
                          {col.type === "currency"
                            ? formatValue(row, col).replace(/^₹/, "")
                            : formatValue(row, col)}
                        </div>
                      ) : !isEditable ? (
                        /* =================================================
                         READ ONLY FIELD
                      ================================================= */

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRowOpen(row);
                          }}
                          className={cn(
                            "relative z-[1]",
                            "block w-full truncate",
                            "px-1 py-1",
                            "text-left text-[9px]",
                            "font-sans",

                            col.key === "name" &&
                              "font-medium text-foreground hover:text-primary",

                            col.key === "empId" &&
                              "text-[9px] text-muted-foreground",
                          )}
                        >
                          {String(row[col.key] ?? "")}
                        </button>
                      ) : col.type === "enum" ? (
                        /* =================================================
                         ENUM FIELD
                      ================================================= */

                        <select
                          ref={(element) => {
                            cellRefs.current[
                              `${rowIndex}:${editableColumnIndex}`
                            ] = element;
                          }}
                          value={String(row[col.key] ?? "")}
                          disabled={isNewTitleDisabled}
                          onFocus={() =>
                            setActive(`${rowIndex}:${editableColumnIndex}`)
                          }
                          onBlur={() => setActive(null)}
                          onKeyDown={(event) =>
                            onKeyDown(event, rowIndex, editableColumnIndex)
                          }
                          onDoubleClick={(event) =>
                            handleEditableDoubleClick(
                              event,
                              rowIndex,
                              editableColumnIndex,
                            )
                          }
                          onChange={(event) => {
                            updateCell(row.id, col.key, event.target.value);

                            flashSaved(cellKey);
                          }}
                          className={cn(
                            "relative z-[1]",
                            "h-6 w-full",
                            "cursor-pointer",
                            "appearance-none",
                            "bg-transparent",
                            "px-1",
                            "text-[9px]",
                            "font-sans",
                            "outline-none",

                            isNewTitleDisabled &&
                              "cursor-not-allowed opacity-50",
                          )}
                        >
                          <option value="">Select...</option>

                          {(col.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : isTextarea ? (
                        /* =================================================
                         GENERIC TEXTAREA
                         
                         No At Risk-specific handling.
                         ================================================= */

                        <textarea
                          ref={(element) => {
                            cellRefs.current[
                              `${rowIndex}:${editableColumnIndex}`
                            ] = element;
                          }}
                          value={String(row[col.key] ?? "")}
                          onFocus={() =>
                            setActive(`${rowIndex}:${editableColumnIndex}`)
                          }
                          onChange={(event) => {
                            updateCell(row.id, col.key, event.target.value);
                            flashSaved(cellKey);
                          }}
                          onBlur={(event) => {
                            setActive(null);

                            commit(row, col, event.target.value);
                          }}
                          onKeyDown={(event) =>
                            onKeyDown(event, rowIndex, editableColumnIndex)
                          }
                          onDoubleClick={(event) =>
                            handleEditableDoubleClick(
                              event,
                              rowIndex,
                              editableColumnIndex,
                            )
                          }
                          className={cn(
                            "relative z-[1]",
                            "h-6 min-h-6 w-full",
                            "resize-none",
                            "overflow-hidden",
                            "bg-transparent",
                            "px-1 py-1",
                            "text-[9px]",
                            "font-sans",
                            "outline-none",
                          )}
                        />
                      ) : (
                        /* =================================================
                         TEXT / NUMBER / DATE INPUT
                      ================================================= */

                        <div className="relative z-[1]">
                          <input
                            ref={(element) => {
                              cellRefs.current[
                                `${rowIndex}:${editableColumnIndex}`
                              ] = element;
                            }}
                            type={col.type === "date" ? "date" : "text"}
                            value={String(row[col.key] ?? "")}
                            inputMode={
                              isNumericType(col.type) ? "decimal" : undefined
                            }
                            onFocus={(event) => {
                              setActive(`${rowIndex}:${editableColumnIndex}`);

                              if (col.type !== "date") {
                                event.currentTarget.select();
                              }
                            }}
                            onChange={(event) => {
                              const raw = event.target.value;

                              if (col.key === "hikePct") {
                                updateHikePct(row, raw);
                                return;
                              }

                              if (col.key === "hikeAmount") {
                                updateHikeAmount(row, raw);
                                return;
                              }

                              if (col.type === "date") {
                                updateCell(row.id, col.key, raw);

                                flashSaved(cellKey);
                                return;
                              }

                              if (
                                col.type === "text" ||
                                col.type === "textarea"
                              ) {
                                updateCell(row.id, col.key, raw);

                                flashSaved(cellKey);
                                return;
                              }

                              if (raw === "") {
                                updateCell(row.id, col.key, "");
                                return;
                              }

                              const numericValue = Number(raw);

                              if (Number.isFinite(numericValue)) {
                                updateCell(row.id, col.key, numericValue);

                                flashSaved(cellKey);
                              }
                            }}
                            onBlur={(event) => {
                              setActive(null);

                              if (
                                col.key === "hikePct" ||
                                col.key === "hikeAmount"
                              ) {
                                return;
                              }

                              if (isNumericType(col.type)) {
                                commit(row, col, event.target.value);
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                if (
                                  col.key !== "hikePct" &&
                                  col.key !== "hikeAmount"
                                ) {
                                  commit(row, col, event.target.value);
                                }
                              }

                              onKeyDown(event, rowIndex, editableColumnIndex);
                            }}
                            onDoubleClick={(event) =>
                              handleEditableDoubleClick(
                                event,
                                rowIndex,
                                editableColumnIndex,
                              )
                            }
                            className={cn(
                              "h-6 w-full",
                              "bg-transparent",
                              "px-1 py-1",
                              "text-[9px]",
                              "font-sans",
                              "outline-none",

                              isNumericType(col.type) &&
                                "font-medium text-foreground",

                              isNumericType(col.type) && "text-right",

                              "font-variant-numeric:tabular-nums",
                            )}
                          />

                          {/* Save indicator */}

                          {saving[cellKey] !== undefined && (
                            <span
                              className={cn(
                                "pointer-events-none",
                                "absolute top-1/2 right-0",
                                "-translate-y-1/2",
                                "text-status-submitted",
                              )}
                            >
                              <Check className="size-2.5" />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}

          {/* =====================================================
              EMPTY STATE
          ===================================================== */}

          {rows.length === 0 && (
            <tr>
              <td
                colSpan={headers.length + 1}
                className={cn(
                  "px-3 py-6",
                  "text-center",
                  "text-[10px]",
                  "text-muted-foreground",
                )}
              >
                No employees match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
