import { Fragment, useEffect, useMemo, useState } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";
import { useBudget } from "@/lib/budget-store";
import { useViewAs, managerIdentityMatches, currentUserMatchesManager } from "@/lib/view-as-store";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { splitStamp } from "@/lib/budget-audit-local";
import { FilterStatus, FilterTh, ResizableCols, filterTableCss, resizableTableStyle, useColumnResize, useTableFilters } from "./FilterableTable";

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
  return p.length === 3 && MONTHS[Number(p[1]) - 1] ? p[2] + "-" + MONTHS[Number(p[1]) - 1] + "-" + p[0] : iso || "—";
}
const byDate = (a, b) => String((a.date || "") + (a.time || "")).localeCompare(String((b.date || "") + (b.time || "")));
const stampText = (x) => (x && x.date ? dateText(x.date) + (x.time ? " " + x.time : "") : "—");

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

const auditCols = (showName) => [
  { key: "date", label: "Date", kind: "text", get: (x) => stampText(x), sort: (x) => String(x.date || "") + String(x.time || "") },
  ...(showName ? [{ key: "owner", label: "Owner", kind: "text", get: (x) => x.name || "" }] : []),
  { key: "from", label: "Old %", kind: "number", n: true, get: (x) => (x.from == null ? "" : x.from) },
  { key: "to", label: "New %", kind: "number", n: true, get: (x) => (x.to == null ? "" : x.to) },
  { key: "before", label: "Budget Before", kind: "number", n: true, get: (x) => (x.before == null ? "" : x.before) },
  { key: "after", label: "Budget After", kind: "number", n: true, get: (x) => (x.after == null ? "" : x.after) },
  { key: "by", label: "Changed By", kind: "text", get: (x) => x.by || "" },
  { key: "reason", label: "Reason", kind: "text", get: (x) => x.reason || "" },
];
const AUDIT_W = { date: 130, owner: 190, from: 64, to: 64, before: 96, after: 96, by: 150, reason: 220 };
const ALLOC_W = { level: 96, owner: 190, base: 104, original: 104, updated: 104, change: 140, team0: 70, team: 70, last: 120, pct: 72 };
const AUDIT_COLS = { with: auditCols(true), without: auditCols(false) };

function AuditTable({ list, showName }) {
  const cols = showName ? AUDIT_COLS.with : AUDIT_COLS.without;
  const tf = useTableFilters(list, cols);
  const rz = useColumnResize(AUDIT_W);
  const keys = cols.map((c) => c.key);
  if (!list.length) return <div className="muted-small" style={{ padding: "6px 0" }}>No % changes yet.</div>;
  return (
    <>
      <FilterStatus tf={tf} noun="changes" />
      <div className="bscroll">
        <table className="trail trail-grid" style={resizableTableStyle(rz, keys)}>
          <ResizableCols rz={rz} keys={keys} />
          <thead>
            <tr>
              {cols.map((c) => (
                <FilterTh key={c.key} tf={tf} rz={rz} col={c} className={c.n ? "n" : ""} />
              ))}
            </tr>
          </thead>
          <tbody>
            {tf.rows.length === 0 && (
              <tr className="ft-empty">
                <td colSpan={cols.length}>No changes match the filters.</td>
              </tr>
            )}
            {tf.rows.map((x, i) => (
              <tr key={i}>
                <td>{stampText(x)}</td>
                {showName && <td style={{ fontWeight: 700 }}>{x.name}</td>}
                <td className="n">{x.from == null ? "—" : x.from + "%"}</td>
                <td className="n" style={{ fontWeight: 700 }}>{x.to == null ? "—" : x.to + "%"}</td>
                <td className="n">{x.before == null ? "—" : lakh(x.before)}</td>
                <td className="n">{x.after == null ? "—" : lakh(x.after)}</td>
                <td>{x.by}</td>
                <td>{x.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const ALLOC_COLS = [
  { key: "level", label: "Level", kind: "text", get: (i) => i.level },
  { key: "owner", label: "Owner", kind: "text", get: (i) => i.owner },
  { key: "base", label: "Budget Base", kind: "number", r: true, get: (i) => i.base },
  { key: "original", label: "Original Budget", kind: "number", r: true, get: (i) => i.original },
  { key: "updated", label: "Updated Budget", kind: "number", r: true, get: (i) => i.updated },
  { key: "change", label: "Change", kind: "number", r: true, get: (i) => i.change },
  { key: "team0", label: "Original Count", kind: "number", r: true, get: (i) => i.team0 },
  { key: "team", label: "Current Count", kind: "number", r: true, get: (i) => i.team },
  { key: "last", label: "Last Changed", kind: "text", get: (i) => i.last, sort: (i) => i.lastSort },
  { key: "pct", label: "Allot %", kind: "number", r: true, get: (i) => i.pct },
];

export function TechEdBudgetDistribution() {
  const user = useCatalystUser();
  const { effectiveId, actualId } = useViewAs();
  const isCompManagerPreview = effectiveId === "compmanager" && actualId === "teched";
  const roleText = String(user?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isCompManagerLogin = actualId === "compmanager" || roleText === "compmgr" || roleText === "compmanager";
  const isCompManagerView = isCompManagerPreview || isCompManagerLogin;
  const {
    budgetDistributionRows,
    budgetCompManagerRows,
    budgetMasterRows,
    employeeRows = [],
    techEdOwners = [],
    totals: sharedBudgetTotals,
    updateBudget,
    budgetAuditLog = [],
    loading: budgetLoading,
    error: budgetError,
  } = useBudget();
  const myName = user?.name || "Unknown user";
  const [cycleRows, setCycleRows] = useState([]);
  const [activeCycleId, setActiveCycleId] = useState("");
  const [cycleLoading, setCycleLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadCycles = () => {
      // Never leave a closed cycle selected while the refreshed list is loading.
      setCycleRows([]);
      setActiveCycleId("");
      setCycleLoading(true);
      payrollCycleRequest("cycles")
        .then((cycles) => {
          if (!mounted) return;
          const allCycles = Array.isArray(cycles) ? cycles : [];
          setCycleRows(allCycles);
          const active = allCycles.find((cycle) => {
            const status = String(cycle.status ?? cycle.cycle_status ?? "").trim().toLowerCase();
            const archived = [true, 1, "true", "1", "yes"].includes(
              typeof cycle.archived === "string" ? cycle.archived.trim().toLowerCase() : cycle.archived,
            );
            return status === "active" && !archived && !cycle.hidden;
          });
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
    };
    loadCycles();
    if (typeof window !== "undefined") {
      window.addEventListener("appraisal:cycle-updated", loadCycles);
    }
    return () => {
      mounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("appraisal:cycle-updated", loadCycles);
      }
    };
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
    let candidates = directMatches.length ? directMatches : assignmentMatches;

    // For a real Comp Manager login, resolve the parent Tech-Ed from the
    // manager's CURRENT Appraisal Sheet assignments, not from the manager's
    // own login identity. This supports every manager account dynamically.
    if (isCompManagerLogin && !candidates.length) {
      const matchesCurrentManager = (raw) => {
        if (currentUserMatchesManager(raw, user, employeeRows)) return true;
        const rawKey = normalizeOwner(
          raw && typeof raw === "object"
            ? raw.ROWID || raw.rowid || raw.id || raw.value || ""
            : raw
        );
        if (!rawKey) return false;
        const linkedManager = employeeRows.find((employee) =>
          [employee.row_id, employee.ROWID, employee.ROW_ID, employee.id,
            employee.emp_id, employee.employee_id, employee.employeeId]
            .some((alias) => normalizeOwner(alias) === rawKey)
        );
        if (!linkedManager) return false;
        const display = [
          linkedManager.emp_id || linkedManager.employee_id || linkedManager.employeeId,
          linkedManager.emp_name || linkedManager.employee_name || linkedManager.name,
        ].filter(Boolean).join(" - ");
        return currentUserMatchesManager(display, user, employeeRows);
      };
      const managerEmployees = employeeRows.filter((employee) =>
        employee.in_appraisal_sheet === true &&
        matchesCurrentManager(
          employee.comp_manager || employee.comp_manager_id || employee.compManager ||
            employee.comp_manager_display || employee.comp_manager_name || ""
        )
      );
      const managerTechOwners = Array.from(new Set(managerEmployees.map((employee) => {
        const raw = employee.appraiser_tech_ed_appraisal_sheet ||
          employee.appraiser_tech_ed || employee.appraiser_tech_ed_id ||
          employee.appraiser_tech_ed_row_id || employee.appraiser_tech_ed1 ||
          employee.tech_ed || employee.tech_ed_id || "";
        const linked = techEdOwners.find((owner) =>
          normalizeOwner(owner.row_id || owner.ROWID || "") === normalizeOwner(raw)
        );
        return normalizeOwner(linked?.assignment || raw);
      }).filter(Boolean)));
      candidates = allRows.filter((row) => {
        const raw = row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed ||
          row.appraiser_tech_ed || row.appraiser_tech_ed1 || "";
        const linked = techEdOwners.find((owner) =>
          normalizeOwner(owner.row_id || owner.ROWID || "") === normalizeOwner(raw)
        );
        return managerTechOwners.includes(normalizeOwner(linked?.assignment || raw));
      });
    }

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

    // Never fall back to an unscoped or archived-cycle allocation.
    return null;
  }, [
    budgetDistributionRows, budgetMasterRows, cycleRows, employeeRows, techEdOwners, myName,
    user?.name, user?.display_name, user?.first_name, user?.last_name,
    user?.email, user?.email_id, user?.user_id, user?.empId, user?.employeeId, user?.employee_id,
    activeCycleId, isCompManagerLogin, user?.role,
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
  useEffect(() => {
    setPane(isCompManagerView
      ? { mine: true, alloc: false, audit: false }
      : { mine: true, alloc: true, audit: true });
  }, [isCompManagerView]);
  const [appliedOpen, setAppliedOpen] = useState(false);
  const [trailOpen, setTrailOpen] = useState({});
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [auditFilter, setAuditFilter] = useState("all");
  const [drafts, setDrafts] = useState({});
  // Audit trail comes from the browser-side budget audit (budget-store.jsx),
  // limited to this Tech-ED's own row and the Comp Manager rows under it.
  const log = useMemo(() => {
    if (!liveTech) return [];
    const techId = String(liveTech.id);
    return budgetAuditLog.filter((entry) =>
      (entry.level === "techEd" && String(entry.rowId) === techId) ||
      (entry.level === "comp" && String(entry.parentId) === techId));
  }, [budgetAuditLog, liveTech]);

  const cmNodes = useMemo(() => {
    if (!activeCycleId || !techOwnerKey) return [];
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

      // Resolve a saved manager ID through current Appraisal Sheet rows and
      // use the canonical "employee ID - name" display label when available.
      const linkedManager = employeeRows.find((employee) =>
        employee.comp_manager_display &&
        [
          employee.comp_manager, employee.comp_manager_id, employee.compManager,
          employee.comp_manager_display, employee.comp_manager_name,
        ].filter(Boolean).some((alias) => ownerMatches(alias, parts))
      );
      if (linkedManager?.comp_manager_display) {
        const display = String(linkedManager.comp_manager_display).trim();
        if (display.includes(" - ")) return display;
      }

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
      const rawManager = employee.comp_manager || employee.comp_manager_id || employee.compManager || employee.comp_manager_name || employee.comp_manager_display || "";
      const manager = resolveManager(rawManager);
      if (!manager) return;
      if (isCompManagerView && !currentUserMatchesManager(manager, user, employeeRows)) return;
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
    // The parent Tech-Ed's budget base is the pool to distribute across
    // Comp Managers. Use the persisted base; for older rows derive it from the
    // original allocation and percentage when that is the only available value.
    const parentPct = num(liveTech?.percentage);
    const parentBudgetBase = num(liveTech?.budget_base) ||
      (parentPct > 0 ? num(liveTech?.calculated_budget) * 100 / parentPct : 0);
    const totalCurrentTeamCount = Array.from(managerStats.values()).reduce((sum, stats) => sum + stats.count, 0);

    // Saved allocation rows are not the roster. Show saved managers only if
    // they still exist in the current eligible Appraisal Sheet; add current
    // managers that have not yet received an allocation as dynamic rows.
    const matchingLiveComps = liveComps.filter((live) =>
      managerStats.has(ownerKey(resolveManager(live.comp_manager)))
    );

    // A Comp Manager must have only one allocation row per Tech-Ed + cycle.
    // Legacy duplicate rows can exist when the same manager was saved once by
    // ROWID and once by employee ID. Collapse them for this allocation view,
    // preferring the row with a real original-headcount snapshot, then latest
    // persisted update. Keep the chosen liveId so edits update that same row.
    const compByManager = new Map();
    matchingLiveComps.forEach((live) => {
      const key = ownerKey(resolveManager(live.comp_manager));
      const existing = compByManager.get(key);
      const hasSnapshot = (row) =>
        row.original_headcount !== null &&
        row.original_headcount !== undefined &&
        String(row.original_headcount).trim() !== "";
      const snapshotRank = (row) => hasSnapshot(row) ? 1 : 0;
      const timeRank = (row) => {
        const time = Date.parse(row.updated_at || row.created_at || "");
        return Number.isFinite(time) ? time : 0;
      };
      if (
        !existing ||
        snapshotRank(live) > snapshotRank(existing) ||
        (snapshotRank(live) === snapshotRank(existing) && timeRank(live) > timeRank(existing))
      ) {
        compByManager.set(key, live);
      }
    });
    const currentLiveComps = Array.from(compByManager.values());
    const savedKeys = new Set(currentLiveComps.map((live) => ownerKey(resolveManager(live.comp_manager))));
    const unsaved = Array.from(managerStats.entries())
      .filter(([key]) => key && !savedKeys.has(key))
      .map(([, stats]) => ({ id: "", comp_manager: stats.name, percentage: 0, budget_base: 0, calculated_budget: 0, applied_budget: 0, total_utilization: stats.utilized }));
    return currentLiveComps.concat(unsaved).map((live) => {
      const pct = num(live.percentage);
      const resolvedName = resolveManager(live.comp_manager);
      const stats = managerStats.get(ownerKey(resolvedName)) || { count: 0, base: 0, utilized: 0, name: resolvedName || live.comp_manager };
        // Comp Manager Budget Base is the sum of Previous_Appraisal_total_CTC_with_rewards
      // for that manager's current eligible Appraisal Sheet employees, matching
      // the Budget Master base calculation. Do not split the Tech-Ed pool by headcount.
      const hasCurrentRoster = managerStats.has(ownerKey(resolvedName));
      const base = hasCurrentRoster
        ? stats.base
        : (num(live.budget_base) || (pct ? num(live.calculated_budget) * 100 / pct : 0));
      const original = num(live.calculated_budget);
      const updated = num(live.applied_budget);
      const managerName = String(stats.name || resolvedName || "Unassigned Comp Manager").trim();
      const managerLog = live.id
        ? log.filter((entry) => entry.level === "comp" && String(entry.rowId) === String(live.id)).sort(byDate)
        : [];
      const savedAt = live.updated_at || live.created_at || "";
      const baseStamp = splitStamp(live.created_at || live.updated_at || "");
      const history = [
        {
          date: baseStamp.date, time: baseStamp.time, amount: original, team: stats.count,
          pct: managerLog.length && managerLog[0].from != null ? num(managerLog[0].from) : pct,
        },
        ...managerLog.map((entry) => ({ date: entry.date, time: entry.time, amount: num(entry.after), team: stats.count, pct: num(entry.to) })),
      ];
      const lastEntry = managerLog.length ? managerLog[managerLog.length - 1] : null;
      const lastStamp = lastEntry ? { date: lastEntry.date, time: lastEntry.time } : splitStamp(savedAt);
      return {
        name: managerName,
        pct, pct0: pct, base,
        // Keep the baseline count fixed only as historical reference; the current
        // count always reflects the current eligible Appraisal Sheet roster.
        // Original Count is the saved baseline only; never fill a missing
        // value from today's team size, which changes with eligibility/delegation.
        // The API handles legacy schemas. Never substitute a live/current count.
        team0: live.original_headcount !== null && live.original_headcount !== undefined && String(live.original_headcount).trim() !== ""
          ? num(live.original_headcount)
          : 0,
        // Current count follows the live eligible Appraisal Sheet roster;
        // persisted current_headcount can be stale after a delegation change.
        team: stats.count,
        original, updated, liveId: live.id,
        liveCalculated: original, liveApplied: updated,
        liveUtilized: stats.utilized,
        lastChanged: lastStamp.date,
        lastChangedTime: lastStamp.time,
        logCount: managerLog.length,
        savedAt,
        history,
      };
    });
  }, [liveComps, employeeRows, techOwnerKey, log, techEdOwners, activeCycleId, isCompManagerView, user, liveTech]);

  // A Tech-Ed preview may only see a Comp Manager allocation if the signed-in
  // employee is itself that Comp Manager. Never default to another manager.
  const selectedManagerNode = isCompManagerView ? (cmNodes[0] || null) : null;
  const selectedCompManager = selectedManagerNode?.name || "";

  const assignedTeam = useMemo(() => {
    if (!activeCycleId || !techOwnerKey) return [];
    return employeeRows.filter((employee) => {
      if (employee.in_appraisal_sheet !== true) return false;
      const raw = employee.appraiser_tech_ed_row_id || employee.appraiser_tech_ed_appraisal_sheet || employee.appraiser_tech_ed || employee.appraiser_tech_ed_id || employee.appraiser_tech_ed1 || employee.tech_ed || employee.tech_ed_id || "";
      const linked = techEdOwners.find((item) =>
        [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id].filter(Boolean)
          .some((alias) => ownerMatches(alias, raw))
      );
      const assignment = String(linked?.assignment || raw).trim();
      if (!(Boolean(techOwnerKey) && ownerKey(assignment) === techOwnerKey && isActiveAndEligible(employee))) return false;
      if (!isCompManagerView) return true;
      const manager = employee.comp_manager || employee.comp_manager_id || employee.compManager || employee.comp_manager_name || employee.comp_manager_display || "";
      return Boolean(selectedCompManager) && managerIdentityMatches(manager, selectedCompManager);
    });
  }, [employeeRows, techOwnerKey, techEdOwners, activeCycleId, isCompManagerView, selectedCompManager]);
  const allTeam = assignedTeam;
  const myPct = isCompManagerView ? num(selectedManagerNode?.pct) : (liveTech ? num(liveTech.percentage) : 0);
  // Use the same selected allocation row/value as Dashboard, Appraisal Sheet,
  // and Detail Screen so the Tech-Ed allocation cannot drift across screens.
  // A budget row can exist before HR applies a percentage. Do not present
  // that placeholder as an allocated/original budget until it has a real amount.
  const hasLiveAllocation = isCompManagerView
    ? Boolean(activeCycleId && selectedManagerNode?.liveId)
    : Boolean(
        activeCycleId &&
        liveTech &&
        (
          liveTech.percentage_is_set === true ||
          (liveTech.percentage !== null &&
            liveTech.percentage !== undefined &&
            String(liveTech.percentage).trim() !== "")
        )
      );
  const myOriginal = hasLiveAllocation
    ? (isCompManagerView
        ? num(selectedManagerNode?.original)
        : sharedBudgetTotals?.budgetScope === "teched"
          ? num(sharedBudgetTotals.base)
          : num(liveTech.calculated_budget))
    : null;
  const myUpdated = hasLiveAllocation
    ? (isCompManagerView
        ? num(selectedManagerNode?.updated)
        : sharedBudgetTotals?.budgetScope === "teched"
          ? num(sharedBudgetTotals.updated)
          : num(liveTech.applied_budget))
    : null;
  const parentBudgetBaseForDisplay = num(liveTech?.budget_base) ||
    (num(liveTech?.percentage) > 0
      ? num(liveTech?.calculated_budget) * 100 / num(liveTech?.percentage)
      : num(sharedBudgetTotals?.base));
  // Backend counts are calculated from the cycle-scoped eligible Appraisal Sheet
  // roster and persisted by budgetmasterapi. Prefer them so every screen agrees.
  // The rendered eligible Appraisal Sheet roster is the live source of truth.
  const currentTeamCount = allTeam.length;
  // Use only the immutable baseline returned by the API; headcount may
  // be a legacy/current field and must not replace Original Count here.
  const savedTeamCount = liveTech?.original_headcount;
  // Original Count is a persisted baseline. Never replace a missing baseline
  // with today's roster count, or it will appear to change with eligibility.
  const team0 = isCompManagerView
    ? num(selectedManagerNode?.team0)
    : savedTeamCount !== null && savedTeamCount !== undefined && String(savedTeamCount).trim() !== ""
      ? num(savedTeamCount)
      : 0;
  const allotted = isCompManagerView ? 0 : cmNodes.reduce((s, n) => s + n.updated, 0);
  const used = assignedTeam.reduce((sum, employee) => sum + employeeUtilized(employee), 0);
  const usedPct = myUpdated ? (used / myUpdated) * 100 : 0;
  const over = usedPct > 100;

  // Tech ED history: newest first. The latest row carries today's roll-up;
  // older rows come from the audit trail (amount after each change).
  const myHistory = useMemo(() => {
    const mine = log.filter((entry) => entry.level === "techEd").sort((a, b) => byDate(b, a));
    const saved = splitStamp(liveTech?.updated_at || liveTech?.created_at || "");
    const current = {
      date: mine.length ? mine[0].date : saved.date,
      time: mine.length ? mine[0].time : saved.time,
      allocated: myOriginal, updated: myUpdated, team: team0,
      allotted, buffer: myUpdated - allotted,
    };
    const older = mine.slice(1).map((entry) => ({
      date: entry.date, time: entry.time, allocated: myOriginal, updated: entry.after,
      team: team0, allotted: null, buffer: null,
    }));
    return [current, ...older];
  }, [log, liveTech, myOriginal, myUpdated, team0, allotted]);

  const auditFor = (names) => {
    const out = [];
    if (liveTech && names.includes(myName)) {
      const mine = log.filter((entry) => entry.level === "techEd").map((entry) => ({ ...entry, name: myName }));
      if (mine.length) out.push(...mine);
      else {
        const saved = splitStamp(liveTech.updated_at || liveTech.created_at || "");
        out.push({ date: saved.date, time: saved.time, name: myName, from: null, to: myPct, before: null, after: myOriginal, by: "Data Store", reason: "Current saved allocation" });
      }
    }
    cmNodes.forEach((node) => {
      if (!names.includes(node.name)) return;
      const mine = node.liveId
        ? log.filter((entry) => entry.level === "comp" && String(entry.rowId) === String(node.liveId)).map((entry) => ({ ...entry, name: node.name }))
        : [];
      if (mine.length) out.push(...mine);
      else {
        const saved = splitStamp(node.savedAt);
        out.push({ date: saved.date, time: saved.time, name: node.name, from: null, to: node.pct0, before: null, after: node.original, by: "Data Store", reason: "Current saved allocation" });
      }
    });
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
    const firstAllocation = !node.liveId || !(num(node.original) > 0);
    const nextOriginal = firstAllocation ? newUpd : node.original;
    const sum = allotted - node.updated + newUpd;
    if (sum > myUpdated + 0.5) {
      setErr(
        "Blocked: " + to + "% for " + name + " would take total allotted to " + lakh(sum) + ", which is " +
          lakh(sum - myUpdated) + " more than your available Tech-Ed budget of " + lakh(myUpdated) + ".",
      );
      return;
    }
    if (!liveTech?.id) {
      setErr("Your Tech-Ed budget allocation is not saved yet, so Comp Manager budgets cannot be allotted.");
      return;
    }
    try {
      // No saved row yet: the API creates it under this Tech-ED's allocation.
      await updateBudget(node.liveId || "", {
        percentage: to,
        budget_base: node.base,
        // Freeze Original Budget at the first real allocation. Later % changes
        // update only Updated Budget using the current allocated Budget Base.
        calculated_budget: nextOriginal,
        applied_budget: newUpd,
        comp_manager: name,
        audit_reason: reason.trim(),
        ...(node.liveId ? {} : { budget_distribution_id: liveTech.id }),
      }, "comp");
    } catch (error) {
      setErr(error.message || "Failed to save Comp Manager budget.");
      return;
    }
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

  // Rows behind the Allocation table's column filters (display only).
  const allocItems = [
    {
      self: true,
      level: LEVELS[0],
      owner: String(loginTechOwner).split(/\s+-\s+/)[1] || myName,
      base: hasLiveAllocation ? parentBudgetBaseForDisplay : "",
      original: hasLiveAllocation ? myOriginal : "",
      updated: hasLiveAllocation ? myUpdated : "",
      change: hasLiveAllocation ? myUpdated - myOriginal : "",
      team0,
      team: currentTeamCount,
      last: dateText(myHistory[0].date),
      lastSort: String(myHistory[0].date || "") + String(myHistory[0].time || ""),
      pct: myPct,
    },
    ...cmNodes.map((n) => ({
      node: n,
      level: LEVELS[1],
      owner: n.name,
      base: n.liveId || n.base ? n.base : "",
      original: n.liveId || n.original ? n.original : "",
      updated: n.liveId || n.updated ? n.updated : "",
      change: n.updated - n.original,
      team0: n.team0,
      team: n.team,
      last: n.liveId || n.history.length > 1 ? dateText(n.lastChanged) : "—",
      lastSort: String(n.lastChanged || "") + String(n.lastChangedTime || ""),
      pct: n.pct,
    })),
  ];
  const allocTf = useTableFilters(allocItems, ALLOC_COLS);
  const allocRz = useColumnResize(ALLOC_W);
  const allocKeys = ALLOC_COLS.map((c) => c.key);

  const cmLabel = LEVELS[1] + (cmNodes.length === 1 ? "" : "s");
  const auditNames = [myName, ...cmNodes.map((c) => c.name)];
  let auditList = auditFor(auditNames);
  if (auditFilter !== "all") auditList = auditList.filter((x) => x.name === auditFilter);
  const selfOpen = !!trailOpen[myName];

  return (
    <div className="tbd-root">
      <style>{CSS}</style>

      {!cycleLoading && !budgetLoading && !liveTech && !budgetError ? (
        <div className="berr">
          {loginTechOwner
            ? "HR has not allocated your budget for the active appraisal cycle yet. Your Comp Managers are listed below; Allot % can be set once HR applies the budget in Budget Master."
            : "No matching Tech-Ed budget was found for this login in the active appraisal cycle. Check that the signed-in account matches the Appraiser Tech-ED value in Appraisal Sheet."}
        </div>
      ) : null}
      <div className="btop">
        <span>
          Appraisal cycle <b>{activeCycleId ? (cycleLabel || "Cycle name unavailable") : "No active cycle"}</b>
        </span>
        <span className="sep" />
        <span>
          {isCompManagerView ? "Comp Manager allocation" : "Tech-Ed allocation"} · updated {hasLiveAllocation ? lakh(myUpdated) : "—"}
        </span>
        <span className="sep" />
        <span>
          <b>{isCompManagerView ? LEVELS[1] : LEVELS[0]}</b>
        </span>
        <span className="sep" />
        <span className="applied">
          {isCompManagerView ? "Comp Manager allocation" : "Budget applied by HR"}:{" "}
          {/* Comp Managers see the amount only, never the allocation percentage. */}
          {!isCompManagerView && (
            <>
              <b>{hasLiveAllocation ? myPct + "%" : "—"}</b> ={" "}
            </>
          )}
          <b>{hasLiveAllocation ? lakh(myUpdated) : "—"}</b> updated · original{" "}
          {hasLiveAllocation ? lakh(myOriginal) : "—"}
          {!isCompManagerView && hasLiveAllocation ? (
            <button type="button" className="dd" aria-expanded={appliedOpen} onClick={() => setAppliedOpen((v) => !v)}>
              % history {appliedOpen ? "▴" : "▾"}
            </button>
          ) : null}
        </span>
      </div>
      {!isCompManagerView && appliedOpen && (
        <div className="apdrop">
          <AuditTable list={auditFor([myName])} showName={false} />
        </div>
      )}

      <div className="card">
        {paneHead("mine", "My Budget")}
        {isCompManagerView && !selectedManagerNode && (
          <div style={{ padding: "8px 14px", color: "#64748b" }}>
            No Comp Manager allocation is linked to the signed-in employee.
          </div>
        )}
        {pane.mine && (
          <>
            <div className="bsum flat">
              <div>
                <div className="f-label">Original allotted</div>
                <div className="v">{hasLiveAllocation ? lakh(myOriginal) : "—"}</div>
                <div className="d mut">Fixed at allocation</div>
              </div>
              <div>
                <div className="f-label">Updated budget</div>
                <div className="v">{hasLiveAllocation ? lakh(myUpdated) : "—"}</div>
                <div className="d">
                  {hasLiveAllocation ? <Chg d={myUpdated - myOriginal} /> : "—"}
                </div>
              </div>
              <div>
                <div className="f-label">Team size</div>
                <div className="v">
                  {team0} → {currentTeamCount}
                </div>
                <div className="d mut">At allocation → now</div>
              </div>
              {isCompManagerView ? (
                <div>
                  <div className="f-label">Remaining</div>
                  <div className={"v" + (myUpdated - used < 0 ? " over" : "")}>
                    {hasLiveAllocation ? lakh(myUpdated - used) : "—"}
                  </div>
                  <div className="d mut">Updated budget − utilised</div>
                </div>
              ) : (
                <>
                  <div>
                    <div className="f-label">Allotted to reports</div>
                    <div className="v">{lakh(allotted)}</div>
                  </div>
                  <div>
                    <div className="f-label">Buffer</div>
                    <div className="v">{lakh(myUpdated - allotted)}</div>
                    <div className="d mut">Not passed down</div>
                  </div>
                </>
              )}
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

      {!isCompManagerView && <div className="card">
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
              <table className="bal" style={resizableTableStyle(allocRz, allocKeys)}>
                <ResizableCols rz={allocRz} keys={allocKeys} />
                <thead>
                  <tr>
                    {ALLOC_COLS.map((c) => (
                      <FilterTh
                        key={c.key}
                        tf={allocTf}
                        rz={allocRz}
                        col={c}
                        className={[c.r ? "r" : "", c.key === "level" ? "level-col" : "", c.key === "owner" ? "owner-col" : "", c.key === "base" ? "budget-base-col" : ""].filter(Boolean).join(" ")}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allocTf.rows.length === 0 && (
                    <tr className="ft-empty">
                      <td colSpan={10}>No rows match the filters.</td>
                    </tr>
                  )}
                  {allocTf.rows.map((item, i) => {
                    if (item.self) {
                      return (
                        <Fragment key="self-row">
                      <tr className="self">
                        <td className="first">{LEVELS[0]}</td>
                        <td>
                          <b>{String(loginTechOwner).split(/\s+-\s+/)[1] || myName}</b> <span className="muted-small">(you)</span>
                        </td>
                        <td className="r budget-base-col">{hasLiveAllocation ? lakh(parentBudgetBaseForDisplay) : "—"}</td>
                        <td className="r">{hasLiveAllocation ? lakh(myOriginal) : "—"}</td>
                        <td className="r">{hasLiveAllocation ? lakh(myUpdated) : "—"}</td>
                        <td className="r">
                          {hasLiveAllocation ? <ChangeCell from={myOriginal} to={myUpdated} /> : "—"}
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
                            {dateText(myHistory[0].date)} {selfOpen ? "▴" : "▾"}
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
                                {myHistory.map((x, i) => (
                                  <tr key={i}>
                                    <td>{stampText(x)}</td>
                                    <td className="n">{lakh(x.allocated)}</td>
                                    <td className="n">{lakh(x.updated)}</td>
                                    <td className="n">{x.team}</td>
                                    <td className="n">{x.allotted === null ? "—" : lakh(x.allotted)}</td>
                                    <td className="n">{x.buffer === null ? "—" : lakh(x.buffer)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                        </Fragment>
                      );
                    }
                    const n = item.node;

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
                          <td className="r budget-base-col">{n.liveId || n.base ? lakh(n.base) : "—"}</td>
                          <td className="r">{n.liveId || n.original ? lakh(n.original) : "—"}</td>
                          <td className="r">{n.liveId || n.updated ? lakh(n.updated) : "—"}</td>
                          <td className="r">
                            <ChangeCell from={n.original} to={n.updated} />
                          </td>
                          <td className="r">{n.team0}</td>
                          <td className="r">{n.team}</td>
                          <td>
                            {n.liveId || n.history.length > 1 ? (
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
                            <td colSpan={10}>
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
                                  {n.history.map((x, i) => (
                                    <tr key={i}>
                                      <td>{stampText(x)}</td>
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
              Comp Manager Budget Base = sum of Previous Appraisal Total CTC with Rewards for that manager's current eligible employees · Updated Budget = Budget Base × Allot % · Original Budget is fixed at the first calculation · Utilised = {UTILISED_LABEL}
            </div>
          </>
        )}
      </div>}

      {!isCompManagerView && <div className="card">
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
      </div>}
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
.tbd-root table.bal { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.tbd-root .bal th { background: #dfe8f3; color: #102a43; font-weight: 600; font-size: 12px; text-align: left; padding: 6px 6px; border-right: 1px solid #c9d8ec; border-bottom: 1px solid #9fb3cf; }
.tbd-root .bal td { padding: 6px 6px; border-right: 1px solid #c9d8ec; border-bottom: 1px solid #c9d8ec; vertical-align: middle; white-space: normal; }
.tbd-root .bal td.r { white-space: nowrap; }
.tbd-root .bal th.r, .tbd-root .bal td.r { text-align: right; font-variant-numeric: tabular-nums; }
.tbd-root .bal .r { text-align: right; }
.tbd-root .bal tr.self td { background: #e9f4f4; font-weight: 700; }
.tbd-root .bal tr.self td.first { box-shadow: inset 4px 0 0 #14a3a3; }
.tbd-root .bal tr.grp td { border-top: 2px solid #9fb3cf; }
.tbd-root .bal tr.tr td { background: #f7f9fc; padding: 6px 10px 8px 30px; animation: tbd-pull 160ms ease-out; }
.tbd-root .pct-in { width: 56px; height: 22px; border: 1px solid #9fb3cf; border-radius: 4px; text-align: right; padding: 0 5px; font-size: 11.5px; background: #fffef5; }
.tbd-root .pct-in:focus { outline: 2px solid #14a3a3; outline-offset: 1px; }
.tbd-root .dd { border: 1px solid #c5d0dd; background: #fff; color: #17365d; border-radius: 4px; padding: 2px 6px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.tbd-root .dd[aria-expanded="true"] { background: #12304f; border-color: #12304f; color: #fff; }
.tbd-root .trail { width: 100%; border-collapse: collapse; font-size: 12px; }
.tbd-root .trail th { text-align: left; font-weight: 700; color: #1e3a5f; font-size: 11px; padding: 4px 8px; border: 1px solid #c9d8ec; background: #eef3fa; }
.tbd-root .trail td { padding: 5px 6px; border: 1px solid #d9e2ee; }
.tbd-root .trail .n { text-align: right; }
.tbd-root .audit-wrap { padding: 8px 14px 12px; }
.tbd-root .audit-wrap .trail td, .tbd-root .audit-wrap .trail th { padding: 5px 6px; }
.tbd-root .note { padding: 6px 14px 10px; font-size: 11px; color: #64748b; }
.tbd-root .trail { border-collapse: collapse; }
/* Grid outline: the scroll wrapper carries the outer border, cells carry the inner lines. */
.tbd-root .card > .bscroll { margin: 10px 14px 12px; border: 1px solid #7c93b2; border-radius: 6px; }
.tbd-root .audit-wrap .bscroll, .tbd-root .apdrop .bscroll { border: 1px solid #7c93b2; border-radius: 6px; }
.tbd-root .bal th:last-child, .tbd-root .bal td:last-child { border-right: 0; }
.tbd-root .bal tbody tr:last-child > td { border-bottom: 0; }
.tbd-root .bal tr.tr td { border-right: 0; }
.tbd-root .trail-grid { width: 100%; }
.tbd-root .trail-grid th { background: #dfe8f3; color: #102a43; font-size: 12px; font-weight: 600; padding: 6px 6px; border-color: #c9d8ec; }
.tbd-root .trail-grid th, .tbd-root .trail-grid td { border-top: 0; }
.tbd-root .trail-grid th:first-child, .tbd-root .trail-grid td:first-child { border-left: 0; }
.tbd-root .trail-grid th:last-child, .tbd-root .trail-grid td:last-child { border-right: 0; }
.tbd-root .trail-grid tbody tr:last-child td { border-bottom: 0; }
.tbd-root .bal tr.tr td .trail { outline: 1px solid #9fb3cf; outline-offset: -1px; }
${filterTableCss(".tbd-root", ".bal")}
${filterTableCss(".tbd-root", ".trail-grid")}
@keyframes tbd-pull { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .tbd-root .apdrop, .tbd-root .bal tr.tr td { animation: none; } }
`;