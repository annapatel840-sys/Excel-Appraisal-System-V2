import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

// Right-click menu on an Appraisal Sheet column header (HR view only).
// Step 1: pick the column to place it next to (only columns that are shown).
// Step 2: choose Before or After, then Confirm. The new order is saved for
// every login, view and location.
export function ColumnOrderMenu({ target, columns, onClose, onConfirm }) {
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: target.x, top: target.y });
  const [anchorKey, setAnchorKey] = useState("");
  const [side, setSide] = useState("before");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const anchor = columns.find((column) => column.key === anchorKey) || null;
  const shown = columns.filter((column) =>
    column.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  // keep the pop-up inside the window
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPosition({
      left: Math.max(8, Math.min(target.x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(target.y, window.innerHeight - box.height - 8)),
    });
  }, [target.x, target.y, anchorKey]);

  useEffect(() => {
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const confirm = async () => {
    if (!anchor || saving) return;
    setSaving(true);
    setError("");
    try {
      await onConfirm(anchor.key, side);
      onClose();
    } catch (err) {
      setError(err?.message || "Could not save the column order.");
      setSaving(false);
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Move ${target.label} column`}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-[1000] w-[260px] rounded-[6px] border border-[#c9d8ec] bg-white text-[12px] text-[#102a43] shadow-xl"
      style={{ left: position.left, top: position.top }}
    >
      <div className="border-b border-[#e3ebf5] px-3 py-2 font-semibold">
        Move “{target.label}”
      </div>

      {!anchor ? (
        <div className="p-2">
          <div className="mb-1 px-1 text-[11px] text-[#52667a]">
            Place it next to which column?
          </div>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search column"
            className="mb-1 h-7 w-full rounded border border-[#c9d8ec] px-2 text-[12px] outline-none focus:border-[#2f6fed]"
          />
          <ul className="max-h-[260px] overflow-y-auto">
            {shown.length === 0 && (
              <li className="px-2 py-1.5 text-[#52667a]">No column found</li>
            )}
            {shown.map((column) => (
              <li key={column.key}>
                <button
                  type="button"
                  onClick={() => setAnchorKey(column.key)}
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-[#eaf1fb]"
                >
                  {column.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="p-3">
          <div className="mb-2">
            Place <b>{target.label}</b> next to <b>{anchor.label}</b>:
          </div>
          <div className="mb-3 flex gap-2">
            {[
              ["before", "Before"],
              ["after", "After"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSide(value)}
                className={cn(
                  "h-7 flex-1 rounded border text-[12px] font-medium",
                  side === value
                    ? "border-[#2f6fed] bg-[#2f6fed] text-white"
                    : "border-[#c9d8ec] bg-white hover:bg-[#eaf1fb]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mb-2 text-[11px] text-[#52667a]">
            This changes the column order for every login and view of this location.
          </div>
          {error && <div className="mb-2 text-[11px] text-[#b42318]">{error}</div>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setAnchorKey("")}
              className="h-7 rounded border border-[#c9d8ec] px-3 hover:bg-[#eaf1fb]"
            >
              Back
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={confirm}
              className="h-7 rounded bg-[#2f6fed] px-3 font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}