import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";
import { useViewAs, currentUserMatchesManager } from "@/lib/view-as-store";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

const BudgetContext = createContext(null);

function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).trim().replace(/[₹,\s]/g, "").replace(/^(?:INR|Rs\.?)/i, "");
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRow(row) {
  const calculated = number(row.calculated_budget);
  const applied = number(row.applied_budget);
  // A zero in one alias must not mask a populated utilization field.
  const utilized = number(row.budget_utilized) || number(row.total_utilization) ||
    number(row.utilized_amount) || number(row.utilized);
  return {
    ...row,
    id: String(row.id || ""),
    appraisal_cycle_id: String(row.appraisal_cycle_id || ""),
    tech_ed_id: String(row.tech_ed_id || row.appraiser_tech_ed_id || ""),
    budget_percentage: number(row.budget_percentage ?? row.percentage),
    budget_amount: calculated,
    additional_budget: 0,
    budget_utilized: utilized,
    budget_remaining: applied - utilized,
    status: "Active",
    updated_budget: applied,
    calculated_budget: calculated,
    applied_budget: applied,
    total_utilization: number(row.total_utilization) || number(row.budget_utilized) ||
      number(row.utilized_amount) || number(row.utilized),
    utilization_percentage: applied > 0 ? (utilized / applied) * 100 : 0,
  };
}

// Lowercase and collapse whitespace so "EMP001 -  Jane  Doe" == "emp001 - jane doe".
function normalizeOwner(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Exact ownership match on the Tech-ED value, which is either a plain id/name/email
// or "EMPxxxx - Name". Empty owners or identities never match.
function ownerMatches(owner, identities) {
  const normalized = normalizeOwner(owner);
  if (!normalized) return false;
  const parts = normalized.match(/^(\S+)\s*-\s*(.+)$/);
  const candidates = parts ? [normalized, parts[1], parts[2]] : [normalized];
  return identities.some(
    (identity) => identity && candidates.includes(identity),
  );
}

const EMPLOYEE_PAGE_LIMIT = 100; // employeesapi caps limit at 100

async function fetchAllEligibleEmployees() {
  const employees = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = new URL(catalystFunctionUrl("employeesapi"));
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(EMPLOYEE_PAGE_LIMIT));
    // Budget Distribution is also used by Tech-Ed accounts, which are not
    // authorized for the Employee Master screen. Request the Appraisal view so
    // employeesapi applies the signed-in user's normal appraisal scope instead
    // of returning a transient 403 for this supplementary roster request.
    url.searchParams.set("view", "appraisal");
    url.searchParams.set("status", "all");
    url.searchParams.set("eligible", "all");
    url.searchParams.set("_ts", String(Date.now()));
    const response = await catalystFetch(url.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    let json = {};
    try {
      json = await response.json();
    } catch (_) {
      json = {};
    }
    if (!response.ok || (json && json.success === false)) {
      throw new Error(
        (json && json.message) ||
          `Failed to load employees for budget counts (${response.status}).`,
      );
    }
    employees.push(...(Array.isArray(json && json.data) ? json.data : []));
    totalPages = Math.max(
      1,
      Number((json && json.pagination && json.pagination.totalPages) || 1),
    );
    page += 1;
  } while (page <= totalPages);
  return employees;
}

export function BudgetProvider({ children }) {
  const authenticatedUser = useCatalystUser();
  const { effectiveId, actualId } = useViewAs();
  const isCompManagerPreview = effectiveId === "compmanager" && actualId === "teched";
  const currentUser = useMemo(
    () => ({
      name:
        (authenticatedUser && authenticatedUser.name) ||
        (authenticatedUser && authenticatedUser.email) ||
        "Unknown user",
      email: (authenticatedUser && authenticatedUser.email) || "",
      role: (authenticatedUser && authenticatedUser.role) || "",
    }),
    [authenticatedUser],
  );

  const roleText = String(currentUser.role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isHR =
    roleText === "hr" ||
    roleText === "humanresources" ||
    roleText === "hroperation";
  const [budgetRows, setBudgetRows] = useState([]);
  const [budgetMasterRows, setBudgetMasterRows] = useState([]);
  const [activeBudgetCycleId, setActiveBudgetCycleId] = useState("");
  const [budgetDistributionRows, setBudgetDistributionRows] = useState([]);
  const [budgetCompManagerRows, setBudgetCompManagerRows] = useState([]);
  const [employeeRows, setEmployeeRows] = useState([]);
  const [techEdOwners, setTechEdOwners] = useState([]);
  // Why the budget base may be 0 (from budgetmasterapi), shown to HR.
  const [budgetWarning, setBudgetWarning] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const budgetUrl = new URL(catalystFunctionUrl("budgetmasterapi"));
      budgetUrl.searchParams.set("_ts", String(Date.now()));
      const [budgetResponse, employeeResult] = await Promise.all([
        catalystFetch(budgetUrl.toString(), {
          cache: "no-store",
          headers: { Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" },
        }),
        fetchAllEligibleEmployees().then(
          (employees) => ({ employees }),
          (employeeError) => ({ employees: [], employeeError }),
        ),
      ]);

      let budgetJson = {};
      try {
        budgetJson = await budgetResponse.json();
      } catch (_) {
        budgetJson = {};
      }
      if (!budgetResponse.ok) {
        const statusText =
          budgetResponse.status === 404
            ? "Budget Master API is not deployed in the current Catalyst environment."
            : (budgetJson && budgetJson.message) ||
              `Failed to load Budget Master (${budgetResponse.status}).`;
        throw new Error(statusText);
      }

      const techEdRows = Array.isArray(budgetJson && budgetJson.techEd)
        ? budgetJson.techEd
        : Array.isArray(budgetJson && budgetJson.data)
          ? budgetJson.data
          : [];
      const apiTechEdOwners = Array.isArray(
        budgetJson && budgetJson.techEdOwners,
      )
        ? budgetJson.techEdOwners
        : [];
      const masterRows = Array.isArray(budgetJson && budgetJson.master)
        ? budgetJson.master
        : [];
      const compRows = Array.isArray(budgetJson && budgetJson.compManager)
        ? budgetJson.compManager
        : [];
      const activeCycleId = String(budgetJson?.active_appraisal_cycle_id || "").trim();
      setActiveBudgetCycleId(activeCycleId);
      const normalizedTechEd = techEdRows.map(normalizeRow).filter((row) =>
        Boolean(activeCycleId) && String(row.appraisal_cycle_id || "").trim() === activeCycleId
      );
      const normalizedMaster = masterRows.map(normalizeRow).filter((row) =>
        Boolean(activeCycleId) && String(row.appraisal_cycle_id || "").trim() === activeCycleId
      );
      const normalizedComp = compRows.map((row) => ({
        ...row,
        id: String(row.id || ""),
        appraisal_cycle_id: String(row.appraisal_cycle_id || ""),
        budget_distribution_id: String(row.budget_distribution_id || ""),
        comp_manager: String(row.comp_manager || ""),
        percentage: number(row.percentage),
        calculated_budget: number(row.calculated_budget),
        total_utilization: number(row.total_utilization),
        applied_budget: number(row.applied_budget),
        utilization_percentage:
          number(row.applied_budget) > 0
            ? (number(row.total_utilization) / number(row.applied_budget)) * 100
            : 0,
      })).filter((row) =>
        Boolean(activeCycleId) && String(row.appraisal_cycle_id || "").trim() === activeCycleId
      );
      // Keep the existing budgetRows API shape for current screens, while
      // exposing the three relational levels to every budget consumer.
      setBudgetRows(normalizedTechEd);
      setBudgetMasterRows(normalizedMaster);
      setBudgetDistributionRows(normalizedTechEd);
      setBudgetCompManagerRows(normalizedComp);

      const apiEmployees = activeCycleId && Array.isArray(employeeResult.employees)
        ? employeeResult.employees
        : [];
      const rosterEmployees = activeCycleId && Array.isArray(
        budgetJson && budgetJson.employeeRoster,
      )
        ? budgetJson.employeeRoster
        : [];
      // Merge rather than choose one source: employeesapi supplies the full
      // employee detail where permitted, while Budget Master API guarantees
      // the appraisal/master Tech-ED assignment is present.
      const employeeById = new Map();
      apiEmployees.forEach((employee) => {
        const id = String(employee.emp_id || employee.employee_id || "")
          .trim()
          .toLowerCase();
        if (id) employeeById.set(id, employee);
      });
      rosterEmployees.forEach((employee) => {
        const id = String(employee.emp_id || employee.employee_id || "")
          .trim()
          .toLowerCase();
        if (!id) return;
        const previous = employeeById.get(id) || {};
        employeeById.set(id, {
          ...previous,
          ...employee,
          in_appraisal_sheet: true,
          // Preserve the resolved Appraisal Sheet assignment separately;
          // the raw lookup FK may be a numeric Employee_Master ROWID.
          appraiser_tech_ed_row_id: String(
            employee.appraiser_tech_ed_row_id ||
              previous.appraiser_tech_ed_row_id ||
              "",
          ),
          appraiser_tech_ed_appraisal_sheet: String(
            employee.appraiser_tech_ed_appraisal_sheet ||
              previous.appraiser_tech_ed_appraisal_sheet ||
              "",
          ),
          appraiser_tech_ed: String(
            employee.appraiser_tech_ed_appraisal_sheet ||
              employee.appraiser_tech_ed ||
              previous.appraiser_tech_ed_appraisal_sheet ||
              previous.appraiser_tech_ed ||
              previous.appraiser_tech_ed_id ||
              "",
          ),
        });
      });
      const mergedEmployees = Array.from(employeeById.values());
      setEmployeeRows(mergedEmployees);

      // Tech-ED owners: the API list first, then any extra assignment found in
      // the merged employees, so no Tech-ED from the Appraisal Sheet is missed.
      const ownerByKey = new Map();
      apiTechEdOwners.forEach((item) => {
        const assignment = String((item && item.assignment) || "").trim();
        if (assignment) {
          ownerByKey.set(normalizeOwner(assignment), {
            ...item,
            assignment,
            row_id: String(item.row_id || item.ROWID || ""),
            employee_id: String(item.employee_id || item.emp_id || ""),
            name: String(item.name || ""),
          });
        }
      });
      mergedEmployees.forEach((employee) => {
        const assignment = String(
          employee.appraiser_tech_ed ||
            employee.appraiser_tech_ed_id ||
            employee.tech_ed ||
            employee.tech_ed_id ||
            "",
        ).trim();
        const key = normalizeOwner(assignment);
        if (key && !ownerByKey.has(key)) ownerByKey.set(key, { assignment });
      });
      setTechEdOwners(Array.from(ownerByKey.values()));
      setBudgetWarning(String(budgetJson && budgetJson.diagnostics && budgetJson.diagnostics.warning || ""));

      // Show the first problem found so a failed roster read is visible on the page.
      if (budgetJson && budgetJson.rosterError) {
        console.error("Budget Master roster error:", budgetJson.rosterError);
        setError(
          "Appraisal Sheet roster could not be read: " + budgetJson.rosterError,
        );
      } else if (employeeResult.employeeError) {
        // Budget Master API already returns its cycle-scoped employeeRoster.
        // employeesapi is an auxiliary detail source; its failure must not mark
        // an otherwise authoritative budget total as failed or trigger a demo value.
        console.warn(
          "Supplementary employee details could not be loaded; using Budget Master roster:",
          employeeResult.employeeError,
        );
      }
    } catch (e) {
      console.error("Failed to load Budget Master:", e);
      setBudgetRows([]);
      setBudgetMasterRows([]);
      setActiveBudgetCycleId("");
      setBudgetDistributionRows([]);
      setBudgetCompManagerRows([]);
      setEmployeeRows([]);
      setTechEdOwners([]);
      setError((e && e.message) || "Failed to load Budget Master.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refreshBudget = () => { load(); };
    const refreshForCycleChange = () => {
      // Clear the previous cycle synchronously so stale amounts cannot remain
      // visible while the new active-cycle response is loading.
      setActiveBudgetCycleId("");
      setBudgetRows([]);
      setBudgetMasterRows([]);
      setBudgetDistributionRows([]);
      setBudgetCompManagerRows([]);
      setEmployeeRows([]);
      setTechEdOwners([]);
      setBudgetWarning("");
      refreshBudget();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("appraisal:payroll-data-updated", refreshBudget);
      window.addEventListener("appraisal:budget-data-updated", refreshBudget);
      window.addEventListener("appraisal:cycle-updated", refreshForCycleChange);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("appraisal:payroll-data-updated", refreshBudget);
        window.removeEventListener("appraisal:budget-data-updated", refreshBudget);
        window.removeEventListener("appraisal:cycle-updated", refreshForCycleChange);
      }
    };
  }, [load]);



  const rows = useMemo(
    () =>
      budgetRows.filter(
        (row) => !row.status || row.status.toLowerCase() === "active",
      ),
    [budgetRows],
  );

  const employeeCounts = useMemo(() => {
    const getOwner = (employee) =>
      normalizeOwner(
        employee.appraiser_tech_ed ||
          employee.tech_ed_id ||
          employee.tech_ed ||
          employee.appraiserTechEd ||
          employee.appraiser ||
          "",
      );

    return rows.reduce((map, row) => {
      const owner = normalizeOwner(row.tech_ed_id);
      const matched = owner
        ? employeeRows.filter((employee) => getOwner(employee) === owner)
        : [];
      map[row.tech_ed_id] = matched.length;
      return map;
    }, {});
  }, [rows, employeeRows]);

  const totals = useMemo(() => {
    const detectedIdentities = [currentUser.name, currentUser.email].map(normalizeOwner).filter(Boolean);
    const detectedDirectoryOwner = techEdOwners.find((item) =>
      [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id]
        .filter(Boolean).some((alias) => ownerMatches(alias, detectedIdentities)),
    );
    const detectedLoginEmployee = employeeRows.find((employee) =>
      [
        employee?.row_id, employee?.ROWID, employee?.ROW_ID, employee?.id,
        employee?.emp_id, employee?.employee_id, employee?.employeeId,
        employee?.emp_name, employee?.employee_name, employee?.name,
        employee?.email, employee?.email_id, employee?.emailId,
      ].filter(Boolean).some((alias) => detectedIdentities.includes(normalizeOwner(alias))),
    );
    const detectedOwnerAliases = [
      ...detectedIdentities,
      detectedDirectoryOwner?.employee_id, detectedDirectoryOwner?.row_id,
      detectedDirectoryOwner?.ROWID, detectedDirectoryOwner?.assignment,
      detectedDirectoryOwner?.name, detectedDirectoryOwner?.email,
      detectedLoginEmployee?.row_id, detectedLoginEmployee?.ROWID,
      detectedLoginEmployee?.emp_id, detectedLoginEmployee?.employee_id,
      detectedLoginEmployee?.employeeId, detectedLoginEmployee?.name,
      detectedLoginEmployee?.emp_name, detectedLoginEmployee?.employee_name,
    ].map(normalizeOwner).filter(Boolean);
    const hasTechEdAllocationForLogin = budgetDistributionRows.some((row) => {
      const raw = row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed ||
        row.appraiser_tech_ed || row.appraiser_tech_ed1 || "";
      return ownerMatches(raw, detectedOwnerAliases) || detectedOwnerAliases.includes(normalizeOwner(raw));
    });
    const isTechEdBudgetView = roleText.includes("teched") || (!isHR && hasTechEdAllocationForLogin);

    if (isCompManagerPreview) {
      const ownParentCandidates = budgetDistributionRows.filter((row) => {
        const raw = row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed ||
          row.appraiser_tech_ed || row.appraiser_tech_ed1 || "";
        const matchesOwner = ownerMatches(raw, detectedOwnerAliases) ||
          detectedOwnerAliases.includes(normalizeOwner(raw));
        return matchesOwner &&
          (!activeBudgetCycleId || String(row.appraisal_cycle_id || "") === activeBudgetCycleId);
      });
      const ownParent = ownParentCandidates.length === 1 ? ownParentCandidates[0] : null;
      const managerCandidates = budgetCompManagerRows.filter((row) => {
        if ((activeBudgetCycleId && String(row.appraisal_cycle_id || "") !== activeBudgetCycleId) ||
            !ownParent ||
            String(row.budget_distribution_id || "") !== String(ownParent.id || "")) return false;
        const rawManager = String(row.comp_manager || "").trim();
        if (currentUserMatchesManager(rawManager, authenticatedUser, employeeRows)) return true;
        // Budget_Distribution_Comp may store a lookup ROWID while the roster
        // exposes the human-readable "Employee ID - Name" assignment.
        const linkedManager = employeeRows.find((employee) =>
          [employee.comp_manager, employee.comp_manager_id, employee.compManager,
            employee.comp_manager_display, employee.comp_manager_name]
            .filter(Boolean)
            .some((alias) =>
              normalizeOwner(alias) === normalizeOwner(rawManager) ||
              ownerMatches(alias, [normalizeOwner(rawManager)])
            )
        );
        return Boolean(linkedManager?.comp_manager_display) &&
          currentUserMatchesManager(linkedManager.comp_manager_display, authenticatedUser, employeeRows);
      });
      const manager = managerCandidates.length === 1 ? managerCandidates[0] : null;
      if (manager) {
        const original = number(manager.calculated_budget);
        const updated = number(manager.applied_budget);
        const utilized = number(manager.total_utilization);
        return {
          base: original, additional: 0, updated, utilized,
          remaining: updated - utilized, hasBudgetMaster: false,
          hasAuthoritativeBudget: true, budgetScope: "compmanager",
        };
      }
      return {
        base: 0, additional: 0, updated: 0, utilized: 0, remaining: 0,
        hasBudgetMaster: false, hasAuthoritativeBudget: true, budgetScope: "compmanager",
      };
    }

    // A Tech-Ed login must see their own Budget_Distribution allocation,
    // not the organisation-wide Budget_Master total. Dashboard, Appraisal Sheet,
    // and Detail Screen all consume this shared role-aware total.
    if (isTechEdBudgetView) {
      const identities = [currentUser.name, currentUser.email]
        .map(normalizeOwner).filter(Boolean);
      const directoryOwner = techEdOwners.find((item) =>
        [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id]
          .filter(Boolean).some((alias) => ownerMatches(alias, identities)),
      );
      const ownerAliases = [
        ...detectedOwnerAliases,
        ...identities,
        directoryOwner?.employee_id, directoryOwner?.row_id, directoryOwner?.ROWID,
        directoryOwner?.assignment, directoryOwner?.name, directoryOwner?.email,
      ].map(normalizeOwner).filter(Boolean);
      const ownsRow = (row) => {
        const raw = row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed ||
          row.appraiser_tech_ed || row.appraiser_tech_ed1 || "";
        return ownerMatches(raw, ownerAliases) ||
          ownerAliases.includes(normalizeOwner(raw));
      };
      const ownedRows = budgetDistributionRows.filter(ownsRow);
      const cycleRows = activeBudgetCycleId
        ? ownedRows.filter((row) => String(row.appraisal_cycle_id || "") === activeBudgetCycleId)
        : ownedRows;
      const activeCycleRows = activeBudgetCycleId
        ? budgetDistributionRows.filter((row) => String(row.appraisal_cycle_id || "") === activeBudgetCycleId)
        : budgetDistributionRows;
      // The API filters Budget_Distribution to this Tech-Ed for scoped logins.
      // If legacy owner aliases still fail to match, a single row for the active
      // cycle is the allocation the distribution screen is showing.
      const candidates = cycleRows.length
        ? cycleRows
        : activeCycleRows.length === 1
          ? activeCycleRows
          : ownedRows.length === 1
            ? ownedRows
            : !activeBudgetCycleId && budgetDistributionRows.length === 1
              ? budgetDistributionRows
              : [];
      const own = candidates.length === 1 ? candidates[0] : null;
      if (own) {
        const updated = number(own.applied_budget ?? own.updated_budget);
        const original = number(own.calculated_budget ?? own.budget_amount);
        const utilized = number(own.total_utilization ?? own.budget_utilized);
        return {
          base: original,
          additional: 0,
          updated,
          utilized,
          remaining: updated - utilized,
          hasBudgetMaster: false,
          hasAuthoritativeBudget: true,
          budgetScope: "teched",
        };
      }
      // A Tech-Ed with no unique allocation has no safely attributable budget.
      // Return zero rather than displaying another role's/org-wide budget.
      return {
        base: 0, additional: 0, updated: 0, utilized: 0, remaining: 0,
        hasBudgetMaster: false, hasAuthoritativeBudget: true, budgetScope: "teched",
      };
    }

    // HR and other organisation-wide views use the active cycle's Budget_Master.
    const master = budgetMasterRows.find((row) =>
      activeBudgetCycleId && String(row.appraisal_cycle_id || "") === activeBudgetCycleId
    ) || (!activeBudgetCycleId && budgetMasterRows.length === 1 ? budgetMasterRows[0] : null);
    if (master) {
      const original = number(master.calculated_budget);
      const updated = number(master.applied_budget);
      const utilized = number(master.budget_utilized ?? master.total_utilization);
      return {
        base: original,
        additional: 0,
        updated,
        utilized,
        remaining: updated - utilized,
        hasBudgetMaster: true,
        hasAuthoritativeBudget: true,
        budgetScope: "org",
      };
    }
    // Backwards-compatible fallback only when there is no authoritative row.
    return rows.reduce(
      (sum, row) => ({
        base: sum.base + row.budget_amount,
        additional: sum.additional + row.additional_budget,
        updated: sum.updated + row.updated_budget,
        utilized: sum.utilized + row.budget_utilized,
        remaining: sum.remaining + row.budget_remaining,
      }),
      { base: 0, additional: 0, updated: 0, utilized: 0, remaining: 0, hasBudgetMaster: false, hasAuthoritativeBudget: false },
    );
  }, [rows, budgetMasterRows, budgetDistributionRows, budgetCompManagerRows, employeeRows, techEdOwners, currentUser, roleText, activeBudgetCycleId, isCompManagerPreview, authenticatedUser]);

  const hierarchy = useMemo(() => {
    const next = {};
    rows.forEach((row) => {
      const owner = String(row.tech_ed_id || "").trim();
      if (owner) next[owner] = { level: 1, parent: null };
    });
    return next;
  }, [rows]);

  const allocationSnapshot = useMemo(() => ({ date: "", teams: {} }), []);
  const eligibilityEvents = useMemo(() => [], []);
  const gridSupervisorChanges = useMemo(() => [], []);

  const updateBudget = useCallback(
    async (id, changes, resource = "master", refresh = true) => {
      const response = await catalystFetch(
        catalystFunctionUrl("budgetmasterapi"),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, resource, ...changes }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error((result && result.message) || "Budget update failed.");
      if (refresh) await load();
      return result;
    },
    [load],
  );

  return (
    <BudgetContext.Provider
      value={{
        currentUser,
        isHR,
        budgetRows: rows,
        budgetMasterRows,
        activeBudgetCycleId,
        budgetDistributionRows,
        budgetCompManagerRows,
        employeeRows,
        techEdOwners,
        budgetWarning,
        employeeCounts,
        totals,
        loading,
        error,
        reload: load,
        updateBudget,
        hierarchy,
        eligibilityEvents,
        gridSupervisorChanges,
        allocationSnapshot,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudget() {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error("useBudget must be used within BudgetProvider");
  return ctx;
}
