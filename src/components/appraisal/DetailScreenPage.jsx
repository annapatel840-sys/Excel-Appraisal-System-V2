// import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// import { useAppraisal } from "@/lib/appraisal-store";
// import {
//   NEW_TITLES,
//   INSTALLMENT_OPTIONS,
//   inr,
//   totalOfPB,
//   totalBonus as calcTotalBonus,
//   newBaseSalary,
//   totalCTCWithRewards,
// } from "@/lib/appraisal-data";

// const APPRAISAL_HISTORY_API_URL =
//   "https://appraisalperformancehike-60088966704.development.catalystserverless.in/server/appraisalhistoryapi/";
// const NAVY = "#17365d";

// // Year of the cycle being edited on screen right now (shown as the
// // "Apr-26 ★" row). Bump this each appraisal cycle. We match against
// // BOTH the plain year ("2026") and the display label ("Apr-26") below,
// // because the history API has been seen returning either format for
// // the in-progress cycle.
// const CURRENT_CYCLE_YEAR = "2026";
// const CURRENT_CYCLE_LABEL = "Apr-26";

// // ============================================================
// // HISTORY LOADING (mirrors AppraisalGrid's loader; local copy
// // so this page stays a standalone, self-contained file)
// // ============================================================

// const normalizeHistoryRecord = (record) => {
//   const basePay = Number(record?.base_pay) || 0;
//   const hike = Number(record?.hike_amount) || 0;

//   return {
//     year:
//       record?.appraisal_year !== null && record?.appraisal_year !== undefined
//         ? String(record.appraisal_year)
//         : "—",
//     basePay,
//     joiningBonus: Number(record?.joining_bonus) || 0,
//     performanceBonus: Number(record?.performance_bonus) || 0,
//     retentionBonus: Number(record?.retention_bonus) || 0,
//     totalBonus: Number(record?.total_bonus) || 0,
//     hikeAmount: hike,
//     designation: record?.designation ? String(record.designation) : "—",
//     rating: record?.rating ? String(record.rating) : "—",
//     feedback: record?.manager_rating ? String(record.manager_rating) : "—",
//     targetPB: Number(record?.target_performance_bonus) || 0,
//     newCTC: Number(record?.new_ctc) || 0,
//     newBasePay: basePay + hike,
//   };
// };

// const HISTORY_COLUMNS = [
//   { key: "basePay", label: "Curr Base Pay" },
//   { key: "joiningBonus", label: "Joining Bonus" },
//   { key: "performanceBonus", label: "Perf. Bonus" },
//   { key: "retentionBonus", label: "Retention Bonus" },
//   { key: "totalBonus", label: "Total Bonus" },
//   { key: "hikeAmount", label: "Hike Amount" },
//   { key: "newCTC", label: "Total CTC" },
//   { key: "targetPB", label: "Target PB" },
//   { key: "newBasePay", label: "New Base Pay" },
// ];

// const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-IN");

// // Loosely normalize a year/label for comparison: lowercase, strip
// // everything that isn't a letter or digit. "Apr-26" -> "apr26",
// // "2026" -> "2026", " 2026 " -> "2026". This lets us match the
// // in-progress cycle whichever format the API sends it back in.
// const normalizeYearKey = (y) =>
//   String(y ?? "")
//     .trim()
//     .toLowerCase()
//     .replace(/[^a-z0-9]/g, "");

// const CURRENT_CYCLE_KEYS = new Set([
//   normalizeYearKey(CURRENT_CYCLE_YEAR),
//   normalizeYearKey(CURRENT_CYCLE_LABEL),
// ]);

// // A "blank placeholder" record: no real designation/rating/feedback
// // AND no real money on it. This is what a duplicate/incomplete
// // in-progress-cycle row from the API looks like, regardless of what
// // year label it was saved under — so we drop it as a safety net even
// // if its year doesn't match CURRENT_CYCLE_KEYS.
// const isBlankRecord = (h) =>
//   h.designation === "—" &&
//   h.rating === "—" &&
//   h.feedback === "—" &&
//   !h.basePay &&
//   !h.totalBonus &&
//   !h.newCTC &&
//   !h.hikeAmount;

// // ============================================================
// // COMPONENT
// // ============================================================

// export function DetailScreenPage() {
//   const { rows: liveRows, updateCell, updateLinkedCells } = useAppraisal();

//   const rows = liveRows && liveRows.length > 0 ? liveRows : "-";
//   const isDemo = !(liveRows && liveRows.length > 0);

//   const [index, setIndex] = useState(0);
//   const [search, setSearch] = useState("");
//   const [historyByEmpId, setHistoryByEmpId] = useState({});
//   const historyPromiseRef = useRef(new Map());

//   const employee = rows[Math.min(index, rows.length - 1)] || rows[0];

//   // ----------------------------------------------------------
//   // HISTORY LOAD (skipped for demo rows — no real emp_id to fetch)
//   // ----------------------------------------------------------

//   const loadHistory = useCallback(
//     (empId) => {
//       const key = String(empId || "").trim();

//       if (!key || isDemo) {
//         return Promise.resolve([]);
//       }

//       const existing = historyPromiseRef.current.get(key);

//       if (existing) {
//         return existing;
//       }

//       setHistoryByEmpId((prev) => ({
//         ...prev,
//         [key]: { loading: true, data: [], error: "" },
//       }));

//       const promise = (async () => {
//         const response = await fetch(
//           `${APPRAISAL_HISTORY_API_URL}?emp_id=${encodeURIComponent(key)}`,
//         );

//         if (!response.ok) {
//           throw new Error(`History request failed (${response.status}).`);
//         }

//         const result = await response.json();

//         if (!result?.success) {
//           throw new Error(result?.message || "Failed to load history.");
//         }

//         const records = Array.isArray(result?.data) ? result.data : [];

//         return records
//           .map(normalizeHistoryRecord)
//           .sort((a, b) => String(b.year).localeCompare(String(a.year)));
//       })();

//       historyPromiseRef.current.set(key, promise);

//       promise
//         .then((data) => {
//           setHistoryByEmpId((prev) => ({
//             ...prev,
//             [key]: { loading: false, data, error: "" },
//           }));
//         })
//         .catch((error) => {
//           historyPromiseRef.current.delete(key);

//           setHistoryByEmpId((prev) => ({
//             ...prev,
//             [key]: {
//               loading: false,
//               data: [],
//               error: error?.message || "Unable to load history.",
//             },
//           }));
//         });

//       return promise;
//     },
//     [isDemo],
//   );

//   useEffect(() => {
//     if (employee?.empId) {
//       loadHistory(employee.empId).catch(() => {});
//     }
//   }, [employee?.empId, loadHistory]);

//   const empKey = employee ? String(employee.empId || "").trim() : "";
//   const historyState = historyByEmpId[empKey];
//   const historyRecords = historyState?.data || [];

//   // The "Apr-26 ★" row above is always built live from `employee`, the
//   // in-progress cycle. If that same cycle has already been written to
//   // the history API — under "2026", "Apr-26", or as a blank
//   // placeholder row — it must NOT also be listed below. We match on a
//   // normalized year key (catches both label formats) AND drop any
//   // blank placeholder row outright, then dedupe repeated years.
//   const priorCycles = useMemo(() => {
//     const seen = new Set();
//     const result = [];

//     for (const record of historyRecords) {
//       const yearKey = normalizeYearKey(record.year);

//       if (CURRENT_CYCLE_KEYS.has(yearKey)) continue;
//       if (isBlankRecord(record)) continue;
//       if (seen.has(yearKey)) continue;

//       seen.add(yearKey);
//       result.push(record);
//     }

//     return result;
//   }, [historyRecords]);

//   // ----------------------------------------------------------
//   // DERIVED CALCULATIONS (reusing your existing formula fns)
//   // ----------------------------------------------------------

//   const derived = useMemo(() => {
//     if (!employee) return null;

//     const totalPB = totalOfPB(employee);
//     const bonus = calcTotalBonus(employee);
//     const newBase = newBaseSalary(employee);
//     const totalCtc = totalCTCWithRewards(employee);

//     return { totalPB, bonus, newBase, totalCtc };
//   }, [employee]);

//   const prevRecord = priorCycles[0];
//   const prevTotalBonus = prevRecord
//     ? prevRecord.performanceBonus + prevRecord.retentionBonus
//     : 0;
//   const prevCtc = prevRecord
//     ? prevRecord.newBasePay +
//       prevRecord.performanceBonus +
//       prevRecord.retentionBonus
//     : 0;

//   // ----------------------------------------------------------
//   // SEARCH -> JUMP TO EMPLOYEE
//   // ----------------------------------------------------------

//   const handleSearch = (value) => {
//     setSearch(value);

//     const q = value.trim().toLowerCase();

//     if (!q) return;

//     const found = rows.findIndex(
//       (row) =>
//         String(row.name || "")
//           .toLowerCase()
//           .startsWith(q) || String(row.empId || "").toLowerCase() === q,
//     );

//     if (found > -1) setIndex(found);
//   };

//   // ----------------------------------------------------------
//   // FIELD EDIT HANDLERS — write through the same store calls
//   // your grid already uses, so edits actually save (skipped
//   // for demo rows, which have no backing Catalyst record).
//   // ----------------------------------------------------------

//   const commit = (field, value) => {
//     if (isDemo) return; // nothing to persist for demo data
//     updateCell(employee.id, field, value, "Detail screen edit");
//   };

//   const commitLinked = (fields) => {
//     if (isDemo) return;
//     updateLinkedCells(employee.id, fields, "Detail screen edit");
//   };

//   const handleNewBasePayChange = (raw) => {
//     const value = Number(String(raw).replace(/[^0-9.]/g, "")) || 0;
//     const hike = value - (Number(employee.currentAnnualBasePay) || 0);
//     const pct = employee.currentAnnualBasePay
//       ? Number(((hike / employee.currentAnnualBasePay) * 100).toFixed(1))
//       : 0;

//     commitLinked({ hikeAmount: hike, hikePct: pct });
//   };

//   const handleNewTitleChange = (value) => {
//     const changed = value !== employee.designation;

//     commitLinked({
//       newTitle: value,
//       eligibleForPromotion: changed ? "Yes" : "No",
//     });
//   };

//   if (!employee) {
//     return (
//       <div className="p-6 text-sm text-slate-500">No employees to show.</div>
//     );
//   }

//   return (
//     <div className="mx-auto max-w-[1260px] p-4">
//       {isDemo && (
//         <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
//           Showing static demo data — no employees are loaded yet from Catalyst.
//         </div>
//       )}

//       <div className="grid grid-cols-1 gap-4 lg:grid-cols-[460px_1fr] lg:items-stretch">
//         {/* LEFT COLUMN */}
//         <div className="flex flex-col gap-4">
//           <div className="overflow-hidden rounded-lg border border-[#d4dbe5] bg-white shadow-sm">
//             <div
//               className="px-3.5 py-2 text-center text-[13.5px] font-semibold text-white"
//               style={{ background: NAVY }}
//             >
//               Employee Details
//             </div>
//             <div className="grid grid-cols-2 gap-x-5 gap-y-3 p-4 text-[12px] sm:grid-cols-3">
//               <Field label="Employee Name" value={employee.name} bold />
//               <Field label="Employee ID" value={employee.empId} bold />
//               <Field label="Designation" value={employee.designation} />
//               <Field
//                 label="Reporting Manager"
//                 value={employee.reportingManager}
//               />
//               <Field label="Manager Rating" value={employee.managerRating} />
//               <Field
//                 label="Total Exp"
//                 value={`${employee.totalExperience ?? "—"} yrs`}
//               />
//               <Field
//                 label="Org Exp"
//                 value={`${employee.wissenExperience ?? "—"} yrs`}
//               />
//               <Field
//                 label="Interview Count"
//                 value={employee.interviewCount ?? "—"}
//               />
//               <Field label="RR %" value={`${employee.rrPercent ?? "—"}%`} />
//             </div>
//           </div>

//           {/* RATING & FEEDBACK HISTORY — stretches to fill the
//               remaining left-column height so there's no dead
//               whitespace below it next to the taller right panel */}
//           <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-[#d4dbe5] bg-white shadow-sm">
//             <div
//               className="px-3.5 py-2 text-[12.5px] font-semibold text-white"
//               style={{ background: NAVY }}
//             >
//               Rating &amp; feedback history
//             </div>
//             <div className="flex-1 overflow-auto">
//               <table className="w-full table-fixed border-collapse">
//                 <thead>
//                   <tr>
//                     <th className="w-16 border-b border-r border-[#e1e5eb] bg-[#fafbfd] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
//                       Year
//                     </th>
//                     <th className="w-24 border-b border-r border-[#e1e5eb] bg-[#fafbfd] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
//                       Desig.
//                     </th>
//                     <th className="w-12 border-b border-r border-[#e1e5eb] bg-[#fafbfd] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
//                       Rtg
//                     </th>
//                     <th className="border-b border-[#e1e5eb] bg-[#fafbfd] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
//                       Feedback
//                     </th>
//                   </tr>
//                 </thead>
//                 <tbody>
//                   <tr className="bg-[#fff9dc]">
//                     <td className="border-b border-r border-[#eef1f5] px-3 py-2.5 text-[11.5px] font-bold text-[#1559a6]">
//                       Apr-26 ★
//                     </td>
//                     <td className="border-b border-r border-[#eef1f5] px-3 py-2.5 text-[11.5px]">
//                       {employee.designation}
//                     </td>
//                     <td className="border-b border-r border-[#eef1f5] px-3 py-2.5 text-[11.5px]">
//                       {employee.rating}
//                     </td>
//                     <td className="border-b border-[#eef1f5] px-3 py-2.5 text-[11.5px] leading-relaxed">
//                       {employee.atRisk ||
//                         "Feedback captured during the review."}
//                     </td>
//                   </tr>
//                   {priorCycles.map((h, i) => (
//                     <tr
//                       key={h.year ?? i}
//                       className={i % 2 === 1 ? "bg-[#fafbfd]" : undefined}
//                     >
//                       <td className="border-b border-r border-[#eef1f5] px-3 py-2.5 text-[11.5px] font-bold text-[#1559a6]">
//                         {h.year}
//                       </td>
//                       <td className="border-b border-r border-[#eef1f5] px-3 py-2.5 text-[11.5px]">
//                         {h.designation}
//                       </td>
//                       <td className="border-b border-r border-[#eef1f5] px-3 py-2.5 text-[11.5px]">
//                         {h.rating}
//                       </td>
//                       <td className="border-b border-[#eef1f5] px-3 py-2.5 text-[11.5px] leading-relaxed">
//                         {h.feedback}
//                       </td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//               {!priorCycles.length && !isDemo && (
//                 <div className="flex h-24 items-center justify-center text-[11px] text-slate-400">
//                   {historyState?.loading
//                     ? "Loading..."
//                     : "No prior cycles on record."}
//                 </div>
//               )}
//             </div>
//             <div className="border-t border-[#eceff3] px-3.5 py-2 text-center text-[10px] text-slate-400">
//               Showing {priorCycles.length + 1} review cycle
//               {priorCycles.length === 0 ? "" : "s"}
//             </div>
//           </div>
//         </div>

//         {/* RIGHT COLUMN — COMPENSATION INPUT SCREEN (unchanged height/padding) */}
//         <div className="overflow-hidden rounded-lg border border-[#d4dbe5] bg-white shadow-sm">
//           <div
//             className="px-3.5 py-2 text-center text-[13.5px] font-semibold text-white"
//             style={{ background: NAVY }}
//           >
//             Compensation Input Screen
//           </div>

//           <div className="flex items-center gap-2 border-b border-[#e1e5eb] px-4 py-2.5">
//             <input
//               type="text"
//               value={search}
//               onChange={(e) => handleSearch(e.target.value)}
//               placeholder="Search by name or employee ID"
//               className="flex-1 rounded border border-[#cbd3df] px-2.5 py-1.5 text-[12px] outline-none focus:border-[#2563eb]"
//             />
//           </div>

//           <div className="grid grid-cols-[130px_92px_1fr_100px] text-[11px]">
//             <Header>Description</Header>
//             <Header>Current</Header>
//             <Header>Proposed</Header>
//             <Header center>Diff</Header>

//             <Row
//               label="Base Pay"
//               current={inr(employee.currentAnnualBasePay)}
//               diff={`+${fmt(employee.hikeAmount)} / ${(
//                 Number(employee.hikePct) || 0
//               ).toFixed(1)}%`}
//               diffPositive
//             >
//               <EditInput
//                 defaultValue={fmt(derived.newBase)}
//                 onCommit={handleNewBasePayChange}
//               />
//             </Row>

//             <Row
//               label="Joining Bonus"
//               current="0"
//               muted
//               diffText="n/a this cycle"
//             />

//             <Row
//               label="PB Allotted / Instalments"
//               current={`${inr(employee.targetPBAllocatedForMay)} / ${employee.pbInstallment}`}
//               diffText="—"
//             >
//               <div className="flex w-full items-center gap-2">
//                 <EditInput
//                   className="flex-1"
//                   defaultValue={fmt(employee.allocatedPBAmount)}
//                   onCommit={(v) =>
//                     commit(
//                       "allocatedPBAmount",
//                       Number(String(v).replace(/[^0-9.]/g, "")) || 0,
//                     )
//                   }
//                 />
//                 <select
//                   defaultValue={employee.pbInstallment}
//                   onChange={(e) => commit("pbInstallment", e.target.value)}
//                   className="w-16 rounded border border-[#9fdcb6] bg-[#eafaf0] px-1.5 py-1.5 text-[11px] outline-none"
//                 >
//                   {INSTALLMENT_OPTIONS.map((o) => (
//                     <option key={o}>{o}</option>
//                   ))}
//                 </select>
//               </div>
//             </Row>

//             <Row
//               label="RB"
//               current={fmt(employee.newRB)}
//               diff={`+${fmt(derived.bonus - prevTotalBonus)}`}
//               diffPositive
//             >
//               <EditInput
//                 defaultValue={fmt(employee.newRB)}
//                 onCommit={(v) =>
//                   commit(
//                     "newRB",
//                     Number(String(v).replace(/[^0-9.]/g, "")) || 0,
//                   )
//                 }
//               />
//             </Row>

//             <Row
//               label="Total Reward"
//               current={fmt(prevCtc)}
//               diffText={
//                 prevCtc
//                   ? `${(((derived.totalCtc - prevCtc) / prevCtc) * 100).toFixed(1)}%`
//                   : "—"
//               }
//               total
//             >
//               <div className="flex min-h-[32px] items-center px-2.5 text-[11.5px] font-semibold">
//                 {fmt(derived.totalCtc)}
//               </div>
//             </Row>

//             <Row
//               label="Target PB"
//               current={fmt(employee.targetPBAllocatedForMay)}
//               diffText="next yr"
//             >
//               <EditInput
//                 defaultValue={fmt(employee.targetPBNextYear)}
//                 onCommit={(v) =>
//                   commit(
//                     "targetPBNextYear",
//                     Number(String(v).replace(/[^0-9.]/g, "")) || 0,
//                   )
//                 }
//               />
//             </Row>

//             <div className="col-span-4 border-b border-[#eceff3] p-2.5">
//               <div className="mb-1.5 text-[10px] font-medium text-slate-600">
//                 Comp Manager Remarks
//               </div>
//               <textarea
//                 key={employee.id}
//                 defaultValue={employee.atRisk || ""}
//                 rows={2}
//                 onBlur={(e) => commit("atRisk", e.target.value)}
//                 className="w-full rounded border border-[#9fdcb6] bg-[#eafaf0] px-2 py-1.5 text-[11px] outline-none"
//               />
//             </div>

//             <div className="col-span-2 border-b border-[#eceff3] p-2.5 text-[11px] text-slate-500">
//               Designation
//               <div className="mt-1 text-[#5c7396]">{employee.designation}</div>
//             </div>
//             <div className="border-b border-[#eceff3] p-2.5">
//               <select
//                 key={employee.id}
//                 defaultValue={employee.newTitle}
//                 onChange={(e) => handleNewTitleChange(e.target.value)}
//                 className="w-full rounded border border-[#9fdcb6] bg-[#eafaf0] px-1.5 py-1.5 text-[11px] outline-none"
//               >
//                 {NEW_TITLES.includes(employee.designation) ? null : (
//                   <option>{employee.designation}</option>
//                 )}
//                 {NEW_TITLES.map((d) => (
//                   <option key={d}>{d}</option>
//                 ))}
//               </select>
//             </div>
//             <div
//               className="flex items-center justify-center border-b border-[#eceff3] p-2.5 text-[11.5px] font-semibold"
//               style={{
//                 color:
//                   employee.eligibleForPromotion === "Yes"
//                     ? "#13804a"
//                     : undefined,
//               }}
//             >
//               {employee.eligibleForPromotion}
//             </div>
//           </div>

//           <div className="flex items-center justify-between border-t border-[#e1e5eb] px-4 py-2.5">
//             <span className="text-[10px] text-slate-500">
//               {index + 1} of {rows.length}
//               {employee.reportingManager
//                 ? ` · ${employee.reportingManager}'s team`
//                 : ""}
//             </span>
//             <button
//               type="button"
//               onClick={() => setIndex((i) => (i + 1) % rows.length)}
//               className="rounded-md px-4 py-2 text-[11.5px] font-semibold text-white"
//               style={{ background: NAVY }}
//             >
//               Save &amp; Next →
//             </button>
//           </div>
//         </div>
//       </div>

//       {/* EMPLOYEE HISTORY — full width */}
//       <div className="mt-4 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white shadow-sm">
//         <div
//           className="px-4 py-2.5 text-[14px] font-semibold text-white"
//           style={{ background: NAVY }}
//         >
//           Employee History — {employee.name} · {priorCycles.length + 1} cycles
//         </div>
//         <div className="max-h-[30vh] overflow-auto">
//           <table className="w-full min-w-[1200px] border-collapse">
//             <thead>
//               <tr>
//                 <th className="sticky top-0 border-b border-r border-[#e0e5ec] bg-[#eef2f7] px-3 py-2.5 text-center text-[12px] font-semibold">
//                   Year
//                 </th>
//                 {HISTORY_COLUMNS.map((c, i) => (
//                   <th
//                     key={c.key}
//                     className={`sticky top-0 border-b border-[#e0e5ec] bg-[#eef2f7] px-3 py-2.5 text-center text-[12px] font-semibold ${
//                       i < HISTORY_COLUMNS.length - 1 ? "border-r" : ""
//                     }`}
//                   >
//                     {c.label}
//                   </th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody>
//               <tr className="bg-[#fff9dc]">
//                 <td className="border-t border-r border-[#eef1f5] px-3 py-2.5 text-center text-[12.5px] font-bold text-[#1859a8]">
//                   Apr-26 ★
//                 </td>
//                 <td className="border-t border-r border-[#eef1f5] px-3 py-2.5 text-right text-[12px]">
//                   {fmt(employee.currentAnnualBasePay)}
//                 </td>
//                 <td className="border-t border-r border-[#eef1f5] px-3 py-2.5 text-right text-[12px]">
//                   0
//                 </td>
//                 <td className="border-t border-r border-[#eef1f5] px-3 py-2.5 text-right text-[12px]">
//                   {fmt(derived.totalPB)}
//                 </td>
//                 <td className="border-t border-r border-[#eef1f5] px-3 py-2.5 text-right text-[12px]">
//                   {fmt(employee.newRB)}
//                 </td>
//                 <td className="border-t border-r border-[#eef1f5] px-3 py-2.5 text-right text-[12px]">
//                   {fmt(derived.bonus)}
//                 </td>
//                 <td className="border-t border-r border-[#eef1f5] px-3 py-2.5 text-right text-[12px]">
//                   {fmt(employee.hikeAmount)}
//                 </td>
//                 <td className="border-t border-r border-[#eef1f5] px-3 py-2.5 text-right text-[12px]">
//                   {fmt(derived.totalCtc)}
//                 </td>
//                 <td className="border-t border-r border-[#eef1f5] px-3 py-2.5 text-right text-[12px]">
//                   {fmt(employee.targetPBNextYear)}
//                 </td>
//                 <td className="border-t border-[#eef1f5] px-3 py-2.5 text-right text-[12px]">
//                   {fmt(derived.newBase)}
//                 </td>
//               </tr>
//               {priorCycles.map((h, i) => (
//                 <tr
//                   key={h.year ?? i}
//                   className={i % 2 === 1 ? "bg-[#fafbfd]" : undefined}
//                 >
//                   <td className="border-t border-r border-[#eef1f5] px-3 py-2.5 text-center text-[12.5px] font-bold text-[#1859a8]">
//                     {h.year}
//                   </td>
//                   {HISTORY_COLUMNS.map((c, ci) => (
//                     <td
//                       key={c.key}
//                       className={`border-t border-[#eef1f5] px-3 py-2.5 text-right text-[12px] ${
//                         ci < HISTORY_COLUMNS.length - 1 ? "border-r" : ""
//                       }`}
//                     >
//                       {fmt(h[c.key])}
//                     </td>
//                   ))}
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       </div>
//     </div>
//   );
// }

// // ============================================================
// // SMALL PRESENTATIONAL HELPERS
// // ============================================================

// function Field({ label, value, bold }) {
//   return (
//     <div>
//       <span className="text-slate-400">{label}</span>
//       <br />
//       <span className={bold ? "font-bold" : undefined}>{value ?? "—"}</span>
//     </div>
//   );
// }

// function Header({ children, center }) {
//   return (
//     <div
//       className={`border-b border-r border-[#d7dce3] bg-[#fafbfd] px-3 py-2 font-semibold uppercase tracking-wide text-slate-500 last:border-r-0 ${
//         center ? "text-center" : ""
//       }`}
//     >
//       {children}
//     </div>
//   );
// }

// function Row({
//   label,
//   current,
//   diff,
//   diffText,
//   diffPositive,
//   muted,
//   total,
//   children,
// }) {
//   return (
//     <>
//       <div
//         className={`flex items-center border-b border-r border-[#eceff3] px-3 py-2 text-[10.5px] ${
//           total ? "bg-[#fafbfd] font-semibold" : "text-slate-600"
//         }`}
//       >
//         {label}
//       </div>
//       <div
//         className={`flex items-center border-b border-r border-[#eceff3] px-3 py-2 text-[10.5px] ${
//           total ? "bg-[#fafbfd] font-semibold" : "text-[#5c7396]"
//         }`}
//       >
//         {current}
//       </div>
//       <div className="flex items-center border-b border-r border-[#eceff3] px-3 py-2 text-[10.5px]">
//         {children || (
//           <span className={muted ? "text-[9.5px] text-slate-400" : undefined}>
//             {diffText}
//           </span>
//         )}
//       </div>
//       <div
//         className={`flex items-center justify-center border-b border-[#eceff3] px-3 py-2 text-center text-[11.5px] ${
//           diffPositive ? "font-semibold text-[#13804a]" : "text-slate-400"
//         } ${total ? "bg-[#fafbfd] font-semibold" : ""}`}
//       >
//         {diff ?? diffText}
//       </div>
//     </>
//   );
// }

// function EditInput({ defaultValue, onCommit, className = "" }) {
//   return (
//     <input
//       type="text"
//       defaultValue={defaultValue}
//       onBlur={(e) => onCommit(e.target.value)}
//       className={`w-full rounded border border-[#9fdcb6] bg-[#eafaf0] px-2 py-1.5 text-[10.5px] outline-none focus:border-[#2563eb] ${className}`}
//     />
//   );
// }

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

  // No-scroll: lock the page scrollbar while this screen is open, restore on leave
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

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
        <div className="flex h-full flex-col gap-3">
          <div className="flex-1 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white shadow-sm">
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

          <div className="flex-1 overflow-hidden rounded-lg border border-[#d4dbe5] bg-white shadow-sm">
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

          <div className="grid grid-cols-[0.9fr_0.9fr_1.5fr_0.8fr] text-[10px]">
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

            {/* TARGET PB CRITERIA */}
            <div className="col-span-4 border-b border-[#eceff3] p-1.5">
              <div className="mb-1 text-[9.5px] text-slate-600">
                Target PB Criteria
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {/* Current */}
                <textarea
                  key={`criteria-current-${employee.id}`}
                  defaultValue={
                    employee.targetPBCriteria ||
                    "Client billability >= 85% for Q1-Q3"
                  }
                  rows={2}
                  className="w-full rounded border border-[#cbd3df] bg-[#f5f7fa] px-1.5 py-1 text-[9.5px] font-mono outline-none"
                  readOnly
                />

                {/* Proposed */}
                <textarea
                  key={`criteria-proposed-${employee.id}`}
                  defaultValue={
                    employee.targetPBCriteria ||
                    "Client billability >= 85% for Q1-Q3"
                  }
                  rows={2}
                  onBlur={(e) => commit("targetPBCriteria", e.target.value)}
                  className="w-full rounded border border-[#9fdcb6] bg-[#eafaf0] px-1.5 py-1 text-[9.5px] font-mono outline-none"
                />
              </div>
            </div>

            {/* DESIGNATION */}
            <div className="col-span-4 grid grid-cols-4 border-b border-[#eceff3] text-[10px]">
              {/* Current label */}
              <div className="border-r border-[#eceff3] p-1.5">
                <div className="text-[9.5px] text-slate-600">Designation</div>
                <div className="mt-0.5 text-[#5c7396]">
                  {employee.designation}
                </div>
              </div>

              {/* Current designation value */}
              <div className="border-r border-[#eceff3] p-1.5 text-[#5c7396]">
                {employee.designation}
              </div>

              {/* Proposed designation */}
              <div className="border-r border-[#eceff3] p-1.5">
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

              {/* Eligibility */}
              <div
                className="flex items-center px-2 p-1.5 text-[10.5px] font-semibold"
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

            {/* COMP MANAGER REMARKS */}
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
        <div className="overflow-hidden">
          <table className="w-full border-collapse">
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
