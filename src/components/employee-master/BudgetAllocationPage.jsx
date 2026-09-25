import { useState } from "react";

import { useBudget } from "@/lib/budget-store";
import {
  childrenOf,
  dateText,
  fmtLakh,
  levelName,
  rootsOf,
} from "@/lib/budget-engine";

const NAVY = "#17365d";

function ChangeBadge({ delta }) {
  if (Math.abs(delta) < 1)
    return <span className="text-slate-500">No change</span>;
  const up = delta > 0;
  return (
    <span className={up ? "text-[#15803d]" : "text-[#c2410c]"}>
      {up ? "▲" : "▼"} {fmtLakh(Math.abs(delta))}
    </span>
  );
}

function BudgetTile({ label, value, sub, valueClass }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div
        className={`mt-0.5 text-[16px] font-bold ${valueClass || ""}`}
        style={{ color: valueClass ? undefined : NAVY }}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function AuditTable({ rows }) {
  if (!rows.length)
    return (
      <div className="px-2 py-3 text-[12px] text-slate-500">
        No % changes yet.
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            {[
              "Date",
              "Old %",
              "New %",
              "Budget before",
              "Budget after",
              "Changed by",
              "Reason",
            ].map((h) => (
              <th
                key={h}
                className="border-b border-[#d7dce3] px-2 py-1.5 text-left font-bold text-[#1e3a5f]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="border-b border-[#edf0f4] px-2 py-1.5">
                {r.date}
              </td>
              <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right">
                {r.from === null ? "—" : `${r.from}%`}
              </td>
              <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right font-bold">
                {r.to}%
              </td>
              <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right">
                {r.before === null ? "—" : fmtLakh(r.before)}
              </td>
              <td className="border-b border-[#edf0f4] px-2 py-1.5 text-right">
                {fmtLakh(r.after)}
              </td>
              <td className="border-b border-[#edf0f4] px-2 py-1.5">{r.by}</td>
              <td className="border-b border-[#edf0f4] px-2 py-1.5">
                {r.reason || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BudgetAllocationPage() {
  const budget = useBudget();
  return budget.isHR ? (
    <HRBudgetView budget={budget} />
  ) : (
    <ManagerBudgetView budget={budget} />
  );
}

function ManagerBudgetView({ budget }) {
  const {
    currentUser,
    hierarchy,
    levels,
    node,
    budgetFor,
    canEdit,
    setPct,
    pctLog,
  } = budget;

  const [err, setErr] = useState("");
  const [reason, setReason] = useState("");

  const mine = hierarchy[currentUser.name];
  if (!mine) {
    return (
      <div className="em-tab-content">
        <div className="em-empty">
          No budget has been allotted to this login.
        </div>
      </div>
    );
  }

  const myNode = node(currentUser.name);
  const kids = childrenOf(hierarchy, currentUser.name);
  const nextLevel = levelName(levels, mine.level + 1);
  const b = budgetFor();
  const pct = b.updated ? (myNode.utilised / b.updated) * 100 : 0;
  const over = pct > 100;

  const handlePctChange = (name, raw) => {
    const to = Math.round(Number(raw) * 10) / 10;
    if (!(to >= 0)) return;
    if (to === node(name).pct) return;
    const error = setPct(name, to, reason);
    if (error) setErr(error);
    else {
      setErr("");
      setReason("");
    }
  };

  return (
    <div className="em-tab-content">
      <div
        className="flex flex-wrap items-center gap-3 rounded-lg border border-[#d4dbe5] bg-white px-4 py-2.5 text-[12.5px]"
        style={{ borderLeft: "4px solid #14a3a3" }}
      >
        <span>
          Appraisal cycle <b>Apr-26</b>
        </span>
        <span className="h-4 w-px bg-[#d7dce3]" />
        <span>
          <b>{levelName(levels, mine.level)}</b>
        </span>
        <span className="h-4 w-px bg-[#d7dce3]" />
        <span>
          Budget applied by {mine.parent || "HR"}: <b>{myNode.pct}%</b> ={" "}
          <b>{fmtLakh(myNode.updated)}</b> updated · original{" "}
          {fmtLakh(myNode.original)}
        </span>
      </div>

      {err && (
        <div className="mt-2 flex items-center justify-between rounded border border-[#ffa39e] bg-[#fff1f0] px-3 py-2 text-[12px] text-[#a8071a]">
          <span>{err}</span>
          <button
            type="button"
            onClick={() => setErr("")}
            className="font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-2 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
        <div
          className="px-4 py-2.5 text-[13px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          My Budget
        </div>
        <div className="grid grid-cols-2 divide-x divide-[#d7dce3] sm:grid-cols-3 lg:grid-cols-5">
          <BudgetTile
            label="Original allotted"
            value={fmtLakh(myNode.original)}
            sub="Fixed at allocation"
          />
          <BudgetTile
            label="Updated budget"
            value={fmtLakh(myNode.updated)}
            sub={<ChangeBadge delta={myNode.updated - myNode.original} />}
          />
          <BudgetTile
            label="Team size"
            value={`${myNode.team0} → ${myNode.team}`}
            sub="At allocation → now"
          />
          {kids.length > 0 && (
            <BudgetTile
              label="Allotted to reports"
              value={fmtLakh(myNode.allotted)}
            />
          )}
          <BudgetTile
            label="Utilised"
            value={`${fmtLakh(myNode.utilised)} (${pct.toFixed(0)}%)`}
            valueClass={over ? "text-[#c2410c]" : undefined}
            sub={
              over ? (
                <span className="text-[#c2410c]">
                  ▲ {fmtLakh(myNode.utilised - myNode.updated)} over
                </span>
              ) : (
                `Remaining ${fmtLakh(myNode.updated - myNode.utilised)}`
              )
            }
          />
        </div>
        <div className="mx-4 mb-3 h-2 overflow-hidden rounded-full bg-[#e6ebf2]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(pct, 100)}%`,
              background: over
                ? "#cf1322"
                : "linear-gradient(90deg,#14a3a3,#1b6fb5)",
            }}
          />
        </div>
      </div>

      {kids.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
          <div
            className="px-4 py-2.5 text-[13px] font-semibold text-white"
            style={{ background: NAVY }}
          >
            Allocation · {kids.length} {nextLevel}
            {kids.length === 1 ? "" : "s"}
          </div>

          <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-4 py-2.5">
            <label className="text-xs text-slate-500">
              Reason for next % change
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional — saved in the audit trail"
              className="h-8 max-w-[420px] flex-1 rounded border border-[#cbd3df] px-2 text-sm outline-none focus:border-[#2563eb]"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {[
                    "Owner",
                    "Original Budget",
                    "Updated Budget",
                    "Change",
                    "Original Count",
                    "Current Count",
                    "Allot %",
                  ].map((h) => (
                    <th
                      key={h}
                      className="border-b-2 border-[#9fb3cf] bg-[#eef2f7] px-2.5 py-2 text-left text-[12px] font-bold text-[#1e3a5f]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kids.map((k) => {
                  const kn = node(k);
                  return (
                    <tr key={k}>
                      <td className="border-b border-[#eef1f5] px-2.5 py-2 font-bold">
                        {k}
                      </td>
                      <td className="border-b border-[#eef1f5] px-2.5 py-2 text-right">
                        {fmtLakh(kn.original)}
                      </td>
                      <td className="border-b border-[#eef1f5] px-2.5 py-2 text-right">
                        {fmtLakh(kn.updated)}
                      </td>
                      <td className="border-b border-[#eef1f5] px-2.5 py-2 text-right">
                        <ChangeBadge delta={kn.updated - kn.original} />
                      </td>
                      <td className="border-b border-[#eef1f5] px-2.5 py-2 text-right">
                        {kn.team0}
                      </td>
                      <td className="border-b border-[#eef1f5] px-2.5 py-2 text-right">
                        {kn.team}
                      </td>
                      <td className="border-b border-[#eef1f5] px-2.5 py-2 text-right">
                        {canEdit(k) ? (
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            defaultValue={kn.pct}
                            onBlur={(e) => handlePctChange(k, e.target.value)}
                            className="w-16 rounded border border-[#9fb3cf] px-1.5 py-1 text-right text-sm outline-none focus:border-[#2563eb]"
                          />
                        ) : (
                          <span className="text-slate-400">{kn.pct}%</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-2 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
        <div
          className="px-4 py-2.5 text-[13px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          % Applied — audit trail
        </div>
        <div className="p-2">
          <AuditTable
            rows={[
              {
                date: "Initial allocation",
                from: null,
                to: myNode.pct0,
                before: null,
                after: myNode.original,
                by: mine.parent || "HR",
                reason: "Initial allocation",
              },
              ...pctLog
                .filter((l) => l.name === currentUser.name)
                .map((l) => ({
                  date: dateText(l.date),
                  from: l.from,
                  to: l.to,
                  before: l.before,
                  after: l.after,
                  by: l.by,
                  reason: l.reason,
                })),
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function HRBudgetView({ budget }) {
  const {
    hierarchy,
    levels,
    node,
    allocation,
    overrides,
    pctLog,
    orgLog,
    setPct,
    applyOrgPct,
  } = budget;

  const roots = rootsOf(hierarchy);
  const L1 = levelName(levels, 1);

  const [pending, setPending] = useState({});
  const [pendingOrg, setPendingOrg] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [showAudit, setShowAudit] = useState(false);

  const previewPct = (r) => {
    if (Object.prototype.hasOwnProperty.call(pending, r))
      return Number(pending[r]);
    if (pendingOrg !== "" && !overrides[r]) return Number(pendingOrg);
    return node(r).pct;
  };

  const orgPending =
    pendingOrg !== "" && Number(pendingOrg) !== allocation.orgPct;
  const pendingCount = Object.keys(pending).length + (orgPending ? 1 : 0);

  const discard = () => {
    setPending({});
    setPendingOrg("");
    setErr("");
  };

  const apply = () => {
    const errs = [];
    roots.forEach((r) => {
      const to = previewPct(r);
      const nd = node(r);
      if (to === nd.pct) return;
      if (nd.allotted > (nd.base * to) / 100 + 0.5) {
        errs.push(
          `${r} at ${to}% would fall below what's already allotted to their ${levelName(levels, 2)}s.`,
        );
      }
    });
    if (errs.length) {
      setErr("Not applied. " + errs.join(" "));
      return;
    }

    if (orgPending) applyOrgPct(Number(pendingOrg), reason);
    roots.forEach((r) => {
      if (Object.prototype.hasOwnProperty.call(pending, r)) {
        const to = Number(pending[r]);
        if (to !== node(r).pct) setPct(r, to, reason);
      }
    });
    setPending({});
    setPendingOrg("");
    setReason("");
    setErr("");
  };

  return (
    <div className="em-tab-content">
      {err && (
        <div className="mb-2 flex items-center justify-between rounded border border-[#ffa39e] bg-[#fff1f0] px-3 py-2 text-[12px] text-[#a8071a]">
          <span>{err}</span>
          <button
            type="button"
            onClick={() => setErr("")}
            className="font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
        <div
          className="px-4 py-2.5 text-[13px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Org Budget %
        </div>
        <div
          className={`flex flex-wrap divide-x divide-[#d7dce3] ${orgPending ? "bg-[#fdf8e7]" : ""}`}
        >
          <div className="px-4 py-3">
            <div className="text-[11px] text-slate-500">
              Org % (default for all {L1}s)
            </div>
            <input
              type="number"
              min="0"
              step="0.1"
              value={pendingOrg !== "" ? pendingOrg : allocation.orgPct}
              onChange={(e) =>
                setPendingOrg(
                  Number(e.target.value) === allocation.orgPct
                    ? ""
                    : e.target.value,
                )
              }
              className="mt-1 h-9 w-24 rounded border border-[#14a3a3] px-2 text-lg font-bold outline-none"
            />
          </div>
          <div className="px-4 py-3 text-[12px] text-slate-500">
            Changing the org % updates every {L1} on the org default. {L1}s with
            an override keep their own %.
          </div>
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
        <div
          className="px-4 py-2.5 text-[13px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          {L1}s — {roots.length}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                {[
                  L1,
                  "Budget base",
                  "% applied",
                  "Source",
                  "Budget",
                  "Original",
                  "Updated",
                  "Team",
                ].map((h) => (
                  <th
                    key={h}
                    className="border-b-2 border-[#9fb3cf] bg-[#eef2f7] px-2.5 py-2 text-left text-[12px] font-bold text-[#1e3a5f]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roots.map((r) => {
                const nd = node(r);
                const pct = previewPct(r);
                const changing = pct !== nd.pct;
                const isOverride = Object.prototype.hasOwnProperty.call(
                  pending,
                  r,
                )
                  ? pct !==
                    Number(pendingOrg !== "" ? pendingOrg : allocation.orgPct)
                  : !!overrides[r];
                const live = (nd.base * pct) / 100;
                return (
                  <tr key={r} className={changing ? "bg-[#fffbe6]" : undefined}>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 font-bold">
                      {r}
                    </td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">
                      {fmtLakh(nd.base)}
                    </td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        defaultValue={pct}
                        onBlur={(e) =>
                          setPending((p) => {
                            const v = e.target.value;
                            const next = { ...p };
                            if (Number(v) === nd.pct && pendingOrg === "")
                              delete next[r];
                            else next[r] = v;
                            return next;
                          })
                        }
                        className="w-20 rounded border border-[#17365d] px-1.5 py-1 text-right text-sm font-bold outline-none"
                      />
                    </td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2">
                      {isOverride ? (
                        <>
                          <span className="rounded-full bg-[#fff4d6] px-2 py-[1px] text-[11px] font-bold text-[#8a5a00]">
                            Override
                          </span>{" "}
                          <button
                            type="button"
                            className="text-[11.5px] font-bold text-[#1859a8]"
                            onClick={() =>
                              setPending((p) => {
                                const next = { ...p };
                                delete next[r];
                                return next;
                              })
                            }
                          >
                            Reset to org %
                          </button>
                        </>
                      ) : (
                        <span className="rounded-full bg-[#e6f4f4] px-2 py-[1px] text-[11px] font-bold text-[#0f6d6d]">
                          Org default
                        </span>
                      )}
                    </td>
                    <td
                      className="border-b border-[#e1e5eb] px-2.5 py-2 text-right font-bold"
                      style={{ color: NAVY }}
                    >
                      {fmtLakh(live)}
                    </td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">
                      {fmtLakh(nd.original)}
                    </td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">
                      {fmtLakh(nd.updated)}
                    </td>
                    <td className="border-b border-[#e1e5eb] px-2.5 py-2 text-right">
                      {nd.team0} → {nd.team}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-2.5 border-t border-[#d4dbe5] bg-white px-4 py-2.5">
          <span
            className={
              pendingCount ? "font-bold text-[#ad4e00]" : "text-slate-500"
            }
          >
            {pendingCount
              ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} pending`
              : "No pending changes"}
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (saved in the audit trail)"
            disabled={!pendingCount}
            className="h-8 min-w-[200px] max-w-[420px] flex-1 rounded border border-[#cbd3df] px-2 text-sm outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={discard}
            disabled={!pendingCount}
            className="rounded border border-[#cbd3df] bg-white px-3 py-1.5 text-[12px] font-bold text-[#17365d] disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!pendingCount}
            className="rounded bg-[#14a3a3] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="mt-2 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white">
        <button
          type="button"
          onClick={() => setShowAudit((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-[13px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          <span>Audit trail</span>
          <span>{showAudit ? "▾" : "▸"}</span>
        </button>
        {showAudit && (
          <div className="p-3">
            <div className="mb-2 text-[12px] font-bold text-[#1e3a5f]">
              Org %
            </div>
            <AuditTable
              rows={orgLog.map((l) => ({
                date: dateText(l.date),
                from: l.from,
                to: l.to,
                before: l.before,
                after: l.after,
                by: l.by,
                reason: l.reason,
              }))}
            />
            <div className="mb-2 mt-3 text-[12px] font-bold text-[#1e3a5f]">
              {L1} %
            </div>
            <AuditTable
              rows={roots.flatMap((r) => {
                const nd = node(r);
                return [
                  {
                    date: "Initial allocation",
                    from: null,
                    to: nd.pct0,
                    before: null,
                    after: nd.original,
                    by: "HR Admin",
                    reason: "Initial allocation",
                  },
                  ...pctLog
                    .filter((l) => l.name === r)
                    .map((l) => ({
                      date: dateText(l.date),
                      from: l.from,
                      to: l.to,
                      before: l.before,
                      after: l.after,
                      by: l.by,
                      reason: l.reason,
                    })),
                ];
              })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
