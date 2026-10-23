import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Notification bell for the top blue bar (between "View as" and the profile
 * icon). Its panel holds the budget-changed message (with "Got it") and the
 * edited-employees count (with a shortcut to the "edited only" filter).
 *
 * `items` = [{ key, tag, text, sub, actions: [{ label, primary, onClick }] }]
 */
export function NotificationBell({ items = [] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Notifications"
        title="Notifications"
        className={cn(
          "relative flex size-8 items-center justify-center rounded-full border border-white/55 text-white transition-colors hover:bg-white/15",
          open && "bg-white/15",
        )}
      >
        <Bell className="size-4" />
        {items.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#2f6fed] px-1 text-[10px] font-extrabold leading-none text-white">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-[200] mt-2 w-[350px] max-w-[92vw] rounded-xl border border-[#e5e7eb] bg-white text-[#111827] shadow-[0_10px_28px_rgba(16,42,67,.22)]"
        >
          <div className="flex items-center justify-between border-b border-[#e5e7eb] px-3 py-2.5">
            <span className="text-[14px] font-extrabold text-[#102a43]">
              Notifications
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-[#6b7280] hover:text-[#102a43]"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="flex max-h-[60vh] flex-col gap-2 overflow-auto p-2.5">
            {items.length === 0 && (
              <p className="px-0.5 py-1.5 text-[12.5px] font-bold text-[#15803d]">
                ✓ No notifications
              </p>
            )}
            {items.map((item) => (
              <div
                key={item.key}
                className="flex flex-col gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-2"
              >
                <span className="text-[10px] font-extrabold uppercase tracking-[.06em] text-[#6b7280]">
                  {item.tag}
                </span>
                <div className="text-[12.5px] font-bold leading-snug text-[#111827]">
                  {item.text}
                </div>
                {item.sub && (
                  <div className="text-[11.5px] text-[#6b7280]">{item.sub}</div>
                )}
                {item.actions?.length > 0 && (
                  <div className="flex justify-end gap-1.5">
                    {item.actions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => {
                          action.onClick();
                          if (action.closes !== false) setOpen(false);
                        }}
                        className={cn(
                          "inline-flex h-[26px] items-center whitespace-nowrap rounded-md border px-2.5 text-[11.5px] font-bold",
                          action.primary
                            ? "border-[#102a43] bg-[#102a43] text-white"
                            : "border-[#d1d5db] bg-white text-[#102a43] hover:bg-[#f1f5f9]",
                        )}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}