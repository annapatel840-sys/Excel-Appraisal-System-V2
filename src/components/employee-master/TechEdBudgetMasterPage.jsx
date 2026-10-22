import { useEffect, useMemo, useState, Fragment } from "react";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import { useBudget } from "@/lib/budget-store";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

/* Add once in index.html <head> so the font matches the reference:
   <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"> */

const normalizeIdentity = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const ownerParts = (value) => {
  const text = normalizeIdentity(value);
  if (!text) return [];
  const parts = text.split(/\s+-\s+/);
  return parts.length > 1 ? [text, ...parts] : [text];
};
const ownerKey = (value) => ownerParts(value)[1] || ownerParts(value)[0] || "";
const ownerName = (value) => {
  const parts = ownerParts(value);
  return parts.length > 1 ? parts.slice(1).join(" - ") : parts[0] || "";
};

// Amount with Indian grouping (no lakh rounding), e.g. 12,34,567.50
const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = (v) => INR.format(Number(v) || 0);
function dateText(iso) {
  const p = String(iso || "").split("-");
  const M = [
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
  return p.length === 3 ? p[2] + "-" + M[Number(p[1]) - 1] : "—";
}

const asOf = (hist, d) => hist.filter((x) => x.date <= d).pop() || hist[0];

/* one line per date: allocated, updated, team size */
function ownHistory(owner, original, team, audit) {
  const out = [
    { date: "", allocated: original, updated: original, team },
  ];
  audit
    .filter((a) => a.owner === owner && !a.initial)
    .sort((a, b) =>
      (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")),
    )
    .forEach((a) => {
      const row = { date: a.date, allocated: original, updated: a.after, team };
      if (out[out.length - 1].date === a.date) out[out.length - 1] = row;
      else out.push(row);
    });
  return out;
}

function Chg({ d, base }) {
  if (Math.abs(d) < 1) return <span className="muted">—</span>;
  const up = d > 0;
  return (
    <span className={up ? "up" : "down"}>
      {up ? "▲ " : "▼ "}
      {money(Math.abs(d))}
      {base
        ? "  (" + (up ? "+" : "") + ((d / base) * 100).toFixed(1) + "%)"
        : ""}
    </span>
  );
}

function AuditTable({ rows, showOwner = true }) {
  const heads = [
    ["Date"],
    ["Owner"],
    ["Old %", 1],
    ["New %", 1],
    ["Budget before", 1],
    ["Budget after", 1],
    ["Changed by"],
    ["Reason"],
  ].filter(([h]) => showOwner || h !== "Owner");
  if (!rows.length)
    return (
      <div className="muted-small" style={{ padding: "6px 0" }}>
        No % changes yet.
      </div>
    );
  return (
    <div className="bscroll">
      <table className="trail trail-audit">
        <colgroup>
          <col className="c-date" />
          {showOwner ? <col className="c-owner" /> : null}
          <col className="c-num" />
          <col className="c-num" />
          <col className="c-money" />
          <col className="c-money" />
          <col className="c-by" />
          <col className="c-reason" />
        </colgroup>
        <thead>
          <tr>
            {heads.map(([h, n]) => (
              <th key={h} className={n ? "n" : ""}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((x, i) => (
            <tr key={i}>
              <td>
                {dateText(x.date)}
                {x.time ? " " + x.time : ""}
              </td>
              {showOwner ? (
                <td style={{ fontWeight: 700 }}>{x.owner}</td>
              ) : null}
              <td className="n">{x.from == null ? "—" : x.from + "%"}</td>
              <td className="n" style={{ fontWeight: 700 }}>
                {x.to}%
              </td>
              <td className="n">{x.before == null ? "—" : money(x.before)}</td>
              <td className="n">{money(x.after)}</td>
              <td>{x.by}</td>
              <td>{x.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Trail({ rows, roll }) {
  return (
    <table className="trail" style={{ maxWidth: roll ? 820 : 560 }}>
      <thead>
        <tr>
          <th>Date</th>
          <th className="n">Allocated</th>
          <th className="n">Updated</th>
          <th className="n">Team size</th>
          {roll ? <th className="n">Allotted to Comp Managers</th> : null}
          {roll ? <th className="n">Buffer</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.date}>
            <td>{dateText(x.date)}</td>
            <td className="n">{money(x.allocated)}</td>
            <td className="n">{money(x.updated)}</td>
            <td className="n">{x.team}</td>
            {roll ? <td className="n">{money(x.allotted)}</td> : null}
            {roll ? <td className="n">{money(x.buffer)}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const CSS = `
.te-root{max-width:1320px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:8px;font-family:"IBM Plex Sans","Segoe UI",Arial,Helvetica,sans-serif;font-size:12.5px;color:#0f1f33;font-variant-numeric:tabular-nums}
.te-root *,.te-root *::before,.te-root *::after{box-sizing:border-box}
.te-root button,.te-root input,.te-root select{font-family:inherit}
.te-root :focus-visible{outline:2px solid #14a3a3;outline-offset:1px}
.te-root .muted{color:#64748b}.te-root .muted-small{font-size:11px;color:#475569}
.te-root .up{color:#15803d}.te-root .down{color:#c2410c}.te-root .over{color:#c2410c;font-weight:700}
.te-root .btop{background:#fff;border:1px solid #d3dbe6;border-left:4px solid #14a3a3;border-radius:10px;box-shadow:0 1px 2px rgba(18,48,79,.06);display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:8px 14px;color:#334155}
.te-root .sep{width:1px;align-self:stretch;background:#d7dce3}
.te-root .applied{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
.te-root .applied b{color:#12304f;font-size:13.5px}
.te-root .dd{border:1px solid #c5d0dd;background:#fff;color:#12304f;border-radius:4px;padding:3px 8px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.te-root .dd[aria-expanded="true"]{background:#12304f;border-color:#12304f;color:#fff}
.te-root .apdrop{background:#f7f9fc;border:1px solid #d4dbe5;border-radius:8px;padding:8px 14px}
.te-root .card{background:#fff;border:1px solid #d3dbe6;border-radius:10px;box-shadow:0 1px 2px rgba(18,48,79,.06);overflow:hidden}
.te-root .pane-head{width:100%;display:flex;align-items:center;justify-content:space-between;background:#12304f;color:#fff;border:0;padding:10px 16px;font-size:13.5px;font-weight:600;letter-spacing:.15px;cursor:pointer;text-align:left}
.te-root .pane-head .cnt{font-weight:400;color:#d6e4f5;margin-left:8px}
.te-root .pane-head .chev{font-size:12px}
.te-root .bsum{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.te-root .bsum>div{padding:12px 16px;border-right:1px solid #d7dce3;border-top:3px solid transparent}
.te-root .bsum>div:nth-child(2){border-top-color:#14a3a3}
.te-root .bsum>div:last-child{border-right:0}
.te-root .f-label{font-size:11px;font-weight:500;color:#5b6b80}
.te-root .bsum .v{font-size:18px;font-weight:600;color:#12304f;margin-top:2px}
.te-root .bsum .d{font-size:11px;margin-top:2px}
.te-root .reason{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid #e1e5eb;font-size:12px;color:#475569}
.te-root .reason input{flex:1;max-width:420px;height:28px;border:1px solid #cbd3df;border-radius:4px;padding:0 8px;font-size:12.5px}
.te-root .reason select{height:28px;border:1px solid #cbd3df;border-radius:4px;background:#fff;padding:0 8px;font-size:12.5px}
.te-root .berr{margin:10px 16px 0;background:#fff;border:1px solid #e3e8ef;border-left:4px solid #c2410c;color:#7c2d12;border-radius:6px;padding:7px 10px;font-size:12px;display:flex;justify-content:space-between;gap:10px}
.te-root .link{background:none;border:0;padding:0;color:#1859a8;font-size:11.5px;font-weight:700;cursor:pointer}
.te-root .bscroll{overflow-x:auto}

/* ---- allocation grid ---- */
.te-root .bal{display:grid;width:100%;min-width:1080px;font-size:12.5px;align-items:stretch}
.te-root .bal>div{height:52px;padding:8px 16px;display:flex;align-items:center;gap:8px;border-right:1px solid #eef1f5;border-bottom:1px solid #e1e5eb;min-width:0;overflow:hidden}
.te-root .bal>div.last{border-right:0}
.te-root .bal .h{height:46px;padding:9px 16px;white-space:nowrap;background:#e8eef5;color:#12304f;font-weight:600;font-size:12px;border-bottom:2px solid #9fb3cf}
.te-root .bal .r{justify-content:flex-end;text-align:right;white-space:nowrap}
.te-root .bal .ctr{justify-content:center;text-align:center;white-space:nowrap}
.te-root .bal .self{background:#e9f4f4;font-weight:700}
.te-root .bal .self.first{box-shadow:inset 4px 0 0 #14a3a3}
.te-root .bal .grp{border-top:2px solid #9fb3cf}
.te-root .bal .tr{grid-column:1/-1;display:block;height:auto;overflow-x:auto;background:#f7f9fc;border-top:1px solid #d7dce3;padding:8px 12px 12px 40px}
.te-root .bal .pct-in{margin:0}
.te-root .pct-in{width:64px;height:30px;border:1px solid #9fb3cf;border-radius:6px;text-align:center;padding:0 6px;font-size:12.5px;background:#fffef5}

.te-root .trail{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}
.te-root .trail th{text-align:left;font-weight:700;color:#1e3a5f;font-size:11px;padding:7px 12px;border-bottom:1px solid #d7dce3;white-space:nowrap}
.te-root .trail td{padding:7px 12px;border-bottom:1px solid #edf0f4;vertical-align:middle}
.te-root .trail .n{text-align:right}
.te-root .trail-audit{min-width:900px}
.te-root .trail-audit .c-date{width:105px}
.te-root .trail-audit .c-owner{width:190px}
.te-root .trail-audit .c-num{width:82px}
.te-root .trail-audit .c-money{width:135px}
.te-root .trail-audit .c-by{width:105px}
.te-root .trail-audit .c-reason{width:190px}
.te-root .trail-history{table-layout:fixed}
.te-root .trail-history th,.te-root .trail-history td{padding:7px 12px}
.te-root .audit-wrap{padding:10px 14px 14px}
.te-root .audit-wrap .trail td,.te-root .audit-wrap .trail th{padding:7px 12px}
`;

/* fluid columns: extra viewport width is shared proportionally */
const COLS =
  "130px minmax(200px,1.6fr) repeat(2,minmax(120px,1fr)) minmax(150px,1.1fr) repeat(2,minmax(100px,.9fr)) minmax(120px,.9fr) minmax(100px,.8fr)";
const HEADS = [
  "Level",
  "Owner",
  "Original Budget",
  "Updated Budget",
  "Change",
  "Original Count",
  "Current Count",
  "Last Changed",
  "Allot %",
];

export function TechEdBudgetMasterPage() {
  const user = useCatalystUser();
  const {
    budgetDistributionRows = [],
    budgetCompManagerRows = [],
    budgetMasterRows = [],
    employeeRows = [],
    techEdOwners = [],
    updateBudget,
    loading: budgetLoading,
    error: budgetError,
  } = useBudget();
  const access = useAccess();
  const canAllot =
    access.canScreen("budgetAllocation", "edit") &&
    access.canAction("allotNextLevel");
  const canAudit = access.canAction("viewAudit");
  const rawName = String(user?.name || user?.display_name || user?.email || "").trim();
  const [activeCycle, setActiveCycle] = useState(null);

  useEffect(() => {
    let mounted = true;
    payrollCycleRequest("cycles")
      .then((cycles) => {
        if (!mounted) return;
        const active = (Array.isArray(cycles) ? cycles : []).find(
          (cycle) => String(cycle.status || "").trim().toLowerCase() === "active" && !cycle.archived,
        );
        setActiveCycle(active || null);
      })
      .catch((error) => {
        console.error("Failed to load active cycle for Tech-Ed Budget Master:", error);
        if (mounted) setActiveCycle(null);
      });
    return () => { mounted = false; };
  }, []);

  const activeCycleId = String(activeCycle?.id || activeCycle?.appraisal_cycle_id || activeCycle?.ROWID || "").trim();
  const activeCycleName = String(activeCycle?.name || activeCycle?.cycle_name || activeCycle?.appraisal_year || "").trim();
  const budgetCycleIds = useMemo(() => {
    const ids = new Set();
    if (activeCycleId) ids.add(activeCycleId);
    budgetMasterRows.forEach((master) => {
      const masterName = normalizeIdentity(master.appraisal_cycle_name || master.cycle_name || "");
      if (activeCycleId && String(master.appraisal_cycle_id || "") === activeCycleId) {
        ids.add(String(master.appraisal_cycle_id));
      } else if (activeCycleName && masterName && masterName === normalizeIdentity(activeCycleName)) {
        ids.add(String(master.appraisal_cycle_id || ""));
      }
    });
    return ids;
  }, [activeCycleId, activeCycleName, budgetMasterRows]);

  const userIdentities = useMemo(() => new Set([
    user?.name, user?.display_name, user?.first_name, user?.last_name,
    [user?.first_name, user?.last_name].filter(Boolean).join(" "),
    user?.email, user?.email_id, user?.user_id, user?.row_id, user?.ROWID,
    user?.empId, user?.employeeId, user?.employee_id,
  ].map(normalizeIdentity).filter(Boolean)), [user]);

  const directoryOwner = useMemo(() => techEdOwners.find((item) =>
    [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id]
      .filter(Boolean).some((alias) => userIdentities.has(normalizeIdentity(alias))),
  ) || null, [techEdOwners, userIdentities]);

  const ownerAliases = useMemo(() => new Set([
    directoryOwner?.employee_id, directoryOwner?.row_id, directoryOwner?.ROWID,
    directoryOwner?.assignment, directoryOwner?.name, directoryOwner?.email, directoryOwner?.email_id,
    ...Array.from(userIdentities),
  ].map(normalizeIdentity).filter(Boolean).flatMap((value) => ownerParts(value))), [directoryOwner, userIdentities]);

  const isCurrentCycleRow = (row) => budgetCycleIds.has(String(row.appraisal_cycle_id || ""));
  const liveMe = budgetDistributionRows.find((row) =>
    isCurrentCycleRow(row) && ownerParts(row.appraiser_tech_ed_id || "").some((alias) => ownerAliases.has(alias)),
  ) || null;

  const meName = String(directoryOwner?.name || ownerName(directoryOwner?.assignment || liveMe?.appraiser_tech_ed_id || rawName)).trim();
  const me = liveMe ? {
    id: liveMe.id,
    name: meName || rawName || "Tech-Ed",
    pct: liveMe.percentage === null || liveMe.percentage === undefined || String(liveMe.percentage).trim() === "" ? 0 : Number(liveMe.percentage) || 0,
    original: Number(liveMe.calculated_budget) || 0,
    updated: Number(liveMe.applied_budget) || 0,
    team0: Number(liveMe.original_headcount ?? liveMe.allocation_headcount) || 0,
    team: Number(liveMe.current_headcount) || 0,
    utilised: Number(liveMe.total_utilization ?? liveMe.budget_utilized) || 0,
  } : {
    id: "",
    name: meName || rawName || "Tech-Ed",
    pct: 0, original: 0, updated: 0, team0: 0, team: 0, utilised: 0,
  };

  const liveKids = liveMe ? budgetCompManagerRows.filter((row) =>
    isCurrentCycleRow(row) && String(row.budget_distribution_id || "") === String(liveMe.id),
  ) : [];

  const resolveManagerLabel = (raw) => {
    const candidates = new Set(ownerParts(raw));
    const employee = employeeRows.find((item) => [
      item.emp_id, item.employee_id, item.employeeId, item.row_id, item.ROWID,
      item.name, item.emp_name, item.employee_name, item.email, item.email_id,
    ].filter(Boolean).some((alias) => ownerParts(alias).some((part) => candidates.has(part))));
    if (!employee) return ownerName(raw) || String(raw || "Unassigned Comp Manager");
    const id = String(employee.emp_id || employee.employee_id || "").trim();
    const name = String(employee.name || employee.emp_name || employee.employee_name || "").trim();
    return id && name ? id + " - " + name : name || ownerName(raw) || String(raw || "");
  };

  const kids0 = liveKids.map((live) => {
    const base = Number(live.budget_base) || 0;
    const original = Number(live.calculated_budget) || 0;
    return {
      id: live.id,
      name: resolveManagerLabel(live.comp_manager),
      pct0: base > 0 ? (original / base) * 100 : Number(live.percentage) || 0,
      pct: Number(live.percentage) || 0,
      base,
      original,
      updated: Number(live.applied_budget) || 0,
      team0: Number(live.original_headcount ?? live.allocation_headcount) || 0,
      team: Number(live.current_headcount) || 0,
      utilised: Number(live.total_utilization) || 0,
    };
  });

  const [reports, setReports] = useState([]);
  useEffect(() => {
    setReports(kids0);
  }, [liveMe?.id, liveKids.length, budgetCompManagerRows, employeeRows]);

  const initialAllocationDate = String(liveMe?.CREATEDTIME || liveMe?.created_at || "").slice(0, 10);
  const [audit, setAudit] = useState([]);
  useEffect(() => {
    if (!liveMe) {
      setAudit([]);
      return;
    }
    setAudit([
      {
        date: initialAllocationDate,
        owner: me.name,
        from: null,
        to: me.pct,
        before: null,
        after: me.original,
        by: "Data Store",
        reason: "Saved Tech-Ed allocation",
        initial: true,
      },
      ...kids0.map((item) => ({
        date: initialAllocationDate,
        owner: item.name,
        from: null,
        to: item.pct0,
        before: null,
        after: item.original,
        by: me.name,
        reason: "Saved Comp Manager allocation",
        initial: true,
      })),
    ]);
  }, [liveMe?.id, liveKids.length]);

  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const [pane, setPane] = useState({ mine: true, alloc: true, audit: true });
  const [applied, setApplied] = useState(false);
  const [open, setOpen] = useState({});
  const [filter, setFilter] = useState("all");

  const kids = reports.map((r) => ({
    ...r,
    original: Number(r.original) || 0,
    updated: ((Number(r.base) || 0) * (Number(r.pct) || 0)) / 100,
  }));
  const allotted = kids.reduce((s, r) => s + r.updated, 0);
  const used = kids.reduce((s, r) => s + r.utilised, 0);
  const usedPct = me.updated ? (used / me.updated) * 100 : 0;
  const over = usedPct > 100;

  const kidHist = Object.fromEntries(
    kids.map((k) => [k.name, ownHistory(k.name, k.original, k.team0, audit)]),
  );
  const ownH = ownHistory(me.name, me.original, me.team, audit);
  const dates = [
    ...new Set([...ownH, ...Object.values(kidHist).flat()].map((x) => x.date)),
  ].sort();
  const selfHist = dates.map((d) => {
    const o = asOf(ownH, d);
    const al = kids.reduce((s, k) => s + asOf(kidHist[k.name], d).updated, 0);
    return {
      date: d,
      allocated: o.allocated,
      updated: o.updated,
      team: o.team,
      allotted: al,
      buffer: o.updated - al,
    };
  });

  const sorted = [...audit].sort((a, b) =>
    (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")),
  );
  const names = [me.name, ...kids.map((k) => k.name)];
  const auditRows = sorted.filter((a) =>
    filter === "all" ? names.includes(a.owner) : a.owner === filter,
  );

  function setPct(name, raw) {
    const row = kids.find((k) => k.name === name);
    const to = Math.round(Number(raw) * 10) / 10;
    if (!row || !(to >= 0) || to === row.pct) {
      setNonce((n) => n + 1);
      return;
    }
    const newUpd = (row.base * to) / 100;
    const sum = allotted - row.updated + newUpd;
    if (sum > me.updated + 0.5) {
      setError(
        "Blocked: " +
          to +
          "% for " +
          name +
          " would take total allotted to " +
          money(sum) +
          ", which is " +
          money(sum - me.updated) +
          " more than your updated budget of " +
          money(me.updated) +
          ".",
      );
      setNonce((n) => n + 1);
      return;
    }
    const now = new Date();
    setAudit((a) => [
      ...a,
      {
        date: now.toISOString().slice(0, 10),
        time: now.toTimeString().slice(0, 5),
        owner: name,
        from: row.pct,
        to,
        before: row.updated,
        after: newUpd,
        by: me.name,
        reason: reason.trim(),
      },
    ]);
    setReports((rs) =>
      rs.map((r) => (r.name === name ? { ...r, pct: to } : r)),
    );
    const liveRow = kids0.find((r) => r.name === name && r.id);
    if (liveRow?.id) {
      updateBudget(liveRow.id, { percentage: to, applied_budget: newUpd }, "comp")
        .catch((error) => setError(error.message || "Failed to save Comp Manager budget."));
    }
    setReason("");
    setError("");
  }

  const toggle = (k) => setPane((p) => ({ ...p, [k]: !p[k] }));
  const head = (k, title, cnt) => (
    <button
      type="button"
      className="pane-head"
      aria-expanded={pane[k]}
      onClick={() => toggle(k)}
    >
      <span>
        {title}
        {cnt ? <span className="cnt">{cnt}</span> : null}
      </span>
      <span className="chev">{pane[k] ? "▾" : "▸"}</span>
    </button>
  );

  function row(o, self, grp) {
    const h = self ? selfHist : kidHist[o.name];
    const changed = h.length > 1;
    const d = o.updated - o.original;
    const k = (extra) =>
      [self && "self", grp && "grp", extra].filter(Boolean).join(" ");
    const shown = !!open[o.name];
    return (
      <Fragment key={o.name}>
        <div className={k("first")}>
          <span style={{ width: self ? 0 : 18, flexShrink: 0 }} />
          {self ? "Tech ED" : "Comp Manager"}
        </div>
        <div className={k()}>
          <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
            {o.name}
          </span>
          {self ? (
            <span className="muted-small" style={{ fontWeight: 400 }}>
              {" "}
              (you)
            </span>
          ) : null}
        </div>
        <div className={k("r")}>{money(o.original)}</div>
        <div className={k("r")}>{money(o.updated)}</div>
        <div className={k("r")}>
          <Chg d={d} base={o.original} />
        </div>
        <div className={k("r")}>{self ? me.team0 : o.team0}</div>
        <div className={k("r")}>{self ? me.team : o.team}</div>
        <div className={k("ctr")}>
          {changed && canAudit ? (
            <button
              type="button"
              className="dd"
              aria-expanded={shown}
              onClick={() => setOpen((x) => ({ ...x, [o.name]: !x[o.name] }))}
            >
              {dateText(h[h.length - 1].date)} {shown ? "▴" : "▾"}
            </button>
          ) : (
            <span style={{ color: "#94a3b8", fontWeight: 400 }}>—</span>
          )}
        </div>
        <div className={k("ctr last")}>
          {self ? (
            <span style={{ color: "#94a3b8" }}>{me.pct}%</span>
          ) : !canAllot ? (
            <span>{o.pct}%</span>
          ) : (
            <input
              key={o.name + o.pct + nonce}
              className="pct-in"
              type="number"
              min="0"
              step="0.1"
              defaultValue={o.pct}
              aria-label={"Allot % for " + o.name}
              onBlur={(e) => setPct(o.name, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          )}
        </div>
        {shown && changed && canAudit ? (
          <div className="tr last">
            <Trail rows={h} roll={self} />
          </div>
        ) : null}
      </Fragment>
    );
  }

  const cells = [
    [
      "Original allotted",
      money(me.original),
      <span className="muted">Fixed at allocation</span>,
    ],
    ["Updated budget", money(me.updated), <Chg d={me.updated - me.original} />],
    [
      "Team size",
      me.team0 + " → " + me.team,
      <span className="muted">At allocation → now</span>,
    ],
    ["Allotted to reports", money(allotted), null],
    [
      "Buffer",
      money(me.updated - allotted),
      <span className="muted">Not passed down</span>,
    ],
  ];

  return (
    <div className="te-root">
      <style>{CSS}</style>

      <div className="btop">
        <span>
          Appraisal cycle <b>{activeCycleName || "—"}</b>
        </span>
        <span className="sep" />
        <span>Budget allocation from Data Store</span>
        <span className="sep" />
        <span>
          <b>{me.name}</b>
        </span>
        <span className="sep" />
        <span className="applied">
          Budget applied by HR: <b>{me.pct}%</b>{" "}
          <span className="muted-small">(org default)</span> ={" "}
          <b>{money(me.updated)}</b> updated · original {money(me.original)}
          {canAudit && (
            <button
              type="button"
              className="dd"
              aria-expanded={applied}
              onClick={() => setApplied((v) => !v)}
            >
              % history {applied ? "▴" : "▾"}
            </button>
          )}
        </span>
      </div>
      {applied && canAudit ? (
        <div className="apdrop">
          <AuditTable
            rows={sorted.filter((a) => a.owner === me.name)}
            showOwner={false}
          />
        </div>
      ) : null}

      {!liveMe ? <div className="card" style={{ padding: 12, color: "#92400e" }}>No Tech-Ed budget was found for your login in the active appraisal cycle. Check the Appraiser Tech-ED assignment and the saved budget allocation.</div> : null}
      <section className="card">
        {head("mine", "My Budget")}
        {pane.mine ? (
          <>
            <div className="bsum">
              {cells.map(([l, v, n]) => (
                <div key={l}>
                  <div className="f-label">{l}</div>
                  <div className="v">{v}</div>
                  {n ? <div className="d">{n}</div> : null}
                </div>
              ))}
              <div>
                <div className="f-label">Utilised</div>
                <div className={"v" + (over ? " over" : "")}>
                  {money(used)} ({usedPct.toFixed(0)}%)
                </div>
                <div className="d">
                  {over ? (
                    <span className="over">
                      ▲ {money(used - me.updated)} over
                    </span>
                  ) : (
                    <span className="muted">
                      Remaining {money(me.updated - used)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section className="card">
        {head(
          "alloc",
          "Allocation",
          kids.length + " Comp Manager" + (kids.length === 1 ? "" : "s"),
        )}
        {pane.alloc ? (
          <>
            {canAllot && (
              <div className="reason">
                <label htmlFor="te-reason">Reason for next % change</label>
                <input
                  id="te-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Optional — saved in the audit trail"
                />
              </div>
            )}
            {error ? (
              <div className="berr" role="alert">
                <span>{error}</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => setError("")}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            <div className="bscroll" style={{ marginTop: error ? 10 : 0 }}>
              <div className="bal" style={{ gridTemplateColumns: COLS }}>
                {HEADS.map((x, i) => (
                  <div
                    key={x}
                    className={
                      "h" +
                      (i > 1 && i < 7 ? " r" : "") +
                      (i >= 7 ? " ctr" : "") +
                      (i === 8 ? " last" : "")
                    }
                  >
                    {x}
                  </div>
                ))}
                {row(
                  { name: me.name, original: me.original, updated: me.updated },
                  true,
                  false,
                )}
                {kids.map((k, i) => row(k, false, i > 0))}
              </div>
            </div>
          </>
        ) : null}
      </section>

      {canAudit && <section className="card">
        {head("audit", "% Applied — audit trail (you and your Comp Managers)")}
        {pane.audit ? (
          <>
            <div className="reason">
              <label>
                Owner{" "}
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All</option>
                  {names.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="audit-wrap">
              <AuditTable rows={auditRows} />
            </div>
          </>
        ) : null}
      </section>}
    </div>
  );
}
