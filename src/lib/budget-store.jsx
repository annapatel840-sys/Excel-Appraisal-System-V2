import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";
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
  const utilized = number(row.budget_utilized ?? row.total_utilization);
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
    total_utilization: number(row.total_utilization ?? row.budget_utilized),
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
    // HR Budget Master needs the full Appraisal Sheet roster to discover
    // every assigned Tech-ED, not only active/eligible employees.
    url.searchParams.set("view", "master");
    url.searchParams.set("status", "all");
    url.searchParams.set("eligible", "all");
    const response = await catalystFetch(url.toString());
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
      const [budgetResponse, employeeResult] = await Promise.all([
        catalystFetch(catalystFunctionUrl("budgetmasterapi")),
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
      const normalizedTechEd = techEdRows.map(normalizeRow);
      const normalizedMaster = masterRows.map(normalizeRow);
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
      }));
      // Keep the existing budgetRows API shape for current screens, while
      // exposing the three relational levels to every budget consumer.
      setBudgetRows(normalizedTechEd);
      setBudgetMasterRows(normalizedMaster);
      setBudgetDistributionRows(normalizedTechEd);
      setBudgetCompManagerRows(normalizedComp);

      const apiEmployees = Array.isArray(employeeResult.employees)
        ? employeeResult.employees
        : [];
      const rosterEmployees = Array.isArray(
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
          appraiser_tech_ed: String(
            employee.appraiser_tech_ed ||
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
        if (assignment)
          ownerByKey.set(normalizeOwner(assignment), { assignment });
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
        console.error(
          "Failed to load employees for budget counts:",
          employeeResult.employeeError,
        );
        setError(
          employeeResult.employeeError.message ||
            "Failed to load employee counts.",
        );
      }
    } catch (e) {
      console.error("Failed to load Budget Master:", e);
      setBudgetRows([]);
      setBudgetMasterRows([]);
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

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          base: sum.base + row.budget_amount,
          additional: sum.additional + row.additional_budget,
          updated: sum.updated + row.updated_budget,
          utilized: sum.utilized + row.budget_utilized,
          remaining: sum.remaining + row.budget_remaining,
        }),
        { base: 0, additional: 0, updated: 0, utilized: 0, remaining: 0 },
      ),
    [rows],
  );

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
