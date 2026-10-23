import { cn } from "@/lib/utils";

// ============================================================
// Budget summary bar (Appraisal Sheet + Detailed Screen)
// Shows Budget Allocated, Consumed (Hikes + Bonuses), Utilisation and
// Utilisation including Target PB
// beside the budget notice, in a white bar matching the notice (marquee) box.
// ============================================================

// Kept for compatibility with older imports only. Live screens must never
// present this demo amount as if it were a real allocation.
export const FALLBACK_BUDGET_ALLOCATED = 0;


const ONE_CRORE = 10000000;

export const formatCrore = (amount) =>
  ` ${(amount / ONE_CRORE).toFixed(2)} Cr`;

// Full amount in Indian digit grouping, e.g. ₹ 1,57,00,000 (no Cr / L rounding).
export const formatRupees = (amount) =>
  ` ${Math.round(Number(amount) || 0).toLocaleString("en-IN")}`;


// Consumed = Performance Bonus (PB) + Retention Bonus (RB) + Hike Amount,
// the same three totals the Appraisal Sheet's Total row adds together.
export const sumBudgetConsumed = (rows) =>
  (rows || []).reduce(
    (sum, row) =>
      sum +
      (Number(row.allocatedPBAmount) || 0) +
      (Number(row.newRB) || 0) +
      (Number(row.hikeAmount) || 0),
    0,
  );

// Target PB for Next Year, added up over the same rows.
export const sumTargetPB = (rows) =>
  (rows || []).reduce((sum, row) => sum + (Number(row.targetPBNextYear) || 0), 0);

// All screens must display the same saved allocation, even if the separate
// employee-roster request failed. A demo number must never masquerade as budget.
export function resolveBudgetAllocated({ totals, loading, error }) {
  const hasAuthoritativeValue =
    totals?.hasBudgetMaster === true || totals?.hasAuthoritativeBudget === true;
  if (hasAuthoritativeValue) {
    return { allocated: Number(totals?.updated) || 0, isEstimate: false };
  }
  const real = Number(totals?.updated) || 0;
  if (!loading && !error && real > 0) {
    return { allocated: real, isEstimate: false };
  }
  // No authoritative data is available. Display zero rather than an invented
  // ₹4.25 Cr value; the loading/error state can explain why data is missing.
  return { allocated: 0, isEstimate: false };
}

function Stat({ label, value, title, valueClassName, first }) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 px-2 text-center",
        !first && "border-l border-[#e3e9ec]",
      )}
      title={title}
    >
      <span className="block truncate text-[10px] leading-tight text-[#3e4c59]">
        {label}
      </span>
      <strong
        className={cn(
          "block whitespace-nowrap text-[14px] font-bold leading-tight text-[#102a43]",
          valueClassName,
        )}
      >
        {value}
      </strong>
    </div>
  );
}

export function BudgetStatsBar({
  allocated,
  consumed,
  targetPB = 0,
  isEstimate = false,
  className,
}) {
  const utilisation = allocated ? (consumed / allocated) * 100 : 0;
  const toneFor = (pct) =>
    pct > 100 ? "text-[#b42318]" : pct > 85 ? "text-[#b54708]" : "";

  return (
    <div
      role="group"
      aria-label="Budget summary"
      className={cn(
        "flex min-w-0 items-center rounded-md border border-[#e3e9ec] bg-white px-1 py-1.5",
        className,
      )}
    >
      <Stat
        first
        label={isEstimate ? "Budget Allocated (est.)" : "Budget Allocated"}
        title={
          isEstimate
            ? "Estimate — Budget Master data is unavailable"
            : "Total from Budget Master"
        }
        value={formatRupees(allocated)}
      />
      <Stat
        label="Consumed (Hikes + Bonuses)"
        title="Hike Amount + Total Bonus, this cycle"
        value={formatRupees(consumed)}
      />
      <Stat
        label="Utilisation"
        value={`${utilisation.toFixed(1)}%`}
        valueClassName={toneFor(utilisation)}
      />
      <Stat
        label="Budget Utilization incl. Target PB"
        title="Consumed (Hikes + Bonuses) + Target PB for Next Year"
        value={formatRupees(consumed + targetPB)}
      />
    </div>
  );
}