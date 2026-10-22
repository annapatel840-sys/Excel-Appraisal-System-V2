import { cn } from "@/lib/utils";

// ============================================================
// Budget summary bar (Appraisal Sheet + Detailed Screen)
// Shows Budget Allocated, Consumed (Hikes + Bonuses), Utilisation and
// Utilisation including Target PB
// beside the budget notice, in a white bar matching the notice (marquee) box.
// ============================================================

// Demo value, only used when Budget Master data is unavailable.
export const FALLBACK_BUDGET_ALLOCATED = 42500000; // ₹ 4.25 Cr (estimate)


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

// Real total from Budget Master, else the labelled estimate.
export function resolveBudgetAllocated({ totals, loading, error }) {
  const real = !loading && !error ? Number(totals?.updated) || 0 : 0;
  // A saved Budget_Master row is authoritative even when its Updated Budget
  // is zero (for example, before HR applies a percentage). Do not replace that
  // real value with the demo estimate, which makes screens disagree.
  const hasMasterValue = !loading && !error && totals?.hasBudgetMaster === true;
  return hasMasterValue || real > 0
    ? { allocated: real, isEstimate: false }
    : { allocated: FALLBACK_BUDGET_ALLOCATED, isEstimate: true };
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
  const utilisationWithTarget = allocated
    ? ((consumed + targetPB) / allocated) * 100
    : 0;
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

        value={formatCrore(allocated)}

        value={formatRupees(allocated)}

      />
      <Stat
        label="Consumed (Hikes + Bonuses)"
        title="Hike Amount + Total Bonus, this cycle"

        value={formatCrore(consumed)}

        value={formatRupees(consumed)}

      />
      <Stat
        label="Utilisation"
        value={`${utilisation.toFixed(1)}%`}
        valueClassName={toneFor(utilisation)}
      />
      <Stat
        label="Budget Utilization incl. Target PB"
        title="(Consumed + Target PB for Next Year) as a percentage of Budget Allocated"
        value={`${utilisationWithTarget.toFixed(1)}%`}
        valueClassName={toneFor(utilisationWithTarget)}
      />
    </div>
  );
}