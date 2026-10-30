import { useMemo, useState } from "react";

import { useAppraisal } from "@/lib/appraisal-store";
import { useBudget } from "@/lib/budget-store";
import { useViewAs } from "@/lib/view-as-store";
import { useCurrentCycleName } from "@/lib/current-cycle";
import { resolveBudgetAllocated } from "@/components/appraisal/BudgetStatsBar";
import { MANAGER_RATING_LABELS } from "@/lib/appraisal-data";
import { budgetTotals } from "@/lib/dashboard-metrics";
import { cn } from "@/lib/utils";
import {
  MIN_GROUP,
  allocationFor,
  avgHikePct,
  calcHikePct,
  editedRowIds,
  groupRows,
  hasAtRisk,
  inr,
  isPromoted,
  money,
  num,
  partsOf,
  ratingOf,
  sumBy,
  targetPair,
} from "@/lib/dashboard-overview";

const C = { hike: "#1D3B5E", pb: "#4F7FB8", rb: "#A9C4E4", left: "#DCE1E7", warn: "#C98A1B" };
const RATING_COLORS = ["#DCE1E7", "#A9C4E4", "#6F9BD0", "#3E6FA8", "#1D3B5E"];
const LIGHT = new Set(["#DCE1E7", "#A9C4E4", "#EEF1F4", "#B8C0CC"]);
const MONO = "font-mono";

/* ---------------- small building blocks ---------------- */

function Tile({ className, children, ...rest }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[10px] bg-white p-4 shadow-[0_1px_2px_rgba(16,42,67,.08),0_6px_18px_rgba(16,42,67,.07)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

const Cap = ({ children }) => (
  <span className={cn(MONO, "text-[10px] font-extrabold uppercase tracking-[.08em] text-[#6B7280]")}>
    {children}
  </span>
);

const Big = ({ value, unit, color }) => (
  <div className="mt-1 text-[26px] font-semibold leading-tight tracking-tight tabular-nums text-[#102A43]" style={{ color }}>
    {value}
    {unit ? <span className="ml-1.5 text-xs font-semibold tracking-normal text-[#6B7280]">{unit}</span> : null}
  </div>
);

const Sub = ({ children }) => <div className="mt-0.5 text-[11.5px] text-[#6B7280]">{children}</div>;

function Toggle({ value, options, onChange }) {
  return (
    <div className="inline-flex overflow-hidden rounded-[7px] border border-[#D5DBE2]">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={cn(
            MONO,
            "px-2 py-[3px] text-[10px] font-semibold",
            value === k ? "bg-[#1D3B5E] text-white" : "bg-white text-[#6B7280]",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="mb-3 mt-6 flex items-center gap-3">
      <Cap>{children}</Cap>
      <span className="h-px flex-1 bg-[#E5E7EB]" />
    </div>
  );
}

// parts: [{ label, value, color, tip? }]
function SegBar({ parts, total, height = 20, showPct = false }) {
  const t = total || parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="flex gap-[2px] overflow-hidden rounded-[5px] bg-[#E3E7EC]" style={{ height }}>
      {parts.map((p, i) => {
        const w = Math.max(0, (p.value / t) * 100);
        if (w <= 0) return null;
        return (
          <div
            key={i}
            title={p.tip || `${p.label}: ${money(p.value)} (${w.toFixed(1)}%)`}
            className="flex items-center justify-center overflow-hidden whitespace-nowrap text-[10.5px] font-semibold"
            style={{
              width: `${w}%`,
              background: p.color,
              color: LIGHT.has(p.color) ? "#1D3B5E" : "#fff",
            }}
          >
            {w >= 9 ? (showPct ? `${w.toFixed(0)}%` : p.text ?? "") : ""}
          </div>
        );
      })}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#374151]">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center">
          <i className="mr-1.5 inline-block size-[11px] rounded-[3px]" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// groups: [{ label, bars: [{ cap, parts:[{label,value,color,text,tip}] }] }]
function ColChart({ groups, pct }) {
  const H = 130;
  let mx = 1;
  if (!pct) groups.forEach((g) => g.bars.forEach((b) => { mx = Math.max(mx, b.parts.reduce((s, p) => s + p.value, 0)); }));
  return (
    <div className="flex items-end gap-3.5 overflow-x-auto pt-1.5">
      {groups.map((g) => (
        <div key={g.label} className="flex min-w-[56px] flex-1 flex-col items-center">
          <div className="flex items-end gap-1">
            {g.bars.map((b) => {
              const t = b.parts.reduce((s, p) => s + p.value, 0) || 1;
              const sc = pct ? H / t : H / mx;
              const one = b.parts.length === 1;
              return (
                <div key={b.cap} className="flex w-[34px] flex-col items-center">
                  {one ? <em className={cn(MONO, "mb-0.5 text-[10.5px] not-italic font-semibold text-[#1D3B5E]")}>{b.parts[0].text}</em> : null}
                  <div className="flex w-full flex-col-reverse gap-px overflow-hidden rounded-t-[3px]">
                    {b.parts.map((p) => {
                      const h = Math.max(p.value * sc, 0);
                      return (
                        <i
                          key={p.label}
                          title={p.tip || p.label}
                          className={cn(MONO, "flex items-center justify-center overflow-hidden text-[10px] font-semibold not-italic")}
                          style={{ height: h, background: p.color, color: LIGHT.has(p.color) ? "#1D3B5E" : "#fff" }}
                        >
                          {!one && h >= 15 ? p.text : ""}
                        </i>
                      );
                    })}
                  </div>
                  <span className={cn(MONO, "mt-[3px] text-[9.5px] text-[#6B7280]")}>{b.cap}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 text-center text-[11.5px] font-semibold text-[#102A43]">{g.label}</div>
        </div>
      ))}
    </div>
  );
}

function Donut({ parts, total }) {
  const R = 44;
  const CIRC = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {parts.map((p) => {
          const len = (p.value / (total || 1)) * CIRC;
          const el = (
            <circle
              key={p.label}
              r={R}
              cx="60"
              cy="60"
              fill="none"
              stroke={p.color}
              strokeWidth="20"
              strokeDasharray={`${len.toFixed(2)} ${(CIRC - len).toFixed(2)}`}
              strokeDashoffset={(-off).toFixed(2)}
              transform="rotate(-90 60 60)"
            >
              <title>{`${p.label}: ${p.value} (${((p.value / (total || 1)) * 100).toFixed(1)}%)`}</title>
            </circle>
          );
          off += len;
          return el;
        })}
        <text x="60" y="64" textAnchor="middle" className="fill-[#1D3B5E] text-[16px] font-semibold">{total}</text>
      </svg>
      <div className="flex flex-col gap-1 text-xs text-[#374151]">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center">
            <i className="mr-1.5 inline-block size-[11px] rounded-[3px]" style={{ background: p.color }} />
            {p.label} ({((p.value / (total || 1)) * 100).toFixed(1)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- people list ---------------- */

function PeopleList({ list, onClose }) {
  const shown = list.rows.slice(0, 50);
  return (
    <Tile className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Cap>People</Cap>
        <b className="text-sm text-[#102A43]">{list.title}</b>
        <span className="text-[11.5px] text-[#6B7280]">
          {inr(list.rows.length)} people{list.rows.length > 50 ? " · showing first 50" : ""}
        </span>
        <button type="button" onClick={onClose} className="ml-auto rounded-md border border-[#D1D5DB] bg-white px-3 py-1 text-xs font-bold">
          Close
        </button>
      </div>
      <div className="mt-2.5 overflow-auto rounded-lg border border-[#E5E7EB]">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[#F3F4F6] text-left text-[10.5px] font-bold text-[#374151]">
              {["Employee", "Designation", "Comp Manager", "Rating", "Hike %", "PB", "RB"].map((h, i) => (
                <th key={h} className={cn("px-2.5 py-2", i >= 3 && "text-right")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.id} className={i % 2 ? "bg-[#F6F8FA]" : "bg-white"}>
                <td className="px-2.5 py-1.5 font-bold text-[#102A43]">{r.empId} - {r.name}</td>
                <td className="px-2.5 py-1.5">{r.designation}</td>
                <td className="px-2.5 py-1.5">{r.compManager}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">{r.managerRating || "–"}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">{calcHikePct(r).toFixed(2)}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">{inr(r.allocatedPBAmount)}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">{inr(r.newRB)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tile>
  );
}

/* ---------------- main ---------------- */

export function DashboardOverview() {
  const { rows: allRows, modified, audit } = useAppraisal();
  const budgetCtx = useBudget();
  const { effectiveId } = useViewAs();
  const cycleName = useCurrentCycleName();

  // Same reporting scope as before: Active + Eligible employees only.
  const rows = useMemo(
    () =>
      allRows.filter(
        (r) =>
          String(r.status || "").trim().toLowerCase() === "active" &&
          String(r.eligibility || "").trim().toLowerCase() === "eligible",
      ),
    [allRows],
  );

  const [unit, setUnit] = useState("n"); // n = numbers, p = percent
  const [view, setView] = useState("b"); // b = bars, c = columns
  const [ratingView, setRatingView] = useState("s");
  const [levelKey, setLevelKey] = useState("");
  const [expanded, setExpanded] = useState({});
  const [list, setList] = useState(null);

  const { allocated, isEstimate } = resolveBudgetAllocated({
    totals: budgetCtx.totals,
    loading: budgetCtx.loading,
    error: budgetCtx.error,
  });
  const budget = useMemo(
    () => budgetTotals(rows, allocated, !isEstimate),
    [rows, allocated, isEstimate],
  );

  const edited = useMemo(() => editedRowIds(rows, modified), [rows, modified]);
  const n = rows.length;
  const editedCount = rows.filter((r) => edited.has(String(r.id))).length;
  const remaining = n - editedCount;
  const parts = useMemo(() => partsOf(rows), [rows]);
  const used = parts.total;
  const usedPct = allocated ? (used / allocated) * 100 : 0;
  const avgHike = avgHikePct(rows);
  const tgt = targetPair(rows);
  const gapPct = tgt.target ? ((tgt.paid - tgt.target) / tgt.target) * 100 : 0;
  const rbTotal = parts.rb;
  const rbPeople = rows.filter((r) => num(r.newRB) > 0).length;
  const baseTotal = sumBy(rows, (r) => r.currentAnnualBasePay);
  const promos = rows.filter(isPromoted).length;

  // levels this login may look at
  const levels = useMemo(() => {
    const all = [
      { k: "te", n: "Tech ED", of: (r) => r.appraiserTechED },
      { k: "cm", n: "Comp Manager", of: (r) => r.compManager },
    ];
    if (effectiveId === "compmanager") return [];
    return effectiveId === "teched" ? all.slice(1) : all;
  }, [effectiveId]);
  const level = levels.find((l) => l.k === levelKey) || levels[0];
  const groups = useMemo(() => (level ? groupRows(rows, level.of) : []), [rows, level]);

  const ratingCounts = [1, 2, 3, 4, 5].map((r) => rows.filter((x) => ratingOf(x) === r).length);
  const ratingParts = ratingCounts.map((c, i) => ({
    label: `${i + 1} · ${MANAGER_RATING_LABELS[i + 1]}`,
    value: c,
    color: RATING_COLORS[i],
    text: unit === "p" ? `${n ? ((c / n) * 100).toFixed(0) : 0}%` : String(c),
  }));

  const atRisk = rows.filter((r) => hasAtRisk(r) && !(num(r.newRB) > 0));
  const outliers = rows.filter((r) => {
    const rt = ratingOf(r);
    return (rt >= 4 && calcHikePct(r) < avgHike - 2) || (isPromoted(r) && rt > 0 && rt <= 2);
  });

  const openList = (title, list_) => setList({ title, rows: list_ });
  const lim = (arr, key, d) => (expanded[key] ? arr : arr.slice(0, d));
  const showAll = (key) => (
    <button
      type="button"
      onClick={() => setExpanded((p) => ({ ...p, [key]: !p[key] }))}
      className="ml-auto text-[11.5px] font-semibold text-[#1559A6]"
    >
      {expanded[key] ? "Show less" : "See all"} ›
    </button>
  );

  /* ---- per-level card data ---- */
  const completion = groups
    .map((g) => {
      const ed = g.rows.filter((r) => edited.has(String(r.id))).length;
      return { ...g, ed, f: g.rows.length ? ed / g.rows.length : 0 };
    })
    .sort((a, b) => a.f - b.f);

  const util = groups
    .map((g) => {
      const p = partsOf(g.rows);
      const al = level ? allocationFor(level.k, g.key, budgetCtx) : 0;
      return { ...g, p, al, u: al ? (p.total / al) * 100 : null };
    })
    .sort((a, b) => (b.u ?? -1) - (a.u ?? -1));

  const mix = groups.map((g) => ({ ...g, p: partsOf(g.rows) }));

  const pbt = groups
    .map((g) => ({ ...g, t: targetPair(g.rows) }))
    .filter((g) => g.t.n >= MIN_GROUP)
    .map((g) => ({ ...g, gap: g.t.target ? ((g.t.paid - g.t.target) / g.t.target) * 100 : 0 }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  const short = (v) => (v >= 1e5 ? (v / 1e7).toFixed(2) : String(Math.round(v)));

  const Row = ({ label, mid, right, onClick }) => (
    <div
      onClick={onClick}
      className="grid cursor-pointer grid-cols-[minmax(86px,34%)_1fr_auto] items-center gap-2 border-t border-[#E5E7EB] py-1.5 text-xs first:border-t-0"
    >
      <span className="truncate font-semibold text-[#102A43]" title={label}>{label}</span>
      <div className="space-y-1">{mid}</div>
      <span className="whitespace-nowrap text-right text-[#6B7280]">{right}</span>
    </div>
  );

  const CardHead = ({ id, title, sub }) => (
    <>
      <div className="flex items-baseline gap-2">
        <Cap>{title}</Cap>
        {showAll(id)}
      </div>
      <div className="mb-1.5 mt-0.5 text-[11px] text-[#6B7280]">{sub}</div>
    </>
  );

  const levelCards = level ? (
    <div className="grid gap-3 lg:grid-cols-2">
      <Tile>
        <CardHead id="comp" title={`Completion by ${level.n}`} sub="Edited vs remaining, least complete first" />
        {view === "c" ? (
          <ColChart
            pct={unit === "p"}
            groups={lim(completion, "comp", 4).map((c) => ({
              label: c.key,
              bars: [{ cap: "edited", parts: [{ label: "Edited", value: unit === "p" ? c.f * 100 : c.ed, color: C.pb, text: unit === "p" ? `${(c.f * 100).toFixed(0)}%` : String(c.ed), tip: `Edited: ${c.ed} of ${c.rows.length}` }] }],
            }))}
          />
        ) : (
          lim(completion, "comp", 4).map((c) => (
            <Row
              key={c.key}
              label={c.key}
              onClick={() => openList(`${c.key} · people`, c.rows)}
              mid={<SegBar height={20} total={c.rows.length} parts={[{ label: "Edited", value: c.ed, color: C.pb, text: String(c.ed) }, { label: "Remaining", value: c.rows.length - c.ed, color: C.left, text: String(c.rows.length - c.ed) }]} />}
              right={unit === "p" ? `${(c.f * 100).toFixed(0)}%` : `${c.ed} / ${c.rows.length}`}
            />
          ))
        )}
      </Tile>

      <Tile>
        <CardHead id="util" title={`Utilisation by ${level.n}`} sub="Hike + bonus used vs allocated (Budget Master)" />
        {view === "c" ? (
          <ColChart
            pct={unit === "p"}
            groups={lim(util, "util", 4).map((c) => ({
              label: c.key,
              bars: [{ cap: "used", parts: [{ label: "Used", value: unit === "p" ? (c.u ?? 0) : c.p.total, color: C.hike, text: unit === "p" ? `${(c.u ?? 0).toFixed(0)}%` : short(c.p.total), tip: `Used ${money(c.p.total)}${c.al ? ` of ${money(c.al)}` : " (no allocation found)"}` }] }],
            }))}
          />
        ) : (
          lim(util, "util", 4).map((c) => {
            const over = c.al && c.p.total > c.al;
            return (
              <Row
                key={c.key}
                label={c.key}
                onClick={() => openList(`${c.key} · people`, c.rows)}
                mid={
                  c.al ? (
                    <SegBar
                      height={20}
                      total={Math.max(c.al, c.p.total)}
                      parts={over ? [{ label: "Utilised", value: c.p.total, color: C.warn, text: `${c.u.toFixed(0)}%` }] : [{ label: "Utilised", value: c.p.total, color: C.hike, text: `${c.u.toFixed(0)}%` }, { label: "Left", value: c.al - c.p.total, color: C.left }]}
                    />
                  ) : (
                    <span className="text-[11px] text-[#6B7280]">No allocation found for this {level.n}</span>
                  )
                }
                right={c.al ? (unit === "p" ? `${c.u.toFixed(0)}%` : `${money(c.p.total)} of ${money(c.al)}`) : money(c.p.total)}
              />
            );
          })
        )}
      </Tile>

      <Tile>
        <CardHead id="mix" title={`Composition by ${level.n}`} sub="Hike, PB and RB share of what each one used" />
        {(() => {
          const mk = (p) => [
            { label: "Hike", value: p.hike, color: C.hike, text: unit === "p" ? `${p.total ? ((p.hike / p.total) * 100).toFixed(0) : 0}%` : short(p.hike) },
            { label: "PB", value: p.pb, color: C.pb, text: unit === "p" ? `${p.total ? ((p.pb / p.total) * 100).toFixed(0) : 0}%` : short(p.pb) },
            { label: "RB", value: p.rb, color: C.rb, text: unit === "p" ? `${p.total ? ((p.rb / p.total) * 100).toFixed(0) : 0}%` : short(p.rb) },
          ];
          const all = [{ key: "All", rows, p: parts }, ...lim(mix, "mix", 3)];
          return view === "c" ? (
            <ColChart pct={unit === "p"} groups={all.map((g) => ({ label: g.key, bars: [{ cap: "mix", parts: mk(g.p) }] }))} />
          ) : (
            all.map((g) => (
              <Row key={g.key} label={g.key} onClick={g.key === "All" ? undefined : () => openList(`${g.key} · people`, g.rows)} mid={<SegBar height={20} total={g.p.total} parts={mk(g.p)} showPct={unit === "p"} />} right="" />
            ))
          );
        })()}
        <Legend items={[["Hike", C.hike], ["PB", C.pb], ["RB", C.rb]]} />
      </Tile>

      <Tile>
        <CardHead id="pbt" title={`PB vs Target PB by ${level.n}`} sub={`PB paid vs target agreed last year · groups under ${MIN_GROUP} people with a target are left out`} />
        {pbt.length === 0 ? (
          <div className="py-3 text-xs text-[#6B7280]">Not enough people with a target to compare.</div>
        ) : view === "c" ? (
          <ColChart
            pct={unit === "p"}
            groups={lim(pbt, "pbt", 4).map((c) => {
              const m = Math.max(c.t.paid, c.t.target) || 1;
              return {
                label: c.key,
                bars: [
                  { cap: "paid", parts: [{ label: "PB paid", value: unit === "p" ? (c.t.paid / m) * 100 : c.t.paid, color: C.pb, text: unit === "p" ? `${Math.round((c.t.paid / m) * 100)}%` : short(c.t.paid), tip: `PB paid ${money(c.t.paid)}` }] },
                  { cap: "target", parts: [{ label: "Target PB", value: unit === "p" ? (c.t.target / m) * 100 : c.t.target, color: "#B8C0CC", text: unit === "p" ? `${Math.round((c.t.target / m) * 100)}%` : short(c.t.target), tip: `Target PB ${money(c.t.target)}` }] },
                ],
              };
            })}
          />
        ) : (
          lim(pbt, "pbt", 4).map((c) => {
            const m = Math.max(c.t.paid, c.t.target) || 1;
            return (
              <Row
                key={c.key}
                label={c.key}
                onClick={() => openList(`${c.key} · people`, c.rows)}
                mid={
                  <>
                    <SegBar height={20} total={m} parts={[{ label: "PB paid", value: c.t.paid, color: C.pb, text: `${Math.round((c.t.paid / m) * 100)}%` }, { label: "", value: m - c.t.paid, color: "#EEF1F4" }]} />
                    <SegBar height={20} total={m} parts={[{ label: "Target PB", value: c.t.target, color: "#B8C0CC", text: `${Math.round((c.t.target / m) * 100)}%` }, { label: "", value: m - c.t.target, color: "#EEF1F4" }]} />
                  </>
                }
                right={<b className="text-[#102A43]">{c.gap > 0 ? "Over " : "Under "}{Math.abs(c.gap).toFixed(1)}%</b>}
              />
            );
          })
        )}
        <Legend items={[["PB paid", C.pb], ["Target PB", "#B8C0CC"]]} />
      </Tile>
    </div>
  ) : null;

  const recent = (Array.isArray(audit) ? audit : [])
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 5);
  const fmtWhen = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? String(v)
      : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const actionCards = [
    { t: "Remaining to edit", v: inr(remaining), s: "Employees with no edited cell yet", rows: rows.filter((r) => !edited.has(String(r.id))) },
    { t: "At-risk without retention", v: inr(atRisk.length), s: "Flagged At Risk, no RB", rows: atRisk },
    { t: "Outliers to review", v: inr(outliers.length), s: "High rating low hike, or promoted with low rating", rows: outliers },
  ];

  return (
    <div className="rounded-xl bg-[#EDF2F7] p-4">
      {/* cycle title */}
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[17px] font-extrabold text-[#102A43]">
          Appraisal Cycle: {cycleName || "—"}
        </span>
        {cycleName ? (
          <span className="rounded-xl bg-[#ECFDF3] px-2.5 py-[3px] text-[11px] font-bold text-[#15803D]">Active</span>
        ) : null}
        <span className="text-xs text-[#6B7280]">{inr(n)} employees in scope</span>
        <span className="ml-auto inline-flex gap-2">
          <Toggle value={unit} onChange={setUnit} options={[["n", "Numbers"], ["p", "%"]]} />
        </span>
      </div>

      {/* KPI tiles */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile>
          <Cap>Edited vs remaining to edit</Cap>
          <Big value={n ? ((editedCount / n) * 100).toFixed(1) : "0.0"} unit="%" />
          <Sub>{inr(editedCount)} edited · {inr(remaining)} remaining</Sub>
          <div className="mt-2.5"><SegBar parts={[{ label: "Edited", value: editedCount, color: C.pb, text: String(editedCount) }, { label: "Remaining", value: remaining, color: C.left, text: String(remaining) }]} total={n} /></div>
          <Legend items={[["Edited", C.pb], ["Remaining", C.left]]} />
        </Tile>

        <Tile>
          <Cap>Budget used</Cap>
          <Big value={usedPct.toFixed(1)} unit="%" color={usedPct > 100 ? "#C0392B" : undefined} />
          <Sub>
            {money(used)} of {money(allocated)} ·{" "}
            {allocated ? (used > allocated ? `over by ${money(used - allocated)}` : `${money(allocated - used)} left`) : "no allocation found"}
          </Sub>
          <div className="mt-2.5">
            <SegBar total={Math.max(allocated, used)} parts={[{ label: "Hike", value: parts.hike, color: C.hike }, { label: "PB", value: parts.pb, color: C.pb }, { label: "RB", value: parts.rb, color: C.rb }, { label: "Left", value: Math.max(allocated - used, 0), color: C.left }]} />
          </div>
          <Legend items={[["Hike", C.hike], ["PB", C.pb], ["RB", C.rb], ["Left", C.left]]} />
        </Tile>

        <Tile>
          <Cap>Average hike %</Cap>
          <Big value={avgHike.toFixed(2)} unit="%" />
          <Sub>Across {inr(n)} people</Sub>
          <Sub>Hike amount {money(parts.hike)}</Sub>
        </Tile>

        <Tile>
          <Cap>PB vs Target PB</Cap>
          <Big value={`${gapPct > 0 ? "+" : gapPct < 0 ? "−" : ""}${Math.abs(gapPct).toFixed(1)}`} unit="%" color={gapPct > 0 ? "#B7791F" : undefined} />
          <Sub>{gapPct > 0 ? "Over" : "Under"} target · {inr(tgt.n)} people with a target</Sub>
          <div className="mt-1 text-[11.5px]">PB paid <b>{money(tgt.paid)}</b></div>
          <div className="text-[11.5px]">Target PB <b>{money(tgt.target)}</b></div>
        </Tile>

        <Tile>
          <Cap>Retention bonus (RB)</Cap>
          <Big value={money(rbTotal).replace("₹ ", "")} unit="₹" />
          <Sub>{baseTotal ? ((rbTotal / baseTotal) * 100).toFixed(2) : "0.00"}% of base · {inr(rbPeople)} people</Sub>
        </Tile>
      </div>

      {/* ratings */}
      <Tile className="mt-3">
        <div className="float-right">
          <Toggle value={ratingView} onChange={setRatingView} options={[["s", "Bar"], ["c", "Columns"], ["d", "Donut"]]} />
        </div>
        <Cap>Ratings summary</Cap>
        <div className="h-2" />
        {ratingView === "d" ? (
          <Donut parts={ratingParts} total={n} />
        ) : ratingView === "c" ? (
          <ColChart pct={false} groups={ratingParts.map((p) => ({ label: p.label.split(" · ")[0], bars: [{ cap: "", parts: [{ label: p.label, value: p.value, color: p.color, text: p.text }] }] }))} />
        ) : (
          <>
            <SegBar parts={ratingParts} total={n} showPct={unit === "p"} />
            <Legend items={ratingParts.map((p) => [`${p.label} · ${p.value}`, p.color])} />
          </>
        )}
        <div className="mt-2 text-[11.5px]"><b>{promos}</b> promotions <span className="text-[#6B7280]">({n ? ((promos / n) * 100).toFixed(1) : 0}% of {inr(n)} people)</span></div>
      </Tile>

      {/* by level */}
      {level ? (
        <>
          <SectionTitle>{level.n}s</SectionTitle>
          <div className="mb-2.5 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-[#6B7280]">By level</span>
            {levels.length > 1 ? (
              <select
                className="rounded-md border border-[#D1D5DB] bg-white px-2 py-1 text-xs"
                value={level.k}
                onChange={(e) => { setLevelKey(e.target.value); setExpanded({}); setList(null); }}
              >
                {levels.map((l) => <option key={l.k} value={l.k}>{l.n}</option>)}
              </select>
            ) : <b>{level.n}</b>}
            <Toggle value={view} onChange={setView} options={[["b", "Bars"], ["c", "Columns"]]} />
          </div>
          {levelCards}
        </>
      ) : null}

      {list ? <PeopleList list={list} onClose={() => setList(null)} /> : null}

      {/* needs your action */}
      <SectionTitle>Needs your action</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actionCards.map((c) => (
          <Tile key={c.t} className="cursor-pointer" onClick={() => openList(c.t, c.rows)}>
            <Cap>{c.t}</Cap>
            <Big value={c.v} />
            <div className="mt-1 min-h-[30px] text-[11.5px] text-[#6B7280]">{c.s}</div>
            <span className="text-[11px] font-semibold text-[#1559A6]">Show the people ›</span>
          </Tile>
        ))}
      </div>

      {/* recent activity */}
      <SectionTitle>Recent activity</SectionTitle>
      <div className="overflow-auto rounded-lg border border-[#E5E7EB] bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[#F3F4F6] text-left text-[10.5px] font-bold text-[#374151]">
              <th className="px-3 py-2">When</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">What</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-3 text-[#6B7280]">No activity yet.</td></tr>
            ) : recent.map((a, i) => (
              <tr key={a.id || i} className={i % 2 ? "bg-[#F6F8FA]" : "bg-white"}>
                <td className="whitespace-nowrap px-3 py-2 font-bold text-[#102A43]">{fmtWhen(a.at)}</td>
                <td className="px-3 py-2">{a.user}</td>
                <td className="px-3 py-2">{a.field} edited for {a.employeeName || a.empId}{a.to !== "" ? ` (${a.from || "–"} → ${a.to})` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}