import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

const BudgetContext = createContext(null);

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRow(row) {
  const base = number(row.budget_amount);
  const additional = number(row.additional_budget);
  const updated = base + additional;
  const utilized = number(row.budget_utilized);
  return {
    ...row,
    id: String(row.id || ""),
    appraisal_cycle_id: String(row.appraisal_cycle_id || ""),
    tech_ed_id: String(row.tech_ed_id || ""),
    budget_percentage: number(row.budget_percentage),
    budget_amount: base,
    additional_budget: additional,
    budget_utilized: utilized,
    budget_remaining: updated - utilized,
    status: String(row.status || ""),
    updated_budget: updated,
    utilization_percentage: updated > 0 ? (utilized / updated) * 100 : 0,
  };
}

export function BudgetProvider({ children }) {
  const authenticatedUser = useCatalystUser();
  const currentUser = useMemo(
    () => ({
      name: authenticatedUser && authenticatedUser.name || authenticatedUser && authenticatedUser.email || "Unknown user",
      email: authenticatedUser && authenticatedUser.email || "",
      role: authenticatedUser && authenticatedUser.role || "",
    }),
    [authenticatedUser],
  );

  const roleText = String(currentUser.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isHR = roleText === "hr" || roleText.includes("hr");
  const [budgetRows, setBudgetRows] = useState([]);
  const [employeeRows, setEmployeeRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [budgetResponse, employeeResponse] = await Promise.all([
        catalystFetch(catalystFunctionUrl("budgetmasterapi")),
        catalystFetch(catalystFunctionUrl("employeesapi") + "?page=1&limit=500&status=active&eligible=eligible"),
      ]);

      let budgetJson = {};
      try { budgetJson = await budgetResponse.json(); } catch (_) { budgetJson = {}; }
      if (!budgetResponse.ok) {
        const statusText = budgetResponse.status === 404
          ? "Budget Master API is not deployed in the current Catalyst environment."
          : (budgetJson && budgetJson.message || `Failed to load Budget Master (${budgetResponse.status}).`);
        throw new Error(statusText);
      }
      let employeeJson = {};
      try { employeeJson = employeeResponse.ok ? await employeeResponse.json() : {}; } catch (_) { employeeJson = {}; }

      setBudgetRows((Array.isArray(budgetJson && budgetJson.data) ? budgetJson.data : []).map(normalizeRow));
      setEmployeeRows(Array.isArray(employeeJson && employeeJson.data) ? employeeJson.data : []);
    } catch (e) {
      console.error("Failed to load Budget Master:", e);
      setBudgetRows([]);
      setEmployeeRows([]);
      setError(e && e.message || "Failed to load Budget Master.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const active = budgetRows.filter((row) => !row.status || row.status.toLowerCase() === "active");
    if (isHR) return active;
    const key = currentUser.name.trim().toLowerCase();
    const email = currentUser.email.trim().toLowerCase();
    return active.filter((row) => {
      const owner = row.tech_ed_id.trim().toLowerCase();
      return owner === key || owner === email || owner.includes(key) || key.includes(owner) || (email && (owner.includes(email) || email.includes(owner)));
    });
  }, [budgetRows, currentUser, isHR]);

  const employeeCounts = useMemo(() => {
    const getOwner = (employee) =>
      String(
        employee.appraiser_tech_ed ||
        employee.tech_ed_id ||
        employee.tech_ed ||
        employee.appraiserTechEd ||
        employee.appraiser ||
        "",
      ).trim().toLowerCase();

    return rows.reduce((map, row) => {
      const owner = row.tech_ed_id.trim().toLowerCase();
      const matched = employeeRows.filter((employee) => getOwner(employee) === owner);
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

  const updateBudget = useCallback(async (id, changes) => {
    const response = await catalystFetch(catalystFunctionUrl("budgetmasterapi"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...changes }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result && result.message || "Budget update failed.");
    await load();
    return result;
  }, [load]);

  return (
    <BudgetContext.Provider
      value={{
        currentUser,
        isHR,
        budgetRows: rows,
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
