// import { Fragment, useEffect, useMemo, useState } from "react";

// import { useCatalystUser } from "@/lib/catalyst-auth";
// import { useBudget } from "@/lib/budget-store";
// import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

// /* Budget Distribution uses persisted Budget_Distribution and
//    Budget_Distribution_Comp rows. The prior UI-only sample allocations have
//    been removed so this screen never displays invented team budgets. */

// const LEVELS = ["Tech ED", "Comp Manager"];
// const UTILISED_LABEL = "Hike Amount";

// const num = (v) => {
//   if (typeof v === "number") return Number.isFinite(v) ? v : 0;
//   if (v === null || v === undefined || v === "") return 0;
//   const parsed = Number(String(v).trim().replace(/[₹,\s]/g, "").replace(/^(?:INR|Rs\.?)/i, ""));
//   return Number.isFinite(parsed) ? parsed : 0;
// };
// // Amount with Indian grouping (no lakh rounding), e.g. 12,34,567.50
// const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
// const lakh = (n) => INR.format(num(n));
// const normalizeOwner = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
// // Employee IDs can themselves contain hyphens (for example WIS-1234).
// // The owner separator is the spaced delimiter " - ", not every hyphen.
// const ownerParts = (value) => {
//   const text = normalizeOwner(value);
//   if (!text) return [];
//   const separator = text.split(/\s+-\s+/);
//   return separator.length > 1 ? [text, ...separator] : [text];
// };
// const ownerKey = (value) => ownerParts(value)[1] || ownerParts(value)[0] || "";
// // identities: a list of normalized values, or one owner value such as
// // "EMP0051 - Ashok Kumar" (compared by its parts, never as a substring).
// const ownerMatches = (owner, identities) => {
//   if (!Array.isArray(identities)) identities = ownerParts(identities);
//   const parts = ownerParts(owner);
//   const compactParts = parts.map((part) => part.replace(/[^a-z0-9]/g, ""));
//   return parts.some((part) => identities.includes(part)) ||
//     compactParts.some((part) => identities.some((identity) => identity.replace(/[^a-z0-9]/g, "") === part));
// };

// const firstNonBlank = (object, keys) => {
//   for (const key of keys) {
//     const value = object?.[key];
//     if (value !== null && value !== undefined && String(value).trim() !== "") return value;
//   }
//   return 0;
// };
// const isActiveAndEligible = (employee) => {
//   // employeesapi has already joined Employee_Master and exposes the master
//   // decision as status + eligible_status. Prefer those canonical fields over
//   // stale/legacy aliases carried on an Appraisal_Sheet row.
//   const status = String(firstNonBlank(employee, ["status", "emp_status", "employee_status"]) || "").trim().toLowerCase();
//   const eligibility = String(firstNonBlank(employee, ["eligible_status", "eligibility_status", "eligibility", "eligible"]) || "").trim().toLowerCase().replace(/[ _-]+/g, "");
//   return status === "active" && ["eligible", "yes", "true", "1"].includes(eligibility);
// };
// const employeeUtilized = (employee) => {
//   // Prefer the same Appraisal_Sheet-based calculation returned by budgetmasterapi.
//   // Fall back to the local calculation for older deployed API responses.
//   const serverAmount = Number(employee?.utilized_amount);
//   if (employee?.utilized_amount !== null && employee?.utilized_amount !== undefined &&
//       String(employee.utilized_amount).trim() !== "" && Number.isFinite(serverAmount) &&
//       serverAmount !== 0) return serverAmount;

//   // Business rule: current-year awards minus previous-year awards.
//   // Ignore zero-filled aliases so another populated field can supply the value.
//   const amount = (keys) => {
//     for (const key of keys) {
//       const value = employee?.[key];
//       if (value === null || value === undefined || String(value).trim() === "") continue;
//       const parsed = num(value);
//       if (parsed !== 0) return parsed;
//     }
//     return 0;
//   };

//   const currentHike = amount(["hike_amount", "hikeAmount", "current_hike_amount"]);
//   // Appraisal_Sheet current-year performance bonus may be stored in the
//   // allocation/offer columns depending on the cycle's schema.
//   const currentPerformance = amount(["new_pb_to_be_offered", "newPBToBeOffered", "current_performance_bonus", "performance_bonus", "performanceBonus", "target_pb_allocated_for_may", "targetPBAllocatedForMay", "allocated_pb_amount", "allocatedPBAmount", "target_pb_next_year", "targetPBNextYear"]);
//   const currentRetention = amount(["new_rb", "newRB", "current_retention_bonus", "retention_bonus", "retentionBonus"]);
//   const currentJoining = amount(["joining_bonus", "joiningBonus", "current_joining_bonus"]);

//   // PB/RB-to-be-paid are previous-year values in the appraisal sheet.
//   const previousPerformance = amount(["previous_year_performance_bonus", "previousPerformanceBonus", "previous_year_pb", "pb_to_be_paid", "pbToBePaid", "previous_pb"]);
//   const previousRetention = amount(["previous_year_retention_bonus", "previousRetentionBonus", "previous_year_rb", "rb_to_be_paid", "rbToBePaid", "previous_rb"]);
//   const previousJoining = amount(["previous_year_joining_bonus", "previousJoiningBonus", "previous_year_jb", "previous_joining_bonus"]);

//   return currentHike + currentPerformance + currentRetention + currentJoining
//     - previousPerformance - previousRetention - previousJoining;
// };
// const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// function dateText(iso) {
//   const p = String(iso || "").slice(0, 10).split("-");
//   return p.length === 3 && MONTHS[Number(p[1]) - 1] ? p[2] + "-" + MONTHS[Number(p[1]) - 1] : iso || "—";
// }
// function nowParts() {
//   const d = new Date();
//   const pad = (n) => String(n).padStart(2, "0");
//   return { date: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()), time: pad(d.getHours()) + ":" + pad(d.getMinutes()) };
// }
// const byDate = (a, b) => String(a.date + (a.time || "")).localeCompare(String(b.date + (b.time || "")));

// function Chg({ d }) {
//   if (Math.abs(d) < 1) return <span className="mut">No change</span>;
//   return <span className={d > 0 ? "up" : "down"}>{(d > 0 ? "▲ " : "▼ ") + lakh(Math.abs(d))}</span>;
// }
// function ChangeCell({ from, to }) {
//   const d = to - from;
//   if (Math.abs(d) < 1) return <span className="mut">—</span>;
//   const p = from ? (d / from) * 100 : 0;
//   return (
//     <>
//       <Chg d={d} /> <span className={d > 0 ? "up" : "down"}>({(d > 0 ? "+" : "") + p.toFixed(1)}%)</span>
//     </>
//   );
// }

// function AuditTable({ list, showName }) {
//   if (!list.length) return <div className="muted-small" style={{ padding: "6px 0" }}>No % changes yet.</div>;
//   return (
//     <div className="bscroll">
//       <table className="trail">
//         <thead>
//           <tr>
//             <th>Date</th>
//             {showName && <th>Owner</th>}
//             <th className="n">Old %</th>
//             <th className="n">New %</th>
//             <th className="n">Budget before</th>
//             <th className="n">Budget after</th>
//             <th>Changed by</th>
//             <th>Reason</th>
//           </tr>
//         </thead>
//         <tbody>
//           {list.map((x, i) => (
//             <tr key={i}>
//               <td>{dateText(x.date) + (x.time ? " " + x.time : "")}</td>
//               {showName && <td style={{ fontWeight: 700 }}>{x.name}</td>}
//               <td className="n">{x.from === null ? "—" : x.from + "%"}</td>
//               <td className="n" style={{ fontWeight: 700 }}>{x.to}%</td>
//               <td className="n">{x.before === null ? "—" : lakh(x.before)}</td>
//               <td className="n">{lakh(x.after)}</td>
//               <td>{x.by}</td>
//               <td>{x.reason || "—"}</td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   );
// }

// export function TechEdBudgetDistribution() {
//   const user = useCatalystUser();
//   const {
//     budgetDistributionRows,
//     budgetCompManagerRows,
//     budgetMasterRows,
//     employeeRows = [],
//     techEdOwners = [],
//     totals: sharedBudgetTotals,
//     updateBudget,
//     loading: budgetLoading,
//     error: budgetError,
//   } = useBudget();
//   const myName = user?.name || "Unknown user";
//   const [cycleRows, setCycleRows] = useState([]);
//   const [activeCycleId, setActiveCycleId] = useState("");
//   const [cycleLoading, setCycleLoading] = useState(true);

//   useEffect(() => {
//     let mounted = true;
//     payrollCycleRequest("cycles")
//       .then((cycles) => {
//         if (!mounted) return;
//         const allCycles = Array.isArray(cycles) ? cycles : [];
//         setCycleRows(allCycles);
//         const active = allCycles.find(
//           (cycle) => String(cycle.status || "").trim().toLowerCase() === "active" && !cycle.archived,
//         );
//         const cycleId = active?.id ?? active?.appraisal_cycle_id ?? active?.cycle_id ?? active?.ROWID ?? "";
//         setActiveCycleId(cycleId ? String(cycleId) : "");
//       })
//       .catch((cycleError) => {
//         console.error("Failed to load appraisal cycles for Budget Distribution:", cycleError);
//         if (mounted) {
//           setCycleRows([]);
//           setActiveCycleId("");
//         }
//       })
//       .finally(() => {
//         if (mounted) setCycleLoading(false);
//       });
//     return () => { mounted = false; };
//   }, []);

//   const liveTech = useMemo(() => {
//     const identities = new Set(
//       [
//         myName, user?.name, user?.display_name, user?.first_name, user?.last_name,
//         [user?.first_name, user?.last_name].filter(Boolean).join(" "),
//         user?.email, user?.email_id, user?.user_id, user?.row_id, user?.ROWID,
//         user?.empId, user?.employeeId, user?.employee_id,
//       ].map(normalizeOwner).filter(Boolean),
//     );

//     // Resolve the signed-in person against the complete Tech-Ed directory first.
//     // Do not depend on employeeRows containing the Tech-Ed's own employee row:
//     // Tech-Ed-scoped employee APIs may return only their reports.
//     const directoryOwner = techEdOwners.find((item) =>
//       [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id]
//         .filter(Boolean)
//         .some((alias) => ownerMatches(alias, Array.from(identities))),
//     );
//     if (directoryOwner) {
//       [
//         directoryOwner.employee_id,
//         directoryOwner.row_id,
//         directoryOwner.ROWID,
//         directoryOwner.assignment,
//         directoryOwner.name,
//       ].filter(Boolean).forEach((value) => {
//         identities.add(normalizeOwner(value));
//         ownerParts(value).forEach((part) => identities.add(normalizeOwner(part)));
//       });
//     }

//     const employeeIdentityValues = (employee) => [
//       employee.row_id, employee.ROWID, employee.ROW_ID, employee.id,
//       employee.emp_id, employee.employee_id, employee.employeeId,
//       employee.emp_name, employee.employee_name, employee.name,
//       employee.email, employee.email_id, employee.emailId,
//     ].map(normalizeOwner).filter(Boolean);

//     // Resolve the logged-in account to an actual employee row where possible.
//     const loginEmployee = employeeRows.find((employee) =>
//       employeeIdentityValues(employee).some((value) => identities.has(value)),
//     );
//     if (loginEmployee) employeeIdentityValues(loginEmployee).forEach((value) => identities.add(value));

//     // Some session accounts are not employees. In that case, use the Appraisal
//     // Sheet assignment whose Tech-Ed owner contains the logged-in identity.
//     const ownerByForeignKey = new Map();
//     techEdOwners.forEach((item) => {
//       const fk = normalizeOwner(item?.row_id || item?.ROWID || "");
//       if (fk && item?.assignment) ownerByForeignKey.set(fk, String(item.assignment).trim());
//     });
//     const assignedOwners = Array.from(new Set(employeeRows
//       .map((employee) => {
//         const raw = String(employee.appraiser_tech_ed_row_id || employee.appraiser_tech_ed_appraisal_sheet || employee.appraiser_tech_ed || employee.appraiser_tech_ed_id ||
//           employee.appraiser_tech_ed1 || employee.appraiser_teched || employee.appraiserTechED || employee.tech_ed || employee.tech_ed_id || "").trim();
//         return ownerByForeignKey.get(normalizeOwner(raw)) || raw;
//       })
//       .filter((owner) => owner && ownerMatches(owner, Array.from(identities)))));

//     const allRows = budgetDistributionRows.filter((row) =>
//       row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed || row.appraiser_tech_ed,
//     );
//     const ownerForBudgetRow = (row) => {
//       const raw = String(
//         row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed ||
//         row.appraiser_tech_ed || row.appraiser_tech_ed1 || ""
//       ).trim();
//       // Budget_Distribution may store Employee_Master.ROWID as its Tech-Ed FK.
//       // Convert that FK to the display assignment returned from Appraisal_Sheet.
//       return ownerByForeignKey.get(normalizeOwner(raw)) || raw;
//     };
//     const ownerMatchesLogin = (row) =>
//       ownerMatches(ownerForBudgetRow(row), Array.from(identities)) ||
//       Boolean(loginEmployee && normalizeOwner(row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed || row.appraiser_tech_ed || row.appraiser_tech_ed1) === normalizeOwner(loginEmployee.row_id || loginEmployee.ROWID));
//     const directMatches = allRows.filter(ownerMatchesLogin);
//     const assignmentMatches = allRows.filter((row) =>
//       assignedOwners.some((owner) => ownerKey(owner) === ownerKey(
//         row.appraiser_tech_ed_id || row.tech_ed_id || row.tech_ed || row.appraiser_tech_ed,
//       )),
//     );
//     const candidates = directMatches.length ? directMatches : assignmentMatches;

//     // Cycle API and budget tables can refer to the same cycle through different
//     // ID aliases. Resolve the active cycle through Budget_Master's cycle name
//     // before concluding that the Tech-Ed has no matching allocation.
//     const activeCycle = cycleRows.find((cycle) =>
//       String(cycle.id ?? cycle.appraisal_cycle_id ?? cycle.cycle_id ?? cycle.ROWID) === String(activeCycleId),
//     );
//     const activeCycleName = normalizeOwner(
//       activeCycle?.name || activeCycle?.cycle_name || activeCycle?.appraisal_year || "",
//     );
//     const activeMasterCycleIds = new Set(
//       budgetMasterRows
//         .filter((master) => {
//           const masterCycleName = normalizeOwner(
//             master.appraisal_cycle_name || master.cycle_name || master.cycleName || master.appraisal_year || "",
//           );
//           return (
//             (activeCycleId && String(master.appraisal_cycle_id) === String(activeCycleId)) ||
//             (activeCycleName && masterCycleName === activeCycleName)
//           );
//         })
//         .map((master) => String(master.appraisal_cycle_id || ""))
//         .filter(Boolean),
//     );
//     const cycleMatches = candidates.filter((row) =>
//       (activeCycleId && String(row.appraisal_cycle_id) === String(activeCycleId)) ||
//       activeMasterCycleIds.has(String(row.appraisal_cycle_id)),
//     );
//     if (cycleMatches.length === 1) return cycleMatches[0];
//     if (cycleMatches.length > 1) return null;

//     // Never guess between multiple cycles. A unique owner allocation is safe
//     // to show when cycle metadata has no matching alias.
//     return candidates.length === 1 ? candidates[0] : null;
//   }, [
//     budgetDistributionRows, budgetMasterRows, cycleRows, employeeRows, techEdOwners, myName,
//     user?.name, user?.display_name, user?.first_name, user?.last_name,
//     user?.email, user?.email_id, user?.user_id, user?.empId, user?.employeeId, user?.employee_id,
//     activeCycleId,
//   ]);

//   // The Tech-ED's Appraisal Sheet assignment (e.g. "EMP0051 - Ashok Kumar"),
//   // found from the login even when HR has not allocated a budget row yet, so
//   // the team and its Comp Managers can still be listed.
//   const loginTechOwner = useMemo(() => {
//     const identities = [
//       myName, user?.name, user?.display_name,
//       [user?.first_name, user?.last_name].filter(Boolean).join(" "),
//       user?.email, user?.email_id, user?.empId, user?.employeeId, user?.employee_id,
//     ].map(normalizeOwner).filter(Boolean);

//     // Prefer the authoritative Appraisal Sheet Tech-Ed directory. This works
//     // even if the employee endpoint only returns the Tech-Ed's reports.
//     const directoryOwner = techEdOwners.find((item) =>
//       [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id]
//         .filter(Boolean)
//         .some((alias) => ownerMatches(alias, identities)),
//     );
//     if (directoryOwner?.assignment) return String(directoryOwner.assignment).trim();

//     const personValues = (e) => [
//       e.row_id, e.ROWID, e.ROW_ID, e.id,
//       e.emp_id, e.employee_id, e.employeeId, e.emp_name, e.employee_name, e.name,
//       e.email, e.email_id, e.emailId,
//     ].map(normalizeOwner).filter(Boolean);
//     const me = employeeRows.find((e) => personValues(e).some((v) => identities.includes(v)));
//     if (me) identities.push(...personValues(me));
//     for (const employee of employeeRows) {
//       const raw = String(employee.appraiser_tech_ed_row_id || employee.appraiser_tech_ed_appraisal_sheet || employee.appraiser_tech_ed || employee.appraiser_tech_ed_id || employee.appraiser_tech_ed1 ||
//         employee.appraiser_teched || employee.appraiserTechED || employee.tech_ed || employee.tech_ed_id || "").trim();
//       if (!raw) continue;
//       const linked = techEdOwners.find((item) =>
//         [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id].filter(Boolean)
//           .some((alias) => ownerMatches(alias, raw)),
//       );
//       const assignment = String(linked?.assignment || raw).trim();
//       if (ownerMatches(assignment, identities)) return assignment;
//     }
//     return "";
//   }, [employeeRows, techEdOwners, myName, user?.name, user?.display_name, user?.first_name, user?.last_name,
//     user?.email, user?.email_id, user?.empId, user?.employeeId, user?.employee_id]);
//   const techOwnerKey = ownerKey(liveTech?.appraiser_tech_ed_id) || ownerKey(loginTechOwner);

//   const activeCycle = useMemo(
//     () => cycleRows.find((cycle) => String(cycle.id ?? cycle.appraisal_cycle_id ?? cycle.cycle_id ?? cycle.ROWID) === String(liveTech?.appraisal_cycle_id || activeCycleId)) || null,
//     [cycleRows, liveTech?.appraisal_cycle_id, activeCycleId],
//   );
//   const liveComps = useMemo(
//     () => liveTech
//       ? budgetCompManagerRows.filter((r) => String(r.budget_distribution_id) === String(liveTech.id))
//       : [],
//     [budgetCompManagerRows, liveTech],
//   );
//   const liveMaster = useMemo(
//     () => liveTech
//       ? budgetMasterRows.find((r) => String(r.appraisal_cycle_id) === String(liveTech.appraisal_cycle_id)) || null
//       : null,
//     [budgetMasterRows, liveTech],
//   );
//   const cycleLabel = String(activeCycle?.name || liveMaster?.appraisal_cycle_name || liveMaster?.cycle_name || "").trim();

//   const [pane, setPane] = useState({ mine: true, alloc: true, audit: true });
//   const [appliedOpen, setAppliedOpen] = useState(false);
//   const [trailOpen, setTrailOpen] = useState({});
//   const [reason, setReason] = useState("");
//   const [err, setErr] = useState("");
//   const [auditFilter, setAuditFilter] = useState("all");
//   const [drafts, setDrafts] = useState({});
//   const auditStorageKey = liveTech
//     ? "appraisal-budget-audit:" + String(liveTech.appraisal_cycle_id) + ":" + ownerKey(liveTech.appraiser_tech_ed_id)
//     : "";
//   const [auditState, setAuditState] = useState({ key: "", entries: [] });
//   const log = auditState.key === auditStorageKey ? auditState.entries : [];

//   useEffect(() => {
//     if (!auditStorageKey) {
//       setAuditState({ key: "", entries: [] });
//       return;
//     }
//     let entries = [];
//     try {
//       const saved = window.localStorage.getItem(auditStorageKey);
//       const parsed = saved ? JSON.parse(saved) : [];
//       entries = Array.isArray(parsed) ? parsed : [];
//     } catch (storageError) {
//       console.error("Could not read the Budget Distribution audit trail:", storageError);
//     }
//     setAuditState({ key: auditStorageKey, entries });
//   }, [auditStorageKey]);

//   useEffect(() => {
//     if (!auditStorageKey || auditState.key !== auditStorageKey) return;
//     try {
//       window.localStorage.setItem(auditStorageKey, JSON.stringify(auditState.entries));
//     } catch (storageError) {
//       console.error("Could not save the Budget Distribution audit trail:", storageError);
//     }
//   }, [auditStorageKey, auditState]);

//   const cmNodes = useMemo(() => {
//     const managerStats = new Map();
//     const currentTechOwner = techOwnerKey;
//     const resolveTechAssignment = (raw) => {
//       const text = String(raw || "").trim();
//       const linked = techEdOwners.find((item) =>
//         [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name]
//           .filter(Boolean).some((alias) => ownerMatches(alias, text))
//       );
//       return String(linked?.assignment || text).trim();
//     };
//     const resolveManager = (raw) => {
//       const text = String(raw || "").trim();
//       if (!text) return "";
//       const parts = ownerParts(text);

//       // A Comp Manager often is not a member of their own Tech-Ed roster.
//       // Resolve the saved manager ID through any team row that already carries
//       // both the stored Comp Manager key and its Employee_Master display label.
//       const linkedManager = employeeRows.find((employee) =>
//         employee.comp_manager_display &&
//         ownerMatches(employee.comp_manager || employee.comp_manager_id || employee.compManager, parts)
//       );
//       if (linkedManager?.comp_manager_display) return String(linkedManager.comp_manager_display).trim();

//       const manager = employeeRows.find((employee) => {
//         const aliases = [
//           employee.empId, employee.emp_id, employee.employee_id, employee.employeeId,
//           employee.id, employee.ROWID, employee.row_id, employee.name, employee.employee_name,
//         ].filter(Boolean);
//         return aliases.some((alias) => ownerMatches(alias, parts));
//       });
//       if (!manager) return text;
//       const id = String(manager.empId || manager.emp_id || manager.employee_id || manager.employeeId || "").trim();
//       const name = String(manager.name || manager.employee_name || manager.emp_name || "").trim();
//       return id && name ? id + " - " + name : name || text;
//     };
//     employeeRows.forEach((employee) => {
//       // This page's team and Comp Manager list must be driven only by current
//       // Appraisal_Sheet rows, not Employee_Master-only employees.
//       if (employee.in_appraisal_sheet !== true) return;
//       const rawTechAssignment = employee.appraiser_tech_ed_row_id || employee.appraiser_tech_ed_appraisal_sheet || employee.appraiser_tech_ed || employee.appraiser_tech_ed_id || employee.appraiser_tech_ed1 || employee.tech_ed || employee.tech_ed_id || "";
//       const techAssignment = resolveTechAssignment(rawTechAssignment);
//       if (!currentTechOwner || ownerKey(techAssignment) !== currentTechOwner) return;
//       if (!isActiveAndEligible(employee)) return;
//       const rawManager = employee.comp_manager_display || employee.comp_manager_name || employee.comp_manager || employee.comp_manager_id || employee.compManager || "";
//       const manager = resolveManager(rawManager);
//       if (!manager) return;
//       const key = ownerKey(manager);
//       const stats = managerStats.get(key) || { count: 0, base: 0, utilized: 0, name: manager };
//       stats.count += 1;
//       const previousCtcValue = employee.previous_appraisal_total_ctc_with_rewards ?? employee.Previous_Appraisal_total_CTC_with_rewards ?? employee.budget_base;
//       const hasPreviousCtc = previousCtcValue !== null && previousCtcValue !== undefined && String(previousCtcValue).trim() !== "";
//       stats.base += hasPreviousCtc
//         ? num(previousCtcValue)
//         : num(employee.current_annual_base_pay ?? employee.currentAnnualBasePay ?? employee.current_base_pay ?? employee.base_pay ?? employee.basePay)
//           + num(employee.hike_amount ?? employee.hikeAmount ?? employee.current_hike_amount)
//           + num(employee.allocated_pb_amount ?? employee.allocatedPBAmount ?? employee.allocated_pb ?? 0)
//           + num(employee.new_pb_to_be_offered ?? employee.newPBToBeOffered ?? employee.current_performance_bonus ?? 0)
//           + num(employee.new_rb ?? employee.newRB ?? employee.current_retention_bonus ?? 0);
//       stats.utilized += employeeUtilized(employee);
//       managerStats.set(key, stats);
//     });
//     const savedKeys = new Set(liveComps.map((live) => ownerKey(resolveManager(live.comp_manager))));
//     const unsaved = Array.from(managerStats.entries())
//       .filter(([key]) => key && !savedKeys.has(key))
//       .map(([, stats]) => ({ id: "", comp_manager: stats.name, percentage: 0, budget_base: stats.base, calculated_budget: 0, applied_budget: 0, total_utilization: stats.utilized }));
//     return liveComps.concat(unsaved).map((live) => {
//       const pct = num(live.percentage);
//       const resolvedName = resolveManager(live.comp_manager);
//       const stats = managerStats.get(ownerKey(resolvedName)) || { count: 0, base: 0, utilized: 0, name: resolvedName || live.comp_manager };
//       // When the manager exists in the current eligible Appraisal Sheet roster,
//       // its CTC base must come from that live roster, even when the saved row has
//       // a non-zero but stale budget_base. Keep saved fallback only for orphan rows.
//       const hasCurrentRoster = managerStats.has(ownerKey(resolvedName));
//       const base = hasCurrentRoster
//         ? stats.base
//         : (num(live.budget_base) || (pct ? num(live.calculated_budget) * 100 / pct : 0));
//       const original = num(live.calculated_budget);
//       const updated = num(live.applied_budget);
//       const managerName = String(stats.name || resolvedName || "Unassigned Comp Manager").trim();
//       const managerLog = log.filter((entry) => ownerKey(resolveManager(entry.name)) === ownerKey(managerName));
//       const history = [
//         { date: "", amount: original, team: stats.count, pct },
//         ...managerLog.map((entry) => ({ date: entry.date, amount: num(entry.after), team: stats.count, pct: num(entry.to) })),
//       ];
//       return {
//         name: managerName,
//         pct, pct0: pct, base,
//         // Keep the baseline count fixed only as historical reference; the current
//         // count always reflects the current eligible Appraisal Sheet roster.
//         // Original Count is the saved baseline only; never fill a missing
//         // value from today's team size, which changes with eligibility/delegation.
//         // The API handles legacy schemas. Never substitute a live/current count.
//         team0: live.original_headcount !== null && live.original_headcount !== undefined && String(live.original_headcount).trim() !== ""
//           ? num(live.original_headcount)
//           : 0,
//         // Current count follows the live eligible Appraisal Sheet roster;
//         // persisted current_headcount can be stale after a delegation change.
//         team: stats.count,
//         original, updated, liveId: live.id,
//         liveCalculated: original, liveApplied: updated,
//         liveUtilized: stats.utilized,
//         lastChanged: managerLog.length ? managerLog[managerLog.length - 1].date : "",
//         history,
//       };
//     });
//   }, [liveComps, employeeRows, techOwnerKey, log, techEdOwners]);

//   const assignedTeam = useMemo(() => employeeRows.filter((employee) => {
//     if (employee.in_appraisal_sheet !== true) return false;
//     const raw = employee.appraiser_tech_ed_row_id || employee.appraiser_tech_ed_appraisal_sheet || employee.appraiser_tech_ed || employee.appraiser_tech_ed_id || employee.appraiser_tech_ed1 || employee.tech_ed || employee.tech_ed_id || "";
//     const linked = techEdOwners.find((item) =>
//       [item?.employee_id, item?.row_id, item?.ROWID, item?.assignment, item?.name, item?.email, item?.email_id].filter(Boolean)
//         .some((alias) => ownerMatches(alias, raw))
//     );
//     const assignment = String(linked?.assignment || raw).trim();
//     return Boolean(techOwnerKey) && ownerKey(assignment) === techOwnerKey && isActiveAndEligible(employee);
//   }), [employeeRows, techOwnerKey, techEdOwners]);
//   const allTeam = assignedTeam;
//   const myPct = liveTech ? num(liveTech.percentage) : 0;
//   // Use the same selected allocation row/value as Dashboard, Appraisal Sheet,
//   // and Detail Screen so the Tech-Ed allocation cannot drift across screens.
//   const myOriginal = sharedBudgetTotals?.budgetScope === "teched"
//     ? num(sharedBudgetTotals.base)
//     : (liveTech ? num(liveTech.calculated_budget) : 0);
//   const myUpdated = sharedBudgetTotals?.budgetScope === "teched"
//     ? num(sharedBudgetTotals.updated)
//     : (liveTech ? num(liveTech.applied_budget) : 0);
//   // Backend counts are calculated from the cycle-scoped eligible Appraisal Sheet
//   // roster and persisted by budgetmasterapi. Prefer them so every screen agrees.
//   // The rendered eligible Appraisal Sheet roster is the live source of truth.
//   const currentTeamCount = allTeam.length;
//   // Use only the immutable baseline returned by the API; headcount may
//   // be a legacy/current field and must not replace Original Count here.
//   const savedTeamCount = liveTech?.original_headcount;
//   // Original Count is a persisted baseline. Never replace a missing baseline
//   // with today's roster count, or it will appear to change with eligibility.
//   const team0 = savedTeamCount !== null && savedTeamCount !== undefined && String(savedTeamCount).trim() !== ""
//     ? num(savedTeamCount)
//     : 0;
//   const allotted = cmNodes.reduce((s, n) => s + n.updated, 0);
//   const used = assignedTeam.reduce((sum, employee) => sum + employeeUtilized(employee), 0);
//   const usedPct = myUpdated ? (used / myUpdated) * 100 : 0;
//   const over = usedPct > 100;

//   // Tech ED history: own budget per date, rolled up with the Comp Managers.
//   const myHistory = useMemo(() => [{
//     date: "", allocated: myOriginal, updated: myUpdated, team: team0,
//     allotted, buffer: myUpdated - allotted,
//   }], [myOriginal, myUpdated, team0, allotted]);

//   const auditFor = (names) => {
//     const out = [];
//     names.forEach((name) => {
//       if (name === myName && liveTech) {
//         out.push({ date: "", time: "", name, from: null, to: myPct, before: null, after: myOriginal, by: "Data Store", reason: "Current saved allocation" });
//         return;
//       }
//       const node = cmNodes.find((item) => item.name === name);
//       if (node) out.push({ date: "", time: "", name, from: null, to: node.pct0, before: null, after: node.original, by: "Data Store", reason: "Current saved allocation" });
//     });
//     log.forEach((entry) => { if (names.includes(entry.name)) out.push(entry); });
//     return out.sort((a, b) => byDate(b, a));
//   };

//   async function setPct(name, raw) {
//     const node = cmNodes.find((x) => x.name === name);
//     setDrafts((d) => {
//       const next = { ...d };
//       delete next[name];
//       return next;
//     });
//     if (!node) return;
//     const to = Math.round(Number(raw) * 10) / 10;
//     if (!Number.isFinite(to) || to < 0 || to > 100) {
//       setErr("Enter an allotment percentage between 0 and 100 for " + name + ".");
//       return;
//     }
//     if (to === node.pct) return;
//     const newUpd = (node.base * to) / 100;
//     const sum = allotted - node.updated + newUpd;
//     if (sum > myUpdated + 0.5) {
//       setErr(
//         "Blocked: " + to + "% for " + name + " would take total allotted to " + lakh(sum) + ", which is " +
//           lakh(sum - myUpdated) + " more than your available Tech-Ed budget of " + lakh(myUpdated) + ".",
//       );
//       return;
//     }
//     const t = nowParts();
//     if (!liveTech?.id) {
//       setErr("Your Tech-Ed budget allocation is not saved yet, so Comp Manager budgets cannot be allotted.");
//       return;
//     }
//     try {
//       // No saved row yet: the API creates it under this Tech-ED's allocation.
//       await updateBudget(node.liveId || "", {
//         percentage: to,
//         budget_base: node.base,
//         // Keep the initial Comp Manager allocation frozen after the first save.
//         calculated_budget: node.liveId ? node.original : newUpd,
//         applied_budget: newUpd,
//         comp_manager: name,
//         ...(node.liveId ? {} : { budget_distribution_id: liveTech.id }),
//       }, "comp");
//     } catch (error) {
//       setErr(error.message || "Failed to save Comp Manager budget.");
//       return;
//     }
//     setAuditState((state) => ({
//       key: auditStorageKey,
//       entries: [
//         ...(state.key === auditStorageKey ? state.entries : []),
//         { name, from: node.pct, to, by: myName, date: t.date, time: t.time, before: node.updated, after: newUpd, reason: reason.trim() },
//       ],
//     }));
//     setReason("");
//     setErr("");
//   }

//   const paneHead = (k, title, count) => (
//     <button type="button" className="pane-head" aria-expanded={pane[k]} onClick={() => setPane((p) => ({ ...p, [k]: !p[k] }))}>
//       <span>
//         {title}
//         {count ? <span className="cnt">{count}</span> : null}
//       </span>
//       <span className="chev">{pane[k] ? "▾" : "▸"}</span>
//     </button>
//   );

//   const cmLabel = LEVELS[1] + (cmNodes.length === 1 ? "" : "s");
//   const auditNames = [myName, ...cmNodes.map((c) => c.name)];
//   let auditList = auditFor(auditNames);
//   if (auditFilter !== "all") auditList = auditList.filter((x) => x.name === auditFilter);
//   const selfOpen = !!trailOpen[myName];

//   return (
//     <div className="tbd-root">
//       <style>{CSS}</style>

//       {cycleLoading ? (
//         <div className="berr">Loading active appraisal cycle and Tech-Ed allocation…</div>
//       ) : null}
//       {!cycleLoading && !liveTech ? (
//         <div className="berr">
//           {loginTechOwner
//             ? "HR has not allocated your budget for the active appraisal cycle yet. Your Comp Managers are listed below; Allot % can be set once HR applies the budget in Budget Master."
//             : "No matching Tech-Ed budget was found for this login in the active appraisal cycle. Check that the signed-in account matches the Appraiser Tech-ED value in Appraisal Sheet."}
//         </div>
//       ) : null}
//       <div className="btop">
//         <span>
//           Appraisal cycle <b>{cycleLabel || "Cycle name unavailable"}</b>
//         </span>
//         <span className="sep" />
//         <span>
//           Tech-Ed allocation from Budget Master · updated {lakh(myUpdated)}
//         </span>
//         <span className="sep" />
//         <span>
//           <b>{LEVELS[0]}</b>
//         </span>
//         <span className="sep" />
//         <span className="applied">
//           Budget applied by HR: <b>{myPct}%</b> = <b>{lakh(myUpdated)}</b> updated · original{" "}
//           {lakh(myOriginal)}
//           <button type="button" className="dd" aria-expanded={appliedOpen} onClick={() => setAppliedOpen((v) => !v)}>
//             % history {appliedOpen ? "▴" : "▾"}
//           </button>
//         </span>
//       </div>
//       {appliedOpen && (
//         <div className="apdrop">
//           <AuditTable list={auditFor([myName])} showName={false} />
//         </div>
//       )}

//       <div className="card">
//         {paneHead("mine", "My Budget")}
//         {pane.mine && (
//           <>
//             <div className="bsum flat">
//               <div>
//                 <div className="f-label">Original allotted</div>
//                 <div className="v">{lakh(myOriginal)}</div>
//                 <div className="d mut">Fixed at allocation</div>
//               </div>
//               <div>
//                 <div className="f-label">Updated budget</div>
//                 <div className="v">{lakh(myUpdated)}</div>
//                 <div className="d">
//                   <Chg d={myUpdated - myOriginal} />
//                 </div>
//               </div>
//               <div>
//                 <div className="f-label">Team size</div>
//                 <div className="v">
//                   {team0} → {currentTeamCount}
//                 </div>
//                 <div className="d mut">At allocation → now</div>
//               </div>
//               <div>
//                 <div className="f-label">Allotted to reports</div>
//                 <div className="v">{lakh(allotted)}</div>
//               </div>
//               <div>
//                 <div className="f-label">Buffer</div>
//                 <div className="v">{lakh(myUpdated - allotted)}</div>
//                 <div className="d mut">Not passed down</div>
//               </div>
//               <div>
//                 <div className="f-label">Utilised</div>
//                 <div className={"v" + (over ? " over" : "")}>
//                   {lakh(used)} ({usedPct.toFixed(0)}%)
//                 </div>
//                 <div className="d">
//                   {over ? <span className="over">▲ {lakh(used - myUpdated)} over</span> : <span className="mut">Remaining {lakh(myUpdated - used)}</span>}
//                 </div>
//               </div>
//             </div>
//             <div className="ubar-wide">
//               <div className={"ubar" + (over ? " over" : "")}>
//                 <span style={{ width: Math.min(usedPct, 100) + "%" }} />
//               </div>
//             </div>
//           </>
//         )}
//       </div>

//       <div className="card">
//         {paneHead("alloc", "Allocation", cmNodes.length + " " + cmLabel)}
//         {pane.alloc && (
//           <>
//             <div className="reason">
//               <label htmlFor="tbdReason">Reason for next % change</label>
//               <input id="tbdReason" type="text" value={reason} placeholder="Optional — saved in the audit trail" onChange={(e) => setReason(e.target.value)} />
//             </div>
//             {err && (
//               <div className="berr" role="alert">
//                 <span>{err}</span>
//                 <button type="button" className="link" onClick={() => setErr("")}>
//                   Dismiss
//                 </button>
//               </div>
//             )}
//             <div className="bscroll">
//               <table className="bal">
//                 <thead>
//                   <tr>
//                     <th>Level</th>
//                     <th>Owner</th>
//                     <th className="r">Original Budget</th>
//                     <th className="r">Updated Budget</th>
//                     <th className="r">Change</th>
//                     <th className="r">Original Count</th>
//                     <th className="r">Current Count</th>
//                     <th>Last Changed</th>
//                     <th className="r">Allot %</th>
//                   </tr>
//                 </thead>
//                 <tbody>
//                   <tr className="self">
//                     <td className="first">{LEVELS[0]}</td>
//                     <td>
//                       <b>{String(loginTechOwner).split(/\s+-\s+/)[1] || myName}</b> <span className="muted-small">(you)</span>
//                     </td>
//                     <td className="r">{lakh(myOriginal)}</td>
//                     <td className="r">{lakh(myUpdated)}</td>
//                     <td className="r">
//                       <ChangeCell from={myOriginal} to={myUpdated} />
//                     </td>
//                     <td className="r">{team0}</td>
//                     <td className="r">{currentTeamCount}</td>
//                     <td>
//                       <button
//                         type="button"
//                         className="dd"
//                         aria-expanded={selfOpen}
//                         title={(selfOpen ? "Hide" : "Show") + " budget history"}
//                         onClick={() => setTrailOpen((t) => ({ ...t, [myName]: !t[myName] }))}
//                       >
//                         {dateText(myHistory[myHistory.length - 1].date)} {selfOpen ? "▴" : "▾"}
//                       </button>
//                     </td>
//                     <td className="r">
//                       <span className="mut">{myPct}%</span>
//                     </td>
//                   </tr>
//                   {selfOpen && (
//                     <tr className="tr">
//                       <td colSpan={9}>
//                         <table className="trail" style={{ maxWidth: 820 }}>
//                           <thead>
//                             <tr>
//                               <th>Date</th>
//                               <th className="n">Allocated</th>
//                               <th className="n">Updated</th>
//                               <th className="n">Team size</th>
//                               <th className="n">Allotted to {LEVELS[1]}s</th>
//                               <th className="n">Buffer</th>
//                             </tr>
//                           </thead>
//                           <tbody>
//                             {myHistory.map((x) => (
//                               <tr key={x.date}>
//                                 <td>{dateText(x.date)}</td>
//                                 <td className="n">{lakh(x.allocated)}</td>
//                                 <td className="n">{lakh(x.updated)}</td>
//                                 <td className="n">{x.team}</td>
//                                 <td className="n">{lakh(x.allotted)}</td>
//                                 <td className="n">{lakh(x.buffer)}</td>
//                               </tr>
//                             ))}
//                           </tbody>
//                         </table>
//                       </td>
//                     </tr>
//                   )}
//                   {cmNodes.map((n, i) => {
//                     const open = !!trailOpen[n.name];
//                     return (
//                       <Fragment key={n.name}>
//                         <tr className={i > 0 ? "grp" : ""}>
//                           <td>
//                             <span style={{ display: "inline-block", width: 18 }} />
//                             {LEVELS[1]}
//                           </td>
//                           <td>
//                             <b>{n.name}</b>
//                           </td>
//                           <td className="r">{lakh(n.original)}</td>
//                           <td className="r">{lakh(n.updated)}</td>
//                           <td className="r">
//                             <ChangeCell from={n.original} to={n.updated} />
//                           </td>
//                           <td className="r">{n.team0}</td>
//                           <td className="r">{n.team}</td>
//                           <td>
//                             {n.history.length > 1 ? (
//                               <button
//                                 type="button"
//                                 className="dd"
//                                 aria-expanded={open}
//                                 title={(open ? "Hide" : "Show") + " budget history"}
//                                 onClick={() => setTrailOpen((t) => ({ ...t, [n.name]: !t[n.name] }))}
//                               >
//                                 {dateText(n.lastChanged)} {open ? "▴" : "▾"}
//                               </button>
//                             ) : (
//                               <span className="mut">—</span>
//                             )}
//                           </td>
//                           <td className="r">
//                             <input
//                               className="pct-in"
//                               type="number"
//                               min="0"
//                               max="100"
//                               step="0.1"
//                               aria-label={"Allot % for " + n.name}
//                               disabled={!liveTech}
//                               title={liveTech ? undefined : "Available once HR allocates your budget"}
//                               value={drafts[n.name] ?? n.pct}
//                               onChange={(e) => setDrafts((d) => ({ ...d, [n.name]: e.target.value }))}
//                               onBlur={(e) => setPct(n.name, e.target.value)}
//                               onKeyDown={(e) => {
//                                 if (e.key === "Enter") e.currentTarget.blur();
//                               }}
//                             />
//                           </td>
//                         </tr>
//                         {open && (
//                           <tr className="tr">
//                             <td colSpan={9}>
//                               <table className="trail" style={{ maxWidth: 560 }}>
//                                 <thead>
//                                   <tr>
//                                     <th>Date</th>
//                                     <th className="n">Allocated</th>
//                                     <th className="n">Updated</th>
//                                     <th className="n">Team size</th>
//                                     <th className="n">Allot %</th>
//                                   </tr>
//                                 </thead>
//                                 <tbody>
//                                   {n.history.map((x) => (
//                                     <tr key={x.date}>
//                                       <td>{dateText(x.date)}</td>
//                                       <td className="n">{lakh(n.original)}</td>
//                                       <td className="n">{lakh(x.amount)}</td>
//                                       <td className="n">{x.team}</td>
//                                       <td className="n">{x.pct}%</td>
//                                     </tr>
//                                   ))}
//                                 </tbody>
//                               </table>
//                             </td>
//                           </tr>
//                         )}
//                       </Fragment>
//                     );
//                   })}
//                 </tbody>
//               </table>
//             </div>
//             <div className="note">
//               Budget base = Current Annual Base Pay + Allocated PB Amount of each {LEVELS[1]}'s team · Utilised = {UTILISED_LABEL}
//             </div>
//           </>
//         )}
//       </div>

//       <div className="card">
//         {paneHead("audit", "% Applied — audit trail (you and your " + cmLabel + ")")}
//         {pane.audit && (
//           <>
//             <div className="reason">
//               <label>
//                 Owner{" "}
//                 <select value={auditFilter} onChange={(e) => setAuditFilter(e.target.value)}>
//                   <option value="all">All</option>
//                   {auditNames.map((n) => (
//                     <option key={n}>{n}</option>
//                   ))}
//                 </select>
//               </label>
//             </div>
//             <div className="audit-wrap">
//               <AuditTable list={auditList} showName />
//             </div>
//           </>
//         )}
//       </div>
//     </div>
//   );
// }

// const CSS = `
// .tbd-root { max-width: 1320px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 8px;
//   font-family: "IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif; font-size: 12.5px; color: #0f1f33; font-variant-numeric: tabular-nums; }
// .tbd-root * { box-sizing: border-box; }
// .tbd-root .demo-banner { border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; border-radius: 6px; padding: 5px 10px; font-size: 11.5px; }
// .tbd-root .mut { color: #64748b; }
// .tbd-root .muted-small { font-size: 11px; color: #475569; }
// .tbd-root .up { color: #15803d; } .tbd-root .down { color: #c2410c; } .tbd-root .over { color: #c2410c; font-weight: 700; }
// .tbd-root .card { background: #fff; border: 1px solid #d3dbe6; border-radius: 10px; box-shadow: 0 1px 2px rgba(18,48,79,.06); overflow: hidden; }
// .tbd-root .card.empty { padding: 22px 16px; color: #64748b; }
// .tbd-root .btop { background: #fff; border: 1px solid #d4dbe5; border-left: 4px solid #14a3a3; border-radius: 8px; display: flex; gap: 16px;
//   align-items: center; flex-wrap: wrap; padding: 8px 14px; color: #334155; }
// .tbd-root .btop .sep { width: 1px; align-self: stretch; background: #d7dce3; }
// .tbd-root .applied { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
// .tbd-root .applied b, .tbd-root .btop b { color: #12304f; }
// .tbd-root .apdrop { background: #f7f9fc; border: 1px solid #d4dbe5; border-radius: 8px; padding: 8px 14px; animation: tbd-pull 160ms ease-out; }
// .tbd-root .pane-head { width: 100%; display: flex; align-items: center; justify-content: space-between; background: #12304f; color: #fff; border: 0;
//   padding: 10px 16px; font-family: inherit; font-size: 13.5px; font-weight: 600; letter-spacing: .15px; cursor: pointer; text-align: left; }
// .tbd-root .pane-head .cnt { font-weight: 400; color: #d6e4f5; margin-left: 8px; }
// .tbd-root .pane-head .chev { font-size: 12px; }
// .tbd-root .bsum { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
// .tbd-root .bsum > div { padding: 12px 16px; border-right: 1px solid #d7dce3; border-top: 3px solid transparent; }
// .tbd-root .bsum > div:nth-child(2) { background: #0e7c6b; border-top-color: #0a5c4f; border-right-color: #0e7c6b; }
// .tbd-root .bsum > div:nth-child(2) .f-label,
// .tbd-root .bsum > div:nth-child(2) .v,
// .tbd-root .bsum > div:nth-child(2) .d { color: #fff; }
// .tbd-root .bsum > div:nth-child(2) .d { opacity: .88; }
// .tbd-root .bsum > div:last-child { border-right: 0; }
// .tbd-root .f-label { font-size: 11px; color: #5b6b80; font-weight: 500; }
// .tbd-root .bsum .v { font-size: 18px; font-weight: 600; color: #12304f; margin-top: 2px; }
// .tbd-root .bsum .v.over { color: #c2410c; }
// .tbd-root .bsum .d { font-size: 11px; margin-top: 2px; }
// .tbd-root .ubar-wide { margin: 0 16px 14px; }
// .tbd-root .ubar { height: 8px; background: #e6ebf2; border-radius: 3px; overflow: hidden; }
// .tbd-root .ubar > span { display: block; height: 100%; background: linear-gradient(90deg, #14a3a3, #1b6fb5); }
// .tbd-root .ubar.over > span { background: #d9480f; }
// .tbd-root .reason { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid #e1e5eb; font-size: 12px; color: #475569; }
// .tbd-root .reason input { flex: 1; max-width: 420px; height: 28px; border: 1px solid #cbd3df; border-radius: 4px; padding: 0 8px; font-size: 12.5px; }
// .tbd-root .reason select { height: 28px; border: 1px solid #cbd3df; border-radius: 4px; padding: 0 6px; font-size: 12.5px; background: #fff; }
// .tbd-root .berr { margin: 10px 16px; background: #fff; border: 1px solid #e3e8ef; border-left: 4px solid #c2410c; color: #7c2d12; border-radius: 6px;
//   padding: 7px 10px; font-size: 12px; display: flex; justify-content: space-between; gap: 10px; }
// .tbd-root .link { background: none; border: 0; padding: 0; color: #1859a8; font-size: 11.5px; font-weight: 700; cursor: pointer; }
// .tbd-root .bscroll { overflow-x: auto; }
// .tbd-root table.bal { width: 100%; min-width: 980px; border-collapse: collapse; font-size: 12.5px; }
// .tbd-root .bal th { background: #e8eef5; color: #12304f; font-weight: 600; font-size: 12px; text-align: left; padding: 8px 10px; border-bottom: 2px solid #9fb3cf; white-space: nowrap; }
// .tbd-root .bal td { padding: 7px 10px; border-bottom: 1px solid #e1e5eb; vertical-align: middle; }
// .tbd-root .bal .r { text-align: right; }
// .tbd-root .bal tr.self td { background: #e9f4f4; font-weight: 700; }
// .tbd-root .bal tr.self td.first { box-shadow: inset 4px 0 0 #14a3a3; }
// .tbd-root .bal tr.grp td { border-top: 2px solid #9fb3cf; }
// .tbd-root .bal tr.tr td { background: #f7f9fc; padding: 8px 12px 12px 40px; animation: tbd-pull 160ms ease-out; }
// .tbd-root .pct-in { width: 64px; height: 26px; border: 1px solid #9fb3cf; border-radius: 4px; text-align: right; padding: 0 6px; font-size: 12.5px; background: #fffef5; }
// .tbd-root .pct-in:focus { outline: 2px solid #14a3a3; outline-offset: 1px; }
// .tbd-root .dd { border: 1px solid #c5d0dd; background: #fff; color: #17365d; border-radius: 4px; padding: 3px 8px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
// .tbd-root .dd[aria-expanded="true"] { background: #12304f; border-color: #12304f; color: #fff; }
// .tbd-root .trail { width: 100%; border-collapse: collapse; font-size: 12px; }
// .tbd-root .trail th { text-align: left; font-weight: 700; color: #1e3a5f; font-size: 11px; padding: 4px 8px; border-bottom: 1px solid #d7dce3; }
// .tbd-root .trail td { padding: 4px 8px; border-bottom: 1px solid #edf0f4; }
// .tbd-root .trail .n { text-align: right; }
// .tbd-root .audit-wrap { padding: 8px 14px 12px; }
// .tbd-root .audit-wrap .trail td, .tbd-root .audit-wrap .trail th { padding: 6px 8px; }
// .tbd-root .note { padding: 6px 14px 10px; font-size: 11px; color: #64748b; }
// @keyframes tbd-pull { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
// @media (prefers-reduced-motion: reduce) { .tbd-root .apdrop, .tbd-root .bal tr.tr td { animation: none; } }
// `;
"use strict";

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

// These IDs are the Data Store table IDs from Catalyst Console → Data Store.
const TABLES = {
  master: "74008000000034565", // Budget_Master
  distribution: "74008000000033809", // Budget_Distribution
  comp: "74008000000023149", // Budget_Distribution_Comp
  payroll: "74008000000035326", // Payroll_Data
  cycles: "74008000000034190", // Appraisal_Cycle_Master
  eligibility: "74008000000057046", // Eligibility_List
};

// CORS headers come from Catalyst (Authorized Domains); setting them here too
// gives the browser two Access-Control-Allow-Origin values and it rejects the response.
function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function value(row, key) {
  return row && row[key] !== undefined && row[key] !== null ? row[key] : "";
}

// Original Count must come only from a dedicated snapshot field. Generic
// headcount is mutable in legacy deployments and therefore cannot be treated
// as an original baseline. If the schema has neither snapshot field, return
// blank so the API can report the missing persistence capability rather than
// displaying a count that changes with the live team.
function originalHeadcountValue(row) {
  const keys = Object.keys(row || {});
  const keyFor = (name) => keys.find((key) => key.toLowerCase() === name);
  for (const name of ["original_headcount", "allocation_headcount"]) {
    const key = keyFor(name);
    if (key && row[key] !== "" && row[key] !== null && row[key] !== undefined) {
      return row[key];
    }
  }
  return "";
}

function n(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === "") return 0;
  // Catalyst imports can return Indian-grouped values such as "12,34,567.50".
  // Number("12,34,567.50") is NaN, which previously silently became zero.
  let text = String(v).trim();
  const negative = /^\(.*\)$/.test(text);
  // "1.25 L" / "1.25 Lakh" = 1,25,000; "2 Cr" / "2 Crore" = 2,00,00,000.
  const unit = text.match(/(lakhs?|lacs?|l|crores?|cr)\.?\s*\)?$/i);
  const scale = !unit ? 1 : /^c/i.test(unit[1]) ? 1e7 : 1e5;
  if (unit) text = text.slice(0, unit.index);
  text = text
    .replace(/[₹,\s]/g, "")
    .replace(/^(?:INR|Rs\.?)/i, "")
    .replace(/[^0-9.+-]/g, "");
  const parsed = Number(text) * scale;
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -Math.abs(parsed) : parsed;
}

function idOf(row) {
  return String(value(row, "ROWID") || value(row, "rowid") || "");
}

function mapMaster(row) {
  const calculated = n(value(row, "calculated_budget"));
  const applied = n(value(row, "applied_budget"));
  const utilized = n(
    firstNonZeroValue(row, [
      "budget_utilized",
      "total_utilization",
      "utilized_amount",
      "utilized",
    ]),
  );
  return {
    id: idOf(row),
    appraisal_cycle_id: cycleReference(value(row, "appraisal_cycle_id")),
    budget_percentage: n(value(row, "budget_percentage")),
    budget_percentage_is_set:
      value(row, "budget_percentage") !== "" &&
      value(row, "budget_percentage") !== null &&
      value(row, "budget_percentage") !== undefined,
    org_budget_base: n(value(row, "org_budget_base")),
    original_budget_base: n(
      value(row, "original_budget_base") || value(row, "original_base"),
    ),
    current_budget_base: n(
      value(row, "current_budget_base") || value(row, "current_base"),
    ),
    original_headcount: originalHeadcountValue(row),
    headcount: firstValue(row, ["headcount"]),
    current_headcount: firstValue(row, ["current_headcount"]),
    budget_utilized: utilized,
    calculated_budget: calculated,
    applied_budget: applied,
    budget_remaining: applied - utilized,
    utilization_percentage: applied > 0 ? (utilized / applied) * 100 : 0,

    // Compatibility aliases for existing budget screens. These fields are
    // not stored in Budget_Master; they are derived or kept in browser state.
    budget_amount: calculated,
    additional_budget: 0,
    updated_budget: applied,
    status: "Active",
    tech_ed_id: "",
  };
}

function mapDistribution(row) {
  const calculated = n(
    firstNonZeroValue(row, ["calculated_budget", "claculated_budget"]),
  );
  const applied = n(value(row, "applied_budget"));
  const utilized = n(
    firstNonZeroValue(row, [
      "total_utilization",
      "budget_utilized",
      "utilized_amount",
      "utilized",
    ]),
  );
  return {
    id: idOf(row),
    appraisal_cycle_id: cycleReference(value(row, "appraisal_cycle_id")),
    appraiser_tech_ed_id: String(value(row, "appraiser_tech_ed_id")),
    percentage:
      value(row, "percentage") === "" ||
      value(row, "percentage") === null ||
      value(row, "percentage") === undefined
        ? null
        : n(value(row, "percentage")),
    percentage_is_set:
      value(row, "percentage") !== "" &&
      value(row, "percentage") !== null &&
      value(row, "percentage") !== undefined,
    budget_base: n(value(row, "budget_base")),
    original_budget_base: n(value(row, "original_budget_base")),
    original_base: n(value(row, "original_base")),
    current_budget_base: n(value(row, "current_budget_base")),
    current_base: n(value(row, "current_base")),
    original_headcount: originalHeadcountValue(row),
    current_headcount: firstValue(row, ["current_headcount"]),
    headcount: firstValue(row, ["headcount"]),
    calculated_budget: calculated,
    total_utilization: utilized,
    applied_budget: applied,
    utilization_percentage: applied > 0 ? (utilized / applied) * 100 : 0,
  };
}

function mapComp(row) {
  const applied = n(value(row, "applied_budget"));
  const utilized = n(
    firstNonZeroValue(row, [
      "total_utilization",
      "budget_utilized",
      "utilized_amount",
      "utilized",
    ]),
  );
  return {
    id: idOf(row),
    comp_manager: String(value(row, "comp_manager")),
    percentage: n(value(row, "percentage")),
    percentage_is_set:
      value(row, "percentage") !== "" &&
      value(row, "percentage") !== null &&
      value(row, "percentage") !== undefined,
    budget_base: n(value(row, "budget_base")),
    calculated_budget: n(
      firstNonZeroValue(row, ["calculated_budget", "claculated_budget"]),
    ),
    calculated_budget_is_set:
      (value(row, "calculated_budget") !== "" &&
        value(row, "calculated_budget") !== null &&
        value(row, "calculated_budget") !== undefined) ||
      (value(row, "claculated_budget") !== "" &&
        value(row, "claculated_budget") !== null &&
        value(row, "claculated_budget") !== undefined),
    total_utilization: utilized,
    applied_budget: applied,
    budget_distribution_id: String(value(row, "budget_distribution_id")),
    appraisal_cycle_id: cycleReference(value(row, "appraisal_cycle_id")),
    original_budget_base: n(
      value(row, "original_budget_base") || value(row, "original_base"),
    ),
    current_budget_base: n(
      value(row, "current_budget_base") || value(row, "current_base"),
    ),
    // Keep a missing snapshot blank. Converting blank to 0 made the refresh
    // think an Original Count was already saved, so the real baseline was
    // never captured and the screen showed 0 forever.
    original_headcount: originalHeadcountValue(row),
    headcount: firstValue(row, ["headcount"]),
    current_headcount: firstValue(row, ["current_headcount"]),
    utilization_percentage: applied > 0 ? (utilized / applied) * 100 : 0,
  };
}

function getUserField(user, key) {
  if (user && user[key] !== undefined && user[key] !== null)
    return String(user[key]).trim();
  return "";
}

function getUserRole(user) {
  let role = "";
  if (user && user.role_details) role = user.role_details.role_name || "";
  if (!role && user) role = user.role_name || "";
  if (!role && user) role = user.role || "";
  return String(role).trim().toLowerCase();
}

function isHR(user) {
  const role = getUserRole(user);
  return role === "hr" || role.indexOf("hr") !== -1;
}

function getUserValues(user) {
  const values = [];
  ["user_id", "email", "email_id", "display_name", "name"].forEach((key) => {
    const v = getUserField(user, key).toLowerCase();
    if (v) values.push(v);
  });
  const full = (
    getUserField(user, "first_name") +
    " " +
    getUserField(user, "last_name")
  )
    .trim()
    .toLowerCase();
  if (full) values.push(full);
  return values;
}

function matchesOwner(owner, a) {
  const text = String(owner || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!text || !a || !a.user) return false;
  const empId = String(a.user.empId || "")
    .trim()
    .toLowerCase();
  const email = String(a.user.email || "")
    .trim()
    .toLowerCase();

  // Appraiser values use "Employee ID - Full Name". Employee IDs may
  // themselves contain hyphens (e.g. WIS-1234), so split only on the
  // spaced separator, never on a hyphen inside the ID.
  const parts = text.split(/\s+-\s+/);
  const ownerId = parts.length > 1 ? parts[0].trim() : text;
  const ownerName = parts.length > 1 ? parts.slice(1).join(" - ").trim() : "";
  const userValues = getUserValues(a.user).map((value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " "),
  );
  return Boolean(
    (empId && (ownerId === empId || text === empId)) ||
    (email && (text === email || ownerId === email)) ||
    userValues.some(
      (value) =>
        value === text ||
        value === ownerId ||
        (ownerName && value === ownerName),
    ),
  );
}

async function checkAccess(req) {
  const userApp = catalyst.initialize(req);
  const adminApp = catalyst.initialize(req, { scope: "admin" });
  try {
    return await access.check(userApp, adminApp);
  } catch (error) {
    if (access.isEnforced()) throw error;
    console.log("ACCESS dry-run: access check failed:", error && error.message);
    return { dryRun: true, enforced: false, denied: error };
  }
}

function requireBudgetScreen(a, level) {
  access.guard(a, function () {
    const keys = ["budgetAllocation", "budgetDistribution"];
    let ok = false;
    keys.some((key) => {
      try {
        access.requireScreen(a, key, level);
        ok = true;
        return true;
      } catch (error) {
        if (error instanceof access.HttpError) return false;
        throw error;
      }
    });
    if (!ok)
      throw new access.HttpError(
        403,
        "You do not have access to this budget screen.",
      );
  });
}

async function getAllRows(app, tableName) {
  const rows = [];
  const zcql = app.zcql();
  let last = "0";

  // Budget tables are small today, but keep the read paged so this remains safe
  // when the cycle history grows. ZCQL avoids the Data Store getPagedRows
  // request hanging on this Advanced I/O endpoint.
  for (let guard = 0; guard < 10000; guard += 1) {
    const query =
      "SELECT * FROM " +
      tableName +
      " WHERE ROWID > " +
      last +
      " ORDER BY ROWID ASC LIMIT 300";
    const result = await zcql.executeZCQLQuery(query);
    const page = (result || []).map(
      (item) => (item && (item[tableName] || Object.values(item)[0])) || {},
    );

    rows.push(...page);

    if (page.length < 300) break;

    let max = last;
    for (const row of page) {
      const id = String(row.ROWID || "");
      try {
        if (BigInt(id) > BigInt(max)) max = id;
      } catch (_) {}
    }
    if (max === last) break;
    last = max;
  }

  return rows;
}

function parseJson(text) {
  if (!String(text || "").trim()) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return {};
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === "object")
    return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(parseJson(req.body));
  if (typeof req.on !== "function" || req.readableEnded)
    return Promise.resolve({});
  return new Promise((resolve, reject) => {
    let text = "";
    req.on("data", (chunk) => {
      text += chunk.toString();
    });
    req.on("end", () => resolve(parseJson(text)));
    req.on("error", reject);
  });
}

function sendAccessError(res, error) {
  return sendJson(res, error.status || 403, {
    success: false,
    message: error.message,
    enforced: true,
  });
}

async function readBundle(app) {
  const [masterRows, distributionRows, compRows] = await Promise.all([
    getAllRows(app, "Budget_Master"),
    getAllRows(app, "Budget_Distribution"),
    getAllRows(app, "Budget_Distribution_Comp"),
  ]);

  return {
    master: masterRows.map(mapMaster),
    techEd: distributionRows.map(mapDistribution),
    compManager: compRows.map(mapComp),
  };
}

function normalizedIdentity(raw) {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object") {
    for (const key of [
      "emp_id",
      "employee_id",
      "ROWID",
      "rowid",
      "id",
      "value",
      "name",
    ]) {
      if (raw[key] !== undefined && raw[key] !== null) {
        const found = normalizedIdentity(raw[key]);
        if (found) return found;
      }
    }
    return "";
  }
  return String(raw)
    .trim()
    .split(/\s+-\s+/)[0]
    .trim()
    .toLowerCase();
}

function cycleNameOf(cycle) {
  return String(
    firstValue(cycle, [
      "cycle_name",
      "cycleName",
      "name",
      "appraisal_year",
      "appraisalYear",
    ]) || "",
  ).trim();
}

function cycleIdOf(cycle) {
  return String(firstValue(cycle, ["ROWID", "rowid", "id", "ID"]) || "").trim();
}

function cycleRank(cycle) {
  const dateValue = firstValue(cycle, [
    "start_date",
    "startDate",
    "effective_date",
    "effectiveDate",
  ]);
  if (dateValue) {
    const timestamp = Date.parse(String(dateValue));
    if (Number.isFinite(timestamp)) return timestamp;
  }
  const name = cycleNameOf(cycle);
  const monthYear = name.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s,]*(\d{2,4})\b/i,
  );
  if (monthYear) {
    const month = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(monthYear[1].slice(0, 3).toLowerCase());
    let year = Number(monthYear[2]);
    if (year < 100) year += 2000;
    return new Date(year, month, 1).getTime();
  }
  const yearMatch = name.match(/(?:19|20)\d{2}/);
  return yearMatch ? new Date(Number(yearMatch[0]), 0, 1).getTime() : 0;
}

function cycleReference(raw) {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "object") {
    return String(
      raw.ROWID ??
        raw.rowid ??
        raw.id ??
        raw.ID ??
        raw.value ??
        raw.appraisal_cycle_name ??
        raw.cycle_name ??
        "",
    ).trim();
  }
  return String(raw).trim();
}

function currentCtc(row) {
  const stored = firstValue(row, [
    "total_ctc_with_rewards",
    "total_CTC_with_rewards",
    "total_ctc",
    "new_ctc",
    "newCTC",
    "totalCTCWithRewards",
    "total_ctc_with_rewards_current",
  ]);
  if (stored !== "" && stored !== null && stored !== undefined) {
    const parsed = Number(String(stored).replace(/[₹,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  // Match employeesapi: if the stored total is blank/invalid, reconstruct from
  // current Appraisal Sheet components rather than treating invalid text as 0.
  // The current Appraisal Sheet computes Total CTC with Rewards as next-year
  // base salary plus total bonus: (current base + hike) + (allocated PB + new PB + new RB).
  const base = n(
    firstValue(row, [
      "current_annual_base_pay",
      "currentAnnualBasePay",
      "current_base_pay",
      "base_pay",
    ]),
  );
  const hike = n(
    firstValue(row, ["hike_amount", "hikeAmount", "current_hike_amount"]),
  );
  const storedTotalPb = firstValue(row, ["total_pb", "totalPB"]);
  const pb =
    storedTotalPb !== "" &&
    storedTotalPb !== null &&
    storedTotalPb !== undefined
      ? n(storedTotalPb)
      : n(
          firstValue(row, [
            "allocated_pb_amount",
            "allocatedPBAmount",
            "target_pb_allocated_for_may",
            "targetPBAllocatedForMay",
          ]),
        ) +
        n(
          firstValue(row, [
            "new_pb_to_be_offered",
            "newPBToBeOffered",
            "current_performance_bonus",
          ]),
        );
  const retention = n(
    firstValue(row, ["new_rb", "newRB", "current_retention_bonus"]),
  );
  return base + hike + pb + retention;
}

function previousCtc(record) {
  const raw = firstValue(record, [
    "total_ctc_with_rewards",
    "total_CTC_with_rewards",
    "totalCTCWithRewards",
    "total_ctc",
    "new_ctc",
    "newCTC",
  ]);
  if (raw !== "" && raw !== null && raw !== undefined) {
    const parsed = Number(String(raw).replace(/[₹,\s]/g, ""));
    // employeesapi ignores a payroll row with a non-numeric stored total too.
    if (Number.isFinite(parsed)) return parsed;
    return null;
  }

  // Payroll rows may not persist the computed total column. Recreate the same
  // Total CTC with Rewards formula from that historical row's own values.
  const componentFields = [
    "current_annual_base_pay",
    "currentAnnualBasePay",
    "current_base_pay",
    "base_pay",
    "basePay",
    "hike_amount",
    "hikeAmount",
    "current_hike_amount",
    "allocated_pb_amount",
    "allocatedPBAmount",
    "allocated_pb",
    "target_pb_allocated_for_may",
    "new_pb_to_be_offered",
    "newPBToBeOffered",
    "performance_bonus",
    "total_pb",
    "new_rb",
    "newRB",
    "retention_bonus",
  ];
  const hasComponents = componentFields.some((name) => {
    const rawValue = firstValue(record, [name]);
    return rawValue !== "" && rawValue !== null && rawValue !== undefined;
  });
  if (!hasComponents) return null;
  const base = n(
    firstValue(record, [
      "current_annual_base_pay",
      "currentAnnualBasePay",
      "current_base_pay",
      "base_pay",
      "basePay",
    ]),
  );
  const hike = n(
    firstValue(record, ["hike_amount", "hikeAmount", "current_hike_amount"]),
  );
  const storedTotalPb = firstValue(record, ["total_pb", "totalPB"]);
  const pb =
    storedTotalPb !== "" &&
    storedTotalPb !== null &&
    storedTotalPb !== undefined
      ? n(storedTotalPb)
      : n(
          firstValue(record, [
            "allocated_pb_amount",
            "allocatedPBAmount",
            "allocated_pb",
            "target_pb_allocated_for_may",
          ]),
        ) +
        n(
          firstValue(record, [
            "new_pb_to_be_offered",
            "newPBToBeOffered",
            "performance_bonus",
          ]),
        );
  const retention = n(
    firstValue(record, ["new_rb", "newRB", "retention_bonus"]),
  );
  return base + hike + pb + retention;
}

function readField(row, candidates) {
  if (!row) return "";
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    if (
      row[candidate] !== undefined &&
      row[candidate] !== null &&
      String(row[candidate]).trim()
    ) {
      return row[candidate];
    }
    const key = keys.find(
      (item) => item.toLowerCase() === candidate.toLowerCase(),
    );
    if (
      key &&
      row[key] !== undefined &&
      row[key] !== null &&
      String(row[key]).trim()
    ) {
      return row[key];
    }
  }
  return "";
}

async function readTechEdOwners(app) {
  // Appraisal_Sheet's Tech-Ed foreign key stores Employee_Master.ROWID.
  // Resolve it to the stable Employee ID + name for display and roster deduplication.
  const [employeeRows, unused] = await Promise.all([
    getAllRows(app, "Employee_Master"),
    Promise.resolve([]),
  ]);
  const employeeByRowId = new Map(
    employeeRows.map((employee) => [
      idOf(employee),
      {
        row_id: idOf(employee),
        employee_id: String(
          readField(employee, ["emp_id", "employee_id"]) || "",
        ).trim(),
        name: String(
          readField(employee, ["emp_name", "employee_name", "name"]) || "",
        ).trim(),
        email: String(
          readField(employee, ["email_id", "email", "work_email"]) || "",
        )
          .trim()
          .toLowerCase(),
      },
    ]),
  );
  const zcql = app.zcql();
  const owners = new Map();
  let last = "0";
  for (let guard = 0; guard < 10000; guard += 1) {
    // Read all columns because Appraisal_Sheet schemas may use a legacy alias
    // for the Tech-ED assignment. readField below handles those column names.
    const query =
      "SELECT * FROM Appraisal_Sheet " +
      "WHERE ROWID > " +
      last +
      " ORDER BY ROWID ASC LIMIT 300";
    const result = await zcql.executeZCQLQuery(query);
    const rows = (result || []).map(
      (item) =>
        (item && (item.Appraisal_Sheet || Object.values(item)[0])) || {},
    );
    if (!rows.length) break;
    let max = last;
    rows.forEach((row) => {
      const rowId = String(row.ROWID || "");
      try {
        if (BigInt(rowId) > BigInt(max)) max = rowId;
      } catch (_) {}
      const rawAssignment = String(
        readField(row, [
          "appraiser_tech_ed",
          "appraiser_tech_ed_id",
          "appraiser_tech_ed1",
          "appraiser_teched",
          "tech_ed",
          "tech_ed_id",
        ]) || "",
      ).trim();
      if (!rawAssignment) return;

      const employee = employeeByRowId.get(rawAssignment);
      const assignment = employee
        ? employee.employee_id && employee.name
          ? employee.employee_id + " - " + employee.name
          : employee.employee_id || employee.name || rawAssignment
        : rawAssignment;
      const key = employee
        ? (employee.employee_id || employee.row_id).toLowerCase()
        : rawAssignment.toLowerCase();
      if (!owners.has(key)) {
        owners.set(key, {
          assignment,
          row_id: employee ? employee.row_id : "",
          employee_id: employee ? employee.employee_id : "",
          name: employee ? employee.name : "",
          email: employee ? employee.email : "",
        });
      }
    });
    if (rows.length < 300 || max === last) break;
    last = max;
  }
  return Array.from(owners.values());
}

async function readEmployeeRoster(app) {
  // Use the API's ZCQL paging helper rather than Data Store getPagedRows.
  // getPagedRows across both full employee tables was causing the endpoint
  // to exceed Catalyst's execution timeout.
  const [appraisalRows, masterRows] = await Promise.all([
    getAllRows(app, "Appraisal_Sheet"),
    getAllRows(app, "Employee_Master"),
  ]);
  const masterById = new Map(
    masterRows.map((row) => [
      String(readField(row, ["emp_id", "employee_id"]))
        .trim()
        .toLowerCase(),
      row,
    ]),
  );
  const masterByRowId = new Map(masterRows.map((row) => [idOf(row), row]));
  const formatTechEdAssignment = (raw) => {
    const assignment = String(raw || "").trim();
    if (!assignment) return "";
    const linked = masterByRowId.get(assignment);
    if (!linked) return assignment;
    const linkedId = String(
      readField(linked, ["emp_id", "employee_id"]) || "",
    ).trim();
    const linkedName = String(
      readField(linked, ["emp_name", "employee_name", "name"]) || "",
    ).trim();
    return linkedId && linkedName
      ? linkedId + " - " + linkedName
      : linkedId || linkedName || assignment;
  };
  const appraisalById = new Map(
    appraisalRows.map((row) => [
      String(readField(row, ["emp_id", "employee_id"]))
        .trim()
        .toLowerCase(),
      row,
    ]),
  );
  const allIds = new Set([...masterById.keys(), ...appraisalById.keys()]);
  return Array.from(allIds)
    .map((key) => {
      const row = appraisalById.get(key) || {};
      const master = masterById.get(key) || {};
      const id = String(
        readField(row, ["emp_id", "employee_id"]) ||
          readField(master, ["emp_id", "employee_id"]),
      ).trim();
      const assignment =
        readField(row, [
          "appraiser_tech_ed",
          "appraiser_tech_ed_id",
          "appraiser_tech_ed1",
          "appraiser_teched",
          "tech_ed",
          "tech_ed_id",
        ]) ||
        readField(master, [
          "appraiser_tech_ed",
          "appraiser_tech_ed_id",
          "appraiser_tech_ed1",
          "appraiser_teched",
          "tech_ed",
          "tech_ed_id",
        ]);
      const managerRaw = String(
        readField(row, [
          "comp_manager",
          "comp_manager_id",
          "comp_manager_name",
          "director",
        ]) ||
          readField(master, [
            "comp_manager",
            "comp_manager_id",
            "comp_manager_name",
            "director",
          ]) ||
          "",
      ).trim();
      const managerKey = managerRaw
        .split(/\s+-\s+/)[0]
        .trim()
        .toLowerCase();
      const managerRow =
        masterById.get(managerKey) ||
        masterByRowId.get(managerKey) ||
        masterByRowId.get(managerRaw) ||
        masterById.get(managerRaw.toLowerCase());
      const managerId = managerRow
        ? String(readField(managerRow, ["emp_id", "employee_id"]) || "").trim()
        : "";
      const managerName = managerRow
        ? String(
            readField(managerRow, ["emp_name", "employee_name", "name"]) || "",
          ).trim()
        : "";
      const displayManager =
        managerId && managerName
          ? managerId + " - " + managerName
          : managerName || managerRaw;
      const employeeStatus = String(
        readField(master, ["emp_status", "status"]) ||
          readField(row, ["emp_status", "status"]) ||
          "",
      ).trim();
      const rawEligibility = String(
        readField(master, [
          "eligible_status",
          "eligibility_status",
          "eligibility",
          "eligible",
        ]) ||
          readField(row, [
            "eligible_status",
            "eligibility_status",
            "eligibility",
            "eligible",
          ]) ||
          "",
      )
        .trim()
        .toLowerCase()
        .replace(/[ _-]+/g, "");
      // Preserve an explicit Eligible/Not Eligible decision. On older Employee_Master
      // schemas with no eligibility field, use the established Active fallback.
      const eligibleStatus = ["eligible", "yes", "true", "1"].includes(
        rawEligibility,
      )
        ? "eligible"
        : ["noteligible", "no", "false", "0", "ineligible"].includes(
              rawEligibility,
            )
          ? "not eligible"
          : normalizeStatus(employeeStatus) === "Active"
            ? "eligible"
            : "not eligible";
      return {
        row_id: idOf(master),
        emp_id: id,
        name: String(
          readField(master, ["emp_name", "employee_name", "name"]) ||
            readField(row, ["emp_name", "employee_name", "name"]) ||
            id,
        ),
        appraiser_tech_ed: formatTechEdAssignment(assignment),
        comp_manager: managerRaw,
        comp_manager_display: displayManager,
        // Return appraisal amounts with the roster so utilization does not depend
        // on a separate employee endpoint's view or field projection.
        hike_amount: Number(
          readField(row, [
            "hike_amount",
            "hikeAmount",
            "current_hike_amount",
          ]) || 0,
        ),
        new_pb_to_be_offered: Number(
          readField(row, [
            "new_pb_to_be_offered",
            "newPBToBeOffered",
            "performance_bonus",
            "current_performance_bonus",
          ]) || 0,
        ),
        new_rb: Number(
          readField(row, [
            "new_rb",
            "newRB",
            "retention_bonus",
            "current_retention_bonus",
          ]) || 0,
        ),
        joining_bonus: Number(
          readField(row, [
            "joining_bonus",
            "joiningBonus",
            "current_joining_bonus",
          ]) || 0,
        ),
        pb_to_be_paid: Number(
          readField(row, [
            "pb_to_be_paid",
            "previous_year_performance_bonus",
            "previous_year_pb",
            "previous_pb",
          ]) || 0,
        ),
        rb_to_be_paid: Number(
          readField(row, [
            "rb_to_be_paid",
            "previous_year_retention_bonus",
            "previous_year_rb",
            "previous_rb",
          ]) || 0,
        ),
        previous_year_joining_bonus: Number(
          readField(row, [
            "previous_year_joining_bonus",
            "previous_year_jb",
            "previous_joining_bonus",
          ]) || 0,
        ),
        appraiser_tech_ed_row_id: String(
          readField(row, ["appraiser_tech_ed1", "appraiser_tech_ed_row_id"]) ||
            "",
        ).trim(),
        status: employeeStatus,
        eligible_status: eligibleStatus,
      };
    })
    .filter((row) => row.emp_id);
}

function matchesTechEdOwner(owner, a, techEdOwners = []) {
  if (matchesOwner(owner, a)) return true;
  const key = ownerKey(owner);
  if (!key) return false;
  // Budget_Distribution may store Employee_Master.ROWID, Employee ID, or
  // the display assignment. Resolve all three aliases to the same Tech-Ed.
  return techEdOwners.some((item) => {
    const aliases = [
      item.employee_id,
      item.row_id,
      item.ROWID,
      item.assignment,
      item.name,
      item.email,
      item.email_id,
    ]
      .map((value) => ownerKey(value))
      .filter(Boolean);
    return aliases.includes(key) && matchesOwner(item.assignment, a);
  });
}

function filterOwn(bundle, a, techEdOwners = []) {
  if (!a || !a.enforced || (a.scope && a.scope.all)) return bundle;
  const techEd = bundle.techEd.filter((row) =>
    matchesTechEdOwner(row.appraiser_tech_ed_id, a, techEdOwners),
  );
  const allowedDistributionIds = new Set(techEd.map((row) => row.id));
  const compManager = bundle.compManager.filter((row) =>
    allowedDistributionIds.has(String(row.budget_distribution_id)),
  );
  // Budget_Master is org-level and has no owner column, so a non-HR user gets
  // only the master row for the cycle represented by their Tech-Ed allocation.
  const cycleIds = new Set(techEd.map((row) => row.appraisal_cycle_id));
  const master = bundle.master.filter((row) =>
    cycleIds.has(row.appraisal_cycle_id),
  );
  const employeeRoster = (bundle.employeeRoster || []).filter((employee) =>
    matchesTechEdOwner(employee.appraiser_tech_ed, a, techEdOwners),
  );
  return { master, techEd, compManager, employeeRoster };
}

function ownerKey(raw) {
  const text = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const parts = text.split(/\s+-\s+/);
  return (parts.length > 1 ? parts[0] : text).trim();
}

function firstValue(row, names) {
  for (const name of names) {
    const hit = Object.keys(row || {}).find(
      (key) => key.toLowerCase() === name.toLowerCase(),
    );
    if (
      hit &&
      row[hit] !== null &&
      row[hit] !== undefined &&
      String(row[hit]).trim() !== ""
    )
      return row[hit];
  }
  return "";
}

function firstNonZeroValue(row, names) {
  for (const name of names) {
    const hit = Object.keys(row || {}).find(
      (key) => key.toLowerCase() === name.toLowerCase(),
    );
    if (
      !hit ||
      row[hit] === null ||
      row[hit] === undefined ||
      String(row[hit]).trim() === ""
    )
      continue;
    const parsed = n(row[hit]);
    if (parsed !== 0) return row[hit];
  }
  return firstValue(row, names);
}

function cycleDate(row) {
  const raw = firstValue(row, [
    "effective_date",
    "effectiveDate",
    "start_date",
    "startDate",
  ]);
  const match = String(raw || "").match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const name = String(
    firstValue(row, ["cycle_name", "cycleName", "name", "appraisal_year"]) ||
      "",
  );
  const yearMatch = name.match(/(?:^|\D)(20\d{2}|\d{2})(?:\D|$)/);
  if (yearMatch) {
    const y =
      yearMatch[1].length === 2
        ? 2000 + Number(yearMatch[1])
        : Number(yearMatch[1]);
    const monthMatch = name.match(
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
    );
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const month = monthMatch
      ? months.indexOf(monthMatch[1].slice(0, 3).toLowerCase()) + 1
      : 1;
    return (
      String(y).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-01"
    );
  }
  return "";
}

async function getColumnNames(table) {
  try {
    const columns = await table.getAllColumns();
    const names = new Set(
      (columns || [])
        .map((column) => String(column.column_name || column.name || "").trim())
        .filter(Boolean),
    );
    return names.size ? names : null;
  } catch (_) {
    return null;
  }
}

function pickColumn(columns, candidates, fallback) {
  if (!columns) return fallback;
  return candidates.find((name) => columns.has(name)) || fallback;
}

async function calculateBudgetBases(app, bundle, techEdOwners = []) {
  // Appraisal_Sheet provides the current roster and team assignments.
  // Payroll_Data + Appraisal_Cycle_Master provide prior-cycle CTC values.
  const [
    appraisalRows,
    masterEmployeeRows,
    payrollRows,
    cycleRows,
    eligibilityRows,
  ] = await Promise.all([
    getAllRows(app, "Appraisal_Sheet"),
    getAllRows(app, "Employee_Master").catch(() => []),
    getAllRows(app, "Payroll_Data"),
    getAllRows(app, "Appraisal_Cycle_Master"),
    getAllRows(app, "Eligibility_List").catch(() => []),
  ]);
  if (!appraisalRows.length) {
    throw new Error(
      "Appraisal_Sheet returned no rows; cannot calculate budget bases.",
    );
  }
  // Same rule as employeesapi: Appraisal_Sheet first, Employee_Master as the
  // fallback (Comp Manager = director when the sheet has no comp_manager).
  const masterByEmployee = new Map();
  const masterByRowId = new Map();
  const masterByName = new Map();
  masterEmployeeRows.forEach((row) => {
    const empId = String(
      firstValue(row, ["emp_id", "empId", "employee_id"]) || "",
    ).trim();
    const name = String(
      firstValue(row, ["emp_name", "employee_name", "name"]) || "",
    ).trim();
    const rowId = idOf(row);
    if (empId) masterByEmployee.set(empId.toLowerCase(), row);
    if (rowId) masterByRowId.set(rowId, row);
    if (name) masterByName.set(name.toLowerCase(), row);
  });
  // Appraisal_Sheet assignment columns can contain Employee_Master.ROWID
  // foreign keys. Budget_Distribution stores stable business employee IDs.
  const resolvePersonId = (raw) => {
    const text = String(raw || "").trim();
    if (!text) return "";
    const split = text.split(/\s+-\s+/);
    if (split.length > 1) return split[0].trim();
    const person =
      masterByRowId.get(text) ||
      masterByEmployee.get(text.toLowerCase()) ||
      masterByName.get(text.toLowerCase());
    return person
      ? String(
          firstValue(person, ["emp_id", "empId", "employee_id"]) ||
            idOf(person) ||
            text,
        ).trim()
      : text;
  };

  const cycleById = new Map(
    cycleRows.map((cycle) => [cycleIdOf(cycle), cycle]).filter(([id]) => id),
  );
  const cycleByName = new Map(
    cycleRows
      .map((cycle) => [cycleNameOf(cycle).toLowerCase(), cycle])
      .filter(([name]) => name),
  );
  const employeeKeyFor = (raw) => {
    const identity = normalizedIdentity(raw);
    if (!identity) return "";
    const master =
      masterByRowId.get(identity) ||
      masterByEmployee.get(identity) ||
      masterByName.get(identity);
    return String(
      master
        ? firstValue(master, ["emp_id", "empId", "employee_id"]) || idOf(master)
        : identity,
    )
      .trim()
      .toLowerCase();
  };
  // Scope roster membership to this function's Appraisal_Sheet read. The
  // similarly named appraisalById map belongs to readEmployeeRoster and is
  // not in scope here.
  const appraisalEmployeeIds = new Set(
    appraisalRows
      .map((row) => {
        const rawId = String(
          firstValue(row, [
            "emp_id",
            "empId",
            "employee_id",
            "employeeId",
            "employee_id_text",
          ]) || idOf(row),
        ).trim();
        return employeeKeyFor(rawId);
      })
      .filter(Boolean),
  );
  const cycleReferenceForRow = (row) =>
    cycleReference(
      firstValue(row, [
        "appraisal_cycle_name",
        "appraisal_cycle_id",
        "appraisalCycleId",
        "cycle_id",
        "appraisalCycleName",
        "cycle_name",
      ]),
    );
  const currentCycleFor = (cycleId) =>
    cycleById.get(String(cycleId)) ||
    cycleByName.get(String(cycleId).toLowerCase()) ||
    null;
  const previousCycleFor = (cycleId) => {
    const current = currentCycleFor(cycleId);
    const currentRank = current
      ? cycleRank(current)
      : cycleRank({ cycle_name: cycleId });
    const earlier = cycleRows
      .filter(
        (cycle) =>
          String(
            firstValue(cycle, ["status", "cycle_status", "appraisal_status"]) ||
              "",
          )
            .trim()
            .toLowerCase() === "closed",
      )
      .filter(
        (cycle) =>
          cycleRank(cycle) > 0 &&
          currentRank > 0 &&
          cycleRank(cycle) < currentRank,
      )
      .sort((a, b) => cycleRank(b) - cycleRank(a));
    return earlier[0] || null;
  };
  const historyRowsByCycleAndEmployee = new Map();
  payrollRows.forEach((historyRow) => {
    const employeeKey = employeeKeyFor(
      firstValue(historyRow, ["emp_id", "employee_id", "emp_code", "empId"]),
    );
    const cycleRef = cycleReferenceForRow(historyRow);
    const referencedCycle =
      cycleById.get(cycleRef) || cycleByName.get(cycleRef.toLowerCase());
    const cycleKey = referencedCycle
      ? cycleIdOf(referencedCycle) || cycleNameOf(referencedCycle).toLowerCase()
      : cycleRef.toLowerCase();
    if (!employeeKey || !cycleKey) return;
    const key = cycleKey + "::" + employeeKey;
    // Match Appraisal Sheet enrichment: a newer blank/invalid payroll row must
    // not hide an older usable Total CTC with Rewards for the same employee/cycle.
    if (previousCtc(historyRow) === null) return;
    const previous = historyRowsByCycleAndEmployee.get(key);
    const rowTime = String(
      historyRow.MODIFIEDTIME ||
        historyRow.CREATEDTIME ||
        historyRow.ROWID ||
        "",
    );
    const previousTime = previous
      ? String(
          previous.MODIFIEDTIME || previous.CREATEDTIME || previous.ROWID || "",
        )
      : "";
    if (
      !previous ||
      rowTime.localeCompare(previousTime, undefined, { numeric: true }) >= 0
    )
      historyRowsByCycleAndEmployee.set(key, historyRow);
  });

  const appraisalByEmployee = new Map();
  appraisalRows.forEach((row) => {
    const rawEmployeeId = String(
      firstValue(row, [
        "emp_id",
        "empId",
        "employee_id",
        "employeeId",
        "employee_id_text",
      ]) || idOf(row),
    ).trim();
    const employeeId = employeeKeyFor(rawEmployeeId);
    if (!employeeId) return;
    const rawTechEd = String(
      firstValue(row, [
        "appraiser_tech_ed",
        "appraiser_tech_ed_id",
        "appraiser_tech_ed1",
        "appraiser_teched",
        "appraiserTechED",
        "appraiserTechEd",
        "tech_ed",
        "tech_ed_id",
        "techED",
        "techEd",
      ]) || "",
    ).trim();
    const techEd = resolvePersonId(rawTechEd);
    const masterRow = masterByEmployee.get(employeeId) || {};
    const rawCompManager = String(
      firstValue(row, [
        "comp_manager",
        "comp_manager_id",
        "comp_manager_name",
        "comp_manager_emp_id",
        "compManager",
        "compManagerId",
      ]) ||
        firstValue(masterRow, ["comp_manager", "director"]) ||
        "",
    ).trim();
    // Keep the original value for budget aggregation/matching; display label is separate.
    const compManager = rawCompManager;
    const managerLookup = rawCompManager.split(/\s+-\s+/)[0].trim();
    const managerRow =
      masterByRowId.get(rawCompManager) ||
      masterByEmployee.get(managerLookup.toLowerCase()) ||
      masterByRowId.get(managerLookup) ||
      masterByName.get(rawCompManager.toLowerCase());
    const managerId = String(
      managerRow
        ? firstValue(managerRow, ["emp_id", "empId", "employee_id"])
        : "",
    ).trim();
    const managerName = String(
      managerRow
        ? firstValue(managerRow, ["emp_name", "employee_name", "name"])
        : "",
    ).trim();
    const compManagerDisplay =
      managerId && managerName
        ? managerId + " - " + managerName
        : managerName || rawCompManager;
    const activeCycleRow =
      cycleRows.find(
        (cycle) =>
          String(cycle.status || "")
            .trim()
            .toLowerCase() === "active" &&
          cycle.archived !== true &&
          cycle.archived !== "true",
      ) ||
      cycleRows.slice().sort((a, b) => cycleRank(b) - cycleRank(a))[0] ||
      null;
    const currentCycleId =
      cycleIdOf(activeCycleRow) ||
      String(bundle.master[0]?.appraisal_cycle_id || "");
    const previousCycle = previousCycleFor(currentCycleId);
    const previousCycleId = previousCycle
      ? cycleIdOf(previousCycle) || cycleNameOf(previousCycle).toLowerCase()
      : "";
    const historyKey = previousCycleId + "::" + employeeId;
    const previousRecord = previousCycle
      ? historyRowsByCycleAndEmployee.get(historyKey) ||
        historyRowsByCycleAndEmployee.get(
          cycleNameOf(previousCycle).toLowerCase() + "::" + employeeId,
        )
      : null;
    const currentCtcValue = currentCtc(row);
    const storedPreviousCtc = previousRecord
      ? previousCtc(previousRecord)
      : null;
    const previousAppraisalCtc =
      storedPreviousCtc === null ? currentCtcValue : storedPreviousCtc;
    const currentCycle = currentCycleFor(currentCycleId);
    const currentCycleName = cycleNameOf(currentCycle) || currentCycleId;
    const currentYearFull = currentCycleName.match(/(?:19|20)\d{2}/);
    const currentYearShort = currentCycleName.match(
      /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-\s]*(\d{2})/i,
    );
    const currentYear = currentYearFull
      ? currentYearFull[0]
      : currentYearShort
        ? "20" + currentYearShort[1]
        : currentCycleName;
    const lastAppraisalLabel = previousRecord
      ? cycleNameOf(previousCycle)
      : "New - " + currentYear;
    const basePay = n(
      firstValue(row, [
        "previous_year_base_pay",
        "previousYearBasePay",
        "last_year_base_pay",
        "lastYearBasePay",
        "previous_annual_base_pay",
        "previousAnnualBasePay",
        "current_annual_base_pay",
        "currentAnnualBasePay",
        "current_base_pay",
        "currentBasePay",
        "base_pay",
        "basePay",
        "annual_base_pay",
        "annualBasePay",
      ]),
    );
    const allocatedPB = n(
      firstValue(row, [
        "allocated_pb_amount",
        "allocatedPBAmount",
        "pb_to_be_paid",
        "pbToBePaid",
        "target_pb_allocated_for_may",
        "targetPBAllocatedForMay",
        "allocated_pb",
        "allocatedPB",
        "total_pb",
        "totalPB",
      ]),
    );
    const rawEligibility = String(
      firstValue(masterRow, [
        "eligibility",
        "eligible_status",
        "eligibility_status",
        "eligible",
      ]) ||
        firstValue(row, [
          "eligibility",
          "eligible_status",
          "eligibility_status",
          "eligible",
        ]) ||
        "",
    )
      .trim()
      .toLowerCase()
      .replace(/[ _-]+/g, "");
    const rawStatus = String(
      firstValue(masterRow, ["emp_status", "status", "employee_status"]) ||
        firstValue(row, ["emp_status", "status", "employee_status"]) ||
        "",
    )
      .trim()
      .toLowerCase();
    const explicitEligible = ["eligible", "yes", "true", "1"].includes(
      rawEligibility,
    );
    // Match employeesapi/Appraisal Sheet: Active AND explicitly Eligible.
    // Blank eligibility is not an implicit yes.
    const eligible = rawStatus === "active" && explicitEligible;
    const amount = (aliases) => n(firstNonZeroValue(row, aliases));
    const currentHike = amount([
      "hike_amount",
      "hikeAmount",
      "current_hike_amount",
    ]);
    const previousHike = amount([
      "previous_year_hike_amount",
      "previousYearHikeAmount",
      "previous_hike_amount",
      "last_year_hike_amount",
    ]);
    const currentPerformance = amount([
      "new_pb_to_be_offered",
      "newPBToBeOffered",
      "current_performance_bonus",
      "performance_bonus_current_year",
      "target_pb_allocated_for_may",
      "targetPBAllocatedForMay",
      "allocated_pb_amount",
      "allocatedPBAmount",
      "target_pb_next_year",
      "targetPBNextYear",
    ]);
    const currentRetention = amount([
      "new_rb",
      "newRB",
      "current_retention_bonus",
      "retention_bonus_current_year",
    ]);
    const currentJoining = amount([
      "joining_bonus",
      "joiningBonus",
      "current_joining_bonus",
    ]);
    const previousPerformance = amount([
      "previous_year_performance_bonus",
      "previous_year_pb",
      "previous_pb",
      "pb_to_be_paid",
      "pbToBePaid",
    ]);
    const previousRetention = amount([
      "previous_year_retention_bonus",
      "previous_year_rb",
      "previous_rb",
      "rb_to_be_paid",
      "rbToBePaid",
    ]);
    const previousJoining = amount([
      "previous_year_joining_bonus",
      "previous_year_jb",
      "previous_joining_bonus",
      "joining_bonus_previous_year",
    ]);
    const lastYearExpenses =
      basePay +
      previousHike +
      previousPerformance +
      previousRetention +
      previousJoining;
    const personName = String(
      firstValue(masterRow, ["emp_name", "employee_name", "name"]) ||
        firstValue(row, ["name", "emp_name", "employee_name"]) ||
        employeeId,
    ).trim();
    // Keep one current Appraisal_Sheet row per employee and include only the
    // fields the Tech-Ed budget page needs; this avoids a second full table scan
    // and avoids relying on employee-screen field permissions for money fields.
    appraisalByEmployee.set(employeeId, {
      employeeId,
      in_appraisal_sheet: appraisalEmployeeIds.has(
        String(employeeId).trim().toLowerCase(),
      ),
      employee_master_row_id: idOf(masterRow),
      emp_id: String(
        firstValue(row, ["emp_id", "empId", "employee_id"]) ||
          firstValue(masterRow, ["emp_id", "employee_id"]) ||
          employeeId,
      ).trim(),
      name: personName,
      techEd,
      appraiser_tech_ed: techEd,
      appraiser_tech_ed_appraisal_sheet: techEd,
      compManager,
      comp_manager: rawCompManager,
      comp_manager_display: compManagerDisplay,
      eligible,
      status: rawStatus,
      eligible_status: eligible ? "eligible" : "not eligible",
      base: previousAppraisalCtc,
      current_ctc: currentCtcValue,
      previous_appraisal_total_ctc_with_rewards: previousAppraisalCtc,
      Previous_Appraisal_total_CTC_with_rewards: previousAppraisalCtc,
      last_appraisal_date: lastAppraisalLabel,
      last_appraisal_cycle_name: lastAppraisalLabel,
      hike_amount: currentHike,
      new_pb_to_be_offered: currentPerformance,
      current_performance_bonus: currentPerformance,
      target_pb_allocated_for_may: amount([
        "target_pb_allocated_for_may",
        "targetPBAllocatedForMay",
      ]),
      allocated_pb_amount: amount(["allocated_pb_amount", "allocatedPBAmount"]),
      target_pb_next_year: amount(["target_pb_next_year", "targetPBNextYear"]),
      new_rb: currentRetention,
      joining_bonus: currentJoining,
      pb_to_be_paid: previousPerformance,
      previous_year_performance_bonus: previousPerformance,
      rb_to_be_paid: previousRetention,
      previous_year_retention_bonus: previousRetention,
      previous_year_joining_bonus: previousJoining,
      utilized_amount:
        currentHike +
        currentPerformance +
        currentRetention +
        currentJoining -
        previousPerformance -
        previousRetention -
        previousJoining,
    });
  });
  const employees = Array.from(appraisalByEmployee.values());
  // Eligibility_List is cycle-scoped. Key by both Employee_Master ROWID and
  // business Employee ID so foreign-key and legacy rows resolve consistently.
  const eligibilityByCycleAndEmployee = new Map();
  eligibilityRows.forEach((record) => {
    const rawCycleId = cycleReference(
      firstValue(record, ["appraisal_cycle_id", "cycle_id", "cycleId"]),
    );
    const referencedCycle =
      cycleById.get(rawCycleId) || cycleByName.get(rawCycleId.toLowerCase());
    const cycleAliases = [
      rawCycleId,
      referencedCycle ? cycleIdOf(referencedCycle) : "",
      referencedCycle ? cycleNameOf(referencedCycle) : "",
    ]
      .filter(Boolean)
      .map((alias) => String(alias).trim().toLowerCase());
    const masterId = cycleReference(
      firstValue(record, [
        "employee_master_id",
        "employee_master_row_id",
        "employeeMasterRowId",
      ]),
    ).toLowerCase();
    const empId = employeeKeyFor(
      firstValue(record, ["emp_id", "employee_id", "emp_code", "empId"]),
    );
    const raw = String(
      firstValue(record, [
        "eligibility_status",
        "eligible_status",
        "eligibility",
      ]) || "",
    )
      .trim()
      .toLowerCase()
      .replace(/[ _-]+/g, "");
    if (!rawCycleId || !raw) return;
    // Pending/awaiting-criteria records must not silently fall back to the
    // Employee_Master value; only an explicit Eligible decision participates.
    const eligible = ["eligible", "yes", "true", "1"].includes(raw);
    const status = eligible ? "eligible" : "not eligible";
    cycleAliases.forEach((cycleAlias) => {
      if (masterId)
        eligibilityByCycleAndEmployee.set(cycleAlias + "::row:" + masterId, {
          eligible,
          status,
          record,
        });
      if (empId)
        eligibilityByCycleAndEmployee.set(cycleAlias + "::emp:" + empId, {
          eligible,
          status,
          record,
        });
    });
  });
  const cycleEligibilityFor = (employee, cycleId) => {
    const rawId = cycleReference(cycleId);
    const cycle = currentCycleFor(rawId);
    const aliases = [
      rawId,
      cycle ? cycleIdOf(cycle) : "",
      cycle ? cycleNameOf(cycle) : "",
    ]
      .filter(Boolean)
      .map((alias) => String(alias).trim().toLowerCase());
    const masterId = String(employee.employee_master_row_id || "")
      .trim()
      .toLowerCase();
    const empId = String(employee.employeeId || employee.emp_id || "")
      .trim()
      .toLowerCase();
    for (const alias of aliases) {
      const match =
        (masterId
          ? eligibilityByCycleAndEmployee.get(alias + "::row:" + masterId)
          : null) ||
        (empId
          ? eligibilityByCycleAndEmployee.get(alias + "::emp:" + empId)
          : null);
      if (match) return match;
    }
    return null;
  };

  // Count all distinct employees in the cycle's Eligibility_List. This is
  // used only to recognize legacy Original Count snapshots that mistakenly
  // counted the entire list instead of the generated Appraisal_Sheet roster.
  const eligibleListCountForCycle = (targetCycleId) => {
    const targetCycle = currentCycleFor(cycleReference(targetCycleId));
    const targetAliases = new Set(
      [
        cycleReference(targetCycleId),
        targetCycle ? cycleIdOf(targetCycle) : "",
        targetCycle ? cycleNameOf(targetCycle) : "",
      ]
        .filter(Boolean)
        .map((alias) => String(alias).trim().toLowerCase()),
    );
    const employeeIds = new Set();
    eligibilityRows.forEach((record) => {
      const rawCycle = cycleReference(
        firstValue(record, ["appraisal_cycle_id", "cycle_id", "cycleId"]),
      );
      const referencedCycle =
        cycleById.get(rawCycle) || cycleByName.get(rawCycle.toLowerCase());
      const recordAliases = [
        rawCycle,
        referencedCycle ? cycleIdOf(referencedCycle) : "",
        referencedCycle ? cycleNameOf(referencedCycle) : "",
      ]
        .filter(Boolean)
        .map((alias) => String(alias).trim().toLowerCase());
      if (!recordAliases.some((alias) => targetAliases.has(alias))) return;
      const employeeId = employeeKeyFor(
        firstValue(record, ["emp_id", "employee_id", "emp_code", "empId"]),
      );
      if (employeeId) employeeIds.add(employeeId);
    });
    return employeeIds.size;
  };

  const appraisalEmployees = employees.filter(
    (employee) => employee.in_appraisal_sheet,
  );
  const withBase = appraisalEmployees.filter(
    (employee) => employee.base > 0,
  ).length;
  const withTechEd = appraisalEmployees.filter(
    (employee) => employee.techEd,
  ).length;
  bundle.diagnostics = {
    appraisalRows: appraisalRows.length,
    employees: appraisalEmployees.length,
    employeesWithBase: withBase,
    employeesWithTechEd: withTechEd,
    budgetMasterCycles: bundle.master.filter((m) =>
      String(m.appraisal_cycle_id || "").trim(),
    ).length,
    baseColumns:
      "Payroll_Data.total_CTC_with_rewards from the immediately previous appraisal cycle; current total_ctc_with_rewards for employees not present in that cycle",
  };
  if (!bundle.diagnostics.budgetMasterCycles) {
    bundle.diagnostics.warning =
      "No Budget_Master row has an appraisal cycle, so no budget base was calculated. Add a Budget_Master row for the cycle (appraisal_cycle_id) first.";
  } else if (!withBase) {
    bundle.diagnostics.warning = `None of the ${appraisalEmployees.length} Appraisal Sheet employees has a previous-cycle Total CTC with Rewards or a usable current-cycle CTC fallback, so the budget base is 0. Check Payroll_Data and Appraisal_Sheet.`;
  } else if (withBase < appraisalEmployees.length) {
    bundle.diagnostics.warning = `${appraisalEmployees.length - withBase} of ${appraisalEmployees.length} Appraisal Sheet employees have no usable previous-cycle or current-cycle Total CTC with Rewards and add 0 to the budget base.`;
  }
  if (!withTechEd) {
    bundle.diagnostics.warning =
      (bundle.diagnostics.warning ? bundle.diagnostics.warning + " " : "") +
      "No employee in Appraisal_Sheet has an Appraiser Tech-ED, so no Tech-ED gets a base.";
  }

  const techLabels = new Map();
  const compLabels = new Map();
  employees.forEach((employee) => {
    const techKey = ownerKey(employee.techEd);
    const compKey = ownerKey(employee.compManager);
    if (techKey && !techLabels.has(techKey))
      techLabels.set(techKey, employee.techEd);
    if (techKey && compKey && !compLabels.has(techKey + "::" + compKey)) {
      compLabels.set(techKey + "::" + compKey, {
        techEdKey: techKey,
        compKey,
        techEdName: employee.techEd,
        name: employee.compManager,
      });
    }
  });

  // Keep stable Employee IDs in varchar allocation columns. Display labels
  // (Employee ID - Name) are resolved by the frontend from Employee_Master.
  // Build an alias index so legacy ROWID-backed allocation rows match the same
  // canonical employee ID and do not create a second allocation for that person.
  const techAliasToKey = new Map();
  techEdOwners.forEach((item) => {
    const key = String(item.employee_id || ownerKey(item.assignment) || "")
      .trim()
      .toLowerCase();
    if (key && !techLabels.has(key))
      techLabels.set(
        key,
        String(item.employee_id || item.assignment || key).trim(),
      );
    [item.employee_id, item.row_id, item.ROWID, item.assignment, item.name]
      .filter(Boolean)
      .forEach((alias) => {
        techAliasToKey.set(ownerKey(alias), key);
      });
  });
  const canonicalTechKey = (raw) => {
    const key = ownerKey(raw);
    return techAliasToKey.get(key) || key;
  };

  const distributionTable = app.datastore().table(TABLES.distribution);
  const compTable = app.datastore().table(TABLES.comp);
  const masterTable = app.datastore().table(TABLES.master);
  const [distributionColumns, compColumns, masterColumns] = await Promise.all([
    getColumnNames(distributionTable),
    getColumnNames(compTable),
    getColumnNames(masterTable),
  ]);
  const distCalcField = pickColumn(
    distributionColumns,
    ["calculated_budget", "claculated_budget"],
    "claculated_budget",
  );
  const compCalcField = pickColumn(
    compColumns,
    ["calculated_budget", "claculated_budget"],
    "calculated_budget",
  );
  const masterCalcField = pickColumn(
    masterColumns,
    ["calculated_budget"],
    "calculated_budget",
  );

  const persistOptional = async (table, rowId, columns, candidates, val) => {
    if (!rowId) return false;
    // Never send a guessed field name to Catalyst: a missing column makes the
    // whole budget calculation return HTTP 500. Use a confirmed schema field;
    // if metadata is unavailable, try only the canonical first candidate.
    if (columns && columns.size) {
      const knownField = candidates
        .map((candidate) =>
          Array.from(columns).find(
            (column) => column.toLowerCase() === candidate.toLowerCase(),
          ),
        )
        .find(Boolean);
      if (!knownField) return false;
      await table.updateRow({ ROWID: rowId, [knownField]: val });
      return true;
    }
    // Empty schema metadata means "unknown", not "no columns". Probe the
    // dedicated snapshot first, then the legacy field without failing the API.
    for (const candidate of candidates) {
      try {
        await table.updateRow({ ROWID: rowId, [candidate]: val });
        return true;
      } catch (_) {
        // Continue to the next candidate supported by this Data Store table.
      }
    }
    return false;
  };

  // Resolve each Budget_Master row against its own immediately preceding cycle.
  // The active-cycle roster remains the API display roster, but historical budget
  // rows must not accidentally reuse the active cycle's prior-CTC values.
  const employeesForBudgetCycle = (targetCycleId) => {
    const currentCycle = currentCycleFor(targetCycleId);
    const currentRank = currentCycle
      ? cycleRank(currentCycle)
      : cycleRank({ cycle_name: targetCycleId });
    const closedCycles = cycleRows
      .filter(
        (cycle) =>
          String(
            firstValue(cycle, ["status", "cycle_status", "appraisal_status"]) ||
              "",
          )
            .trim()
            .toLowerCase() === "closed",
      )
      .filter(
        (cycle) =>
          cycleRank(cycle) > 0 &&
          currentRank > 0 &&
          cycleRank(cycle) < currentRank,
      )
      .sort((a, b) => cycleRank(b) - cycleRank(a));
    return employees.map((employee) => {
      const employeeKey = String(employee.employeeId || employee.emp_id || "")
        .trim()
        .toLowerCase();
      let priorCtc = null;
      let priorCycleName = "";
      for (const closedCycle of closedCycles) {
        const cycleId = cycleIdOf(closedCycle);
        const cycleName = cycleNameOf(closedCycle);
        const historyKey =
          (cycleId || cycleName.toLowerCase()) + "::" + employeeKey;
        const previousRecord =
          historyRowsByCycleAndEmployee.get(historyKey) ||
          historyRowsByCycleAndEmployee.get(
            cycleName.toLowerCase() + "::" + employeeKey,
          );
        if (!previousRecord) continue;
        const value = previousCtc(previousRecord);
        if (value === null) continue;
        priorCtc = value;
        priorCycleName = cycleName;
        break;
      }
      const base = priorCtc === null ? employee.current_ctc : priorCtc;
      const cycleEligibility = cycleEligibilityFor(employee, targetCycleId);
      // Eligibility_List is the source of truth for each appraisal cycle.
      // Missing/Pending rows are not eligible, matching Appraisal Sheet's
      // explicit eligible filter instead of falling back to stale master data.
      // Match the Appraisal Sheet filter exactly: a cycle-specific Eligibility_List
      // decision wins; when no decision exists, use the same Active + explicit/fallback
      // eligibility rule as employeesapi so Org Base includes exactly displayed staff.
      const eligible = cycleEligibility
        ? cycleEligibility.eligible
        : employee.eligible;
      return {
        ...employee,
        eligible,
        eligible_status: cycleEligibility
          ? cycleEligibility.status
          : employee.eligible_status,
        base,
        previous_appraisal_total_ctc_with_rewards: base,
        Previous_Appraisal_total_CTC_with_rewards: base,
        last_appraisal_date: priorCycleName || employee.last_appraisal_date,
        last_appraisal_cycle_name:
          priorCycleName || employee.last_appraisal_cycle_name,
      };
    });
  };
  // The UI headcount roster must use the same cycle-scoped Eligibility_List
  // decision as budget aggregation, not stale Employee_Master eligibility aliases.
  const activeRosterCycle = cycleRows.find(
    (cycle) =>
      String(
        firstValue(cycle, ["status", "cycle_status", "appraisal_status"]) || "",
      )
        .trim()
        .toLowerCase() === "active" &&
      cycle.archived !== true &&
      String(cycle.archived || "").toLowerCase() !== "true",
  );
  const rosterCycleId =
    cycleIdOf(activeRosterCycle) ||
    String(bundle.master[0]?.appraisal_cycle_id || "");
  bundle.active_appraisal_cycle_id = rosterCycleId;
  const rosterForCycle = rosterCycleId
    ? employeesForBudgetCycle(rosterCycleId)
    : employees;
  bundle.employeeRoster = rosterForCycle
    .filter((employee) => employee.in_appraisal_sheet)
    .map((employee) => ({
      emp_id: employee.emp_id,
      name: employee.name,
      appraiser_tech_ed: employee.appraiser_tech_ed,
      appraiser_tech_ed_appraisal_sheet:
        employee.appraiser_tech_ed_appraisal_sheet,
      comp_manager: employee.comp_manager,
      comp_manager_display: employee.comp_manager_display,
      status: employee.status,
      eligible: employee.eligible,
      eligibility: employee.eligible_status,
      eligible_status: employee.eligible_status,
      in_appraisal_sheet: Boolean(employee.in_appraisal_sheet),
      budget_base: employee.base,
      previous_appraisal_total_ctc_with_rewards:
        employee.previous_appraisal_total_ctc_with_rewards,
      Previous_Appraisal_total_CTC_with_rewards:
        employee.Previous_Appraisal_total_CTC_with_rewards,
      last_appraisal_date: employee.last_appraisal_date,
      last_appraisal_cycle_name: employee.last_appraisal_cycle_name,
      hike_amount: employee.hike_amount,
      new_pb_to_be_offered: employee.new_pb_to_be_offered,
      current_performance_bonus: employee.current_performance_bonus,
      target_pb_allocated_for_may: employee.target_pb_allocated_for_may,
      allocated_pb_amount: employee.allocated_pb_amount,
      target_pb_next_year: employee.target_pb_next_year,
      new_rb: employee.new_rb,
      joining_bonus: employee.joining_bonus,
      pb_to_be_paid: employee.pb_to_be_paid,
      previous_year_performance_bonus: employee.previous_year_performance_bonus,
      rb_to_be_paid: employee.rb_to_be_paid,
      previous_year_retention_bonus: employee.previous_year_retention_bonus,
      previous_year_joining_bonus: employee.previous_year_joining_bonus,
      utilized_amount: employee.utilized_amount,
    }));

  // Normalize every returned allocation row to the cycle's canonical ROWID.
  // Budget tables may contain cycle names while the active-cycle API returns ROWIDs;
  // mismatched aliases made the dashboard sum all cycles or select the wrong budget.
  const canonicalizeCycle = (row) => {
    const raw = String(row.appraisal_cycle_id || "").trim();
    const cycle = currentCycleFor(raw);
    if (cycle) row.appraisal_cycle_id = cycleIdOf(cycle) || raw;
  };
  bundle.master.forEach(canonicalizeCycle);
  bundle.techEd.forEach(canonicalizeCycle);
  bundle.compManager.forEach(canonicalizeCycle);

  for (const master of bundle.master) {
    const cycleId = String(master.appraisal_cycle_id || "").trim();
    if (!cycleId) continue;
    const employees = employeesForBudgetCycle(cycleId);
    // Only employees eligible in THIS appraisal cycle participate in the
    // Appraisal Sheet and organization/Tech-ED budget bases. Changes in the
    // Eligibility List are picked up on the next calculation/read.

    // Reconstruct the legacy pre-fix count from Employee_Master + this cycle's
    // Eligibility_List. The current roster is strictly Appraisal_Sheet rows; the
    // legacy count is used ONLY to recognize and repair an inflated old snapshot.
    const currentEmployeeById = new Map(
      employees.map((employee) => [
        String(employee.employeeId || employee.emp_id || "")
          .trim()
          .toLowerCase(),
        employee,
      ]),
    );
    const legacyCycleEmployees = masterEmployeeRows
      .map((masterRow) => {
        const empId = String(
          firstValue(masterRow, ["emp_id", "empId", "employee_id"]) || "",
        ).trim();
        if (!empId) return null;
        const sheetEmployee = currentEmployeeById.get(empId.toLowerCase());
        const candidate = sheetEmployee || {
          employee_master_row_id: idOf(masterRow),
          employeeId: empId,
          emp_id: empId,
        };
        const cycleEligibility = cycleEligibilityFor(candidate, cycleId);
        const rawEligibility = String(
          firstValue(masterRow, [
            "eligibility",
            "eligible_status",
            "eligibility_status",
            "eligible",
          ]) || "",
        )
          .trim()
          .toLowerCase()
          .replace(/[ _-]+/g, "");
        const rawStatus = String(
          firstValue(masterRow, ["emp_status", "status", "employee_status"]) ||
            "",
        )
          .trim()
          .toLowerCase();
        const explicitlyEligible = ["eligible", "yes", "true", "1"].includes(
          rawEligibility,
        );
        const eligible = cycleEligibility
          ? cycleEligibility.eligible
          : sheetEmployee
            ? sheetEmployee.eligible
            : rawStatus === "active" && explicitlyEligible;
        const rawTech = firstValue(masterRow, [
          "appraiser_tech_ed",
          "appraiser_tech_ed_id",
          "appraiser_tech_ed1",
          "appraiser_teched",
          "tech_ed",
          "tech_ed_id",
        ]);
        const rawComp = firstValue(masterRow, [
          "comp_manager",
          "comp_manager_id",
          "comp_manager_name",
          "director",
        ]);
        return {
          eligible,
          inEligibilityList: Boolean(cycleEligibility),
          techEd: sheetEmployee?.techEd || resolvePersonId(rawTech),
          compManager:
            sheetEmployee?.compManager || String(rawComp || "").trim(),
        };
      })
      .filter((employee) => employee && employee.inEligibilityList);
    const eligibleEmployees = employees.filter(
      (employee) => employee.eligible && employee.in_appraisal_sheet,
    );
    const legacyEligibilityCount = eligibleListCountForCycle(cycleId);
    const orgBase = eligibleEmployees.reduce(
      (sum, employee) => sum + employee.base,
      0,
    );
    const techBases = new Map(
      Array.from(techLabels.keys(), (key) => [
        key,
        { base: 0, count: 0, utilized: 0 },
      ]),
    );
    const compBases = new Map(
      Array.from(compLabels.keys(), (key) => [
        key,
        { base: 0, count: 0, utilized: 0 },
      ]),
    );
    let orgUtilized = 0;

    eligibleEmployees.forEach((employee) => {
      const techKey = ownerKey(employee.techEd);
      const compKey = ownerKey(employee.compManager);
      // Keep the exact same consumed formula as Budget Distribution: Hike +
      // Allocated PB + New RB, aggregated only over eligible Appraisal Sheet rows.
      const consumed =
        n(employee.hike_amount) +
        n(employee.allocated_pb_amount) +
        n(employee.new_rb);
      orgUtilized += consumed;
      if (techKey) {
        const tech = techBases.get(techKey) || {
          base: 0,
          count: 0,
          utilized: 0,
        };
        tech.base += employee.base;
        tech.count += 1;
        tech.utilized += consumed;
        techBases.set(techKey, tech);
      }
      if (techKey && compKey) {
        const key = techKey + "::" + compKey;
        const comp = compBases.get(key) || { base: 0, count: 0, utilized: 0 };
        comp.base += employee.base;
        comp.count += 1;
        comp.utilized += consumed;
        compBases.set(key, comp);
      }
    });

    // Upsert missing Tech-ED owners for this appraisal cycle.
    for (const [techKey, ownerName] of techLabels) {
      let row = bundle.techEd.find(
        (item) =>
          String(item.appraisal_cycle_id) === cycleId &&
          canonicalTechKey(item.appraiser_tech_ed_id) === techKey,
      );
      if (!row) {
        const created = await distributionTable.insertRow({
          appraisal_cycle_id: cycleId,
          appraiser_tech_ed_id: String(ownerName || techKey).slice(0, 20),
          percentage: null,
          budget_base: 0,
          [distCalcField]: 0,
          applied_budget: 0,
          total_utilization: 0,
        });
        row = mapDistribution(created);
        bundle.techEd.push(row);
      }
      const stats = techBases.get(techKey) || {
        base: 0,
        count: 0,
        utilized: 0,
      };
      const rawPct =
        row.percentage === null ||
        row.percentage === undefined ||
        row.percentage === ""
          ? null
          : n(row.percentage);
      const orgPct = n(master.budget_percentage);
      const orgPctSet = Boolean(master.budget_percentage_is_set);
      const effectivePct = rawPct === null ? orgPct : rawPct;
      const savedOriginalBase = n(
        row.original_budget_base || row.original_base,
      );
      const savedOriginalBudget = n(row.calculated_budget);
      // Older API builds saved base * (1 + percentage / 100). Normalize those
      // legacy snapshots to the Budget Master formula: base * percentage / 100.
      const snapshotBase =
        savedOriginalBase > 0 ? savedOriginalBase : stats.base;
      const normalizedOriginalBudget =
        savedOriginalBudget > snapshotBase + 0.5
          ? savedOriginalBudget - snapshotBase
          : savedOriginalBudget;
      const canCreateOriginal = rawPct !== null || orgPctSet;
      const looksLikeCorruptTinySnapshot =
        normalizedOriginalBudget > 0 &&
        normalizedOriginalBudget < 1000 &&
        stats.base >= 100000;
      // Original allocation is an immutable snapshot after first capture.
      // Eligibility, assignment, payroll and delegation changes affect only Updated Budget.
      const hasOriginalSnapshot =
        canCreateOriginal &&
        !looksLikeCorruptTinySnapshot &&
        normalizedOriginalBudget > 0;
      const originalBase = hasOriginalSnapshot ? snapshotBase : stats.base;
      const originalBudget = hasOriginalSnapshot
        ? normalizedOriginalBudget
        : canCreateOriginal
          ? (originalBase * effectivePct) / 100
          : 0;
      const updatedBudget =
        rawPct !== null || orgPctSet ? (stats.base * effectivePct) / 100 : 0;

      const savedOriginalCountValue = row.original_headcount;
      const hasSavedOriginalCount =
        savedOriginalCountValue !== null &&
        savedOriginalCountValue !== undefined &&
        String(savedOriginalCountValue).trim() !== "";
      const savedOriginalCountNumber = hasSavedOriginalCount
        ? n(savedOriginalCountValue)
        : stats.count;
      const legacyOwnerCount = legacyCycleEmployees.filter(
        (employee) => ownerKey(employee.techEd) === techKey,
      ).length;
      // Repair only the known legacy bug: old code copied the Eligibility List
      // count into Original Count. A matching inflated legacy count is repaired
      // once; normal eligibility/delegation changes never rewrite the baseline.
      const repairLegacyOriginalCount =
        hasSavedOriginalCount &&
        legacyOwnerCount - stats.count > 1 &&
        savedOriginalCountNumber === legacyOwnerCount;
      const originalCountIsSet =
        hasSavedOriginalCount && !repairLegacyOriginalCount;
      const savedOriginalCount = originalCountIsSet
        ? savedOriginalCountNumber
        : stats.count;
      const update = {
        ROWID: row.id,
        budget_base: stats.base,
        [distCalcField]: originalBudget,
        applied_budget: updatedBudget,
        total_utilization: stats.utilized,
      };
      // Capture the initial Tech-Ed percentage only after HR has set the Org %.
      // Once the original budget is saved, later percentage edits affect only applied_budget.
      if (rawPct === null && orgPctSet) update.percentage = effectivePct;
      if (distributionColumns) {
        const originalBaseField = [
          "original_budget_base",
          "original_base",
        ].find((key) => distributionColumns.has(key));
        const overrideField = [
          "override_percentage",
          "allocation_percentage",
        ].find((key) => distributionColumns.has(key));
        if (
          originalBaseField &&
          canCreateOriginal &&
          (!hasOriginalSnapshot || savedOriginalBase <= 0)
        ) {
          update[originalBaseField] = originalBase;
        }
        if (overrideField && rawPct === null)
          update[overrideField] = effectivePct;
      }
      await distributionTable.updateRow(update);
      // Save the initial count once. Every subsequent refresh only updates Current Count.
      if (!originalCountIsSet) {
        await persistOptional(
          distributionTable,
          row.id,
          distributionColumns,
          ["original_headcount", "allocation_headcount"],
          stats.count,
        );
      }
      await persistOptional(
        distributionTable,
        row.id,
        distributionColumns,
        ["current_headcount"],
        stats.count,
      );
      await persistOptional(
        distributionTable,
        row.id,
        distributionColumns,
        ["current_budget_base"],
        stats.base,
      );
      Object.assign(row, {
        budget_base: stats.base,
        original_budget_base: originalBase,
        percentage: rawPct === null && !orgPctSet ? null : effectivePct,
        override_percentage:
          rawPct === null && !orgPctSet
            ? null
            : rawPct === null
              ? effectivePct
              : rawPct,
        calculated_budget: originalBudget,
        applied_budget: updatedBudget,
        effective_percentage: effectivePct,
        current_headcount: stats.count,
        total_utilization: stats.utilized,
        original_headcount: savedOriginalCount,
      });
    }

    // Upsert Comp Manager owners under their matching Tech-ED parent.
    const touchedCompRowIds = new Set();
    for (const [pairKey, details] of compLabels) {
      const parent = bundle.techEd.find(
        (item) =>
          String(item.appraisal_cycle_id) === cycleId &&
          ownerKey(item.appraiser_tech_ed_id) === details.techEdKey,
      );
      if (!parent) continue;
      let row = bundle.compManager.find(
        (item) =>
          String(item.appraisal_cycle_id) === cycleId &&
          String(item.budget_distribution_id) === String(parent.id) &&
          ownerKey(item.comp_manager) === details.compKey,
      );
      if (!row) {
        const created = await compTable.insertRow({
          appraisal_cycle_id: cycleId,
          budget_distribution_id: String(parent.id),
          comp_manager: String(details.compKey || details.name).slice(0, 30),
          // A new Comp Manager inherits the Tech-Ed's effective percentage,
          // giving the assigned team an initial base-proportional allocation.
          percentage: n(
            parent.effective_percentage ??
              parent.percentage ??
              master.budget_percentage,
          ),
          budget_base: 0,
          [compCalcField]: 0,
          applied_budget: 0,
          total_utilization: 0,
        });
        row = mapComp(created);
        bundle.compManager.push(row);
      }
      touchedCompRowIds.add(String(row.id));
      const stats = compBases.get(pairKey) || {
        base: 0,
        count: 0,
        utilized: 0,
      };
      const pct = n(row.percentage);
      const savedOriginalBase = n(
        row.original_budget_base || row.original_base,
      );
      const savedOriginalBudget = n(row.calculated_budget);
      // The Comp Manager original is immutable after first capture; current
      // eligibility and assignment changes update only its live allocation.
      const looksLikeCorruptTinySnapshot =
        savedOriginalBudget > 0 &&
        savedOriginalBudget < 1000 &&
        stats.base >= 100000;
      const hasOriginalSnapshot =
        Boolean(row.calculated_budget_is_set) &&
        savedOriginalBudget > 0 &&
        !looksLikeCorruptTinySnapshot;
      const originalBase = hasOriginalSnapshot
        ? savedOriginalBase > 0
          ? savedOriginalBase
          : stats.base
        : stats.base;
      // Comp Manager % is an allocation share of the team CTC base, not an extra hike on top of that base.
      const originalBudget = hasOriginalSnapshot
        ? savedOriginalBudget
        : (originalBase * pct) / 100;
      const updatedBudget = (stats.base * pct) / 100;
      const savedOriginalCountValue = row.original_headcount;
      const hasSavedOriginalCount =
        savedOriginalCountValue !== null &&
        savedOriginalCountValue !== undefined &&
        String(savedOriginalCountValue).trim() !== "";
      const savedOriginalCountNumber = hasSavedOriginalCount
        ? n(savedOriginalCountValue)
        : stats.count;
      const legacyOwnerCount = legacyCycleEmployees.filter(
        (employee) =>
          ownerKey(employee.techEd) === details.techEdKey &&
          ownerKey(employee.compManager) === details.compKey,
      ).length;
      // Repair a legacy baseline only when it exactly matches the inflated
      // Eligibility List team count, not after ordinary eligibility/delegation changes.
      const repairLegacyOriginalCount =
        hasSavedOriginalCount &&
        legacyOwnerCount > stats.count &&
        savedOriginalCountNumber === legacyOwnerCount;
      const originalCountIsSet =
        hasSavedOriginalCount && !repairLegacyOriginalCount;
      const savedOriginalCount = originalCountIsSet
        ? savedOriginalCountNumber
        : stats.count;
      const update = {
        ROWID: row.id,
        budget_base: stats.base,
        [compCalcField]: originalBudget,
        applied_budget: updatedBudget,
        total_utilization: stats.utilized,
      };
      if (compColumns) {
        const originalBaseField = [
          "original_budget_base",
          "original_base",
        ].find((key) => compColumns.has(key));
        if (
          originalBaseField &&
          (!hasOriginalSnapshot || savedOriginalBase <= 0)
        ) {
          update[originalBaseField] = originalBase;
        }
      }
      await compTable.updateRow(update);
      if (!originalCountIsSet) {
        await persistOptional(
          compTable,
          row.id,
          compColumns,
          ["original_headcount", "allocation_headcount"],
          stats.count,
        );
      }
      await persistOptional(
        compTable,
        row.id,
        compColumns,
        ["current_headcount"],
        stats.count,
      );
      await persistOptional(
        compTable,
        row.id,
        compColumns,
        ["current_budget_base"],
        stats.base,
      );
      Object.assign(row, {
        budget_base: stats.base,
        calculated_budget: originalBudget,
        applied_budget: updatedBudget,
        current_headcount: stats.count,
        total_utilization: stats.utilized,
        original_headcount: savedOriginalCount,
      });
    }

    // A Comp Manager whose whole team was delegated away (or became not
    // eligible) is no longer in compLabels for this Tech-ED, so the loop above
    // never refreshed that row. Its old applied_budget would stay in the
    // Tech-ED's allotted total and block every new % change. Keep the row and
    // its Original Count snapshot, but bring the live figures down to zero.
    for (const staleRow of bundle.compManager) {
      if (String(staleRow.appraisal_cycle_id) !== cycleId) continue;
      if (touchedCompRowIds.has(String(staleRow.id))) continue;
      if (!staleRow.id) continue;
      if (
        n(staleRow.budget_base) === 0 &&
        n(staleRow.applied_budget) === 0 &&
        staleRow.current_headcount !== "" &&
        n(staleRow.current_headcount) === 0
      )
        continue;
      await compTable.updateRow({
        ROWID: staleRow.id,
        budget_base: 0,
        applied_budget: 0,
        total_utilization: 0,
      });
      await persistOptional(
        compTable,
        staleRow.id,
        compColumns,
        ["current_headcount"],
        0,
      );
      await persistOptional(
        compTable,
        staleRow.id,
        compColumns,
        ["current_budget_base"],
        0,
      );
      Object.assign(staleRow, {
        budget_base: 0,
        applied_budget: 0,
        total_utilization: 0,
        current_headcount: 0,
      });
    }

    // Org totals are the roll-up of the Tech-ED allocations. Preserve the
    // original budget once captured; refresh the current/applied total each read.
    const cycleTech = bundle.techEd.filter(
      (row) => String(row.appraisal_cycle_id) === cycleId,
    );
    const previousOrgBase = n(master.org_budget_base);
    const previousOrgOriginalRaw = n(master.calculated_budget);
    const orgPct = n(master.budget_percentage);
    const orgPctSet = Boolean(master.budget_percentage_is_set);
    // Normalize legacy snapshots from base * (1 + %) to the canonical
    // Budget Master calculation base * percentage / 100.
    const savedOrgOriginalBase = n(
      master.original_budget_base || master.original_base,
    );
    const orgSnapshotBase =
      savedOrgOriginalBase > 0 ? savedOrgOriginalBase : orgBase;
    const previousOrgOriginal =
      previousOrgOriginalRaw > orgSnapshotBase + 0.5
        ? previousOrgOriginalRaw - orgSnapshotBase
        : previousOrgOriginalRaw;
    const looksLikeCorruptTinyOrgSnapshot =
      previousOrgOriginal > 0 &&
      previousOrgOriginal < 1000 &&
      orgBase >= 100000;
    // Keep the original amount captured at first allocation. Eligibility and
    // assignment changes affect the live base and Updated Budget only.
    const hasOrgOriginalSnapshot =
      orgPctSet && !looksLikeCorruptTinyOrgSnapshot && previousOrgOriginal > 0;
    const orgOriginalBase = hasOrgOriginalSnapshot
      ? savedOrgOriginalBase > 0
        ? savedOrgOriginalBase
        : orgBase
      : orgBase;
    const orgOriginal = hasOrgOriginalSnapshot
      ? previousOrgOriginal
      : orgPctSet
        ? (orgOriginalBase * orgPct) / 100
        : 0;
    const orgUpdated = orgPctSet ? (orgBase * orgPct) / 100 : 0;
    const savedOrgOriginalCountValue = master.original_headcount;
    const hasSavedOrgOriginalCount =
      savedOrgOriginalCountValue !== null &&
      savedOrgOriginalCountValue !== undefined &&
      String(savedOrgOriginalCountValue).trim() !== "";
    const savedOrgOriginalCountNumber = hasSavedOrgOriginalCount
      ? n(savedOrgOriginalCountValue)
      : eligibleEmployees.length;
    // Repair the known legacy bug where Eligibility_List count (e.g. 30) was
    // saved instead of generated Appraisal_Sheet count (e.g. 23). Keep the
    // corrected original count immutable after this one-time repair.
    const repairLegacyOrgOriginalCount =
      hasSavedOrgOriginalCount &&
      legacyEligibilityCount - eligibleEmployees.length > 1 &&
      savedOrgOriginalCountNumber === legacyEligibilityCount;
    const orgOriginalCountIsSet =
      hasSavedOrgOriginalCount && !repairLegacyOrgOriginalCount;
    const savedOrgOriginalCount = orgOriginalCountIsSet
      ? savedOrgOriginalCountNumber
      : eligibleEmployees.length;
    const orgFields = {
      ROWID: master.id,
      // Live sum of previous-appraisal CTC for eligible employees in this cycle.
      // The original snapshot belongs in original_budget_base/original_base.
      org_budget_base: orgBase,
      [masterCalcField]: orgOriginal,
      applied_budget: orgUpdated,
      budget_utilized: orgUtilized,
    };
    if (masterColumns) {
      const originalBaseField = ["original_budget_base", "original_base"].find(
        (key) => masterColumns.has(key),
      );
      if (
        originalBaseField &&
        orgPctSet &&
        (!hasOrgOriginalSnapshot || savedOrgOriginalBase <= 0)
      ) {
        orgFields[originalBaseField] = orgOriginalBase;
      }
    }
    await masterTable.updateRow(orgFields);
    if (!orgOriginalCountIsSet) {
      await persistOptional(
        masterTable,
        master.id,
        masterColumns,
        ["original_headcount", "allocation_headcount"],
        eligibleEmployees.length,
      );
    }
    await persistOptional(
      masterTable,
      master.id,
      masterColumns,
      ["current_headcount"],
      eligibleEmployees.length,
    );
    await persistOptional(
      masterTable,
      master.id,
      masterColumns,
      ["current_budget_base"],
      orgBase,
    );
    Object.assign(master, {
      org_budget_base: orgBase,
      original_budget_base: orgOriginalBase,
      calculated_budget: orgOriginal,
      applied_budget: orgUpdated,
      budget_utilized: orgUtilized,
      current_budget_base: orgBase,
      current_headcount: eligibleEmployees.length,
      original_headcount: savedOrgOriginalCount,
    });
  }

  return bundle;
}

module.exports = async function (req, res) {
  try {
    const method = String(req.method || "GET").toUpperCase();
    if (method === "OPTIONS") return sendJson(res, 200, { success: true });

    const a = await checkAccess(req);
    requireBudgetScreen(a, method === "GET" ? "view" : "edit");

    // Budget tables are accessed server-side after accessCore has already authorized
    // the signed-in user. Use the admin-scoped Catalyst app here so Data Store
    // App User table permissions cannot turn an authorized budget request into
    // a 500 error.
    const app = catalyst.initialize(req, { scope: "admin" });

    if (method === "GET") {
      // Keep this endpoint limited to the three budget tables. The frontend
      // already loads the full employee roster through employeesapi; scanning
      // both employee tables again here caused Catalyst's execution timeout.
      const [rawBundle, techEdOwners] = await Promise.all([
        readBundle(app),
        readTechEdOwners(app),
      ]);
      let calculatedBundle = rawBundle;
      try {
        calculatedBundle = await calculateBudgetBases(
          app,
          rawBundle,
          techEdOwners,
        );
      } catch (calculationError) {
        // Never report a successful zero-budget response when source calculations
        // failed. Return the actionable source/schema error to the frontend.
        console.error("Budget base calculation failed:", calculationError);
        return sendJson(res, 500, {
          success: false,
          message:
            "Could not calculate budget from Appraisal_Sheet: " +
            String(
              (calculationError && calculationError.message) ||
                calculationError,
            ),
        });
      }
      const bundle = filterOwn(calculatedBundle, a, techEdOwners);
      return sendJson(res, 200, {
        success: true,
        data: bundle.techEd,
        master: bundle.master,
        techEd: bundle.techEd,
        compManager: bundle.compManager,
        techEdOwners,
        employeeRoster: bundle.employeeRoster || [],
        techEdCount: techEdOwners.length,
        diagnostics: calculatedBundle.diagnostics || null,
        active_appraisal_cycle_id:
          calculatedBundle.active_appraisal_cycle_id || "",
        more_records: false,
        next_token: null,
      });
    }

    if (method !== "PUT") {
      return sendJson(res, 405, {
        success: false,
        message: "Method not allowed",
      });
    }

    const body = await parseBody(req);
    const resource = String(body.resource || "master").toLowerCase();
    let id = String(body.id || "").trim();

    // Upsert cycle-scoped allocations using the actual foreign-key ROWIDs.
    // Budget_Master.appraisal_cycle_id and both cycle/parent columns are Data Store
    // foreign keys; the Tech-ED/Comp Manager varchar columns store business IDs.
    if (
      !id &&
      resource === "master" &&
      String(body.appraisal_cycle_id || "").trim()
    ) {
      if (a.enforced && !Boolean(a.scope && a.scope.all) && !isHR(a.user)) {
        throw new access.HttpError(403, "Only HR can update Budget Master.");
      }
      if (!a.enforced) {
        const currentUser = await app.userManagement().getCurrentUser();
        if (!currentUser || !isHR(currentUser)) {
          return sendJson(res, 403, {
            success: false,
            message: "Only HR can update Budget Master.",
          });
        }
      }
      const cycleId = String(body.appraisal_cycle_id).trim();
      const existing = (await getAllRows(app, "Budget_Master")).find(
        (row) => String(value(row, "appraisal_cycle_id")) === cycleId,
      );
      if (existing) {
        id = idOf(existing);
      } else {
        const masterTable = app.datastore().table(TABLES.master);
        const created = await masterTable.insertRow({
          appraisal_cycle_id: cycleId,
          budget_percentage: n(body.budget_percentage),
          budget_utilized: n(body.budget_utilized),
          org_budget_base: n(body.org_budget_base),
          calculated_budget: n(body.calculated_budget),
          applied_budget: n(body.applied_budget),
        });
        id = idOf(created);
      }
    }

    if (
      !id &&
      resource === "distribution" &&
      String(body.appraisal_cycle_id || "").trim() &&
      String(body.appraiser_tech_ed_id || "").trim()
    ) {
      const cycleId = String(body.appraisal_cycle_id).trim();
      const techEdId = String(body.appraiser_tech_ed_id)
        .trim()
        .split(/\s+-\s+/)[0]
        .slice(0, 20);
      if (
        a.enforced &&
        !Boolean(a.scope && a.scope.all) &&
        !matchesTechEdOwner(techEdId, a, await readTechEdOwners(app))
      ) {
        throw new access.HttpError(
          403,
          "You can only configure your own Tech-Ed budget.",
        );
      }
      access.guard(a, () => access.requireAction(a, "changeBudgetConfig"));
      const existing = (await getAllRows(app, "Budget_Distribution")).find(
        (row) =>
          String(value(row, "appraisal_cycle_id")) === cycleId &&
          ownerKey(value(row, "appraiser_tech_ed_id")) === ownerKey(techEdId),
      );
      if (existing) {
        id = idOf(existing);
      } else {
        const distTable = app.datastore().table(TABLES.distribution);
        const calcField = pickColumn(
          await getColumnNames(distTable),
          ["calculated_budget", "claculated_budget"],
          "claculated_budget",
        );
        const created = await distTable.insertRow({
          appraisal_cycle_id: cycleId,
          appraiser_tech_ed_id: techEdId,
          percentage:
            body.percentage === "" || body.percentage === undefined
              ? null
              : n(body.percentage),
          budget_base: n(body.budget_base),
          [calcField]: n(body.calculated_budget),
          applied_budget: n(body.applied_budget),
          total_utilization: n(body.total_utilization),
        });
        id = idOf(created);
      }
    }

    // A Comp Manager in the Tech-ED's team may have no Budget_Distribution_Comp
    // row yet: create it under the parent allocation, then update it below.
    if (
      !id &&
      (resource === "comp" || resource === "compmanager") &&
      body.budget_distribution_id &&
      String(body.comp_manager || "").trim()
    ) {
      const parentId = String(body.budget_distribution_id).trim();
      const compName = String(body.comp_manager).trim();
      const parent = (await getAllRows(app, "Budget_Distribution")).find(
        (row) => idOf(row) === parentId,
      );
      if (!parent) {
        return sendJson(res, 400, {
          success: false,
          message: "The parent Tech-Ed budget allocation was not found.",
        });
      }
      const adminScope = Boolean(a && a.scope && a.scope.all);
      if (
        a.enforced &&
        !adminScope &&
        !matchesTechEdOwner(
          value(parent, "appraiser_tech_ed_id"),
          a,
          await readTechEdOwners(app),
        )
      ) {
        throw new access.HttpError(
          403,
          "You can only update Comp Manager budgets under your Tech-Ed.",
        );
      }
      const existingComp = (
        await getAllRows(app, "Budget_Distribution_Comp")
      ).find(
        (row) =>
          String(value(row, "budget_distribution_id")) === parentId &&
          ownerKey(value(row, "comp_manager")) === ownerKey(compName),
      );
      if (existingComp) {
        id = idOf(existingComp);
      } else {
        const compTable = app.datastore().table(TABLES.comp);
        const calcField = pickColumn(
          await getColumnNames(compTable),
          ["calculated_budget", "claculated_budget"],
          "calculated_budget",
        );
        const created = await compTable.insertRow({
          appraisal_cycle_id: String(value(parent, "appraisal_cycle_id")),
          budget_distribution_id: parentId,
          comp_manager: compName,
          percentage: 0,
          budget_base: n(body.budget_base),
          [calcField]: 0,
          applied_budget: 0,
          total_utilization: 0,
        });
        id = idOf(created);
      }
    }
    if (!id)
      return sendJson(res, 400, {
        success: false,
        message: "Budget row id is required.",
      });

    const tables = {
      master: { table: TABLES.master, mapper: mapMaster },
      distribution: { table: TABLES.distribution, mapper: mapDistribution },
      comp: { table: TABLES.comp, mapper: mapComp },
      compmanager: { table: TABLES.comp, mapper: mapComp },
    };
    const target = tables[resource];
    if (!target)
      return sendJson(res, 400, {
        success: false,
        message: "Invalid budget resource.",
      });

    const isAdminScope = Boolean(a && a.scope && a.scope.all);
    if (!a.enforced) {
      const user = await app.userManagement().getCurrentUser();
      if (!user)
        return sendJson(res, 401, {
          success: false,
          message: "Authentication is required.",
        });
      if (!isHR(user) && resource === "master") {
        return sendJson(res, 403, {
          success: false,
          message: "Only HR can update Budget Master.",
        });
      }
    }

    const table = app.datastore().table(target.table);
    const currentRows = await getAllRows(
      app,
      Object.keys(TABLES).find((key) => TABLES[key] === target.table) ===
        "master"
        ? "Budget_Master"
        : Object.keys(TABLES).find((key) => TABLES[key] === target.table) ===
            "distribution"
          ? "Budget_Distribution"
          : "Budget_Distribution_Comp",
    );
    const current = currentRows.find((row) => idOf(row) === id);
    if (!current)
      return sendJson(res, 404, {
        success: false,
        message: "Budget row not found.",
      });

    if (resource === "comp" || resource === "compmanager") {
      const requestedPercentage = Object.prototype.hasOwnProperty.call(
        body,
        "percentage",
      )
        ? Number(body.percentage)
        : n(value(current, "percentage"));
      if (
        !Number.isFinite(requestedPercentage) ||
        requestedPercentage < 0 ||
        requestedPercentage > 100
      ) {
        return sendJson(res, 400, {
          success: false,
          message:
            "Comp Manager allotment percentage must be between 0 and 100.",
        });
      }

      const parentId = String(value(current, "budget_distribution_id") || "");
      const parentRows = await getAllRows(app, "Budget_Distribution");
      const parent = parentRows.find((row) => idOf(row) === parentId);
      if (!parent) {
        return sendJson(res, 400, {
          success: false,
          message: "The parent Tech-Ed budget allocation was not found.",
        });
      }

      // Business rule: a Comp Manager's Allot % is applied to that manager's
      // own team CTC base (Updated Budget = base x % / 100), and the Comp
      // Managers' budgets together may not exceed the Tech-Ed's Updated Budget.
      // The server recomputes the amount from its own stored base instead of
      // trusting the browser's applied_budget, so both sides always agree.
      const storedBase = n(value(current, "budget_base"));
      const rowBase = storedBase > 0 ? storedBase : n(body.budget_base);
      const requestedApplied = (rowBase * requestedPercentage) / 100;
      body.applied_budget = requestedApplied;
      // The stored base is refreshed from Appraisal_Sheet on every read; a
      // value posted by the browser must not overwrite it.
      if (storedBase > 0) delete body.budget_base;
      const siblings = await getAllRows(app, "Budget_Distribution_Comp");
      const totalAfter =
        siblings
          .filter(
            (row) =>
              String(value(row, "budget_distribution_id") || "") === parentId &&
              idOf(row) !== id,
          )
          .filter((row) => {
            // A Comp Manager whose team is now empty holds no budget.
            const live = value(row, "current_headcount");
            return !(String(live).trim() !== "" && n(live) === 0);
          })
          .reduce(
            (sum, row) =>
              sum +
              (n(value(row, "budget_base")) * n(value(row, "percentage"))) /
                100,
            0,
          ) + requestedApplied;
      const parentBudget = n(value(parent, "applied_budget"));
      // One rupee of tolerance for floating point / rounding.
      if (totalAfter > parentBudget + 1) {
        return sendJson(res, 400, {
          success: false,
          message:
            "Allocation blocked: Comp Manager budgets would total " +
            Math.round(totalAfter).toLocaleString("en-IN") +
            ", exceeding the Tech-Ed's available budget of " +
            Math.round(parentBudget).toLocaleString("en-IN") +
            ". Reduce one or more Comp Manager percentages.",
        });
      }
    }

    if (a.enforced && !isAdminScope) {
      if (
        resource === "distribution" &&
        !matchesTechEdOwner(
          value(current, "appraiser_tech_ed_id"),
          a,
          await readTechEdOwners(app),
        )
      ) {
        throw new access.HttpError(
          403,
          "You can only update your own Tech-Ed budget.",
        );
      }
      if (resource === "comp" || resource === "compmanager") {
        const parentId = String(value(current, "budget_distribution_id") || "");
        const parents = await getAllRows(app, "Budget_Distribution");
        const parent = parents.find((row) => idOf(row) === parentId);
        if (
          !parent ||
          !matchesTechEdOwner(
            value(parent, "appraiser_tech_ed_id"),
            a,
            await readTechEdOwners(app),
          )
        ) {
          throw new access.HttpError(
            403,
            "You can only update Comp Manager budgets under your Tech-Ed.",
          );
        }
      }
      if (resource === "master" && !isHR(a.user)) {
        throw new access.HttpError(403, "Only HR can update Budget Master.");
      }
    }

    const fieldsByResource = {
      master: [
        "budget_percentage",
        "org_budget_base",
        "budget_utilized",
        "calculated_budget",
        "applied_budget",
      ],
      distribution: [
        "percentage",
        "budget_base",
        "total_utilization",
        "applied_budget",
        "appraisal_cycle_id",
        "appraiser_tech_ed_id",
      ],
      comp: [
        "percentage",
        "budget_base",
        "total_utilization",
        "applied_budget",
        "comp_manager",
        "budget_distribution_id",
        "appraisal_cycle_id",
      ],
    };
    const fields = [
      ...fieldsByResource[resource === "compmanager" ? "comp" : resource],
    ];
    if (
      resource === "distribution" ||
      resource === "comp" ||
      resource === "compmanager"
    ) {
      const columns = await getColumnNames(table);
      const fallback =
        resource === "distribution" ? "claculated_budget" : "calculated_budget";
      fields.push(
        pickColumn(
          columns,
          ["calculated_budget", "claculated_budget"],
          fallback,
        ),
      );
    }
    const update = { ROWID: id };
    fields.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        update[key] = body[key];
        // Store the stable business employee ID in the varchar Tech-Ed field,
        // even when the UI submits the friendly "Employee ID - Name" label.
        if (resource === "distribution" && key === "appraiser_tech_ed_id") {
          update[key] = String(body[key] || "")
            .trim()
            .split(/\s+-\s+/)[0]
            .slice(0, 20);
        }
      }
      // Frontend uses calculated_budget. Persist to whichever calculated
      // amount column actually exists in this Data Store table.
      if (
        (key === "claculated_budget" || key === "calculated_budget") &&
        Object.prototype.hasOwnProperty.call(body, "calculated_budget")
      ) {
        update[key] = body.calculated_budget;
      }
    });

    const changed = Object.keys(update).filter((key) => key !== "ROWID");
    if (!changed.length)
      return sendJson(res, 400, {
        success: false,
        message: "No budget fields were provided.",
      });

    access.guard(a, function () {
      if (
        resource === "master" ||
        resource === "distribution" ||
        resource === "comp" ||
        resource === "compmanager"
      ) {
        if (
          changed.some((key) =>
            [
              "budget_percentage",
              "org_budget_base",
              "budget_base",
              "percentage",
              "calculated_budget",
              "claculated_budget",
              "applied_budget",
            ].includes(key),
          )
        ) {
          try {
            access.requireAction(a, "changeBudgetConfig");
          } catch (e) {
            if (!(e instanceof access.HttpError)) throw e;
          }
        }
        if (
          changed.some((key) =>
            ["budget_utilized", "total_utilization"].includes(key),
          )
        ) {
          try {
            access.requireAction(a, "allotNextLevel");
          } catch (e) {
            if (!(e instanceof access.HttpError)) throw e;
          }
        }
      }
    });

    const updated = await table.updateRow(update);
    return sendJson(res, 200, {
      success: true,
      resource,
      data: target.mapper(updated),
    });
  } catch (error) {
    if (error instanceof access.HttpError) return sendAccessError(res, error);
    console.error("budgetmasterapi:", error);
    return sendJson(res, 500, {
      success: false,
      message: error && error.message ? error.message : "Budget API failed.",
    });
  }
};
