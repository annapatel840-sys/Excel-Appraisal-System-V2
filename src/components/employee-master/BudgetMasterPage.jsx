import { useEffect, useMemo, useState } from "react";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import { useBudget } from "@/lib/budget-store";
import { TechEdBudgetMasterPage } from "./TechEdBudgetMasterPage";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

const NAVY = "#12304f";
const TEAL = "#14a3a3";
const BORDER = "#d3dbe6";

/* Sample data. Replace with the budgetmaster API response when it is wired. */
const TECH_ED_DATA = [
  {
    name: "Prabhu Prasad Parida",
    pct: 8,
    base: 42500000,
    original: 3400000,
    updated: 3400000,
    team0: 48,
    team: 48,
    lastChanged: "01-Sep-26",
  },
  {
    name: "Ashok Kumar",
    pct: 8,
    base: 38000000,
    original: 3040000,
    updated: 3040000,
    team0: 42,
    team: 42,
    lastChanged: "01-Sep-26",
  },
];

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
const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
      ownerValues.set(key, String(item?.name || label || id || rowId).trim());
      [id, label, rowId, item?.name].filter(Boolean).forEach((alias) => {
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

      // Preserve the existing budget-base calculation; this change only fixes
      // the employee count shown for each Tech-Ed.
      const base = amount(employee.current_annual_base_pay ?? employee.currentAnnualBasePay ?? employee.current_base_pay ?? employee.currentBasePay ?? employee.base_pay ?? employee.basePay) +
        amount(employee.allocated_pb_amount ?? employee.allocatedPBAmount ?? employee.pb_to_be_paid ?? employee.pbToBePaid ?? employee.target_pb_allocated_for_may ?? employee.allocated_pb ?? employee.total_pb);
      employeeBases.set(key, (employeeBases.get(key) || 0) + base);
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
          existing.base = amount(row.budget_base) || existing.base;
          existing.original = amount(row.calculated_budget);
          existing.updated = amount(row.applied_budget) || existing.original;
          existing.id = row.id || existing.id;
        }
        return;
      }
      const calculated = amount(row.calculated_budget);
      const applied = amount(row.applied_budget) || calculated;
      const assignedCount = employeeCounts.get(key) || 0;
      nextRows.push({
        id: row.id || "tech-ed-" + key,
        canonicalKey: key,
        name: ownerValues.get(key) || ownerName(owner, employeeRows),
        pct: amount(row.percentage),
        base: employeeBases.get(key) || amount(row.budget_base) || (Number(row.percentage) ? calculated * 100 / Number(row.percentage) : calculated),
        original: calculated,
        updated: applied,
        team0: assignedCount,
        team: assignedCount,
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
        name: label,
        pct: amount(selectedMaster?.budget_percentage),
        base: employeeBases.get(key) || 0,
        original: (employeeBases.get(key) || 0) * (1 + amount(selectedMaster?.budget_percentage) / 100),
        updated: (employeeBases.get(key) || 0) * (1 + amount(selectedMaster?.budget_percentage) / 100),
        team0: employeeCounts.get(key) || 0,
        team: employeeCounts.get(key) || 0,
        lastChanged: "—",
      });
      seenOwners.add(key);
    });

    nextRows.sort((a, b) => a.name.localeCompare(b.name));
    setRows(nextRows);
    if (selectedMaster && Number.isFinite(Number(selectedMaster.budget_percentage))) {
      setOrgPct(String(Number(selectedMaster.budget_percentage)));
    }
  }, [budgetDistributionRows, budgetMasterRows, employeeRows, techEdOwners, selectedCycle, selectedMaster?.budget_percentage]);

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

  // Saved Tech-Ed percentages remain independent of future Org % changes.
  const previewPct = (row) =>
    Object.prototype.hasOwnProperty.call(pending, row.name)
      ? Number(pending[row.name])
      : amount(row.pct || 0);

  const previewBudget = (row) => row.base * (1 + previewPct(row) / 100);
  const orgBase = amount(selectedMaster?.org_budget_base) || total.base;
  const effectiveOrgPct = orgPct === "" ? amount(selectedMaster?.budget_percentage) : amount(orgPct);
  const previewOrgBudget = orgBase * (1 + effectiveOrgPct / 100);
  const changes = rows.filter((r) => Number(previewPct(r)) !== r.pct);
  const orgPending = orgPct !== "" && !!selectedMaster && amount(orgPct) !== Number(selectedMaster.budget_percentage || 0);
  const pendingCount =
    changes.length || orgPending ? changes.length + (orgPending ? 1 : 0) : 0;
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
    setSavingOrg(true);
    setError("");
    const orgBase = amount(selectedMaster?.org_budget_base) || total.base;
    const originalBudget = amount(selectedMaster?.calculated_budget) || orgBase * (1 + org / 100);
    const updatedBudget = orgBase * (1 + org / 100);
    try {
      await updateBudget(selectedMaster?.id || "", {
        appraisal_cycle_id: cycleId,
        budget_percentage: org,
        org_budget_base: orgBase,
        calculated_budget: originalBudget,
        applied_budget: updatedBudget,
        budget_utilized: amount(selectedMaster?.budget_utilized),
      }, "master", false);
      await Promise.all(rows
        .filter((row) => String(row.id || "").startsWith("tech-ed-"))
        .map((row) => updateBudget("", {
          appraisal_cycle_id: cycleId,
          appraiser_tech_ed_id: String(row.canonicalKey || row.name || "").trim().split(/\s+-\s+/)[0].slice(0, 20),
          percentage: org,
          budget_base: row.base,
          calculated_budget: row.base * (1 + org / 100),
          applied_budget: row.base * (1 + org / 100),
        }, "distribution", false)));
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
    setReason("");
    setError("");
  }

  async function apply() {
    const org = amount(orgPct);
    if (!(org >= 0 && org <= 100)) {
      setError("Enter a valid org % between 0 and 100.");
      return;
    }

    const invalid = rows.find((r) => {
      const value = previewPct(r);
      return !(value >= 0 && value <= 100);
    });
    if (invalid) {
      setError(
        "Not applied. " + invalid.name + ": enter a valid % between 0 and 100.",
      );
      return;
    }

    const orgBaseForCycle = amount(selectedMaster?.org_budget_base) || total.base;
    const orgOriginalBudget = amount(selectedMaster?.calculated_budget) || orgBaseForCycle * (1 + org / 100);
    if (previewTotal > orgOriginalBudget + 0.5) {
      setError(
        "Not applied. Tech-Ed Original Budgets total " + money(previewTotal) +
        ", which exceeds the Org Original Budget of " + money(orgOriginalBudget) + ". Reduce one or more Tech-Ed percentages.",
      );
      return;
    }

    const now = new Date().toISOString().slice(0, 10);
    const changedRows = rows.filter((r) => Number(previewPct(r)) !== r.pct);
    const next = rows.map((r) => {
      const to = Number(previewPct(r));
      return to === r.pct
        ? r
        : {
            ...r,
            pct: to,
            updated: previewBudget(r),
            lastChanged: dateText(now),
          };
    });

    const newAudit = changedRows.map((r) => ({
      date: now,
      owner: r.name,
      from: r.pct,
      to: Number(previewPct(r)),
      before: r.updated,
      after: previewBudget(r),
      by: "HR",
      reason:
        reason.trim() ||
        (Number(previewPct(r)) === org ? "Reset to org %" : "Override"),
    }));

    if (orgPending) {
      setOrgAudit((a) => [
        {
          date: now,
          from: 8,
          to: org,
          before: total.updated,
          after: previewTotal,
          by: "HR",
          reason: reason.trim() || "Org budget percentage change",
        },
        ...a,
      ]);
    }

    try {
      const orgBase = amount(selectedMaster?.org_budget_base) || total.base;
      const originalOrgBudget = amount(selectedMaster?.calculated_budget) || orgBase * (1 + org / 100);
      const updatedOrgBudget = orgBase * (1 + org / 100);
      const cycleId = String(selectedCycle || activeCycle?.id || activeCycle?.appraisal_cycle_id || activeCycle?.ROWID || "").trim();
      if (!cycleId) throw new Error("Select an appraisal cycle before applying Tech-Ed budgets.");
      // Persist every Appraisal Sheet Tech-Ed, including newly discovered rows.
      // The API upserts by (appraisal_cycle_id, appraiser_tech_ed_id) and stores
      // the business Employee ID in the varchar field, not a display label.
      await Promise.all([
        ...rows.map((r) => updateBudget(
          r.id && !String(r.id).startsWith("tech-ed-") ? r.id : "",
          {
            appraisal_cycle_id: cycleId,
            appraiser_tech_ed_id: String(r.canonicalKey || r.name || "").trim().split(/\s+-\s+/)[0].slice(0, 20),
            percentage: Number(previewPct(r)),
            budget_base: r.base,
            calculated_budget: String(r.id || "").startsWith("tech-ed-")
              ? r.base * (1 + Number(previewPct(r)) / 100)
              : (r.original || (r.base * (1 + Number(previewPct(r)) / 100))),
            applied_budget: previewBudget(r),
          },
          "distribution",
          false,
        )),
        updateBudget(selectedMaster?.id || "", {
          appraisal_cycle_id: cycleId,
          budget_percentage: org,
          org_budget_base: orgBase,
          calculated_budget: originalOrgBudget,
          applied_budget: updatedOrgBudget,
        }, "master", false),
      ]);
      await reloadBudget();
    } catch (saveError) {
      setError(saveError.message || "Budget changes could not be saved.");
      return;
    }

    setRows(next);
    setAudit((a) => [...newAudit, ...a]);
    setPending({});
    setOverrides((o) => {
      const nextOverrides = { ...o };
      next.forEach((r) => {
        if (r.pct === org) delete nextOverrides[r.name];
        else nextOverrides[r.name] = true;
      });
      return nextOverrides;
    });
    setReason("");
    setError("");
  }

  const orgCell = "shrink-0 min-w-[170px] border-r border-[#d7dce3] px-[22px] py-4";


  return (
    <div className="flex flex-col gap-2">
      {budgetError || budgetWarning ? (
        <div
          role="alert"
          className="rounded-[8px] border border-[#f2d27a] bg-[#fff8e1] px-3 py-2 text-[12px] text-[#7a4b00]"
        >
          {budgetError ? <div><b>Budget data could not be loaded:</b> {budgetError}</div> : null}
          {budgetWarning ? <div><b>Budget base:</b> {budgetWarning}</div> : null}
        </div>
      ) : null}
      {error ? (
        <div className="flex justify-between gap-2 rounded-md border border-[#e3e8ef] border-l-4 border-l-[#c2410c] bg-white px-3 py-2 text-[12px] text-[#7c2d12]">
          <span>{error}</span>
          <button
            type="button"
            className="font-bold"
            onClick={() => setError("")}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section
        className={
          "overflow-hidden rounded-[10px] border bg-white " +
          (orgPending ? "bg-[#fdf8e7]" : "")
        }
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Org Budget %
        </div>
        <div className="overflow-x-auto">
          <div className="flex items-stretch gap-3 px-3 py-1">
            <div className={orgCell}>
              <div className="text-[11px] font-medium text-[#5b6b80]">
                Active Appraisal Cycle
              </div>

              <div
                className="mt-1 flex h-[38px] min-w-[180px] items-center rounded border border-[#14a3a3] bg-[#f4f7fa] px-3 text-[13px] font-bold text-[#12304f]"
                aria-label="Currently active appraisal cycle"
                title={activeCycle?.name || "No active cycle"}            
              >
                {cycleLoading ? "Loading active cycle…" : activeCycle?.name || "No active cycle"}
              </div>
            </div>
            <div className={orgCell}>
              <div className="text-[11px] font-medium text-[#5b6b80]">
                Org % (default for all Tech EDs)
              </div>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={orgPct}
                  disabled={!canConfig || savingOrg}
                  onChange={(e) => setOrgPct(e.target.value)}
                  className="h-[38px] w-[110px] rounded border border-[#14a3a3] px-2 text-right text-[18px] font-bold text-[#12304f] outline-none"
                />
                <button
                  type="button"
                  disabled={!canConfig || savingOrg || cycleLoading || !activeCycle}
                  onClick={applyOrgPercentage}
                  className="h-[38px] rounded-md px-3 text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: TEAL }}
                >
                  {savingOrg ? "Saving…" : "Apply"}
                </button>
              </div>
              {orgPending ? (
                <div className="text-[11px] text-slate-500">was 8%</div>
              ) : null}
            </div>
            <div className={orgCell}>
              <div className="text-[11px] text-[#5b6b80]">Org budget base</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {money(orgBase)}
              </div>
            </div>
            <div className={orgCell}>
              <div className="text-[11px] text-[#5b6b80]">Original budget</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {money(amount(selectedMaster?.calculated_budget) || orgBase * (1 + amount(selectedMaster?.budget_percentage) / 100))}
              </div>
            </div>
            <div className={orgCell}>
              <div className="text-[11px] text-[#5b6b80]">Updated budget</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {money(orgPending ? previewOrgBudget : amount(selectedMaster?.applied_budget) || previewOrgBudget)}
              </div>
            </div>
            <div className="shrink-0 min-w-[150px] rounded-md border border-[#d7dce3] bg-[#f8fafc] px-[22px] py-4">
              <div className="text-[11px] text-[#5b6b80]">Team count</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {total.team0} → {total.team}
              </div>
            </div>
          </div>
        </div>
        <div className="px-[18px] pb-2.5 text-[11.5px] text-slate-500">
          Changing the org % updates every Tech ED on the org default. Tech EDs
          with an override keep their own %.
        </div>
      </section>

      <section
        className="overflow-hidden rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(18,48,79,.06)]"
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Tech EDs — {rows.length}
        </div>
        <div className="max-h-[58vh] overflow-auto">
          <table className="w-full min-w-[1180px] border-collapse text-[12.5px] tabular-nums">
            <thead>
              <tr>
                {HR_COLS.map(([h, right]) => (
                  <th
                    key={h}
                    className={
                      "sticky top-0 whitespace-nowrap border-b-2 border-[#9fb3cf] bg-[#e8eef5] px-2.5 py-2 text-[12px] font-semibold text-[#12304f] " +
                      (right ? "text-right" : "text-left")
                    }
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = previewPct(r);
                const changing = Number(p) !== r.pct;
                const open = !!history[r.name];
                const sourceOverride =
                  overrides[r.name] ||
                  (Object.prototype.hasOwnProperty.call(pending, r.name) &&
                    Number(p) !== amount(orgPct));
                const td =
                  "border-b border-[#e1e5eb] px-2.5 py-2 align-middle " +
                  (changing ? "bg-[#fdf8e7] " : "bg-white ");
                return (
                  <FragmentRow key={r.name}>
                    <tr>
                      <td
                        className={td + "whitespace-nowrap text-left font-bold"}
                      >
                        {r.name}
                      </td>
                      <td className={td + "whitespace-nowrap text-right"}>
                        {money(r.base)}
                      </td>
                      <td className={td + "text-right"}>
                        <div className="flex flex-col items-end">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={p}
                            disabled={!canConfig}
                            onChange={(e) => setRowPct(r.name, e.target.value)}
                            className="h-8 w-[84px] rounded border border-[#14a3a3] bg-white px-2 text-right text-[14px] font-bold text-[#12304f]"
                          />
                          {changing ? (
                            <div className="whitespace-nowrap text-[11px] text-slate-500">
                              was {r.pct}%
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className={td + "text-left"}>
                        {sourceOverride ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="whitespace-nowrap rounded-full bg-[#fff4d6] px-2 py-0.5 text-[11px] font-bold text-[#8a5a00]">
                              Override
                            </span>
                            <button
                              type="button"
                              className="whitespace-nowrap text-[11.5px] font-bold text-[#1859a8]"
                              onClick={() => resetRow(r.name)}
                            >
                              Reset to org %
                            </button>
                          </div>
                        ) : (
                          <span className="whitespace-nowrap rounded-full bg-[#e6f4f4] px-2 py-0.5 text-[11px] font-bold text-[#0f6d6d]">
                            Org default
                          </span>
                        )}
                      </td>
                      <td className={td + "whitespace-nowrap text-right"}>
                        {money(r.original)}
                      </td>
                      <td className={td + "whitespace-nowrap text-right"}>
                        {money(r.updated)}
                      </td>
                      <td className={td + "text-right"}>{r.team0}</td>
                      <td className={td + "text-right"}>{r.team}</td>
                      <td className={td + "text-left"}>
                        {canAudit && (open || r.lastChanged !== "01-Sep-26") ? (
                          <button
                            type="button"
                            className="whitespace-nowrap rounded border border-[#c5d0dd] bg-white px-2 py-1 text-[12px] font-bold text-[#17365d]"
                            onClick={() =>
                              setHistory((x) => ({
                                ...x,
                                [r.name]: !x[r.name],
                              }))
                            }
                          >
                            {r.lastChanged} {open ? "▴" : "▾"}
                          </button>
                        ) : (
                          <span className="text-[#94a3b8]">—</span>
                        )}
                      </td>
                    </tr>
                    {open && canAudit ? (
                      <tr>
                        <td
                          colSpan={HR_COLS.length}
                          className="border-b border-[#d7dce3] bg-[#f7f9fc] px-10 py-3"
                        >
                          <AuditTable
                            rows={audit.filter((a) => a.owner === r.name)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-[#d4dbe5] bg-white px-3.5 py-2.5">
          <span
            className={
              pendingCount ? "font-bold text-[#c2410c]" : "text-slate-500"
            }
          >
            {pendingCount
              ? pendingCount +
                " change" +
                (pendingCount === 1 ? "" : "s") +
                " pending"
              : "No pending changes"}
          </span>
          {canConfig && (
            <>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!pendingCount}
                placeholder="Reason (saved in the audit trail)"
                className="h-[30px] min-w-[200px] max-w-[460px] flex-1 rounded border border-[#cbd3df] px-2 text-[12.5px]"
              />
              <button
                type="button"
                disabled={!pendingCount}
                onClick={discard}
                className="rounded-md border border-[#c5d0dd] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#12304f] disabled:opacity-40"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={!pendingCount}
                onClick={apply}
                className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                style={{ background: TEAL }}
              >
                Apply
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/* tbody can hold several <tr> per item; a fragment keeps the table valid. */
function FragmentRow({ children }) {
  return <>{children}</>;
}

function HRAuditTrail() {
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
              {TECH_ED_DATA.map((r) => (
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
                  ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white"
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
                  ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white"
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