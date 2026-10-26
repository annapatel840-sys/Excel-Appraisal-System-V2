import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Small history table that appears while typing in an editable number cell
 * of the Appraisal Sheet. It is docked top-right of the grid (it moves to the
 * left when it would cover the cell being typed in). Cycles run across (newest
 * first, up to 5), fields run down. The first column is the CURRENT cycle and
 * is live: it already includes what is being typed.
 *
 * Purely presentational: all data is passed in by AppraisalGrid.
 */

const MAX_CYCLES = 5;

const fmt = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-IN");
};

// Small figure under a value: "% of base" for Hike Amount, otherwise the
// change against the next older cycle.
const changeOf = (current, previous) => {
  if (previous === undefined) return { label: "new", color: "#6b7280" };
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (!prev) return cur ? { label: "new", color: "#6b7280" } : { label: "0.00%", color: "#6b7280" };
  const pct = ((cur - prev) / prev) * 100;
  return {
    label: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
    color: pct < 0 ? "#c0392b" : "#15803d",
  };
};

const isYes = (value) => String(value || "").trim().toLowerCase() === "yes";

function PaidChip({ label, amount, month, on }) {
  return (
    <span
      className={cn(
        "inline-flex h-[17px] items-center gap-1 whitespace-nowrap rounded-full border bg-slate-50 px-2 text-[10px] text-[#102a43]",
        on ? "border-[#1a3a66]" : "border-slate-200",
      )}
    >
      {label} to be paid <b className="font-extrabold">{fmt(amount)}</b>
      {month ? ` · ${month}` : ""}
    </span>
  );
}

export function TypingHistoryPopup({
  employeeName,
  records, // [current(live), ...older]
  metricColumns, // [{ key, label }] already filtered by access
  highlightKey, // metric key of the field being typed, e.g. "performanceBonus"
  paid, // { pb, pbMonth, rb, rbMonth, warnPB, warnRB }
  criteria, // current cycle Target PB criteria text
  loading,
  error,
  anchorEl,
  topOffset,
  onClose,
}) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: 16, top: 120 });

  // Dock top-right; if that would cover the cell being typed in, go left.
  useLayoutEffect(() => {
    const place = () => {
      const node = ref.current;
      if (!node) return;
      const cw = node.offsetWidth;
      const ch = node.offsetHeight;
      // Always keep the whole box on screen (the page may be scrolled, e.g.
      // when the History panel is open, so the grid's top can be negative).
      const top = Math.round(
        Math.min(
          Math.max(8, topOffset + 8),
          Math.max(8, window.innerHeight - ch - 8),
        ),
      );
      let left = Math.min(
        window.innerWidth - cw - 60,
        window.innerWidth - cw - 8,
      );
      const r = anchorEl?.getBoundingClientRect();
      if (r) {
        const hit = !(
          r.right < left - 4 ||
          r.left > left + cw + 4 ||
          r.bottom < top - 4 ||
          r.top > top + ch + 4
        );
        if (hit) left = 16;
      }
      setPos((previous) =>
        previous.left === Math.max(8, left) && previous.top === top
          ? previous
          : { left: Math.max(8, left), top },
      );
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  });

  const rows = (records || []).slice(0, MAX_CYCLES);

  const th =
    "border-b border-[#c9d8ec] bg-[#e6eef8] px-[5px] py-[2px] text-right text-[9.5px] font-bold leading-[1.15] whitespace-nowrap text-[#102a43]";
  const tdLabel =
    "sticky left-0 whitespace-nowrap border-r border-[#c9d8ec] bg-[#eef3fa] px-[5px] py-px text-left text-[9.5px] font-bold text-[#102a43]";

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Appraisal history while typing"
      style={{ left: pos.left, top: pos.top }}
      className="pointer-events-none fixed z-[2147483000] box-border w-max max-w-[calc(100vw-16px)] overflow-hidden rounded-lg border border-[#c9d8ec] bg-white p-1.5 text-[10px] shadow-[0_10px_30px_rgba(16,42,67,.2)]"
    >
      <h6 className="mb-[3px] flex items-center justify-between gap-2 text-[11px] font-extrabold text-[#102a43]">
        <span className="whitespace-nowrap">{employeeName}</span>
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
          className="pointer-events-auto rounded px-1 py-0.5 text-[#6b7280] hover:bg-[#eef3fa] hover:text-[#102a43]"
        >
          <X className="size-3" />
        </button>
      </h6>

      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <PaidChip
          label="PB"
          amount={paid.pb}
          month={paid.pbMonth}
          on={paid.typing === "pb"}
        />
        <PaidChip
          label="RB"
          amount={paid.rb}
          month={paid.rbMonth}
          on={paid.typing === "rb"}
        />
        {paid.warning && (
          <span className="whitespace-nowrap rounded-full border border-[#f3ddb0] bg-[#fef6e7] px-[7px] text-[9.5px] font-bold text-[#b7791f]">
            {paid.warning}
          </span>
        )}
      </div>

      {loading && !rows.length ? (
        <p className="px-1 py-2 text-[10px] text-slate-500">
          Loading appraisal history...
        </p>
      ) : error && !rows.length ? (
        <p className="px-1 py-2 text-[10px] text-[#b42318]">{error}</p>
      ) : (
        <div className="max-w-full overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={cn(th, "sticky left-0 text-left")}>Field</th>
              {rows.map((item, index) => (
                <th
                  key={`${item.year}-${index}`}
                  className={th}
                  style={index === 0 ? { background: "#dcebff" } : undefined}
                >
                  {item.cycleName || item.year}
                  {index === 0 ? " ★" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricColumns.map((col) => {
              const on = col.key === highlightKey;
              return (
                <tr key={col.key}>
                  <td
                    className={tdLabel}
                    style={
                      on ? { boxShadow: "inset 3px 0 #1a3a66" } : undefined
                    }
                  >
                    {col.label}
                  </td>
                  {rows.map((item, index) => {
                    const older = rows[index + 1];
                    const small =
                      col.key === "hikeAmount"
                        ? {
                            label: item.basePay
                              ? `${((Number(item.hikeAmount) || 0) / item.basePay * 100).toFixed(2)}% of base`
                              : "",
                            color: "#475569",
                          }
                        : changeOf(item[col.key], older ? older[col.key] : undefined);
                    return (
                      <td
                        key={index}
                        className={cn(
                          "whitespace-nowrap px-[5px] py-px text-right text-[10px] leading-[1.15] tabular-nums",
                          index === 0
                            ? on
                              ? "bg-[#ffe066]"
                              : "bg-[#eaf2ff]"
                            : on
                              ? "bg-[#f1f7ff]"
                              : index % 2
                                ? "bg-[#f2f5f9]"
                                : "bg-[#fbfcfe]",
                        )}
                      >
                        {fmt(item[col.key])}
                        <small
                          className="block text-[8.5px] leading-[1.1]"
                          style={{ color: small.color }}
                        >
                          {small.label}
                        </small>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            <tr>
              <td className={tdLabel}>Promotion</td>
              {rows.map((item, index) => {
                const yes = isYes(item.promotion);
                return (
                  <td
                    key={index}
                    className={cn(
                      "whitespace-nowrap px-[5px] py-px text-right text-[10px] leading-[1.15]",
                      index === 0 ? "bg-[#eaf2ff]" : "bg-[#fbfcfe]",
                    )}
                  >
                    <b style={{ color: yes ? "#7c3aed" : "#475569" }}>
                      {yes ? "Yes" : "No"}
                    </b>
                    {yes && item.title && item.title !== "—" && (
                      <small className="block text-[8.5px] leading-[1.1] text-slate-600">
                        {item.title}
                      </small>
                    )}
                  </td>
                );
              })}
            </tr>

            <tr>
              <td className={tdLabel}>Target PB criteria</td>
              {rows.map((item, index) => (
                <td
                  key={index}
                  className={cn(
                    "max-w-[95px] px-[5px] py-px text-left text-[8.5px] leading-[1.25]",
                    index === 0 ? "bg-[#eaf2ff]" : "bg-[#fbfcfe]",
                  )}
                >
                  {index === 0 ? criteria || "—" : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        </div>
      )}
    </div>,
    document.body,
  );
}