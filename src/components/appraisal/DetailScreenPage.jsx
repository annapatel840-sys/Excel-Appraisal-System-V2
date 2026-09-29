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
import { useCatalystUser } from "@/lib/catalyst-auth";
import { currentTeamOf } from "@/lib/budget-engine";

import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

const APPRAISAL_HISTORY_API_URL = catalystFunctionUrl("appraisalhistoryapi");

const NAVY = "#12304f";
const TEAL = "#14a3a3";
/* Ledger look: Manrope. Load it once in index.html:
   <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"> */
const FONT = '"Manrope", "Segoe UI", system-ui, Arial, sans-serif';

/* Ledger tokens used by the left pane */
const INK = "#102A43";
const LTEAL = "#0B7A75";
const LINE = "#E3E9EC";
const SOFT = "#EEF3F3";
const MUTED = "#5F7482";

const CURRENT_CYCLE = "Apr-26";

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
const lakhs = (n) => `${((Number(n) || 0) / 1e5).toFixed(2)} L`;
const dash = (v) => (v === null || v === undefined || v === "" ? "—" : v);
const yrs = (v) => {
  const d = dash(v);
  return d === "—" || /yr/i.test(String(d)) ? d : `${d} yrs`;
};
const pctText = (v) => {
  const d = dash(v);
  return d === "—" || /%/.test(String(d)) ? d : `${d}%`;
};
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const signedPct = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;

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

export function DetailScreenPage() {
  const { rows: liveRows, updateCell, updateLinkedCells } = useAppraisal();
  const budgetCtx = useBudget();
  const { currentUser, isHR, hierarchy } = budgetCtx;
  const catalystUser = useCatalystUser();
  const allRows = liveRows || [];
  const role = String(catalystUser?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");

  const teamMatch = useMemo(() => {
    if (isHR || isTechEd) return null;
    return currentTeamOf(allRows, hierarchy, currentUser.name);
  }, [allRows, isHR, isTechEd, hierarchy, currentUser]);

  const rows = isHR || isTechEd ? allRows : teamMatch || [];
  const isScopedToTeam = isTechEd || !!(teamMatch && teamMatch.length > 0);

  const [index, setIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [ctxTab, setCtxTab] = useState("feedback");
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

      if (!key) {
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
        const response = await catalystFetch(
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
    [],
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

  /* ---------- Team metrics (computed from the rows this login can see) ---------- */
  // Team budget: expects the budget store to expose the updated budget for this login.
  // If your store uses a different name, change this one line. 0 = not connected.
  const teamBudget = Number(
    budgetCtx?.teamBudget ??
      budgetCtx?.updatedBudget ??
      budgetCtx?.budget?.updated ??
      0,
  );

  const metrics = useMemo(() => {
    const used = rows.reduce((s, r) => s + (Number(r.hikeAmount) || 0), 0);
    const tpb = rows.reduce((s, r) => s + (Number(r.targetPBNextYear) || 0), 0);
    const cur = teamBudget ? (used / teamBudget) * 100 : null;
    const withT = teamBudget ? ((used + tpb) / teamBudget) * 100 : null;

    const hikes = rows
      .filter((r) => Number(r.currentAnnualBasePay) > 0)
      .map((r) => ({
        r,
        v: ((Number(r.hikeAmount) || 0) / Number(r.currentAnnualBasePay)) * 100,
      }));
    const mine = employee ? hikes.find((x) => x.r === employee) : null;
    let percentile = null;
    let top = null;
    let median = null;
    if (mine && hikes.length > 1) {
      const below = hikes.filter((x) => x.v < mine.v).length;
      percentile = Math.round((below / (hikes.length - 1)) * 100);
      const sorted = hikes.slice().sort((a, b) => a.v - b.v);
      top = sorted[sorted.length - 1];
      const n = sorted.length;
      median =
        n % 2 ? sorted[(n - 1) / 2].v : (sorted[n / 2 - 1].v + sorted[n / 2].v) / 2;
    }

    const noHike = rows.filter((r) => !(Number(r.hikeAmount) > 0)).length;
    const pbPaid = rows.reduce((s, r) => s + (Number(r.allocatedPBAmount) || 0), 0);
    const pbTarget = rows.reduce(
      (s, r) => s + (Number(r.targetPBAllocatedForMay) || 0),
      0,
    );

    return { used, tpb, cur, withT, mine, percentile, top, median, noHike, pbPaid, pbTarget };
  }, [rows, employee, teamBudget]);

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
    updateCell(employee.id, field, value, "Detail screen edit");
  };

  const commitLinked = (fields) => {
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
      : "No assigned team";

  return (
    <div
      className="flex h-[calc(100vh-60px)]"
      style={{ fontFamily: FONT, background: "#eef2f6" }}
    >
      <div
        className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-2.5 pb-6 [&::-webkit-scrollbar]:hidden"
        style={{
          color: "#0f1f33",
          fontSize: "12.5px",
          scrollbarWidth: "none",
        }}
      >
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2">
          {!employee ? (
            <div className="p-6 text-sm text-slate-500">
              No employees are visible for this login.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 min-[1000px]:grid-cols-[370px_minmax(0,1fr)]">
                {/* LEFT COLUMN — employee details + Feedback / Team metrics */}
                <div className="relative min-h-[460px]">
                  <LeftPane
                    employee={employee}
                    priorCycles={priorCycles}
                    loading={!!historyState?.loading}
                    tab={ctxTab}
                    onTab={setCtxTab}
                    metrics={metrics}
                    teamBudget={teamBudget}
                    rowsCount={rows.length}
                    scopeLabel={scopeLabel}
                  />
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
                      label="Retention Bonus"
                      current={inr(employee.newRB ?? 0)}
                      diffText="—"
                    >
                      <ReadOnlyInput value={inr(employee.newRB ?? 0)} disabled />
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

                <div
                  className="min-w-0 max-h-[40vh] overflow-x-hidden overflow-y-auto [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none" }}
                >
                  <table className="w-full table-fixed border-collapse text-[10px]">
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
    </div>
  );
}

/* ============================================================
   LEFT PANE — employee details + Feedback / Team metrics tabs
   ============================================================ */

function LeftPane({
  employee,
  priorCycles,
  loading,
  tab,
  onTab,
  metrics,
  teamBudget,
  rowsCount,
  scopeLabel,
}) {
  const initials = String(employee.name || "?")
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const facts = [
    ["Manager rating", dash(employee.managerRating)],
    ["RR", pctText(employee.rrPercent)],
    [
      "Experience",
      `${yrs(employee.totalExperience)} · ${yrs(employee.wissenExperience)} here`,
    ],
    ["Interviews", dash(employee.interviewCount)],
  ];

  const items = [
    {
      year: CURRENT_CYCLE,
      current: true,
      designation: employee.designation,
      client: employee.clientRating,
      rr: employee.rrPercent,
      rating: employee.managerRating,
      feedback:
        employee.feedback ||
        employee.atRisk ||
        "Feedback captured during the review.",
    },
    ...priorCycles.map((h) => ({
      year: h.year,
      designation: h.designation,
      client: h.clientRating,
      rr: h.rrPercent,
      rating: h.rating,
      feedback: h.feedback,
    })),
  ];

  const pctNow = metrics.cur;
  const badgeStyle =
    pctNow > 100
      ? { background: "#FDECEA", color: "#912018" }
      : pctNow > 90
        ? { background: "#FBF3E4", color: "#7A5212" }
        : { background: "#E6F3F2", color: "#0B5F5B" };

  return (
    <section
      aria-label="Employee"
      className="flex min-h-0 flex-col overflow-hidden rounded-[10px] border bg-white min-[1000px]:absolute min-[1000px]:inset-0"
      style={{
        borderColor: LINE,
        boxShadow: "0 1px 2px rgba(16,42,67,.04)",
      }}
    >
      {/* Who */}
      <div className="flex shrink-0 items-center gap-3 px-3.5 pb-2.5 pt-3.5">
        <div
          aria-hidden="true"
          className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full text-[16px] font-extrabold"
          style={{ background: "#E6F3F2", color: "#0B5F5B" }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div
            className="text-[17px] font-extrabold leading-tight"
            style={{ color: INK, letterSpacing: "-.01em" }}
          >
            {employee.name}
          </div>
          <div className="mt-0.5 truncate text-[12.5px]" style={{ color: MUTED }}>
            <span className="font-bold" style={{ color: "#0B6A66" }}>
              {employee.empId ?? "—"}
            </span>{" "}
            · {dash(employee.designation)}
          </div>
          <div className="truncate text-[12.5px]" style={{ color: MUTED }}>
            Reports to {dash(employee.reportingManager)}
          </div>
        </div>
      </div>

      {/* Facts */}
      <dl
        className="mx-3.5 mb-3 grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-lg border"
        style={{ background: SOFT, borderColor: SOFT }}
      >
        {facts.map(([label, value]) => (
          <div key={label} className="bg-white px-2.5 py-[7px]">
            <dt className="text-[11px]" style={{ color: MUTED }}>
              {label}
            </dt>
            <dd
              className="m-0 mt-px truncate text-[13px] font-bold"
              style={{ color: INK }}
              title={String(value)}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Tabs */}
      <div
        className="flex shrink-0 gap-[18px] border-b px-3.5"
        style={{ borderColor: LINE }}
        role="tablist"
      >
        {[
          ["feedback", "Feedback"],
          ["metrics", "Team metrics"],
        ].map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(key)}
              className="inline-flex items-center gap-1.5 border-b-2 pb-[9px] pt-2.5 text-[13px]"
              style={{
                color: active ? INK : MUTED,
                fontWeight: active ? 700 : 600,
                borderBottomColor: active ? LTEAL : "transparent",
              }}
            >
              {label}
              {key === "metrics" && pctNow !== null && (
                <span
                  className="rounded-full px-[7px] py-px text-[11px] font-bold"
                  style={badgeStyle}
                >
                  {pctNow.toFixed(0)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        className="max-h-[420px] min-h-0 flex-1 overflow-auto px-3.5 pb-3.5 pt-3 min-[1000px]:max-h-none"
        role="tabpanel"
      >
        {tab === "feedback" ? (
          <>
            <ol
              className="m-0 list-none border-l-2 py-0 pl-3.5 pr-0"
              style={{ borderColor: SOFT }}
            >
              {items.map((x, i) => (
                <li key={`${x.year}-${i}`} className="relative pb-3.5 pl-1">
                  <span
                    aria-hidden="true"
                    className="absolute top-1 h-2.5 w-2.5 rounded-full border-2"
                    style={{
                      left: -21,
                      background: x.current ? LTEAL : "#fff",
                      borderColor: x.current ? LTEAL : "#CBD5DA",
                    }}
                  />
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <b className="text-[13px]" style={{ color: INK }}>
                      {x.year}
                    </b>
                    {x.current && (
                      <span
                        className="rounded-full px-[7px] py-px text-[10.5px] font-bold"
                        style={{ background: "#E6F3F2", color: "#0B5F5B" }}
                      >
                        This cycle
                      </span>
                    )}
                    <span
                      className="basis-full text-[11.5px]"
                      style={{ color: MUTED }}
                    >
                      {dash(x.designation)} · Manager {dash(x.rating)} · Client{" "}
                      {dash(x.client)} · RR {pctText(x.rr)}
                    </span>
                  </div>
                  <p
                    className="m-0 mt-[5px] text-[12.5px] leading-normal"
                    style={{ color: "#334E5C" }}
                  >
                    {dash(x.feedback)}
                  </p>
                </li>
              ))}
            </ol>

            {!priorCycles.length && (
              <div className="text-[12px]" style={{ color: "#9AACB6" }}>
                {loading ? "Loading..." : "No prior cycles."}
              </div>
            )}

            <div className="mt-2.5 text-[11.5px]" style={{ color: MUTED }}>
              Client rating and past RR % are not in the sheet yet, so they show
              “—”.
            </div>
          </>
        ) : (
          <TeamMetrics
            employee={employee}
            metrics={metrics}
            teamBudget={teamBudget}
            rowsCount={rowsCount}
            scopeLabel={scopeLabel}
          />
        )}
      </div>
    </section>
  );
}

function BarRow({ label, pct, sub }) {
  const over = pct > 100;
  return (
    <>
      <div
        className="flex items-baseline justify-between gap-1.5 text-[12px]"
        style={{ color: "#334E5C" }}
      >
        <span>{label}</span>
        <b
          className="text-[15px]"
          style={{ color: over ? "#C0392B" : LTEAL }}
        >
          {pct.toFixed(0)}%
        </b>
      </div>
      <div
        className="my-1.5 h-1.5 overflow-hidden rounded-[3px]"
        style={{ background: SOFT }}
      >
        <div
          className="h-1.5"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: over ? "#C0392B" : LTEAL,
          }}
        />
      </div>
      <div className="text-[11px]" style={{ color: MUTED }}>
        {sub}
      </div>
    </>
  );
}

function MetricBox({ title, tag, children }) {
  return (
    <div
      className="mt-2 rounded-lg border px-[11px] py-2"
      style={{ borderColor: LINE }}
    >
      <div
        className="flex justify-between gap-1.5 text-[11px]"
        style={{ color: MUTED }}
      >
        <span>{title}</span>
        <i
          className="whitespace-nowrap rounded-[3px] px-1 text-[9.5px] not-italic"
          style={{ background: "#EEF2F7" }}
        >
          {tag}
        </i>
      </div>
      {children}
    </div>
  );
}

function TeamMetrics({ employee, metrics: m, teamBudget, rowsCount, scopeLabel }) {
  const left = teamBudget - m.used;
  const leftT = teamBudget - m.used - m.tpb;

  return (
    <div>
      <div className="mb-2.5 text-[11.5px]" style={{ color: MUTED }}>
        {scopeLabel} · {CURRENT_CYCLE}
      </div>

      <div className="rounded-lg border px-[11px] py-[9px]" style={{ borderColor: LINE }}>
        {m.cur !== null ? (
          <>
            <BarRow
              label="Current consumption"
              pct={m.cur}
              sub={`${lakhs(m.used)} used · ${
                left >= 0 ? `${lakhs(left)} left` : `${lakhs(-left)} over`
              } of ${lakhs(teamBudget)}`}
            />
            <div className="h-2" />
            <BarRow
              label="Including Target PB"
              pct={m.withT}
              sub={`+${lakhs(m.tpb)} Target PB · ${
                leftT >= 0 ? `${lakhs(leftT)} left` : `${lakhs(-leftT)} over`
              }`}
            />
          </>
        ) : (
          <div className="text-[12px]" style={{ color: MUTED }}>
            Team budget is not connected yet. Used so far: {lakhs(m.used)} of
            hike, plus {lakhs(m.tpb)} Target PB.
          </div>
        )}
      </div>

      <MetricBox title="Hike % — percentile in team" tag="Metric 2">
        {m.percentile !== null ? (
          <>
            <div className="mt-0.5 text-[16px] font-bold" style={{ color: INK }}>
              {ordinal(m.percentile)}{" "}
              <span className="text-[12px] font-normal" style={{ color: MUTED }}>
                percentile · {String(employee.name).split(" ")[0]}{" "}
                {signedPct(m.mine.v)}
              </span>
            </div>
            <div
              className="relative my-1.5 h-1.5 rounded-[3px]"
              style={{ background: SOFT }}
            >
              <div
                className="absolute -top-[3px] h-3 w-[3px] rounded-[1px]"
                style={{ left: `${m.percentile}%`, background: "#B7791F" }}
              />
            </div>
            <div className="text-[11px]" style={{ color: MUTED }}>
              Highest {signedPct(m.top.v)} ({m.top.r.name}) · median{" "}
              {signedPct(m.median)}
            </div>
          </>
        ) : (
          <div className="text-[11px]" style={{ color: MUTED }}>
            Not enough people in the team yet.
          </div>
        )}
      </MetricBox>

      <MetricBox title="No hike this cycle" tag="Metric 3">
        <div className="mt-0.5 text-[16px] font-bold" style={{ color: INK }}>
          {m.noHike}{" "}
          <span className="text-[12px] font-normal" style={{ color: MUTED }}>
            of {rowsCount} employees
          </span>
        </div>
      </MetricBox>

      <MetricBox title="PB paid vs target" tag="Metric 4">
        <div className="mt-0.5 text-[16px] font-bold" style={{ color: INK }}>
          {m.pbTarget ? `${((m.pbPaid / m.pbTarget) * 100).toFixed(0)}%` : "—"}{" "}
          <span className="text-[12px] font-normal" style={{ color: MUTED }}>
            {lakhs(m.pbPaid)} of {lakhs(m.pbTarget)} target
          </span>
        </div>
      </MetricBox>

      <div className="mt-2.5 text-[11.5px]" style={{ color: MUTED }}>
        Team only; org comparisons are HR-only.
      </div>
    </div>
  );
}

/* ============================================================
   Small display primitives for the right pane and history grid
   ============================================================ */

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
      className="break-words border-b px-1 py-1 text-center text-[9px] font-bold"
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
          className="break-all border-b px-1 py-1 text-right text-[9px]"
          style={{ borderColor: "#eef1f5" }}
        >
          {fmt(v)}
        </td>
      ))}
    </tr>
  );
}