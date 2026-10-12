import { VIEW_AS_ROLES, useViewAs } from "@/lib/view-as-store";
import { cn } from "@/lib/utils";

export function ViewAsSelect({ className }) {
  const { effectiveId, setViewAs } = useViewAs();
  return (
    <select
      value={effectiveId}
      onChange={(event) => setViewAs(event.target.value)}
      aria-label="View as role"
      className={cn(
        "h-7 rounded-md border border-white/30 bg-white px-1.5 text-[11px] font-medium text-[#102a43] outline-none focus:ring-2 focus:ring-white/40",
        className,
      )}
    >
      {VIEW_AS_ROLES.map((role) => (
        <option key={role.id} value={role.id}>
          {role.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Top-bar role switcher: View as [dropdown].
 * Only HR logins see it; everyone else gets nothing here.
 */
export function ViewAsSwitcher({ isVertical }) {
  const { canSwitch } = useViewAs();
  if (!canSwitch) return null;

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
        <span>View as</span>
        <ViewAsSelect className={isVertical ? "w-full" : "min-w-[104px]"} />
      </label>
    </div>
  );
}