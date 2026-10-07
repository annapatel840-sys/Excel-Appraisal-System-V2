import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppraisal } from "@/lib/appraisal-store";
import {
  NEW_TITLES,
  INSTALLMENT_OPTIONS,
  inr,
  totalOfPB,
  totalBonus as calcTotalBonus,
  newBaseSalary,
  totalCTCWithRewards,
} from "@/lib/appraisal-data";
import { useBudget } from "@/lib/budget-store";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

const APPRAISAL_HISTORY_API_URL = catalystFunctionUrl("appraisalhistoryapi");
const NAVY = "#12304f";
const TEAL = "#14a3a3";
/* Ledger look: Manrope. Load it once in index.html:
   <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"> */
const FONT = '"Manrope", "Segoe UI", system-ui, Arial, sans-serif';
/* Ledger tokens */
const INK = "#102A43";
const LTEAL = "#0B7A75";
const LINE = "#E3E9EC";
const SOFT = "#EEF3F3";
const MUTED = "#5F7482";
const GREEN = "#12805C";
const RED = "#B42318";
const CURRENT_CYCLE = "Apr-26";

/* ------------------------------------------------------------------
   FRONTEND-ONLY SETTINGS (layout / banner). None of these touch data.
   ------------------------------------------------------------------ */
const BUDGET_PATH = "/employee-master?tab=budget-allocation";
const BUDGET_NOTICE_PLACEHOLDER = {
  from: "₹ 10.41 L",
  to: "₹ 9.79 L",
  changes: 5,
  since: "01-Sep-26",
};

const DETAIL_NOTES_KEY = "appraisal.myNotes";

const readDetailNotes = () => {
  try {
    const raw = window.localStorage.getItem(DETAIL_NOTES_KEY);
    return raw === null ? [] : JSON.parse(raw);
  } catch {
    return [];
  }
};

const formatDetailNoteTime = () => {
  const d = new Date();
  return (
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    " " +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
};

// Fields the screen can edit; used only to paint the "Edited this cycle" green.
const EDIT_FIELDS = [
  "hikeAmount",
  "newRB",
  "allocatedPBAmount",
  "pbInstallment",
  "targetPBNextYear",
  "targetPBCriteria",
  "newTitle",
  "compManagerRemarks",
];

/* ------------------------------------------------------------------
   LAYOUT
   Screen 1 (exactly one viewport): banner + Compensation + Metrics +
   Feedback + Previous / Save & next. It never scrolls.
   The compensation table is measured and scaled to fit the space it
   gets (useFitScale), so nothing overlaps at any resolution.
   Screen 2: Employee History - reached by scrolling the page only.
   If your app header is not 72px tall, change --ds-offset.
   ------------------------------------------------------------------ */
const DS_CSS = `
.ds-root{--ds-offset:72px;height:calc(100dvh - var(--ds-offset));overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:#C4CED6 transparent}
.ds-screen{display:grid;grid-template-rows:auto minmax(0,1fr);height:calc(100dvh - var(--ds-offset));min-height:0;overflow:hidden}
.ds-main{display:grid;grid-template-columns:var(--ds-cols);grid-template-rows:minmax(0,1fr);gap:8px;padding:4px 12px 8px;min-width:0;min-height:0;overflow:hidden}
.ds-main>*{min-width:0;min-height:0}
.ds-card{display:flex;flex-direction:column;background:#fff;border:1px solid #E3E9EC;border-radius:10px;box-shadow:0 1px 2px rgba(16,42,67,.04);overflow:hidden;min-width:0;min-height:0}
.ds-left{height:100%}
.ds-panel-scroll{position:relative;flex:1 1 0;min-width:0;min-height:0;overflow:hidden}
.ds-fit{position:absolute;top:0;left:0;transform-origin:top left}
.ds-foot{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid #E3E9EC;background:#fff}
.ds-side{position:relative;min-width:0;min-height:0;overflow:hidden}
.ds-side>.ds-card{width:100%;height:100%}
.ds-scroll{min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#C4CED6 transparent}
.ds-hist{margin:0 12px 14px;min-height:240px}
.ds-vbtn{writing-mode:vertical-rl;transform:rotate(180deg)}
.ds-root button{cursor:pointer}
.ds-root button:disabled{cursor:not-allowed}
@media (max-width:999px){
.ds-screen{display:block;height:auto;overflow:visible}
.ds-main{display:flex;flex-direction:column;overflow:visible}
.ds-left{height:calc(100dvh - var(--ds-offset) - 60px);flex:none}
.ds-side{flex:none;min-height:340px}
}
`;

const normalizeHistoryRecord = (record) => {
  const basePay = Number(record?.base_pay) || 0;
  const hike = Number(record?.hike_amount) || 0;
  return {
    year:
      record?.appraisal_year !== null && record?.appraisal_year !== undefined
        ? String(record.appraisal_year)
        : "—",
    basePay,
    joiningBonus: Number(record?.joining_bonus) || 0,
    performanceBonus: Number(record?.performance_bonus) || 0,
    retentionBonus: Number(record?.retention_bonus) || 0,
    totalBonus: Number(record?.total_bonus) || 0,
    hikeAmount: hike,
    designation: record?.designation ? String(record.designation) : "—",
    rating: record?.rating ? String(record.rating) : "—",
    feedback: record?.manager_rating ? String(record.manager_rating) : "—",
    targetPB: Number(record?.target_performance_bonus) || 0,
    newCTC: Number(record?.new_ctc) || 0,
    newBasePay: basePay + hike,
  };
};

const HISTORY_COLUMNS = [
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

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-IN");
const lakhs = (n) => `${((Number(n) || 0) / 1e5).toFixed(2)} L`;
const dash = (v) => (v === null || v === undefined || v === "" ? "—" : v);
const yrs = (v) => {
  const d = dash(v);
  return d === "—" || /yr/i.test(String(d)) ? d : `${d} yrs`;
};
const pctText = (v) => {
  const d = dash(v);
  return d === "—" || /%/.test(String(d)) ? d : `${d}%`;
};
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const signedPct = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;
const signedNum = (v) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${fmt(Math.abs(v))}`;
const isBlank = (v) => v === "" || v === null || v === undefined;
// Blank stays blank (like the grid's numeric cells); otherwise format.
const fmtOrBlank = (n) => (isBlank(n) ? "" : fmt(n));
// Parse a formatted amount; an empty input stays "" instead of 0.
const parseAmount = (raw) => {
  const cleaned = String(raw ?? "").replace(/[^0-9.]/g, "");
  return cleaned === "" ? "" : Number(cleaned) || 0;
};
const blankStr = (v) => (isBlank(v) ? "" : String(v));
const normalizeYearKey = (y) =>
  String(y ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const isCurrentCycleYearKey = (year) => {
  const raw = String(year ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return false;
  return (
    raw === "2026" ||
    raw === "2026-27" ||
    raw === "fy2026" ||
    raw === "fy 2026" ||
    raw === "apr-26" ||
    raw === "apr 26" ||
    raw === "apr-2026" ||
    raw === "apr 2026" ||
    raw.includes("2026")
  );
};
const isBlankRecord = (h) =>
  h.designation === "—" &&
  h.rating === "—" &&
  h.feedback === "—" &&
  !h.basePay &&
  !h.totalBonus &&
  !h.newCTC &&
  !h.hikeAmount;

// Same formulas the history grid already used for prior cycles.
const priorVals = (h) => {
  const tb = (h.performanceBonus || 0) + (h.retentionBonus || 0);
  return [
    h.basePay,
    h.joiningBonus,
    h.performanceBonus,
    h.retentionBonus,
    tb,
    h.hikeAmount,
    (h.newBasePay || 0) + tb,
    h.targetPB,
    h.newBasePay,
  ];
};

// Shared look for editable controls; green when changed this cycle.
const editableStyle = {
  borderColor: "#D1D5DB",
  background: "#fff",
  color: "#102A43",
};
const editedStyle = {
  borderColor: "#4FA38F",
  background: "#E3F4EF",
  color: "#0B4F46",
  fontWeight: 700,
};
const fieldStyle = (edited) => (edited ? editedStyle : editableStyle);

const COMP_COLS =
  "minmax(120px,0.95fr) minmax(130px,0.95fr) minmax(170px,1.25fr) minmax(110px,0.75fr)";

// typed text -> number for the live (while typing) calculations; empty = 0.
const draftNum = (s) => {
  const v = parseAmount(s);
  return v === "" ? 0 : v;
};
// tolerant parse ("3,50,000", "₹350000.00", 350000 all work).
const toNum = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------------------------------------------
   useFitScale: measures the natural height of the table and scales it
   so it always fits the box it is given (height AND width). Capped at
   100%, floored at MIN. Re-measures on resize / employee / content change.
   ------------------------------------------------------------------ */
const FIT_BASE_WIDTH = 760;
const FIT_MIN = 0.45;
function useFitScale(depKey) {
  const boxRef = useRef(null);
  const fitRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const fit = fitRef.current;
    if (!box || !fit) return undefined;
    const calc = () => {
      const needH = fit.offsetHeight || 1; // layout height ignores transforms
      const availH = box.clientHeight;
      const availW = box.clientWidth;
      if (!availH || !availW) return;
      const s = Math.max(
        FIT_MIN,
        Math.min(1, availH / needH, availW / FIT_BASE_WIDTH),
      );
      setScale((prev) => (Math.abs(prev - s) > 0.004 ? s : prev));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(box);
    ro.observe(fit);
    window.addEventListener("resize", calc);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", calc);
    };
  }, [depKey]);

  return { boxRef, fitRef, scale };
}

/* ------------------------------------------------------------------
   SMALL PRESENTATIONAL COMPONENTS
   ------------------------------------------------------------------ */
function BudgetBanner({ notice, onGotIt, onViewBudget }) {
  const [detailNotesOpen, setDetailNotesOpen] = useState(false);
  const [detailNotesText, setDetailNotesText] = useState("");
  const [detailNotes, setNotes] = useState(() => readDetailNotes());

  const saveDetailNote = () => {
    const trimmed = detailNotesText.trim();
    if (!trimmed) return;
    const next = [
      ...detailNotes,
      {
        id: String(Date.now()),
        at: formatDetailNoteTime(),
        text: trimmed,
        ctx: "Detailed Screen",
      },
    ];
    setNotes(next);
    window.localStorage.setItem(DETAIL_NOTES_KEY, JSON.stringify(next));
    setDetailNotesText("");
  };

  const deleteDetailNote = (id) => {
    const next = detailNotes.filter((note) => note.id !== id);
    setNotes(next);
    window.localStorage.setItem(DETAIL_NOTES_KEY, JSON.stringify(next));
  };

  // Always renders a wrapper so the grid row structure never shifts.
  return (
    <div style={{ minWidth: 0 }}>
      {notice ? (
        <div
          className="flex flex-wrap items-center gap-3"
          style={{
            margin: "6px 12px 2px",
            padding: "6px 12px",
            background: "#fff",
            border: `1px solid ${LINE}`,
            borderRadius: 8,
          }}
        >
          <span className="inline-flex items-center gap-2 font-bold" style={{ color: INK }}>
            <span style={{ color: RED }}>▲</span> Budget changed
          </span>
          <span className="min-w-0 flex-1" style={{ color: "#3E4C59" }}>
            Be aware: your team budget has changed from {notice.from} to {notice.to} —{" "}
            {notice.changes} team changes since allocation on {notice.since}.
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={onViewBudget}
              className="rounded border px-3 py-1 font-semibold"
              style={{ borderColor: "#C4CED6", background: "#fff", color: INK }}
            >
              View budget
            </button>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setDetailNotesOpen((previous) => !previous)}
              className="rounded border px-3 py-1 font-semibold"
              style={{ borderColor: "#C4CED6", background: "#fff", color: INK }}
            >
              ✎ My detailNotes{detailNotes.length > 0 ? ` (${detailNotes.length})` : ""}
            </button>
            {detailNotesOpen && (
              <div
                className="absolute right-0 top-full z-[300] mt-1.5 w-[380px] rounded-xl border bg-white p-3 text-left shadow-lg"
                style={{ borderColor: LINE, color: INK }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <b>My detailNotes</b>
                  <span className="text-[10.5px]" style={{ color: MUTED }}>
                    Saved in this browser only
                  </span>
                </div>
                <textarea
                  value={detailNotesText}
                  onChange={(event) => setDetailNotesText(event.target.value)}
                  placeholder="Write a note…"
                  className="min-h-[80px] w-full resize-y rounded border p-2 text-[12px] outline-none"
                  style={{ borderColor: "#D1D5DB" }}
                />
                <div className="mt-2 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDetailNotesText("")}
                    className="rounded border px-2.5 py-1 text-[11.5px] font-semibold"
                    style={{ borderColor: "#D1D5DB" }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={saveDetailNote}
                    className="rounded px-2.5 py-1 text-[11.5px] font-semibold text-white"
                    style={{ background: NAVY }}
                  >
                    Save note
                  </button>
                </div>
                {detailNotes.length > 0 && (
                  <div className="mt-2 max-h-[180px] space-y-1.5 overflow-auto">
                    {detailNotes.map((note) => (
                      <div key={note.id} className="rounded border p-2" style={{ borderColor: LINE }}>
                        <div className="text-[10px]" style={{ color: MUTED }}>
                          {note.at} · {note.ctx}
                        </div>
                        <div className="mt-0.5 whitespace-pre-wrap text-[11.5px]">
                          {note.text}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteDetailNote(note.id)}
                          className="mt-1 text-[10.5px] font-semibold"
                          style={{ color: RED }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onGotIt}
            className="rounded border px-3 py-1 font-semibold"
            style={{ borderColor: "#C4CED6", background: SOFT, color: INK }}
          >
            Got it
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CompHead({ children }) {
  return (
    <div
      style={{
        background: SOFT,
        color: INK,
        fontWeight: 700,
        padding: "6px 10px",
        borderBottom: `1px solid ${LINE}`,
        borderRight: `1px solid ${LINE}`,
      }}
    >
      {children}
    </div>
  );
}

function Cell({ children, strong, align }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: align === "right" ? "flex-end" : "stretch",
        gap: 3,
        padding: strong ? "6px 10px" : "5px 8px",
        borderBottom: `1px solid ${LINE}`,
        borderRight: `1px solid ${LINE}`,
        minWidth: 0,
        fontWeight: strong ? 700 : 400,
        color: INK,
      }}
    >
      {children}
    </div>
  );
}

function ReadOnlyInput({ value, bold }) {
  return (
    <input
      type="text"
      readOnly
      disabled
      value={value}
      className="h-[24px] w-full min-w-0 rounded border px-2 text-[11.5px]"
      style={{
        borderColor: "#D9E1E6",
        background: "#F3F6F7",
        color: bold ? INK : MUTED,
        fontWeight: bold ? 800 : 400,
      }}
    />
  );
}

function EditInput({ value, defaultValue, onLive, onCommit, edited, className = "" }) {
  const controlled = value !== undefined;
  const valueProps = controlled ? { value } : { defaultValue };
  return (
    <input
      type="text"
      inputMode="decimal"
      {...valueProps}
      onChange={(e) => onLive && onLive(e.target.value)}
      onBlur={(e) => {
        if (!controlled) {
          const n = parseAmount(e.target.value);
          e.target.value = fmtOrBlank(n);
        }
        if (onCommit) onCommit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`h-[24px] w-full min-w-0 rounded border px-2 text-[12px] outline-none focus:border-[#0B7A75] ${className}`}
      style={fieldStyle(edited)}
    />
  );
}

function CompRow({ label, current, children, diffNode, diffText, muted }) {
  return (
    <>
      <Cell strong>{label}</Cell>
      <Cell>
        <ReadOnlyInput value={current} />
      </Cell>
      <Cell>{children}</Cell>
      <Cell align="right">
        {diffNode ?? (
          <span style={{ color: muted ? MUTED : INK, fontSize: 11 }}>{diffText}</span>
        )}
      </Cell>
    </>
  );
}

function PayRow({
  label,
  floorAmount,
  month,
  floorCaptionPrefix,
  diffValue,
  instalmentSelect,
  children,
}) {
  const color = diffValue < 0 ? RED : diffValue > 0 ? GREEN : MUTED;
  return (
    <>
      <Cell strong>{label}</Cell>
      <Cell>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 56px", gap: 6 }}>
          <ReadOnlyInput value={`₹${fmt(floorAmount)}`} />
          <ReadOnlyInput value={month || "—"} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 56px",
            gap: 6,
            fontSize: 10,
            color: MUTED,
          }}
        >
          <span>{floorCaptionPrefix} to be Paid</span>
          <span>Month ({floorCaptionPrefix})</span>
        </div>
      </Cell>
      <Cell>
        <div className="flex items-center gap-1.5">
          {children}
          {instalmentSelect}
        </div>
        <div style={{ fontSize: 10, color: MUTED }}>
          {diffValue < 0
            ? `Preloaded · less than this → ${fmt(floorAmount)} paid`
            : "Preloaded"}
        </div>
      </Cell>
      <Cell align="right">
        <span style={{ color, fontWeight: 800, fontSize: 11.5 }}>
          {signedNum(diffValue)}
        </span>
        <span style={{ color: MUTED, fontSize: 10 }}>vs to be paid</span>
      </Cell>
    </>
  );
}

function HikeDiffInputs({
  edited,
  amountValue,
  pctValue,
  onLiveAmount,
  onLivePct,
  onHikeAmount,
  onHikePct,
}) {
  const lab = { fontSize: 10, color: MUTED, textAlign: "right" };
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={lab}>Hike Amount</span>
      <EditInput
        value={amountValue}
        onLive={onLiveAmount}
        onCommit={onHikeAmount}
        edited={edited}
      />
      <span style={lab}>Hike%</span>
      <EditInput
        value={pctValue}
        onLive={onLivePct}
        onCommit={onHikePct}
        edited={edited}
      />
    </div>
  );
}

function HistCell({ value, prev }) {
  const hasPrev = prev !== undefined && prev !== null;
  const pct = hasPrev ? (prev ? ((value - prev) / prev) * 100 : 0) : null;
  const color = pct === null ? MUTED : pct > 0 ? GREEN : pct < 0 ? RED : MUTED;
  return (
    <div style={{ textAlign: "right", padding: "4px 10px", lineHeight: 1.15 }}>
      <div style={{ color: INK }}>{fmt(value)}</div>
      {pct !== null ? (
        <div style={{ fontSize: 10.5, color, fontWeight: 600 }}>
          {pct >= 0 ? "+" : "−"}
          {Math.abs(pct).toFixed(2)}%
        </div>
      ) : null}
    </div>
  );
}

const HIST_GRID = "110px repeat(9, minmax(0, 1fr))";

/* ------------------------------------------------------------------
   PAGE
   ------------------------------------------------------------------ */
export function DetailScreenPage({
  onViewBudget,
  budgetNotice = BUDGET_NOTICE_PLACEHOLDER,
} = {}) {
  const { rows: liveRows, updateCell, updateLinkedCells } = useAppraisal();
  const { currentUser, isHR } = useBudget();
  const catalystUser = useCatalystUser();
  const role = String(catalystUser?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");

  // The backend already scopes rows to what this login may see.
  const rows = liveRows || [];
  const isScopedToTeam = isTechEd || rows.length > 0;

  const [index, setIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [historyByEmpId, setHistoryByEmpId] = useState({});
  const historyPromiseRef = useRef(new Map());

  // Layout-only state (no effect on data)
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(true);
  const [feedbackWidth, setFeedbackWidth] = useState(320);
  const [fbTab, setFbTab] = useState("manager");
  const baselineRef = useRef({});

  // What the user is typing right now (per employee), used only to show
  // live values. Saving still happens on blur exactly as before.
  const [draftState, setDraftState] = useState({ id: null });
  // Whatever the CTC formula adds beyond Base + PB + RB, frozen per employee.
  const ctcOffsetRef = useRef({});

  useEffect(() => {
    setIndex(0);
    setSearch("");
  }, [currentUser.name]);

  const employee = rows[Math.min(index, rows.length - 1)] || rows[0];

  // Measure + scale the compensation table so it fits one screen.
  const { boxRef, fitRef, scale } = useFitScale(employee?.id);

  // Remember each employee's values when first shown, so edits can be highlighted.
  if (employee && !baselineRef.current[employee.id]) {
    const snap = {};
    EDIT_FIELDS.forEach((f) => {
      snap[f] = employee[f];
    });
    baselineRef.current[employee.id] = snap;
  }

  const isEdited = (field) => {
    if (!employee) return false;
    const base = baselineRef.current[employee.id];
    if (!base) return false;
    return blankStr(base[field]) !== blankStr(employee[field]);
  };

  const loadHistory = useCallback((empId) => {
    const key = String(empId || "").trim();
    if (!key) {
      return Promise.resolve([]);
    }
    const existing = historyPromiseRef.current.get(key);
    if (existing) {
      return existing;
    }
    setHistoryByEmpId((prev) => ({
      ...prev,
      [key]: { loading: true, data: [], error: "" },
    }));
    const promise = (async () => {
      const response = await catalystFetch(
        `${APPRAISAL_HISTORY_API_URL}?emp_id=${encodeURIComponent(key)}`,
      );
      if (!response.ok) {
        throw new Error(`History request failed (${response.status}).`);
      }
      const result = await response.json();
      if (!result?.success) {
        throw new Error(result?.message || "Failed to load history.");
      }
      const records = Array.isArray(result?.data) ? result.data : [];
      return records
        .map(normalizeHistoryRecord)
        .sort((a, b) => String(b.year).localeCompare(String(a.year)));
    })();
    historyPromiseRef.current.set(key, promise);
    promise
      .then((data) => {
        setHistoryByEmpId((prev) => ({
          ...prev,
          [key]: { loading: false, data, error: "" },
        }));
      })
      .catch((error) => {
        historyPromiseRef.current.delete(key);
        setHistoryByEmpId((prev) => ({
          ...prev,
          [key]: {
            loading: false,
            data: [],
            error: error?.message || "Unable to load history.",
          },
        }));
      });
    return promise;
  }, []);

  useEffect(() => {
    if (employee?.empId) {
      loadHistory(employee.empId).catch(() => {});
    }
  }, [employee?.empId, loadHistory]);

  const empKey = employee ? String(employee.empId || "").trim() : "";
  const historyState = historyByEmpId[empKey];
  const historyRecords = historyState?.data || [];

  const priorCycles = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const record of historyRecords) {
      if (isCurrentCycleYearKey(record.year)) continue;
      if (isBlankRecord(record)) continue;
      const yearKey = normalizeYearKey(record.year);
      if (!yearKey || seen.has(yearKey)) continue;
      seen.add(yearKey);
      result.push(record);
    }
    return result;
  }, [historyRecords]);

  const derived = useMemo(() => {
    if (!employee) return null;
    return {
      totalPB: totalOfPB(employee),
      bonus: calcTotalBonus(employee),
      newBase: newBaseSalary(employee),
      totalCtc: totalCTCWithRewards(employee),
    };
  }, [employee]);

  /* ---- live (while typing) values ----------------------------------- */
  if (employee && derived && ctcOffsetRef.current[employee.id] === undefined) {
    ctcOffsetRef.current[employee.id] =
      derived.totalCtc -
      derived.newBase -
      (Number(employee.allocatedPBAmount) || 0) -
      (Number(employee.newRB) || 0);
  }

  const draft = employee && draftState.id === employee.id ? draftState : {};
  const setDraft = (patch) =>
    setDraftState((prev) => ({
      ...(prev.id === employee.id ? prev : {}),
      ...patch,
      id: employee.id,
    }));
  const clearDraft = (keys) =>
    setDraftState((prev) => {
      if (prev.id !== employee.id) return prev;
      const next = { ...prev };
      keys.forEach((k) => {
        delete next[k];
      });
      return next;
    });

  // Current base pay used by every hike calculation.
  const baseNow =
    toNum(employee?.currentAnnualBasePay) ||
    (derived ? toNum(derived.newBase) - toNum(employee?.hikeAmount) : 0);

  const livePB = !employee
    ? 0
    : draft.pbStr !== undefined
      ? draftNum(draft.pbStr)
      : Number(employee.allocatedPBAmount) || 0;
  const liveRB = !employee
    ? 0
    : draft.rbStr !== undefined
      ? draftNum(draft.rbStr)
      : Number(employee.newRB) || 0;
  const liveBase =
    !employee || !derived
      ? 0
      : draft.baseStr !== undefined
        ? draftNum(draft.baseStr)
        : derived.newBase;
  const liveCtc =
    employee && derived
      ? liveBase + livePB + liveRB + (ctcOffsetRef.current[employee.id] || 0)
      : 0;

  // Live figures for the "Apr-26 ★" row in Employee History.
  const liveHist =
    employee && derived
      ? {
          pbTotal: derived.totalPB + (livePB - (Number(employee.allocatedPBAmount) || 0)),
          rb: liveRB,
          bonus:
            derived.bonus +
            (livePB - (Number(employee.allocatedPBAmount) || 0)) +
            (liveRB - (Number(employee.newRB) || 0)),
          hike:
            draft.baseStr !== undefined ? liveBase - baseNow : Number(employee.hikeAmount) || 0,
          tpb:
            draft.tpbStr !== undefined
              ? draftNum(draft.tpbStr)
              : Number(employee.targetPBNextYear) || 0,
        }
      : null;

  /* ---- PB / RB "to be paid" floors + payment month ------------------- */
  const payFloors = useMemo(() => {
    if (!employee) return null;
    const pbFloor = Number(employee.targetPBAllocatedForMay) || 0;
    const rbFloor = Number(employee.rbToBePaid) || 0; // TODO: wire the real "RB to be paid" source
    return {
      pbFloor,
      pbMonth: employee.pbMonth ?? "", // TODO: wire the real PB payment month
      rbFloor,
      rbMonth: employee.rbMonth ?? "", // TODO: wire the real RB payment month
      pbDiff: (Number(employee.allocatedPBAmount) || 0) - pbFloor,
      rbDiff: (Number(employee.newRB) || 0) - rbFloor,
    };
  }, [employee]);

  /* ---- Total CTC with Rewards vs last cycle's CTC (moves while typing) */
  const ctcCompare = useMemo(() => {
    if (!employee || !derived) return null;
    const lastCycle = priorCycles[0];
    const lastCtc = lastCycle
      ? lastCycle.newBasePay + lastCycle.performanceBonus + lastCycle.retentionBonus
      : 0;
    const pct = lastCtc ? ((liveCtc - lastCtc) / lastCtc) * 100 : 0;
    return { lastCtc, pct };
  }, [employee, derived, priorCycles, liveCtc]);

  const handleSearch = (value) => {
    setSearch(value);
    const q = value.trim().toLowerCase();
    if (!q) return;
    const found = rows.findIndex(
      (row) =>
        String(row.name || "")
          .toLowerCase()
          .startsWith(q) || String(row.empId || "").toLowerCase() === q,
    );
    if (found > -1) setIndex(found);
  };

  const commit = (field, value) => {
    const current = isBlank(employee[field]) ? "" : String(employee[field]);
    if (current === (isBlank(value) ? "" : String(value))) return;
    updateCell(employee.id, field, value, "Detail screen edit");
  };
  const commitLinked = (fields) => {
    updateLinkedCells(employee.id, fields, "Detail screen edit");
  };

  const handleNewBasePayChange = (raw) => {
    const value = parseAmount(raw);
    // Cleared input clears the hike (same as the grid's blank hike cells).
    if (value === "") {
      if (!isBlank(employee.hikeAmount) || !isBlank(employee.hikePct)) {
        commitLinked({ hikeAmount: "", hikePct: "" });
      }
      return;
    }
    if (value === derived.newBase) return;
    const hike = value - baseNow;
    const pct = baseNow ? Number(((hike / baseNow) * 100).toFixed(1)) : 0;
    commitLinked({ hikeAmount: hike, hikePct: pct });
  };

  /* Hike Amount and Hike% are linked inputs. Editing either one
     recalculates the other off currentAnnualBasePay. */
  const handleHikeAmountChange = (raw) => {
    const hike = parseAmount(raw);
    if (hike === "") return;
    const base = baseNow;
    const pct = base ? Number(((hike / base) * 100).toFixed(2)) : 0;
    commitLinked({ hikeAmount: hike, hikePct: pct });
  };
  const handleHikePctChange = (raw) => {
    const pctRaw = parseAmount(raw);
    if (pctRaw === "") return;
    const base = baseNow;
    const hike = Math.round((base * Number(pctRaw)) / 100);
    commitLinked({ hikeAmount: hike, hikePct: Number(Number(pctRaw).toFixed(2)) });
  };

  /* Live linking while typing (display only) */
  const HIKE_DRAFT_KEYS = ["baseStr", "hikeStr", "pctStr"];
  const liveHikeAmount = (raw) => {
    const hike = draftNum(raw);
    const pct = baseNow ? (hike / baseNow) * 100 : 0;
    setDraft({ hikeStr: raw, pctStr: pct.toFixed(2), baseStr: fmt(baseNow + hike) });
  };
  const liveHikePct = (raw) => {
    const pct = draftNum(raw);
    const hike = Math.round((baseNow * pct) / 100);
    setDraft({ pctStr: raw, hikeStr: fmt(hike), baseStr: fmt(baseNow + hike) });
  };
  const liveNewBasePay = (raw) => {
    const hike = draftNum(raw) - baseNow;
    const pct = baseNow ? (hike / baseNow) * 100 : 0;
    setDraft({ baseStr: raw, hikeStr: fmt(hike), pctStr: pct.toFixed(2) });
  };

  const handleNewTitleChange = (value) => {
    const changed = value !== employee.designation;
    // Same rule as the grid: promotion "No" clears New Title.
    commitLinked(
      changed
        ? { newTitle: value, eligibleForPromotion: "Yes" }
        : { eligibleForPromotion: "No", newTitle: null },
    );
  };

  const scopeLabel = isHR
    ? "All employees"
    : isScopedToTeam
      ? `${currentUser.name}'s team`
      : "No assigned team";

  const handleViewBudget = () => {
    if (typeof onViewBudget === "function") onViewBudget();
    else window.location.assign(BUDGET_PATH);
  };

  // Blur first so the field being edited commits, then move.
  const goTo = (next) => {
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    setTimeout(() => {
      setIndex(() => Math.max(0, Math.min(rows.length - 1, next)));
      setSearch("");
    }, 0);
  };
  const safeIndex = Math.min(index, Math.max(rows.length - 1, 0));

  const cols = [
    "minmax(0,2.25fr)",
    metricsOpen ? "minmax(150px,0.6fr)" : "34px",
    cardOpen ? `minmax(240px, ${feedbackWidth}px)` : "34px",
  ].join(" ");

  // Title options: always include the current designation.
  const titleOptions = useMemo(() => {
    const list = Array.isArray(NEW_TITLES) ? [...NEW_TITLES] : [];
    const names = list.map((t) => (typeof t === "string" ? t : t?.value ?? t?.label));
    if (employee?.designation && !names.includes(employee.designation)) {
      list.unshift(employee.designation);
    }
    return list;
  }, [employee?.designation]);

  const targetPBCurrent =
    employee?.currentTargetPB ?? baselineRef.current[employee?.id]?.targetPBNextYear;

  /* ---- Metrics numbers ---------------------------------------------- */
  const metrics = employee
    ? [
        ["Hike %", baseNow ? signedPct(((liveBase - baseNow) / baseNow) * 100) : "—"],
        [
          "Total CTC vs last cycle",
          ctcCompare?.lastCtc ? signedPct(ctcCompare.pct) : "—",
        ],
        ["Total CTC", inr(liveCtc)],
        [
          "PB share of CTC",
          liveCtc ? `${((livePB / liveCtc) * 100).toFixed(1)}%` : "—",
        ],
        [
          "RB share of CTC",
          liveCtc ? `${((liveRB / liveCtc) * 100).toFixed(1)}%` : "—",
        ],
        ["Total bonus", inr(liveHist?.bonus || 0)],
      ]
    : [];

  /* ---- Feedback timeline -------------------------------------------- */
  const timeline = employee
    ? [
        {
          year: CURRENT_CYCLE,
          current: true,
          title: dash(employee.designation),
          rating: dash(employee.managerRating ?? employee.rating),
          promo: dash(employee.eligibleForPromotion),
          note: "Feedback captured during the review.",
        },
        ...priorCycles.map((p) => ({
          year: p.year,
          current: false,
          title: p.designation,
          rating: p.feedback !== "—" ? p.feedback : p.rating,
          promo: null,
          note: null,
        })),
      ]
    : [];

  return (
    <div
      className="ds-root"
      style={{
        fontFamily: FONT,
        background: "#F4F7F7",
        color: "#1F2F3D",
        fontSize: "13px",
      }}
    >
      <style>{DS_CSS}</style>

      {/* ============ SCREEN 1 - fits one viewport, no scrolling ============ */}
      <div className="ds-screen">
        <BudgetBanner
          notice={noticeOpen ? budgetNotice : null}
          onGotIt={() => setNoticeOpen(false)}
          onViewBudget={handleViewBudget}
        />

        {!employee ? (
          <div className="p-6 text-sm text-slate-500">
            No employees are visible for this login.
          </div>
        ) : (
          <div className="ds-main" style={{ "--ds-cols": cols }}>
            {/* LEFT - Compensation input */}
            <section className="ds-card ds-left" aria-label="Compensation input">
              <div
                className="flex shrink-0 items-center justify-between gap-2 border-b px-2.5 py-1"
                style={{ borderColor: NAVY, background: NAVY }}
              >
                <div
                  className="min-w-0 flex-1 text-[12.5px] leading-snug"
                  style={{ color: "#fff" }}
                >
                  <div className="truncate">
                    <b
                      className="text-[13px]"
                      style={{ color: "#fff", letterSpacing: "-.01em" }}
                    >
                      {employee.name}
                    </b>{" "}
                    ·{" "}
                    <span className="font-bold" style={{ color: "#7CE0C3" }}>
                      {employee.empId ?? "—"}
                    </span>{" "}
                    · {dash(employee.designation)}
                    {employee.band ? ` · ${employee.band}` : ""}
                  </div>
                  <div className="truncate" style={{ color: "#BCCCDC" }}>
                    {yrs(employee.totalExperience)} · {yrs(employee.wissenExperience)} here ·
                    Reports to {dash(employee.reportingManager)}
                  </div>
                </div>
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold"
                  style={{ color: "#D6E0EC" }}
                >
                  <i
                    className="inline-block h-[11px] w-[11px] rounded-[3px] border"
                    style={{ background: "#E3F4EF", borderColor: "#4FA38F" }}
                  />
                  Edited this cycle
                </span>
              </div>

              <div
                className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-1"
                style={{ borderColor: LINE }}
              >
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search your team by name or employee ID"
                  aria-label="Search your team"
                  className="h-[25px] flex-1 rounded border px-2 text-[11px] outline-none focus:border-[#0B7A75]"
                  style={{ borderColor: "#9AA7B4" }}
                />
                <span
                  title={`Scope: ${scopeLabel}`}
                  className="whitespace-nowrap rounded px-2 py-0.5 text-[10.5px] font-semibold"
                  style={{ background: "#E6F3F2", color: "#0B5F5B" }}
                >
                  {rows.length}
                </span>
              </div>

              {/* Table area: takes all leftover height; content is scaled to fit it */}
              <div
                className="ds-panel-scroll"
                ref={boxRef}
                style={{ overflow: scale <= FIT_MIN + 0.001 ? "auto" : "hidden" }}
              >
                <div
                  className="ds-fit"
                  ref={fitRef}
                  style={{ transform: `scale(${scale})`, width: `${100 / scale}%` }}
                >
                  <div
                    className="grid text-[12px]"
                    style={{ gridTemplateColumns: COMP_COLS }}
                  >
                    <CompHead>Description</CompHead>
                    <CompHead>Current</CompHead>
                    <CompHead>Proposed</CompHead>
                    <CompHead>Difference</CompHead>

                    {/* Base Pay */}
                    <CompRow
                      label="Base Pay"
                      current={inr(employee.currentAnnualBasePay)}
                      diffNode={
                        <HikeDiffInputs
                          key={`${employee.id}-hike`}
                          employee={employee}
                          edited={isEdited("hikeAmount")}
                          amountValue={draft.hikeStr ?? fmt(employee.hikeAmount)}
                          pctValue={
                            draft.pctStr ?? (Number(employee.hikePct) || 0).toFixed(2)
                          }
                          onLiveAmount={liveHikeAmount}
                          onLivePct={liveHikePct}
                          onHikeAmount={(v) => {
                            handleHikeAmountChange(v);
                            clearDraft(HIKE_DRAFT_KEYS);
                          }}
                          onHikePct={(v) => {
                            handleHikePctChange(v);
                            clearDraft(HIKE_DRAFT_KEYS);
                          }}
                        />
                      }
                    >
                      <EditInput
                        key={`${employee.id}-newBase`}
                        value={draft.baseStr ?? fmt(derived.newBase)}
                        onLive={liveNewBasePay}
                        edited={isEdited("hikeAmount")}
                        onCommit={(v) => {
                          handleNewBasePayChange(v);
                          clearDraft(HIKE_DRAFT_KEYS);
                        }}
                      />
                    </CompRow>

                    {/* Joining Bonus */}
                    <CompRow label="Joining Bonus" current="0" diffText="n/a this cycle" muted>
                      <ReadOnlyInput value="0" />
                    </CompRow>

                    {/* Performance Bonus */}
                    <PayRow
                      label="Performance Bonus (PB) / Instalment"
                      floorAmount={payFloors.pbFloor}
                      month={payFloors.pbMonth}
                      floorCaptionPrefix="PB"
                      diffValue={livePB - payFloors.pbFloor}
                      instalmentSelect={
                        <select
                          key={`${employee.id}-pbInstallment`}
                          value={
                            isBlank(employee.pbInstallment)
                              ? ""
                              : String(employee.pbInstallment)
                          }
                          onChange={(e) => commit("pbInstallment", e.target.value)}
                          className="h-[24px] w-[48px] shrink-0 rounded border px-1 text-[10.5px] outline-none focus:border-[#0B7A75]"
                          style={fieldStyle(isEdited("pbInstallment"))}
                        >
                          <option value="">—</option>
                          {INSTALLMENT_OPTIONS.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      }
                    >
                      <EditInput
                        key={`${employee.id}-allocatedPBAmount`}
                        className="flex-1"
                        defaultValue={fmtOrBlank(employee.allocatedPBAmount)}
                        edited={isEdited("allocatedPBAmount")}
                        onLive={(v) => setDraft({ pbStr: v })}
                        onCommit={(v) => {
                          commit("allocatedPBAmount", parseAmount(v));
                          clearDraft(["pbStr"]);
                        }}
                      />
                    </PayRow>

                    {/* Retention Bonus */}
                    <PayRow
                      label="Retention Bonus (RB)"
                      floorAmount={payFloors.rbFloor}
                      month={payFloors.rbMonth}
                      floorCaptionPrefix="RB"
                      diffValue={liveRB - payFloors.rbFloor}
                    >
                      <EditInput
                        key={`${employee.id}-newRB`}
                        className="flex-1"
                        defaultValue={fmt(employee.newRB ?? 0)}
                        edited={isEdited("newRB")}
                        onLive={(v) => setDraft({ rbStr: v })}
                        onCommit={(v) => {
                          commit("newRB", Number(String(v).replace(/[^0-9.]/g, "")) || 0);
                          clearDraft(["rbStr"]);
                        }}
                      />
                    </PayRow>

                    {/* Total CTC with Rewards */}
                    <CompRow
                      label="Total CTC with Rewards"
                      current={inr(ctcCompare.lastCtc)}
                      diffNode={
                        ctcCompare.lastCtc ? (
                          <span
                            style={{
                              color: ctcCompare.pct < 0 ? RED : GREEN,
                              fontWeight: 800,
                              fontSize: 11.5,
                            }}
                          >
                            {ctcCompare.pct < 0 ? "−" : ""}
                            {Math.abs(ctcCompare.pct).toFixed(1)}%
                          </span>
                        ) : (
                          <span style={{ color: MUTED }}>—</span>
                        )
                      }
                    >
                      <ReadOnlyInput value={inr(liveCtc)} bold />
                    </CompRow>

                    {/* Target PB for Next Year */}
                    <CompRow
                      label="Target PB for Next Year"
                      current={fmtOrBlank(targetPBCurrent) || "—"}
                      diffText="next yr"
                      muted
                    >
                      <EditInput
                        key={`${employee.id}-targetPBNextYear`}
                        defaultValue={fmtOrBlank(employee.targetPBNextYear)}
                        edited={isEdited("targetPBNextYear")}
                        onLive={(v) => setDraft({ tpbStr: v })}
                        onCommit={(v) => {
                          commit("targetPBNextYear", parseAmount(v));
                          clearDraft(["tpbStr"]);
                        }}
                      />
                    </CompRow>

                    {/* Target PB Criteria */}
                    <CompRow
                      label="Target PB Criteria"
                      current={dash(employee.currentTargetPBCriteria ?? employee.targetPBCriteria)}
                      diffText=""
                      muted
                    >
                      <textarea
                        key={`${employee.id}-targetPBCriteria`}
                        defaultValue={blankStr(employee.targetPBCriteria)}
                        onBlur={(e) => commit("targetPBCriteria", e.target.value)}
                        rows={2}
                        className="w-full min-w-0 resize-none rounded border px-2 py-1 text-[11.5px] outline-none focus:border-[#0B7A75]"
                        style={fieldStyle(isEdited("targetPBCriteria"))}
                      />
                    </CompRow>

                    {/* Designation / New Title */}
                    <CompRow
                      label="Designation"
                      current={dash(employee.designation)}
                      diffText={
                        employee.newTitle && employee.newTitle !== employee.designation
                          ? "Promotion"
                          : ""
                      }
                      muted
                    >
                      <select
                        key={`${employee.id}-newTitle`}
                        value={employee.newTitle || employee.designation || ""}
                        onChange={(e) => handleNewTitleChange(e.target.value)}
                        className="h-[24px] w-full min-w-0 rounded border px-1 text-[11.5px] outline-none focus:border-[#0B7A75]"
                        style={fieldStyle(isEdited("newTitle"))}
                      >
                        {titleOptions.map((t) => {
                          const v = typeof t === "string" ? t : t?.value ?? t?.label;
                          const l = typeof t === "string" ? t : t?.label ?? t?.value;
                          return (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          );
                        })}
                      </select>
                    </CompRow>

                    {/* Comp Manager Remarks */}
                    <CompRow
                      label="Comp Manager Remarks"
                      current={dash(baselineRef.current[employee.id]?.compManagerRemarks)}
                      diffText=""
                      muted
                    >
                      <textarea
                        key={`${employee.id}-compManagerRemarks`}
                        defaultValue={blankStr(employee.compManagerRemarks)}
                        onBlur={(e) => commit("compManagerRemarks", e.target.value)}
                        rows={2}
                        className="w-full min-w-0 resize-none rounded border px-2 py-1 text-[11.5px] outline-none focus:border-[#0B7A75]"
                        style={fieldStyle(isEdited("compManagerRemarks"))}
                      />
                    </CompRow>
                  </div>
                </div>
              </div>

              {/* Legend + counter + Previous / Save & next: normal flow, always visible */}
              <div className="ds-foot">
                <div
                  className="flex flex-wrap items-center gap-3 text-[11px]"
                  style={{ color: MUTED }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <i
                      className="inline-block h-[11px] w-[11px] rounded-[3px] border"
                      style={{ background: "#F3F6F7", borderColor: "#D9E1E6" }}
                    />
                    Current (read-only)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i
                      className="inline-block h-[11px] w-[11px] rounded-[3px] border"
                      style={{ background: "#fff", borderColor: "#D1D5DB" }}
                    />
                    Proposed (editable)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i
                      className="inline-block h-[11px] w-[11px] rounded-[3px] border"
                      style={{ background: "#E3F4EF", borderColor: "#4FA38F" }}
                    />
                    Edited this cycle
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11.5px]" style={{ color: MUTED }}>
                    {safeIndex + 1} of {rows.length} · {scopeLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => goTo(safeIndex - 1)}
                    disabled={safeIndex <= 0}
                    className="rounded border px-3 py-1.5 text-[12px] font-semibold"
                    style={{
                      borderColor: LINE,
                      background: "#fff",
                      color: safeIndex <= 0 ? "#9AA7B4" : INK,
                    }}
                  >
                    ‹ Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo(safeIndex + 1)}
                    className="rounded px-4 py-1.5 text-[12.5px] font-bold"
                    style={{ background: NAVY, color: "#fff" }}
                  >
                    Save &amp; next ›
                  </button>
                </div>
              </div>
            </section>

            {/* METRICS */}
            <aside className="ds-side" aria-label="Metrics">
              <div className="ds-card">
                {metricsOpen ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setMetricsOpen(false)}
                      className="shrink-0 border-b px-3 py-2 text-left text-[12px] font-bold"
                      style={{ borderColor: LINE, color: INK, background: "#fff" }}
                    >
                      Metrics ‹
                    </button>
                    <div className="ds-scroll flex-1 p-3">
                      {metrics.map(([k, v]) => (
                        <div
                          key={k}
                          className="mb-2.5 rounded border px-2.5 py-2"
                          style={{ borderColor: LINE, background: SOFT }}
                        >
                          <div className="text-[10.5px]" style={{ color: MUTED }}>
                            {k}
                          </div>
                          <div className="text-[14px] font-extrabold" style={{ color: INK }}>
                            {v}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMetricsOpen(true)}
                    className="flex h-full w-full items-center justify-center"
                    style={{ background: "#fff", color: INK }}
                    aria-label="Open metrics"
                  >
                    <span className="ds-vbtn text-[12px] font-bold">Metrics ›</span>
                  </button>
                )}
              </div>
            </aside>

            {/* FEEDBACK */}
            <aside className="ds-side" aria-label="Feedback">
              <div className="ds-card">
                {cardOpen ? (
                  <>
                    <div
                      className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"
                      style={{ background: NAVY, color: "#fff" }}
                    >
                      <span className="flex-1 text-center text-[14px] font-extrabold">
                        Feedback
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setFeedbackWidth((w) => Math.max(240, w - 40))}
                          aria-label="Decrease feedback panel width"
                          className="h-[28px] w-[28px] rounded border font-bold"
                          style={{ borderColor: "#4A6580", color: "#fff", background: "transparent" }}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeedbackWidth((w) => Math.min(620, w + 40))}
                          aria-label="Increase feedback panel width"
                          className="h-[28px] w-[28px] rounded border font-bold"
                          style={{ borderColor: "#4A6580", color: "#fff", background: "transparent" }}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCardOpen(false)}
                        aria-label="Close feedback"
                        className="h-[28px] w-[34px] rounded border"
                        style={{ borderColor: "#4A6580", color: "#fff", background: "transparent" }}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex shrink-0 gap-2 px-3 py-2.5">
                      {[
                        ["manager", "Manager"],
                        ["client", "Client"],
                        ["other", "Other"],
                      ].map(([k, l]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setFbTab(k)}
                          className="rounded-full border px-3 py-1 text-[12px] font-semibold"
                          style={{
                            borderColor: fbTab === k ? "#9AA7B4" : LINE,
                            background: fbTab === k ? SOFT : "#fff",
                            color: INK,
                          }}
                        >
                          {l}
                        </button>
                      ))}
                    </div>

                    <div className="ds-scroll flex-1 px-4 pb-3">
                      {timeline.map((t) => (
                        <div key={t.year} className="mb-3 flex gap-2.5">
                          <span
                            className="mt-1.5 inline-block h-[11px] w-[11px] shrink-0 rounded-full border-2"
                            style={{
                              borderColor: t.current ? LTEAL : "#C4CED6",
                              background: t.current ? LTEAL : "#fff",
                            }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <b className="text-[14px]" style={{ color: INK }}>
                                {t.year}
                              </b>
                              {t.current ? (
                                <span
                                  className="rounded px-2 py-0.5 text-[11px] font-semibold"
                                  style={{ background: SOFT, color: INK }}
                                >
                                  This cycle
                                </span>
                              ) : null}
                            </div>
                            <div style={{ color: MUTED }}>{t.title}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <span
                                className="rounded px-2 py-0.5 text-[11.5px]"
                                style={{ background: SOFT, color: INK }}
                              >
                                {fbTab === "manager" ? "Manager" : fbTab === "client" ? "Client" : "Other"}{" "}
                                rating <b>{fbTab === "manager" ? t.rating : "—"}</b>
                                {t.current && fbTab === "manager" && t.rating !== "—" ? " / 5" : ""}
                              </span>
                              {t.promo ? (
                                <span
                                  className="rounded px-2 py-0.5 text-[11.5px]"
                                  style={{ background: SOFT, color: INK }}
                                >
                                  Eligible for promotion: {t.promo}
                                </span>
                              ) : null}
                            </div>
                            {t.note ? (
                              <div className="mt-1" style={{ color: "#3E4C59" }}>
                                {t.note}
                              </div>
                            ) : fbTab === "manager" && t.rating !== "—" ? (
                              <div className="mt-1" style={{ color: MUTED }}>
                                {t.rating} / 5
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      <div className="mt-2 text-[11.5px]" style={{ color: MUTED }}>
                        Client rating and past RR % are not in the sheet yet, so they show “—”.
                      </div>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCardOpen(true)}
                    className="flex h-full w-full items-center justify-center"
                    style={{ background: "#fff", color: INK }}
                    aria-label="Open feedback"
                  >
                    <span className="ds-vbtn text-[12px] font-bold">Feedback ‹</span>
                  </button>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* ============ SCREEN 2 - scroll the page to reach history ============ */}
      {employee ? (
        <section className="ds-card ds-hist" aria-label="Employee history">
          <div
            className="shrink-0 px-4 py-2 text-[14px] font-extrabold"
            style={{ background: NAVY, color: "#fff" }}
          >
            Employee History — {employee.name} · {priorCycles.length + 1} cycles
          </div>

          <div className="ds-scroll">
            <div
              className="grid text-[11.5px] font-bold"
              style={{
                gridTemplateColumns: HIST_GRID,
                background: SOFT,
                color: INK,
                borderBottom: `1px solid ${LINE}`,
              }}
            >
              <div style={{ padding: "6px 10px" }}>Year</div>
              {HISTORY_COLUMNS.map((c) => (
                <div key={c.key} style={{ padding: "6px 10px", textAlign: "right" }}>
                  {c.label}
                </div>
              ))}
            </div>

            {/* current cycle row */}
            {liveHist
              ? (() => {
                  const last = priorCycles[0] ? priorVals(priorCycles[0]) : null;
                  const cur = [
                    baseNow,
                    0,
                    liveHist.pbTotal,
                    liveHist.rb,
                    liveHist.bonus,
                    liveHist.hike,
                    liveCtc,
                    liveHist.tpb,
                    liveBase,
                  ];
                  return (
                    <div
                      className="grid items-center text-[12px]"
                      style={{
                        gridTemplateColumns: HIST_GRID,
                        background: "#FFF8D6",
                        borderBottom: `1px solid ${LINE}`,
                      }}
                    >
                      <div style={{ padding: "4px 10px", color: LTEAL, fontWeight: 800 }}>
                        {CURRENT_CYCLE} ★
                      </div>
                      {cur.map((v, i) => (
                        <HistCell key={i} value={v} prev={last ? last[i] : null} />
                      ))}
                    </div>
                  );
                })()
              : null}

            {/* prior cycles */}
            {priorCycles.map((h, i) => {
              const vals = priorVals(h);
              const older = priorCycles[i + 1] ? priorVals(priorCycles[i + 1]) : null;
              return (
                <div
                  key={normalizeYearKey(h.year)}
                  className="grid items-center text-[12px]"
                  style={{
                    gridTemplateColumns: HIST_GRID,
                    background: i % 2 ? "#FAFCFC" : "#fff",
                    borderBottom: `1px solid ${LINE}`,
                  }}
                >
                  <div style={{ padding: "4px 10px", fontWeight: 700, color: INK }}>{h.year}</div>
                  {vals.map((v, c) => (
                    <HistCell key={c} value={v} prev={older ? older[c] : null} />
                  ))}
                </div>
              );
            })}

            {historyState?.loading ? (
              <div className="px-4 py-3 text-[12px]" style={{ color: MUTED }}>
                Loading history…
              </div>
            ) : null}
            {historyState?.error ? (
              <div className="px-4 py-3 text-[12px]" style={{ color: RED }}>
                {historyState.error}
              </div>
            ) : null}
            {!historyState?.loading && !historyState?.error && priorCycles.length === 0 ? (
              <div className="px-4 py-3 text-[12px]" style={{ color: MUTED }}>
                No earlier cycles on record.
              </div>
            ) : null}
          </div>

          <div
            className="flex shrink-0 flex-wrap items-center gap-4 border-t px-4 py-2 text-[11.5px]"
            style={{ borderColor: LINE, color: MUTED }}
          >
            <span className="inline-flex items-center gap-1.5">
              <i
                className="inline-block h-[12px] w-[12px] rounded-[3px] border"
                style={{ background: "#FFF8D6", borderColor: "#E8D98A" }}
              />
              This cycle (not yet final)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i
                className="inline-block h-[12px] w-[12px] rounded-[3px]"
                style={{ background: GREEN }}
              />
              Increase vs previous cycle
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i
                className="inline-block h-[12px] w-[12px] rounded-[3px]"
                style={{ background: RED }}
              />
              Decrease
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default DetailScreenPage;