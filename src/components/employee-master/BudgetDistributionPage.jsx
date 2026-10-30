import { useEffect, useMemo, useState } from "react";
import { WalletCards, RefreshCw } from "lucide-react";
 
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useBudget } from "@/lib/budget-store";
import { useAppraisal } from "@/lib/appraisal-store";
import { TechEdBudgetDistribution } from "./TechEdBudgetDistribution";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
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
const HR_W = { level: 70, owner: 190, pct: 70, original: 104, additional: 104, updated: 104, utilised: 96, remaining: 96, util: 84, origCount: 70, curCount: 70, status: 76, access: 104 };
const HR_COLS = [
  { key: "level", label: "Level", kind: "text", get: (i) => i.level },
  { key: "owner", label: "Tech-Ed", kind: "text", get: (i) => i.owner },
  { key: "pct", label: "Budget %", kind: "number", num: true, get: (i) => numOrBlank(i.row.budget_percentage) },
  { key: "original", label: "Original Budget", kind: "number", num: true, get: (i) => numOrBlank(i.row.budget_amount) },
  { key: "additional", label: "Additional Budget", kind: "number", num: true, get: (i) => numOrBlank(i.row.additional_budget) },
  { key: "updated", label: "Updated Budget", kind: "number", num: true, get: (i) => numOrBlank(i.row.updated_budget) },
  { key: "utilised", label: "Utilised", kind: "number", num: true, get: (i) => numOrBlank(i.row.budget_utilized) },
  { key: "remaining", label: "Remaining", kind: "number", num: true, get: (i) => numOrBlank(i.row.budget_remaining) },
  { key: "util", label: "Utilisation %", kind: "number", num: true, get: (i) => numOrBlank(i.row.utilization_percentage) },
  { key: "origCount", label: "Original Count", kind: "number", get: (i) => i.originalCount },
  { key: "curCount", label: "Current Count", kind: "number", get: (i) => i.liveCount },
  { key: "status", label: "Status", kind: "text", get: (i) => i.row.status || "Active" },
];

const CSS = `
.bd-root {
  max-width: 1320px;
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
  padding: 3px 6px;
  border-right: 1px solid #c9d8ec;
  border-bottom: 1px solid #9fb3cf;
}
.bd-root td {
  padding: 3px 6px;
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
.bd-root .status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 1px 7px;
  background: #e8f5ed;
  color: #166534;
  font-size: 10.5px;
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
    techEdOwners = [],
    budgetMasterRows = [],
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
        const active = all.find((cycle) => {
          const status = String(cycle.status ?? cycle.cycle_status ?? "").trim().toLowerCase();
          const archived = [true, 1, "true", "1", "yes"].includes(
            typeof cycle.archived === "string" ? cycle.archived.trim().toLowerCase() : cycle.archived,
          );
          return status === "active" && !archived && !cycle.hidden;
        });
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
  }, []);
  const resolveTechRecord = (raw) => {
    const text = String(raw || "").trim();
    if (!text) return null;
    const compact = normalize(text);
    const linked = techEdOwners.find((item) => {
      const aliases = [item?.row_id, item?.ROWID, item?.employee_id, item?.assignment, item?.name].filter(Boolean);
      return aliases.some((alias) => normalize(alias) === compact || ownerKey(alias) === ownerKey(text));
    });
    if (linked) {
      const id = String(linked.employee_id || "").trim();
      const name = String(linked.name || "").trim();
      return { key: normalize(id || linked.assignment || text), label: String(linked.assignment || (id && name ? id + " - " + name : id || name || text)).trim() };
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
  const countForTechOwner = (raw) => {
    const record = resolveTechRecord(raw);
    if (!record) return 0;
    const countedEligibleEmployees = new Set();
    return employeeRows.filter((employee) => {
      const assignment = employee.appraiser_tech_ed_appraisal_sheet || "";
      const resolved = resolveTechRecord(assignment);
      const eligibility = String(
        [
          employee.eligibility,
          employee.eligible_status,
          employee.eligibility_status,
          employee.eligible,
        ].find((value) => value !== null && value !== undefined && String(value).trim() !== "") ?? "",
      ).trim().toLowerCase().replace(/[ _-]+/g, "");
      // Match Budget Master: an employee counts only when both status
      // and eligibility are explicitly Active + Eligible.
      const status = String(employee.emp_status ?? employee.status ?? employee.employee_status ?? "")
        .trim().toLowerCase();
      const active = status === "active";
      const eligible = ["eligible", "yes", "true", "1"].includes(eligibility);
      const inAppraisalSheet = employee.in_appraisal_sheet === true ||
        String(employee.in_appraisal_sheet ?? "").trim().toLowerCase() === "true" ||
        String(employee.in_appraisal_sheet ?? "").trim() === "1";
      if (resolved?.key !== record.key || !active || !eligible || !inAppraisalSheet) return false;
      const employeeId = normalize(
        employee.emp_id || employee.employee_id || employee.employeeId || employee.employee_id_text ||
          employee.row_id || employee.ROWID || employee.id || "",
      );
      if (!employeeId || countedEligibleEmployees.has(employeeId)) return false;
      countedEligibleEmployees.add(employeeId);
      return true;
    }).length;
  };

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
        const current = unique.get(identity.key);
        // Keep the most recently updated record for a Tech-Ed/cycle and do not
        // render legacy duplicate ROWID/employee-ID aliases as separate rows.
        if (!current || String(row.modified_at || row.updated_at || "") >= String(current.modified_at || current.updated_at || "")) {
          unique.set(identity.key, { ...row, tech_ed_id: identity.label, _ownerKey: identity.key });
        }
      });
    return [...unique.values()].sort((a, b) => a.tech_ed_id.localeCompare(b.tech_ed_id));
  }, [budgetRows, techEdOwners, employeeRows, activeCycleId]);
 
  // Header filters / sort for the table (display only; no data is refetched).
  const tableItems = rows.map((row) => {
    // Original Count is the API's persisted baseline only.
    // Never substitute headcount or the live roster count here.
    const saved = row.original_headcount;
    const originalCount = saved !== null && saved !== undefined && String(saved).trim() !== ""
      ? Number(saved) || 0
      : 0;
    return {
      row,
      level: "Tech-Ed",
      owner: resolveTechOwner(row.tech_ed_id) || row.tech_ed_id || "—",
      originalCount,
      liveCount: countForTechOwner(row.tech_ed_id),
    };
  });
  const tf = useTableFilters(tableItems, HR_COLS);
  const rz = useColumnResize(HR_W);
  const hrKeys = [...HR_COLS.map((c) => c.key), "access"];

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
          Appraisal cycle <b>{cycleLabel || "Loading cycle…"}</b>
        </span>
        <span className="sep" />
        <span>
          <b>{rows.length}</b> Tech-Ed allocation{rows.length === 1 ? "" : "s"}
        </span>
        <span className="readonly">Read only · HR</span>
        <button
          type="button"
          className="refresh"
          onClick={reload}
          disabled={loading}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
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
            All Tech-Ed budgets
            <span style={{ marginLeft: 10 }}>{summaryOpen ? "▾" : "▸"}</span>
          </span>
        </button>
 
        {summaryOpen && (
          <div className="summary">
            <div>
              <div className="label">Tech-Ed count</div>
              <div className="value">{rows.length}</div>
              <div className="sub muted">Active budget records</div>
            </div>
            <div>
              <div className="label">Total original budget</div>
              <div className="value">{money(totals.base)}</div>
              <div className="sub muted">Before additional budget</div>
            </div>
            <div>
              <div className="label">Additional budget</div>
              <div className="value">{money(totals.additional)}</div>
              <div className="sub muted">Added to original</div>
            </div>
            <div>
              <div className="label">Total updated budget</div>
              <div className="value">{money(totals.updated)}</div>
              <div className="sub muted">Current allocation</div>
            </div>
            <div>
              <div className="label">Total utilised</div>
              <div className="value">{money(utilised)}</div>
              <div className="sub muted">
                {totals.updated
                  ? ((utilised / totals.updated) * 100).toFixed(0) + "% utilised"
                  : "—"}
              </div>
            </div>
            <div>
              <div className="label">Total remaining</div>
              <div className="value">{money(remaining)}</div>
              <div className="sub muted">Updated budget − utilised</div>
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
            Tech-Ed Budget Distribution
            <span className="cnt">{rows.length} records</span>
          </span>
          <span className="muted-small" style={{ color: "#d6e4f5" }}>
            Total %: {pct(totalPercentage)}
            <span style={{ marginLeft: 10 }}>{tableOpen ? "▾" : "▸"}</span>
          </span>
        </button>
 
        {tableOpen &&
          (loading ? (
            <div className="empty">Loading Tech-Ed budget distribution…</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : rows.length === 0 ? (
            <div className="empty">No active Tech-Ed budget records found.</div>
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
                      <td colSpan={HR_COLS.length + 1}>No Tech-Ed records match the filters.</td>
                    </tr>
                  )}
                  {tf.rows.map(({ row, owner, originalCount, liveCount }) => {
                    const key = row.id || row.tech_ed_id;
                    const expanded = Boolean(open[key]);

                    return (
                      <tr key={key} className="tech">
                        <td>
                          <b>Tech-Ed</b>
                        </td>
                        <td>
                          <div className="owner">{owner || row.tech_ed_id || "—"}</div>
                          {owner && owner !== row.tech_ed_id ? (
                            <div className="muted-small">{row.tech_ed_id}</div>
                          ) : null}
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
                        <td>
                          <span className="status">
                            {row.status || "Active"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="readonly"
                            onClick={() =>
                              setOpen((current) => ({
                                ...current,
                                [key]: !expanded,
                              }))
                            }
                            aria-expanded={expanded}
                          >
                            {expanded ? "Hide details" : "View details"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
 
              {rows.map((row) => {
                const key = row.id || row.tech_ed_id;
                if (!open[key]) return null;
                const owner = resolveTechOwner(row.tech_ed_id);
                return (
                  <div className="detail" key={"detail-" + key}>
                    <div className="detail-grid">
                      <div className="detail-item">
                        <div className="label">Tech-Ed</div>
                        <b>{owner || row.tech_ed_id || "—"}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Budget percentage</div>
                        <b>{pct(row.budget_percentage)}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Original team count</div>
                        <b>{row.original_headcount !== null && row.original_headcount !== undefined && String(row.original_headcount).trim() !== ""
                          ? Number(row.original_headcount) || 0
                          : 0}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Current team count</div>
                        <b>{countForTechOwner(row.tech_ed_id)}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Updated budget</div>
                        <b>{money(row.updated_budget)}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Utilised</div>
                        <b>{money(row.budget_utilized)}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Remaining</div>
                        <b>{money(row.budget_remaining)}</b>
                      </div>
                      <div className="detail-item">
                        <div className="label">Last updated</div>
                        <b>{dateText(lastUpdatedFor(row))}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
      </section>
    </div>
  );
}