import { useMemo, useState } from "react";

import { useBudget } from "@/lib/budget-store";

const NAVY = "#17365d";
const TEAL = "#14a3a3";

function lakh(value) {
  return `₹ ${(Number(value || 0) / 100000).toFixed(2)} L`;
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function SummaryTile({ label, value, sub }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 text-[17px] font-bold" style={{ color: NAVY }}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function Audit({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            {["Cycle", "Tech ED", "Budget %", "Budget", "Additional", "Updated", "Utilised", "Remaining", "Status"].map((h) => (
              <th key={h} className="border-b-2 border-[#9fb3cf] bg-[#eef2f7] px-2.5 py-2 text-left font-bold text-[#1e3a5f]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2">{row.appraisal_cycle_id || "—"}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">{row.tech_ed_id || "—"}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{pct(row.budget_percentage)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.budget_amount)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.additional_budget)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right font-bold">{lakh(row.updated_budget)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.budget_utilized)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.budget_remaining)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2">{row.status || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BudgetAllocationPage() {
  const budget = useBudget();
  const [selectedId, setSelectedId] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const selected = useMemo(
    () => budget.budgetRows.find((row) => row.id === selectedId) || budget.budgetRows[0] || null,
    [budget.budgetRows, selectedId],
  );

  if (budget.loading) {
    return <div className="em-tab-content"><div className="em-empty">Loading Budget Master...</div></div>;
  }

  if (budget.error) {
    return <div className="em-tab-content"><div className="em-empty text-[#a8071a]">{budget.error}</div></div>;
  }

  if (!budget.budgetRows.length) {
    return <div className="em-tab-content"><div className="em-empty">No Budget Master record is available for this user/cycle.</div></div>;
  }

  const rows = budget.budgetRows;
  const t = budget.totals;
  const utilization = t.updated ? (t.utilized / t.updated) * 100 : 0;
  const selectedCount = selected ? (budget.employeeCounts[selected.tech_ed_id] || 0) : 0;

  return (
    <div className="em-tab-content">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#d4dbe5] bg-white px-4 py-2.5 text-[12.5px]" style={{ borderLeft: `4px solid ${TEAL}` }}>
        <span>Appraisal cycle <b>{selected?.appraisal_cycle_id || "—"}</b></span>
        <span className="h-4 w-px bg-[#d7dce3]" />
        <span><b>{budget.isHR ? "HR" : "Tech ED"}</b></span>
        <span className="h-4 w-px bg-[#d7dce3]" />
        <span>Current user <b>{budget.currentUser.name}</b></span>
      </div>

      <div className="mt-2 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
        <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>
          {budget.isHR ? "All Budgets" : "My Budget"}
        </div>
        <div className="grid grid-cols-2 divide-x divide-[#d7dce3] sm:grid-cols-3 lg:grid-cols-6">
          <SummaryTile label="Original allotted" value={lakh(t.base)} sub="Budget Master" />
          <SummaryTile label="Additional budget" value={lakh(t.additional)} />
          <SummaryTile label="Updated budget" value={lakh(t.updated)} sub={t.additional ? `+${lakh(t.additional)} additional` : "No additional budget"} />
          <SummaryTile label="Team size" value={String(rows.reduce((n, r) => n + (budget.employeeCounts[r.tech_ed_id] || 0), 0))} sub="Active + eligible employees" />
          <SummaryTile label="Utilised" value={`${lakh(t.utilized)} (${pct(utilization)})`} sub={t.updated >= t.utilized ? `Remaining ${lakh(t.remaining)}` : `Over ${lakh(t.utilized - t.updated)}`} />
          <SummaryTile label="Remaining" value={lakh(t.remaining)} />
        </div>
        <div className="mx-4 mb-3 h-2 overflow-hidden rounded-full bg-[#e6ebf2]">
          <div className="h-full rounded-full" style={{ width: `${Math.min(utilization, 100)}%`, background: utilization > 100 ? "#cf1322" : "linear-gradient(90deg,#14a3a3,#1b6fb5)" }} />
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
        <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>
          Allocation · {rows.length} Tech ED{rows.length === 1 ? "" : "s"}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
            <thead><tr>
              {["Tech ED", "Budget %", "Original Budget", "Additional", "Updated Budget", "Utilised", "Remaining", "Team", "Status"].map((h) => (
                <th key={h} className="border-b-2 border-[#9fb3cf] bg-[#eef2f7] px-2.5 py-2 text-left text-[12px] font-bold text-[#1e3a5f]">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((row) => {
                const used = row.updated_budget ? (row.budget_utilized / row.updated_budget) * 100 : 0;
                const team = budget.employeeCounts[row.tech_ed_id] || 0;
                return (
                  <tr key={row.id} className={selected?.id === row.id ? "bg-[#f0fdfa]" : ""} onClick={() => setSelectedId(row.id)}>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">{row.tech_ed_id}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{pct(row.budget_percentage)}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.budget_amount)}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.additional_budget)}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right font-bold">{lakh(row.updated_budget)}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.budget_utilized)}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.budget_remaining)}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{team}</td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2">{row.status || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="mt-2 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
          <button type="button" onClick={() => setShowDetails((v) => !v)} className="flex w-full items-center justify-between px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>
            <span>Budget details · {selected.tech_ed_id}</span><span>{showDetails ? "▾" : "▸"}</span>
          </button>
          {showDetails && (
            <div className="p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryTile label="Cycle" value={selected.appraisal_cycle_id || "—"} />
                <SummaryTile label="Budget %" value={pct(selected.budget_percentage)} />
                <SummaryTile label="Team" value={String(selectedCount)} />
                <SummaryTile label="Status" value={selected.status || "—"} />
              </div>
              <div className="mt-2"><Audit rows={[selected]} /></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
