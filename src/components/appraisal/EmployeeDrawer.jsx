// import { X } from "lucide-react";
// import { Button } from "@/components/ui/button";

// import {
//   hikeAmount,
//   hikePct,
//   totalBonus,
//   totalOfPB,
//   pct,
// } from "@/lib/appraisal-data";

// import { getPreviousYearData } from "@/lib/previous-year-data";

// // ============================================================
// // HELPERS
// // ============================================================

// function valueOrDash(value) {
//   return value === undefined || value === null || value === ""
//     ? "—"
//     : String(value);
// }

// function currency(value) {
//   if (value === undefined || value === null || value === "") {
//     return "—";
//   }

//   return Math.round(Number(value) || 0).toLocaleString("en-IN");
// }

// function percentageChange(current, previous) {
//   const c = Number(current);
//   const p = Number(previous);

//   if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) {
//     return "—";
//   }

//   const change = ((c - p) / p) * 100;

//   return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
// }

// function formatValue(value, type) {
//   if (value === undefined || value === null || value === "") {
//     return "—";
//   }

//   if (type === "currency") {
//     return currency(value);
//   }

//   if (type === "percent") {
//     return pct(value);
//   }

//   return valueOrDash(value);
// }

// // ============================================================
// // INFO BOX
// // ============================================================

// function Info({ label, value }) {
//   return (
//     <div className="min-w-0 rounded border border-border bg-muted/20 px-1.5 py-1">
//       <div className="truncate text-[7px] uppercase tracking-wide text-muted-foreground">
//         {label}
//       </div>

//       <div className="mt-0.5 truncate text-[9px] font-semibold">
//         {valueOrDash(value)}
//       </div>
//     </div>
//   );
// }

// // ============================================================
// // COMPENSATION ITEM
// // ============================================================

// function CompensationItem({ label, value, change }) {
//   return (
//     <div className="border-b border-border px-2 py-1 last:border-b-0">
//       <div className="truncate text-[7px] uppercase tracking-wide text-muted-foreground">
//         {label}
//       </div>

//       <div className="mt-0.5 truncate text-[9px] font-semibold">{value}</div>

//       {change !== undefined && (
//         <div className="mt-0.5 truncate text-[8px] font-semibold">{change}</div>
//       )}
//     </div>
//   );
// }

// // ============================================================
// // EMPLOYEE DRAWER
// // ============================================================

// export function EmployeeDrawer({ employee, onOpenChange }) {
//   if (!employee) {
//     return null;
//   }

//   // ----------------------------------------------------------
//   // Previous Year
//   // ----------------------------------------------------------

//   const previous = getPreviousYearData(employee.empId) || {};

//   const previousBasePay = previous.basePay ?? null;
//   const previousAllocatedPB = previous.allocatedPB ?? null;
//   const previousPerformanceBonus = previous.performanceBonus ?? null;
//   const previousRetentionBonus = previous.retentionBonus ?? null;
//   const previousTotalPB = previous.totalPB ?? null;
//   const previousTotalBonus = previous.totalBonus ?? null;
//   const previousHikeAmount = previous.hikeAmount ?? null;
//   const previousHikePct = previous.hikePct ?? null;
//   const previousNewCTC = previous.newCTC ?? null;

//   // ----------------------------------------------------------
//   // Current Year
//   // ----------------------------------------------------------

//   const currentBasePay = Number(employee.currentAnnualBasePay || 0);
//   const currentAllocatedPB = employee.allocatedPBAmount;
//   const currentPerformanceBonus = employee.newPBToBeOffered;
//   const currentRetentionBonus = employee.newRB;

//   const currentTotalPB = totalOfPB(employee);
//   const currentTotalBonus = totalBonus(employee);

//   const currentHikeAmount = hikeAmount(employee);
//   const currentHikePct = hikePct(employee);

//   const currentNewBasePay = currentBasePay + currentHikeAmount;
//   const currentNewCTC = currentNewBasePay + currentTotalBonus;

//   // ----------------------------------------------------------
//   // Changes
//   // ----------------------------------------------------------

//   const changes = {
//     basePay: percentageChange(currentBasePay, previousBasePay),
//     allocatedPB: percentageChange(currentAllocatedPB, previousAllocatedPB),
//     performanceBonus: percentageChange(
//       currentPerformanceBonus,
//       previousPerformanceBonus,
//     ),
//     retentionBonus: percentageChange(
//       currentRetentionBonus,
//       previousRetentionBonus,
//     ),
//     totalPB: percentageChange(currentTotalPB, previousTotalPB),
//     totalBonus: percentageChange(currentTotalBonus, previousTotalBonus),
//     hikeAmount: percentageChange(currentHikeAmount, previousHikeAmount),
//     hikePct: percentageChange(currentHikePct, previousHikePct),
//     newCTC: percentageChange(currentNewCTC, previousNewCTC),
//   };

//   return (
//     <div className="w-full overflow-hidden rounded-md border border-border bg-card shadow-sm">
//       {/* ======================================================
//           HEADER
//       ====================================================== */}

//       <div className="flex h-7 items-center justify-between border-b border-border px-2.5">
//         <div className="flex min-w-0 items-center gap-1.5">
//           <h3 className="truncate text-[10px] font-semibold">
//             {employee.name}
//           </h3>

//           <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[7px] text-muted-foreground">
//             {employee.empId}
//           </span>

//           <span className="hidden truncate text-[7px] text-muted-foreground sm:inline">
//             {valueOrDash(employee.designation)}
//           </span>
//         </div>

//         <Button
//           type="button"
//           variant="ghost"
//           size="icon"
//           className="size-5 shrink-0"
//           onClick={() => onOpenChange(false)}
//         >
//           <X className="size-3" />
//         </Button>
//       </div>

//       {/* ======================================================
//           EMPLOYEE INFORMATION
//       ====================================================== */}

//       <div className="border-b border-border px-2.5 py-1">
//         <div className="grid grid-cols-4 gap-1 md:grid-cols-8">
//           <Info
//             label="Wissen Exp."
//             value={
//               employee.wissenExperience !== undefined
//                 ? `${employee.wissenExperience} yrs`
//                 : null
//             }
//           />

//           <Info
//             label="Total Exp."
//             value={
//               employee.totalExperience !== undefined
//                 ? `${employee.totalExperience} yrs`
//                 : null
//             }
//           />

//           <Info label="Last Appraisal" value={employee.lastAppraisalDate} />

//           <Info label="Manager Rating" value={employee.managerRating} />

//           <Info label="Interviews" value={employee.interviewCount} />

//           <Info
//             label="RR%"
//             value={
//               employee.rrPercent !== undefined ? pct(employee.rrPercent) : null
//             }
//           />

//           <Info label="Gross Margin" value={employee.grossMargin} />

//           <Info label="Status" value={employee.status} />
//         </div>
//       </div>

//       {/* ======================================================
//           THREE SEPARATE PANELS
//           Previous | Current | Changes
//       ====================================================== */}

//       <div className="grid grid-cols-3 gap-1 px-2.5 py-1">
//         {/* ====================================================
//             PREVIOUS YEAR
//         ==================================================== */}

//         <div className="min-w-0 overflow-hidden rounded border border-border">
//           <div className="border-b border-border bg-muted/40 px-2 py-1 text-[8px] font-bold uppercase tracking-wide">
//             Previous Year
//           </div>

//           <CompensationItem
//             label="Annual Base Pay"
//             value={formatValue(previousBasePay, "currency")}
//           />

//           <CompensationItem
//             label="Allocated PB"
//             value={formatValue(previousAllocatedPB, "currency")}
//           />

//           <CompensationItem
//             label="Performance Bonus"
//             value={formatValue(previousPerformanceBonus, "currency")}
//           />

//           <CompensationItem
//             label="Retention Bonus"
//             value={formatValue(previousRetentionBonus, "currency")}
//           />

//           <CompensationItem
//             label="Total PB"
//             value={formatValue(previousTotalPB, "currency")}
//           />

//           <CompensationItem
//             label="Total Bonus"
//             value={formatValue(previousTotalBonus, "currency")}
//           />

//           <CompensationItem
//             label="Hike Amount"
//             value={formatValue(previousHikeAmount, "currency")}
//           />

//           <CompensationItem
//             label="Hike %"
//             value={formatValue(previousHikePct, "percent")}
//           />

//           <CompensationItem
//             label="New CTC"
//             value={formatValue(previousNewCTC, "currency")}
//           />
//         </div>

//         {/* ====================================================
//             CURRENT YEAR
//         ==================================================== */}

//         <div className="min-w-0 overflow-hidden rounded border border-border">
//           <div className="border-b border-border bg-primary/10 px-2 py-1 text-[8px] font-bold uppercase tracking-wide">
//             Current Year
//           </div>

//           <CompensationItem
//             label="Annual Base Pay"
//             value={formatValue(currentBasePay, "currency")}
//           />

//           <CompensationItem
//             label="Allocated PB"
//             value={formatValue(currentAllocatedPB, "currency")}
//           />

//           <CompensationItem
//             label="Performance Bonus"
//             value={formatValue(currentPerformanceBonus, "currency")}
//           />

//           <CompensationItem
//             label="Retention Bonus"
//             value={formatValue(currentRetentionBonus, "currency")}
//           />

//           <CompensationItem
//             label="Total PB"
//             value={formatValue(currentTotalPB, "currency")}
//           />

//           <CompensationItem
//             label="Total Bonus"
//             value={formatValue(currentTotalBonus, "currency")}
//           />

//           <CompensationItem
//             label="Hike Amount"
//             value={formatValue(currentHikeAmount, "currency")}
//           />

//           <CompensationItem
//             label="Hike %"
//             value={formatValue(currentHikePct, "percent")}
//           />

//           <CompensationItem
//             label="New CTC"
//             value={formatValue(currentNewCTC, "currency")}
//           />
//         </div>

//         {/* ====================================================
//             CHANGES
//         ==================================================== */}

//         <div className="min-w-0 overflow-hidden rounded border border-border">
//           <div className="border-b border-border bg-muted/40 px-2 py-1 text-[8px] font-bold uppercase tracking-wide">
//             Changes
//           </div>

//           <CompensationItem label="Annual Base Pay" value={changes.basePay} />

//           <CompensationItem label="Allocated PB" value={changes.allocatedPB} />

//           <CompensationItem
//             label="Performance Bonus"
//             value={changes.performanceBonus}
//           />

//           <CompensationItem
//             label="Retention Bonus"
//             value={changes.retentionBonus}
//           />

//           <CompensationItem label="Total PB" value={changes.totalPB} />

//           <CompensationItem label="Total Bonus" value={changes.totalBonus} />

//           <CompensationItem label="Hike Amount" value={changes.hikeAmount} />

//           <CompensationItem label="Hike %" value={changes.hikePct} />

//           <CompensationItem label="New CTC" value={changes.newCTC} />
//         </div>
//       </div>

//       {/* ======================================================
//           PAYMENT SUMMARY
//       ====================================================== */}

//       <div className="grid grid-cols-4 gap-1 border-t border-border bg-muted/10 px-2.5 py-1">
//         <Info label="RB to be Paid" value={currency(employee.rbToBePaid)} />

//         <Info label="Month RB" value={employee.monthRB} />

//         <Info label="PB to be Paid" value={currency(employee.pbToBePaid)} />

//         <Info label="Month PB" value={employee.monthPB} />
//       </div>
//     </div>
//   );
// }

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  hikeAmount,
  hikePct,
  totalBonus,
  totalOfPB,
  pct,
} from "@/lib/appraisal-data";

import { getPreviousYearData } from "@/lib/previous-year-data";

function valueOrDash(value) {
  return value === undefined || value === null || value === ""
    ? "—"
    : String(value);
}

function currency(value) {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  return Math.round(Number(value) || 0).toLocaleString("en-IN");
}

function percentageChange(current, previous) {
  const c = Number(current);
  const p = Number(previous);

  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) {
    return "—";
  }

  const change = ((c - p) / p) * 100;

  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function formatValue(value, type = "text") {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  if (type === "currency") {
    return currency(value);
  }

  if (type === "percent") {
    return pct(value);
  }

  return valueOrDash(value);
}

function Info({ label, value }) {
  return (
    <div className="min-w-0 rounded border border-border bg-muted/20 px-1.5 py-1">
      <div className="truncate text-[7px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>

      <div className="mt-0.5 truncate text-[9px] font-semibold">
        {valueOrDash(value)}
      </div>
    </div>
  );
}

function CompensationItem({ label, value, type = "text" }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1 last:border-b-0">
      <span className="min-w-0 truncate text-[8px] font-medium text-muted-foreground">
        {label}
      </span>

      <span className="shrink-0 text-right text-[9px] font-semibold tabular-nums">
        {formatValue(value, type)}
      </span>
    </div>
  );
}

function ChangeItem({ label, current, previous, type = "text" }) {
  let change = "—";

  if (
    current !== undefined &&
    current !== null &&
    current !== "" &&
    previous !== undefined &&
    previous !== null &&
    previous !== ""
  ) {
    if (type === "currency" || type === "percent") {
      change = percentageChange(current, previous);
    } else {
      change =
        String(current) === String(previous)
          ? "No change"
          : `${valueOrDash(previous)} → ${valueOrDash(current)}`;
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1 last:border-b-0">
      <span className="min-w-0 truncate text-[8px] font-medium text-muted-foreground">
        {label}
      </span>

      <span className="shrink-0 text-right text-[9px] font-bold tabular-nums">
        {change}
      </span>
    </div>
  );
}

export function EmployeeDrawer({ employee, onOpenChange }) {
  if (!employee) return null;

  /*
   * IMPORTANT:
   * employee comes directly from the current rows in SheetPage.
   * Therefore all grid edits are reflected here immediately.
   */
  const previous = getPreviousYearData(employee.empId) || {};

  // ------------------------------------------------------------
  // CURRENT YEAR
  // ------------------------------------------------------------

  const currentBasePay = Number(employee.currentAnnualBasePay || 0);

  const currentAllocatedPB = employee.allocatedPBAmount;
  const currentPerformanceBonus = employee.newPBToBeOffered;
  const currentRetentionBonus = employee.newRB;

  const currentTotalPB = totalOfPB(employee);
  const currentTotalBonus = totalBonus(employee);

  const currentHikeAmount = hikeAmount(employee);
  const currentHikePct = hikePct(employee);

  const currentNewBasePay = currentBasePay + currentHikeAmount;
  const currentNewCTC = currentNewBasePay + currentTotalBonus;

  // ------------------------------------------------------------
  // PREVIOUS YEAR
  // ------------------------------------------------------------

  const previousBasePay = previous.basePay ?? null;
  const previousAllocatedPB = previous.allocatedPB ?? null;
  const previousPerformanceBonus = previous.performanceBonus ?? null;
  const previousRetentionBonus = previous.retentionBonus ?? null;
  const previousTotalPB = previous.totalPB ?? null;
  const previousTotalBonus = previous.totalBonus ?? null;
  const previousHikeAmount = previous.hikeAmount ?? null;
  const previousHikePct = previous.hikePct ?? null;
  const previousNewCTC = previous.newCTC ?? null;

  return (
    <div className="w-full overflow-hidden rounded-md border border-border bg-card shadow-sm">
      {/* ========================================================
          HEADER
      ======================================================== */}
      <div className="flex items-center justify-between border-b border-border px-2.5 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-[11px] font-semibold">
            {employee.name}
          </h3>

          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground">
            {employee.empId}
          </span>

          <span className="hidden truncate text-[8px] text-muted-foreground sm:inline">
            {valueOrDash(employee.designation)}
          </span>
        </div>

        {/* ONE X BUTTON FOR THE WHOLE DETAILS PANEL */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5 shrink-0"
          onClick={() => onOpenChange(false)}
        >
          <X className="size-3" />
        </Button>
      </div>

      {/* ========================================================
          TOP INFORMATION
          ALL 12 ITEMS IN ONE SINGLE ROW
      ======================================================== */}
      <div className="overflow-x-auto border-b border-border px-2.5 py-1">
        <div className="grid min-w-[900px] grid-cols-12 gap-1">
          <Info
            label="Wissen Exp."
            value={
              employee.wissenExperience !== undefined
                ? `${employee.wissenExperience} yrs`
                : null
            }
          />

          <Info
            label="Total Exp."
            value={
              employee.totalExperience !== undefined
                ? `${employee.totalExperience} yrs`
                : null
            }
          />

          <Info label="Last Appraisal" value={employee.lastAppraisalDate} />

          <Info label="Manager Rating" value={employee.managerRating} />

          <Info label="Interviews" value={employee.interviewCount} />

          <Info
            label="RR%"
            value={
              employee.rrPercent !== undefined ? pct(employee.rrPercent) : null
            }
          />

          <Info label="Gross Margin" value={employee.grossMargin} />

          <Info label="Status" value={employee.status} />

          <Info label="RB to be Paid" value={currency(employee.rbToBePaid)} />

          <Info label="Month RB" value={employee.monthRB} />

          <Info label="PB to be Paid" value={currency(employee.pbToBePaid)} />

          <Info label="Month PB" value={employee.monthPB} />
        </div>
      </div>

      {/* ========================================================
          THREE SEPARATE PANELS
          PREVIOUS | CURRENT | CHANGES
      ======================================================== */}
      <div className="grid grid-cols-1 gap-1.5 p-2.5 lg:grid-cols-3">
        {/* ======================================================
            PREVIOUS YEAR
        ====================================================== */}
        <div className="min-w-0 overflow-hidden rounded border border-border bg-muted/10">
          <div className="border-b border-border bg-muted/40 px-2 py-1">
            <div className="text-[9px] font-bold uppercase tracking-wide">
              Previous Year
            </div>
          </div>

          <div>
            <CompensationItem
              label="Annual Base Pay"
              value={previousBasePay}
              type="currency"
            />

            <CompensationItem
              label="Allocated PB"
              value={previousAllocatedPB}
              type="currency"
            />

            <CompensationItem
              label="Performance Bonus"
              value={previousPerformanceBonus}
              type="currency"
            />

            <CompensationItem
              label="Retention Bonus"
              value={previousRetentionBonus}
              type="currency"
            />

            <CompensationItem
              label="Total PB"
              value={previousTotalPB}
              type="currency"
            />

            <CompensationItem
              label="Total Bonus"
              value={previousTotalBonus}
              type="currency"
            />

            <CompensationItem
              label="Hike Amount"
              value={previousHikeAmount}
              type="currency"
            />

            <CompensationItem
              label="Hike %"
              value={previousHikePct}
              type="percent"
            />

            <div className="flex items-center justify-between gap-2 bg-muted/30 px-2 py-1">
              <span className="text-[9px] font-bold">New CTC</span>

              <span className="text-right text-[9px] font-bold tabular-nums">
                {currency(previousNewCTC)}
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================
            CURRENT YEAR
        ====================================================== */}
        <div className="min-w-0 overflow-hidden rounded border border-border bg-muted/10">
          <div className="border-b border-border bg-muted/40 px-2 py-1">
            <div className="text-[9px] font-bold uppercase tracking-wide">
              Current Year
            </div>
          </div>

          <div>
            <CompensationItem
              label="Annual Base Pay"
              value={currentBasePay}
              type="currency"
            />

            <CompensationItem
              label="Allocated PB"
              value={currentAllocatedPB}
              type="currency"
            />

            <CompensationItem
              label="Performance Bonus"
              value={currentPerformanceBonus}
              type="currency"
            />

            <CompensationItem
              label="Retention Bonus"
              value={currentRetentionBonus}
              type="currency"
            />

            <CompensationItem
              label="Total PB"
              value={currentTotalPB}
              type="currency"
            />

            <CompensationItem
              label="Total Bonus"
              value={currentTotalBonus}
              type="currency"
            />

            <CompensationItem
              label="Hike Amount"
              value={currentHikeAmount}
              type="currency"
            />

            <CompensationItem
              label="Hike %"
              value={currentHikePct}
              type="percent"
            />

            <div className="flex items-center justify-between gap-2 bg-muted/30 px-2 py-1">
              <span className="text-[9px] font-bold">New CTC</span>

              <span className="text-right text-[9px] font-bold tabular-nums">
                {currency(currentNewCTC)}
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================
            CHANGES
        ====================================================== */}
        <div className="min-w-0 overflow-hidden rounded border border-border bg-muted/10">
          <div className="border-b border-border bg-muted/40 px-2 py-1">
            <div className="text-[9px] font-bold uppercase tracking-wide">
              Changes
            </div>
          </div>

          <div>
            <ChangeItem
              label="Annual Base Pay"
              current={currentBasePay}
              previous={previousBasePay}
              type="currency"
            />

            <ChangeItem
              label="Allocated PB"
              current={currentAllocatedPB}
              previous={previousAllocatedPB}
              type="currency"
            />

            <ChangeItem
              label="Performance Bonus"
              current={currentPerformanceBonus}
              previous={previousPerformanceBonus}
              type="currency"
            />

            <ChangeItem
              label="Retention Bonus"
              current={currentRetentionBonus}
              previous={previousRetentionBonus}
              type="currency"
            />

            <ChangeItem
              label="Total PB"
              current={currentTotalPB}
              previous={previousTotalPB}
              type="currency"
            />

            <ChangeItem
              label="Total Bonus"
              current={currentTotalBonus}
              previous={previousTotalBonus}
              type="currency"
            />

            <ChangeItem
              label="Hike Amount"
              current={currentHikeAmount}
              previous={previousHikeAmount}
              type="currency"
            />

            <ChangeItem
              label="Hike %"
              current={currentHikePct}
              previous={previousHikePct}
              type="percent"
            />

            <div className="flex items-center justify-between gap-2 bg-muted/30 px-2 py-1">
              <span className="text-[9px] font-bold">New CTC</span>

              <span className="text-right text-[9px] font-bold tabular-nums">
                {percentageChange(currentNewCTC, previousNewCTC)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
