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
const CELL_MIN_HEIGHT = 40;
const HEADER_HEIGHT = 46;
const SELECT_WIDTH = 34;

const MIN_WIDTH = 60;
const MAX_WIDTH = 260;

const WIDTHS = {
  empId: 84,
  name: 165,

  designation: 120,
  reportingManager: 125,
  compManager: 125,
  appraiserTechED: 130,

  wissenExperience: 100,
  totalExperience: 96,
  lastAppraisalDate: 140,

  managerRating: 140,
  interviewCount: 86,
  rrPercent: 76,
  grossMargin: 90,

  rbToBePaid: 108,
  monthRB: 78,
  pbToBePaid: 108,
  monthPB: 78,

  currentAnnualBasePay: 132,
  targetPBAllocatedForMay: 140,
  allocatedPBAmount: 128,
  pbInstallment: 84,
  newPBToBeOffered: 128,
  newPBInstallment: 84,

  totalOfPB: 110,
  newRB: 108,
  totalBonus: 110,

  hikeAmount: 118,
  hikePct: 84,

  totalCTCWithRewards: 132,

  totalBonusHikeAmount: 138,
  totalBonusHikePct: 104,

  totalRewardsHikeAmount: 144,
  totalRewardsHikePct: 108,

  newBaseSalary: 132,
  targetPBNextYear: 136,

  eligibleForPromotion: 110,
  newTitle: 150,
  atRisk: 140,
};

const GRID_COLUMNS = COLUMNS;

// Columns that should NOT show the filter / group menu in the header
const NO_FILTER_COLUMNS = new Set(["empId", "name"]);

// ============================================================
// LOCAL STYLES (blink animation for the last edited cell)
// ============================================================

const GRID_STYLES = `
@keyframes appraisalCellBlink {
  0%, 100% { box-shadow: 0 0 0 0 rgba(201,164,0,0); }
  50% { box-shadow: 0 0 0 3px rgba(201,164,0,.55); }
}
.appraisal-cell-blink { animation: appraisalCellBlink .5s ease-in-out 3; }
`;

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
          : 100,
    ),
  );

const numericValue = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : 0;
};

// Cell background:  input = yellow tint, calculated = blue tint,
// master (read-only) = banded rows. Hover / selected override all.
const cellBackground = ({ kind, rowIndex, selected }) => {
  if (selected) {
    return "bg-[#dcebff] group-hover:bg-[#dcebff]";
  }

  const base =
    kind === "input"
      ? "bg-[#fff9dc]"
      : kind === "calc"
        ? "bg-[#eaf5ff]"
        : rowIndex % 2 === 0
          ? "bg-[#fbfcfe]"
          : "bg-[#f2f5f9]";

  return `${base} group-hover:bg-[#eaf2ff]`;
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

// Date of joining shown in the hover card header.
const formatDoj = (value) => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// ============================================================
// FIELD -> HISTORY COLUMN KEYS TO FLASH ON EDIT
// ============================================================

const HISTORY_FLASH_FIELDS = {
  currentAnnualBasePay: ["basePay", "newBasePay", "newCTC"],
  targetPBAllocatedForMay: ["performanceBonus", "totalBonus", "newCTC"],
  eligibleForPromotion: ["newCTC"],
  allocatedPBAmount: ["performanceBonus", "totalBonus", "newCTC"],
  newPBToBeOffered: ["performanceBonus", "totalBonus", "newCTC"],
  newRB: ["retentionBonus", "totalBonus", "newCTC"],
  hikeAmount: ["hikeAmount", "newCTC", "newBasePay"],
  hikePct: ["hikeAmount", "newCTC", "newBasePay"],
  targetPBNextYear: ["targetPB"],
};

// ============================================================
// FIELD -> YEAR-OVER-YEAR TOAST CONFIG
// current(row)   = this cycle's value after the edit
// prior(record)  = last cycle's value from appraisal history
// ============================================================

const YOY_FIELDS = {
  hikeAmount: {
    label: "Hike Amount",
    current: (row) => Number(row.hikeAmount) || 0,
    prior: (record) => record.hikeAmount,
  },
  hikePct: {
    label: "Hike Amount",
    current: (row) => Number(row.hikeAmount) || 0,
    prior: (record) => record.hikeAmount,
  },
  newRB: {
    label: "Retention Bonus",
    current: (row) => Number(row.newRB) || 0,
    prior: (record) => record.retentionBonus,
  },
  allocatedPBAmount: {
    label: "Perf. Bonus",
    current: (row) =>
      (Number(row.allocatedPBAmount) || 0) +
      (Number(row.newPBToBeOffered) || 0),
    prior: (record) => record.performanceBonus,
  },
  newPBToBeOffered: {
    label: "Perf. Bonus",
    current: (row) =>
      (Number(row.allocatedPBAmount) || 0) +
      (Number(row.newPBToBeOffered) || 0),
    prior: (record) => record.performanceBonus,
  },
  targetPBNextYear: {
    label: "Target PB",
    current: (row) => Number(row.targetPBNextYear) || 0,
    prior: (record) => record.targetPB,
  },
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
    designation:
      record?.designation !== null &&
      record?.designation !== undefined &&
      String(record.designation).trim() !== ""
        ? String(record.designation)
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

const emptyHistoryRecord = (year) => ({
  year,
  basePay: 0,
  joiningBonus: 0,
  allocatedPB: 0,
  performanceBonus: 0,
  retentionBonus: 0,
  totalPB: 0,
  totalBonus: 0,
  hikeAmount: 0,
  hikePct: 0,
  promotion: "—",
  title: "—",
  designation: "—",
  rating: "—",
  feedback: "—",
  targetPB: 0,
  newCTC: 0,
  newBasePay: 0,
});

const isCurrentYearRecord = (record) =>
  String(record.year) === CURRENT_APPRAISAL_YEAR;

// ============================================================
// APPLY LIVE SHEET VALUES TO CURRENT-YEAR HISTORY
// ============================================================

const applyCurrentYearSheetValues = (historyRecord, row) => {
  if (!row) {
    return historyRecord;
  }

  if (!isCurrentYearRecord(historyRecord)) {
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
    designation: row.designation ? String(row.designation) : "—",

    targetPB: targetPBNextYear,
    newCTC,
    newBasePay: newBaseSalary,
  };
};

// Current cycle row (always first, always live) + older cycles from the API.
const buildHistoryView = (records, row) => {
  if (!row) {
    return [];
  }

  const currentRecord =
    records.find(isCurrentYearRecord) ||
    emptyHistoryRecord(CURRENT_APPRAISAL_YEAR);

  const olderRecords = records.filter((record) => !isCurrentYearRecord(record));

  return [applyCurrentYearSheetValues(currentRecord, row), ...olderRecords];
};

const sortHistoryDesc = (a, b) => String(b.year).localeCompare(String(a.year));

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
  const { updateCell, updateLinkedCells, bulkUpdate, modified } =
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

  const empIdWidth = empIdColumn ? widthOf(empIdColumn) : MIN_WIDTH;

  // ============================================================
  // STATES
  // ============================================================

  const [, setActive] = useState(null);
  const [saving, setSaving] = useState({});
  const [currentPage, setCurrentPage] = useState(1);

  // ============================================================
  // GROUP BY / SORT
  // ============================================================

  const [groupBy, setGroupBy] = useState([]);

  const addGroup = useCallback((key, dir, label) => {
    setGroupBy((previous) => {
      const existingIndex = previous.findIndex((item) => item.key === key);

      if (existingIndex >= 0) {
        return previous.map((item, index) =>
          index === existingIndex ? { ...item, dir, label } : item,
        );
      }

      return [...previous, { key, dir, label }];
    });
  }, []);

  const removeGroup = useCallback((key) => {
    setGroupBy((previous) => previous.filter((item) => item.key !== key));
  }, []);

  const clearAllGroups = useCallback(() => {
    setGroupBy([]);
  }, []);

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

  const groupedRows = useMemo(() => {
    if (!groupBy.length) {
      return null;
    }

    const groupColumns = groupBy
      .map((group) => {
        const column = GRID_COLUMNS.find((item) => item.key === group.key);

        if (!column) {
          return null;
        }

        return {
          ...group,
          column,
        };
      })
      .filter(Boolean);

    if (!groupColumns.length) {
      return null;
    }

    const sortRows = (sourceRows) => {
      return [...sourceRows].sort((rowA, rowB) => {
        for (const group of groupColumns) {
          const result = compareGroupValues(rowA, rowB, group.column);

          if (result !== 0) {
            return group.dir === "desc" ? -result : result;
          }
        }

        return 0;
      });
    };

    const buildLevel = (sourceRows, level) => {
      const group = groupColumns[level];
      const sortedRows = sortRows(sourceRows);

      const sections = [];
      let currentKey;
      let currentRows = [];
      let hasCurrent = false;

      const pushSection = () => {
        if (!hasCurrent) {
          return;
        }

        const rawValue = currentKey;
        const sampleRow = currentRows[0];

        const displayValue = sampleRow
          ? formatValue(sampleRow, group.column)
          : "";

        const label =
          displayValue === "" ||
          displayValue === null ||
          displayValue === undefined
            ? "(blank)"
            : displayValue;

        sections.push({
          key: `${group.key}:${String(rawValue)}:${level}:${sections.length}`,
          level,
          groupKey: group.key,
          label,
          rows: currentRows,
          children:
            level < groupColumns.length - 1
              ? buildLevel(currentRows, level + 1)
              : null,
        });
      };

      sortedRows.forEach((row) => {
        const value = getGroupValue(row, group.column);

        if (!hasCurrent || value !== currentKey) {
          pushSection();

          currentKey = value;
          currentRows = [row];
          hasCurrent = true;
        } else {
          currentRows.push(row);
        }
      });

      pushSection();

      return sections;
    };

    return buildLevel(rows, 0);
  }, [rows, groupBy, compareGroupValues, getGroupValue]);

  const flattenGroupedSections = useCallback((sections) => {
    const result = [];

    const walk = (items) => {
      items.forEach((section) => {
        if (section.children) {
          walk(section.children);
        } else {
          section.rows.forEach((row) => {
            result.push(row);
          });
        }
      });
    };

    walk(sections);

    return result;
  }, []);

  // ============================================================
  // HISTORY FLASH (bottom panel cells affected by the last edit)
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
  // BLINK ON THE LAST EDITED CELL
  // ============================================================

  const [lastEditedKey, setLastEditedKey] = useState(null);
  const blinkTimerRef = useRef(null);

  const markEdited = useCallback((cellKey) => {
    if (blinkTimerRef.current) {
      clearTimeout(blinkTimerRef.current);
    }

    setLastEditedKey(cellKey);

    blinkTimerRef.current = setTimeout(() => {
      setLastEditedKey(null);
    }, 1600);
  }, []);

  useEffect(() => {
    return () => {
      if (blinkTimerRef.current) {
        clearTimeout(blinkTimerRef.current);
      }
    };
  }, []);

  // ============================================================
  // SELECTED EMPLOYEE (drives the history panel)
  // ============================================================

  const [historyRow, setHistoryRow] = useState(null);

  // Select the first employee by default so the panel is never empty.
  useEffect(() => {
    if (!historyRow && rows.length > 0) {
      setHistoryRow(rows[0]);
    }
  }, [rows, historyRow]);

  // ============================================================
  // HISTORY LOADER (one request per employee, shared by the
  // bottom panel, the hover popup and the YoY toast)
  // ============================================================

  const historyPromiseRef = useRef(new Map());

  const [historyByEmpId, setHistoryByEmpId] = useState({});

  const loadHistory = useCallback((empId) => {
    const key = String(empId || "").trim();

    if (!key) {
      return Promise.resolve([]);
    }

    const existing = historyPromiseRef.current.get(key);

    if (existing) {
      return existing;
    }

    setHistoryByEmpId((previous) => ({
      ...previous,
      [key]: { loading: true, data: [], error: "" },
    }));

    const promise = (async () => {
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
        throw new Error(result?.message || "Failed to load appraisal history.");
      }

      const records = Array.isArray(result?.data) ? result.data : [];

      return records.map(normalizeHistoryRecord).sort(sortHistoryDesc);
    })();

    historyPromiseRef.current.set(key, promise);

    promise
      .then((data) => {
        setHistoryByEmpId((previous) => ({
          ...previous,
          [key]: { loading: false, data, error: "" },
        }));
      })
      .catch((error) => {
        console.error("Appraisal history fetch error:", error);

        historyPromiseRef.current.delete(key);

        setHistoryByEmpId((previous) => ({
          ...previous,
          [key]: {
            loading: false,
            data: [],
            error: error?.message || "Unable to load appraisal history.",
          },
        }));
      });

    return promise;
  }, []);

  // Load history for the selected employee while the panel is open.
  useEffect(() => {
    if (!showHistory || !historyRow?.empId) {
      return;
    }

    loadHistory(historyRow.empId).catch(() => {});
  }, [showHistory, historyRow?.empId, loadHistory]);

  // Live version of the selected row (the snapshot in state goes stale on edit).
  const liveHistoryRow = useMemo(() => {
    if (!historyRow) {
      return null;
    }

    return rows.find((row) => row.id === historyRow.id) || historyRow;
  }, [rows, historyRow]);

  const historyEmpKey = historyRow ? String(historyRow.empId || "").trim() : "";

  const historyState = historyByEmpId[historyEmpKey];

  const historyLoading = !historyState || historyState.loading;
  const historyError = historyState?.error || "";

  const historyData = useMemo(
    () => buildHistoryView(historyState?.data || [], liveHistoryRow),
    [historyState, liveHistoryRow],
  );

  // ============================================================
  // YEAR-OVER-YEAR TOAST
  // ============================================================

  const [cellToast, setCellToast] = useState(null);
  const cellToastTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (cellToastTimerRef.current) {
        clearTimeout(cellToastTimerRef.current);
      }
    };
  }, []);

  const showYoyToast = useCallback(
    (anchor, key, projectedRow) => {
      const config = YOY_FIELDS[key];

      if (!config || !anchor || !projectedRow?.empId) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const currentValue = config.current(projectedRow);

      loadHistory(projectedRow.empId)
        .then((records) => {
          const priorRecord = records.find(
            (record) => !isCurrentYearRecord(record),
          );

          const priorValue = priorRecord ? config.prior(priorRecord) : 0;

          const toastWidth = 280;

          const left = Math.max(
            8,
            Math.min(rect.left, window.innerWidth - toastWidth - 8),
          );

          let top = rect.bottom + 6;

          if (top + 70 > window.innerHeight) {
            top = Math.max(8, rect.top - 76);
          }

          setCellToast({
            label: config.label,
            currentValue,
            priorValue,
            left,
            top,
            mode: "yoy",
            isText: false,
          });

          if (cellToastTimerRef.current) {
            clearTimeout(cellToastTimerRef.current);
          }

          cellToastTimerRef.current = setTimeout(() => {
            setCellToast(null);
          }, 3500);
        })
        .catch(() => {});
    },
    [loadHistory],
  );

  // Toast for any editable field that has no year-over-year mapping.
  const showChangeToast = useCallback(
    (anchor, label, priorValue, currentValue, isText) => {
      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const toastWidth = 280;

      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - toastWidth - 8),
      );

      let top = rect.bottom + 6;

      if (top + 70 > window.innerHeight) {
        top = Math.max(8, rect.top - 76);
      }

      setCellToast({
        label,
        currentValue,
        priorValue,
        left,
        top,
        mode: "prev",
        isText: !!isText,
      });

      if (cellToastTimerRef.current) {
        clearTimeout(cellToastTimerRef.current);
      }

      cellToastTimerRef.current = setTimeout(() => {
        setCellToast(null);
      }, 3500);
    },
    [],
  );

  // ============================================================
  // HOVER
  // ============================================================

  const [hoverEmployee, setHoverEmployee] = useState(null);

  const [hoverPosition, setHoverPosition] = useState({ left: 0, top: 0 });

  const hoverEmpKey = hoverEmployee
    ? String(hoverEmployee.empId || "").trim()
    : "";

  const hoverHistoryState = historyByEmpId[hoverEmpKey];

  const liveHoverEmployee = useMemo(() => {
    if (!hoverEmployee) {
      return null;
    }

    return rows.find((row) => row.id === hoverEmployee.id) || hoverEmployee;
  }, [rows, hoverEmployee]);

  const hoverHistoryRows = useMemo(() => {
    if (!hoverHistoryState?.data) {
      return [];
    }

    return hoverHistoryState.data.map((record) =>
      applyCurrentYearSheetValues(record, liveHoverEmployee),
    );
  }, [hoverHistoryState, liveHoverEmployee]);

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

  // Unified display order — matches whichever mode is active.
  const displayRows = useMemo(() => {
    if (groupedRows) {
      return flattenGroupedSections(groupedRows);
    }

    return pageRows;
  }, [groupedRows, flattenGroupedSections, pageRows]);

  const flattenedGroupOrder = useMemo(() => {
    const order = new Map();

    displayRows.forEach((row, index) => {
      order.set(row.id, index);
    });

    return order;
  }, [displayRows]);

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
        const changed =
          (Number(row.hikePct) || 0) !== 0 ||
          (Number(row.hikeAmount) || 0) !== 0;

        updateLinkedCells(row.id, { hikePct: "", hikeAmount: "" });

        if (changed) {
          flashSaved(`${row.id}:hikePct`);
          flashSaved(`${row.id}:hikeAmount`);
        }

        return { changed, hikeAmount: 0 };
      }

      const basePay = Number(row.currentAnnualBasePay || 0);
      const pct = Number(raw) || 0;
      const amount = Math.round(basePay * (pct / 100));

      const changed =
        (Number(row.hikePct) || 0) !== pct ||
        (Number(row.hikeAmount) || 0) !== amount;

      updateLinkedCells(row.id, { hikePct: pct, hikeAmount: amount });

      if (changed) {
        flashSaved(`${row.id}:hikePct`);
        flashSaved(`${row.id}:hikeAmount`);
      }

      return { changed, hikeAmount: amount };
    },
    [updateLinkedCells, flashSaved],
  );

  // ============================================================
  // HIKE AMOUNT
  // ============================================================

  const updateHikeAmount = useCallback(
    (row, raw) => {
      if (raw === "") {
        const changed =
          (Number(row.hikePct) || 0) !== 0 ||
          (Number(row.hikeAmount) || 0) !== 0;

        updateLinkedCells(row.id, { hikeAmount: "", hikePct: "" });

        if (changed) {
          flashSaved(`${row.id}:hikeAmount`);
          flashSaved(`${row.id}:hikePct`);
        }

        return { changed, hikeAmount: 0 };
      }

      const basePay = Number(row.currentAnnualBasePay || 0);
      const amount = Number(raw) || 0;

      const pct = basePay ? Number(((amount / basePay) * 100).toFixed(1)) : 0;

      const changed =
        (Number(row.hikeAmount) || 0) !== amount ||
        (Number(row.hikePct) || 0) !== pct;

      updateLinkedCells(row.id, { hikeAmount: amount, hikePct: pct });

      if (changed) {
        flashSaved(`${row.id}:hikeAmount`);
        flashSaved(`${row.id}:hikePct`);
      }

      return { changed, hikeAmount: amount };
    },
    [updateLinkedCells, flashSaved],
  );

  // ============================================================
  // COMMIT
  // ============================================================

  const commit = useCallback(
    (row, col, raw, anchor) => {
      if (col.key === "hikePct" || col.key === "hikeAmount") {
        const outcome =
          col.key === "hikePct"
            ? updateHikePct(row, raw)
            : updateHikeAmount(row, raw);

        if (outcome.changed) {
          markEdited(`${row.id}:${col.key}`);

          if (row.id === historyRow?.id) {
            flashHistoryFields(col.key);
          }

          if (raw !== "") {
            showYoyToast(anchor, col.key, {
              ...row,
              hikeAmount: outcome.hikeAmount,
            });
          }
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
      markEdited(`${row.id}:${col.key}`);

      if (row.id === historyRow?.id) {
        flashHistoryFields(col.key);
      }

      if (YOY_FIELDS[col.key]) {
        showYoyToast(anchor, col.key, { ...row, [col.key]: value });
      } else if (isNumericType(col.type)) {
        showChangeToast(
          anchor,
          col.label,
          Number(row[col.key]) || 0,
          Number(value) || 0,
          false,
        );
      } else {
        showChangeToast(anchor, col.label, oldValue, newValue, true);
      }
    },
    [
      updateCell,
      flashSaved,
      markEdited,
      updateHikePct,
      updateHikeAmount,
      historyRow,
      flashHistoryFields,
      showYoyToast,
      showChangeToast,
    ],
  );

  // ============================================================
  // LIVE COMMIT WHILE TYPING
  // (grid, history panel and toast stay in sync on every keystroke)
  // ============================================================

  const liveTimersRef = useRef({});

  const cancelLiveCommit = useCallback((cellKey) => {
    const timer = liveTimersRef.current[cellKey];

    if (timer) {
      clearTimeout(timer);
      delete liveTimersRef.current[cellKey];
    }
  }, []);

  const scheduleLiveCommit = useCallback(
    (row, col, raw, anchor) => {
      const cellKey = `${row.id}:${col.key}`;

      cancelLiveCommit(cellKey);

      liveTimersRef.current[cellKey] = setTimeout(() => {
        delete liveTimersRef.current[cellKey];
        commit(row, col, raw, anchor);
      }, 600);
    },
    [commit, cancelLiveCommit],
  );

  useEffect(() => {
    return () => {
      Object.values(liveTimersRef.current).forEach((timer) =>
        clearTimeout(timer),
      );

      liveTimersRef.current = {};
    };
  }, []);

  // ============================================================
  // BULK EDIT ONE COLUMN (from the column filter popover)
  // ============================================================

  const applyColumnBulkEdit = useCallback(
    (col, rawValue) => {
      if (!rows.length) {
        return;
      }

      if (col.key === "hikePct" || col.key === "hikeAmount") {
        rows.forEach((row) => {
          if (col.key === "hikePct") {
            updateHikePct(row, String(rawValue));
          } else {
            updateHikeAmount(row, String(rawValue));
          }
        });

        return;
      }

      const value = isNumericType(col.type) ? numericValue(rawValue) : rawValue;

      bulkUpdate(
        rows.map((row) => row.id),
        col.key,
        "set",
        value,
      );
    },
    [rows, bulkUpdate, updateHikePct, updateHikeAmount],
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
  // ROW OPEN / SELECT
  // ============================================================

  const openRow = useCallback((row) => {
    setHistoryRow(row);
  }, []);

  // Focusing any editable cell also selects that employee's row.
  const selectRowForEdit = useCallback((row) => {
    setHistoryRow((previous) => (previous?.id === row.id ? previous : row));
  }, []);

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
    const width = 430;
    const height = 300;
    const margin = 14;

    const viewport = gridViewportRef.current;
    const viewportRect = viewport ? viewport.getBoundingClientRect() : null;

    const minimumTop = viewportRect ? viewportRect.top + 46 : 115;

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
      loadHistory(row.empId).catch(() => {});
    },
    [calculateHoverPosition, loadHistory],
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
  // RENDER CELL
  // ============================================================

  const renderCellContent = (row, col, rowIndex) => {
    const cellKey = `${row.id}:${col.key}`;

    const isEditable = isColumnEditable(row, col);

    const displayValue = formatValue(row, col);

    const isBlinking = lastEditedKey === cellKey;

    if (col.computed) {
      return (
        <div
          className={cn(
            "flex min-h-[38px] h-auto w-full items-center justify-end",
            "px-2 py-1",
            "whitespace-normal break-words",
            "leading-tight",
            "text-right",
            "text-[12px]",
            "font-semibold",
            "tabular-nums",
            modified[cellKey] ? "text-slate-900" : "text-[#14527d]",
          )}
          title="Calculated automatically"
        >
          {col.type === "currency"
            ? displayValue.replace(/^₹\s?/, "")
            : displayValue}
        </div>
      );
    }

    if (!isEditable) {
      const rawText =
        row[col.key] !== null && row[col.key] !== undefined
          ? String(row[col.key])
          : "";

      const isMoney = col.type === "currency";

      const text = isMoney ? displayValue.replace(/^₹\s?/, "") : rawText;

      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openRow(row);
          }}
          className={cn(
            "flex min-h-[38px] h-auto w-full",
            "items-center",
            "px-2 py-1",
            "text-[12px]",
            "font-normal text-[#4b5563]",
            "whitespace-normal break-words",
            "leading-tight",
            isMoney ? "justify-end text-right tabular-nums" : "text-left",
            col.key === "name" &&
              "font-semibold text-[#1559a6] hover:underline",
            col.key === "empId" && "text-[11px] text-slate-500",
          )}
          title={col.key === "name" ? undefined : text}
        >
          {text}
        </button>
      );
    }

    if (col.type === "enum") {
      return (
        <div className="flex min-h-[38px] w-full items-center px-1.5 py-1">
          <select
            ref={(element) => {
              cellRefs.current[`${rowIndex}:${col.key}`] = element;
            }}
            value={String(
              row[col.key] !== null && row[col.key] !== undefined
                ? row[col.key]
                : "",
            )}
            onFocus={() => {
              setActive(`${rowIndex}:${col.key}`);
              selectRowForEdit(row);
            }}
            onBlur={() => setActive(null)}
            onKeyDown={(event) => onKeyDown(event, rowIndex, col.key)}
            onDoubleClick={(event) =>
              handleEditableDoubleClick(event, rowIndex, col.key)
            }
            onChange={(event) => {
              const value = event.target.value;
              const anchor = event.currentTarget;

              if (col.key === "eligibleForPromotion" && value === "No") {
                updateLinkedCells(
                  row.id,
                  {
                    eligibleForPromotion: "No",
                    newTitle: null,
                  },
                  "Cell edit",
                );

                flashSaved(cellKey);
                markEdited(cellKey);

                const newTitleCellKey = `${row.id}:newTitle`;
                flashSaved(newTitleCellKey);
                markEdited(newTitleCellKey);

                if (row.id === historyRow?.id) {
                  flashHistoryFields("eligibleForPromotion");
                  flashHistoryFields("newTitle");
                }

                showChangeToast(
                  anchor,
                  col.label,
                  String(row[col.key] || ""),
                  "No",
                  true,
                );

                return;
              }
              /* NEW: remind to set New Title the moment Promotion flips to Yes */
              if (col.key === "eligibleForPromotion" && value === "Yes") {
                updateCell(row.id, col.key, value);
                flashSaved(cellKey);
                markEdited(cellKey);
                if (row.id === historyRow?.id) flashHistoryFields(col.key);
                showChangeToast(
                  anchor,
                  col.label,
                  String(row[col.key] || ""),
                  "Yes",
                  true,
                );

                if (!row.newTitle) {
                  window.alert(
                    `${row.name || "This employee"} is now marked eligible for promotion. Please set the New Title — it is mandatory.`,
                  );
                }
                return;
              }

              updateCell(row.id, col.key, value);

              flashSaved(cellKey);
              markEdited(cellKey);

              if (row.id === historyRow?.id) {
                flashHistoryFields(col.key);
              }

              showChangeToast(
                anchor,
                col.label,
                String(row[col.key] || ""),
                value,
                true,
              );
            }}
            className={cn(
              "h-[30px] w-full cursor-pointer rounded-[4px] border px-1 text-[12px] outline-none",
              modified[cellKey]
                ? "border-[#c9a400] bg-[#ffe066] font-semibold text-[#1e293b]"
                : "border-[#d7c96b] bg-[#fffef3] text-[#1e293b]",
              "focus:border-[#2563eb] focus:bg-white focus:ring-1 focus:ring-[#2563eb]",
              isBlinking && "appraisal-cell-blink",
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
        <div className="flex min-h-[38px] w-full items-center px-1.5 py-1">
          <textarea
            ref={(element) => {
              cellRefs.current[`${rowIndex}:${col.key}`] = element;
            }}
            rows={1}
            value={textareaDraft}
            onFocus={(event) => {
              setActive(`${rowIndex}:${col.key}`);
              selectRowForEdit(row);

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

              commit(row, col, raw, event.currentTarget);

              event.target.style.height = "";
            }}
            onKeyDown={(event) => onKeyDown(event, rowIndex, col.key)}
            onDoubleClick={(event) =>
              handleEditableDoubleClick(event, rowIndex, col.key)
            }
            className={cn(
              "min-h-[30px] w-full resize-none overflow-hidden rounded-[4px] border px-1.5 py-[5px] text-[12px] leading-tight outline-none",
              modified[cellKey]
                ? "border-[#c9a400] bg-[#ffe066] font-semibold text-[#1e293b]"
                : "border-[#d7c96b] bg-[#fffef3] text-[#1e293b]",
              "focus:border-[#2563eb] focus:bg-white focus:ring-1 focus:ring-[#2563eb]",
              isBlinking && "appraisal-cell-blink",
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

    const isMonthColumn = col.key === "monthRB" || col.key === "monthPB";

    return (
      <div className="relative flex min-h-[38px] w-full items-center px-1.5 py-1">
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
            selectRowForEdit(row);

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

            scheduleLiveCommit(row, col, event.target.value, event.target);
          }}
          onBlur={(event) => {
            setActive(null);

            cancelLiveCommit(cellKey);

            const raw =
              editingValues[cellKey] !== undefined
                ? editingValues[cellKey]
                : event.target.value;

            clearEditingValue(cellKey);

            commit(row, col, raw, event.currentTarget);
          }}
          onKeyDown={(event) => onKeyDown(event, rowIndex, col.key)}
          onDoubleClick={(event) =>
            handleEditableDoubleClick(event, rowIndex, col.key)
          }
          className={cn(
            "h-[30px] w-full rounded-[4px] border px-1.5 text-[12px] outline-none",
            modified[cellKey]
              ? "border-[#c9a400] bg-[#ffe066] font-semibold text-[#1e293b]"
              : "border-[#d7c96b] bg-[#fffef3] text-[#1e293b]",
            "focus:border-[#2563eb] focus:bg-white focus:ring-1 focus:ring-[#2563eb]",
            isNumericType(col.type) && "text-right font-medium tabular-nums",
            isMonthColumn && "text-center",
            isBlinking && "appraisal-cell-blink",
          )}
        />

        {saving[cellKey] !== undefined && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#16803c]">
            <Check className="size-3" />
          </span>
        )}
      </div>
    );
  };

  // ============================================================
  // RENDER ONE DATA ROW
  // ============================================================

  const renderDataRow = (row, rowIndex) => {
    const isSelectedRow = historyRow?.id === row.id;

    return (
      <tr key={row.id} className="group" style={{ minHeight: CELL_MIN_HEIGHT }}>
        <td
          className={cn(
            "sticky left-0 border-r border-b border-[#e0e5ec] p-0 align-middle",
            cellBackground({
              kind: "master",
              rowIndex,
              selected: isSelectedRow,
            }),
          )}
          style={{
            position: "sticky",
            left: 0,
            width: SELECT_WIDTH,
            minWidth: SELECT_WIDTH,
            maxWidth: SELECT_WIDTH,
            minHeight: CELL_MIN_HEIGHT,
            zIndex: 20,
            boxShadow: "1px 0 0 rgba(148,163,184,.35)",
          }}
          onClick={() => openRow(row)}
        >
          <div className="flex min-h-[38px] h-full items-center justify-center">
            <Checkbox
              checked={!!selected[row.id]}
              onCheckedChange={(value) => toggleSelected(row.id, !!value)}
              aria-label={`Select ${row.name}`}
              onClick={(event) => event.stopPropagation()}
              className="size-3.5"
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

          const kind = isComputed ? "calc" : isEditable ? "input" : "master";

          return (
            <td
              key={col.key}
              className={cn(
                isFrozen && "sticky",
                "border-r border-b border-[#e0e5ec] p-0 align-middle",
                cellBackground({
                  kind: isFrozen ? "master" : kind,
                  rowIndex,
                  selected: isSelectedRow,
                }),
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
              }}
              onClick={() => handleCellClick(row, isEditable)}
            >
              <div className="relative min-h-[38px] h-auto w-full">
                {isName ? (
                  <div
                    className="min-h-[38px] h-auto w-full"
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
  };

  // ============================================================
  // RENDER GROUPED SECTIONS
  // ============================================================

  const renderGroupedSections = useCallback(
    (sections) => {
      return sections.map((section) => {
        const childSections = section.children;

        return (
          <Fragment key={section.key}>
            <tr className="bg-[#dbe6f3]">
              <td
                colSpan={GRID_COLUMNS.length + 1}
                className="border-b border-[#b9cbe0] p-0"
              >
                <div
                  className={cn(
                    "sticky left-0 inline-flex min-h-[28px] max-w-max",
                    "items-center whitespace-nowrap",
                    "px-2.5 py-1.5",
                    "text-left text-[12px] font-bold text-[#173b63]",
                    section.level > 0 && "pl-5",
                  )}
                >
                  <span>
                    {section.groupKey
                      ? `${
                          GRID_COLUMNS.find(
                            (column) => column.key === section.groupKey,
                          )?.label || ""
                        }: ${section.label}`
                      : section.label}
                  </span>

                  <span className="ml-2 font-normal text-slate-500">
                    ({section.rows.length} employee
                    {section.rows.length === 1 ? "" : "s"})
                  </span>
                </div>
              </td>
            </tr>

            {childSections
              ? renderGroupedSections(childSections)
              : section.rows.map((row) =>
                  renderDataRow(
                    row,
                    flattenedGroupOrder.get(row.id) !== undefined
                      ? flattenedGroupOrder.get(row.id)
                      : 0,
                  ),
                )}
          </Fragment>
        );
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderDataRow, flattenedGroupOrder],
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
  // GROUP LABEL
  // ============================================================

  const groupByColumnLabel = groupBy.length
    ? groupBy
        .map((group) => {
          const column = GRID_COLUMNS.find((item) => item.key === group.key);

          if (!column) {
            return "";
          }

          return `${column.label} ${group.dir === "desc" ? "↓" : "↑"}`;
        })
        .filter(Boolean)
        .join(" → ")
    : "";

  // ============================================================
  // TOAST TEXT
  // ============================================================

  const toastParts = cellToast
    ? (() => {
        const diff = cellToast.currentValue - cellToast.priorValue;
        const change = computeHistoryChange(
          cellToast.currentValue,
          cellToast.priorValue,
        );

        const hasPrior = !!cellToast.priorValue;

        const suffix = cellToast.mode === "prev" ? "vs previous" : "YoY";

        if (cellToast.isText) {
          return {
            valueText: `"${cellToast.currentValue || "—"}"`,
            text: cellToast.priorValue
              ? `was "${cellToast.priorValue}"`
              : "set for this cycle",
            down: false,
          };
        }

        return {
          valueText: formatHistoryNumber(cellToast.currentValue),
          text: hasPrior
            ? `${diff >= 0 ? "+" : ""}${formatHistoryNumber(diff)} (${change.label} ${suffix})`
            : "new this cycle",
          down: hasPrior && change.tone === "down",
        };
      })()
    : null;

  // ============================================================
  // MAIN UI
  // ============================================================

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
      <style>{GRID_STYLES}</style>

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
            <tr style={{ height: HEADER_HEIGHT }}>
              <th
                className="sticky left-0 top-0 border-r border-b border-[#cbd5e1] p-0"
                style={{
                  position: "sticky",
                  left: 0,
                  top: 0,
                  width: SELECT_WIDTH,
                  minWidth: SELECT_WIDTH,
                  maxWidth: SELECT_WIDTH,
                  height: HEADER_HEIGHT,
                  background: "#dfe8f3",
                  zIndex: 80,
                }}
              >
                <div
                  className="flex items-center justify-center"
                  style={{ height: HEADER_HEIGHT }}
                >
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(value) => toggleAll(!!value)}
                    aria-label="Select all"
                    className="size-3.5"
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

                const showFilter = !NO_FILTER_COLUMNS.has(col.key);

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
                      height: HEADER_HEIGHT,
                      boxSizing: "border-box",
                      zIndex: isFrozen ? 90 : 60,
                      background: isFrozen ? "#dfe8f3" : "#e9eef5",
                      boxShadow:
                        isFrozen && isName
                          ? "2px 0 4px -2px rgba(71,85,105,.45)"
                          : undefined,
                      fontFamily: APPRAISAL_FONT,
                    }}
                  >
                    <div
                      className="flex h-auto w-full items-center gap-1 px-2"
                      style={{ minHeight: HEADER_HEIGHT }}
                    >
                      <span
                        className="min-w-0 flex-1 overflow-hidden break-words text-left text-[11px] font-bold leading-[13px] text-[#24364d]"
                        title={col.label}
                      >
                        {col.label}
                      </span>

                      {showFilter && (
                        <div className="shrink-0">
                          <ColumnFilter
                            columnKey={col.key}
                            filter={filters[col.key]}
                            options={optionsFor(col.key)}
                            onChange={(filter) => setFilter(col.key, filter)}
                            sortDirection={
                              groupBy.find((item) => item.key === col.key)
                                ?.dir || null
                            }
                            onSortAsc={() =>
                              addGroup(col.key, "asc", col.label)
                            }
                            onSortDesc={() =>
                              addGroup(col.key, "desc", col.label)
                            }
                            onClearSort={() => removeGroup(col.key)}
                            bulkEditable={!!col.editable && !col.computed}
                            bulkRowCount={rows.length}
                            onBulkApply={(value) =>
                              applyColumnBulkEdit(col, value)
                            }
                          />
                        </div>
                      )}
                    </div>

                    <div
                      role="separator"
                      aria-label={`Resize ${col.label} column`}
                      title="Drag to resize column"
                      onPointerDown={(event) => startColumnResize(event, col)}
                      className="absolute top-0 right-[-2px] z-[100] h-full w-[5px] cursor-col-resize touch-none hover:bg-[#17365d]/30"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {groupedRows ? (
              groupedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={GRID_COLUMNS.length + 1}
                    className="px-3 py-8 text-center text-[12px] text-slate-500"
                  >
                    No employees match the current filters.
                  </td>
                </tr>
              ) : (
                renderGroupedSections(groupedRows)
              )
            ) : (
              <>
                {pageRows.map((row, rowIndex) => renderDataRow(row, rowIndex))}

                {pageRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={GRID_COLUMNS.length + 1}
                      className="px-3 py-8 text-center text-[12px] text-slate-500"
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
        className="flex h-9 shrink-0 items-center justify-between border-t border-[#d5dce5] bg-[#f8fafc] px-3"
        style={{ fontFamily: APPRAISAL_FONT }}
      >
        <div className="text-[11px] text-slate-500">
          {groupBy.length
            ? `Grouped by ${groupByColumnLabel} — showing all ${rows.length} employees`
            : rows.length === 0
              ? "0 employees"
              : `Showing ${pageStart}-${pageEnd} of ${rows.length} employees`}

          <span className="ml-3 text-slate-400">
            Modified cells save automatically.
          </span>
        </div>

        {groupBy.length ? (
          <button
            type="button"
            onClick={clearAllGroups}
            className="flex h-6 items-center justify-center rounded border border-[#cbd5e1] bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
          >
            Clear grouping
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="flex size-6 items-center justify-center rounded border border-[#cbd5e1] bg-white text-slate-500 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" />
            </button>

            {pageButtons.map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={cn(
                  "flex size-6 items-center justify-center rounded border text-[11px] font-medium",
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
              className="flex size-6 items-center justify-center rounded border border-[#cbd5e1] bg-white text-slate-500 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight className="size-3.5" />
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
            height: "min(300px, 36vh)",
            minHeight: 210,
          }}
        >
          <div className="flex h-9 items-center justify-between bg-[#173b63] px-3 text-white">
            <div className="flex items-center gap-2">
              <History className="size-3.5" />

              <span className="text-[13px] font-bold">
                History
                {historyRow ? ` - ${historyRow.name}` : ""}
              </span>

              {historyRow && !historyLoading && (
                <span className="text-[11px] opacity-75">
                  {historyData.length} cycle
                  {historyData.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="flex size-6 items-center justify-center rounded text-white hover:bg-white/10"
              aria-label="Close history"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="h-[calc(100%-60px)] overflow-auto">
            {!historyRow ? (
              <div className="flex h-full items-center justify-center px-3 text-center text-[12px] text-slate-500">
                Select an employee to view previous-year appraisal history.
              </div>
            ) : historyLoading ? (
              <div className="flex h-full items-center justify-center px-3 text-center text-[12px] text-slate-500">
                Loading appraisal history...
              </div>
            ) : historyError ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-[12px] text-red-500">
                <span>Unable to load appraisal history.</span>

                <span className="text-[11px] text-slate-400">
                  {historyError}
                </span>
              </div>
            ) : (
              <table
                className="w-full border-collapse"
                style={{ tableLayout: "fixed", minWidth: 1100 }}
              >
                <colgroup>
                  <col style={{ width: 90 }} />

                  {HISTORY_METRIC_COLUMNS.map((col) => (
                    <col key={col.key} style={{ width: 120 }} />
                  ))}
                </colgroup>

                <thead>
                  <tr className="bg-[#eef2f7]">
                    <th className="sticky top-0 border-r border-b border-[#cbd5e1] bg-[#eef2f7] px-2 py-1.5 text-center align-bottom text-[11px] font-bold text-[#24364d]">
                      Year
                    </th>

                    {HISTORY_METRIC_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className="sticky top-0 border-r border-b border-[#cbd5e1] bg-[#eef2f7] px-2 py-1.5 text-center align-bottom text-[11px] font-bold text-[#24364d]"
                      >
                        <div>{col.label}</div>

                        <div className="text-[9px] font-normal text-slate-400">
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
                          "h-[46px]",
                          isLatest ? "bg-[#fff9dc]" : "bg-white",
                        )}
                      >
                        <td className="border-r border-b border-[#e0e5ec] px-2 py-1 text-center text-[12px] font-bold text-[#1859a8]">
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
                                "border-r border-b border-[#e0e5ec] px-2 py-1 text-right text-[12px] tabular-nums transition-colors duration-500",
                                shouldFlash && "bg-[#ffd54f]",
                              )}
                            >
                              <div>{formatHistoryNumber(item[col.key])}</div>

                              <div
                                className={cn(
                                  "text-[10px]",
                                  change.tone === "up" && "text-[#13804a]",
                                  change.tone === "down" && "text-[#a5432f]",
                                  change.tone === "neutral" && "text-[#d97706]",
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

          <div className="flex h-6 items-center border-t border-[#e2e8f0] bg-[#f8fafc] px-3 text-[10px] text-slate-500">
            The starred row reflects the employee currently selected in the grid
            above, live. Older cycles are reference data.
          </div>
        </div>
      )}

      {/* CHANGE TOAST */}

      {cellToast && toastParts && (
        <div
          className="pointer-events-none fixed z-[10000] max-w-[280px] rounded-md bg-[#17365d] px-3 py-2 text-[12px] leading-snug text-white shadow-[0_6px_18px_rgba(20,30,50,.28)]"
          style={{
            left: cellToast.left,
            top: cellToast.top,
            fontFamily: APPRAISAL_FONT,
          }}
        >
          <b className="text-[#ffd54f]">{cellToast.label}</b> is now{" "}
          {toastParts.valueText} —{" "}
          <span
            className={toastParts.down ? "text-[#ff9a8a]" : "text-[#8ee6ad]"}
          >
            {toastParts.text}
          </span>
        </div>
      )}

      {/* EMPLOYEE HOVER POPUP */}

      {hoverEmployee && liveHoverEmployee && (
        <div
          className="fixed z-[9999] w-[430px] overflow-hidden rounded-md border border-[#cbd5e1] bg-white shadow-[0_12px_35px_rgba(15,23,42,.25)]"
          style={{
            left: hoverPosition.left,
            top: hoverPosition.top,
            fontFamily: APPRAISAL_FONT,
          }}
          onMouseEnter={() => setHoverEmployee(hoverEmployee)}
          onMouseLeave={() => setHoverEmployee(null)}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-[#d9e0e8] bg-white px-3 py-2.5">
            <span className="text-[15px] font-bold text-[#17365d]">
              {liveHoverEmployee.name}
            </span>

            <span className="text-[11px] text-slate-500">
              DOJ: {formatDoj(liveHoverEmployee.doj)}
            </span>

            <span className="text-[11px] text-slate-400">·</span>

            <span className="text-[11px] text-slate-500">
              Org Exp: {liveHoverEmployee.wissenExperience || 0} yrs
            </span>

            <span className="text-[11px] text-slate-400">·</span>

            <span className="text-[11px] text-slate-500">
              Overall Exp: {liveHoverEmployee.totalExperience || 0} yrs
            </span>
          </div>

          <div className="max-h-[230px] overflow-auto">
            {!hoverHistoryState || hoverHistoryState.loading ? (
              <div className="px-3 py-3 text-[11px] text-slate-500">
                Loading history...
              </div>
            ) : hoverHistoryState.error ? (
              <div className="px-3 py-3 text-[11px] text-red-500">
                {hoverHistoryState.error}
              </div>
            ) : !hoverHistoryRows.length ? (
              <div className="px-3 py-3 text-[11px] text-slate-500">
                No appraisal history yet.
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#f4f7fb]">
                    <th className="w-[68px] border-b border-[#e2e8f0] px-3 py-1.5 text-left text-[10px] font-bold tracking-wide text-slate-500">
                      YEAR
                    </th>

                    <th className="w-[108px] border-b border-[#e2e8f0] px-3 py-1.5 text-left text-[10px] font-bold tracking-wide text-slate-500">
                      DESIGNATION
                    </th>

                    <th className="w-[62px] border-b border-[#e2e8f0] px-3 py-1.5 text-left text-[10px] font-bold tracking-wide text-slate-500">
                      RATING
                    </th>

                    <th className="border-b border-[#e2e8f0] px-3 py-1.5 text-left text-[10px] font-bold tracking-wide text-slate-500">
                      FEEDBACK
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {hoverHistoryRows.map((item, index) => (
                    <tr
                      key={`${item.year}-${index}`}
                      className={index === 0 ? "bg-[#fffbe8]" : "bg-white"}
                    >
                      <td className="border-b border-[#eef2f7] px-3 py-2 align-top text-[12px] font-bold text-[#1559a6]">
                        {item.year}
                        {index === 0 ? " ★" : ""}
                      </td>

                      <td className="border-b border-[#eef2f7] px-3 py-2 align-top text-[12px] text-[#334155]">
                        {item.designation}
                      </td>

                      <td className="border-b border-[#eef2f7] px-3 py-2 align-top text-[12px] text-[#334155]">
                        {item.rating !== null &&
                        item.rating !== undefined &&
                        String(item.rating).trim() !== "" &&
                        item.rating !== "—"
                          ? `${item.rating} / 5`
                          : "—"}
                      </td>

                      <td className="border-b border-[#eef2f7] px-3 py-2 align-top text-[12px] leading-snug text-[#334155]">
                        {item.feedback || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
