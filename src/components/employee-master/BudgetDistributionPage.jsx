import { Fragment, useEffect, useMemo, useState } from "react";
import { WalletCards, RefreshCw } from "lucide-react";
 
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useBudget } from "@/lib/budget-store";
import { useAppraisal, useAppraisalRefresh } from "@/lib/appraisal-store";
import { TechEdBudgetDistribution } from "./TechEdBudgetDistribution";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { fetchAllEmployeeMasterEmployees } from "@/lib/employee-master-data";
import { readTechEdOriginalCount } from "@/lib/distribution-budget";
import { matchesCycleLocation } from "@/lib/location-store";
import { FilterStatus, FilterTh, ResizableCols, filterTableCss, resizableTableStyle, useColumnResize, useTableFilters } from "./FilterableTable";
 
// Amount with Indian grouping (no lakh rounding), e.g. 12,34,567.50
const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const money = (value) => INR.format(Number(value) || 0);
 
const pct = (value) => (Number(value) || 0).toFixed(1) + "%";
 
const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
 
function ownerName(value) {
  const text = String(value || "").trim();
  const match = text.split(/\s+-\s+/);
  return match.length > 1 ? match.slice(1).join(" - ").trim() : text;
}
function ownerKey(value) {
  const text = String(value || "").trim();
  const match = text.split(/\s+-\s+/);
  return normalize(match.length > 1 ? match[0] : text);
}
 
function dateText(value) {
  if (!value) return "—";
  // Catalyst timestamps look like "2026-10-28 14:03:22:123"; read them as written.
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return (
    date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    (match ? " " + match[4] + ":" + match[5] : "")
  );
}
 
const numOrBlank = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
};

// Columns behind the Tech-Ed Budget Distribution table's header filters.
const HR_W = { level: 70, owner: 190, pct: 70, original: 104, additional: 104, updated: 104, utilised: 96, remaining: 96, util: 84, origCount: 70, curCount: 70 };
const HR_COLS = [
  { key: "level", label: "Level", kind: "text", get: (i) => i.level },
  { key: "owner", label: "Tech-ED", kind: "text", get: (i) => i.owner },
  { key: "pct", label: "Budget %", kind: "number", num: true, get: (i) => numOrBlank(i.row.budget_percentage) },
  { key: "original", label: "Original Budget", kind: "number", num: true, get: (i) => numOrBlank(i.row.budget_amount) },
  { key: "additional", label: "Additional Budget", kind: "number", num: true, get: (i) => numOrBlank(i.row.additional_budget) },
  { key: "updated", label: "Updated Budget", kind: "number", num: true, get: (i) => numOrBlank(i.row.updated_budget) },
  { key: "utilised", label: "Utilised", kind: "number", num: true, get: (i) => numOrBlank(i.row.budget_utilized) },
  { key: "remaining", label: "Remaining", kind: "number", num: true, get: (i) => numOrBlank(i.row.budget_remaining) },
  { key: "util", label: "Utilisation %", kind: "number", num: true, get: (i) => numOrBlank(i.row.utilization_percentage) },
  { key: "origCount", label: "Original Count", kind: "number", get: (i) => i.originalCount },
  { key: "curCount", label: "Current Count", kind: "number", get: (i) => i.liveCount },
];

const CSS = `
.bd-root {
  max-width: 1600px;
  margin: 0 auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: "IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif;
  font-size: 12.5px;
  color: #0f1f33;
  font-variant-numeric: tabular-nums;
}
.bd-root * { box-sizing: border-box; }
.bd-root .muted { color: #64748b; }
.bd-root .muted-small { color: #64748b; font-size: 11px; }
.bd-root .card {
  background: #fff;
  border: 1px solid #d3dbe6;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(18,48,79,.06);
  overflow: hidden;
}
.bd-root .top {
  background: #fff;
  border: 1px solid #d3dbe6;
  border-left: 4px solid #14a3a3;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(18,48,79,.06);
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 9px 14px;
  color: #334155;
}
.bd-root .top b { color: #12304f; }
.bd-root .sep {
  width: 1px;
  align-self: stretch;
  background: #d7dce3;
}
.bd-root .title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #12304f;
  font-weight: 700;
  font-size: 14px;
}
.bd-root .title-icon {
  width: 25px;
  height: 25px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: #e9f4f4;
  color: #0b6a66;
}
.bd-root .pane-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #12304f;
  color: #fff;
  border: 0;
  padding: 10px 16px;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.bd-root .pane-head .cnt {
  font-weight: 400;
  color: #d6e4f5;
  margin-left: 8px;
}
.bd-root .summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
.bd-root .summary > div {
  padding: 12px 16px;
  border-right: 1px solid #d7dce3;
  border-top: 3px solid transparent;
}
.bd-root .summary > div:nth-child(2) {
  background: #0e7c6b;
  border-top-color: #0a5c4f;
  border-right-color: #0e7c6b;
}
.bd-root .summary > div:nth-child(2) .label,
.bd-root .summary > div:nth-child(2) .value,
.bd-root .summary > div:nth-child(2) .sub { color: #fff; }
.bd-root .summary > div:nth-child(2) .sub { opacity: 0.88; }
.bd-root .summary > div:last-child { border-right: 0; }
.bd-root .label {
  font-size: 11px;
  color: #5b6b80;
  font-weight: 500;
}
.bd-root .value {
  margin-top: 2px;
  color: #12304f;
  font-size: 18px;
  font-weight: 600;
}
.bd-root .sub {
  margin-top: 2px;
  font-size: 11px;
}
.bd-root .scroll { overflow-x: auto; }
.bd-root table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.bd-root th {
  background: #dfe8f3;
  color: #102a43;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  padding: 6px 6px;
  border-right: 1px solid #c9d8ec;
  border-bottom: 1px solid #9fb3cf;
}
.bd-root td {
  padding: 6px 6px;
  border-right: 1px solid #c9d8ec;
  border-bottom: 1px solid #c9d8ec;
  vertical-align: middle;
}
/* Grid outline: the wrapper carries the outer border, cells carry the inner lines. */
.bd-root .grid-wrap {
  overflow-x: auto;
  margin: 10px 14px 12px;
  border: 1px solid #7c93b2;
  border-radius: 6px;
}
.bd-root th:last-child,
.bd-root td:last-child { border-right: 0; }
.bd-root tbody tr:last-child > td { border-bottom: 0; }
.bd-root th.num,
.bd-root td.num { text-align: right; white-space: nowrap; }
.bd-root tr.tech { background: #f8fbfb; }
.bd-root tr.tech td:first-child { box-shadow: inset 4px 0 0 #14a3a3; }
.bd-root .owner {
  color: #12304f;
  font-weight: 700;
}
.bd-root .readonly {
  display: inline-flex;
  align-items: center;
  border: 1px solid #d5dde7;
  border-radius: 4px;
  padding: 2px 6px;
  background: #f8fafc;
  color: #64748b;
  font-size: 10.5px;
  font-weight: 600;
}
.bd-root .refresh {
  margin-left: auto;
  border: 1px solid #c5d0dd;
  background: #fff;
  color: #12304f;
  border-radius: 4px;
  padding: 5px 9px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.bd-root .refresh:disabled { opacity: .55; cursor: default; }
.bd-root .empty,
.bd-root .error {
  padding: 22px 16px;
  color: #64748b;
}
.bd-root .error { color: #9a3412; background: #fff7ed; }
.bd-root .detail {
  background: #f7f9fc;
  border-top: 1px solid #d7dce3;
  padding: 10px 14px;
}
.bd-root .detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}
.bd-root .detail-item {
  border: 1px solid #e1e6ed;
  background: #fff;
  border-radius: 6px;
  padding: 8px 10px;
}
${filterTableCss(".bd-root", "table")}
`;
 
export function BudgetDistributionPage() {
  const user = useCatalystUser();
  const {
    budgetRows,
    employeeCounts,
    employeeRows = [],
    locationEmployeeRows = [],
    techEdOwners = [],
    budgetMasterRows = [],
    budgetCompManagerRows = [],
    selectedLocation = "All",
    activeBudgetCycleId = "",
    totals,
    loading,
    error,
    reload,
    isHR,
    budgetAuditLog = [],
  } = useBudget();
 
  // Total utilised = the Appraisal Sheet's "Consumed (Hikes + Bonuses)": the
  // Performance Bonus (PB), Retention Bonus (RB) and Hike Amount totals added
  // together over the same (Active + Eligible) rows the sheet shows.
  const { rows: appraisalAll } = useAppraisal();
  const { refreshEmployees } = useAppraisalRefresh();

  // Refresh button: re-read the budget and roster data in place. The page,
  // filters, open sections and scroll stay as they are; only the numbers update.
  const [refreshing, setRefreshing] = useState(false);
  const refreshData = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([
        Promise.resolve(reload?.()).catch(() => {}),
        Promise.resolve(refreshEmployees?.()).catch(() => {}),
      ]);
    } finally {
      setRefreshing(false);
    }
  };
  const utilised = useMemo(
    () =>
      (appraisalAll || [])
        .filter(
          (row) =>
            String(row.status || "").trim().toLowerCase() === "active" &&
            String(row.eligibility || "").trim().toLowerCase() === "eligible",
        )
        .reduce(
          (sum, row) =>
            sum +
            (Number(row.allocatedPBAmount) || 0) +
            (Number(row.newRB) || 0) +
            (Number(row.hikeAmount) || 0),
          0,
        ),
    [appraisalAll],
  );
  const remaining = totals.updated - utilised;

  const [open, setOpen] = useState({});
  // Every employee (any location / cycle), loaded once when a row is first opened, so a Comp Manager
  // that is not in this cycle's roster can still be shown as "EMP004 - Name".
  const [masterEmployees, setMasterEmployees] = useState(null);
  const anyOpen = Object.values(open).some(Boolean);
  useEffect(() => {
    if (!anyOpen || masterEmployees !== null) return undefined;
    let alive = true;
    fetchAllEmployeeMasterEmployees()
      .then((list) => { if (alive) setMasterEmployees(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) setMasterEmployees([]); });
    return () => { alive = false; };
  }, [anyOpen, masterEmployees]);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [tableOpen, setTableOpen] = useState(true);
  const [cycleLabel, setCycleLabel] = useState("");
  const [activeCycleId, setActiveCycleId] = useState("");
  useEffect(() => {
    let mounted = true;
    const loadCycle = () => {
      setActiveCycleId("");
      setCycleLabel("No active cycle");
      payrollCycleRequest("cycles").then((cycles) => {
        if (!mounted) return;
        const all = Array.isArray(cycles) ? cycles : [];
        const activeCycles = all.filter((cycle) => {
          const status = String(cycle.status ?? cycle.cycle_status ?? "").trim().toLowerCase();
          const archived = [true, 1, "true", "1", "yes"].includes(
            typeof cycle.archived === "string" ? cycle.archived.trim().toLowerCase() : cycle.archived,
          );
          const hidden = [true, 1, "true", "1", "yes"].includes(
            typeof cycle.hidden === "string" ? cycle.hidden.trim().toLowerCase() : cycle.hidden,
          );
          return status === "active" && !archived && !hidden;
        });
        const active =
          activeCycles.find((cycle) =>
            String(cycle.id || cycle.appraisal_cycle_id || cycle.cycle_id || cycle.ROWID || "") === String(activeBudgetCycleId || ""),
          ) ||
          activeCycles.find((cycle) => matchesCycleLocation(cycle, selectedLocation)) ||
          null;
        const activeId = String(active?.id || active?.appraisal_cycle_id || active?.cycle_id || active?.ROWID || "");
        setActiveCycleId(activeId);
        setCycleLabel(active
          ? String(active.name || active.cycle_name || active.appraisal_year || "Active cycle unavailable")
          : "No active cycle");
      }).catch((cycleError) => {
        console.error("Failed to load Budget Distribution cycle:", cycleError);
        if (mounted) {
          // A failed cycle lookup must never expose a previous cycle's budget.
          setActiveCycleId("");
          setCycleLabel("No active cycle");
        }
      });
    };
    loadCycle();
    if (typeof window !== "undefined") {
      window.addEventListener("appraisal:cycle-updated", loadCycle);
    }
    return () => {
      mounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("appraisal:cycle-updated", loadCycle);
      }
    };
  // Cycle refresh is event-driven; budget row changes must not clear the active
  // cycle label or trigger redundant cycle requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation, activeBudgetCycleId]);
  // Resolving a Tech-ED id means searching every Tech-ED and every employee, and the
  // live counts below resolve one value per appraisal row (~3,000). Remember each
  // answer until the Tech-ED or employee lists change, so a value is looked up once.
  const resolveCache = useMemo(() => new Map(), [techEdOwners, employeeRows]);
  const resolveTechRecord = (raw) => {
    const text = String(raw || "").trim();
    if (!text) return null;
    if (resolveCache.has(text)) return resolveCache.get(text);
    const record = resolveTechRecordUncached(text);
    resolveCache.set(text, record);
    return record;
  };
  const resolveTechRecordUncached = (text) => {
    const compact = normalize(text);
    const linked = techEdOwners.find((item) => {
      const aliases = [item?.row_id, item?.ROWID, item?.employee_id, item?.assignment, item?.name].filter(Boolean);
      return aliases.some((alias) => normalize(alias) === compact || ownerKey(alias) === ownerKey(text));
    });
    if (linked) {
      const id = String(linked.employee_id || "").trim();
      const name = String(linked.name || "").trim();
      const assignment = String(linked.assignment || "").trim();
      const label = assignment.includes(" - ")
        ? assignment
        : id && name
          ? id + " - " + name
          : assignment || id || name || text;
      return { key: normalize(id || assignment || text), label };
    }
    const employee = employeeRows.find((row) =>
      String(row.emp_id || row.employee_id || "").trim().toLowerCase() === compact ||
      String(row.row_id || row.ROWID || "").trim() === text
    );
    const id = String(employee?.emp_id || employee?.employee_id || "").trim();
    const name = String(employee?.name || employee?.emp_name || employee?.employee_name || "").trim();
    return { key: normalize(id || text), label: id && name ? id + " - " + name : text };
  };
  const resolveTechOwner = (raw) => resolveTechRecord(raw)?.label || String(raw || "").trim();
  // Use the same AppraisalContext rows and exact Active + Eligible filter
  // as DashboardOverview. Dashboard counts rows, not unique Employee IDs.
  // Counted once per Tech-ED in a single pass, instead of re-scanning every
  // appraisal row for every Tech-ED row on every redraw.
  const liveCountByKey = useMemo(() => {
    const counts = new Map();
    (appraisalAll || []).forEach((employee) => {
      const active = String(employee.status || "").trim().toLowerCase() === "active";
      const eligible = String(employee.eligibility || "").trim().toLowerCase() === "eligible";
      if (!active || !eligible) return;
      const key = resolveTechRecord(employee.appraiserTechED || "")?.key;
      if (key === undefined) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  // resolveTechRecord only changes with resolveCache (Tech-ED / employee lists).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appraisalAll, resolveCache]);
  const countForTechOwner = (raw) => {
    const record = resolveTechRecord(raw);
    if (!record) return 0;
    return liveCountByKey.get(record.key) || 0;
  };
  // Presence is based on the full generated Appraisal Sheet roster in this
  // location, not only Active + Eligible employees used for budget utilisation.
  const locationTeamCountByKey = useMemo(() => {
    const counts = new Map();
    (locationEmployeeRows || []).forEach((employee) => {
      const inSheet =
        employee.in_appraisal_sheet === true ||
        String(employee.in_appraisal_sheet ?? "").trim().toLowerCase() === "true" ||
        String(employee.in_appraisal_sheet ?? "").trim() === "1";
      if (!inSheet) return;
      const key = resolveTechRecord(
        employee.appraiser_tech_ed_appraisal_sheet || employee.appraiser_tech_ed || "",
      )?.key;
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [locationEmployeeRows, resolveCache]);

  // Newest recorded budget change for a Tech-ED (browser audit trail), else
  // the row's own saved timestamp from Budget_Distribution.
  const lastUpdatedFor = (row) => {
    let latest = null;
    (budgetAuditLog || []).forEach((entry) => {
      if (entry.level === "techEd" && String(entry.rowId) === String(row.id) && (!latest || entry.at > latest.at)) latest = entry;
    });
    return latest ? latest.date + " " + (latest.time || "00:00") : row.updated_at || row.modified_at || "";
  };

  const rows = useMemo(() => {
    const unique = new Map();
    [...budgetRows]
      .filter((row) => Boolean(activeCycleId) && String(row.appraisal_cycle_id || "") === activeCycleId)
      .forEach((row) => {
        const identity = resolveTechRecord(row.tech_ed_id);
        if (!identity) return;
        // A Tech-ED allocation is displayed only when that Tech-ED has at
        // least one Active + Eligible Appraisal Sheet employee in this location.
        if (!(liveCountByKey.get(identity.key) > 0)) return;
        const current = unique.get(identity.key);
        // Keep the most recently updated record for a Tech-Ed/cycle and do not
        // render legacy duplicate ROWID/employee-ID aliases as separate rows.
        if (!current || String(row.modified_at || row.updated_at || "") >= String(current.modified_at || current.updated_at || "")) {
          unique.set(identity.key, { ...row, tech_ed_id: identity.label, _ownerKey: identity.key });
        }
      });
    return [...unique.values()].sort((a, b) => a.tech_ed_id.localeCompare(b.tech_ed_id));
  }, [budgetRows, techEdOwners, employeeRows, activeCycleId, locationTeamCountByKey]);
 
  // Header filters / sort for the table (display only; no data is refetched).
  const tableItems = rows.map((row) => {
    // Budget Master and the Tech-Ed allocation page share the same immutable
    // cycle/owner snapshot in localStorage. Read that first so HR's distribution
    // table displays the exact Original Count already shown in Budget Master.
    // Fall back to the API-persisted baseline for other browsers/sessions.
    const ownerRecord = techEdOwners.find((item) =>
      [
        item?.employee_id,
        item?.row_id,
        item?.ROWID,
        item?.assignment,
        item?.name,
        item?.email,
        item?.email_id,
      ].filter(Boolean).some((alias) =>
        [row.tech_ed_id, row._ownerKey, row.appraiser_tech_ed_id]
          .filter(Boolean)
          .some((identity) =>
            normalize(alias) === normalize(identity) ||
            ownerKey(alias) === ownerKey(identity)
          )
      )
    );
    const snapshotCount = readTechEdOriginalCount(activeCycleId, [
      row.tech_ed_id,
      row._ownerKey,
      row.appraiser_tech_ed_id,
      ownerRecord?.employee_id,
      ownerRecord?.row_id,
      ownerRecord?.ROWID,
      ownerRecord?.assignment,
      ownerRecord?.name,
      ownerRecord?.email,
    ]);
    const saved = row.original_headcount;
    const persistedCount =
      saved !== null && saved !== undefined && String(saved).trim() !== ""
        ? Number(saved) || 0
        : 0;
    // Tech-Ed Budget Master historically exposes the frozen baseline as
    // headcount when the dedicated original_headcount alias is not populated.
    // Match that page's fallback order so Distribution does not show 0 while
    // Budget Master already has the original allocation count.
    const legacyHeadcount = Number(row.headcount);
    const originalCount =
      snapshotCount !== null && snapshotCount > 0
        ? snapshotCount
        : persistedCount > 0
          ? persistedCount
          : Number.isFinite(legacyHeadcount) && legacyHeadcount > 0
            ? legacyHeadcount
            : snapshotCount !== null
              ? snapshotCount
              : persistedCount;
    return {
      row,
      level: "Tech-ED",
      owner: resolveTechOwner(row.tech_ed_id) || row.tech_ed_id || "—",
      originalCount,
      liveCount: countForTechOwner(row.tech_ed_id),
    };
  });
  const tf = useTableFilters(tableItems, HR_COLS);
  const rz = useColumnResize(HR_W);
  const hrKeys = HR_COLS.map((c) => c.key);

  const totalPercentage = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.budget_percentage || 0), 0),
    [rows],
  );
 
  const role = normalize(user?.role);
  // Tech-Ed and Comp Manager accounts use the scoped personal budget view.
  const roleCompact = role.replace(/[^a-z0-9]/g, "");
  const isTechEdRole = roleCompact === "teched";
  const isCompManagerRole = roleCompact === "compmgr" || roleCompact === "compmanager";
  const canView =
    isHR ||
    role === "hr" ||
    role === "human resources" ||
    isTechEdRole ||
    isCompManagerRole;

  if (!canView) return null;
  // Tech-Ed and Comp Managers get their own scoped budget view.
  if (!isHR && (isTechEdRole || isCompManagerRole)) return <TechEdBudgetDistribution />;
 
  return (
    <div className="bd-root">
      <style>{CSS}</style>
 
      <div className="top">
        <span className="title">
          <span className="title-icon">
            <WalletCards size={14} />
          </span>
          Budget Distribution
        </span>
        <span className="sep" />
        <span>
          Appraisal Cycle <b>{cycleLabel || "Loading Cycle…"}</b>
        </span>
        <span className="sep" />
        <span>
          <b>{rows.length}</b> Tech-ED Allocation{rows.length === 1 ? "" : "s"}
        </span>
        <span className="readonly">Read Only · HR</span>
        <button
          type="button"
          className="refresh"
          onClick={refreshData}
          disabled={refreshing}
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
 
      <section className="card">
        <button
          type="button"
          className="pane-head"
          onClick={() => setSummaryOpen((current) => !current)}
          aria-expanded={summaryOpen}
        >
          <span>Distribution Summary</span>
          <span className="muted-small" style={{ color: "#d6e4f5" }}>
            All Tech-ED Budgets
            <span style={{ marginLeft: 10 }}>{summaryOpen ? "▾" : "▸"}</span>
          </span>
        </button>
 
        {summaryOpen && (
          <div className="summary">
            <div>
              <div className="label">Tech-ED Count</div>
              <div className="value">{rows.length}</div>
              <div className="sub muted">Active Budget Records</div>
            </div>
            <div>
              <div className="label">Total Original Budget</div>
              <div className="value">{money(totals.base)}</div>
              <div className="sub muted">Before Additional Budget</div>
            </div>
            <div>
              <div className="label">Additional Budget</div>
              <div className="value">{money(totals.additional)}</div>
              <div className="sub muted">Added to Original</div>
            </div>
            <div>
              <div className="label">Total Updated Budget</div>
              <div className="value">{money(totals.updated)}</div>
              <div className="sub muted">Current Allocation</div>
            </div>
            <div>
              <div className="label">Total Utilised</div>
              <div className="value">{money(utilised)}</div>
              <div className="sub muted">
                {totals.updated
                  ? ((utilised / totals.updated) * 100).toFixed(0) + "% Utilised"
                  : "—"}
              </div>
            </div>
            <div>
              <div className="label">Total Remaining</div>
              <div className="value">{money(remaining)}</div>
              <div className="sub muted">Updated Budget − Utilised</div>
            </div>
          </div>
        )}
      </section>
 
      <section className="card">
        <button
          type="button"
          className="pane-head"
          onClick={() => setTableOpen((current) => !current)}
          aria-expanded={tableOpen}
        >
          <span>
            Tech-ED Budget Distribution
            <span className="cnt">{rows.length} records</span>
          </span>
          <span className="muted-small" style={{ color: "#d6e4f5" }}>
            Total %: {pct(totalPercentage)}
            <span style={{ marginLeft: 10 }}>{tableOpen ? "▾" : "▸"}</span>
          </span>
        </button>
 
        {tableOpen &&
          (loading && rows.length === 0 ? (
            <div className="empty">Loading Tech-ED budget distribution…</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : rows.length === 0 ? (
            <div className="empty">No active Tech-ED budget records found.</div>
          ) : (
            <div className="scroll">
              <FilterStatus tf={tf} noun="records" />
              <div className="grid-wrap">
              <table style={resizableTableStyle(rz, hrKeys)}>
                <ResizableCols rz={rz} keys={hrKeys} />
                <thead>
                  <tr>
                    {HR_COLS.map((c) => (
                      <FilterTh key={c.key} tf={tf} rz={rz} col={c} className={c.num ? "num" : ""} />
                    ))}
                    <FilterTh tf={tf} rz={rz} noFilter col={{ key: "access", label: "Access" }} />
                  </tr>
                </thead>
                <tbody>
                  {tf.rows.length === 0 && (
                    <tr className="ft-empty">
                      <td colSpan={HR_COLS.length}>No Tech-ED records match the filters.</td>
                    </tr>
                  )}
                  {tf.rows.map(({ row, owner, originalCount, liveCount }) => {
                    const key = row.id || row.tech_ed_id;
                    const expanded = Boolean(open[key]);

                    return (
                      <Fragment key={key}>
                        <tr className="tech">
                          <td><b>Tech-ED</b></td>
                          <td>
                            <div className="owner" title="Right-click to view Comp Manager details" onContextMenu={(event) => { event.preventDefault(); setOpen((current) => ({ ...current, [key]: !expanded })); }}>{owner || row.tech_ed_id || "—"}</div>
                            {owner && owner !== row.tech_ed_id ? <div className="muted-small">{row.tech_ed_id}</div> : null}
                          </td>
                          <td className="num">{pct(row.budget_percentage)}</td>
                          <td className="num">{money(row.budget_amount)}</td>
                          <td className="num">{money(row.additional_budget)}</td>
                          <td className="num">{money(row.updated_budget)}</td>
                          <td className="num">{money(row.budget_utilized)}</td>
                          <td className="num">{money(row.budget_remaining)}</td>
                          <td className="num">{pct(row.utilization_percentage)}</td>
                          <td>{originalCount}</td>
                          <td>{liveCount}</td>

                        </tr>
                        {expanded ? (
                          <tr className="tech-detail-row">
                            <td colSpan={HR_COLS.length}>
                              <div className="detail">
                                <div className="detail-grid">
                                  <div className="detail-item"><div className="label">Tech-ED</div><b>{owner || row.tech_ed_id || "—"}</b></div>
                                  <div className="detail-item"><div className="label">Budget percentage</div><b>{pct(row.budget_percentage)}</b></div>
                                  <div className="detail-item"><div className="label">Original team count</div><b>{originalCount}</b></div>
                                  <div className="detail-item"><div className="label">Current team count</div><b>{liveCount}</b></div>
                                  <div className="detail-item"><div className="label">Updated budget</div><b>{money(row.updated_budget)}</b></div>
                                  <div className="detail-item"><div className="label">Utilised</div><b>{money(row.budget_utilized)}</b></div>
                                  <div className="detail-item"><div className="label">Remaining</div><b>{money(row.budget_remaining)}</b></div>
                                  <div className="detail-item"><div className="label">Last updated</div><b>{dateText(lastUpdatedFor(row))}</b></div>
                                </div>
                                {(() => {
                                  const managerRows = (budgetCompManagerRows || []).filter((item) =>
                                    String(item.budget_distribution_id || "") === String(row.id || "") &&
                                    String(item.appraisal_cycle_id || activeCycleId) === String(activeCycleId)
                                  );
                                  // "EMP004 - Name": the ID in its real (upper) case plus the name, looked up in the cycle
                                  // roster, the Tech-ED list, the Appraisal Sheet and finally the full Employee Master.
                                  const managerLabel = (raw, display) => {
                                    // The server resolves "EMP004 - Name" into comp_manager_display; use it when it
                                    // already carries a name (comp_manager itself only stores the ID).
                                    const shown = String(display || "").trim();
                                    if (/\s+-\s+\S/.test(shown)) return shown;
                                    const text = String(raw || "").trim();
                                    if (!text) return "";
                                    const parts = text.split(/\s+-\s+/);
                                    const id = parts.length > 1 ? parts[0].trim() : text;
                                    const key = normalize(id);
                                    const idOf = (e) => String(e.emp_id || e.employee_id || e.empId || "").trim();
                                    const nameOf = (e) => String(e.name || e.emp_name || e.employee_name || "").trim();
                                    const sameRow = (e) => [e.row_id, e.ROWID].filter(Boolean).some((v) => String(v).trim() === text);
                                    const lookups = [employeeRows || [], locationEmployeeRows || [], masterEmployees || []];
                                    let eid = "";
                                    let ename = parts.length > 1 ? parts.slice(1).join(" - ").trim() : "";
                                    for (const list of lookups) {
                                      const hit = list.find((e) => normalize(idOf(e)) === key || sameRow(e));
                                      if (hit) { eid = idOf(hit) || eid; ename = ename || nameOf(hit); if (eid && ename) break; }
                                    }
                                    if (!ename) {
                                      const t = (techEdOwners || []).find((o) => normalize(o.employee_id) === key);
                                      if (t) { eid = eid || String(t.employee_id || "").trim(); ename = String(t.name || "").trim(); }
                                    }
                                    if (!ename) {
                                      const seen = (appraisalAll || []).find((a) => {
                                        const d = String(a.compManagerDisplay || a.compManager || "").trim();
                                        return d.includes(" - ") && normalize(d.split(/\s+-\s+/)[0]) === key;
                                      });
                                      if (seen) ename = String(seen.compManagerDisplay || seen.compManager).split(/\s+-\s+/).slice(1).join(" - ").trim();
                                    }
                                    const shownId = eid || id.toUpperCase();
                                    return ename ? shownId + " - " + ename : shownId;
                                  };
                                  return (
                                    <div className="manager-allocation">
                                      <div className="label" style={{ marginTop: 12, marginBottom: 6 }}>Comp Manager allocations ({managerRows.length})</div>
                                      {managerRows.length ? (
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                          <thead><tr><th align="left">Comp Manager</th><th align="right">Budget %</th><th align="right">Budget Base</th><th align="right">Calculated Budget</th><th align="right">Applied Budget</th><th align="right">Utilised</th></tr></thead>
                                          <tbody>{managerRows.map((manager) => (
                                            <tr key={manager.id || manager.comp_manager}>
                                              <td>{managerLabel(manager.comp_manager, manager.comp_manager_display)}</td>
                                              <td align="right">{pct(manager.percentage)}</td>
                                              <td align="right">{money(manager.budget_base)}</td>
                                              <td align="right">{money(manager.calculated_budget)}</td>
                                              <td align="right">{money(manager.applied_budget)}</td>
                                              <td align="right">{money(manager.total_utilization)}</td>
                                            </tr>
                                          ))}</tbody>
                                        </table>
                                      ) : <div className="muted-small">No Comp Manager allocations saved under this Tech-ED for this cycle.</div>}
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
 
            </div>
          ))}
      </section>
    </div>
  );
}