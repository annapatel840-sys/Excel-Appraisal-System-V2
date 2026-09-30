import { useMemo, useState } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";

const NAVY = "#17365d";
const BORDER = "#d8e0ea";
const TEAL = "#0b7a75";

const TECH_ED_DEFAULTS = {
  "Prabhu Prasad Parida": {
    level: "Tech ED",
    parent: "HR",
    percentage: 8,
    originalBudget: 42500000,
    teamSize: 48,
    utilised: 28750000,
  },
  "Ashok Kumar": {
    level: "Tech ED",
    parent: "HR",
    percentage: 8,
    originalBudget: 38000000,
    teamSize: 42,
    utilised: 24100000,
  },
};

function money(value) {
  const n = Number(value || 0);
  if (n >= 10000000) return "₹ " + (n / 10000000).toFixed(2) + " Cr";
  return "₹ " + n.toLocaleString("en-IN");
}

function pct(value) {
  return Number(value || 0).toFixed(1) + "%";
}

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-md border border-[#e1e7ef] bg-white px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-[18px] font-bold text-[#17365d]">{value}</div>
      {sub ? <div className="mt-1 text-[10px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function AuditTable({ name, percentage, budget }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-[11px]">
        <thead>
          <tr>
            {["Date", "Owner", "Old %", "New %", "Budget Before", "Budget After", "Changed By", "Reason"].map((head) => (
              <th key={head} className="border-b border-[#cfd9e5] bg-[#eef2f7] px-3 py-2 text-left font-bold text-[#1e3a5f]">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-b border-[#e5e9ef] px-3 py-2">01-Sep-2026</td>
            <td className="border-b border-[#e5e9ef] px-3 py-2 font-semibold">{name}</td>
            <td className="border-b border-[#e5e9ef] px-3 py-2 text-right">—</td>
            <td className="border-b border-[#e5e9ef] px-3 py-2 text-right font-bold">{pct(percentage)}</td>
            <td className="border-b border-[#e5e9ef] px-3 py-2 text-right">—</td>
            <td className="border-b border-[#e5e9ef] px-3 py-2 text-right">{money(budget)}</td>
            <td className="border-b border-[#e5e9ef] px-3 py-2">{name === "Prabhu Prasad Parida" ? "HR" : "HR"}</td>
            <td className="border-b border-[#e5e9ef] px-3 py-2">Initial allocation</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function TechEdBudgetAllocationPage() {
  const user = useCatalystUser();
  const displayName = String(user?.name || user?.email || "Tech ED").trim();
  const configured = TECH_ED_DEFAULTS[displayName] || TECH_ED_DEFAULTS["Prabhu Prasad Parida"];

  const [percentage, setPercentage] = useState(configured.percentage);
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showAllocation, setShowAllocation] = useState(true);
  const [showAudit, setShowAudit] = useState(true);

  const budget = useMemo(
    () => configured.originalBudget * Number(percentage || 0) / configured.percentage,
    [configured.originalBudget, configured.percentage, percentage],
  );

  const remaining = Math.max(0, budget - configured.utilised);

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-2">
      <div className="rounded-md border border-[#d4dbe5] border-l-4 border-l-[#0b7a75] bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
          <span>Appraisal cycle <b className="text-[#17365d]">Apr-26</b></span>
          <span className="text-slate-300">|</span>
          <span>Allocated <b>01-Sep-2026</b> by <b>HR</b></span>
          <span className="text-slate-300">|</span>
          <span><b className="text-[#17365d]">{configured.level}</b></span>
          <span className="text-slate-300">|</span>
          <span className="font-semibold text-[#0b7a75]">
            Budget applied by {configured.parent}: <b>{pct(percentage)}</b> = <b>{money(budget)}</b>
          </span>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="rounded border border-[#cbd5e1] bg-white px-2 py-1 text-[10px] font-semibold text-[#17365d]"
          >
            % history {showHistory ? "▴" : "▾"}
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className="overflow-hidden rounded-md border border-[#d4dbe5] bg-white p-3">
          <AuditTable name={displayName} percentage={percentage} budget={budget} />
        </div>
      ) : null}

      <section className="overflow-hidden rounded-md border border-[#d4dbe5] bg-white">
        <button
          type="button"
          onClick={() => setShowAllocation((v) => !v)}
          className="flex w-full items-center justify-between bg-[#17365d] px-4 py-2.5 text-left text-[13px] font-semibold text-white"
        >
          <span>My Budget</span>
          <span>{showAllocation ? "▾" : "▸"}</span>
        </button>

        {showAllocation ? (
          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Original Budget" value={money(configured.originalBudget)} />
            <Tile label="Updated Budget" value={money(budget)} sub={configured.percentage !== Number(percentage) ? `Original ${pct(configured.percentage)}` : "Current allocation"} />
            <Tile label="Team Count" value={String(configured.teamSize)} sub="Current team" />
            <Tile label="Remaining Budget" value={money(remaining)} sub={`Utilised ${money(configured.utilised)}`} />
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-md border border-[#d4dbe5] bg-white">
        <button
          type="button"
          onClick={() => setShowAllocation((v) => !v)}
          className="flex w-full items-center justify-between bg-[#17365d] px-4 py-2.5 text-left text-[13px] font-semibold text-white"
        >
          <span>Allocation · {configured.level}</span>
          <span>{showAllocation ? "▾" : "▸"}</span>
        </button>

        {showAllocation ? (
          <>
            <div className="border-b border-[#e1e7ef] p-3">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <div className="mb-1 text-[10px] font-semibold text-slate-500">Owner</div>
                  <div className="rounded border border-[#d4dbe5] bg-[#f8fafc] px-3 py-2 text-[12px] font-semibold">{displayName}</div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold text-slate-500">Budget Base</div>
                  <div className="rounded border border-[#d4dbe5] bg-[#f8fafc] px-3 py-2 text-[12px] font-semibold">{money(configured.originalBudget)}</div>
                </div>
                <label className="text-[10px] font-semibold text-slate-500">
                  Allot %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={percentage}
                    onChange={(e) => setPercentage(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[#cbd5e1] px-2 text-[12px] font-normal text-slate-800 outline-none focus:border-[#0b7a75]"
                  />
                </label>
                <div>
                  <div className="mb-1 text-[10px] font-semibold text-slate-500">Calculated Budget</div>
                  <div className="rounded border border-[#b7dedb] bg-[#f0fbfa] px-3 py-2 text-[12px] font-bold text-[#0b7a75]">{money(budget)}</div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] border-collapse text-[11px]">
                <thead>
                  <tr>
                    {["Level", "Owner", "Original Budget", "Updated Budget", "Change", "Original Count", "Current Count", "Last Changed", "Allot %"].map((head, index) => (
                      <th key={head} className={`border-b border-[#cfd9e5] bg-[#eef2f7] px-3 py-2 font-bold text-[#1e3a5f] ${index >= 2 && index !== 7 ? "text-right" : "text-left"}`}>
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-[#f8fbff]">
                    <td className="border-b border-[#e5e9ef] px-3 py-2 font-semibold">Level 1</td>
                    <td className="border-b border-[#e5e9ef] px-3 py-2 font-bold">{displayName}</td>
                    <td className="border-b border-[#e5e9ef] px-3 py-2 text-right">{money(configured.originalBudget)}</td>
                    <td className="border-b border-[#e5e9ef] px-3 py-2 text-right font-bold text-[#17365d]">{money(budget)}</td>
                    <td className="border-b border-[#e5e9ef] px-3 py-2 text-right">{money(budget - configured.originalBudget)}</td>
                    <td className="border-b border-[#e5e9ef] px-3 py-2 text-right">{configured.teamSize}</td>
                    <td className="border-b border-[#e5e9ef] px-3 py-2 text-right">{configured.teamSize}</td>
                    <td className="border-b border-[#e5e9ef] px-3 py-2">01-Sep-2026</td>
                    <td className="border-b border-[#e5e9ef] px-3 py-2 text-right font-bold">{pct(percentage)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-[#e1e7ef] p-3">
              <label className="min-w-[280px] flex-1 text-[10px] font-semibold text-slate-500">
                Reason for next % change
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Optional — saved in the audit trail"
                  className="mt-1 h-9 w-full rounded border border-[#cbd5e1] px-2 text-[11px] font-normal outline-none focus:border-[#0b7a75]"
                />
              </label>
              <button
                type="button"
                onClick={() => setShowHistory(true)}
                className="mt-4 rounded-md bg-[#0b7a75] px-4 py-2 text-[11px] font-semibold text-white"
              >
                Review % History
              </button>
            </div>
          </>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-md border border-[#d4dbe5] bg-white">
        <button
          type="button"
          onClick={() => setShowAudit((v) => !v)}
          className="flex w-full items-center justify-between bg-[#17365d] px-4 py-2.5 text-left text-[13px] font-semibold text-white"
        >
          <span>% Applied — Audit Trail</span>
          <span>{showAudit ? "▾" : "▸"}</span>
        </button>
        {showAudit ? (
          <div className="p-3">
            <AuditTable name={displayName} percentage={percentage} budget={budget} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
