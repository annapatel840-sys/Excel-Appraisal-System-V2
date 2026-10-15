import { useEffect, useMemo, useState } from "react";
import { WalletCards, RefreshCw } from "lucide-react";
 
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useBudget } from "@/lib/budget-store";
import { useAppraisal } from "@/lib/appraisal-store";
import { TechEdBudgetDistribution } from "./TechEdBudgetDistribution";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { useViewAs } from "@/lib/view-as-store"; 
 
// Amount with Indian grouping (no lakh rounding), e.g. 12,34,567.50
const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
 
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
  min-width: 1120px;
  border-collapse: collapse;
  font-size: 12px;
}
.bd-root th {
  background: #e8eef5;
  color: #12304f;
  font-size: 11px;
  font-weight: 700;
  text-align: left;
  padding: 8px 10px;
  border-bottom: 2px solid #9fb3cf;
  white-space: nowrap;
}
.bd-root td {
  padding: 8px 10px;
  border-bottom: 1px solid #e1e5eb;
  vertical-align: middle;
}
.bd-root th.num,
.bd-root td.num { text-align: right; }
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
  padding: 2px 8px;
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
  padding: 3px 7px;
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
`;
function ChangeCell({ from, to }) {
  const d = to - from;
  if (Math.abs(d) < 1) return <span className="mut">—</span>;
  const p = from ? (d / from) * 100 : 0;
  const cls = d > 0 ? "up" : "down";
  return (
    <>
      <span className={cls}>{(d > 0 ? "▲ " : "▼ ") + money(Math.abs(d))}</span>{" "}
      <span className={cls}>({(d > 0 ? "+" : "") + p.toFixed(1)}%)</span>
    </>
  );
}

function CompManagerBudgetDistribution({ activeCycleId = "" }) {
  const { compViewRows = [], loading, error } = useBudget();
  const [pane, setPane] = useState({ mine: true, alloc: true });

  const rows = useMemo(() => {
    const inCycle = compViewRows.filter(
      (r) => !activeCycleId || String(r.appraisal_cycle_id) === String(activeCycleId),
    );
    return inCycle.length ? inCycle : activeCycleId ? [] : compViewRows;
  }, [compViewRows, activeCycleId]);

  const original = rows.reduce((s, r) => s + Number(r.original_budget || 0), 0);
  const updated = rows.reduce((s, r) => s + Number(r.updated_budget || 0), 0);
  const team0 = rows.reduce((s, r) => s + Number(r.original_headcount || 0), 0);
  const team = rows.reduce((s, r) => s + Number(r.current_headcount || 0), 0);
  const used = rows.reduce((s, r) => s + Number(r.utilised || 0), 0);
  const usedPct = updated ? (used / updated) * 100 : 0;
  const over = usedPct > 100;

  const paneHead = (k, title) => (
    <button
      type="button"
      className="pane-head"
      aria-expanded={pane[k]}
      onClick={() => setPane((p) => ({ ...p, [k]: !p[k] }))}
    >
      <span>{title}</span>
      <span className="chev">{pane[k] ? "▾" : "▸"}</span>
    </button>
  );

  return (
    <div className="cbd-root">
      <style>{CBD_CSS}</style>
      {error ? <div className="berr">{error}</div> : null}

      {/* My Budget: only Original allotted, Team size, Utilised */}
      <div className="card">
        {paneHead("mine", "My Budget")}
        {pane.mine &&
          (loading ? (
            <div className="empty">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="empty">No budget has been allotted to you for the active cycle yet.</div>
          ) : (
            <>
              <div className="bsum flat">
                <div>
                  <div className="f-label">Original allotted</div>
                  <div className="v">{money(original)}</div>
                  <div className="d mut">Fixed at allocation</div>
                </div>
                <div>
                  <div className="f-label">Team size</div>
                  <div className="v">
                    {team0} → {team}
                  </div>
                  <div className="d mut">At allocation → now</div>
                </div>
                <div>
                  <div className="f-label">Utilised</div>
                  <div className={"v" + (over ? " over" : "")}>
                    {money(used)} ({usedPct.toFixed(0)}%)
                  </div>
                  <div className="d">
                    {over ? (
                      <span className="over">▲ {money(used - updated)} over</span>
                    ) : (
                      <span className="mut">Remaining {money(updated - used)}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="ubar-wide">
                <div className={"ubar" + (over ? " over" : "")}>
                  <span style={{ width: Math.min(usedPct, 100) + "%" }} />
                </div>
              </div>
            </>
          ))}
      </div>

      {/* Allocation: only this Comp Manager's own row (no audit trail, no reason box) */}
      <div className="card">
        {paneHead("alloc", "Allocation")}
        {pane.alloc && (
          <>
            <div className="bscroll">
              <table className="bal">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Tech-ED</th>
                    <th>Owner</th>
                    <th className="r">Original Budget</th>
                    <th className="r">Updated Budget</th>
                    <th className="r">Change</th>
                    <th className="r">Original Count</th>
                    <th className="r">Current Count</th>
                    <th className="r">Allot %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="self">
                      <td className="first">Comp Manager</td>
                      <td>{r.tech_ed_name || "—"}</td>
                      <td>
                        <b>{r.comp_manager}</b> <span className="muted-small">(you)</span>
                      </td>
                      <td className="r">{money(r.original_budget)}</td>
                      <td className="r">{money(r.updated_budget)}</td>
                      <td className="r">
                        <ChangeCell from={Number(r.original_budget)} to={Number(r.updated_budget)} />
                      </td>
                      <td className="r">{r.original_headcount}</td>
                      <td className="r">{r.current_headcount}</td>
                      <td className="r">
                        <span className="mut">{Number(r.percentage || 0)}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="note">
              Budget base = Current Annual Base Pay + Allocated PB Amount of your team · Utilised = Hike Amount
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const CBD_CSS = `
.cbd-root { max-width: 1320px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 8px;
  font-family: "IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif; font-size: 12.5px; color: #0f1f33; font-variant-numeric: tabular-nums; }
.cbd-root * { box-sizing: border-box; }
.cbd-root .mut { color: #64748b; }
.cbd-root .muted-small { font-size: 11px; color: #475569; }
.cbd-root .up { color: #15803d; } .cbd-root .down { color: #c2410c; } .cbd-root .over { color: #c2410c; font-weight: 700; }
.cbd-root .card { background: #fff; border: 1px solid #d3dbe6; border-radius: 10px; box-shadow: 0 1px 2px rgba(18,48,79,.06); overflow: hidden; }
.cbd-root .empty { padding: 22px 16px; color: #64748b; }
.cbd-root .berr { background: #fff; border: 1px solid #e3e8ef; border-left: 4px solid #c2410c; color: #7c2d12; border-radius: 6px; padding: 7px 10px; font-size: 12px; }
.cbd-root .pane-head { width: 100%; display: flex; align-items: center; justify-content: space-between; background: #12304f; color: #fff; border: 0;
  padding: 10px 16px; font-family: inherit; font-size: 13.5px; font-weight: 600; letter-spacing: .15px; cursor: pointer; text-align: left; }
.cbd-root .pane-head .chev { font-size: 12px; }
.cbd-root .bsum { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.cbd-root .bsum > div { padding: 12px 16px; border-right: 1px solid #d7dce3; border-top: 3px solid transparent; }
.cbd-root .bsum > div:last-child { border-right: 0; }
.cbd-root .f-label { font-size: 11px; color: #5b6b80; font-weight: 500; }
.cbd-root .bsum .v { font-size: 18px; font-weight: 600; color: #12304f; margin-top: 2px; }
.cbd-root .bsum .v.over { color: #c2410c; }
.cbd-root .bsum .d { font-size: 11px; margin-top: 2px; }
.cbd-root .ubar-wide { margin: 0 16px 14px; }
.cbd-root .ubar { height: 8px; background: #e6ebf2; border-radius: 3px; overflow: hidden; }
.cbd-root .ubar > span { display: block; height: 100%; background: linear-gradient(90deg, #14a3a3, #1b6fb5); }
.cbd-root .ubar.over > span { background: #d9480f; }
.cbd-root .bscroll { overflow-x: auto; }
.cbd-root table.bal { width: 100%; min-width: 980px; border-collapse: collapse; font-size: 12.5px; }
.cbd-root .bal th { background: #e8eef5; color: #12304f; font-weight: 600; font-size: 12px; text-align: left; padding: 8px 10px; border-bottom: 2px solid #9fb3cf; white-space: nowrap; }
.cbd-root .bal td { padding: 7px 10px; border-bottom: 1px solid #e1e5eb; vertical-align: middle; }
.cbd-root .bal .r { text-align: right; }
.cbd-root .bal tr.self td { background: #e9f4f4; font-weight: 700; }
.cbd-root .bal tr.self td.first { box-shadow: inset 4px 0 0 #14a3a3; }
.cbd-root .note { padding: 6px 14px 10px; font-size: 11px; color: #64748b; }
`;
 
export function BudgetDistributionPage() {
  const user = useCatalystUser();  const { effectiveId } = useViewAs();                     // ← ADD
  const asCompManager = effectiveId === "compmanager"
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
    payrollCycleRequest("cycles").then((cycles) => {
      if (!mounted) return;
      const all = Array.isArray(cycles) ? cycles : [];
      const active = all.find((cycle) => String(cycle.status || "").trim().toLowerCase() === "active" && !cycle.archived);
      const activeId = String(active?.id || active?.appraisal_cycle_id || active?.cycle_id || active?.ROWID || "");
      setActiveCycleId(activeId);
      const master = budgetMasterRows.find((row) => String(row.appraisal_cycle_id || "") === activeId);
      setCycleLabel(String(active?.name || active?.cycle_name || master?.appraisal_cycle_name || master?.cycle_name || "Active cycle unavailable"));
    }).catch((cycleError) => {
      console.error("Failed to load Budget Distribution cycle:", cycleError);
      if (mounted) {
        setActiveCycleId(String(budgetMasterRows[0]?.appraisal_cycle_id || ""));
        setCycleLabel(String(budgetMasterRows[0]?.appraisal_cycle_name || budgetMasterRows[0]?.cycle_name || "Cycle unavailable"));
      }
    });
    return () => { mounted = false; };
  }, [budgetMasterRows]);

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
      if (resolved?.key !== record.key || !active || !eligible) return false;
      const employeeId = normalize(
        employee.emp_id || employee.employee_id || employee.employeeId || employee.employee_id_text ||
          employee.row_id || employee.ROWID || employee.id || "",
      );
      if (!employeeId || countedEligibleEmployees.has(employeeId)) return false;
      countedEligibleEmployees.add(employeeId);
      return true;
    }).length;
  };

  const rows = useMemo(() => {
    const unique = new Map();
    [...budgetRows]
      .filter((row) => !activeCycleId || String(row.appraisal_cycle_id || "") === activeCycleId)
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
 
  const totalPercentage = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.budget_percentage || 0), 0),
    [rows],
  );
 
  const role = normalize(user?.role);
  // Tech-Ed may be returned as "Tech Ed", "Tech-Ed", or "teched".
  // Budget Distribution is read-only for Tech-Ed, but it must remain visible.
  const roleCompact = role.replace(/[^a-z0-9]/g, "");
  const canView =
    isHR ||
    role === "hr" ||
    role === "human resources" ||
    roleCompact === "teched";

  if (asCompManager) return <CompManagerBudgetDistribution activeCycleId={activeCycleId} />;
 
  if (!canView) return null;
  // Tech-EDs get their own budget view: their budget, their Comp Managers and Allot %.
  if (roleCompact === "teched" && !isHR) return <TechEdBudgetDistribution />;
 
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
              <table>
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Tech-Ed</th>
                    <th className="num">Budget %</th>
                    <th className="num">Original Budget</th>
                    <th className="num">Additional Budget</th>
                    <th className="num">Updated Budget</th>
                    <th className="num">Utilised</th>
                    <th className="num">Remaining</th>
                    <th className="num">Utilisation %</th>
                    <th>Team Count</th>
                    <th>Status</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const owner = resolveTechOwner(row.tech_ed_id);
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
                        <td>{countForTechOwner(row.tech_ed_id)}</td>
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
                        <b>{dateText(row.updated_at || row.modified_at)}</b>
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