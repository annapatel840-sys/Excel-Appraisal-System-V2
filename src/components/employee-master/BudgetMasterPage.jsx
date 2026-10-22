import { useEffect, useMemo, useState } from "react";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import { useBudget } from "@/lib/budget-store";
import { TechEdBudgetMasterPage } from "./TechEdBudgetMasterPage";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

const NAVY = "#102A43";
const TEAL = "#2F6FED";
const BORDER = "#D5DFEB";
const BUDGET_AUDIT_STORAGE_KEY = "excel-appraisal-budget-audit-v1";

function readBudgetAudit() {
  if (typeof window === "undefined") return { org: [], techEd: [] };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BUDGET_AUDIT_STORAGE_KEY) || "{}");
    return {
      org: Array.isArray(parsed.org) ? parsed.org : [],
      techEd: Array.isArray(parsed.techEd) ? parsed.techEd : [],
    };
  } catch (_) {
    return { org: [], techEd: [] };
  }
}

function recordBudgetAudit(kind, entries) {
  if (typeof window === "undefined" || !Array.isArray(entries) || !entries.length) return;
  try {
    const current = readBudgetAudit();
    const key = kind === "org" ? "org" : "techEd";
    current[key] = [...entries, ...current[key]].slice(0, 2000);
    window.localStorage.setItem(BUDGET_AUDIT_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent("appraisal:budget-audit-updated"));
  } catch (error) {
    // Audit-storage restrictions must not misreport a successfully saved budget as failed.
    console.error("Could not persist local budget audit history:", error);
  }
}

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
  ["% applied", false],
  ["Budget", true],
  ["Original", true],
  ["Updated", true],
  ["Original count", true],
  ["Current count", true],
  ["Reason", false],
  ["Update", false],
  ["Last changed", false],
];

const BUDGET_MASTER_CSS = `
.bm-root{--ink:#111827;--muted:#6B7280;--navy:#102A43;--link:#1559A6;--line:#E5E7EB;--th-bg:#E6EEF8;--th-line:#C9D8EC;--row-odd:#FBFCFE;--row-even:#F2F5F9;--row-hover:#EAF2FF;--rl-bg:#EEF3FA;--info-bg:#DCEBFF;--info-border:#B9D3F5;--info:#1D4FA8;--main:#2F6FED;--edited:#FFE066;--edited-border:#C9A400;--err:#C0392B;--ok:#15803D;width:100%;padding:12px;background:#D5DFEB;border-radius:14px;color:var(--ink);font-family:"Manrope","Segoe UI",Arial,sans-serif;font-size:12.5px;font-variant-numeric:tabular-nums}
.bm-root *{box-sizing:border-box}
.bm-root button,.bm-root input{font:inherit;color:inherit}
.bm-root button:focus-visible,.bm-root input:focus-visible{outline:2px solid #2F6FED;outline-offset:2px}
.bm-root input[type=number]{-moz-appearance:textfield;appearance:textfield}
.bm-root input[type=number]::-webkit-outer-spin-button,.bm-root input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.bm-sheet{display:flex;flex-direction:column;gap:12px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px 0;overflow:hidden}
.bm-mut{color:var(--muted)}.bm-dn{color:var(--err)}.bm-up{color:var(--ok)}

.bm-alert{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border:1px solid;border-radius:8px;padding:9px 12px;line-height:1.45;font-weight:600}
.bm-alert-warning{border-color:#f2d27a;background:#fff8e1;color:#7a4b00}
.bm-alert-error{border-color:#e7b5ad;background:#fff5f3;color:#7c2d12}
.bm-alert button{border:0;background:none;font-weight:700;cursor:pointer}

.bm-pans{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.bm-pan{min-width:0;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#fff}
.bm-pan-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px;font-size:12.5px}
.bm-pan-head b{color:var(--navy);font-size:13px}
.bm-pan-row{display:flex;align-items:flex-end;gap:10px}
.bm-pan-row label{display:block}
.bm-pan-row label.bm-grow{flex:1;min-width:0}
.bm-pan-row small{display:block;margin-bottom:3px;color:var(--muted);font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.bm-hint{flex:1 1 auto;min-width:0;padding-bottom:9px;color:var(--muted);font-size:11.5px}

.bm-pin{width:84px;border:1px solid #9CA3AF;border-radius:5px;padding:5px 8px;background:#fff;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.bm-pin:disabled{background:#F3F4F6;color:#9CA3AF;cursor:not-allowed}
.bm-pin-big{height:34px;width:84px;font-size:16px;font-weight:800;color:var(--navy)}
.bm-pin::placeholder{color:#9CA3AF;font-weight:600}
.bm-pin.ed{background:var(--edited);border-color:var(--edited-border)}
.bm-txt{width:100%;min-width:0;height:34px;border:1px solid #D1D5DB;border-radius:6px;padding:6px 10px;background:#fff}
.bm-txt:disabled{background:#F3F4F6;color:#9CA3AF;cursor:not-allowed}
.bm-txt::placeholder{color:#9CA3AF}

.bm-btn{display:inline-flex;align-items:center;justify-content:center;height:34px;border:1px solid #D1D5DB;background:#fff;border-radius:6px;padding:6px 12px;font-weight:700;white-space:nowrap;cursor:pointer}
.bm-btn:hover:not(:disabled){background:#F9FAFB}
.bm-btn:disabled{opacity:.45;cursor:not-allowed}
.bm-btn-main{background:var(--main);border-color:var(--main);color:#fff;font-weight:800;text-transform:uppercase;letter-spacing:.03em}
.bm-btn-main:hover:not(:disabled){background:#2560d4}

.bm-tiles{display:flex;gap:8px;flex-wrap:wrap}
.bm-tile{flex:1;min-width:110px;border:1px solid var(--line);border-radius:10px;padding:7px 10px;background:#fff}
.bm-tile small{display:block;color:var(--muted);font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.bm-tile b{display:block;margin-top:2px;color:var(--navy);font-size:15px;font-weight:800;font-variant-numeric:tabular-nums}
.bm-tile em{display:block;margin-top:2px;font-style:normal;font-size:10.5px;font-weight:700}
.bm-tile-hl{background:var(--info-bg);border-color:var(--info-border)}

.bm-chip{align-self:flex-start;display:inline-block;background:var(--th-bg);color:var(--navy);border:1px solid var(--th-line);border-radius:5px;padding:3px 9px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}

.bm-tw{border:1px solid var(--th-line);border-radius:8px;overflow:auto;max-height:58vh}
.bm-table{width:100%;border-collapse:collapse}
.bm-table th{position:sticky;top:0;z-index:2;background:var(--th-bg);color:var(--navy);font-size:10.5px;font-weight:700;text-align:left;padding:9px 11px;border-bottom:1px solid var(--th-line);vertical-align:bottom;line-height:1.25;white-space:normal}
.bm-table td{padding:8px 11px;border-bottom:1px solid #F0F1F3;white-space:nowrap;font-variant-numeric:tabular-nums}
.bm-table .bm-n{text-align:right}
.bm-table tbody tr:nth-child(odd) td{background:var(--row-odd)}
.bm-table tbody tr:nth-child(even) td{background:var(--row-even)}
.bm-table tbody tr.bm-data:hover td{background:var(--row-hover)}
.bm-table td.bm-rl{background:var(--rl-bg)!important;color:var(--navy);font-weight:700;border-right:1px solid var(--th-line)}
.bm-table td.bm-in{background:#FFF9DC!important}
.bm-table tr.bm-edrow td.bm-rl{box-shadow:inset 4px 0 0 var(--edited-border)}
.bm-table tr.bm-sub>td{background:#fff!important;padding:0}
.bm-table tr.bm-tot td{background:var(--th-bg)!important;color:var(--navy);font-weight:800;border-top:1px solid var(--th-line)}
.bm-table td.bm-calc{font-weight:800;color:var(--info)}
.bm-tag{color:var(--muted);font-weight:500}
.bm-empty{padding:16px!important;color:var(--muted);text-align:left}
.bm-pin-cell{display:flex;align-items:center}
.bm-table .bm-pin{width:84px}
.bm-table .bm-pin.bad{border-color:var(--err);outline:1px solid var(--err)}
.bm-reason{width:150px;height:28px;font-size:12px}
.bm-ract{white-space:nowrap}
.bm-hbtn{border:1px solid #D1D5DB;border-radius:12px;padding:2px 9px;font-size:11px;color:#4B5563;background:#fff;cursor:pointer}
.bm-hbtn:disabled{opacity:.4;cursor:default}
.bm-hbtn-pub:not(:disabled){background:var(--navy);color:#fff;border-color:var(--navy)}
.bm-source{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px}
.bm-source-override{display:inline-flex;align-items:center;border-radius:5px;padding:2px 8px;font-size:11px;font-weight:700;background:#FEF6E7;color:#B7791F}
.bm-text-action{border:0;background:none;color:var(--link);font-size:11px;font-weight:600;cursor:pointer;padding:0 0 0 2px}
.bm-hist{padding:10px 14px;background:#fff}
.bm-root .bm-hist .w-full{min-width:900px}

.bm-foot{margin:0 -16px;padding:12px 16px;border-top:1px solid var(--info-border);background:var(--info-bg);color:var(--info);font-weight:700}

@media(max-width:1050px){.bm-pans{grid-template-columns:1fr}}
@media(max-width:760px){.bm-root{padding:8px}.bm-sheet{padding:12px 12px 0}.bm-foot{margin:0 -12px}.bm-pan-row{flex-wrap:wrap}}
`;

function deltaNode(from, to) {
  const d = to - from;
  if (Math.round(d) === 0) return <em className="bm-mut">no change</em>;
  const down = d < 0;
  return (
    <em className={down ? "bm-dn" : "bm-up"}>
      {down ? "▼" : "▲"} {money(Math.abs(d))} ({(Math.abs(d) / (from || 1) * 100).toFixed(2)}%)
    </em>
  );
}

function HRApplyBudget() {
  const { budgetMasterRows = [], budgetDistributionRows = [], employeeRows = [], techEdOwners = [], currentUser = {}, updateBudget, reload: reloadBudget, loading: budgetLoading, error: budgetError = "", budgetWarning = "" } = useBudget();
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
  // UI-only state: org-level reason, per-row reasons and the "% for all" field.
  const [orgReason, setOrgReason] = useState("");
  const [rowReasons, setRowReasons] = useState({});
  const [allPct, setAllPct] = useState("");
  const [error, setError] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);
  const [history, setHistory] = useState({});
  const [auditState, setAuditState] = useState(() => readBudgetAudit());
  useEffect(() => {
    const refreshAudit = () => setAuditState(readBudgetAudit());
    refreshAudit();
    if (typeof window !== "undefined") {
      window.addEventListener("appraisal:budget-audit-updated", refreshAudit);
      window.addEventListener("storage", refreshAudit);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("appraisal:budget-audit-updated", refreshAudit);
        window.removeEventListener("storage", refreshAudit);
      }
    };
  }, []);
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
      const inAppraisalSheet = employee.in_appraisal_sheet === true ||
        String(employee.in_appraisal_sheet ?? "").trim().toLowerCase() === "true" ||
        String(employee.in_appraisal_sheet ?? "").trim() === "1";
      const employeeCountKey = key + "::" + (employeeId || normalizeOwnerKey(employee.row_id || employee.ROWID || employee.id || ""));
      if (eligible && inAppraisalSheet && !countedEligibleEmployees.has(employeeCountKey)) {
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
          existing.team0 = amount(originalCountValue) > 0
            ? amount(originalCountValue)
            : (existing.team0 || employeeCounts.get(key) || 0);
          // Current count is live, not a potentially stale saved count.
          existing.team = employeeCounts.get(key) || 0;
          existing.id = row.id || existing.id;
        }
        return;
      }
      const calculated = amount(row.calculated_budget);
      const applied = amount(row.applied_budget) || calculated;
      const assignedCount = employeeCounts.get(key) || 0;
      const originalCountValue = row.original_headcount ?? row.allocation_headcount;
      const currentCountValue = row.current_headcount ?? row.headcount;
      const originalCount = amount(originalCountValue) > 0 ? amount(originalCountValue) : assignedCount;
      const currentCount = assignedCount;
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
  const orgOriginalCount = amount(orgOriginalCountValue) > 0 ? amount(orgOriginalCountValue) : total.team0;
  // Current headcount must always reflect the live eligible Appraisal Sheet roster;
  // persisted current_headcount may be stale until the next backend calculation.
  const orgCurrentCount = total.team;

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
    const previousOrgBudget = amount(selectedMaster?.applied_budget);
    const actor = String(currentUser.name || currentUser.email || "Unknown user");
    const reason = String(orgReason || "").trim() || "Org budget percentage updated";
    try {
      await updateBudget(selectedMaster?.id || "", {
        appraisal_cycle_id: cycleId,
        budget_percentage: org,
        org_budget_base: orgBase,
        calculated_budget: originalBudget,
        applied_budget: updatedBudget,
        budget_utilized: amount(selectedMaster?.budget_utilized),
      }, "master", false);
      recordBudgetAudit("org", [{
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toLocaleTimeString(),
        owner: "Org",
        from: previousOrgPct,
        to: org,
        before: previousOrgBudget,
        after: updatedBudget,
        by: actor,
        reason,
        cycleId,
      }]);

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
      setOrgReason("");
    } catch (saveError) {
      setError(saveError.message || "Org % and appraisal cycle could not be saved.");
    } finally {
      setSavingOrg(false);
    }
  }

  function setRowPct(name, value) {
    setPending((p) => ({ ...p, [name]: value }));
  }

  // "% for all": drive every Tech-Ed row's pending percentage from one field.
  // Rows that already sit at that percentage are left alone.
  function applyPctToAll(value) {
    setAllPct(value);
    if (value === "") {
      setPending({});
      return;
    }
    const next = {};
    rows.forEach((row) => {
      if (Number(value) !== Number(staged[row.name] ?? row.pct)) next[row.name] = value;
    });
    setPending(next);
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
    setRowReasons({});
    setAllPct("");
    setError("");
  }

  // apply()          -> "Apply all": stage every pending Tech-Ed edit.
  // apply("<name>")  -> row "Update": stage just that Tech-Ed's edit.
  async function apply(onlyName) {
    const target = typeof onlyName === "string" ? onlyName : null;
    if (!draftCount || (target && !Object.prototype.hasOwnProperty.call(pending, target))) {
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

    const updates = rows.filter((row) =>
      Object.prototype.hasOwnProperty.call(pending, row.name) && (!target || row.name === target),
    );
    const reasonFor = (row) =>
      String(rowReasons[row.name] || "").trim() ||
      (Number(pending[row.name]) === org ? "Reset to org %" : "Override");
    setStaged((previous) => {
      const next = { ...previous };
      updates.forEach((row) => { next[row.name] = Number(pending[row.name]); });
      return next;
    });
    setStagedReasons((previous) => {
      const next = { ...previous };
      updates.forEach((row) => {
        next[row.name] = reasonFor(row);
      });
      return next;
    });
    setPending((previous) => {
      if (!target) return {};
      const next = { ...previous };
      delete next[target];
      return next;
    });
    setRowReasons((previous) => {
      if (!target) return {};
      const next = { ...previous };
      delete next[target];
      return next;
    });
    if (!target) setAllPct("");
    setError("");
    // Apply is intentionally a staging step; the database changes only on Publish.
    // Reload server data after Apply as requested, without dropping the staged preview.
    await reloadBudget();
  }

  // publishChanges()          -> "Publish all": publish every staged Tech-Ed edit.
  // publishChanges("<name>")  -> row "Publish": publish just that Tech-Ed's edit.
  async function publishChanges(onlyName) {
    const target = typeof onlyName === "string" ? onlyName : null;
    if (!stagedCount) {
      setError("Apply at least one percentage change before publishing.");
      return;
    }
    if (target ? Object.prototype.hasOwnProperty.call(pending, target) : draftCount) {
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
      const toPublish = rows.filter((row) =>
        Object.prototype.hasOwnProperty.call(staged, row.name) && (!target || row.name === target),
      );
      const actor = String(currentUser.name || currentUser.email || "Unknown user");
      const publishedAt = new Date();
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
      recordBudgetAudit("techEd", toPublish.map((row) => {
        const pct = Number(staged[row.name]);
        return {
          date: publishedAt.toISOString().slice(0, 10),
          time: publishedAt.toLocaleTimeString(),
          owner: row.name,
          from: amount(row.pct),
          to: pct,
          before: amount(row.updated),
          after: row.base * (1 + pct / 100),
          by: actor,
          reason: stagedReasons[row.name] || "Budget percentage published",
          cycleId,
        };
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
      if (target) {
        setStaged((previous) => { const next = { ...previous }; delete next[target]; return next; });
        setStagedReasons((previous) => { const next = { ...previous }; delete next[target]; return next; });
      } else {
        setStaged({});
        setStagedReasons({});
        setPending({});
        setRowReasons({});
        setAllPct("");
      }
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

  // Presentation-only flags. The Tech-Ed list is shown once an Org % has been saved.
  const orgApplied = Boolean(selectedMaster?.budget_percentage_is_set);
  const cycleLabel = cycleLoading
    ? "Loading…"
    : activeCycle?.name || selectedMaster?.appraisal_cycle_name || "No active cycle";

  const totalsBudget = previewTotal;
  const notPublishedCount = rows.filter((row) => !row.pctSet).length;
  const stripMessage = orgPending
    ? "Org % change not applied yet (use Apply org %)"
    : draftCount
      ? draftCount + " pending change" + (draftCount > 1 ? "s" : "")
      : "No pending changes";

  return (
    <div className="bm-root">
      <style>{BUDGET_MASTER_CSS}</style>
      <div className="bm-sheet">
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

        <div className="bm-pans">
          <div className="bm-pan">
            <div className="bm-pan-head">
              <b>Org budget</b>
              <span className="bm-mut">Cycle: <b>{cycleLabel}</b></span>
            </div>
            <div className="bm-pan-row">
              <label>
                <small>Org %</small>
                <input
                  className={"bm-pin bm-pin-big" + (orgPending ? " ed" : "")}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="0.00"
                  value={orgPct}
                  disabled={!canConfig || savingOrg}
                  onChange={(e) => setOrgPct(e.target.value)}
                  aria-label="Organization budget percentage"
                />
              </label>
              <label className="bm-grow">
                <small>Reason</small>
                <input
                  className="bm-txt"
                  type="text"
                  placeholder="Reason"
                  value={orgReason}
                  disabled={!canConfig || savingOrg}
                  onChange={(e) => setOrgReason(e.target.value)}
                  aria-label="Reason for organization percentage"
                />
              </label>
              <button
                type="button"
                className="bm-btn bm-btn-main"
                disabled={!canConfig || savingOrg || cycleLoading || !activeCycle}
                onClick={applyOrgPercentage}
              >
                {savingOrg ? "Saving…" : "Apply org %"}
              </button>
            </div>
          </div>

          <div className="bm-pan">
            <div className="bm-pan-head">
              <b>Tech ED budget</b>
              <span className="bm-mut">Same % for every Tech ED</span>
            </div>
            <div className="bm-pan-row">
              <label>
                <small>% for all</small>
                <input
                  className="bm-pin bm-pin-big"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="%"
                  value={allPct}
                  disabled={!canConfig || !orgApplied || savingOrg}
                  onChange={(e) => applyPctToAll(e.target.value)}
                  aria-label="Percentage for all Tech EDs"
                />
              </label>
                
              <button
                type="button"
                className="bm-btn"
                disabled={!canConfig || (!pendingCount && !stagedCount)}
                onClick={discard}
              >
                Discard
              </button>
              <button
                type="button"
                className="bm-btn bm-btn-main"
                disabled={!canConfig || !orgApplied || !draftCount || savingOrg}
                onClick={() => apply()}
              >
                Apply all
              </button>
              <button
                type="button"
                className="bm-btn bm-btn-main"
                disabled={!canConfig || !orgApplied || !stagedCount || draftCount > 0 || savingOrg}
                onClick={() => publishChanges()}
              >
                {savingOrg ? "Publishing…" : "Publish all"}
              </button>
            </div>
          </div>
        </div>

        <div className="bm-tiles" aria-label="Organization budget summary">
          <div className="bm-tile">
            <small>Org budget base</small>
            <b>{money(orgBase)}</b>
          </div>
          <div className="bm-tile">
            <small>Original budget</small>
            <b>{orgPctEntered ? money(originalOrgBudget) : "—"}</b>
          </div>
          <div className="bm-tile bm-tile-hl">
            <small>Updated budget</small>
            <b>{orgPctEntered ? money(displayedOrgUpdated) : "—"}</b>
            {orgPctEntered ? (orgPending ? <em className="bm-mut">Preview — not yet saved</em> : deltaNode(originalOrgBudget, displayedOrgUpdated)) : null}
          </div>
          <div className="bm-tile">
            <small>Allotted to Tech EDs</small>
            <b>{orgApplied && displayedOrgUpdated > 0 ? percent((previewTotal / displayedOrgUpdated) * 100) : "—"}</b>
            {orgApplied ? (
              <em className="bm-mut">
                {money(previewTotal)} of {money(displayedOrgUpdated)}
                {availableAfterAllocation < -0.5 ? " · over by " + money(-availableAfterAllocation) : ""}
              </em>
            ) : null}
          </div>
          <div className="bm-tile">
            <small>Budget utilised</small>
            <b>{orgApplied && displayedOrgUpdated > 0 ? percent((displayedUtilized / displayedOrgUpdated) * 100) : "—"}</b>
            {orgApplied && displayedOrgUpdated > 0 ? <em className="bm-mut">{money(displayedUtilized)} of {money(displayedOrgUpdated)}</em> : null}
          </div>
          <div className="bm-tile">
            <small>Team count</small>
            <b>{orgApplied ? <>{orgOriginalCount} → {orgCurrentCount}</> : "—"}</b>
          </div>
        </div>

        <span className="bm-chip">Tech EDs</span>

        <div className="bm-tw">
          <table className="bm-table">
            <thead>
              <tr>
                {HR_COLS.map(([h, right]) => (
                  <th key={h} className={right ? "bm-n" : ""}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgApplied && rows.length ? rows.map((r) => {
                const p = previewPct(r);
                const changing = Number(p) !== r.pct;
                const hasPending = Object.prototype.hasOwnProperty.call(pending, r.name);
                const hasStaged = Object.prototype.hasOwnProperty.call(staged, r.name) &&
                  Number(staged[r.name]) !== Number(r.pct);
                const open = !!history[r.name];
                const rowAudit = auditState.techEd.filter((a) => a.owner === r.name);
                const sourceOverride =
                  overrides[r.name] ||
                  (hasPending && Number(p) !== amount(orgPct));
                const tag = hasStaged
                  ? (r.pctSet ? "Change applied · not published (live " + Number(r.pct).toFixed(2) + ")" : "Applied · not published")
                  : (!r.pctSet ? "No % yet" : "");
                return (
                  <FragmentRow key={r.name}>
                    <tr className={"bm-data" + (hasPending ? " bm-edrow" : "")}>
                      <td className="bm-rl">
                        {r.name}
                        {tag ? <> <span className="bm-tag">{tag}</span></> : null}
                      </td>
                      <td className="bm-n">{money(r.base)}</td>
                      <td className="bm-in">
                        <div className="bm-pin-cell">
                          <input
                            className={"bm-pin" + (hasPending ? " ed" : "")}
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            placeholder="Enter %"
                            value={p}
                            disabled={!canConfig}
                            title={changing ? Number(r.pct).toFixed(2) + " → " + Number(p).toFixed(2) + " (not applied yet)" : undefined}
                            onChange={(e) => setRowPct(r.name, e.target.value)}
                            aria-label={"Percentage for " + r.name}
                          />
                        </div>
                        {sourceOverride ? (
                          <div className="bm-source">
                            <span className="bm-source-override">Override</span>
                            <button type="button" className="bm-text-action" onClick={() => resetRow(r.name)}>Reset to org %</button>
                          </div>
                        ) : null}
                      </td>
                      <td className="bm-n bm-calc">{money(previewBudget(r))}</td>
                      <td className="bm-n">{money(r.original)}</td>
                      <td className="bm-n">{money(r.updated)}</td>
                      <td className="bm-n">{r.team0}</td>
                      <td className="bm-n">{r.team}</td>
                      <td>
                        <input
                          type="text"
                          className="bm-txt bm-reason"
                          placeholder="Reason (optional)"
                          value={rowReasons[r.name] ?? stagedReasons[r.name] ?? ""}
                          disabled={!canConfig || (!hasPending && !hasStaged)}
                          readOnly={!hasPending && hasStaged}
                          onChange={(e) => setRowReasons((x) => ({ ...x, [r.name]: e.target.value }))}
                          aria-label={"Reason for " + r.name}
                        />
                      </td>
                      <td className="bm-ract">
                        <button
                          type="button"
                          className="bm-hbtn"
                          disabled={!canConfig || !hasPending || savingOrg}
                          onClick={() => apply(r.name)}
                        >
                          Apply
                        </button>{" "}
                        <button
                          type="button"
                          className="bm-hbtn bm-hbtn-pub"
                          disabled={!canConfig || !hasStaged || hasPending || savingOrg}
                          onClick={() => publishChanges(r.name)}
                        >
                          Publish
                        </button>
                      </td>
                      <td>
                        {canAudit ? (
                          <button
                            type="button"
                            className="bm-hbtn"
                            aria-expanded={open}
                            onClick={() => setHistory((x) => ({ ...x, [r.name]: !x[r.name] }))}
                          >
                            History {open ? "▴" : "▾"}
                          </button>
                        ) : <span className="bm-mut">—</span>}
                      </td>
                    </tr>
                    {open && canAudit ? (
                      <tr className="bm-sub">
                        <td colSpan={HR_COLS.length}>
                          <div className="bm-hist"><AuditTable rows={rowAudit} /></div>
                        </td>
                      </tr>
                    ) : null}
                  </FragmentRow>
                );
              }) : (
                <tr><td colSpan={HR_COLS.length} className="bm-empty">
                  {!orgApplied
                    ? "Press Apply org % to load the Tech ED list from the Appraisal Sheet."
                    : budgetLoading
                      ? "Loading Tech ED budget rows…"
                      : "No Tech ED assignments were found for this appraisal cycle."}
                </td></tr>
              )}
              {orgApplied && rows.length ? (
                <tr className="bm-tot">
                  <td>Total</td>
                  <td className="bm-n">{money(total.base)}</td>
                  <td></td>
                  <td className="bm-n">{money(totalsBudget)}</td>
                  <td className="bm-n">{money(total.original)}</td>
                  <td className="bm-n">{money(total.updated)}</td>
                  <td className="bm-n">{total.team0}</td>
                  <td className="bm-n">{total.team}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="bm-foot">
          {!orgApplied
            ? "Apply org % first to load the Tech ED list"
            : stripMessage +
              (stagedCount ? " · " + stagedCount + " applied, not published" : "") +
              (notPublishedCount ? " · " + notPublishedCount + " Tech ED" + (notPublishedCount > 1 ? "s" : "") + " not published" : "")}
        </div>
      </div>
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
  const [auditState, setAuditState] = useState(() => readBudgetAudit());

  useEffect(() => {
    const refreshAudit = () => setAuditState(readBudgetAudit());
    refreshAudit();
    if (typeof window !== "undefined") {
      window.addEventListener("appraisal:budget-audit-updated", refreshAudit);
      window.addEventListener("storage", refreshAudit);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("appraisal:budget-audit-updated", refreshAudit);
        window.removeEventListener("storage", refreshAudit);
      }
    };
  }, []);

  const orgRows = auditState.org.filter(
    (r) => (!from || r.date >= from) && (!to || r.date <= to),
  );
  const tedRows = auditState.techEd.filter(
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

  const tabClass = (active) =>
    "h-11 border-b-2 px-1.5 text-[14px] transition-colors " +
    (active
      ? "border-[#102A43] font-extrabold text-[#102A43]"
      : "border-transparent font-semibold text-[#4B5563] hover:text-[#102A43]");

  return (
    <div
      className="w-full"
      style={{
        fontFamily: '"Manrope", ui-sans-serif, system-ui, sans-serif',
        fontVariantNumeric: "tabular-nums",
        color: "#0f1f33",
      }}
    >
      {isHR ? (
        <>
          <div
            role="tablist"
            className="mb-2.5 flex items-center gap-5 border-b border-[#E5E7EB] bg-white px-5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "apply"}
              onClick={() => setTab("apply")}
              className={tabClass(tab === "apply")}
            >
              Apply budget
            </button>
            {canAudit && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "audit"}
                onClick={() => setTab("audit")}
                className={tabClass(tab === "audit")}
              >
                Audit trail
              </button>
            )}
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