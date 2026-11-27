import { LocationMasterControl } from "@/components/employee-master/LocationMasterControl";
import { useSelectedLocation } from "@/lib/location-store";
import { CYCLE_TYPES, DEFAULT_CYCLE_TYPE, useSelectedCycleType } from "@/lib/cycle-type-store";
import { cn } from "@/lib/utils";

/**
 * Top-bar location switcher: Location [dropdown], shown beside "View as". The Cycle Type is
 * chosen inside this same dropdown (arrow next to the selected location).
 * The choice is the same system location the screens already follow
 * (location-store), so changing it here updates every screen.
 * It only filters what is shown; it does not change who may see what.
 */
export function LocationSwitcher({ isVertical }) {
  const [selectedLocation, setSelectedLocation] = useSelectedLocation();
  const [selectedCycleType, setSelectedCycleType] = useSelectedCycleType();

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2",
        isVertical && "flex-col items-stretch gap-1.5",
      )}
    >
      <div
        className={cn(
          "app-header-location flex items-center gap-1.5 text-[11px] text-white/75",
          isVertical && "flex-col items-stretch gap-1",
        )}
      >
        <span>Location · Cycle</span>
        <LocationMasterControl
          value={selectedLocation}
          onChange={(next) => {
            // A different location starts at the default Annual, like the home location on sign-in.
            const same =
              String(next || "").trim().toLowerCase() ===
              String(selectedLocation || "").trim().toLowerCase();
            if (!same) setSelectedCycleType(DEFAULT_CYCLE_TYPE);
            setSelectedLocation(next);
          }}
          ariaLabel="Location and Cycle Type shown on every screen"
          showAllLocations={false}
          triggerClassName="app-header-location-trigger"
          cycleTypeMenu={{
            options: CYCLE_TYPES.filter((type) => type !== "New Joiner"),
            value: selectedCycleType,
            onChange: setSelectedCycleType,
          }}
        />
      </div>
    </div>
  );
}