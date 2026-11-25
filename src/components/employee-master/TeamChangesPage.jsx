import { useMemo, useState } from "react";

import { useBudget } from "@/lib/budget-store";
import { useTeamChanges } from "@/lib/team-changes-api";
import {
  buildChangeLog,
  dateText,
  subtreeOf,
  TYPE_LABEL,
} from "@/lib/budget-engine";
import {
  FilterStatus,
  FilterTh,
  ResizableCols,
  filterTableCss,
  resizableTableStyle,
  useColumnResize,
  useTableFilters,
} from "./FilterableTable";

const TC_W = {
  date: 130,
  name: 200,
  empId: 120,
  change: 150,
  from: 190,
  to: 190,
  source: 200,
};
const TC_COLS = [
  {
    key: "date",
    label: "Date",
    kind: "text",
    get: (c) => dateText(c.date),
    sort: (c) => c.date,
  },
  { key: "name", label: "Employee", kind: "text", get: (c) => c.name },
  { key: "empId", label: "Emp ID", kind: "text", get: (c) => c.empId },
  {
    key: "change",
    label: "Change",
    kind: "text",
    get: (c) => TYPE_LABEL[c.type] || c.type,
  },
  { key: "from", label: "From", kind: "text", get: (c) => c.from },
  { key: "to", label: "To", kind: "text", get: (c) => c.to },
  { key: "source", label: "Source", kind: "text", get: (c) => c.source },
];
const TC_KEYS = TC_COLS.map((c) => c.key);

const PILL_CLASS = {
  left: "bg-[#fff1f0] text-[#a8071a]",
  added: "bg-[#f6ffed] text-[#237804]",
  in: "bg-[#e6f0fb] text-[#1d4f8c]",
  out: "bg-[#f9f0ff] text-[#531dab]",
};

export function TeamChangesPage() {
  const {
    currentUser,
    isHR,
    hierarchy,
    eligibilityEvents,
    activeBudgetCycleId,
    allocationSnapshot = { date: "", teams: {} },
  } = useBudget();
  // Transfers come from Delegation: every saved Comp. Manager / Appraiser
  // Tech-ED change is logged on the server and listed here. The server already
  // limits non-HR users to their own scope.
  const {
    changes: gridSupervisorChanges,
    loading: changesLoading,
    error: changesError,
  } = useTeamChanges(activeBudgetCycleId);

  const [type, setType] = useState("all");
  const [manager, setManager] = useState("all");
  const [search, setSearch] = useState("");

  const safeEligibilityEvents = Array.isArray(eligibilityEvents)
    ? eligibilityEvents
    : [];
  const safeGridSupervisorChanges = Array.isArray(gridSupervisorChanges)
    ? gridSupervisorChanges
    : [];
  const safeHierarchy = hierarchy || {};

  const allChanges = useMemo(
    () => buildChangeLog(safeEligibilityEvents, safeGridSupervisorChanges),
    [safeEligibilityEvents, safeGridSupervisorChanges],
  );

  // Delegation changes are already scoped server-side. Eligibility events
  // (when configured) still follow the manager tree for non-HR users.
  const scoped = useMemo(() => {
    if (isHR) return allChanges;
    const tree = subtreeOf(safeHierarchy, currentUser.name);
    return allChanges.filter(
      (c) =>
        String(c.source || "").startsWith("Delegation") ||
        tree.indexOf(c.manager) > -1,
    );
  }, [allChanges, isHR, safeHierarchy, currentUser]);

  const managers = [];
  scoped.forEach((c) => {
    if (!managers.includes(c.manager)) managers.push(c.manager);
  });

  const q = search.trim().toLowerCase();
  const list = scoped.filter(
    (c) =>
      (type === "all" || c.type === type) &&
      (manager === "all" || c.manager === manager) &&
      (!q ||
        c.name.toLowerCase().includes(q) ||
        c.empId.toLowerCase().includes(q)),
  );

  const counts = { all: scoped.length };
  ["left", "added", "in", "out"].forEach((t) => {
    counts[t] = scoped.filter((c) => c.type === t).length;
  });

  const tf = useTableFilters(list, TC_COLS);
  const rz = useColumnResize(TC_W);

  return (
    <div className="em-tab-content tc-root">
      <style>{filterTableCss(".tc-root", "table")}</style>
      <div className="overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
        <div
          className="px-4 py-2.5 text-[13px] font-semibold text-white"
          style={{ background: "#17365d" }}
        >
          Team Changes — {isHR ? "all teams" : `${currentUser.name}'s team`} ·{" "}
          {allocationSnapshot.date
            ? `since allocation on ${allocationSnapshot.date}`
            : "no allocation snapshot configured"}
        </div>

        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {[
            ["all", "All"],
            ["left", "Resigned"],
            ["added", "Added"],
            ["in", "Transferred in"],
            ["out", "Transferred out"],
          ].map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={`rounded-full border px-3 py-1 text-xs ${
                type === t
                  ? "border-[#17365d] bg-[#17365d] text-white"
                  : "border-[#d7dce3] bg-white text-slate-700"
              }`}
            >
              {label} ({counts[t]})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-[#e1e5eb] px-4 py-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or employee ID"
              className="h-8 rounded border border-[#cbd3df] px-2 text-sm outline-none focus:border-[#2563eb]"
            />
          </label>

          {isHR && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Manager
              <select
                value={manager}
                onChange={(e) => setManager(e.target.value)}
                className="h-8 rounded border border-[#cbd3df] px-2 text-sm"
              >
                <option value="all">All managers</option>
                {managers.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          )}

          <span className="ml-auto text-xs text-slate-500">
            Resigned / Added come from the eligibility list · Transfers come
            from Delegation (Comp. Manager / Appraiser Tech-ED changes)
          </span>
        </div>

        <FilterStatus tf={tf} noun="changes" />
        <div className="overflow-x-auto">
          <table
            className="border-collapse text-[12.5px]"
            style={resizableTableStyle(rz, TC_KEYS)}
          >
            <ResizableCols rz={rz} keys={TC_KEYS} />
            <thead>
              <tr>
                {TC_COLS.map((col) => (
                  <FilterTh
                    key={col.key}
                    tf={tf}
                    rz={rz}
                    col={col}
                    className="border-b border-[#d7dce3] bg-[#eef2f7] px-2.5 py-2 text-left text-[12px] font-bold text-[#1e3a5f]"
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {tf.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-slate-500">
                    {changesLoading
                      ? "Loading team changes…"
                      : changesError
                        ? changesError
                        : safeEligibilityEvents.length === 0 &&
                            safeGridSupervisorChanges.length === 0
                          ? "No team changes yet. Changes saved on the Delegation screen will appear here."
                          : "No changes match these filters."}
                  </td>
                </tr>
              )}
              {tf.rows.map((c, i) => (
                <tr key={i}>
                  <td className="border-b border-[#edf0f4] px-2.5 py-2">
                    {dateText(c.date)}
                  </td>
                  <td className="border-b border-[#edf0f4] px-2.5 py-2 font-bold">
                    {c.name}
                  </td>
                  <td className="border-b border-[#edf0f4] px-2.5 py-2 text-[#1859a8]">
                    {c.empId}
                  </td>
                  <td className="border-b border-[#edf0f4] px-2.5 py-2">
                    <span
                      className={`rounded-full px-2 py-[1px] text-[11px] font-bold ${PILL_CLASS[c.type]}`}
                    >
                      {TYPE_LABEL[c.type]}
                    </span>
                  </td>
                  <td className="border-b border-[#edf0f4] px-2.5 py-2">
                    {c.from}
                  </td>
                  <td className="border-b border-[#edf0f4] px-2.5 py-2">
                    {c.to}
                  </td>
                  <td className="border-b border-[#edf0f4] px-2.5 py-2 text-slate-600">
                    {c.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
