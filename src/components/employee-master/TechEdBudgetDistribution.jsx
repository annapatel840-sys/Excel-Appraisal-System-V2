import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";
import { useBudget } from "@/lib/budget-store";
import {
  useViewAs,
  managerIdentityMatches,
  currentUserMatchesManager,
} from "@/lib/view-as-store";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import {
  useDistributionBudget,
  num,
  normalizeOwner,
  ownerParts,
  ownerKey,
  ownerMatches,
  isActiveAndEligible,
  employeeUtilized,
  byDate,
  readTechEdOriginalCount,
} from "@/lib/distribution-budget";
import { splitStamp } from "@/lib/budget-audit-local";
import {
  FilterStatus,
  FilterTh,
  ResizableCols,
  filterTableCss,
  resizableTableStyle,
  useColumnResize,
  useTableFilters,
} from "./FilterableTable";

/* Budget Distribution uses persisted Budget_Distribution and
   Budget_Distribution_Comp rows. The prior UI-only sample allocations have
   been removed so this screen never displays invented team budgets. */

const LEVELS = ["Tech ED", "Comp Manager"];
const UTILISED_LABEL = "Hike Amount";

// Amount with Indian grouping (no lakh rounding), e.g. 12,34,567.50
const INR = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const lakh = (n) => INR.format(num(n));

const MONTHS = [
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
];
function dateText(iso) {
  const p = String(iso || "")
    .slice(0, 10)
    .split("-");
  return p.length === 3 && MONTHS[Number(p[1]) - 1]
    ? p[2] + "-" + MONTHS[Number(p[1]) - 1] + "-" + p[0]
    : iso || "—";
}
const stampText = (x) =>
  x && x.date ? dateText(x.date) + (x.time ? " " + x.time : "") : "—";

function Chg({ d }) {
  if (Math.abs(d) < 1) return <span className="mut">No change</span>;
  return (
    <span className={d > 0 ? "up" : "down"}>
      {(d > 0 ? "▲ " : "▼ ") + lakh(Math.abs(d))}
    </span>
  );
}
function ChangeCell({ from, to }) {
  const d = to - from;
  if (Math.abs(d) < 1) return <span className="mut">—</span>;
  const p = from ? (d / from) * 100 : 0;
  return (
    <>
      <Chg d={d} />{" "}
      <span className={d > 0 ? "up" : "down"}>
        ({(d > 0 ? "+" : "") + p.toFixed(1)}%)
      </span>
    </>
  );
}

const auditCols = (showName) => [
  {
    key: "date",
    label: "Date",
    kind: "text",
    get: (x) => stampText(x),
    sort: (x) => String(x.date || "") + String(x.time || ""),
  },
  ...(showName
    ? [{ key: "owner", label: "Owner", kind: "text", get: (x) => x.name || "" }]
    : []),
  {
    key: "from",
    label: "Old %",
    kind: "number",
    n: true,
    get: (x) => (x.from == null ? "" : x.from),
  },
  {
    key: "to",
    label: "New %",
    kind: "number",
    n: true,
    get: (x) => (x.to == null ? "" : x.to),
  },
  {
    key: "before",
    label: "Budget Before",
    kind: "number",
    n: true,
    get: (x) => (x.before == null ? "" : x.before),
  },
  {
    key: "after",
    label: "Budget After",
    kind: "number",
    n: true,
    get: (x) => (x.after == null ? "" : x.after),
  },
  { key: "by", label: "Changed By", kind: "text", get: (x) => x.by || "" },
  { key: "reason", label: "Reason", kind: "text", get: (x) => x.reason || "" },
];
const AUDIT_W = {
  date: 130,
  owner: 190,
  from: 64,
  to: 64,
  before: 96,
  after: 96,
  by: 150,
  reason: 220,
};
const ALLOC_W = {
  level: 96,
  owner: 190,
  base: 104,
  original: 104,
  updated: 104,
  change: 140,
  team0: 70,
  team: 70,
  last: 120,
  pct: 72,
};
const AUDIT_COLS = { with: auditCols(true), without: auditCols(false) };

function AuditTable({ list, showName }) {
  const cols = showName ? AUDIT_COLS.with : AUDIT_COLS.without;
  const tf = useTableFilters(list, cols);
  const rz = useColumnResize(AUDIT_W);
  const keys = cols.map((c) => c.key);
  if (!list.length)
    return (
      <div className="muted-small" style={{ padding: "6px 0" }}>
        No % changes yet.
      </div>
    );
  return (
    <>
      <FilterStatus tf={tf} noun="changes" />
      <div className="bscroll">
        <table
          className="trail trail-grid"
          style={resizableTableStyle(rz, keys)}
        >
          <ResizableCols rz={rz} keys={keys} />
          <thead>
            <tr>
              {cols.map((c) => (
                <FilterTh
                  key={c.key}
                  tf={tf}
                  rz={rz}
                  col={c}
                  className={c.n ? "n" : ""}
                />
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
                <td className="n" style={{ fontWeight: 700 }}>
                  {x.to == null ? "—" : x.to + "%"}
                </td>
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
  {
    key: "base",
    label: "Budget Base",
    kind: "number",
    r: true,
    get: (i) => i.base,
  },
  {
    key: "original",
    label: "Original Budget",
    kind: "number",
    r: true,
    get: (i) => i.original,
  },
  {
    key: "updated",
    label: "Updated Budget",
    kind: "number",
    r: true,
    get: (i) => i.updated,
  },
  {
    key: "change",
    label: "Change",
    kind: "number",
    r: true,
    get: (i) => i.change,
  },
  {
    key: "team0",
    label: "Original Count",
    kind: "number",
    r: true,
    get: (i) => i.team0,
  },
  {
    key: "team",
    label: "Current Count",
    kind: "number",
    r: true,
    get: (i) => i.team,
  },
  {
    key: "last",
    label: "Last Changed",
    kind: "text",
    get: (i) => i.last,
    sort: (i) => i.lastSort,
  },
  { key: "pct", label: "Allot %", kind: "number", r: true, get: (i) => i.pct },
];

export function TechEdBudgetDistribution() {
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
  // Allocation resolution is shared with the Appraisal Sheet Detailed Screen
  // and Bulk Edit (src/lib/distribution-budget.js), so every screen shows the
  // same Updated Budget.
  const {
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
  } = useDistributionBudget();


  const cycleLabel = String(
    activeCycle?.name ||
      liveMaster?.appraisal_cycle_name ||
      liveMaster?.cycle_name ||
      "",
  ).trim();

  const [pane, setPane] = useState({ mine: true, alloc: true, audit: true });
  useEffect(() => {
    setPane(
      isCompManagerView
        ? { mine: true, alloc: false, audit: false }
        : { mine: true, alloc: true, audit: true },
    );
  }, [isCompManagerView]);
  const [appliedOpen, setAppliedOpen] = useState(false);
  const [trailOpen, setTrailOpen] = useState({});
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [auditFilter, setAuditFilter] = useState("all");
  const [drafts, setDrafts] = useState({});
  const [applyingPct, setApplyingPct] = useState(false);


  const selectedCompManager = selectedManagerNode?.name || "";

  const assignedTeam = useMemo(() => {
    if (!activeCycleId || !techOwnerKey) return [];
    return employeeRows.filter((employee) => {
      if (employee.in_appraisal_sheet !== true) return false;
      const raw =
        employee.appraiser_tech_ed_row_id ||
        employee.appraiser_tech_ed_appraisal_sheet ||
        employee.appraiser_tech_ed ||
        employee.appraiser_tech_ed_id ||
        employee.appraiser_tech_ed1 ||
        employee.tech_ed ||
        employee.tech_ed_id ||
        "";
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
      // Team Size is the current generated Appraisal_Sheet roster, not
      // the eligible payroll/budget subset. Inactive or Not Eligible employees
      // remain in the team count while they are still on this cycle's sheet.
      if (
        !(Boolean(techOwnerKey) && ownerKey(assignment) === techOwnerKey)
      )
        return false;
      if (!isCompManagerView) return true;
      const manager =
        employee.comp_manager ||
        employee.comp_manager_id ||
        employee.compManager ||
        employee.comp_manager_name ||
        employee.comp_manager_display ||
        "";
      return (
        Boolean(selectedCompManager) &&
        managerIdentityMatches(manager, selectedCompManager)
      );
    });
  }, [
    employeeRows,
    techOwnerKey,
    techEdOwners,
    activeCycleId,
    isCompManagerView,
    selectedCompManager,
  ]);
  const allTeam = assignedTeam;
  const myPct = isCompManagerView
    ? num(selectedManagerNode?.pct)
    : liveTech
      ? num(liveTech.percentage)
      : 0;
  const parentBudgetBaseForDisplay =
    num(liveTech?.budget_base) ||
    (num(liveTech?.percentage) > 0
      ? (num(liveTech?.calculated_budget) * 100) / num(liveTech?.percentage)
      : num(sharedBudgetTotals?.base));
  // Team Size must use the same current generated Appraisal_Sheet roster
  // as Budget Master and the backend allocation refresh. Do not apply a second
  // Active/Eligible filter here; that made the Tech-Ed page disagree with the
  // persisted Tech-Ed and Comp Manager counts.
  const currentTeamCount = assignedTeam.length;

  // Original Count is frontend-only: read the same cycle/Tech-Ed snapshot
  // saved by Budget Master. If an earlier bad browser snapshot equals today's
  // live count, recover from the legacy baseline when it is still available.
  const team0 = useMemo(() => {
    if (isCompManagerView) return num(selectedManagerNode?.team0);
    const savedCount = readTechEdOriginalCount(
      liveTech?.appraisal_cycle_id || activeCycleId,
      [
        techOwnerKey,
        loginTechOwner,
        liveTech?.appraiser_tech_ed_id,
        liveTech?.appraiser_tech_ed_name,
        liveTech?.tech_ed,
        liveTech?.tech_ed_id,
      ],
    );
    // Ignore a stale browser snapshot of 0 when the current generated
    // Appraisal Sheet already has team members. The backend's persisted
    // Original Count is authoritative after its one-time repair.
    if (savedCount !== null && (savedCount > 0 || currentTeamCount === 0))
      return savedCount;
    const legacyCount = Number(liveTech?.headcount);
    if (Number.isFinite(legacyCount) && legacyCount > 0) return legacyCount;
    const persisted = liveTech?.original_headcount;
    return liveTech?.original_headcount_is_persisted === true &&
      persisted !== null && persisted !== undefined && String(persisted).trim() !== ""
      ? num(persisted)
      : 0;
  }, [isCompManagerView, selectedManagerNode?.team0, liveTech, activeCycleId, techOwnerKey, loginTechOwner, currentTeamCount]);
  const allotted = isCompManagerView
    ? 0
    : cmNodes.reduce((s, n) => s + n.updated, 0);
  // Budget utilization still includes only active, eligible employees;
  // Team Size above intentionally counts the full current Appraisal_Sheet team.
  const used = assignedTeam
    .filter(isActiveAndEligible)
    .reduce((sum, employee) => sum + employeeUtilized(employee), 0);
  const usedPct = myUpdated ? (used / myUpdated) * 100 : 0;
  const over = usedPct > 100;

  // Tech ED history: newest first. The latest row carries today's roll-up;
  // older rows come from the audit trail (amount after each change).
  const myHistory = useMemo(() => {
    const mine = log
      .filter((entry) => entry.level === "techEd")
      .sort((a, b) => byDate(b, a));
    const saved = splitStamp(
      liveTech?.updated_at || liveTech?.created_at || "",
    );
    const current = {
      date: mine.length ? mine[0].date : saved.date,
      time: mine.length ? mine[0].time : saved.time,
      allocated: myOriginal,
      updated: myUpdated,
      team: team0,
      allotted,
      buffer: myUpdated - allotted,
    };
    const older = mine.slice(1).map((entry) => ({
      date: entry.date,
      time: entry.time,
      allocated: myOriginal,
      updated: entry.after,
      team: team0,
      allotted: null,
      buffer: null,
    }));
    return [current, ...older];
  }, [log, liveTech, myOriginal, myUpdated, team0, allotted]);

  const auditFor = (names) => {
    const out = [];
    if (liveTech && names.includes(myName)) {
      const mine = log
        .filter((entry) => entry.level === "techEd")
        .map((entry) => ({ ...entry, name: myName }));
      if (mine.length) out.push(...mine);
      else {
        const saved = splitStamp(
          liveTech.updated_at || liveTech.created_at || "",
        );
        out.push({
          date: saved.date,
          time: saved.time,
          name: myName,
          from: null,
          to: myPct,
          before: null,
          after: myOriginal,
          by: "Data Store",
          reason: "Current saved allocation",
        });
      }
    }
    cmNodes.forEach((node) => {
      if (!names.includes(node.name)) return;
      const mine = node.liveId
        ? log
            .filter(
              (entry) =>
                entry.level === "comp" &&
                String(entry.rowId) === String(node.liveId),
            )
            .map((entry) => ({ ...entry, name: node.name }))
        : [];
      if (mine.length) out.push(...mine);
      else {
        const saved = splitStamp(node.savedAt);
        out.push({
          date: saved.date,
          time: saved.time,
          name: node.name,
          from: null,
          to: node.pct0,
          before: null,
          after: node.original,
          by: "Data Store",
          reason: "Current saved allocation",
        });
      }
    });
    return out.sort((a, b) => byDate(b, a));
  };

  // One save per Comp Manager at a time: a double click, or Enter followed by
  // Apply, would otherwise send two saves that can both create the row.
  const pctSavesRef = useRef(new Set());
  async function setPct(name, raw) {
    if (pctSavesRef.current.has(name)) return;
    pctSavesRef.current.add(name);
    try {
      await savePct(name, raw);
    } finally {
      pctSavesRef.current.delete(name);
    }
  }

  async function savePct(name, raw) {
    const node = cmNodes.find((x) => x.name === name);
    setDrafts((d) => {
      const next = { ...d };
      delete next[name];
      return next;
    });
    if (!node) return;
    const to = Math.round(Number(raw) * 10) / 10;
    if (!Number.isFinite(to) || to < 0 || to > 100) {
      setErr(
        "Enter an allotment percentage between 0 and 100 for " + name + ".",
      );
      return;
    }
    if (to === node.pct) return;
    const newUpd = (node.base * to) / 100;
    const firstAllocation = !node.liveId || !(num(node.original) > 0);
    const nextOriginal = firstAllocation ? newUpd : node.original;
    const sum = allotted - node.updated + newUpd;
    if (sum > myUpdated + 0.5) {
      setErr(
        "Blocked: " +
          to +
          "% for " +
          name +
          " would take total allotted to " +
          lakh(sum) +
          ", which is " +
          lakh(sum - myUpdated) +
          " more than your available Tech-Ed budget of " +
          lakh(myUpdated) +
          ".",
      );
      return;
    }
    if (!liveTech?.id) {
      setErr(
        "Your Tech-Ed budget allocation is not saved yet, so Comp Manager budgets cannot be allotted.",
      );
      return;
    }
    try {
      // No saved row yet: the API creates it under this Tech-ED's allocation.
      await updateBudget(
        node.liveId || "",
        {
          percentage: to,
          budget_base: node.base,
          // Freeze Original Budget at the first real allocation. Later % changes
          // update only Updated Budget using the current allocated Budget Base.
          calculated_budget: nextOriginal,
          applied_budget: newUpd,
          comp_manager: name,
          audit_reason: reason.trim(),
          ...(node.liveId ? {} : { budget_distribution_id: liveTech.id }),
        },
        "comp",
      );
    } catch (error) {
      setErr(error.message || "Failed to save Comp Manager budget.");
      return;
    }
    setReason("");
    setErr("");
  }

  const paneHead = (k, title, count) => (
    <button
      type="button"
      className="pane-head"
      aria-expanded={pane[k]}
      onClick={() => setPane((p) => ({ ...p, [k]: !p[k] }))}
    >
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
      lastSort:
        String(myHistory[0].date || "") + String(myHistory[0].time || ""),
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
  if (auditFilter !== "all")
    auditList = auditList.filter((x) => x.name === auditFilter);
  const selfOpen = !!trailOpen[myName];

  return (
    <div className="tbd-root">
      <style>{CSS}</style>

      {!isCompManagerView && !cycleLoading && !budgetLoading && !liveTech && !budgetError ? (
        <div className="berr">
          {loginTechOwner
            ? "HR has not allocated your budget for the active appraisal cycle yet. Your Comp Managers are listed below; Allot % can be set once HR applies the budget in Budget Master."
            : "No matching Tech-Ed budget was found for this login in the active appraisal cycle. Check that the signed-in account matches the Appraiser Tech-ED value in Appraisal Sheet."}
        </div>
      ) : null}
      <div className="btop">
        <span>
          Appraisal Cycle{" "}
          <b>
            {activeCycleId
              ? cycleLabel || "Cycle name unavailable"
              : "No active cycle"}
          </b>
        </span>
        <span className="sep" />
        <span>
          {isCompManagerView ? "Comp Manager Allocation" : "Tech-Ed Allocation"}{" "}
          · updated {hasLiveAllocation ? lakh(myUpdated) : "—"}
        </span>
        <span className="sep" />
        <span>
          <b>{isCompManagerView ? LEVELS[1] : LEVELS[0]}</b>
        </span>
        <span className="sep" />
        <span className="applied">
          {isCompManagerView
            ? "Comp Manager allocation"
            : "Budget applied by HR"}
          :{" "}
          {/* Comp Managers see the amount only, never the allocation percentage. */}
          {!isCompManagerView && (
            <>
              <b>{hasLiveAllocation ? myPct + "%" : "—"}</b> ={" "}
            </>
          )}
          <b>{hasLiveAllocation ? lakh(myUpdated) : "—"}</b> updated · original{" "}
          {hasLiveAllocation ? lakh(myOriginal) : "—"}
          {!isCompManagerView && hasLiveAllocation ? (
            <button
              type="button"
              className="dd"
              aria-expanded={appliedOpen}
              onClick={() => setAppliedOpen((v) => !v)}
            >
              History {appliedOpen ? "▴" : "▾"}
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
                <div className="f-label">Original Allotted</div>
                <div className="v">
                  {hasLiveAllocation ? lakh(myOriginal) : "—"}
                </div>
                <div className="d mut">Fixed at allocation</div>
              </div>
              <div>
                <div className="f-label">Updated Budget</div>
                <div className="v">
                  {hasLiveAllocation ? lakh(myUpdated) : "—"}
                </div>
                <div className="d">
                  {hasLiveAllocation ? <Chg d={myUpdated - myOriginal} /> : "—"}
                </div>
              </div>
              <div>
                <div className="f-label">Team Size</div>
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
                    <div className="f-label">Allotted to Reports</div>
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
                  {over ? (
                    <span className="over">
                      ▲ {lakh(used - myUpdated)} over
                    </span>
                  ) : (
                    <span className="mut">
                      Remaining {lakh(myUpdated - used)}
                    </span>
                  )}
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

      {!isCompManagerView && (
        <div className="card">
          {paneHead("alloc", "Allocation", cmNodes.length + " " + cmLabel)}
          {pane.alloc && (
            <>
              <div className="reason">
                <label htmlFor="tbdReason">Reason for Next % Change</label>
                <input
                  id="tbdReason"
                  type="text"
                  value={reason}
                  placeholder="Optional — saved in the audit trail"
                  onChange={(e) => setReason(e.target.value)}
                />
                <button
                  type="button"
                  className="budget-save-btn"
                  disabled={applyingPct}
                  onClick={async () => {
                    if (applyingPct) return;
                    setApplyingPct(true);
                    try {
                      for (const node of cmNodes) {
                        const draft = drafts[node.name];
                        if (draft !== undefined && String(draft).trim() !== "") {
                          await setPct(node.name, draft);
                        }
                      }
                    } finally {
                      setApplyingPct(false);
                    }
                  }}
                >
                  Apply
                </button>
              </div>
              {err && (
                <div className="berr" role="alert">
                  <span>{err}</span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => setErr("")}
                  >
                    Dismiss
                  </button>
                </div>
              )}
              <div className="bscroll">
                <table
                  className="bal"
                  style={resizableTableStyle(allocRz, allocKeys)}
                >
                  <ResizableCols rz={allocRz} keys={allocKeys} />
                  <thead>
                    <tr>
                      {ALLOC_COLS.map((c) => (
                        <FilterTh
                          key={c.key}
                          tf={allocTf}
                          rz={allocRz}
                          col={c}
                          className={[
                            c.r ? "r" : "",
                            c.key === "level" ? "level-col" : "",
                            c.key === "owner" ? "owner-col" : "",
                            c.key === "base" ? "budget-base-col" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
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
                                <b>
                                  {String(loginTechOwner).split(/\s+-\s+/)[1] ||
                                    myName}
                                </b>{" "}
                                <span className="muted-small">(you)</span>
                              </td>
                              <td className="r budget-base-col">
                                {hasLiveAllocation
                                  ? lakh(parentBudgetBaseForDisplay)
                                  : "—"}
                              </td>
                              <td className="r">
                                {hasLiveAllocation ? lakh(myOriginal) : "—"}
                              </td>
                              <td className="r">
                                {hasLiveAllocation ? lakh(myUpdated) : "—"}
                              </td>
                              <td className="r">
                                {hasLiveAllocation ? (
                                  <ChangeCell
                                    from={myOriginal}
                                    to={myUpdated}
                                  />
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="r">{team0}</td>
                              <td className="r">{currentTeamCount}</td>
                              <td>
                                <button
                                  type="button"
                                  className="dd"
                                  aria-expanded={selfOpen}
                                  title={
                                    (selfOpen ? "Hide" : "Show") +
                                    " budget history"
                                  }
                                  onClick={() =>
                                    setTrailOpen((t) => ({
                                      ...t,
                                      [myName]: !t[myName],
                                    }))
                                  }
                                >
                                  {dateText(myHistory[0].date)}{" "}
                                  {selfOpen ? "▴" : "▾"}
                                </button>
                              </td>
                              <td className="r">
                                <span className="mut">{myPct}%</span>
                              </td>
                            </tr>
                            {selfOpen && (
                              <tr className="tr">
                                <td colSpan={9}>
                                  <table
                                    className="trail"
                                    style={{ maxWidth: 820 }}
                                  >
                                    <thead>
                                      <tr>
                                        <th>Date</th>
                                        <th className="n">Allocated</th>
                                        <th className="n">Updated</th>
                                        <th className="n">Team size</th>
                                        <th className="n">
                                          Allotted to {LEVELS[1]}s
                                        </th>
                                        <th className="n">Buffer</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {myHistory.map((x, i) => (
                                        <tr key={i}>
                                          <td>{stampText(x)}</td>
                                          <td className="n">
                                            {lakh(x.allocated)}
                                          </td>
                                          <td className="n">
                                            {lakh(x.updated)}
                                          </td>
                                          <td className="n">{x.team}</td>
                                          <td className="n">
                                            {x.allotted === null
                                              ? "—"
                                              : lakh(x.allotted)}
                                          </td>
                                          <td className="n">
                                            {x.buffer === null
                                              ? "—"
                                              : lakh(x.buffer)}
                                          </td>
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
                              <span
                                style={{ display: "inline-block", width: 18 }}
                              />
                              {LEVELS[1]}
                            </td>
                            <td>
                              <b>{n.name}</b>
                            </td>
                            <td className="r budget-base-col">
                              {n.liveId || n.base ? lakh(n.base) : "—"}
                            </td>
                            <td className="r">
                              {n.liveId || n.original ? lakh(n.original) : "—"}
                            </td>
                            <td className="r">
                              {n.liveId || n.updated ? lakh(n.updated) : "—"}
                            </td>
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
                                  title={
                                    (open ? "Hide" : "Show") + " budget history"
                                  }
                                  onClick={() =>
                                    setTrailOpen((t) => ({
                                      ...t,
                                      [n.name]: !t[n.name],
                                    }))
                                  }
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
                                title={
                                  liveTech
                                    ? undefined
                                    : "Available once HR allocates your budget"
                                }
                                value={drafts[n.name] ?? n.pct}
                                onChange={(e) =>
                                  setDrafts((d) => ({
                                    ...d,
                                    [n.name]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    setPct(n.name, drafts[n.name] ?? n.pct);
                                  }
                                }}
                              />
                            </td>
                          </tr>
                          {open && (
                            <tr className="tr">
                              <td colSpan={10}>
                                <table
                                  className="trail"
                                  style={{ maxWidth: 560 }}
                                >
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
                                        <td className="n">
                                          {lakh(n.original)}
                                        </td>
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
                Comp Manager Budget Base = sum of Previous Appraisal Total CTC
                with Rewards for that manager's current eligible employees ·
                Updated Budget = Budget Base × Allot % · Original Budget is
                fixed at the first calculation · Utilised = {UTILISED_LABEL}
              </div>
            </>
          )}
        </div>
      )}

      {!isCompManagerView && (
        <div className="card">
          {paneHead(
            "audit",
            "Applied % — Audit Trail (You and Your Comp Managers)",
          )}
          {pane.audit && (
            <>
              <div className="reason">
                <label>
                  Owner{" "}
                  <select
                    value={auditFilter}
                    onChange={(e) => setAuditFilter(e.target.value)}
                  >
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
      )}
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
.budget-save-btn {
  background: #12304F;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 9px 20px;
  font-weight: 600;
  cursor: pointer;
  margin-left: auto;
  flex-shrink: 0;
}

.budget-save-btn:hover {
  opacity: 0.9;
}
`;