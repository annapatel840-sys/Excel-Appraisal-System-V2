import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppraisal } from "@/lib/appraisal-store";
import {
  NEW_TITLES,
  INSTALLMENT_OPTIONS,
  inr,
  totalOfPB,
  totalBonus as calcTotalBonus,
  newBaseSalary,
  totalCTCWithRewards,
} from "@/lib/appraisal-data";

const APPRAISAL_HISTORY_API_URL =
  "https://appraisalperformancehike-60088966704.development.catalystserverless.in/server/appraisalhistoryapi/";
const NAVY = "#17365d";

// ============================================================
// HISTORY LOADING (mirrors AppraisalGrid's loader; local copy
// so this page stays a standalone, self-contained file)
// ============================================================

const normalizeHistoryRecord = (record) => {
  const basePay = Number(record?.base_pay) || 0;
  const hike = Number(record?.hike_amount) || 0;

  return {
    year:
      record?.appraisal_year !== null && record?.appraisal_year !== undefined
        ? String(record.appraisal_year)
        : "—",
    basePay,
    joiningBonus: Number(record?.joining_bonus) || 0,
    performanceBonus: Number(record?.performance_bonus) || 0,
    retentionBonus: Number(record?.retention_bonus) || 0,
    totalBonus: Number(record?.total_bonus) || 0,
    hikeAmount: hike,
    designation: record?.designation ? String(record.designation) : "—",
    rating: record?.rating ? String(record.rating) : "—",
    feedback: record?.manager_rating ? String(record.manager_rating) : "—",
    targetPB: Number(record?.target_performance_bonus) || 0,
    newCTC: Number(record?.new_ctc) || 0,
    newBasePay: basePay + hike,
  };
};

const HISTORY_COLUMNS = [
  { key: "basePay", label: "Curr Base Pay" },
  { key: "joiningBonus", label: "Joining Bonus" },
  { key: "performanceBonus", label: "Perf. Bonus" },
  { key: "retentionBonus", label: "Retention Bonus" },
  { key: "totalBonus", label: "Total Bonus" },
  { key: "hikeAmount", label: "Hike Amount" },
  { key: "newCTC", label: "Total CTC" },
  { key: "targetPB", label: "Target PB" },
  { key: "newBasePay", label: "New Base Pay" },
];

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-IN");

// ============================================================
// COMPONENT
// ============================================================

export function DetailScreenPage() {
  const { rows: liveRows, updateCell, updateLinkedCells } = useAppraisal();

  const rows = liveRows && liveRows.length > 0 ? liveRows : "-";
  const isDemo = !(liveRows && liveRows.length > 0);

  const [index, setIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [historyByEmpId, setHistoryByEmpId] = useState({});
  const historyPromiseRef = useRef(new Map());

  const employee = rows[Math.min(index, rows.length - 1)] || rows[0];

  // ----------------------------------------------------------
  // HISTORY LOAD (skipped for demo rows — no real emp_id to fetch)
  // ----------------------------------------------------------

  const loadHistory = useCallback(
    (empId) => {
      const key = String(empId || "").trim();

      if (!key || isDemo) {
        return Promise.resolve([]);
      }

      const existing = historyPromiseRef.current.get(key);

      if (existing) {
        return existing;
      }

      setHistoryByEmpId((prev) => ({
        ...prev,
        [key]: { loading: true, data: [], error: "" },
      }));

      const promise = (async () => {
        const response = await fetch(
          `${APPRAISAL_HISTORY_API_URL}?emp_id=${encodeURIComponent(key)}`,
        );

        if (!response.ok) {
          throw new Error(`History request failed (${response.status}).`);
        }

        const result = await response.json();

        if (!result?.success) {
          throw new Error(result?.message || "Failed to load history.");
        }

        const records = Array.isArray(result?.data) ? result.data : [];

        return records
          .map(normalizeHistoryRecord)
          .sort((a, b) => String(b.year).localeCompare(String(a.year)));
      })();

      historyPromiseRef.current.set(key, promise);

      promise
        .then((data) => {
          setHistoryByEmpId((prev) => ({
            ...prev,
            [key]: { loading: false, data, error: "" },
          }));
        })
        .catch((error) => {
          historyPromiseRef.current.delete(key);

          setHistoryByEmpId((prev) => ({
            ...prev,
            [key]: {
              loading: false,
              data: [],
              error: error?.message || "Unable to load history.",
            },
          }));
        });

      return promise;
    },
    [isDemo],
  );

  useEffect(() => {
    if (employee?.empId) {
      loadHistory(employee.empId).catch(() => {});
    }
  }, [employee?.empId, loadHistory]);

  const empKey = employee ? String(employee.empId || "").trim() : "";
  const historyState = historyByEmpId[empKey];
  const historyRecords = historyState?.data || [];
  // ----------------------------------------------------------
  // DERIVED CALCULATIONS (reusing your existing formula fns)
  // ----------------------------------------------------------

  const derived = useMemo(() => {
    if (!employee) return null;

    const totalPB = totalOfPB(employee);
    const bonus = calcTotalBonus(employee);
    const newBase = newBaseSalary(employee);
    const totalCtc = totalCTCWithRewards(employee);

    return { totalPB, bonus, newBase, totalCtc };
  }, [employee]);

  const prevRecord = historyRecords[0];
  const prevTotalBonus = prevRecord
    ? prevRecord.performanceBonus + prevRecord.retentionBonus
    : 0;
  const prevCtc = prevRecord
    ? prevRecord.newBasePay +
      prevRecord.performanceBonus +
      prevRecord.retentionBonus
    : 0;

  // ----------------------------------------------------------
  // SEARCH -> JUMP TO EMPLOYEE
  // ----------------------------------------------------------

  const handleSearch = (value) => {
    setSearch(value);

    const q = value.trim().toLowerCase();

    if (!q) return;

    const found = rows.findIndex(
      (row) =>
        String(row.name || "")
          .toLowerCase()
          .startsWith(q) || String(row.empId || "").toLowerCase() === q,
    );

    if (found > -1) setIndex(found);
  };

  // ----------------------------------------------------------
  // FIELD EDIT HANDLERS — write through the same store calls
  // your grid already uses, so edits actually save (skipped
  // for demo rows, which have no backing Catalyst record).
  // ----------------------------------------------------------

  const commit = (field, value) => {
    if (isDemo) return; // nothing to persist for demo data
    updateCell(employee.id, field, value, "Detail screen edit");
  };

  const commitLinked = (fields) => {
    if (isDemo) return;
    updateLinkedCells(employee.id, fields, "Detail screen edit");
  };

  const handleNewBasePayChange = (raw) => {
    const value = Number(String(raw).replace(/[^0-9.]/g, "")) || 0;
    const hike = value - (Number(employee.currentAnnualBasePay) || 0);
    const pct = employee.currentAnnualBasePay
      ? Number(((hike / employee.currentAnnualBasePay) * 100).toFixed(1))
      : 0;

    commitLinked({ hikeAmount: hike, hikePct: pct });
  };

  const handleNewTitleChange = (value) => {
    const changed = value !== employee.designation;

    commitLinked({
      newTitle: value,
      eligibleForPromotion: changed ? "Yes" : "No",
    });
  };

  if (!employee) {
    return (
      <div className="p-6 text-sm text-slate-500">No employees to show.</div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] p-4">
      {isDemo && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Showing static demo data — no employees are loaded yet from Catalyst.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[420px_1fr]">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-lg border border-[#d4dbe5] bg-white shadow-sm">
            <div
              className="px-3 py-1.5 text-center text-[12.5px] font-semibold text-white"
              style={{ background: NAVY }}
            >
              Employee Details
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3.5 text-[11px] sm:grid-cols-3">
              <Field label="Employee Name" value={employee.name} bold />
              <Field label="Designation" value={employee.designation} />
              <Field
                label="Reporting Manager"
                value={employee.reportingManager}
              />
              <Field label="Manager Rating" value={employee.managerRating} />
              <Field
                label="Total Exp"
                value={`${employee.totalExperience ?? "—"} yrs`}
              />
              <Field
                label="Org Exp"
                value={`${employee.wissenExperience ?? "—"} yrs`}
              />
              <Field
                label="Interview Count"
                value={employee.interviewCount ?? "—"}
              />
              <Field label="RR %" value={`${employee.rrPercent ?? "—"}%`} />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#d4dbe5] bg-white shadow-sm">
            <div
              className="px-3 py-1.5 text-[11px] font-semibold text-white"
              style={{ background: NAVY }}
            >
              Rating &amp; feedback history
            </div>
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  <th className="w-12 border-b border-[#e1e5eb] bg-[#fafbfd] px-1.5 py-1 text-left text-[8.5px] text-slate-500">
                    Year
                  </th>
                  <th className="w-16 border-b border-[#e1e5eb] bg-[#fafbfd] px-1.5 py-1 text-left text-[8.5px] text-slate-500">
                    Desig.
                  </th>
                  <th className="w-8 border-b border-[#e1e5eb] bg-[#fafbfd] px-1.5 py-1 text-left text-[8.5px] text-slate-500">
                    Rtg
                  </th>
                  <th className="border-b border-[#e1e5eb] bg-[#fafbfd] px-1.5 py-1 text-left text-[8.5px] text-slate-500">
                    Feedback
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-[#fff9dc]">
                  <td className="border-b border-[#eef1f5] px-1.5 py-1 text-[9.5px] font-bold text-[#1559a6]">
                    Apr-26 ★
                  </td>
                  <td className="border-b border-[#eef1f5] px-1.5 py-1 text-[9.5px]">
                    {employee.designation}
                  </td>
                  <td className="border-b border-[#eef1f5] px-1.5 py-1 text-[9.5px]">
                    {employee.rating}
                  </td>
                  <td className="border-b border-[#eef1f5] px-1.5 py-1 text-[9.5px] leading-tight">
                    {employee.atRisk || "Feedback captured during the review."}
                  </td>
                </tr>
                {historyRecords.slice(1).map((h, i) => (
                  <tr key={i}>
                    <td className="border-b border-[#eef1f5] px-1.5 py-1 text-[9.5px] font-bold text-[#1559a6]">
                      {h.year}
                    </td>
                    <td className="border-b border-[#eef1f5] px-1.5 py-1 text-[9.5px]">
                      {h.designation}
                    </td>
                    <td className="border-b border-[#eef1f5] px-1.5 py-1 text-[9.5px]">
                      {h.rating}
                    </td>
                    <td className="border-b border-[#eef1f5] px-1.5 py-1 text-[9.5px] leading-tight">
                      {h.feedback}
                    </td>
                  </tr>
                ))}
                {!historyRecords.length && !isDemo && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-1.5 py-2 text-[9.5px] text-slate-400"
                    >
                      {historyState?.loading
                        ? "Loading..."
                        : "No prior cycles."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN — COMPENSATION INPUT SCREEN */}
        <div className="overflow-hidden rounded-lg border border-[#d4dbe5] bg-white shadow-sm">
          <div
            className="px-3 py-1.5 text-center text-[12.5px] font-semibold text-white"
            style={{ background: NAVY }}
          >
            Compensation Input Screen
          </div>

          <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-3.5 py-2">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name or employee ID"
              className="flex-1 rounded border border-[#cbd3df] px-2 py-1 text-[11px] outline-none focus:border-[#2563eb]"
            />
          </div>

          <div className="grid grid-cols-[118px_84px_1fr_68px] text-[10px]">
            <Header>Description</Header>
            <Header>Current</Header>
            <Header>Proposed</Header>
            <Header center>Diff</Header>

            <Row
              label="Base Pay"
              current={inr(employee.currentAnnualBasePay)}
              diff={`+${fmt(employee.hikeAmount)} / ${(
                Number(employee.hikePct) || 0
              ).toFixed(1)}%`}
              diffPositive
            >
              <EditInput
                defaultValue={fmt(derived.newBase)}
                onCommit={handleNewBasePayChange}
              />
            </Row>

            <Row
              label="Joining Bonus"
              current="0"
              muted
              diffText="n/a this cycle"
            />

            <Row
              label="PB Allotted / Instalments"
              current={`${inr(employee.targetPBAllocatedForMay)} / ${employee.pbInstallment}`}
              diffText="—"
            >
              <div className="flex w-full items-center gap-1.5">
                <EditInput
                  className="flex-1"
                  defaultValue={fmt(employee.allocatedPBAmount)}
                  onCommit={(v) =>
                    commit(
                      "allocatedPBAmount",
                      Number(String(v).replace(/[^0-9.]/g, "")) || 0,
                    )
                  }
                />
                <select
                  defaultValue={employee.pbInstallment}
                  onChange={(e) => commit("pbInstallment", e.target.value)}
                  className="w-14 rounded border border-[#9fdcb6] bg-[#eafaf0] px-1 py-1 text-[10px] outline-none"
                >
                  {INSTALLMENT_OPTIONS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            </Row>

            <Row
              label="RB"
              current={fmt(employee.newRB)}
              diff={`+${fmt(derived.bonus - prevTotalBonus)}`}
              diffPositive
            >
              <EditInput
                defaultValue={fmt(employee.newRB)}
                onCommit={(v) =>
                  commit(
                    "newRB",
                    Number(String(v).replace(/[^0-9.]/g, "")) || 0,
                  )
                }
              />
            </Row>

            <Row
              label="Total Reward"
              current={fmt(prevCtc)}
              diffText={
                prevCtc
                  ? `${(((derived.totalCtc - prevCtc) / prevCtc) * 100).toFixed(1)}%`
                  : "—"
              }
              total
            >
              <div className="flex min-h-[26px] items-center px-2 text-[10px] font-semibold">
                {fmt(derived.totalCtc)}
              </div>
            </Row>

            <Row
              label="Target PB"
              current={fmt(employee.targetPBAllocatedForMay)}
              diffText="next yr"
            >
              <EditInput
                defaultValue={fmt(employee.targetPBNextYear)}
                onCommit={(v) =>
                  commit(
                    "targetPBNextYear",
                    Number(String(v).replace(/[^0-9.]/g, "")) || 0,
                  )
                }
              />
            </Row>

            <div className="col-span-4 border-b border-[#eceff3] p-1.5">
              <div className="mb-1 text-[9.5px] text-slate-600">
                Comp Manager Remarks
              </div>
              <textarea
                key={employee.id}
                defaultValue={employee.atRisk || ""}
                rows={2}
                onBlur={(e) => commit("atRisk", e.target.value)}
                className="w-full rounded border border-[#9fdcb6] bg-[#eafaf0] px-1.5 py-1 text-[9.5px] outline-none"
              />
            </div>

            <div className="col-span-2 border-b border-[#eceff3] p-1.5 text-[10px] text-slate-500">
              Designation
              <div className="mt-0.5 text-[#5c7396]">
                {employee.designation}
              </div>
            </div>
            <div className="border-b border-[#eceff3] p-1.5">
              <select
                key={employee.id}
                defaultValue={employee.newTitle}
                onChange={(e) => handleNewTitleChange(e.target.value)}
                className="w-full rounded border border-[#9fdcb6] bg-[#eafaf0] px-1 py-1 text-[10px] outline-none"
              >
                {NEW_TITLES.includes(employee.designation) ? null : (
                  <option>{employee.designation}</option>
                )}
                {NEW_TITLES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
            <div
              className="flex items-center justify-center border-b border-[#eceff3] p-1.5 text-[10.5px] font-semibold"
              style={{
                color:
                  employee.eligibleForPromotion === "Yes"
                    ? "#13804a"
                    : undefined,
              }}
            >
              {employee.eligibleForPromotion}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[#e1e5eb] px-3.5 py-2">
            <span className="text-[9px] text-slate-500">
              {index + 1} of {rows.length}
              {employee.reportingManager
                ? ` · ${employee.reportingManager}'s team`
                : ""}
            </span>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % rows.length)}
              className="rounded-md px-3 py-1.5 text-[10.5px] font-semibold text-white"
              style={{ background: NAVY }}
            >
              Save &amp; Next →
            </button>
          </div>
        </div>
      </div>

      {/* EMPLOYEE HISTORY — full width */}
      <div className="mt-3 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white shadow-sm">
        <div
          className="px-3.5 py-2 text-[13px] font-semibold text-white"
          style={{ background: NAVY }}
        >
          Employee History — {employee.name} · {historyRecords.length} cycles
        </div>
        <div className="max-h-[30vh] overflow-auto">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr>
                <th className="sticky top-0 border-b border-[#e0e5ec] bg-[#eef2f7] px-2 py-1.5 text-center text-[11px]">
                  Year
                </th>
                {HISTORY_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className="sticky top-0 border-b border-[#e0e5ec] bg-[#eef2f7] px-2 py-1.5 text-center text-[11px]"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-[#fff9dc]">
                <td className="border-t border-[#eef1f5] px-2 py-1.5 text-center text-[12px] font-bold text-[#1859a8]">
                  Apr-26 ★
                </td>
                <td className="border-t border-[#eef1f5] px-2 py-1.5 text-right text-[11px]">
                  {fmt(employee.currentAnnualBasePay)}
                </td>
                <td className="border-t border-[#eef1f5] px-2 py-1.5 text-right text-[11px]">
                  0
                </td>
                <td className="border-t border-[#eef1f5] px-2 py-1.5 text-right text-[11px]">
                  {fmt(derived.totalPB)}
                </td>
                <td className="border-t border-[#eef1f5] px-2 py-1.5 text-right text-[11px]">
                  {fmt(employee.newRB)}
                </td>
                <td className="border-t border-[#eef1f5] px-2 py-1.5 text-right text-[11px]">
                  {fmt(derived.bonus)}
                </td>
                <td className="border-t border-[#eef1f5] px-2 py-1.5 text-right text-[11px]">
                  {fmt(employee.hikeAmount)}
                </td>
                <td className="border-t border-[#eef1f5] px-2 py-1.5 text-right text-[11px]">
                  {fmt(derived.totalCtc)}
                </td>
                <td className="border-t border-[#eef1f5] px-2 py-1.5 text-right text-[11px]">
                  {fmt(employee.targetPBNextYear)}
                </td>
                <td className="border-t border-[#eef1f5] px-2 py-1.5 text-right text-[11px]">
                  {fmt(derived.newBase)}
                </td>
              </tr>
              {historyRecords.slice(1).map((h, i) => (
                <tr key={i}>
                  <td className="border-t border-[#eef1f5] px-2 py-1.5 text-center text-[12px] font-bold text-[#1859a8]">
                    {h.year}
                  </td>
                  {HISTORY_COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className="border-t border-[#eef1f5] px-2 py-1.5 text-right text-[11px]"
                    >
                      {fmt(h[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SMALL PRESENTATIONAL HELPERS
// ============================================================

function Field({ label, value, bold }) {
  return (
    <div>
      <span className="text-slate-400">{label}</span>
      <br />
      <span className={bold ? "font-bold" : undefined}>{value ?? "—"}</span>
    </div>
  );
}

function Header({ children, center }) {
  return (
    <div
      className={`border-b border-r border-[#d7dce3] bg-[#fafbfd] px-2 py-1.5 font-semibold uppercase tracking-wide text-slate-500 last:border-r-0 ${
        center ? "text-center" : ""
      }`}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  current,
  diff,
  diffText,
  diffPositive,
  muted,
  total,
  children,
}) {
  return (
    <>
      <div
        className={`flex items-center border-b border-r border-[#eceff3] px-2 py-1 text-[10px] ${
          total ? "bg-[#fafbfd] font-semibold" : "text-slate-600"
        }`}
      >
        {label}
      </div>
      <div
        className={`flex items-center border-b border-r border-[#eceff3] px-2 py-1 text-[10px] ${
          total ? "bg-[#fafbfd] font-semibold" : "text-[#5c7396]"
        }`}
      >
        {current}
      </div>
      <div className="flex items-center border-b border-r border-[#eceff3] px-2 py-1 text-[10px]">
        {children || (
          <span className={muted ? "text-[9px] text-slate-400" : undefined}>
            {diffText}
          </span>
        )}
      </div>
      <div
        className={`flex items-center justify-center border-b border-[#eceff3] px-2 py-1 text-center text-[10.5px] ${
          diffPositive ? "font-semibold text-[#13804a]" : "text-slate-400"
        } ${total ? "bg-[#fafbfd] font-semibold" : ""}`}
      >
        {diff ?? diffText}
      </div>
    </>
  );
}

function EditInput({ defaultValue, onCommit, className = "" }) {
  return (
    <input
      type="text"
      defaultValue={defaultValue}
      onBlur={(e) => onCommit(e.target.value)}
      className={`w-full rounded border border-[#9fdcb6] bg-[#eafaf0] px-1.5 py-1 text-[10px] outline-none focus:border-[#2563eb] ${className}`}
    />
  );
}
