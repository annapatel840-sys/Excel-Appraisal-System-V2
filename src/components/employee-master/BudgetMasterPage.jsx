import { useEffect, useMemo, useState } from "react";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import { useBudget } from "@/lib/budget-store";
import { TechEdBudgetMasterPage } from "./TechEdBudgetMasterPage";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

const NAVY = "#102A43";
const TEAL = "#2F6FED";
const BORDER = "#D5DFEB";

/* ---------- helpers ---------- */
function normalizeOwnerKey(value) {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  // Only treat an ID-looking prefix as an ID. A plain name (including names
  // containing hyphens) must remain a searchable owner value.
  const pair = text.match(/^([a-z]*\d+)\s*-\s*(.+)$/i);
  return pair ? pair[1] : text;
}

function canonicalOwnerKey(value, employees = []) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const pair = raw.match(/^([a-z]*\d+)\s*-\s*(.+)$/i);
  const rawId = pair ? pair[1].trim() : "";
  const rawName = pair ? pair[2].trim() : raw;
  const valuesFor = (employee) => [
    employee.row_id, employee.ROWID, employee.emp_id, employee.employee_id,
    employee.name, employee.employee_name, employee.emp_name, employee.email, employee.email_id,
  ].filter(Boolean).map(normalizeOwnerKey);
  const matched = employees.find((employee) => {
    const values = valuesFor(employee);
    return values.includes(normalizeOwnerKey(raw)) ||
      (rawId && values.includes(normalizeOwnerKey(rawId))) ||
      (rawName && values.includes(normalizeOwnerKey(rawName)));
  });
  if (matched) {
    const id = String(matched.emp_id || matched.employee_id || "").trim();
    const name = String(matched.name || matched.employee_name || matched.emp_name || "").trim();
    return normalizeOwnerKey(id || name || raw);
  }
  return normalizeOwnerKey(rawId || raw);
}

function ownerName(value, employees = []) {
  const raw = String(value || "").trim();
  if (!raw) return "Unassigned";
  const pair = raw.match(/^([a-z]*\d+)\s*-\s*(.+)$/i);
  const rawId = pair ? pair[1].trim() : "";
  const rawName = pair ? pair[2].trim() : raw;
  const person = employees.find((employee) => {
    const id = String(employee.emp_id || employee.employee_id || "").trim();
    const name = String(employee.name || employee.employee_name || employee.emp_name || "").trim();
    const email = String(employee.email || employee.email_id || "").trim();
    return [id, name, email].some((candidate) =>
      candidate && [normalizeOwnerKey(raw), normalizeOwnerKey(rawId), normalizeOwnerKey(rawName)]
        .filter(Boolean).includes(normalizeOwnerKey(candidate)),
    );
  });
  if (person) {
    const id = String(person.emp_id || person.employee_id || "").trim();
    const name = String(person.name || person.employee_name || person.emp_name || "").trim();
    return id && name ? id + " - " + name : name || id || raw;
  }
  return pair ? pair[2].trim() : raw;
}

function amount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).trim().replace(/[₹,\s]/g, "").replace(/^(?:INR|Rs\.?)/i, ""));
  return Number.isFinite(n) ? n : 0;
}

// Amount with Indian grouping (no lakh rounding), e.g. 12,34,567.50
const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
function money(value) {
  return INR.format(amount(value));
}

function percent(value) {
  return Number(value || 0).toFixed(1) + "%";
}

function dateText(value) {
  if (!value) return "—";
  const p = String(value).split("-");
  if (p.length !== 3) return value;
  return (
    p[2] +
    "-" +
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][Number(p[1]) - 1]
  );
}

function Panel({ title, count, open, onToggle, children }) {
  return (
    <section
      className="overflow-hidden rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(18,48,79,.06)]"
      style={{ borderColor: BORDER }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px] font-semibold tracking-[.15px] text-white"
        style={{ background: NAVY }}
      >
        <span>
          {title}
          {count ? (
            <span className="ml-2 font-normal text-[#d6e4f5]">{count}</span>
          ) : null}
        </span>
        <span className="text-[12px]">{open ? "▾" : "▸"}</span>
      </button>
      {open ? children : null}
    </section>
  );
}

/* Audit table: header alignment matches value alignment (numbers right, text left). */
const AUDIT_COLS = [
  ["Date", false],
  ["Owner", false],
  ["Old %", true],
  ["New %", true],
  ["Budget before", true],
  ["Budget after", true],
  ["Changed by", false],
  ["Reason", false],
];

function AuditTable({
  rows,
  showOwner = true,
  ownerLabel = "Owner",
  budgetLabel = "Budget",
}) {
  const cols = AUDIT_COLS.filter(([h]) => showOwner || h !== "Owner").map(
    ([h, r]) => [
      h === "Owner"
        ? ownerLabel
        : h === "Budget before"
          ? budgetLabel + " before"
          : h === "Budget after"
            ? budgetLabel + " after"
            : h,
      r,
    ],
  );
  const td = "border-b border-[#edf0f4] px-4 py-2 align-middle ";
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[980px] table-fixed border-collapse text-[12px] tabular-nums">
        <colgroup>{cols.map(([h]) => <col key={h} />)}</colgroup>
        <thead>
          <tr>
            {cols.map(([h, right]) => (
              <th
                key={h}
                className={
                  "border-b border-[#d7dce3] px-4 py-2 text-[11px] font-bold text-[#1e3a5f] " +
                  (right ? "text-right" : "text-left")
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                <td className={td + "whitespace-nowrap"}>
                  {dateText(r.date)}
                  {r.time ? " " + r.time : ""}
                </td>
                {showOwner ? (
                  <td className={td + "font-bold"}>{r.owner}</td>
                ) : null}
                <td className={td + "text-right"}>
                  {r.from == null ? "—" : percent(r.from)}
                </td>
                <td className={td + "text-right font-bold"}>{percent(r.to)}</td>
                <td className={td + "text-right"}>
                  {r.before == null ? "—" : money(r.before)}
                </td>
                <td className={td + "text-right"}>{money(r.after)}</td>
                <td className={td}>{r.by}</td>
                <td className={td}>{r.reason || "—"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={cols.length} className="px-3 py-4 text-slate-500">
                No changes in this date range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* =====================================================================
   HR LOGIN
   ===================================================================== */
const HR_COLS = [
  ["Tech ED", false],
  ["Budget base", true],
  ["% applied", true],
  ["Source", false],
  ["Original Budget", true],
  ["Updated Budget", true],
  ["Original Count", true],
  ["Current Count", true],
  ["Last Changed", false],
];


const BUDGET_MASTER_CSS = `
.bm-root{--bm-navy:#102A43;--bm-teal:#2F6FED;--bm-border:#D5DFEB;--bm-muted:#6B7280;width:100%;display:flex;flex-direction:column;gap:12px;padding:12px;background:#F3F4F6;border-radius:10px;color:#111827;font-family:"Manrope","Segoe UI",Arial,sans-serif;font-size:12.5px;font-variant-numeric:tabular-nums}
.bm-root *{box-sizing:border-box}
.bm-root button,.bm-root input{font:inherit}
.bm-root button:focus-visible,.bm-root input:focus-visible{outline:2px solid #2F6FED;outline-offset:2px}
.bm-page-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;padding:2px 2px 4px}
.bm-eyebrow,.bm-section-kicker{font-size:10px;letter-spacing:.09em;font-weight:800;color:#64748b}
.bm-page-head h2{margin:3px 0 4px;color:#102A43;font-size:23px;line-height:1.2;font-weight:800}
.bm-page-head p{margin:0;color:#64748b;font-size:12px;line-height:1.5}
.bm-head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bm-cycle-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid #C9D8EC;background:#E6EEF8;color:#102A43;border-radius:999px;padding:7px 11px;font-weight:700;white-space:nowrap}
.bm-status-dot{display:inline-block;width:7px;height:7px;flex:none;border-radius:50%;background:#159b79}
.bm-status-dot-pending{background:#d97706}
.bm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid transparent;border-radius:6px;padding:8px 13px;font-weight:700;white-space:nowrap;cursor:pointer;transition:background .15s,border-color .15s}
.bm-btn:disabled{opacity:.45;cursor:not-allowed}
.bm-btn-primary{background:#2F6FED;color:#fff;border-color:#2F6FED}
.bm-btn-primary:hover:not(:disabled){background:#2459C5;border-color:#2459C5}
.bm-btn-secondary{background:#fff;color:#102A43;border-color:#CBD5E1}
.bm-btn-secondary:hover:not(:disabled){background:#f4f7fa}
.bm-alert{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border:1px solid;border-radius:7px;padding:10px 12px;line-height:1.5}
.bm-alert-warning{border-color:#f2d27a;background:#fff8e1;color:#7a4b00}
.bm-alert-error{border-color:#e7b5ad;background:#fff5f3;color:#7c2d12}
.bm-alert button{border:0;background:none;font-weight:700;cursor:pointer}
.bm-control-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:12px}
.bm-control-card{min-width:0;border:1px solid #D5DFEB;border-top:3px solid #2F6FED;border-radius:10px;background:#fff;padding:15px 16px;box-shadow:0 1px 2px rgba(16,42,67,.04)}
.bm-tech-control-card{border-top-color:#C9D8EC}
.bm-card-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:13px}
.bm-card-heading h3,.bm-table-heading h3{margin:3px 0 0;font-size:15px;font-weight:750;color:#102A43}
.bm-card-subtitle{color:#64748b;font-size:11px}
.bm-count-chip{border-radius:999px;background:#EEF3FA;color:#102A43;font-weight:800;padding:5px 9px;white-space:nowrap}
.bm-control-row{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
.bm-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.bm-field>span{font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#64748b}
.bm-cycle-field{flex:1 1 180px}
.bm-cycle-value{display:flex;align-items:center;min-height:38px;border:1px solid #d7e0eb;background:#f6f8fb;border-radius:5px;padding:0 10px;color:#102A43;font-weight:700}
.bm-percent-field{flex:0 0 112px}
.bm-percent-control{display:flex;align-items:center;border:1px solid #2F6FED;border-radius:5px;height:38px;padding:0 9px;background:#fff}
.bm-percent-control input{width:100%;min-width:0;border:0;outline:0;text-align:right;font-size:17px;font-weight:800;color:#102A43;background:transparent}
.bm-percent-control input:focus-visible{outline:0}
.bm-percent-control span{padding-left:5px;color:#64748b;font-weight:700}
.bm-org-apply{height:38px}
.bm-helper{margin:12px 0 0;color:#64748b;font-size:11.5px;line-height:1.5}
.bm-tech-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.bm-tech-summary>div{display:flex;flex-direction:column;gap:5px;padding:10px 11px;border:1px solid #e1e7ef;border-radius:7px;background:#F9FAFB}
.bm-tech-summary span{color:#64748b;font-size:11px}
.bm-tech-summary strong{color:#102A43;font-size:17px}
.bm-pending-value{color:#b45309!important}
.bm-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.bm-metric{min-width:0;display:flex;flex-direction:column;gap:5px;border:1px solid #D5DFEB;border-radius:9px;background:#fff;padding:10px 10px;box-shadow:0 1px 2px rgba(16,42,67,.04)}
.bm-metric>span{font-size:10.5px;font-weight:750;letter-spacing:.025em;color:#64748b}
.bm-metric>strong{font-size:clamp(13px,1.12vw,18px);line-height:1.25;color:#102A43;font-weight:800;overflow-wrap:anywhere}
.bm-metric>strong i{font-size:12px;color:#64748b;font-style:normal;margin:0 3px}
.bm-metric>small{font-size:10.5px;line-height:1.35;color:#64748b}
.bm-metric-highlight{border-color:#B9D3F5;background:#DCEBFF;box-shadow:inset 0 3px 0 #2F6FED}
.bm-metric-warning{border-color:#f0c9a2;background:#fff9f1}
.bm-metric-warning>strong{color:#b45309}
.bm-table-card{border:1px solid #D5DFEB;border-radius:10px;background:#fff;overflow:hidden;box-shadow:0 1px 3px rgba(18,48,79,.05)}
.bm-table-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid #e1e7ef}
.bm-table-heading h3 span{display:inline-flex;vertical-align:middle;align-items:center;justify-content:center;min-width:22px;height:22px;margin-left:5px;border-radius:999px;background:#EEF3FA;color:#102A43;font-size:11px}
.bm-table-legend{display:flex;gap:13px;align-items:center;color:#64748b;font-size:11px}
.bm-table-legend span{display:flex;align-items:center;gap:6px}
.bm-table-legend i{width:8px;height:8px;border-radius:50%;display:inline-block}
.bm-legend-default{background:#2F6FED}.bm-legend-override{background:#d97706}
.bm-table-scroll{width:100%;max-height:58vh;overflow:auto}
.bm-table{width:100%;min-width:1100px;border-collapse:separate;border-spacing:0;font-size:12px}
.bm-table thead th{position:sticky;top:0;z-index:2;background:#E6EEF8;color:#102A43;font-weight:800;font-size:11px;letter-spacing:.01em;padding:11px 12px;border-bottom:2px solid #C9D8EC;text-align:left;white-space:nowrap}
.bm-table thead th.bm-align-right{text-align:right}
.bm-table tbody td{padding:10px 12px;border-bottom:1px solid #E5E7EB;vertical-align:middle;background:#fff}
.bm-table tbody tr:nth-child(even) td{background:#F2F5F9}
.bm-table tbody tr:hover td{background:#EAF2FF}
.bm-table tbody tr.bm-pending-row td{background:#fff9e9}
.bm-table .bm-align-right{text-align:right;font-variant-numeric:tabular-nums}
.bm-table .bm-number{white-space:nowrap}
.bm-owner-cell strong{display:block;color:#102A43;font-weight:750;white-space:nowrap}
.bm-owner-cell small,.bm-percent-cell small{display:block;margin-top:3px;color:#a16207;font-size:10px}
.bm-percent-cell>div{display:flex;align-items:center;justify-content:flex-end;gap:4px}
.bm-percent-cell input{width:78px;height:32px;border:1px solid #C9D8EC;border-radius:5px;padding:0 7px;text-align:right;font-weight:800;color:#102A43;background:#fff}
.bm-percent-cell input:disabled{background:#f3f5f8;color:#64748b}
.bm-percent-cell span{color:#64748b;font-weight:700}
.bm-updated-cell{font-weight:800;color:#1559A6}
.bm-source{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.bm-source-default,.bm-source-override{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800;white-space:nowrap}
.bm-source-default{background:#e6f4f4;color:#1559A6}
.bm-source-override{background:#fff1d2;color:#8a5a00}
.bm-text-action{border:0;background:none;color:#1559A6;font-size:10.5px;font-weight:800;cursor:pointer;padding:3px}
.bm-history-btn{border:1px solid #CBD5E1;background:#fff;color:#17365d;border-radius:5px;padding:5px 7px;font-size:11px;font-weight:750;white-space:nowrap}
.bm-audit-row{background:#f7f9fc!important;padding:12px 20px!important}
.bm-empty-row{text-align:center;color:#64748b;padding:35px 14px!important}
.bm-action-bar{position:sticky;bottom:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:rgba(255,255,255,.97);backdrop-filter:blur(8px);padding:12px 15px;border-top:1px solid #dbe3ec}
.bm-pending-status{display:flex;align-items:center;gap:8px;color:#64748b;font-size:12px}
.bm-action-controls{display:flex;align-items:center;gap:8px;flex:1;justify-content:flex-end;flex-wrap:wrap}
.bm-action-controls input{height:35px;min-width:190px;max-width:420px;flex:1;border:1px solid #cbd3df;border-radius:5px;padding:0 10px;font-size:12px}
.bm-footer-note{font-size:10.5px;color:#64748b;padding:0 2px 4px}
.bm-root .bm-audit-row .w-full{min-width:900px}
@media(max-width:1050px){.bm-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.bm-control-grid{grid-template-columns:1fr}}
@media(max-width:760px){.bm-page-head h2{font-size:20px}.bm-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.bm-control-card{padding:12px}.bm-action-bar{align-items:flex-start}.bm-action-controls{justify-content:flex-start}.bm-action-controls input{flex-basis:100%;max-width:none}}
@media(max-width:420px){.bm-root{padding:8px}.bm-metrics{grid-template-columns:1fr}.bm-table-heading{align-items:flex-start}.bm-tech-summary{grid-template-columns:1fr 1fr}}
`;

function HRApplyBudget() {
  const { budgetMasterRows = [], budgetDistributionRows = [], employeeRows = [], techEdOwners = [], updateBudget, reload: reloadBudget, loading: budgetLoading, error: budgetError = "", budgetWarning = "" } = useBudget();
  // Access rules (permissive when accessapi is unavailable).
  const access = useAccess();
  const canConfig =
    access.canScreen("budgetAllocation", "edit") &&
    access.canAction("changeBudgetConfig");
  const canAudit = access.canAction("viewAudit");
  const [rows, setRows] = useState([]);
  const [orgPct, setOrgPct] = useState("");
  const [pending, setPending] = useState({});
  const [staged, setStaged] = useState({});
  const [stagedReasons, setStagedReasons] = useState({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);
  const [history, setHistory] = useState({});
  const [audit, setAudit] = useState([]);
  const [orgAudit, setOrgAudit] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [activeCycle, setActiveCycle] = useState(null);
  const [cycleLoading, setCycleLoading] = useState(true);
  const appraisalCycles = useMemo(
    () => budgetMasterRows.map((row) => ({
      id: String(row.appraisal_cycle_id || ""),
      label: String(row.appraisal_cycle_name || row.appraisal_cycle_id || "Unknown cycle"),
    })).filter((cycle) => cycle.id),
    [budgetMasterRows],
  );
  const [selectedCycle, setSelectedCycle] = useState("");
  const selectedMaster = budgetMasterRows.find(
    (row) => String(row.appraisal_cycle_id) === String(selectedCycle),
  ) || null;

  // Re-read the backend whenever Budget Master is opened, not only when the app provider first mounts.
  useEffect(() => {
    reloadBudget();
  }, [reloadBudget]);

  useEffect(() => {
    let mounted = true;
    payrollCycleRequest("cycles")
      .then((cycles) => {
        if (!mounted) return;
        const active = (Array.isArray(cycles) ? cycles : []).find(
          (cycle) => String(cycle.status || "").trim().toLowerCase() === "active" && !cycle.archived,
        );
        setActiveCycle(active || null);
      })
      .catch((cycleError) => {
        console.error("Failed to load active appraisal cycle:", cycleError);
        if (mounted) setActiveCycle(null);
      })
      .finally(() => {
        if (mounted) setCycleLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (cycleLoading) return;
    setSelectedCycle(activeCycle?.id ? String(activeCycle.id) : "");
  }, [activeCycle, cycleLoading]);

  useEffect(() => {
    const employeeCounts = new Map();
    const employeeBases = new Map();
    const countedEligibleEmployees = new Set();
    const ownerValues = new Map();
    const techOwnerByAlias = new Map();
    // Canonical Tech-Ed identity always comes from the Appraisal_Sheet-derived
    // roster returned by the API. Map the Employee_Master ROWID, employee ID,
    // display label and name to one stable employee-ID key.
    (Array.isArray(techEdOwners) ? techEdOwners : []).forEach((item) => {
      const label = String(item?.assignment || "").trim();
      const id = String(item?.employee_id || "").trim();
      const rowId = String(item?.row_id || item?.ROWID || "").trim();
      const key = normalizeOwnerKey(id || label);
      if (!key) return;
      // Resolve an ID-only Tech-Ed entry back to Employee_Master for display.
      const displayName = String(item?.name || "").trim() ||
        ownerName(label || id || rowId, employeeRows);
      ownerValues.set(key, displayName || label || id || rowId);
      [id, label, rowId, item?.name, displayName].filter(Boolean).forEach((alias) => {
        techOwnerByAlias.set(normalizeOwnerKey(alias), key);
      });
    });
    const resolveTechOwnerKey = (raw) => {
      const text = String(raw || "").trim();
      if (!text) return "";
      const pair = text.match(/^([a-z]*\\d+)\\s*-\\s*(.+)$/i);
      const candidates = [text, pair?.[1], pair?.[2]].filter(Boolean);
      for (const candidate of candidates) {
        const resolved = techOwnerByAlias.get(normalizeOwnerKey(candidate));
        if (resolved) return resolved;
      }
      return canonicalOwnerKey(text, employeeRows);
    };
    (Array.isArray(employeeRows) ? employeeRows : []).forEach((employee) => {
      const assignedOwner = employee.appraiser_tech_ed_appraisal_sheet || "";
      const key = resolveTechOwnerKey(assignedOwner);
      if (!key) return;
      // Budget headcount follows appraisal eligibility, not the total Employee
      // Master roster. Keep status and eligibility independent when both exist.
      const eligibility = String(
        [
          employee.eligibility,
          employee.eligible_status,
          employee.eligibility_status,
          employee.eligible,
        ].find((value) => value !== null && value !== undefined && String(value).trim() !== "") ?? "",
      ).trim().toLowerCase().replace(/[ _-]+/g, "");
      // Budget headcount includes employees only when BOTH Employee Master
      // conditions are satisfied: Active status and Eligible eligibility.
      const status = String(employee.emp_status ?? employee.status ?? employee.employee_status ?? "")
        .trim().toLowerCase();
      const isActive = status === "active";
      const isEligible = ["eligible", "yes", "true", "1"].includes(eligibility);
      const eligible = isActive && isEligible;

      const employeeId = normalizeOwnerKey(
        employee.emp_id || employee.employee_id || employee.employeeId || employee.employee_id_text || "",
      );
      const employeeCountKey = key + "::" + (employeeId || normalizeOwnerKey(employee.row_id || employee.ROWID || employee.id || ""));
      if (eligible && !countedEligibleEmployees.has(employeeCountKey)) {
        employeeCounts.set(key, (employeeCounts.get(key) || 0) + 1);
        countedEligibleEmployees.add(employeeCountKey);
      }

      // Budget Master must use the prior-year expense base calculated by the
      // Budget Master API (previous base pay + previous hike/PB/RB/JB).
      // Do not rebuild it from current annual pay + allocated PB.
      const serverBase = employee.budget_base ?? employee.budgetBase;
      const hasServerBase = serverBase !== null && serverBase !== undefined && String(serverBase).trim() !== "";
      const base = hasServerBase ? amount(serverBase) : (
        amount(employee.previous_year_base_pay ?? employee.previousYearBasePay ?? employee.last_year_base_pay ?? employee.lastYearBasePay ?? employee.previous_annual_base_pay) +
        amount(employee.previous_year_hike_amount ?? employee.previousYearHikeAmount ?? employee.previous_hike_amount ?? employee.last_year_hike_amount) +
        amount(employee.previous_year_performance_bonus ?? employee.previous_year_pb ?? employee.previous_pb ?? employee.pb_to_be_paid ?? employee.pbToBePaid) +
        amount(employee.previous_year_retention_bonus ?? employee.previous_year_rb ?? employee.previous_rb ?? employee.rb_to_be_paid ?? employee.rbToBePaid) +
        amount(employee.previous_year_joining_bonus ?? employee.previous_year_jb ?? employee.previous_joining_bonus ?? employee.joining_bonus_previous_year)
      );
      // Only eligible, active employees contribute to fallback team bases.
      if (eligible) employeeBases.set(key, (employeeBases.get(key) || 0) + base);
    });

    const nextRows = [];
    const seenOwners = new Set();
    (Array.isArray(budgetDistributionRows) ? budgetDistributionRows : [])
      .filter((row) => !selectedCycle || String(row.appraisal_cycle_id) === String(selectedCycle))
      .forEach((row) => {
      const owner = row.appraiser_tech_ed_id || "";
      const key = resolveTechOwnerKey(owner);
      if (!key || !ownerValues.has(key)) return;
      // Multiple legacy records may point to the same Tech-Ed using ROWID,
      // employee ID, or label. Keep one display row per canonical roster key.
      if (seenOwners.has(key)) {
        const existing = nextRows.find((item) => item.canonicalKey === key);
        if (existing) {
          existing.pct = amount(row.percentage);
          existing.base = row.budget_base !== null && row.budget_base !== undefined && String(row.budget_base).trim() !== "" ? amount(row.budget_base) : existing.base;
          existing.original = amount(row.calculated_budget);
          existing.updated = amount(row.applied_budget) || existing.original;
          const originalCountValue = row.original_headcount ?? row.allocation_headcount;
          const currentCountValue = row.current_headcount ?? row.headcount;
          existing.team0 = originalCountValue !== null && originalCountValue !== undefined && String(originalCountValue).trim() !== ""
            ? amount(originalCountValue)
            : (existing.team0 ?? (employeeCounts.get(key) || 0));
          existing.team = currentCountValue !== null && currentCountValue !== undefined && String(currentCountValue).trim() !== ""
            ? amount(currentCountValue)
            : (employeeCounts.get(key) || 0);
          existing.id = row.id || existing.id;
        }
        return;
      }
      const calculated = amount(row.calculated_budget);
      const applied = amount(row.applied_budget) || calculated;
      const assignedCount = employeeCounts.get(key) || 0;
      const originalCountValue = row.original_headcount ?? row.allocation_headcount;
      const currentCountValue = row.current_headcount ?? row.headcount;
      const originalCount = originalCountValue !== null && originalCountValue !== undefined && String(originalCountValue).trim() !== ""
        ? amount(originalCountValue)
        : assignedCount;
      const currentCount = currentCountValue !== null && currentCountValue !== undefined && String(currentCountValue).trim() !== ""
        ? amount(currentCountValue)
        : assignedCount;
      const storedBase = row.budget_base !== null && row.budget_base !== undefined && String(row.budget_base).trim() !== ""
        ? amount(row.budget_base)
        : null;
      nextRows.push({
        id: row.id || "tech-ed-" + key,
        canonicalKey: key,
        name: ownerValues.get(key) || ownerName(owner, employeeRows),
        pct: amount(row.percentage),
        pctSet: row.percentage !== null && row.percentage !== undefined && String(row.percentage).trim() !== "",
        // budgetmasterapi calculates this base from the cycle's eligible roster;
        // prefer it over the all-employee API roster to avoid inflating Org Base.
        base: storedBase !== null ? storedBase : (employeeBases.get(key) || (Number(row.percentage) ? calculated * 100 / Number(row.percentage) : calculated)),
        original: calculated,
        updated: applied,
        team0: originalCount,
        team: currentCount,
        lastChanged: "—",
      });
      seenOwners.add(key);
    });

    // Appraisal Sheet is the source of truth for the Tech-ED assignments.
    // Include every assigned Tech-ED even if no Budget_Distribution row exists yet.
    ownerValues.forEach((owner, key) => {
      if (seenOwners.has(key)) return;
      const label = ownerName(owner, employeeRows);
      nextRows.push({
        id: "tech-ed-" + key,
        canonicalKey: key,
        name: label,
        pct: amount(selectedMaster?.budget_percentage),
        pctSet: false,
        base: employeeBases.get(key) || 0,
        original: selectedMaster?.budget_percentage_is_set ? (employeeBases.get(key) || 0) * (1 + amount(selectedMaster?.budget_percentage) / 100) : 0,
        updated: selectedMaster?.budget_percentage_is_set ? (employeeBases.get(key) || 0) * (1 + amount(selectedMaster?.budget_percentage) / 100) : 0,
        team0: employeeCounts.get(key) || 0,
        team: employeeCounts.get(key) || 0,
        lastChanged: "—",
      });
      seenOwners.add(key);
    });

    nextRows.sort((a, b) => a.name.localeCompare(b.name));
    setRows(nextRows);
    if (selectedMaster?.budget_percentage_is_set) {
      setOrgPct(String(Number(selectedMaster.budget_percentage)));
    } else {
      setOrgPct("");
    }
  }, [budgetDistributionRows, budgetMasterRows, employeeRows, techEdOwners, selectedCycle, selectedMaster?.budget_percentage]);

  // budgetmasterapi calculates this cycle's Org Base from the explicit
  // Eligibility_List decisions. Prefer that authoritative total over the full
  // employee roster or a roll-up that could omit eligible employees without a
  // Tech-Ed assignment. Fall back to unique Tech-Ed bases only if absent.
  const orgBaseFromRoster = useMemo(() => {
    const savedBase = selectedMaster?.org_budget_base;
    if (savedBase !== null && savedBase !== undefined && String(savedBase).trim() !== "") {
      return amount(savedBase);
    }
    return rows.reduce((sum, row) => sum + amount(row.base), 0);
  }, [selectedMaster?.org_budget_base, rows]);

  const total = useMemo(
    () =>
      rows.reduce(
        (s, r) => ({
          base: s.base + r.base,
          original: s.original + r.original,
          updated: s.updated + r.updated,
          team0: s.team0 + r.team0,
          team: s.team + r.team,
        }),
        { base: 0, original: 0, updated: 0, team0: 0, team: 0 },
      ),
    [rows],
  );

  // Org headcount comes from the same cycle-scoped eligibility calculation as
  // Org Budget Base. Fall back to the Tech-Ed roll-up only for older schemas.
  const orgOriginalCountValue = selectedMaster?.original_headcount ?? selectedMaster?.allocation_headcount;
  const orgCurrentCountValue = selectedMaster?.current_headcount ?? selectedMaster?.headcount;
  const orgOriginalCount = orgOriginalCountValue !== null && orgOriginalCountValue !== undefined && String(orgOriginalCountValue).trim() !== ""
    ? amount(orgOriginalCountValue)
    : total.team0;
  const orgCurrentCount = orgCurrentCountValue !== null && orgCurrentCountValue !== undefined && String(orgCurrentCountValue).trim() !== ""
    ? amount(orgCurrentCountValue)
    : total.team;

  // Saved Tech-Ed percentages remain independent of future Org % changes.
  const previewPct = (row) => {
    if (Object.prototype.hasOwnProperty.call(pending, row.name)) return Number(pending[row.name]);
    if (Object.prototype.hasOwnProperty.call(staged, row.name)) return Number(staged[row.name]);
    // An unset Tech-Ed percentage inherits the Org % on first allocation.
    if (!row.pctSet) return orgPct !== "" ? amount(orgPct) : amount(selectedMaster?.budget_percentage);
    return amount(row.pct);
  };

  const previewBudget = (row) => row.base * (1 + previewPct(row) / 100);
  // The API exposes org_budget_base as the LIVE eligible prior-cycle CTC sum.
  // calculated_budget is the original budget captured on the first applied Org %;
  // do not invalidate that snapshot just because payroll/eligibility changed later.
  const savedOrgBase = amount(selectedMaster?.org_budget_base);
  const savedOrgOriginal = amount(selectedMaster?.calculated_budget);
  const hasValidOrgSnapshot = Boolean(selectedMaster?.budget_percentage_is_set) &&
    savedOrgOriginal >= 0;
  const orgBase = orgBaseFromRoster;
  const effectiveOrgPct = orgPct === "" ? amount(selectedMaster?.budget_percentage) : amount(orgPct);
  const orgPctEntered = Boolean(selectedMaster?.budget_percentage_is_set) || orgPct !== "";
  const previewOrgBudget = orgPctEntered ? orgBase * (1 + effectiveOrgPct / 100) : 0;
  const originalOrgBudget = hasValidOrgSnapshot
    ? savedOrgOriginal
    : (orgPctEntered ? orgBase * (1 + effectiveOrgPct / 100) : 0);
  const orgPending = orgPct !== "" && !!selectedMaster && amount(orgPct) !== Number(selectedMaster.budget_percentage || 0);
  const draftCount = rows.filter((row) =>
    Object.prototype.hasOwnProperty.call(pending, row.name) &&
    Number(pending[row.name]) !== Number(staged[row.name] ?? row.pct),
  ).length;
  const stagedCount = rows.filter((row) =>
    Object.prototype.hasOwnProperty.call(staged, row.name) &&
    Number(staged[row.name]) !== Number(row.pct),
  ).length;
  const pendingCount = draftCount + (orgPending ? 1 : 0);
  const previewTotal = rows.reduce((s, r) => s + previewBudget(r), 0);

  async function applyOrgPercentage() {
    const org = Number(orgPct);
    const cycleId = String(selectedCycle || activeCycle?.id || activeCycle?.appraisal_cycle_id || activeCycle?.ROWID || "").trim();
    if (!cycleId) {
      setError("Select an appraisal cycle before applying the Org %.");
      return;
    }
    if (!Number.isFinite(org) || org < 0 || org > 100) {
      setError("Enter a valid Org % between 0 and 100.");
      return;
    }
    if (draftCount || stagedCount) {
      setError("Apply, publish, or discard Tech-Ed edits before changing the organization percentage.");
      return;
    }
    setSavingOrg(true);
    setError("");
    const orgBase = orgBaseFromRoster;
    const originalBudget = hasValidOrgSnapshot
      ? savedOrgOriginal
      : orgBase * (1 + org / 100);
    const updatedBudget = orgBase * (1 + org / 100);
    const previousOrgPct = amount(selectedMaster?.budget_percentage);
    try {
      await updateBudget(selectedMaster?.id || "", {
        appraisal_cycle_id: cycleId,
        budget_percentage: org,
        org_budget_base: orgBase,
        calculated_budget: originalBudget,
        applied_budget: updatedBudget,
        budget_utilized: amount(selectedMaster?.budget_utilized),
      }, "master", false);
      // Update inherited Tech-Ed rows only. A separately configured override must
      // remain untouched when HR changes the organization default.
      const inheritedRows = rows.filter((row) =>
        !row.pctSet || Math.abs(amount(row.pct) - previousOrgPct) < 0.0001,
      );
      await Promise.all(inheritedRows.map((row) => updateBudget(
        row.id && !String(row.id).startsWith("tech-ed-") ? row.id : "",
        {
          appraisal_cycle_id: cycleId,
          appraiser_tech_ed_id: String(row.canonicalKey || row.name || "").trim().split(/\s+-\s+/)[0].slice(0, 20),
          percentage: org,
          budget_base: row.base,
          calculated_budget: row.original || row.base * (1 + org / 100),
          applied_budget: row.base * (1 + org / 100),
        },
        "distribution",
        false,
      )));
      await reloadBudget();
    } catch (saveError) {
      setError(saveError.message || "Org % and appraisal cycle could not be saved.");
    } finally {
      setSavingOrg(false);
    }
  }

  function setRowPct(name, value) {
    setPending((p) => ({ ...p, [name]: value }));
  }

  function resetRow(name) {
    const value = orgPct;
    const row = rows.find((r) => r.name === name);
    if (Number(value) === row?.pct) {
      setPending((p) => {
        const n = { ...p };
        delete n[name];
        return n;
      });
      setOverrides((o) => {
        const n = { ...o };
        delete n[name];
        return n;
      });
    } else {
      setPending((p) => ({ ...p, [name]: value }));
    }
  }

  function discard() {
    setPending({});
    setStaged({});
    setStagedReasons({});
    setReason("");
    setError("");
  }

  async function apply() {
    if (!draftCount) {
      setError("Make a Tech-Ed percentage change before selecting Apply changes.");
      return;
    }
    const invalid = rows.find((row) => {
      const value = previewPct(row);
      return !Number.isFinite(value) || value < 0 || value > 100;
    });
    if (invalid) {
      setError("Not applied. " + invalid.name + ": enter a valid percentage between 0 and 100.");
      return;
    }

    const org = orgPct !== "" ? amount(orgPct) : amount(selectedMaster?.budget_percentage);
    const available = orgBaseFromRoster * (1 + org / 100);
    if (previewTotal > available + 0.5) {
      setError(
        "Not applied. Tech-Ed Updated Budgets total " + money(previewTotal) +
        ", which exceeds the Org Updated Budget of " + money(available) + ". Reduce one or more Tech-Ed percentages.",
      );
      return;
    }

    const now = new Date().toISOString().slice(0, 10);
    const updates = rows.filter((row) => Object.prototype.hasOwnProperty.call(pending, row.name));
    setStaged((previous) => {
      const next = { ...previous };
      updates.forEach((row) => { next[row.name] = Number(pending[row.name]); });
      return next;
    });
    setStagedReasons((previous) => {
      const next = { ...previous };
      updates.forEach((row) => {
        next[row.name] = reason.trim() || (Number(pending[row.name]) === org ? "Reset to org %" : "Override");
      });
      return next;
    });
    setAudit((previous) => {
      const byOwner = new Map(previous.map((item) => [item.owner, item]));
      updates.forEach((row) => byOwner.set(row.name, {
        date: now,
        owner: row.name,
        from: row.pct,
        to: Number(pending[row.name]),
        before: row.updated,
        after: row.base * (1 + Number(pending[row.name]) / 100),
        by: "HR",
        reason: reason.trim() || (Number(pending[row.name]) === org ? "Reset to org %" : "Override"),
      }));
      return Array.from(byOwner.values());
    });
    setPending({});
    setReason("");
    setError("");
    // Apply is intentionally a staging step; the database changes only on Publish.
    // Reload server data after Apply as requested, without dropping the staged preview.
    await reloadBudget();
  }

  async function publishChanges() {
    if (!stagedCount) {
      setError("Apply at least one percentage change before publishing.");
      return;
    }
    if (draftCount) {
      setError("Apply pending edits before publishing staged changes.");
      return;
    }
    const cycleId = String(selectedCycle || activeCycle?.id || activeCycle?.appraisal_cycle_id || activeCycle?.ROWID || "").trim();
    if (!cycleId) {
      setError("Select an appraisal cycle before publishing budget changes.");
      return;
    }
    setSavingOrg(true);
    setError("");
    try {
      const toPublish = rows.filter((row) => Object.prototype.hasOwnProperty.call(staged, row.name));
      await Promise.all(toPublish.map((row) => {
        const pct = Number(staged[row.name]);
        const budget = row.base * (1 + pct / 100);
        return updateBudget(
          row.id && !String(row.id).startsWith("tech-ed-") ? row.id : "",
          {
            appraisal_cycle_id: cycleId,
            appraiser_tech_ed_id: String(row.canonicalKey || row.name || "").trim().split(/\\s+-\\s+/)[0].slice(0, 20),
            percentage: pct,
            budget_base: row.base,
            calculated_budget: String(row.id || "").startsWith("tech-ed-")
              ? budget
              : (row.original || budget),
            applied_budget: budget,
            change_reason: stagedReasons[row.name] || "Budget percentage published",
          },
          "distribution",
          false,
        );
      }));
      await reloadBudget();
      setOverrides((previous) => {
        const next = { ...previous };
        toPublish.forEach((row) => {
          if (Number(staged[row.name]) === amount(orgPct !== "" ? orgPct : selectedMaster?.budget_percentage)) delete next[row.name];
          else next[row.name] = true;
        });
        return next;
      });
      setStaged({});
      setStagedReasons({});
      setPending({});
      setReason("");
      setError("");
    } catch (saveError) {
      setError(saveError.message || "Budget changes could not be published.");
    } finally {
      setSavingOrg(false);
    }
  }

  const displayedOrgUpdated = orgPending
    ? previewOrgBudget
    : amount(selectedMaster?.applied_budget) || previewOrgBudget;
  const displayedUtilized = amount(selectedMaster?.budget_utilized ?? selectedMaster?.total_utilization);
  const availableAfterAllocation = displayedOrgUpdated - previewTotal;

  return (
    <div className="bm-root">
      <style>{BUDGET_MASTER_CSS}</style>
      <div className="bm-page-head">
        <div>
          <div className="bm-eyebrow">COMPENSATION MANAGEMENT</div>
          <h2>Budget Master</h2>
          <p>Review the organization budget and manage Tech-Ed allocations for the active appraisal cycle.</p>
        </div>
        <div className="bm-head-actions">
          <span className="bm-cycle-chip">
            <span className="bm-status-dot" />
            {cycleLoading ? "Loading cycle…" : activeCycle?.name || selectedMaster?.appraisal_cycle_name || "No active cycle"}
          </span>
          <button type="button" className="bm-btn bm-btn-secondary" onClick={() => reloadBudget()} disabled={budgetLoading}>
            {budgetLoading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {budgetError || budgetWarning ? (
        <div role="alert" className="bm-alert bm-alert-warning">
          {budgetError ? <div><b>Budget data could not be loaded:</b> {budgetError}</div> : null}
          {budgetWarning ? <div><b>Budget base:</b> {budgetWarning}</div> : null}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="bm-alert bm-alert-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>Dismiss ×</button>
        </div>
      ) : null}

      <div className="bm-control-grid">
        <section className={"bm-control-card" + (orgPending ? " bm-card-pending" : "")}>
          <div className="bm-card-heading">
            <div>
              <span className="bm-section-kicker">ORGANIZATION</span>
              <h3>Org budget</h3>
            </div>
            <span className="bm-card-subtitle">Applies the default percentage</span>
          </div>
          <div className="bm-control-row">
            <label className="bm-field bm-cycle-field">
              <span>Appraisal cycle</span>
              <div className="bm-cycle-value" title={activeCycle?.name || "No active cycle"}>
                {cycleLoading ? "Loading…" : activeCycle?.name || selectedMaster?.appraisal_cycle_name || "No active cycle"}
              </div>
            </label>
            <label className="bm-field bm-percent-field">
              <span>Org %</span>
              <div className="bm-percent-control">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={orgPct}
                  disabled={!canConfig || savingOrg}
                  onChange={(e) => setOrgPct(e.target.value)}
                  aria-label="Organization budget percentage"
                />
                <span>%</span>
              </div>
            </label>
            <button
              type="button"
              className="bm-btn bm-btn-primary bm-org-apply"
              disabled={!canConfig || savingOrg || cycleLoading || !activeCycle}
              onClick={applyOrgPercentage}
            >
              {savingOrg ? "Saving…" : "Apply org %"}
            </button>
          </div>
          <p className="bm-helper">The original budget is captured on the first valid percentage. Later percentage changes update the updated-budget value.</p>
        </section>

        <section className="bm-control-card bm-tech-control-card">
          <div className="bm-card-heading">
            <div>
              <span className="bm-section-kicker">TECH-ED ALLOCATION</span>
              <h3>Team percentages</h3>
            </div>
            <span className="bm-count-chip">{rows.length} Tech-Ed{rows.length === 1 ? "" : "s"}</span>
          </div>
          <div className="bm-tech-summary">
            <div>
              <span>Pending changes</span>
              <strong className={pendingCount ? "bm-pending-value" : ""}>{pendingCount}</strong>
            </div>
            <div>
              <span>Default percentage</span>
              <strong>{orgPct === "" ? "Not set" : percent(orgPct)}</strong>
            </div>
          </div>
          <p className="bm-helper">A Tech-Ed can inherit the organization percentage or use an override. Use the action bar below to save pending changes.</p>
        </section>
      </div>

      <section className="bm-metrics" aria-label="Organization budget summary">
        <div className="bm-metric">
          <span>Org budget base</span>
          <strong>{money(orgBase)}</strong>
          <small>Eligible employees’ previous appraisal CTC</small>
        </div>
        <div className="bm-metric">
          <span>Original budget</span>
          <strong>{money(originalOrgBudget)}</strong>
          <small>First applied percentage</small>
        </div>
        <div className="bm-metric bm-metric-highlight">
          <span>Updated budget</span>
          <strong>{money(displayedOrgUpdated)}</strong>
          <small>{orgPending ? "Preview — not yet saved" : "Current organization allocation"}</small>
        </div>
        <div className="bm-metric">
          <span>Allotted to Tech EDs</span>
          <strong>{displayedOrgUpdated > 0 ? percent((previewTotal / displayedOrgUpdated) * 100) : "—"}</strong>
          <small>{money(previewTotal)} allotted · {availableAfterAllocation < -0.5 ? "Over by " : "Balance "}{money(Math.abs(availableAfterAllocation))}</small>
        </div>
        <div className="bm-metric">
          <span>Team count</span>
          <strong>{orgOriginalCount} <i>→</i> {orgCurrentCount}</strong>
          <small>Original to current eligible employees</small>
        </div>
        <div className="bm-metric">
          <span>Budget utilised</span>
          <strong>{displayedOrgUpdated > 0 ? percent((displayedUtilized / displayedOrgUpdated) * 100) : "—"}</strong>
          <small>{money(displayedUtilized)} used of {money(displayedOrgUpdated)}</small>
        </div>
      </section>

      <section className="bm-table-card">
        <div className="bm-table-heading">
          <div>
            <span className="bm-section-kicker">BUDGET DISTRIBUTION</span>
            <h3>Tech-Ed budgets <span>{rows.length}</span></h3>
          </div>
          <div className="bm-table-legend">
            <span><i className="bm-legend-default" /> Org default</span>
            <span><i className="bm-legend-override" /> Override</span>
          </div>
        </div>
        <div className="bm-table-scroll">
          <table className="bm-table">
            <thead>
              <tr>
                {HR_COLS.map(([h, right]) => (
                  <th key={h} className={right ? "bm-align-right" : ""}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((r) => {
                const p = previewPct(r);
                const changing = Number(p) !== r.pct;
                const open = !!history[r.name];
                const rowAudit = audit.filter((a) => a.owner === r.name);
                const sourceOverride =
                  overrides[r.name] ||
                  (Object.prototype.hasOwnProperty.call(pending, r.name) &&
                    Number(p) !== amount(orgPct));
                const tdClass = changing ? "bm-pending-row" : "";
                return (
                  <FragmentRow key={r.name}>
                    <tr className={tdClass}>
                      <td className="bm-owner-cell">
                        <strong>{r.name}</strong>
                        {changing ? <small>{Object.prototype.hasOwnProperty.call(pending, r.name) ? "Pending edit" : "Applied · not published"}</small> : null}
                      </td>
                      <td className="bm-align-right bm-number">{money(r.base)}</td>
                      <td className="bm-percent-cell">
                        <div>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={p}
                            disabled={!canConfig}
                            onChange={(e) => setRowPct(r.name, e.target.value)}
                            aria-label={"Percentage for " + r.name}
                          />
                          <span>%</span>
                        </div>
                        {changing ? <small>was {r.pct}%</small> : null}
                      </td>
                      <td>
                        {sourceOverride ? (
                          <div className="bm-source">
                            <span className="bm-source-override">Override</span>
                            <button type="button" className="bm-text-action" onClick={() => resetRow(r.name)}>Reset to org %</button>
                          </div>
                        ) : <span className="bm-source-default">Org default</span>}
                      </td>
                      <td className="bm-align-right bm-number">{money(r.original)}</td>
                      <td className="bm-align-right bm-number bm-updated-cell">{money(r.updated)}</td>
                      <td className="bm-align-right bm-number">{r.team0}</td>
                      <td className="bm-align-right bm-number">{r.team}</td>
                      <td>
                        {canAudit && (open || rowAudit.length > 0) ? (
                          <button
                            type="button"
                            className="bm-history-btn"
                            aria-expanded={open}
                            onClick={() => setHistory((x) => ({ ...x, [r.name]: !x[r.name] }))}
                          >
                            {r.lastChanged} {open ? "▴" : "▾"}
                          </button>
                        ) : <span className="bm-muted">—</span>}
                      </td>
                    </tr>
                    {open && canAudit ? (
                      <tr>
                        <td colSpan={HR_COLS.length} className="bm-audit-row">
                          <AuditTable rows={rowAudit} />
                        </td>
                      </tr>
                    ) : null}
                  </FragmentRow>
                );
              }) : (
                <tr><td colSpan={HR_COLS.length} className="bm-empty-row">
                  {budgetLoading ? "Loading Tech-Ed budget rows…" : "No Tech-Ed assignments were found for this appraisal cycle."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bm-action-bar">
          <div className="bm-pending-status">
            <span className={pendingCount || stagedCount ? "bm-status-dot bm-status-dot-pending" : "bm-status-dot"} />
            <span>{pendingCount ? pendingCount + " pending edit" + (pendingCount === 1 ? "" : "s") : stagedCount ? stagedCount + " applied, not published" : "No pending changes"}</span>
          </div>
          {canConfig ? (
            <div className="bm-action-controls">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!pendingCount}
                placeholder="Reason for change (optional)"
                aria-label="Reason for budget changes"
              />
              <button type="button" className="bm-btn bm-btn-secondary" disabled={!pendingCount && !stagedCount} onClick={discard}>Discard</button>
              <button type="button" className="bm-btn bm-btn-secondary" disabled={!draftCount || savingOrg} onClick={apply}>Apply changes</button>
              <button type="button" className="bm-btn bm-btn-primary" disabled={!stagedCount || draftCount > 0 || savingOrg} onClick={publishChanges}>{savingOrg ? "Publishing…" : "Publish all"}</button>
            </div>
          ) : null}
        </div>
      </section>
      <div className="bm-footer-note">Apply stages Tech-Ed percentage changes for review. Publish all saves staged changes to the Budget Master API. Data refreshes after Apply, Publish, and when this screen is reopened.</div>
    </div>
  );
}

/* tbody can hold several <tr> per item; a fragment keeps the table valid. */
function FragmentRow({ children }) {
  return <>{children}</>;
}

function HRAuditTrail() {
  const { techEdOwners = [], employeeRows = [] } = useBudget();
  // The Tech-Ed filter must come from the budget roster. The old screen
  // referenced an undefined local variable named "rows" and crashed on mount.
  const rows = useMemo(() => {
    const seen = new Set();
    return techEdOwners.map((item) => {
      const value = ownerName(item.assignment || item.name || item.employee_id || item.row_id, employeeRows);
      return { name: value };
    }).filter((item) => {
      const key = normalizeOwnerKey(item.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [techEdOwners, employeeRows]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState("all");
  const [audit] = useState([]);
  const [orgAudit] = useState([]);

  const orgRows = orgAudit.filter(
    (r) => (!from || r.date >= from) && (!to || r.date <= to),
  );
  const tedRows = audit.filter(
    (r) =>
      (!from || r.date >= from) &&
      (!to || r.date <= to) &&
      (filter === "all" || r.owner === filter),
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        className="rounded-[10px] border bg-white"
        style={{ borderColor: BORDER }}
      >
        <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-[12px] text-slate-600">
          <label>
            From{" "}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="ml-1 h-7 max-w-[150px] rounded border border-[#cbd3df] px-2"
            />
          </label>
          <label>
            To{" "}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="ml-1 h-7 max-w-[150px] rounded border border-[#cbd3df] px-2"
            />
          </label>
          <span className="ml-auto text-[11px]">
            Audit lines can't be edited or deleted
          </span>
        </div>
      </div>
      <section
        className="overflow-hidden rounded-[10px] border bg-white"
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Org % — audit trail
        </div>
        <div className="p-3.5">
          <AuditTable
            rows={orgRows}
            showOwner={false}
            budgetLabel="Org budget"
          />
        </div>
      </section>
      <section
        className="overflow-hidden rounded-[10px] border bg-white"
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Tech ED % — audit trail
        </div>
        <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-3.5 py-2 text-[12px]">
          <label>
            Tech ED
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="ml-2 h-7 rounded border border-[#cbd3df] px-2"
            >
              <option value="all">All</option>
              {rows.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="p-3.5">
          <AuditTable rows={tedRows} ownerLabel="Tech ED" />
        </div>
      </section>
    </div>
  );
}

/* =====================================================================
   PAGE SWITCH
   ===================================================================== */
export function BudgetMasterPage() {
  const user = useCatalystUser();
  const role = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isHR =
    role === "hr" || role === "humanresources" || role === "hroperation";
  const canAudit = useAccess().canAction("viewAudit");
  const [tab, setTab] = useState("apply");

  return (
    <div
      className="w-full"
      style={{
        fontFamily: '"IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif',
        fontVariantNumeric: "tabular-nums",
        color: "#0f1f33",
      }}
    >
      {isHR ? (
        <>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setTab("apply")}
              className={
                "rounded-2xl border px-4 py-1.5 text-[12px] font-medium " +
                (tab === "apply"
                  ? "border-[#2F6FED] bg-[#2F6FED] font-semibold text-white"
                  : "bg-white text-[#334155]")
              }
            >
               Apply Budget
            </button>
            {canAudit && <button
              type="button"
              onClick={() => setTab("audit")}
              className={
                "rounded-2xl border px-4 py-1.5 text-[12px] font-medium " +
                (tab === "audit"
                  ? "border-[#2F6FED] bg-[#2F6FED] font-semibold text-white"
                  : "bg-white text-[#334155]")
              }
            >
               Audit Trail
            </button>}
          </div>
          {tab === "apply" || !canAudit ? <HRApplyBudget /> : <HRAuditTrail />}
        </>
      ) : (
        <TechEdBudgetMasterPage />
      )}
    </div>
  );
}

export { TechEdBudgetMasterPage };