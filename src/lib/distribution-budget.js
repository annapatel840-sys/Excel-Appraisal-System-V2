import { useEffect, useMemo, useState } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";
import { useBudget } from "@/lib/budget-store";
import { useViewAs, currentUserMatchesManager } from "@/lib/view-as-store";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { splitStamp } from "@/lib/budget-audit-local";

/* ============================================================
   Single source of truth for the Budget Distribution screen's
   "Updated Budget" (Tech-Ed and Comp Manager views).

   This is the exact resolution the Budget Distribution screen used to
   run inline. It now lives here so that the Budget Distribution screen,
   the Appraisal Sheet Detailed Screen and Bulk Edit all read the SAME
   number: "Budget Allocated" on those screens is this hook's
   `updatedBudget`.
   ============================================================ */

const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  const parsed = Number(
    String(v)
      .trim()
      .replace(/[₹,\s]/g, "")
      .replace(/^(?:INR|Rs\.?)/i, ""),
  );
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalizeOwner = (value) => {
  if (value && typeof value === "object") {
    return normalizeOwner(
      value.ROWID ??
        value.rowid ??
        value.emp_id ??
        value.employee_id ??
        value.id ??
        value.value ??
        value.display_value ??
        value.name ??
        "",
    );
  }
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};
const ownerReference = (value) => {
  if (!value || typeof value !== "object") return value;
  return (
    value.ROWID ??
    value.rowid ??
    value.emp_id ??
    value.employee_id ??
    value.id ??
    value.value ??
    value.display_value ??
    value.name ??
    value.assignment ??
    ""
  );
};
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
  return (
    parts.some((part) => identities.includes(part)) ||
    compactParts.some((part) =>
      identities.some(
        (identity) => identity.replace(/[^a-z0-9]/g, "") === part,
      ),
    )
  );
};

const firstNonBlank = (object, keys) => {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "")
      return value;
  }
  return 0;
};
const isActiveAndEligible = (employee) => {
  // employeesapi has already joined Employee_Master and exposes the master
  // decision as status + eligible_status. Prefer those canonical fields over
  // stale/legacy aliases carried on an Appraisal_Sheet row.
  const status = String(
    firstNonBlank(employee, ["status", "emp_status", "employee_status"]) || "",
  )
    .trim()
    .toLowerCase();
  const eligibility = String(
    firstNonBlank(employee, [
      "eligible_status",
      "eligibility_status",
      "eligibility",
      "eligible",
    ]) || "",
  )
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, "");
  return (
    status === "active" &&
    ["eligible", "yes", "true", "1"].includes(eligibility)
  );
};
const employeeUtilized = (employee) => {
  // Prefer the same Appraisal_Sheet-based calculation returned by budgetmasterapi.
  // Fall back to the local calculation for older deployed API responses.
  const serverAmount = Number(employee?.utilized_amount);
  if (
    employee?.utilized_amount !== null &&
    employee?.utilized_amount !== undefined &&
    String(employee.utilized_amount).trim() !== "" &&
    Number.isFinite(serverAmount) &&
    serverAmount !== 0
  )
    return serverAmount;

  // Business rule: current-year awards minus previous-year awards.
  // Ignore zero-filled aliases so another populated field can supply the value.
  const amount = (keys) => {
    for (const key of keys) {
      const value = employee?.[key];
      if (value === null || value === undefined || String(value).trim() === "")
        continue;
      const parsed = num(value);
      if (parsed !== 0) return parsed;
    }
    return 0;
  };

  const currentHike = amount([
    "hike_amount",
    "hikeAmount",
    "current_hike_amount",
  ]);
  // Appraisal_Sheet current-year performance bonus may be stored in the
  // allocation/offer columns depending on the cycle's schema.
  const currentPerformance = amount([
    "new_pb_to_be_offered",
    "newPBToBeOffered",
    "current_performance_bonus",
    "performance_bonus",
    "performanceBonus",
    "target_pb_allocated_for_may",
    "targetPBAllocatedForMay",
    "allocated_pb_amount",
    "allocatedPBAmount",
    "target_pb_next_year",
    "targetPBNextYear",
  ]);
  const currentRetention = amount([
    "new_rb",
    "newRB",
    "current_retention_bonus",
    "retention_bonus",
    "retentionBonus",
  ]);
  const currentJoining = amount([
    "joining_bonus",
    "joiningBonus",
    "current_joining_bonus",
  ]);

  // PB/RB-to-be-paid are previous-year values in the appraisal sheet.
  const previousPerformance = amount([
    "previous_year_performance_bonus",
    "previousPerformanceBonus",
    "previous_year_pb",
    "pb_to_be_paid",
    "pbToBePaid",
    "previous_pb",
  ]);
  const previousRetention = amount([
    "previous_year_retention_bonus",
    "previousRetentionBonus",
    "previous_year_rb",
    "rb_to_be_paid",
    "rbToBePaid",
    "previous_rb",
  ]);
  const previousJoining = amount([
    "previous_year_joining_bonus",
    "previousJoiningBonus",
    "previous_year_jb",
    "previous_joining_bonus",
  ]);

  return (
    currentHike +
    currentPerformance +
    currentRetention +
    currentJoining -
    previousPerformance -
    previousRetention -
    previousJoining
  );
};
// Read the immutable Tech-Ed headcount snapshot written by HR Budget Master.
// Match the canonical employee ID/name aliases rather than assuming every page
// uses the same display form (ID, name, or "ID - Name").
const readTechEdOriginalCount = (cycleId, identities) => {
  if (typeof window === "undefined" || !cycleId) return null;
  try {
    const saved = JSON.parse(
      window.localStorage.getItem("excel-appraisal-budget-original-v1") || "{}",
    );
    const snapshot = saved?.[String(cycleId)]?.teCount;
    if (!snapshot || typeof snapshot !== "object") return null;
    const tokens = new Set();
    const add = (value) => {
      const parts = ownerParts(value);
      for (const part of parts) {
        const normalized = normalizeOwner(part);
        if (normalized) {
          tokens.add(normalized);
          tokens.add(normalized.replace(/[^a-z0-9]/g, ""));
        }
      }
    };
    (Array.isArray(identities) ? identities : [identities]).forEach(add);
    for (const [key, value] of Object.entries(snapshot)) {
      const keyTokens = new Set();
      for (const part of ownerParts(key)) {
        const normalized = normalizeOwner(part);
        if (normalized) {
          keyTokens.add(normalized);
          keyTokens.add(normalized.replace(/[^a-z0-9]/g, ""));
        }
      }
      if ([...keyTokens].some((token) => token && tokens.has(token))) {
        const count = Number(value);
        return Number.isFinite(count) && count >= 0 ? count : null;
      }
    }
  } catch (_) {}
  return null;
};

// Freeze the Tech-Ed Original Count ONCE (same storage key/shape as Budget
// Master). Never overwrites a positive value, so later delegation/eligibility
// changes only move Current Count.
const writeTechEdOriginalCount = (cycleId, ownerKeyValue, count) => {
  if (typeof window === "undefined" || !cycleId || !ownerKeyValue) return;
  const value = Number(count);
  if (!Number.isFinite(value) || value <= 0) return;
  try {
    const storageKey = "excel-appraisal-budget-original-v1";
    const saved =
      JSON.parse(window.localStorage.getItem(storageKey) || "{}") || {};
    const cycle = saved[String(cycleId)] || {};
    const teCount = { ...(cycle.teCount || {}) };
    const key = normalizeOwner(ownerKeyValue);
    if (Number(teCount[key]) > 0) return;
    teCount[key] = value;
    saved[String(cycleId)] = { ...cycle, teCount };
    window.localStorage.setItem(storageKey, JSON.stringify(saved));
  } catch (_) {}
};

const byDate = (a, b) =>
  String((a.date || "") + (a.time || "")).localeCompare(
    String((b.date || "") + (b.time || "")),
  );

export {
  num,
  normalizeOwner,
  ownerParts,
  ownerKey,
  ownerMatches,
  isActiveAndEligible,
  employeeUtilized,
  byDate,
  readTechEdOriginalCount,
  writeTechEdOriginalCount,
};

export function useDistributionBudget() {
  const user = useCatalystUser();
  const { effectiveId, actualId } = useViewAs();
  const isCompManagerPreview =
    effectiveId === "compmanager" && actualId === "teched";
  const roleText = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isCompManagerLogin =
    actualId === "compmanager" ||
    roleText === "compmgr" ||
    roleText === "compmanager";
  const isCompManagerView = isCompManagerPreview || isCompManagerLogin;
  const {
    isHR,
    budgetDistributionRows,
    budgetCompManagerRows,
    budgetMasterRows,
    employeeRows = [],
    techEdOwners = [],
    totals: sharedBudgetTotals,
    budgetAuditLog = [],
    loading: budgetLoading,
    error: budgetError,
  } = useBudget();
  const myName = user?.name || "Unknown user";
  // Same audience as the Budget Distribution screen: Tech-Ed and Comp
  // Manager logins. HR keeps the organisation-wide Budget Master figure.
  const applies = !isHR && (roleText === "teched" || isCompManagerView);

  const [cycleRows, setCycleRows] = useState([]);
  const [activeCycleId, setActiveCycleId] = useState("");
  const [cycleLoading, setCycleLoading] = useState(true);

  useEffect(() => {
    if (!applies) return undefined;
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
            const status = String(cycle.status ?? cycle.cycle_status ?? "")
              .trim()
              .toLowerCase();
            const archived = [true, 1, "true", "1", "yes"].includes(
              typeof cycle.archived === "string"
                ? cycle.archived.trim().toLowerCase()
                : cycle.archived,
            );
            return status === "active" && !archived && !cycle.hidden;
          });
          const cycleId =
            active?.id ??
            active?.appraisal_cycle_id ??
            active?.cycle_id ??
            active?.ROWID ??
            "";
          setActiveCycleId(cycleId ? String(cycleId) : "");
        })
        .catch((cycleError) => {
          console.error(
            "Failed to load appraisal cycles for Budget Distribution:",
            cycleError,
          );
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
  }, [applies]);

  const liveTech = useMemo(() => {
    if (!applies) return null;
    const identities = new Set(
      [
        myName,
        user?.name,
        user?.display_name,
        user?.first_name,
        user?.last_name,
        [user?.first_name, user?.last_name].filter(Boolean).join(" "),
        user?.email,
        user?.email_id,
        user?.user_id,
        user?.row_id,
        user?.ROWID,
        user?.empId,
        user?.employeeId,
        user?.employee_id,
      ]
        .map(normalizeOwner)
        .filter(Boolean),
    );

    // A Comp Manager is a child of a Tech-Ed, not a Tech-Ed owner.
    // budgetmasterapi has already authenticated this login and returned only
    // its Budget_Distribution_Comp child row(s). Follow the stored parent FK
    // directly to the active-cycle Budget_Distribution row; never try to infer
    // this login's parent by matching the manager as a Tech-Ed employee.
    // A Comp Manager can have teams under more than one Tech-Ed. Never fail
    // to resolve in that case: use the parent carrying the largest saved
    // allocation for this manager as the primary parent.
    const primaryParent = (parents) => {
      const appliedUnder = (parent) =>
        budgetCompManagerRows
          .filter(
            (child) =>
              String(child.budget_distribution_id || "").trim() ===
              String(parent.id || "").trim(),
          )
          .reduce((sum, child) => sum + num(child.applied_budget), 0);
      return [...parents].sort((a, b) => appliedUnder(b) - appliedUnder(a))[0];
    };
    if (isCompManagerLogin) {
      const childRows = budgetCompManagerRows.filter(
        (child) =>
          (!activeCycleId ||
            String(child.appraisal_cycle_id || "") === String(activeCycleId)) &&
          String(child.budget_distribution_id || "").trim(),
      );
      const parentIds = new Set(
        childRows.map((child) => String(child.budget_distribution_id).trim()),
      );
      const linkedParents = budgetDistributionRows.filter(
        (parent) =>
          parentIds.has(String(parent.id || "").trim()) &&
          (!activeCycleId ||
            String(parent.appraisal_cycle_id || "") === String(activeCycleId)),
      );
      const uniqueParents = Array.from(
        new Map(
          linkedParents.map((parent) => [String(parent.id), parent]),
        ).values(),
      );
      if (uniqueParents.length === 1) return uniqueParents[0];
      if (uniqueParents.length > 1) return primaryParent(uniqueParents);
    }

    // Resolve a Tech-Ed login against the complete Tech-Ed directory first.
    // Do not depend on employeeRows containing the Tech-Ed's own employee row:
    // Tech-Ed-scoped employee APIs may return only their reports.
    const directoryOwner = techEdOwners.find((item) =>
      [
        item?.employee_id,
        item?.row_id,
        item?.ROWID,
        item?.assignment,
        item?.name,
        item?.email,
        item?.email_id,
      ]
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
      ]
        .filter(Boolean)
        .forEach((value) => {
          identities.add(normalizeOwner(value));
          ownerParts(value).forEach((part) =>
            identities.add(normalizeOwner(part)),
          );
        });
    }

    const employeeIdentityValues = (employee) =>
      [
        employee.row_id,
        employee.ROWID,
        employee.ROW_ID,
        employee.id,
        employee.emp_id,
        employee.employee_id,
        employee.employeeId,
        employee.emp_name,
        employee.employee_name,
        employee.name,
        employee.email,
        employee.email_id,
        employee.emailId,
      ]
        .map(normalizeOwner)
        .filter(Boolean);

    // Resolve the logged-in account to an actual employee row where possible.
    const loginEmployee = employeeRows.find((employee) =>
      employeeIdentityValues(employee).some((value) => identities.has(value)),
    );
    if (loginEmployee)
      employeeIdentityValues(loginEmployee).forEach((value) =>
        identities.add(value),
      );

    // Some session accounts are not employees. In that case, use the Appraisal
    // Sheet assignment whose Tech-Ed owner contains the logged-in identity.
    const ownerByForeignKey = new Map();
    techEdOwners.forEach((item) => {
      const fk = normalizeOwner(item?.row_id || item?.ROWID || "");
      if (fk && item?.assignment)
        ownerByForeignKey.set(fk, String(item.assignment).trim());
    });
    const assignedOwners = Array.from(
      new Set(
        employeeRows
          .map((employee) => {
            const raw = ownerReference(
              employee.appraiser_tech_ed_row_id ||
                employee.appraiser_tech_ed_appraisal_sheet ||
                employee.appraiser_tech_ed ||
                employee.appraiser_tech_ed_id ||
                employee.appraiser_tech_ed1 ||
                employee.appraiser_teched ||
                employee.appraiserTechED ||
                employee.tech_ed ||
                employee.tech_ed_id ||
                "",
            );
            const rawText = String(raw || "").trim();
            return ownerByForeignKey.get(normalizeOwner(rawText)) || rawText;
          })
          .filter(
            (owner) => owner && ownerMatches(owner, Array.from(identities)),
          ),
      ),
    );

    const allRows = budgetDistributionRows.filter(
      (row) =>
        row.appraiser_tech_ed_id ||
        row.tech_ed_id ||
        row.tech_ed ||
        row.appraiser_tech_ed,
    );
    const ownerForBudgetRow = (row) => {
      const raw = String(
        ownerReference(
          row.appraiser_tech_ed_id ||
            row.tech_ed_id ||
            row.tech_ed ||
            row.appraiser_tech_ed ||
            row.appraiser_tech_ed1 ||
            "",
        ) || "",
      ).trim();
      // Budget_Distribution may store Employee_Master.ROWID as its Tech-Ed FK.
      // Convert that FK to the display assignment returned from Appraisal_Sheet.
      return ownerByForeignKey.get(normalizeOwner(raw)) || raw;
    };
    const ownerMatchesLogin = (row) =>
      ownerMatches(ownerForBudgetRow(row), Array.from(identities)) ||
      Boolean(
        loginEmployee &&
        normalizeOwner(
          row.appraiser_tech_ed_id ||
            row.tech_ed_id ||
            row.tech_ed ||
            row.appraiser_tech_ed ||
            row.appraiser_tech_ed1,
        ) === normalizeOwner(loginEmployee.row_id || loginEmployee.ROWID),
      );
    const directMatches = allRows.filter(ownerMatchesLogin);
    const assignmentMatches = allRows.filter((row) =>
      assignedOwners.some(
        (owner) =>
          ownerKey(owner) ===
          ownerKey(
            row.appraiser_tech_ed_id ||
              row.tech_ed_id ||
              row.tech_ed ||
              row.appraiser_tech_ed,
          ),
      ),
    );
    let candidates = directMatches.length ? directMatches : assignmentMatches;

    // For a real Comp Manager login, ALWAYS resolve the parent Tech-Ed from
    // the manager's CURRENT Appraisal Sheet assignments. Do not retain a
    // coincidental direct match from the manager's own identity; that can
    // select the wrong Tech-Ed and then fail the active-cycle lookup.
    if (isCompManagerLogin) {
      const matchesCurrentManager = (raw) => {
        if (currentUserMatchesManager(raw, user, employeeRows)) return true;
        // Some Catalyst sessions expose the Employee_Master ROWID as id/row_id
        // rather than empId. Include those direct session identifiers so a
        // saved Comp Manager allocation can still resolve when the manager's
        // own employee row is absent from the restricted report roster.
        const sessionManagerAliases = [
          user?.id,
          user?.row_id,
          user?.ROWID,
          user?.user_id,
          user?.userId,
          user?.empId,
          user?.emp_id,
          user?.employeeId,
          user?.employee_id,
          user?.name,
          user?.display_name,
          user?.email,
          user?.email_id,
        ]
          .filter(Boolean)
          .flatMap((value) => ownerParts(value));
        if (ownerMatches(raw, sessionManagerAliases)) return true;
        const rawKey = normalizeOwner(
          raw && typeof raw === "object"
            ? raw.ROWID || raw.rowid || raw.id || raw.value || ""
            : raw,
        );
        if (!rawKey) return false;
        const linkedManager = employeeRows.find((employee) =>
          [
            employee.row_id,
            employee.ROWID,
            employee.ROW_ID,
            employee.id,
            employee.emp_id,
            employee.employee_id,
            employee.employeeId,
          ].some((alias) => normalizeOwner(alias) === rawKey),
        );
        if (!linkedManager) return false;
        const display = [
          linkedManager.emp_id ||
            linkedManager.employee_id ||
            linkedManager.employeeId,
          linkedManager.emp_name ||
            linkedManager.employee_name ||
            linkedManager.name,
        ]
          .filter(Boolean)
          .join(" - ");
        return currentUserMatchesManager(display, user, employeeRows);
      };
      const managerEmployees = employeeRows.filter((employee) => {
        const managerValues = [
          employee.comp_manager,
          employee.comp_manager_id,
          employee.compManager,
          employee.comp_manager_display,
          employee.comp_manager_name,
        ].filter(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "",
        );
        return (
          employee.in_appraisal_sheet !== false &&
          managerValues.some(matchesCurrentManager)
        );
      });
      const techOwnerValues = (employee) =>
        [
          employee.appraiser_tech_ed_appraisal_sheet,
          employee.appraiser_tech_ed,
          employee.appraiser_tech_ed_id,
          employee.appraiser_tech_ed_row_id,
          employee.appraiser_tech_ed1,
          employee.appraiser_teched,
          employee.appraiserTechED,
          employee.tech_ed,
          employee.tech_ed_id,
        ].filter(
          (value) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== "",
        );
      const resolveTechOwner = (value) => {
        const raw = normalizeOwner(
          value && typeof value === "object"
            ? value.ROWID ||
                value.rowid ||
                value.id ||
                value.value ||
                value.display_value ||
                value.name ||
                ""
            : value,
        );
        if (!raw) return "";
        const linked = techEdOwners.find((owner) =>
          [
            owner?.row_id,
            owner?.ROWID,
            owner?.employee_id,
            owner?.assignment,
            owner?.name,
            owner?.email,
            owner?.email_id,
          ]
            .filter(Boolean)
            .some((alias) => ownerMatches(alias, [raw])),
        );
        return normalizeOwner(linked?.assignment || value);
      };
      const managerTechOwners = Array.from(
        new Set(
          managerEmployees
            .flatMap((employee) =>
              techOwnerValues(employee).map(resolveTechOwner),
            )
            .filter(Boolean),
        ),
      );

      // Strong fallback for restricted Comp Manager rosters: the signed-in
      // manager may not appear in employeeRows (which can contain only their
      // reports). Budget_Distribution_Comp already stores the manager identity
      // and its parent Tech-Ed allocation ID, so resolve the parent directly.
      // For a real Comp Manager login, budgetmasterapi has already
      // authorized and filtered Budget_Distribution_Comp to this employee.
      // The browser session intentionally contains Catalyst user ID/name/email,
      // not Employee_Master.emp_id, and the manager is not in their own reports
      // roster. Re-matching the authorized rows here drops the correct row.
      const managerAllocationRows = isCompManagerLogin
        ? budgetCompManagerRows
        : budgetCompManagerRows.filter((row) =>
            [
              row.comp_manager,
              row.comp_manager_id,
              row.comp_manager_display,
              row.comp_manager_name,
              row.manager_id,
            ]
              .filter(
                (value) =>
                  value !== null &&
                  value !== undefined &&
                  String(value).trim() !== "",
              )
              .some(matchesCurrentManager),
          );
      const managerAllocationParentIds = new Set(
        managerAllocationRows
          .map((row) => String(row.budget_distribution_id || "").trim())
          .filter(Boolean),
      );
      const compManagerParentMatches = budgetDistributionRows.filter((row) =>
        managerAllocationParentIds.has(
          String(row.id || row.ROWID || "").trim(),
        ),
      );

      const employeeAssignmentMatches = allRows.filter((row) => {
        const rowOwners = techOwnerValues(row)
          .map(resolveTechOwner)
          .filter(Boolean);
        return rowOwners.some((rowOwner) =>
          managerTechOwners.some(
            (managerOwner) =>
              ownerMatches(rowOwner, [managerOwner]) ||
              ownerMatches(managerOwner, [rowOwner]),
          ),
        );
      });
      candidates = compManagerParentMatches.length
        ? compManagerParentMatches
        : employeeAssignmentMatches;
    }

    // Cycle API and budget tables can refer to the same cycle through different
    // ID aliases. Resolve the active cycle through Budget_Master's cycle name
    // before concluding that the Tech-Ed has no matching allocation.
    const activeCycle = cycleRows.find(
      (cycle) =>
        String(
          cycle.id ?? cycle.appraisal_cycle_id ?? cycle.cycle_id ?? cycle.ROWID,
        ) === String(activeCycleId),
    );
    const activeCycleName = normalizeOwner(
      activeCycle?.name ||
        activeCycle?.cycle_name ||
        activeCycle?.appraisal_year ||
        "",
    );
    const activeMasterCycleIds = new Set(
      budgetMasterRows
        .filter((master) => {
          const masterCycleName = normalizeOwner(
            master.appraisal_cycle_name ||
              master.cycle_name ||
              master.cycleName ||
              master.appraisal_year ||
              "",
          );
          return (
            (activeCycleId &&
              String(master.appraisal_cycle_id) === String(activeCycleId)) ||
            (activeCycleName && masterCycleName === activeCycleName)
          );
        })
        .map((master) => String(master.appraisal_cycle_id || ""))
        .filter(Boolean),
    );
    const cycleMatches = candidates.filter(
      (row) =>
        (activeCycleId &&
          String(row.appraisal_cycle_id) === String(activeCycleId)) ||
        activeMasterCycleIds.has(String(row.appraisal_cycle_id)),
    );
    if (cycleMatches.length === 1) return cycleMatches[0];
    if (cycleMatches.length > 1)
      return isCompManagerLogin ? primaryParent(cycleMatches) : null;

    // Never fall back to an unscoped or archived-cycle allocation.
    return null;
  }, [
    budgetDistributionRows,
    budgetCompManagerRows,
    budgetMasterRows,
    cycleRows,
    employeeRows,
    techEdOwners,
    myName,
    user?.name,
    user?.display_name,
    user?.first_name,
    user?.last_name,
    user?.email,
    user?.email_id,
    user?.user_id,
    user?.empId,
    user?.employeeId,
    user?.employee_id,
    activeCycleId,
    isCompManagerLogin,
    user?.role,
    applies,
  ]);

  // The Tech-ED's Appraisal Sheet assignment (e.g. "EMP0051 - Ashok Kumar"),
  // found from the login even when HR has not allocated a budget row yet, so
  // the team and its Comp Managers can still be listed.
  const loginTechOwner = useMemo(() => {
    if (!applies) return "";
    const identities = [
      myName,
      user?.name,
      user?.display_name,
      [user?.first_name, user?.last_name].filter(Boolean).join(" "),
      user?.email,
      user?.email_id,
      user?.empId,
      user?.employeeId,
      user?.employee_id,
    ]
      .map(normalizeOwner)
      .filter(Boolean);

    // Prefer the authoritative Appraisal Sheet Tech-Ed directory. This works
    // even if the employee endpoint only returns the Tech-Ed's reports.
    const directoryOwner = techEdOwners.find((item) =>
      [
        item?.employee_id,
        item?.row_id,
        item?.ROWID,
        item?.assignment,
        item?.name,
        item?.email,
        item?.email_id,
      ]
        .filter(Boolean)
        .some((alias) => ownerMatches(alias, identities)),
    );
    if (directoryOwner?.assignment)
      return String(directoryOwner.assignment).trim();

    const personValues = (e) =>
      [
        e.row_id,
        e.ROWID,
        e.ROW_ID,
        e.id,
        e.emp_id,
        e.employee_id,
        e.employeeId,
        e.emp_name,
        e.employee_name,
        e.name,
        e.email,
        e.email_id,
        e.emailId,
      ]
        .map(normalizeOwner)
        .filter(Boolean);
    const me = employeeRows.find((e) =>
      personValues(e).some((v) => identities.includes(v)),
    );
    if (me) identities.push(...personValues(me));
    for (const employee of employeeRows) {
      const raw = String(
        employee.appraiser_tech_ed_row_id ||
          employee.appraiser_tech_ed_appraisal_sheet ||
          employee.appraiser_tech_ed ||
          employee.appraiser_tech_ed_id ||
          employee.appraiser_tech_ed1 ||
          employee.appraiser_teched ||
          employee.appraiserTechED ||
          employee.tech_ed ||
          employee.tech_ed_id ||
          "",
      ).trim();
      if (!raw) continue;
      const linked = techEdOwners.find((item) =>
        [
          item?.employee_id,
          item?.row_id,
          item?.ROWID,
          item?.assignment,
          item?.name,
          item?.email,
          item?.email_id,
        ]
          .filter(Boolean)
          .some((alias) => ownerMatches(alias, raw)),
      );
      const assignment = String(linked?.assignment || raw).trim();
      if (ownerMatches(assignment, identities)) return assignment;
    }
    return "";
  }, [
    employeeRows,
    techEdOwners,
    myName,
    user?.name,
    user?.display_name,
    user?.first_name,
    user?.last_name,
    user?.email,
    user?.email_id,
    user?.empId,
    user?.employeeId,
    user?.employee_id,
    applies,
  ]);
  const techOwnerKey = useMemo(() => {
    const raw = String(
      liveTech?.appraiser_tech_ed_id || loginTechOwner || "",
    ).trim();

    const linkedOwner = techEdOwners.find((item) =>
      [
        item?.employee_id,
        item?.row_id,
        item?.ROWID,
        item?.assignment,
        item?.name,
        item?.email,
        item?.email_id,
      ]
        .filter(Boolean)
        .some((alias) => ownerMatches(alias, raw)),
    );

    return ownerKey(linkedOwner?.assignment || loginTechOwner || raw);
  }, [liveTech?.appraiser_tech_ed_id, loginTechOwner, techEdOwners]);
  const activeCycle = useMemo(
    () =>
      cycleRows.find(
        (cycle) =>
          String(
            cycle.id ??
              cycle.appraisal_cycle_id ??
              cycle.cycle_id ??
              cycle.ROWID,
          ) === String(liveTech?.appraisal_cycle_id || activeCycleId),
      ) || null,
    [cycleRows, liveTech?.appraisal_cycle_id, activeCycleId],
  );
  const liveComps = useMemo(() => {
    if (!liveTech) return [];
    // budgetmasterapi already returns only this manager's own child rows, so a
    // Comp Manager login sums across every parent Tech-Ed instead of one.
    if (isCompManagerLogin)
      return budgetCompManagerRows.filter(
        (r) =>
          !activeCycleId ||
          String(r.appraisal_cycle_id || "") === String(activeCycleId) ||
          String(r.budget_distribution_id) === String(liveTech.id),
      );
    return budgetCompManagerRows.filter(
      (r) => String(r.budget_distribution_id) === String(liveTech.id),
    );
  }, [budgetCompManagerRows, liveTech, isCompManagerLogin, activeCycleId]);
  const liveMaster = useMemo(
    () =>
      liveTech
        ? budgetMasterRows.find(
            (r) =>
              String(r.appraisal_cycle_id) ===
              String(liveTech.appraisal_cycle_id),
          ) || null
        : null,
    [budgetMasterRows, liveTech],
  );

  // Audit trail comes from the browser-side budget audit (budget-store.jsx),
  // limited to this Tech-ED's own row and the Comp Manager rows under it.
  const log = useMemo(() => {
    if (!liveTech) return [];
    const techId = String(liveTech.id);
    return budgetAuditLog.filter(
      (entry) =>
        (entry.level === "techEd" && String(entry.rowId) === techId) ||
        (entry.level === "comp" && String(entry.parentId) === techId),
    );
  }, [budgetAuditLog, liveTech]);

  const cmNodes = useMemo(() => {
    if (!applies || !activeCycleId || (!techOwnerKey && !isCompManagerLogin))
      return [];
    const managerStats = new Map();
    const currentTechOwner = techOwnerKey;
    const signedInManagerAliases = [
      user?.id,
      user?.row_id,
      user?.ROWID,
      user?.user_id,
      user?.userId,
      user?.empId,
      user?.emp_id,
      user?.employeeId,
      user?.employee_id,
      user?.name,
      user?.display_name,
      user?.email,
      user?.email_id,
    ]
      .filter(Boolean)
      .flatMap((value) => ownerParts(value));
    const isSignedInManager = (value) =>
      currentUserMatchesManager(value, user, employeeRows) ||
      ownerMatches(value, signedInManagerAliases);
    const resolveTechAssignment = (raw) => {
      const text = String(raw || "").trim();
      const linked = techEdOwners.find((item) =>
        [
          item?.employee_id,
          item?.row_id,
          item?.ROWID,
          item?.assignment,
          item?.name,
        ]
          .filter(Boolean)
          .some((alias) => ownerMatches(alias, text)),
      );
      return String(linked?.assignment || text).trim();
    };
    const resolveManager = (raw) => {
      const text = String(raw || "").trim();
      if (!text) return "";
      const parts = ownerParts(text);

      // Resolve a saved manager ID through current Appraisal Sheet rows and
      // use the canonical "employee ID - name" display label when available.
      const linkedManager = employeeRows.find(
        (employee) =>
          employee.comp_manager_display &&
          [
            employee.comp_manager,
            employee.comp_manager_id,
            employee.compManager,
            employee.comp_manager_display,
            employee.comp_manager_name,
          ]
            .filter(Boolean)
            .some((alias) => ownerMatches(alias, parts)),
      );
      if (linkedManager?.comp_manager_display) {
        const display = String(linkedManager.comp_manager_display).trim();
        if (display.includes(" - ")) return display;
      }

      const manager = employeeRows.find((employee) => {
        const aliases = [
          employee.empId,
          employee.emp_id,
          employee.employee_id,
          employee.employeeId,
          employee.id,
          employee.ROWID,
          employee.row_id,
          employee.name,
          employee.employee_name,
        ].filter(Boolean);
        return aliases.some((alias) => ownerMatches(alias, parts));
      });
      if (!manager) return text;
      const id = String(
        manager.empId ||
          manager.emp_id ||
          manager.employee_id ||
          manager.employeeId ||
          "",
      ).trim();
      const name = String(
        manager.name || manager.employee_name || manager.emp_name || "",
      ).trim();
      return id && name ? id + " - " + name : name || text;
    };
    employeeRows.forEach((employee) => {
      // This page's team and Comp Manager list must be driven only by current
      // Appraisal_Sheet rows, not Employee_Master-only employees.
      if (employee.in_appraisal_sheet !== true) return;
      const rawTechAssignment =
        employee.appraiser_tech_ed_row_id ||
        employee.appraiser_tech_ed_appraisal_sheet ||
        employee.appraiser_tech_ed ||
        employee.appraiser_tech_ed_id ||
        employee.appraiser_tech_ed1 ||
        employee.tech_ed ||
        employee.tech_ed_id ||
        "";
      const techAssignment = resolveTechAssignment(rawTechAssignment);
      // A Comp Manager login is already scoped server-side to its own team,
      // which may span several Tech-Eds, so do not filter by one Tech-Ed.
      if (
        !isCompManagerLogin &&
        (!currentTechOwner || ownerKey(techAssignment) !== currentTechOwner)
      )
        return;
      if (!isActiveAndEligible(employee)) return;
      const rawManager =
        employee.comp_manager ||
        employee.comp_manager_id ||
        employee.compManager ||
        employee.comp_manager_name ||
        employee.comp_manager_display ||
        "";
      const manager = resolveManager(rawManager);
      if (!manager) return;
      // A real Comp Manager login receives only its own employees from
      // budgetmasterapi. Trust that server-side scope instead of requiring a
      // second browser identity match against a roster that omits the manager.
      if (
        !isCompManagerLogin &&
        isCompManagerView &&
        !isSignedInManager(rawManager) &&
        !isSignedInManager(manager)
      )
        return;
      const key = ownerKey(manager);
      const stats = managerStats.get(key) || {
        count: 0,
        base: 0,
        utilized: 0,
        name: manager,
      };
      stats.count += 1;
      const previousCtcValue =
        employee.previous_appraisal_total_ctc_with_rewards ??
        employee.Previous_Appraisal_total_CTC_with_rewards ??
        employee.budget_base;
      const hasPreviousCtc =
        previousCtcValue !== null &&
        previousCtcValue !== undefined &&
        String(previousCtcValue).trim() !== "";
      stats.base += hasPreviousCtc
        ? num(previousCtcValue)
        : num(
            employee.current_annual_base_pay ??
              employee.currentAnnualBasePay ??
              employee.current_base_pay ??
              employee.base_pay ??
              employee.basePay,
          ) +
          num(
            employee.hike_amount ??
              employee.hikeAmount ??
              employee.current_hike_amount,
          ) +
          num(
            employee.allocated_pb_amount ??
              employee.allocatedPBAmount ??
              employee.allocated_pb ??
              0,
          ) +
          num(
            employee.new_pb_to_be_offered ??
              employee.newPBToBeOffered ??
              employee.current_performance_bonus ??
              0,
          ) +
          num(
            employee.new_rb ??
              employee.newRB ??
              employee.current_retention_bonus ??
              0,
          );
      stats.utilized += employeeUtilized(employee);
      managerStats.set(key, stats);
    });
    // The parent Tech-Ed's budget base is the pool to distribute across
    // Comp Managers. Use the persisted base; for older rows derive it from the
    // original allocation and percentage when that is the only available value.
    const parentPct = num(liveTech?.percentage);
    const parentBudgetBase =
      num(liveTech?.budget_base) ||
      (parentPct > 0
        ? (num(liveTech?.calculated_budget) * 100) / parentPct
        : 0);
    const totalCurrentTeamCount = Array.from(managerStats.values()).reduce(
      (sum, stats) => sum + stats.count,
      0,
    );

    // Saved allocation rows are not the roster. Show saved managers only if
    // they still exist in the current eligible Appraisal Sheet; add current
    // managers that have not yet received an allocation as dynamic rows.
    // For a real Comp Manager login, liveComps is already scoped twice:
    // budgetmasterapi authorizes the manager's saved child rows, and liveComps
    // restricts them to the active parent Tech-Ed allocation. Do not re-check
    // the manager identity against the reduced employee roster.
    const matchingLiveComps = isCompManagerLogin
      ? liveComps
      : liveComps.filter((live) => {
          const resolved = resolveManager(
            live.comp_manager_display || live.comp_manager,
          );
          // A Comp Manager's own saved allocation must remain visible even when
          // the restricted Appraisal Sheet roster omits their employee row or
          // their team temporarily has no Active + Eligible employees. Requiring
          // managerStats here made cmNodes empty and hid all saved budget values.
          if (isCompManagerView) {
            const aliases = [
              user?.id,
              user?.row_id,
              user?.ROWID,
              user?.user_id,
              user?.userId,
              user?.empId,
              user?.emp_id,
              user?.employeeId,
              user?.employee_id,
              user?.name,
              user?.display_name,
              user?.email,
              user?.email_id,
            ]
              .filter(Boolean)
              .flatMap((value) => ownerParts(value));
            return (
              currentUserMatchesManager(
                live.comp_manager_display || live.comp_manager,
                user,
                employeeRows,
              ) ||
              ownerMatches(
                live.comp_manager_display || live.comp_manager,
                aliases,
              ) ||
              ownerMatches(resolved, aliases)
            );
          }
          return managerStats.has(ownerKey(resolved));
        });

    // A Comp Manager must have only one allocation row per Tech-Ed + cycle.
    // Legacy duplicate rows can exist when the same manager was saved once by
    // ROWID and once by employee ID. Collapse them for this allocation view,
    // preferring the row with a real original-headcount snapshot, then latest
    // persisted update. Keep the chosen liveId so edits update that same row.
    const compByManager = new Map();
    matchingLiveComps.forEach((live) => {
      const key = ownerKey(
        resolveManager(live.comp_manager_display || live.comp_manager),
      );
      const existing = compByManager.get(key);
      const hasSnapshot = (row) =>
        row.original_headcount !== null &&
        row.original_headcount !== undefined &&
        String(row.original_headcount).trim() !== "";
      const snapshotRank = (row) => (hasSnapshot(row) ? 1 : 0);
      const timeRank = (row) => {
        const time = Date.parse(row.updated_at || row.created_at || "");
        return Number.isFinite(time) ? time : 0;
      };
      if (
        !existing ||
        snapshotRank(live) > snapshotRank(existing) ||
        (snapshotRank(live) === snapshotRank(existing) &&
          timeRank(live) > timeRank(existing))
      ) {
        compByManager.set(key, live);
      }
    });
    let currentLiveComps = Array.from(compByManager.values());
    if (isCompManagerLogin && matchingLiveComps.length > 1) {
      const sum = (field) =>
        matchingLiveComps.reduce((total, row) => total + num(row[field]), 0);
      currentLiveComps = currentLiveComps.map((row) => ({
        ...row,
        calculated_budget: sum("calculated_budget"),
        applied_budget: sum("applied_budget"),
        budget_base: sum("budget_base"),
        original_headcount: sum("original_headcount"),
      }));
    }
    const savedKeys = new Set(
      currentLiveComps.map((live) =>
        ownerKey(
          resolveManager(live.comp_manager_display || live.comp_manager),
        ),
      ),
    );
    const unsaved = Array.from(managerStats.entries())
      .filter(([key]) => key && !savedKeys.has(key))
      .map(([, stats]) => ({
        id: "",
        comp_manager: stats.name,
        percentage: 0,
        budget_base: 0,
        calculated_budget: 0,
        applied_budget: 0,
        total_utilization: stats.utilized,
      }));
    return currentLiveComps.concat(unsaved).map((live) => {
      const pct = num(live.percentage);
      const resolvedName = resolveManager(
        live.comp_manager_display || live.comp_manager,
      );
      const stats = managerStats.get(ownerKey(resolvedName)) || {
        count: 0,
        base: 0,
        utilized: 0,
        name: resolvedName || live.comp_manager,
      };
      // Comp Manager Budget Base is the sum of Previous_Appraisal_total_CTC_with_rewards
      // for that manager's current eligible Appraisal Sheet employees, matching
      // the Budget Master base calculation. Do not split the Tech-Ed pool by headcount.
      const hasCurrentRoster = managerStats.has(ownerKey(resolvedName));
      const base = hasCurrentRoster
        ? stats.base
        : num(live.budget_base) ||
          (pct ? (num(live.calculated_budget) * 100) / pct : 0);
      const original = num(live.calculated_budget);
      const updated = num(live.applied_budget);
      const managerName = String(
        stats.name || resolvedName || "Unassigned Comp Manager",
      ).trim();
      const managerLog = live.id
        ? log
            .filter(
              (entry) =>
                entry.level === "comp" &&
                String(entry.rowId) === String(live.id),
            )
            .sort(byDate)
        : [];
      const savedAt = live.updated_at || live.created_at || "";
      const baseStamp = splitStamp(live.created_at || live.updated_at || "");
      const history = [
        {
          date: baseStamp.date,
          time: baseStamp.time,
          amount: original,
          team: stats.count,
          pct:
            managerLog.length && managerLog[0].from != null
              ? num(managerLog[0].from)
              : pct,
        },
        ...managerLog.map((entry) => ({
          date: entry.date,
          time: entry.time,
          amount: num(entry.after),
          team: stats.count,
          pct: num(entry.to),
        })),
      ];
      const lastEntry = managerLog.length
        ? managerLog[managerLog.length - 1]
        : null;
      const lastStamp = lastEntry
        ? { date: lastEntry.date, time: lastEntry.time }
        : splitStamp(savedAt);
      return {
        name: managerName,
        pct,
        pct0: pct,
        base,
        // Keep the baseline count fixed only as historical reference; the current
        // count always reflects the current eligible Appraisal Sheet roster.
        // Original Count is the saved baseline only; never fill a missing
        // value from today's team size, which changes with eligibility/delegation.
        // The API handles legacy schemas. Never substitute a live/current count.
        team0:
          live.original_headcount !== null &&
          live.original_headcount !== undefined &&
          String(live.original_headcount).trim() !== ""
            ? num(live.original_headcount)
            : 0,
        // Current count follows the live eligible Appraisal Sheet roster;
        // persisted current_headcount can be stale after a delegation change.
        team: stats.count,
        original,
        updated,
        liveId: live.id,
        liveCalculated: original,
        liveApplied: updated,
        liveUtilized: stats.utilized,
        lastChanged: lastStamp.date,
        lastChangedTime: lastStamp.time,
        logCount: managerLog.length,
        savedAt,
        history,
      };
    });
  }, [
    liveComps,
    employeeRows,
    techOwnerKey,
    log,
    techEdOwners,
    activeCycleId,
    isCompManagerView,
    isCompManagerLogin,
    user,
    liveTech,
    applies,
  ]);

  useEffect(() => {
    if (!applies || !isCompManagerLogin || cycleLoading || budgetLoading)
      return;
    if (cmNodes.length) return;
    console.warn("[Comp Manager budget] no allocation resolved", {
      activeCycleId,
      techOwnerKey,
      hasLiveTech: Boolean(liveTech),
      compRows: budgetCompManagerRows.length,
      parentRows: budgetDistributionRows.length,
      rosterRows: employeeRows.length,
    });
  }, [
    applies,
    isCompManagerLogin,
    cycleLoading,
    budgetLoading,
    cmNodes.length,
    activeCycleId,
    techOwnerKey,
    liveTech,
    budgetCompManagerRows.length,
    budgetDistributionRows.length,
    employeeRows.length,
  ]);

  // A Tech-Ed preview may only see a Comp Manager allocation if the signed-in
  // employee is itself that Comp Manager. Never default to another manager.
  const selectedManagerNode = isCompManagerView ? cmNodes[0] || null : null;
  // Use the same selected allocation row/value as Dashboard, Appraisal Sheet,
  // and Detail Screen so the Tech-Ed allocation cannot drift across screens.
  // A budget row can exist before HR applies a percentage. Do not present
  // that placeholder as an allocated/original budget until it has a real amount.
  const hasLiveAllocation = isCompManagerView
    ? Boolean(activeCycleId && selectedManagerNode?.liveId)
    : Boolean(
        activeCycleId &&
        liveTech &&
        (liveTech.percentage_is_set === true ||
          (liveTech.percentage !== null &&
            liveTech.percentage !== undefined &&
            String(liveTech.percentage).trim() !== "")),
      );
  const myOriginal = hasLiveAllocation
    ? isCompManagerView
      ? num(selectedManagerNode?.original)
      : sharedBudgetTotals?.budgetScope === "teched"
        ? num(sharedBudgetTotals.base)
        : num(liveTech.calculated_budget)
    : null;
  const myUpdated = hasLiveAllocation
    ? isCompManagerView
      ? num(selectedManagerNode?.updated)
      : sharedBudgetTotals?.budgetScope === "teched"
        ? num(sharedBudgetTotals.updated)
        : num(liveTech.applied_budget)
    : null;

  return {
    applies,
    // What the Budget Distribution screen shows as "Updated Budget".
    // 0 when this login has no saved allocation for the active cycle.
    updatedBudget: applies && hasLiveAllocation ? myUpdated : 0,
    // True until the cycle and budget data needed to resolve it have loaded.
    pending: applies && (cycleLoading || Boolean(budgetLoading)),
    error: budgetError,
    user,
    myName,
    isCompManagerView,
    isCompManagerLogin,
    cycleRows,
    activeCycleId,
    cycleLoading,
    liveTech,
    loginTechOwner,
    techOwnerKey,
    activeCycle,
    liveComps,
    liveMaster,
    log,
    cmNodes,
    selectedManagerNode,
    hasLiveAllocation,
    myOriginal,
    myUpdated,
  };
}
