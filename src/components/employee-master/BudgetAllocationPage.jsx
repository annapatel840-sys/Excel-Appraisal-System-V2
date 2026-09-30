import { useMemo, useState } from "react";
import { useCatalystUser } from "@/lib/catalyst-auth";

const NAVY = "#12304f";
const TEAL = "#14a3a3";
const BORDER = "#d3dbe6";

const TECH_ED_DATA = [
  {
    name: "Prabhu Prasad Parida",
    level: "Tech ED",
    parent: "HR",
    pct: 8,
    base: 42500000,
    original: 3400000,
    updated: 3400000,
    team0: 48,
    team: 48,
    allotted: 0,
    lastChanged: "01-Sep-26",
  },
  {
    name: "Ashok Kumar",
    level: "Tech ED",
    parent: "HR",
    pct: 8,
    base: 38000000,
    original: 3040000,
    updated: 3040000,
    team0: 42,
    team: 42,
    allotted: 0,
    lastChanged: "01-Sep-26",
  },
];

const INITIAL_AUDIT = [
  {
    date: "2026-09-01",
    owner: "Prabhu Prasad Parida",
    from: null,
    to: 8,
    before: null,
    after: 3400000,
    by: "HR",
    reason: "Initial allocation",
  },
  {
    date: "2026-09-01",
    owner: "Ashok Kumar",
    from: null,
    to: 8,
    before: null,
    after: 3040000,
    by: "HR",
    reason: "Initial allocation",
  },
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

function Header({ children }) {
  return (
    <div
      className="px-4 py-2.5 text-[13.5px] font-semibold tracking-[.15px] text-white"
      style={{ background: NAVY }}
    >
      {children}
    </div>
  );
}

function Panel({ title, count, open, onToggle, children }) {
  return (
    <section className="overflow-hidden rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(18,48,79,.06)]" style={{ borderColor: BORDER }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px] font-semibold tracking-[.15px] text-white"
        style={{ background: NAVY }}
      >
        <span>{title}{count ? <span className="ml-2 font-normal text-[#d6e4f5]">{count}</span> : null}</span>
        <span className="text-[12px]">{open ? "▾" : "▸"}</span>
      </button>
      {open ? children : null}
    </section>
  );
}

function AuditTable({ rows, showOwner = true }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse text-[12px]">
        <thead>
          <tr>
            {["Date", ...(showOwner ? ["Owner"] : []), "Old %", "New %", "Budget before", "Budget after", "Changed by", "Reason"].map((h) => (
              <th key={h} className="border-b border-[#d7dce3] px-2 py-1.5 text-left text-[11px] font-bold text-[#1e3a5f]">
                {h}
              </th>
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

function HRApplyBudget() {
  const [rows, setRows] = useState(TECH_ED_DATA);
  const [orgPct, setOrgPct] = useState("8");
  const [pending, setPending] = useState({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState({});
  const [audit, setAudit] = useState(INITIAL_AUDIT);

  const total = useMemo(() => rows.reduce((s, r) => ({
    base: s.base + r.base,
    original: s.original + r.original,
    updated: s.updated + r.updated,
    team: s.team + r.team,
  }), { base: 0, original: 0, updated: 0, team: 0 }), [rows]);

  const previewPct = (row) => pending[row.name] ?? Number(orgPct || 0);
  const previewBudget = (row) => row.base * previewPct(row) / 100;
  const changes = rows.filter((r) => Number(previewPct(r)) !== r.pct);

  function apply() {
    const org = Number(orgPct);
    if (!(org >= 0 && org <= 100)) {
      setError("Enter a valid org % between 0 and 100.");
      return;
    }

    const now = new Date().toISOString().slice(0, 10);
    const next = rows.map((row) => {
      const to = Number(previewPct(row));
      if (to === row.pct) return row;
      const updated = row.base * to / 100;
      return { ...row, pct: to, updated, lastChanged: dateText(now) };
    });

    const newAudit = changes.map((row) => ({
      date: now,
      owner: row.name,
      from: row.pct,
      to: Number(previewPct(row)),
      before: row.updated,
      after: previewBudget(row),
      by: "HR",
      reason: reason.trim() || "Budget percentage change",
    }));

    setRows(next);
    setAudit((a) => [...newAudit, ...a]);
    setPending({});
    setReason("");
    setError("");
  }

  function discard() {
    setPending({});
    setReason("");
    setError("");
  }

  return (
    <div className="space-y-2">
      <div className="rounded-[10px] border border-[#d3dbe6] border-l-4 bg-white px-3.5 py-2 text-[12.5px] text-[#334155]" style={{ borderLeftColor: TEAL }}>
        <div className="flex flex-wrap items-center gap-4">
          <span>Appraisal cycle <b>Apr-26</b></span>
          <span className="h-5 w-px bg-[#d7dce3]" />
          <span>Allocated <b>01-Sep-26</b> by <b>HR</b></span>
          <span className="h-5 w-px bg-[#d7dce3]" />
          <span><b>HR</b></span>
        </div>
      </div>

      <div className={"overflow-hidden rounded-[10px] border bg-white " + (changes.length ? "bg-[#fdf8e7]" : "")} style={{ borderColor: BORDER }}>
        <Header>Org Budget %</Header>
        <div className="flex flex-wrap items-stretch">
          <div className="border-r border-[#d7dce3] px-[18px] py-3">
            <div className="text-[11px] font-medium text-[#5b6b80]">Org % (default for all Tech EDs)</div>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={orgPct}
              onChange={(e) => {
                setOrgPct(e.target.value);
                const v = e.target.value;
                setPending(Object.fromEntries(rows.map((r) => [r.name, v])));
              }}
              className="mt-1 h-8 w-[110px] rounded border border-[#14a3a3] px-2 text-right text-[14px] font-bold text-[#12304f] outline-none"
            />
          </div>
          <div className="border-r border-[#d7dce3] px-[18px] py-3"><div className="text-[11px] text-[#5b6b80]">Org budget base</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{money(total.base)}</div></div>
          <div className="border-r border-[#d7dce3] px-[18px] py-3"><div className="text-[11px] text-[#5b6b80]">Original budget</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{money(total.original)}</div></div>
          <div className="px-[18px] py-3"><div className="text-[11px] text-[#5b6b80]">Updated budget</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{money(changes.length ? changes.reduce((s, r) => s + previewBudget(r), 0) + rows.filter((r) => !changes.includes(r)).reduce((s, r) => s + r.updated, 0) : total.updated)}</div></div>
        </div>
        <div className="px-4 pb-3 text-[11.5px] text-slate-500">Changing the org % updates every Tech ED on the org default.</div>
      </div>

      {error ? (
        <div className="flex justify-between gap-2 rounded-md border border-l-4 border-[#e3e8ef] border-l-[#c2410c] bg-white px-3 py-2 text-[12px] text-[#7c2d12]">
          <span>{error}</span><button type="button" className="font-bold" onClick={() => setError("")}>Dismiss</button>
        </div>
      ) : null}

      <Panel title="Tech EDs" count={String(rows.length)} open={true} onToggle={() => {}}>
        <div className="max-h-[58vh] overflow-auto">
          <table className="w-full min-w-[1050px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                {["Tech ED", "Budget base", "% applied", "Source", "Budget", "Original Budget", "Updated Budget", "Original Count", "Current Count", "Last Changed"].map((h, i) => (
                  <th key={h} className={"border-b-2 border-[#9fb3cf] bg-[#e8eef5] px-2.5 py-2 text-[12px] font-semibold text-[#12304f] " + (i >= 1 && i !== 9 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = previewPct(r);
                const changed = Number(p) !== r.pct;
                const open = !!history[r.name];
                return (
                  <>
                    <tr key={r.name} className={changed ? "bg-[#fffbe6]" : ""}>
                      <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">{r.name}</td>
                      <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(r.base)}</td>
                      <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={p}
                          onChange={(e) => setPending((x) => ({ ...x, [r.name]: e.target.value }))}
                          className="h-8 w-[84px] rounded border border-[#14a3a3] px-2 text-right text-[14px] font-bold text-[#12304f]"
                        />
                      </td>
                      <td className="border-b border-[#e1e5eb] px-2.5 py-2"><span className="rounded-full bg-[#e6f4f4] px-2 py-0.5 text-[11px] font-bold text-[#0f6d6d]">{Number(p) === Number(orgPct) ? "Org default" : "Override"}</span></td>
                      <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right font-bold text-[#12304f]">{money(r.base * p / 100)}</td>
                      <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(r.original)}</td>
                      <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(r.updated)}</td>
                      <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{r.team0}</td>
                      <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{r.team}</td>
                      <td className="border-b border-[#e1e5eb] px-2.5 py-2">
                        {changed ? <button type="button" className="rounded border border-[#c5d0dd] bg-white px-2 py-1 font-bold text-[#17365d]" onClick={() => setHistory((x) => ({ ...x, [r.name]: !x[r.name] }))}>{r.lastChanged} {open ? "▴" : "▾"}</button> : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                    {open ? (
                      <tr key={r.name + "-history"}><td colSpan="10" className="bg-[#f7f9fc] px-10 py-3">
                        <AuditTable rows={audit.filter((a) => a.owner === r.name)} />
                      </td></tr>
                    ) : null}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-[#d4dbe5] bg-white px-3.5 py-2.5">
          <span className={changes.length ? "font-bold text-[#c2410c]" : "text-slate-500"}>{changes.length ? changes.length + " change" + (changes.length === 1 ? "" : "s") + " pending" : "No pending changes"}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} disabled={!changes.length} placeholder="Reason (saved in the audit trail)" className="h-[30px] min-w-[200px] max-w-[460px] flex-1 rounded border border-[#cbd3df] px-2 text-[12.5px]" />
          <button type="button" disabled={!changes.length} onClick={discard} className="rounded-md border border-[#c5d0dd] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#12304f] disabled:opacity-40">Discard</button>
          <button type="button" disabled={!changes.length} onClick={apply} className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: TEAL }}>Apply</button>
        </div>
      </Panel>

    </div>
  );
}

function HRAuditTrail() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = INITIAL_AUDIT.filter((r) =>
    (!from || r.date >= from) && (!to || r.date <= to) && (filter === "all" || r.owner === filter)
  );

  return (
    <div className="space-y-2">
      <div className="rounded-[10px] border border-[#d3dbe6] bg-white">
        <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-[12px] text-slate-600">
          <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 h-7 rounded border border-[#cbd3df] px-2" /></label>
          <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 h-7 rounded border border-[#cbd3df] px-2" /></label>
          <span className="ml-auto text-[11px]">Audit lines can't be edited or deleted</span>
        </div>
      </div>

      <Panel title="Org % — audit trail" open={true} onToggle={() => {}}>
        <div className="p-3.5"><AuditTable rows={filtered} showOwner={false} /></div>
      </Panel>

      <Panel title="Tech ED % — audit trail" count="" open={true} onToggle={() => {}}>
        <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-3.5 py-2 text-[12px]">
          <label>Tech ED
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="ml-2 h-7 rounded border border-[#cbd3df] px-2">
              <option value="all">All</option>
              {TECH_ED_DATA.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          </label>
        </div>
        <div className="p-3.5"><AuditTable rows={filtered} /></div>
      </Panel>
    </div>
  );
}

export function BudgetAllocationPage() {
  const user = useCatalystUser();
  const role = String(user?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isHR = role === "hr" || role === "humanresources" || role === "hroperation";
  const [tab, setTab] = useState("apply");

  return (
    <div
      className="w-full"
      style={{
        fontFamily: '"IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif',
        fontVariantNumeric: "tabular-nums",
        color: "#0f1f33",
      }}
    >
      {isHR ? (
        <>
          <div className="mb-2 flex gap-2">
            <button type="button" onClick={() => setTab("apply")} className={"rounded-2xl border px-4 py-1.5 text-[12px] font-medium " + (tab === "apply" ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white" : "bg-white text-[#334155]")}>2 · Apply Budget</button>
            <button type="button" onClick={() => setTab("audit")} className={"rounded-2xl border px-4 py-1.5 text-[12px] font-medium " + (tab === "audit" ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white" : "bg-white text-[#334155]")}>3 · Audit Trail</button>
          </div>
          {tab === "apply" ? <HRApplyBudget /> : <HRAuditTrail />}
        </>
      ) : (
        <TechEdBudgetAllocationPage />
      )}
    </div>
  );
}

export function TechEdBudgetAllocationPage() {
  const user = useCatalystUser();
  const rawName = String(user?.name || user?.email || "Tech ED").trim();
  const data = TECH_ED_DATA.find((r) => rawName.includes(r.name)) || TECH_ED_DATA[0];

  const [pctValue, setPctValue] = useState(data.pct);
  const [reason, setReason] = useState("");
  const [mineOpen, setMineOpen] = useState(true);
  const [allocOpen, setAllocOpen] = useState(true);
  const [auditOpen, setAuditOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [audit, setAudit] = useState(() => INITIAL_AUDIT.filter((a) => a.owner === data.name));

  const updatedBudget = data.base * Number(pctValue || 0) / 100;
  const buffer = updatedBudget - data.allotted;

  function savePct() {
    if (!(Number(pctValue) >= 0 && Number(pctValue) <= 100)) return;
    if (Number(pctValue) === data.pct) return;
    const now = new Date().toISOString().slice(0, 10);
    setAudit((a) => [{
      date: now,
      owner: data.name,
      from: data.pct,
      to: Number(pctValue),
      before: data.updated,
      after: updatedBudget,
      by: data.parent,
      reason: reason.trim() || "Budget percentage change",
    }, ...a]);
    setReason("");
  }

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-2">
      <div className="rounded-[10px] border border-l-4 bg-white px-3.5 py-2" style={{ borderColor: BORDER, borderLeftColor: TEAL }}>
        <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-[#334155]">
          <span>Appraisal cycle <b>Apr-26</b></span><span className="h-5 w-px bg-[#d7dce3]" />
          <span>Allocated <b>01-Sep-26</b> by <b>HR</b></span><span className="h-5 w-px bg-[#d7dce3]" />
          <span><b>Tech ED</b></span><span className="h-5 w-px bg-[#d7dce3]" />
          <span className="font-semibold text-[#12304f]">Budget applied by HR: <b>{percent(pctValue)}</b> = <b>{money(updatedBudget)}</b></span>
          <button type="button" onClick={() => setHistoryOpen((v) => !v)} className="rounded border border-[#c5d0dd] bg-white px-2 py-1 text-[11px] font-bold text-[#12304f]">% history {historyOpen ? "▴" : "▾"}</button>
        </div>
      </div>

      {historyOpen ? <div className="rounded-[10px] border bg-[#f7f9fc] p-2" style={{ borderColor: BORDER }}><AuditTable rows={audit} /></div> : null}

      <Panel title="My Budget" open={mineOpen} onToggle={() => setMineOpen((v) => !v)}>
        <div className="grid grid-cols-2 divide-x divide-[#d7dce3] sm:grid-cols-4">
          {[
            ["Original Budget", money(data.original)],
            ["Updated Budget", money(updatedBudget)],
            ["Team Count", data.team],
            ["Buffer", money(buffer)],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-3"><div className="text-[11px] font-medium text-[#5b6b80]">{label}</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{value}</div></div>
          ))}
        </div>
      </Panel>

      <Panel title="Allocation" count={data.team + " Tech ED"} open={allocOpen} onToggle={() => setAllocOpen((v) => !v)}>
        <div className="border-b border-[#e1e5eb] px-3.5 py-2 text-[12px] text-slate-600">
          Reason for next % change
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional — saved in the audit trail" className="ml-2 h-7 w-full max-w-[420px] rounded border border-[#cbd3df] px-2 text-[12.5px]" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
            <thead><tr>{["Level","Owner","Original Budget","Updated Budget","Change","Original Count","Current Count","Last Changed","Allot %"].map((h,i)=><th key={h} className={"border-b-2 border-[#9fb3cf] bg-[#e8eef5] px-2.5 py-2 text-[12px] font-semibold text-[#12304f] " + (i>=2 && i!==7 ? "text-right" : "text-left")}>{h}</th>)}</tr></thead>
            <tbody>
              <tr>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">Level 1</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">{data.name}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(data.original)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right font-bold text-[#12304f]">{money(updatedBudget)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(updatedBudget - data.original)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{data.team0}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{data.team}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2">{data.lastChanged}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">
                  <input type="number" min="0" max="100" step="0.1" value={pctValue} onChange={(e)=>setPctValue(e.target.value)} onBlur={savePct} className="h-[32px] w-[84px] rounded border border-[#14a3a3] px-2 text-right text-[14px] font-bold text-[#12304f]" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="% Applied — Audit Trail" open={auditOpen} onToggle={() => setAuditOpen((v) => !v)}>
        <div className="p-3.5"><AuditTable rows={audit} /></div>
      </Panel>
    </div>
  );
}
