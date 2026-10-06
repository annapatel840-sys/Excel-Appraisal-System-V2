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
import { useAccess } from "@/lib/access-store";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

// ============================================================
// API
// ============================================================

const APPRAISAL_HISTORY_API_URL = catalystFunctionUrl("appraisalhistoryapi");
const CURRENT_APPRAISAL_YEAR = "Apr-26";

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

// Right panel sizes
const PANEL_WIDTH = 360;
const PANEL_WIDE_WIDTH = 640;
const PANEL_MIN_WIDTH = 300;
const PANEL_MAX_WIDTH = 720;

const WIDTHS = {
  empId: 84,
  name: 190, // combined Employee column (name + emp id below it)
  designation: 150, // sticky second column (designation + Promote button)
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

// Used for lookups (sorting, grouping, bulk edit ...) — still has every column.
const GRID_COLUMNS = COLUMNS;

// empId is merged into the "name" column (name on top, id below),
// so it is not drawn separately.
const FROZEN_KEYS = new Set(["name"]);

const DEFAULT_COLUMN_ORDER = [
  "name",
  "designation",
  ...COLUMNS.map((column) => column.key).filter(
    (key) => key !== "empId" && !FROZEN_KEYS.has(key),
  ),
];

// Columns that should NOT show the filter / group menu in the header
const NO_FILTER_COLUMNS = new Set();

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

// Columns worth grouping into sections when sorted (limited distinct values).
const isCategoricalColumn = (column) =>
  !column.computed && (column.type === "enum" || column.type === "text");

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

// input = yellow tint, calculated = blue tint, master = banded rows.
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
    return current === 0
      ? { label: "0.00%", tone: "neutral" }
      : { label: "new", tone: "neutral" };
  }

  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";

  return {
    label: `${sign}${change.toFixed(2)}%`,
    tone: change > 0 ? "up" : change < 0 ? "down" : "neutral",
  };
};

// ============================================================
// RIGHT PANEL CONFIG
// HR login      -> Feedback only
// Tech Ed login -> Feedback + Request
// ============================================================

const PANEL_TABS = [
  ["feedback", "Feedback"],
  ["request", "Request"],
];

const PANEL_SUBS = {
  feedback: [
    ["manager", "Manager"],
    ["client", "Client"],
    ["other", "Other"],
  ],
};

const REQUEST_FIELDS = [
  ["appraiserTechED", "Appraiser Tech Ed"],
  ["compManager", "Comp Manager"],
];

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

// History metric -> Appraisal grid field whose access limit applies to it.
const HISTORY_METRIC_FIELD = {
  basePay: "currentAnnualBasePay",
  performanceBonus: "allocatedPBAmount",
  retentionBonus: "newRB",
  totalBonus: "totalBonus",
  hikeAmount: "hikeAmount",
  newCTC: "totalCTCWithRewards",
  targetPB: "targetPBNextYear",
  newBasePay: "newBaseSalary",
};

// ============================================================
// HISTORY RECORD NORMALIZER
// ============================================================

const textOrDash = (value) =>
  value !== null && value !== undefined && String(value).trim() !== ""
    ? String(value)
    : "—";

const normalizeHistoryRecord = (record) => {
  const basePay = Number(record?.base_pay) || 0;
  const hikeAmount = Number(record?.hike_amount) || 0;

  return {
    year: textOrDash(record?.appraisal_year),
    basePay,
    joiningBonus: Number(record?.joining_bonus) || 0,
    allocatedPB: Number(record?.allocated_pb) || 0,
    performanceBonus: Number(record?.performance_bonus) || 0,
    retentionBonus: Number(record?.retention_bonus) || 0,
    totalPB: Number(record?.total_pb) || 0,
    totalBonus: Number(record?.total_bonus) || 0,
    hikeAmount,
    hikePct: Number(record?.hike_pct) || 0,
    promotion: textOrDash(record?.promotion),
    title: textOrDash(record?.title),
    designation: textOrDash(record?.designation),
    rating: textOrDash(record?.rating),
    feedback: textOrDash(record?.manager_rating),
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

const CURRENT_APPRAISAL_YEAR_NUMERIC = (() => {
  const match = CURRENT_APPRAISAL_YEAR.match(/(\d{2,4})$/);

  if (!match) {
    return null;
  }

  return match[1].length === 2 ? `20${match[1]}` : match[1];
})();

const isCurrentYearRecord = (record) => {
  const year = String(record?.year ?? "").trim();

  return (
    year === CURRENT_APPRAISAL_YEAR ||
    (CURRENT_APPRAISAL_YEAR_NUMERIC && year === CURRENT_APPRAISAL_YEAR_NUMERIC)
  );
};

// ============================================================
// APPLY LIVE SHEET VALUES TO CURRENT-YEAR HISTORY
// ============================================================

const applyCurrentYearSheetValues = (historyRecord, row) => {
  if (!row || !isCurrentYearRecord(historyRecord)) {
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

  return {
    ...historyRecord,
    basePay: currentAnnualBasePay,
    allocatedPB: allocatedPBAmount,
    performanceBonus: totalPB,
    retentionBonus: newRB,
    joiningBonus: historyRecord.joiningBonus || 0,
    totalPB,
    totalBonus,
    hikeAmount,
    hikePct: Number(row.hikePct) || 0,
    promotion: textOrDash(row.eligibleForPromotion),
    title: textOrDash(row.newTitle),
    designation: row.designation ? String(row.designation) : "—",
    targetPB: targetPBNextYear,
    newCTC: newBaseSalary + totalBonus,
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
// SMALL PANEL UI PIECES
// ============================================================

function PanelCard({ title, children }) {
  return (
    <div className="mt-2 rounded-[10px] border border-[#e5e7eb] px-3 py-2.5">
      {title && (
        <h4 className="mb-1.5 text-[10.5px] font-extrabold uppercase tracking-[.04em] text-[#6b7280]">
          {title}
        </h4>
      )}
      {children}
    </div>
  );
}

function PanelChip({ tone, children }) {
  return (
    <span
      className={cn(
        "mr-1 mt-[3px] inline-block rounded border px-1.5 py-px text-[11px]",
        tone === "good"
          ? "border-[#b7e4c7] bg-[#ecfdf3] font-bold text-[#166534]"
          : tone === "now"
            ? "border-[#d1d5db] bg-[#eef0f3] font-bold text-[#111827]"
            : "border-[#e5e7eb] bg-[#f7f8fa]",
      )}
    >
      {children}
    </span>
  );
}

function PanelInfo({ children, tone }) {
  return (
    <div
      className={cn(
        "mt-2 rounded-lg border px-2.5 py-1.5 text-[12px]",
        tone === "good"
          ? "border-[#b7e4c7] bg-[#ecfdf3] text-[#166534]"
          : "border-[#e5e7eb] bg-[#f7f8fa]",
      )}
    >
      {children}
    </div>
  );
}

// ============================================================
// EMPLOYEE RIGHT PANEL (opens when an employee name is clicked)
//   HR login      -> Feedback only
//   Tech Ed login -> Feedback + Request
// ============================================================

const FIELD_CLASS =
  "h-8 w-full rounded-md border border-[#cbd5e1] bg-white px-2 text-[11.5px] outline-none focus:border-[#102a43]";

function EmployeePanel({
  employee,
  team,
  history,
  showRequest,
  canDelegate = true,
  onRequest,
  onClose,
}) {
  const [tab, setTab] = useState("feedback");
  const [subs, setSubs] = useState({ feedback: "manager" });
  const [wide, setWide] = useState(false);
  const [width, setWidth] = useState(PANEL_WIDTH);
  const [dragging, setDragging] = useState(false);

  // request form
  const [reqField, setReqField] = useState("appraiserTechED");
  const [reqPerson, setReqPerson] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [screenNote, setScreenNote] = useState("");
  const [reqSent, setReqSent] = useState("");

  // new employee selected -> clear the form
  useEffect(() => {
    setReqPerson("");
    setReqReason("");
    setScreenNote("");
    setReqSent("");
  }, [employee.id]);

  const activeTab = showRequest ? tab : "feedback";
  const panelTabs = showRequest ? PANEL_TABS : [PANEL_TABS[0]];
  const subList = PANEL_SUBS[activeTab] || [];
  const sub = subs[activeTab];

  const panelWidth = wide ? PANEL_WIDE_WIDTH : width;

  const currentAssignee = String(employee?.[reqField] ?? "").trim();

  const requestPeople = useMemo(() => {
    const values = new Set();

    team.forEach((row) => {
      [row.appraiserTechED, row.compManager].forEach((value) => {
        if (value && String(value).trim()) {
          values.add(String(value).trim());
        }
      });
    });

    return [...values]
      .filter((person) => person !== currentAssignee)
      .sort((a, b) => a.localeCompare(b));
  }, [team, currentAssignee]);

  const sendDelegation = () => {
    if (!reqPerson || !reqReason.trim()) {
      return;
    }

    const label = REQUEST_FIELDS.find(([key]) => key === reqField)?.[1];

    onRequest?.({
      type: "delegation",
      employee,
      field: reqField,
      oldId: currentAssignee,
      newId: reqPerson,
      reason: reqReason.trim(),
      at: Date.now(),
    });

    setReqSent(`${label} change to ${reqPerson} sent to HR for approval.`);
    setReqPerson("");
    setReqReason("");
  };

  const sendScreen = () => {
    onRequest?.({
      type: "screen",
      employee,
      reason: screenNote.trim(),
      at: Date.now(),
    });

    setReqSent("Screen request sent.");
    setScreenNote("");
  };

  // ---------- drag the left edge to resize ----------
  const startResize = useCallback(
    (event) => {
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = panelWidth;

      setDragging(true);

      const handleMove = (moveEvent) => {
        const next = Math.max(
          PANEL_MIN_WIDTH,
          Math.min(PANEL_MAX_WIDTH, startWidth + (startX - moveEvent.clientX)),
        );

        setWide(false);
        setWidth(next);
      };

      const handleUp = () => {
        setDragging(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [panelWidth],
  );

  // ---------- header line ----------
  const headerParts = [
    employee.empId,
    employee.designation,
    employee.band,
    employee.totalExperience !== undefined &&
    employee.totalExperience !== null &&
    employee.totalExperience !== ""
      ? `${employee.totalExperience} yrs${
          employee.wissenExperience !== undefined &&
          employee.wissenExperience !== null &&
          employee.wissenExperience !== ""
            ? ` (${employee.wissenExperience} here)`
            : ""
        }`
      : "",
  ].filter(Boolean);

  // ---------- FEEDBACK ----------
  const renderHistoryState = () => {
    if (history.loading) {
      return <PanelInfo>Loading appraisal history...</PanelInfo>;
    }

    if (history.error) {
      return (
        <div className="mt-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-2.5 py-2 text-[12px] text-[#b91c1c]">
          {history.error}
          <button
            type="button"
            onClick={history.onRetry}
            className="ml-2 font-bold underline"
          >
            Retry
          </button>
        </div>
      );
    }

    return null;
  };

  const renderTimelineDot = (index) => (
    <span
      className={cn(
        "absolute -left-[17px] top-[11px] size-[9px] rounded-full border-2",
        index === 0
          ? "border-[#102a43] bg-[#102a43]"
          : "border-[#c7cdd6] bg-white",
      )}
    />
  );

  const renderFeedback = () => {
    const stateNode = renderHistoryState();

    if (sub === "manager") {
      if (stateNode) {
        return stateNode;
      }

      if (!history.rows.length) {
        return <PanelInfo>No manager feedback recorded.</PanelInfo>;
      }

      return (
        <ul className="relative m-0 mt-1 list-none p-0 pl-[18px]">
          <span className="absolute bottom-2 left-[5px] top-2 w-px bg-[#e0e4ea]" />

          {history.rows.map((item, index) => {
            const hasRating =
              item.rating &&
              String(item.rating).trim() !== "" &&
              item.rating !== "—";
            const hasPromotion = item.promotion && item.promotion !== "—";
            const hasText = item.feedback && item.feedback !== "—";

            return (
              <li
                key={`${item.year}-${index}`}
                className="relative pb-2.5 pt-1.5"
              >
                {renderTimelineDot(index)}

                <span className="font-extrabold text-[#102a43]">
                  {item.year}
                </span>

                {index === 0 && <PanelChip tone="now">This cycle</PanelChip>}

                <div className="text-[#6b7280]">
                  {item.designation !== "—" ? item.designation : ""}
                </div>

                {hasRating && (
                  <PanelChip>
                    Manager rating <b>{item.rating} / 5</b>
                  </PanelChip>
                )}

                {hasPromotion && (
                  <PanelChip
                    tone={/^y/i.test(item.promotion) ? "good" : undefined}
                  >
                    {/^y/i.test(item.promotion)
                      ? "Promoted"
                      : `Promotion: ${item.promotion}`}
                  </PanelChip>
                )}

                {hasText && (
                  <div className="mt-1 leading-[1.45] text-[#1f2937]">
                    {item.feedback}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      );
    }

    if (sub === "client") {
      // Expects row.clientFeedback = [{ year, client, rating, text }] if you add it later.
      const clientFeedback = Array.isArray(employee.clientFeedback)
        ? employee.clientFeedback
        : [];

      if (!clientFeedback.length) {
        return <PanelInfo>No client feedback recorded.</PanelInfo>;
      }

      return (
        <ul className="relative m-0 mt-1 list-none p-0 pl-[18px]">
          <span className="absolute bottom-2 left-[5px] top-2 w-px bg-[#e0e4ea]" />

          {clientFeedback.map((item, index) => (
            <li
              key={`${item.year}-${index}`}
              className="relative pb-2.5 pt-1.5"
            >
              {renderTimelineDot(index)}

              <span className="font-extrabold text-[#102a43]">{item.year}</span>

              {item.client && (
                <span className="text-[#6b7280]"> · {item.client}</span>
              )}

              {item.rating !== undefined && item.rating !== null && (
                <div>
                  <PanelChip>
                    Client rating <b>{item.rating}</b>
                  </PanelChip>
                </div>
              )}

              {item.text && (
                <div className="mt-1 leading-[1.45] text-[#1f2937]">
                  {item.text}
                </div>
              )}
            </li>
          ))}
        </ul>
      );
    }

    // other
    const dash = (value) =>
      value !== undefined && value !== null && value !== "" ? value : "—";

    return (
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="border-b border-[#e5e7eb] px-1 py-1 text-left text-[10.5px] font-bold text-[#6b7280]">
              Cycle
            </th>
            <th className="border-b border-[#e5e7eb] px-1 py-1 text-right text-[10.5px] font-bold text-[#6b7280]">
              RR %
            </th>
            <th className="border-b border-[#e5e7eb] px-1 py-1 text-right text-[10.5px] font-bold text-[#6b7280]">
              IC
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-b border-[#f1f3f5] p-1">
              {CURRENT_APPRAISAL_YEAR}
            </td>
            <td className="border-b border-[#f1f3f5] p-1 text-right">
              {dash(employee.rrPercent)}
            </td>
            <td className="border-b border-[#f1f3f5] p-1 text-right">
              {dash(employee.interviewCount)}
            </td>
          </tr>
        </tbody>
      </table>
    );
  };

  // ---------- REQUEST (Tech Ed login only) ----------
  const renderRequest = () => (
    <div>
      {reqSent && <PanelInfo tone="good">✓ {reqSent}</PanelInfo>}

      {canDelegate && (
        <PanelCard title="Delegation request">
          <div className="space-y-2">
            <div className="text-[11.5px] text-[#6b7280]">
              HR approves or rejects it from the Delegation screen. The current
              value stays until HR approves.
            </div>

            <div className="text-[12px] text-[#374151]">
              <b>{employee.name}</b> · {employee.empId}
            </div>

            <select
              value={reqField}
              onChange={(event) => {
                setReqField(event.target.value);
                setReqPerson("");
              }}
              className={FIELD_CLASS}
            >
              {REQUEST_FIELDS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <div className="text-[11.5px] text-[#6b7280]">
              Current:{" "}
              <b className="text-[#111827]">
                {currentAssignee || "— not set —"}
              </b>
            </div>

            <select
              value={reqPerson}
              onChange={(event) => setReqPerson(event.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">Select new assignee...</option>
              {requestPeople.map((person) => (
                <option key={person} value={person}>
                  {person}
                </option>
              ))}
            </select>

            <textarea
              value={reqReason}
              onChange={(event) => setReqReason(event.target.value)}
              placeholder="Reason (mandatory)"
              maxLength={2000}
              rows={2}
              className="w-full resize-y rounded-md border border-[#cbd5e1] bg-white px-2 py-1.5 text-[11.5px] outline-none focus:border-[#102a43]"
            />

            <button
              type="button"
              disabled={!reqPerson || !reqReason.trim()}
              onClick={sendDelegation}
              className="rounded-md bg-[#173b63] px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send delegation request
            </button>
          </div>
        </PanelCard>
      )}

      <PanelCard title="Screen request">
        <div className="space-y-2">
          <div className="text-[11.5px] text-[#6b7280]">
            Ask HR for a change to this employee's screen.
          </div>

          <textarea
            value={screenNote}
            onChange={(event) => setScreenNote(event.target.value)}
            placeholder="Note (optional)"
            maxLength={2000}
            rows={2}
            className="w-full resize-y rounded-md border border-[#cbd5e1] bg-white px-2 py-1.5 text-[11.5px] outline-none focus:border-[#102a43]"
          />

          <button
            type="button"
            onClick={sendScreen}
            className="rounded-md border border-[#173b63] px-3 py-1.5 text-[11.5px] font-semibold text-[#173b63] hover:bg-slate-50"
          >
            Send screen request
          </button>
        </div>
      </PanelCard>
    </div>
  );

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l border-[#d5dce5] bg-white text-[12.5px] text-[#111827]"
      style={{ width: panelWidth, fontFamily: APPRAISAL_FONT }}
    >
      {/* drag grip (left edge) */}
      <div
        onPointerDown={startResize}
        title="Drag to resize"
        className="group absolute bottom-0 left-0 top-0 z-[2] w-2 cursor-ew-resize"
      >
        <span
          className={cn(
            "absolute left-[2px] top-1/2 -mt-[18px] h-9 w-1 rounded",
            dragging ? "bg-[#102a43]" : "bg-[#d1d5db] group-hover:bg-[#102a43]",
          )}
        />
      </div>

      {/* header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#e5e7eb] py-2 pl-4 pr-2.5">
        <div
          className="min-w-0 flex-1 text-[12px] leading-[1.35] text-[#374151]"
          title={`${employee.name} · ${headerParts.join(" · ")}`}
        >
          <b className="text-[13px] text-[#102a43]">{employee.name}</b>
          {headerParts.length > 0 && <> · {headerParts.join(" · ")}</>}
        </div>

        <button
          type="button"
          onClick={() => setWide((previous) => !previous)}
          title={wide ? "Normal width" : "Expand"}
          aria-pressed={wide}
          className="h-[26px] min-w-[26px] shrink-0 rounded-md border border-[#d1d5db] bg-white px-1.5 text-[13px] text-[#374151] hover:border-[#102a43] hover:text-[#102a43]"
        >
          {wide ? "⤡" : "⤢"}
        </button>

        <button
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close panel"
          className="flex h-[26px] min-w-[26px] shrink-0 items-center justify-center rounded-md border border-[#d1d5db] bg-white px-1.5 text-[#374151] hover:border-[#102a43] hover:text-[#102a43]"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* tabs */}
      <div
        className="flex shrink-0 border-b border-[#e5e7eb] bg-[#fafafb]"
        role="tablist"
      >
        {panelTabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 border-b-2 py-[9px] text-[13px]",
              activeTab === key
                ? "border-[#102a43] font-extrabold text-[#111827]"
                : "border-transparent font-semibold text-[#6b7280]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* sub buttons (Feedback only) */}
      {subList.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 pb-1 pl-4 pr-3.5 pt-2.5">
          {subList.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={sub === key}
              onClick={() =>
                setSubs((previous) => ({ ...previous, [activeTab]: key }))
              }
              className={cn(
                "rounded-[14px] border px-2.5 py-[3px] text-[11.5px]",
                sub === key
                  ? "border-[#cbd2da] bg-[#eef0f3] font-bold text-[#111827]"
                  : "border-[#d1d5db] bg-white text-[#374151] hover:border-[#9ca3af]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* body */}
      <div className="min-h-0 flex-1 overflow-auto pb-3.5 pl-4 pr-3.5 pt-1.5">
        {activeTab === "feedback" ? renderFeedback() : renderRequest()}
      </div>
    </aside>
  );
}

// ============================================================
// COMPONENT
// ============================================================

export function AppraisalGrid({
  rows,
  verticalLayout = false,
  filters,
  setFilter,
  optionsFor,
  selected,
  toggleSelected,
  toggleAll,

  showHistory,
  setShowHistory,
  focusEmployeeId,
  onFocusEmployeeHandled,

  // budget / onViewBudget are no longer used by the panel (Budget tab became Request)
  // but are still accepted so existing parents do not break.
  isTechEd = false,
  isHR = false,
  onRequest,
}) {
  const { updateCell, updateLinkedCells, bulkUpdate, modified } =
    useAppraisal();

  // Access rules (permissive when accessapi is unavailable).
  const access = useAccess();
  const sheetEditable = access.canScreen("appraisalSheet", "edit");
  const canColumnBulkEdit = sheetEditable && access.canAction("bulkEdit");
  const canDelegate = access.canAction("delegateRequest");
  const historyMetricColumns = HISTORY_METRIC_COLUMNS.filter(
    (col) => !access.isHidden(HISTORY_METRIC_FIELD[col.key]),
  );

  // Request tab: Tech Ed login only. HR sees Feedback only.
  // With access rules it follows the delegateRequest action.
  const showRequestTab = access.ok ? canDelegate : isTechEd && !isHR;

  const cellRefs = useRef({});
  const clickTimerRef = useRef(null);

  // ============================================================
  // LOCAL EDIT DRAFTS
  // ============================================================

  const [editingValues, setEditingValues] = useState({});

  const setEditingValue = useCallback((cellKey, value) => {
    setEditingValues((previous) => ({ ...previous, [cellKey]: value }));
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

  const gridViewportRef = useRef(null);

  // ============================================================
  // COLUMN RESIZE / ORDER
  // ============================================================

  const [columnWidths, setColumnWidths] = useState(() =>
    Object.fromEntries(
      GRID_COLUMNS.map((column) => [column.key, getWidth(column)]),
    ),
  );

  const resizeRef = useRef(null);

  const [columnOrder, setColumnOrder] = useState(DEFAULT_COLUMN_ORDER);

  const draggedColumnRef = useRef(null);

  const handleColumnDragStart = useCallback((event, column) => {
    if (FROZEN_KEYS.has(column.key)) {
      event.preventDefault();
      return;
    }

    draggedColumnRef.current = column.key;

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", column.key);
  }, []);

  const handleColumnDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleColumnDrop = useCallback((event, targetColumn) => {
    event.preventDefault();

    const draggedKey =
      draggedColumnRef.current || event.dataTransfer.getData("text/plain");

    if (
      !draggedKey ||
      draggedKey === targetColumn.key ||
      FROZEN_KEYS.has(draggedKey) ||
      FROZEN_KEYS.has(targetColumn.key)
    ) {
      draggedColumnRef.current = null;
      return;
    }

    setColumnOrder((previous) => {
      const next = [...previous];

      const draggedIndex = next.indexOf(draggedKey);
      const targetIndex = next.indexOf(targetColumn.key);

      if (draggedIndex === -1 || targetIndex === -1) {
        return previous;
      }

      [next[draggedIndex], next[targetIndex]] = [
        next[targetIndex],
        next[draggedIndex],
      ];

      return next;
    });

    draggedColumnRef.current = null;
  }, []);

  const handleColumnDragEnd = useCallback(() => {
    draggedColumnRef.current = null;
  }, []);

  const orderedColumns = useMemo(
    () =>
      columnOrder
        .map((key) => GRID_COLUMNS.find((column) => column.key === key))
        .filter((column) => column && !access.isHidden(column.key)),
    [columnOrder, access],
  );

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
  // STICKY COLUMN OFFSETS  [checkbox] [Employee]
  // ============================================================

  const nameColumn = GRID_COLUMNS.find((column) => column.key === "name");
  const nameWidth = access.isHidden("name")
    ? 0
    : nameColumn
      ? widthOf(nameColumn)
      : WIDTHS.name;

  const frozenLeftOf = (key) =>
    key === "name" ? SELECT_WIDTH : undefined;

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

  const clearAllGroups = useCallback(() => setGroupBy([]), []);

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

  // Categorical keys sort first so sections stay contiguous.
  const sortSpecs = useMemo(() => {
    const specs = groupBy
      .map((group) => {
        const column = GRID_COLUMNS.find((item) => item.key === group.key);

        return column ? { ...group, column } : null;
      })
      .filter(Boolean);

    const groupColumns = specs.filter((spec) =>
      isCategoricalColumn(spec.column),
    );
    const sortColumns = specs.filter(
      (spec) => !isCategoricalColumn(spec.column),
    );

    return { groupColumns, ordered: [...groupColumns, ...sortColumns] };
  }, [groupBy]);

  const sortedRows = useMemo(() => {
    const { ordered } = sortSpecs;

    if (!ordered.length) {
      return rows;
    }

    return [...rows].sort((rowA, rowB) => {
      for (const spec of ordered) {
        const result = compareGroupValues(rowA, rowB, spec.column);

        if (result !== 0) {
          return spec.dir === "desc" ? -result : result;
        }
      }

      return 0;
    });
  }, [rows, sortSpecs, compareGroupValues]);

  const groupedRows = useMemo(() => {
    const { groupColumns } = sortSpecs;

    if (!groupColumns.length) {
      return null;
    }

    const sortRows = (sourceRows) =>
      [...sourceRows].sort((rowA, rowB) => {
        for (const group of sortSpecs.ordered) {
          const result = compareGroupValues(rowA, rowB, group.column);

          if (result !== 0) {
            return group.dir === "desc" ? -result : result;
          }
        }

        return 0;
      });

    const buildLevel = (sourceRows, level) => {
      const group = groupColumns[level];
      const levelRows = sortRows(sourceRows);

      const sections = [];
      let currentKey;
      let currentRows = [];
      let hasCurrent = false;

      const pushSection = () => {
        if (!hasCurrent) {
          return;
        }

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
          key: `${group.key}:${String(currentKey)}:${level}:${sections.length}`,
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

      let previousRow = null;

      levelRows.forEach((row) => {
        const value = getGroupValue(row, group.column);

        if (
          !hasCurrent ||
          compareGroupValues(previousRow, row, group.column) !== 0
        ) {
          pushSection();

          currentKey = value;
          currentRows = [row];
          hasCurrent = true;
        } else {
          currentRows.push(row);
        }

        previousRow = row;
      });

      pushSection();

      return sections;
    };

    return buildLevel(rows, 0);
  }, [rows, sortSpecs, compareGroupValues, getGroupValue]);

  const flattenGroupedSections = useCallback((sections) => {
    const result = [];

    const walk = (items) => {
      items.forEach((section) => {
        if (section.children) {
          walk(section.children);
        } else {
          section.rows.forEach((row) => result.push(row));
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

  useEffect(
    () => () => {
      if (historyFlashTimerRef.current) {
        clearTimeout(historyFlashTimerRef.current);
      }
    },
    [],
  );

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

    blinkTimerRef.current = setTimeout(() => setLastEditedKey(null), 1600);
  }, []);

  useEffect(
    () => () => {
      if (blinkTimerRef.current) {
        clearTimeout(blinkTimerRef.current);
      }
    },
    [],
  );

  // ============================================================
  // SAVE FLASH
  // FIX: this used to be declared AFTER clearPromotion, whose dependency
  // array reads it during render -> "Cannot access 'yt' before initialization".
  // It must be declared before anything that references it.
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
  // RIGHT PANEL OPEN STATE
  // ============================================================

  const [detailOpen, setDetailOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);

  // ============================================================
  // SELECTED EMPLOYEE (drives the history panel + right panel)
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
  // bottom panel, the right panel and the YoY toast)
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
      const url = `${APPRAISAL_HISTORY_API_URL}?emp_id=${encodeURIComponent(key)}`;

      const response = await catalystFetch(url);

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

  // Load history for the selected employee while a panel that needs it is open.
  useEffect(() => {
    if ((!showHistory && !detailOpen) || !historyRow?.empId) {
      return;
    }

    loadHistory(historyRow.empId).catch(() => {});
  }, [showHistory, detailOpen, historyRow?.empId, loadHistory]);

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
  // CHANGE TOASTS
  // ============================================================

  const [cellToast, setCellToast] = useState(null);
  const cellToastTimerRef = useRef(null);

  useEffect(
    () => () => {
      if (cellToastTimerRef.current) {
        clearTimeout(cellToastTimerRef.current);
      }
    },
    [],
  );

  const toastPosition = (anchor) => {
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

    return { left, top };
  };

  const showToast = useCallback((toast) => {
    setCellToast(toast);

    if (cellToastTimerRef.current) {
      clearTimeout(cellToastTimerRef.current);
    }

    cellToastTimerRef.current = setTimeout(() => setCellToast(null), 3500);
  }, []);

  const showYoyToast = useCallback(
    (anchor, key, projectedRow) => {
      const config = YOY_FIELDS[key];

      if (!config || !anchor || !projectedRow?.empId) {
        return;
      }

      const position = toastPosition(anchor);
      const currentValue = config.current(projectedRow);

      loadHistory(projectedRow.empId)
        .then((records) => {
          const priorRecord = records.find(
            (record) => !isCurrentYearRecord(record),
          );
          const priorValue = priorRecord ? config.prior(priorRecord) : 0;

          showToast({
            label: config.label,
            currentValue,
            priorValue,
            ...position,
            mode: "yoy",
            isText: false,
          });
        })
        .catch(() => {});
    },
    [loadHistory, showToast],
  );

  // Toast for any editable field that has no year-over-year mapping.
  const showChangeToast = useCallback(
    (anchor, label, priorValue, currentValue, isText) => {
      if (!anchor) {
        return;
      }

      showToast({
        label,
        currentValue,
        priorValue,
        ...toastPosition(anchor),
        mode: "prev",
        isText: !!isText,
      });
    },
    [showToast],
  );

  const openDetailPanel = useCallback(() => setDetailOpen(true), []);
  const closeDetailPanel = useCallback(() => setDetailOpen(false), []);

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

  useEffect(
    () => () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    },
    [],
  );

  // ============================================================
  // PAGINATION
  // ============================================================

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);

  // When the parent filter changes the result set, start from page 1.
  // This prevents a filtered result from opening on an old page number.
  const previousRowsLengthRef = useRef(rows.length);

  useEffect(() => {
    if (previousRowsLengthRef.current !== rows.length) {
      previousRowsLengthRef.current = rows.length;
      setCurrentPage(1);
    }
  }, [rows.length]);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;

    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, currentPage]);

  const pageStart = rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, rows.length);

  // Unified display order — matches whichever mode is active.
  const displayRows = useMemo(
    () => (groupedRows ? flattenGroupedSections(groupedRows) : pageRows),
    [groupedRows, flattenGroupedSections, pageRows],
  );

  const flattenedGroupOrder = useMemo(() => {
    const order = new Map();

    displayRows.forEach((row, index) => order.set(row.id, index));

    return order;
  }, [displayRows]);

  // ============================================================
  // "LAST EDITED" -> JUMP TO THAT EMPLOYEE
  // The old effect only ran when focusEmployeeId changed, so it silently
  // did nothing if the rows were not loaded yet (common for HR, who has the
  // big list), and it never scrolled the table, so on HR the row was
  // selected but off-screen. Now: it retries when rows arrive, it matches on
  // empId / row id / "rowId:field" keys, it switches page, and it scrolls
  // the row into view.
  // ============================================================

  const handledFocusRef = useRef("");
  const [scrollTargetId, setScrollTargetId] = useState(null);
  const [focusNotice, setFocusNotice] = useState("");
  const focusNoticeTimerRef = useRef(null);

  useEffect(() => {
    const target = String(focusEmployeeId || "").trim();

    if (!target) {
      handledFocusRef.current = "";
      return;
    }

    if (handledFocusRef.current === target || !rows.length) {
      return; // already handled, or rows not loaded yet (effect re-runs when they are)
    }

    const wanted = [target];

    if (target.includes(":")) {
      wanted.push(target.slice(0, target.lastIndexOf(":")));
    }

    const wantedLower = wanted.map((value) => value.toLowerCase());

    const targetRow = rows.find(
      (row) =>
        wantedLower.includes(
          String(row.empId || "")
            .trim()
            .toLowerCase(),
        ) || wantedLower.includes(String(row.id).toLowerCase()),
    );

    handledFocusRef.current = target;

    if (!targetRow) {
      setFocusNotice("That employee is hidden by the current filters.");

      if (focusNoticeTimerRef.current) {
        clearTimeout(focusNoticeTimerRef.current);
      }

      focusNoticeTimerRef.current = setTimeout(() => setFocusNotice(""), 3500);

      onFocusEmployeeHandled?.();
      return;
    }

    if (!groupedRows) {
      const index = sortedRows.findIndex((row) => row.id === targetRow.id);

      if (index >= 0) {
        setCurrentPage(Math.floor(index / PAGE_SIZE) + 1);
      }
    }

    setHistoryRow(targetRow);
    setScrollTargetId(targetRow.id);

    if ((showHistory || detailOpen) && targetRow.empId) {
      loadHistory(targetRow.empId).catch(() => {});
    }

    onFocusEmployeeHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEmployeeId, rows, sortedRows, groupedRows]);

  useEffect(
    () => () => {
      if (focusNoticeTimerRef.current) {
        clearTimeout(focusNoticeTimerRef.current);
      }
    },
    [],
  );

  // Scroll the table so the target row sits in the middle of the viewport.
  useEffect(() => {
    if (!scrollTargetId) {
      return undefined;
    }

    const container = gridViewportRef.current;

    if (!container) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      const element = container.querySelector(
        `tr[data-row-id="${String(scrollTargetId).replace(/"/g, '\\"')}"]`,
      );

      if (!element) {
        return; // page not rendered yet; effect runs again when displayRows change
      }

      const containerRect = container.getBoundingClientRect();
      const rowRect = element.getBoundingClientRect();
      const visibleHeight = container.clientHeight - HEADER_HEIGHT;

      container.scrollTop +=
        rowRect.top -
        containerRect.top -
        HEADER_HEIGHT -
        (visibleHeight - rowRect.height) / 2;

      setScrollTargetId(null);
    });

    // give up after 2s so a stale target never scrolls the table later
    const giveUp = setTimeout(() => setScrollTargetId(null), 2000);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(giveUp);
    };
  }, [scrollTargetId, currentPage, displayRows]);

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
  // COMMIT ON BLUR / ENTER
  // Text, number and date cells keep a local draft while typing and
  // save once on blur. Escape discards the draft. A draft still open when
  // the grid unmounts is committed so nothing is lost.
  // ============================================================

  const cancelledCellsRef = useRef(new Set());
  const pendingDraftRef = useRef(null);
  const liveToastCellsRef = useRef(new Set());
  const commitRef = useRef(commit);

  commitRef.current = commit;

  useEffect(
    () => () => {
      const pending = pendingDraftRef.current;

      pendingDraftRef.current = null;

      if (pending) {
        commitRef.current(pending.row, pending.col, pending.raw, null);
      }
    },
    [],
  );

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

      // Enum columns only accept one of their defined options.
      if (
        col.type === "enum" &&
        Array.isArray(col.options) &&
        !col.options.includes(rawValue)
      ) {
        return;
      }

      const value = isNumericType(col.type) ? numericValue(rawValue) : rawValue;

      // New Title only on rows eligible for promotion.
      if (col.key === "newTitle") {
        const eligibleIds = rows
          .filter((row) => row.eligibleForPromotion === "Yes")
          .map((row) => row.id);
        const skipped = rows.length - eligibleIds.length;

        if (eligibleIds.length) {
          bulkUpdate(eligibleIds, col.key, "set", value);
        }

        if (skipped) {
          window.alert(
            `New Title was applied to ${eligibleIds.length} employee(s). ${skipped} skipped because they are not eligible for promotion.`,
          );
        }

        return;
      }

      const ids = rows.map((row) => row.id);

      bulkUpdate(ids, col.key, "set", value);

      if (col.key === "eligibleForPromotion" && value === "No") {
        bulkUpdate(ids, "newTitle", "set", null);
      }
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

  const isColumnEditable = useCallback(
    (row, column) => {
      if (!column.editable) {
        return false;
      }

      if (!sheetEditable || !access.canEditField(column.key)) {
        return false;
      }

      if (column.key === "newTitle") {
        return row.eligibleForPromotion === "Yes";
      }

      return true;
    },
    [sheetEditable, access],
  );

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

    if (editableIndex.get(columnKey) === undefined) {
      return;
    }

    const rowEditableColumns = getEditableColumnsForRow(currentRow);

    const currentRowColumnIndex = rowEditableColumns.findIndex(
      (column) => column.key === columnKey,
    );

    const columnDef = COLUMNS.find((item) => item.key === columnKey) || {
      key: columnKey,
      editable: false,
    };

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

        if (nextRow && isColumnEditable(nextRow, columnDef)) {
          focusCell(nextRowIndex, columnKey);
          return;
        }

        nextRowIndex += direction;
      }

      // No next editable cell: still commit this one.
      target.blur();

      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      const nextRowIndex =
        event.key === "ArrowDown"
          ? Math.min(maxRow, rowIndex + 1)
          : Math.max(0, rowIndex - 1);
      const nextRow = displayRows[nextRowIndex];

      if (nextRow && isColumnEditable(nextRow, columnDef)) {
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
      // Cancel the in-progress edit: the blur handler drops the draft.
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        cancelledCellsRef.current.add(`${currentRow.id}:${columnKey}`);
      }

      target.blur();
    }
  };

  // ============================================================
  // ROW OPEN / SELECT
  // ============================================================

  const openRow = useCallback(
    (row) => {
      setHistoryRow(row);

      // Re-selecting after a failed fetch retries it.
      if ((showHistory || detailOpen) && row?.empId) {
        loadHistory(row.empId).catch(() => {});
      }
    },
    [showHistory, detailOpen, loadHistory],
  );

  const retryHistory = useCallback(() => {
    if (historyRow?.empId) {
      loadHistory(historyRow.empId).catch(() => {});
    }
  }, [historyRow, loadHistory]);

  // Focusing any editable cell also selects that employee's row.
  const selectRowForEdit = useCallback((row) => {
    setHistoryRow((previous) => (previous?.id === row.id ? previous : row));
  }, []);

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
  // RENDER CELL
  // ============================================================

  const draftClass = (cellKey, isBlinking) =>
    cn(
      modified[cellKey]
        ? "border-[#c9a400] bg-[#ffe066] font-semibold text-[#1e293b]"
        : "border-[#d7c96b] bg-[#fffef3] text-[#1e293b]",
      "focus:border-[#2563eb] focus:bg-white focus:ring-1 focus:ring-[#2563eb]",
      isBlinking && "appraisal-cell-blink",
    );

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
            "px-2 py-1 whitespace-normal break-words leading-tight text-right",
            "text-[12px] font-semibold tabular-nums",
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

    // EMPLOYEE CELL (single sticky column) — name, ID, separator, designation.
    if (col.key === "name") {
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openRow(row);
            openDetailPanel();
          }}
          className="flex min-h-[38px] h-auto w-full flex-col items-start justify-center px-2 py-1 text-left"
          title={row.name}
        >
          <span className="break-words text-[12.5px] font-bold leading-tight text-[#1559a6] hover:underline">
            {row.name}
          </span>
          <span className="mt-px text-[10.5px] font-normal leading-tight text-slate-500">
            {row.empId}
          </span>
          <span className="my-1 h-px w-full bg-slate-300" aria-hidden="true" />
          <span className="break-words text-[11.5px] font-medium leading-tight text-[#4b5563]">
            {row.designation || "—"}
          </span>
        </button>
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
            "flex min-h-[38px] h-auto w-full items-center px-2 py-1",
            "text-[12px] font-normal text-[#4b5563] whitespace-normal break-words leading-tight",
            isMoney ? "justify-end text-right tabular-nums" : "text-left",
          )}
          title={text}
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
                  { eligibleForPromotion: "No", newTitle: null },
                  "Cell edit",
                );

                flashSaved(cellKey);
                markEdited(cellKey);

                flashSaved(`${row.id}:newTitle`);
                markEdited(`${row.id}:newTitle`);

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

              // Remind to set New Title the moment Promotion flips to Yes.
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
              draftClass(cellKey, isBlinking),
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

    const storedValue = String(
      row[col.key] !== null && row[col.key] !== undefined ? row[col.key] : "",
    );

    if (col.type === "textarea") {
      const textareaDraft =
        editingValues[cellKey] !== undefined
          ? editingValues[cellKey]
          : storedValue;

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
                [cellKey]: storedValue,
              }));

              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
            }}
            onChange={(event) => {
              const value = event.target.value;
              setEditingValue(cellKey, value);

              pendingDraftRef.current = { row, col, raw: value };

              if (
                !liveToastCellsRef.current.has(cellKey) &&
                String(storedValue) !== String(value)
              ) {
                liveToastCellsRef.current.add(cellKey);
                if (YOY_FIELDS[col.key]) {
                  showYoyToast(event.currentTarget, col.key, {
                    ...row,
                    [col.key]: value,
                  });
                } else {
                  showChangeToast(
                    event.currentTarget,
                    col.label,
                    String(storedValue),
                    String(value),
                    true,
                  );
                }
              }

              event.target.style.height = "auto";
              event.target.style.height = `${event.target.scrollHeight}px`;
            }}
            onBlur={(event) => {
              setActive(null);

              pendingDraftRef.current = null;

              const raw =
                editingValues[cellKey] !== undefined
                  ? editingValues[cellKey]
                  : event.target.value;

              clearEditingValue(cellKey);
              liveToastCellsRef.current.delete(cellKey);

              event.target.style.height = "";

              // Escape pressed: discard the draft instead of saving it.
              if (cancelledCellsRef.current.delete(cellKey)) {
                return;
              }

              commit(row, col, raw, event.currentTarget);
            }}
            onKeyDown={(event) => onKeyDown(event, rowIndex, col.key)}
            onDoubleClick={(event) =>
              handleEditableDoubleClick(event, rowIndex, col.key)
            }
            className={cn(
              "min-h-[30px] w-full resize-none overflow-hidden rounded-[4px] border px-1.5 py-[5px] text-[12px] leading-tight outline-none",
              draftClass(cellKey, isBlinking),
            )}
          />
        </div>
      );
    }

    const draftValue =
      editingValues[cellKey] !== undefined
        ? editingValues[cellKey]
        : storedValue;

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
              [cellKey]: storedValue,
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
            const value = event.target.value;
            setEditingValue(cellKey, value);

            pendingDraftRef.current = { row, col, raw: value };

            if (
              !liveToastCellsRef.current.has(cellKey) &&
              String(storedValue) !== String(value)
            ) {
              liveToastCellsRef.current.add(cellKey);
              if (YOY_FIELDS[col.key]) {
                showYoyToast(event.currentTarget, col.key, {
                  ...row,
                  [col.key]: value,
                });
              } else if (isNumericType(col.type)) {
                showChangeToast(
                  event.currentTarget,
                  col.label,
                  Number(storedValue) || 0,
                  Number(value) || 0,
                  false,
                );
              } else {
                showChangeToast(
                  event.currentTarget,
                  col.label,
                  String(storedValue),
                  String(value),
                  true,
                );
              }
            }
          }}
          onBlur={(event) => {
            setActive(null);

            pendingDraftRef.current = null;

            const raw =
              editingValues[cellKey] !== undefined
                ? editingValues[cellKey]
                : event.target.value;

            clearEditingValue(cellKey);
            liveToastCellsRef.current.delete(cellKey);

            // Escape pressed: discard the draft instead of saving it.
            if (cancelledCellsRef.current.delete(cellKey)) {
              return;
            }

            commit(row, col, raw, event.currentTarget);
          }}
          onKeyDown={(event) => onKeyDown(event, rowIndex, col.key)}
          onDoubleClick={(event) =>
            handleEditableDoubleClick(event, rowIndex, col.key)
          }
          className={cn(
            "h-[30px] w-full rounded-[4px] border px-1.5 text-[12px] outline-none",
            draftClass(cellKey, isBlinking),
            isNumericType(col.type) && "text-right font-medium tabular-nums",
            isMonthColumn && "text-center",
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
      <tr
        key={row.id}
        data-row-id={row.id}
        className="group"
        style={{ minHeight: CELL_MIN_HEIGHT }}
      >
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

        {orderedColumns.map((col) => {
          const isName = col.key === "name";
          const isFrozen = isName;

          const width = widthOf(col);
          const isEditable = isColumnEditable(row, col);
          const kind = col.computed ? "calc" : isEditable ? "input" : "master";

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
                ...(isFrozen ? { left: frozenLeftOf(col.key) } : {}),
                width,
                minWidth: width,
                maxWidth: width,
                minHeight: CELL_MIN_HEIGHT,
                boxSizing: "border-box",
                zIndex: isFrozen ? 30 : 1,
                boxShadow: isName && isSelectedRow
                  ? "inset 3px 0 0 #102a43"
                  : "none",
              }}
              onClick={() => handleCellClick(row, isEditable)}
            >
              <div className="relative min-h-[38px] h-auto w-full">
                {renderCellContent(row, col, rowIndex)}
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
    (sections) =>
      sections.map((section) => (
        <Fragment key={section.key}>
          <tr className="bg-[#dbe6f3]">
            <td
              colSpan={orderedColumns.length + 1}
              className="border-b border-[#b9cbe0] p-0"
            >
              <div
                className={cn(
                  "sticky left-0 inline-flex min-h-[28px] max-w-max items-center whitespace-nowrap px-2.5 py-1.5 text-left text-[12px] font-bold text-[#173b63]",
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

          {section.children
            ? renderGroupedSections(section.children)
            : section.rows.map((row) =>
                renderDataRow(
                  row,
                  flattenedGroupOrder.get(row.id) !== undefined
                    ? flattenedGroupOrder.get(row.id)
                    : 0,
                ),
              )}
        </Fragment>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderDataRow, flattenedGroupOrder, orderedColumns.length],
  );

  // ============================================================
  // SELECT ALL (acts on the rows currently shown)
  // ============================================================

  const visibleSelectedCount = displayRows.filter(
    (row) => selected[row.id],
  ).length;

  const allSelected =
    displayRows.length > 0 && visibleSelectedCount === displayRows.length;

  const headerChecked = allSelected
    ? true
    : visibleSelectedCount > 0
      ? "indeterminate"
      : false;

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

  const groupByColumnLabel = groupBy.length
    ? groupBy
        .map((group) => {
          const column = GRID_COLUMNS.find((item) => item.key === group.key);

          return column
            ? `${column.label} ${group.dir === "desc" ? "↓" : "↑"}`
            : "";
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
      className="relative flex min-h-0 w-full flex-row overflow-hidden rounded-md border border-[#d5dce5] bg-white"
      style={{
        height: "calc(100vh - 126px)",
        isolation: "isolate",
        fontFamily: APPRAISAL_FONT,
      }}
    >
      <style>{GRID_STYLES}</style>

      {/* LEFT SIDE: GRID + PAGINATION + HISTORY */}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={gridViewportRef} className="min-h-0 flex-1 overflow-auto">
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

              {orderedColumns.map((col) => (
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
                      checked={headerChecked}
                      onCheckedChange={() =>
                        toggleAll(
                          !allSelected,
                          displayRows.map((row) => row.id),
                        )
                      }
                      aria-label="Select all"
                      className="size-3.5"
                    />
                  </div>
                </th>

                {orderedColumns.map((col) => {
                  const isName = col.key === "name";
                  const isFrozen = isName;
                  const width = widthOf(col);
                  const showFilter = !NO_FILTER_COLUMNS.has(col.key);
                  const headerLabel = isName ? "Employee" : col.label;

                  return (
                    <th
                      key={col.key}
                      draggable={!isFrozen}
                      onDragStart={(event) => handleColumnDragStart(event, col)}
                      onDragOver={handleColumnDragOver}
                      onDrop={(event) => handleColumnDrop(event, col)}
                      onDragEnd={handleColumnDragEnd}
                      className="sticky border-r border-b border-[#cbd5e1] p-0"
                      style={{
                        position: "sticky",
                        top: 0,
                        ...(isFrozen ? { left: frozenLeftOf(col.key) } : {}),
                        width,
                        minWidth: width,
                        maxWidth: width,
                        height: HEADER_HEIGHT,
                        boxSizing: "border-box",
                        zIndex: isFrozen ? 90 : 60,
                        background: isFrozen ? "#dfe8f3" : "#e9eef5",
                        fontFamily: APPRAISAL_FONT,
                      }}
                    >
                      <div
                        className="flex h-auto w-full items-center gap-1 px-2"
                        style={{ minHeight: HEADER_HEIGHT }}
                      >
                        <span
                          className="min-w-0 flex-1 overflow-hidden break-words text-left text-[11px] font-bold leading-[13px] text-[#24364d]"
                          title={headerLabel}
                        >
                          {headerLabel}
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
                              bulkEditable={
                                !!col.editable &&
                                !col.computed &&
                                canColumnBulkEdit &&
                                access.canEditField(col.key)
                              }
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
                        aria-label={`Resize ${headerLabel} column`}
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
                      colSpan={orderedColumns.length + 1}
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
                  {pageRows.map((row, rowIndex) =>
                    renderDataRow(row, rowIndex),
                  )}

                  {pageRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={orderedColumns.length + 1}
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
            {groupedRows
              ? `Grouped by ${groupByColumnLabel} — showing all ${rows.length} employees`
              : rows.length === 0
                ? "0 employees"
                : `Showing ${pageStart}-${pageEnd} of ${rows.length} employees${
                    groupBy.length ? ` · Sorted by ${groupByColumnLabel}` : ""
                  }`}


          </div>

          {groupedRows ? (
            <button
              type="button"
              onClick={clearAllGroups}
              className="flex h-6 items-center justify-center rounded border border-[#cbd5e1] bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
            >
              Clear grouping
            </button>
          ) : (
            <div className="flex items-center gap-1">
              {groupBy.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllGroups}
                  className="mr-2 flex h-6 items-center justify-center rounded border border-[#cbd5e1] bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                >
                  Clear sort
                </button>
              )}

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

                  <button
                    type="button"
                    onClick={retryHistory}
                    className="mt-1 flex h-6 items-center justify-center rounded border border-[#cbd5e1] bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <table
                  className="w-full border-collapse"
                  style={{ tableLayout: "fixed", minWidth: 1100 }}
                >
                  <colgroup>
                    <col style={{ width: 90 }} />

                    {historyMetricColumns.map((col) => (
                      <col key={col.key} style={{ width: 120 }} />
                    ))}
                  </colgroup>

                  <thead>
                    <tr className="bg-[#eef2f7]">
                      <th className="sticky top-0 border-r border-b border-[#cbd5e1] bg-[#eef2f7] px-2 py-1.5 text-center align-bottom text-[11px] font-bold text-[#24364d]">
                        Year
                      </th>

                      {historyMetricColumns.map((col) => (
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

                          {historyMetricColumns.map((col) => {
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
                                    change.tone === "neutral" &&
                                      "text-[#d97706]",
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
              The starred row reflects the employee currently selected in the
              grid above, live. Older cycles are reference data.
            </div>
          </div>
        )}
      </div>

      {/* METRICS STRIP (fold / unfold) — placeholder, sits left of the panel */}

      {detailOpen && liveHistoryRow && (
        <div
          className={cn(
            "relative shrink-0 border-l border-[#d5dce5] bg-white",
            metricsOpen
              ? "w-[300px]"
              : "w-[34px] cursor-pointer hover:bg-[#f6f7f9]",
          )}
          style={{ fontFamily: APPRAISAL_FONT }}
          onClick={() => {
            if (!metricsOpen) {
              setMetricsOpen(true);
            }
          }}
          title={metricsOpen ? undefined : "Open metrics"}
        >
          {metricsOpen ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-[#fafbfd] p-4 text-center text-[12.5px] text-[#6b7280]">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setMetricsOpen(false);
                }}
                className="absolute right-2 top-2 rounded-md border border-[#d1d5db] bg-white px-2 py-[3px] text-[12px] text-[#374151]"
                title="Fold metrics"
              >
                ‹ Fold
              </button>

              <b className="text-[14px] text-[#102a43]">Metrics</b>
              <div>Placeholder</div>
              <div>Team and org metrics open as separate screens.</div>
            </div>
          ) : (
            <span
              className="absolute left-2 top-3.5 text-[12.5px] font-bold text-[#102a43]"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              Metrics ›
            </span>
          )}
        </div>
      )}

      {/* RIGHT PANEL — opens when an employee name is clicked and follows the
          selected row. HR: Feedback only. Tech Ed: Feedback + Request. */}

      {detailOpen && liveHistoryRow && (
        <EmployeePanel
          employee={liveHistoryRow}
          team={rows}
          showRequest={showRequestTab}
          canDelegate={canDelegate}
          onRequest={onRequest}
          onClose={closeDetailPanel}
          history={{
            loading: historyLoading,
            error: historyError,
            rows: historyData,
            onRetry: retryHistory,
          }}
        />
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

      {/* "last edited" notice */}

      {focusNotice && (
        <div
          className="pointer-events-none fixed bottom-4 left-1/2 z-[10000] -translate-x-1/2 rounded-md bg-[#17365d] px-3 py-2 text-[12px] text-white shadow-lg"
          style={{ fontFamily: APPRAISAL_FONT }}
        >
          {focusNotice}
        </div>
      )}

          </div>
  );
}