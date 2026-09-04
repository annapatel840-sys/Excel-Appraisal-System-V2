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
// COLUMN WIDTHS
// ============================================================

const COMPACT_WIDTHS = {
  empId: 72,
  name: 145,

  designation: 90,
  reportingManager: 90,
  compManager: 85,
  appraiserTechED: 80,

  wissenExperience: 58,
  totalExperience: 58,
  lastAppraisalDate: 85,
  managerRating: 105,
  interviewCount: 58,
  rrPercent: 58,
  grossMargin: 65,

  rbToBePaid: 85,
  monthRB: 55,
  pbToBePaid: 85,
  monthPB: 55,

  currentAnnualBasePay: 105,
  targetPBAllocatedForMay: 105,
  allocatedPBAmount: 100,

  pbInstallment: 55,

  newPBToBeOffered: 100,
  newPBInstallment: 55,

  totalOfPB: 90,
  newRB: 85,
  totalBonus: 95,

  hikeAmount: 90,
  hikePct: 55,

  totalCTCWithRewards: 105,
  totalBonusHikeAmount: 105,
  totalBonusHikePct: 75,

  totalRewardsHikeAmount: 105,
  totalRewardsHikePct: 75,

  newBaseSalary: 105,
  targetPBNextYear: 105,

  eligibleForPromotion: 90,
  newTitle: 90,

  atRisk: 105,
};

const MIN_DYNAMIC_WIDTH = 55;
const MAX_DYNAMIC_WIDTH = 180;

const SELECT_COL_WIDTH = 30;
const EMP_ID_WIDTH = COMPACT_WIDTHS.empId;
const EMP_NAME_WIDTH = COMPACT_WIDTHS.name;

// Frozen positions
const EMP_ID_LEFT = SELECT_COL_WIDTH;
const EMP_NAME_LEFT = SELECT_COL_WIDTH + EMP_ID_WIDTH;

// ============================================================
// Z INDEX
// ============================================================

const Z = {
  normalHeader: 50,
  frozenHeader: 70,
  cornerHeader: 80,

  normalBody: 1,
  frozenBody: 20,
};

// ============================================================
// HELPERS
// ============================================================

const isNumericType = (type) =>
  type === "currency" ||
  type === "number" ||
  type === "decimal" ||
  type === "percent";

// ============================================================
// COMPONENT
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

  // ============================================================
  // DYNAMIC WIDTH
  // ============================================================

  const dynamicWidths = useMemo(() => {
    const widths = {};

    COLUMNS.forEach((col) => {
      if (col.key === "empId") {
        widths[col.key] = EMP_ID_WIDTH;
        return;
      }

      if (col.key === "name") {
        widths[col.key] = EMP_NAME_WIDTH;
        return;
      }

      const baseWidth =
        COMPACT_WIDTHS[col.key] ??
        Math.min(col.width ?? 100, MAX_DYNAMIC_WIDTH);

      let longestDataLength = 0;

      rows.forEach((row) => {
        let value = row[col.key];

        if (col.computed) {
          try {
            value = formatValue(row, col);
          } catch {
            value = row[col.key];
          }
        }

        if (value === null || value === undefined) {
          value = "";
        }

        longestDataLength = Math.max(longestDataLength, String(value).length);
      });

      const dataWidth = longestDataLength * 5.8 + 14;

      widths[col.key] = Math.min(
        MAX_DYNAMIC_WIDTH,
        Math.max(MIN_DYNAMIC_WIDTH, baseWidth, dataWidth),
      );
    });

    return widths;
  }, [rows]);

  const widthOf = useCallback(
    (column) =>
      dynamicWidths[column.key] ??
      COMPACT_WIDTHS[column.key] ??
      Math.min(column.width ?? 100, MAX_DYNAMIC_WIDTH),
    [dynamicWidths],
  );

  // ============================================================
  // CLEANUP
  // ============================================================

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  // ============================================================
  // FOCUS CELL
  // ============================================================

  const focusCell = useCallback((r, c) => {
    const element = cellRefs.current[`${r}:${c}`];

    if (!element) return;

    element.focus();

    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      element.select();
    }
  }, []);

  // ============================================================
  // SAVE INDICATOR
  // ============================================================

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

  // ============================================================
  // HIKE %
  // ============================================================

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

  // ============================================================
  // HIKE AMOUNT
  // ============================================================

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

  // ============================================================
  // CONVERT VALUE
  // ============================================================

  const convertValue = (col, raw) => {
    if (isNumericType(col.type)) {
      if (raw === "") return "";

      const number = Number(raw);

      return Number.isFinite(number) ? number : 0;
    }

    return raw;
  };

  // ============================================================
  // COMMIT
  // ============================================================

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

  // ============================================================
  // KEYBOARD NAVIGATION
  // ============================================================

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

  // ============================================================
  // CLICK
  // ============================================================

  const handleCellClick = useCallback(
    (row, isEditable) => {
      if (!isEditable) {
        onRowOpen(row);
        return;
      }

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

  // ============================================================
  // DOUBLE CLICK
  // ============================================================

  const handleEditableDoubleClick = useCallback(
    (event, rowIndex, editableColumnIndex) => {
      event.stopPropagation();

      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      const element = cellRefs.current[`${rowIndex}:${editableColumnIndex}`];

      if (!element) return;

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

  // ============================================================
  // CELL CONTENT
  // ============================================================

  const renderCellContent = (row, col, rowIndex, columnIndex) => {
    const cellKey = `${row.id}:${col.key}`;

    const editableColumnIndex = editableIndex.get(col.key);

    const isNewTitleDisabled =
      col.key === "newTitle" && row.eligibleForPromotion !== "Yes";

    const isTextarea = col.type === "textarea";
    const isEditable = col.editable === true;

    // ----------------------------------------------------------
    // COMPUTED
    // ----------------------------------------------------------

    if (col.computed) {
      return (
        <div
          className={cn(
            "flex h-6 w-full items-center",
            "overflow-hidden",
            "px-1",
            "text-right text-[9px]",
            "font-medium",
            "font-sans",
            "whitespace-nowrap",
            modified[cellKey] ? "text-foreground" : "text-muted-foreground",
          )}
          title="Calculated automatically"
        >
          {col.type === "currency"
            ? formatValue(row, col).replace(/^₹/, "")
            : formatValue(row, col)}
        </div>
      );
    }

    // ----------------------------------------------------------
    // NON EDITABLE
    // ----------------------------------------------------------

    if (!isEditable) {
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRowOpen(row);
          }}
          className={cn(
            "block h-6 w-full",
            "overflow-hidden",
            "px-1",
            "text-left text-[9px]",
            "font-sans",
            "whitespace-nowrap",
            "text-ellipsis",
            col.key === "name" &&
              "font-medium text-foreground hover:text-primary",
            col.key === "empId" && "text-[9px] text-muted-foreground",
          )}
        >
          {String(row[col.key] ?? "")}
        </button>
      );
    }

    // ----------------------------------------------------------
    // ENUM
    // ----------------------------------------------------------

    if (col.type === "enum") {
      return (
        <select
          ref={(element) => {
            cellRefs.current[`${rowIndex}:${editableColumnIndex}`] = element;
          }}
          value={String(row[col.key] ?? "")}
          disabled={isNewTitleDisabled}
          onFocus={() => setActive(`${rowIndex}:${editableColumnIndex}`)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => onKeyDown(event, rowIndex, editableColumnIndex)}
          onDoubleClick={(event) =>
            handleEditableDoubleClick(event, rowIndex, editableColumnIndex)
          }
          onChange={(event) => {
            updateCell(row.id, col.key, event.target.value);

            flashSaved(cellKey);
          }}
          className={cn(
            "h-6 w-full",
            "cursor-pointer",
            "appearance-none",
            "bg-transparent",
            "px-1",
            "text-[9px]",
            "font-sans",
            "outline-none",
            isNewTitleDisabled && "cursor-not-allowed opacity-50",
          )}
        >
          <option value="">Select...</option>

          {(col.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    // ----------------------------------------------------------
    // TEXTAREA
    // ----------------------------------------------------------

    if (isTextarea) {
      return (
        <textarea
          ref={(element) => {
            cellRefs.current[`${rowIndex}:${editableColumnIndex}`] = element;
          }}
          value={String(row[col.key] ?? "")}
          onFocus={() => setActive(`${rowIndex}:${editableColumnIndex}`)}
          onChange={(event) => {
            updateCell(row.id, col.key, event.target.value);

            flashSaved(cellKey);
          }}
          onBlur={(event) => {
            setActive(null);

            commit(row, col, event.target.value);
          }}
          onKeyDown={(event) => onKeyDown(event, rowIndex, editableColumnIndex)}
          onDoubleClick={(event) =>
            handleEditableDoubleClick(event, rowIndex, editableColumnIndex)
          }
          className={cn(
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
      );
    }

    // ----------------------------------------------------------
    // INPUT
    // ----------------------------------------------------------

    return (
      <div className="relative h-6 w-full">
        <input
          ref={(element) => {
            cellRefs.current[`${rowIndex}:${editableColumnIndex}`] = element;
          }}
          type={col.type === "date" ? "date" : "text"}
          value={String(row[col.key] ?? "")}
          inputMode={isNumericType(col.type) ? "decimal" : undefined}
          onFocus={(event) => {
            setActive(`${rowIndex}:${editableColumnIndex}`);

            if (col.type !== "date") {
              event.currentTarget.select();
            }
          }}
          onChange={(event) => {
            const raw = event.target.value;

            // ----------------------------------------------
            // HIKE %
            // ----------------------------------------------

            if (col.key === "hikePct") {
              updateHikePct(row, raw);
              return;
            }

            // ----------------------------------------------
            // HIKE AMOUNT
            // ----------------------------------------------

            if (col.key === "hikeAmount") {
              updateHikeAmount(row, raw);
              return;
            }

            // ----------------------------------------------
            // DATE
            // ----------------------------------------------

            if (col.type === "date") {
              updateCell(row.id, col.key, raw);

              flashSaved(cellKey);
              return;
            }

            // ----------------------------------------------
            // TEXT
            // ----------------------------------------------

            if (col.type === "text" || col.type === "textarea") {
              updateCell(row.id, col.key, raw);

              flashSaved(cellKey);
              return;
            }

            // ----------------------------------------------
            // NUMBER
            // ----------------------------------------------

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

            if (col.key === "hikePct" || col.key === "hikeAmount") {
              return;
            }

            if (isNumericType(col.type)) {
              commit(row, col, event.target.value);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              if (col.key !== "hikePct" && col.key !== "hikeAmount") {
                commit(row, col, event.target.value);
              }
            }

            onKeyDown(event, rowIndex, editableColumnIndex);
          }}
          onDoubleClick={(event) =>
            handleEditableDoubleClick(event, rowIndex, editableColumnIndex)
          }
          className={cn(
            "h-6 w-full",
            "bg-transparent",
            "px-1 py-1",
            "text-[9px]",
            "font-sans",
            "outline-none",
            "whitespace-nowrap",

            isNumericType(col.type) && "font-medium text-foreground",

            isNumericType(col.type) && "text-right",

            "font-variant-numeric:tabular-nums",
          )}
        />

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
    );
  };

  // ============================================================
  // SELECT ALL
  // ============================================================

  const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      className={cn(
        "relative",
        "h-[calc(100vh-140px)]",
        "min-h-0",
        "w-full",
        "overflow-auto",
        "rounded-md",
        "border border-border",
        "bg-card",
      )}
      style={{
        isolation: "isolate",
      }}
    >
      <table
        className={cn("border-separate", "border-spacing-0", "text-[10px]")}
        style={{
          tableLayout: "fixed",
          width: "max-content",
          minWidth: "100%",
        }}
      >
        {/* =====================================================
            COLGROUP
        ====================================================== */}

        <colgroup>
          <col
            style={{
              width: SELECT_COL_WIDTH,
            }}
          />

          {COLUMNS.map((col) => (
            <col
              key={col.key}
              style={{
                width: widthOf(col),
              }}
            />
          ))}
        </colgroup>

        {/* =====================================================
            HEADER
        ====================================================== */}

        <thead
          style={{
            position: "sticky",
            top: 0,
            zIndex: Z.normalHeader,
          }}
        >
          <tr
            className="h-7"
            style={{
              height: 28,
            }}
          >
            {/* SELECT HEADER */}

            <th
              className={cn(
                "sticky top-0 left-0",
                "h-7",
                "p-0",
                "border-r border-b border-grid-line",
              )}
              style={{
                position: "sticky",
                top: 0,
                left: 0,

                width: SELECT_COL_WIDTH,
                minWidth: SELECT_COL_WIDTH,
                maxWidth: SELECT_COL_WIDTH,

                height: 28,

                boxSizing: "border-box",

                zIndex: Z.cornerHeader,

                backgroundColor: "hsl(var(--grid-header))",

                boxShadow: "1px 0 0 hsl(var(--border) / 0.9)",
              }}
            >
              <div
                className={cn(
                  "flex",
                  "h-7",
                  "w-full",
                  "items-center",
                  "justify-center",
                  "overflow-hidden",
                  "bg-muted/40",
                )}
              >
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(value) => toggleAll(!!value)}
                  aria-label="Select all"
                />
              </div>
            </th>

            {/* COLUMN HEADERS */}

            {COLUMNS.map((col) => {
              const isEmpId = col.key === "empId";

              const isName = col.key === "name";

              const isFrozen = isEmpId || isName;

              const left = isEmpId
                ? EMP_ID_LEFT
                : isName
                  ? EMP_NAME_LEFT
                  : undefined;

              const columnWidth = widthOf(col);

              return (
                <th
                  key={col.key}
                  className={cn(
                    "h-7",
                    "p-0",
                    "border-r border-b border-grid-line",
                    isFrozen && "sticky",
                  )}
                  style={{
                    /*
                     * ALL HEADERS:
                     * vertically sticky through THEAD.
                     *
                     * EMP ID / EMP NAME:
                     * additionally horizontally sticky.
                     */
                    position: isFrozen ? "sticky" : "relative",

                    top: 0,

                    ...(isFrozen ? { left } : {}),

                    width: columnWidth,
                    minWidth: columnWidth,
                    maxWidth: columnWidth,

                    height: 28,

                    boxSizing: "border-box",

                    zIndex: isFrozen ? Z.frozenHeader : Z.normalHeader,

                    /*
                     * OPAQUE HEADER
                     */
                    backgroundColor: "hsl(var(--grid-header))",

                    ...(isName
                      ? {
                          boxShadow: "2px 0 5px -2px hsl(var(--border) / 1)",
                        }
                      : {}),
                  }}
                >
                  <div
                    className={cn(
                      "flex",
                      "h-7",
                      "w-full",
                      "items-center",
                      "gap-0.5",
                      "overflow-hidden",
                      "border-b border-border",
                      "bg-muted/40",
                      "px-1",
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0",
                        "flex-1",
                        "overflow-hidden",
                        "whitespace-normal",
                        "break-words",
                        "leading-[9px]",
                        "text-left",
                        "text-[8px]",
                        "font-semibold",
                        "uppercase",
                        "tracking-wide",
                        "text-muted-foreground",
                      )}
                      title={col.label}
                    >
                      {col.label}
                    </span>

                    <div className="shrink-0">
                      <ColumnFilter
                        columnKey={col.key}
                        filter={filters[col.key]}
                        options={optionsFor(col.key)}
                        onChange={(filter) => setFilter(col.key, filter)}
                      />
                    </div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        {/* =====================================================
            BODY
        ====================================================== */}

        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.id}
              className="group h-6"
              style={{
                height: 24,
              }}
            >
              {/* SELECT CELL */}

              <td
                className={cn(
                  "sticky left-0",
                  "h-6",
                  "p-0",
                  "align-middle",
                  "border-r border-b border-grid-line",
                )}
                style={{
                  position: "sticky",
                  left: 0,

                  width: SELECT_COL_WIDTH,
                  minWidth: SELECT_COL_WIDTH,
                  maxWidth: SELECT_COL_WIDTH,

                  height: 24,

                  boxSizing: "border-box",

                  zIndex: Z.frozenBody,

                  backgroundColor: "hsl(var(--card))",

                  boxShadow: "1px 0 0 hsl(var(--border) / 0.9)",
                }}
                onClick={() => onRowOpen(row)}
              >
                <div
                  className={cn(
                    "flex",
                    "h-6",
                    "w-full",
                    "items-center",
                    "justify-center",
                    "bg-card",
                  )}
                >
                  <Checkbox
                    checked={!!selected[row.id]}
                    onCheckedChange={(value) => toggleSelected(row.id, !!value)}
                    aria-label={`Select ${row.name}`}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>
              </td>

              {/* DATA CELLS */}

              {COLUMNS.map((col) => {
                const cellKey = `${row.id}:${col.key}`;

                const editableColumnIndex = editableIndex.get(col.key);

                const isActive =
                  active === `${rowIndex}:${editableColumnIndex}`;

                const isEmpId = col.key === "empId";

                const isName = col.key === "name";

                const isFrozen = isEmpId || isName;

                const left = isEmpId
                  ? EMP_ID_LEFT
                  : isName
                    ? EMP_NAME_LEFT
                    : undefined;

                const isNewTitleDisabled =
                  col.key === "newTitle" && row.eligibleForPromotion !== "Yes";

                return (
                  <td
                    key={col.key}
                    className={cn(
                      isFrozen && "sticky",
                      "h-6",
                      "p-0",
                      "align-middle",
                      "border-r border-b border-grid-line",
                      isActive && "ring-2 ring-primary ring-inset",
                    )}
                    style={{
                      position: isFrozen ? "sticky" : "relative",

                      ...(isFrozen ? { left } : {}),

                      width: widthOf(col),
                      minWidth: widthOf(col),
                      maxWidth: widthOf(col),

                      height: 24,

                      boxSizing: "border-box",

                      zIndex: isFrozen ? Z.frozenBody : Z.normalBody,

                      backgroundColor: isFrozen
                        ? "hsl(var(--card))"
                        : undefined,

                      ...(isName
                        ? {
                            boxShadow: "2px 0 5px -2px hsl(var(--border) / 1)",
                          }
                        : {}),
                    }}
                    onClick={() => handleCellClick(row, col.editable === true)}
                  >
                    <div
                      className={cn(
                        "relative",
                        "h-6",
                        "w-full",
                        "overflow-hidden",

                        isFrozen ? "bg-card" : "bg-transparent",

                        !isFrozen && modified[cellKey] && "bg-cell-modified/70",

                        !isFrozen && "group-hover:bg-accent/40",

                        isNewTitleDisabled && "bg-muted/20",
                      )}
                    >
                      {renderCellContent(
                        row,
                        col,
                        rowIndex,
                        editableColumnIndex,
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}

          {/* EMPTY */}

          {rows.length === 0 && (
            <tr>
              <td
                colSpan={COLUMNS.length + 1}
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
