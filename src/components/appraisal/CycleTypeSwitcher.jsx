import { useEffect, useRef } from "react";
import { CYCLE_TYPES, DEFAULT_CYCLE_TYPE, setSelectedCycleType, useSelectedCycleType } from "@/lib/cycle-type-store";
import { useViewAs } from "@/lib/view-as-store";
import { cn } from "@/lib/utils";

/**
 * Top-bar Cycle Type switcher, shown beside "Location" only in the Tech-ED and
 * Comp Manager views. With the Location it decides which appraisal cycle the
 * Dashboard, Appraisal Sheet, Detailed Screen, Bulk Edit, Budget Distribution
 * and Delegation show. It only filters what is shown; it does not change who
 * may see what.
 */
export function CycleTypeSwitcher({ isVertical }) {
  const [selectedType, setSelectedType] = useSelectedCycleType();
  const { effectiveId } = useViewAs();
  // Only the Tech-ED and Comp Manager views have a Cycle Type; HR does not.
  const showSelector = effectiveId === "teched" || effectiveId === "compmanager";

  // Moving from the Tech-ED / Comp Manager view back to HR clears the choice,
  // so it never carries into the HR screens.
  const previousView = useRef("");
  useEffect(() => {
    if (
      (previousView.current === "teched" || previousView.current === "compmanager") &&
      effectiveId === "hr"
    ) {
      setSelectedCycleType(DEFAULT_CYCLE_TYPE);
    }
    if (effectiveId) previousView.current = effectiveId;
  }, [effectiveId]);

  if (!showSelector) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2",
        isVertical && "flex-col items-stretch gap-1.5",
      )}
    >
      <label
        className={cn(
          "flex items-center gap-1.5 text-[11px] text-white/75",
          isVertical && "flex-col items-stretch gap-1",
        )}
      >
        <span>Cycle Type</span>
        <select
          value={selectedType}
          onChange={(event) => setSelectedType(event.target.value)}
          aria-label="Cycle Type"
          className={cn(
            "h-7 rounded-md font-sans border border-white/30 bg-white px-1.5 text-[11px] font-medium text-[#102a43] outline-none focus:ring-2 focus:ring-white/40",
            isVertical ? "w-full" : "min-w-[104px]",
          )}
        >
          {CYCLE_TYPES.filter((type) => type !== "New Joiner").map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}