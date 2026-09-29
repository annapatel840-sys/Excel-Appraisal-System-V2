import { useCallback, useEffect, useMemo, useState } from "react";

import { useBudget } from "@/lib/budget-store";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

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

function BudgetTable({ rows, employeeCounts, selectedId, onSelect }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
        <thead>
          <tr>
            {["Tech ED", "Budget %", "Original Budget", "Additional", "Updated Budget", "Utilised", "Remaining", "Team", "Status"].map((h) => (
              <th key={h} className="border-b-2 border-[#9fb3cf] bg-[#eef2f7] px-2.5 py-2 text-left text-[12px] font-bold text-[#1e3a5f]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={selectedId === row.id ? "bg-[#f0fdfa]" : ""}
              onClick={() => onSelect(row.id)}
            >
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">{row.tech_ed_id || "—"}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{pct(row.budget_percentage)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.budget_amount)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.additional_budget)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right font-bold">{lakh(row.updated_budget)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.budget_utilized)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{lakh(row.budget_remaining)}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">{employeeCounts[row.tech_ed_id] || 0}</td>
              <td className="border-b border-[#e1e5eb] px-2.5 py-2">{row.status || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplyBudget({ rows, selected, employeeCounts, updateBudget, currentUser, onSaved }) {
  const [percentage, setPercentage] = useState("");
  const [additional, setAdditional] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!selected) return;
    setPercentage(String(selected.budget_percentage ?? ""));
    setAdditional(String(selected.additional_budget ?? ""));
    setStatus(selected.status || "Active");
    setReason("");
    setMessage("");
  }, [selected]);

  if (!selected) return null;

  const save = async () => {
    const nextPercentage = Number(percentage);
    const nextAdditional = Number(additional);

    if (!Number.isFinite(nextPercentage) || nextPercentage < 0 || nextPercentage > 100) {
      setMessage("Budget percentage must be between 0 and 100.");
      return;
    }

    if (!Number.isFinite(nextAdditional) || nextAdditional < 0) {
      setMessage("Additional budget cannot be negative.");
      return;
    }

    if (!reason.trim()) {
      setMessage("Reason is required.");
      return;
    }

    const changes = {};
    const audits = [];

    if (nextPercentage !== Number(selected.budget_percentage || 0)) {
      changes.budget_percentage = nextPercentage;
      audits.push(["Budget Percentage", selected.budget_percentage, nextPercentage]);
    }

    if (nextAdditional !== Number(selected.additional_budget || 0)) {
      changes.additional_budget = nextAdditional;
      audits.push(["Additional Budget", selected.additional_budget, nextAdditional]);
    }

    if (status !== (selected.status || "Active")) {
      changes.status = status;
      audits.push(["Status", selected.status || "", status]);
    }

    if (!Object.keys(changes).length) {
      setMessage("No changes to apply.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await updateBudget(selected.id, changes);

      const auditResponse = await catalystFetch(catalystFunctionUrl("appraisalauditapi"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audits: audits.map(([field, oldValue, newValue]) => ({
            emp_id: selected.tech_ed_id,
            employee_name: selected.tech_ed_id,
            field_name: field,
            old_value: oldValue,
            new_value: newValue,
            changed_by: currentUser.email || currentUser.name || "HR",
            changed_at: new Date().toISOString(),
            source: `budget_allocation | reason: ${reason.trim()}`,
            appraisal_year: selected.appraisal_cycle_id || "Apr-26",
          })),
        }),
      });

      const auditJson = await auditResponse.json().catch(() => ({}));
      if (!auditResponse.ok) {
        throw new Error(auditJson?.message || "Budget saved, but audit trail could not be recorded.");
      }

      setMessage("Budget applied successfully and audit trail recorded.");
      setReason("");
      onSaved();
    } catch (error) {
      setMessage(error?.message || "Unable to apply budget.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="rounded-lg border border-[#d4dbe5] bg-white">
        <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>
          Apply Budget · {selected.tech_ed_id}
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <SummaryTile label="Original Budget" value={lakh(selected.budget_amount)} />
          <SummaryTile label="Current Additional" value={lakh(selected.additional_budget)} />
          <SummaryTile label="Current Budget %" value={pct(selected.budget_percentage)} />
          <SummaryTile label="Current Updated Budget" value={lakh(selected.updated_budget)} />

          <label className="text-[12px] font-semibold text-[#334155]">
            Budget %
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[#cbd5e1] px-2.5 font-normal outline-none focus:border-[#14a3a3]"
            />
          </label>

          <label className="text-[12px] font-semibold text-[#334155]">
            Additional Budget
            <input
              type="number"
              min="0"
              step="0.01"
              value={additional}
              onChange={(e) => setAdditional(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[#cbd5e1] px-2.5 font-normal outline-none focus:border-[#14a3a3]"
            />
          </label>

          <label className="text-[12px] font-semibold text-[#334155]">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[#cbd5e1] px-2.5 font-normal outline-none focus:border-[#14a3a3]"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Pending">Pending</option>
            </select>
          </label>

          <label className="text-[12px] font-semibold text-[#334155] sm:col-span-2">
            Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Enter reason for this budget change"
              className="mt-1 w-full rounded-md border border-[#cbd5e1] p-2.5 font-normal outline-none focus:border-[#14a3a3]"
            />
          </label>
        </div>

        {message ? (
          <div className={`mx-4 mb-4 rounded-md border px-3 py-2 text-[12px] ${message.includes("successfully") ? "border-[#b7ebd5] bg-[#f0fdf4] text-[#166534]" : "border-[#f0c7c7] bg-[#fff5f5] text-[#a8071a]"}`}>
            {message}
          </div>
        ) : null}

        <div className="flex justify-end border-t border-[#e1e5eb] px-4 py-3">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-md px-3 py-2 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: TEAL }}
          >
            {saving ? "Applying..." : "Apply Budget"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[#d4dbe5] bg-white">
        <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>
          Budget Summary
        </div>
        <div className="grid grid-cols-1 divide-y divide-[#e1e5eb]">
          <SummaryTile label="Team size" value={String(employeeCounts[selected.tech_ed_id] || 0)} sub="Active + eligible" />
          <SummaryTile label="Utilised" value={lakh(selected.budget_utilized)} />
          <SummaryTile label="Remaining" value={lakh(selected.budget_remaining)} />
          <SummaryTile label="Updated budget" value={lakh(selected.updated_budget)} />
        </div>
      </div>
    </div>
  );
}

function AuditTrail({ rows, loading, error, onReload }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: NAVY }}>
        <div className="text-[13px] font-semibold text-white">Budget Audit Trail</div>
        <button type="button" onClick={onReload} className="rounded-md bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-center text-[12px] text-slate-500">Loading audit trail...</div>
      ) : error ? (
        <div className="p-6 text-center text-[12px] text-[#a8071a]">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-[12px]">
            <thead>
              <tr>
                {["Date", "Tech ED", "Field", "Old Value", "New Value", "Changed By", "Source"].map((h) => (
                  <th key={h} className="border-b-2 border-[#9fb3cf] bg-[#eef2f7] px-2.5 py-2 text-left font-bold text-[#1e3a5f]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.ROWID || row.id || `${row.emp_id}-${row.changed_at}-${index}`}>
                  <td className="border-b border-[#e1e5eb] px-2.5 py-2 whitespace-nowrap">{row.changed_at || row.CREATEDTIME || "—"}</td>
                  <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">{row.emp_id || "—"}</td>
                  <td className="border-b border-[#e1e5eb] px-2.5 py-2">{row.field_name || "—"}</td>
                  <td className="border-b border-[#e1e5eb] px-2.5 py-2">{row.old_value || "—"}</td>
                  <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-semibold">{row.new_value || "—"}</td>
                  <td className="border-b border-[#e1e5eb] px-2.5 py-2">{row.changed_by || "—"}</td>
                  <td className="border-b border-[#e1e5eb] px-2.5 py-2 max-w-[360px]">{row.source || "—"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[12px] text-slate-400">No budget changes recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function BudgetAllocationPage() {
  const budget = useBudget();
  const [activePage, setActivePage] = useState("allocation");
  const [selectedId, setSelectedId] = useState(null);
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");

  const selected = useMemo(
    () => budget.budgetRows.find((row) => row.id === selectedId) || budget.budgetRows[0] || null,
    [budget.budgetRows, selectedId],
  );

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError("");

    try {
      const response = await catalystFetch(
        catalystFunctionUrl("appraisalauditapi") + "?limit=500",
      );
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json?.message || `Failed to load audit trail (${response.status}).`);
      }

      const rows = Array.isArray(json?.data) ? json.data : [];
      setAuditRows(rows.filter((row) => String(row.source || "").toLowerCase().includes("budget_allocation")));
    } catch (error) {
      setAuditRows([]);
      setAuditError(error?.message || "Unable to load budget audit trail.");
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePage === "audit") loadAudit();
  }, [activePage, loadAudit]);

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

  return (
    <div className="em-tab-content">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#d4dbe5] bg-white px-4 py-2.5 text-[12.5px]" style={{ borderLeft: `4px solid ${TEAL}` }}>
        <span>Appraisal cycle <b>{selected?.appraisal_cycle_id || "—"}</b></span>
        <span className="h-4 w-px bg-[#d7dce3]" />
        <span><b>{budget.isHR ? "HR" : "Tech ED"}</b></span>
        <span className="h-4 w-px bg-[#d7dce3]" />
        <span>Current user <b>{budget.currentUser.name}</b></span>
      </div>

      {budget.isHR ? (
        <div className="mt-2 flex flex-wrap gap-1 rounded-lg border border-[#d4dbe5] bg-white p-1.5">
          {[
            ["apply", "Apply Budget"],
            ["audit", "Audit Trail"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActivePage(key)}
              className={`rounded-md px-3 py-2 text-[12px] font-semibold ${activePage === key ? "bg-[#17365d] text-white" : "text-[#334155] hover:bg-[#eef2f7]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {!budget.isHR && (
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <SummaryTile label="My Budget" value={lakh(selected?.updated_budget)} sub={`Original ${lakh(selected?.budget_amount)} + Additional ${lakh(selected?.additional_budget)}`} />
          <SummaryTile label="Allocation" value={lakh(selected?.budget_remaining)} sub={`Utilised ${lakh(selected?.budget_utilized)}`} />
          <SummaryTile label="% Applied" value={pct(selected?.budget_percentage)} sub="Current appraisal budget percentage" />
        </div>
      ) : null}

      {activePage === "allocation" && budget.isHR && (
        <>
          <div className="mt-2 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
            <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>
              All Budgets
            </div>
            <div className="grid grid-cols-2 divide-x divide-[#d7dce3] sm:grid-cols-3 lg:grid-cols-6">
              <SummaryTile label="Original allotted" value={lakh(t.base)} sub="Budget Master" />
              <SummaryTile label="Additional budget" value={lakh(t.additional)} />
              <SummaryTile label="Updated budget" value={lakh(t.updated)} />
              <SummaryTile label="Team size" value={String(rows.reduce((n, r) => n + (budget.employeeCounts[r.tech_ed_id] || 0), 0))} sub="Active + eligible employees" />
              <SummaryTile label="Utilised" value={`${lakh(t.utilized)} (${pct(utilization)})`} />
              <SummaryTile label="Remaining" value={lakh(t.remaining)} />
            </div>
            <div className="mx-4 mb-3 h-2 overflow-hidden rounded-full bg-[#e6ebf2]">
              <div className="h-full rounded-full" style={{ width: `${Math.min(utilization, 100)}%`, background: utilization > 100 ? "#cf1322" : "linear-gradient(90deg,#14a3a3,#1b6fb5)" }} />
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-[#d4dbe5] bg-white">
            <div className="px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: NAVY }}>
              Allocation · {rows.length} Tech ED{rows.length === 1 ? "" : "s"}
            </div>
            <BudgetTable rows={rows} employeeCounts={budget.employeeCounts} selectedId={selected?.id} onSelect={setSelectedId} />
          </div>
        </>
      )}

      {activePage === "apply" && (
        <div className="mt-2">
          <div className="mb-2 rounded-lg border border-[#d4dbe5] bg-white p-3">
            <label className="text-[12px] font-semibold text-[#334155]">
              Select Tech ED
              <select
                value={selected?.id || ""}
                onChange={(e) => setSelectedId(e.target.value)}
                className="ml-2 h-8 rounded-md border border-[#cbd5e1] px-2 text-[12px] font-normal outline-none focus:border-[#14a3a3]"
              >
                {rows.map((row) => <option key={row.id} value={row.id}>{row.tech_ed_id}</option>)}
              </select>
            </label>
          </div>
          <ApplyBudget
            rows={rows}
            selected={selected}
            employeeCounts={budget.employeeCounts}
            updateBudget={budget.updateBudget}
            currentUser={budget.currentUser}
            onSaved={() => setActivePage("audit")}
          />
        </div>
      )}

      {activePage === "audit" && (
        <div className="mt-2">
          <AuditTrail rows={auditRows} loading={auditLoading} error={auditError} onReload={loadAudit} />
        </div>
      )}
    </div>
  );
}
