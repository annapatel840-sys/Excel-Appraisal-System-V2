import { useMemo, useState } from "react";
import { useCatalystUser } from "@/lib/catalyst-auth";

const NAVY = "#12304f";
const TEAL = "#14a3a3";
const BORDER = "#d3dbe6";

const TECH_ED_DATA = [
  { name: "Prabhu Prasad Parida", level: "Tech ED", parent: "HR", pct: 8, base: 42500000, original: 3400000, updated: 3400000, team0: 48, team: 48, allotted: 0, lastChanged: "01-Sep-26" },
  { name: "Ashok Kumar", level: "Tech ED", parent: "HR", pct: 8, base: 38000000, original: 3040000, updated: 3040000, team0: 42, team: 42, allotted: 0, lastChanged: "01-Sep-26" },
];

const INITIAL_AUDIT = [
  { date: "2026-09-01", owner: "Prabhu Prasad Parida", from: null, to: 8, before: null, after: 3400000, by: "HR", reason: "Initial allocation" },
  { date: "2026-09-01", owner: "Ashok Kumar", from: null, to: 8, before: null, after: 3040000, by: "HR", reason: "Initial allocation" },
];

const INITIAL_ORG_AUDIT = [
  { date: "2026-09-01", from: null, to: 8, before: null, after: 6440000, by: "HR", reason: "Initial allocation" },
];

function money(value) {
  return "₹ " + ((Number(value) || 0) / 100000).toFixed(2) + " L";
}

function percent(value) {
  return Number(value || 0).toFixed(1) + "%";
}

function dateText(value) {
  if (!value) return "—";
  const p = String(value).split("-");
  if (p.length !== 3) return value;
  return p[2] + "-" + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(p[1]) - 1];
}

function Panel({ title, count, open, onToggle, children }) {
  return (
    <section className="overflow-hidden rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(18,48,79,.06)]" style={{ borderColor: BORDER }}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px] font-semibold tracking-[.15px] text-white" style={{ background: NAVY }}>
        <span>{title}{count ? <span className="ml-2 font-normal text-[#d6e4f5]">{count}</span> : null}</span>
        <span className="text-[12px]">{open ? "▾" : "▸"}</span>
      </button>
      {open ? children : null}
    </section>
  );
}

function AuditTable({ rows, showOwner = true }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse text-[12px]">
        <thead>
          <tr>
            {["Date", ...(showOwner ? ["Owner"] : []), "Old %", "New %", "Budget before", "Budget after", "Changed by", "Reason"].map((h) => (
              <th key={h} className="border-b border-[#d7dce3] px-2 py-1.5 text-left text-[11px] font-bold text-[#1e3a5f]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((r, i) => (
            <tr key={i}>
              <td className="border-b border-[#edf0f4] px-2 py-1.5">{dateText(r.date)}</td>
              {showOwner ? <td className="border-b border-[#edf0f4] px-2 py-1.5 font-bold">{r.owner}</td> : null}
              <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right">{r.from == null ? "—" : percent(r.from)}</td>
              <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right font-bold">{percent(r.to)}</td>
              <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right">{r.before == null ? "—" : money(r.before)}</td>
              <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right">{money(r.after)}</td>
              <td className="border-b border-[#edf0f4] px-2 py-1.5">{r.by}</td>
              <td className="border-b border-[#edf0f4] px-2 py-1.5">{r.reason || "—"}</td>
            </tr>
          )) : (
            <tr><td colSpan={showOwner ? 8 : 7} className="px-3 py-4 text-slate-500">No changes in this date range.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CycleBar({ role }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-l-4 bg-white px-3.5 py-2 text-[12.5px] text-[#334155]" style={{ borderColor: BORDER, borderLeftColor: TEAL }}>
      <span>Appraisal cycle <b>Apr-26</b></span>
      <span className="h-5 w-px bg-[#d7dce3]" />
      <span>Allocated <b>01-Sep-26</b> by <b>HR</b></span>
      <span className="h-5 w-px bg-[#d7dce3]" />
      <span><b>{role}</b></span>
    </div>
  );
}

function HRApplyBudget() {
  const [rows, setRows] = useState(TECH_ED_DATA);
  const [orgPct, setOrgPct] = useState("8");
  const [pending, setPending] = useState({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState({});
  const [audit, setAudit] = useState(INITIAL_AUDIT);
  const [orgAudit, setOrgAudit] = useState(INITIAL_ORG_AUDIT);
  const [overrides, setOverrides] = useState({});

  const total = useMemo(() => rows.reduce((s, r) => ({
    base: s.base + r.base,
    original: s.original + r.original,
    updated: s.updated + r.updated,
    team0: s.team0 + r.team0,
    team: s.team + r.team,
  }), { base: 0, original: 0, updated: 0, team0: 0, team: 0 }), [rows]);

  const previewPct = (row) => Object.prototype.hasOwnProperty.call(pending, row.name)
    ? Number(pending[row.name])
    : overrides[row.name] ? row.pct : Number(orgPct);

  const previewBudget = (row) => row.base * previewPct(row) / 100;
  const changes = rows.filter((r) => Number(previewPct(r)) !== r.pct);
  const orgPending = Number(orgPct) !== 8;
  const pendingCount = changes.length || orgPending ? changes.length + (orgPending ? 1 : 0) : 0;
  const previewTotal = rows.reduce((s, r) => s + previewBudget(r), 0);

  function setRowPct(name, value) {
    setPending((p) => ({ ...p, [name]: value }));
  }

  function resetRow(name) {
    const value = orgPct;
    const row = rows.find((r) => r.name === name);
    if (Number(value) === row?.pct) {
      setPending((p) => { const n = { ...p }; delete n[name]; return n; });
      setOverrides((o) => { const n = { ...o }; delete n[name]; return n; });
    } else {
      setPending((p) => ({ ...p, [name]: value }));
    }
  }

  function discard() {
    setPending({});
    setReason("");
    setError("");
  }

  function apply() {
    const org = Number(orgPct);
    if (!(org >= 0 && org <= 100)) {
      setError("Enter a valid org % between 0 and 100.");
      return;
    }

    const invalid = rows.find((r) => {
      const value = previewPct(r);
      return !(value >= 0 && value <= 100);
    });
    if (invalid) {
      setError("Not applied. " + invalid.name + ": enter a valid % between 0 and 100.");
      return;
    }

    const now = new Date().toISOString().slice(0, 10);
    const changedRows = rows.filter((r) => Number(previewPct(r)) !== r.pct);
    const next = rows.map((r) => {
      const to = Number(previewPct(r));
      return to === r.pct ? r : { ...r, pct: to, updated: r.base * to / 100, lastChanged: dateText(now) };
    });

    const newAudit = changedRows.map((r) => ({
      date: now,
      owner: r.name,
      from: r.pct,
      to: Number(previewPct(r)),
      before: r.updated,
      after: previewBudget(r),
      by: "HR",
      reason: reason.trim() || (Number(previewPct(r)) === org ? "Reset to org %" : "Override"),
    }));

    if (orgPending) {
      setOrgAudit((a) => [{
        date: now,
        from: 8,
        to: org,
        before: total.updated,
        after: previewTotal,
        by: "HR",
        reason: reason.trim() || "Org budget percentage change",
      }, ...a]);
    }

    setRows(next);
    setAudit((a) => [...newAudit, ...a]);
    setPending({});
    setOverrides((o) => {
      const nextOverrides = { ...o };
      next.forEach((r) => {
        if (r.pct === org) delete nextOverrides[r.name];
        else nextOverrides[r.name] = true;
      });
      return nextOverrides;
    });
    setReason("");
    setError("");
  }

  return (
    <div className="flex flex-col gap-2">
      <CycleBar role="HR" />

      {error ? (
        <div className="flex justify-between gap-2 rounded-md border border-[#e3e8ef] border-l-4 border-l-[#c2410c] bg-white px-3 py-2 text-[12px] text-[#7c2d12]">
          <span>{error}</span>
          <button type="button" className="font-bold" onClick={() => setError("")}>Dismiss</button>
        </div>
      ) : null}

      <section className={"overflow-hidden rounded-[10px] border bg-white " + (orgPending ? "bg-[#fdf8e7]" : "")} style={{ borderColor: BORDER }}>
        <div className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white" style={{ background: NAVY }}>Org Budget %</div>
        <div className="grid grid-cols-[minmax(190px,1.25fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(130px,.8fr)]">
          <div className="min-w-0 border-r border-[#d7dce3] px-[18px] py-3">
            <div className="text-[11px] font-medium text-[#5b6b80]">Org % (default for all Tech EDs)</div>
            <input type="number" min="0" max="100" step="0.1" value={orgPct} onChange={(e) => setOrgPct(e.target.value)} className="mt-1 h-[38px] w-[110px] rounded border border-[#14a3a3] px-2 text-right text-[18px] font-bold text-[#12304f] outline-none" />
            {orgPending ? <div className="text-[11px] text-slate-500">was 8%</div> : null}
          </div>
          <div className="min-w-0 border-r border-[#d7dce3] px-[18px] py-3"><div className="text-[11px] text-[#5b6b80]">Org budget base</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{money(total.base)}</div></div>
          <div className="min-w-0 border-r border-[#d7dce3] px-[18px] py-3"><div className="text-[11px] text-[#5b6b80]">Original budget</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{money(total.original)}</div></div>
          <div className="min-w-0 border-r border-[#d7dce3] px-[18px] py-3"><div className="text-[11px] text-[#5b6b80]">Updated budget</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{money(orgPending || changes.length ? previewTotal : total.updated)}</div></div>
          <div className="min-w-0 px-[18px] py-3"><div className="text-[11px] text-[#5b6b80]">Team count</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{total.team0} → {total.team}</div></div>
        </div>
        <div className="px-4 pb-3 text-[11.5px] text-slate-500">Changing the org % updates every Tech ED on the org default. Tech EDs with an override keep their own %.</div>
      </section>

      <section className="overflow-hidden rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(18,48,79,.06)]" style={{ borderColor: BORDER }}>
        <div className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white" style={{ background: NAVY }}>Tech EDs — {rows.length}</div>
        <div className="max-h-[58vh] overflow-auto">
          <table className="w-full min-w-[1050px] table-fixed border-collapse text-[12.5px]">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr>
                {["Tech ED","Budget base","% applied","Source","Budget","Original Budget","Updated Budget","Original Count","Current Count","Last Changed"].map((h, i) => (
                  <th key={h} className={"border-b-2 border-[#9fb3cf] bg-[#e8eef5] px-2.5 py-2 text-[12px] font-semibold text-[#12304f] " + (i >= 1 && i < 9 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = previewPct(r);
                const changing = Number(p) !== r.pct;
                const open = !!history[r.name];
                return (
                  <tr key={r.name} className={changing ? "bg-[#fdf8e7]" : ""}>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">{r.name}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(r.base)}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right align-top">
                      <input type="number" min="0" max="100" step="0.1" value={p} onChange={(e) => setRowPct(r.name, e.target.value)} className="h-8 w-[84px] rounded border border-[#14a3a3] bg-white px-2 text-right text-[14px] font-bold text-[#12304f]" />
                      {changing ? <div className="whitespace-nowrap text-[11px] text-slate-500">was {r.pct}%</div> : null}
                    </td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2">
                      {overrides[r.name] || (Object.prototype.hasOwnProperty.call(pending, r.name) && Number(p) !== Number(orgPct))
                        ? <><span className="whitespace-nowrap rounded-full bg-[#fff4d6] px-2 py-0.5 text-[11px] font-bold text-[#8a5a00]">Override</span> <button type="button" className="ml-1 whitespace-nowrap text-[11.5px] font-bold text-[#1859a8]" onClick={() => resetRow(r.name)}>Reset to org %</button></>
                        : <span className="whitespace-nowrap rounded-full bg-[#e6f4f4] px-2 py-0.5 text-[11px] font-bold text-[#0f6d6d]">Org default</span>}
                    </td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right font-bold text-[#17365d]">{money(r.base * p / 100)}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(r.original)}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(r.updated)}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{r.team0}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{r.team}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2">
                      {open || r.lastChanged !== "01-Sep-26" ? <button type="button" className="whitespace-nowrap rounded border border-[#c5d0dd] bg-white px-2 py-1 text-[12px] font-bold text-[#17365d]" onClick={() => setHistory((x) => ({ ...x, [r.name]: !x[r.name] }))}>{r.lastChanged} {open ? "▴" : "▾"}</button> : <span className="text-[#94a3b8]">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {Object.entries(history).some(([, open]) => open) ? (
            <div className="hidden" aria-hidden="true" />
          ) : null}
        </div>
        {Object.entries(history).map(([name, open]) => open ? (
          <div key={name} className="border-t border-[#d7dce3] bg-[#f7f9fc] px-10 py-3">
            <AuditTable rows={audit.filter((a) => a.owner === name)} />
          </div>
        ) : null)}
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-[#d4dbe5] bg-white px-3.5 py-2.5">
          <span className={pendingCount ? "font-bold text-[#c2410c]" : "text-slate-500"}>{pendingCount ? pendingCount + " change" + (pendingCount === 1 ? "" : "s") + " pending" : "No pending changes"}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} disabled={!pendingCount} placeholder="Reason (saved in the audit trail)" className="h-[30px] min-w-[200px] max-w-[460px] flex-1 rounded border border-[#cbd3df] px-2 text-[12.5px]" />
          <button type="button" disabled={!pendingCount} onClick={discard} className="rounded-md border border-[#c5d0dd] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#12304f] disabled:opacity-40">Discard</button>
          <button type="button" disabled={!pendingCount} onClick={apply} className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: TEAL }}>Apply</button>
        </div>
      </section>
    </div>
  );
}

function HRAuditTrail() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState("all");
  const [audit] = useState(INITIAL_AUDIT);
  const [orgAudit] = useState(INITIAL_ORG_AUDIT);

  const orgRows = orgAudit.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  const tedRows = audit.filter((r) => (!from || r.date >= from) && (!to || r.date <= to) && (filter === "all" || r.owner === filter));

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-[10px] border bg-white" style={{ borderColor: BORDER }}>
        <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-[12px] text-slate-600">
          <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 h-7 max-w-[150px] rounded border border-[#cbd3df] px-2" /></label>
          <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 h-7 max-w-[150px] rounded border border-[#cbd3df] px-2" /></label>
          <span className="ml-auto text-[11px]">Audit lines can't be edited or deleted</span>
        </div>
      </div>
      <section className="overflow-hidden rounded-[10px] border bg-white" style={{ borderColor: BORDER }}>
        <div className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white" style={{ background: NAVY }}>Org % — audit trail</div>
        <div className="p-3.5"><AuditTable rows={orgRows} showOwner={false} /></div>
      </section>
      <section className="overflow-hidden rounded-[10px] border bg-white" style={{ borderColor: BORDER }}>
        <div className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white" style={{ background: NAVY }}>Tech ED % — audit trail</div>
        <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-3.5 py-2 text-[12px]">
          <label>Tech ED
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="ml-2 h-7 rounded border border-[#cbd3df] px-2">
              <option value="all">All</option>
              {TECH_ED_DATA.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          </label>
        </div>
        <div className="p-3.5"><AuditTable rows={tedRows} /></div>
      </section>
    </div>
  );
}

export function BudgetAllocationPage() {
  const user = useCatalystUser();
  const role = String(user?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isHR = role === "hr" || role === "humanresources" || role === "hroperation";
  const [tab, setTab] = useState("apply");

  return (
    <div className="w-full" style={{ fontFamily: '"IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif', fontVariantNumeric: "tabular-nums", color: "#0f1f33" }}>
      {isHR ? (
        <>
          <div className="mb-2 flex gap-2">
            <button type="button" onClick={() => setTab("apply")} className={"rounded-2xl border px-4 py-1.5 text-[12px] font-medium " + (tab === "apply" ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white" : "bg-white text-[#334155]")}>2 · Apply Budget</button>
            <button type="button" onClick={() => setTab("audit")} className={"rounded-2xl border px-4 py-1.5 text-[12px] font-medium " + (tab === "audit" ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white" : "bg-white text-[#334155]")}>3 · Audit Trail</button>
          </div>
          {tab === "apply" ? <HRApplyBudget /> : <HRAuditTrail />}
        </>
      ) : <TechEdBudgetAllocationPage />}
    </div>
  );
}

export function TechEdBudgetAllocationPage() {
  const user = useCatalystUser();
  const rawName = String(user?.name || user?.email || "Tech ED").trim();
  const data = TECH_ED_DATA.find((r) => rawName.includes(r.name)) || TECH_ED_DATA[0];

  const [pctValue, setPctValue] = useState(String(data.pct));
  const [savedPct, setSavedPct] = useState(data.pct);
  const [reason, setReason] = useState("");
  const [mineOpen, setMineOpen] = useState(true);
  const [allocOpen, setAllocOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [audit, setAudit] = useState(() => INITIAL_AUDIT.filter((a) => a.owner === data.name));

  const updatedBudget = data.base * Number(pctValue || 0) / 100;
  const buffer = updatedBudget - data.allotted;
  const isChanged = Number(pctValue) !== savedPct;

  function savePct() {
    const next = Number(pctValue);
    if (!(next >= 0 && next <= 100) || next === savedPct) return;
    const now = new Date().toISOString().slice(0, 10);
    setAudit((a) => [{
      date: now,
      owner: data.name,
      from: savedPct,
      to: next,
      before: data.base * savedPct / 100,
      after: updatedBudget,
      by: data.parent,
      reason: reason.trim() || "Budget percentage change",
    }, ...a]);
    setSavedPct(next);
    setReason("");
  }

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-l-4 bg-white px-3.5 py-2 text-[12.5px] text-[#334155]" style={{ borderColor: BORDER, borderLeftColor: TEAL }}>
        <span>Appraisal cycle <b>Apr-26</b></span><span className="h-5 w-px bg-[#d7dce3]" />
        <span>Allocated <b>01-Sep-26</b> by <b>HR</b></span><span className="h-5 w-px bg-[#d7dce3]" />
        <span><b>Tech ED</b></span><span className="h-5 w-px bg-[#d7dce3]" />
        <span className="font-semibold text-[#12304f]">Budget applied by HR: <b>{percent(pctValue)}</b> = <b>{money(updatedBudget)}</b> updated · original {money(data.original)}</span>
        <button type="button" onClick={() => setHistoryOpen((v) => !v)} className="whitespace-nowrap rounded border border-[#c5d0dd] bg-white px-2 py-1 text-[11px] font-bold text-[#12304f]">% history {historyOpen ? "▴" : "▾"}</button>
      </div>

      {historyOpen ? <div className="rounded-[10px] border bg-[#f7f9fc] p-2" style={{ borderColor: BORDER }}><AuditTable rows={audit} showOwner={false} /></div> : null}

      <Panel title="My Budget" open={mineOpen} onToggle={() => setMineOpen((v) => !v)}>
        <div className="grid grid-cols-2 divide-x divide-[#d7dce3] sm:grid-cols-4">
          {[
            ["Original allotted", money(data.original)],
            ["Updated budget", money(updatedBudget)],
            ["Team size", data.team],
            ["Utilised", money(0)],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-3">
              <div className="text-[11px] font-medium text-[#5b6b80]">{label}</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">{value}</div>
              {label === "Utilised" ? <div className="mt-1 h-2 overflow-hidden rounded bg-[#e6ebf2]"><span className="block h-full w-0" style={{ background: "linear-gradient(90deg,#14a3a3,#1b6fb5)" }} /></div> : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Allocation" count="1 Tech ED" open={allocOpen} onToggle={() => setAllocOpen((v) => !v)}>
        <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-3.5 py-2 text-[12px] text-slate-600">
          <label htmlFor="techReason">Reason for next % change</label>
          <input id="techReason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional — saved in the audit trail" className="h-7 w-full max-w-[420px] rounded border border-[#cbd3df] px-2 text-[12.5px]" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-[12.5px]">
            <colgroup>
              <col className="w-[10%]" /><col className="w-[17%]" /><col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[11%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[9%]" />
            </colgroup>
            <thead><tr>{["Level","Owner","Original Budget","Updated Budget","Change","Original Count","Current Count","Last Changed","Allot %"].map((h,i)=><th key={h} className={"border-b-2 border-[#9fb3cf] bg-[#e8eef5] px-2.5 py-2 text-[12px] font-semibold text-[#12304f] " + (i >= 2 ? "text-right" : "text-left")}>{h}</th>)}</tr></thead>
            <tbody>
              <tr className={isChanged ? "bg-[#fdf8e7]" : ""}>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">Tech ED</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">{data.name}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(data.original)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right font-bold text-[#12304f]">{money(updatedBudget)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(updatedBudget - data.original)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{data.team0}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{data.team}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 whitespace-nowrap">{isChanged ? "Today" : "01-Sep-26"}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">
                  <input type="number" min="0" max="100" step="0.1" value={pctValue} onChange={(e) => setPctValue(e.target.value)} onBlur={savePct} className="h-[32px] w-[84px] rounded border border-[#14a3a3] px-2 text-right text-[14px] font-bold text-[#12304f]" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {auditOpen ? (
        <Panel title="% Applied — Audit Trail" open={auditOpen} onToggle={() => setAuditOpen((v) => !v)}>
          <div className="p-3.5"><AuditTable rows={audit} /></div>
        </Panel>
      ) : null}
    </div>
  );
}
