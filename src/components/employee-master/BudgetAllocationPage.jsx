// import { useMemo, useState } from "react";
// import { useCatalystUser } from "@/lib/catalyst-auth";

// const NAVY = "#12304f";
// const TEAL = "#14a3a3";
// const BORDER = "#d3dbe6";

// const TECH_ED_DATA = [
//   { name: "Prabhu Prasad Parida", level: "Tech ED", parent: "HR", pct: 8, base: 42500000, original: 3400000, updated: 3400000, team0: 48, team: 48, allotted: 0, lastChanged: "01-Sep-26" },
//   { name: "Ashok Kumar", level: "Tech ED", parent: "HR", pct: 8, base: 38000000, original: 3040000, updated: 3040000, team0: 42, team: 42, allotted: 0, lastChanged: "01-Sep-26" },
// ];

// const INITIAL_AUDIT = [
//   { date: "2026-09-01", owner: "Prabhu Prasad Parida", from: null, to: 8, before: null, after: 3400000, by: "HR", reason: "Initial allocation" },
//   { date: "2026-09-01", owner: "Ashok Kumar", from: null, to: 8, before: null, after: 3040000, by: "HR", reason: "Initial allocation" },
// ];

// const INITIAL_ORG_AUDIT = [
//   { date: "2026-09-01", from: null, to: 8, before: null, after: 6440000, by: "HR", reason: "Initial allocation" },
// ];

// function money(value) {
//   return "₹ " + ((Number(value) || 0) / 100000).toFixed(2) + " L";
// }

// function percent(value) {
//   return Number(value || 0).toFixed(1) + "%";
// }

// function dateText(value) {
//   if (!value) return "—";
//   const p = String(value).split("-");
//   if (p.length !== 3) return value;
//   return p[2] + "-" + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(p[1]) - 1];
// }

// function Panel({ title, count, open, onToggle, children }) {
//   return (
//     <section className="overflow-hidden rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(18,48,79,.06)]" style={{ borderColor: BORDER }}>
//       <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px] font-semibold tracking-[.15px] text-white" style={{ background: NAVY }}>
//         <span>{title}{count ? <span className="ml-2 font-normal text-[#d6e4f5]">{count}</span> : null}</span>
//         <span className="text-[12px]">{open ? "▾" : "▸"}</span>
//       </button>
//       {open ? children : null}
//     </section>
//   );
// }

// function AuditTable({ rows, showOwner = true }) {
//   return (
//     <div className="w-full overflow-x-auto">
//       <table className="w-full min-w-[850px] border-collapse text-[12px]">
//         <thead>
//           <tr>
//             {["Date", ...(showOwner ? ["Owner"] : []), "Old %", "New %", "Budget before", "Budget after", "Changed by", "Reason"].map((h) => (
//               <th key={h} className="border-b border-[#d7dce3] px-2 py-1.5 text-left text-[11px] font-bold text-[#1e3a5f]">{h}</th>
//             ))}
//           </tr>
//         </thead>
//         <tbody>
//           {rows.length ? rows.map((r, i) => (
//             <tr key={i}>
//               <td className="border-b border-[#edf0f4] px-2 py-1.5">{dateText(r.date)}</td>
//               {showOwner ? <td className="border-b border-[#edf0f4] px-2 py-1.5 font-bold">{r.owner}</td> : null}
//               <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right">{r.from == null ? "—" : percent(r.from)}</td>
//               <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right font-bold">{percent(r.to)}</td>
//               <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right">{r.before == null ? "—" : money(r.before)}</td>
//               <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right">{money(r.after)}</td>
//               <td className="border-b border-[#edf0f4] px-2 py-1.5">{r.by}</td>
//               <td className="border-b border-[#edf0f4] px-2 py-1.5">{r.reason || "—"}</td>
//             </tr>
//           )) : (
//             <tr><td colSpan={showOwner ? 8 : 7} className="px-3 py-4 text-slate-500">No changes in this date range.</td></tr>
//           )}
//         </tbody>
//       </table>
//     </div>
//   );
// }

// function CycleBar({ role }) {
//   return (
//     <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-l-4 bg-white px-3.5 py-2 text-[12.5px] text-[#334155]" style={{ borderColor: BORDER, borderLeftColor: TEAL }}>
//       <span>Appraisal cycle <b>Apr-26</b></span>
//       <span className="h-5 w-px bg-[#d7dce3]" />
//       <span>Allocated <b>01-Sep-26</b> by <b>HR</b></span>
//       <span className="h-5 w-px bg-[#d7dce3]" />
//       <span><b>{role}</b></span>
//     </div>
//   );
// }

// function HRApplyBudget() {
//   const [rows, setRows] = useState(TECH_ED_DATA);
//   const [orgPct, setOrgPct] = useState("8");
//   const [pending, setPending] = useState({});
//   const [reason, setReason] = useState("");
//   const [error, setError] = useState("");
//   const [history, setHistory] = useState({});
//   const [audit, setAudit] = useState(INITIAL_AUDIT);
//   const [orgAudit, setOrgAudit] = useState(INITIAL_ORG_AUDIT);
//   const [overrides, setOverrides] = useState({});

//   const total = useMemo(() => rows.reduce((s, r) => ({
//     base: s.base + r.base,
//     original: s.original + r.original,
//     updated: s.updated + r.updated,
//     team0: s.team0 + r.team0,
//     team: s.team + r.team,
//   }), { base: 0, original: 0, updated: 0, team0: 0, team: 0 }), [rows]);

//   const previewPct = (row) => Object.prototype.hasOwnProperty.call(pending, row.name)
//     ? Number(pending[row.name])
//     : overrides[row.name] ? row.pct : Number(orgPct);

//   const previewBudget = (row) => row.base * previewPct(row) / 100;
//   const changes = rows.filter((r) => Number(previewPct(r)) !== r.pct);
//   const orgPending = Number(orgPct) !== 8;
//   const pendingCount = changes.length || orgPending ? changes.length + (orgPending ? 1 : 0) : 0;
//   const previewTotal = rows.reduce((s, r) => s + previewBudget(r), 0);

//   function setRowPct(name, value) {
//     setPending((p) => ({ ...p, [name]: value }));
//   }

//   function resetRow(name) {
//     const value = orgPct;
//     const row = rows.find((r) => r.name === name);
//     if (Number(value) === row?.pct) {
//       setPending((p) => { const n = { ...p }; delete n[name]; return n; });
//       setOverrides((o) => { const n = { ...o }; delete n[name]; return n; });
//     } else {
//       setPending((p) => ({ ...p, [name]: value }));
//     }
//   }

//   function discard() {
//     setPending({});
//     setReason("");
//     setError("");
//   }

//   function apply() {
//     const org = Number(orgPct);
//     if (!(org >= 0 && org <= 100)) {
//       setError("Enter a valid org % between 0 and 100.");
//       return;
//     }

//     const invalid = rows.find((r) => {
//       const value = previewPct(r);
//       return !(value >= 0 && value <= 100);
//     });
//     if (invalid) {
//       setError("Not applied. " + invalid.name + ": enter a valid % between 0 and 100.");
//       return;
//     }

//     const now = new Date().toISOString().slice(0, 10);
//     const changedRows = rows.filter((r) => Number(previewPct(r)) !== r.pct);
//     const next = rows.map((r) => {
//       const to = Number(previewPct(r));
//       return to === r.pct ? r : { ...r, pct: to, updated: r.base * to / 100, lastChanged: dateText(now) };
//     });

//     const newAudit = changedRows.map((r) => ({
//       date: now,
//       owner: r.name,
//       from: r.pct,
//       to: Number(previewPct(r)),
//       before: r.updated,
//       after: previewBudget(r),
//       by: "HR",
//       reason: reason.trim() || (Number(previewPct(r)) === org ? "Reset to org %" : "Override"),
//     }));

//     if (orgPending) {
//       setOrgAudit((a) => [{
//         date: now,
//         from: 8,
//         to: org,
//         before: total.updated,
//         after: previewTotal,
//         by: "HR",
//         reason: reason.trim() || "Org budget percentage change",
//       }, ...a]);
//     }

//     setRows(next);
//     setAudit((a) => [...newAudit, ...a]);
//     setPending({});
//     setOverrides((o) => {
//       const nextOverrides = { ...o };
//       next.forEach((r) => {
//         if (r.pct === org) delete nextOverrides[r.name];
//         else nextOverrides[r.name] = true;
//       });
//       return nextOverrides;
//     });
//     setReason("");
//     setError("");
//   }

//   return (
//     <div className="flex flex-col gap-2">
//       <CycleBar role="HR" />

//       {error ? (
//         <div className="flex justify-between gap-2 rounded-md border border-[#e3e8ef] border-l-4 border-l-[#c2410c] bg-white px-3 py-2 text-[12px] text-[#7c2d12]">
//           <span>{error}</span>
//           <button type="button" className="font-bold" onClick={() => setError("")}>Dismiss</button>
//         </div>
//       ) : null}

//       <section className={"overflow-hidden rounded-[10px] border bg-white " + (orgPending ? "bg-[#fdf8e7]" : "")} style={{ borderColor: BORDER }}>
//         <div className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white" style={{ background: NAVY }}>Org Budget %</div>
//         <div className="overflow-x-auto">
//           <div className="grid min-w-[900px] grid-cols-[minmax(210px,1.25fr)_minmax(170px,1fr)_minmax(170px,1fr)_minmax(170px,1fr)_minmax(140px,.8fr)]">
//           <div className="min-w-0 border-r border-[#d7dce3] px-[18px] py-3">
//             <div className="text-[11px] font-medium text-[#5b6b80]">Org % (default for all Tech EDs)</div>
//             <input type="number" min="0" max="100" step="0.1" value={orgPct} onChange={(e) => setOrgPct(e.target.value)} className="mt-1 h-[38px] w-[110px] rounded border border-[#14a3a3] px-2 text-right text-[18px] font-bold text-[#12304f] outline-none" />
//             {orgPending ? <div className="text-[11px] text-slate-500">was 8%</div> : null}
//           </div>
//           <div className="min-w-0 border-r border-[#d7dce3] px-[18px] py-3"><div className="text-[11px] text-[#5b6b80]">Org budget base</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{money(total.base)}</div></div>
//           <div className="min-w-0 border-r border-[#d7dce3] px-[18px] py-3"><div className="text-[11px] text-[#5b6b80]">Original budget</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{money(total.original)}</div></div>
//           <div className="min-w-0 border-r border-[#d7dce3] px-[18px] py-3"><div className="text-[11px] text-[#5b6b80]">Updated budget</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{money(orgPending || changes.length ? previewTotal : total.updated)}</div></div>
//           <div className="min-w-0 px-[18px] py-3"><div className="text-[11px] text-[#5b6b80]">Team count</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{total.team0} → {total.team}</div></div>
//           </div>
//         </div>
//         <div className="px-4 pb-3 text-[11.5px] text-slate-500">Changing the org % updates every Tech ED on the org default. Tech EDs with an override keep their own %.</div>
//       </section>

//       <section className="overflow-hidden rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(18,48,79,.06)]" style={{ borderColor: BORDER }}>
//         <div className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white" style={{ background: NAVY }}>Tech EDs — {rows.length}</div>
//         <div className="max-h-[58vh] overflow-auto">
//           <div className="min-w-[1180px]">
//             <div className="grid grid-cols-[minmax(190px,1.35fr)_minmax(120px,.9fr)_minmax(110px,.8fr)_minmax(190px,1.25fr)_minmax(125px,.9fr)_minmax(135px,.95fr)_minmax(135px,.95fr)_minmax(105px,.75fr)_minmax(105px,.75fr)_minmax(125px,.9fr)] text-[12.5px]">
//               {["Tech ED","Budget base","% applied","Source","Budget","Original Budget","Updated Budget","Original Count","Current Count","Last Changed"].map((h,i)=><div key={h} className={"border-b-2 border-[#9fb3cf] bg-[#e8eef5] px-2.5 py-2 text-[12px] font-semibold text-[#12304f] "+(i>=1&&i<9?"text-right":"text-left")}>{h}</div>)}
//               {rows.map((r)=>{
//                 const p=previewPct(r), changing=Number(p)!==r.pct, open=!!history[r.name];
//                 const sourceOverride=overrides[r.name]||(Object.prototype.hasOwnProperty.call(pending,r.name)&&Number(p)!==Number(orgPct));
//                 const cell="border-b border-[#e1e5eb] px-2.5 py-2 "+(changing?"bg-[#fdf8e7]":"bg-white");
//                 return <div key={r.name} className="contents">
//                   <div className={cell+" font-bold"}>{r.name}</div>
//                   <div className={cell+" text-right"}>{money(r.base)}</div>
//                   <div className={cell+" text-right align-top"}><input type="number" min="0" max="100" step="0.1" value={p} onChange={(e)=>setRowPct(r.name,e.target.value)} className="h-8 w-[84px] rounded border border-[#14a3a3] bg-white px-2 text-right text-[14px] font-bold text-[#12304f]" />{changing?<div className="whitespace-nowrap text-[11px] text-slate-500">was {r.pct}%</div>:null}</div>
//                   <div className={cell}>{sourceOverride?<div className="flex flex-wrap items-center gap-1"><span className="whitespace-nowrap rounded-full bg-[#fff4d6] px-2 py-0.5 text-[11px] font-bold text-[#8a5a00]">Override</span><button type="button" className="whitespace-nowrap text-[11.5px] font-bold text-[#1859a8]" onClick={()=>resetRow(r.name)}>Reset to org %</button></div>:<span className="whitespace-nowrap rounded-full bg-[#e6f4f4] px-2 py-0.5 text-[11px] font-bold text-[#0f6d6d]">Org default</span>}</div>
//                   <div className={cell+" text-right font-bold text-[#17365d]"}>{money(r.base*p/100)}</div>
//                   <div className={cell+" text-right"}>{money(r.original)}</div>
//                   <div className={cell+" text-right"}>{money(r.updated)}</div>
//                   <div className={cell+" text-right"}>{r.team0}</div>
//                   <div className={cell+" text-right"}>{r.team}</div>
//                   <div className={cell}>{open||r.lastChanged!=="01-Sep-26"?<button type="button" className="whitespace-nowrap rounded border border-[#c5d0dd] bg-white px-2 py-1 text-[12px] font-bold text-[#17365d]" onClick={()=>setHistory((x)=>({...x,[r.name]:!x[r.name]}))}>{r.lastChanged} {open?"▴":"▾"}</button>:<span className="text-[#94a3b8]">—</span>}</div>
//                   {open?<div className="col-span-10 border-b border-[#d7dce3] bg-[#f7f9fc] px-10 py-3"><AuditTable rows={audit.filter((a)=>a.owner===r.name)} /></div>:null}
//                 </div>;
//               })}
//             </div>
//           </div>
//         </div>
//         <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-[#d4dbe5] bg-white px-3.5 py-2.5">
//           <span className={pendingCount ? "font-bold text-[#c2410c]" : "text-slate-500"}>{pendingCount ? pendingCount + " change" + (pendingCount === 1 ? "" : "s") + " pending" : "No pending changes"}</span>
//           <input value={reason} onChange={(e) => setReason(e.target.value)} disabled={!pendingCount} placeholder="Reason (saved in the audit trail)" className="h-[30px] min-w-[200px] max-w-[460px] flex-1 rounded border border-[#cbd3df] px-2 text-[12.5px]" />
//           <button type="button" disabled={!pendingCount} onClick={discard} className="rounded-md border border-[#c5d0dd] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#12304f] disabled:opacity-40">Discard</button>
//           <button type="button" disabled={!pendingCount} onClick={apply} className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: TEAL }}>Apply</button>
//         </div>
//       </section>
//     </div>
//   );
// }

// function HRAuditTrail() {
//   const [from, setFrom] = useState("");
//   const [to, setTo] = useState("");
//   const [filter, setFilter] = useState("all");
//   const [audit] = useState(INITIAL_AUDIT);
//   const [orgAudit] = useState(INITIAL_ORG_AUDIT);

//   const orgRows = orgAudit.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
//   const tedRows = audit.filter((r) => (!from || r.date >= from) && (!to || r.date <= to) && (filter === "all" || r.owner === filter));

//   return (
//     <div className="flex flex-col gap-2">
//       <div className="rounded-[10px] border bg-white" style={{ borderColor: BORDER }}>
//         <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-[12px] text-slate-600">
//           <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 h-7 max-w-[150px] rounded border border-[#cbd3df] px-2" /></label>
//           <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 h-7 max-w-[150px] rounded border border-[#cbd3df] px-2" /></label>
//           <span className="ml-auto text-[11px]">Audit lines can't be edited or deleted</span>
//         </div>
//       </div>
//       <section className="overflow-hidden rounded-[10px] border bg-white" style={{ borderColor: BORDER }}>
//         <div className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white" style={{ background: NAVY }}>Org % — audit trail</div>
//         <div className="p-3.5"><AuditTable rows={orgRows} showOwner={false} /></div>
//       </section>
//       <section className="overflow-hidden rounded-[10px] border bg-white" style={{ borderColor: BORDER }}>
//         <div className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white" style={{ background: NAVY }}>Tech ED % — audit trail</div>
//         <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-3.5 py-2 text-[12px]">
//           <label>Tech ED
//             <select value={filter} onChange={(e) => setFilter(e.target.value)} className="ml-2 h-7 rounded border border-[#cbd3df] px-2">
//               <option value="all">All</option>
//               {TECH_ED_DATA.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
//             </select>
//           </label>
//         </div>
//         <div className="p-3.5"><AuditTable rows={tedRows} /></div>
//       </section>
//     </div>
//   );
// }

// export function BudgetAllocationPage() {
//   const user = useCatalystUser();
//   const role = String(user?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
//   const isHR = role === "hr" || role === "humanresources" || role === "hroperation";
//   const [tab, setTab] = useState("apply");

//   return (
//     <div className="w-full" style={{ fontFamily: '"IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif', fontVariantNumeric: "tabular-nums", color: "#0f1f33" }}>
//       {isHR ? (
//         <>
//           <div className="mb-2 flex gap-2">
//             <button type="button" onClick={() => setTab("apply")} className={"rounded-2xl border px-4 py-1.5 text-[12px] font-medium " + (tab === "apply" ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white" : "bg-white text-[#334155]")}>2 · Apply Budget</button>
//             <button type="button" onClick={() => setTab("audit")} className={"rounded-2xl border px-4 py-1.5 text-[12px] font-medium " + (tab === "audit" ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white" : "bg-white text-[#334155]")}>3 · Audit Trail</button>
//           </div>
//           {tab === "apply" ? <HRApplyBudget /> : <HRAuditTrail />}
//         </>
//       ) : <TechEdBudgetAllocationPage />}
//     </div>
//   );
// }

// export function TechEdBudgetAllocationPage() {
//   const user = useCatalystUser();
//   const rawName = String(user?.name || user?.email || "Tech ED").trim();
//   const data = TECH_ED_DATA.find((r) => rawName.includes(r.name)) || TECH_ED_DATA[0];

//   const [pctValue, setPctValue] = useState(String(data.pct));
//   const [savedPct, setSavedPct] = useState(data.pct);
//   const [reason, setReason] = useState("");
//   const [mineOpen, setMineOpen] = useState(true);
//   const [allocOpen, setAllocOpen] = useState(true);
//   const [auditOpen, setAuditOpen] = useState(true);
//   const [historyOpen, setHistoryOpen] = useState(false);
//   const [audit, setAudit] = useState(() => INITIAL_AUDIT.filter((a) => a.owner === data.name));

//   const updatedBudget = data.base * Number(pctValue || 0) / 100;
//   const buffer = updatedBudget - data.allotted;
//   const isChanged = Number(pctValue) !== savedPct;

//   function savePct() {
//     const next = Number(pctValue);
//     if (!(next >= 0 && next <= 100) || next === savedPct) return;
//     const now = new Date().toISOString().slice(0, 10);
//     setAudit((a) => [{
//       date: now,
//       owner: data.name,
//       from: savedPct,
//       to: next,
//       before: data.base * savedPct / 100,
//       after: updatedBudget,
//       by: data.parent,
//       reason: reason.trim() || "Budget percentage change",
//     }, ...a]);
//     setSavedPct(next);
//     setReason("");
//   }

//   const utilisation=0;
//   const utilisationPct=updatedBudget?(utilisation/updatedBudget)*100:0;
//   const remaining=Math.max(updatedBudget-utilisation,0);
//   const change=updatedBudget-data.original;

//   return (
//     <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-2">
//       <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-l-4 bg-white px-3.5 py-2 text-[12.5px] text-[#334155]" style={{borderColor:BORDER,borderLeftColor:TEAL}}>
//         <span>Appraisal cycle <b>Apr-26</b></span><span className="h-5 w-px bg-[#d7dce3]"/>
//         <span>Allocated <b>01-Sep-26</b> by <b>HR</b></span><span className="h-5 w-px bg-[#d7dce3]"/>
//         <span><b>Tech ED</b></span><span className="h-5 w-px bg-[#d7dce3]"/>
//         <span className="font-semibold text-[#12304f]">Budget applied by HR: <b>{percent(pctValue)}</b> = <b>{money(updatedBudget)}</b> updated · original {money(data.original)}
//           <button type="button" onClick={()=>setHistoryOpen(v=>!v)} className="ml-2 whitespace-nowrap rounded border border-[#c5d0dd] bg-white px-2 py-1 text-[11px] font-bold text-[#12304f]">% history {historyOpen?"▴":"▾"}</button>
//         </span>
//       </div>
//       {historyOpen?<div className="rounded-[10px] border bg-[#f7f9fc] p-2" style={{borderColor:BORDER}}><AuditTable rows={audit} showOwner={false}/></div>:null}

//       <Panel title="My Budget" open={mineOpen} onToggle={()=>setMineOpen(v=>!v)}>
//         <div className="grid grid-cols-2 divide-x divide-[#d7dce3] sm:grid-cols-5">
//           {[["Original allotted",money(data.original)],["Updated budget",money(updatedBudget)],["Team size",data.team],["Allotted to reports",money(data.allotted)],["Buffer",money(buffer)]].map(([label,value])=>
//             <div key={label} className="px-4 py-3"><div className="text-[11px] font-medium text-[#5b6b80]">{label}</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{value}</div></div>
//           )}
//         </div>
//         <div className="border-t border-[#d7dce3] px-4 py-3">
//           <div className="flex flex-wrap items-end justify-between gap-4">
//             <div><div className="text-[11px] font-medium text-[#5b6b80]">Utilised</div><div className="mt-1 text-[18px] font-semibold text-[#12304f]">{money(utilisation)} <span className="text-[12px] font-normal text-slate-500">({utilisationPct.toFixed(1)}%)</span></div><div className="mt-1 h-2 w-full min-w-[220px] overflow-hidden rounded bg-[#e6ebf2]"><span className="block h-full" style={{width:Math.min(utilisationPct,100)+"%",background:"linear-gradient(90deg,#14a3a3,#1b6fb5)"}}/></div></div>
//             <div className="text-[12px] text-slate-500">Utilised = Hike Amount · Remaining {money(remaining)}</div>
//           </div>
//         </div>
//       </Panel>

//       <Panel title="Allocation" count={data.team+" employees"} open={allocOpen} onToggle={()=>setAllocOpen(v=>!v)}>
//         <div className="overflow-x-auto">
//           <div className="min-w-[980px]">
//             <div className="grid grid-cols-[minmax(85px,.65fr)_minmax(190px,1.35fr)_minmax(135px,1fr)_minmax(135px,1fr)_minmax(120px,.9fr)_minmax(100px,.75fr)_minmax(100px,.75fr)_minmax(120px,.85fr)_minmax(105px,.75fr)] text-[12.5px]">
//               {["Level","Owner","Original Budget","Updated Budget","Change","Original Count","Current Count","Last Changed","Allot %"].map((h,i)=><div key={h} className={"border-b-2 border-[#9fb3cf] bg-[#e8eef5] px-2.5 py-2 text-[12px] font-semibold text-[#12304f] "+(i>=2?"text-right":"text-left")}>{h}</div>)}
//               {[
//                 ["Tech ED",data.name,money(data.original),money(updatedBudget),money(change),data.team0,data.team,isChanged?"Today":"01-Sep-26",null]
//               ].map((row)=><div key={row[1]} className="contents">
//                 <div className="border-b border-[#e1e5eb] bg-white px-2.5 py-2 font-bold">{row[0]}</div>
//                 <div className="border-b border-[#e1e5eb] bg-white px-2.5 py-2 font-bold">{row[1]}</div>
//                 <div className="border-b border-[#e1e5eb] bg-white px-2.5 py-2 text-right">{row[2]}</div>
//                 <div className="border-b border-[#e1e5eb] bg-white px-2.5 py-2 text-right font-bold text-[#12304f]">{row[3]}</div>
//                 <div className="border-b border-[#e1e5eb] bg-white px-2.5 py-2 text-right">{row[4]}</div>
//                 <div className="border-b border-[#e1e5eb] bg-white px-2.5 py-2 text-right">{row[5]}</div>
//                 <div className="border-b border-[#e1e5eb] bg-white px-2.5 py-2 text-right">{row[6]}</div>
//                 <div className="border-b border-[#e1e5eb] bg-white px-2.5 py-2 whitespace-nowrap">{row[7]}</div>
//                 <div className="border-b border-[#e1e5eb] bg-white px-2.5 py-2 text-right"><input type="number" min="0" max="100" step="0.1" value={pctValue} onChange={e=>setPctValue(e.target.value)} onBlur={savePct} className="h-[32px] w-[84px] rounded border border-[#14a3a3] bg-white px-2 text-right text-[14px] font-bold text-[#12304f]"/></div>
//               </div>)}
//             </div>
//           </div>
//         </div>
//       </Panel>

//       {auditOpen?<Panel title="% Applied — Audit Trail" open={auditOpen} onToggle={()=>setAuditOpen(v=>!v)}><div className="p-3.5"><AuditTable rows={audit}/></div></Panel>:null}
//     </div>
//   );
// }
import { useMemo, useState } from "react";
import { useCatalystUser } from "@/lib/catalyst-auth";

const NAVY = "#12304f";
const TEAL = "#14a3a3";
const BORDER = "#d3dbe6";
const ALLOC_DATE = "2026-09-01";

/* Sample data. Replace with the budgetmaster API response when it is wired. */
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

/* Comp Managers under each Tech ED. Tech ED sets pct; pct0 is the % at allocation. */
const COMP_MANAGERS = [
  {
    name: "Anita Sharma",
    parent: "Prabhu Prasad Parida",
    pct0: 7.5,
    pct: 7.5,
    base: 25000000,
    team0: 28,
    team: 28,
    utilised: 1240000,
  },
  {
    name: "Raj Mehta",
    parent: "Prabhu Prasad Parida",
    pct0: 6.5,
    pct: 6.5,
    base: 17500000,
    team0: 20,
    team: 20,
    utilised: 610000,
  },
  {
    name: "Meera Nair",
    parent: "Ashok Kumar",
    pct0: 7.5,
    pct: 7.5,
    base: 22000000,
    team0: 24,
    team: 24,
    utilised: 880000,
  },
  {
    name: "Suresh Iyer",
    parent: "Ashok Kumar",
    pct0: 7,
    pct: 7,
    base: 16000000,
    team0: 18,
    team: 18,
    utilised: 420000,
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

const INITIAL_ORG_AUDIT = [
  {
    date: "2026-09-01",
    from: null,
    to: 8,
    before: null,
    after: 6440000,
    by: "HR",
    reason: "Initial allocation",
  },
];

/* ---------- helpers ---------- */
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
  return (
    p[2] +
    "-" +
    [
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
    ][Number(p[1]) - 1]
  );
}

function Panel({ title, count, open, onToggle, children }) {
  return (
    <section
      className="overflow-hidden rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(18,48,79,.06)]"
      style={{ borderColor: BORDER }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px] font-semibold tracking-[.15px] text-white"
        style={{ background: NAVY }}
      >
        <span>
          {title}
          {count ? (
            <span className="ml-2 font-normal text-[#d6e4f5]">{count}</span>
          ) : null}
        </span>
        <span className="text-[12px]">{open ? "▾" : "▸"}</span>
      </button>
      {open ? children : null}
    </section>
  );
}

/* Audit table: header alignment matches value alignment (numbers right, text left). */
const AUDIT_COLS = [
  ["Date", false],
  ["Owner", false],
  ["Old %", true],
  ["New %", true],
  ["Budget before", true],
  ["Budget after", true],
  ["Changed by", false],
  ["Reason", false],
];

function AuditTable({ rows, showOwner = true }) {
  const cols = AUDIT_COLS.filter(([h]) => showOwner || h !== "Owner");
  const td = "border-b border-[#edf0f4] px-2 py-1.5 ";
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse text-[12px] tabular-nums">
        <thead>
          <tr>
            {cols.map(([h, right]) => (
              <th
                key={h}
                className={
                  "border-b border-[#d7dce3] px-2 py-1.5 text-[11px] font-bold text-[#1e3a5f] " +
                  (right ? "text-right" : "text-left")
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                <td className={td + "whitespace-nowrap"}>
                  {dateText(r.date)}
                  {r.time ? " " + r.time : ""}
                </td>
                {showOwner ? (
                  <td className={td + "font-bold"}>{r.owner}</td>
                ) : null}
                <td className={td + "text-right"}>
                  {r.from == null ? "—" : percent(r.from)}
                </td>
                <td className={td + "text-right font-bold"}>{percent(r.to)}</td>
                <td className={td + "text-right"}>
                  {r.before == null ? "—" : money(r.before)}
                </td>
                <td className={td + "text-right"}>{money(r.after)}</td>
                <td className={td}>{r.by}</td>
                <td className={td}>{r.reason || "—"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={cols.length} className="px-3 py-4 text-slate-500">
                No changes in this date range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CycleBar({ role }) {
  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-[10px] border border-l-4 bg-white px-3.5 py-2 text-[12.5px] text-[#334155]"
      style={{ borderColor: BORDER, borderLeftColor: TEAL }}
    >
      <span>
        Appraisal cycle <b>Apr-26</b>
      </span>
      <span className="h-5 w-px bg-[#d7dce3]" />
      <span>
        Allocated <b>01-Sep-26</b> by <b>HR</b>
      </span>
      <span className="h-5 w-px bg-[#d7dce3]" />
      <span>
        <b>{role}</b>
      </span>
    </div>
  );
}

/* =====================================================================
   HR LOGIN
   ===================================================================== */
const HR_COLS = [
  ["Tech ED", false],
  ["Budget base", true],
  ["% applied", true],
  ["Source", false],
  ["Budget", true],
  ["Original Budget", true],
  ["Updated Budget", true],
  ["Original Count", true],
  ["Current Count", true],
  ["Last Changed", false],
];

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

  const total = useMemo(
    () =>
      rows.reduce(
        (s, r) => ({
          base: s.base + r.base,
          original: s.original + r.original,
          updated: s.updated + r.updated,
          team0: s.team0 + r.team0,
          team: s.team + r.team,
        }),
        { base: 0, original: 0, updated: 0, team0: 0, team: 0 },
      ),
    [rows],
  );

  const previewPct = (row) =>
    Object.prototype.hasOwnProperty.call(pending, row.name)
      ? Number(pending[row.name])
      : overrides[row.name]
        ? row.pct
        : Number(orgPct);

  const previewBudget = (row) => (row.base * previewPct(row)) / 100;
  const changes = rows.filter((r) => Number(previewPct(r)) !== r.pct);
  const orgPending = Number(orgPct) !== 8;
  const pendingCount =
    changes.length || orgPending ? changes.length + (orgPending ? 1 : 0) : 0;
  const previewTotal = rows.reduce((s, r) => s + previewBudget(r), 0);

  function setRowPct(name, value) {
    setPending((p) => ({ ...p, [name]: value }));
  }

  function resetRow(name) {
    const value = orgPct;
    const row = rows.find((r) => r.name === name);
    if (Number(value) === row?.pct) {
      setPending((p) => {
        const n = { ...p };
        delete n[name];
        return n;
      });
      setOverrides((o) => {
        const n = { ...o };
        delete n[name];
        return n;
      });
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
      setError(
        "Not applied. " + invalid.name + ": enter a valid % between 0 and 100.",
      );
      return;
    }

    const now = new Date().toISOString().slice(0, 10);
    const changedRows = rows.filter((r) => Number(previewPct(r)) !== r.pct);
    const next = rows.map((r) => {
      const to = Number(previewPct(r));
      return to === r.pct
        ? r
        : {
            ...r,
            pct: to,
            updated: (r.base * to) / 100,
            lastChanged: dateText(now),
          };
    });

    const newAudit = changedRows.map((r) => ({
      date: now,
      owner: r.name,
      from: r.pct,
      to: Number(previewPct(r)),
      before: r.updated,
      after: previewBudget(r),
      by: "HR",
      reason:
        reason.trim() ||
        (Number(previewPct(r)) === org ? "Reset to org %" : "Override"),
    }));

    if (orgPending) {
      setOrgAudit((a) => [
        {
          date: now,
          from: 8,
          to: org,
          before: total.updated,
          after: previewTotal,
          by: "HR",
          reason: reason.trim() || "Org budget percentage change",
        },
        ...a,
      ]);
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

  const orgCell = "min-w-0 border-r border-[#d7dce3] px-[18px] py-3";

  return (
    <div className="flex flex-col gap-2">
      <CycleBar role="HR" />

      {error ? (
        <div className="flex justify-between gap-2 rounded-md border border-[#e3e8ef] border-l-4 border-l-[#c2410c] bg-white px-3 py-2 text-[12px] text-[#7c2d12]">
          <span>{error}</span>
          <button
            type="button"
            className="font-bold"
            onClick={() => setError("")}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section
        className={
          "overflow-hidden rounded-[10px] border bg-white " +
          (orgPending ? "bg-[#fdf8e7]" : "")
        }
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Org Budget %
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[900px] grid-cols-[minmax(210px,1.25fr)_minmax(170px,1fr)_minmax(170px,1fr)_minmax(170px,1fr)_minmax(140px,.8fr)]">
            <div className={orgCell}>
              <div className="text-[11px] font-medium text-[#5b6b80]">
                Org % (default for all Tech EDs)
              </div>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={orgPct}
                onChange={(e) => setOrgPct(e.target.value)}
                className="mt-1 h-[38px] w-[110px] rounded border border-[#14a3a3] px-2 text-right text-[18px] font-bold text-[#12304f] outline-none"
              />
              {orgPending ? (
                <div className="text-[11px] text-slate-500">was 8%</div>
              ) : null}
            </div>
            <div className={orgCell}>
              <div className="text-[11px] text-[#5b6b80]">Org budget base</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {money(total.base)}
              </div>
            </div>
            <div className={orgCell}>
              <div className="text-[11px] text-[#5b6b80]">Original budget</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {money(total.original)}
              </div>
            </div>
            <div className={orgCell}>
              <div className="text-[11px] text-[#5b6b80]">Updated budget</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {money(
                  orgPending || changes.length ? previewTotal : total.updated,
                )}
              </div>
            </div>
            <div className="min-w-0 px-[18px] py-3">
              <div className="text-[11px] text-[#5b6b80]">Team count</div>
              <div className="mt-1 text-[18px] font-semibold text-[#12304f]">
                {total.team0} → {total.team}
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 pb-3 text-[11.5px] text-slate-500">
          Changing the org % updates every Tech ED on the org default. Tech EDs
          with an override keep their own %.
        </div>
      </section>

      <section
        className="overflow-hidden rounded-[10px] border bg-white shadow-[0_1px_2px_rgba(18,48,79,.06)]"
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Tech EDs — {rows.length}
        </div>
        <div className="max-h-[58vh] overflow-auto">
          <table className="w-full min-w-[1180px] border-collapse text-[12.5px] tabular-nums">
            <thead>
              <tr>
                {HR_COLS.map(([h, right]) => (
                  <th
                    key={h}
                    className={
                      "sticky top-0 whitespace-nowrap border-b-2 border-[#9fb3cf] bg-[#e8eef5] px-2.5 py-2 text-[12px] font-semibold text-[#12304f] " +
                      (right ? "text-right" : "text-left")
                    }
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = previewPct(r);
                const changing = Number(p) !== r.pct;
                const open = !!history[r.name];
                const sourceOverride =
                  overrides[r.name] ||
                  (Object.prototype.hasOwnProperty.call(pending, r.name) &&
                    Number(p) !== Number(orgPct));
                const td =
                  "border-b border-[#e1e5eb] px-2.5 py-2 align-middle " +
                  (changing ? "bg-[#fdf8e7] " : "bg-white ");
                return (
                  <FragmentRow key={r.name}>
                    <tr>
                      <td
                        className={td + "whitespace-nowrap text-left font-bold"}
                      >
                        {r.name}
                      </td>
                      <td className={td + "whitespace-nowrap text-right"}>
                        {money(r.base)}
                      </td>
                      <td className={td + "text-right"}>
                        <div className="flex flex-col items-end">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={p}
                            onChange={(e) => setRowPct(r.name, e.target.value)}
                            className="h-8 w-[84px] rounded border border-[#14a3a3] bg-white px-2 text-right text-[14px] font-bold text-[#12304f]"
                          />
                          {changing ? (
                            <div className="whitespace-nowrap text-[11px] text-slate-500">
                              was {r.pct}%
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className={td + "text-left"}>
                        {sourceOverride ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="whitespace-nowrap rounded-full bg-[#fff4d6] px-2 py-0.5 text-[11px] font-bold text-[#8a5a00]">
                              Override
                            </span>
                            <button
                              type="button"
                              className="whitespace-nowrap text-[11.5px] font-bold text-[#1859a8]"
                              onClick={() => resetRow(r.name)}
                            >
                              Reset to org %
                            </button>
                          </div>
                        ) : (
                          <span className="whitespace-nowrap rounded-full bg-[#e6f4f4] px-2 py-0.5 text-[11px] font-bold text-[#0f6d6d]">
                            Org default
                          </span>
                        )}
                      </td>
                      <td
                        className={
                          td +
                          "whitespace-nowrap text-right font-bold text-[#17365d]"
                        }
                      >
                        {money((r.base * p) / 100)}
                      </td>
                      <td className={td + "whitespace-nowrap text-right"}>
                        {money(r.original)}
                      </td>
                      <td className={td + "whitespace-nowrap text-right"}>
                        {money(r.updated)}
                      </td>
                      <td className={td + "text-right"}>{r.team0}</td>
                      <td className={td + "text-right"}>{r.team}</td>
                      <td className={td + "text-left"}>
                        {open || r.lastChanged !== "01-Sep-26" ? (
                          <button
                            type="button"
                            className="whitespace-nowrap rounded border border-[#c5d0dd] bg-white px-2 py-1 text-[12px] font-bold text-[#17365d]"
                            onClick={() =>
                              setHistory((x) => ({
                                ...x,
                                [r.name]: !x[r.name],
                              }))
                            }
                          >
                            {r.lastChanged} {open ? "▴" : "▾"}
                          </button>
                        ) : (
                          <span className="text-[#94a3b8]">—</span>
                        )}
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td
                          colSpan={HR_COLS.length}
                          className="border-b border-[#d7dce3] bg-[#f7f9fc] px-10 py-3"
                        >
                          <AuditTable
                            rows={audit.filter((a) => a.owner === r.name)}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-[#d4dbe5] bg-white px-3.5 py-2.5">
          <span
            className={
              pendingCount ? "font-bold text-[#c2410c]" : "text-slate-500"
            }
          >
            {pendingCount
              ? pendingCount +
                " change" +
                (pendingCount === 1 ? "" : "s") +
                " pending"
              : "No pending changes"}
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={!pendingCount}
            placeholder="Reason (saved in the audit trail)"
            className="h-[30px] min-w-[200px] max-w-[460px] flex-1 rounded border border-[#cbd3df] px-2 text-[12.5px]"
          />
          <button
            type="button"
            disabled={!pendingCount}
            onClick={discard}
            className="rounded-md border border-[#c5d0dd] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#12304f] disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={!pendingCount}
            onClick={apply}
            className="rounded-md px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
            style={{ background: TEAL }}
          >
            Apply
          </button>
        </div>
      </section>
    </div>
  );
}

/* tbody can hold several <tr> per item; a fragment keeps the table valid. */
function FragmentRow({ children }) {
  return <>{children}</>;
}

function HRAuditTrail() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState("all");
  const [audit] = useState(INITIAL_AUDIT);
  const [orgAudit] = useState(INITIAL_ORG_AUDIT);

  const orgRows = orgAudit.filter(
    (r) => (!from || r.date >= from) && (!to || r.date <= to),
  );
  const tedRows = audit.filter(
    (r) =>
      (!from || r.date >= from) &&
      (!to || r.date <= to) &&
      (filter === "all" || r.owner === filter),
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        className="rounded-[10px] border bg-white"
        style={{ borderColor: BORDER }}
      >
        <div className="flex flex-wrap items-center gap-3 px-3.5 py-2 text-[12px] text-slate-600">
          <label>
            From{" "}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="ml-1 h-7 max-w-[150px] rounded border border-[#cbd3df] px-2"
            />
          </label>
          <label>
            To{" "}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="ml-1 h-7 max-w-[150px] rounded border border-[#cbd3df] px-2"
            />
          </label>
          <span className="ml-auto text-[11px]">
            Audit lines can't be edited or deleted
          </span>
        </div>
      </div>
      <section
        className="overflow-hidden rounded-[10px] border bg-white"
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Org % — audit trail
        </div>
        <div className="p-3.5">
          <AuditTable rows={orgRows} showOwner={false} />
        </div>
      </section>
      <section
        className="overflow-hidden rounded-[10px] border bg-white"
        style={{ borderColor: BORDER }}
      >
        <div
          className="px-3 py-1.5 text-left text-[12.5px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Tech ED % — audit trail
        </div>
        <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-3.5 py-2 text-[12px]">
          <label>
            Tech ED
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="ml-2 h-7 rounded border border-[#cbd3df] px-2"
            >
              <option value="all">All</option>
              {TECH_ED_DATA.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="p-3.5">
          <AuditTable rows={tedRows} />
        </div>
      </section>
    </div>
  );
}

/* =====================================================================
   PAGE SWITCH
   ===================================================================== */
export function BudgetAllocationPage() {
  const user = useCatalystUser();
  const role = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isHR =
    role === "hr" || role === "humanresources" || role === "hroperation";
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
            <button
              type="button"
              onClick={() => setTab("apply")}
              className={
                "rounded-2xl border px-4 py-1.5 text-[12px] font-medium " +
                (tab === "apply"
                  ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white"
                  : "bg-white text-[#334155]")
              }
            >
              2 · Apply Budget
            </button>
            <button
              type="button"
              onClick={() => setTab("audit")}
              className={
                "rounded-2xl border px-4 py-1.5 text-[12px] font-medium " +
                (tab === "audit"
                  ? "border-[#14a3a3] bg-[#14a3a3] font-semibold text-white"
                  : "bg-white text-[#334155]")
              }
            >
              3 · Audit Trail
            </button>
          </div>
          {tab === "apply" ? <HRApplyBudget /> : <HRAuditTrail />}
        </>
      ) : (
        <TechEdBudgetAllocationPage />
      )}
    </div>
  );
}

/* =====================================================================
   TECH ED LOGIN — mirrors the HTML reference (manager budget view)
   ===================================================================== */
function Chg({ d, base }) {
  if (Math.abs(d) < 1) return <span className="text-slate-500">—</span>;
  const up = d > 0;
  const p = base ? (d / base) * 100 : null;
  return (
    <span className={up ? "text-[#15803d]" : "text-[#c2410c]"}>
      {up ? "▲ " : "▼ "}
      {money(Math.abs(d))}
      {p !== null ? " (" + (up ? "+" : "") + p.toFixed(1) + "%)" : ""}
    </span>
  );
}

function asOf(hist, date) {
  let r = null;
  hist.forEach((x) => {
    if (x.date <= date) r = x;
  });
  return r || hist[0];
}

/* One line per date for an owner: allocated, updated, team size. */
function ownHistory(owner, original, team, audit) {
  const out = [
    { date: ALLOC_DATE, allocated: original, updated: original, team },
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

function Trail({ rows, roll, ownerLabel }) {
  const th =
    "border-b border-[#d7dce3] px-2 py-1 text-[11px] font-bold text-[#1e3a5f] ";
  const td = "border-b border-[#edf0f4] px-2 py-1 ";
  return (
    <table
      className="border-collapse text-[12px] tabular-nums"
      style={{ width: "100%", maxWidth: roll ? 820 : 560 }}
    >
      <thead>
        <tr>
          <th className={th + "text-left"}>Date</th>
          <th className={th + "text-right"}>Allocated</th>
          <th className={th + "text-right"}>Updated</th>
          <th className={th + "text-right"}>Team size</th>
          {roll ? (
            <th className={th + "text-right"}>Allotted to {ownerLabel}s</th>
          ) : null}
          {roll ? <th className={th + "text-right"}>Buffer</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.date}>
            <td className={td}>{dateText(x.date)}</td>
            <td className={td + "text-right"}>{money(x.allocated)}</td>
            <td className={td + "text-right"}>{money(x.updated)}</td>
            <td className={td + "text-right"}>{x.team}</td>
            {roll ? (
              <td className={td + "text-right"}>{money(x.allotted)}</td>
            ) : null}
            {roll ? (
              <td className={td + "text-right"}>{money(x.buffer)}</td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const ALLOC_COLS = [
  ["Level", false],
  ["Owner", false],
  ["Original Budget", true],
  ["Updated Budget", true],
  ["Change", true],
  ["Original Count", true],
  ["Current Count", true],
  ["Last Changed", false],
  ["Allot %", true],
];

export function TechEdBudgetAllocationPage() {
  const user = useCatalystUser();
  const rawName = String(user?.name || user?.email || "Tech ED").trim();
  const me =
    TECH_ED_DATA.find((r) => rawName.includes(r.name)) || TECH_ED_DATA[0];
  const kids0 = COMP_MANAGERS.filter((c) => c.parent === me.name);

  const [reports, setReports] = useState(kids0);
  const [audit, setAudit] = useState(() => [
    ...INITIAL_AUDIT.filter((a) => a.owner === me.name).map((a) => ({
      ...a,
      initial: true,
    })),
    ...kids0.map((c) => ({
      date: ALLOC_DATE,
      owner: c.name,
      from: null,
      to: c.pct0,
      before: null,
      after: (c.base * c.pct0) / 100,
      by: me.name,
      reason: "Initial allocation",
      initial: true,
    })),
  ]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const [pane, setPane] = useState({ mine: true, alloc: true, audit: true });
  const [appliedOpen, setAppliedOpen] = useState(false);
  const [trail, setTrail] = useState({});
  const [filter, setFilter] = useState("all");

  const kids = reports.map((r) => ({
    ...r,
    original: (r.base * r.pct0) / 100,
    updated: (r.base * r.pct) / 100,
  }));
  const allotted = kids.reduce((s, r) => s + r.updated, 0);
  const buffer = me.updated - allotted;
  const used = kids.reduce((s, r) => s + r.utilised, 0);
  const usedPct = me.updated ? (used / me.updated) * 100 : 0;
  const over = usedPct > 100;

  const sorted = [...audit].sort((a, b) =>
    (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")),
  );
  const kidHist = Object.fromEntries(
    kids.map((k) => [k.name, ownHistory(k.name, k.original, k.team0, audit)]),
  );
  const ownH = ownHistory(me.name, me.original, me.team, audit);
  const dates = [
    ...new Set([
      ...ownH.map((x) => x.date),
      ...Object.values(kidHist)
        .flat()
        .map((x) => x.date),
    ]),
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
    setReason("");
    setError("");
  }

  const togglePane = (k) => setPane((p) => ({ ...p, [k]: !p[k] }));
  const td = (self) =>
    "border-b border-[#e1e5eb] px-2.5 py-2 align-middle " +
    (self ? "bg-[#e9f4f4] " : "bg-white ");

  function LastChanged({ name, hist }) {
    if (hist.length < 2) return <span className="text-[#94a3b8]">—</span>;
    const open = !!trail[name];
    return (
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setTrail((t) => ({ ...t, [name]: !t[name] }))}
        className={
          "whitespace-nowrap rounded border px-2 py-1 text-[12px] font-bold " +
          (open
            ? "border-[#12304f] bg-[#12304f] text-white"
            : "border-[#c5d0dd] bg-white text-[#12304f]")
        }
      >
        {dateText(hist[hist.length - 1].date)} {open ? "▴" : "▾"}
      </button>
    );
  }

  const summary = [
    [
      "Original allotted",
      money(me.original),
      <span className="text-slate-500">Fixed at allocation</span>,
    ],
    ["Updated budget", money(me.updated), <Chg d={me.updated - me.original} />],
    [
      "Team size",
      me.team0 + " → " + me.team,
      <span className="text-slate-500">At allocation → now</span>,
    ],
    ["Allotted to reports", money(allotted), null],
    [
      "Buffer",
      money(buffer),
      <span className="text-slate-500">Not passed down</span>,
    ],
  ];

  const names = [me.name, ...kids.map((k) => k.name)];
  const auditRows =
    filter === "all"
      ? sorted.filter((a) => names.includes(a.owner))
      : sorted.filter((a) => a.owner === filter);

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-2">
      {/* top bar */}
      <div
        className="flex flex-wrap items-center gap-4 rounded-[10px] border border-l-4 bg-white px-3.5 py-2 text-[12.5px] text-[#334155]"
        style={{ borderColor: BORDER, borderLeftColor: TEAL }}
      >
        <span>
          Appraisal cycle <b>Apr-26</b>
        </span>
        <span className="h-5 w-px self-stretch bg-[#d7dce3]" />
        <span>Allocated {dateText(ALLOC_DATE)} by HR</span>
        <span className="h-5 w-px self-stretch bg-[#d7dce3]" />
        <span>
          <b>Tech ED</b>
        </span>
        <span className="h-5 w-px self-stretch bg-[#d7dce3]" />
        <span className="inline-flex flex-wrap items-center gap-2">
          Budget applied by HR:{" "}
          <b className="text-[13.5px] text-[#12304f]">{me.pct}%</b>{" "}
          <span className="text-[11px] text-slate-500">(org default)</span> ={" "}
          <b className="text-[13.5px] text-[#12304f]">{money(me.updated)}</b>{" "}
          updated · original {money(me.original)}
          <button
            type="button"
            aria-expanded={appliedOpen}
            onClick={() => setAppliedOpen((v) => !v)}
            className={
              "whitespace-nowrap rounded border px-2 py-[3px] text-[12px] font-bold " +
              (appliedOpen
                ? "border-[#12304f] bg-[#12304f] text-white"
                : "border-[#c5d0dd] bg-white text-[#12304f]")
            }
          >
            % history {appliedOpen ? "▴" : "▾"}
          </button>
        </span>
      </div>
      {appliedOpen ? (
        <div
          className="rounded-[10px] border bg-[#f7f9fc] px-3.5 py-2"
          style={{ borderColor: BORDER }}
        >
          <AuditTable
            rows={sorted.filter((a) => a.owner === me.name)}
            showOwner={false}
          />
        </div>
      ) : null}

      {/* My Budget */}
      <Panel
        title="My Budget"
        open={pane.mine}
        onToggle={() => togglePane("mine")}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {summary.map(([label, value, note], i) => (
            <div
              key={label}
              className={
                "border-r border-t-[3px] border-r-[#d7dce3] px-4 py-3 " +
                (i === 1 ? "border-t-[#14a3a3]" : "border-t-transparent")
              }
            >
              <div className="text-[11px] font-medium text-[#5b6b80]">
                {label}
              </div>
              <div className="mt-0.5 text-[18px] font-semibold text-[#12304f]">
                {value}
              </div>
              {note ? <div className="mt-0.5 text-[11px]">{note}</div> : null}
            </div>
          ))}
          <div className="border-t-[3px] border-t-transparent px-4 py-3">
            <div className="text-[11px] font-medium text-[#5b6b80]">
              Utilised
            </div>
            <div
              className={
                "mt-0.5 text-[18px] font-semibold " +
                (over ? "text-[#c2410c]" : "text-[#12304f]")
              }
            >
              {money(used)} ({usedPct.toFixed(0)}%)
            </div>
            <div className="mt-0.5 text-[11px]">
              {over ? (
                <span className="font-bold text-[#c2410c]">
                  ▲ {money(used - me.updated)} over
                </span>
              ) : (
                <span className="text-slate-500">
                  Remaining {money(me.updated - used)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mx-4 mb-3.5 h-2 overflow-hidden rounded bg-[#e6ebf2]">
          <span
            className="block h-full"
            style={{
              width: Math.min(usedPct, 100) + "%",
              background: over
                ? "#d9480f"
                : "linear-gradient(90deg,#14a3a3,#1b6fb5)",
            }}
          />
        </div>
      </Panel>

      {/* Allocation */}
      <Panel
        title="Allocation"
        count={kids.length + " Comp Manager" + (kids.length === 1 ? "" : "s")}
        open={pane.alloc}
        onToggle={() => togglePane("alloc")}
      >
        <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-3.5 py-2 text-[12px] text-[#475569]">
          <label htmlFor="bReason">Reason for next % change</label>
          <input
            id="bReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional — saved in the audit trail"
            className="h-7 max-w-[420px] flex-1 rounded border border-[#cbd3df] px-2 text-[12.5px]"
          />
        </div>
        {error ? (
          <div
            role="alert"
            className="mx-4 mt-2.5 flex justify-between gap-2.5 rounded-md border border-[#e3e8ef] border-l-4 border-l-[#c2410c] bg-white px-2.5 py-[7px] text-[12px] text-[#7c2d12]"
          >
            <span>{error}</span>
            <button
              type="button"
              className="text-[11.5px] font-bold text-[#1859a8]"
              onClick={() => setError("")}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <div className={"overflow-x-auto " + (error ? "mt-2.5" : "")}>
          <table className="w-full min-w-[980px] border-collapse text-[12.5px] tabular-nums">
            <thead>
              <tr>
                {ALLOC_COLS.map(([h, right]) => (
                  <th
                    key={h}
                    className={
                      "whitespace-nowrap border-b-2 border-[#9fb3cf] bg-[#e8eef5] px-2.5 py-2 text-[12px] font-semibold text-[#12304f] " +
                      (right ? "text-right" : "text-left")
                    }
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* self row */}
              <tr>
                <td
                  className={
                    td(true) + "font-medium shadow-[inset_4px_0_0_#14a3a3]"
                  }
                >
                  Tech ED
                </td>
                <td className={td(true) + "font-bold"}>
                  {me.name}{" "}
                  <span className="text-[11px] font-normal text-slate-500">
                    (you)
                  </span>
                </td>
                <td className={td(true) + "text-right"}>
                  {money(me.original)}
                </td>
                <td className={td(true) + "text-right font-bold"}>
                  {money(me.updated)}
                </td>
                <td className={td(true) + "whitespace-nowrap text-right"}>
                  <Chg d={me.updated - me.original} base={me.original} />
                </td>
                <td className={td(true) + "text-right"}>{me.team0}</td>
                <td className={td(true) + "text-right"}>{me.team}</td>
                <td className={td(true)}>
                  <LastChanged name={me.name} hist={selfHist} />
                </td>
                <td className={td(true) + "text-right text-[#94a3b8]"}>
                  {me.pct}%
                </td>
              </tr>
              {trail[me.name] && selfHist.length > 1 ? (
                <tr>
                  <td
                    colSpan={ALLOC_COLS.length}
                    className="border-y border-[#d7dce3] bg-[#f7f9fc] py-2 pl-10 pr-3"
                  >
                    <Trail rows={selfHist} roll ownerLabel="Comp Manager" />
                  </td>
                </tr>
              ) : null}

              {/* reports */}
              {kids.map((k) => {
                const h = kidHist[k.name];
                return (
                  <FragmentRow key={k.name}>
                    <tr>
                      <td className={td(false)}>Comp Manager</td>
                      <td className={td(false) + "font-bold"}>{k.name}</td>
                      <td className={td(false) + "text-right"}>
                        {money(k.original)}
                      </td>
                      <td className={td(false) + "text-right font-bold"}>
                        {money(k.updated)}
                      </td>
                      <td
                        className={td(false) + "whitespace-nowrap text-right"}
                      >
                        <Chg d={k.updated - k.original} base={k.original} />
                      </td>
                      <td className={td(false) + "text-right"}>{k.team0}</td>
                      <td className={td(false) + "text-right"}>{k.team}</td>
                      <td className={td(false)}>
                        <LastChanged name={k.name} hist={h} />
                      </td>
                      <td className={td(false) + "text-right"}>
                        <input
                          key={k.name + k.pct + nonce}
                          type="number"
                          min="0"
                          step="0.1"
                          defaultValue={k.pct}
                          aria-label={"Allot % for " + k.name}
                          onBlur={(e) => setPct(k.name, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className="h-[26px] w-[64px] rounded border border-[#9fb3cf] bg-[#fffef5] px-1.5 text-right text-[12.5px] focus:outline focus:outline-2 focus:outline-[#14a3a3]"
                        />
                      </td>
                    </tr>
                    {trail[k.name] && h.length > 1 ? (
                      <tr>
                        <td
                          colSpan={ALLOC_COLS.length}
                          className="border-y border-[#d7dce3] bg-[#f7f9fc] py-2 pl-10 pr-3"
                        >
                          <Trail rows={h} />
                        </td>
                      </tr>
                    ) : null}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Audit */}
      <Panel
        title="% Applied — audit trail (you and your Comp Managers)"
        open={pane.audit}
        onToggle={() => togglePane("audit")}
      >
        <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-3.5 py-2 text-[12px] text-[#475569]">
          <label>
            Owner
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="ml-2 h-7 rounded border border-[#cbd3df] px-2"
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
        <div className="px-3.5 pb-3 pt-2">
          <AuditTable rows={auditRows} />
        </div>
      </Panel>
    </div>
  );
}
