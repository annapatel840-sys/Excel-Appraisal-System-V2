import {
  VIEW_AS_ROLES,
  roleLabelOf,
  useViewAs,
} from "@/lib/view-as-store";
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
 * Top-bar role switcher: [current role pill]  View as [dropdown].
 * Only HR logins see it; everyone else gets nothing here.
 */
export function ViewAsSwitcher({ isVertical }) {
  const { canSwitch, effectiveId } = useViewAs();
  if (!canSwitch) return null;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2",
        isVertical && "flex-col items-stretch gap-1.5",
      )}
    >
      <span
        className={cn(
          "rounded-full bg-white/15 px-2.5 py-0.5 text-center text-[10px] font-bold text-white",
          !isVertical && "whitespace-nowrap",
        )}
      >
        {roleLabelOf(effectiveId)}
      </span>
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