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

function CompactInfo({ label, value }) {
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

function ComparisonRow({ label, current, previous, type = "text" }) {
  const format = (value) => {
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
  };

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
    <div className="grid grid-cols-[minmax(130px,1.5fr)_minmax(105px,1fr)_minmax(105px,1fr)_minmax(75px,0.7fr)] border-b border-border last:border-b-0">
      <div className="truncate px-2 py-1 text-[9px] font-medium">{label}</div>

      <div className="border-l border-border px-2 py-1 text-right text-[9px] font-semibold">
        {format(current)}
      </div>

      <div className="border-l border-border px-2 py-1 text-right text-[9px] text-muted-foreground">
        {format(previous)}
      </div>

      <div className="border-l border-border px-2 py-1 text-right text-[8px] font-semibold">
        {change}
      </div>
    </div>
  );
}

export function EmployeeDrawer({ employee, onOpenChange }) {
  if (!employee) {
    return null;
  }

  const previous = getPreviousYearData(employee.empId) || {};

  /*
   * Current values ALWAYS come from the current employee row.
   *
   * Therefore if Hike % or Hike Amount changes in the grid,
   * this component automatically receives the latest values.
   */
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
      {/* Employee header */}
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

      {/* Small employee information row */}
      <div className="border-b border-border px-2.5 py-1">
        <div className="grid grid-cols-4 gap-1 md:grid-cols-8">
          <CompactInfo
            label="Wissen Exp."
            value={
              employee.wissenExperience !== undefined
                ? `${employee.wissenExperience} yrs`
                : null
            }
          />

          <CompactInfo
            label="Total Exp."
            value={
              employee.totalExperience !== undefined
                ? `${employee.totalExperience} yrs`
                : null
            }
          />

          <CompactInfo
            label="Last Appraisal"
            value={employee.lastAppraisalDate}
          />

          <CompactInfo label="Manager Rating" value={employee.managerRating} />

          <CompactInfo label="Interviews" value={employee.interviewCount} />

          <CompactInfo
            label="RR%"
            value={
              employee.rrPercent !== undefined ? pct(employee.rrPercent) : null
            }
          />

          <CompactInfo label="Gross Margin" value={employee.grossMargin} />

          <CompactInfo label="Status" value={employee.status} />
        </div>
      </div>

      {/* Current / Previous / Change */}
      <div className="px-2.5 py-1">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
            Compensation Comparison
          </span>

          <span className="text-[8px] text-muted-foreground">
            Current vs Previous
          </span>
        </div>

        <div className="overflow-x-auto rounded border border-border">
          {/* Table header */}
          <div className="grid min-w-[520px] grid-cols-[minmax(130px,1.5fr)_minmax(105px,1fr)_minmax(105px,1fr)_minmax(75px,0.7fr)] bg-muted/40">
            <div className="px-2 py-1 text-[8px] font-semibold">
              Particulars
            </div>

            <div className="border-l border-border px-2 py-1 text-right text-[8px] font-semibold">
              Current
            </div>

            <div className="border-l border-border px-2 py-1 text-right text-[8px] font-semibold text-muted-foreground">
              Previous
            </div>

            <div className="border-l border-border px-2 py-1 text-right text-[8px] font-semibold">
              Change
            </div>
          </div>

          <div className="min-w-[520px]">
            <ComparisonRow
              label="Annual Base Pay"
              current={currentBasePay}
              previous={previousBasePay}
              type="currency"
            />

            <ComparisonRow
              label="Allocated PB"
              current={currentAllocatedPB}
              previous={previousAllocatedPB}
              type="currency"
            />

            <ComparisonRow
              label="Performance Bonus"
              current={currentPerformanceBonus}
              previous={previousPerformanceBonus}
              type="currency"
            />

            <ComparisonRow
              label="Retention Bonus"
              current={currentRetentionBonus}
              previous={previousRetentionBonus}
              type="currency"
            />

            <ComparisonRow
              label="Total PB"
              current={currentTotalPB}
              previous={previousTotalPB}
              type="currency"
            />

            <ComparisonRow
              label="Total Bonus"
              current={currentTotalBonus}
              previous={previousTotalBonus}
              type="currency"
            />

            <ComparisonRow
              label="Hike Amount"
              current={currentHikeAmount}
              previous={previousHikeAmount}
              type="currency"
            />

            <ComparisonRow
              label="Hike %"
              current={currentHikePct}
              previous={previousHikePct}
              type="percent"
            />

            <div className="grid grid-cols-[minmax(130px,1.5fr)_minmax(105px,1fr)_minmax(105px,1fr)_minmax(75px,0.7fr)] bg-muted/30">
              <div className="px-2 py-1 text-[9px] font-bold">New CTC</div>

              <div className="border-l border-border px-2 py-1 text-right text-[9px] font-bold">
                {currency(currentNewCTC)}
              </div>

              <div className="border-l border-border px-2 py-1 text-right text-[9px] font-medium text-muted-foreground">
                {currency(previousNewCTC)}
              </div>

              <div className="border-l border-border px-2 py-1 text-right text-[8px] font-bold">
                {percentageChange(currentNewCTC, previousNewCTC)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment summary */}
      <div className="grid grid-cols-4 gap-1 border-t border-border bg-muted/10 px-2.5 py-1">
        <CompactInfo
          label="RB to be Paid"
          value={currency(employee.rbToBePaid)}
        />

        <CompactInfo label="Month RB" value={employee.monthRB} />

        <CompactInfo
          label="PB to be Paid"
          value={currency(employee.pbToBePaid)}
        />

        <CompactInfo label="Month PB" value={employee.monthPB} />
      </div>
    </div>
  );
}
