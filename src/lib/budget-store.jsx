import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_HIERARCHY,
  DEFAULT_ALLOCATION,
  DEFAULT_BUDGET_CONFIG,
  DEFAULT_LEVELS,
  SAMPLE_ROWS,
  SAMPLE_ALLOCATION_SNAPSHOT,
  SAMPLE_LEAVERS,
  SAMPLE_ELIGIBILITY_EVENTS,
  SAMPLE_GRID_SUPERVISOR_CHANGES,
  computeNode,
  budgetForUser,
  rootsOf,
} from "@/lib/budget-engine";

const BudgetContext = createContext(null);

// Demo logins until this is wired to real auth/session data.
// Swap DEMO_LOGINS + the login/setLogin pair below for your real session.
const DEMO_LOGINS = [
  { name: "Vikram Rao", role: "Manager" },
  { name: "Meera Nair", role: "Manager" },
  { name: "Anita Sharma", role: "Manager" },
  { name: "Raj Mehta", role: "Manager" },
  { name: "HR Admin", role: "HR" },
];

export function BudgetProvider({ children }) {
  const [hierarchy] = useState(DEFAULT_HIERARCHY);
  const [levels, setLevels] = useState(DEFAULT_LEVELS);
  const [budgetConfig, setBudgetConfig] = useState(DEFAULT_BUDGET_CONFIG);

  // ---------------------------------------------------------------------
  // Team Changes & Budget Allocation run on this static sample set for now
  // (see the big comment above SAMPLE_ROWS in budget-engine.js) because
  // there's no real feed yet linking employees to DEFAULT_HIERARCHY's
  // manager names. Call setBudgetRows / setEligibilityEvents /
  // setGridSupervisorChanges / setAllocationSnapshot / setLeavers once that
  // real data is available — nothing else in this file needs to change.
  const [budgetRows, setBudgetRows] = useState(SAMPLE_ROWS);
  const [eligibilityEvents, setEligibilityEvents] = useState(
    SAMPLE_ELIGIBILITY_EVENTS,
  );
  const [gridSupervisorChanges, setGridSupervisorChanges] = useState(
    SAMPLE_GRID_SUPERVISOR_CHANGES,
  );
  const [allocationSnapshot, setAllocationSnapshot] = useState(
    SAMPLE_ALLOCATION_SNAPSHOT,
  );
  const [leavers, setLeavers] = useState(SAMPLE_LEAVERS);

  const [pct, setPctMap] = useState(DEFAULT_ALLOCATION.pct);
  const [originalPct] = useState(DEFAULT_ALLOCATION.pct);
  const [orgPct, setOrgPct] = useState(DEFAULT_ALLOCATION.orgPct);
  const [overrides, setOverrides] = useState({ "Meera Nair": true });

  const [pctLog, setPctLog] = useState([]);
  const [orgLog, setOrgLog] = useState([]);

  const [login, setLogin] = useState(0);
  const currentUser = DEMO_LOGINS[login];
  const isHR = currentUser.role === "HR";

  const empById = useCallback(
    (id) => budgetRows.find((r) => r.empId === id) || leavers[id],
    [budgetRows, leavers],
  );

  const allocation = useMemo(
    () => ({
      date: DEFAULT_ALLOCATION.date,
      by: DEFAULT_ALLOCATION.by,
      pct,
      orgPct,
      originalPct,
    }),
    [pct, orgPct, originalPct],
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
    logins: DEMO_LOGINS,
    login,
    setLogin,
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
