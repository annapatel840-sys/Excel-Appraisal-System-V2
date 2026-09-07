import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, History, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ColumnFilter } from "./ColumnFilter";
import { COLUMNS, formatValue } from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";

/* ============================================================
   FONT
   ============================================================ */

const APPRAISAL_FONT = "Arial, Helvetica, sans-serif";

/* ============================================================
   GRID SETTINGS
   ============================================================ */

const PAGE_SIZE = 20;

/* Smaller row height */
const CELL_MIN_HEIGHT = 30;

const SELECT_WIDTH = 30;

const MIN_WIDTH = 52;
const MAX_WIDTH = 160;

/* Slightly tighter columns */
const WIDTHS = {
  empId: 68,
  name: 135,

  designation: 94,
  reportingManager: 100,
  compManager: 100,
  appraiserTechED: 104,

  wissenExperience: 82,
  totalExperience: 76,
  lastAppraisalDate: 100,

  managerRating: 116,
  interviewCount: 68,
  rrPercent: 60,
  grossMargin: 72,

  rbToBePaid: 82,
  monthRB: 58,
  pbToBePaid: 82,
  monthPB: 58,

  currentAnnualBasePay: 102,
  targetPBAllocatedForMay: 108,
  allocatedPBAmount: 98,
  pbInstallment: 64,
  newPBToBeOffered: 98,
  newPBInstallment: 64,

  totalOfPB: 86,
  newRB: 82,
  totalBonus: 86,

  hikeAmount: 90,
  hikePct: 58,

  totalCTCWithRewards: 104,

  totalBonusHikeAmount: 106,
  totalBonusHikePct: 82,

  totalRewardsHikeAmount: 112,
  totalRewardsHikePct: 86,

  newBaseSalary: 102,
  targetPBNextYear: 106,

  eligibleForPromotion: 88,
  newTitle: 100,
  atRisk: 118,
};

const GRID_COLUMNS = COLUMNS;

/* ============================================================
   HELPERS
   ============================================================ */

const isNumericType = (type) =>
  type === "currency" ||
  type === "number" ||
  type === "decimal" ||
  type === "percent";

const getWidth = (column) =>
  Math.min(
    MAX_WIDTH,
    Math.max(MIN_WIDTH, WIDTHS[column.key] ?? column.width ?? 90),
  );

const numericValue = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : 0;
};

/* ============================================================
   HISTORY HELPERS
   ============================================================ */

const formatHistoryNumber = (value, type = "currency") => {
  const n = Number(value || 0);

  if (type === "percent") {
    return `${n.toFixed(1)}%`;
  }

  return Math.round(n).toLocaleString("en-IN");
};

const percentChange = (current, previous) => {
  const c = Number(current || 0);
  const p = Number(previous || 0);

  if (!p) {
    return c ? "new" : "0.00%";
  }

  const result = ((c - p) / p) * 100;

  return `${result >= 0 ? "+" : ""}${result.toFixed(2)}%`;
};

/* ============================================================
   COMPONENT
   ============================================================ */

export function AppraisalGrid({
  rows,
  filters,
  setFilter,
  optionsFor,
  selected,
  toggleSelected,
  toggleAll,
  onRowOpen,

  showHistory,
  setShowHistory,
}) {
  const { updateCell, modified, historyFor } = useAppraisal();

  const cellRefs = useRef({});
  const clickTimerRef = useRef(null);

  /* ============================================================
     GRID VIEWPORT REF
     Used to prevent hover popup from covering page heading
     ============================================================ */

  const gridViewportRef = useRef(null);

  /* ============================================================
     COLUMN RESIZE
     ============================================================ */

  const [columnWidths, setColumnWidths] = useState(() =>
    Object.fromEntries(
      GRID_COLUMNS.map((column) => [column.key, getWidth(column)]),
    ),
  );

  const resizeRef = useRef(null);

  const widthOf = useCallback(
    (column) => {
      return columnWidths[column.key] ?? getWidth(column);
    },
    [columnWidths],
  );

  const startColumnResize = useCallback(
    (event, column) => {
      event.preventDefault();
      event.stopPropagation();

      resizeRef.current = {
        key: column.key,
        startX: event.clientX,
        startWidth: widthOf(column),
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [widthOf],
  );

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!resizeRef.current) {
        return;
      }

      const { key, startX, startWidth } = resizeRef.current;

      const nextWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth + event.clientX - startX),
      );

      setColumnWidths((previous) => ({
        ...previous,
        [key]: nextWidth,
      }));
    };

    const handlePointerUp = () => {
      resizeRef.current = null;

      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  /* ============================================================
     STICKY COLUMN WIDTHS
     ============================================================ */

  const empIdColumn = GRID_COLUMNS.find((column) => column.key === "empId");
  const nameColumn = GRID_COLUMNS.find((column) => column.key === "name");

  const empIdWidth = empIdColumn ? widthOf(empIdColumn) : MIN_WIDTH;

  const nameWidth = nameColumn ? widthOf(nameColumn) : MIN_WIDTH;

  /* Avoid unused-variable warning if nameWidth is not directly needed */
  void nameWidth;

  /* ============================================================
     STATES
     ============================================================ */

  const [active, setActive] = useState(null);
  const [saving, setSaving] = useState({});
  const [currentPage, setCurrentPage] = useState(1);

  /* ============================================================
     HISTORY DETAILS
     ============================================================ */

  const [historyRow, setHistoryRow] = useState(null);

  /* ============================================================
     HOVER
     ============================================================ */

  const [hoverEmployee, setHoverEmployee] = useState(null);

  const [hoverPosition, setHoverPosition] = useState({
    left: 0,
    top: 0,
  });

  /* ============================================================
     HISTORY AUTO SCROLL
     ============================================================ */

  useEffect(() => {
    if (showHistory) {
      requestAnimationFrame(() => {
        const historyPanel = document.getElementById("history-panel");

        if (historyPanel) {
          historyPanel.scrollIntoView({
            behavior: "smooth",
            block: "end",
          });
        }
      });
    }
  }, [showHistory]);

  /* ============================================================
     RESET PAGE WHEN ROW COUNT CHANGES
     ============================================================ */

  useEffect(() => {
    setCurrentPage(1);
  }, [rows.length]);

  /* ============================================================
     CLEANUP
     ============================================================ */

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  /* ============================================================
     PAGINATION
     ============================================================ */

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;

    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, currentPage]);

  const pageStart = rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;

  const pageEnd = Math.min(currentPage * PAGE_SIZE, rows.length);

  /* ============================================================
     FOCUS
     ============================================================ */

  const focusCell = useCallback((rowIndex, columnKey) => {
    const element = cellRefs.current[`${rowIndex}:${columnKey}`];

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
  }, []);

  /* ============================================================
     SAVE FLASH
     ============================================================ */

  const flashSaved = useCallback((key) => {
    setSaving((previous) => ({
      ...previous,
      [key]: Date.now(),
    }));

    setTimeout(() => {
      setSaving((previous) => {
        const next = {
          ...previous,
        };

        delete next[key];

        return next;
      });
    }, 1200);
  }, []);

  /* ============================================================
     HIKE %
     ============================================================ */

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

      const pct = Number(raw) || 0;

      const amount = Math.round(basePay * (pct / 100));

      updateCell(row.id, "hikePct", pct);
      updateCell(row.id, "hikeAmount", amount);

      flashSaved(`${row.id}:hikePct`);
      flashSaved(`${row.id}:hikeAmount`);
    },
    [updateCell, flashSaved],
  );

  /* ============================================================
     HIKE AMOUNT
     ============================================================ */

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

      const amount = Number(raw) || 0;

      const pct = basePay ? Number(((amount / basePay) * 100).toFixed(1)) : 0;

      updateCell(row.id, "hikeAmount", amount);
      updateCell(row.id, "hikePct", pct);

      flashSaved(`${row.id}:hikeAmount`);
      flashSaved(`${row.id}:hikePct`);
    },
    [updateCell, flashSaved],
  );

  /* ============================================================
     COMMIT
     ============================================================ */

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

      let value = raw;

      if (isNumericType(col.type)) {
        value = numericValue(raw);
      }

      if (String(row[col.key] ?? "") === String(value ?? "")) {
        return;
      }

      updateCell(row.id, col.key, value);

      flashSaved(`${row.id}:${col.key}`);
    },
    [updateCell, flashSaved, updateHikePct, updateHikeAmount],
  );

  /* ============================================================
     EDITABLE COLUMNS
     ============================================================ */

  const editableColumns = useMemo(
    () => COLUMNS.filter((column) => column.editable),
    [],
  );

  const editableIndex = useMemo(
    () => new Map(editableColumns.map((column, index) => [column.key, index])),
    [editableColumns],
  );

  /* ============================================================
     ROW-SPECIFIC EDITABILITY
     ============================================================ */

  const isColumnEditable = useCallback((row, column) => {
    if (!column.editable) {
      return false;
    }

    if (column.key === "newTitle") {
      return row.eligibleForPromotion === "Yes";
    }

    return true;
  }, []);

  const getEditableColumnsForRow = useCallback(
    (row) => editableColumns.filter((column) => isColumnEditable(row, column)),
    [editableColumns, isColumnEditable],
  );

  /* ============================================================
     KEYBOARD NAVIGATION
     ============================================================ */

  const onKeyDown = (event, rowIndex, columnKey) => {
    const currentRow = pageRows[rowIndex];

    if (!currentRow) {
      return;
    }

    const editableColumnIndex = editableIndex.get(columnKey);

    if (editableColumnIndex === undefined) {
      return;
    }

    const rowEditableColumns = getEditableColumnsForRow(currentRow);

    const currentRowColumnIndex = rowEditableColumns.findIndex(
      (column) => column.key === columnKey,
    );

    const maxRow = pageRows.length - 1;

    const target = event.target;

    const atStart =
      !("selectionStart" in target) || target.selectionStart === 0;

    const atEnd =
      !("selectionEnd" in target) ||
      target.selectionEnd === (target.value?.length ?? 0);

    /* ----------------------------------------------------------
       ENTER
       ---------------------------------------------------------- */

    if (event.key === "Enter") {
      if (target instanceof HTMLTextAreaElement && !event.shiftKey) {
        return;
      }

      event.preventDefault();

      const direction = event.shiftKey ? -1 : 1;

      let nextRowIndex = rowIndex + direction;

      while (nextRowIndex >= 0 && nextRowIndex <= maxRow) {
        const nextRow = pageRows[nextRowIndex];

        if (
          nextRow &&
          isColumnEditable(nextRow, {
            ...COLUMNS.find((column) => column.key === columnKey),
            key: columnKey,
          })
        ) {
          focusCell(nextRowIndex, columnKey);

          return;
        }

        nextRowIndex += direction;
      }

      return;
    }

    /* ----------------------------------------------------------
       ARROW DOWN
       ---------------------------------------------------------- */

    if (event.key === "ArrowDown") {
      event.preventDefault();

      const nextRowIndex = Math.min(maxRow, rowIndex + 1);

      const nextRow = pageRows[nextRowIndex];

      if (
        nextRow &&
        isColumnEditable(
          nextRow,
          COLUMNS.find((column) => column.key === columnKey) ?? {
            key: columnKey,
            editable: false,
          },
        )
      ) {
        focusCell(nextRowIndex, columnKey);
      }

      return;
    }

    /* ----------------------------------------------------------
       ARROW UP
       ---------------------------------------------------------- */

    if (event.key === "ArrowUp") {
      event.preventDefault();

      const nextRowIndex = Math.max(0, rowIndex - 1);

      const nextRow = pageRows[nextRowIndex];

      if (
        nextRow &&
        isColumnEditable(
          nextRow,
          COLUMNS.find((column) => column.key === columnKey) ?? {
            key: columnKey,
            editable: false,
          },
        )
      ) {
        focusCell(nextRowIndex, columnKey);
      }

      return;
    }

    /* ----------------------------------------------------------
       ARROW RIGHT
       ---------------------------------------------------------- */

    if (
      event.key === "ArrowRight" &&
      atEnd &&
      currentRowColumnIndex >= 0 &&
      currentRowColumnIndex < rowEditableColumns.length - 1
    ) {
      event.preventDefault();

      focusCell(rowIndex, rowEditableColumns[currentRowColumnIndex + 1].key);

      return;
    }

    /* ----------------------------------------------------------
       ARROW LEFT
       ---------------------------------------------------------- */

    if (event.key === "ArrowLeft" && atStart && currentRowColumnIndex > 0) {
      event.preventDefault();

      focusCell(rowIndex, rowEditableColumns[currentRowColumnIndex - 1].key);

      return;
    }

    /* ----------------------------------------------------------
       ESCAPE
       ---------------------------------------------------------- */

    if (event.key === "Escape") {
      target.blur();
    }
  };

  /* ============================================================
     ROW OPEN
     ============================================================ */

  const openRow = useCallback(
    (row) => {
      setHistoryRow(row);

      if (onRowOpen) {
        onRowOpen(row);
      }
    },
    [onRowOpen],
  );

  /* ============================================================
     CELL CLICK
     ============================================================ */

  const handleCellClick = useCallback(
    (row, editable) => {
      if (!editable) {
        openRow(row);
        return;
      }

      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }

      clickTimerRef.current = setTimeout(() => {
        openRow(row);
        clickTimerRef.current = null;
      }, 220);
    },
    [openRow],
  );

  /* ============================================================
     DOUBLE CLICK
     ============================================================ */

  const handleEditableDoubleClick = useCallback(
    (event, rowIndex, columnKey) => {
      event.stopPropagation();

      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);

        clickTimerRef.current = null;
      }

      focusCell(rowIndex, columnKey);
    },
    [focusCell],
  );

  /* ============================================================
     HOVER POPUP
     ============================================================ */

  const calculateHoverPosition = useCallback((event) => {
    const width = 330;
    const height = 390;
    const margin = 14;

    /*
     * IMPORTANT:
     * The popup must stay BELOW the actual grid header.
     * This prevents it from getting hidden behind the
     * Appraisal Sheet / Search / Filter area.
     */

    const viewport = gridViewportRef.current;

    const viewportRect = viewport?.getBoundingClientRect();

    const minimumTop = viewportRect ? viewportRect.top + 42 : 115;

    let left = event.clientX + margin;

    let top = event.clientY + margin;

    if (left + width > window.innerWidth) {
      left = event.clientX - width - margin;
    }

    if (top + height > window.innerHeight) {
      top = event.clientY - height - margin;
    }

    /*
     * Never allow popup to go above grid header.
     */
    top = Math.max(minimumTop, top);

    /*
     * Keep popup inside viewport.
     */
    if (top + height > window.innerHeight - 8) {
      top = Math.max(minimumTop, window.innerHeight - height - 8);
    }

    return {
      left: Math.max(8, left),
      top: Math.max(8, top),
    };
  }, []);

  const showHoverPopup = useCallback(
    (row, event) => {
      setHoverEmployee(row);

      setHoverPosition(calculateHoverPosition(event));
    },
    [calculateHoverPosition],
  );

  const moveHoverPopup = useCallback(
    (event) => {
      if (!hoverEmployee) {
        return;
      }

      setHoverPosition(calculateHoverPosition(event));
    },
    [hoverEmployee, calculateHoverPosition],
  );

  /* ============================================================
     HISTORY DATA
     ============================================================ */

  const selectedHistory = historyRow ? historyFor(historyRow.empId) : [];

  const historyRows = useMemo(() => {
    if (!historyRow) {
      return [];
    }

    const current = {
      year: "Apr-26 ★",

      designation: historyRow.designation,

      rating: historyRow.managerRating,

      promo: historyRow.eligibleForPromotion,

      basePay: Number(historyRow.currentAnnualBasePay) || 0,

      joiningBonus: 0,

      perfBonus:
        Number(historyRow.allocatedPBAmount || 0) +
        Number(historyRow.newPBToBeOffered || 0),

      retBonus: Number(historyRow.newRB || 0),

      hikeAmount: Number(historyRow.hikeAmount || 0),

      totalBonus:
        Number(historyRow.allocatedPBAmount || 0) +
        Number(historyRow.newPBToBeOffered || 0) +
        Number(historyRow.newRB || 0),

      targetPB: Number(historyRow.targetPBNextYear) || 0,

      newBasePay:
        Number(historyRow.currentAnnualBasePay || 0) +
        Number(historyRow.hikeAmount || 0),

      totalCTC:
        Number(historyRow.currentAnnualBasePay || 0) +
        Number(historyRow.hikeAmount || 0) +
        Number(historyRow.allocatedPBAmount || 0) +
        Number(historyRow.newPBToBeOffered || 0) +
        Number(historyRow.newRB || 0),
    };

    if (Array.isArray(historyRow.history) && historyRow.history.length) {
      return [
        current,

        ...historyRow.history.map((item) => ({
          year: item.year ?? "",

          designation: item.designation ?? historyRow.designation ?? "",

          rating: item.rating ?? historyRow.managerRating ?? "",

          promo: item.promo ?? historyRow.eligibleForPromotion ?? "",

          basePay: Number(item.basePay) || 0,

          joiningBonus: Number(item.joiningBonus) || 0,

          perfBonus: Number(item.perfBonus) || 0,

          retBonus: Number(item.retBonus) || 0,

          hikeAmount: Number(item.hikeAmt) || 0,

          totalBonus: Number(item.perfBonus || 0) + Number(item.retBonus || 0),

          targetPB: Number(item.targetPB) || 0,

          newBasePay: Number(item.newBasePay) || 0,

          totalCTC:
            Number(item.newBasePay || 0) +
            Number(item.perfBonus || 0) +
            Number(item.retBonus || 0),
        })),
      ];
    }

    if (selectedHistory.length) {
      return [
        current,

        ...selectedHistory.slice(0, 10).map((item) => ({
          year: new Date(item.at).toLocaleDateString("en-IN", {
            month: "short",
            year: "2-digit",
          }),

          designation: historyRow.designation,

          rating: historyRow.managerRating,

          promo: historyRow.eligibleForPromotion,

          basePay: Number(historyRow.currentAnnualBasePay) || 0,

          joiningBonus: 0,

          perfBonus: Number(historyRow.allocatedPBAmount) || 0,

          retBonus: Number(historyRow.newRB) || 0,

          hikeAmount: Number(historyRow.hikeAmount) || 0,

          totalBonus:
            Number(historyRow.allocatedPBAmount || 0) +
            Number(historyRow.newPBToBeOffered || 0) +
            Number(historyRow.newRB || 0),

          targetPB: Number(historyRow.targetPBNextYear) || 0,

          newBasePay:
            Number(historyRow.currentAnnualBasePay) +
            Number(historyRow.hikeAmount),

          totalCTC:
            Number(historyRow.currentAnnualBasePay) +
            Number(historyRow.hikeAmount) +
            Number(historyRow.allocatedPBAmount) +
            Number(historyRow.newPBToBeOffered) +
            Number(historyRow.newRB),
        })),
      ];
    }

    return [current];
  }, [historyRow, selectedHistory]);

  /* ============================================================
     RENDER CELL
     ============================================================ */

  const renderCellContent = (row, col, rowIndex) => {
    const cellKey = `${row.id}:${col.key}`;

    const isEditable = isColumnEditable(row, col);

    const isNewTitleDisabled =
      col.key === "newTitle" && row.eligibleForPromotion !== "Yes";

    const displayValue = formatValue(row, col);

    /* ----------------------------------------------------------
       COMPUTED
       ---------------------------------------------------------- */

    if (col.computed) {
      return (
        <div
          className={cn(
            `flex min-h-[${CELL_MIN_HEIGHT}px] h-auto w-full items-center`,
            "px-1.5 py-0.5",
            "whitespace-normal break-words",
            "leading-tight",
            "text-right",
            "text-[9px]",
            "font-medium",
            "tabular-nums",
            modified[cellKey] ? "text-slate-900" : "text-[#064e7a]",
          )}
          title="Calculated automatically"
        >
          {col.type === "currency"
            ? displayValue.replace(/^₹/, "")
            : displayValue}
        </div>
      );
    }

    /* ----------------------------------------------------------
       READ ONLY
       ---------------------------------------------------------- */

    if (!isEditable) {
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openRow(row);
          }}
          className={cn(
            `flex min-h-[${CELL_MIN_HEIGHT}px] h-auto w-full`,
            "items-center",
            "px-1.5 py-0.5",
            "text-left",
            "text-[9px]",
            "font-normal",
            "whitespace-normal break-words",
            "leading-tight",
            col.key === "name" &&
              "font-semibold text-[#07528a] hover:underline",
            col.key === "empId" && "text-[8px] text-slate-500",
          )}
          title={String(row[col.key] ?? "")}
        >
          {String(row[col.key] ?? "")}
        </button>
      );
    }

    /* ----------------------------------------------------------
       ENUM
       ---------------------------------------------------------- */

    if (col.type === "enum") {
      return (
        <select
          ref={(element) => {
            cellRefs.current[`${rowIndex}:${col.key}`] = element;
          }}
          value={String(row[col.key] ?? "")}
          disabled={isNewTitleDisabled}
          onFocus={() => setActive(`${rowIndex}:${col.key}`)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => onKeyDown(event, rowIndex, col.key)}
          onDoubleClick={(event) =>
            handleEditableDoubleClick(event, rowIndex, col.key)
          }
          onChange={(event) => {
            updateCell(row.id, col.key, event.target.value);

            flashSaved(cellKey);
          }}
          className={cn(
            `min-h-[${CELL_MIN_HEIGHT}px] h-full w-full`,
            "appearance-none",
            "cursor-pointer",
            "bg-transparent",
            "px-1.5 py-0.5",
            "text-[9px]",
            "outline-none",
            "whitespace-normal",
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

    /* ----------------------------------------------------------
       TEXTAREA
       ---------------------------------------------------------- */

    if (col.type === "textarea") {
      return (
        <textarea
          ref={(element) => {
            cellRefs.current[`${rowIndex}:${col.key}`] = element;

            if (element) {
              element.style.height = "auto";

              element.style.height = `${element.scrollHeight}px`;
            }
          }}
          rows={1}
          value={String(row[col.key] ?? "")}
          onFocus={() => setActive(`${rowIndex}:${col.key}`)}
          onChange={(event) => {
            updateCell(row.id, col.key, event.target.value);

            flashSaved(cellKey);

            event.target.style.height = "auto";

            event.target.style.height = `${event.target.scrollHeight}px`;
          }}
          onBlur={(event) => {
            setActive(null);

            commit(row, col, event.target.value);
          }}
          onKeyDown={(event) => onKeyDown(event, rowIndex, col.key)}
          onDoubleClick={(event) =>
            handleEditableDoubleClick(event, rowIndex, col.key)
          }
          className={cn(
            `min-h-[${CELL_MIN_HEIGHT}px] h-auto w-full`,
            "resize-none",
            "overflow-hidden",
            "bg-transparent",
            "px-1.5 py-0.5",
            "text-[9px]",
            "outline-none",
            "whitespace-normal",
            "break-words",
            "leading-tight",
          )}
        />
      );
    }

    /* ----------------------------------------------------------
       INPUT
       ---------------------------------------------------------- */

    return (
      <div className={`relative min-h-[${CELL_MIN_HEIGHT}px] h-full w-full`}>
        <input
          ref={(element) => {
            cellRefs.current[`${rowIndex}:${col.key}`] = element;
          }}
          type={col.type === "date" ? "date" : "text"}
          value={String(row[col.key] ?? "")}
          inputMode={isNumericType(col.type) ? "decimal" : undefined}
          onFocus={(event) => {
            setActive(`${rowIndex}:${col.key}`);

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

            if (col.type === "date" || col.type === "text") {
              updateCell(row.id, col.key, raw);

              flashSaved(cellKey);

              return;
            }

            if (raw === "") {
              updateCell(row.id, col.key, "");

              return;
            }

            if (isNumericType(col.type)) {
              const value = Number(raw);

              if (Number.isFinite(value)) {
                updateCell(row.id, col.key, value);

                flashSaved(cellKey);
              }
            }
          }}
          onBlur={(event) => {
            setActive(null);

            if (col.key === "hikePct" || col.key === "hikeAmount") {
              return;
            }

            commit(row, col, event.target.value);
          }}
          onKeyDown={(event) => onKeyDown(event, rowIndex, col.key)}
          onDoubleClick={(event) =>
            handleEditableDoubleClick(event, rowIndex, col.key)
          }
          className={cn(
            `min-h-[${CELL_MIN_HEIGHT}px] h-full w-full`,
            "bg-transparent",
            "px-1.5",
            "text-[9px]",
            "outline-none",
            "whitespace-normal",
            "break-words",
            isNumericType(col.type) && "text-right font-medium tabular-nums",
          )}
        />

        {saving[cellKey] !== undefined && (
          <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#16803c]">
            <Check className="size-2.5" />
          </span>
        )}
      </div>
    );
  };

  /* ============================================================
     SELECT ALL
     ============================================================ */

  const allSelected =
    pageRows.length > 0 && pageRows.every((row) => selected[row.id]);

  /* ============================================================
     PAGE BUTTONS
     ============================================================ */

  const pageButtons = Array.from(
    {
      length: Math.min(totalPages, 7),
    },
    (_, index) => {
      let page = index + 1;

      if (totalPages > 7) {
        if (currentPage <= 4) {
          page = index + 1;
        } else if (currentPage >= totalPages - 3) {
          page = totalPages - 6 + index;
        } else {
          page = currentPage - 3 + index;
        }
      }

      return page;
    },
  );

  /* ============================================================
     MAIN UI
     ============================================================ */

  return (
    <div
      className={cn(
        "relative flex min-h-0 w-full",
        "flex-col overflow-hidden",
        "rounded-md border border-[#d5dce5]",
        "bg-white",
      )}
      style={{
        /*
         * More usable vertical space.
         * Search/filter/action bar outside this component
         * is NOT changed.
         */
        height: "calc(100vh - 126px)",
        isolation: "isolate",
        fontFamily: APPRAISAL_FONT,
      }}
    >
      {/* ======================================================
          TOP TOOLBAR
          ====================================================== */}

      <div
        className="flex h-9 shrink-0 items-center justify-between border-b border-[#d5dce5] bg-white px-3"
        style={{
          fontFamily: APPRAISAL_FONT,
        }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-[#173b63]">
              Compensation Management
            </span>
          </div>
        </div>

        <div className="text-[8px] text-slate-500">
          {rows.length > 0 ? `${rows.length} employees` : "0 employees"}
        </div>
      </div>

      {/* ======================================================
          GRID AREA
          ====================================================== */}

      <div
        ref={gridViewportRef}
        className={cn("min-h-0 flex-1", "overflow-auto")}
      >
        <table
          className="border-separate border-spacing-0"
          style={{
            tableLayout: "fixed",
            width: "max-content",
            minWidth: "100%",
            fontFamily: APPRAISAL_FONT,
          }}
        >
          <colgroup>
            <col
              style={{
                width: SELECT_WIDTH,
              }}
            />

            {GRID_COLUMNS.map((col) => (
              <col
                key={col.key}
                style={{
                  width: widthOf(col),
                }}
              />
            ))}
          </colgroup>

          {/* ==================================================
              HEADER
              ================================================== */}

          <thead
            style={{
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            <tr
              style={{
                height: 34,
              }}
            >
              {/* SELECT ALL */}

              <th
                className="sticky left-0 top-0 border-r border-b border-[#cbd5e1] p-0"
                style={{
                  position: "sticky",
                  left: 0,
                  top: 0,
                  width: SELECT_WIDTH,
                  minWidth: SELECT_WIDTH,
                  maxWidth: SELECT_WIDTH,
                  height: 34,
                  background: "#e8eef5",
                  zIndex: 80,
                }}
              >
                <div className="flex h-[34px] items-center justify-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(value) => toggleAll(!!value)}
                    aria-label="Select all"
                    className="size-3"
                  />
                </div>
              </th>

              {/* COLUMNS */}

              {GRID_COLUMNS.map((col) => {
                const isEmpId = col.key === "empId";

                const isName = col.key === "name";

                const isFrozen = isEmpId || isName;

                const left = isEmpId
                  ? SELECT_WIDTH
                  : isName
                    ? SELECT_WIDTH + empIdWidth
                    : undefined;

                const width = widthOf(col);

                return (
                  <th
                    key={col.key}
                    className={cn(
                      "relative border-r border-b border-[#cbd5e1] p-0",
                      isFrozen && "sticky",
                    )}
                    style={{
                      position: isFrozen ? "sticky" : "relative",

                      ...(isFrozen
                        ? {
                            left,
                          }
                        : {}),

                      width,
                      minWidth: width,
                      maxWidth: width,

                      height: 34,

                      boxSizing: "border-box",

                      zIndex: isFrozen ? 70 : 50,

                      background: "#e8eef5",

                      fontFamily: APPRAISAL_FONT,
                    }}
                  >
                    <div className="flex min-h-[34px] h-auto w-full items-center gap-0.5 px-1.5">
                      <span
                        className="min-w-0 flex-1 overflow-hidden break-words text-left text-[8px] font-bold leading-[9px] text-[#334155]"
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

                    {/* RESIZE HANDLE */}

                    <div
                      role="separator"
                      aria-label={`Resize ${col.label} column`}
                      title="Drag to resize column"
                      onPointerDown={(event) => startColumnResize(event, col)}
                      className="absolute top-0 right-[-2px] z-[100] h-full w-[5px] cursor-col-resize touch-none"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ==================================================
              BODY
              ================================================== */}

          <tbody>
            {pageRows.map((row, rowIndex) => (
              <tr
                key={row.id}
                className="group"
                style={{
                  minHeight: CELL_MIN_HEIGHT,
                }}
              >
                {/* SELECT */}

                <td
                  className="sticky left-0 border-r border-b border-[#d9e0e8] p-0 align-middle"
                  style={{
                    position: "sticky",

                    left: 0,

                    width: SELECT_WIDTH,

                    minWidth: SELECT_WIDTH,

                    maxWidth: SELECT_WIDTH,

                    minHeight: CELL_MIN_HEIGHT,

                    zIndex: 20,

                    background: "#f8fafc",

                    boxShadow: "1px 0 0 rgba(148,163,184,.35)",
                  }}
                  onClick={() => openRow(row)}
                >
                  <div className="flex min-h-[30px] h-full items-center justify-center">
                    <Checkbox
                      checked={!!selected[row.id]}
                      onCheckedChange={(value) =>
                        toggleSelected(row.id, !!value)
                      }
                      aria-label={`Select ${row.name}`}
                      onClick={(event) => event.stopPropagation()}
                      className="size-3"
                    />
                  </div>
                </td>

                {/* CELLS */}

                {GRID_COLUMNS.map((col) => {
                  const cellKey = `${row.id}:${col.key}`;

                  const isEmpId = col.key === "empId";

                  const isName = col.key === "name";

                  const isFrozen = isEmpId || isName;

                  const left = isEmpId
                    ? SELECT_WIDTH
                    : isName
                      ? SELECT_WIDTH + empIdWidth
                      : undefined;

                  const width = widthOf(col);

                  const isComputed = col.computed;

                  const isEditable = isColumnEditable(row, col);

                  const isActive = active === `${rowIndex}:${col.key}`;

                  return (
                    <td
                      key={col.key}
                      className={cn(
                        isFrozen && "sticky",

                        "border-r border-b border-[#d9e0e8] p-0 align-middle",

                        isActive && "ring-2 ring-[#2563eb] ring-inset",
                      )}
                      style={{
                        position: isFrozen ? "sticky" : "relative",

                        ...(isFrozen
                          ? {
                              left,
                            }
                          : {}),

                        width,
                        minWidth: width,
                        maxWidth: width,

                        minHeight: CELL_MIN_HEIGHT,

                        boxSizing: "border-box",

                        zIndex: isFrozen ? 20 : 1,

                        backgroundColor: isFrozen
                          ? "#f8fafc"
                          : isComputed
                            ? "#edf6fc"
                            : "#fff",
                      }}
                      onClick={() => handleCellClick(row, isEditable)}
                    >
                      <div
                        className={cn(
                          "relative min-h-[30px] h-auto w-full",

                          isFrozen && "bg-[#f8fafc]",

                          !isFrozen && isComputed && "bg-[#edf6fc]",

                          !isFrozen &&
                            !isComputed &&
                            isEditable &&
                            "bg-[#fffdf1]",

                          !isFrozen && modified[cellKey] && "bg-[#fff0a8]",
                        )}
                      >
                        {isName ? (
                          <div
                            className="min-h-[30px] h-auto w-full"
                            onMouseEnter={(event) => showHoverPopup(row, event)}
                            onMouseMove={moveHoverPopup}
                            onMouseLeave={() => setHoverEmployee(null)}
                          >
                            {renderCellContent(row, col, rowIndex)}
                          </div>
                        ) : (
                          renderCellContent(row, col, rowIndex)
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={GRID_COLUMNS.length + 1}
                  className="px-3 py-8 text-center text-[10px] text-slate-500"
                >
                  No employees match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ======================================================
          PAGINATION
          ====================================================== */}

      <div
        className="flex h-8 shrink-0 items-center justify-between border-t border-[#d5dce5] bg-[#f8fafc] px-2.5"
        style={{
          fontFamily: APPRAISAL_FONT,
        }}
      >
        <div className="text-[8px] text-slate-500">
          {rows.length === 0
            ? "0 employees"
            : `Showing ${pageStart}-${pageEnd} of ${rows.length} employees`}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            className="flex size-5 items-center justify-center rounded border border-[#cbd5e1] bg-white text-slate-500 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-3" />
          </button>

          {pageButtons.map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => setCurrentPage(page)}
              className={cn(
                "flex size-5 items-center justify-center rounded border text-[8px] font-medium",

                page === currentPage
                  ? "border-[#173b63] bg-[#173b63] text-white"
                  : "border-[#cbd5e1] bg-white text-slate-500 hover:bg-slate-100",
              )}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() =>
              setCurrentPage((page) => Math.min(totalPages, page + 1))
            }
            className="flex size-5 items-center justify-center rounded border border-[#cbd5e1] bg-white text-slate-500 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="size-3" />
          </button>
        </div>
      </div>

      {/* ======================================================
          HISTORY DETAILS PANEL
          ====================================================== */}

      {showHistory && (
        <div
          id="history-panel"
          className="shrink-0 border-t border-[#173b63] bg-white"
          style={{
            fontFamily: APPRAISAL_FONT,

            /*
             * Slightly shorter than before so more employees
             * remain visible above it.
             */
            height: "min(270px, 32vh)",

            minHeight: 175,
          }}
        >
          {/* HISTORY HEADER */}

          <div className="flex h-8 items-center justify-between bg-[#173b63] px-3 text-white">
            <div className="flex items-center gap-2">
              <History className="size-3" />

              <span className="text-[10px] font-bold">
                History
                {historyRow ? ` - ${historyRow.name}` : ""}
              </span>

              {historyRow && (
                <span className="text-[8px] opacity-75">
                  {historyRows.length} cycles
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="flex size-5 items-center justify-center rounded text-white hover:bg-white/10"
              aria-label="Close history"
            >
              <X className="size-3" />
            </button>
          </div>

          {/* HISTORY CONTENT */}

          <div className="h-[calc(100%-52px)] overflow-auto">
            {!historyRow ? (
              <div className="flex h-full items-center justify-center px-3 text-center text-[9px] text-slate-500">
                Select an employee to view history.
              </div>
            ) : (
              <table
                className="w-full border-collapse"
                style={{
                  tableLayout: "fixed",
                }}
              >
                <colgroup>
                  <col
                    style={{
                      width: 75,
                    }}
                  />
                  <col
                    style={{
                      width: 105,
                    }}
                  />
                  <col
                    style={{
                      width: 95,
                    }}
                  />
                  <col
                    style={{
                      width: 95,
                    }}
                  />
                  <col
                    style={{
                      width: 105,
                    }}
                  />
                  <col
                    style={{
                      width: 95,
                    }}
                  />
                  <col
                    style={{
                      width: 95,
                    }}
                  />
                  <col
                    style={{
                      width: 95,
                    }}
                  />
                  <col
                    style={{
                      width: 95,
                    }}
                  />
                  <col
                    style={{
                      width: 95,
                    }}
                  />
                </colgroup>

                <thead>
                  <tr className="bg-[#e8eef5]">
                    <th className="border-r border-b border-[#cbd5e1] px-2 py-1 text-left text-[8px] font-bold text-[#334155]">
                      Year
                    </th>

                    <th className="border-r border-b border-[#cbd5e1] px-2 py-1 text-right text-[8px] font-bold text-[#334155]">
                      Current Base Pay
                      <small className="block text-[7px] font-normal text-slate-500">
                        % change below
                      </small>
                    </th>

                    <th className="border-r border-b border-[#cbd5e1] px-2 py-1 text-right text-[8px] font-bold text-[#334155]">
                      Joining Bonus
                      <small className="block text-[7px] font-normal text-slate-500">
                        % change below
                      </small>
                    </th>

                    <th className="border-r border-b border-[#cbd5e1] px-2 py-1 text-right text-[8px] font-bold text-[#334155]">
                      Perf. Bonus
                      <small className="block text-[7px] font-normal text-slate-500">
                        % change below
                      </small>
                    </th>

                    <th className="border-r border-b border-[#cbd5e1] px-2 py-1 text-right text-[8px] font-bold text-[#334155]">
                      Retention Bonus
                      <small className="block text-[7px] font-normal text-slate-500">
                        % change below
                      </small>
                    </th>

                    <th className="border-r border-b border-[#cbd5e1] px-2 py-1 text-right text-[8px] font-bold text-[#334155]">
                      Total Bonus
                      <small className="block text-[7px] font-normal text-slate-500">
                        % change below
                      </small>
                    </th>

                    <th className="border-r border-b border-[#cbd5e1] px-2 py-1 text-right text-[8px] font-bold text-[#334155]">
                      Hike Amount
                      <small className="block text-[7px] font-normal text-slate-500">
                        % change below
                      </small>
                    </th>

                    <th className="border-r border-b border-[#cbd5e1] px-2 py-1 text-right text-[8px] font-bold text-[#334155]">
                      Total CTC
                      <small className="block text-[7px] font-normal text-slate-500">
                        % change below
                      </small>
                    </th>

                    <th className="border-r border-b border-[#cbd5e1] px-2 py-1 text-right text-[8px] font-bold text-[#334155]">
                      Target PB
                      <small className="block text-[7px] font-normal text-slate-500">
                        % change below
                      </small>
                    </th>

                    <th className="border-b border-[#cbd5e1] px-2 py-1 text-right text-[8px] font-bold text-[#334155]">
                      New Base Pay
                      <small className="block text-[7px] font-normal text-slate-500">
                        % change below
                      </small>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {historyRows.map((item, index) => {
                    const previous = historyRows[index + 1];

                    return (
                      <tr
                        key={`${item.year}-${index}`}
                        className={cn(
                          "h-[32px]",
                          index === 0 && "bg-[#fff7c7]",
                        )}
                      >
                        <td className="border-r border-b border-[#d9e0e8] px-2 py-1 text-left text-[8px] font-medium text-[#173b63]">
                          {item.year}
                        </td>

                        <td className="border-r border-b border-[#d9e0e8] px-2 py-0.5 text-right text-[8px]">
                          <div>{formatHistoryNumber(item.basePay)}</div>

                          <div className="text-[6px] text-slate-500">
                            {previous
                              ? percentChange(item.basePay, previous.basePay)
                              : "—"}
                          </div>
                        </td>

                        <td className="border-r border-b border-[#d9e0e8] px-2 py-0.5 text-right text-[8px]">
                          <div>{formatHistoryNumber(item.joiningBonus)}</div>

                          <div className="text-[6px] text-slate-500">
                            {previous
                              ? percentChange(
                                  item.joiningBonus,
                                  previous.joiningBonus,
                                )
                              : "—"}
                          </div>
                        </td>

                        <td className="border-r border-b border-[#d9e0e8] px-2 py-0.5 text-right text-[8px]">
                          <div>{formatHistoryNumber(item.perfBonus)}</div>

                          <div className="text-[6px] text-slate-500">
                            {previous
                              ? percentChange(
                                  item.perfBonus,
                                  previous.perfBonus,
                                )
                              : "—"}
                          </div>
                        </td>

                        <td className="border-r border-b border-[#d9e0e8] px-2 py-0.5 text-right text-[8px]">
                          <div>{formatHistoryNumber(item.retBonus)}</div>

                          <div className="text-[6px] text-slate-500">
                            {previous
                              ? percentChange(item.retBonus, previous.retBonus)
                              : "—"}
                          </div>
                        </td>

                        <td className="border-r border-b border-[#d9e0e8] px-2 py-0.5 text-right text-[8px]">
                          <div>{formatHistoryNumber(item.totalBonus)}</div>

                          <div className="text-[6px] text-slate-500">
                            {previous
                              ? percentChange(
                                  item.totalBonus,
                                  previous.totalBonus,
                                )
                              : "—"}
                          </div>
                        </td>

                        <td className="border-r border-b border-[#d9e0e8] px-2 py-0.5 text-right text-[8px]">
                          <div>{formatHistoryNumber(item.hikeAmount)}</div>

                          <div className="text-[6px] text-slate-500">
                            {previous
                              ? percentChange(
                                  item.hikeAmount,
                                  previous.hikeAmount,
                                )
                              : "—"}
                          </div>
                        </td>

                        <td className="border-r border-b border-[#d9e0e8] px-2 py-0.5 text-right text-[8px]">
                          <div>{formatHistoryNumber(item.totalCTC)}</div>

                          <div className="text-[6px] text-slate-500">
                            {previous
                              ? percentChange(item.totalCTC, previous.totalCTC)
                              : "—"}
                          </div>
                        </td>

                        <td className="border-r border-b border-[#d9e0e8] px-2 py-0.5 text-right text-[8px]">
                          <div>{formatHistoryNumber(item.targetPB)}</div>

                          <div className="text-[6px] text-slate-500">
                            {previous
                              ? percentChange(item.targetPB, previous.targetPB)
                              : "—"}
                          </div>
                        </td>

                        <td className="border-b border-[#d9e0e8] px-2 py-0.5 text-right text-[8px]">
                          <div>{formatHistoryNumber(item.newBasePay)}</div>

                          <div className="text-[6px] text-slate-500">
                            {previous
                              ? percentChange(
                                  item.newBasePay,
                                  previous.newBasePay,
                                )
                              : "—"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* HISTORY FOOTER */}

          <div className="flex h-[20px] items-center border-t border-[#e2e8f0] bg-[#f8fafc] px-3 text-[7px] text-slate-500">
            The starred row reflects the employee currently selected in the grid
            above, live. Older cycles are reference data.
          </div>
        </div>
      )}

      {/* ======================================================
          EMPLOYEE HOVER POPUP
          ====================================================== */}

      {hoverEmployee && (
        <div
          className="fixed z-[9999] w-[330px] overflow-hidden rounded-md border border-[#cbd5e1] bg-white shadow-[0_12px_35px_rgba(15,23,42,.25)]"
          style={{
            left: hoverPosition.left,
            top: hoverPosition.top,
            fontFamily: APPRAISAL_FONT,
          }}
          onMouseEnter={() => setHoverEmployee(hoverEmployee)}
          onMouseLeave={() => setHoverEmployee(null)}
        >
          {/* NAME */}

          <div className="border-b border-[#d9e0e8] bg-white px-3 py-2">
            <div className="text-[13px] font-bold text-[#173b63]">
              {hoverEmployee.name}
            </div>

            <div className="mt-0.5 text-[9px] text-slate-500">
              {hoverEmployee.designation}
              {" · "}
              {hoverEmployee.empId}
            </div>
          </div>

          {/* METRICS */}

          <div className="grid grid-cols-3 gap-px border-b border-[#d9e0e8] bg-[#d9e0e8]">
            <div className="bg-[#f8fafc] px-2 py-2">
              <div className="text-[8px] font-semibold uppercase text-slate-500">
                Rating
              </div>

              <div className="mt-1 text-[11px] font-bold text-[#173b63]">
                {hoverEmployee.managerRating ?? "—"}
              </div>
            </div>

            <div className="bg-[#f8fafc] px-2 py-2">
              <div className="text-[8px] font-semibold uppercase text-slate-500">
                RR %
              </div>

              <div className="mt-1 text-[11px] font-bold text-[#173b63]">
                {hoverEmployee.rrPercent !== undefined
                  ? `${hoverEmployee.rrPercent}%`
                  : "—"}
              </div>
            </div>

            <div className="bg-[#f8fafc] px-2 py-2">
              <div className="text-[8px] font-semibold uppercase text-slate-500">
                Interviews
              </div>

              <div className="mt-1 text-[11px] font-bold text-[#173b63]">
                {hoverEmployee.interviewCount ?? "—"}
              </div>
            </div>
          </div>

          {/* DETAILS */}

          <div className="px-3 py-2">
            <div className="mb-1 text-[8px] font-bold uppercase tracking-wide text-slate-500">
              Employee Details
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
              <div>
                <span className="text-slate-400">Reporting Manager</span>

                <div className="font-medium text-slate-700">
                  {hoverEmployee.reportingManager ?? "—"}
                </div>
              </div>

              <div>
                <span className="text-slate-400">Comp. Manager</span>

                <div className="font-medium text-slate-700">
                  {hoverEmployee.compManager ?? "—"}
                </div>
              </div>

              <div>
                <span className="text-slate-400">Organization Exp.</span>

                <div className="font-medium text-slate-700">
                  {hoverEmployee.wissenExperience ?? "—"}
                </div>
              </div>

              <div>
                <span className="text-slate-400">Total Experience</span>

                <div className="font-medium text-slate-700">
                  {hoverEmployee.totalExperience ?? "—"}
                </div>
              </div>
            </div>
          </div>

          {/* RECENT HISTORY */}

          <div className="border-t border-[#d9e0e8]">
            <div className="px-3 py-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">
              Recent History
            </div>

            <div className="max-h-[130px] overflow-auto">
              <table className="w-full border-collapse text-[8px]">
                <thead>
                  <tr className="bg-[#f1f5f9]">
                    <th className="px-2 py-1 text-left">Year</th>

                    <th className="px-2 py-1 text-left">Desig.</th>

                    <th className="px-2 py-1 text-left">Rating</th>

                    <th className="px-2 py-1 text-left">Promo</th>
                  </tr>
                </thead>

                <tbody>
                  <tr className="bg-[#fff7c7]">
                    <td className="px-2 py-1">Apr-26 ★</td>

                    <td className="px-2 py-1">{hoverEmployee.designation}</td>

                    <td className="px-2 py-1">
                      {hoverEmployee.managerRating ?? "—"}
                    </td>

                    <td className="px-2 py-1">
                      {hoverEmployee.eligibleForPromotion ?? "—"}
                    </td>
                  </tr>

                  {Array.isArray(hoverEmployee.history) &&
                    hoverEmployee.history.slice(0, 3).map((item, index) => (
                      <tr
                        key={`${item.year}-${index}`}
                        className="border-t border-[#e2e8f0]"
                      >
                        <td className="px-2 py-1">{item.year}</td>

                        <td className="px-2 py-1">{item.designation ?? "—"}</td>

                        <td className="px-2 py-1">{item.rating ?? "—"}</td>

                        <td className="px-2 py-1">{item.promo ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
