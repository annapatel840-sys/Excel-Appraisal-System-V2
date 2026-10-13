import { cn } from "@/lib/utils";

export function StackedColumnChart({ columns, height = 190 }) {
  const maxValue = Math.max(1, ...columns.flatMap((c) => c.bars.map((b) => b.total)));
  const barArea = height - 60;
  const minColumnWidth = 116;
  const chartWidth = Math.max(0, columns.length * minColumnWidth);

  return (
    <div className="w-full min-w-0 overflow-x-auto pb-2" style={{ height }}>
      <div className="flex items-end justify-start gap-3" style={{ minWidth: chartWidth, height }}>
      {columns.map((col) => (
        <div key={col.label} className="flex min-w-0 shrink-0 flex-col items-center gap-1" style={{ width: minColumnWidth }}>
          <div className="flex items-end justify-center gap-1.5" style={{ height: height - 40, width: "100%" }}>
            {col.bars.map((bar, bi) => (
              <div key={bi} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="max-w-full truncate text-[10px] font-semibold text-foreground" title={bar.topLabel}>
                  {bar.topLabel}
                </span>

                <div
                  className={cn(
                    "flex w-full max-w-10 flex-col justify-end overflow-hidden rounded-t-sm",
                    bar.outline && "border border-b-0",
                  )}
                  style={{ height: barArea, borderColor: bar.outline }}
                >
                  {bar.segments
                    .slice()
                    .reverse()
                    .map((seg, si) => (
                      <div
                        key={si}
                        className="flex items-center justify-center overflow-hidden text-[10px] font-semibold"
                        style={{
                          height: `${Math.max(0, (seg.value / maxValue) * barArea)}px`,
                          background: seg.color,
                          color: seg.textColor || "#fff",
                        }}
                      >
                        {seg.value / maxValue > 0.08 ? seg.label : ""}
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <div className="w-full border-t border-border" />

          <div className="truncate text-xs font-medium text-foreground">{col.label}</div>

          {col.sub && <div className="truncate text-[11px] text-muted-foreground">{col.sub}</div>}

          {col.sub2 && (
            <div className="max-w-full truncate text-[11px] font-semibold" title={col.sub2} style={{ color: col.subColor }}>
              {col.sub2}
            </div>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}

export function RankedBarList({ rows, maxValue, formatValue }) {
  const max = maxValue ?? Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[140px_1fr_90px] items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm">{r.label}</span>

            {r.badge != null && (
              <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {r.badge}
              </span>
            )}
          </div>

          <div className="h-3.5 overflow-hidden rounded bg-muted">
            <div
              className="h-full rounded"
              style={{
                width: `${Math.min(100, (r.value / max) * 100)}%`,
                background: r.color || "#2f6db5",
              }}
            />
          </div>

          <div className="text-right text-sm font-semibold" style={{ color: r.valueColor }}>
            {formatValue ? formatValue(r.value, r) : r.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function GroupTable({ columns, rows }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/60 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "border-b border-border px-3 py-2 font-semibold",
                  c.align === "right" && "text-right",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-accent/40">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "border-b border-border px-3 py-2",
                    c.align === "right" && "num text-right",
                  )}
                >
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}