import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";

import {
  DEFAULT_BUDGET_CONFIG,
  computeNode,
  budgetForUser,
  rootsOf,
} from "@/lib/budget-engine";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";


const BudgetContext = createContext(null);

export function BudgetProvider({ children }) {
  const authenticatedUser = useCatalystUser();
  const currentUser = {
    name: authenticatedUser?.name || authenticatedUser?.email || "Unknown user",
    role: authenticatedUser?.role || "",
  };
  const hierarchy = useMemo(() => {
    const next = {};
    budgetRows.forEach((row) => {
      const owner = String(row.tech_ed_id || "").trim();
      if (owner) next[owner] = { level: 1, parent: null };
    });
    return next;
  }, [budgetRows]);
  const [levels, setLevels] = useState(["Tech ED"]);
  const [budgetConfig, setBudgetConfig] = useState({
    baseColumns: ["currentAnnualBasePay"],
    baseLocked: true,
    utilisedColumns: [{ key: "hikeAmount", label: "Hike Amount" }],
  });

  const [budgetRows, setBudgetRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function loadBudgetMaster() {
      try {
        const response = await catalystFetch(catalystFunctionUrl("budgetmasterapi"));
        if (!response.ok) throw new Error("Failed to load Budget Master.");
        const result = await response.json();
        if (!cancelled) {
          const rows = Array.isArray(result?.data) ? result.data : [];
          setBudgetRows(rows.map((row) => ({
            ...row,
            empId: String(row.id || row.tech_ed_id || ""),
            name: String(row.tech_ed_id || ""),
            compManager: String(row.tech_ed_id || ""),
            currentAnnualBasePay: Number(row.budget_amount || 0),
            hikeAmount: Number(row.budget_utilized || 0),
            allocatedPBAmount: 0,
          })));
          setPctMap(Object.fromEntries(rows.map((row) => [String(row.tech_ed_id || ""), Number(row.budget_percentage || 0)])));
          setOrgPct(rows.length ? Number(rows[0].budget_percentage || 0) : 0);
        }
      } catch (error) {
        console.error("Failed to load Budget Master:", error);
        if (!cancelled) setBudgetRows([]);
      }
    }
    loadBudgetMaster();
    return () => { cancelled = true; };
  }, []);
  const [eligibilityEvents, setEligibilityEvents] = useState([]);
  const [gridSupervisorChanges, setGridSupervisorChanges] = useState([]);
  const [allocationSnapshot, setAllocationSnapshot] = useState({
    date: "",
    by: "",
    teams: {},
  });
  const [leavers, setLeavers] = useState({});

  const [pct, setPctMap] = useState({});
  const [originalPct] = useState({});
  const [orgPct, setOrgPct] = useState(0);
  const [overrides, setOverrides] = useState({});

  const [pctLog, setPctLog] = useState([]);
  const [orgLog, setOrgLog] = useState([]);

  const isHR =
    String(currentUser.role || "").trim().toLowerCase() === "hr";

  const empById = useCallback(
    (id) => budgetRows.find((r) => r.empId === id) || leavers[id],
    [budgetRows, leavers],
  );

  const allocation = useMemo(
    () => ({
      date: allocationSnapshot.date,
      by: allocationSnapshot.by,
      pct,
      orgPct,
      originalPct,
    }),
    [allocationSnapshot.date, allocationSnapshot.by, pct, orgPct, originalPct],
  );

  const node = useCallback(
    (name) =>
      computeNode({
        name,
        rows: budgetRows,
        hierarchy,
        allocation,
        budgetConfig,
        allocationSnapshot,
        empById,
      }),
    [
      budgetRows,
      hierarchy,
      allocation,
      budgetConfig,
      allocationSnapshot,
      empById,
    ],
  );

  const budgetFor = useCallback(
    () =>
      budgetForUser({
        isHR,
        userName: currentUser.name,
        rows: budgetRows,
        hierarchy,
        allocation,
        budgetConfig,
        allocationSnapshot,
        empById,
      }),
    [
      isHR,
      currentUser,
      budgetRows,
      hierarchy,
      allocation,
      budgetConfig,
      allocationSnapshot,
      empById,
    ],
  );

  const canEdit = useCallback(
    (name) => {
      const h = hierarchy[name];
      if (!h) return false;
      return isHR ? !h.parent : h.parent === currentUser.name;
    },
    [hierarchy, isHR, currentUser],
  );

  /** Returns an error string if the change is blocked, otherwise null. */
  const setPct = useCallback(
    (name, to, reason) => {
      const nd = node(name);
      if (!nd) return "No such owner.";
      const newUpdated = (nd.base * to) / 100;

      if (nd.parent) {
        const parentNode = node(nd.parent);
        const sum = parentNode.allotted - nd.updated + newUpdated;
        if (sum > parentNode.updated + 0.5) {
          return `Blocked: ${to}% for ${name} would take total allotted to ₹${(
            sum / 1e5
          ).toFixed(
            2,
          )} L, more than ${nd.parent}'s updated budget of ₹${(parentNode.updated / 1e5).toFixed(2)} L.`;
        }
      }
      if (nd.allotted > newUpdated + 0.5) {
        return `Blocked: at ${to}%, ${name}'s budget would fall below what is already allotted to their reports.`;
      }

      const now = new Date();
      setPctLog((log) => [
        ...log,
        {
          name,
          from: nd.pct,
          to,
          by: currentUser.name,
          date: now.toISOString().slice(0, 10),
          time: now.toTimeString().slice(0, 5),
          before: nd.updated,
          after: newUpdated,
          reason: reason || "",
        },
      ]);
      setPctMap((m) => ({ ...m, [name]: to }));
      setOverrides((o) => {
        const next = { ...o };
        if (to === orgPct) delete next[name];
        else next[name] = true;
        return next;
      });
      return null;
    },
    [node, orgPct, currentUser],
  );

  const applyOrgPct = useCallback(
    (to, reason) => {
      if (Object.keys(hierarchy).length === 0) return;
      const now = new Date();
      const before = budgetForUser({
        isHR: true,
        userName: "",
        rows: budgetRows,
        hierarchy,
        allocation,
        budgetConfig,
        allocationSnapshot,
        empById,
      }).updated;

      setOrgLog((log) => [
        ...log,
        {
          date: now.toISOString().slice(0, 10),
          time: now.toTimeString().slice(0, 5),
          from: orgPct,
          to,
          before,
          by: currentUser.name,
          reason: reason || "",
        },
      ]);

      rootsOf(hierarchy).forEach((r) => {
        if (!overrides[r]) setPctMap((m) => ({ ...m, [r]: to }));
      });
      setOrgPct(to);
    },
    [
      orgPct,
      overrides,
      hierarchy,
      budgetRows,
      allocation,
      budgetConfig,
      allocationSnapshot,
      empById,
      currentUser,
    ],
  );

  const value = {
    hierarchy,
    levels,
    setLevels,
    budgetConfig,
    setBudgetConfig,
    budgetRows,
    setBudgetRows,
    allocation,
    pctLog,
    orgLog,
    overrides,
    eligibilityEvents,
    setEligibilityEvents,
    gridSupervisorChanges,
    setGridSupervisorChanges,
    allocationSnapshot,
    setAllocationSnapshot,
    leavers,
    setLeavers,
    currentUser,
    isHR,
    node,
    budgetFor,
    canEdit,
    setPct,
    applyOrgPct,
    empById,
  };

  return (
    <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>
  );
}

export function useBudget() {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error("useBudget must be used within a BudgetProvider");
  return ctx;
}
