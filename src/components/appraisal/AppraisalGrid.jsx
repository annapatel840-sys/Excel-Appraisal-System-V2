import { useCallback, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ColumnFilter } from "./ColumnFilter";
import { COLUMNS, formatValue } from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";

const editableCols = COLUMNS.filter((c) => c.editable);
const editableIndex = new Map(editableCols.map((c, i) => [c.key, i]));

/*
 * VERY COMPACT COLUMN WIDTHS
 *
 * The widths are intentionally based on the type of data.
 *
 * Small:
 *   percentage / month / count / experience
 *
 * Medium:
 *   employee name / designation / manager
 *
 * Large:
 *   salary / bonus / CTC
 */
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

const SELECT_COL_WIDTH = 30;

const EMP_ID_WIDTH = COMPACT_WIDTHS.empId;
const EMP_NAME_WIDTH = COMPACT_WIDTHS.name;

const EMP_ID_LEFT = SELECT_COL_WIDTH;
const EMP_NAME_LEFT = SELECT_COL_WIDTH + EMP_ID_WIDTH;

const widthOf = (column) =>
  COMPACT_WIDTHS[column.key] ?? Math.min(column.width ?? 120, 120);

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

  const [active, setActive] = useState(null);
  const [saving, setSaving] = useState({});

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

  const convertValue = (col, raw) => {
    if (
      col.type === "currency" ||
      col.type === "number" ||
      col.type === "decimal" ||
      col.type === "percent"
    ) {
      return Number(raw) || 0;
    }

    return raw;
  };

  /*
   * Hike % <-> Hike Amount
   *
   * Keep both directions synchronized.
   */
  const commit = useCallback(
    (row, col, raw) => {
      const value = convertValue(col, raw);

      if (col.key === "hikePct") {
        const basePay = Number(row.currentAnnualBasePay || 0);

        const hikePctValue = Number(raw) || 0;

        const newHikeAmount = Math.round(basePay * (hikePctValue / 100));

        updateCell(row.id, "hikePct", hikePctValue);

        updateCell(row.id, "hikeAmount", newHikeAmount);

        flashSaved(`${row.id}:hikePct`);
        flashSaved(`${row.id}:hikeAmount`);

        return;
      }

      if (col.key === "hikeAmount") {
        const basePay = Number(row.currentAnnualBasePay || 0);

        const hikeAmountValue = Number(raw) || 0;

        const newHikePct = basePay
          ? Number(((hikeAmountValue / basePay) * 100).toFixed(1))
          : 0;

        updateCell(row.id, "hikeAmount", hikeAmountValue);

        updateCell(row.id, "hikePct", newHikePct);

        flashSaved(`${row.id}:hikeAmount`);
        flashSaved(`${row.id}:hikePct`);

        return;
      }

      if (String(row[col.key] ?? "") === String(value)) {
        return;
      }

      updateCell(row.id, col.key, value);

      flashSaved(`${row.id}:${col.key}`);
    },
    [updateCell, flashSaved],
  );

  const onKeyDown = (e, r, c) => {
    const max = rows.length - 1;
    const maxC = editableCols.length - 1;
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

      focusCell(e.shiftKey ? Math.max(0, r - 1) : Math.min(max, r + 1), c);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();

      focusCell(Math.min(max, r + 1), c);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();

      focusCell(Math.max(0, r - 1), c);
    } else if (e.key === "ArrowRight" && atEnd) {
      if (c < maxC) {
        e.preventDefault();
        focusCell(r, c + 1);
      }
    } else if (e.key === "ArrowLeft" && atStart) {
      if (c > 0) {
        e.preventDefault();
        focusCell(r, c - 1);
      }
    } else if (e.key === "Escape") {
      target.blur();
    }
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);

  const headers = useMemo(
    () =>
      COLUMNS.map((c) => ({
        key: c.key,
        label: c.label,
        width: widthOf(c),
      })),
    [],
  );

  return (
    <div
      className="relative isolate overflow-auto rounded-md border border-border bg-card"
      style={{
        maxHeight: "calc(100vh - 230px)",
      }}
    >
      <table className="relative w-max border-separate border-spacing-0 text-[10px]">
        <thead>
          <tr>
            {/* Selection */}
            <th
              className={cn(
                "sticky top-0 left-0 z-[100]",
                "border-r border-b border-grid-line",
                "bg-grid-header",
                "px-0.5 py-1",
              )}
              style={{
                width: SELECT_COL_WIDTH,
                minWidth: SELECT_COL_WIDTH,
                maxWidth: SELECT_COL_WIDTH,
              }}
            >
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => toggleAll(!!v)}
                aria-label="Select all"
              />
            </th>

            {headers.map((h, i) => {
              const isEmpId = i === 0;
              const isEmployeeName = i === 1;
              const isSticky = isEmpId || isEmployeeName;

              return (
                <th
                  key={h.key}
                  style={{
                    width: h.width,
                    minWidth: h.width,
                    maxWidth: h.width,

                    ...(isEmpId
                      ? {
                          left: EMP_ID_LEFT,
                        }
                      : isEmployeeName
                        ? {
                            left: EMP_NAME_LEFT,
                          }
                        : {}),
                  }}
                  className={cn(
                    "sticky top-0",
                    isSticky
                      ? "z-[100] bg-grid-header"
                      : "z-[80] bg-grid-header",
                    "border-r border-b border-grid-line",
                    "px-1 py-1",
                    "text-left text-[8px] font-semibold",
                    "tracking-wide text-muted-foreground uppercase",
                  )}
                >
                  <div className="flex min-w-0 items-center justify-between gap-0.5">
                    <span className="truncate" title={h.label}>
                      {h.label}
                    </span>

                    <ColumnFilter
                      columnKey={h.key}
                      filter={filters[h.key]}
                      options={optionsFor(h.key)}
                      onChange={(f) => setFilter(h.key, f)}
                    />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, r) => (
            <tr
              key={row.id}
              className="group transition-colors hover:bg-accent/40"
            >
              {/* Selection */}
              <td
                className={cn(
                  "sticky left-0 z-[60]",
                  "border-r border-b border-grid-line",
                  "bg-card",
                  "px-0.5 py-0",
                )}
                style={{
                  width: SELECT_COL_WIDTH,
                  minWidth: SELECT_COL_WIDTH,
                  maxWidth: SELECT_COL_WIDTH,
                }}
              >
                <Checkbox
                  checked={!!selected[row.id]}
                  onCheckedChange={(v) => toggleSelected(row.id, !!v)}
                  aria-label={`Select ${row.name}`}
                />
              </td>

              {COLUMNS.map((col, ci) => {
                const cellKey = `${row.id}:${col.key}`;

                const isModified = !!modified[cellKey];

                const c = editableIndex.get(col.key);

                const isActive = active === `${r}:${c}`;

                const isSticky = ci < 2;

                const stickyLeft =
                  ci === 0 ? EMP_ID_LEFT : ci === 1 ? EMP_NAME_LEFT : undefined;

                const columnWidth = widthOf(col);

                return (
                  <td
                    key={col.key}
                    style={{
                      width: columnWidth,
                      minWidth: columnWidth,
                      maxWidth: columnWidth,

                      ...(isSticky
                        ? {
                            left: stickyLeft,
                          }
                        : {}),
                    }}
                    onDoubleClick={() =>
                      !col.editable && !col.computed && onRowOpen(row)
                    }
                    className={cn(
                      "relative border-r border-b border-grid-line",
                      "px-0 py-0 align-middle",

                      isSticky
                        ? ["sticky z-[60]", "!bg-card"]
                        : ["relative", "bg-transparent"],

                      !isSticky && isModified && "bg-cell-modified/70",

                      !isSticky && "group-hover:bg-accent/40",

                      isActive && "ring-2 ring-primary ring-inset",
                    )}
                  >
                    {/* Computed */}
                    {col.computed ? (
                      <div
                        className={cn(
                          "num w-full truncate px-1 py-1",
                          "text-right text-[9px] font-medium",

                          isModified
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                        title="Calculated automatically"
                      >
                        {formatValue(row, col)}
                      </div>
                    ) : !col.editable ? (
                      /* Read-only */
                      <button
                        type="button"
                        onClick={() => onRowOpen(row)}
                        className={cn(
                          "block w-full truncate",
                          "px-1 py-1 text-left",
                          "text-[9px]",

                          col.key === "name" &&
                            "font-medium text-foreground hover:text-primary",

                          col.key === "empId" &&
                            "num text-[9px] text-muted-foreground",
                        )}
                      >
                        {String(row[col.key] ?? "")}
                      </button>
                    ) : col.type === "enum" ? (
                      /* Enum */
                      <select
                        ref={(el) => {
                          cellRefs.current[`${r}:${c}`] = el;
                        }}
                        value={String(row[col.key] ?? "")}
                        onFocus={() => setActive(`${r}:${c}`)}
                        onBlur={() => setActive(null)}
                        onKeyDown={(e) => onKeyDown(e, r, c)}
                        onChange={(e) => {
                          updateCell(row.id, col.key, e.target.value);

                          flashSaved(cellKey);
                        }}
                        className="h-6 w-full cursor-pointer appearance-none bg-transparent px-1 text-[9px] outline-none"
                      >
                        <option value="">Select...</option>

                        {(col.options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : col.type === "textarea" ? (
                      /* Textarea */
                      <textarea
                        ref={(el) => {
                          cellRefs.current[`${r}:${c}`] = el;
                        }}
                        value={String(row[col.key] ?? "")}
                        onFocus={() => setActive(`${r}:${c}`)}
                        onBlur={(e) => {
                          setActive(null);

                          commit(row, col, e.target.value);
                        }}
                        onKeyDown={(e) => onKeyDown(e, r, c)}
                        className="h-6 min-h-6 w-full resize-none overflow-hidden bg-transparent px-1 py-1 text-[9px] outline-none"
                      />
                    ) : (
                      /* Input */
                      <div className="relative">
                        <input
                          ref={(el) => {
                            cellRefs.current[`${r}:${c}`] = el;
                          }}
                          type={col.type === "date" ? "date" : "text"}
                          defaultValue={String(row[col.key] ?? "")}
                          inputMode={
                            col.type === "currency" ||
                            col.type === "number" ||
                            col.type === "decimal" ||
                            col.type === "percent"
                              ? "decimal"
                              : undefined
                          }
                          onFocus={(e) => {
                            setActive(`${r}:${c}`);

                            if (col.type !== "date") {
                              e.currentTarget.select();
                            }
                          }}
                          onBlur={(e) => {
                            setActive(null);

                            commit(row, col, e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              commit(row, col, e.target.value);
                            }

                            onKeyDown(e, r, c);
                          }}
                          className={cn(
                            "h-6 w-full bg-transparent px-1 py-1",
                            "text-[9px] outline-none",

                            (col.type === "currency" ||
                              col.type === "number" ||
                              col.type === "decimal" ||
                              col.type === "percent") &&
                              "text-right num",
                          )}
                        />

                        {saving[cellKey] !== undefined && (
                          <span className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 text-status-submitted">
                            <Check className="size-2.5" />
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td
                colSpan={headers.length + 1}
                className="px-3 py-6 text-center text-[10px] text-muted-foreground"
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
