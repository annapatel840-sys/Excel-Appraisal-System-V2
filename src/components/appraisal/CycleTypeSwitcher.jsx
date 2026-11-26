import { CYCLE_TYPES, useSelectedCycleType } from "@/lib/cycle-type-store";
import { cn } from "@/lib/utils";

/**
 * Top-bar Cycle Type switcher, shown beside "Location" in every view (HR,
 * Tech-ED and Comp Manager). With the Location it decides which appraisal
 * cycle the screens show. It only filters what is shown; it does not change
 * who may see what.
 */
export function CycleTypeSwitcher({ isVertical }) {
  const [selectedType, setSelectedType] = useSelectedCycleType();

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