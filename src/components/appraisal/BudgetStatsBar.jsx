import { cn } from "@/lib/utils";

// ============================================================
// Budget summary bar (Appraisal Sheet + Detailed Screen)
// Shows Budget Allocated, Consumed (Hikes + Bonuses) and Utilisation
// beside the budget notice, in a blue bar a little lighter than the top nav.
// ============================================================

// Demo value, only used when Budget Master data is unavailable.
export const FALLBACK_BUDGET_ALLOCATED = 42500000; // ₹ 4.25 Cr (estimate)

const ONE_CRORE = 10000000;

export const formatCrore = (amount) =>
  `₹ ${(amount / ONE_CRORE).toFixed(2)} Cr`;

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

// Real total from Budget Master, else the labelled estimate.
export function resolveBudgetAllocated({ totals, loading, error }) {
  const real = !loading && !error ? Number(totals?.updated) || 0 : 0;
  return real > 0
    ? { allocated: real, isEstimate: false }
    : { allocated: FALLBACK_BUDGET_ALLOCATED, isEstimate: true };
}

function Stat({ label, value, title, valueClassName, first }) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 px-2 text-center",
        !first && "border-l border-white/25",
      )}
      title={title}
    >
      <span className="block truncate text-[10px] leading-tight text-white/80">
        {label}
      </span>
      <strong
        className={cn(
          "block whitespace-nowrap text-[14px] font-bold leading-tight text-white",
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
  isEstimate = false,
  className,
}) {
  const utilisation = allocated ? (consumed / allocated) * 100 : 0;
  const tone =
    utilisation > 100
      ? "text-[#ff9a8a]"
      : utilisation > 85
        ? "text-[#ffcf70]"
        : "";

  return (
    <div
      role="group"
      aria-label="Budget summary"
      className={cn(
        "flex min-w-0 items-center rounded-md px-1 py-1 text-white",
        className,
      )}
      // A little lighter than the top nav (follows the theme colour).
      style={{
        backgroundColor: "#2a5a8f",
        background:
          "color-mix(in srgb, var(--app-brand, #173b63) 80%, #ffffff)",
      }}
    >
      <Stat
        first
        label={isEstimate ? "Budget Allocated (est.)" : "Budget Allocated"}
        title={
          isEstimate
            ? "Estimate — Budget Master data is unavailable"
            : "Total from Budget Master"
        }
        value={formatCrore(allocated)}
      />
      <Stat
        label="Consumed (Hikes + Bonuses)"
        title="Hike Amount + Total Bonus, this cycle"
        value={formatCrore(consumed)}
      />
      <Stat
        label="Utilisation"
        value={`${utilisation.toFixed(1)}%`}
        valueClassName={tone}
      />
    </div>
  );
}