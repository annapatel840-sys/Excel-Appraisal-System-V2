import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronLeft, ChevronRight, History, X } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ColumnFilter } from "./ColumnFilter";
import { COLUMNS, formatValue } from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";

// ============================================================
// API
// ============================================================

const APPRAISAL_HISTORY_API_URL =
  "https://excelappraisal-904056216.development.catalystserverless.com/server/appraisal-history-api/";

const CURRENT_APPRAISAL_YEAR = "Apr-26";

// ============================================================
// FONT
// ============================================================

const APPRAISAL_FONT = "Arial, Helvetica, sans-serif";

// ============================================================
// GRID SETTINGS
// ============================================================

const PAGE_SIZE = 20;
const CELL_MIN_HEIGHT = 30;
const SELECT_WIDTH = 30;

const MIN_WIDTH = 52;
const MAX_WIDTH = 160;

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

// ============================================================
// HELPERS
// ============================================================

const isNumericType = (type) =>
  type === "currency" ||
  type === "number" ||
  type === "decimal" ||
  type === "percent";

const getWidth = (column) =>
  Math.min(
    MAX_WIDTH,
    Math.max(
      MIN_WIDTH,
      WIDTHS[column.key] !== undefined
        ? WIDTHS[column.key]
        : column.width !== undefined
          ? column.width
          : 90,
    ),
  );

const numericValue = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : 0;
};

// ============================================================
// HISTORY HELPERS
// ============================================================

const formatHistoryNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return "0";
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "0";
  }

  return Math.round(n).toLocaleString("en-IN");
};

const computeHistoryChange = (currentValue, previousValue) => {
  if (previousValue === undefined) {
    return { label: "new", tone: "neutral" };
  }

  const current = Number(currentValue) || 0;
  const previous = Number(previousValue) || 0;

  if (previous === 0) {
    if (current === 0) {
      return { label: "0.00%", tone: "neutral" };
    }

    return { label: "new", tone: "neutral" };
  }

  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";

  return {
    label: `${sign}${change.toFixed(2)}%`,
    tone: change > 0 ? "up" : change < 0 ? "down" : "neutral",
  };
};

// ============================================================
// FIELD -> HISTORY COLUMN KEYS TO FLASH ON EDIT
// ============================================================

const HISTORY_FLASH_FIELDS = {
  allocatedPBAmount: ["performanceBonus", "totalBonus", "newCTC"],
  newPBToBeOffered: ["performanceBonus", "totalBonus", "newCTC"],
  newRB: ["retentionBonus", "totalBonus", "newCTC"],
  hikeAmount: ["hikeAmount", "newCTC", "newBasePay"],
  hikePct: ["hikeAmount", "newCTC", "newBasePay"],
  targetPBNextYear: ["targetPB"],
};

// ============================================================
// BOTTOM HISTORY PANEL METRIC COLUMNS
// ============================================================

const HISTORY_METRIC_COLUMNS = [
  { key: "basePay", label: "Curr Base Pay" },
  { key: "joiningBonus", label: "Joining Bonus" },
  { key: "performanceBonus", label: "Perf. Bonus" },
  { key: "retentionBonus", label: "Retention Bonus" },
  { key: "totalBonus", label: "Total Bonus" },
  { key: "hikeAmount", label: "Hike Amount" },
  { key: "newCTC", label: "Total CTC" },
  { key: "targetPB", label: "Target PB" },
  { key: "newBasePay", label: "New Base Pay" },
];

// ============================================================
// HISTORY RECORD NORMALIZER
// ============================================================

const normalizeHistoryRecord = (record) => {
  const basePay = Number(record?.base_pay) || 0;
  const hikeAmount = Number(record?.hike_amount) || 0;

  return {
    year:
      record?.appraisal_year !== null &&
      record?.appraisal_year !== undefined &&
      String(record.appraisal_year).trim() !== ""
        ? String(record.appraisal_year)
        : "—",

    basePay,

    joiningBonus: Number(record?.joining_bonus) || 0,

    allocatedPB: Number(record?.allocated_pb) || 0,

    performanceBonus: Number(record?.performance_bonus) || 0,

    retentionBonus: Number(record?.retention_bonus) || 0,

    totalPB: Number(record?.total_pb) || 0,

    totalBonus: Number(record?.total_bonus) || 0,

    hikeAmount,

    hikePct: Number(record?.hike_pct) || 0,

    promotion:
      record?.promotion !== null &&
      record?.promotion !== undefined &&
      String(record.promotion).trim() !== ""
        ? String(record.promotion)
        : "—",

    title:
      record?.title !== null &&
      record?.title !== undefined &&
      String(record.title).trim() !== ""
        ? String(record.title)
        : "—",

    rating:
      record?.rating !== null &&
      record?.rating !== undefined &&
      String(record.rating).trim() !== ""
        ? String(record.rating)
        : "—",

    feedback:
      record?.manager_rating !== null &&
      record?.manager_rating !== undefined &&
      String(record.manager_rating).trim() !== ""
        ? String(record.manager_rating)
        : "—",

    targetPB: Number(record?.target_performance_bonus) || 0,

    newCTC: Number(record?.new_ctc) || 0,

    newBasePay: basePay + hikeAmount,
  };
};

// ============================================================
// APPLY LIVE SHEET VALUES TO CURRENT-YEAR HISTORY
// ============================================================

const applyCurrentYearSheetValues = (historyRecord, row) => {
  if (!row) {
    return historyRecord;
  }

  if (String(historyRecord.year) !== CURRENT_APPRAISAL_YEAR) {
    return historyRecord;
  }

  const allocatedPBAmount = Number(row.allocatedPBAmount) || 0;
  const newPBToBeOffered = Number(row.newPBToBeOffered) || 0;
  const newRB = Number(row.newRB) || 0;
  const currentAnnualBasePay = Number(row.currentAnnualBasePay) || 0;
  const hikeAmount = Number(row.hikeAmount) || 0;
  const targetPBNextYear = Number(row.targetPBNextYear) || 0;

  const totalPB = allocatedPBAmount + newPBToBeOffered;
  const totalBonus = totalPB + newRB;

  const newBaseSalary = currentAnnualBasePay + hikeAmount;
  const newCTC = newBaseSalary + totalBonus;

  return {
    ...historyRecord,
    basePay: currentAnnualBasePay,
    allocatedPB: allocatedPBAmount,
    performanceBonus: totalPB,
    retentionBonus: newRB,
    totalPB,
    totalBonus,
    hikeAmount,
    hikePct: Number(row.hikePct) || 0,
    promotion:
      row.eligibleForPromotion !== null &&
      row.eligibleForPromotion !== undefined &&
      String(row.eligibleForPromotion).trim() !== ""
        ? String(row.eligibleForPromotion)
        : "—",
    title:
      row.newTitle !== null &&
      row.newTitle !== undefined &&
      String(row.newTitle).trim() !== ""
        ? String(row.newTitle)
        : "—",
    targetPB: targetPBNextYear,
    newCTC,
    newBasePay: newBaseSalary,
  };
};

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

  showHistory,
  setShowHistory,
}) {
  const { updateCell, updateLinkedCells, modified, historyRefreshVersion } =
    useAppraisal();

  const cellRefs = useRef({});
  const clickTimerRef = useRef(null);

  // ============================================================
  // LOCAL EDIT DRAFTS
  // ============================================================

  const [editingValues, setEditingValues] = useState({});

  const setEditingValue = useCallback((cellKey, value) => {
    setEditingValues((previous) => ({
      ...previous,
      [cellKey]: value,
    }));
  }, []);

  const clearEditingValue = useCallback((cellKey) => {
    setEditingValues((previous) => {
      if (!(cellKey in previous)) {
        return previous;
      }

      const next = { ...previous };

      delete next[cellKey];

      return next;
    });
  }, []);

  // ============================================================
  // GRID VIEWPORT REF
  // ============================================================

  const gridViewportRef = useRef(null);

  // ============================================================
  // COLUMN RESIZE
  // ============================================================

  const [columnWidths, setColumnWidths] = useState(() =>
    Object.fromEntries(
      GRID_COLUMNS.map((column) => [column.key, getWidth(column)]),
    ),
  );

  const resizeRef = useRef(null);

  const widthOf = useCallback(
    (column) =>
      columnWidths[column.key] !== undefined
        ? columnWidths[column.key]
        : getWidth(column),
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

      setColumnWidths((previous) => ({ ...previous, [key]: nextWidth }));
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

  // ============================================================
  // STICKY COLUMN WIDTHS
  // ============================================================

  const empIdColumn = GRID_COLUMNS.find((column) => column.key === "empId");
  const nameColumn = GRID_COLUMNS.find((column) => column.key === "name");

  const empIdWidth = empIdColumn ? widthOf(empIdColumn) : MIN_WIDTH;
  const nameWidth = nameColumn ? widthOf(nameColumn) : MIN_WIDTH;

  void nameWidth;

  // ============================================================
  // STATES
  // ============================================================

  const [active, setActive] = useState(null);
  const [saving, setSaving] = useState({});
  const [currentPage, setCurrentPage] = useState(1);

  // ============================================================
  // GROUP BY
  // ============================================================

  const [groupBy, setGroupBy] = useState(null); // { key, dir, label } | null

  const getGroupValue = useCallback((row, col) => {
    if (col.computed && typeof col.fn === "function") {
      return col.fn(row);
    }

    return row[col.key];
  }, []);

  const compareGroupValues = useCallback(
    (rowA, rowB, col) => {
      const a = getGroupValue(rowA, col);
      const b = getGroupValue(rowB, col);

      if (isNumericType(col.type)) {
        return (Number(a) || 0) - (Number(b) || 0);
      }

      return String(a !== null && a !== undefined ? a : "").localeCompare(
        String(b !== null && b !== undefined ? b : ""),
      );
    },
    [getGroupValue],
  );

  const groupedSections = useMemo(() => {
    if (!groupBy) {
      return null;
    }

    const col = GRID_COLUMNS.find((item) => item.key === groupBy.key);

    if (!col) {
      return null;
    }

    const sorted = [...rows].sort((a, b) => {
      const result = compareGroupValues(a, b, col);

      return groupBy.dir === "desc" ? -result : result;
    });

    const sections = [];
    let currentKey;
    let currentSection = null;

    sorted.forEach((row) => {
      const rawValue = getGroupValue(row, col);

      const displayValue = formatValue(row, col);

      const label =
        displayValue === "" ||
        displayValue === null ||
        displayValue === undefined
          ? "(blank)"
          : displayValue;

      if (currentSection === null || rawValue !== currentKey) {
        currentKey = rawValue;

        currentSection = {
          key: `${groupBy.key}:${String(rawValue)}:${sections.length}`,
          label,
          rows: [],
        };

        sections.push(currentSection);
      }

      currentSection.rows.push(row);
    });

    return sections;
  }, [groupBy, rows, compareGroupValues, getGroupValue]);

  const flattenedGroupOrder = useMemo(() => {
    if (!groupedSections) {
      return null;
    }

    const order = new Map();
    let index = 0;

    groupedSections.forEach((section) => {
      section.rows.forEach((row) => {
        order.set(row.id, index);
        index += 1;
      });
    });

    return order;
  }, [groupedSections]);

  // ============================================================
  // HISTORY FLASH
  // ============================================================

  const [historyFlashKeys, setHistoryFlashKeys] = useState(new Set());
  const historyFlashTimerRef = useRef(null);

  const flashHistoryFields = useCallback((field) => {
    const keys = HISTORY_FLASH_FIELDS[field];

    if (!keys || !keys.length) {
      return;
    }

    if (historyFlashTimerRef.current) {
      clearTimeout(historyFlashTimerRef.current);
    }

    setHistoryFlashKeys(new Set(keys));

    historyFlashTimerRef.current = setTimeout(() => {
      setHistoryFlashKeys(new Set());
    }, 1600);
  }, []);

  useEffect(() => {
    return () => {
      if (historyFlashTimerRef.current) {
        clearTimeout(historyFlashTimerRef.current);
      }
    };
  }, []);

  // ============================================================
  // HISTORY DETAILS
  // ============================================================

  const [historyRow, setHistoryRow] = useState(null);

  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // ============================================================
  // HOVER
  // ============================================================

  const [hoverEmployee, setHoverEmployee] = useState(null);

  const [hoverPosition, setHoverPosition] = useState({ left: 0, top: 0 });

  // ============================================================
  // HOVER HISTORY
  // ============================================================

  const hoverHistoryRequestedRef = useRef(new Set());

  const [hoverHistoryByEmpId, setHoverHistoryByEmpId] = useState({});

  const loadHoverHistory = useCallback((empId) => {
    const key = String(empId || "").trim();

    if (!key || hoverHistoryRequestedRef.current.has(key)) {
      return;
    }

    hoverHistoryRequestedRef.current.add(key);

    setHoverHistoryByEmpId((previous) => ({
      ...previous,
      [key]: { loading: true, data: [], error: "" },
    }));

    (async () => {
      try {
        const url = `${APPRAISAL_HISTORY_API_URL}?emp_id=${encodeURIComponent(
          key,
        )}`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to load appraisal history (${response.status}).`,
          );
        }

        const result = await response.json();

        if (!result?.success) {
          throw new Error(
            result?.message || "Failed to load appraisal history.",
          );
        }

        const records = Array.isArray(result?.data) ? result.data : [];

        const normalized = records
          .map(normalizeHistoryRecord)
          .sort((a, b) => String(b.year).localeCompare(String(a.year)));

        setHoverHistoryByEmpId((previous) => ({
          ...previous,
          [key]: { loading: false, data: normalized, error: "" },
        }));
      } catch (error) {
        console.error("Hover history fetch error:", error);

        setHoverHistoryByEmpId((previous) => ({
          ...previous,
          [key]: {
            loading: false,
            data: [],
            error: error?.message || "Unable to load history.",
          },
        }));

        hoverHistoryRequestedRef.current.delete(key);
      }
    })();
  }, []);

  // ============================================================
  // FETCH APPRAISAL HISTORY
  // ============================================================

  useEffect(() => {
    if (!showHistory || !historyRow?.empId) {
      return;
    }

    const empId = String(historyRow.empId).trim();

    if (!empId) {
      setHistoryData([]);
      setHistoryError("");
      return;
    }

    let cancelled = false;

    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError("");

      try {
        const url = `${APPRAISAL_HISTORY_API_URL}?emp_id=${encodeURIComponent(
          empId,
        )}`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Failed to load appraisal history (${response.status}).`,
          );
        }

        const result = await response.json();

        if (!result?.success) {
          throw new Error(
            result?.message || "Failed to load appraisal history.",
          );
        }

        const records = Array.isArray(result?.data) ? result.data : [];

        const latestRow =
          rows.find((row) => String(row.empId || "").trim() === empId) ||
          historyRow;

        const normalized = records
          .map((record) => {
            const normalizedRecord = normalizeHistoryRecord(record);

            return applyCurrentYearSheetValues(normalizedRecord, latestRow);
          })
          .sort((a, b) => String(b.year).localeCompare(String(a.year)));

        if (!cancelled) {
          setHistoryData(normalized);
        }
      } catch (error) {
        console.error("Appraisal history fetch error:", error);

        if (!cancelled) {
          setHistoryData([]);
          setHistoryError(
            error?.message || "Unable to load appraisal history.",
          );
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [showHistory, historyRow?.empId, historyRefreshVersion, rows]);

  // ============================================================
  // HISTORY AUTO SCROLL
  // ============================================================

  useEffect(() => {
    if (showHistory) {
      requestAnimationFrame(() => {
        const historyPanel = document.getElementById("history-panel");

        if (historyPanel) {
          historyPanel.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      });
    }
  }, [showHistory]);

  // ============================================================
  // RESET HISTORY WHEN PANEL CLOSES
  // ============================================================

  useEffect(() => {
    if (!showHistory) {
      setHistoryData([]);
      setHistoryError("");
      setHistoryLoading(false);
    }
  }, [showHistory]);

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
  // PAGINATION
  // ============================================================

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;

    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, currentPage]);

  const pageStart = rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;

  const pageEnd = Math.min(currentPage * PAGE_SIZE, rows.length);

  // Unified display order — matches whichever mode is active, so
  // keyboard navigation always looks up the right row.
  const displayRows = useMemo(() => {
    if (groupedSections) {
      return groupedSections.flatMap((section) => section.rows);
    }

    return pageRows;
  }, [groupedSections, pageRows]);

  // ============================================================
  // FOCUS
  // ============================================================

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

  // ============================================================
  // SAVE FLASH
  // ============================================================

  const flashSaved = useCallback((key) => {
    setSaving((previous) => ({ ...previous, [key]: Date.now() }));

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
        updateLinkedCells(row.id, { hikePct: "", hikeAmount: "" });

        flashSaved(`${row.id}:hikePct`);
        flashSaved(`${row.id}:hikeAmount`);

        return;
      }

      const basePay = Number(row.currentAnnualBasePay || 0);
      const pct = Number(raw) || 0;
      const amount = Math.round(basePay * (pct / 100));

      updateLinkedCells(row.id, { hikePct: pct, hikeAmount: amount });

      flashSaved(`${row.id}:hikePct`);
      flashSaved(`${row.id}:hikeAmount`);
    },
    [updateLinkedCells, flashSaved],
  );

  // ============================================================
  // HIKE AMOUNT
  // ============================================================

  const updateHikeAmount = useCallback(
    (row, raw) => {
      if (raw === "") {
        updateLinkedCells(row.id, { hikeAmount: "", hikePct: "" });

        flashSaved(`${row.id}:hikeAmount`);
        flashSaved(`${row.id}:hikePct`);

        return;
      }

      const basePay = Number(row.currentAnnualBasePay || 0);
      const amount = Number(raw) || 0;

      const pct = basePay ? Number(((amount / basePay) * 100).toFixed(1)) : 0;

      updateLinkedCells(row.id, { hikeAmount: amount, hikePct: pct });

      flashSaved(`${row.id}:hikeAmount`);
      flashSaved(`${row.id}:hikePct`);
    },
    [updateLinkedCells, flashSaved],
  );

  // ============================================================
  // COMMIT
  // ============================================================

  const commit = useCallback(
    (row, col, raw) => {
      if (col.key === "hikePct") {
        updateHikePct(row, raw);

        if (row.id === historyRow?.id) {
          flashHistoryFields(col.key);
        }

        return;
      }

      if (col.key === "hikeAmount") {
        updateHikeAmount(row, raw);

        if (row.id === historyRow?.id) {
          flashHistoryFields(col.key);
        }

        return;
      }

      let value = raw;

      if (isNumericType(col.type)) {
        value = numericValue(raw);
      }

      const oldValue =
        row[col.key] === null || row[col.key] === undefined
          ? ""
          : String(row[col.key]);

      const newValue =
        value === null || value === undefined ? "" : String(value);

      if (oldValue === newValue) {
        return;
      }

      updateCell(row.id, col.key, value);

      flashSaved(`${row.id}:${col.key}`);

      if (row.id === historyRow?.id) {
        flashHistoryFields(col.key);
      }
    },
    [
      updateCell,
      flashSaved,
      updateHikePct,
      updateHikeAmount,
      historyRow,
      flashHistoryFields,
    ],
  );

  // ============================================================
  // EDITABLE COLUMNS
  // ============================================================

  const editableColumns = useMemo(
    () => COLUMNS.filter((column) => column.editable),
    [],
  );

  const editableIndex = useMemo(
    () => new Map(editableColumns.map((column, index) => [column.key, index])),
    [editableColumns],
  );

  // ============================================================
  // ROW-SPECIFIC EDITABILITY
  // ============================================================

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

  // ============================================================
  // KEYBOARD NAVIGATION
  //
  // Uses `displayRows` (not `pageRows`) so navigation is correct
  // whether the grid is grouped or not.
  // ============================================================

  const onKeyDown = (event, rowIndex, columnKey) => {
    const currentRow = displayRows[rowIndex];

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

    const maxRow = displayRows.length - 1;
    const target = event.target;

    const atStart =
      !("selectionStart" in target) || target.selectionStart === 0;

    const atEnd =
      !("selectionEnd" in target) ||
      target.selectionEnd ===
        (target.value !== undefined ? target.value.length : 0);

    if (event.key === "Enter") {
      if (target instanceof HTMLTextAreaElement && !event.shiftKey) {
        return;
      }

      event.preventDefault();

      const direction = event.shiftKey ? -1 : 1;
      let nextRowIndex = rowIndex + direction;

      while (nextRowIndex >= 0 && nextRowIndex <= maxRow) {
        const nextRow = displayRows[nextRowIndex];

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

    if (event.key === "ArrowDown") {
      event.preventDefault();

      const nextRowIndex = Math.min(maxRow, rowIndex + 1);
      const nextRow = displayRows[nextRowIndex];

      const column = COLUMNS.find((item) => item.key === columnKey) || {
        key: columnKey,
        editable: false,
      };

      if (nextRow && isColumnEditable(nextRow, column)) {
        focusCell(nextRowIndex, columnKey);
      }

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      const nextRowIndex = Math.max(0, rowIndex - 1);
      const nextRow = displayRows[nextRowIndex];

      const column = COLUMNS.find((item) => item.key === columnKey) || {
        key: columnKey,
        editable: false,
      };

      if (nextRow && isColumnEditable(nextRow, column)) {
        focusCell(nextRowIndex, columnKey);
      }

      return;
    }

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

    if (event.key === "ArrowLeft" && atStart && currentRowColumnIndex > 0) {
      event.preventDefault();

      focusCell(rowIndex, rowEditableColumns[currentRowColumnIndex - 1].key);

      return;
    }

    if (event.key === "Escape") {
      target.blur();
    }
  };

  // ============================================================
  // ROW OPEN
  // ============================================================

  const openRow = useCallback(
    (row) => {
      setHistoryRow(row);

      if (showHistory) {
        setHistoryData([]);
        setHistoryError("");
      }
    },
    [showHistory],
  );

  // ============================================================
  // CELL CLICK
  // ============================================================

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

  // ============================================================
  // DOUBLE CLICK
  // ============================================================

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

  // ============================================================
  // HOVER POPUP
  // ============================================================

  const calculateHoverPosition = useCallback((event) => {
    const width = 330;
    const height = 400;
    const margin = 14;

    const viewport = gridViewportRef.current;
    const viewportRect = viewport ? viewport.getBoundingClientRect() : null;

    const minimumTop = viewportRect ? viewportRect.top + 42 : 115;

    let left = event.clientX + margin;
    let top = event.clientY + margin;

    if (left + width > window.innerWidth) {
      left = event.clientX - width - margin;
    }

    if (top + height > window.innerHeight) {
      top = event.clientY - height - margin;
    }

    top = Math.max(minimumTop, top);

    if (top + height > window.innerHeight - 8) {
      top = Math.max(minimumTop, window.innerHeight - height - 8);
    }

    return { left: Math.max(8, left), top: Math.max(8, top) };
  }, []);

  const showHoverPopup = useCallback(
    (row, event) => {
      setHoverEmployee(row);
      setHoverPosition(calculateHoverPosition(event));
      loadHoverHistory(row.empId);
    },
    [calculateHoverPosition, loadHoverHistory],
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

  // ============================================================
  // HOVER HISTORY DERIVED STATE
  // ============================================================

  const hoverEmpKey = hoverEmployee
    ? String(hoverEmployee.empId || "").trim()
    : "";

  const hoverHistoryState = hoverHistoryByEmpId[hoverEmpKey];

  // ============================================================
  // RENDER CELL
  // ============================================================

  const renderCellContent = (row, col, rowIndex) => {
    const cellKey = `${row.id}:${col.key}`;

    const isEditable = isColumnEditable(row, col);

    const isNewTitleDisabled =
      col.key === "newTitle" && row.eligibleForPromotion !== "Yes";

    const displayValue = formatValue(row, col);

    if (col.computed) {
      return (
        <div
          className={cn(
            "flex min-h-[30px] h-auto w-full items-center",
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

    if (!isEditable) {
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openRow(row);
          }}
          className={cn(
            "flex min-h-[30px] h-auto w-full",
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
          title={String(
            row[col.key] !== null && row[col.key] !== undefined
              ? row[col.key]
              : "",
          )}
        >
          {String(
            row[col.key] !== null && row[col.key] !== undefined
              ? row[col.key]
              : "",
          )}
        </button>
      );
    }

    if (col.type === "enum") {
      return (
        <div className="flex min-h-[30px] w-full items-center px-1 py-[3px]">
          <select
            ref={(element) => {
              cellRefs.current[`${rowIndex}:${col.key}`] = element;
            }}
            value={String(
              row[col.key] !== null && row[col.key] !== undefined
                ? row[col.key]
                : "",
            )}
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

              if (row.id === historyRow?.id) {
                flashHistoryFields(col.key);
              }
            }}
            className={cn(
              "h-[26px] w-full cursor-pointer rounded-[4px] border px-1 text-[10px] outline-none",
              modified[cellKey]
                ? "border-[#c9a400] bg-[#ffe066] font-semibold text-[#1e293b]"
                : "border-[#d7c96b] bg-[#fffef3] text-[#1e293b]",
              "focus:border-[#2563eb] focus:bg-white focus:ring-1 focus:ring-[#2563eb]",
              isNewTitleDisabled &&
                "cursor-not-allowed border-[#e2e8f0] bg-[#f1f5f9] opacity-60",
            )}
          >
            <option value="">Select...</option>

            {(col.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (col.type === "textarea") {
      const textareaDraft =
        editingValues[cellKey] !== undefined
          ? editingValues[cellKey]
          : String(
              row[col.key] !== null && row[col.key] !== undefined
                ? row[col.key]
                : "",
            );

      return (
        <div className="flex min-h-[30px] w-full items-center px-1 py-[3px]">
          <textarea
            ref={(element) => {
              cellRefs.current[`${rowIndex}:${col.key}`] = element;
            }}
            rows={1}
            value={textareaDraft}
            onFocus={(event) => {
              setActive(`${rowIndex}:${col.key}`);

              setEditingValues((previous) => ({
                ...previous,
                [cellKey]: String(
                  row[col.key] !== null && row[col.key] !== undefined
                    ? row[col.key]
                    : "",
                ),
              }));

              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
            }}
            onChange={(event) => {
              setEditingValue(cellKey, event.target.value);

              event.target.style.height = "auto";
              event.target.style.height = `${event.target.scrollHeight}px`;
            }}
            onBlur={(event) => {
              setActive(null);

              const raw =
                editingValues[cellKey] !== undefined
                  ? editingValues[cellKey]
                  : event.target.value;

              clearEditingValue(cellKey);

              commit(row, col, raw);

              event.target.style.height = "";
            }}
            onKeyDown={(event) => onKeyDown(event, rowIndex, col.key)}
            onDoubleClick={(event) =>
              handleEditableDoubleClick(event, rowIndex, col.key)
            }
            className={cn(
              "min-h-[26px] w-full resize-none overflow-hidden rounded-[4px] border px-1 py-[3px] text-[10px] leading-tight outline-none",
              modified[cellKey]
                ? "border-[#c9a400] bg-[#ffe066] font-semibold text-[#1e293b]"
                : "border-[#d7c96b] bg-[#fffef3] text-[#1e293b]",
              "focus:border-[#2563eb] focus:bg-white focus:ring-1 focus:ring-[#2563eb]",
            )}
          />
        </div>
      );
    }

    const draftValue =
      editingValues[cellKey] !== undefined
        ? editingValues[cellKey]
        : String(
            row[col.key] !== null && row[col.key] !== undefined
              ? row[col.key]
              : "",
          );

    return (
      <div className="relative flex min-h-[30px] w-full items-center px-1 py-[3px]">
        <input
          ref={(element) => {
            cellRefs.current[`${rowIndex}:${col.key}`] = element;
          }}
          type={
            col.type === "date"
              ? "date"
              : isNumericType(col.type)
                ? "number"
                : "text"
          }
          value={draftValue}
          onFocus={(event) => {
            setActive(`${rowIndex}:${col.key}`);

            setEditingValues((previous) => ({
              ...previous,
              [cellKey]: String(
                row[col.key] !== null && row[col.key] !== undefined
                  ? row[col.key]
                  : "",
              ),
            }));

            if (col.type !== "date") {
              requestAnimationFrame(() => {
                if (document.activeElement === event.currentTarget) {
                  event.currentTarget.select();
                }
              });
            }
          }}
          onChange={(event) => {
            setEditingValue(cellKey, event.target.value);
          }}
          onBlur={(event) => {
            setActive(null);

            const raw =
              editingValues[cellKey] !== undefined
                ? editingValues[cellKey]
                : event.target.value;

            clearEditingValue(cellKey);

            commit(row, col, raw);
          }}
          onKeyDown={(event) => onKeyDown(event, rowIndex, col.key)}
          onDoubleClick={(event) =>
            handleEditableDoubleClick(event, rowIndex, col.key)
          }
          className={cn(
            "h-[26px] w-full rounded-[4px] border px-1.5 text-[10px] outline-none",
            modified[cellKey]
              ? "border-[#c9a400] bg-[#ffe066] font-semibold text-[#1e293b]"
              : "border-[#d7c96b] bg-[#fffef3] text-[#1e293b]",
            "focus:border-[#2563eb] focus:bg-white focus:ring-1 focus:ring-[#2563eb]",
            isNumericType(col.type) && "text-right font-medium tabular-nums",
          )}
        />

        {saving[cellKey] !== undefined && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#16803c]">
            <Check className="size-2.5" />
          </span>
        )}
      </div>
    );
  };

  // ============================================================
  // RENDER ONE DATA ROW (shared by normal and grouped views)
  // ============================================================

  const renderDataRow = (row, rowIndex) => (
    <tr key={row.id} className="group" style={{ minHeight: CELL_MIN_HEIGHT }}>
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
            onCheckedChange={(value) => toggleSelected(row.id, !!value)}
            aria-label={`Select ${row.name}`}
            onClick={(event) => event.stopPropagation()}
            className="size-3"
          />
        </div>
      </td>

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
        const isComputed = col.computed;
        const isEditable = isColumnEditable(row, col);

        return (
          <td
            key={col.key}
            className={cn(
              isFrozen && "sticky",
              "border-r border-b border-[#d9e0e8] p-0 align-middle",
            )}
            style={{
              position: isFrozen ? "sticky" : "relative",
              ...(isFrozen ? { left } : {}),
              width,
              minWidth: width,
              maxWidth: width,
              minHeight: CELL_MIN_HEIGHT,
              boxSizing: "border-box",
              zIndex: isFrozen ? 30 : 1,
              boxShadow:
                isFrozen && isName
                  ? "2px 0 4px -2px rgba(71,85,105,.35)"
                  : "none",
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
  );

  // ============================================================
  // SELECT ALL
  // ============================================================

  const allSelected =
    pageRows.length > 0 && pageRows.every((row) => selected[row.id]);

  // ============================================================
  // PAGE BUTTONS
  // ============================================================

  const pageButtons = Array.from(
    { length: Math.min(totalPages, 7) },
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

  // ============================================================
  // MAIN UI
  // ============================================================

  const groupByColumnLabel =
    groupBy?.label ||
    GRID_COLUMNS.find((column) => column.key === groupBy?.key)?.label ||
    "";

  return (
    <div
      className={cn(
        "relative flex min-h-0 w-full",
        "flex-col overflow-hidden",
        "rounded-md border border-[#d5dce5]",
        "bg-white",
      )}
      style={{
        height: "calc(100vh - 126px)",
        isolation: "isolate",
        fontFamily: APPRAISAL_FONT,
      }}
    >
      {/* TOP TOOLBAR */}

      <div
        className="flex h-9 shrink-0 items-center justify-between border-b border-[#d5dce5] bg-[#e8eef5] px-3"
        style={{ fontFamily: APPRAISAL_FONT }}
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

      {/* GRID AREA */}

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
            <col style={{ width: SELECT_WIDTH }} />

            {GRID_COLUMNS.map((col) => (
              <col key={col.key} style={{ width: widthOf(col) }} />
            ))}
          </colgroup>

          <thead>
            <tr style={{ height: 34 }}>
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
                    className="sticky border-r border-b border-[#cbd5e1] p-0"
                    style={{
                      position: "sticky",
                      top: 0,
                      ...(isFrozen ? { left } : {}),
                      width,
                      minWidth: width,
                      maxWidth: width,
                      height: 34,
                      boxSizing: "border-box",
                      zIndex: isFrozen ? 90 : 60,
                      background: "#e8eef5",
                      boxShadow:
                        isFrozen && isName
                          ? "2px 0 4px -2px rgba(71,85,105,.45)"
                          : undefined,
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
                          groupable={col.key !== "empId" && col.key !== "name"}
                          groupDirection={
                            groupBy?.key === col.key ? groupBy.dir : null
                          }
                          onGroupAsc={() =>
                            setGroupBy({
                              key: col.key,
                              dir: "asc",
                              label: col.label,
                            })
                          }
                          onGroupDesc={() =>
                            setGroupBy({
                              key: col.key,
                              dir: "desc",
                              label: col.label,
                            })
                          }
                          onClearGroup={() => setGroupBy(null)}
                        />
                      </div>
                    </div>

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

          <tbody>
            {groupedSections ? (
              groupedSections.length === 0 ? (
                <tr>
                  <td
                    colSpan={GRID_COLUMNS.length + 1}
                    className="px-3 py-8 text-center text-[10px] text-slate-500"
                  >
                    No employees match the current filters.
                  </td>
                </tr>
              ) : (
                groupedSections.map((section) => (
                  <Fragment key={section.key}>
                    <tr className="bg-[#dbe6f3]">
                      <td
                        colSpan={GRID_COLUMNS.length + 1}
                        className="border-b border-[#b9cbe0] px-2 py-1.5 text-left text-[9px] font-bold text-[#173b63]"
                      >
                        {groupByColumnLabel}: {section.label}
                        <span className="ml-1.5 font-normal text-slate-500">
                          ({section.rows.length} employee
                          {section.rows.length === 1 ? "" : "s"})
                        </span>
                      </td>
                    </tr>

                    {section.rows.map((row) =>
                      renderDataRow(row, flattenedGroupOrder?.get(row.id) ?? 0),
                    )}
                  </Fragment>
                ))
              )
            ) : (
              <>
                {pageRows.map((row, rowIndex) => renderDataRow(row, rowIndex))}

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
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION / GROUP STATUS BAR */}

      <div
        className="flex h-8 shrink-0 items-center justify-between border-t border-[#d5dce5] bg-[#f8fafc] px-2.5"
        style={{ fontFamily: APPRAISAL_FONT }}
      >
        <div className="text-[8px] text-slate-500">
          {groupBy
            ? `Grouped by ${groupByColumnLabel} — showing all ${rows.length} employees`
            : rows.length === 0
              ? "0 employees"
              : `Showing ${pageStart}-${pageEnd} of ${rows.length} employees`}
        </div>

        {groupBy ? (
          <button
            type="button"
            onClick={() => setGroupBy(null)}
            className="flex h-5 items-center justify-center rounded border border-[#cbd5e1] bg-white px-2 text-[8px] font-medium text-slate-600 hover:bg-slate-100"
          >
            Clear grouping
          </button>
        ) : (
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
        )}
      </div>

      {/* HISTORY DETAILS PANEL */}

      {showHistory && (
        <div
          id="history-panel"
          className="shrink-0 border-t border-[#173b63] bg-white"
          style={{
            fontFamily: APPRAISAL_FONT,
            height: "min(270px, 32vh)",
            minHeight: 175,
          }}
        >
          <div className="flex h-8 items-center justify-between bg-[#173b63] px-3 text-white">
            <div className="flex items-center gap-2">
              <History className="size-3" />

              <span className="text-[10px] font-bold">
                History
                {historyRow ? ` - ${historyRow.name}` : ""}
              </span>

              {historyRow && !historyLoading && (
                <span className="text-[8px] opacity-75">
                  {historyData.length} cycle
                  {historyData.length === 1 ? "" : "s"}
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

          <div className="h-[calc(100%-52px)] overflow-auto">
            {!historyRow ? (
              <div className="flex h-full items-center justify-center px-3 text-center text-[9px] text-slate-500">
                Select an employee to view previous-year appraisal history.
              </div>
            ) : historyLoading ? (
              <div className="flex h-full items-center justify-center px-3 text-center text-[9px] text-slate-500">
                Loading appraisal history...
              </div>
            ) : historyError ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-[9px] text-red-500">
                <span>Unable to load appraisal history.</span>

                <span className="text-[8px] text-slate-400">
                  {historyError}
                </span>
              </div>
            ) : historyData.length === 0 ? (
              <div className="flex h-full items-center justify-center px-3 text-center text-[9px] text-slate-500">
                No previous-year appraisal data available for this employee.
              </div>
            ) : (
              <table
                className="w-full border-collapse"
                style={{ tableLayout: "fixed" }}
              >
                <colgroup>
                  <col style={{ width: 75 }} />

                  {HISTORY_METRIC_COLUMNS.map((col) => (
                    <col key={col.key} style={{ width: 105 }} />
                  ))}
                </colgroup>

                <thead>
                  <tr className="bg-[#e8eef5]">
                    <th className="border-r border-b border-[#cbd5e1] px-2 py-1 text-left align-bottom text-[8px] font-bold text-[#334155]">
                      Year
                    </th>

                    {HISTORY_METRIC_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className="border-r border-b border-[#cbd5e1] px-2 py-1 text-right align-bottom text-[8px] font-bold text-[#334155]"
                      >
                        <div>{col.label}</div>

                        <div className="text-[7px] font-normal text-slate-400">
                          % change below
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {historyData.map((item, index) => {
                    const previous = historyData[index + 1];

                    const isLatest = index === 0;

                    return (
                      <tr
                        key={`${item.year}-${index}`}
                        className={cn(
                          "h-[38px]",
                          isLatest ? "bg-[#fff9dc]" : "bg-white",
                        )}
                      >
                        <td className="border-r border-b border-[#d9e0e8] px-2 py-1 text-left text-[8px] font-bold text-[#173b63]">
                          {item.year}
                          {isLatest ? " ★" : ""}
                        </td>

                        {HISTORY_METRIC_COLUMNS.map((col) => {
                          const change = computeHistoryChange(
                            item[col.key],
                            previous ? previous[col.key] : undefined,
                          );

                          const shouldFlash =
                            isLatest && historyFlashKeys.has(col.key);

                          return (
                            <td
                              key={col.key}
                              className={cn(
                                "border-r border-b border-[#d9e0e8] px-2 py-1 text-right text-[8px] transition-colors duration-500",
                                shouldFlash && "bg-[#ffd54f]",
                              )}
                            >
                              <div>{formatHistoryNumber(item[col.key])}</div>

                              <div
                                className={cn(
                                  "text-[7px]",
                                  change.tone === "up" && "text-[#16803c]",
                                  change.tone === "down" && "text-[#dc2626]",
                                  change.tone === "neutral" && "text-slate-400",
                                )}
                              >
                                {change.label}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex h-[20px] items-center border-t border-[#e2e8f0] bg-[#f8fafc] px-3 text-[7px] text-slate-500">
            The starred row reflects the employee currently selected in the grid
            above, live. Older cycles are reference data.
          </div>
        </div>
      )}

      {/* EMPLOYEE HOVER POPUP */}

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
          <div className="border-b border-[#d9e0e8] bg-white px-3 py-2">
            <div className="text-[13px] font-bold text-[#17365d]">
              {hoverEmployee.name}
            </div>

            <div className="mt-0.5 text-[9px] text-slate-500">
              {hoverEmployee.designation}
              {" · "}
              {hoverEmployee.empId}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                Rating
              </div>

              <div className="mt-0.5 text-[14px] font-bold text-[#b98a2f]">
                {hoverEmployee.rating !== null &&
                hoverEmployee.rating !== undefined &&
                String(hoverEmployee.rating).trim() !== ""
                  ? `${hoverEmployee.rating}/5`
                  : "—"}
              </div>
            </div>

            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                RR %
              </div>

              <div className="mt-0.5 text-[14px] font-bold text-[#2c6b5c]">
                {hoverEmployee.rrPercent !== undefined
                  ? `${hoverEmployee.rrPercent}%`
                  : "—"}
              </div>
            </div>

            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                Interviews
              </div>

              <div className="mt-0.5 text-[14px] font-bold text-[#1f2937]">
                {hoverEmployee.interviewCount !== undefined
                  ? hoverEmployee.interviewCount
                  : "—"}
              </div>
            </div>

            <div />

            <div className="col-span-2 border-t border-[#edf0f4] pt-2">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                Manager feedback
              </div>

              <div className="mt-0.5 max-h-[56px] overflow-y-auto text-[11px] font-semibold leading-snug text-[#1f2937]">
                {hoverEmployee.managerRating || "—"}
              </div>
            </div>
          </div>

          <div className="border-t border-[#d9e0e8]">
            <div className="px-3 py-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">
              Recent History
            </div>

            <div className="max-h-[130px] overflow-auto">
              {hoverHistoryState?.loading ? (
                <div className="px-3 py-2 text-[8px] text-slate-500">
                  Loading history...
                </div>
              ) : hoverHistoryState?.error ? (
                <div className="px-3 py-2 text-[8px] text-red-500">
                  {hoverHistoryState.error}
                </div>
              ) : !hoverHistoryState?.data?.length ? (
                <div className="px-3 py-2 text-[8px] text-slate-500">
                  No previous-year history available.
                </div>
              ) : (
                <table className="w-full border-collapse text-[8px]">
                  <thead>
                    <tr className="bg-[#f1f5f9]">
                      <th className="px-2 py-1 text-left">Year</th>

                      <th className="px-2 py-1 text-left">Desig.</th>

                      <th className="px-2 py-1 text-left">Rating</th>

                      <th className="px-2 py-1 text-left">Promo</th>

                      <th className="px-2 py-1 text-left">Feedback</th>
                    </tr>
                  </thead>

                  <tbody>
                    {hoverHistoryState.data.map((item, index) => (
                      <tr
                        key={`${item.year}-${index}`}
                        className={index === 0 ? "bg-[#fff7c7]" : "bg-white"}
                      >
                        <td className="px-2 py-1">
                          {item.year}
                          {index === 0 ? " ★" : ""}
                        </td>

                        <td className="px-2 py-1">{item.title}</td>

                        <td className="px-2 py-1">
                          {item.rating !== null &&
                          item.rating !== undefined &&
                          String(item.rating).trim() !== ""
                            ? `${item.rating}/5`
                            : "—"}
                        </td>

                        <td className="px-2 py-1">{item.promotion}</td>

                        <td className="px-2 py-1">{item.feedback || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
