import { useMemo, useState } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";

const NAVY = "#17365d";
const TEAL = "#14a3a3";

const STATIC_BUDGETS = [
  {
    id: "BUD001",
    appraisal_cycle_id: "Apr-26",
    tech_ed_id: "Tech ED 01",
    budget_percentage: 8.5,
    budget_amount: 42500000,
    additional_budget: 2500000,
    budget_utilized: 28750000,
    status: "Active",
    team_size: 48,
  },
  {
    id: "BUD002",
    appraisal_cycle_id: "Apr-26",
    tech_ed_id: "Tech ED 02",
    budget_percentage: 8.0,
    budget_amount: 38000000,
    additional_budget: 1500000,
    budget_utilized: 24100000,
    status: "Active",
    team_size: 42,
  },
  {
    id: "BUD003",
    appraisal_cycle_id: "Apr-26",
    tech_ed_id: "Tech ED 03",
    budget_percentage: 7.5,
    budget_amount: 32000000,
    additional_budget: 1000000,
    budget_utilized: 19800000,
    status: "Active",
    team_size: 36,
  },
];

const STATIC_AUDIT = [
  {
    id: "AUD001",
    date: "28-Sep-2026 13:42",
    tech_ed: "Tech ED 01",
    field: "Budget Percentage",
    oldValue: "8.0%",
    newValue: "8.5%",
    changedBy: "HR",
    reason: "Annual appraisal budget revision",
  },
  {
    id: "AUD002",
    date: "26-Sep-2026 16:18",
    tech_ed: "Tech ED 02",
    field: "Additional Budget",
    oldValue: "1000000",
    newValue: "1500000",
    changedBy: "HR",
    reason: "Team allocation adjustment",
  },
];

function money(value) {
  return "₹ " + (Number(value || 0) / 10000000).toFixed(2) + " Cr";
}

function percent(value) {
  return Number(value || 0).toFixed(1) + "%";
}

function Tile({ label, value, sub }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 text-[17px] font-bold" style={{ color: NAVY }}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function AllocationTable({ rows, selectedId, onSelect }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
        <thead>
          <tr>
            {["Tech ED", "Budget %", "Original Budget", "Additional", "Updated Budget", "Utilised", "Remaining", "Team", "Status"].map(function (head) {
              return (
                <th key={head} className="border-b-2 border-[#9fb3cf] bg-[#eef2f7] px-2.5 py-2 text-left text-[12px] font-bold text-[#1e3a5f]">
                  {head}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(function (row) {
            var updated = row.budget_amount + row.additional_budget;
            var remaining = updated - row.budget_utilized;
            return (
              <tr key={row.id} className={selectedId === row.id ? "bg-[#f0fdfa]" : ""} onClick={function () { onSelect(row.id); }}>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">{row.tech_ed_id}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{percent(row.budget_percentage)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(row.budget_amount)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(row.additional_budget)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right font-bold">{money(updated)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(row.budget_utilized)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{money(remaining)}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{row.team_size}</td>
                <td className="border-b border-[#e1e5eb] px-2.5 py-2">{row.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuditPage() {
  return (
    <div className="overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
      <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>
        Budget Audit Trail
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-[12px]">
          <thead>
            <tr>
              {["Date", "Tech ED", "Field", "Old Value", "New Value", "Changed By", "Reason"].map(function (head) {
                return <th key={head} className="border-b-2 border-[#9fb3cf] bg-[#eef2f7] px-3 py-2 text-left font-bold text-[#1e3a5f]">{head}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {STATIC_AUDIT.map(function (row) {
              return (
                <tr key={row.id}>
                  <td className="border-b border-[#e1e5eb] px-3 py-2">{row.date}</td>
                  <td className="border-b border-[#e1e5eb] px-3 py-2 font-bold">{row.tech_ed}</td>
                  <td className="border-b border-[#e1e5eb] px-3 py-2">{row.field}</td>
                  <td className="border-b border-[#e1e5eb] px-3 py-2">{row.oldValue}</td>
                  <td className="border-b border-[#e1e5eb] px-3 py-2 font-semibold">{row.newValue}</td>
                  <td className="border-b border-[#e1e5eb] px-3 py-2">{row.changedBy}</td>
                  <td className="border-b border-[#e1e5eb] px-3 py-2">{row.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ApplyPage({ selected, onChange }) {
  const [percentage, setPercentage] = useState(String(selected.budget_percentage));
  const [additional, setAdditional] = useState(String(selected.additional_budget));
  const [reason, setReason] = useState("");

  var updated = selected.budget_amount + selected.additional_budget;
  var nextUpdated = selected.budget_amount + Number(additional || 0);

  return (
    <div className="max-h-[calc(100vh-260px)] overflow-y-auto overflow-x-hidden pr-1"><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="rounded-lg border border-[#d4dbe5] bg-white">
        <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>
          Apply Budget · {selected.tech_ed_id}
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Tile label="Original Budget" value={money(selected.budget_amount)} />
          <Tile label="Current Additional" value={money(selected.additional_budget)} />
          <Tile label="Current Budget %" value={percent(selected.budget_percentage)} />
          <Tile label="Current Updated Budget" value={money(updated)} />

          <label className="text-[12px] font-semibold text-[#334155]">
            Budget %
            <input type="number" min="0" max="100" step="0.1" value={percentage} onChange={function (e) { setPercentage(e.target.value); }} className="mt-1 h-9 w-full rounded-md border border-[#cbd5e1] px-2.5 font-normal" />
          </label>

          <label className="text-[12px] font-semibold text-[#334155]">
            Additional Budget
            <input type="number" min="0" step="0.01" value={additional} onChange={function (e) { setAdditional(e.target.value); }} className="mt-1 h-9 w-full rounded-md border border-[#cbd5e1] px-2.5 font-normal" />
          </label>

          <div className="rounded-md border border-[#dbe3ec] bg-[#f8fafc] p-3">
            <div className="text-[11px] text-slate-500">New Budget Preview</div>
            <div className="mt-1 text-[18px] font-bold" style={{ color: TEAL }}>{money(nextUpdated)}</div>
          </div>

          <label className="text-[12px] font-semibold text-[#334155] sm:col-span-2">
            Reason
            <textarea value={reason} onChange={function (e) { setReason(e.target.value); }} rows={3} placeholder="Enter reason for this budget change" className="mt-1 w-full rounded-md border border-[#cbd5e1] p-2.5 font-normal" />
          </label>
        </div>
        <div className="flex justify-end border-t border-[#e1e5eb] px-4 py-3">
          <button type="button" onClick={function () { onChange(selected.id, Number(percentage), Number(additional)); }} className="rounded-md px-3 py-2 text-[12px] font-bold text-white" style={{ background: TEAL }}>
            Apply Budget
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[#d4dbe5] bg-white">
        <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>Budget Summary</div>
        <Tile label="Team size" value={String(selected.team_size)} sub="Active + eligible" />
        <Tile label="Utilised" value={money(selected.budget_utilized)} />
        <Tile label="Remaining" value={money(updated - selected.budget_utilized)} />
        <Tile label="Updated budget" value={money(updated)} />
      </div>
      </div>
    </div>
  );
}

export function BudgetAllocationPage() {
  const user = useCatalystUser();
  const role = String(user && user.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isHR = role === "hr" || role.includes("hr");
  const [page, setPage] = useState("apply");
  const [rows, setRows] = useState(STATIC_BUDGETS);
  const [selectedId, setSelectedId] = useState(STATIC_BUDGETS[0].id);

  const selected = useMemo(function () {
    return rows.find(function (row) { return row.id === selectedId; }) || rows[0];
  }, [rows, selectedId]);

  function updateLocal(id, percentage, additional) {
    setRows(function (current) {
      return current.map(function (row) {
        if (row.id !== id) return row;
        return {
          ...row,
          budget_percentage: percentage,
          additional_budget: additional,
        };
      });
    });
    setPage("allocation");
  }

  var totals = rows.reduce(function (sum, row) {
    var updated = row.budget_amount + row.additional_budget;
    sum.original += row.budget_amount;
    sum.additional += row.additional_budget;
    sum.updated += updated;
    sum.utilized += row.budget_utilized;
    return sum;
  }, { original: 0, additional: 0, updated: 0, utilized: 0 });

  var remaining = totals.updated - totals.utilized;
  var utilization = totals.updated ? (totals.utilized / totals.updated) * 100 : 0;

  return (
    <div className="em-tab-content h-full min-h-0 overflow-y-auto overflow-x-hidden max-h-[calc(100vh-150px)] pr-1">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#d4dbe5] bg-white px-4 py-2.5 text-[12.5px]" style={{ borderLeft: "4px solid " + TEAL }}>
        <span>Appraisal cycle <b>Apr-26</b></span>
        <span className="h-4 w-px bg-[#d7dce3]" />
        <span><b>{isHR ? "HR" : "Tech ED"}</b></span>
        <span className="h-4 w-px bg-[#d7dce3]" />
        <span>Current user <b>{user && (user.name || user.email) || "Current User"}</b></span>
      </div>

      {isHR ? (
        <div className="mt-2 flex flex-wrap gap-1 rounded-lg border border-[#d4dbe5] bg-white p-1.5">
          {[["apply", "Apply Budget"], ["audit", "Audit Trail"]].map(function (item) {
            return (
              <button key={item[0]} type="button" onClick={function () { setPage(item[0]); }} className={"rounded-md px-3 py-2 text-[12px] font-semibold " + (page === item[0] ? "bg-[#17365d] text-white" : "text-[#334155] hover:bg-[#eef2f7]")}>
                {item[1]}
              </button>
            );
          })}
        </div>
      ) : null}

      {isHR && page === "apply" ? (
        <>
          <div className="mt-2 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
            <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>Budget Allocation</div>
            <div className="grid grid-cols-2 divide-x divide-[#d7dce3] sm:grid-cols-3 lg:grid-cols-6">
              <Tile label="Original allotted" value={money(totals.original)} sub="Budget Master" />
              <Tile label="Additional budget" value={money(totals.additional)} />
              <Tile label="Updated budget" value={money(totals.updated)} />
              <Tile label="Team size" value={String(rows.reduce(function (n, row) { return n + row.team_size; }, 0))} />
              <Tile label="Utilised" value={money(totals.utilized) + " (" + percent(utilization) + ")"} />
              <Tile label="Remaining" value={money(remaining)} />
            </div>
          </div>
          <div className="mt-2 rounded-lg border border-[#d4dbe5] bg-white">
            <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>Tech ED-wise Allocation</div>
            <AllocationTable rows={rows} selectedId={selected.id} onSelect={setSelectedId} />
          </div>
        </>
      ) : null}

      {isHR && page === "apply" ? (
        <div className="mt-2">
          <div className="mb-2 rounded-lg border border-[#d4dbe5] bg-white p-3">
            <label className="text-[12px] font-semibold text-[#334155]">
              Select Tech ED
              <select value={selected.id} onChange={function (e) { setSelectedId(e.target.value); }} className="ml-2 h-8 rounded-md border border-[#cbd5e1] px-2 text-[12px] font-normal">
                {rows.map(function (row) { return <option key={row.id} value={row.id}>{row.tech_ed_id}</option>; })}
              </select>
            </label>
          </div>
          <ApplyPage selected={selected} onChange={updateLocal} />
        </div>
      ) : null}

      {isHR && page === "audit" ? <div className="mt-2"><AuditPage /></div> : null}

      {!isHR ? (
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-[#d4dbe5] bg-white"><Tile label="My Budget" value={money(selected.updated_budget || selected.budget_amount + selected.additional_budget)} sub={"Original " + money(selected.budget_amount) + " + Additional " + money(selected.additional_budget)} /></div>
          <div className="rounded-lg border border-[#d4dbe5] bg-white"><Tile label="Allocation" value={money(selected.budget_amount + selected.additional_budget - selected.budget_utilized)} sub={"Utilised " + money(selected.budget_utilized)} /></div>
          <div className="rounded-lg border border-[#d4dbe5] bg-white"><Tile label="% Applied" value={percent(selected.budget_percentage)} sub="Current appraisal budget percentage" /></div>
        </div>
      ) : null}
    </div>
  );
}
