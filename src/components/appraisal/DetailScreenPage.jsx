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
import { useBudget } from "@/lib/budget-store";
import { currentTeamOf } from "@/lib/budget-engine";
import { TeamInsightsPanel } from "@/components/appraisal/TeamInsightsPanel";

const APPRAISAL_HISTORY_API_URL =
  "https://appraisalperformancehike-60088966704.development.catalystserverless.in/server/appraisalhistoryapi/";

// Final computed palette from the reference — the "v11 look" block near
// the bottom of the source CSS overrides the earlier declarations, so
// these are the values actually rendered, not the first ones written.
const NAVY = "#12304f";
const TEAL = "#14a3a3";
const FONT = '"IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif';

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

const normalizeYearKey = (y) =>
  String(y ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isCurrentCycleYearKey = (year) => {
  const raw = String(year ?? "")
    .trim()
    .toLowerCase();

  if (!raw) return false;

  return (
    raw === "2026" ||
    raw === "2026-27" ||
    raw === "fy2026" ||
    raw === "fy 2026" ||
    raw === "apr-26" ||
    raw === "apr 26" ||
    raw === "apr-2026" ||
    raw === "apr 2026" ||
    raw.includes("2026")
  );
};

const isBlankRecord = (h) =>
  h.designation === "—" &&
  h.rating === "—" &&
  h.feedback === "—" &&
  !h.basePay &&
  !h.totalBonus &&
  !h.newCTC &&
  !h.hikeAmount;

function goToTeamChanges() {
  window.history.pushState({}, "", "/employee-master?tab=teamChanges");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function DetailScreenPage() {
  const { rows: liveRows, updateCell, updateLinkedCells } = useAppraisal();
  const { currentUser, isHR, hierarchy } = useBudget();

  const allRows = liveRows && liveRows.length > 0 ? liveRows : [];
  const isDemo = !(liveRows && liveRows.length > 0);

  // Try to scope to the logged-in manager's team (everyone below them in
  // the demo hierarchy). Until real employees' `compManager` values match
  // real manager names, that scoping won't find anyone — so fall back to
  // the full live roster instead of showing a blank screen. Once real
  // manager names line up, this starts scoping automatically with no
  // further changes needed here.
  const teamMatch = useMemo(() => {
    if (isDemo || isHR) return null;
    return currentTeamOf(allRows, hierarchy, currentUser.name);
  }, [allRows, isDemo, isHR, hierarchy, currentUser]);

  const rows = teamMatch && teamMatch.length > 0 ? teamMatch : allRows;
  const isScopedToTeam = !!(teamMatch && teamMatch.length > 0);

  const [index, setIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [historyByEmpId, setHistoryByEmpId] = useState({});
  const historyPromiseRef = useRef(new Map());

  useEffect(() => {
    setIndex(0);
    setSearch("");
  }, [currentUser.name]);

  const employee = rows[Math.min(index, rows.length - 1)] || rows[0];

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

  const priorCycles = useMemo(() => {
    const seen = new Set();
    const result = [];

    for (const record of historyRecords) {
      if (isCurrentCycleYearKey(record.year)) continue;
      if (isBlankRecord(record)) continue;

      const yearKey = normalizeYearKey(record.year);

      if (!yearKey || seen.has(yearKey)) continue;

      seen.add(yearKey);
      result.push(record);
    }

    return result;
  }, [historyRecords]);

  const derived = useMemo(() => {
    if (!employee) return null;

    return {
      totalPB: totalOfPB(employee),
      bonus: calcTotalBonus(employee),
      newBase: newBaseSalary(employee),
      totalCtc: totalCTCWithRewards(employee),
    };
  }, [employee]);

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

  const commit = (field, value) => {
    if (isDemo) return;
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

  const scopeLabel = isHR
    ? "All employees"
    : isScopedToTeam
      ? `${currentUser.name}'s team`
      : "All employees";

  return (
    <div
      className="flex h-[calc(100vh-60px)]"
      style={{ fontFamily: FONT, background: "#eef2f6" }}
    >
      <div
        className="flex-1 overflow-y-auto p-2.5 pb-6"
        style={{ color: "#0f1f33", fontSize: "12.5px" }}
      >
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2">
          {isDemo && (
            <div
              className="rounded-[6px] border px-2.5 py-1.5 text-[11.5px]"
              style={{
                borderColor: "#fcd34d",
                background: "#fffbeb",
                color: "#92400e",
              }}
            >
              Showing static demo data — no employees are loaded yet from
              Catalyst.
            </div>
          )}

          {!employee ? (
            <div className="p-6 text-sm text-slate-500">
              No employees are visible for this login.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 min-[1000px]:grid-cols-[370px_minmax(0,1fr)]">
                {/* LEFT COLUMN */}
                <div className="flex flex-col gap-2">
                  {/* Employee Details */}
                  <div
                    className="overflow-hidden rounded-[10px] border shadow-[0_1px_2px_rgba(18,48,79,0.06)]"
                    style={{ background: "#fff", borderColor: "#d3dbe6" }}
                  >
                    <div
                      className="py-1.5 text-center text-[13px]"
                      style={{
                        background: NAVY,
                        color: "#fff",
                        fontWeight: 600,
                        letterSpacing: ".15px",
                      }}
                    >
                      Employee Details
                    </div>

                    <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 px-3 py-2 text-[12px]">
                      <Field label="Employee Name" value={employee.name} bold />

                      <div>
                        <span
                          className="text-[11px]"
                          style={{ color: "#5b6b80", fontWeight: 500 }}
                        >
                          Employee ID
                        </span>
                        <br />
                        <span
                          className="text-[12px] font-bold"
                          style={{ color: "#1859a8" }}
                        >
                          {employee.empId ?? "—"}
                        </span>
                      </div>

                      <Field label="Designation" value={employee.designation} />
                      <Field
                        label="Reporting Manager"
                        value={employee.reportingManager}
                      />
                      <Field
                        label="Manager Rating"
                        value={employee.managerRating}
                      />
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
                      <Field
                        label="RR %"
                        value={`${employee.rrPercent ?? "—"}%`}
                      />
                    </div>
                  </div>

                  {/* Rating & feedback history */}
                  <div
                    className="flex flex-1 flex-col overflow-hidden rounded-[10px] border shadow-[0_1px_2px_rgba(18,48,79,0.06)]"
                    style={{ background: "#fff", borderColor: "#d3dbe6" }}
                  >
                    <div
                      className="px-3 py-1.5 text-left text-[12px]"
                      style={{
                        background: NAVY,
                        color: "#fff",
                        fontWeight: 600,
                        letterSpacing: ".15px",
                      }}
                    >
                      Rating &amp; feedback history
                    </div>

                    <div className="max-h-[280px] overflow-y-auto">
                      <table
                        className="w-full table-fixed border-collapse text-[11px]"
                        style={{ lineHeight: 1.35 }}
                      >
                        <thead>
                          <tr>
                            <RfHead width="50px">Year</RfHead>
                            <RfHead width="66px">Desig.</RfHead>
                            <RfHead width="46px" center>
                              RR %
                            </RfHead>
                            <RfHead>Manager Rating</RfHead>
                          </tr>
                        </thead>

                        <tbody>
                          <RfRow
                            year="Apr-26 ★"
                            desig={employee.designation}
                            rr={employee.rrPercent}
                            rating={employee.managerRating}
                            feedback={
                              employee.atRisk ||
                              "Feedback captured during the review."
                            }
                            current
                          />

                          {priorCycles.map((h, i) => (
                            <RfRow
                              key={h.year ?? i}
                              year={h.year}
                              desig={h.designation}
                              rr={null}
                              rating={h.rating}
                              feedback={h.feedback}
                            />
                          ))}

                          {!priorCycles.length && !isDemo && (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-2 py-2.5 text-[12px]"
                                style={{ color: "#94a3b8" }}
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

                    <div
                      className="px-2 py-1.5 text-[10.5px]"
                      style={{ color: "#64748b" }}
                    >
                      Client rating and past RR % are not in the sheet yet, so
                      they show “—”.
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN — Compensation Input Screen */}
                <div
                  className="flex flex-col overflow-hidden rounded-[10px] border shadow-[0_1px_2px_rgba(18,48,79,0.06)]"
                  style={{ background: "#fff", borderColor: "#d3dbe6" }}
                >
                  <div
                    className="py-1.5 text-center text-[13px]"
                    style={{
                      background: NAVY,
                      color: "#fff",
                      fontWeight: 600,
                      letterSpacing: ".15px",
                    }}
                  >
                    Compensation Input Screen
                  </div>

                  <div
                    className="flex items-center gap-2 border-b px-2.5 py-1.5"
                    style={{ borderColor: "#e1e5eb" }}
                  >
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => handleSearch(e.target.value)}
                      placeholder="Search your team by name or employee ID"
                      className="h-7 flex-1 rounded border px-2 text-[12px] outline-none focus:border-[#2563eb]"
                      style={{ borderColor: "#cbd3df" }}
                    />
                    <span
                      className="whitespace-nowrap rounded border px-2 py-0.5 text-[11px]"
                      style={{
                        background: "#e6f0fb",
                        borderColor: "#b6d0ef",
                        color: "#1d4f8c",
                      }}
                    >
                      Scope: {scopeLabel} · {rows.length}
                    </span>
                  </div>

                  <div
                    className="grid text-[11.5px]"
                    style={{ gridTemplateColumns: "0.95fr 0.9fr 1.45fr 0.8fr" }}
                  >
                    <CompHead bg="#d6e0ec">Description</CompHead>
                    <CompHead bg="#e3e7ed">Current</CompHead>
                    <CompHead bg="#d3e3f6">Proposed</CompHead>
                    <CompHead bg="#eef1f5" center>
                      Diff
                    </CompHead>

                    <CompRow
                      label="Base Pay"
                      current={inr(employee.currentAnnualBasePay)}
                      diff={`+${fmt(employee.hikeAmount)} / ${(Number(employee.hikePct) || 0).toFixed(1)}%`}
                      diffPositive
                    >
                      <EditInput
                        defaultValue={fmt(derived.newBase)}
                        onCommit={handleNewBasePayChange}
                      />
                    </CompRow>

                    <CompRow
                      label="Joining Bonus"
                      current="0"
                      diffText="n/a this cycle"
                      muted
                    >
                      <ReadOnlyInput value="0" disabled />
                    </CompRow>

                    <CompRow
                      label="PB Allotted / Instalments"
                      current={`${inr(employee.targetPBAllocatedForMay)} / ${employee.pbInstallment ?? "—"}`}
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
                          onChange={(e) =>
                            commit("pbInstallment", e.target.value)
                          }
                          className="h-[26px] w-[50px] shrink-0 rounded border px-1.5 text-[11.5px] outline-none"
                          style={{
                            borderColor: "#7fa9dc",
                            background: "#e6f0fb",
                            color: "#0b2a4d",
                          }}
                        >
                          {INSTALLMENT_OPTIONS.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </div>
                    </CompRow>

                    <CompRow
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
                    </CompRow>

                    {/* Target PB Criteria — full-width row, textareas */}
                    <div
                      className="col-span-4 p-2"
                      style={{
                        background: "#e8eef6",
                        color: "#1e3a5f",
                        fontWeight: 700,
                        fontSize: "10.5px",
                      }}
                    >
                      Description
                    </div>

                    <CompFullRow label="Target PB Criteria">
                      <textarea
                        key={`criteria-current-${employee.id}`}
                        defaultValue={
                          employee.targetPBCriteria ||
                          "Client billability >= 85% for Q1-Q3"
                        }
                        rows={2}
                        readOnly
                        className="min-h-[34px] w-full resize-y rounded border px-2 py-1.5 text-[11.5px] leading-[1.3] outline-none"
                        style={{
                          borderColor: "#d0d5dd",
                          background: "#eceef2",
                          color: "#475569",
                        }}
                      />
                      <EditTextarea
                        defaultValue={
                          employee.newTargetPBCriteria ||
                          employee.targetPBCriteria ||
                          ""
                        }
                        onCommit={(v) => commit("targetPBCriteria", v)}
                      />
                    </CompFullRow>

                    {/* Designation / New Title / Promotion */}
                    <div
                      className="grid col-span-4 border-b text-[11.5px]"
                      style={{
                        gridTemplateColumns: "0.95fr 0.9fr 1.45fr 0.8fr",
                        borderColor: "#eceff3",
                      }}
                    >
                      <div
                        className="p-1.5"
                        style={{
                          background: "#e8eef6",
                          color: "#1e3a5f",
                          fontWeight: 700,
                        }}
                      >
                        Designation
                      </div>
                      <div
                        className="p-1.5"
                        style={{ background: "#f6f7f9", color: "#475569" }}
                      >
                        {employee.designation}
                      </div>
                      <div className="p-1.5" style={{ background: "#fff" }}>
                        <select
                          key={employee.id}
                          defaultValue={employee.newTitle}
                          onChange={(e) => handleNewTitleChange(e.target.value)}
                          className="w-full rounded border px-1.5 py-1.5 text-[11.5px] outline-none"
                          style={{
                            borderColor: "#7fa9dc",
                            background: "#e6f0fb",
                            color: "#0b2a4d",
                          }}
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
                        className="flex items-center justify-center p-1.5 text-center font-semibold"
                        style={{
                          background: "#fff",
                          color:
                            employee.eligibleForPromotion === "Yes"
                              ? "#13804a"
                              : "#94a3b8",
                        }}
                      >
                        {employee.eligibleForPromotion}
                      </div>
                    </div>

                    {/* Comp Manager Remarks */}
                    <div
                      className="p-2"
                      style={{
                        background: "#e8eef6",
                        color: "#1e3a5f",
                        fontWeight: 700,
                        fontSize: "10.5px",
                      }}
                    >
                      Description
                    </div>

                    <CompFullRow label="Comp Manager Remarks">
                      <div
                        className={`ro min-h-[34px] w-full rounded border px-1.5 py-1 text-[11.5px] leading-[1.3] ${
                          employee.prevRemarks ? "" : "opacity-70"
                        }`}
                        style={{
                          borderColor: "#d0d5dd",
                          background: "#eceef2",
                          color: employee.prevRemarks ? "#475569" : "#94a3b8",
                        }}
                      >
                        {employee.prevRemarks || "No remarks last cycle"}
                      </div>
                      <EditTextarea
                        key={employee.id}
                        defaultValue={employee.atRisk || ""}
                        placeholder="Add remarks"
                        onCommit={(v) => commit("atRisk", v)}
                      />
                    </CompFullRow>
                  </div>

                  <div
                    className="flex flex-wrap gap-3.5 px-2.5 py-1 text-[11px]"
                    style={{ color: "#475569" }}
                  >
                    <Legend sw="#e8eef6" border="#b8c6d8" label="Description" />
                    <Legend
                      sw="#f6f7f9"
                      border="#d0d5dd"
                      label="Current (read-only)"
                    />
                    <Legend
                      sw="#e6f0fb"
                      border="#7fa9dc"
                      label="Proposed (editable)"
                    />
                  </div>

                  <div
                    className="mt-auto flex items-center justify-between gap-3 border-t px-2.5 py-1.5"
                    style={{ borderColor: "#e1e5eb" }}
                  >
                    <div>
                      <div
                        className="text-[11.5px] font-bold"
                        style={{ color: "#334155" }}
                      >
                        {index + 1} of {rows.length} · {scopeLabel}
                      </div>
                      <div
                        className="text-[10.5px]"
                        style={{ color: "#64748b" }}
                      >
                        Previous and Next move only within the employees this
                        login can see.
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIndex((i) => Math.max(0, i - 1))}
                        disabled={index === 0}
                        className="rounded-[6px] border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-45"
                        style={{
                          borderColor: "#c5d0dd",
                          background: "#fff",
                          color: NAVY,
                        }}
                      >
                        ← Previous
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setIndex((i) => Math.min(rows.length - 1, i + 1))
                        }
                        className="rounded-[6px] px-3 py-1.5 text-[12px] font-semibold"
                        style={{ background: TEAL, color: "#fff" }}
                      >
                        {index === rows.length - 1 ? "Save" : "Save & Next →"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Employee History — full width */}
              <div
                className="overflow-hidden rounded-[10px] border shadow-[0_1px_2px_rgba(18,48,79,0.06)]"
                style={{ background: "#fff", borderColor: "#d3dbe6" }}
              >
                <div
                  className="px-3 py-1.5 text-left text-[12.5px]"
                  style={{
                    background: NAVY,
                    color: "#fff",
                    fontWeight: 600,
                    letterSpacing: ".15px",
                  }}
                >
                  Employee History — {employee.name} · {priorCycles.length + 1}{" "}
                  cycles
                </div>

                <div className="max-h-[40vh] overflow-auto">
                  <table className="w-full min-w-[760px] border-collapse text-[11px]">
                    <thead>
                      <tr>
                        <HistHead width="62px">Year</HistHead>
                        {HISTORY_COLUMNS.map((c) => (
                          <HistHead key={c.key}>{c.label}</HistHead>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      <HistRow
                        year="Apr-26 ★"
                        vals={[
                          employee.currentAnnualBasePay,
                          0,
                          derived.totalPB,
                          employee.newRB,
                          derived.bonus,
                          employee.hikeAmount,
                          derived.totalCtc,
                          employee.targetPBNextYear,
                          derived.newBase,
                        ]}
                        current
                      />

                      {priorCycles.map((h, i) => {
                        const tb =
                          (h.performanceBonus || 0) + (h.retentionBonus || 0);

                        return (
                          <HistRow
                            key={h.year ?? i}
                            year={h.year}
                            vals={[
                              h.basePay,
                              h.joiningBonus,
                              h.performanceBonus,
                              h.retentionBonus,
                              tb,
                              h.hikeAmount,
                              (h.newBasePay || 0) + tb,
                              h.targetPB,
                              h.newBasePay,
                            ]}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <TeamInsightsPanel onViewChanges={goToTeamChanges} />
    </div>
  );
}

/* ============================================================
   Small display primitives, matching the reference's classes 1:1
   ============================================================ */

function Field({ label, value, bold }) {
  return (
    <div>
      <span
        className="text-[11px]"
        style={{ color: "#5b6b80", fontWeight: 500 }}
      >
        {label}
      </span>
      <br />
      <span className={`text-[12px] ${bold ? "font-bold" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function RfHead({ children, width, center }) {
  return (
    <th
      className={`border-b px-[5px] py-1 text-left text-[10.5px] font-bold ${center ? "text-center" : ""}`}
      style={{
        width,
        borderColor: "#d7dce3",
        background: "#eef2f7",
        color: "#1e3a5f",
        lineHeight: 1.25,
      }}
    >
      {children}
    </th>
  );
}

function RfRow({ year, desig, rr, rating, feedback, current }) {
  const bg = current ? "#fff9dc" : undefined;

  return (
    <tr style={{ background: bg }}>
      <td
        className="border-b px-[5px] py-1 font-bold"
        style={{ borderColor: "#eef1f5", color: "#1559a6" }}
      >
        {year}
      </td>
      <td className="border-b px-[5px] py-1" style={{ borderColor: "#eef1f5" }}>
        {desig ?? "—"}
      </td>
      <td
        className="border-b px-[5px] py-1 text-center"
        style={{ borderColor: "#eef1f5", color: rr ? undefined : "#94a3b8" }}
      >
        {rr ? `${rr}%` : "—"}
      </td>
      <td
        className="border-b px-[5px] py-1 leading-snug"
        style={{
          borderColor: "#eef1f5",
          color: "#334155",
          overflowWrap: "anywhere",
        }}
        title={feedback}
      >
        {rating ?? "—"}
      </td>
    </tr>
  );
}

function CompHead({ children, bg, center }) {
  return (
    <div
      className={`flex items-center gap-1.5 border-b border-r px-2 py-1 text-[10.5px] font-bold ${
        center ? "justify-center" : ""
      }`}
      style={{ borderColor: "#d7dce3", background: bg, color: "#1e3a5f" }}
    >
      {children}
    </div>
  );
}

function CompRow({
  label,
  current,
  diff,
  diffText,
  diffPositive,
  muted,
  children,
}) {
  return (
    <>
      <div
        className="flex items-center border-b border-r px-2 py-1 font-bold"
        style={{
          borderColor: "#d7dce3",
          background: "#e8eef6",
          color: "#1e3a5f",
        }}
      >
        {label}
      </div>
      <div
        className="flex items-center border-b border-r px-2 py-1"
        style={{
          borderColor: "#d7dce3",
          background: "#f6f7f9",
          color: "#475569",
        }}
      >
        {current}
      </div>
      <div
        className="flex items-center border-b border-r px-2 py-1"
        style={{ borderColor: "#d7dce3", background: "#fff" }}
      >
        {children}
      </div>
      <div
        className="flex items-center justify-center border-b px-2 py-1 text-center"
        style={{
          borderColor: "#d7dce3",
          background: "#fff",
          color: diffPositive ? "#13804a" : "#94a3b8",
          fontWeight: diffPositive ? 700 : 400,
        }}
      >
        {diff ??
          (muted ? (
            <span className="text-[11px] text-slate-400">{diffText}</span>
          ) : (
            diffText
          ))}
      </div>
    </>
  );
}

function CompFullRow({ children }) {
  return (
    <>
      <div
        className="col-span-2 flex items-stretch border-b border-r p-2"
        style={{ borderColor: "#d7dce3", background: "#f6f7f9" }}
      >
        {children[0]}
      </div>
      <div
        className="col-span-1 flex items-stretch border-b border-r p-2"
        style={{ borderColor: "#d7dce3", background: "#fff" }}
      >
        {children[1]}
      </div>
      <div
        className="border-b"
        style={{ borderColor: "#d7dce3", background: "#fff" }}
      />
    </>
  );
}

function EditInput({ defaultValue, onCommit, className = "" }) {
  return (
    <input
      type="text"
      defaultValue={defaultValue}
      onBlur={(e) => onCommit(e.target.value)}
      className={`w-full min-w-0 rounded border px-1.5 py-1 text-[11.5px] outline-none focus:border-[#2563eb] focus:bg-[#f3f8fe] ${className}`}
      style={{
        borderColor: "#7fa9dc",
        background: "#e6f0fb",
        color: "#0b2a4d",
      }}
    />
  );
}

function EditTextarea({ defaultValue, placeholder, onCommit }) {
  return (
    <textarea
      defaultValue={defaultValue}
      placeholder={placeholder}
      rows={2}
      onBlur={(e) => onCommit(e.target.value)}
      className="min-h-[34px] w-full resize-y rounded border px-2 py-1.5 text-[11.5px] leading-[1.3] outline-none focus:border-[#2563eb] focus:bg-[#f3f8fe]"
      style={{
        borderColor: "#7fa9dc",
        background: "#e6f0fb",
        color: "#0b2a4d",
      }}
    />
  );
}

function ReadOnlyInput({ value, disabled }) {
  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      readOnly
      className="w-full rounded border px-1.5 py-1 text-[11.5px] outline-none"
      style={{
        borderColor: "#7fa9dc",
        background: "#e6f0fb",
        color: "#0b2a4d",
        opacity: disabled ? 0.6 : 1,
      }}
    />
  );
}

function Legend({ sw, border, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i
        className="inline-block h-3 w-3 border"
        style={{ background: sw, borderColor: border }}
      />
      {label}
    </span>
  );
}

function HistHead({ children, width }) {
  return (
    <th
      className="border-b px-1.5 py-1 text-center text-[10.5px] font-bold"
      style={{
        width,
        borderColor: "#d7dce3",
        background: "#eef2f7",
        color: "#1e3a5f",
        lineHeight: 1.2,
      }}
    >
      {children}
    </th>
  );
}

function HistRow({ year, vals, current }) {
  return (
    <tr style={{ background: current ? "#fff9dc" : undefined }}>
      <td
        className="border-b px-1.5 py-1 text-center font-bold"
        style={{ borderColor: "#eef1f5", color: "#1859a8" }}
      >
        {year}
      </td>
      {vals.map((v, i) => (
        <td
          key={i}
          className="border-b px-1.5 py-1 text-right"
          style={{ borderColor: "#eef1f5" }}
        >
          {fmt(v)}
        </td>
      ))}
    </tr>
  );
}
