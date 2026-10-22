import { Fragment, useEffect, useMemo, useState } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";
import { useBudget } from "@/lib/budget-store";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

/* Budget Distribution uses persisted Budget_Distribution and
   Budget_Distribution_Comp rows. The prior UI-only sample allocations have
   been removed so this screen never displays invented team budgets. */

const LEVELS = ["Tech ED", "Comp Manager"];
const UTILISED_LABEL = "Hike Amount";

const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  const parsed = Number(String(v).trim().replace(/[₹,\s]/g, "").replace(/^(?:INR|Rs\.?)/i, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
// Amount with Indian grouping (no lakh rounding), e.g. 12,34,567.50
const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const lakh = (n) => INR.format(num(n));
const normalizeOwner = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
// Employee IDs can themselves contain hyphens (for example WIS-1234).
// The owner separator is the spaced delimiter " - ", not every hyphen.
const ownerParts = (value) => {
  const text = normalizeOwner(value);
  if (!text) return [];
  const separator = text.split(/\s+-\s+/);
  return separator.length > 1 ? [text, ...separator] : [text];
};
const ownerKey = (value) => ownerParts(value)[1] || ownerParts(value)[0] || "";
// identities: a list of normalized values, or one owner value such as
// "EMP0051 - Ashok Kumar" (compared by its parts, never as a substring).
const ownerMatches = (owner, identities) => {
  if (!Array.isArray(identities)) identities = ownerParts(identities);
  const parts = ownerParts(owner);
  const compactParts = parts.map((part) => part.replace(/[^a-z0-9]/g, ""));
  return parts.some((part) => identities.includes(part)) ||
    compactParts.some((part) => identities.some((identity) => identity.replace(/[^a-z0-9]/g, "") === part));
};

const firstNonBlank = (object, keys) => {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return 0;
};
const isActiveAndEligible = (employee) => {
  // employeesapi has already joined Employee_Master and exposes the master
  // decision as status + eligible_status. Prefer those canonical fields over
  // stale/legacy aliases carried on an Appraisal_Sheet row.
  const status = String(firstNonBlank(employee, ["status", "emp_status", "employee_status"]) || "").trim().toLowerCase();
  const eligibility = String(firstNonBlank(employee, ["eligible_status", "eligibility_status", "eligibility", "eligible"]) || "").trim().toLowerCase().replace(/[ _-]+/g, "");
  return status === "active" && ["eligible", "yes", "true", "1"].includes(eligibility);
};
const employeeUtilized = (employee) => {
  // Prefer the same Appraisal_Sheet-based calculation returned by budgetmasterapi.
  // Fall back to the local calculation for older deployed API responses.
  const serverAmount = Number(employee?.utilized_amount);
  if (employee?.utilized_amount !== null && employee?.utilized_amount !== undefined &&
      String(employee.utilized_amount).trim() !== "" && Number.isFinite(serverAmount) &&
      serverAmount !== 0) return serverAmount;

  // Business rule: current-year awards minus previous-year awards.
  // Ignore zero-filled aliases so another populated field can supply the value.
  const amount = (keys) => {
    for (const key of keys) {
      const value = employee?.[key];
      if (value === null || value === undefined || String(value).trim() === "") continue;
      const parsed = num(value);
      if (parsed !== 0) return parsed;
    }
    return 0;
  };

  const currentHike = amount(["hike_amount", "hikeAmount", "current_hike_amount"]);
  // Appraisal_Sheet current-year performance bonus may be stored in the
  // allocation/offer columns depending on the cycle's schema.
  const currentPerformance = amount(["new_pb_to_be_offered", "newPBToBeOffered", "current_performance_bonus", "performance_bonus", "performanceBonus", "target_pb_allocated_for_may", "targetPBAllocatedForMay", "allocated_pb_amount", "allocatedPBAmount", "target_pb_next_year", "targetPBNextYear"]);
  const currentRetention = amount(["new_rb", "newRB", "current_retention_bonus", "retention_bonus", "retentionBonus"]);
  const currentJoining = amount(["joining_bonus", "joiningBonus", "current_joining_bonus"]);

  // PB/RB-to-be-paid are previous-year values in the appraisal sheet.
  const previousPerformance = amount(["previous_year_performance_bonus", "previousPerformanceBonus", "previous_year_pb", "pb_to_be_paid", "pbToBePaid", "previous_pb"]);
  const previousRetention = amount(["previous_year_retention_bonus", "previousRetentionBonus", "previous_year_rb", "rb_to_be_paid", "rbToBePaid", "previous_rb"]);
  const previousJoining = amount(["previous_year_joining_bonus", "previousJoiningBonus", "previous_year_jb", "previous_joining_bonus"]);

  return currentHike + currentPerformance + currentRetention + currentJoining
    - previousPerformance - previousRetention - previousJoining;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateText(iso) {
  const p = String(iso || "").slice(0, 10).split("-");
  return p.length === 3 && MONTHS[Number(p[1]) - 1] ? p[2] + "-" + MONTHS[Number(p[1]) - 1] : iso || "—";
}
function nowParts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return { date: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()), time: pad(d.getHours()) + ":" + pad(d.getMinutes()) };
}
const byDate = (a, b) => String(a.date + (a.time || "")).localeCompare(String(b.date + (b.time || "")));

function Chg({ d }) {
  if (Math.abs(d) < 1) return <span className="mut">No change</span>;
  return <span className={d > 0 ? "up" : "down"}>{(d > 0 ? "▲ " : "▼ ") + lakh(Math.abs(d))}</span>;
}
function ChangeCell({ from, to }) {
  const d = to - from;
  if (Math.abs(d) < 1) return <span className="mut">—</span>;
  const p = from ? (d / from) * 100 : 0;
  return (
    <>
      <Chg d={d} /> <span className={d > 0 ? "up" : "down"}>({(d > 0 ? "+" : "") + p.toFixed(1)}%)</span>
    </>
  );
}

function AuditTable({ list, showName }) {
  if (!list.length) return <div className="muted-small" style={{ padding: "6px 0" }}>No % changes yet.</div>;
  return (
    <div className="bscroll">
      <table className="trail">
        <thead>
          <tr>
            <th>Date</th>
            {showName && <th>Owner</th>}
            <th className="n">Old %</th>
            <th className="n">New %</th>
            <th className="n">Budget before</th>
            <th className="n">Budget after</th>
            <th>Changed by</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {list.map((x, i) => (
            <tr key={i}>
              <td>{dateText(x.date) + (x.time ? " " + x.time : "")}</td>
              {showName && <td style={{ fontWeight: 700 }}>{x.name}</td>}
              <td className="n">{x.from === null ? "—" : x.from + "%"}</td>
              <td className="n" style={{ fontWeight: 700 }}>{x.to}%</td>
              <td className="n">{x.before === null ? "—" : lakh(x.before)}</td>
              <td className="n">{lakh(x.after)}</td>
              <td>{x.by}</td>
              <td>{x.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TechEdBudgetDistribution() {
  const user = useCatalystUser();
  const {
    budgetDistributionRows,
    budgetCompManagerRows,
    budgetMasterRows,
    employeeRows = [],
    techEdOwners = [],
    updateBudget,
    loading: budgetLoading,
    error: budgetError,
  } = useBudget();
  const myName = user?.name || "Unknown user";
  const [cycleRows, setCycleRows] = useState([]);
  const [activeCycleId, setActiveCycleId] = useState("");
  const [cycleLoading, setCycleLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    payrollCycleRequest("cycles")
      .then((cycles) => {
        if (!mounted) return;
        const allCycles = Array.isArray(cycles) ? cycles : [];
        setCycleRows(allCycles);
        const active = allCycles.find(
          (cycle) => String(cycle.status || "").trim().toLowerCase() === "active" && !cycle.archived,
        );
        const cycleId = active?.id ?? active?.appraisal_cycle_id ?? active?.cycle_id ?? active?.ROWID ?? "";
        setActiveCycleId(cycleId ? String(cycleId) : "");
      })
      .catch((cycleError) => {
        console.error("Failed to load appraisal cycles for Budget Distribution:", cycleError);
        if (mounted) {
          setCycleRows([]);
          setActiveCycleId("");
        }
      })
      .finally(() => {
        if (mounted) setCycleLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const liveTech = useMemo(() => {
    const identities = new Set(
      [
        myName, user?.name, user?.display_name, user?.first_name, user?.last_name,
        [user?.first_name, user?.last_name].filter(Boolean).join(" "),
        user?.email, user?.email_id, user?.user_id, user?.row_id, user?.ROWID,
        user?.empId, user?.employeeId, user?.employee_id,
      ].map(normalizeOwner).filter(Boolean),
    );

    // Resolve the signed-in person against the complete Tech-Ed directory first.
    // Do not depend on employeeRows containing the Tech-Ed's own employee row:
    // Tech-Ed-scoped employee APIs may return only their reports.
    const directoryOwner = techEdOwners.find((item) =>
      [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id]
        .filter(Boolean)
        .some((alias) => ownerMatches(alias, Array.from(identities))),
    );
    if (directoryOwner) {
      [
        directoryOwner.employee_id,
        directoryOwner.row_id,
        directoryOwner.ROWID,
        directoryOwner.assignment,
        directoryOwner.name,
      ].filter(Boolean).forEach((value) => {
        identities.add(normalizeOwner(value));
        ownerParts(value).forEach((part) => identities.add(normalizeOwner(part)));
      });
    }

    const employeeIdentityValues = (employee) => [
      employee.row_id, employee.ROWID, employee.ROW_ID, employee.id,
      employee.emp_id, employee.employee_id, employee.employeeId,
      employee.emp_name, employee.employee_name, employee.name,
      employee.email, employee.email_id, employee.emailId,
    ].map(normalizeOwner).filter(Boolean);

    // Resolve the logged-in account to an actual employee row where possible.
    const loginEmployee = employeeRows.find((employee) =>
      employeeIdentityValues(employee).some((value) => identities.has(value)),
    );
    if (loginEmployee) employeeIdentityValues(loginEmployee).forEach((value) => identities.add(value));

    // Some session accounts are not employees. In that case, use the Appraisal
    // Sheet assignment whose Tech-Ed owner contains the logged-in identity.
    const ownerByForeignKey = new Map();
    techEdOwners.forEach((item) => {
      const fk = normalizeOwner(item?.row_id || item?.ROWID || "");
      if (fk && item?.assignment) ownerByForeignKey.set(fk, String(item.assignment).trim());
    });
    const assignedOwners = Array.from(new Set(employeeRows
      .map((employee) => {
        const raw = String(employee.appraiser_tech_ed_row_id || employee.appraiser_tech_ed_appraisal_sheet || employee.appraiser_tech_ed || employee.appraiser_tech_ed_id ||
          employee.appraiser_tech_ed1 || employee.appraiser_teched || employee.appraiserTechED || employee.tech_ed || employee.tech_ed_id || "").trim();
        return ownerByForeignKey.get(normalizeOwner(raw)) || raw;
      })
      .filter((owner) => owner && ownerMatches(owner, Array.from(identities)))));

    const allRows = budgetDistributionRows.filter((row) =>
      row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed || row.appraiser_tech_ed,
    );
    const ownerForBudgetRow = (row) => {
      const raw = String(
        row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed ||
        row.appraiser_tech_ed || row.appraiser_tech_ed1 || ""
      ).trim();
      // Budget_Distribution may store Employee_Master.ROWID as its Tech-Ed FK.
      // Convert that FK to the display assignment returned from Appraisal_Sheet.
      return ownerByForeignKey.get(normalizeOwner(raw)) || raw;
    };
    const ownerMatchesLogin = (row) =>
      ownerMatches(ownerForBudgetRow(row), Array.from(identities)) ||
      Boolean(loginEmployee && normalizeOwner(row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed || row.appraiser_tech_ed || row.appraiser_tech_ed1) === normalizeOwner(loginEmployee.row_id || loginEmployee.ROWID));
    const directMatches = allRows.filter(ownerMatchesLogin);
    const assignmentMatches = allRows.filter((row) =>
      assignedOwners.some((owner) => ownerKey(owner) === ownerKey(
        row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed || row.appraiser_tech_ed,
      )),
    );
    const candidates = directMatches.length ? directMatches : assignmentMatches;

    // Cycle API and budget tables can refer to the same cycle through different
    // ID aliases. Resolve the active cycle through Budget_Master's cycle name
    // before concluding that the Tech-Ed has no matching allocation.
    const activeCycle = cycleRows.find((cycle) =>
      String(cycle.id ?? cycle.appraisal_cycle_id ?? cycle.cycle_id ?? cycle.ROWID) === String(activeCycleId),
    );
    const activeCycleName = normalizeOwner(
      activeCycle?.name || activeCycle?.cycle_name || activeCycle?.appraisal_year || "",
    );
    const activeMasterCycleIds = new Set(
      budgetMasterRows
        .filter((master) => {
          const masterCycleName = normalizeOwner(
            master.appraisal_cycle_name || master.cycle_name || master.cycleName || master.appraisal_year || "",
          );
          return (
            (activeCycleId && String(master.appraisal_cycle_id) === String(activeCycleId)) ||
            (activeCycleName && masterCycleName === activeCycleName)
          );
        })
        .map((master) => String(master.appraisal_cycle_id || ""))
        .filter(Boolean),
    );
    const cycleMatches = candidates.filter((row) =>
      (activeCycleId && String(row.appraisal_cycle_id) === String(activeCycleId)) ||
      activeMasterCycleIds.has(String(row.appraisal_cycle_id)),
    );
    if (cycleMatches.length === 1) return cycleMatches[0];
    if (cycleMatches.length > 1) return null;

    // Never guess between multiple cycles. A unique owner allocation is safe
    // to show when cycle metadata has no matching alias.
    return candidates.length === 1 ? candidates[0] : null;
  }, [
    budgetDistributionRows, budgetMasterRows, cycleRows, employeeRows, techEdOwners, myName,
    user?.name, user?.display_name, user?.first_name, user?.last_name,
    user?.email, user?.email_id, user?.user_id, user?.empId, user?.employeeId, user?.employee_id,
    activeCycleId,
  ]);

  // The Tech-ED's Appraisal Sheet assignment (e.g. "EMP0051 - Ashok Kumar"),
  // found from the login even when HR has not allocated a budget row yet, so
  // the team and its Comp Managers can still be listed.
  const loginTechOwner = useMemo(() => {
    const identities = [
      myName, user?.name, user?.display_name,
      [user?.first_name, user?.last_name].filter(Boolean).join(" "),
      user?.email, user?.email_id, user?.empId, user?.employeeId, user?.employee_id,
    ].map(normalizeOwner).filter(Boolean);

    // Prefer the authoritative Appraisal Sheet Tech-Ed directory. This works
    // even if the employee endpoint only returns the Tech-Ed's reports.
    const directoryOwner = techEdOwners.find((item) =>
      [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id]
        .filter(Boolean)
        .some((alias) => ownerMatches(alias, identities)),
    );
    if (directoryOwner?.assignment) return String(directoryOwner.assignment).trim();

    const personValues = (e) => [
      e.row_id, e.ROWID, e.ROW_ID, e.id,
      e.emp_id, e.employee_id, e.employeeId, e.emp_name, e.employee_name, e.name,
      e.email, e.email_id, e.emailId,
    ].map(normalizeOwner).filter(Boolean);
    const me = employeeRows.find((e) => personValues(e).some((v) => identities.includes(v)));
    if (me) identities.push(...personValues(me));
    for (const employee of employeeRows) {
      const raw = String(employee.appraiser_tech_ed_row_id || employee.appraiser_tech_ed_appraisal_sheet || employee.appraiser_tech_ed || employee.appraiser_tech_ed_id || employee.appraiser_tech_ed1 ||
        employee.appraiser_teched || employee.appraiserTechED || employee.tech_ed || employee.tech_ed_id || "").trim();
      if (!raw) continue;
      const linked = techEdOwners.find((item) =>
        [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id].filter(Boolean)
          .some((alias) => ownerMatches(alias, raw)),
      );
      const assignment = String(linked?.assignment || raw).trim();
      if (ownerMatches(assignment, identities)) return assignment;
    }
    return "";
  }, [employeeRows, techEdOwners, myName, user?.name, user?.display_name, user?.first_name, user?.last_name,
    user?.email, user?.email_id, user?.empId, user?.employeeId, user?.employee_id]);
  const techOwnerKey = ownerKey(liveTech?.appraiser_tech_ed_id) || ownerKey(loginTechOwner);

  const activeCycle = useMemo(
    () => cycleRows.find((cycle) => String(cycle.id ?? cycle.appraisal_cycle_id ?? cycle.cycle_id ?? cycle.ROWID) === String(liveTech?.appraisal_cycle_id || activeCycleId)) || null,
    [cycleRows, liveTech?.appraisal_cycle_id, activeCycleId],
  );
  const liveComps = useMemo(
    () => liveTech
      ? budgetCompManagerRows.filter((r) => String(r.budget_distribution_id) === String(liveTech.id))
      : [],
    [budgetCompManagerRows, liveTech],
  );
  const liveMaster = useMemo(
    () => liveTech
      ? budgetMasterRows.find((r) => String(r.appraisal_cycle_id) === String(liveTech.appraisal_cycle_id)) || null
      : null,
    [budgetMasterRows, liveTech],
  );
  const cycleLabel = String(activeCycle?.name || liveMaster?.appraisal_cycle_name || liveMaster?.cycle_name || "").trim();

  const [pane, setPane] = useState({ mine: true, alloc: true, audit: true });
  const [appliedOpen, setAppliedOpen] = useState(false);
  const [trailOpen, setTrailOpen] = useState({});
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [auditFilter, setAuditFilter] = useState("all");
  const [drafts, setDrafts] = useState({});
  const auditStorageKey = liveTech
    ? "appraisal-budget-audit:" + String(liveTech.appraisal_cycle_id) + ":" + ownerKey(liveTech.appraiser_tech_ed_id)
    : "";
  const [auditState, setAuditState] = useState({ key: "", entries: [] });
  const log = auditState.key === auditStorageKey ? auditState.entries : [];

  useEffect(() => {
    if (!auditStorageKey) {
      setAuditState({ key: "", entries: [] });
      return;
    }
    let entries = [];
    try {
      const saved = window.localStorage.getItem(auditStorageKey);
      const parsed = saved ? JSON.parse(saved) : [];
      entries = Array.isArray(parsed) ? parsed : [];
    } catch (storageError) {
      console.error("Could not read the Budget Distribution audit trail:", storageError);
    }
    setAuditState({ key: auditStorageKey, entries });
  }, [auditStorageKey]);

  useEffect(() => {
    if (!auditStorageKey || auditState.key !== auditStorageKey) return;
    try {
      window.localStorage.setItem(auditStorageKey, JSON.stringify(auditState.entries));
    } catch (storageError) {
      console.error("Could not save the Budget Distribution audit trail:", storageError);
    }
  }, [auditStorageKey, auditState]);

  const cmNodes = useMemo(() => {
    const managerStats = new Map();
    const currentTechOwner = techOwnerKey;
    const resolveTechAssignment = (raw) => {
      const text = String(raw || "").trim();
      const linked = techEdOwners.find((item) =>
        [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name]
          .filter(Boolean).some((alias) => ownerMatches(alias, text))
      );
      return String(linked?.assignment || text).trim();
    };
    const resolveManager = (raw) => {
      const text = String(raw || "").trim();
      if (!text) return "";
      const parts = ownerParts(text);

      // A Comp Manager often is not a member of their own Tech-Ed roster.
      // Resolve the saved manager ID through any team row that already carries
      // both the stored Comp Manager key and its Employee_Master display label.
      const linkedManager = employeeRows.find((employee) =>
        employee.comp_manager_display &&
        ownerMatches(employee.comp_manager || employee.comp_manager_id || employee.compManager, parts)
      );
      if (linkedManager?.comp_manager_display) return String(linkedManager.comp_manager_display).trim();

      const manager = employeeRows.find((employee) => {
        const aliases = [
          employee.empId, employee.emp_id, employee.employee_id, employee.employeeId,
          employee.id, employee.ROWID, employee.row_id, employee.name, employee.employee_name,
        ].filter(Boolean);
        return aliases.some((alias) => ownerMatches(alias, parts));
      });
      if (!manager) return text;
      const id = String(manager.empId || manager.emp_id || manager.employee_id || manager.employeeId || "").trim();
      const name = String(manager.name || manager.employee_name || manager.emp_name || "").trim();
      return id && name ? id + " - " + name : name || text;
    };
    employeeRows.forEach((employee) => {
      // This page's team and Comp Manager list must be driven only by current
      // Appraisal_Sheet rows, not Employee_Master-only employees.
      if (employee.in_appraisal_sheet !== true) return;
      const rawTechAssignment = employee.appraiser_tech_ed_row_id || employee.appraiser_tech_ed_appraisal_sheet || employee.appraiser_tech_ed || employee.appraiser_tech_ed_id || employee.appraiser_tech_ed1 || employee.tech_ed || employee.tech_ed_id || "";
      const techAssignment = resolveTechAssignment(rawTechAssignment);
      if (!currentTechOwner || ownerKey(techAssignment) !== currentTechOwner) return;
      if (!isActiveAndEligible(employee)) return;
      const rawManager = employee.comp_manager_display || employee.comp_manager_name || employee.comp_manager || employee.comp_manager_id || employee.compManager || "";
      const manager = resolveManager(rawManager);
      if (!manager) return;
      const key = ownerKey(manager);
      const stats = managerStats.get(key) || { count: 0, base: 0, utilized: 0, name: manager };
      stats.count += 1;
      const previousCtcValue = employee.previous_appraisal_total_ctc_with_rewards ?? employee.Previous_Appraisal_total_CTC_with_rewards ?? employee.budget_base;
      const hasPreviousCtc = previousCtcValue !== null && previousCtcValue !== undefined && String(previousCtcValue).trim() !== "";
      stats.base += hasPreviousCtc
        ? num(previousCtcValue)
        : num(employee.current_annual_base_pay ?? employee.currentAnnualBasePay ?? employee.current_base_pay ?? employee.base_pay ?? employee.basePay)
          + num(employee.hike_amount ?? employee.hikeAmount ?? employee.current_hike_amount)
          + num(employee.allocated_pb_amount ?? employee.allocatedPBAmount ?? employee.allocated_pb ?? 0)
          + num(employee.new_pb_to_be_offered ?? employee.newPBToBeOffered ?? employee.current_performance_bonus ?? 0)
          + num(employee.new_rb ?? employee.newRB ?? employee.current_retention_bonus ?? 0);
      stats.utilized += employeeUtilized(employee);
      managerStats.set(key, stats);
    });
    const savedKeys = new Set(liveComps.map((live) => ownerKey(resolveManager(live.comp_manager))));
    const unsaved = Array.from(managerStats.entries())
      .filter(([key]) => key && !savedKeys.has(key))
      .map(([, stats]) => ({ id: "", comp_manager: stats.name, percentage: 0, budget_base: stats.base, calculated_budget: 0, applied_budget: 0, total_utilization: stats.utilized }));
    return liveComps.concat(unsaved).map((live) => {
      const pct = num(live.percentage);
      const resolvedName = resolveManager(live.comp_manager);
      const stats = managerStats.get(ownerKey(resolvedName)) || { count: 0, base: 0, utilized: 0, name: resolvedName || live.comp_manager };
      // When the manager exists in the current eligible Appraisal Sheet roster,
      // its CTC base must come from that live roster, even when the saved row has
      // a non-zero but stale budget_base. Keep saved fallback only for orphan rows.
      const hasCurrentRoster = managerStats.has(ownerKey(resolvedName));
      const base = hasCurrentRoster
        ? stats.base
        : (num(live.budget_base) || (pct ? num(live.calculated_budget) * 100 / pct : 0));
      const original = num(live.calculated_budget);
      const updated = num(live.applied_budget);
      const managerName = String(stats.name || resolvedName || "Unassigned Comp Manager").trim();
      const managerLog = log.filter((entry) => ownerKey(resolveManager(entry.name)) === ownerKey(managerName));
      const history = [
        { date: "", amount: original, team: stats.count, pct },
        ...managerLog.map((entry) => ({ date: entry.date, amount: num(entry.after), team: stats.count, pct: num(entry.to) })),
      ];
      return {
        name: managerName,
        pct, pct0: pct, base,
        // Keep the baseline count fixed only as historical reference; the current
        // count always reflects the current eligible Appraisal Sheet roster.
        team0: live.original_headcount !== null && live.original_headcount !== undefined && String(live.original_headcount).trim() !== ""
          ? num(live.original_headcount)
          : live.allocation_headcount !== null && live.allocation_headcount !== undefined && String(live.allocation_headcount).trim() !== ""
            ? num(live.allocation_headcount)
            : stats.count,
        team: stats.count,
        original, updated, liveId: live.id,
        liveCalculated: original, liveApplied: updated,
        liveUtilized: stats.utilized,
        lastChanged: managerLog.length ? managerLog[managerLog.length - 1].date : "",
        history,
      };
    });
  }, [liveComps, employeeRows, techOwnerKey, log, techEdOwners]);

  const assignedTeam = useMemo(() => employeeRows.filter((employee) => {
    if (employee.in_appraisal_sheet !== true) return false;
    const raw = employee.appraiser_tech_ed_row_id || employee.appraiser_tech_ed_appraisal_sheet || employee.appraiser_tech_ed || employee.appraiser_tech_ed_id || employee.appraiser_tech_ed1 || employee.tech_ed || employee.tech_ed_id || "";
    const linked = techEdOwners.find((item) =>
      [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id].filter(Boolean)
        .some((alias) => ownerMatches(alias, raw))
    );
    const assignment = String(linked?.assignment || raw).trim();
    return Boolean(techOwnerKey) && ownerKey(assignment) === techOwnerKey && isActiveAndEligible(employee);
  }), [employeeRows, techOwnerKey, techEdOwners]);
  const allTeam = assignedTeam;
  const myPct = liveTech ? num(liveTech.percentage) : 0;
  const myOriginal = liveTech ? num(liveTech.calculated_budget) : 0;
  const myUpdated = liveTech ? num(liveTech.applied_budget) : 0;
  // Original headcount is the allocation-time snapshot stored by HR; current
  // headcount is always recomputed from the current Appraisal Sheet roster.
  const currentTeamCount = allTeam.length;
  const savedTeamCount = liveTech?.original_headcount !== null && liveTech?.original_headcount !== undefined && String(liveTech.original_headcount).trim() !== ""
    ? liveTech.original_headcount
    : liveTech?.allocation_headcount;
  const team0 = savedTeamCount !== null && savedTeamCount !== undefined && String(savedTeamCount).trim() !== ""
    ? num(savedTeamCount)
    : currentTeamCount;
  const allotted = cmNodes.reduce((s, n) => s + n.updated, 0);
  const used = assignedTeam.reduce((sum, employee) => sum + employeeUtilized(employee), 0);
  const usedPct = myUpdated ? (used / myUpdated) * 100 : 0;
  const over = usedPct > 100;

  // Tech ED history: own budget per date, rolled up with the Comp Managers.
  const myHistory = useMemo(() => [{
    date: "", allocated: myOriginal, updated: myUpdated, team: team0,
    allotted, buffer: myUpdated - allotted,
  }], [myOriginal, myUpdated, team0, allotted]);

  const auditFor = (names) => {
    const out = [];
    names.forEach((name) => {
      if (name === myName && liveTech) {
        out.push({ date: "", time: "", name, from: null, to: myPct, before: null, after: myOriginal, by: "Data Store", reason: "Current saved allocation" });
        return;
      }
      const node = cmNodes.find((item) => item.name === name);
      if (node) out.push({ date: "", time: "", name, from: null, to: node.pct0, before: null, after: node.original, by: "Data Store", reason: "Current saved allocation" });
    });
    log.forEach((entry) => { if (names.includes(entry.name)) out.push(entry); });
    return out.sort((a, b) => byDate(b, a));
  };

  async function setPct(name, raw) {
    const node = cmNodes.find((x) => x.name === name);
    setDrafts((d) => {
      const next = { ...d };
      delete next[name];
      return next;
    });
    if (!node) return;
    const to = Math.round(Number(raw) * 10) / 10;
    if (!Number.isFinite(to) || to < 0 || to > 100) {
      setErr("Enter an allotment percentage between 0 and 100 for " + name + ".");
      return;
    }
    if (to === node.pct) return;
    const newUpd = (node.base * to) / 100;
    const sum = allotted - node.updated + newUpd;
    if (sum > myUpdated + 0.5) {
      setErr(
        "Blocked: " + to + "% for " + name + " would take total allotted to " + lakh(sum) + ", which is " +
          lakh(sum - myUpdated) + " more than your available Tech-Ed budget of " + lakh(myUpdated) + ".",
      );
      return;
    }
    const t = nowParts();
    if (!liveTech?.id) {
      setErr("Your Tech-Ed budget allocation is not saved yet, so Comp Manager budgets cannot be allotted.");
      return;
    }
    try {
      // No saved row yet: the API creates it under this Tech-ED's allocation.
      await updateBudget(node.liveId || "", {
        percentage: to,
        budget_base: node.base,
        // Keep the initial Comp Manager allocation frozen after the first save.
        calculated_budget: node.liveId ? node.original : newUpd,
        applied_budget: newUpd,
        comp_manager: name,
        ...(node.liveId ? {} : { budget_distribution_id: liveTech.id }),
      }, "comp");
    } catch (error) {
      setErr(error.message || "Failed to save Comp Manager budget.");
      return;
    }
    setAuditState((state) => ({
      key: auditStorageKey,
      entries: [
        ...(state.key === auditStorageKey ? state.entries : []),
        { name, from: node.pct, to, by: myName, date: t.date, time: t.time, before: node.updated, after: newUpd, reason: reason.trim() },
      ],
    }));
    setReason("");
    setErr("");
  }

  const paneHead = (k, title, count) => (
    <button type="button" className="pane-head" aria-expanded={pane[k]} onClick={() => setPane((p) => ({ ...p, [k]: !p[k] }))}>
      <span>
        {title}
        {count ? <span className="cnt">{count}</span> : null}
      </span>
      <span className="chev">{pane[k] ? "▾" : "▸"}</span>
    </button>
  );

  const cmLabel = LEVELS[1] + (cmNodes.length === 1 ? "" : "s");
  const auditNames = [myName, ...cmNodes.map((c) => c.name)];
  let auditList = auditFor(auditNames);
  if (auditFilter !== "all") auditList = auditList.filter((x) => x.name === auditFilter);
  const selfOpen = !!trailOpen[myName];

  return (
    <div className="tbd-root">
      <style>{CSS}</style>

      {cycleLoading ? (
        <div className="berr">Loading active appraisal cycle and Tech-Ed allocation…</div>
      ) : null}
      {!cycleLoading && !liveTech ? (
        <div className="berr">
          {loginTechOwner
            ? "HR has not allocated your budget for the active appraisal cycle yet. Your Comp Managers are listed below; Allot % can be set once HR applies the budget in Budget Master."
            : "No matching Tech-Ed budget was found for this login in the active appraisal cycle. Check that the signed-in account matches the Appraiser Tech-ED value in Appraisal Sheet."}
        </div>
      ) : null}
      <div className="btop">
        <span>
          Appraisal cycle <b>{cycleLabel || "Cycle name unavailable"}</b>
        </span>
        <span className="sep" />
        <span>
          Tech-Ed allocation from Budget Master · updated {lakh(myUpdated)}
        </span>
        <span className="sep" />
        <span>
          <b>{LEVELS[0]}</b>
        </span>
        <span className="sep" />
        <span className="applied">
          Budget applied by HR: <b>{myPct}%</b> = <b>{lakh(myUpdated)}</b> updated · original{" "}
          {lakh(myOriginal)}
          <button type="button" className="dd" aria-expanded={appliedOpen} onClick={() => setAppliedOpen((v) => !v)}>
            % history {appliedOpen ? "▴" : "▾"}
          </button>
        </span>
      </div>
      {appliedOpen && (
        <div className="apdrop">
          <AuditTable list={auditFor([myName])} showName={false} />
        </div>
      )}

      <div className="card">
        {paneHead("mine", "My Budget")}
        {pane.mine && (
          <>
            <div className="bsum flat">
              <div>
                <div className="f-label">Original allotted</div>
                <div className="v">{lakh(myOriginal)}</div>
                <div className="d mut">Fixed at allocation</div>
              </div>
              <div>
                <div className="f-label">Updated budget</div>
                <div className="v">{lakh(myUpdated)}</div>
                <div className="d">
                  <Chg d={myUpdated - myOriginal} />
                </div>
              </div>
              <div>
                <div className="f-label">Team size</div>
                <div className="v">
                  {team0} → {currentTeamCount}
                </div>
                <div className="d mut">At allocation → now</div>
              </div>
              <div>
                <div className="f-label">Allotted to reports</div>
                <div className="v">{lakh(allotted)}</div>
              </div>
              <div>
                <div className="f-label">Buffer</div>
                <div className="v">{lakh(myUpdated - allotted)}</div>
                <div className="d mut">Not passed down</div>
              </div>
              <div>
                <div className="f-label">Utilised</div>
                <div className={"v" + (over ? " over" : "")}>
                  {lakh(used)} ({usedPct.toFixed(0)}%)
                </div>
                <div className="d">
                  {over ? <span className="over">▲ {lakh(used - myUpdated)} over</span> : <span className="mut">Remaining {lakh(myUpdated - used)}</span>}
                </div>
              </div>
            </div>
            <div className="ubar-wide">
              <div className={"ubar" + (over ? " over" : "")}>
                <span style={{ width: Math.min(usedPct, 100) + "%" }} />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card">
        {paneHead("alloc", "Allocation", cmNodes.length + " " + cmLabel)}
        {pane.alloc && (
          <>
            <div className="reason">
              <label htmlFor="tbdReason">Reason for next % change</label>
              <input id="tbdReason" type="text" value={reason} placeholder="Optional — saved in the audit trail" onChange={(e) => setReason(e.target.value)} />
            </div>
            {err && (
              <div className="berr" role="alert">
                <span>{err}</span>
                <button type="button" className="link" onClick={() => setErr("")}>
                  Dismiss
                </button>
              </div>
            )}
            <div className="bscroll">
              <table className="bal">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Owner</th>
                    <th className="r">Original Budget</th>
                    <th className="r">Updated Budget</th>
                    <th className="r">Change</th>
                    <th className="r">Original Count</th>
                    <th className="r">Current Count</th>
                    <th>Last Changed</th>
                    <th className="r">Allot %</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="self">
                    <td className="first">{LEVELS[0]}</td>
                    <td>
                      <b>{String(loginTechOwner).split(/\s+-\s+/)[1] || myName}</b> <span className="muted-small">(you)</span>
                    </td>
                    <td className="r">{lakh(myOriginal)}</td>
                    <td className="r">{lakh(myUpdated)}</td>
                    <td className="r">
                      <ChangeCell from={myOriginal} to={myUpdated} />
                    </td>
                    <td className="r">{team0}</td>
                    <td className="r">{currentTeamCount}</td>
                    <td>
                      <button
                        type="button"
                        className="dd"
                        aria-expanded={selfOpen}
                        title={(selfOpen ? "Hide" : "Show") + " budget history"}
                        onClick={() => setTrailOpen((t) => ({ ...t, [myName]: !t[myName] }))}
                      >
                        {dateText(myHistory[myHistory.length - 1].date)} {selfOpen ? "▴" : "▾"}
                      </button>
                    </td>
                    <td className="r">
                      <span className="mut">{myPct}%</span>
                    </td>
                  </tr>
                  {selfOpen && (
                    <tr className="tr">
                      <td colSpan={9}>
                        <table className="trail" style={{ maxWidth: 820 }}>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th className="n">Allocated</th>
                              <th className="n">Updated</th>
                              <th className="n">Team size</th>
                              <th className="n">Allotted to {LEVELS[1]}s</th>
                              <th className="n">Buffer</th>
                            </tr>
                          </thead>
                          <tbody>
                            {myHistory.map((x) => (
                              <tr key={x.date}>
                                <td>{dateText(x.date)}</td>
                                <td className="n">{lakh(x.allocated)}</td>
                                <td className="n">{lakh(x.updated)}</td>
                                <td className="n">{x.team}</td>
                                <td className="n">{lakh(x.allotted)}</td>
                                <td className="n">{lakh(x.buffer)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                  {cmNodes.map((n, i) => {
                    const open = !!trailOpen[n.name];
                    return (
                      <Fragment key={n.name}>
                        <tr className={i > 0 ? "grp" : ""}>
                          <td>
                            <span style={{ display: "inline-block", width: 18 }} />
                            {LEVELS[1]}
                          </td>
                          <td>
                            <b>{n.name}</b>
                          </td>
                          <td className="r">{lakh(n.original)}</td>
                          <td className="r">{lakh(n.updated)}</td>
                          <td className="r">
                            <ChangeCell from={n.original} to={n.updated} />
                          </td>
                          <td className="r">{n.team0}</td>
                          <td className="r">{n.team}</td>
                          <td>
                            {n.history.length > 1 ? (
                              <button
                                type="button"
                                className="dd"
                                aria-expanded={open}
                                title={(open ? "Hide" : "Show") + " budget history"}
                                onClick={() => setTrailOpen((t) => ({ ...t, [n.name]: !t[n.name] }))}
                              >
                                {dateText(n.lastChanged)} {open ? "▴" : "▾"}
                              </button>
                            ) : (
                              <span className="mut">—</span>
                            )}
                          </td>
                          <td className="r">
                            <input
                              className="pct-in"
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              aria-label={"Allot % for " + n.name}
                              disabled={!liveTech}
                              title={liveTech ? undefined : "Available once HR allocates your budget"}
                              value={drafts[n.name] ?? n.pct}
                              onChange={(e) => setDrafts((d) => ({ ...d, [n.name]: e.target.value }))}
                              onBlur={(e) => setPct(n.name, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                            />
                          </td>
                        </tr>
                        {open && (
                          <tr className="tr">
                            <td colSpan={9}>
                              <table className="trail" style={{ maxWidth: 560 }}>
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th className="n">Allocated</th>
                                    <th className="n">Updated</th>
                                    <th className="n">Team size</th>
                                    <th className="n">Allot %</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {n.history.map((x) => (
                                    <tr key={x.date}>
                                      <td>{dateText(x.date)}</td>
                                      <td className="n">{lakh(n.original)}</td>
                                      <td className="n">{lakh(x.amount)}</td>
                                      <td className="n">{x.team}</td>
                                      <td className="n">{x.pct}%</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="note">
              Budget base = Current Annual Base Pay + Allocated PB Amount of each {LEVELS[1]}'s team · Utilised = {UTILISED_LABEL}
            </div>
          </>
        )}
      </div>

      <div className="card">
        {paneHead("audit", "% Applied — audit trail (you and your " + cmLabel + ")")}
        {pane.audit && (
          <>
            <div className="reason">
              <label>
                Owner{" "}
                <select value={auditFilter} onChange={(e) => setAuditFilter(e.target.value)}>
                  <option value="all">All</option>
                  {auditNames.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="audit-wrap">
              <AuditTable list={auditList} showName />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const CSS = `
.tbd-root { max-width: 1320px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 8px;
  font-family: "IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif; font-size: 12.5px; color: #0f1f33; font-variant-numeric: tabular-nums; }
.tbd-root * { box-sizing: border-box; }
.tbd-root .demo-banner { border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; border-radius: 6px; padding: 5px 10px; font-size: 11.5px; }
.tbd-root .mut { color: #64748b; }
.tbd-root .muted-small { font-size: 11px; color: #475569; }
.tbd-root .up { color: #15803d; } .tbd-root .down { color: #c2410c; } .tbd-root .over { color: #c2410c; font-weight: 700; }
.tbd-root .card { background: #fff; border: 1px solid #d3dbe6; border-radius: 10px; box-shadow: 0 1px 2px rgba(18,48,79,.06); overflow: hidden; }
.tbd-root .card.empty { padding: 22px 16px; color: #64748b; }
.tbd-root .btop { background: #fff; border: 1px solid #d4dbe5; border-left: 4px solid #14a3a3; border-radius: 8px; display: flex; gap: 16px;
  align-items: center; flex-wrap: wrap; padding: 8px 14px; color: #334155; }
.tbd-root .btop .sep { width: 1px; align-self: stretch; background: #d7dce3; }
.tbd-root .applied { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tbd-root .applied b, .tbd-root .btop b { color: #12304f; }
.tbd-root .apdrop { background: #f7f9fc; border: 1px solid #d4dbe5; border-radius: 8px; padding: 8px 14px; animation: tbd-pull 160ms ease-out; }
.tbd-root .pane-head { width: 100%; display: flex; align-items: center; justify-content: space-between; background: #12304f; color: #fff; border: 0;
  padding: 10px 16px; font-family: inherit; font-size: 13.5px; font-weight: 600; letter-spacing: .15px; cursor: pointer; text-align: left; }
.tbd-root .pane-head .cnt { font-weight: 400; color: #d6e4f5; margin-left: 8px; }
.tbd-root .pane-head .chev { font-size: 12px; }
.tbd-root .bsum { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.tbd-root .bsum > div { padding: 12px 16px; border-right: 1px solid #d7dce3; border-top: 3px solid transparent; }
.tbd-root .bsum > div:nth-child(2) { background: #0e7c6b; border-top-color: #0a5c4f; border-right-color: #0e7c6b; }
.tbd-root .bsum > div:nth-child(2) .f-label,
.tbd-root .bsum > div:nth-child(2) .v,
.tbd-root .bsum > div:nth-child(2) .d { color: #fff; }
.tbd-root .bsum > div:nth-child(2) .d { opacity: .88; }
.tbd-root .bsum > div:last-child { border-right: 0; }
.tbd-root .f-label { font-size: 11px; color: #5b6b80; font-weight: 500; }
.tbd-root .bsum .v { font-size: 18px; font-weight: 600; color: #12304f; margin-top: 2px; }
.tbd-root .bsum .v.over { color: #c2410c; }
.tbd-root .bsum .d { font-size: 11px; margin-top: 2px; }
.tbd-root .ubar-wide { margin: 0 16px 14px; }
.tbd-root .ubar { height: 8px; background: #e6ebf2; border-radius: 3px; overflow: hidden; }
.tbd-root .ubar > span { display: block; height: 100%; background: linear-gradient(90deg, #14a3a3, #1b6fb5); }
.tbd-root .ubar.over > span { background: #d9480f; }
.tbd-root .reason { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid #e1e5eb; font-size: 12px; color: #475569; }
.tbd-root .reason input { flex: 1; max-width: 420px; height: 28px; border: 1px solid #cbd3df; border-radius: 4px; padding: 0 8px; font-size: 12.5px; }
.tbd-root .reason select { height: 28px; border: 1px solid #cbd3df; border-radius: 4px; padding: 0 6px; font-size: 12.5px; background: #fff; }
.tbd-root .berr { margin: 10px 16px; background: #fff; border: 1px solid #e3e8ef; border-left: 4px solid #c2410c; color: #7c2d12; border-radius: 6px;
  padding: 7px 10px; font-size: 12px; display: flex; justify-content: space-between; gap: 10px; }
.tbd-root .link { background: none; border: 0; padding: 0; color: #1859a8; font-size: 11.5px; font-weight: 700; cursor: pointer; }
.tbd-root .bscroll { overflow-x: auto; }
.tbd-root table.bal { width: 100%; min-width: 980px; border-collapse: collapse; font-size: 12.5px; }
.tbd-root .bal th { background: #e8eef5; color: #12304f; font-weight: 600; font-size: 12px; text-align: left; padding: 8px 10px; border-bottom: 2px solid #9fb3cf; white-space: nowrap; }
.tbd-root .bal td { padding: 7px 10px; border-bottom: 1px solid #e1e5eb; vertical-align: middle; }
.tbd-root .bal .r { text-align: right; }
.tbd-root .bal tr.self td { background: #e9f4f4; font-weight: 700; }
.tbd-root .bal tr.self td.first { box-shadow: inset 4px 0 0 #14a3a3; }
.tbd-root .bal tr.grp td { border-top: 2px solid #9fb3cf; }
.tbd-root .bal tr.tr td { background: #f7f9fc; padding: 8px 12px 12px 40px; animation: tbd-pull 160ms ease-out; }
.tbd-root .pct-in { width: 64px; height: 26px; border: 1px solid #9fb3cf; border-radius: 4px; text-align: right; padding: 0 6px; font-size: 12.5px; background: #fffef5; }
.tbd-root .pct-in:focus { outline: 2px solid #14a3a3; outline-offset: 1px; }
.tbd-root .dd { border: 1px solid #c5d0dd; background: #fff; color: #17365d; border-radius: 4px; padding: 3px 8px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.tbd-root .dd[aria-expanded="true"] { background: #12304f; border-color: #12304f; color: #fff; }
.tbd-root .trail { width: 100%; border-collapse: collapse; font-size: 12px; }
.tbd-root .trail th { text-align: left; font-weight: 700; color: #1e3a5f; font-size: 11px; padding: 4px 8px; border-bottom: 1px solid #d7dce3; }
.tbd-root .trail td { padding: 4px 8px; border-bottom: 1px solid #edf0f4; }
.tbd-root .trail .n { text-align: right; }
.tbd-root .audit-wrap { padding: 8px 14px 12px; }
.tbd-root .audit-wrap .trail td, .tbd-root .audit-wrap .trail th { padding: 6px 8px; }
.tbd-root .note { padding: 6px 14px 10px; font-size: 11px; color: #64748b; }
@keyframes tbd-pull { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .tbd-root .apdrop, .tbd-root .bal tr.tr td { animation: none; } }
`;
