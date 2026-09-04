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

// ============================================================
// HELPERS
// ============================================================

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

// ============================================================
// COMPACT INFO CELL
// ============================================================

function InfoCell({ label, value }) {
  return (
    <div
      className="
        min-w-0
        rounded
        border
        border-border
        bg-muted/20
        px-1.5
        py-1
      "
    >
      <div
        className="
          truncate
          text-[7px]
          font-medium
          uppercase
          tracking-wide
          text-muted-foreground
        "
      >
        {label}
      </div>

      <div
        className="
          mt-0.5
          truncate
          text-[9px]
          font-semibold
          leading-tight
        "
      >
        {valueOrDash(value)}
      </div>
    </div>
  );
}

// ============================================================
// COMPARISON ROW
// ============================================================

function ComparisonRow({
  label,
  current,
  previous,
  type = "currency",
  bold = false,
}) {
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
          ? "—"
          : `${valueOrDash(previous)} → ${valueOrDash(current)}`;
    }
  }

  const isPositive = typeof change === "string" && change.startsWith("+");

  const isNegative = typeof change === "string" && change.startsWith("-");

  return (
    <div
      className="
        grid
        grid-cols-[1.6fr_1fr_1fr_0.8fr]
        items-center
        border-b
        border-border
        last:border-b-0
      "
    >
      {/* FIELD */}
      <div
        className={`
          min-w-0
          truncate
          px-2
          py-1
          ${bold ? "text-[9px] font-bold" : "text-[8px] font-medium"}
        `}
      >
        {label}
      </div>

      {/* THIS YEAR */}
      <div
        className={`
          px-2
          py-1
          text-right
          tabular-nums
          ${bold ? "text-[9px] font-bold" : "text-[8px] font-semibold"}
        `}
      >
        {formatValue(current, type)}
      </div>

      {/* PREVIOUS YEAR */}
      <div
        className={`
          px-2
          py-1
          text-right
          tabular-nums
          text-muted-foreground
          ${bold ? "text-[9px] font-bold" : "text-[8px] font-semibold"}
        `}
      >
        {formatValue(previous, type)}
      </div>

      {/* CHANGE */}
      <div
        className={`
          px-2
          py-1
          text-right
          tabular-nums
          ${bold ? "text-[9px] font-bold" : "text-[8px] font-bold"}
          ${
            isPositive
              ? "text-green-600"
              : isNegative
                ? "text-red-600"
                : "text-muted-foreground"
          }
        `}
      >
        {change}
      </div>
    </div>
  );
}

// ============================================================
// EMPLOYEE DRAWER
// ============================================================

export function EmployeeDrawer({ employee, onOpenChange }) {
  if (!employee) return null;

  /*
   * employee comes directly from the current rows.
   * Therefore all current grid edits are reflected immediately.
   */

  const previous = getPreviousYearData(employee.empId) || {};

  // ==========================================================
  // CURRENT YEAR
  // ==========================================================

  const currentBasePay = Number(employee.currentAnnualBasePay || 0);

  const currentAllocatedPB = employee.allocatedPBAmount;

  const currentPerformanceBonus = employee.newPBToBeOffered;

  const currentRetentionBonus = employee.newRB;

  const currentTotalPB = totalOfPB(employee);

  const currentTotalBonus = totalBonus(employee);

  const currentHikeAmount = hikeAmount(employee);

  const currentHikePct = hikePct(employee);

  const currentNewBasePay = currentBasePay + Number(currentHikeAmount || 0);

  const currentNewCTC = currentNewBasePay + Number(currentTotalBonus || 0);

  // ==========================================================
  // PREVIOUS YEAR
  // ==========================================================

  const previousBasePay = previous.basePay ?? null;

  const previousAllocatedPB = previous.allocatedPB ?? null;

  const previousPerformanceBonus = previous.performanceBonus ?? null;

  const previousRetentionBonus = previous.retentionBonus ?? null;

  const previousTotalPB = previous.totalPB ?? null;

  const previousTotalBonus = previous.totalBonus ?? null;

  const previousHikeAmount = previous.hikeAmount ?? null;

  const previousHikePct = previous.hikePct ?? null;

  const previousNewCTC = previous.newCTC ?? null;

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div
      className="
        w-full
        overflow-hidden
        rounded-md
        border
        border-border
        bg-card
        shadow-sm
      "
    >
      {/* ======================================================
          HEADER
      ======================================================= */}

      <div
        className="
          flex
          h-9
          items-center
          justify-between
          border-b
          border-border
          px-2.5
        "
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {/* NAME */}

          <h3 className="truncate text-[11px] font-semibold">
            {employee.name}
          </h3>

          {/* EMPLOYEE ID */}

          <span
            className="
              shrink-0
              rounded
              bg-muted
              px-1.5
              py-0.5
              font-mono
              text-[8px]
              text-muted-foreground
            "
          >
            {employee.empId}
          </span>

          {/* DESIGNATION */}

          <span
            className="
              hidden
              truncate
              text-[8px]
              text-muted-foreground
              sm:inline
            "
          >
            {valueOrDash(employee.designation)}
          </span>
        </div>

        {/* CLOSE */}

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

      {/* ======================================================
          MAIN CONTENT
          LEFT = NON-EDITABLE FIELDS
          RIGHT = EXISTING COMPARISON
      ======================================================= */}

      <div
        className="
          grid
          grid-cols-1
          gap-2
          p-2
          lg:grid-cols-[1fr_1.45fr]
        "
      >
        {/* ====================================================
            LEFT SIDE
            NON-EDITABLE FIELDS
        ===================================================== */}

        <div
          className="
            grid
            grid-cols-2
            gap-1
            sm:grid-cols-3
            lg:grid-cols-3
            content-start
          "
        >
          {/* Reporting Manager */}

          <InfoCell
            label="Reporting Manager"
            value={employee.reportingManager}
          />

          {/* Comp Manager */}

          <InfoCell label="Comp. Manager" value={employee.compManager} />

          {/* Appraiser Tech / ED */}

          <InfoCell
            label="Appraiser Tech/ED"
            value={employee.appraiserTechED}
          />

          {/* Wissen Experience */}

          <InfoCell
            label="Organization Exp."
            value={
              employee.wissenExperience !== undefined
                ? `${employee.wissenExperience} yrs`
                : null
            }
          />

          {/* Total Experience */}

          <InfoCell
            label="Total Exp."
            value={
              employee.totalExperience !== undefined
                ? `${employee.totalExperience} yrs`
                : null
            }
          />

          {/* Last Appraisal */}

          <InfoCell label="Last Appraisal" value={employee.lastAppraisalDate} />

          {/* Manager Rating */}

          <InfoCell label="Manager Rating" value={employee.managerRating} />

          {/* Interview Count */}

          <InfoCell label="Interviews" value={employee.interviewCount} />

          {/* RR % */}

          <InfoCell
            label="RR %"
            value={
              employee.rrPercent !== undefined ? pct(employee.rrPercent) : null
            }
          />

          {/* Gross Margin */}

          <InfoCell label="Gross Margin" value={employee.grossMargin} />

          {/* Status */}

          <InfoCell label="Status" value={employee.status} />

          {/* RB to be Paid */}

          <InfoCell
            label="RB to be Paid"
            value={currency(employee.rbToBePaid)}
          />

          {/* Month RB */}

          <InfoCell label="Month RB" value={employee.monthRB} />

          {/* PB to be Paid */}

          <InfoCell
            label="PB to be Paid"
            value={currency(employee.pbToBePaid)}
          />

          {/* Month PB */}

          <InfoCell label="Month PB" value={employee.monthPB} />

          {/* ------------------------------------------------
              OTHER NON-EDITABLE COLUMN DATA
              ------------------------------------------------

              These are intentionally NOT repeated here:

              currentAnnualBasePay
              targetPBAllocatedForMay
              allocatedPBAmount
              newPBToBeOffered
              newRB
              hikeAmount
              hikePct
              totalOfPB
              totalBonus
              totalCTCWithRewards

              Those belong to the comparison section on
              the RIGHT.
          ------------------------------------------------- */}

          {/* Current CTC - extra existing row data */}

          <InfoCell label="Current CTC" value={currency(employee.currentCTC)} />

          {/* Target Performance Bonus */}

          <InfoCell
            label="Target Performance Bonus"
            value={currency(employee.targetPerformanceBonus)}
          />
        </div>

        {/* ====================================================
            RIGHT SIDE
            EXISTING COMPARISON SECTION
        ===================================================== */}

        <div className="min-w-0 overflow-x-auto">
          <div className="min-w-[500px]">
            {/* COMPARISON HEADER */}

            <div
              className="
                grid
                grid-cols-[1.6fr_1fr_1fr_0.8fr]
                border-b
                border-border
                bg-muted/20
              "
            >
              <div
                className="
                  px-2
                  py-1
                  text-left
                  text-[7px]
                  font-semibold
                  uppercase
                  tracking-wide
                  text-muted-foreground
                "
              >
                Field
              </div>

              <div
                className="
                  px-2
                  py-1
                  text-right
                  text-[7px]
                  font-semibold
                  uppercase
                  tracking-wide
                  text-muted-foreground
                "
              >
                This Year
              </div>

              <div
                className="
                  px-2
                  py-1
                  text-right
                  text-[7px]
                  font-semibold
                  uppercase
                  tracking-wide
                  text-muted-foreground
                "
              >
                Previous Year
              </div>

              <div
                className="
                  px-2
                  py-1
                  text-right
                  text-[7px]
                  font-semibold
                  uppercase
                  tracking-wide
                  text-muted-foreground
                "
              >
                Change
              </div>
            </div>

            {/* ANNUAL BASE PAY */}

            <ComparisonRow
              label="Annual Base Pay"
              current={currentBasePay}
              previous={previousBasePay}
              type="currency"
            />

            {/* ALLOCATED PB */}

            <ComparisonRow
              label="Allocated PB"
              current={currentAllocatedPB}
              previous={previousAllocatedPB}
              type="currency"
            />

            {/* PERFORMANCE BONUS */}

            <ComparisonRow
              label="Performance Bonus"
              current={currentPerformanceBonus}
              previous={previousPerformanceBonus}
              type="currency"
            />

            {/* RETENTION BONUS */}

            <ComparisonRow
              label="Retention Bonus"
              current={currentRetentionBonus}
              previous={previousRetentionBonus}
              type="currency"
            />

            {/* TOTAL PB */}

            <ComparisonRow
              label="Total PB"
              current={currentTotalPB}
              previous={previousTotalPB}
              type="currency"
            />

            {/* TOTAL BONUS */}

            <ComparisonRow
              label="Total Bonus"
              current={currentTotalBonus}
              previous={previousTotalBonus}
              type="currency"
            />

            {/* HIKE AMOUNT */}

            <ComparisonRow
              label="Hike Amount"
              current={currentHikeAmount}
              previous={previousHikeAmount}
              type="currency"
            />

            {/* HIKE % */}

            <ComparisonRow
              label="Hike %"
              current={currentHikePct}
              previous={previousHikePct}
              type="percent"
            />

            {/* NEW CTC */}

            <ComparisonRow
              label="New CTC"
              current={currentNewCTC}
              previous={previousNewCTC}
              type="currency"
              bold
            />
          </div>
        </div>
      </div>
    </div>
  );
}
